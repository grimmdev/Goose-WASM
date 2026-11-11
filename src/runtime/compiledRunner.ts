import {ProjectStore,projectPath,MAX_FILE_BYTES} from './projectStore';
import {MouseCapture,PointerLockStatus} from './pointerLock';
import {InputMixer,VirtualInput} from './virtualInput';
export type {VirtualInput,VirtualMouseMove} from './virtualInput';
export interface RunnerOptions {
 canvas?:HTMLCanvasElement;args?:string[];workerUrl?:string;projectId?:string;
 files?:Record<string,Uint8Array|string>;loadTimeoutMs?:number;executionTimeoutMs?:number;
 onLog?:(text:string)=>void;onStdout?:(text:string)=>void;onStderr?:(text:string)=>void;
 onError?:(error:Error)=>void;onWarning?:(text:string)=>void;onExit?:(code:number)=>void;
 onStatus?:(status:'loading'|'running'|'exited'|'stopped'|'error')=>void;
 onFile?:(path:string,bytes:Uint8Array|null)=>void;onStdinRequested?:()=>void;onTitle?:(title:string)=>void;
 onPointerLockChange?:(status:PointerLockStatus,message?:string)=>void;
}
/** Dedicated-worker execution. Stop can terminate even a non-yielding program. */
export class CompiledGooseRunner {
 private worker:Worker|null=null;private running=false;private generation=0;
 private text:HTMLTextAreaElement|null=null;private canvas:HTMLCanvasElement|null=null;private original:HTMLCanvasElement|null=null;
 private remove:(()=>void)[]=[];private timers:any[]=[];private frames=new Set<number>();
 private cancelPreparation:((error:Error)=>void)|null=null;private stdinClosed=false;
 private finish:((error?:Error,code?:number)=>void)|null=null;
 private store:ProjectStore|null=null;private writes:Promise<void>=Promise.resolve();
 private requests=new Map<number,{resolve:(x:any)=>void,reject:(e:Error)=>void,timer:any}>();private seq=0;
 private audio:any=null;private audioGeneration=0;
 private capture:MouseCapture|null=null;
 private inputs:InputMixer;
 private host={relative:false,wantsRelative:false,textEnabled:false,focused:true,width:640,height:480};
 constructor(private options:RunnerOptions={}){this.inputs=new InputMixer(event=>this.post({type:'input',event}),()=>{if(!this.worker||!this.running)throw Error('Virtual input requires a running game');},()=>{if(!this.host.focused){this.canvas?.focus({preventScroll:true});if(!this.host.focused){this.host.focused=true;this.state({focused:true});this.input({kind:'focus',focused:1});}}},()=>this.virtualRelativeChanged());}
 createVirtualInput():VirtualInput{return this.inputs.create();}
 private relative(){return this.host.relative||this.host.focused&&this.host.wantsRelative&&this.inputs.relative;}
 private virtualRelativeChanged(){this.capture?.setWanted(this.host.wantsRelative&&!this.inputs.relative);this.state({relative:this.relative()});}
 private post(data:any,transfer:Transferable[]=[]){this.worker?.postMessage(data,transfer);}
 private input(event:any){this.inputs.physicalEvent(event);}
 private state(state:any){this.post({type:'state',state});}
 private reply(id:number,value?:any,error?:string){this.post({type:'reply',id,value,error});}
 private listen(target:EventTarget,type:string,fn:any,options?:any){target.addEventListener(type,fn,options);this.remove.push(()=>target.removeEventListener(type,fn,options));}
 private audioClose(){const a=this.audio;if(!a)return;this.audio=null;this.audioGeneration++;clearInterval(a.timer);for(const s of a.sources){try{s.stop();s.disconnect();}catch{}}a.ctx.close().catch(()=>{});}
 private audioData(data:any){const a=this.audio;if(!a||data.generation!==this.audioGeneration)return;a.pending=Math.max(0,a.pending-1);if(a.ctx.state!=='running')return;
  const frames=data.bytes.length/2,buffer=a.ctx.createBuffer(2,frames,a.rate);for(let c=0;c<2;c++){const out=buffer.getChannelData(c);for(let i=0;i<frames;i++)out[i]=data.bytes[i*2+c];}
  const source=a.ctx.createBufferSource();source.buffer=buffer;source.connect(a.ctx.destination);a.sources.add(source);source.onended=()=>{a.sources.delete(source);source.disconnect();};a.next=Math.max(a.next,a.ctx.currentTime);source.start(a.next);a.next+=frames/a.rate;
 }
 private async audioOpen(rate:number){this.audioClose();const Context=globalThis.AudioContext||(globalThis as any).webkitAudioContext;if(!Context)return false;
  const ctx=new Context({sampleRate:rate}),generation=++this.audioGeneration;
  const a=this.audio={ctx,rate,next:0,pending:0,sources:new Set<AudioBufferSourceNode>(),timer:null};
  a.timer=setInterval(()=>{if(this.audio!==a||ctx.state!=='running')return;const ahead=Math.max(0,a.next-ctx.currentTime);this.state({audioAhead:ahead*rate});if(ahead+a.pending*1024/rate<0.08&&a.pending<4){a.pending++;this.post({type:'audio-pull',frames:1024,generation});}},15);return true;
 }
 private resumeAudio(){this.audio?.ctx.resume().catch((e:any)=>this.options.onWarning?.('Audio resume denied: '+e.message));}
 private gamepads(){return this.host.focused?this.inputs.gamepads(Array.from(navigator.getGamepads?.()||[])):Array(4).fill(null);}
 private async action(id:number,action:string,data:any,run:number){
  try{let value:any=true;
   if(action==='frame'){const frame=requestAnimationFrame(()=>{this.frames.delete(frame);if(run===this.generation){this.state({gamepads:this.gamepads(),relative:this.relative()});this.reply(id,true);}});this.frames.add(frame);return;}
   if(action==='canvas-size'){this.host.width=data.width;this.host.height=data.height;if(this.canvas)this.canvas.style.aspectRatio=`${data.width}/${data.height}`;}
   else if(action==='title'){this.options.onTitle?.(data.title);this.canvas?.setAttribute('aria-label',data.title);}
   else if(action==='relative'){this.host.wantsRelative=!!data.on;this.capture?.setWanted(!!data.on&&!this.inputs.relative);value=data.on?this.host.focused&&(this.inputs.relative||!!(await this.capture?.request())):true;this.state({relative:this.relative()});}
   else if(action==='cursor'){if(this.canvas)this.canvas.style.cursor=data.visible?'':'none';}
   else if(action==='text'){this.host.textEnabled=!!data.on;const text=this.text;if(data.on)text?.focus({preventScroll:true});else this.canvas?.focus({preventScroll:true});}
   else if(action==='clipboard-read')value=await navigator.clipboard.readText();
   else if(action==='clipboard-write')await navigator.clipboard.writeText(data.text);
   else if(action==='rumble'){const p=navigator.getGamepads?.()[data.slot],act=(p as any)?.vibrationActuator;value=!!act&&(await act.playEffect('dual-rumble',{duration:data.ms,strongMagnitude:data.low,weakMagnitude:data.high}))==='complete';}
   else if(action==='audio-open')value=await this.audioOpen(data.rate);
   else if(action==='audio-close')this.audioClose();
   else throw Error('Unknown host action: '+action);
   if(run===this.generation)this.reply(id,value);
  }catch(e:any){if(run===this.generation)this.reply(id,undefined,e.message);}
 }
 private mountInput(run:number){const c=this.canvas;if(!c)return;
  const text=this.text=document.createElement('textarea');text.dataset.gooseRun=String(run);text.setAttribute('aria-label','Goose text input');text.style.cssText='position:fixed;width:1px;height:1px;opacity:0;left:0;top:0;pointer-events:none';document.body.append(text);this.remove.push(()=>text.remove());c.style.touchAction='none';c.tabIndex=0;
  this.capture=new MouseCapture(c,locked=>{this.host.relative=locked;this.state({relative:this.relative()});},(status,message)=>{this.options.onPointerLockChange?.(status,message);if(status==='blocked')this.options.onWarning?.(message||'Mouse capture blocked');});
  const focus=(on:boolean)=>{this.host.focused=on;this.state({focused:on});this.input({kind:'focus',focused:on?1:0});if(!on){this.host.wantsRelative=false;this.capture?.setWanted(false);c.style.cursor='';}};
  this.listen(document,'focusin',(e:FocusEvent)=>focus(e.target===c||e.target===text));this.listen(window,'blur',()=>focus(false));this.listen(document,'visibilitychange',()=>{if(document.hidden)focus(false);});
  const point=(e:MouseEvent)=>{const r=c.getBoundingClientRect(),scale=Math.min(r.width/this.host.width,r.height/this.host.height)||1;return {x:(e.clientX-r.left-(r.width-this.host.width*scale)/2)/scale,y:(e.clientY-r.top-(r.height-this.host.height*scale)/2)/scale,dx:(e.movementX||0)/scale,dy:(e.movementY||0)/scale};};
  this.listen(c,'pointerdown',(e:PointerEvent)=>{if(!e.isPrimary)return;e.preventDefault();this.resumeAudio();(this.host.textEnabled?text:c).focus({preventScroll:true});if(this.host.wantsRelative&&!this.inputs.relative)void this.capture?.request();if(document.pointerLockElement!==c)try{c.setPointerCapture(e.pointerId);}catch{}this.input({kind:'pointer',type:4,...point(e),button:e.pointerType==='mouse'?e.button+1:1,down:1,clicks:e.detail||1});});
  this.listen(c,'pointermove',(e:PointerEvent)=>{if(e.isPrimary&&document.pointerLockElement!==c){e.preventDefault();this.input({kind:'pointer',type:3,...point(e),button:0,down:0,clicks:0});}});
  // Pointer Lock guarantees mousemove. Some engines do not deliver pointermove
  // while locked. Use exactly one path so movement is never counted twice.
  this.listen(document,'mousemove',(e:MouseEvent)=>{if(document.pointerLockElement===c)this.input({kind:'pointer',type:3,...point(e),button:0,down:0,clicks:0});});
  this.listen(c,'pointerup',(e:PointerEvent)=>{if(!e.isPrimary)return;e.preventDefault();this.input({kind:'pointer',type:4,...point(e),button:e.pointerType==='mouse'?e.button+1:1,down:0,clicks:e.detail||1});if(!e.buttons&&c.hasPointerCapture(e.pointerId))c.releasePointerCapture(e.pointerId);});
  for(const name of ['pointercancel','lostpointercapture'])this.listen(c,name,(e:PointerEvent)=>this.input({kind:'pointer',type:9,...point(e),button:0,down:0,clicks:0}));
  for(const [name,down] of [['pointerenter',1],['pointerleave',0]] as const)this.listen(c,name,(e:PointerEvent)=>this.input({kind:'pointer',type:8,...point(e),button:0,down,clicks:0}));
  this.listen(c,'contextmenu',(e:Event)=>e.preventDefault());this.listen(c,'wheel',(e:WheelEvent)=>{e.preventDefault();const divisor=e.deltaMode===0?100:e.deltaMode===1?3:1;this.input({kind:'wheel',x:-e.deltaX/divisor,y:-e.deltaY/divisor});},{passive:false});
  const keyName=(e:KeyboardEvent)=>{const code=e.code;if(code.startsWith('Key'))return code.slice(3);if(code.startsWith('Digit'))return code.slice(5);
   const names:any={Enter:'Return',Space:'Space',ShiftLeft:'Left Shift',ShiftRight:'Right Shift',ControlLeft:'Left Ctrl',ControlRight:'Right Ctrl',AltLeft:'Left Alt',AltRight:'Right Alt',MetaLeft:'Left GUI',MetaRight:'Right GUI',Minus:'-',Equal:'=',BracketLeft:'[',BracketRight:']',Backslash:'\\',Semicolon:';',Quote:"'",Backquote:'`',Comma:',',Period:'.',Slash:'/',NumpadEnter:'Keypad Enter',NumpadAdd:'Keypad +',NumpadSubtract:'Keypad -',NumpadMultiply:'Keypad *',NumpadDivide:'Keypad /',NumpadDecimal:'Keypad .'};
   return names[code]||(code.startsWith('Numpad')?'Keypad '+code.slice(6):code.startsWith('Arrow')?code.slice(5):e.key);
  };
  for(const type of ['keydown','keyup'])this.listen(window,type,(e:KeyboardEvent)=>{if(document.activeElement!==c&&document.activeElement!==text)return;this.resumeAudio();this.input({kind:'key',name:keyName(e),down:type==='keydown'?1:0,mods:(e.shiftKey?1:0)|(e.ctrlKey?2:0)|(e.altKey?4:0)|(e.metaKey?8:0),repeat:e.repeat?1:0,keycode:e.keyCode});if(e.code.startsWith('Arrow')||['Tab','Escape','F5','F9','F12'].includes(e.code))e.preventDefault();});
  this.listen(text,'input',(e:InputEvent)=>{if(!e.isComposing){this.input({kind:'text',text:text.value});text.value='';}});this.listen(text,'compositionend',()=>{this.input({kind:'text',text:text.value});text.value='';});c.focus({preventScroll:true});
 }
 private cleanup(){this.inputs.reset();for(const t of this.timers)clearTimeout(t);this.timers=[];for(const id of this.frames)cancelAnimationFrame(id);this.frames.clear();this.capture?.dispose();this.capture=null;for(const remove of this.remove.splice(0))remove();this.audioClose();if(typeof document!=='undefined'&&document.pointerLockElement===this.canvas)document.exitPointerLock();this.worker?.terminate();this.worker=null;
  if(this.canvas&&this.original&&this.canvas.isConnected)this.canvas.replaceWith(this.original);this.canvas=null;this.original=null;this.text=null;
  for(const r of this.requests.values()){clearTimeout(r.timer);r.reject(new Error('Runtime stopped'));}this.requests.clear();
 }
 async run(moduleUrl:string,wasmUrl:string):Promise<void>{
  if(typeof Worker==='undefined'||typeof document==='undefined')throw Error('CompiledGooseRunner requires browser workers');this.stop();
  const run=++this.generation,options=this.options;let store:ProjectStore|null=null;let launched=false;
  options.onStatus?.('loading');this.stdinClosed=false;this.host.textEnabled=false;this.host.focused=true;
  try{
   const preparation=new Promise<never>((_,reject)=>this.cancelPreparation=reject);
   const prepTimer=setTimeout(()=>this.cancelPreparation?.(new Error('Project loading timed out')),options.loadTimeoutMs??30000);this.timers.push(prepTimer);
   await Promise.race([this.writes,preparation]);
   if(options.projectId)store=this.store||new ProjectStore(options.projectId);this.store=store;const files=store?await Promise.race([store.files(),preparation]):Object.create(null);
   for(const [path,value] of Object.entries(options.files||{})){projectPath(path);const bytes=typeof value==='string'?new TextEncoder().encode(value):value;if(bytes.length>MAX_FILE_BYTES)throw Error('Initial file exceeds 16 MiB');files[path]=bytes;if(store)await Promise.race([store.write(path,bytes),preparation]);}
   clearTimeout(prepTimer);this.cancelPreparation=null;
   if(run!==this.generation)throw new DOMException('Run cancelled','AbortError');
   let offscreen:OffscreenCanvas|undefined;
   if(options.canvas){if(!options.canvas.transferControlToOffscreen)throw Error('OffscreenCanvas is required for worker graphics');this.original=options.canvas;const c=options.canvas.cloneNode(false) as HTMLCanvasElement;this.original.replaceWith(c);this.canvas=c;this.host.width=c.width;this.host.height=c.height;offscreen=c.transferControlToOffscreen();this.mountInput(run);}
   this.host.relative=false;this.host.wantsRelative=false;this.running=true;launched=true;
   return await new Promise<void>((resolve,reject)=>{
    const finish=(error?:Error,code?:number)=>{if(this.finish!==finish)return;this.finish=null;this.running=false;this.cleanup();const writes=this.writes;
     writes.then(()=>{if(error){options.onStatus?.(error.name==='AbortError'?'stopped':'error');if(error.name!=='AbortError')options.onError?.(error);reject(error);}else{options.onStatus?.('exited');options.onExit?.(code||0);resolve();}}).catch(reject);
    };this.finish=finish;
    const url=options.workerUrl||new URL('./compiled.worker.mjs',import.meta.url).href;
    let worker:Worker;try{worker=this.worker=new Worker(url,{type:'module'});}catch(error){finish(error as Error);return;}this.listen(window,'pagehide',()=>this.stop(),{once:true});worker.onerror=e=>finish(new Error(e.message||'Worker startup failed'));worker.onmessageerror=()=>finish(new Error('Worker message decoding failed'));
    const loadTimer=setTimeout(()=>finish(new Error('Runtime loading timed out')),options.loadTimeoutMs??30000);this.timers.push(loadTimer);
    worker.onmessage=e=>{if(run!==this.generation)return;const d=e.data;
     if(d.type==='running'){clearTimeout(loadTimer);options.onStatus?.('running');if(options.executionTimeoutMs)this.timers.push(setTimeout(()=>finish(new Error('Execution timed out')),options.executionTimeoutMs));}
     else if(d.type==='exit')finish(undefined,d.code);
     else if(d.type==='error')finish(new Error(d.text));
     else if(d.type==='stdout'){options.onStdout?.(d.text);options.onLog?.(d.text);}
     else if(d.type==='stderr'){options.onStderr?.(d.text);options.onLog?.(d.text);}
     else if(d.type==='warning')options.onWarning?.(d.text);
     else if(d.type==='stdin-needed')options.onStdinRequested?.();
     else if(d.type==='host')void this.action(d.id,d.action,d.data,run);
     else if(d.type==='audio-data')this.audioData(d);
     else if(d.type==='file'){const bytes=d.deleted?null:new Uint8Array(d.bytes);options.onFile?.(d.path,bytes);if(store)this.writes=this.writes.then(()=>bytes?store!.write(d.path,bytes):store!.remove(d.path)).catch(error=>{options.onWarning?.('File persistence failed: '+error.message);});}
     else if(d.type==='file-reply'){const r=this.requests.get(d.id);if(r){clearTimeout(r.timer);this.requests.delete(d.id);d.error?r.reject(new Error(d.error)):r.resolve(d.value);}}
    };
    const support=document.createElement('canvas').getContext('webgl2');const webgl2=!!support;support?.getExtension('WEBGL_lose_context')?.loseContext();
    this.post({type:'start',moduleUrl:new URL(moduleUrl,document.baseURI).href,wasmUrl:new URL(wasmUrl,document.baseURI).href,canvas:offscreen,files,args:options.args||[],state:{webgl2,audioAvailable:typeof AudioContext!=='undefined',focused:true,relative:false,gamepads:this.gamepads()}},offscreen?[offscreen]:[]);
   });
  }catch(error:any){if(this.worker)this.cleanup();if(!launched){this.cleanup();options.onStatus?.(error.name==='AbortError'?'stopped':'error');if(error.name!=='AbortError')options.onError?.(error);}this.cancelPreparation=null;throw error;}
 }
 stop(){this.cancelPreparation?.(new DOMException('Goose loading stopped','AbortError'));this.cancelPreparation=null;this.generation++;const finish=this.finish;if(finish)finish(new DOMException('Goose execution stopped','AbortError'));else this.cleanup();this.running=false;}
 isRunning(){return this.running;}
 writeStdin(text:string|Uint8Array){if(!this.worker||this.stdinClosed)throw Error('stdin is closed or runtime is not running');const bytes=typeof text==='string'?new TextEncoder().encode(text):text;if(bytes.length>65536)throw Error('stdin writes are limited to 64 KiB');this.post({type:'stdin',bytes});}
 closeStdin(){this.stdinClosed=true;this.post({type:'stdin',bytes:new Uint8Array(),eof:true});}
 private command(action:string,path?:string,bytes?:Uint8Array){if(path)projectPath(path);if(!this.worker)return Promise.reject(new Error('Runtime is not running'));return new Promise<any>((resolve,reject)=>{const id=++this.seq,timer=setTimeout(()=>{this.requests.delete(id);reject(new Error('File request timed out; program may not be yielding'));},5000);this.requests.set(id,{resolve,reject,timer});this.post({type:'file-command',id,action,path,bytes});});}
 readFile(path:string):Promise<Uint8Array>{return this.command('read',path);}
 writeFile(path:string,bytes:Uint8Array|string):Promise<void>{const data=typeof bytes==='string'?new TextEncoder().encode(bytes):bytes;if(data.length>MAX_FILE_BYTES)return Promise.reject(new Error('File exceeds 16 MiB'));return this.command('write',path,data);}
 deleteFile(path:string):Promise<void>{return this.command('delete',path);}
 listFiles():Promise<string[]>{return this.command('list');}
 async flushFiles(){await this.writes;}
 async dispose(){this.stop();await this.writes;await this.store?.close();this.store=null;}
}
