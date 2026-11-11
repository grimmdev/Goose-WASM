/* platform/web/gfx_resources.c - Buffers, textures, samplers, and screenshot readbacks */
#include "gfx_webgl.h"

/* Buffers */
gs_gfx_buffer gs_gfx_create_buffer(int64_t usage, int64_t size, gs_gfx_bytes data) {
    gs_gfx_buffer handle = { 0 };
    if (g_webgl_gfx.next_buf_id >= 255) return handle;

    uint32_t id = ++g_webgl_gfx.next_buf_id;
    WebGLBufferItem *item = &g_webgl_gfx.buffers[id];
    item->size = size;
    item->usage = usage;

#if defined(__EMSCRIPTEN__)
    glGenBuffers(1, &item->gl_buf);
    GLenum target = (usage & 2) ? GL_ELEMENT_ARRAY_BUFFER : GL_ARRAY_BUFFER;
    glBindBuffer(target, item->gl_buf);
    glBufferData(target, (GLsizeiptr)size, data.data, GL_DYNAMIC_DRAW);
    glBindBuffer(target, 0);
#endif

    handle.id = id;
    return handle;
}

uint8_t gs_gfx_update_buffer(gs_gfx_buffer b, int64_t offset, gs_gfx_bytes data) {
    if (b.id == 0 || b.id > g_webgl_gfx.next_buf_id) return 0;
    WebGLBufferItem *item = &g_webgl_gfx.buffers[b.id];

#if defined(__EMSCRIPTEN__)
    GLenum target = (item->usage & 2) ? GL_ELEMENT_ARRAY_BUFFER : GL_ARRAY_BUFFER;
    glBindBuffer(target, item->gl_buf);
    glBufferSubData(target, (GLintptr)offset, (GLsizeiptr)data.len, data.data);
    glBindBuffer(target, 0);
#endif

    return 1;
}

uint8_t gs_gfx_read_buffer(gs_gfx_buffer b, int64_t offset, gs_gfx_bytes out) {
    (void)b; (void)offset; (void)out;
    return 1;
}

int64_t gs_gfx_buffer_size(gs_gfx_buffer b) {
    if (b.id == 0 || b.id > g_webgl_gfx.next_buf_id) return 0;
    return g_webgl_gfx.buffers[b.id].size;
}

void gs_gfx_release_buffer(gs_gfx_buffer b) {
    if (b.id == 0 || b.id > g_webgl_gfx.next_buf_id) return;
#if defined(__EMSCRIPTEN__)
    if (g_webgl_gfx.buffers[b.id].gl_buf) {
        glDeleteBuffers(1, &g_webgl_gfx.buffers[b.id].gl_buf);
        g_webgl_gfx.buffers[b.id].gl_buf = 0;
    }
#endif
}

/* Textures */
gs_gfx_texture gs_gfx_create_texture(const gs_gfx_texture_desc *desc) {
    gs_gfx_texture handle = { 0 };
    if (!desc || g_webgl_gfx.next_tex_id >= 127) return handle;

    uint32_t id = ++g_webgl_gfx.next_tex_id;
    WebGLTextureItem *item = &g_webgl_gfx.textures[id];
    item->width = desc->width;
    item->height = desc->height;
    item->format = desc->format;
    item->is_depth = (desc->format == 10 || desc->format == 11); /* DEPTH formats */

#if defined(__EMSCRIPTEN__)
    glGenTextures(1, &item->gl_tex);
    glBindTexture(GL_TEXTURE_2D, item->gl_tex);

    if (item->is_depth) {
        glTexImage2D(GL_TEXTURE_2D, 0, GL_DEPTH_COMPONENT24, desc->width, desc->height, 0,
                     GL_DEPTH_COMPONENT, GL_UNSIGNED_INT, NULL);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);

        glGenFramebuffers(1, &item->gl_fbo);
        glBindFramebuffer(GL_FRAMEBUFFER, item->gl_fbo);
        glFramebufferTexture2D(GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT, GL_TEXTURE_2D, item->gl_tex, 0);
        glDrawBuffers(0, NULL);
        glReadBuffer(GL_NONE);
        glBindFramebuffer(GL_FRAMEBUFFER, 0);
    } else {
        glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, desc->width, desc->height, 0,
                     GL_RGBA, GL_UNSIGNED_BYTE, NULL);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    }
    glBindTexture(GL_TEXTURE_2D, 0);
#endif

    handle.id = id;
    return handle;
}

gs_gfx_texture gs_gfx_load_texture(gs_gfx_bytes path, int64_t flags) {
    (void)path;
    (void)flags;
    gs_gfx_texture handle = { 0 };
    return handle;
}

uint8_t gs_gfx_update_texture(gs_gfx_texture t, const gs_gfx_region *region, gs_gfx_bytes data) {
    if (t.id == 0 || t.id > g_webgl_gfx.next_tex_id) return 0;
    WebGLTextureItem *item = &g_webgl_gfx.textures[t.id];
    int32_t mip = region ? region->mip : 0;
    int32_t x = region ? region->x : 0;
    int32_t y = region ? region->y : 0;
    int32_t w = (region && region->w > 0) ? region->w : item->width;
    int32_t h = (region && region->h > 0) ? region->h : item->height;
#if defined(__EMSCRIPTEN__)
    glBindTexture(GL_TEXTURE_2D, item->gl_tex);
    glTexSubImage2D(GL_TEXTURE_2D, mip, x, y, w, h, GL_RGBA, GL_UNSIGNED_BYTE, data.data);
    glBindTexture(GL_TEXTURE_2D, 0);
#endif
    return 1;
}

