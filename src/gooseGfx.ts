/**
 * Authentic Goose GFX Standard Library Module for WebGL
 *
 * Implements the official Goose `gfx` module specification (SDL3 GPU abstraction)
 * directly in the browser via WebGL:
 *
 * - Window & Lifecycle: gfx::open, gfx::open_headless, gfx::close, gfx::screen_size, gfx::frame
 * - Input System: gfx::key_down, gfx::key_pressed, gfx::key_released, gfx::mouse_pos, gfx::mouse_down
 * - GPU Resources: gfx::vertex_buffer, gfx::index_buffer, embed_shader, gfx::pipeline
 * - Render Commands: gfx::begin_screen, gfx::bind, gfx::bind_vertex_buffer, gfx::bind_index_buffer,
 *                    gfx::uniforms, gfx::draw, gfx::draw_indexed, gfx::end_pass
 * - 3D Math Utilities: gfx::rotate, gfx::look_at, gfx::perspective, gfx::mul
 */

export interface GfxPipeline {
  id: number;
  program: WebGLProgram;
  vs: WebGLShader;
  fs: WebGLShader;
  desc: {
    cull?: number;
    depth_test?: boolean;
    depth_write?: boolean;
    formats?: number[];
  };
  stride: number;
  attribLocations: Map<string, number>;
  uniformLocations: Map<string, WebGLUniformLocation>;
}

export interface GfxBuffer {
  id: number;
  buffer: WebGLBuffer;
  isIndex: boolean;
  byteLength: number;
  data?: ArrayBufferView;
}

export interface GfxInputState {
  keysDown: Set<string>;
  keysPressed: Set<string>;
  keysReleased: Set<string>;
  mouseX: number;
  mouseY: number;
  mouseDx?: number;
  mouseDy?: number;
  mouseWheel?: number;
  mouseInWindow?: boolean;
  mouseDown: [boolean, boolean, boolean];
  mousePressed: [boolean, boolean, boolean];
  mouseReleased: [boolean, boolean, boolean];
  cursorVisible?: boolean;
  cursorShape?: number;
  textInputActive?: boolean;
  gamepadChanges?: number;
  gamepadPrevDown?: boolean[][];
  virtualGamepad?: {
    buttons: boolean[];
    axes: number[];
  };
}

// 4x4 Matrix math utilities matching Goose gfx stdlib
export function mat4Identity(): Float32Array {
  const m = new Float32Array(16);
  m[0] = 1; m[5] = 1; m[10] = 1; m[15] = 1;
  return m;
}

