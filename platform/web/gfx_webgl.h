/* platform/web/gfx_webgl.h - WebGL2 GLES3 backend declarations for Goose-WASM */
#ifndef GOOSE_GFX_WEBGL_H
#define GOOSE_GFX_WEBGL_H

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

#if defined(__EMSCRIPTEN__)
#include <emscripten.h>
#include <emscripten/html5.h>
#include <GLES3/gl3.h>
#else
typedef unsigned int GLuint;
typedef int GLint;
typedef int GLsizei;
typedef unsigned int GLenum;
typedef float GLfloat;
#endif

#include "gfx_api.h"
#include "contracts.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    GLuint gl_buf;
    int64_t size;
    int64_t usage;
} WebGLBufferItem;

typedef struct {
    GLuint gl_tex;
    GLuint gl_fbo;
    int32_t width;
    int32_t height;
    int32_t format;
    bool is_depth;
} WebGLTextureItem;

typedef struct {
    GLuint gl_sampler;
    int32_t filter;
    int32_t wrap;
    bool is_shadow;
} WebGLSamplerItem;

typedef struct {
    GLuint gl_program;
    gs_gfx_pipeline_desc desc;
    GLint u_time_loc;
    GLint u_res_loc;
} WebGLPipelineItem;

typedef struct {
    bool is_open;
    int64_t width;
    int64_t height;
    int64_t open_count;
    int64_t frame_count;
    double start_time;
    double last_frame_time;
    double delta_time;
    char error[512];
    int64_t misuse;

    /* Active pass state */
    bool in_pass;
    WebGLTextureItem *current_target;
    WebGLPipelineItem *bound_pipe;
    GLuint bound_vao;
    GLuint bound_vb[4];
    GLintptr bound_vb_offsets[4];
    GLuint bound_ib;
    int32_t bound_index_size;

    /* Handle storage pools */
    WebGLBufferItem buffers[256];
    uint32_t next_buf_id;

    WebGLTextureItem textures[128];
    uint32_t next_tex_id;

    WebGLSamplerItem samplers[64];
    uint32_t next_samp_id;

    WebGLPipelineItem pipelines[64];
    uint32_t next_pipe_id;

    /* Input events queue */
    gs_gfx_event events[256];
    int64_t event_count;

    /* Mouse & Keyboard state */
    float mouse_x, mouse_y;
    float mouse_dx, mouse_dy;
    float mouse_wheel;
    bool mouse_buttons[8];
    bool keys_down[512];
    bool keys_pressed[512];
    bool keys_released[512];
} WebGLGfxState;

extern WebGLGfxState g_webgl_gfx;

void gfx_set_error(const char *msg);

#ifdef __cplusplus
}
#endif

#endif /* GOOSE_GFX_WEBGL_H */

