// Downstream browser extension: the pinned native gfx API has no gamepad symbols.
#include "gfx_webgl.h"
static float pads[4][32], previous[4][32];
static int changes;
#if defined(__EMSCRIPTEN__)
EM_JS(void,web_poll_pads,(float *out),{
 const pads=typeof navigator!=='undefined'&&navigator.getGamepads?navigator.getGamepads():[];
 for(let slot=0;slot<4;slot++){const p=pads[slot],at=(out>>2)+slot*32;HEAPF32.fill(0,at,at+32);if(!p||p.mapping!=='standard')continue;HEAPF32[at]=1;
 for(let a=0;a<4;a++)HEAPF32[at+1+a]=Number.isFinite(p.axes[a])?p.axes[a]:0;
 HEAPF32[at+5]=p.buttons[6]?.value||0;HEAPF32[at+6]=p.buttons[7]?.value||0;
 for(let b=0;b<17;b++)HEAPF32[at+8+b]=p.buttons[b]?.value||0;
 }
});
EM_ASYNC_JS(int,web_pad_rumble,(int slot,float low,float high,int ms),{
 try{const pad=navigator.getGamepads?.()[slot],a=pad?.vibrationActuator;if(!a?.playEffect)return 0;const result=await a.playEffect('dual-rumble',{duration:ms,strongMagnitude:low,weakMagnitude:high});return result==='complete'?1:0;}catch(e){return 0;}
});
#endif
void gfx_poll_gamepads(void){memcpy(previous,pads,sizeof pads);
#if defined(__EMSCRIPTEN__)
 web_poll_pads(&pads[0][0]);
#endif
 changes=0;for(int i=0;i<4;i++)if(pads[i][0]!=previous[i][0])changes++;
}
void gfx_reset_gamepads(void){memset(pads,0,sizeof pads);memset(previous,0,sizeof previous);changes=0;}
uint8_t gs_web_gamepad_connected(int64_t slot){return slot>=0&&slot<4&&pads[slot][0]!=0;}
int64_t gs_web_gamepad_changes(void){return changes;}
float gs_web_gamepad_axis(int64_t slot,int64_t axis){return gs_web_gamepad_connected(slot)&&axis>=0&&axis<6?pads[slot][1+axis]:0;}
float gs_web_gamepad_value(int64_t slot,int64_t button){return gs_web_gamepad_connected(slot)&&button>=0&&button<17?pads[slot][8+button]:0;}
uint8_t gs_web_gamepad_down(int64_t slot,int64_t button){return gs_web_gamepad_value(slot,button)>=0.5f;}
uint8_t gs_web_gamepad_pressed(int64_t slot,int64_t button){return slot>=0&&slot<4&&button>=0&&button<17&&pads[slot][8+button]>=0.5f&&previous[slot][8+button]<0.5f;}
uint8_t gs_web_gamepad_released(int64_t slot,int64_t button){return slot>=0&&slot<4&&button>=0&&button<17&&pads[slot][8+button]<0.5f&&previous[slot][8+button]>=0.5f;}
uint8_t gs_web_gamepad_rumble(int64_t slot,float low,float high,int64_t ms){
 if(slot<0||slot>=4||low<0||low>1||high<0||high>1||ms<0||ms>60000)return 0;
#if defined(__EMSCRIPTEN__)
 return web_pad_rumble(slot,low,high,(int)ms);
#else
 return 0;
#endif
}
