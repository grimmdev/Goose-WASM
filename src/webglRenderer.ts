/**
 * Lightweight WebGL 1.0 / 2.0 Runner for Live Goose Shaders & 3D Geometry
 */

export interface ActiveUniformInfo {
  name: string;
  cleanName: string;
  location: WebGLUniformLocation;
  type: number;
  size: number;
}

export interface WebGLContextHandle {
  gl: WebGLRenderingContext;
  program: WebGLProgram | null;
  quadVbo: WebGLBuffer | null;
  cubeVbo: WebGLBuffer | null;
  cubeIbo: WebGLBuffer | null;
  isMeshMode: boolean;
  activeUniforms: ActiveUniformInfo[];
  uResolution: WebGLUniformLocation | null;
  uTime: WebGLUniformLocation | null;
  uCamRot: WebGLUniformLocation | null;
  uCamPos: WebGLUniformLocation | null;
  uModel: WebGLUniformLocation | null;
  uViewProj: WebGLUniformLocation | null;
  uPlayerPos: WebGLUniformLocation | null;
  uAction: WebGLUniformLocation | null;
  uScore: WebGLUniformLocation | null;
  uPipe1: WebGLUniformLocation | null;
  uPipe2: WebGLUniformLocation | null;
  uTouch: WebGLUniformLocation | null;
  uDpad: WebGLUniformLocation | null;
  uButtons: WebGLUniformLocation | null;
  uSliders: WebGLUniformLocation | null;
  aPos: number;
  aNormal: number;
  aColor: number;
}

