#include "gfx_webgl.h"
#include "audio_api.h"
#include <emscripten.h>
#include <stdio.h>
// Real WebGL/browser probes. No fabricated shader results or pixel readbacks.
extern uint8_t gs_web_gamepad_connected(int64_t);
extern float gs_web_gamepad_axis(int64_t,int64_t);
extern uint8_t gs_web_gamepad_pressed(int64_t,int64_t);
extern uint8_t gs_web_gamepad_released(int64_t,int64_t);
static gs_gfx_bytes text(const char *s){return (gs_gfx_bytes){(uint8_t*)s,strlen(s)};}
EMSCRIPTEN_KEEPALIVE double probe(int op,int a,int b){
 switch(op){
 case 0:return gs_gfx_open(text("Browser input/resource tests"),320,240,0);
 case 1:return gs_gfx_key_down(text("A"));
 case 2:return g_webgl_gfx.mouse_x;
 case 3:return g_webgl_gfx.mouse_y;
 case 4:return gs_gfx_mouse_down(1);
 case 5:return gs_gfx_set_cursor_visible(a);
 case 6:return gs_gfx_cursor_visible();
 case 7:return gs_gfx_focused();
 case 8:gs_gfx_text_input(a);return 1;
 case 9:{int n=0;for(int i=0;i<g_webgl_gfx.event_count;i++)if(g_webgl_gfx.events[i].kind==GS_GFX_EVENT_TEXT)n++;return n;}
 case 10:{gs_gfx_buffer stale={0};for(int i=0;i<1000;i++){uint8_t values[4]={1,2,3,4},out[4]={0};gs_gfx_buffer x=gs_gfx_create_buffer(GS_GFX_BUFFER_VERTEX,4,(gs_gfx_bytes){values,4});if(!x.id||!gs_gfx_read_buffer(x,0,(gs_gfx_bytes){out,4})||memcmp(values,out,4))return -1;if(stale.id&&gs_gfx_update_buffer(stale,0,(gs_gfx_bytes){values,4}))return -2;stale=x;gs_gfx_release_buffer(x);}return 1;}
 case 11:{gs_gfx_texture_desc d={0};d.width=4;d.height=4;d.format=GS_GFX_RGBA8;d.usage=GS_GFX_SAMPLED;d.mips=1;for(int i=0;i<300;i++){gs_gfx_texture t=gs_gfx_create_texture(&d);if(!t.id)return 0;gs_gfx_release_texture(t);}return 1;}
 case 12:{gs_gfx_texture t=gs_gfx_load_texture(text("/assets/checker.png"),0);if(!t.id)return 0;uint8_t out[16*16*4];int ok=gs_gfx_read_texture(t,NULL,(gs_gfx_bytes){out,sizeof out})&&out[3]==255;gs_gfx_release_texture(t);return ok;}
 case 13:{gs_gfx_texture_desc d={0};d.width=2;d.height=2;d.format=GS_GFX_RGBA8;d.usage=GS_GFX_SAMPLED;d.kind=GS_GFX_TEXTURE_3D;return gs_gfx_create_texture(&d).id==0;}
 case 14:{gs_gfx_texture_desc d={0};d.width=2;d.height=2;d.format=GS_GFX_RGBA8;d.usage=GS_GFX_SAMPLED;gs_gfx_texture t=gs_gfx_create_texture(&d);uint8_t bytes[3]={0};int ok=!gs_gfx_update_texture(t,NULL,(gs_gfx_bytes){bytes,3});gs_gfx_release_texture(t);return ok;}
 case 15:{gs_gfx_sampler_desc d={0};d.min_filter=GS_GFX_NEAREST;d.mag_filter=GS_GFX_LINEAR;d.wrap_u=GS_GFX_MIRROR;d.wrap_v=GS_GFX_CLAMP;d.compare=GS_GFX_COMPARE_GREATER;gs_gfx_sampler h=gs_gfx_create_sampler(&d);if(!h.id)return 0;GLuint s=g_webgl_gfx.samplers[GFX_INDEX(h)].gl_sampler;GLint v;glGetSamplerParameteriv(s,GL_TEXTURE_WRAP_S,&v);int ok=v==GL_MIRRORED_REPEAT;glGetSamplerParameteriv(s,GL_TEXTURE_WRAP_T,&v);ok&=v==GL_CLAMP_TO_EDGE;glGetSamplerParameteriv(s,GL_TEXTURE_MAG_FILTER,&v);ok&=v==GL_LINEAR;glGetSamplerParameteriv(s,GL_TEXTURE_COMPARE_FUNC,&v);ok&=v==GL_GREATER;gs_gfx_release_sampler(h);return ok;}
 case 16:return gs_gfx_inject_focus(a);
 case 17:return gs_gfx_key_name(79,(gs_gfx_bytes){0});
 case 18:return gs_gfx_scancode(text("F12"));
 case 19:return gs_web_gamepad_connected(a);
 case 20:gfx_poll_gamepads();return gs_web_gamepad_axis(0,a);
 case 21:return gs_web_gamepad_pressed(0,a);
 case 22:return gs_web_gamepad_released(0,a);
 case 23:gs_gfx_close();return 1;
 case 24:{gs_gfx_texture_desc d={0};d.width=2;d.height=2;d.format=GS_GFX_R8;d.usage=GS_GFX_SAMPLED;d.mips=1;gs_gfx_texture t=gs_gfx_create_texture(&d);uint8_t data[4]={1,2,3,4};int ok=t.id&&gs_gfx_update_texture(t,NULL,(gs_gfx_bytes){data,4});gs_gfx_texture_desc out;ok&=gs_gfx_texture_info(t,&out)&&out.format==GS_GFX_R8&&out.mips==1;gs_gfx_release_texture(t);return ok;}
 case 25:return g_webgl_gfx.mouse_inside;
 case 26:return gs_gfx_set_clipboard(text("goose clipboard"));
 case 27:{uint8_t out[64];return gs_gfx_clipboard((gs_gfx_bytes){out,64});}
 case 28:{int n=0;for(int i=0;i<g_webgl_gfx.event_count;i++)if(g_webgl_gfx.events[i].kind==GS_GFX_EVENT_MOUSE_BUTTON&&g_webgl_gfx.events[i].down==(a!=0))n++;return n;}
 case 30:{gs_gfx_texture_desc d={0};d.width=2;d.height=2;d.format=GS_GFX_RGBA8;d.usage=GS_GFX_COLOR_TARGET;d.mips=1;gs_gfx_texture x=gs_gfx_create_texture(&d),y=gs_gfx_create_texture(&d);d.format=GS_GFX_DEPTH16;d.usage=GS_GFX_DEPTH_TARGET;gs_gfx_texture z=gs_gfx_create_texture(&d);gs_gfx_pass_desc pass={0};pass.color[0]=x;pass.color[1]=y;pass.depth=z;pass.clear_color=1;pass.clear_depth=1;pass.depth_value=1;pass.color_value=(gs_gfx_float4){0.2,0.4,0.6,1};int ok=gs_gfx_begin_pass(&pass);gs_gfx_end_pass();uint8_t a[16],b[16];ok&=gs_gfx_read_texture(x,NULL,(gs_gfx_bytes){a,16})&&gs_gfx_read_texture(y,NULL,(gs_gfx_bytes){b,16})&&a[0]==51&&a[1]==102&&a[2]==153&&a[3]==255&&!memcmp(a,b,16);gs_gfx_release_texture(x);gs_gfx_release_texture(y);gs_gfx_release_texture(z);return ok;}
 case 31:{gs_gfx_texture_desc d={0};d.width=1;d.height=1;d.format=GS_GFX_BGRA8;d.mips=1;d.usage=GS_GFX_SAMPLED;gs_gfx_texture t=gs_gfx_create_texture(&d);uint8_t src[4]={20,30,200,255},out[4];int ok=t.id&&gs_gfx_update_texture(t,NULL,(gs_gfx_bytes){src,4})&&gs_gfx_read_texture(t,NULL,(gs_gfx_bytes){out,4})&&!memcmp(src,out,4);gs_gfx_release_texture(t);return ok;}
 case 32:return gs_gfx_key_down(text("1"));
 case 33:return gs_gfx_open(text("unsupported flags"),320,240,GS_GFX_NO_VSYNC)==0;
 case 40:{gs_audio_close();if(!gs_audio_open(48000,1))return 0;float data[4]={0.25f,0.5f,-0.25f,-0.5f};gs_audio_sound sound=gs_audio_create_sound((gs_audio_f32_slice){data,4},48000,1);gs_audio_voice voice=gs_audio_play(sound,1,0,1,0);float out[8];int ok=voice.id&&gs_audio_render((gs_audio_f32_slice){out,8})&&out[0]==0.25f&&out[1]==0.25f&&out[4]==-0.25f;gs_audio_close();return ok;}
 case 41:gs_audio_close();return gs_audio_open(48000,0);
 case 42:{float samples[4096];for(int i=0;i<4096;i++)samples[i]=0.25f;gs_audio_sound sound=gs_audio_create_sound((gs_audio_f32_slice){samples,4096},48000,1);return gs_audio_play(sound,0.5f,0,1,1).id!=0;}
 case 43:gs_audio_close();return 1;
 case 50:{int64_t n=gs_gfx_misuse_count();gs_gfx_draw(3,1,0,0);return gs_gfx_misuse_count()==n+1;}
 case 51:glColorMask(GL_FALSE,GL_FALSE,GL_FALSE,GL_FALSE);glDepthMask(GL_FALSE);return probe(30,0,0);
 case 52:{gs_gfx_texture screen=gs_gfx_screen(),depth=gs_gfx_screen_depth();gs_gfx_pass_desc d={0};d.color[0]=screen;d.depth=depth;if(!gs_gfx_begin_pass(&d))return 0;WebGLPipelineItem item={0};item.attribute_count=1;item.strides[0]=8;item.attributes[0]=(WebGLAttribute){.slot=0,.offset=0,.bytes=8};g_webgl_gfx.bound_pipe=&item;float values[2]={0,0};gs_gfx_buffer b=gs_gfx_create_buffer(GS_GFX_BUFFER_VERTEX,8,(gs_gfx_bytes){(uint8_t*)values,8});gs_gfx_bind_vertex_buffer(0,b,0);int64_t n=gs_gfx_misuse_count();gs_gfx_draw(2,1,0,0);int ok=gs_gfx_misuse_count()==n+1;uint16_t bad=20;gs_gfx_buffer ib=gs_gfx_create_buffer(GS_GFX_BUFFER_INDEX,2,(gs_gfx_bytes){(uint8_t*)&bad,2});gs_gfx_bind_index_buffer(ib,2,0);n=gs_gfx_misuse_count();gs_gfx_draw_indexed(1,1,0,0,0);ok&=gs_gfx_misuse_count()==n+1;gs_gfx_end_pass();g_webgl_gfx.bound_pipe=NULL;gs_gfx_release_buffer(b);gs_gfx_release_buffer(ib);return ok;}
 case 53:{int64_t n=gs_gfx_misuse_count();gs_gfx_bind_pipeline((gs_gfx_pipeline){0});return gs_gfx_misuse_count()==n+1;}
 case 54:{GLint max=0;glGetIntegerv(GL_MAX_TEXTURE_SIZE,&max);gs_gfx_close();int failed=!gs_gfx_open(text("fail"),max+1,1,0);int clean=!g_webgl_gfx.context&&!g_webgl_gfx.is_open;int retry=gs_gfx_open(text("retry"),320,240,0);return failed&&clean&&retry;}
 default:return -99;
 }
}
