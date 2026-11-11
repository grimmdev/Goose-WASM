/* platform/web/gfx_resources.c - Buffers, textures, samplers, and screenshot readbacks */
#include "gfx_webgl.h"
#define STB_IMAGE_IMPLEMENTATION
#define STBI_ONLY_PNG
#define STBI_ONLY_BMP
#include "stb_image.h"

/* Buffers */
gs_gfx_buffer gs_gfx_create_buffer(int64_t usage, int64_t size, gs_gfx_bytes data) {
    gs_gfx_buffer handle = { 0 };
    if(usage & ~(GS_GFX_BUFFER_VERTEX|GS_GFX_BUFFER_INDEX)){gfx_set_error("Indirect/storage buffers are unsupported in this WebGL2 profile");return handle;}
    if (size<0 || size>INT32_MAX || (uint64_t)size>SIZE_MAX || data.len<0 || data.len>size || (data.len && !data.data)){gfx_misuse("create_buffer: invalid size/data");return handle;}

    uint32_t handle_id=gfx_allocate(0,255);if(!handle_id)return handle;uint32_t id=handle_id&0xfffffu;if(id>g_webgl_gfx.next_buf_id)g_webgl_gfx.next_buf_id=id;
    WebGLBufferItem *item = &g_webgl_gfx.buffers[id];
    item->size = size;
    item->usage = usage;
    item->index_data=(usage&GS_GFX_BUFFER_INDEX)?calloc((size_t)(size?size:1),1):NULL;
    if((usage&GS_GFX_BUFFER_INDEX)&&!item->index_data){gfx_forget(0,handle_id);gfx_set_error("Index buffer allocation failed");return handle;}
    if(item->index_data && data.len)memcpy(item->index_data,data.data,data.len);

#if defined(__EMSCRIPTEN__)
    glGenBuffers(1, &item->gl_buf);
    GLenum target = (usage & 2) ? GL_ELEMENT_ARRAY_BUFFER : GL_ARRAY_BUFFER;
    glBindBuffer(target, item->gl_buf);
    glBufferData(target, (GLsizeiptr)size, NULL, GL_DYNAMIC_DRAW);
    if(data.len>0)glBufferSubData(target,0,(GLsizeiptr)data.len,data.data);
    glBindBuffer(target, 0);
    if(glGetError()!=GL_NO_ERROR){glDeleteBuffers(1,&item->gl_buf);free(item->index_data);memset(item,0,sizeof *item);gfx_forget(0,handle_id);gfx_set_error("GPU buffer allocation failed");return handle;}
#endif

    handle.id = handle_id;
    return handle;
}

uint8_t gs_gfx_update_buffer(gs_gfx_buffer b, int64_t offset, gs_gfx_bytes data) {
    if (!gfx_valid(0,b.id)){gfx_misuse("Buffer handle is null or stale");return 0;}
    WebGLBufferItem *item = &g_webgl_gfx.buffers[GFX_INDEX(b)];
    if(offset<0 || data.len<0 || offset>item->size || data.len>item->size-offset || (data.len&&!data.data)){gfx_misuse("update_buffer: invalid range or data pointer");return 0;}
    if(item->index_data&&data.len)memcpy(item->index_data+offset,data.data,data.len);

#if defined(__EMSCRIPTEN__)
    GLenum target = (item->usage & 2) ? GL_ELEMENT_ARRAY_BUFFER : GL_ARRAY_BUFFER;
    glBindBuffer(target, item->gl_buf);
    glBufferSubData(target, (GLintptr)offset, (GLsizeiptr)data.len, data.data);
    glBindBuffer(target, 0);
#endif

    return 1;
}

uint8_t gs_gfx_read_buffer(gs_gfx_buffer b,int64_t offset,gs_gfx_bytes out){
    if(!gfx_valid(0,b.id) || offset<0 || out.len<0 || offset>g_webgl_gfx.buffers[GFX_INDEX(b)].size || out.len>g_webgl_gfx.buffers[GFX_INDEX(b)].size-offset || (out.len&&!out.data)){gfx_misuse("read_buffer: stale handle or invalid range");return 0;}
#if defined(__EMSCRIPTEN__)
    glBindBuffer(GL_COPY_READ_BUFFER,g_webgl_gfx.buffers[GFX_INDEX(b)].gl_buf);EM_ASM({GLctx.getBufferSubData(GLctx.COPY_READ_BUFFER,$0,HEAPU8,$1,$2);},(double)offset,out.data,(double)out.len);
#endif
    return 1;
}

