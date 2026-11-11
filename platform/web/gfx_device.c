/* platform/web/gfx_device.c - Device lifecycle, window, time, and basic state for WebGL2 */
#include "gfx_webgl.h"

WebGLGfxState g_webgl_gfx = { 0 };
static uint32_t live_handles[4][256],generations[4][256];
uint32_t gfx_allocate(int kind,unsigned limit){
 for(unsigned i=1;i<=limit;i++)if(!live_handles[kind][i] && generations[kind][i]<4096){uint32_t id=(generations[kind][i]<<20)|i;live_handles[kind][i]=id;return id;}
 gfx_set_error("Resource handle pool exhausted");return 0;
}
int gfx_valid(int kind,uint32_t id){unsigned i=id&0xfffffu;return id&&i<256&&live_handles[kind][i]==id;}
void gfx_forget(int kind,uint32_t id){if(gfx_valid(kind,id)){unsigned i=id&0xfffffu;live_handles[kind][i]=0;generations[kind][i]++;}}
uint32_t gfx_live_handle(int kind,unsigned index){return live_handles[kind][index];}

void gfx_set_error(const char *msg) {
    if (!msg) return;
    strncpy(g_webgl_gfx.error, msg, sizeof(g_webgl_gfx.error) - 1);
    g_webgl_gfx.error[sizeof(g_webgl_gfx.error) - 1] = '\0';
}

uint8_t gs_gfx_available(void) {
#if defined(__EMSCRIPTEN__)
    if(g_webgl_gfx.is_open)return 1;
    return EM_ASM_INT({if(typeof document==='undefined')return 0;const c=document.createElement('canvas');const gl=c.getContext('webgl2');if(!gl)return 0;gl.getExtension('WEBGL_lose_context')?.loseContext();return 1;});
#else
    return 0;
#endif
}

uint8_t gs_gfx_open(gs_gfx_bytes title, int64_t width, int64_t height, int64_t flags) {
    if(flags&~(GS_GFX_WINDOW_RESIZABLE|GS_GFX_DEBUG)){gfx_set_error("Unsupported window flags: browser presentation cannot disable vsync or create hidden/fullscreen native windows");return 0;}
    if (g_webgl_gfx.is_open) return 1;

    g_webgl_gfx.width=width>0?width:1280;g_webgl_gfx.height=height>0?height:720;
#if defined(__EMSCRIPTEN__)
    EmscriptenWebGLContextAttributes attr;emscripten_webgl_init_context_attributes(&attr);
    attr.majorVersion=2;attr.minorVersion=0;attr.depth=1;attr.stencil=0;attr.antialias=0;
    emscripten_set_canvas_element_size("#canvas",g_webgl_gfx.width,g_webgl_gfx.height);
    int ctx=emscripten_webgl_create_context("#canvas",&attr);
    if(ctx<=0 || emscripten_webgl_make_context_current(ctx)!=EMSCRIPTEN_RESULT_SUCCESS){gfx_set_error("Unable to create a WebGL2 context");return 0;}
    g_webgl_gfx.context=ctx;
    emscripten_webgl_enable_extension(ctx,"EXT_color_buffer_float");emscripten_webgl_enable_extension(ctx,"OES_texture_float_linear");
    gs_gfx_texture_desc color={0};color.width=g_webgl_gfx.width;color.height=g_webgl_gfx.height;color.format=GS_GFX_RGBA8;color.usage=GS_GFX_COLOR_TARGET;
    gs_gfx_texture_desc depth=color;depth.format=GS_GFX_DEPTH24;depth.usage=GS_GFX_DEPTH_TARGET;
    gs_gfx_texture screen=gs_gfx_create_texture(&color),z=gs_gfx_create_texture(&depth);
    if(GFX_INDEX(screen)!=1 || GFX_INDEX(z)!=2){gfx_set_error("Unable to allocate logical screen targets");return 0;}
    glBindFramebuffer(GL_FRAMEBUFFER,g_webgl_gfx.textures[1].gl_fbo);
    glFramebufferTexture2D(GL_FRAMEBUFFER,GL_DEPTH_ATTACHMENT,GL_TEXTURE_2D,g_webgl_gfx.textures[2].gl_tex,0);
    if(glCheckFramebufferStatus(GL_FRAMEBUFFER)!=GL_FRAMEBUFFER_COMPLETE){gfx_set_error("Incomplete screen framebuffer");return 0;}
    g_webgl_gfx.start_time=emscripten_get_now()/1000.;g_webgl_gfx.last_frame_time=g_webgl_gfx.start_time;
    gfx_reset_gamepads();gfx_install_input();
#endif
    g_webgl_gfx.open_count++;g_webgl_gfx.frame_count=0;g_webgl_gfx.delta_time=1./60.;g_webgl_gfx.is_open=true;
    gs_gfx_set_title(title);
    return 1;
}

