const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { buildProject } = require('../service/build-project.js');
const { createMockWebGL } = require('./mock_webgl.cjs');

async function runCubeTest() {
  console.log('=== Testing 27_gfx_cube.goose ===');
  const cubeSource = fs.readFileSync(path.resolve(__dirname, '../goose/samples/27_gfx_cube.goose'), 'utf8');

  const outDir = path.resolve(__dirname, '../build/g3_cube');
  const res = await buildProject({
    source: cubeSource,
    entryFile: '/sample_cube.goose',
    outDir,
  });

  assert.strictEqual(res.success, true, '27_gfx_cube.goose compilation must succeed');

  const createGooseGame = require(path.join(outDir, 'game.mjs')).default;
  const wasmBinary = fs.readFileSync(path.join(outDir, 'game.wasm'));

  let logs = [];
  const { canvas } = createMockWebGL(640, 480);

  const module = await createGooseGame({
    noInitialRun: true,
    canvas,
    instantiateWasm(info, receiveInstance) {
      WebAssembly.instantiate(wasmBinary, info).then(r => receiveInstance(r.instance));
      return {};
    },
    print: (text) => logs.push(`[stdout] ${text}`),
    printErr: (text) => logs.push(`[stderr] ${text}`),
  });

  const args = ["goose_game", "--frames", "2"];
  const ptrSize = 4;
  const argvPtr = module._malloc((args.length + 1) * ptrSize);

  for (let i = 0; i < args.length; i++) {
    const len = module.lengthBytesUTF8(args[i]) + 1;
    const argPtr = module._malloc(len);
    module.stringToUTF8(args[i], argPtr, len);
    module.setValue(argvPtr + i * ptrSize, argPtr, 'i32');
  }
  module.setValue(argvPtr + args.length * ptrSize, 0, 'i32');

  const exitCode = await module.ccall('goose_web_run', 'number', ['number', 'number'], [args.length, argvPtr], { async: true });
  assert.strictEqual(exitCode, 0, 'Exit code must be 0');
  assert.ok(logs.some(l => l.includes('cube in the middle: true')), 'Must detect cube in rendered frame');
  console.log('✓ 27_gfx_cube.goose verified successfully!\n');
}

if (require.main === module) {
  runCubeTest().catch(err => {
    console.error('Cube test error:', err);
    process.exit(1);
  });
}

module.exports = { runCubeTest };