int64_t gs_gfx_buffer_size(gs_gfx_buffer b) {
    if (!gfx_valid(0,b.id)){gfx_misuse("Buffer handle is null or stale");return 0;}
    return g_webgl_gfx.buffers[GFX_INDEX(b)].size;
}

void gs_gfx_release_buffer(gs_gfx_buffer b) {
    if(!b.id)return;if (!gfx_valid(0,b.id)){gfx_misuse("release_buffer: stale handle");return;}
#if defined(__EMSCRIPTEN__)
    if (g_webgl_gfx.buffers[GFX_INDEX(b)].gl_buf) {
        glDeleteBuffers(1, &g_webgl_gfx.buffers[GFX_INDEX(b)].gl_buf);
        g_webgl_gfx.buffers[GFX_INDEX(b)].gl_buf = 0;
    }
#endif
    free(g_webgl_gfx.buffers[GFX_INDEX(b)].index_data);g_webgl_gfx.buffers[GFX_INDEX(b)].index_data=NULL;
    gfx_forget(0,b.id);
}

/* Textures */
static int texture_format(int format,WebGLTextureItem *t){
#if defined(__EMSCRIPTEN__)
 t->pixel_format=GL_RGBA;t->pixel_type=GL_UNSIGNED_BYTE;t->internal_format=GL_RGBA8;t->bytes_per_pixel=4;
 switch(format){
 case GS_GFX_RGBA8:case GS_GFX_BGRA8:break;
 case GS_GFX_RGBA8_SRGB:t->internal_format=GL_SRGB8_ALPHA8;break;
 case GS_GFX_R8:t->internal_format=GL_R8;t->pixel_format=GL_RED;t->bytes_per_pixel=1;break;
 case GS_GFX_RG8:t->internal_format=GL_RG8;t->pixel_format=GL_RG;t->bytes_per_pixel=2;break;
 case GS_GFX_RGBA16F:t->internal_format=GL_RGBA16F;t->pixel_type=GL_HALF_FLOAT;t->bytes_per_pixel=8;break;
 case GS_GFX_RGBA32F:t->internal_format=GL_RGBA32F;t->pixel_type=GL_FLOAT;t->bytes_per_pixel=16;break;
 case GS_GFX_R16F:t->internal_format=GL_R16F;t->pixel_format=GL_RED;t->pixel_type=GL_HALF_FLOAT;t->bytes_per_pixel=2;break;
 case GS_GFX_RG16F:t->internal_format=GL_RG16F;t->pixel_format=GL_RG;t->pixel_type=GL_HALF_FLOAT;t->bytes_per_pixel=4;break;
 case GS_GFX_R32F:t->internal_format=GL_R32F;t->pixel_format=GL_RED;t->pixel_type=GL_FLOAT;break;
 case GS_GFX_RG32F:t->internal_format=GL_RG32F;t->pixel_format=GL_RG;t->pixel_type=GL_FLOAT;t->bytes_per_pixel=8;break;
 case GS_GFX_R32UI:t->internal_format=GL_R32UI;t->pixel_format=GL_RED_INTEGER;t->pixel_type=GL_UNSIGNED_INT;break;
 case GS_GFX_RGBA8UI:t->internal_format=GL_RGBA8UI;t->pixel_format=GL_RGBA_INTEGER;break;
 case GS_GFX_RGB10A2:t->internal_format=GL_RGB10_A2;t->pixel_type=GL_UNSIGNED_INT_2_10_10_10_REV;break;
 case GS_GFX_RG11B10F:t->internal_format=GL_R11F_G11F_B10F;t->pixel_format=GL_RGB;t->pixel_type=GL_UNSIGNED_INT_10F_11F_11F_REV;break;
 case GS_GFX_DEPTH16:t->internal_format=GL_DEPTH_COMPONENT16;t->pixel_format=GL_DEPTH_COMPONENT;t->pixel_type=GL_UNSIGNED_SHORT;t->bytes_per_pixel=2;break;
 case GS_GFX_DEPTH24:t->internal_format=GL_DEPTH_COMPONENT24;t->pixel_format=GL_DEPTH_COMPONENT;t->pixel_type=GL_UNSIGNED_INT;break;
 case GS_GFX_DEPTH32F:case GS_GFX_DEPTH:t->internal_format=GL_DEPTH_COMPONENT32F;t->pixel_format=GL_DEPTH_COMPONENT;t->pixel_type=GL_FLOAT;break;
 case GS_GFX_DEPTH24_STENCIL8:t->internal_format=GL_DEPTH24_STENCIL8;t->pixel_format=GL_DEPTH_STENCIL;t->pixel_type=GL_UNSIGNED_INT_24_8;break;
 default:gfx_set_error("Unknown texture format");return 0;
 }return 1;
#else
 (void)format;(void)t;return 0;
#endif
}
gs_gfx_texture gs_gfx_create_texture(const gs_gfx_texture_desc *desc){
 gs_gfx_texture result={0};if(!desc)return result;
 if(desc->kind!=GS_GFX_TEXTURE_2D || desc->depth>1 || desc->samples>1 || (desc->usage&(GS_GFX_STORAGE_READ|GS_GFX_COMPUTE_READ|GS_GFX_COMPUTE_WRITE|GS_GFX_COMPUTE_READ_WRITE))){gfx_set_error("Only nonmultisampled 2D sampled/render textures are supported");return result;}
 if(desc->width<=0||desc->height<=0||desc->mips<0){gfx_set_error("Invalid texture dimensions or exhausted texture handles");return result;}
 WebGLTextureItem item={0};item.width=desc->width;item.height=desc->height;item.format=desc->format;item.desc=*desc;
 item.is_depth=desc->format>=GS_GFX_DEPTH16&&desc->format<=GS_GFX_DEPTH;
 if(!texture_format(desc->format,&item))return result;
 int max=desc->width>desc->height?desc->width:desc->height,levels=1;while(max>1){max>>=1;levels++;}
 if(desc->mips>levels){gfx_set_error("Too many texture mip levels");return result;}item.levels=desc->mips?desc->mips:levels;item.desc.mips=item.levels;item.desc.samples=1;
#if defined(__EMSCRIPTEN__)
 GLint maxSize=0;glGetIntegerv(GL_MAX_TEXTURE_SIZE,&maxSize);if(item.width>maxSize||item.height>maxSize){gfx_set_error("Texture exceeds device size limit");return result;}
 glGenTextures(1,&item.gl_tex);glBindTexture(GL_TEXTURE_2D,item.gl_tex);glTexStorage2D(GL_TEXTURE_2D,item.levels,item.internal_format,item.width,item.height);
 glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_MIN_FILTER,GL_NEAREST);glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_MAG_FILTER,GL_NEAREST);
 glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_WRAP_S,GL_CLAMP_TO_EDGE);glTexParameteri(GL_TEXTURE_2D,GL_TEXTURE_WRAP_T,GL_CLAMP_TO_EDGE);
 glGenFramebuffers(1,&item.gl_fbo);glBindFramebuffer(GL_FRAMEBUFFER,item.gl_fbo);
 GLenum attachment=item.is_depth?(item.format==GS_GFX_DEPTH24_STENCIL8?GL_DEPTH_STENCIL_ATTACHMENT:GL_DEPTH_ATTACHMENT):GL_COLOR_ATTACHMENT0;
 glFramebufferTexture2D(GL_FRAMEBUFFER,attachment,GL_TEXTURE_2D,item.gl_tex,0);
 if(item.is_depth){GLenum none=GL_NONE;glDrawBuffers(1,&none);glReadBuffer(GL_NONE);}
 if((desc->usage&(GS_GFX_COLOR_TARGET|GS_GFX_DEPTH_TARGET)) && glCheckFramebufferStatus(GL_FRAMEBUFFER)!=GL_FRAMEBUFFER_COMPLETE){gfx_set_error("Requested render texture format is unsupported by this browser");glDeleteFramebuffers(1,&item.gl_fbo);glDeleteTextures(1,&item.gl_tex);glBindFramebuffer(GL_FRAMEBUFFER,0);return result;}
 glBindFramebuffer(GL_FRAMEBUFFER,0);glBindTexture(GL_TEXTURE_2D,0);
