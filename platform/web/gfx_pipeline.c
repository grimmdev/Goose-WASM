/* GSW2 shader envelopes contain real translated GLSL ES and reflection. */
#include "gfx_webgl.h"
#include "web_shader_blob.h"

#if defined(__EMSCRIPTEN__)
static GLuint compile_stage(GLenum type, const WebShader *shader) {
    GLuint s=glCreateShader(type); GLint len=(GLint)shader->source_length;
    glShaderSource(s,1,&shader->source,&len);glCompileShader(s);
    GLint ok=0;glGetShaderiv(s,GL_COMPILE_STATUS,&ok);
    if(!ok){char log[512];glGetShaderInfoLog(s,sizeof log,NULL,log);gfx_set_error(log);glDeleteShader(s);return 0;}return s;
}
static int add_layout(WebGLPipelineItem *item, const WebShader *shader) {
    /* Attributes are packed by location within each input buffer, as native gfx. */
    for(int loc=0;loc<16;loc++)for(int i=0;i<shader->input_count;i++) {
        const WebShaderInput *in=&shader->inputs[i];if(in->location!=loc)continue;
        WebGLAttribute *a=&item->attributes[item->attribute_count++];memset(a,0,sizeof *a);
        int format=item->desc.formats[loc], kind=(in->type-1)%3;
        a->location=loc;a->slot=item->desc.instance_location>=0 && loc>=item->desc.instance_location?1:0;
        if(!format)format=(kind==2?1:kind==0?5:9)+(in->type-1)/3;
        unsigned size=0;
        if(format>=1 && format<=12){a->components=(format-1)%4+1;size=a->components*4;a->type=format<=4?GL_FLOAT:format<=8?GL_INT:GL_UNSIGNED_INT;a->integer=format>4;}
        else if(format>=13 && format<=15){a->components=4;size=4;a->type=format==14?GL_BYTE:GL_UNSIGNED_BYTE;a->normalized=format!=15;a->integer=format==15;}
        else if(format>=16 && format<=21){a->components=(format%2==0)?2:4;size=a->components*2;a->type=format<=17?GL_SHORT:format<=19?GL_UNSIGNED_SHORT:GL_HALF_FLOAT;a->integer=format<=17;a->normalized=format==18 || format==19;}
        else {gfx_set_error("Unsupported vertex format");return 0;}
        if((a->integer && kind==2)||(!a->integer && kind!=2)){gfx_set_error("Vertex format disagrees with shader input type");return 0;}
        a->offset=item->strides[a->slot];item->strides[a->slot]+=size;
    }return 1;
}
static void free_item(WebGLPipelineItem *item) {
    for(int i=0;i<item->uniform_count;i++)if(item->uniforms[i].buffer)glDeleteBuffers(1,&item->uniforms[i].buffer);
    if(item->vao)glDeleteVertexArrays(1,&item->vao);if(item->gl_program)glDeleteProgram(item->gl_program);memset(item,0,sizeof *item);
}
#endif

