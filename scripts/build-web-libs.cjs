const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('=== Compiling Native Web Libraries for Goose-WASM ===');

const baseDir = path.resolve(__dirname, '..');
const webLibsDir = path.join(baseDir, 'build', 'web-libs');
fs.mkdirSync(webLibsDir, { recursive: true });

// 1. Compile libbox3d.a
console.log('1. Building libbox3d.a...');
const boxDir = 'P:/Repositories/Apps/goose_physics/third_party/box3d';
const boxSrcDir = path.join(boxDir, 'src');
const boxFiles = fs.readdirSync(boxSrcDir).filter(f => f.endsWith('.c') && f !== 'timer.c');
const boxObjs = [];

for (const f of boxFiles) {
  const cPath = path.join(boxSrcDir, f);
  const oPath = path.join(webLibsDir, f.replace('.c', '.o'));
  execSync(`emcc -std=gnu17 -O2 -w -DBOX3D_DISABLE_SIMD -I"${boxDir}/include" -I"${boxSrcDir}" -c "${cPath}" -o "${oPath}"`);
  boxObjs.push(`"${oPath}"`);
}

const serialO = path.join(webLibsDir, 'box3d_serial.o');
execSync(`emcc -std=gnu17 -O2 -w -I"${boxDir}/include" -I"${boxSrcDir}" -c "${path.join(baseDir, 'platform', 'web', 'box3d_serial.c')}" -o "${serialO}"`);
boxObjs.push(`"${serialO}"`);

const libBox3d = path.join(webLibsDir, 'libbox3d.a');
execSync(`emar rcs "${libBox3d}" ${boxObjs.join(' ')}`);
console.log('✓ Built libbox3d.a (' + fs.statSync(libBox3d).size + ' bytes)');

// 2. Compile libgoose_physics_web.a
console.log('2. Building libgoose_physics_web.a...');
const physDir = 'P:/Repositories/Apps/goose_physics';
const physSrcDir = path.join(physDir, 'src');
const physFiles = fs.readdirSync(physSrcDir).filter(f => f.endsWith('.c'));
const physObjs = [];

for (const f of physFiles) {
  const cPath = path.join(physSrcDir, f);
  const oPath = path.join(webLibsDir, 'phys_' + f.replace('.c', '.o'));
  execSync(`emcc -std=gnu17 -O2 -w -DBOX3D_DISABLE_SIMD -I"${boxDir}/include" -I"${physSrcDir}" -c "${cPath}" -o "${oPath}"`);
  physObjs.push(`"${oPath}"`);
}

const libPhys = path.join(webLibsDir, 'libgoose_physics_web.a');
execSync(`emar rcs "${libPhys}" ${physObjs.join(' ')}`);
console.log('✓ Built libgoose_physics_web.a (' + fs.statSync(libPhys).size + ' bytes)');

// 3. Compile libgoose_ui_web.a
console.log('3. Building libgoose_ui_web.a...');
const gfxDir = 'P:/Repositories/Apps/goose_gfx';
const nuklearDir = path.join(gfxDir, 'third_party', 'nuklear');
const uiSrcDir = path.join(gfxDir, 'src', 'ui');
const uiFiles = fs.readdirSync(uiSrcDir).filter(f => f.endsWith('.c'));
const uiObjs = [];

for (const f of uiFiles) {
  const cPath = path.join(uiSrcDir, f);
  const oPath = path.join(webLibsDir, 'ui_' + f.replace('.c', '.o'));
  execSync(`emcc -std=gnu11 -O2 -w -I"${nuklearDir}" -I"${uiSrcDir}" -c "${cPath}" -o "${oPath}"`);
  uiObjs.push(`"${oPath}"`);
}

const libUi = path.join(webLibsDir, 'libgoose_ui_web.a');
execSync(`emar rcs "${libUi}" ${uiObjs.join(' ')}`);
console.log('✓ Built libgoose_ui_web.a (' + fs.statSync(libUi).size + ' bytes)');

console.log('=== All Gate G2 Web Libraries Compiled Successfully! ===');

