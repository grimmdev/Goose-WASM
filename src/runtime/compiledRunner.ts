/** Run real compiled Goose modules in a disposable browser document.
 * A document owns its WebGL context and DOM input; stop destroys that document.
 */
export interface RunnerOptions {
  canvas?: HTMLCanvasElement;
  onLog?: (text: string) => void;
  onError?: (err: any) => void;
  onExit?: (code: number) => void;
  args?: string[];
}
export class CompiledGooseRunner {
  private frame: HTMLIFrameElement | null = null;
  private running = false;
  private detach: (() => void) | null = null;
  private cancel: ((e: Error) => void) | null = null;
  constructor(private options: RunnerOptions = {}) {}
  run(gameMjsUrl: string, wasmUrl: string): Promise<void> {
    this.stop();
    if(typeof document==='undefined')return Promise.reject(new Error('CompiledGooseRunner requires a browser document.'));
    const moduleUrl=new URL(gameMjsUrl,document.baseURI).href, wasm=new URL(wasmUrl,document.baseURI).href;
    const frame=document.createElement('iframe');this.frame=frame;frame.title='Compiled Goose game';frame.style.border='0';frame.style.width='100%';frame.style.height='100%';
    if(this.options.canvas){frame.width=String(this.options.canvas.width);frame.height=String(this.options.canvas.height);this.options.canvas.replaceWith(frame);}
    else {frame.style.width='800px';frame.style.height='600px';document.body.append(frame);}
    this.running=true;
    const config=JSON.stringify({moduleUrl,wasm,origin:location.origin,args:this.options.args||[]}).replace(/</g,'\\u003c');
    return new Promise((resolve,reject)=>{
      this.cancel=reject;
      const receive=(event:MessageEvent)=>{
        if(event.source!==frame.contentWindow||event.origin!==location.origin||!event.data?.gooseCompiledRunner)return;
        const data=event.data;
        if(data.type==='log')this.options.onLog?.(data.text);
        if(data.type==='exit'||data.type==='error'){
          this.running=false;this.cancel=null;this.detach?.();this.detach=null;
          if(data.type==='exit'){this.options.onExit?.(data.code);resolve();}
          else {const error=new Error(data.text);this.options.onError?.(error);reject(error);}
        }
      };
      window.addEventListener('message',receive);this.detach=()=>window.removeEventListener('message',receive);
      frame.srcdoc=`<!doctype html><meta charset="utf-8"><style>html,body{margin:0;overflow:hidden}canvas{width:100%;height:auto;max-height:100vh;object-fit:contain;display:block}</style><canvas id="canvas" tabindex="0"></canvas><script type="module">
const config=${config};const send=(type,data={})=>parent.postMessage({gooseCompiledRunner:true,type,...data},config.origin);
try{
 const response=await fetch(config.wasm);if(!response.ok)throw Error('WASM fetch failed: '+response.status);
 const {default:create}=await import(config.moduleUrl);
 const mod=await create({canvas:document.querySelector('canvas'),wasmBinary:await response.arrayBuffer(),noInitialRun:true,locateFile:p=>new URL(p,config.moduleUrl).href,print:text=>send('log',{text}),printErr:text=>send('log',{text})});
 const args=['goose_game',...config.args],allocated=[],argv=mod._malloc((args.length+1)*4);allocated.push(argv);
 try{for(let i=0;i<args.length;i++){const n=mod.lengthBytesUTF8(args[i])+1,p=mod._malloc(n);allocated.push(p);mod.stringToUTF8(args[i],p,n);mod.setValue(argv+i*4,p,'i32');}mod.setValue(argv+args.length*4,0,'i32');
 document.querySelector('canvas').focus();const code=await mod.ccall('goose_web_run','number',['number','number'],[args.length,argv],{async:true});send('exit',{code});
 }finally{for(const p of allocated.reverse())mod._free(p);}
}catch(e){send('error',{text:e.stack||String(e)});}
<\/script>`;
    });
  }
  stop(): void {
    this.detach?.();this.detach=null;
    if(this.frame){if(this.options.canvas&&this.frame.isConnected)this.frame.replaceWith(this.options.canvas);else this.frame.remove();this.frame=null;}
    this.running=false;
    if(this.cancel){const cancel=this.cancel;this.cancel=null;cancel(new DOMException('Goose execution stopped','AbortError'));}
  }
  isRunning(): boolean {return this.running;}
}