gs_gfx_pipeline gs_gfx_create_pipeline(gs_gfx_bytes vb,gs_gfx_bytes fb,const gs_gfx_pipeline_desc *desc) {
    gs_gfx_pipeline result={0};WebShader vs,fs;
    if(desc && desc->wireframe){gfx_set_error("Wireframe pipelines require explicit line geometry on WebGL2");return result;}
    if(!desc || vb.len<0 || fb.len<0 || !web_read_shader(vb.data,(size_t)vb.len,0,&vs) || !web_read_shader(fb.data,(size_t)fb.len,1,&fs)) {
        gfx_set_error("Expected GSW2 web shader. Rebuild the game with service/build-project.js and SPIRV-Cross; native GSHD bytes are not GLSL.");return result;
    }

    WebGLPipelineItem item={0};item.desc=*desc;memset(item.sampler_units,0xff,sizeof item.sampler_units);
#if defined(__EMSCRIPTEN__)
    GLuint vert=compile_stage(GL_VERTEX_SHADER,&vs);if(!vert)return result;
    GLuint frag=compile_stage(GL_FRAGMENT_SHADER,&fs);if(!frag){glDeleteShader(vert);return result;}
    item.gl_program=glCreateProgram();glAttachShader(item.gl_program,vert);glAttachShader(item.gl_program,frag);glLinkProgram(item.gl_program);glDeleteShader(vert);glDeleteShader(frag);
    GLint ok=0;glGetProgramiv(item.gl_program,GL_LINK_STATUS,&ok);
    if(!ok){char log[512];glGetProgramInfoLog(item.gl_program,sizeof log,NULL,log);gfx_set_error(log);free_item(&item);return result;}
    if(!add_layout(&item,&vs)){free_item(&item);return result;}
    glGenVertexArrays(1,&item.vao);
    GLint maxUBO=0,maxTex=0;glGetIntegerv(GL_MAX_UNIFORM_BUFFER_BINDINGS,&maxUBO);glGetIntegerv(GL_MAX_COMBINED_TEXTURE_IMAGE_UNITS,&maxTex);
    if(vs.uniform_count+fs.uniform_count>maxUBO || vs.sampler_count+fs.sampler_count>maxTex){gfx_set_error("Shader bindings exceed device limits");free_item(&item);return result;}
    int unit=0;glUseProgram(item.gl_program);
    for(int stage=0;stage<2;stage++) {
        WebShader *s=stage?&fs:&vs;
        for(int i=0;i<s->uniform_count;i++) {
            WebShaderUniform *u=&s->uniforms[i];GLuint index=glGetUniformBlockIndex(item.gl_program,u->name);
            if(index==GL_INVALID_INDEX)continue; /* Optimized-out resource. */
            GLint actual=0;glGetActiveUniformBlockiv(item.gl_program,index,GL_UNIFORM_BLOCK_DATA_SIZE,&actual);
            if(actual<0 || (uint32_t)actual>u->size){gfx_set_error("Uniform block size differs from compiler reflection");free_item(&item);glUseProgram(0);return result;}
            WebGLUniform *dst=&item.uniforms[item.uniform_count];dst->stage=stage;dst->slot=u->slot;dst->point=item.uniform_count++;dst->size=u->size;
            glGenBuffers(1,&dst->buffer);glBindBuffer(GL_UNIFORM_BUFFER,dst->buffer);glBufferData(GL_UNIFORM_BUFFER,u->size,NULL,GL_DYNAMIC_DRAW);glUniformBlockBinding(item.gl_program,index,dst->point);
        }
        for(int i=0;i<s->sampler_count;i++){WebShaderSampler *t=&s->samplers[i];GLint loc=glGetUniformLocation(item.gl_program,t->name);item.sampler_units[stage][t->slot]=unit;if(loc>=0)glUniform1i(loc,unit);unit++;}
    }
    glBindBuffer(GL_UNIFORM_BUFFER,0);glUseProgram(0);
#endif
    result.id=gfx_allocate(3,63);if(!result.id){free_item(&item);return result;}if(GFX_INDEX(result)>g_webgl_gfx.next_pipe_id)g_webgl_gfx.next_pipe_id=GFX_INDEX(result);g_webgl_gfx.pipelines[GFX_INDEX(result)]=item;return result;
}
void gs_gfx_release_pipeline(gs_gfx_pipeline p) {
    if(!gfx_valid(3,p.id))return;
#if defined(__EMSCRIPTEN__)
    if(g_webgl_gfx.bound_pipe==&g_webgl_gfx.pipelines[GFX_INDEX(p)])g_webgl_gfx.bound_pipe=NULL;
    free_item(&g_webgl_gfx.pipelines[GFX_INDEX(p)]);
    gfx_forget(3,p.id);
#endif
}
gs_gfx_compute_pipeline gs_gfx_create_compute_pipeline(gs_gfx_bytes b){(void)b;gfx_set_error("Compute is unsupported by WebGL2");return (gs_gfx_compute_pipeline){0};}
void gs_gfx_release_compute_pipeline(gs_gfx_compute_pipeline p){(void)p;}