#endif
 result.id=gfx_allocate(1,127);if(!result.id){glDeleteFramebuffers(1,&item.gl_fbo);glDeleteTextures(1,&item.gl_tex);return result;}if(GFX_INDEX(result)>g_webgl_gfx.next_tex_id)g_webgl_gfx.next_tex_id=GFX_INDEX(result);g_webgl_gfx.textures[GFX_INDEX(result)]=item;return result;
}
gs_gfx_texture gs_gfx_load_texture(gs_gfx_bytes path,int64_t flags){
 gs_gfx_texture none={0};if(!path.data||path.len<=0||path.len>4096||(flags&~GS_GFX_LOAD_MIPS)||memchr(path.data,0,path.len)){gfx_set_error("Invalid image path");return none;}
 char *name=malloc(path.len+1);if(!name)return none;memcpy(name,path.data,path.len);name[path.len]=0;int w,h,n;
 stbi_uc *pixels=stbi_load(name,&w,&h,&n,4);free(name);if(!pixels){gfx_set_error(stbi_failure_reason());return none;}
 gs_gfx_texture_desc desc={0};desc.width=w;desc.height=h;desc.format=GS_GFX_RGBA8;desc.usage=GS_GFX_SAMPLED;desc.mips=(flags&GS_GFX_LOAD_MIPS)?0:1;
 gs_gfx_texture t=gs_gfx_create_texture(&desc);if(t.id && !gs_gfx_update_texture(t,NULL,(gs_gfx_bytes){pixels,(int64_t)w*h*4})){gs_gfx_release_texture(t);t.id=0;}
 stbi_image_free(pixels);if(t.id&&(flags&GS_GFX_LOAD_MIPS))gs_gfx_generate_mips(t);return t;
}
uint8_t gs_gfx_update_texture(gs_gfx_texture t,const gs_gfx_region *r,gs_gfx_bytes data){
 if(!gfx_valid(1,t.id))return 0;WebGLTextureItem *item=&g_webgl_gfx.textures[GFX_INDEX(t)];
 int mip=r?r->mip:0;if(mip<0||mip>=item->levels){gfx_set_error("Invalid texture mip");return 0;}
 int mw=item->width>>mip,mh=item->height>>mip;if(mw<1)mw=1;if(mh<1)mh=1;
 int x=r?r->x:0,y=r?r->y:0,w=r&&r->w>0?r->w:mw,h=r&&r->h>0?r->h:mh;
 int64_t bytes=(int64_t)w*h*item->bytes_per_pixel;
 if(x<0||y<0||w<=0||h<=0||x>mw-w||y>mh-h||(r&&(r->layer||r->z||r->d>1))||data.len!=bytes||!data.data){gfx_set_error("Texture upload region or byte length is invalid");return 0;}
#if defined(__EMSCRIPTEN__)
 uint8_t *converted=NULL,*source=data.data;
 if(item->format==GS_GFX_BGRA8){converted=malloc(bytes);if(!converted)return 0;memcpy(converted,source,bytes);for(int64_t i=0;i<bytes;i+=4){uint8_t a=converted[i];converted[i]=converted[i+2];converted[i+2]=a;}source=converted;}
 GLint previous=0,align=0;glGetIntegerv(GL_TEXTURE_BINDING_2D,&previous);glGetIntegerv(GL_UNPACK_ALIGNMENT,&align);glBindTexture(GL_TEXTURE_2D,item->gl_tex);glPixelStorei(GL_UNPACK_ALIGNMENT,1);
 glTexSubImage2D(GL_TEXTURE_2D,mip,x,y,w,h,item->pixel_format,item->pixel_type,source);GLenum error=glGetError();glPixelStorei(GL_UNPACK_ALIGNMENT,align);glBindTexture(GL_TEXTURE_2D,previous);free(converted);
 if(error){gfx_set_error("WebGL rejected texture upload");return 0;}
#endif
 return 1;
}

