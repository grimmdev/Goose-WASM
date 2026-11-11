/**
 * Lightweight Goose Runtime Executor & Interactive Game Engine
 *
 * Runs Goose algorithmic scripts and live interactive 60 FPS real-time games
 * in a client-side JavaScript sandbox. Goose code is 100% responsible for its
 * own state, game logic, physics, and uniforms.
 */

import { createGfxRuntime, GfxInputState, normalizeKey } from "./gooseGfx";

export interface ExecutionResult {
  success: boolean;
  logs: string[];
  error?: string;
}

export interface RuntimeInputs {
  dt: number;
  time: number;
  dpad: [number, number];
  buttons: [number, number, number, number];
  sliders: [number, number, number, number];
  touch: [number, number, number, number];
}

export interface GooseRuntimeOptions {
  canvas?: HTMLCanvasElement | null;
  gl?: WebGLRenderingContext | null;
  inputState?: GfxInputState | null;
}

export interface GooseGameRuntime {
  success: boolean;
  error?: string;
  hasGameLoop: boolean;
  reset: () => void;
  dispose?: () => void;
  step: (dt: number, inputs: RuntimeInputs) => void;
  tap: () => void;
  dpad: (dx: number, dy: number) => void;
  button: (index: number) => void;
  slider: (index: number, val: number) => void;
  getVariables: () => Record<string, any>;
  getUniforms: () => {
    playerPos: [number, number];
    action: number;
    score: number;
    pipe1: [number, number, number];
    pipe2: [number, number, number];
  };
  getLogs: () => string[];
}

/**
 * Transpiles Goose source code into executable JavaScript
 */
