// A dedicated module worker owns the WASM instance and OffscreenCanvas.
// This is lifecycle isolation, not an untrusted JavaScript security sandbox.
import {projectPath,MAX_FILE_BYTES} from './projectStore';
const scope:any=self;let mod:any,started=false,seq=0,eof=false,stdin:number[]=[],stdinWait:(()=>void)|null=null;
const pending=new Map<number,{resolve:(x:any)=>void,reject:(e:any)=>void}>(),input:any[]=[];
const send=(type:string,data:any={})=>scope.postMessage({type,...data});
function request(action:string,data:any={}){if(action==='relative'&&!data.on)state.relative=false;return new Promise<any>((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});send('host',{id,action,data});});}
const state:any={relative:false,focused:true,textEnabled:false,gamepads:[],audioAhead:0};
function nativeText(fn:string,text:string,rest:any[]=[]){if(!mod[fn])return;const n=mod.lengthBytesUTF8(text)+1,p=mod._malloc(n);try{mod.stringToUTF8(text,p,n);mod[fn](p,n-1,...rest);}finally{mod._free(p);}}
const host:any={state,request,
 frame:()=>request('frame'),
 drain:()=>{for(const e of input.splice(0)){
  if(e.kind==='key')nativeText('_goose_web_key_event',e.name,[e.down,e.mods,e.repeat,e.keycode]);
  else if(e.kind==='text')nativeText('_goose_web_text',e.text);
  else if(e.kind==='pointer')mod._goose_web_pointer?.(e.type,e.x,e.y,e.button,e.down,e.dx,e.dy,e.clicks);
  else if(e.kind==='focus')mod._goose_web_focus_event?.(e.focused);
  else if(e.kind==='wheel')mod._goose_web_wheel_event?.(e.x,e.y);
 }},
 readStdin:async()=>{while(!stdin.length&&!eof){send('stdin-needed');await new Promise<void>(resolve=>stdinWait=resolve);}return stdin.splice(0,65536);},
};
function file(path:string){return '/project/'+projectPath(path);}
function observeFS(){
 const fs=mod.FS;
 const report=(path:string,deleted=false)=>{const full=fs.PATH?fs.PATH.resolve(path):path.startsWith('/')?path:fs.cwd()+'/'+path;if(!full.startsWith('/project/'))return;const name=full.slice(9);try{projectPath(name);if(deleted)send('file',{path:name,deleted:true});else{const bytes=fs.readFile(full);if(bytes.length>MAX_FILE_BYTES)throw Error('Project file exceeds 16 MiB');send('file',{path:name,bytes});}}catch(e:any){send('warning',{text:'File notification failed: '+e.message});}};
 const close=fs.close,rename=fs.rename,unlink=fs.unlink;
 fs.close=function(stream:any){const path=stream.path,writing=(stream.flags&3)!==0;const result=close.call(fs,stream);if(writing&&path)report(path);return result;};
 fs.rename=function(from:string,to:string){const result=rename.call(fs,from,to);report(to);report(from,true);return result;};
 fs.unlink=function(path:string){const result=unlink.call(fs,path);report(path,true);return result;};
}
async function run(data:any){
 if(started)throw Error('A worker can only run one game');started=true;
 const response=await fetch(data.wasmUrl);if(!response.ok)throw Error('WASM fetch failed: '+response.status);
 const {default:create}=await import(/* @vite-ignore */ data.moduleUrl);
 mod=await create({canvas:data.canvas,gooseHost:host,noInitialRun:true,wasmBinary:await response.arrayBuffer(),locateFile:(p:string)=>new URL(p,data.moduleUrl).href,
  print:(text:string)=>send('stdout',{text}),printErr:(text:string)=>send('stderr',{text}),stdin:()=>stdin.length?stdin.shift():null});
 mod.gooseHost=host;
 mod.FS.mkdirTree('/project');for(const [path,bytes] of Object.entries(data.files||{})){const target=file(path);mod.FS.mkdirTree(target.slice(0,target.lastIndexOf('/')));mod.FS.writeFile(target,bytes);}
 mod.FS.chdir('/project');observeFS();
 const args=['goose_game',...(data.args||[])],allocated:number[]=[],argv=mod._malloc((args.length+1)*4);allocated.push(argv);
 try{for(let i=0;i<args.length;i++){const n=mod.lengthBytesUTF8(args[i])+1,p=mod._malloc(n);allocated.push(p);mod.stringToUTF8(args[i],p,n);mod.setValue(argv+i*4,p,'i32');}mod.setValue(argv+args.length*4,0,'i32');
  send('running');const code=await mod.ccall('goose_web_run','number',['number','number'],[args.length,argv],{async:true});send('exit',{code});
 }finally{for(const p of allocated.reverse())mod._free(p);}
}
scope.onmessage=async(e:MessageEvent)=>{const d=e.data;
 if(d.type==='reply'){const p=pending.get(d.id);if(p){pending.delete(d.id);d.error?p.reject(new Error(d.error)):p.resolve(d.value);}return;}
 if(d.type==='input'){if(input.length<2048)input.push(d.event);return;}
 if(d.type==='state'){Object.assign(state,d.state);return;}
 if(d.type==='stdin'){for(const b of d.bytes)if(stdin.length<1048576)stdin.push(b);eof=eof||!!d.eof;stdinWait?.();stdinWait=null;return;}
 if(d.type==='audio-pull'){if(mod?._goose_web_audio_mix){const frames=d.frames,p=mod._malloc(frames*8);try{mod._goose_web_audio_mix(p,frames);const bytes=mod.HEAPF32?mod.HEAPF32.slice(p>>2,(p>>2)+frames*2):new Float32Array(mod.HEAPU8.buffer,p,frames*2).slice();scope.postMessage({type:'audio-data',generation:d.generation,bytes},[bytes.buffer]);}finally{mod._free(p);}}return;}
 if(d.type==='file-command'){try{if(!mod)throw Error('Runtime is not loaded');let value:any;const path=d.path?file(d.path):'';
  if(d.action==='read')value=mod.FS.readFile(path);else if(d.action==='write'){if(d.bytes.length>MAX_FILE_BYTES)throw Error('File exceeds 16 MiB');mod.FS.mkdirTree(path.slice(0,path.lastIndexOf('/')));mod.FS.writeFile(path,d.bytes);value=true;}else if(d.action==='delete'){mod.FS.unlink(path);value=true;}else if(d.action==='list'){const list:string[]=[];const walk=(dir:string)=>{for(const n of mod.FS.readdir(dir)){if(n==='.'||n==='..')continue;const p=dir+'/'+n;if(mod.FS.isDir(mod.FS.stat(p).mode))walk(p);else list.push(p.slice(9));}};walk('/project');value=list;}send('file-reply',{id:d.id,value});}catch(error:any){send('file-reply',{id:d.id,error:error.message});}return;}
 if(d.type==='start')try{Object.assign(state,d.state);await run(d);}catch(error:any){send('error',{text:error.stack||String(error)});}
};
