const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('=== Compiling libgoose_gfx_web.a (Gate G3) ===');

const base = path.resolve(__dirname, '..');
const outDir = path.join(base, 'build', 'web-libs');
const files = ['gfx_device.c', 'gfx_resources.c', 'gfx_pipeline.c', 'gfx_draw.c', 'gfx_input.c'];
const objs = [];

for (const f of files) {
  const cPath = path.join(base, 'platform', 'web', f);
  const oPath = path.join(outDir, f.replace('.c', '.o'));
  execSync(`emcc -std=gnu11 -O2 -w -I"${path.join(base, 'platform', 'include')}" -I"${path.join(base, 'platform', 'web')}" -c "${cPath}" -o "${oPath}"`);
  objs.push(`"${oPath}"`);
}

const libGfx = path.join(outDir, 'libgoose_gfx_web.a');
execSync(`emar rcs "${libGfx}" ${objs.join(' ')}`);
console.log('✓ Successfully built', libGfx, '(' + fs.statSync(libGfx).size + ' bytes)');
console.log('=== Gate G3 GFX Library Completed! ===');

