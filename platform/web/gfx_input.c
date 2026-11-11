/* platform/web/gfx_input.c - Keyboard, mouse, events, and clipboard for WebGL2 */
#include "gfx_webgl.h"

static int match_key(gs_gfx_bytes name, const char *str) {
    size_t len = strlen(str);
    if ((size_t)name.len != len) return 0;
    return memcmp(name.data, str, len) == 0;
}

int64_t gs_gfx_scancode(gs_gfx_bytes name) {
    if (!name.data || name.len <= 0) return 0;
    if (match_key(name, "Return")) return 40;
    if (match_key(name, "Escape")) return 41;
    if (match_key(name, "Backspace")) return 42;
    if (match_key(name, "Tab")) return 43;
    if (match_key(name, "Space")) return 44;
    if (match_key(name, "Delete")) return 76;
    if (match_key(name, "Home")) return 74;
    if (match_key(name, "PageUp")) return 75;
    if (match_key(name, "End")) return 77;
    if (match_key(name, "PageDown")) return 78;
    if (match_key(name, "Right")) return 79;
    if (match_key(name, "Left")) return 80;
    if (match_key(name, "Down")) return 81;
    if (match_key(name, "Up")) return 82;
    if (match_key(name, "Keypad Enter")) return 88;
    if (match_key(name, "Left Shift")) return 225;
    if (match_key(name, "Right Shift")) return 229;
    if (match_key(name, "Left Ctrl")) return 224;
    if (match_key(name, "Right Ctrl")) return 228;
    if (match_key(name, "Left Alt")) return 226;
    if (match_key(name, "Right Alt")) return 230;
    if (name.len == 1) {
        char c = (char)name.data[0];
        if (c >= 'a' && c <= 'z') return 4 + (c - 'a');
        if (c >= 'A' && c <= 'Z') return 4 + (c - 'A');
        if (c >= '1' && c <= '9') return 30 + (c - '1');
        if (c == '0') return 39;
    }
    for(int sc=40;sc<232;sc++){uint8_t bytes[32];int n=(int)gs_gfx_key_name(sc,(gs_gfx_bytes){bytes,32});if(n==name.len&&n&&memcmp(bytes,name.data,n)==0)return sc;}
    return 0;
}

uint8_t gs_gfx_key_down(gs_gfx_bytes name){int sc=gs_gfx_scancode(name);return sc>0&&sc<512?g_webgl_gfx.keys_down[sc]:0;}
uint8_t gs_gfx_key_pressed(gs_gfx_bytes name){int sc=gs_gfx_scancode(name);return sc>0&&sc<512?g_webgl_gfx.keys_pressed[sc]:0;}
uint8_t gs_gfx_key_released(gs_gfx_bytes name){int sc=gs_gfx_scancode(name);return sc>0&&sc<512?g_webgl_gfx.keys_released[sc]:0;}

uint8_t gs_gfx_inject_key(gs_gfx_bytes name, uint8_t down) {
    int32_t sc = (int32_t)gs_gfx_scancode(name);
    if(sc<=0 || sc>=512)return 0;
    bool old=g_webgl_gfx.keys_down[sc];g_webgl_gfx.keys_down[sc]=down!=0;
    if(down && !old)g_webgl_gfx.keys_pressed[sc]=true;if(!down && old)g_webgl_gfx.keys_released[sc]=true;
    if(g_webgl_gfx.event_count>=256)return 0;
    gs_gfx_event *e = &g_webgl_gfx.events[g_webgl_gfx.event_count++];
    memset(e, 0, sizeof(*e));
    e->kind = 1;
    e->scancode = sc;
    e->down = down;
    return 1;
}

void gs_gfx_inject_mouse(float x, float y, int64_t button, uint8_t down) {
    g_webgl_gfx.mouse_x = x;
    g_webgl_gfx.mouse_y = y;
    if (button >= 0 && button < 8) {
        g_webgl_gfx.mouse_buttons[button] = (down != 0);
    }
    if (g_webgl_gfx.event_count < 256) {
        gs_gfx_event *e = &g_webgl_gfx.events[g_webgl_gfx.event_count++];
        memset(e, 0, sizeof(*e));
        if (button > 0) {
            e->kind = 4;
            e->button = (int32_t)button;
            e->down = down;
            e->clicks = 1;
        } else {
            e->kind = 3;
        }
        e->x = x;
        e->y = y;
    }
}