uint8_t gs_gfx_read_texture(gs_gfx_texture t,const gs_gfx_region *r,gs_gfx_bytes out){
    if(!gfx_valid(1,t.id))return 0;WebGLTextureItem *item=&g_webgl_gfx.textures[GFX_INDEX(t)];
    int x=r?r->x:0,y=r?r->y:0,w=r&&r->w>0?r->w:item->width,h=r&&r->h>0?r->h:item->height;
    int64_t total=(int64_t)w*h*4;
    if((item->format!=GS_GFX_RGBA8 && item->format!=GS_GFX_BGRA8 && item->format!=GS_GFX_RGBA8_SRGB) || (r&&(r->mip||r->layer||r->z||r->d>1)) || item->is_depth || x<0 || y<0 || w<=0 || h<=0 || x+w>item->width || y+h>item->height || out.len<total || !out.data){gfx_set_error("Readback requires a valid mip-zero RGBA8/BGRA8 color region and sufficient output bytes");return 0;}
#if defined(__EMSCRIPTEN__)
    GLint previousRead=0,previousDraw=0,pack=0;glGetIntegerv(GL_READ_FRAMEBUFFER_BINDING,&previousRead);glGetIntegerv(GL_DRAW_FRAMEBUFFER_BINDING,&previousDraw);glGetIntegerv(GL_PACK_ALIGNMENT,&pack);glBindFramebuffer(GL_FRAMEBUFFER,item->gl_fbo);glPixelStorei(GL_PACK_ALIGNMENT,1);glReadPixels(x,y,w,h,GL_RGBA,GL_UNSIGNED_BYTE,out.data);GLenum error=glGetError();glPixelStorei(GL_PACK_ALIGNMENT,pack);glBindFramebuffer(GL_READ_FRAMEBUFFER,previousRead);glBindFramebuffer(GL_DRAW_FRAMEBUFFER,previousDraw);if(error!=GL_NO_ERROR){gfx_set_error("WebGL rejected texture readback");return 0;}if(item->format==GS_GFX_BGRA8)for(int64_t i=0;i<total;i+=4){uint8_t v=out.data[i];out.data[i]=out.data[i+2];out.data[i+2]=v;}return 1;
#else
    return 0;
#endif
}
#if defined(__EMSCRIPTEN__)
EM_ASYNC_JS(int,web_save_png,(const uint8_t *pixels,int w,int h,const uint8_t *path,int path_len),{
    try{
        const data=new Uint8ClampedArray(HEAPU8.slice(pixels,pixels+w*h*4));
        const name=new TextDecoder().decode(HEAPU8.slice(path,path+path_len));
        const canvas=new OffscreenCanvas(w,h),ctx=canvas.getContext('2d');
        ctx.putImageData(new ImageData(data,w,h),0,0);
        const png=new Uint8Array(await (await canvas.convertToBlob({type:'image/png'})).arrayBuffer());
        FS.writeFile(name,png);return 1;
    }catch(e){err('PNG export failed: '+e.message);return 0;}
});
#endif
uint8_t gs_gfx_save_png(gs_gfx_texture t,gs_gfx_bytes path){
    if(!gfx_valid(1,t.id) || !path.data || path.len<=0)return 0;
    WebGLTextureItem *item=&g_webgl_gfx.textures[GFX_INDEX(t)];int64_t n=(int64_t)item->width*item->height*4;
    uint8_t *pixels=malloc((size_t)n);if(!pixels)return 0;int ok=gs_gfx_read_texture(t,NULL,(gs_gfx_bytes){pixels,n});
#if defined(__EMSCRIPTEN__)
    if(ok && item->format==GS_GFX_BGRA8)for(int64_t i=0;i<n;i+=4){uint8_t v=pixels[i];pixels[i]=pixels[i+2];pixels[i+2]=v;}
    if(ok)ok=web_save_png(pixels,item->width,item->height,path.data,path.len);
#endif
    free(pixels);return ok;
}

