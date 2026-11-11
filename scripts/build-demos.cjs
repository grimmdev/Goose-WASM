const fs=require('fs'),path=require('path'),{buildProject}=require('../service/build-project.js');
(async()=>{
 const root=path.resolve(__dirname,'..');
 for(const [file,folder,entry] of [['27_gfx_cube.goose','g3_cube','cube'],['28_physics_boxes.goose','g5_physics','physics'],['29_ui_todo.goose','g4_ui','ui']]){
  const r=await buildProject({source:fs.readFileSync(path.join(root,'goose/samples',file),'utf8'),entryFile:`/sample_${entry}.goose`,outDir:path.join(root,'build',folder)});
  if(!r.success)throw new Error(`${file}: ${r.stage}: ${r.error}\n${r.stderr||''}`);
  console.log(`${file}: ${r.shaders.length} translated shaders; ${r.wasmSize} WASM bytes`);
 }
 const planar=await buildProject({source:fs.readFileSync(path.join(root,'examples/planar2d.goose'),'utf8'),entryFile:'/planar2d.goose',outDir:path.join(root,'build/g6_planar2d'),assets:{'checker.png':fs.readFileSync(path.join(root,'examples/assets/checker.png'))}});
 if(!planar.success)throw new Error(JSON.stringify(planar));console.log('Planar 2D demo: '+planar.wasmSize+' WASM bytes');
 await require('./build-game-samples.cjs').buildGameSamples();
})().catch(e=>{console.error(e);process.exitCode=1;});
