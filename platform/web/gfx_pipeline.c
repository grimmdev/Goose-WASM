/* platform/web/gfx_pipeline.c - Shaders, layout reflection, and pipelines for WebGL2 */
#include "gfx_webgl.h"

#if defined(__EMSCRIPTEN__)
static GLuint compile_shader_stage(GLenum type, const char *src) {
    if (!src) return 0;
    GLuint s = glCreateShader(type);
    glShaderSource(s, 1, &src, NULL);
    glCompileShader(s);

    GLint ok = 0;
    glGetShaderiv(s, GL_COMPILE_STATUS, &ok);
    if (!ok) {
        char log[512];
        glGetShaderInfoLog(s, sizeof(log), NULL, log);
        gfx_set_error(log);
        glDeleteShader(s);
        return 0;
    }
    return s;
}
#endif

gs_gfx_pipeline gs_gfx_create_pipeline(gs_gfx_bytes vert_blob, gs_gfx_bytes frag_blob,
                                       const gs_gfx_pipeline_desc *desc) {
    gs_gfx_pipeline handle = { 0 };
    if (!desc || g_webgl_gfx.next_pipe_id >= 63) return handle;

    uint32_t id = ++g_webgl_gfx.next_pipe_id;
    WebGLPipelineItem *item = &g_webgl_gfx.pipelines[id];
    item->desc = *desc;

#if defined(__EMSCRIPTEN__)
    const char *vs_src = (const char *)vert_blob.data;
    const char *fs_src = (const char *)frag_blob.data;

    GLuint vs = compile_shader_stage(GL_VERTEX_SHADER, vs_src);
    GLuint fs = compile_shader_stage(GL_FRAGMENT_SHADER, fs_src);
    if (!vs || !fs) {
        if (vs) glDeleteShader(vs);
        if (fs) glDeleteShader(fs);
        return handle;
    }

    GLuint prog = glCreateProgram();
    glAttachShader(prog, vs);
    glAttachShader(prog, fs);
    glLinkProgram(prog);

    GLint ok = 0;
    glGetProgramiv(prog, GL_LINK_STATUS, &ok);
    glDeleteShader(vs);
    glDeleteShader(fs);

    if (!ok) {
        char log[512];
        glGetProgramInfoLog(prog, sizeof(log), NULL, log);
        gfx_set_error(log);
        glDeleteProgram(prog);
        return handle;
    }

    item->gl_program = prog;
    item->u_time_loc = glGetUniformLocation(prog, "u_time");
    item->u_res_loc = glGetUniformLocation(prog, "u_resolution");
#endif

    handle.id = id;
    return handle;
}

void gs_gfx_release_pipeline(gs_gfx_pipeline p) {
    if (p.id == 0 || p.id > g_webgl_gfx.next_pipe_id) return;
#if defined(__EMSCRIPTEN__)
    if (g_webgl_gfx.pipelines[p.id].gl_program) {
        glDeleteProgram(g_webgl_gfx.pipelines[p.id].gl_program);
        g_webgl_gfx.pipelines[p.id].gl_program = 0;
    }
#endif
}

gs_gfx_compute_pipeline gs_gfx_create_compute_pipeline(gs_gfx_bytes comp_blob) {
    (void)comp_blob;
    gs_gfx_compute_pipeline handle = { 0 };
    return handle;
}

void gs_gfx_release_compute_pipeline(gs_gfx_compute_pipeline cp) {
    (void)cp;
}

