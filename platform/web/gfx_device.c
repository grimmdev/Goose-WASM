/* platform/web/gfx_device.c - Device lifecycle, window, time, and basic state for WebGL2 */
#include "gfx_webgl.h"

WebGLGfxState g_webgl_gfx = { 0 };

void gfx_set_error(const char *msg) {
    if (!msg) return;
    strncpy(g_webgl_gfx.error, msg, sizeof(g_webgl_gfx.error) - 1);
    g_webgl_gfx.error[sizeof(g_webgl_gfx.error) - 1] = '\0';
}

uint8_t gs_gfx_available(void) {
    return 1;
}

uint8_t gs_gfx_open(gs_gfx_bytes title, int64_t width, int64_t height, int64_t flags) {
    (void)title; (void)flags;
    if (g_webgl_gfx.is_open) return 1;

    g_webgl_gfx.is_open = true;
    g_webgl_gfx.width = width > 0 ? width : 1280;
    g_webgl_gfx.height = height > 0 ? height : 720;
    g_webgl_gfx.open_count++;
    g_webgl_gfx.frame_count = 0;

    if (g_webgl_gfx.next_tex_id < 2) g_webgl_gfx.next_tex_id = 2;
    WebGLTextureItem *screenColor = &g_webgl_gfx.textures[1];
    screenColor->width = (int32_t)g_webgl_gfx.width;
    screenColor->height = (int32_t)g_webgl_gfx.height;
    screenColor->format = 1;
    screenColor->is_depth = false;

    WebGLTextureItem *screenDepth = &g_webgl_gfx.textures[2];
    screenDepth->width = (int32_t)g_webgl_gfx.width;
    screenDepth->height = (int32_t)g_webgl_gfx.height;
    screenDepth->format = 10;
    screenDepth->is_depth = true;

#if defined(__EMSCRIPTEN__)
    g_webgl_gfx.start_time = emscripten_get_now() / 1000.0;
    g_webgl_gfx.last_frame_time = g_webgl_gfx.start_time;
    g_webgl_gfx.delta_time = 1.0 / 60.0;

    EmscriptenWebGLContextAttributes attr;
    emscripten_webgl_init_context_attributes(&attr);
    attr.majorVersion = 2;
    attr.minorVersion = 0;
    attr.depth = 1;
    attr.stencil = 0;
    attr.antialias = 1;

    EMSCRIPTEN_WEBGL_CONTEXT_HANDLE ctx = emscripten_webgl_create_context("#canvas", &attr);
    if (ctx > 0) {
        emscripten_webgl_make_context_current(ctx);
        glEnable(GL_DEPTH_TEST);
        glDepthFunc(GL_LEQUAL);
        glEnable(GL_CULL_FACE);
        glCullFace(GL_BACK);
    }
#endif

    return 1;
}

uint8_t gs_gfx_open_headless(int64_t width, int64_t height, int64_t flags) {
    gs_gfx_bytes b = { (uint8_t *)"headless", 8 };
    return gs_gfx_open(b, width, height, flags);
}

void gs_gfx_close(void) {
    g_webgl_gfx.is_open = false;
}

int64_t gs_gfx_error(gs_gfx_bytes out) {
    int64_t len = strlen(g_webgl_gfx.error);
    if (out.data && out.len > 0) {
        int64_t copyLen = len < out.len ? len : out.len;
        memcpy(out.data, g_webgl_gfx.error, (size_t)copyLen);
    }
    return len;
}

int64_t gs_gfx_misuse_count(void) {
    return g_webgl_gfx.misuse;
}

int64_t gs_gfx_driver(gs_gfx_bytes out) {
    const char *driver = "WebGL2 GLES3 / Emscripten";
    int64_t len = strlen(driver);
    if (out.data && out.len > 0) {
        int64_t copyLen = len < out.len ? len : out.len;
        memcpy(out.data, driver, (size_t)copyLen);
    }
    return len;
}

uint8_t gs_gfx_frame(void) {
    if (!g_webgl_gfx.is_open) return 0;

    g_webgl_gfx.frame_count++;
#if defined(__EMSCRIPTEN__)
    double now = emscripten_get_now() / 1000.0;
    g_webgl_gfx.delta_time = now - g_webgl_gfx.last_frame_time;
    if (g_webgl_gfx.delta_time <= 0.0) g_webgl_gfx.delta_time = 1.0 / 60.0;
    g_webgl_gfx.last_frame_time = now;

    // Reset mouse deltas each frame
    g_webgl_gfx.mouse_dx = 0.0f;
    g_webgl_gfx.mouse_dy = 0.0f;
    g_webgl_gfx.mouse_wheel = 0.0f;
    g_webgl_gfx.event_count = 0;

    // Suspend until next animation frame
    emscripten_sleep(16);
#endif

    return 1;
}

void gs_gfx_quit(void) {
    g_webgl_gfx.is_open = false;
}

void gs_gfx_flush(void) {
#if defined(__EMSCRIPTEN__)
    glFlush();
#endif
}

void gs_gfx_set_title(gs_gfx_bytes title) {
    (void)title;
}

void gs_gfx_screen_size(gs_gfx_int2 *out) {
    if (out) {
        out->x = (int32_t)g_webgl_gfx.width;
        out->y = (int32_t)g_webgl_gfx.height;
    }
}

gs_gfx_texture gs_gfx_screen(void) {
    gs_gfx_texture t = { 1 };
    return t;
}

gs_gfx_texture gs_gfx_screen_depth(void) {
    gs_gfx_texture t = { 2 };
    return t;
}

double gs_gfx_time(void) {
#if defined(__EMSCRIPTEN__)
    return (emscripten_get_now() / 1000.0) - g_webgl_gfx.start_time;
#else
    return 0.0;
#endif
}

double gs_gfx_delta_time(void) {
    return g_webgl_gfx.delta_time;
}

int64_t gs_gfx_frame_count(void) {
    return g_webgl_gfx.frame_count;
}

int64_t gs_gfx_open_count(void) {
    return g_webgl_gfx.open_count;
}