void gs_gfx_generate_mips(gs_gfx_texture t) {
    if (!gfx_valid(1,t.id)) return;
#if defined(__EMSCRIPTEN__)
    glBindTexture(GL_TEXTURE_2D, g_webgl_gfx.textures[GFX_INDEX(t)].gl_tex);
    glGenerateMipmap(GL_TEXTURE_2D);
    glBindTexture(GL_TEXTURE_2D, 0);
#endif
}

uint8_t gs_gfx_texture_info(gs_gfx_texture t, gs_gfx_texture_desc *out) {
    if (!gfx_valid(1,t.id) || !out) return 0;
    WebGLTextureItem *item = &g_webgl_gfx.textures[GFX_INDEX(t)];
    *out=item->desc;
    return 1;
}

void gs_gfx_release_texture(gs_gfx_texture t) {
    if (!gfx_valid(1,t.id)) return;
#if defined(__EMSCRIPTEN__)
    WebGLTextureItem *item = &g_webgl_gfx.textures[GFX_INDEX(t)];
    if (item->gl_tex) {
        glDeleteTextures(1, &item->gl_tex);
        item->gl_tex = 0;
    }
    if (item->gl_fbo) {
        glDeleteFramebuffers(1, &item->gl_fbo);
        item->gl_fbo = 0;
    }
#endif
    gfx_forget(1,t.id);
}