uint8_t gs_gfx_open_headless(int64_t width, int64_t height, int64_t flags) {
    (void)width;(void)height;(void)flags;gfx_set_error("Headless opening is unsupported; run browser tests with a real WebGL2 context");return 0;
}

void gfx_present(void){
#if defined(__EMSCRIPTEN__)
    if(!g_webgl_gfx.context)return;glDisable(GL_SCISSOR_TEST);
    glBindFramebuffer(GL_READ_FRAMEBUFFER,g_webgl_gfx.textures[1].gl_fbo);glBindFramebuffer(GL_DRAW_FRAMEBUFFER,0);
    /* Logical row zero is native top-left; flip exactly once at presentation. */
    glBlitFramebuffer(0,g_webgl_gfx.height,g_webgl_gfx.width,0,0,0,g_webgl_gfx.width,g_webgl_gfx.height,GL_COLOR_BUFFER_BIT,GL_NEAREST);glFlush();
#endif
}
void gs_gfx_close(void){
    if(!g_webgl_gfx.is_open)return;gfx_present();
#if defined(__EMSCRIPTEN__)
    gfx_remove_input();
    for(unsigned i=1;i<=g_webgl_gfx.next_pipe_id;i++)gs_gfx_release_pipeline((gs_gfx_pipeline){gfx_live_handle(3,i)});
    for(unsigned i=1;i<=g_webgl_gfx.next_buf_id;i++)gs_gfx_release_buffer((gs_gfx_buffer){gfx_live_handle(0,i)});
    for(unsigned i=1;i<=g_webgl_gfx.next_tex_id;i++)gs_gfx_release_texture((gs_gfx_texture){gfx_live_handle(1,i)});
    for(unsigned i=1;i<=g_webgl_gfx.next_samp_id;i++)gs_gfx_release_sampler((gs_gfx_sampler){gfx_live_handle(2,i)});
    if(g_webgl_gfx.pass_fbo)glDeleteFramebuffers(1,&g_webgl_gfx.pass_fbo);
    emscripten_webgl_destroy_context(g_webgl_gfx.context);
#endif
    int64_t opened=g_webgl_gfx.open_count;memset(&g_webgl_gfx,0,sizeof g_webgl_gfx);g_webgl_gfx.open_count=opened;
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

#if defined(__EMSCRIPTEN__)
EM_ASYNC_JS(void,web_next_frame,(),{await new Promise(resolve=>requestAnimationFrame(resolve));});
#endif
uint8_t gs_gfx_frame(void) {
    if (!g_webgl_gfx.is_open || g_webgl_gfx.quit_requested) return 0;

    if(g_webgl_gfx.frame_count>0)gfx_present();
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
    memset(g_webgl_gfx.keys_pressed,0,sizeof g_webgl_gfx.keys_pressed);
    memset(g_webgl_gfx.keys_released,0,sizeof g_webgl_gfx.keys_released);

    // Suspend until next animation frame
    web_next_frame();gfx_poll_gamepads();
#endif

    return 1;
}

void gs_gfx_quit(void) { g_webgl_gfx.quit_requested = true; }

void gs_gfx_flush(void) {
#if defined(__EMSCRIPTEN__)
    glFlush();
#endif
}

void gs_gfx_set_title(gs_gfx_bytes title){
#if defined(__EMSCRIPTEN__)
    EM_ASM({if(typeof document!=='undefined')document.title=new TextDecoder().decode(HEAPU8.subarray($0,$0+$1));},title.data,(int)title.len);
#endif
}

void gs_gfx_screen_size(gs_gfx_int2 *out) {
    if (out) {
        out->x = (int32_t)g_webgl_gfx.width;
        out->y = (int32_t)g_webgl_gfx.height;
    }
}

gs_gfx_texture gs_gfx_screen(void) {
    gs_gfx_texture t = { gfx_live_handle(1,1) };
    return t;
}

gs_gfx_texture gs_gfx_screen_depth(void) {
    gs_gfx_texture t = { gfx_live_handle(1,2) };
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
