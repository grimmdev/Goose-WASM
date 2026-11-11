// One isolated process per compiler job. Cancellation terminates the compiler
// and its subprocess tree, including a non-yielding Goose compiler invocation.
const path=require('path'),fs=require('fs'),{fork,execFile}=require('child_process');
const active=new Set();
async function buildProject(options){
 const outDir=path.resolve(options.outDir||path.join(__dirname,'../build/out'));
 if(options.signal?.aborted)return {success:false,stage:'cancelled',error:'Build cancelled'};
 if(active.has(outDir))return {success:false,stage:'busy',error:'Another build owns this output directory'};
 active.add(outDir);
 return new Promise(resolve=>{
  let result,done=false,stopping=false,stage='starting',timer;
  const {signal,onStage,timeoutMs=300000,...data}=options;
  let child;try{child=fork(path.join(__dirname,'build-job.cjs'),[],{stdio:['ignore','ignore','pipe','ipc'],serialization:'advanced',detached:process.platform!=='win32'});}catch(error){active.delete(outDir);resolve({success:false,stage,error:error.message});return;}
  let stderr='';child.stderr.on('data',b=>{if(stderr.length<65536)stderr+=b.toString();});
  const kill=()=>{if(!child.pid)return;if(process.platform==='win32')execFile('taskkill',['/PID',String(child.pid),'/T','/F'],()=>{});else try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}};
  const stop=(kind,message)=>{if(done)return;stopping=true;result={success:false,stage:kind,error:message};kill();};
  const abort=()=>stop('cancelled','Build cancelled');signal?.addEventListener('abort',abort,{once:true});
  if(timeoutMs>0)timer=setTimeout(()=>stop('timeout','Build exceeded its time limit'),timeoutMs);
  child.on('message',m=>{if(stopping)return;if(m.type==='stage'){stage=m.stage;try{onStage?.(stage);}catch(e){stop('callback',e.message);}}else if(m.type==='result')result=m.result;});
  child.on('error',e=>{if(stopping)return;result={success:false,stage,error:e.message};});
  child.on('close',()=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);active.delete(outDir);
   if(!result)result={success:false,stage,error:'Build worker exited without a result',stderr};
   if(!result.success)for(const file of ['game.mjs','game.wasm'])try{fs.unlinkSync(path.join(outDir,file));}catch{}
   resolve(result);
  });
  try{child.send({options:{...data,outDir}});}catch(error){stop('input',error.message);}if(signal?.aborted)abort();
 });
}
module.exports={buildProject};