/* Samplers */
gs_gfx_sampler gs_gfx_create_sampler(const gs_gfx_sampler_desc *desc) {
    gs_gfx_sampler handle = { 0 };
    if (!desc) return handle;
    if(desc->min_filter<0||desc->min_filter>1||desc->mag_filter<0||desc->mag_filter>1||desc->mip_filter<0||desc->mip_filter>1||desc->wrap_u<0||desc->wrap_u>2||desc->wrap_v<0||desc->wrap_v>2||desc->wrap_w<0||desc->wrap_w>2||desc->compare<0||desc->compare>8){gfx_set_error("Invalid sampler descriptor");return handle;}

    uint32_t handle_id=gfx_allocate(2,63);if(!handle_id)return handle;uint32_t id=handle_id&0xfffffu;if(id>g_webgl_gfx.next_samp_id)g_webgl_gfx.next_samp_id=id;
    WebGLSamplerItem *item = &g_webgl_gfx.samplers[id];
    item->filter = desc->min_filter;
    item->wrap = desc->wrap_u;
    item->is_shadow = (desc->compare != 0);

#if defined(__EMSCRIPTEN__)
    glGenSamplers(1, &item->gl_sampler);
    GLenum min=desc->min_filter==GS_GFX_LINEAR?GL_LINEAR_MIPMAP_NEAREST:GL_NEAREST_MIPMAP_NEAREST;
    if(desc->mip_filter==GS_GFX_LINEAR)min=desc->min_filter==GS_GFX_LINEAR?GL_LINEAR_MIPMAP_LINEAR:GL_NEAREST_MIPMAP_LINEAR;
    glSamplerParameteri(item->gl_sampler,GL_TEXTURE_MIN_FILTER,min);
    glSamplerParameteri(item->gl_sampler,GL_TEXTURE_MAG_FILTER,desc->mag_filter==GS_GFX_LINEAR?GL_LINEAR:GL_NEAREST);
    const GLenum wraps[]={GL_REPEAT,GL_MIRRORED_REPEAT,GL_CLAMP_TO_EDGE};
    glSamplerParameteri(item->gl_sampler,GL_TEXTURE_WRAP_S,wraps[desc->wrap_u]);glSamplerParameteri(item->gl_sampler,GL_TEXTURE_WRAP_T,wraps[desc->wrap_v]);glSamplerParameteri(item->gl_sampler,GL_TEXTURE_WRAP_R,wraps[desc->wrap_w]);
    if(item->is_shadow){glSamplerParameteri(item->gl_sampler,GL_TEXTURE_COMPARE_MODE,GL_COMPARE_REF_TO_TEXTURE);glSamplerParameteri(item->gl_sampler,GL_TEXTURE_COMPARE_FUNC,GL_NEVER+desc->compare-1);}
    if(desc->max_anisotropy>1){
      float max=EM_ASM_DOUBLE({const ext=GLctx.getExtension('EXT_texture_filter_anisotropic');return ext?GLctx.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT):0;});
      if(max<=0){glDeleteSamplers(1,&item->gl_sampler);memset(item,0,sizeof *item);gfx_set_error("Anisotropic filtering extension unavailable");gfx_forget(2,handle_id);return (gs_gfx_sampler){0};}
      glSamplerParameterf(item->gl_sampler,0x84fe,desc->max_anisotropy<max?desc->max_anisotropy:max);
    }
#endif

    handle.id = handle_id;
    return handle;
}

void gs_gfx_release_sampler(gs_gfx_sampler s) {
    if (!gfx_valid(2,s.id)) return;
#if defined(__EMSCRIPTEN__)
    if (g_webgl_gfx.samplers[GFX_INDEX(s)].gl_sampler) {
        glDeleteSamplers(1, &g_webgl_gfx.samplers[GFX_INDEX(s)].gl_sampler);
        g_webgl_gfx.samplers[GFX_INDEX(s)].gl_sampler = 0;
    }
#endif
    gfx_forget(2,s.id);
}
