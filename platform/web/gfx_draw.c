#include "gfx_webgl.h"
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
    if(!d || g_webgl_gfx.in_pass){gfx_set_error("Invalid or nested render pass");g_webgl_gfx.misuse++;return 0;}
    gs_gfx_texture target_handle=d->color[0].id?d->color[0]:d->depth;unsigned target=GFX_INDEX(target_handle);
    if(!gfx_valid(1,target_handle.id)){gfx_set_error("Invalid render target");g_webgl_gfx.misuse++;return 0;}
    g_webgl_gfx.current_target=&g_webgl_gfx.textures[target];g_webgl_gfx.in_pass=true;g_webgl_gfx.bound_pipe=NULL;
#if defined(__EMSCRIPTEN__)
    WebGLTextureItem *t=g_webgl_gfx.current_target;
    if(!g_webgl_gfx.pass_fbo)glGenFramebuffers(1,&g_webgl_gfx.pass_fbo);
    glBindFramebuffer(GL_FRAMEBUFFER,g_webgl_gfx.pass_fbo);GLenum attachments[4];int colors=0;
    for(int i=0;i<4;i++){
      if(d->resolve[i].id || (d->color[i].id&&!gfx_valid(1,d->color[i].id))){gfx_set_error("Invalid or multisample resolve attachment");g_webgl_gfx.in_pass=false;return 0;}
      WebGLTextureItem *c=d->color[i].id?&g_webgl_gfx.textures[GFX_INDEX(d->color[i])]:NULL;
      if(c&&(c->is_depth||d->mip<0||d->mip>=c->levels||d->layer)){gfx_set_error("Invalid color attachment mip/layer");g_webgl_gfx.in_pass=false;return 0;}
      glFramebufferTexture2D(GL_FRAMEBUFFER,GL_COLOR_ATTACHMENT0+i,GL_TEXTURE_2D,c?c->gl_tex:0,d->mip);
      attachments[i]=c?GL_COLOR_ATTACHMENT0+i:GL_NONE;if(c)colors=i+1;
    }
    WebGLTextureItem *z=d->depth.id && gfx_valid(1,d->depth.id)?&g_webgl_gfx.textures[GFX_INDEX(d->depth)]:NULL;
    if(d->depth.id&&(!z||!z->is_depth)){gfx_set_error("Invalid depth attachment");g_webgl_gfx.in_pass=false;return 0;}
    glFramebufferTexture2D(GL_FRAMEBUFFER,GL_DEPTH_ATTACHMENT,GL_TEXTURE_2D,0,0);glFramebufferTexture2D(GL_FRAMEBUFFER,GL_STENCIL_ATTACHMENT,GL_TEXTURE_2D,0,0);
    if(z)glFramebufferTexture2D(GL_FRAMEBUFFER,z->format==GS_GFX_DEPTH24_STENCIL8?GL_DEPTH_STENCIL_ATTACHMENT:GL_DEPTH_ATTACHMENT,GL_TEXTURE_2D,z->gl_tex,0);
    if(colors){glDrawBuffers(colors,attachments);glReadBuffer(GL_COLOR_ATTACHMENT0);}else{GLenum none=GL_NONE;glDrawBuffers(1,&none);glReadBuffer(GL_NONE);}
    if(glCheckFramebufferStatus(GL_FRAMEBUFFER)!=GL_FRAMEBUFFER_COMPLETE){gfx_set_error("Incomplete render pass attachments");g_webgl_gfx.in_pass=false;return 0;}
    glViewport(0,0,t->width>>d->mip,t->height>>d->mip);glDisable(GL_SCISSOR_TEST);
    glDepthMask(GL_TRUE);glClearDepthf(d->depth_value);GLbitfield flags=0;
    if(d->clear_color && !t->is_depth){glClearColor(d->color_value.x,d->color_value.y,d->color_value.z,d->color_value.w);flags|=GL_COLOR_BUFFER_BIT;}
    if(d->clear_depth)flags|=GL_DEPTH_BUFFER_BIT;if(flags)glClear(flags);
