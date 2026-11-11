// Translate compiler-emitted shader DATA, never Goose source or shader syntax.
// Upstream GSHD v1 -> SPIR-V -> SPIRV-Cross -> bounded GSW2 runtime envelope.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function checkedTool(executable, args) {
  const r = spawnSync(executable, args, { encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024 });
  if (r.error || r.status !== 0) throw new Error(`SPIRV-Cross failed: ${r.error?.message || r.stderr || r.stdout}`);
  return r.stdout;
}
function encodeWebShader(blob, executable, workDir, name) {
  if (blob.length < 56 || blob.toString('ascii', 0, 4) !== 'GSHD' || blob.readUInt16LE(4) !== 1)
    throw new Error(`${name}: unsupported or truncated GSHD shader`);
  const stage = blob[6], count = blob[7], uniforms = blob.readUInt16LE(30);
  if (stage > 1) throw new Error(`${name}: compute shaders are unsupported by WebGL2`);
  for (let at = 22; at < 30; at += 2) if (blob.readUInt16LE(at)) throw new Error(`${name}: storage shader resources require a different backend`);
  const offset = blob.readUInt32LE(32), size = blob.readUInt32LE(36);
  if (count > 16 || uniforms > 16 || 56 + uniforms * 4 + count * 2 > offset || size % 4 || offset + size > blob.length || size < 20)
    throw new Error(`${name}: damaged shader package`);
  const spv = blob.subarray(offset, offset + size);
  if (spv.readUInt32LE(0) !== 0x07230203) throw new Error(`${name}: invalid SPIR-V magic`);
  const input = path.join(workDir, `${name}.spv`), output = path.join(workDir, `${name}.gles`);
  fs.writeFileSync(input, spv);
  const reflection = JSON.parse(checkedTool(executable, [input, '--reflect']));
  checkedTool(executable, [input, '--es', '--version', '300', '--fixup-clipspace', '--flip-vert-y', '--output', output]);
  const source = fs.readFileSync(output);
  if (!source.toString().startsWith('#version 300 es')) throw new Error(`${name}: translator did not produce GLSL ES 3.00`);
  const ubos = reflection.ubos || [], samplers = reflection.textures || [];
  if (ubos.length !== uniforms || samplers.length !== blob.readUInt16LE(20)) throw new Error(`${name}: shader reflection disagrees with compiler package`);
  if ((reflection.separate_images || []).length || (reflection.separate_samplers || []).length)
    throw new Error(`${name}: separate image/sampler resources are unsupported`);
  const chunks = [Buffer.alloc(20), blob.subarray(56 + uniforms * 4, 56 + uniforms * 4 + count * 2)];
  for (const u of ubos) {
    const text = Buffer.from(u.name, 'utf8'), record = Buffer.alloc(8);
    if (u.binding >= 16 || u.block_size <= 0 || text.length > 255 || text.includes(0)) throw new Error(`${name}: invalid uniform reflection`);
    record.writeUInt16LE(u.binding, 0); record.writeUInt32LE(u.block_size, 2); record.writeUInt16LE(text.length, 6);
    chunks.push(record, text);
  }
  for (const s of samplers) {
    const text = Buffer.from(s.name, 'utf8'), record = Buffer.alloc(4);
    if (s.binding >= 16 || text.length > 255 || text.includes(0)) throw new Error(`${name}: invalid sampler reflection`);
    record.writeUInt16LE(s.binding, 0); record.writeUInt16LE(text.length, 2); chunks.push(record, text);
  }
  const header = chunks[0], sourceOffset = chunks.reduce((n, b) => n + b.length, 0);
  header.write('GSW2'); header.writeUInt16LE(2, 4); header[6] = stage; header[7] = count;
  header.writeUInt16LE(ubos.length, 8); header.writeUInt16LE(samplers.length, 10);
  header.writeUInt32LE(sourceOffset, 12); header.writeUInt32LE(source.length, 16);
  return Buffer.concat([...chunks, source]);
}
function translateShaderBlobs(cSource, { executable, workDir }) {
  fs.mkdirSync(workDir, { recursive: true });
  const changes = [];
  const rewritten = cSource.replace(/static const uint8_t (gs_blob\w+)\[(\d+)\] = \{([\s\S]*?)\};/g, (whole, name, size, initializer) => {
    if (!/^\s*(?:\d+\s*,\s*)*\d*\s*$/.test(initializer)) throw new Error(`${name}: unexpected compiler blob initializer`);
    const values = initializer.match(/\d+/g) || [];
    if (values.length !== Number(size) || values.some(v => Number(v) > 255)) throw new Error(`${name}: invalid blob byte count`);
    const blob = Buffer.from(values.map(Number));
    if (blob.toString('ascii', 0, 4) !== 'GSHD') return whole; // embed_file stays byte-exact.
    if (!executable) throw new Error('SPIRV-Cross is required. Run npm run build:shader-tools or set SPIRV_CROSS.');
    const web = encodeWebShader(blob, executable, workDir, name);
    changes.push({ name, oldSize: Number(size), newSize: web.length });
    const lines = [];
    for (let i = 0; i < web.length; i += 24) lines.push('    ' + Array.from(web.subarray(i, i + 24)).join(', ') + ',');
    return `static const uint8_t ${name}[${web.length}] = {\n${lines.join('\n')}\n};`;
  });
  let result = rewritten;
  for (const c of changes) {
    let uses = 0;
    const pattern = new RegExp(`(\\(\\(uint8_t \\*\\)${c.name}\\),\\s*)${c.oldSize}\\b`, 'g');
    result = result.replace(pattern, (_, prefix) => { uses++; return prefix + c.newSize; });
    const assigned = new RegExp(`(\\b([A-Za-z_]\\w*)\\.data\\s*=\\s*\\(\\(uint8_t \\*\\)${c.name}\\);\\s*\\2\\.len\\s*=\\s*)${c.oldSize}\\b`, 'g');
    result = result.replace(assigned, (_, prefix) => { uses++; return prefix + c.newSize; });
    if (!uses) throw new Error(`${c.name}: compiler shader-slice representation changed; refusing unsafe rewrite`);
  }
  return { cSource: result, shaders: changes };
}
function findTranslator(root) {
  if (process.env.SPIRV_CROSS) return process.env.SPIRV_CROSS;
  return ['build/tools/spirv-cross', 'build/tools/spirv-cross.exe', 'build/tools/cross/spirv-cross', 'build/tools/cross/Release/spirv-cross.exe']
    .map(p => path.join(root, p)).find(p => fs.existsSync(p));
}
module.exports = { translateShaderBlobs, encodeWebShader, findTranslator };
