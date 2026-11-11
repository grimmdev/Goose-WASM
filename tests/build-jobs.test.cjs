const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{buildProject}=require('../service/build-project.js');
(async()=>{
 const root=path.resolve(__dirname,'..'),dir=path.join(root,'build/job-cancel');
 const controller=new AbortController();
 const cancelled=await buildProject({source:'fn main() {}',outDir:dir,signal:controller.signal,onStage:stage=>{if(stage==='transpile')controller.abort();}});
 assert.equal(cancelled.stage,'cancelled');assert.equal(cancelled.success,false);assert.ok(!fs.existsSync(path.join(dir,'game.wasm')));
 const timed=await buildProject({source:'fn main() {}',outDir:dir,timeoutMs:1});assert.equal(timed.stage,'timeout');
 const first=buildProject({source:'fn main() {}',outDir:dir,timeoutMs:10000});const second=await buildProject({source:'fn main() {}',outDir:dir});assert.equal(second.stage,'busy');assert.equal((await first).success,true);
 console.log('Build jobs: abort, deadline, exclusive outputs and successful rebuild passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
