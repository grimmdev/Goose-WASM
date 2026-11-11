#include "gfx_webgl.h"
#include <math.h>
#if defined(__EMSCRIPTEN__)
static GLenum primitive(int p){static const GLenum v[]={GL_TRIANGLES,GL_TRIANGLE_STRIP,GL_LINES,GL_LINE_STRIP,GL_POINTS};return p>=0&&p<5?v[p]:GL_TRIANGLES;}
void gfx_configure_vertices(void){
    WebGLPipelineItem *p=g_webgl_gfx.bound_pipe;if(!p)return;glBindVertexArray(p->vao);
    for(int i=0;i<p->attribute_count;i++){
        WebGLAttribute *a=&p->attributes[i];glBindBuffer(GL_ARRAY_BUFFER,g_webgl_gfx.bound_vb[a->slot]);
        const void *offset=(const void *)(uintptr_t)(g_webgl_gfx.bound_vb_offsets[a->slot]+a->offset);
        glEnableVertexAttribArray(a->location);
        if(a->integer)glVertexAttribIPointer(a->location,a->components,a->type,p->strides[a->slot],offset);
        else glVertexAttribPointer(a->location,a->components,a->type,a->normalized,p->strides[a->slot],offset);
        glVertexAttribDivisor(a->location,a->slot?1:0);
    }glBindBuffer(GL_ELEMENT_ARRAY_BUFFER,g_webgl_gfx.bound_ib);
}
#else
void gfx_configure_vertices(void){}
#endif
uint8_t gs_gfx_begin_pass(const gs_gfx_pass_desc *d){
 if(!g_webgl_gfx.is_open||!d||g_webgl_gfx.in_pass){gfx_misuse("begin_pass: device closed, null descriptor or nested pass");return 0;}
 gs_gfx_texture target=d->color[0].id?d->color[0]:d->depth;
 if(!gfx_valid(1,target.id)){gfx_misuse("begin_pass: invalid target");return 0;}
 WebGLTextureItem *t=&g_webgl_gfx.textures[GFX_INDEX(target)];
 if(d->mip<0||d->mip>=t->levels||d->layer){gfx_misuse("begin_pass: invalid mip/layer");return 0;}
 int width=t->width>>d->mip,height=t->height>>d->mip;if(width<1)width=1;if(height<1)height=1;
 int colors=0,empty=0;
 for(int i=0;i<4;i++){
  if(d->resolve[i].id){gfx_misuse("Multisample resolves are unsupported");return 0;}
  if(!d->color[i].id){empty=1;continue;}
  if(empty||!gfx_valid(1,d->color[i].id)){gfx_misuse("begin_pass: noncontiguous or stale color targets");return 0;}
  WebGLTextureItem *c=&g_webgl_gfx.textures[GFX_INDEX(d->color[i])];
  int w=c->width>>d->mip,h=c->height>>d->mip;if(w<1)w=1;if(h<1)h=1;
  if(c->is_depth||!(c->desc.usage&GS_GFX_COLOR_TARGET)||d->mip>=c->levels||w!=width||h!=height){gfx_misuse("begin_pass: incompatible color attachment");return 0;}colors++;
 }
 WebGLTextureItem *z=NULL;
 if(d->depth.id){if(!gfx_valid(1,d->depth.id)){gfx_misuse("begin_pass: stale depth target");return 0;}z=&g_webgl_gfx.textures[GFX_INDEX(d->depth)];
  if(!z->is_depth||!(z->desc.usage&GS_GFX_DEPTH_TARGET)||z->width!=width||z->height!=height){gfx_misuse("begin_pass: incompatible depth attachment");return 0;}}
#if defined(__EMSCRIPTEN__)
 GLint previous=0;glGetIntegerv(GL_FRAMEBUFFER_BINDING,&previous);
 if(!g_webgl_gfx.pass_fbo)glGenFramebuffers(1,&g_webgl_gfx.pass_fbo);
 glBindFramebuffer(GL_FRAMEBUFFER,g_webgl_gfx.pass_fbo);GLenum attachments[4];
 for(int i=0;i<4;i++){GLuint tex=i<colors?g_webgl_gfx.textures[GFX_INDEX(d->color[i])].gl_tex:0;glFramebufferTexture2D(GL_FRAMEBUFFER,GL_COLOR_ATTACHMENT0+i,GL_TEXTURE_2D,tex,tex?d->mip:0);attachments[i]=GL_COLOR_ATTACHMENT0+i;}
 glFramebufferTexture2D(GL_FRAMEBUFFER,GL_DEPTH_ATTACHMENT,GL_TEXTURE_2D,0,0);glFramebufferTexture2D(GL_FRAMEBUFFER,GL_STENCIL_ATTACHMENT,GL_TEXTURE_2D,0,0);
 if(z)glFramebufferTexture2D(GL_FRAMEBUFFER,z->format==GS_GFX_DEPTH24_STENCIL8?GL_DEPTH_STENCIL_ATTACHMENT:GL_DEPTH_ATTACHMENT,GL_TEXTURE_2D,z->gl_tex,0);
 if(colors){glDrawBuffers(colors,attachments);glReadBuffer(GL_COLOR_ATTACHMENT0);}else{GLenum none=GL_NONE;glDrawBuffers(1,&none);glReadBuffer(GL_NONE);}
 if(glCheckFramebufferStatus(GL_FRAMEBUFFER)!=GL_FRAMEBUFFER_COMPLETE){glBindFramebuffer(GL_FRAMEBUFFER,previous);gfx_set_error("Incomplete framebuffer");return 0;}
 glViewport(0,0,width,height);glDisable(GL_SCISSOR_TEST);glColorMask(GL_TRUE,GL_TRUE,GL_TRUE,GL_TRUE);glDepthMask(GL_TRUE);glStencilMask(0xff);
 GLfloat clearColor[4]={d->color_value.x,d->color_value.y,d->color_value.z,d->color_value.w},clearDepth=d->depth_value;
 if(d->clear_color)for(int i=0;i<colors;i++){
  int fmt=g_webgl_gfx.textures[GFX_INDEX(d->color[i])].format;
  if(fmt==GS_GFX_R32UI||fmt==GS_GFX_RGBA8UI){GLuint c[4]={(GLuint)d->color_value.x,(GLuint)d->color_value.y,(GLuint)d->color_value.z,(GLuint)d->color_value.w};glClearBufferuiv(GL_COLOR,i,c);}
  else glClearBufferfv(GL_COLOR,i,clearColor);
 }
 if(d->clear_depth&&z)glClearBufferfv(GL_DEPTH,0,&clearDepth);
#endif
 g_webgl_gfx.current_target=t;g_webgl_gfx.in_pass=true;g_webgl_gfx.bound_pipe=NULL;memset(g_webgl_gfx.bound_vb_handles,0,sizeof g_webgl_gfx.bound_vb_handles);g_webgl_gfx.bound_index_handle.id=0;
 return 1;
}
void gs_gfx_end_pass(void){if(!g_webgl_gfx.in_pass){gfx_misuse("end_pass without begin_pass");return;}g_webgl_gfx.in_pass=false;
#if defined(__EMSCRIPTEN__)
 glBindVertexArray(0);
#endif
}
void gs_gfx_bind_pipeline(gs_gfx_pipeline p){
    if(!g_webgl_gfx.in_pass||!gfx_valid(3,p.id)){gfx_misuse("bind_pipeline: no pass or stale pipeline");return;}g_webgl_gfx.bound_pipe=&g_webgl_gfx.pipelines[GFX_INDEX(p)];
#if defined(__EMSCRIPTEN__)
    WebGLPipelineItem *item=g_webgl_gfx.bound_pipe;gs_gfx_pipeline_desc *d=&item->desc;glUseProgram(item->gl_program);glBindVertexArray(item->vao);
    if(d->depth_test){glEnable(GL_DEPTH_TEST);glDepthFunc(GL_NEVER+(d->depth_compare>=1&&d->depth_compare<=8?d->depth_compare-1:1));}else glDisable(GL_DEPTH_TEST);
    glDepthMask(d->depth_write);glFrontFace(d->clockwise?GL_CCW:GL_CW); /* Compiler flips vertex Y for native top-left targets. */
    if(d->cull){glEnable(GL_CULL_FACE);glCullFace(d->cull==GS_GFX_CULL_BACK?GL_BACK:GL_FRONT);}else glDisable(GL_CULL_FACE);
    if(d->depth_bias || d->depth_bias_slope){glEnable(GL_POLYGON_OFFSET_FILL);glPolygonOffset(d->depth_bias_slope,d->depth_bias);}else glDisable(GL_POLYGON_OFFSET_FILL);
    if(d->blend){glEnable(GL_BLEND);glBlendEquationSeparate(GL_FUNC_ADD,GL_FUNC_ADD);
        if(d->blend==GS_GFX_BLEND_ALPHA)glBlendFuncSeparate(GL_SRC_ALPHA,GL_ONE_MINUS_SRC_ALPHA,GL_ONE,GL_ONE_MINUS_SRC_ALPHA);
        else if(d->blend==GS_GFX_BLEND_ADD)glBlendFuncSeparate(GL_SRC_ALPHA,GL_ONE,GL_ZERO,GL_ONE);
        else if(d->blend==GS_GFX_BLEND_PREMULTIPLIED)glBlendFuncSeparate(GL_ONE,GL_ONE_MINUS_SRC_ALPHA,GL_ONE,GL_ONE_MINUS_SRC_ALPHA);
        else glBlendFuncSeparate(GL_DST_COLOR,GL_ZERO,GL_ZERO,GL_ONE);
    }else glDisable(GL_BLEND);
    for(int i=0;i<item->uniform_count;i++)glBindBufferBase(GL_UNIFORM_BUFFER,item->uniforms[i].point,item->uniforms[i].buffer);
#endif
}
void gs_gfx_bind_vertex_buffer(int64_t slot,gs_gfx_buffer b,int64_t offset){
    if(slot<0||slot>1||!gfx_valid(0,b.id)||offset<0){gfx_misuse("bind_vertex_buffer: invalid slot/handle/offset");return;}
    if(!(g_webgl_gfx.buffers[GFX_INDEX(b)].usage&GS_GFX_BUFFER_VERTEX)||offset>g_webgl_gfx.buffers[GFX_INDEX(b)].size){gfx_misuse("bind_vertex_buffer: usage or offset outside buffer");return;}
    g_webgl_gfx.bound_vb_handles[slot]=b;
    g_webgl_gfx.bound_vb[slot]=g_webgl_gfx.buffers[GFX_INDEX(b)].gl_buf;g_webgl_gfx.bound_vb_offsets[slot]=(GLintptr)offset;
}
void gs_gfx_bind_index_buffer(gs_gfx_buffer b,int64_t size,int64_t offset){
    if(!gfx_valid(0,b.id)||(size!=2&&size!=4)||offset<0){gfx_misuse("bind_index_buffer: invalid handle/format/offset");return;}
    if(!(g_webgl_gfx.buffers[GFX_INDEX(b)].usage&GS_GFX_BUFFER_INDEX)||offset%size||offset>g_webgl_gfx.buffers[GFX_INDEX(b)].size){gfx_misuse("bind_index_buffer: invalid usage or unaligned/outside offset");return;}
    g_webgl_gfx.bound_index_handle=b;
    g_webgl_gfx.bound_ib=g_webgl_gfx.buffers[GFX_INDEX(b)].gl_buf;g_webgl_gfx.bound_index_size=size;g_webgl_gfx.bound_ib_offset=(GLintptr)offset;
}
void gs_gfx_bind_texture(int64_t stage,int64_t slot,gs_gfx_texture t,gs_gfx_sampler s){
    if(stage<0||stage>1||slot<0||slot>=16||!gfx_valid(1,t.id)||!g_webgl_gfx.bound_pipe||(s.id&&!gfx_valid(2,s.id))){gfx_misuse("bind_texture: invalid binding or stale handle");return;}
#if defined(__EMSCRIPTEN__)
    int unit=g_webgl_gfx.bound_pipe->sampler_units[stage][slot];if(unit<0){gfx_misuse("bind_texture: slot is not declared by this shader");return;}
    glActiveTexture(GL_TEXTURE0+unit);glBindTexture(GL_TEXTURE_2D,g_webgl_gfx.textures[GFX_INDEX(t)].gl_tex);
    glBindSampler(unit,gfx_valid(2,s.id)?g_webgl_gfx.samplers[GFX_INDEX(s)].gl_sampler:0);
#endif
}
void gs_gfx_push_uniforms(int64_t stage,int64_t slot,gs_gfx_bytes data){
    if(!g_webgl_gfx.bound_pipe||stage<0||stage>1||slot<0||slot>=16||data.len<0||(data.len&&!data.data)){gfx_misuse("push_uniforms: invalid binding/data");return;}
#if defined(__EMSCRIPTEN__)
    WebGLPipelineItem *p=g_webgl_gfx.bound_pipe;
    if(!p->uniform_sizes[stage][slot]||(uint64_t)data.len!=p->uniform_sizes[stage][slot]){gfx_misuse("push_uniforms: undeclared slot or wrong reflected size");return;}
    for(int i=0;i<p->uniform_count;i++){WebGLUniform *u=&p->uniforms[i];if(u->stage!=stage||u->slot!=slot)continue;
        if((uint64_t)data.len!=u->size){gfx_set_error("Uniform bytes must match reflected std140 block size");g_webgl_gfx.misuse++;return;}
        glBindBuffer(GL_UNIFORM_BUFFER,u->buffer);glBufferSubData(GL_UNIFORM_BUFFER,0,data.len,data.data);glBindBufferBase(GL_UNIFORM_BUFFER,u->point,u->buffer);return;
    }
#endif
}
void gs_gfx_viewport(float x,float y,float w,float h){
 if(!isfinite(x)||!isfinite(y)||!isfinite(w)||!isfinite(h)||x<INT32_MIN||x>=2147483648.0f||y<INT32_MIN||y>=2147483648.0f||w<0||h<0||w>=2147483648.0f||h>=2147483648.0f){gfx_misuse("viewport: invalid numeric range");return;}
#if defined(__EMSCRIPTEN__)
    glViewport((GLint)x,(GLint)y,(GLsizei)w,(GLsizei)h);
#endif
}
void gs_gfx_scissor(int64_t x,int64_t y,int64_t w,int64_t h){
 if(x<INT32_MIN||x>INT32_MAX||y<INT32_MIN||y>INT32_MAX||w<0||w>INT32_MAX||h<0||h>INT32_MAX){gfx_misuse("scissor: invalid numeric range");return;}
#if defined(__EMSCRIPTEN__)
    glEnable(GL_SCISSOR_TEST);glScissor(x,y,w,h);
#endif
}
static int draw_valid(int64_t first,int64_t count,int64_t instances,int indexed){
 if(!g_webgl_gfx.in_pass||!g_webgl_gfx.bound_pipe||first<0||count<0||instances<0||first>INT32_MAX||count>INT32_MAX||instances>INT32_MAX){gfx_misuse("draw: missing pass/pipeline or invalid range");return 0;}
 if(!count||!instances)return 0;
 uint64_t maxVertex=(uint64_t)first+count-1;
 if(indexed){gs_gfx_buffer b=g_webgl_gfx.bound_index_handle;
  if(!gfx_valid(0,b.id)){gfx_misuse("draw_indexed: stale or missing index buffer");return 0;}
  WebGLBufferItem *item=&g_webgl_gfx.buffers[GFX_INDEX(b)];uint64_t start=g_webgl_gfx.bound_ib_offset,sz=g_webgl_gfx.bound_index_size;
  if(start+(uint64_t)(first+count)*sz>(uint64_t)item->size){gfx_misuse("draw_indexed: index range exceeds buffer");return 0;}
  maxVertex=0;for(int64_t i=0;i<count;i++){uint32_t value=0;memcpy(&value,item->index_data+start+(first+i)*sz,sz);if(value>maxVertex)maxVertex=value;}
 }
 WebGLPipelineItem *p=g_webgl_gfx.bound_pipe;
 for(int i=0;i<p->attribute_count;i++){WebGLAttribute *a=&p->attributes[i];gs_gfx_buffer b=g_webgl_gfx.bound_vb_handles[a->slot];
  if(!gfx_valid(0,b.id)){gfx_misuse("draw: stale or missing vertex buffer");return 0;}
  uint64_t last=a->slot?(uint64_t)instances-1:maxVertex;
  uint64_t end=(uint64_t)g_webgl_gfx.bound_vb_offsets[a->slot]+last*p->strides[a->slot]+a->offset+a->bytes;
  if(end>(uint64_t)g_webgl_gfx.buffers[GFX_INDEX(b)].size){gfx_misuse("draw: vertex/instance fetch exceeds buffer");return 0;}
 }return 1;
}
void gs_gfx_draw(int64_t count,int64_t instances,int64_t first,int64_t base){
 if(base){gfx_misuse("Base instance is unsupported");return;}if(!draw_valid(first,count,instances,0))return;
#if defined(__EMSCRIPTEN__)
 gfx_configure_vertices();glDrawArraysInstanced(primitive(g_webgl_gfx.bound_pipe->desc.primitive),first,count,instances);
#endif
}
void gs_gfx_draw_indexed(int64_t count,int64_t instances,int64_t first,int64_t base,int64_t base_instance){
 if(base||base_instance){gfx_misuse("Base vertex/instance is unsupported");return;}if(!draw_valid(first,count,instances,1))return;
#if defined(__EMSCRIPTEN__)
 gfx_configure_vertices();glDrawElementsInstanced(primitive(g_webgl_gfx.bound_pipe->desc.primitive),count,g_webgl_gfx.bound_index_size==4?GL_UNSIGNED_INT:GL_UNSIGNED_SHORT,(const void *)(uintptr_t)(g_webgl_gfx.bound_ib_offset+first*g_webgl_gfx.bound_index_size),instances);
#endif
}
static void unsupported(void){gfx_set_error("Storage/compute is unsupported by WebGL2");g_webgl_gfx.misuse++;}
void gs_gfx_bind_storage_texture(int64_t a,int64_t b,gs_gfx_texture c){(void)a;(void)b;(void)c;unsupported();}
void gs_gfx_bind_storage_buffer(int64_t a,int64_t b,gs_gfx_buffer c){(void)a;(void)b;(void)c;unsupported();}
uint8_t gs_gfx_begin_compute(gs_gfx_buffer_slice a,gs_gfx_texture_slice b){(void)a;(void)b;unsupported();return 0;}
void gs_gfx_end_compute(void){unsupported();}
void gs_gfx_bind_compute_pipeline(gs_gfx_compute_pipeline p){(void)p;unsupported();}
void gs_gfx_dispatch(int64_t x,int64_t y,int64_t z){(void)x;(void)y;(void)z;unsupported();}