const VERT_SHADER_SRC = `
attribute vec2 a_pos;
void main() {
    gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

/**
 * 4x4 Column-Major Matrix Math Utilities
 */
function mat4Multiply(a: Float32Array, b: Float32Array): Float32Array {
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

function mat4RotateX(rad: number): Float32Array {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return new Float32Array([
    1, 0, 0, 0,
    0, c, s, 0,
    0, -s, c, 0,
    0, 0, 0, 1,
  ]);
}

function mat4RotateY(rad: number): Float32Array {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return new Float32Array([
    c, 0, -s, 0,
    0, 1, 0, 0,
    s, 0, c, 0,
    0, 0, 0, 1,
  ]);
}

function mat4Perspective(fovRad: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1.0 / Math.tan(fovRad / 2.0);
  const rangeInv = 1.0 / (near - far);
  const out = new Float32Array(16);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) * rangeInv;
  out[11] = -1.0;
  out[14] = (2.0 * far * near) * rangeInv;
  return out;
}

function mat4LookAt(
  eye: [number, number, number],
  target: [number, number, number],
  up: [number, number, number]
): Float32Array {
  let zx = eye[0] - target[0];
  let zy = eye[1] - target[1];
  let zz = eye[2] - target[2];
  let len = Math.hypot(zx, zy, zz);
  if (len > 0.00001) {
    zx /= len;
    zy /= len;
    zz /= len;
  }

  // x = up x z
  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  len = Math.hypot(xx, xy, xz);
  if (len > 0.00001) {
    xx /= len;
    xy /= len;
    xz /= len;
  }

  // y = z x x
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;

  const out = new Float32Array(16);
  out[0] = xx;
  out[1] = yx;
  out[2] = zx;
  out[3] = 0;

  out[4] = xy;
  out[5] = yy;
  out[6] = zy;
  out[7] = 0;

  out[8] = xz;
  out[9] = yz;
  out[10] = zz;
  out[11] = 0;

  out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  out[15] = 1;

  return out;
}

/**
 * Builds the official 3D Cube geometry matching samples/27_gfx_cube.goose
 * 24 vertices (pos: 3, normal: 3, color: 4) = 10 floats per vertex (stride 40 bytes)
 * 36 indices for 12 triangles (2 triangles per face)
 */
function generateCubeGeometry(): { vertexData: Float32Array; indexData: Uint16Array } {
  const axes = [
    [1.0, 0.0, 0.0],
    [0.0, 1.0, 0.0],
    [0.0, 0.0, 1.0],
  ];
  const colors = [
    [230 / 255, 80 / 255, 60 / 255, 1.0],   // Face 0 (+X: Red)
    [240 / 255, 170 / 255, 50 / 255, 1.0], // Face 1 (-X: Orange)
    [90 / 255, 200 / 255, 90 / 255, 1.0],  // Face 2 (+Y: Green)
    [70 / 255, 160 / 255, 230 / 255, 1.0], // Face 3 (-Y: Blue)
    [160 / 255, 100 / 255, 220 / 255, 1.0],// Face 4 (+Z: Purple)
    [230 / 255, 230 / 255, 230 / 255, 1.0],// Face 5 (-Z: Light Gray)
  ];

  const corners = [
    [-1.0, -1.0],
    [1.0, -1.0],
    [1.0, 1.0],
    [-1.0, 1.0],
  ];

  const vertexData = new Float32Array(24 * 10);
  const indexData = new Uint16Array(36);

  let vIdx = 0;
  let iIdx = 0;

  for (let f = 0; f < 6; f++) {
    const sign = f % 2 === 0 ? 1.0 : -1.0;
    const axIdx = Math.floor(f / 2);
    const n = [axes[axIdx][0] * sign, axes[axIdx][1] * sign, axes[axIdx][2] * sign];

    const uIdx = (axIdx + 1) % 3;
    const u = [axes[uIdx][0] * sign, axes[uIdx][1] * sign, axes[uIdx][2] * sign];

    // v = cross(n, u)
    const v = [
      n[1] * u[2] - n[2] * u[1],
      n[2] * u[0] - n[0] * u[2],
      n[0] * u[1] - n[1] * u[0],
    ];

    const base = f * 4;

    for (let c = 0; c < 4; c++) {
      const cx = corners[c][0];
      const cy = corners[c][1];
      const px = (n[0] + u[0] * cx + v[0] * cy) * 0.5;
      const py = (n[1] + u[1] * cx + v[1] * cy) * 0.5;
      const pz = (n[2] + u[2] * cx + v[2] * cy) * 0.5;

      // Position (3 floats)
      vertexData[vIdx++] = px;
      vertexData[vIdx++] = py;
      vertexData[vIdx++] = pz;

      // Normal (3 floats)
      vertexData[vIdx++] = n[0];
      vertexData[vIdx++] = n[1];
      vertexData[vIdx++] = n[2];

      // Color (4 floats)
      vertexData[vIdx++] = colors[f][0];
      vertexData[vIdx++] = colors[f][1];
      vertexData[vIdx++] = colors[f][2];
      vertexData[vIdx++] = colors[f][3];
    }

    // Indices (6 per face: 2 triangles)
    indexData[iIdx++] = base;
    indexData[iIdx++] = base + 1;
    indexData[iIdx++] = base + 2;
    indexData[iIdx++] = base;
    indexData[iIdx++] = base + 2;
    indexData[iIdx++] = base + 3;
  }

  return { vertexData, indexData };
}

export function initWebGLContext(canvas: HTMLCanvasElement): WebGLContextHandle | null {
  const gl = (canvas.getContext("webgl") ||
    canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;

  if (!gl) {
    console.warn("WebGL not supported, falling back to 2D");
    return null;
  }

  // Create Quad VBO (6 vertices, 2 floats each)
  const quadVbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  );

  // Create Cube VBO & IBO (24 vertices, 10 floats each, 36 indices)
  const cubeGeo = generateCubeGeometry();
  const cubeVbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cubeVbo);
  gl.bufferData(gl.ARRAY_BUFFER, cubeGeo.vertexData, gl.STATIC_DRAW);

  const cubeIbo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeIbo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, cubeGeo.indexData, gl.STATIC_DRAW);

  return {
    gl,
    program: null,
    quadVbo,
    cubeVbo,
    cubeIbo,
    isMeshMode: false,
    activeUniforms: [],
    uResolution: null,
    uTime: null,
    uCamRot: null,
    uCamPos: null,
    uModel: null,
    uViewProj: null,
    uPlayerPos: null,
    uAction: null,
    uScore: null,
    uPipe1: null,
    uPipe2: null,
    uTouch: null,
    uDpad: null,
    uButtons: null,
    uSliders: null,
    aPos: -1,
    aNormal: -1,
    aColor: -1,
  };
}

export function updateWebGLProgram(
  handle: WebGLContextHandle,
  fragmentShaderSrc: string,
  vertexShaderSrc?: string
): { success: boolean; error?: string } {
  const gl = handle.gl;

  // Compile vertex shader (custom or default quad)
  const vertSrc = vertexShaderSrc && vertexShaderSrc.trim().length > 0 ? vertexShaderSrc : VERT_SHADER_SRC;
  const vert = gl.createShader(gl.VERTEX_SHADER)!;
  gl.shaderSource(vert, vertSrc);
  gl.compileShader(vert);

  if (!gl.getShaderParameter(vert, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(vert) || "Vertex shader compile error";
    gl.deleteShader(vert);
    return { success: false, error: info };
  }

  // Compile fragment shader
  const frag = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(frag, fragmentShaderSrc);
  gl.compileShader(frag);

  if (!gl.getShaderParameter(frag, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(frag) || "Shader compile error";
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    return { success: false, error: info };
  }

  // Link program
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vert);
  gl.attachShader(prog, frag);
  gl.linkProgram(prog);

  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(prog) || "Program link error";
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    gl.deleteProgram(prog);
    return { success: false, error: info };
  }

  // Clean old program
  if (handle.program) {
    gl.deleteProgram(handle.program);
  }

  handle.program = prog;
  gl.useProgram(prog);

  // Discover attributes
  const aPos = gl.getAttribLocation(prog, "a_pos") !== -1 ? gl.getAttribLocation(prog, "a_pos") : gl.getAttribLocation(prog, "position");
  const aNormal = gl.getAttribLocation(prog, "a_normal") !== -1 ? gl.getAttribLocation(prog, "a_normal") : gl.getAttribLocation(prog, "normal");
  const aColor = gl.getAttribLocation(prog, "a_color") !== -1 ? gl.getAttribLocation(prog, "a_color") : gl.getAttribLocation(prog, "color");

  handle.aPos = aPos;
  handle.aNormal = aNormal;
  handle.aColor = aColor;

  // Discover 3D Matrix Uniforms
  handle.uModel = gl.getUniformLocation(prog, "model") || gl.getUniformLocation(prog, "u_model") || gl.getUniformLocation(prog, "uModel");
  handle.uViewProj = gl.getUniformLocation(prog, "view_proj") || gl.getUniformLocation(prog, "u_view_proj") || gl.getUniformLocation(prog, "viewProj") || gl.getUniformLocation(prog, "uViewProj");

  // Determine whether this is a 3D Polygon Mesh (like Official 27_gfx_cube) or 2D Quad (raymarching/canvas)
  handle.isMeshMode = (handle.uModel !== null || handle.uViewProj !== null) && aNormal !== -1 && aColor !== -1;

  // Cache standard uniform locations
  handle.uResolution = gl.getUniformLocation(prog, "u_resolution");
  handle.uTime = gl.getUniformLocation(prog, "u_time");
  handle.uCamRot = gl.getUniformLocation(prog, "u_cam_rot");
  handle.uCamPos = gl.getUniformLocation(prog, "u_cam_pos");
  handle.uPlayerPos = gl.getUniformLocation(prog, "u_player_pos");
  handle.uAction = gl.getUniformLocation(prog, "u_action");
  handle.uScore = gl.getUniformLocation(prog, "u_score");
  handle.uPipe1 = gl.getUniformLocation(prog, "u_pipe1");
  handle.uPipe2 = gl.getUniformLocation(prog, "u_pipe2");
  handle.uTouch = gl.getUniformLocation(prog, "u_touch") || gl.getUniformLocation(prog, "u_mouse") || gl.getUniformLocation(prog, "iMouse");
  handle.uDpad = gl.getUniformLocation(prog, "u_dpad") || gl.getUniformLocation(prog, "u_joystick");
  handle.uButtons = gl.getUniformLocation(prog, "u_buttons");
  handle.uSliders = gl.getUniformLocation(prog, "u_sliders");

  // Inspect and reflect ALL active uniforms declared in user shader
  const numUniforms = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS) || 0;
  const activeUniforms: ActiveUniformInfo[] = [];
  for (let i = 0; i < numUniforms; i++) {
    const info = gl.getActiveUniform(prog, i);
    if (!info) continue;
    const cleanName = info.name.replace(/\[0\]$/, "");
    const loc = gl.getUniformLocation(prog, info.name);
    if (loc !== null) {
      activeUniforms.push({
        name: info.name,
        cleanName,
        location: loc,
        type: info.type,
        size: info.size,
      });
    }
  }
  handle.activeUniforms = activeUniforms;

  return { success: true };
}

function toFloatArray(val: any, len: number): number[] {
  if (Array.isArray(val)) {
    const res = val.map(Number);
    while (res.length < len) res.push(0);
    return res.slice(0, len);
  }
  if (typeof val === "object" && val !== null) {
    if ("x" in val || "y" in val) {
      return [
        Number(val.x) || 0,
        Number(val.y) || 0,
        Number(val.z) || 0,
        Number(val.w) || 0,
      ].slice(0, len);
    }
    if ("r" in val || "g" in val) {
      return [
        Number(val.r) || 0,
        Number(val.g) || 0,
        Number(val.b) || 0,
        Number(val.a) || 0,
      ].slice(0, len);
    }
    const nums = Object.values(val)
      .map(Number)
      .filter((n) => !isNaN(n));
    while (nums.length < len) nums.push(0);
    return nums.slice(0, len);
  }
  const n = Number(val) || 0;
  const out = new Array(len).fill(0);
  out[0] = n;
  return out;
}

function toIntArray(val: any, len: number): number[] {
  return toFloatArray(val, len).map((f) => f | 0);
}

function applyUniform(
  gl: WebGLRenderingContext,
  loc: WebGLUniformLocation,
  type: number,
  val: any
) {
  if (val === undefined || val === null) return;

  switch (type) {
    case 0x1406: // gl.FLOAT
      gl.uniform1f(loc, Number(val) || 0);
      break;

    case 0x8b50: { // gl.FLOAT_VEC2
      const v = toFloatArray(val, 2);
      gl.uniform2f(loc, v[0], v[1]);
      break;
    }

    case 0x8b51: { // gl.FLOAT_VEC3
      const v = toFloatArray(val, 3);
      gl.uniform3f(loc, v[0], v[1], v[2]);
      break;
    }

    case 0x8b52: { // gl.FLOAT_VEC4
      const v = toFloatArray(val, 4);
      gl.uniform4f(loc, v[0], v[1], v[2], v[3]);
      break;
    }

    case 0x1404: // gl.INT
      gl.uniform1i(loc, Number(val) | 0);
      break;

    case 0x8b53: { // gl.INT_VEC2
      const v = toIntArray(val, 2);
      gl.uniform2i(loc, v[0], v[1]);
      break;
    }

    case 0x8b54: { // gl.INT_VEC3
      const v = toIntArray(val, 3);
      gl.uniform3i(loc, v[0], v[1], v[2]);
      break;
    }

    case 0x8b55: { // gl.INT_VEC4
      const v = toIntArray(val, 4);
      gl.uniform4i(loc, v[0], v[1], v[2], v[3]);
      break;
    }

    case 0x8b56: // gl.BOOL
      gl.uniform1i(loc, val ? 1 : 0);
      break;

    case 0x8b57: { // gl.BOOL_VEC2
      const v = toIntArray(val, 2);
      gl.uniform2i(loc, v[0] ? 1 : 0, v[1] ? 1 : 0);
      break;
    }

    case 0x8b58: { // gl.BOOL_VEC3
      const v = toIntArray(val, 3);
      gl.uniform3i(loc, v[0] ? 1 : 0, v[1] ? 1 : 0, v[2] ? 1 : 0);
      break;
    }

    case 0x8b59: { // gl.BOOL_VEC4
      const v = toIntArray(val, 4);
      gl.uniform4i(loc, v[0] ? 1 : 0, v[1] ? 1 : 0, v[2] ? 1 : 0, v[3] ? 1 : 0);
      break;
    }

    case 0x8b5a: // gl.FLOAT_MAT2
      if (val instanceof Float32Array || Array.isArray(val)) gl.uniformMatrix2fv(loc, false, val);
      break;
    case 0x8b5b: // gl.FLOAT_MAT3
      if (val instanceof Float32Array || Array.isArray(val)) gl.uniformMatrix3fv(loc, false, val);
      break;
    case 0x8b5c: // gl.FLOAT_MAT4
      if (val instanceof Float32Array || Array.isArray(val)) gl.uniformMatrix4fv(loc, false, val);
      break;
  }
}

export function resolveUniformValue(
  name: string,
  userVars: Record<string, any>,
  systemVars: Record<string, any>
): any {
  // 1. Direct user variable match (user Goose simulation takes precedence)
  if (name in userVars && userVars[name] !== undefined) return userVars[name];

  // 2. Strip leading "u_" if present in user variables (e.g. shader has "u_gravity", user declared "gravity")
  if (name.startsWith("u_")) {
    const stripped = name.slice(2);
    if (stripped in userVars && userVars[stripped] !== undefined) return userVars[stripped];
  }

  // 3. Add leading "u_" if present in user variables (e.g. shader has "score", user declared "u_score")
  const withPrefix = "u_" + name;
  if (withPrefix in userVars && userVars[withPrefix] !== undefined) return userVars[withPrefix];

  // 4. System variable match (u_resolution, u_time, touch, or fallback viewport camera)
  if (name in systemVars && systemVars[name] !== undefined) return systemVars[name];

  // 5. Case-insensitive lookup (e.g. shader has "u_gravity" or "gravity", user declared "GRAVITY")
  const lowerName = name.toLowerCase();
  const lowerStripped = lowerName.startsWith("u_") ? lowerName.slice(2) : lowerName;
  for (const key of Object.keys(userVars)) {
    const lowerKey = key.toLowerCase();
    const lowerKeyStripped = lowerKey.startsWith("u_") ? lowerKey.slice(2) : lowerKey;
    if (lowerKey === lowerName || lowerKeyStripped === lowerStripped) {
      return userVars[key];
    }
  }

  // 6. Dot / struct property lookup: e.g. uniform "bird_y" or "u_bird_y" -> userVars["bird"]?.y
  const parts = lowerStripped.split("_");
  if (parts.length >= 2) {
    const structName = parts[0];
    const fieldName = parts.slice(1).join("_");
    for (const key of Object.keys(userVars)) {
      if (key.toLowerCase() === structName) {
        const obj = userVars[key];
        if (typeof obj === "object" && obj !== null) {
          for (const f of Object.keys(obj)) {
            if (f.toLowerCase() === fieldName) {
              return obj[f];
            }
          }
        }
      }
    }
  }

  // 7. Compound fallback for player position (u_player_pos / player_pos):
  if (lowerStripped === "player_pos" || lowerStripped === "playerpos") {
    const px = userVars["player_x"] ?? userVars["u_player_x"] ?? userVars["hero_pos"]?.x ?? userVars["state"]?.hero_pos?.x ?? 0.5;
    const py = userVars["player_y"] ?? userVars["u_player_y"] ?? userVars["hero_pos"]?.y ?? userVars["state"]?.hero_pos?.y ?? userVars["bird"]?.y ?? 0.5;
    return [px, py];
  }

  return undefined;
}

export interface RenderFrameOptions {
  width: number;
  height: number;
  time: number;
  yaw: number;
  pitch: number;
  camX?: number;
  camY?: number;
  camZ?: number;
  touch?: [number, number, number, number];
  dpad?: [number, number];
  buttons?: [number, number, number, number];
  sliders?: [number, number, number, number];
  variables?: Record<string, any>;
  playerX?: number;
  playerY?: number;
  action?: number;
  score?: number;
  pipe1?: [number, number, number];
  pipe2?: [number, number, number];
}

export function renderWebGLFrame(
  handle: WebGLContextHandle,
  widthOrOptions: number | RenderFrameOptions,
  ...rest: any[]
) {
  const gl = handle.gl;
  if (!handle.program) return;

  let width: number, height: number, time: number, yaw: number, pitch: number;
  let camX = 0, camY = 0, camZ = 0;
  let touch: [number, number, number, number] = [0, 0, 0, 0];
  let dpad: [number, number] = [0, 0];
  let buttons: [number, number, number, number] = [0, 0, 0, 0];
  let sliders: [number, number, number, number] = [0, 0, 0, 0];
  let userVars: Record<string, any> = {};

  if (typeof widthOrOptions === "object" && widthOrOptions !== null) {
    const opts = widthOrOptions;
    width = opts.width;
    height = opts.height;
    time = opts.time;
    yaw = opts.yaw;
    pitch = opts.pitch;
    camX = opts.camX ?? 0;
    camY = opts.camY ?? 0;
    camZ = opts.camZ ?? 0;
    touch = opts.touch ?? [0, 0, 0, 0];
    dpad = opts.dpad ?? [0, 0];
    buttons = opts.buttons ?? [0, 0, 0, 0];
    sliders = opts.sliders ?? [0, 0, 0, 0];
    userVars = opts.variables ?? {};
    if (opts.playerX !== undefined && !("player_x" in userVars)) userVars["player_x"] = opts.playerX;
    if (opts.playerY !== undefined && !("player_y" in userVars)) userVars["player_y"] = opts.playerY;
    if (opts.action !== undefined && !("action" in userVars)) userVars["action"] = opts.action;
    if (opts.score !== undefined && !("score" in userVars)) userVars["score"] = opts.score;
    if (opts.pipe1 !== undefined && !("pipe1" in userVars)) userVars["pipe1"] = opts.pipe1;
    if (opts.pipe2 !== undefined && !("pipe2" in userVars)) userVars["pipe2"] = opts.pipe2;
  } else {
    width = Number(widthOrOptions);
    height = rest[0];
    time = rest[1];
    yaw = rest[2];
    pitch = rest[3];
    camX = rest[4] ?? 0;
    camY = rest[5] ?? 0;
    camZ = rest[6] ?? 0;
    const playerX = rest[7] ?? 0;
    const playerY = rest[8] ?? 0;
    const action = rest[9] ?? 0;
    const score = rest[10] ?? 0;
    const pipe1 = rest[11] ?? [0, 0, 0];
    const pipe2 = rest[12] ?? [0, 0, 0];
    touch = rest[13] ?? [0, 0, 0, 0];
    dpad = rest[14] ?? [0, 0];
    buttons = rest[15] ?? [0, 0, 0, 0];
    sliders = rest[16] ?? [0, 0, 0, 0];
    userVars = rest[17] ?? {
      player_x: playerX,
      player_y: playerY,
      u_player_pos: [playerX, playerY],
      action,
      score,
      pipe1,
      pipe2,
    };
  }

  gl.viewport(0, 0, width, height);
  gl.useProgram(handle.program);

  // Standard engine inputs dictionary
  const systemVars: Record<string, any> = {
    u_resolution: [width, height],
    resolution: [width, height],
    u_time: time,
    time: time,
    u_cam_rot: [yaw, pitch],
    cam_rot: [yaw, pitch],
    u_cam_pos: [camX, camY, camZ],
    cam_pos: [camX, camY, camZ],
    u_touch: touch,
    touch: touch,
    u_mouse: touch,
    iMouse: touch,
    u_dpad: dpad,
    dpad: dpad,
    u_buttons: buttons,
    buttons: buttons,
    u_sliders: sliders,
    sliders: sliders,
  };

  // Dynamically set EVERY active uniform reflected from the compiled shader!
  if (handle.activeUniforms && handle.activeUniforms.length > 0) {
    for (const u of handle.activeUniforms) {
      if (
        u.cleanName === "model" ||
        u.cleanName === "u_model" ||
        u.cleanName === "view_proj" ||
        u.cleanName === "u_view_proj"
      ) {
        continue;
      }
      const val = resolveUniformValue(u.cleanName, userVars, systemVars);
      if (val !== undefined) {
        applyUniform(gl, u.location, u.type, val);
      }
    }
  }

  if (handle.isMeshMode) {
    // --- 3D Mesh Mode (Official Goose 3D GFX Cube) ---
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    // Clear slate blue: matching SDL3 Goose gfx_cube.goose float4 { 0.1, 0.12, 0.16, 1.0 }
    gl.clearColor(0.1, 0.12, 0.16, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Bind Cube VBO (stride 40 bytes: pos 3, normal 3, color 4)
    gl.bindBuffer(gl.ARRAY_BUFFER, handle.cubeVbo);

    if (handle.aPos !== -1) {
      gl.enableVertexAttribArray(handle.aPos);
      gl.vertexAttribPointer(handle.aPos, 3, gl.FLOAT, false, 40, 0);
    }
    if (handle.aNormal !== -1) {
      gl.enableVertexAttribArray(handle.aNormal);
      gl.vertexAttribPointer(handle.aNormal, 3, gl.FLOAT, false, 40, 12);
    }
    if (handle.aColor !== -1) {
      gl.enableVertexAttribArray(handle.aColor);
      gl.vertexAttribPointer(handle.aColor, 4, gl.FLOAT, false, 40, 24);
    }

    // Compute Matrices matching Goose 27_gfx_cube
    const aspect = width / Math.max(height, 1);
    const rotYaw = yaw + time * 0.4;
    const rotPitch = pitch;
    const model = mat4Multiply(mat4RotateX(rotPitch), mat4RotateY(rotYaw));
    const view = mat4LookAt([camX, 0.4 + camY, 3.0 + camZ], [camX, camY, 0.0], [0.0, 1.0, 0.0]);
    const proj = mat4Perspective(0.8, aspect, 0.1, 20.0);
    const viewProj = mat4Multiply(proj, view);

    if (handle.uModel) gl.uniformMatrix4fv(handle.uModel, false, model);
    if (handle.uViewProj) gl.uniformMatrix4fv(handle.uViewProj, false, viewProj);

    // Draw indexed 3D cube
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, handle.cubeIbo);
    gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
  } else {
    // --- 2D Quad Mode (Raymarching SDF / 2D Canvas) ---
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);

    if (handle.aNormal !== -1) gl.disableVertexAttribArray(handle.aNormal);
    if (handle.aColor !== -1) gl.disableVertexAttribArray(handle.aColor);

    gl.bindBuffer(gl.ARRAY_BUFFER, handle.quadVbo);
    if (handle.aPos !== -1) {
      gl.enableVertexAttribArray(handle.aPos);
      gl.vertexAttribPointer(handle.aPos, 2, gl.FLOAT, false, 0, 0);
    }

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}

export function clearWebGLBlack(handle: WebGLContextHandle) {
  const gl = handle.gl;
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
}
