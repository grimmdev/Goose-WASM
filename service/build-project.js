/**
 * Build Project Service (Gate G1)
 *
 * Implements the compilation pipeline specified in Section 12:
 * Project Snapshot -> Goose Transpilation -> emcc C Compilation -> game.wasm + game.mjs
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

async function buildProject(options) {
  const {
    source,
    files = {},
    entryFile = '/main.goose',
    outDir = path.resolve(__dirname, '../build/out'),
    linterPath = path.resolve(__dirname, '../dist/goose_linter.js'),
  } = options;

  fs.mkdirSync(outDir, { recursive: true });

  const createGooseLinter = require(linterPath);
  const mod = await createGooseLinter({ noInitialRun: true });

  const { compileGoose } = require('../dist/index.js');

  const compileRes = await compileGoose(mod, source, {
    transpile: true,
    entryFile,
    files,
  });

  if (!compileRes.success || !compileRes.transpiledC) {
    return {
      success: false,
      stage: 'transpile',
      diagnostics: compileRes.diagnostics,
      error: 'Goose C transpilation failed',
      stdout: compileRes.stdout,
      stderr: compileRes.stderr,
    };
  }

  // Write game.c
  const gameCPath = path.join(outDir, 'game.c');
  const gameOPath = path.join(outDir, 'game.o');
  const entryCPath = path.resolve(__dirname, '../platform/web/game_entry.c');
  const entryOPath = path.join(outDir, 'entry.o');

  fs.writeFileSync(gameCPath, compileRes.transpiledC, 'utf8');

  // Step 1: Compile game.c to game.o with emcc (-Dmain=goose_user_main)
  try {
    execSync(`emcc -std=c11 -O2 -w -Dmain=goose_user_main -DGS_STACK_RESERVE="(16ull << 20)" -DGS_STACK_GAP="(64ull << 10)" -DGS_STACK_BUDGET="(256ull << 20)" -c "${gameCPath}" -o "${gameOPath}"`);
  } catch (err) {
    return {
      success: false,
      stage: 'emcc_compile_game',
      error: String(err),
    };
  }

  // Step 2: Compile game_entry.c to entry.o
  try {
    execSync(`emcc -std=c11 -O2 -w -c "${entryCPath}" -o "${entryOPath}"`);
  } catch (err) {
    return {
      success: false,
      stage: 'emcc_compile_entry',
      error: String(err),
    };
  }

  // Step 3: Link into game.mjs and game.wasm with native libraries
  const webLibsDir = path.resolve(__dirname, '../build/web-libs');
  const libBox3d = path.join(webLibsDir, 'libbox3d.a');
  const libPhys = path.join(webLibsDir, 'libgoose_physics_web.a');
  const libUi = path.join(webLibsDir, 'libgoose_ui_web.a');
  const libGfx = path.join(webLibsDir, 'libgoose_gfx_web.a');
  const runtimeO = path.join(webLibsDir, 'goose_runtime.o');

  const outMjs = path.join(outDir, 'game.mjs');
  const outWasm = path.join(outDir, 'game.wasm');

  const linkFlags = [
    `"${gameOPath}"`,
    `"${entryOPath}"`,
    fs.existsSync(runtimeO) ? `"${runtimeO}"` : '',
    fs.existsSync(libPhys) ? `"${libPhys}"` : '',
    fs.existsSync(libBox3d) ? `"${libBox3d}"` : '',
    fs.existsSync(libUi) ? `"${libUi}"` : '',
    fs.existsSync(libGfx) ? `"${libGfx}"` : '',
    '-O2',
    '-O2',
    '-sMODULARIZE=1',
    '-sEXPORT_ES6=1',
    '-sEXPORT_NAME=createGooseGame',
    '-sENVIRONMENT=worker,web,node',
    '-sALLOW_MEMORY_GROWTH=1',
    '-sINITIAL_MEMORY=134217728',
    '-sMAXIMUM_MEMORY=536870912',
    '-sSTACK_SIZE=16777216',
    '-sFORCE_FILESYSTEM=1',
    '-sASYNCIFY=1',
    '-sOFFSCREENCANVAS_SUPPORT=1',
    '-sMIN_WEBGL_VERSION=2',
    '-sMAX_WEBGL_VERSION=2',
    '-sEXPORTED_FUNCTIONS=["_goose_web_run","_malloc","_free"]',
    '-sEXPORTED_RUNTIME_METHODS=["ccall","cwrap","FS","lengthBytesUTF8","stringToUTF8","setValue","getValue"]',
    `-o "${outMjs}"`,
  ].filter(Boolean).join(' ');

  try {
    execSync(`emcc ${linkFlags}`);
  } catch (err) {
    return {
      success: false,
      stage: 'emcc_link',
      error: String(err),
    };
  }

  return {
    success: true,
    outDir,
    gameMjs: outMjs,
    gameWasm: outWasm,
    wasmSize: fs.statSync(outWasm).size,
    mjsSize: fs.statSync(outMjs).size,
  };
}

module.exports = { buildProject };