uint8_t gs_gfx_inject_text(gs_gfx_bytes text){
    for(int64_t i=0;i<text.len && g_webgl_gfx.event_count<256;){
        uint32_t cp=text.data[i++];int rest=0;
        if(cp>=0xf0){cp&=7;rest=3;}else if(cp>=0xe0){cp&=15;rest=2;}else if(cp>=0xc0){cp&=31;rest=1;}
        while(rest--){if(i>=text.len || (text.data[i]&0xc0)!=0x80)return 0;cp=(cp<<6)|(text.data[i++]&63);}
        gs_gfx_event *e=&g_webgl_gfx.events[g_webgl_gfx.event_count++];memset(e,0,sizeof *e);e->kind=GS_GFX_EVENT_TEXT;e->codepoint=cp;
    }return 1;
}

uint8_t gs_gfx_mouse_down(int64_t button) {
    if (button >= 0 && button < 8) return g_webgl_gfx.mouse_buttons[button];
    return 0;
}

uint8_t gs_gfx_mouse_pressed(int64_t button) {
    for(int i=0;i<g_webgl_gfx.event_count;i++){gs_gfx_event *e=&g_webgl_gfx.events[i];if(e->kind==GS_GFX_EVENT_MOUSE_BUTTON && e->button==button && e->down)return 1;}return 0;
}

uint8_t gs_gfx_mouse_released(int64_t button) {
    for(int i=0;i<g_webgl_gfx.event_count;i++){gs_gfx_event *e=&g_webgl_gfx.events[i];if(e->kind==GS_GFX_EVENT_MOUSE_BUTTON && e->button==button && !e->down)return 1;}return 0;
}

void gs_gfx_mouse_pos(gs_gfx_float2 *out) {
    if (out) {
        out->x = g_webgl_gfx.mouse_x;
        out->y = g_webgl_gfx.mouse_y;
    }
}

void gs_gfx_mouse_delta(gs_gfx_float2 *out) {
    if (out) {
        out->x = g_webgl_gfx.mouse_dx;
        out->y = g_webgl_gfx.mouse_dy;
    }
}

float gs_gfx_mouse_wheel(void) {
    return g_webgl_gfx.mouse_wheel;
}

#if defined(__EMSCRIPTEN__)
EM_ASYNC_JS(int,web_relative,(int on),{
 Module.gooseWantsRelative=!!on;const c=Module.canvas;if(!c || typeof document==='undefined')return 0;
 if(!on){document.exitPointerLock?.();return 1;}
 if(!c.requestPointerLock)return 0;
 try{await c.requestPointerLock();return document.pointerLockElement===c?1:0;}catch(e){err('Pointer lock rejected: '+e.message);return 0;}
});
EM_JS(void,web_exit_relative,(),{Module.gooseWantsRelative=false;if(typeof document!=='undefined')document.exitPointerLock?.();});
EM_JS(int,web_is_relative,(),{return typeof document!=='undefined' && document.pointerLockElement===Module.canvas?1:0;});
EM_JS(void,web_cursor,(int visible),{if(Module.canvas)Module.canvas.style.cursor=visible?"":"none";});
EM_JS(void,web_text_enable,(int on),{const b=Module.gooseInput;if(!b)return;b.textEnabled=!!on;if(on)b.text.focus({preventScroll:true});else {b.text.blur();Module.canvas.focus({preventScroll:true});}});
EM_ASYNC_JS(int,web_clip_read,(uint8_t *out,int cap),{
 try{if(!navigator.clipboard?.readText)throw Error('Clipboard API unavailable');const text=await navigator.clipboard.readText(),bytes=new TextEncoder().encode(text);if(out&&cap>0)HEAPU8.set(bytes.subarray(0,cap),out);return bytes.length;}catch(e){err('Clipboard read failed: '+e.message);return -1;}
});
EM_ASYNC_JS(int,web_clip_write,(const uint8_t *data,int len),{
 try{if(!navigator.clipboard?.writeText)throw Error('Clipboard API unavailable');await navigator.clipboard.writeText(new TextDecoder().decode(HEAPU8.subarray(data,data+len)));return 1;}catch(e){err('Clipboard write failed: '+e.message);return 0;}
});
#endif
uint8_t gs_gfx_mouse_in_window(void){return g_webgl_gfx.mouse_inside;}
uint8_t gs_gfx_focused(void){return g_webgl_gfx.focused;}
uint8_t gs_gfx_set_mouse_relative(uint8_t on){
#if defined(__EMSCRIPTEN__)
 if(!on){web_exit_relative();return 1;}
 int ok=web_relative(1);if(!ok)gfx_set_error("Pointer lock unavailable or awaiting browser permission; query mouse_relative after pointerlockchange");return ok;
#else
 return 0;
#endif
}
uint8_t gs_gfx_mouse_relative(void){
#if defined(__EMSCRIPTEN__)
 return web_is_relative();
#else
 return 0;
#endif
}
uint8_t gs_gfx_set_cursor_visible(uint8_t visible){if(!g_webgl_gfx.focused)return 0;g_webgl_gfx.cursor_visible=visible!=0;
#if defined(__EMSCRIPTEN__)
 web_cursor(visible);
#endif
 return 1;}
