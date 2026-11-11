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
    return 0;
}

uint8_t gs_gfx_key_down(gs_gfx_bytes name) {
    int32_t sc = (int32_t)gs_gfx_scancode(name);
    if (!sc) return 0;
    for (int64_t i = 0; i < g_webgl_gfx.event_count; i++) {
        if (g_webgl_gfx.events[i].kind == 1 && g_webgl_gfx.events[i].scancode == sc) {
            return g_webgl_gfx.events[i].down;
        }
    }
    return 0;
}

uint8_t gs_gfx_key_pressed(gs_gfx_bytes name) {
    int32_t sc = (int32_t)gs_gfx_scancode(name);
    if (!sc) return 0;
    for (int64_t i = 0; i < g_webgl_gfx.event_count; i++) {
        if (g_webgl_gfx.events[i].kind == 1 && g_webgl_gfx.events[i].scancode == sc && g_webgl_gfx.events[i].down) {
            return 1;
        }
    }
    return 0;
}

uint8_t gs_gfx_key_released(gs_gfx_bytes name) {
    int32_t sc = (int32_t)gs_gfx_scancode(name);
    if (!sc) return 0;
    for (int64_t i = 0; i < g_webgl_gfx.event_count; i++) {
        if (g_webgl_gfx.events[i].kind == 1 && g_webgl_gfx.events[i].scancode == sc && !g_webgl_gfx.events[i].down) {
            return 1;
        }
    }
    return 0;
}

uint8_t gs_gfx_inject_key(gs_gfx_bytes name, uint8_t down) {
    if (g_webgl_gfx.event_count >= 256) return 0;
    int32_t sc = (int32_t)gs_gfx_scancode(name);
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

uint8_t gs_gfx_inject_text(gs_gfx_bytes text) {
    if (!text.data || text.len <= 0) return 0;
    for (int64_t i = 0; i < text.len; i++) {
        if (g_webgl_gfx.event_count >= 256) break;
        gs_gfx_event *e = &g_webgl_gfx.events[g_webgl_gfx.event_count++];
        memset(e, 0, sizeof(*e));
        e->kind = 2;
        e->codepoint = (uint32_t)text.data[i];
    }
    return 1;
}

uint8_t gs_gfx_mouse_down(int64_t button) {
    if (button >= 0 && button < 8) return g_webgl_gfx.mouse_buttons[button];
    return 0;
}

uint8_t gs_gfx_mouse_pressed(int64_t button) {
    (void)button;
    return 0;
}

uint8_t gs_gfx_mouse_released(int64_t button) {
    (void)button;
    return 0;
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

uint8_t gs_gfx_mouse_in_window(void) {
    return 1;
}

uint8_t gs_gfx_focused(void) {
    return 1;
}

uint8_t gs_gfx_set_mouse_relative(uint8_t on) {
    (void)on;
    return 1;
}

uint8_t gs_gfx_mouse_relative(void) {
    return 0;
}

uint8_t gs_gfx_set_cursor_visible(uint8_t visible) {
    (void)visible;
    return 1;
}

uint8_t gs_gfx_cursor_visible(void) {
    return 1;
}

uint8_t gs_gfx_inject_focus(uint8_t focused) {
    (void)focused;
    return 1;
}

int64_t gs_gfx_events(gs_gfx_event_slice out) {
    if (!out.data || out.len <= 0) return g_webgl_gfx.event_count;
    int64_t count = g_webgl_gfx.event_count < out.len ? g_webgl_gfx.event_count : out.len;
    if (count > 0) {
        memcpy(out.data, g_webgl_gfx.events, (size_t)count * sizeof(gs_gfx_event));
    }
    return count;
}

void gs_gfx_text_input(uint8_t on) {
    (void)on;
}

int64_t gs_gfx_key_name(int64_t scancode, gs_gfx_bytes out) {
    (void)scancode; (void)out;
    return 0;
}

int64_t gs_gfx_clipboard(gs_gfx_bytes out) {
    (void)out;
    return 0;
}

uint8_t gs_gfx_set_clipboard(gs_gfx_bytes text) {
    (void)text;
    return 1;
}