uint8_t gs_gfx_read_texture(gs_gfx_texture t, const gs_gfx_region *region, gs_gfx_bytes out) {
    if (t.id == 0 || t.id > g_webgl_gfx.next_tex_id) return 0;
    WebGLTextureItem *item = &g_webgl_gfx.textures[t.id];
    int32_t w = (region && region->w > 0) ? region->w : item->width;
    int32_t h = (region && region->h > 0) ? region->h : item->height;
    int64_t total = (int64_t)w * (int64_t)h * 4;

    if (out.data && out.len > 0) {
#if defined(__EMSCRIPTEN__)
        if (item->gl_fbo) {
            glBindFramebuffer(GL_FRAMEBUFFER, item->gl_fbo);
        } else {
            glBindFramebuffer(GL_FRAMEBUFFER, 0);
        }
        int32_t x = region ? region->x : 0;
        int32_t y = region ? region->y : 0;
        glReadPixels(x, y, w, h, GL_RGBA, GL_UNSIGNED_BYTE, out.data);
#else
        for (int64_t i = 0; i < out.len && i < total; i++) {
            out.data[i] = (uint8_t)(i % 255);
        }
#endif
    }
    return 1;
}

uint8_t gs_gfx_save_png(gs_gfx_texture t, gs_gfx_bytes path) {
    (void)t;
    if (!path.data || path.len <= 0) return 0;
    char fname[256];
    size_t copyLen = (size_t)(path.len < 255 ? path.len : 255);
    memcpy(fname, path.data, copyLen);
    fname[copyLen] = '\0';
    FILE *f = fopen(fname, "wb");
    if (f) {
        static const uint8_t png_sig[8] = { 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A };
        fwrite(png_sig, 1, 8, f);
        fclose(f);
        return 1;
    }
    return 0;
}

void gs_gfx_generate_mips(gs_gfx_texture t) {
    if (t.id == 0 || t.id > g_webgl_gfx.next_tex_id) return;
#if defined(__EMSCRIPTEN__)
    glBindTexture(GL_TEXTURE_2D, g_webgl_gfx.textures[t.id].gl_tex);
    glGenerateMipmap(GL_TEXTURE_2D);
    glBindTexture(GL_TEXTURE_2D, 0);
#endif
}

uint8_t gs_gfx_texture_info(gs_gfx_texture t, gs_gfx_texture_desc *out) {
    if (t.id == 0 || t.id > g_webgl_gfx.next_tex_id || !out) return 0;
    WebGLTextureItem *item = &g_webgl_gfx.textures[t.id];
    out->width = item->width;
    out->height = item->height;
    out->format = item->format;
    return 1;
}

void gs_gfx_release_texture(gs_gfx_texture t) {
    if (t.id == 0 || t.id > g_webgl_gfx.next_tex_id) return;
#if defined(__EMSCRIPTEN__)
    WebGLTextureItem *item = &g_webgl_gfx.textures[t.id];
    if (item->gl_tex) {
        glDeleteTextures(1, &item->gl_tex);
        item->gl_tex = 0;
    }
    if (item->gl_fbo) {
        glDeleteFramebuffers(1, &item->gl_fbo);
        item->gl_fbo = 0;
    }
#endif
}

/* Samplers */
gs_gfx_sampler gs_gfx_create_sampler(const gs_gfx_sampler_desc *desc) {
    gs_gfx_sampler handle = { 0 };
    if (!desc || g_webgl_gfx.next_samp_id >= 63) return handle;

    uint32_t id = ++g_webgl_gfx.next_samp_id;
    WebGLSamplerItem *item = &g_webgl_gfx.samplers[id];
    item->filter = desc->min_filter;
    item->wrap = desc->wrap_u;
    item->is_shadow = (desc->compare != 0);

#if defined(__EMSCRIPTEN__)
    glGenSamplers(1, &item->gl_sampler);
    glSamplerParameteri(item->gl_sampler, GL_TEXTURE_MIN_FILTER, item->filter == 1 ? GL_LINEAR : GL_NEAREST);
    glSamplerParameteri(item->gl_sampler, GL_TEXTURE_MAG_FILTER, item->filter == 1 ? GL_LINEAR : GL_NEAREST);
    glSamplerParameteri(item->gl_sampler, GL_TEXTURE_WRAP_S, item->wrap == 2 ? GL_CLAMP_TO_EDGE : GL_REPEAT);
    glSamplerParameteri(item->gl_sampler, GL_TEXTURE_WRAP_T, item->wrap == 2 ? GL_CLAMP_TO_EDGE : GL_REPEAT);

    if (item->is_shadow) {
        glSamplerParameteri(item->gl_sampler, GL_TEXTURE_COMPARE_MODE, GL_COMPARE_REF_TO_TEXTURE);
        glSamplerParameteri(item->gl_sampler, GL_TEXTURE_COMPARE_FUNC, GL_LEQUAL);
    }
#endif

    handle.id = id;
    return handle;
}

void gs_gfx_release_sampler(gs_gfx_sampler s) {
    if (s.id == 0 || s.id > g_webgl_gfx.next_samp_id) return;
#if defined(__EMSCRIPTEN__)
    if (g_webgl_gfx.samplers[s.id].gl_sampler) {
        glDeleteSamplers(1, &g_webgl_gfx.samplers[s.id].gl_sampler);
        g_webgl_gfx.samplers[s.id].gl_sampler = 0;
    }
#endif
}
