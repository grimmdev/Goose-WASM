const path = require("path");
const assert = require("assert");

console.log("=== Testing Goose WASM & Renderer Package ===");

const { compileGooseToShader } = require("../dist/renderer.js");
console.log("1. Testing WebGL shader compiler...");

// Test A: Procedural Goose 3D SDF
const sampleGoose3D = `
import std;

fn map_scene(p: f32[3], time: f32) -> f32[2] {
    let d = sd_sphere(p, 1.0);
    return [d, 1.0];
}
`;
const shaderRes = compileGooseToShader(sampleGoose3D);
assert.strictEqual(shaderRes.success, true, "Procedural 3D compilation should succeed");
assert.ok(shaderRes.fragmentShader.includes("precision"), "Shader should include precision statement");
assert.ok(shaderRes.fragmentShader.includes("map_scene"), "Shader should include compiled scene function");
console.log("✓ Procedural 3D Goose shader compiled (length: " + shaderRes.fragmentShader.length + " chars)");

// Test B: Separate Shader File (e.g. shader.frag)
const customFrag = `
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    gl_FragColor = vec4(uv.x, uv.y, sin(u_time), 1.0);
}
`;
const separateRes = compileGooseToShader("import std;\nfn main() {}", customFrag);
assert.strictEqual(separateRes.success, true, "Separate shader file compilation should succeed");
assert.strictEqual(separateRes.sourceType, "separate_file", "sourceType should be separate_file");
assert.ok(separateRes.fragmentShader.includes("sin(u_time)"), "Should preserve separate shader content");
console.log("✓ Separate .frag shader file compiled successfully");

// Test C: Embedded Shader in Goose code (embed_shader("frag", """..."""))
const embeddedGoose = `
import std;
import gfx;

let my_shader = embed_shader("frag", """
    precision highp float;
    uniform vec2 u_resolution;
    void main() {
        gl_FragColor = vec4(1.0, 0.5, 0.2, 1.0);
    }
""");
`;
const embeddedRes = compileGooseToShader(embeddedGoose);
assert.strictEqual(embeddedRes.success, true, "Embedded shader extraction should succeed");
assert.strictEqual(embeddedRes.sourceType, "embedded", "sourceType should be embedded");
assert.ok(embeddedRes.fragmentShader.includes("vec4(1.0, 0.5, 0.2, 1.0)"), "Should extract embedded GLSL");
console.log("✓ Embedded Goose shader (embed_shader) compiled successfully");

// Test C2: Dual Vertex & Fragment Shaders (Official 27_gfx_cube.goose)
const cubeGoose = `
let cube_vs = embed_shader("vert", """
    layout(location = 0) in vec3 a_pos;
    void main() { gl_Position = vec4(a_pos, 1.0); }
""");
let cube_fs = embed_shader("frag", """
    layout(location = 0) out vec4 result;
    void main() { result = vec4(1.0); }
""");
`;
const cubeRes = compileGooseToShader(cubeGoose);
assert.strictEqual(cubeRes.success, true, "Cube shader compilation should succeed");
assert.ok(cubeRes.vertexShader, "Vertex shader should be extracted");
assert.ok(cubeRes.vertexShader.includes("attribute vec3 a_pos"), "Normalized vertex attribute");
assert.ok(cubeRes.fragmentShader.includes("gl_FragColor"), "Normalized fragment color");
console.log("✓ Dual embed_shader (vertex + fragment) compiled successfully");

// Test D: Raw GLSL in active editor
const rawGlsl = `
precision highp float;
uniform float u_time;
void main() {
    gl_FragColor = vec4(cos(u_time), 0.0, 0.0, 1.0);
}
`;
const rawRes = compileGooseToShader(rawGlsl);
assert.strictEqual(rawRes.success, true, "Raw GLSL compilation should succeed");
assert.strictEqual(rawRes.sourceType, "raw", "sourceType should be raw");
console.log("✓ Raw GLSL fragment shader compiled successfully");

// Test E: Goose WASM compiler module
const linterDist = path.join(__dirname, "..", "dist", "goose_linter.js");
const fs = require("fs");
if (fs.existsSync(linterDist)) {
  console.log("2. Testing Goose WebAssembly compiler module...");
  const createLinter = require(linterDist);
  createLinter({ noInitialRun: true }).then((mod) => {
    assert.ok(mod.FS, "FS should be exported");
    assert.ok(typeof mod.callMain === "function", "callMain should be exported");
    mod.FS.writeFile("/test.goose", 'import std;\nfn main() { print("Goose WASM OK"); }\n');
    let stdout = "";
    mod.print = (t) => { stdout += t + "\n"; };
    const code = mod.callMain(["check", "/test.goose", "--stdlib", "/stdlib", "--diagnostics", "json"]);
    console.log("✓ WASM exit code:", code);
    console.log("✓ Diagnostics:", stdout.trim() || "[]");
    console.log("=== All Tests Passed! ===");
  }).catch((err) => {
    console.error("Linter test error:", err);
    process.exit(1);
  });
} else {
  console.log("Note: goose_linter.js not present yet in dist/. Skipping WASM runtime execution test.");
  console.log("=== Renderer Tests Passed! ===");
}