#endif
    return 1;
}
void gs_gfx_end_pass(void){g_webgl_gfx.in_pass=false;
#if defined(__EMSCRIPTEN__)
    glBindVertexArray(0);
#endif
}
void gs_gfx_bind_pipeline(gs_gfx_pipeline p){
    if(!gfx_valid(3,p.id))return;g_webgl_gfx.bound_pipe=&g_webgl_gfx.pipelines[GFX_INDEX(p)];
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
    if(slot<0 || slot>1 || !gfx_valid(0,b.id) || offset<0)return;
    g_webgl_gfx.bound_vb[slot]=g_webgl_gfx.buffers[GFX_INDEX(b)].gl_buf;g_webgl_gfx.bound_vb_offsets[slot]=(GLintptr)offset;
}
void gs_gfx_bind_index_buffer(gs_gfx_buffer b,int64_t size,int64_t offset){
    if(!gfx_valid(0,b.id) || (size!=2&&size!=4) || offset<0)return;
    g_webgl_gfx.bound_ib=g_webgl_gfx.buffers[GFX_INDEX(b)].gl_buf;g_webgl_gfx.bound_index_size=size;g_webgl_gfx.bound_ib_offset=(GLintptr)offset;
}
void gs_gfx_bind_texture(int64_t stage,int64_t slot,gs_gfx_texture t,gs_gfx_sampler s){
    if(stage<0 || stage>1 || slot<0 || slot>=16 || !gfx_valid(1,t.id) || !g_webgl_gfx.bound_pipe)return;
#if defined(__EMSCRIPTEN__)
    int unit=g_webgl_gfx.bound_pipe->sampler_units[stage][slot];if(unit<0)return;
    glActiveTexture(GL_TEXTURE0+unit);glBindTexture(GL_TEXTURE_2D,g_webgl_gfx.textures[GFX_INDEX(t)].gl_tex);
    glBindSampler(unit,gfx_valid(2,s.id)?g_webgl_gfx.samplers[GFX_INDEX(s)].gl_sampler:0);
#endif
}
void gs_gfx_push_uniforms(int64_t stage,int64_t slot,gs_gfx_bytes data){
    if(!g_webgl_gfx.bound_pipe || data.len<0)return;
#if defined(__EMSCRIPTEN__)
    WebGLPipelineItem *p=g_webgl_gfx.bound_pipe;
    for(int i=0;i<p->uniform_count;i++){WebGLUniform *u=&p->uniforms[i];if(u->stage!=stage||u->slot!=slot)continue;
        if((uint64_t)data.len!=u->size){gfx_set_error("Uniform bytes must match reflected std140 block size");g_webgl_gfx.misuse++;return;}
        glBindBuffer(GL_UNIFORM_BUFFER,u->buffer);glBufferSubData(GL_UNIFORM_BUFFER,0,data.len,data.data);glBindBufferBase(GL_UNIFORM_BUFFER,u->point,u->buffer);return;
    }
#endif
}
void gs_gfx_viewport(float x,float y,float w,float h){
#if defined(__EMSCRIPTEN__)
    glViewport((GLint)x,(GLint)y,(GLsizei)w,(GLsizei)h);
#endif
}
void gs_gfx_scissor(int64_t x,int64_t y,int64_t w,int64_t h){
#if defined(__EMSCRIPTEN__)
    glEnable(GL_SCISSOR_TEST);glScissor(x,y,w,h);
#endif
}
void gs_gfx_draw(int64_t count,int64_t instances,int64_t first,int64_t base){
    if(!g_webgl_gfx.bound_pipe || count<=0 || instances<=0)return;if(base){gfx_set_error("Base instance is unsupported");g_webgl_gfx.misuse++;return;}
#if defined(__EMSCRIPTEN__)
    gfx_configure_vertices();glDrawArraysInstanced(primitive(g_webgl_gfx.bound_pipe->desc.primitive),first,count,instances);
#endif
}
void gs_gfx_draw_indexed(int64_t count,int64_t instances,int64_t first,int64_t base,int64_t base_instance){
    if(!g_webgl_gfx.bound_pipe || count<=0 || instances<=0)return;if(base || base_instance){gfx_set_error("Base vertex/instance is unsupported");g_webgl_gfx.misuse++;return;}
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
