// Build unmodified upstream samples from pinned sources. Assets live in /assets.
const fs=require('fs'),path=require('path'),{buildProject}=require('../service/build-project.js');
async function buildGameSamples(){
 const root=path.resolve(__dirname,'..');
 for(const [file,folder,name] of [['30_mini_minecraft.goose','g7_minecraft','minecraft'],['31_mini_doom.goose','g8_doom','doom']]){
  const assets=name==='doom'?{'freedoom1-e1m1.wad':fs.readFileSync(path.join(root,'goose/samples/data/freedoom1-e1m1.wad'))}:undefined;
  const r=await buildProject({source:fs.readFileSync(path.join(root,'goose/samples',file),'utf8'),entryFile:`/sample_${name}.goose`,outDir:path.join(root,'build',folder),assets});
  if(!r.success)throw new Error(`${file}: ${r.stage}: ${r.error}\n${r.stderr||''}\n${JSON.stringify(r.diagnostics||[])}`);
  console.log(`${file}: ${r.shaders.length} shaders; ${r.wasmSize} WASM bytes`);
 }
}
if(require.main===module)buildGameSamples().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={buildGameSamples};