uint8_t gs_gfx_cursor_visible(void){return g_webgl_gfx.cursor_visible && !gs_gfx_mouse_relative();}
uint8_t gs_gfx_inject_focus(uint8_t focused){
 g_webgl_gfx.focused=focused!=0;if(!focused){memset(g_webgl_gfx.keys_down,0,sizeof g_webgl_gfx.keys_down);memset(g_webgl_gfx.mouse_buttons,0,sizeof g_webgl_gfx.mouse_buttons);g_webgl_gfx.cursor_visible=true;
#if defined(__EMSCRIPTEN__)
 web_cursor(1);web_exit_relative();
#endif
 }
 if(g_webgl_gfx.event_count>=256)return 0;gs_gfx_event *e=&g_webgl_gfx.events[g_webgl_gfx.event_count++];memset(e,0,sizeof *e);e->kind=focused?GS_GFX_EVENT_FOCUS_GAINED:GS_GFX_EVENT_FOCUS_LOST;return 1;
}

int64_t gs_gfx_events(gs_gfx_event_slice out) {
    if (!out.data || out.len <= 0) return g_webgl_gfx.event_count;
    int64_t count = g_webgl_gfx.event_count < out.len ? g_webgl_gfx.event_count : out.len;
    if (count > 0) {
        memcpy(out.data, g_webgl_gfx.events, (size_t)count * sizeof(gs_gfx_event));
    }
    return count;
}

void gs_gfx_text_input(uint8_t on){g_webgl_gfx.text_enabled=on!=0;
#if defined(__EMSCRIPTEN__)
 web_text_enable(on);
#endif
}
int64_t gs_gfx_key_name(int64_t sc,gs_gfx_bytes out){
 char name[32]={0};
 if(sc>=4&&sc<=29){name[0]='A'+sc-4;}else if(sc>=30&&sc<=38){name[0]='1'+sc-30;}else if(sc==39)strcpy(name,"0");
 else if(sc>=58&&sc<=69)snprintf(name,sizeof name,"F%d",(int)sc-57);
 else if(sc>=104&&sc<=115)snprintf(name,sizeof name,"F%d",(int)sc-91);
 else if(sc>=89&&sc<=97)snprintf(name,sizeof name,"Keypad %d",(int)sc-88);
 else if(sc==98)strcpy(name,"Keypad 0");
 else if(sc>=84&&sc<=88){const char *kp[]={"Keypad /","Keypad *","Keypad -","Keypad +","Keypad Enter"};strcpy(name,kp[sc-84]);}
 else if(sc==99)strcpy(name,"Keypad .");
 else {const char *names[]={"Return","Escape","Backspace","Tab","Space","-","=","[","]","\\","NonUS #",";","'","`",",",".","/","CapsLock"};if(sc>=40&&sc<=57)strcpy(name,names[sc-40]);
 const char *nav[]={"Insert","Home","PageUp","Delete","End","PageDown","Right","Left","Down","Up"};if(sc>=73&&sc<=82)strcpy(name,nav[sc-73]);
 const char *mods[]={"Left Ctrl","Left Shift","Left Alt","Left GUI","Right Ctrl","Right Shift","Right Alt","Right GUI"};if(sc>=224&&sc<=231)strcpy(name,mods[sc-224]);}
 int n=strlen(name);if(out.data&&out.len>0)memcpy(out.data,name,n<out.len?n:out.len);return n;
}
int64_t gs_gfx_clipboard(gs_gfx_bytes out){
#if defined(__EMSCRIPTEN__)
 int n=web_clip_read(out.data,(int)out.len);if(n<0){gfx_set_error("Clipboard read denied or unavailable");return 0;}return n;
#else
 return 0;
#endif
}
uint8_t gs_gfx_set_clipboard(gs_gfx_bytes text){
#if defined(__EMSCRIPTEN__)
 int ok=web_clip_write(text.data,(int)text.len);if(!ok)gfx_set_error("Clipboard write denied or unavailable");return ok;
#else
 return 0;
#endif
}

