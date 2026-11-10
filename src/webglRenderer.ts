/**
 * Lightweight WebGL 1.0 / 2.0 Runner for Live Goose Shaders
 */

export interface WebGLContextHandle {
  gl: WebGLRenderingContext;
  program: WebGLProgram | null;
  quadVbo: WebGLBuffer | null;
  cubeVbo: WebGLBuffer | null;
  cubeIbo: WebGLBuffer | null;
  isMeshMode: boolean;
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
  handle.isMeshMode = aNormal !== -1 || aColor !== -1 || handle.uModel !== null || handle.uViewProj !== null;

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

  return { success: true };
}

export function renderWebGLFrame(
  handle: WebGLContextHandle,
  width: number,
  height: number,
  time: number,
  yaw: number,
  pitch: number,
  camX: number,
  camY: number,
  camZ: number,
  playerX: number = 0,
  playerY: number = 0,
  action: number = 0,
  score: number = 0,
  pipe1: [number, number, number] = [0, 0, 0],
  pipe2: [number, number, number] = [0, 0, 0]
) {
  const gl = handle.gl;
  if (!handle.program) return;

  gl.viewport(0, 0, width, height);
  gl.useProgram(handle.program);

  // Set standard uniforms whenever declared
  if (handle.uResolution) gl.uniform2f(handle.uResolution, width, height);
  if (handle.uTime) gl.uniform1f(handle.uTime, time);
  if (handle.uCamRot) gl.uniform2f(handle.uCamRot, yaw, pitch);
  if (handle.uCamPos) gl.uniform3f(handle.uCamPos, camX, camY, camZ);
  if (handle.uPlayerPos) gl.uniform2f(handle.uPlayerPos, playerX, playerY);
  if (handle.uAction) gl.uniform1f(handle.uAction, action);
  if (handle.uScore) gl.uniform1f(handle.uScore, score);
  if (handle.uPipe1) gl.uniform3f(handle.uPipe1, pipe1[0], pipe1[1], pipe1[2]);
  if (handle.uPipe2) gl.uniform3f(handle.uPipe2, pipe2[0], pipe2[1], pipe2[2]);

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
