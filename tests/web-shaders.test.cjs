const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {encodeWebShader,translateShaderBlobs,findTranslator}=require('../service/web-shaders.cjs');
const work=fs.mkdtempSync(path.join(os.tmpdir(),'goose-shader-test-'));
try {
 const executable=findTranslator(path.resolve(__dirname,'..'));
 assert.ok(executable,'Build SPIRV-Cross or set SPIRV_CROSS before running shader tests.');
 // SPIR-V emitted by the real pinned Goose compiler for sample 27's vertex shader.
 const spv=fs.readFileSync(path.join(__dirname,'fixtures/cube-vertex.spv'));
 const blob=Buffer.alloc(60+spv.length);blob.write('GSHD');blob.writeUInt16LE(1,4);
 blob.writeUInt16LE(1,30);blob.writeUInt32LE(60,32);blob.writeUInt32LE(spv.length,36);blob.writeUInt32LE(64,56);spv.copy(blob,60);
 const web=encodeWebShader(blob,executable,work,'valid');
 assert.equal(web.toString('ascii',0,4),'GSW2');assert.equal(web.readUInt16LE(8),1);
 assert.ok(web.subarray(web.readUInt32LE(12)).toString().startsWith('#version 300 es'));
 const c=`static const uint8_t gs_blob0[${blob.length}] = {${Array.from(blob).join(',')}};\nslice.data = ((uint8_t *)gs_blob0); slice.len = ${blob.length};`;
 const r=translateShaderBlobs(c,{executable,workDir:work});assert.equal(r.shaders.length,1);assert.ok(r.cSource.includes(`slice.len = ${web.length};`));
 const file='static const uint8_t gs_blob1[4] = {1,2,3,4};';assert.equal(translateShaderBlobs(file,{workDir:work}).cSource,file);
 assert.throws(()=>translateShaderBlobs(c,{workDir:work}),/SPIRV-Cross is required/);
 assert.throws(()=>translateShaderBlobs(c.split('\nslice')[0],{executable,workDir:work}),/slice representation changed/);
 const bad=Buffer.from(blob);bad[6]=2;assert.throws(()=>encodeWebShader(bad,executable,work,'bad'),/compute shaders/);
 bad[6]=0;bad.writeUInt32LE(blob.length+4,32);assert.throws(()=>encodeWebShader(bad,executable,work,'bad'),/damaged/);
 assert.throws(()=>encodeWebShader(blob.subarray(0,20),executable,work,'bad'),/truncated/);
 console.log('Real SPIRV-Cross translation, slice lengths, embedded data, and malformed shader checks passed.');
} finally {fs.rmSync(work,{recursive:true,force:true});}
