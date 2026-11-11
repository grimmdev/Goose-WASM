/* platform/web/gfx_draw.c - Passes, bindings, uniform updates, and instanced draws for WebGL2 */
#include "gfx_webgl.h"

uint8_t gs_gfx_begin_pass(const gs_gfx_pass_desc *desc) {
    g_webgl_gfx.in_pass = true;
    if (!desc) return 0;

#if defined(__EMSCRIPTEN__)
    if (desc->depth.id > 0 && desc->depth.id <= g_webgl_gfx.next_tex_id) {
        WebGLTextureItem *depthTex = &g_webgl_gfx.textures[desc->depth.id];
        glBindFramebuffer(GL_FRAMEBUFFER, depthTex->gl_fbo);
        glViewport(0, 0, depthTex->width, depthTex->height);
        glClear(GL_DEPTH_BUFFER_BIT);
        g_webgl_gfx.current_target = depthTex;
    } else {
        glBindFramebuffer(GL_FRAMEBUFFER, 0);
        glViewport(0, 0, (GLsizei)g_webgl_gfx.width, (GLsizei)g_webgl_gfx.height);
        if (desc->clear_color) {
            glClearColor(desc->color_value.x, desc->color_value.y, desc->color_value.z, desc->color_value.w);
            glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
        }
        g_webgl_gfx.current_target = NULL;
    }
#endif
    return 1;
}

void gs_gfx_end_pass(void) {
    g_webgl_gfx.in_pass = false;
#if defined(__EMSCRIPTEN__)
    glBindFramebuffer(GL_FRAMEBUFFER, 0);
    glBindVertexArray(0);
#endif
}

void gs_gfx_bind_pipeline(gs_gfx_pipeline p) {
    if (p.id == 0 || p.id > g_webgl_gfx.next_pipe_id) return;
    g_webgl_gfx.bound_pipe = &g_webgl_gfx.pipelines[p.id];

#if defined(__EMSCRIPTEN__)
    glUseProgram(g_webgl_gfx.bound_pipe->gl_program);
    if (g_webgl_gfx.bound_pipe->u_time_loc >= 0) {
        glUniform1f(g_webgl_gfx.bound_pipe->u_time_loc, (float)gs_gfx_time());
    }
    if (g_webgl_gfx.bound_pipe->u_res_loc >= 0) {
        glUniform2f(g_webgl_gfx.bound_pipe->u_res_loc, (float)g_webgl_gfx.width, (float)g_webgl_gfx.height);
    }
#endif
}

void gs_gfx_bind_vertex_buffer(int64_t slot, gs_gfx_buffer b, int64_t offset) {
    if (slot < 0 || slot >= 4) return;
    if (b.id == 0 || b.id > g_webgl_gfx.next_buf_id) return;

    g_webgl_gfx.bound_vb[slot] = g_webgl_gfx.buffers[b.id].gl_buf;
    g_webgl_gfx.bound_vb_offsets[slot] = (GLintptr)offset;
}

void gs_gfx_bind_index_buffer(gs_gfx_buffer b, int64_t index_size, int64_t offset) {
    (void)offset;
    if (b.id == 0 || b.id > g_webgl_gfx.next_buf_id) return;
    g_webgl_gfx.bound_ib = g_webgl_gfx.buffers[b.id].gl_buf;
    g_webgl_gfx.bound_index_size = (int32_t)index_size;

#if defined(__EMSCRIPTEN__)
    glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, g_webgl_gfx.bound_ib);
#endif
}

void gs_gfx_bind_texture(int64_t stage, int64_t slot, gs_gfx_texture t, gs_gfx_sampler s) {
    (void)stage;
    if (t.id == 0 || t.id > g_webgl_gfx.next_tex_id) return;

#if defined(__EMSCRIPTEN__)
    glActiveTexture(GL_TEXTURE0 + (GLenum)slot);
    glBindTexture(GL_TEXTURE_2D, g_webgl_gfx.textures[t.id].gl_tex);
    if (s.id > 0 && s.id <= g_webgl_gfx.next_samp_id) {
        glBindSampler((GLuint)slot, g_webgl_gfx.samplers[s.id].gl_sampler);
    }
#else
    (void)s;
#endif
}

void gs_gfx_bind_storage_texture(int64_t stage, int64_t slot, gs_gfx_texture t) {
    (void)stage; (void)slot; (void)t;
}

void gs_gfx_bind_storage_buffer(int64_t stage, int64_t slot, gs_gfx_buffer b) {
    (void)stage; (void)slot; (void)b;
}

void gs_gfx_push_uniforms(int64_t stage, int64_t slot, gs_gfx_bytes data) {
    (void)stage; (void)slot; (void)data;
}

void gs_gfx_viewport(float x, float y, float w, float h) {
#if defined(__EMSCRIPTEN__)
    glViewport((GLint)x, (GLint)y, (GLsizei)w, (GLsizei)h);
#else
    (void)x; (void)y; (void)w; (void)h;
#endif
}

void gs_gfx_scissor(int64_t x, int64_t y, int64_t w, int64_t h) {
#if defined(__EMSCRIPTEN__)
    glScissor((GLint)x, (GLint)y, (GLsizei)w, (GLsizei)h);
#else
    (void)x; (void)y; (void)w; (void)h;
#endif
}

void gs_gfx_draw(int64_t vertex_count, int64_t instance_count, int64_t first_vertex, int64_t first_instance) {
    (void)first_vertex; (void)first_instance;
#if defined(__EMSCRIPTEN__)
    if (instance_count > 1) {
        glDrawArraysInstanced(GL_TRIANGLES, (GLint)first_vertex, (GLsizei)vertex_count, (GLsizei)instance_count);
    } else {
        glDrawArrays(GL_TRIANGLES, (GLint)first_vertex, (GLsizei)vertex_count);
    }
#else
    (void)vertex_count; (void)instance_count;
#endif
}

void gs_gfx_draw_indexed(int64_t index_count, int64_t instance_count, int64_t first_index,
                         int64_t base_vertex, int64_t first_instance) {
    (void)base_vertex; (void)first_instance;
#if defined(__EMSCRIPTEN__)
    GLenum type = (g_webgl_gfx.bound_index_size == 4) ? GL_UNSIGNED_INT : GL_UNSIGNED_SHORT;
    const void *indices = (const void *)(uintptr_t)(first_index * g_webgl_gfx.bound_index_size);

    if (instance_count > 1) {
        glDrawElementsInstanced(GL_TRIANGLES, (GLsizei)index_count, type, indices, (GLsizei)instance_count);
    } else {
        glDrawElements(GL_TRIANGLES, (GLsizei)index_count, type, indices);
    }
#else
    (void)index_count; (void)instance_count; (void)first_index;
#endif
}

uint8_t gs_gfx_begin_compute(gs_gfx_buffer_slice rw_buffers, gs_gfx_texture_slice rw_textures) {
    (void)rw_buffers; (void)rw_textures;
    return 1;
}
void gs_gfx_end_compute(void) {}
void gs_gfx_bind_compute_pipeline(gs_gfx_compute_pipeline cp) { (void)cp; }
void gs_gfx_dispatch(int64_t groups_x, int64_t groups_y, int64_t groups_z) {
    (void)groups_x; (void)groups_y; (void)groups_z;
}
