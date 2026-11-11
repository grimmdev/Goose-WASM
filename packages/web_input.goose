// Goose-WASM extension. Standard browser Gamepad mapping, slots 0..3.
// This module does not claim these functions exist in upstream native gfx.
namespace web_input;
let SOUTH: i64 = 0;
let EAST: i64 = 1;
let WEST: i64 = 2;
let NORTH: i64 = 3;
let LEFT_SHOULDER: i64 = 4;
let RIGHT_SHOULDER: i64 = 5;
let LEFT_TRIGGER: i64 = 6;
let RIGHT_TRIGGER: i64 = 7;
let BACK: i64 = 8;
let START: i64 = 9;
let LEFT_STICK: i64 = 10;
let RIGHT_STICK: i64 = 11;
let DPAD_UP: i64 = 12;
let DPAD_DOWN: i64 = 13;
let DPAD_LEFT: i64 = 14;
let DPAD_RIGHT: i64 = 15;
let GUIDE: i64 = 16;
// Axes: left X/Y=0/1, right X/Y=2/3, triggers=4/5.
extern "gs_web_gamepad_connected" fn connected(slot: i64) -> bool;
extern "gs_web_gamepad_changes" fn changes() -> i64;
extern "gs_web_gamepad_axis" fn axis(slot: i64, axis: i64) -> f32;
extern "gs_web_gamepad_value" fn value(slot: i64, button: i64) -> f32;
extern "gs_web_gamepad_down" fn down(slot: i64, button: i64) -> bool;
extern "gs_web_gamepad_pressed" fn pressed(slot: i64, button: i64) -> bool;
extern "gs_web_gamepad_released" fn released(slot: i64, button: i64) -> bool;
extern "gs_web_gamepad_rumble" fn rumble(slot: i64, low: f32, high: f32, milliseconds: i64) -> bool;