export function mat4Mul(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[r] * b[c * 4] +
        a[4 + r] * b[c * 4 + 1] +
        a[8 + r] * b[c * 4 + 2] +
        a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

export function mat4Rotate(axis: { x: number; y: number; z: number } | [number, number, number], rad: number): Float32Array {
  const ax = Array.isArray(axis) ? axis[0] : (axis.x || 0);
  const ay = Array.isArray(axis) ? axis[1] : (axis.y || 0);
  const az = Array.isArray(axis) ? axis[2] : (axis.z || 0);
  const len = Math.hypot(ax, ay, az);
  if (len < 0.00001) return mat4Identity();
  const x = ax / len, y = ay / len, z = az / len;
  const s = Math.sin(rad), c = Math.cos(rad), oc = 1.0 - c;

  return new Float32Array([
    oc * x * x + c,      oc * x * y + z * s,  oc * z * x - y * s,  0.0,
    oc * x * y - z * s,  oc * y * y + c,      oc * y * z + x * s,  0.0,
    oc * z * x + y * s,  oc * y * z - x * s,  oc * z * z + c,      0.0,
    0.0,                 0.0,                 0.0,                 1.0,
  ]);
}

export function mat4LookAt(
  eye: { x: number; y: number; z: number } | [number, number, number],
  target: { x: number; y: number; z: number } | [number, number, number],
  up: { x: number; y: number; z: number } | [number, number, number]
): Float32Array {
  const ex = Array.isArray(eye) ? eye[0] : eye.x;
  const ey = Array.isArray(eye) ? eye[1] : eye.y;
  const ez = Array.isArray(eye) ? eye[2] : eye.z;
  const tx = Array.isArray(target) ? target[0] : target.x;
  const ty = Array.isArray(target) ? target[1] : target.y;
  const tz = Array.isArray(target) ? target[2] : target.z;
  const ux = Array.isArray(up) ? up[0] : up.x;
  const uy = Array.isArray(up) ? up[1] : up.y;
  const uz = Array.isArray(up) ? up[2] : up.z;

  let zx = ex - tx, zy = ey - ty, zz = ez - tz;
  const zlen = Math.hypot(zx, zy, zz) || 1;
  zx /= zlen; zy /= zlen; zz /= zlen;

  let xx = uy * zz - uz * zy;
  let xy = uz * zx - ux * zz;
  let xz = ux * zy - uy * zx;
  const xlen = Math.hypot(xx, xy, xz) || 1;
  xx /= xlen; xy /= xlen; xz /= xlen;

  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;

  return new Float32Array([
    xx, yx, zx, 0.0,
    xy, yy, zy, 0.0,
    xz, yz, zz, 0.0,
    -(xx * ex + xy * ey + xz * ez),
    -(yx * ex + yy * ey + yz * ez),
    -(zx * ex + zy * ey + zz * ez),
    1.0,
  ]);
}

export function mat4Perspective(fovRad: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1.0 / Math.tan(fovRad / 2.0);
  const rangeInv = 1.0 / (near - far);
  const out = new Float32Array(16);
  out[0] = f / Math.max(aspect, 0.0001);
  out[5] = f;
  out[10] = (far + near) * rangeInv;
  out[11] = -1.0;
  out[14] = (2.0 * far * near) * rangeInv;
  return out;
}

/**
 * Creates the browser GFX runtime interface mapped to a WebGL rendering context.
 */
export function createGfxRuntime(
  canvas: HTMLCanvasElement,
  gl: WebGLRenderingContext,
  inputState: GfxInputState
) {
  let isRunning = true;
  let currentPipeline: GfxPipeline | null = null;
  let currentVbo: GfxBuffer | null = null;
  let currentIbo: GfxBuffer | null = null;
  let indexStride = 2; // 2 bytes = Uint16, 4 bytes = Uint32
  let nextId = 1;
  let lastError = "";

  // Normalize GLSL for WebGL ES
  function normalizeShaderSource(src: string, isVertex: boolean): string {
    let s = src.trim();
    // Layout uniform block Transform { mat4 model; ... } -> uniform mat4 model;
    s = s.replace(/(?:layout\s*\([^)]*\)\s*)?uniform\s+[a-zA-Z0-9_]+\s*\{([^}]*)\};/g, (_m, body) => {
      return body
        .split(";")
        .map((l: string) => l.trim())
        .filter(Boolean)
        .map((l: string) => `uniform ${l};`)
        .join("\n");
    });

    if (isVertex) {
      s = s.replace(/(?:layout\s*\([^)]*\)\s*)?\bin\s+/g, "attribute ");
      s = s.replace(/(?:layout\s*\([^)]*\)\s*)?\bout\s+/g, "varying ");
    } else {
      s = s.replace(/(?:layout\s*\([^)]*\)\s*)?\bin\s+/g, "varying ");
      s = s.replace(/(?:layout\s*\([^)]*\)\s*)?\bout\s+vec4\s+([a-zA-Z0-9_]+)\s*;/g, (_m, name) => `#define ${name} gl_FragColor`);
    }

    if (!s.includes("precision")) {
      s = "precision highp float;\n" + s;
    }
    return s;
  }

  // Compile a shader stage
  function embedShader(stage: string, source: string): WebGLShader {
    const isVert = stage === "vert" || stage === "vertex";
    const shaderType = isVert ? gl.VERTEX_SHADER : gl.FRAGMENT_SHADER;
    const shader = gl.createShader(shaderType)!;
    const glsl = normalizeShaderSource(source, isVert);
    gl.shaderSource(shader, glsl);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const err = gl.getShaderInfoLog(shader) || "Shader compile error";
      lastError = err;
      console.warn("GFX embed_shader error:", err, "\nSource:\n", glsl);
    }
    return shader;
  }

  // Helper to pack raw arrays of structs / numbers into ArrayBuffer
  function bytesOf(data: any): Uint8Array {
    if (!data) return new Uint8Array(0);
    if (data instanceof Uint8Array) return data;
    if (ArrayBuffer.isView(data)) {
      return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }

    if (Array.isArray(data)) {
      if (data.length === 0) return new Uint8Array(0);
      const first = data[0];

      // Array of simple numbers
      if (typeof first === "number") {
        const f32 = new Float32Array(data);
        return new Uint8Array(f32.buffer);
      }

      // Array of Vertex objects e.g. { pos, normal, color }
      if (typeof first === "object" && first !== null) {
        // Compute struct stride
        let hasNormal = "normal" in first;
        let hasColor = "color" in first;
        let floatsPerVert = 3 + (hasNormal ? 3 : 0);
        let bytesPerVert = floatsPerVert * 4 + (hasColor ? 4 : 0);
        // Align to 4 bytes
        bytesPerVert = (bytesPerVert + 3) & ~3;

        const buffer = new ArrayBuffer(data.length * bytesPerVert);
        const f32View = new Float32Array(buffer);
        const u8View = new Uint8Array(buffer);

        for (let i = 0; i < data.length; i++) {
          const v = data[i];
          const vertOffsetBytes = i * bytesPerVert;
          let fIdx = vertOffsetBytes / 4;

          // pos (float3)
          if (v.pos) {
            f32View[fIdx++] = v.pos.x ?? v.pos[0] ?? 0;
            f32View[fIdx++] = v.pos.y ?? v.pos[1] ?? 0;
            f32View[fIdx++] = v.pos.z ?? v.pos[2] ?? 0;
          } else {
            f32View[fIdx++] = v.x ?? 0;
            f32View[fIdx++] = v.y ?? 0;
            f32View[fIdx++] = v.z ?? 0;
          }

          // normal (float3)
          if (hasNormal && v.normal) {
            f32View[fIdx++] = v.normal.x ?? v.normal[0] ?? 0;
            f32View[fIdx++] = v.normal.y ?? v.normal[1] ?? 0;
            f32View[fIdx++] = v.normal.z ?? v.normal[2] ?? 0;
          }

          // color (u8[4])
          if (hasColor && v.color) {
            const cOffset = fIdx * 4;
            const c = v.color;
            u8View[cOffset] = c.r ?? c[0] ?? 255;
            u8View[cOffset + 1] = c.g ?? c[1] ?? 255;
            u8View[cOffset + 2] = c.b ?? c[2] ?? 255;
            u8View[cOffset + 3] = c.a ?? c[3] ?? 255;
          }
        }
        return u8View;
      }
    }

    return new Uint8Array(0);
  }

  const GOOSE_TO_W3C_BTN: number[] = [
    0,  // GAMEPAD_SOUTH -> A/Cross
    1,  // GAMEPAD_EAST -> B/Circle
    2,  // GAMEPAD_WEST -> X/Square
    3,  // GAMEPAD_NORTH -> Y/Triangle
    8,  // GAMEPAD_BACK -> Back/Select
    16, // GAMEPAD_GUIDE -> Guide/Home
    9,  // GAMEPAD_START -> Start
    10, // GAMEPAD_LEFT_STICK -> L3
    11, // GAMEPAD_RIGHT_STICK -> R3
    4,  // GAMEPAD_LEFT_SHOULDER -> LB/L1
    5,  // GAMEPAD_RIGHT_SHOULDER -> RB/R1
    12, // GAMEPAD_DPAD_UP -> D-Up
    13, // GAMEPAD_DPAD_DOWN -> D-Down
    14, // GAMEPAD_DPAD_LEFT -> D-Left
    15, // GAMEPAD_DPAD_RIGHT -> D-Right
  ];

  const CURSOR_CSS_MAP: { [key: number]: string } = {
    0: "default",
    1: "text",
    2: "pointer",
    3: "crosshair",
    4: "wait",
    5: "progress",
    6: "move",
    7: "not-allowed",
    8: "ew-resize",
    9: "ns-resize",
    10: "nwse-resize",
    11: "nesw-resize",
    12: "n-resize",
    13: "e-resize",
    14: "s-resize",
    15: "w-resize",
    16: "nw-resize",
    17: "ne-resize",
    18: "se-resize",
    19: "sw-resize",
  };

  function getGamepadSlot(slot: number): Gamepad | null {
    if (slot < 0 || slot >= 4) return null;
    if (typeof navigator !== "undefined" && navigator.getGamepads) {
      const pads = navigator.getGamepads();
      if (pads && pads[slot]) return pads[slot];
    }
    return null;
  }

  function isGamepadBtnDown(slot: number, btn: number): boolean {
    if (slot < 0 || slot >= 4 || btn < 0 || btn > 14) return false;
    const pad = getGamepadSlot(slot);
    if (pad) {
      const w3cIdx = GOOSE_TO_W3C_BTN[btn];
      if (w3cIdx !== undefined && pad.buttons && pad.buttons[w3cIdx]) {
        return Boolean(pad.buttons[w3cIdx].pressed || pad.buttons[w3cIdx].value > 0.5);
      }
    }
    if (slot === 0 && inputState.virtualGamepad && inputState.virtualGamepad.buttons) {
      return Boolean(inputState.virtualGamepad.buttons[btn]);
    }
    return false;
  }

  // The gfx API namespace exposed directly to Goose
  const gfx = {
    // Stage constants
    VERTEX: 0,
    FRAGMENT: 1,
    COMPUTE: 2,

    // Cull constants
    CULL_NONE: 0,
    CULL_BACK: 1,
    CULL_FRONT: 2,

    // Texture filters and wrapping
    NEAREST: 0,
    LINEAR: 1,
    CLAMP: 0,
    REPEAT: 1,

    // Blending constants
    BLEND_NONE: 0,
    BLEND_ALPHA: 1,
    BLEND_ADD: 2,

    // Buffer type constants
    BUFFER_VERTEX: 1,
    BUFFER_INDEX: 2,
    BUFFER_STORAGE: 3,
    BUFFER_COMPUTE_READ: 4,
    BUFFER_COMPUTE_WRITE: 5,

    // Window constants
    WINDOW_RESIZABLE: 1,

    // Vertex format constants
    VERTEX_FLOAT: 0,
    VERTEX_FLOAT2: 1,
    VERTEX_FLOAT3: 2,
    VERTEX_FLOAT4: 3,
    VERTEX_UBYTE4_NORM: 4,

    // Mouse button constants
    MOUSE_LEFT: 1,
    MOUSE_MIDDLE: 2,
    MOUSE_RIGHT: 3,
    MOUSE_X1: 4,
    MOUSE_X2: 5,

    // Event constants
    EVENT_KEY: 1,
    EVENT_TEXT: 2,
    EVENT_MOUSE_MOTION: 3,
    EVENT_MOUSE_BUTTON: 4,
    EVENT_MOUSE_WHEEL: 5,
    EVENT_FOCUS_GAINED: 6,
    EVENT_FOCUS_LOST: 7,
    EVENT_QUIT: 8,

    // Modifier constants
    MOD_SHIFT: 1,
    MOD_CTRL: 2,
    MOD_ALT: 4,
    MOD_GUI: 8,

    // Gamepad constants (Goose standard library)
    MAX_GAMEPADS: 4,
    GAMEPAD_SOUTH: 0,
    GAMEPAD_EAST: 1,
    GAMEPAD_WEST: 2,
    GAMEPAD_NORTH: 3,
    GAMEPAD_BACK: 4,
    GAMEPAD_GUIDE: 5,
    GAMEPAD_START: 6,
    GAMEPAD_LEFT_STICK: 7,
    GAMEPAD_RIGHT_STICK: 8,
    GAMEPAD_LEFT_SHOULDER: 9,
    GAMEPAD_RIGHT_SHOULDER: 10,
    GAMEPAD_DPAD_UP: 11,
    GAMEPAD_DPAD_DOWN: 12,
    GAMEPAD_DPAD_LEFT: 13,
    GAMEPAD_DPAD_RIGHT: 14,

    AXIS_LEFT_X: 0,
    AXIS_LEFT_Y: 1,
    AXIS_RIGHT_X: 2,
    AXIS_RIGHT_Y: 3,
    AXIS_LEFT_TRIGGER: 4,
    AXIS_RIGHT_TRIGGER: 5,

    // Cursor constants
    CURSOR_DEFAULT: 0,
    CURSOR_TEXT: 1,
    CURSOR_POINTER: 2,
    CURSOR_CROSSHAIR: 3,
    CURSOR_WAIT: 4,
    CURSOR_PROGRESS: 5,
    CURSOR_MOVE: 6,
    CURSOR_NOT_ALLOWED: 7,
    CURSOR_EW_RESIZE: 8,
    CURSOR_NS_RESIZE: 9,
    CURSOR_NWSE_RESIZE: 10,
    CURSOR_NESW_RESIZE: 11,
    CURSOR_N_RESIZE: 12,
    CURSOR_E_RESIZE: 13,
    CURSOR_S_RESIZE: 14,
    CURSOR_W_RESIZE: 15,
    CURSOR_NW_RESIZE: 16,
    CURSOR_NE_RESIZE: 17,
    CURSOR_SE_RESIZE: 18,
    CURSOR_SW_RESIZE: 19,

    // PipelineDesc constructor
    PipelineDesc: function(opts: any = {}) {
      return {
        cull: opts.cull ?? 1, // default back-face cull
        depth_test: opts.depth_test ?? true,
        depth_write: opts.depth_write ?? true,
        blend: opts.blend ?? 0,
        formats: opts.formats ?? [],
      };
    },

    open: function(title: string, width: number, height: number, flags: number = 0): boolean {
      if (width > 0 && height > 0) {
        canvas.width = width;
        canvas.height = height;
      }
      isRunning = true;
      return true;
    },

    open_headless: function(width: number, height: number): boolean {
      if (width > 0 && height > 0) {
        canvas.width = width;
        canvas.height = height;
      }
      isRunning = true;
      return true;
    },

    close: function() {
      isRunning = false;
    },

    screen_size: function(): { x: number; y: number } {
      return { x: canvas.width || 640, y: canvas.height || 480 };
    },

    screen: function(): any {
      return { id: 0, w: canvas.width || 640, h: canvas.height || 480 };
    },

    driver: function(): string {
      return "webgl";
    },

    error: function(): string {
      return lastError;
    },

    focused: function(): boolean {
      return typeof document !== "undefined" ? document.hasFocus() : true;
    },

    set_mouse_relative: function(rel: boolean): boolean {
      if (typeof document !== "undefined" && canvas) {
        if (rel) {
          if (canvas.requestPointerLock) canvas.requestPointerLock();
        } else {
          if (document.exitPointerLock) document.exitPointerLock();
        }
      }
      return true;
    },

    mouse_relative: function(): boolean {
      return typeof document !== "undefined" && document.pointerLockElement === canvas;
    },

    mouse_delta: function(): { x: number; y: number } {
      return { x: inputState.mouseDx || 0, y: inputState.mouseDy || 0 };
    },

    mouse_wheel: function(): number {
      return inputState.mouseWheel || 0.0;
    },

    mouse_in_window: function(): boolean {
      return inputState.mouseInWindow !== undefined ? inputState.mouseInWindow : true;
    },

    set_cursor: function(shape: number): boolean {
      inputState.cursorShape = shape;
      if (canvas && (inputState.cursorVisible !== false)) {
        const cssName = CURSOR_CSS_MAP[shape] || "default";
        canvas.style.cursor = cssName;
      }
      return true;
    },

    set_cursor_visible: function(visible: boolean): boolean {
      inputState.cursorVisible = visible;
      if (canvas) {
        if (!visible) {
          canvas.style.cursor = "none";
        } else {
          const cssName = CURSOR_CSS_MAP[inputState.cursorShape ?? 0] || "default";
          canvas.style.cursor = cssName;
        }
      }
      return true;
    },

    cursor_visible: function(): boolean {
      if (typeof document !== "undefined" && document.pointerLockElement === canvas) {
        return false;
      }
      return inputState.cursorVisible !== false;
    },

    text_input: function(on: boolean) {
      inputState.textInputActive = on;
    },

    delta_time: function(): number {
      return 0.016667;
    },

    time: function(): number {
      return performance.now() / 1000.0;
    },

    events: function(): any[] {
      return [];
    },

    // Frame synchronization: yields execution to requestAnimationFrame
    frame: function(): Promise<boolean> {
      if (!isRunning) return Promise.resolve(false);
      return new Promise((resolve) => {
        requestAnimationFrame(() => {
          // Clear single-frame edge triggers
          inputState.keysPressed.clear();
          inputState.keysReleased.clear();
          inputState.mousePressed = [false, false, false];
          inputState.mouseReleased = [false, false, false];
          if (inputState.mouseDx !== undefined) inputState.mouseDx = 0;
          if (inputState.mouseDy !== undefined) inputState.mouseDy = 0;
          if (inputState.mouseWheel !== undefined) inputState.mouseWheel = 0;

          // Snapshot gamepad state for edge detection in next frame
          if (!inputState.gamepadPrevDown) {
            inputState.gamepadPrevDown = Array.from({ length: 4 }, () => new Array(15).fill(false));
          }
          for (let s = 0; s < 4; s++) {
            for (let b = 0; b < 15; b++) {
              inputState.gamepadPrevDown[s][b] = isGamepadBtnDown(s, b);
            }
          }
          resolve(isRunning);
        });
      });
    },

    // Keyboard queries
    key_down: function(keyName: string): boolean {
      const k = normalizeKey(keyName);
      return inputState.keysDown.has(k);
    },

    key_pressed: function(keyName: string): boolean {
      const k = normalizeKey(keyName);
      return inputState.keysPressed.has(k);
    },

    key_released: function(keyName: string): boolean {
      const k = normalizeKey(keyName);
      return inputState.keysReleased.has(k);
    },

    // Mouse queries
    mouse_pos: function(): { x: number; y: number } {
      return { x: inputState.mouseX, y: inputState.mouseY };
    },

    mouse_down: function(btn: number = 1): boolean {
      const idx = Math.max(0, Math.min(2, (btn || 1) - 1));
      return inputState.mouseDown[idx] || false;
    },

    mouse_pressed: function(btn: number = 1): boolean {
      const idx = Math.max(0, Math.min(2, (btn || 1) - 1));
      return inputState.mousePressed[idx] || false;
    },

    mouse_released: function(btn: number = 1): boolean {
      const idx = Math.max(0, Math.min(2, (btn || 1) - 1));
      return inputState.mouseReleased[idx] || false;
    },

    // Gamepad queries (Goose standard library)
    gamepad_connected: function(slot: number): boolean {
      if (slot < 0 || slot >= 4) return false;
      if (getGamepadSlot(slot) !== null) return true;
      if (slot === 0 && inputState.virtualGamepad) return true;
      return false;
    },

    gamepad_changes: function(): number {
      return inputState.gamepadChanges || 0;
    },

    gamepad_type: function(slot: number): number {
      if (slot < 0 || slot >= 4) return 0;
      return (getGamepadSlot(slot) || (slot === 0 && inputState.virtualGamepad)) ? 1 : 0;
    },

    gamepad_down: function(slot: number, btn: number): boolean {
      return isGamepadBtnDown(slot, btn);
    },

    gamepad_pressed: function(slot: number, btn: number): boolean {
      const current = isGamepadBtnDown(slot, btn);
      const prev = inputState.gamepadPrevDown ? Boolean(inputState.gamepadPrevDown[slot]?.[btn]) : false;
      return current && !prev;
    },

    gamepad_released: function(slot: number, btn: number): boolean {
      const current = isGamepadBtnDown(slot, btn);
      const prev = inputState.gamepadPrevDown ? Boolean(inputState.gamepadPrevDown[slot]?.[btn]) : false;
      return !current && prev;
    },

    gamepad_axis: function(slot: number, axis: number): number {
      if (slot < 0 || slot >= 4) return 0.0;
      const pad = getGamepadSlot(slot);
      if (pad) {
        if (axis >= 0 && axis <= 3 && pad.axes && pad.axes[axis] !== undefined) {
          return pad.axes[axis];
        }
        if (axis === 4 && pad.buttons && pad.buttons[6]) return pad.buttons[6].value;
        if (axis === 5 && pad.buttons && pad.buttons[7]) return pad.buttons[7].value;
      }
      if (slot === 0 && inputState.virtualGamepad) {
        if (axis >= 0 && axis < inputState.virtualGamepad.axes.length) {
          return inputState.virtualGamepad.axes[axis] || 0.0;
        }
      }
      return 0.0;
    },

    gamepad_rumble: function(slot: number, low: number, high: number, ms: number = 200): boolean {
      if (slot < 0 || slot >= 4) return false;
      const pad = getGamepadSlot(slot) as any;
      if (pad && pad.vibrationActuator && pad.vibrationActuator.playEffect) {
        pad.vibrationActuator.playEffect("dual-rumble", {
          startDelay: 0,
          duration: ms || 200,
          weakMagnitude: Math.min(1.0, Math.max(0.0, high)),
          strongMagnitude: Math.min(1.0, Math.max(0.0, low)),
        }).catch(() => {});
        return true;
      }
      if (typeof navigator !== "undefined" && navigator.vibrate && ms > 0) {
        navigator.vibrate(ms);
        return true;
      }
      return false;
    },

    // Buffer creation & updates
    buffer: function(kind: number, size: number, data?: any): GfxBuffer {
      const isIndex = kind === 2; // BUFFER_INDEX
      const target = isIndex ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER;
      const buf = gl.createBuffer()!;
      gl.bindBuffer(target, buf);
      let bytes = data ? bytesOf(data) : null;
      if (bytes && bytes.byteLength > 0) {
        gl.bufferData(target, bytes, gl.DYNAMIC_DRAW);
      } else {
        gl.bufferData(target, size, gl.DYNAMIC_DRAW);
      }
      return {
        id: nextId++,
        buffer: buf,
        isIndex,
        byteLength: Math.max(size, bytes ? bytes.byteLength : 0),
        data: bytes || undefined,
      };
    },

    buffer_size: function(buf: GfxBuffer): number {
      return buf ? buf.byteLength : 0;
    },

    update_buffer: function(buf: GfxBuffer, data: any, offset: number = 0): boolean {
      if (!buf || !buf.buffer) return false;
      const target = buf.isIndex ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER;
      gl.bindBuffer(target, buf.buffer);
      const bytes = bytesOf(data);
      gl.bufferSubData(target, offset, bytes);
      return true;
    },

    release: function(res: any) {
      if (!res) return;
      if (res.buffer && gl.isBuffer(res.buffer)) {
        gl.deleteBuffer(res.buffer);
      } else if (res.texture && gl.isTexture(res.texture)) {
        gl.deleteTexture(res.texture);
      } else if (res.program && gl.isProgram(res.program)) {
        gl.deleteProgram(res.program);
      }
    },

    vertex_buffer: function(data: any): GfxBuffer {
      const buf = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      const bytes = bytesOf(data);
      gl.bufferData(gl.ARRAY_BUFFER, bytes, gl.STATIC_DRAW);
      return {
        id: nextId++,
        buffer: buf,
        isIndex: false,
        byteLength: bytes.byteLength,
        data: bytes,
      };
    },

    index_buffer: function(data: any): GfxBuffer {
      const buf = gl.createBuffer()!;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf);
      let bytes: Uint8Array;
      if (data instanceof Uint16Array) {
        bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      } else if (Array.isArray(data)) {
        const u16 = new Uint16Array(data);
        bytes = new Uint8Array(u16.buffer);
      } else {
        bytes = bytesOf(data);
      }
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, bytes, gl.STATIC_DRAW);
      return {
        id: nextId++,
        buffer: buf,
        isIndex: true,
        byteLength: bytes.byteLength,
        data: bytes,
      };
    },

    // Texture creation & updates
    texture2d: function(w: number, h: number, format: number = 0) {
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return {
        id: nextId++,
        texture: tex,
        w,
        h,
      };
    },

    update_texture: function(tex: any, pixels: any, x: number = 0, y: number = 0, w?: number, h?: number): boolean {
      if (!tex || !tex.texture) return false;
      gl.bindTexture(gl.TEXTURE_2D, tex.texture);
      const bytes = bytesOf(pixels);
      const width = w || tex.w;
      const height = h || tex.h;
      gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
      return true;
    },

    sampler: function(filter: number = 0, wrap: number = 0) {
      return {
        id: nextId++,
        filter,
        wrap,
      };
    },

    bind_texture: function(stage: number, slot: number, tex: any, smp?: any) {
      if (!tex || !tex.texture) return;
      gl.activeTexture(gl.TEXTURE0 + slot);
      gl.bindTexture(gl.TEXTURE_2D, tex.texture);
      if (smp) {
        const glFilter = smp.filter === 1 ? gl.LINEAR : gl.NEAREST;
        const glWrap = smp.wrap === 1 ? gl.REPEAT : gl.CLAMP_TO_EDGE;
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, glFilter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, glFilter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, glWrap);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, glWrap);
      }
    },

    viewport: function(x: number, y: number, w: number, h: number) {
      gl.viewport(x, y, w, h);
    },

    // Pipeline creation
    pipeline: function(vs: WebGLShader, fs: WebGLShader, desc: any = {}): GfxPipeline {
      const prog = gl.createProgram()!;
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);

      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        const err = gl.getProgramInfoLog(prog) || "Pipeline link error";
        lastError = err;
        console.warn("GFX pipeline link error:", err);
      }

      // Discover attribute locations
      const attribLocations = new Map<string, number>();
      const aPos = gl.getAttribLocation(prog, "a_pos") !== -1 ? gl.getAttribLocation(prog, "a_pos") : gl.getAttribLocation(prog, "position");
      const aNormal = gl.getAttribLocation(prog, "a_normal") !== -1 ? gl.getAttribLocation(prog, "a_normal") : gl.getAttribLocation(prog, "normal");
      const aColor = gl.getAttribLocation(prog, "a_color") !== -1 ? gl.getAttribLocation(prog, "a_color") : gl.getAttribLocation(prog, "color");

      if (aPos !== -1) attribLocations.set("pos", aPos);
      if (aNormal !== -1) attribLocations.set("normal", aNormal);
      if (aColor !== -1) attribLocations.set("color", aColor);

      // Compute stride: pos(12) + normal(12) + color(4) = 28 bytes aligned to 4 bytes = 28
      let stride = 12;
      if (aNormal !== -1) stride += 12;
      if (aColor !== -1) stride += 4;
      stride = (stride + 3) & ~3;

      const uniformLocations = new Map<string, WebGLUniformLocation>();
      const numUniforms = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS) || 0;
      for (let i = 0; i < numUniforms; i++) {
        const info = gl.getActiveUniform(prog, i);
        if (info) {
          const loc = gl.getUniformLocation(prog, info.name);
          if (loc) {
            uniformLocations.set(info.name, loc);
            // Also store stripped version: e.g. "model" for "Transform.model"
            const simpleName = info.name.replace(/^.*[._]/, "");
            uniformLocations.set(simpleName, loc);
          }
        }
      }

      return {
        id: nextId++,
        program: prog,
        vs,
        fs,
        desc: desc || {},
        stride,
        attribLocations,
        uniformLocations,
      };
    },

    // Rendering passes
    begin_screen: function(clearColor: any) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      let r = 0.1, g = 0.12, b = 0.16, a = 1.0;
      if (clearColor) {
        if (Array.isArray(clearColor)) {
          r = clearColor[0] ?? 0.1;
          g = clearColor[1] ?? 0.12;
          b = clearColor[2] ?? 0.16;
          a = clearColor[3] ?? 1.0;
        } else if (typeof clearColor === "object") {
          r = clearColor.x ?? clearColor.r ?? 0.1;
          g = clearColor.y ?? clearColor.g ?? 0.12;
          b = clearColor.z ?? clearColor.b ?? 0.16;
          a = clearColor.w ?? clearColor.a ?? 1.0;
        }
      }
      gl.clearColor(r, g, b, a);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    },

    bind: function(pipe: GfxPipeline) {
      if (!pipe || !pipe.program) return;
      currentPipeline = pipe;
      gl.useProgram(pipe.program);

      // Apply pipeline states
      if (pipe.desc.depth_test) {
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
      } else {
        gl.disable(gl.DEPTH_TEST);
      }

      if (pipe.desc.depth_write !== false) {
        gl.depthMask(true);
      } else {
        gl.depthMask(false);
      }

      if (pipe.desc.cull === gfx.CULL_BACK) {
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.BACK);
      } else if (pipe.desc.cull === gfx.CULL_FRONT) {
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.FRONT);
      } else {
        gl.disable(gl.CULL_FACE);
      }
    },

    bind_vertex_buffer: function(buf: GfxBuffer) {
      if (!buf || !buf.buffer) return;
      currentVbo = buf;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf.buffer);

      if (currentPipeline) {
        const stride = currentPipeline.stride || 28;
        const aPos = currentPipeline.attribLocations.get("pos");
        const aNormal = currentPipeline.attribLocations.get("normal");
        const aColor = currentPipeline.attribLocations.get("color");

        let offset = 0;
        if (aPos !== undefined && aPos !== -1) {
          gl.enableVertexAttribArray(aPos);
          gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, stride, offset);
          offset += 12;
        }
        if (aNormal !== undefined && aNormal !== -1) {
          gl.enableVertexAttribArray(aNormal);
          gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, stride, offset);
          offset += 12;
        }
        if (aColor !== undefined && aColor !== -1) {
          gl.enableVertexAttribArray(aColor);
          gl.vertexAttribPointer(aColor, 4, gl.UNSIGNED_BYTE, true, stride, offset);
          offset += 4;
        }
      }
    },

    bind_index_buffer: function(buf: GfxBuffer, strideBytes: number = 2) {
      if (!buf || !buf.buffer) return;
      currentIbo = buf;
      indexStride = strideBytes;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf.buffer);
    },

    uniforms: function(stage: number, slot: number, data: any) {
      if (!currentPipeline || !data) return;
      const prog = currentPipeline.program;

      // Handle Transform struct { model, view_proj } or generic struct
      if (typeof data === "object" && data !== null) {
        for (const key of Object.keys(data)) {
          const val = data[key];
          let loc = currentPipeline.uniformLocations.get(key) || gl.getUniformLocation(prog, key);
          if (!loc) {
            loc = gl.getUniformLocation(prog, `u_${key}`);
          }
          if (loc) {
            if (val instanceof Float32Array && val.length === 16) {
              gl.uniformMatrix4fv(loc, false, val);
            } else if (Array.isArray(val) && val.length === 16) {
              gl.uniformMatrix4fv(loc, false, new Float32Array(val));
            } else if (typeof val === "number") {
              gl.uniform1f(loc, val);
            } else if (typeof val === "object" && val !== null) {
              if ("x" in val && "y" in val && "z" in val && "w" in val) {
                gl.uniform4f(loc, val.x, val.y, val.z, val.w);
              } else if ("x" in val && "y" in val && "z" in val) {
                gl.uniform3f(loc, val.x, val.y, val.z);
              } else if ("x" in val && "y" in val) {
                gl.uniform2f(loc, val.x, val.y);
              }
            }
          }
        }
      }
    },

    draw: function(count: number) {
      gl.drawArrays(gl.TRIANGLES, 0, count);
    },

    draw_indexed: function(count: number) {
      const type = indexStride === 4 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
      gl.drawElements(gl.TRIANGLES, count, type, 0);
    },

    end_pass: function() {
      gl.flush();
    },

    screenshot: function(filename: string): boolean {
      return true;
    },

    read_pixels: function(target: number): Uint8Array {
      const px = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return px;
    },

    // 3D Math matrix utilities directly accessible via gfx::
    rotate: mat4Rotate,
    look_at: mat4LookAt,
    perspective: mat4Perspective,
    mul: mat4Mul,
    identity: mat4Identity,
  };

  return {
    gfx,
    embedShader,
    bytesOf,
    stop: () => {
      isRunning = false;
    },
  };
}

export function normalizeKey(name: string): string {
  const n = name.trim().toLowerCase();
  switch (n) {
    case "left": case "arrowleft": return "left";
    case "right": case "arrowright": return "right";
    case "up": case "arrowup": return "up";
    case "down": case "arrowdown": return "down";
    case "space": case " ": return "space";
    case "escape": case "esc": return "escape";
    case "enter": case "return": return "enter";
    default: return n;
  }
}