#if defined(__EMSCRIPTEN__)
static bool on_key(int type,const EmscriptenKeyboardEvent *e,void *unused){
    (void)unused;const char *name=e->key;char key[32];
    if(!strncmp(e->code,"Key",3))name=e->code+3;
    else if(!strncmp(e->code,"Digit",5))name=e->code+5;
    else if(!strncmp(e->code,"Numpad",6)){
      const char *suffix=e->code+6;
      if(!strcmp(suffix,"Enter"))name="Keypad Enter";
      else if(!strcmp(suffix,"Add"))name="Keypad +";else if(!strcmp(suffix,"Subtract"))name="Keypad -";
      else if(!strcmp(suffix,"Multiply"))name="Keypad *";else if(!strcmp(suffix,"Divide"))name="Keypad /";
      else if(!strcmp(suffix,"Decimal"))name="Keypad .";else {snprintf(key,sizeof key,"Keypad %s",suffix);name=key;}
    }
    else {
      const char *codes[]={"Minus","Equal","BracketLeft","BracketRight","Backslash","Semicolon","Quote","Backquote","Comma","Period","Slash","MetaLeft","MetaRight"};
      const char *names[]={"-","=","[","]","\\",";","'","`",",",".","/","Left GUI","Right GUI"};
      for(int i=0;i<13;i++)if(!strcmp(e->code,codes[i])){name=names[i];break;}
    }
    if(!strncmp(name,"Arrow",5))name+=5;
    if(!strcmp(name,"Enter"))name="Return";
    if(!strcmp(name,"Shift"))name=e->location==2?"Right Shift":"Left Shift";
    if(!strcmp(name,"Control"))name=e->location==2?"Right Ctrl":"Left Ctrl";
    if(!strcmp(name,"Alt"))name=e->location==2?"Right Alt":"Left Alt";
    if(!strcmp(name," "))name="Space";
    uint8_t accepted=gs_gfx_inject_key((gs_gfx_bytes){(uint8_t *)name,(int64_t)strlen(name)},type==EMSCRIPTEN_EVENT_KEYDOWN);
    if(accepted && g_webgl_gfx.event_count){gs_gfx_event *event=&g_webgl_gfx.events[g_webgl_gfx.event_count-1];event->repeat=e->repeat;event->mods=(e->shiftKey?1:0)|(e->ctrlKey?2:0)|(e->altKey?4:0)|(e->metaKey?8:0);event->keycode=e->keyCode;}
    /* Keep printable keypress events enabled for text widgets. */
    return !strcmp(e->code,"F5") || !strcmp(e->code,"F9") || !strcmp(e->code,"F12") || !strncmp(e->key,"Arrow",5) || !strcmp(name,"Tab") || !strcmp(name,"Escape");
}
EMSCRIPTEN_KEEPALIVE void goose_web_pointer(int kind,float x,float y,int button,int down,float dx,float dy,int clicks){
 g_webgl_gfx.mouse_dx+=dx;g_webgl_gfx.mouse_dy+=dy;
 if(kind==8){g_webgl_gfx.mouse_inside=down!=0;return;}
 if(kind==9){for(int i=1;i<8;i++)if(g_webgl_gfx.mouse_buttons[i])gs_gfx_inject_mouse(x,y,i,0);return;}
 gs_gfx_inject_mouse(x,y,button,down);if(g_webgl_gfx.event_count)g_webgl_gfx.events[g_webgl_gfx.event_count-1].clicks=clicks;
}
EMSCRIPTEN_KEEPALIVE void goose_web_text(const uint8_t *text,int len){if(g_webgl_gfx.text_enabled)gs_gfx_inject_text((gs_gfx_bytes){(uint8_t *)text,len});}
EM_JS(void,install_pointer,(),{
 if(typeof document==='undefined')return;const c=Module.canvas,listeners=[];
 const b={textEnabled:false,text:document.createElement('textarea')};Module.gooseInput=b;
 const t=b.text;t.setAttribute('aria-label','Goose text input');t.style.cssText='position:fixed;opacity:0;width:1px;height:1px;left:0;top:0;pointer-events:none';document.body.append(t);
 const listen=(el,type,fn,options)=>{el.addEventListener(type,fn,options);listeners.push(()=>el.removeEventListener(type,fn,options));};
 const point=e=>{const r=c.getBoundingClientRect();const scale=Math.min(r.width/c.width,r.height/c.height);return [(e.clientX-r.left-(r.width-c.width*scale)/2)/scale,(e.clientY-r.top-(r.height-c.height*scale)/2)/scale,scale];};
 const send=(kind,e,button,down)=>{const p=point(e);Module._goose_web_pointer(kind,p[0],p[1],button,down,(e.movementX||0)/p[2],(e.movementY||0)/p[2],e.detail||1);};
 listen(c,'pointerdown',e=>{if(!e.isPrimary)return;e.preventDefault();if(Module.gooseWantsRelative && document.pointerLockElement!==c){try{const request=c.requestPointerLock();request?.catch?.(error=>err('Pointer lock denied: '+error.message));}catch(error){err('Pointer lock denied: '+error.message);}}if(b.textEnabled)t.focus({preventScroll:true});else c.focus({preventScroll:true});if(document.pointerLockElement!==c){try{c.setPointerCapture(e.pointerId);}catch(error){/* Pointer lock may be granted during this event. */}}send(4,e,e.pointerType==='mouse'?e.button+1:1,1);});
 listen(c,'pointermove',e=>{if(e.isPrimary){e.preventDefault();send(3,e,0,0);}});
 listen(c,'pointerup',e=>{if(e.isPrimary){e.preventDefault();send(4,e,e.pointerType==='mouse'?e.button+1:1,0);if(!e.buttons&&c.hasPointerCapture(e.pointerId))c.releasePointerCapture(e.pointerId);}});
 for(const event of ['pointercancel','lostpointercapture'])listen(c,event,e=>{if(e.isPrimary)send(9,e,0,0);});
 listen(c,'pointerenter',e=>send(8,e,0,1));listen(c,'pointerleave',e=>send(8,e,0,0));listen(c,'contextmenu',e=>e.preventDefault());
 const emit=text=>{if(!text)return;const n=lengthBytesUTF8(text)+1,p=_malloc(n);try{stringToUTF8(text,p,n);Module._goose_web_text(p,n-1);}finally{_free(p);}};
 listen(t,'input',e=>{if(!e.isComposing){emit(t.value);t.value="";}});listen(t,'compositionend',()=>{emit(t.value);t.value="";});
 c.style.touchAction='none';b.remove=()=>{for(const f of listeners)f();t.remove();c.style.touchAction="";delete Module.gooseInput;};
});
static bool on_wheel(int type,const EmscriptenWheelEvent *e,void *unused){
 (void)type;(void)unused;float divisor=e->deltaMode==0?100:e->deltaMode==1?3:1;
 g_webgl_gfx.mouse_wheel-=(float)e->deltaY/divisor;
 if(g_webgl_gfx.event_count<256){gs_gfx_event *event=&g_webgl_gfx.events[g_webgl_gfx.event_count++];memset(event,0,sizeof *event);event->kind=GS_GFX_EVENT_MOUSE_WHEEL;event->x=-e->deltaX/divisor;event->y=-e->deltaY/divisor;}return true;
}
static bool on_focus(int type,const EmscriptenFocusEvent *e,void *unused){(void)e;(void)unused;gs_gfx_inject_focus(type==EMSCRIPTEN_EVENT_FOCUS);return false;}
void gfx_install_input(void){
 g_webgl_gfx.focused=true;g_webgl_gfx.cursor_visible=true;
 emscripten_set_keydown_callback(EMSCRIPTEN_EVENT_TARGET_WINDOW,NULL,true,on_key);emscripten_set_keyup_callback(EMSCRIPTEN_EVENT_TARGET_WINDOW,NULL,true,on_key);
 emscripten_set_wheel_callback("#canvas",NULL,true,on_wheel);emscripten_set_blur_callback(EMSCRIPTEN_EVENT_TARGET_WINDOW,NULL,true,on_focus);emscripten_set_focus_callback(EMSCRIPTEN_EVENT_TARGET_WINDOW,NULL,true,on_focus);install_pointer();
}
void gfx_remove_input(void){
 emscripten_set_keydown_callback(EMSCRIPTEN_EVENT_TARGET_WINDOW,NULL,true,NULL);emscripten_set_keyup_callback(EMSCRIPTEN_EVENT_TARGET_WINDOW,NULL,true,NULL);
 emscripten_set_wheel_callback("#canvas",NULL,true,NULL);emscripten_set_blur_callback(EMSCRIPTEN_EVENT_TARGET_WINDOW,NULL,true,NULL);emscripten_set_focus_callback(EMSCRIPTEN_EVENT_TARGET_WINDOW,NULL,true,NULL);
 EM_ASM({Module.gooseInput?.remove();});
}
#else
void gfx_install_input(void){}void gfx_remove_input(void){}
#endif