export function transpileGoose(source: string): string {
  let js = source;

  // Strip comments
  js = js.replace(/\/\*[\s\S]*?\*\//g, "");
  js = js.replace(/\/\/.*$/gm, "");

  // Strip imports and exports:
  js = js.replace(/import\s+[a-zA-Z0-9_]+;/g, "");
  js = js.replace(/\bexport\s+"[^"]*"\s*fn\b/g, "fn");

  // Multiline strings ("""...""") -> JS string literal with escaped characters
  js = js.replace(/"""([\s\S]*?)"""/g, (_m, content) => {
    const escaped = content
      .replace(/\\/g, "\\\\")
      .replace(/`/g, "\\`")
      .replace(/\$\{/g, "\\${");
    return "`" + escaped + "`";
  });

  // enums: enum Area { Courtyard, FortressGate, AncientDungeon, Sanctum }
  js = js.replace(/enum\s+([a-zA-Z0-9_]+)\s*\{([^}]*)\}/g, (_m, name, body) => {
    const items = body
      .split(",")
      .map((item: string) => item.trim())
      .filter((item: string) => item.length > 0);
    const entries = items.map((item: string, idx: number) => `"${item}": ${idx}`).join(", ");
    return `const ${name} = Object.freeze({ ${entries} });`;
  });

  // Strip return types on functions (single or multiple e.g. -> f32, i64 {):
  js = js.replace(/->\s*[^;{\n]+\s*\{/g, "{");

  // Tuple destructuring: let a, b = fn(...) -> let [a, b] = fn(...)
  js = js.replace(/\blet\s+([a-zA-Z0-9_]+)\s*,\s*([a-zA-Z0-9_]+)\s*=/g, "let [$1, $2] =");

  // Multiple return: return a, b; -> return [a, b];
  js = js.replace(/\breturn\s+([^;,\n]+)\s*,\s*([^;,\n]+)\s*;/g, "return [$1, $2];");

  // Positional vector constructors (supports arbitrary nesting e.g. float2 { length(float2 { ... }) }):
  function replaceVectorConstructors(str: string): string {
    const re = /\b(float[234])\s*\{/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(str)) !== null) {
      const startIndex = match.index;
      const name = match[1];
      const braceStart = startIndex + match[0].length - 1;
      let depth = 1;
      let i = braceStart + 1;
      while (i < str.length && depth > 0) {
        if (str[i] === "{") depth++;
        else if (str[i] === "}") depth--;
        i++;
      }
      if (depth === 0) {
        const inner = str.slice(braceStart + 1, i - 1);
        const transformedInner = replaceVectorConstructors(inner);
        const replacement = `${name}(${transformedInner})`;
        str = str.slice(0, startIndex) + replacement + str.slice(i);
        re.lastIndex = startIndex + replacement.length;
      }
    }
    return str;
  }
  js = replaceVectorConstructors(js);

  // Struct definitions: struct Bird { ... } -> constructor function
  js = js.replace(/struct\s+([a-zA-Z0-9_]+)\s*\{([^}]*)\}/g, (_m, name) => {
    return `function ${name}(obj) { return Object.assign({}, obj); }`;
  });

  // Struct instantiation: StructName { field: val } -> { field: val }
  js = js.replace(/\b(?:[a-zA-Z0-9_]+::)?[A-Z][a-zA-Z0-9_]*\s*\{(?=\s*[a-zA-Z0-9_]+\s*:)/g, "{");

  // Strip array type annotations in variables / function params:
  // e.g. Tile[8][8]& or Pipe[2]& or Pipe[2] =
  js = js.replace(/:\s*[a-zA-Z0-9_]+(?:\[[^\]]*\])+(?:&)?/g, "");

  // for loops:
  // for i in 0..count { -> for (let i = 0; i < count; i++) {
  js = js.replace(
    /for\s+([a-zA-Z0-9_]+)\s+in\s+([^.\n]+)\.\.([^{\n]+)\s*\{/g,
    "for (let $1 = $2; $1 < $3; $1++) {"
  );
  // Strip import statements e.g. import std; import gfx; import audio;
  js = js.replace(/\bimport\s+[^;]+;/g, "");

  // loop { -> while (true) {
  js = js.replace(/\bloop\s*\{/g, "while (true) {");

  // for i in count { -> for (let i = 0; i < count; i++) {
  js = js.replace(
    /for\s+([a-zA-Z0-9_]+)\s+in\s+([0-9]+|[a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*)\s*\{/g,
    "for (let $1 = 0; $1 < $2; $1++) {"
  );

  // Array repetition: [val; count] -> new Array(count).fill(val)
  js = js.replace(/\[\s*([^;]+?)\s*;\s*([0-9]+)\s*\]/g, "new Array($2).fill($1)");

  // Struct instantiation: StructName { field: val, .. } -> { field: val }
  js = js.replace(/,\s*\.\.\s*\}/g, " }");
  js = js.replace(/\b(?:[a-zA-Z0-9_]+::)?[A-Z][a-zA-Z0-9_]*\s*\{/g, "{");

  // Ternary / if-expressions without semicolons:
  // if cond { a } else { b } -> ((cond) ? (a) : (b))
  js = js.replace(/\bif\s+([^{;]+?)\s*\{\s*([^;{}]+?)\s*\}\s*else\s*\{\s*([^;{}]+?)\s*\}/g, "(($1) ? ($2) : ($3))");

  // If / while / else if blocks without parentheses:
  js = js.replace(/\bif\s+(?!\()([^{]+?)\s*\{/g, "if ($1) {");
  js = js.replace(/\bwhile\s+(?!\()([^{]+?)\s*\{/g, "while ($1) {");
  js = js.replace(/\belse\s+if\s+(?!\()([^{]+?)\s*\{/g, "else if ($1) {");

  // Type annotations on variable declarations:
  // let x: f32 = 0.5; -> let x = 0.5;
  js = js.replace(/\b(let|var)\s+([a-zA-Z0-9_]+)\s*:\s*[^=;]+/g, "$1 $2");

  // Function definitions:
  // fn foo(p1: Type, p2: Type) -> RetType { -> function foo(p1, p2) {
  const fnNames: string[] = [];
  js = js.replace(/\bfn\s+([a-zA-Z0-9_]+)(?:<[^>]+>)?\s*\(([^)]*)\)(?:\s*->\s*[^{]+)?\s*\{/g, (_m, name, params) => {
    fnNames.push(name);
    const cleanParams = params
      .split(",")
      .map((p: string) => p.replace(/:\s*[^,)]+/g, "").trim())
      .join(", ");
    return `function ${name}(${cleanParams}) {`;
  });

  // UFCS (obj.fn(args) -> fn(obj, args))
  for (const name of fnNames) {
    if (name === "main" || name === "update" || name === "tick" || name === "get_uniforms") continue;
    const ufcsRegex = new RegExp(`([a-zA-Z0-9_]+)\\.${name}\\(([^)]*)\\)`, "g");
    js = js.replace(ufcsRegex, (_m, obj, args) => {
      const rest = args.trim().length > 0 ? `, ${args}` : "";
      return `${name}(${obj}${rest})`;
    });
  }

  // Strip type casts: (y as f32) -> y
  js = js.replace(/\bas\s+(?:f32|i64|u8|f64|i32|usize)\b/g, "");

  // Avoid redeclaring built-in runtime inputs if defined in Goose code:
  js = js.replace(/\b(let|var)\s+(dpad_x|dpad_y|dt|time|button_0|button_1|button_2|button_3|slider_0|slider_1|slider_2|slider_3|touch_x|touch_y|is_touching)\b\s*:[^=;]+/g, "$2");
  js = js.replace(/\b(let|var)\s+(dpad_x|dpad_y|dt|time|button_0|button_1|button_2|button_3|slider_0|slider_1|slider_2|slider_3|touch_x|touch_y|is_touching)\b\s*=/g, "$2 =");

  // var -> let
  js = js.replace(/\bvar\b/g, "let");

  // Array methods & properties: .clear() -> .length = 0, .len -> .length
  js = js.replace(/\.clear\(\)/g, ".length = 0");
  js = js.replace(/\.len\b/g, ".length");

  // Module access mappings:
  js = js.replace(/\bgfx::([a-zA-Z0-9_]+)/g, "gfx.$1");
  js = js.replace(/\baudio::([a-zA-Z0-9_]+)/g, "audio.$1");
  js = js.replace(/\bbinary::([a-zA-Z0-9_]+)/g, "binary.$1");
  js = js.replace(/\bos::([a-zA-Z0-9_]+)/g, "os.$1");
  js = js.replace(/\bmath::([a-zA-Z0-9_]+)/g, "Math.$1");

  // guard cond else { block } -> if (!(cond)) { block }
  js = js.replace(/\bguard\s+([^{;]+?)\s*else\s*\{/g, "if (!($1)) {");

  // defer stmt; -> remove for client runtime
  js = js.replace(/\bdefer\s+[^;]+;/g, "");

  // Dynamic array append:
  js = js.replace(/\.append\(\[([^\]]+)\]\)/g, ".push($1)");
  js = js.replace(/\.append\(([^)]+)\)/g, ".push(...($1))");

  // Array indexing with division: axes[f / 2] -> axes[Math.floor(f / 2)]
  js = js.replace(/\[\s*([a-zA-Z0-9_]+)\s*\/\s*([0-9]+|[a-zA-Z0-9_]+)\s*\]/g, "[Math.floor($1 / $2)]");

  // Vector multiplication and addition helpers:
  js = js.replace(/([a-zA-Z0-9_]+(?:\[[^\]]+\])?)\s*\*\s*(float[234]\([^)]+\))/g, "v_mul($1, $2)");
  js = js.replace(/(float[234]\([^)]+\))\s*\*\s*([a-zA-Z0-9_]+(?:\[[^\]]+\])?)/g, "v_mul($1, $2)");

  // while gfx.frame() -> while (await gfx.frame())
  const hasGfxFrame = /gfx\.frame\(\)/.test(js);
  js = js.replace(/\bwhile\s*\(?\s*gfx\.frame\(\)\s*\)?/g, "while (await gfx.frame())");

  if (hasGfxFrame) {
    js = js.replace(/\bfunction\s+main\s*\(/g, "async function main(");
  }

  // String interpolation: "{d.name}" -> `${d.name}`
  js = js.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (match, content) => {
    if (content.includes("{") && content.includes("}")) {
      const template = content.replace(/\{([^{}]+)\}/g, "${$1}");
      return `\`${template}\``;
    }
    return match;
  });

  return js;
}

/**
 * Executes a Goose script once to completion, capturing print() outputs.
 */
export function executeGoose(source: string): ExecutionResult {
  const logs: string[] = [];
  const maxLogs = 500;

  function print(...args: any[]) {
    if (logs.length >= maxLogs) return;
    const formatted = args
      .map((arg) => {
        if (Array.isArray(arg)) {
          return arg.join("");
        }
        if (typeof arg === "object" && arg !== null) {
          return JSON.stringify(arg);
        }
        return String(arg);
      })
      .join(" ");
    logs.push(formatted);
  }

  try {
    const js = transpileGoose(source);
    const fullScript = `
      const min = Math.min, max = Math.max, abs = Math.abs, sin = Math.sin, cos = Math.cos;
      const sqrt = Math.sqrt, floor = Math.floor, ceil = Math.ceil, round = Math.round, pow = Math.pow;
      const random = Math.random;

      const float2 = (x, y) => ({ x: x || 0, y: y !== undefined ? y : (x || 0) });
      const float3 = (x, y, z) => ({ x: x || 0, y: y || 0, z: z || 0 });
      const float4 = (x, y, z, w) => ({ x: x || 0, y: y || 0, z: z || 0, w: w || 0 });
      const float3_0 = float3(0, 0, 0);
      const length = (v) => Math.sqrt((v.x || 0) * (v.x || 0) + (v.y || 0) * (v.y || 0) + (v.z || 0) * (v.z || 0));
      const dot = (a, b) => (a.x || 0) * (b.x || 0) + (a.y || 0) * (b.y || 0) + (a.z || 0) * (b.z || 0);
      const normalize = (v) => { const l = length(v) || 1; return { x: (v.x || 0) / l, y: (v.y || 0) / l, z: (v.z || 0) / l }; };
      const clamp = (v, minV, maxV) => Math.max(minV, Math.min(maxV, v));
      const str = (...args) => args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join("");
      const abort = (msg) => { throw new Error(String(msg)); };
      const assert = (cond, msg) => { if (!cond) abort(msg || "assertion failed"); };
      const args = () => [];
      const write_stderr = (t) => print("[stderr]", t);

      ${js}

      if (typeof main === 'function') {
        main();
      }
    `;

    const fn = new Function("print", fullScript);
    fn(print);
    return { success: true, logs };
  } catch (err: any) {
    return {
      success: false,
      logs,
      error: err.message || String(err),
    };
  }
}

/**
 * Scans Goose source code and extracts all declared variable and constant names
 */
export function extractDeclaredVariableNames(source: string): string[] {
  const clean = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/"""[\s\S]*?"""/g, '""');

  const names = new Set<string>();
  const regex = /\b(?:let|var|const)\s+([a-zA-Z0-9_]+)\b/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(clean)) !== null) {
    const name = match[1];
    if (name !== "main" && name !== "init" && name !== "update" && name !== "tick") {
      names.add(name);
    }
  }
  return Array.from(names);
}

let sharedAudioCtx: any = null;
const activeSounds = new Map<number, any>();
const activeVoices = new Map<number, { source: any; gain: any; panner?: any }>();
let nextSoundId = 1;
let nextVoiceId = 1;

export function getAudioRuntime() {
  function getContext() {
    if (!sharedAudioCtx && typeof window !== "undefined") {
      const AudioCtxClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        sharedAudioCtx = new AudioCtxClass();
      }
    }
    return sharedAudioCtx;
  }

  return {
    available: () => typeof window !== "undefined" && Boolean((window as any).AudioContext || (window as any).webkitAudioContext),
    open: (sampleRate: number = 48000) => {
      const ctx = getContext();
      if (ctx && ctx.state === "suspended") {
        ctx.resume();
      }
      return Boolean(ctx);
    },
    open_offline: (_sampleRate: number = 48000) => true,
    close: () => {
      for (const v of activeVoices.values()) {
        try { v.source.stop(); } catch {}
      }
      activeVoices.clear();
    },
    error: () => "",
    create_sound: (samples: any, sampleRate: number = 48000, channels: number = 1) => {
      const ctx = getContext();
      if (!ctx) return { id: 0 };
      const len = Math.floor((samples.length || 0) / channels);
      const buffer = ctx.createBuffer(channels, Math.max(1, len), sampleRate || 48000);
      if (channels === 1) {
        const f32 = samples instanceof Float32Array ? samples : new Float32Array(samples);
        buffer.copyToChannel(f32, 0);
      } else {
        const left = new Float32Array(len);
        const right = new Float32Array(len);
        for (let i = 0; i < len; i++) {
          left[i] = samples[i * 2] ?? 0;
          right[i] = samples[i * 2 + 1] ?? 0;
        }
        buffer.copyToChannel(left, 0);
        buffer.copyToChannel(right, 1);
      }
      const id = nextSoundId++;
      activeSounds.set(id, buffer);
      return { id };
    },
    play: (sound: { id: number }, volume: number = 1.0, pan: number = 0.0, pitch: number = 1.0, looping: boolean = false) => {
      const ctx = getContext();
      if (!ctx || !sound || !activeSounds.has(sound.id)) return { id: 0 };
      const buffer = activeSounds.get(sound.id);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = Boolean(looping);
      source.playbackRate.value = pitch;

      const gain = ctx.createGain();
      gain.gain.value = volume;

      let panner: any;
      if (ctx.createStereoPanner) {
        panner = ctx.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, pan));
        source.connect(panner);
        panner.connect(gain);
      } else {
        source.connect(gain);
      }
      gain.connect(ctx.destination);

      const voiceId = nextVoiceId++;
      activeVoices.set(voiceId, { source, gain, panner });
      source.onended = () => {
        activeVoices.delete(voiceId);
      };
      source.start(0);
      return { id: voiceId };
    },
    playing: (voice: { id: number }) => {
      return Boolean(voice && activeVoices.has(voice.id));
    },
    stop: (voice: { id: number }) => {
      if (voice && activeVoices.has(voice.id)) {
        try { activeVoices.get(voice.id)!.source.stop(); } catch {}
        activeVoices.delete(voice.id);
      }
    },
    stop_all: () => {
      for (const v of activeVoices.values()) {
        try { v.source.stop(); } catch {}
      }
      activeVoices.clear();
    },
    release_sound: (sound: { id: number }) => {
      if (sound) activeSounds.delete(sound.id);
      return true;
    },
  };
}

const defaultGfxStub = {
  open: () => true,
  open_headless: () => true,
  close: () => {},
  screen_size: () => ({ x: 640, y: 480 }),
  screen: () => ({ id: 0, w: 640, h: 480 }),
  driver: () => "webgl",
  error: () => "",
  frame: () => Promise.resolve(false),
  focused: () => true,
  key_down: () => false,
  key_pressed: () => false,
  key_released: () => false,
  mouse_pos: () => ({ x: 0, y: 0 }),
  mouse_down: () => false,
  mouse_pressed: () => false,
  mouse_released: () => false,
  mouse_delta: () => ({ x: 0, y: 0 }),
  mouse_relative: () => false,
  set_mouse_relative: () => true,
  delta_time: () => 0.016,
  time: () => 0.0,
  events: () => [],
  vertex_buffer: () => ({ id: 0, buffer: null, isIndex: false, byteLength: 0 }),
  index_buffer: () => ({ id: 0, buffer: null, isIndex: true, byteLength: 0 }),
  buffer: () => ({ id: 0, buffer: null, isIndex: false, byteLength: 0 }),
  buffer_size: () => 0,
  update_buffer: () => true,
  release: () => {},
  texture2d: (w: number, h: number) => ({ id: 0, texture: null, w, h }),
  update_texture: () => true,
  sampler: () => ({ id: 0 }),
  bind_texture: () => {},
  pipeline: () => ({ id: 0, program: null }),
  begin_screen: () => {},
  viewport: () => {},
  bind: () => {},
  bind_vertex_buffer: () => {},
  bind_index_buffer: () => {},
  uniforms: () => {},
  draw: () => {},
  draw_indexed: () => {},
  end_pass: () => {},
  screenshot: () => true,
  read_pixels: () => new Uint8Array(0),
  rotate: () => new Float32Array(16),
  look_at: () => new Float32Array(16),
  perspective: () => new Float32Array(16),
  mul: () => new Float32Array(16),
  identity: () => new Float32Array(16),
  VERTEX: 0,
  FRAGMENT: 1,
  COMPUTE: 2,
  CULL_NONE: 0,
  CULL_BACK: 1,
  CULL_FRONT: 2,
  WINDOW_RESIZABLE: 1,
  VERTEX_FLOAT: 0,
  VERTEX_FLOAT2: 1,
  VERTEX_FLOAT3: 2,
  VERTEX_FLOAT4: 3,
  VERTEX_UBYTE4_NORM: 4,
  NEAREST: 0,
  LINEAR: 1,
  CLAMP: 0,
  REPEAT: 1,
  BLEND_NONE: 0,
  BLEND_ALPHA: 1,
  BLEND_ADD: 2,
  MOUSE_LEFT: 1,
  MOUSE_MIDDLE: 2,
  MOUSE_RIGHT: 3,
  PipelineDesc: (o: any) => o || {},
};

export function createGfxStub(inputState?: GfxInputState) {
  return {
    ...defaultGfxStub,
    key_down: (keyName: string) => {
      if (!inputState) return false;
      const k = normalizeKey(keyName);
      return inputState.keysDown.has(k);
    },
    key_pressed: (keyName: string) => {
      if (!inputState) return false;
      const k = normalizeKey(keyName);
      return inputState.keysPressed.has(k);
    },
    key_released: (keyName: string) => {
      if (!inputState) return false;
      const k = normalizeKey(keyName);
      return inputState.keysReleased.has(k);
    },
    mouse_pos: () => ({ x: inputState?.mouseX || 0, y: inputState?.mouseY || 0 }),
    mouse_down: (btn: number = 1) => {
      if (!inputState) return false;
      const idx = Math.max(0, Math.min(2, (btn || 1) - 1));
      return Boolean(inputState.mouseDown[idx]);
    },
    mouse_pressed: (btn: number = 1) => {
      if (!inputState) return false;
      const idx = Math.max(0, Math.min(2, (btn || 1) - 1));
      return Boolean(inputState.mousePressed[idx]);
    },
    mouse_released: (btn: number = 1) => {
      if (!inputState) return false;
      const idx = Math.max(0, Math.min(2, (btn || 1) - 1));
      return Boolean(inputState.mouseReleased[idx]);
    },
  };
}

/**
 * Creates an interactive Goose Game Runtime that executes user Goose code generically.
 * The Goose code is 100% responsible for its own logic, variables, and uniforms.
 */
export function createGooseGameRuntime(
  source: string,
  options?: GooseRuntimeOptions
): GooseGameRuntime {
  const logs: string[] = [];
  const maxLogs = 500;

  function print(...args: any[]) {
    if (logs.length >= maxLogs) return;
    const formatted = args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
    logs.push(formatted);
  }

  let js: string;
  try {
    js = transpileGoose(source);
  } catch (err: any) {
    return {
      success: false,
      error: err.message || String(err),
      hasGameLoop: false,
      reset: () => {},
      dispose: () => {},
      step: () => {},
      tap: () => {},
      dpad: () => {},
      button: () => {},
      slider: () => {},
      getVariables: () => ({}),
      getUniforms: () => ({ playerPos: [0.5, 0.5], action: 1.0, score: 0, pipe1: [0, 0, 0], pipe2: [0, 0, 0] }),
      getLogs: () => logs,
    };
  }

  const declaredNames = extractDeclaredVariableNames(source);

  const inputState = options?.inputState || {
    keysDown: new Set<string>(),
    keysPressed: new Set<string>(),
    keysReleased: new Set<string>(),
    mouseX: 0,
    mouseY: 0,
    mouseDx: 0,
    mouseDy: 0,
    mouseWheel: 0,
    mouseInWindow: true,
    mouseDown: [false, false, false],
    mousePressed: [false, false, false],
    mouseReleased: [false, false, false],
    cursorVisible: true,
    cursorShape: 0,
    textInputActive: false,
    gamepadChanges: 0,
    gamepadPrevDown: Array.from({ length: 4 }, () => new Array(15).fill(false)),
    virtualGamepad: {
      buttons: new Array(15).fill(false),
      axes: [0, 0, 0, 0, 0, 0],
    },
  };

  let gfxHandle: ReturnType<typeof createGfxRuntime> | null = null;
  if (options?.canvas && options?.gl) {
    gfxHandle = createGfxRuntime(options.canvas, options.gl, inputState);
  }

  const runnerCode = `
    const min = Math.min, max = Math.max, abs = Math.abs, sin = Math.sin, cos = Math.cos;
    const sqrt = Math.sqrt, floor = Math.floor, ceil = Math.ceil, round = Math.round, pow = Math.pow;
    const random = Math.random;

    const float2 = (x, y) => ({ x: x || 0, y: y !== undefined ? y : (x || 0) });
    const float3 = (x, y, z) => ({
      x: x || 0, y: y || 0, z: z || 0,
      add(o) { return float3(this.x + (o.x||0), this.y + (o.y||0), this.z + (o.z||0)); },
      sub(o) { return float3(this.x - (o.x||0), this.y - (o.y||0), this.z - (o.z||0)); },
      mul(o) {
        if (typeof o === 'number') return float3(this.x * o, this.y * o, this.z * o);
        return float3(this.x * (o.x||0), this.y * (o.y||0), this.z * (o.z||0));
      }
    });
    const float4 = (x, y, z, w) => ({ x: x || 0, y: y || 0, z: z || 0, w: w || 0 });
    const float3_0 = float3(0, 0, 0);

    const v_add = (a, b) => {
      if (typeof a === 'number') return float3(a + (b.x||0), a + (b.y||0), a + (b.z||0));
      if (typeof b === 'number') return float3((a.x||0) + b, (a.y||0) + b, (a.z||0) + b);
      return float3((a.x||0) + (b.x||0), (a.y||0) + (b.y||0), (a.z||0) + (b.z||0));
    };
    const v_sub = (a, b) => {
      if (typeof a === 'number') return float3(a - (b.x||0), a - (b.y||0), a - (b.z||0));
      if (typeof b === 'number') return float3((a.x||0) - b, (a.y||0) - b, (a.z||0) - b);
      return float3((a.x||0) - (b.x||0), (a.y||0) - (b.y||0), (a.z||0) - (b.z||0));
    };
    const v_mul = (a, b) => {
      if (typeof a === 'number') return float3(a * (b.x||0), a * (b.y||0), a * (b.z||0));
      if (typeof b === 'number') return float3((a.x||0) * b, (a.y||0) * b, (a.z||0) * b);
      return float3((a.x||0) * (b.x||0), (a.y||0) * (b.y||0), (a.z||0) * (b.z||0));
    };

    const cross = (a, b) => float3(
      (a.y||0) * (b.z||0) - (a.z||0) * (b.y||0),
      (a.z||0) * (b.x||0) - (a.x||0) * (b.z||0),
      (a.x||0) * (b.y||0) - (a.y||0) * (b.x||0)
    );

    const dot = (a, b) => (a.x || 0) * (b.x || 0) + (a.y || 0) * (b.y || 0) + (a.z || 0) * (b.z || 0);
    const length = (v) => Math.sqrt((v.x || 0) * (v.x || 0) + (v.y || 0) * (v.y || 0) + (v.z || 0) * (v.z || 0));
    const normalize = (v) => { const l = length(v) || 1; return float3((v.x || 0) / l, (v.y || 0) / l, (v.z || 0) / l); };
    const str = (...args) => args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join("");
    const write_stderr = (t) => print("[stderr]", t);
    const args = () => [];
    const parse_int = (s) => [parseInt(s, 10) || 0, !isNaN(parseInt(s, 10))];

    const clamp = (v, minV, maxV) => Math.max(minV, Math.min(maxV, v));
    const abort = (msg) => { throw new Error("Goose abort: " + String(msg)); };
    const require = (ok, msg) => { if (!ok) abort(msg || "required condition failed"); };
    const read_file = (path, buf) => false;
    const os = { read_file: (path, buf) => false };
    const binary = {
      read_u16le: (data, at) => {
        const arr = data.data ? data.data : data;
        const idx = data.offset !== undefined ? data.offset : at;
        if (idx + 2 > arr.length) return [0, false];
        const val = (arr[idx] & 0xFF) | ((arr[idx + 1] & 0xFF) << 8);
        if (data.offset !== undefined) data.offset += 2;
        return [val, true];
      },
      read_i16le: (data, at) => {
        const arr = data.data ? data.data : data;
        const idx = data.offset !== undefined ? data.offset : at;
        if (idx + 2 > arr.length) return [0, false];
        let val = (arr[idx] & 0xFF) | ((arr[idx + 1] & 0xFF) << 8);
        if (val >= 0x8000) val -= 0x10000;
        if (data.offset !== undefined) data.offset += 2;
        return [val, true];
      },
      read_u32le: (data, at) => {
        const arr = data.data ? data.data : data;
        const idx = data.offset !== undefined ? data.offset : (at || 0);
        if (idx + 4 > arr.length) return [0, false];
        const val = (arr[idx] & 0xFF) | ((arr[idx + 1] & 0xFF) << 8) |
                    ((arr[idx + 2] & 0xFF) << 16) | ((arr[idx + 3] & 0xFF) * 0x1000000);
        if (data.offset !== undefined) data.offset += 4;
        return [val >>> 0, true];
      },
      read_bytes: (reader, len) => {
        if (!reader || reader.offset + len > reader.data.length) return ["", false];
        let s = "";
        for (let i = 0; i < len; i++) {
          s += String.fromCharCode(reader.data[reader.offset + i]);
        }
        reader.offset += len;
        return [s, true];
      },
      read_name: (data, at, len = 8) => {
        const arr = data.data ? data.data : data;
        const offset = data.offset !== undefined ? data.offset : at;
        if (offset + len > arr.length) return [[], false];
        const bytes = [];
        for (let i = 0; i < len; i++) {
          const c = arr[offset + i];
          if (c === 0) break;
          bytes.push(c);
        }
        if (data.offset !== undefined) data.offset += len;
        return [bytes, true];
      },
      reader: (data) => ({ data: data.data || data, offset: 0 }),
      subreader: (reader, len) => {
        const r = reader.data ? reader : { data: reader, offset: 0 };
        if (r.offset + len > r.data.length) return [{ data: [], offset: 0 }, false];
        const sub = { data: r.data.slice(r.offset, r.offset + len), offset: 0 };
        r.offset += len;
        return [sub, true];
      },
      skip: (reader, len) => {
        if (reader) reader.offset += len;
      },
      range_ok: (data, at, len) => {
        const total = data ? (data.length || data.data?.length || 0) : 0;
        return at >= 0 && len >= 0 && at + len <= total;
      },
    };

    // Standard input state accessible by Goose code
    var dt = 0.016;
    var time = 0.0;
    var dpad_x = 0.0, dpad_y = 0.0;
    var button_0 = 0.0, button_1 = 0.0, button_2 = 0.0, button_3 = 0.0;
    var slider_0 = 0.0, slider_1 = 0.0, slider_2 = 0.0, slider_3 = 0.0;
    var touch_x = 0.0, touch_y = 0.0, is_touching = 0.0;

    // --- User Goose Code ---
    ${js}

    // Generic initialization: invoke init() or main() if defined
    function doInit() {
      if (typeof init === 'function') {
        try {
          const res = init();
          if (res && typeof res.catch === 'function') res.catch((e) => print("[init error]", e.message));
        } catch (e) { print("[init error]", e.message); }
      } else if (typeof main === 'function') {
        try {
          const res = main();
          if (res && typeof res.catch === 'function') res.catch((e) => print("[main error]", e.message));
        } catch (e) { print("[main error]", e.message); }
      }
    }

    doInit();

    const hasLoop = typeof update === 'function' || typeof tick === 'function' || typeof gfx !== 'undefined';

    return {
      hasGameLoop: hasLoop,
      reset: function() {
        doInit();
      },
      step: function(inDt, inputs) {
        dt = inDt;
        time += inDt;
        dpad_x = inputs.dpad[0];
        dpad_y = inputs.dpad[1];
        button_0 = inputs.buttons[0];
        button_1 = inputs.buttons[1];
        button_2 = inputs.buttons[2];
        button_3 = inputs.buttons[3];
        slider_0 = inputs.sliders[0];
        slider_1 = inputs.sliders[1];
        touch_x = inputs.touch[0];
        touch_y = inputs.touch[1];
        is_touching = inputs.touch[2];

        // Generic Goose update(dt) or tick(dt)
        if (typeof update === 'function') {
          try { update(inDt); } catch (e) { print("[update error]", e.message); }
        } else if (typeof tick === 'function') {
          try { tick(inDt); } catch (e) { print("[tick error]", e.message); }
        }
      },
      tap: function() {
        if (typeof on_tap === 'function') {
          try { on_tap(); } catch (e) { print("[on_tap error]", e.message); }
        } else if (typeof tap === 'function') {
          try { tap(); } catch (e) { print("[tap error]", e.message); }
        } else if (typeof on_action === 'function') {
          try { on_action(); } catch (e) { print("[on_action error]", e.message); }
        }
      },
      dpad: function(dx, dy) {
        if (typeof on_dpad === 'function') {
          try { on_dpad(dx, dy); } catch (e) { print("[on_dpad error]", e.message); }
        } else if (typeof dpad === 'function') {
          try { dpad(dx, dy); } catch (e) { print("[dpad error]", e.message); }
        } else if (typeof on_move === 'function') {
          try { on_move(dx, dy); } catch (e) { print("[on_move error]", e.message); }
        }
      },
      button: function(idx) {
        if (typeof on_button === 'function') {
          try { on_button(idx); } catch (e) { print("[on_button error]", e.message); }
        } else if (typeof button === 'function') {
          try { button(idx); } catch (e) { print("[button error]", e.message); }
        }
      },
      slider: function(idx, val) {
        if (typeof on_slider === 'function') {
          try { on_slider(idx, val); } catch (e) { print("[on_slider error]", e.message); }
        } else if (typeof slider === 'function') {
          try { slider(idx, val); } catch (e) { print("[slider error]", e.message); }
        }
      },
      getUniforms: function() {
        // Call user-defined get_uniforms()
        if (typeof get_uniforms === 'function') {
          try {
            const u = get_uniforms();
            if (u && typeof u === 'object') {
              let px = 0.5, py = 0.5;
              if (Array.isArray(u.player_pos)) {
                px = u.player_pos[0];
                py = u.player_pos[1];
              } else if (u.player_pos && typeof u.player_pos === 'object') {
                px = u.player_pos.x ?? 0.5;
                py = u.player_pos.y ?? 0.5;
              } else {
                if (u.player_x !== undefined) px = u.player_x;
                if (u.player_y !== undefined) py = u.player_y;
              }

              return {
                playerPos: [px, py],
                action: typeof u.action === 'number' ? u.action : 1.0,
                score: typeof u.score === 'number' ? u.score : 0,
                pipe1: Array.isArray(u.pipe1) ? u.pipe1 : [0, 0, 0],
                pipe2: Array.isArray(u.pipe2) ? u.pipe2 : [0, 0, 0],
              };
            }
          } catch (e) { print("[get_uniforms error]", e.message); }
        }

        // Generic fallback to top-level variables declared in Goose
        let px = dpad_x, py = dpad_y, act = button_0, sc = 0.0;
        let p1 = [0.0, 0.0, 0.0], p2 = [0.0, 0.0, 0.0];

        if (typeof u_player_x !== 'undefined' && typeof u_player_y !== 'undefined') {
          px = Number(u_player_x);
          py = Number(u_player_y);
        } else if (typeof player_x !== 'undefined' && typeof player_y !== 'undefined') {
          px = Number(player_x);
          py = Number(player_y);
        } else if (typeof u_player_pos !== 'undefined') {
          px = Number(u_player_pos.x ?? u_player_pos[0] ?? px);
          py = Number(u_player_pos.y ?? u_player_pos[1] ?? py);
        } else if (typeof player_pos !== 'undefined') {
          px = Number(player_pos.x ?? player_pos[0] ?? px);
          py = Number(player_pos.y ?? player_pos[1] ?? py);
        }

        if (typeof u_action !== 'undefined') act = Number(u_action);
        else if (typeof action !== 'undefined') act = Number(action);

        if (typeof u_score !== 'undefined') sc = Number(u_score);
        else if (typeof score !== 'undefined') sc = Number(score);

        if (typeof u_pipe1 !== 'undefined') {
          p1 = Array.isArray(u_pipe1) ? u_pipe1 : [u_pipe1.x || 0, u_pipe1.y || 0, u_pipe1.z || 0];
        } else if (typeof pipe1 !== 'undefined') {
          p1 = Array.isArray(pipe1) ? pipe1 : [pipe1.x || 0, pipe1.y || 0, pipe1.z || 0];
        }
        if (typeof u_pipe2 !== 'undefined') {
          p2 = Array.isArray(u_pipe2) ? u_pipe2 : [u_pipe2.x || 0, u_pipe2.y || 0, u_pipe2.z || 0];
        } else if (typeof pipe2 !== 'undefined') {
          p2 = Array.isArray(pipe2) ? pipe2 : [pipe2.x || 0, pipe2.y || 0, pipe2.z || 0];
        }

        return { playerPos: [px, py], action: act, score: sc, pipe1: p1, pipe2: p2 };
      },
      getVariables: function() {
        const out = {
          dt, time, dpad_x, dpad_y, button_0, button_1, button_2, button_3,
          slider_0, slider_1, slider_2, slider_3, touch_x, touch_y, is_touching,
        };
        ${declaredNames.map((name) => `
        try {
          if (typeof ${name} !== 'undefined') {
            out["${name}"] = ${name};
          }
        } catch (_) {}`).join("\n")}

        if (typeof get_uniforms === 'function') {
          try {
            const custom = get_uniforms();
            if (custom && typeof custom === 'object') {
              Object.assign(out, custom);
            }
          } catch (_) {}
        }
        return out;
      }
    };
  `;

  try {
    const gfxObj = gfxHandle ? gfxHandle.gfx : createGfxStub(inputState);
    const embedShaderFn = gfxHandle ? gfxHandle.embedShader : ((stage: string, s: string) => s);
    const bytesOfFn = gfxHandle ? gfxHandle.bytesOf : ((d: any) => d);

    const audioObj = getAudioRuntime();
    const runnerFn = new Function("print", "gfx", "audio", "embed_shader", "bytes_of", runnerCode);
    const sandbox: any = runnerFn(print, gfxObj, audioObj, embedShaderFn, bytesOfFn);

    return {
      success: true,
      hasGameLoop: true,
      reset: () => {
        if (gfxHandle) gfxHandle.stop();
        if (sandbox && sandbox.reset) sandbox.reset();
      },
      dispose: () => {
        if (gfxHandle) gfxHandle.stop();
      },
      step: (dt, inputs) => {
        if (sandbox && sandbox.step) sandbox.step(dt, inputs);
      },
      tap: () => {
        if (sandbox && sandbox.tap) sandbox.tap();
      },
      dpad: (dx, dy) => {
        if (sandbox && sandbox.dpad) sandbox.dpad(dx, dy);
      },
      button: (idx) => {
        if (sandbox && sandbox.button) sandbox.button(idx);
      },
      slider: (idx, val) => {
        if (sandbox && sandbox.slider) sandbox.slider(idx, val);
      },
      getVariables: () => {
        return sandbox && sandbox.getVariables ? sandbox.getVariables() : {};
      },
      getUniforms: () => {
        return sandbox && sandbox.getUniforms
          ? sandbox.getUniforms()
          : { playerPos: [0.5, 0.5], action: 1.0, score: 0, pipe1: [0, 0, 0], pipe2: [0, 0, 0] };
      },
      getLogs: () => logs,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || String(err),
      hasGameLoop: false,
      reset: () => {},
      dispose: () => {},
      step: () => {},
      tap: () => {},
      dpad: () => {},
      button: () => {},
      slider: () => {},
      getVariables: () => ({}),
      getUniforms: () => ({ playerPos: [0.5, 0.5], action: 1.0, score: 0, pipe1: [0, 0, 0], pipe2: [0, 0, 0] }),
      getLogs: () => logs,
    };
  }
}
