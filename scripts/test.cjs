const path = require("path");
const assert = require("assert");

console.log("=== Testing Goose WASM & Renderer Package ===");

const { compileGooseToShader } = require("../dist/renderer.js");
const { compileGoose } = require("../dist/index.js");
const {createGooseGameRuntime}=require("../dist/legacy.js");

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
assert.ok(shaderRes.fragmentShader.includes("return vec2(d, float(1.0));"), "Clean GLSL return vec2 translation");
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

// Test E: Interactive Game Engine Runtime
console.log("2. Testing Goose Interactive Game Engine Runtime...");
const gameSource = `
import std;
import gfx;

var x: f32 = 0.0;
var y: f32 = 0.0;

fn dpad(dx: i64, dy: i64) {
    if dx > 0 { x = x + 1.0; }
    if dy > 0 { y = y + 1.0; }
}

fn tick(dt: f32) {
    if gfx::key_down("w") {
        y = y + 10.0 * dt;
    }
}
`;
const inputState = {
  keysDown: new Set(),
  keysPressed: new Set(),
  keysReleased: new Set(),
  mouseX: 0, mouseY: 0,
  mouseDown: [false, false, false],
  mousePressed: [false, false, false],
  mouseReleased: [false, false, false],
};
const gameRuntime = createGooseGameRuntime(gameSource, { inputState });
assert.strictEqual(gameRuntime.success, true, "Game runtime should initialize successfully");
const initialVars = gameRuntime.getVariables();
assert.strictEqual(initialVars.x, 0.0, "Initial x should be 0");
assert.strictEqual(initialVars.y, 0.0, "Initial y should be 0");

// Test dpad mutation
gameRuntime.dpad(1, 1);
const dpadVars = gameRuntime.getVariables();
assert.strictEqual(dpadVars.x, 1.0, "Dpad should advance x to 1.0");
assert.strictEqual(dpadVars.y, 1.0, "Dpad should advance y to 1.0");

// Test keyboard input and tick step
inputState.keysDown.add("w");
gameRuntime.step(0.1, { dt: 0.1, time: 0.1, dpad: [0, 0], buttons: [0,0,0,0], sliders: [0,0,0,0], touch: [0,0,0,0] });
const tickVars = gameRuntime.getVariables();
assert.ok(tickVars.y > 1.5, "Holding W should advance y during tick(dt)");
console.log("✓ Game Engine Runtime and GFX input translation verified");

// Test F: Goose WebAssembly Compiler & Multi-file Compilation
const linterDist = path.join(__dirname, "..", "dist", "goose_linter.js");
const fs = require("fs");
if (fs.existsSync(linterDist)) {
  console.log("3. Testing Goose WebAssembly compiler module...");
  const createLinter = require(linterDist);
  createLinter({ noInitialRun: true }).then(async (mod) => {
    assert.ok(mod.FS, "FS should be exported");
    assert.ok(typeof mod.callMain === "function", "callMain should be exported");

    // Test F1: compileGoose valid program with C transpilation
    const validRes = await compileGoose(mod, 'import std;\nfn main() { print("Goose WASM OK"); }\n', { transpile: true });
    assert.strictEqual(validRes.success, true, "Valid program should succeed");
    assert.strictEqual(validRes.diagnostics.length, 0, "No diagnostics on valid program");
    assert.ok(validRes.transpiledC.length > 50, "C code should be emitted");
    assert.strictEqual(validRes.stages.check.success, true, "Check stage should succeed");
    assert.strictEqual(validRes.stages.transpile.success, true, "Transpile stage should succeed");
    console.log("✓ Single-file compileGoose with C generation verified");

    // Test F2: compileGoose multi-file project snapshot
    const multiRes = await compileGoose(mod, 'import std;\nimport helper;\nfn main() { print(answer()); }\n', {
      transpile: true,
      entryFile: "/multi.goose",
      files: {
        "helper.goose": 'fn answer() -> i64 { 42 }\n',
      },
    });
    assert.strictEqual(multiRes.success, true, "Multi-file project compilation should succeed");
    assert.strictEqual(multiRes.diagnostics.length, 0, "No diagnostics on multi-file project");
    console.log("✓ Multi-file project snapshot compilation verified");

    // Test F3: compileGoose syntax error handling
    const errRes = await compileGoose(mod, 'import std;\nfn main() { INVALID SYNTAX !!! }\n');
    assert.strictEqual(errRes.success, false, "Syntax error program should fail");
    assert.ok(errRes.diagnostics.length > 0, "Diagnostics should capture syntax error");
    assert.strictEqual(errRes.stages.check.success, false, "Check stage should report failure");
    console.log("✓ Error diagnostics and stage failure reporting verified\n");

    // Test G: Native Semantic Probes & Official Compiled Demos
    const { runSemanticsTests } = require('../tests/semantics.test.cjs');
    await runSemanticsTests();

    const { runBrowserTests } = require('../tests/browser.test.cjs');
    await runBrowserTests();

    console.log("=== All Tests & Demo Acceptance Passed Successfully! ===");
  }).catch((err) => {
    console.error("Linter test error:", err);
    process.exit(1);
  });
} else {
  throw new Error("Build dist/goose_linter.js before running acceptance tests: npm run build.");
}
