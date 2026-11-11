export interface VirtualMouseMove {x?:number;y?:number;dx?:number;dy?:number}
export interface VirtualInput {
 keyDown(key:string):void;keyUp(key:string):void;
 moveMouse(motion:VirtualMouseMove):void;mouseButton(button:number,down:boolean):void;
 scroll(x:number,y:number):void;text(value:string):void;
 setRelativeMouse(enabled:boolean):void;
 connectGamepad(slot:number):void;disconnectGamepad(slot:number):void;
 gamepadAxis(slot:number,axis:number,value:number):void;
 gamepadButton(slot:number,button:number,value:number):void;
 releaseAll():void;dispose():void;
}
type Pad={mapping:'standard';axes:number[];buttons:{value:number}[];queue:Map<number,number[]>};
type Source={keys:Set<string>;buttons:Set<number>;pads:Map<number,Pad>;relative:boolean;disposed:boolean};
const source=():Source=>({keys:new Set(),buttons:new Set(),pads:new Map(),relative:false,disposed:false});
const aliases:Record<string,string>={Enter:'Return',' ':'Space',ArrowUp:'Up',ArrowDown:'Down',ArrowLeft:'Left',ArrowRight:'Right',ShiftLeft:'Left Shift',ShiftRight:'Right Shift',ControlLeft:'Left Ctrl',ControlRight:'Right Ctrl',AltLeft:'Left Alt',AltRight:'Right Alt',MetaLeft:'Left GUI',MetaRight:'Right GUI',Minus:'-',Equal:'=',BracketLeft:'[',BracketRight:']',Backslash:'\\',Semicolon:';',Quote:"'",Backquote:'`',Comma:',',Period:'.',Slash:'/',NumpadEnter:'Keypad Enter',NumpadAdd:'Keypad +',NumpadSubtract:'Keypad -',NumpadMultiply:'Keypad *',NumpadDivide:'Keypad /',NumpadDecimal:'Keypad .'};
const named=new Set(['Return','Escape','Backspace','Tab','Space','CapsLock','Insert','Home','PageUp','Delete','End','PageDown','Right','Left','Down','Up','Left Ctrl','Left Shift','Left Alt','Left GUI','Right Ctrl','Right Shift','Right Alt','Right GUI','NonUS #',...'-=[]\\;\'`,./',...Array.from({length:24},(_,i)=>'F'+(i+1)),...['0','1','2','3','4','5','6','7','8','9','Enter','+','-','*','/','.'].map(x=>'Keypad '+x)]);
export function inputKey(value:string):string{
 if(typeof value!=='string')throw new TypeError('Key must be a string');
 let key=Object.prototype.hasOwnProperty.call(aliases,value)?aliases[value]:value;
 if(/^Key[A-Z]$/.test(key))key=key.slice(3);if(/^Digit[0-9]$/.test(key))key=key.slice(5);if(/^Numpad[0-9]$/.test(key))key='Keypad '+key.slice(6);
 if(/^[a-z]$/.test(key))key=key.toUpperCase();
 if(!/^[A-Z0-9]$/.test(key)&&!named.has(key))throw new RangeError('Unsupported Goose key: '+value);
 return key;
}
function integer(value:number,max:number,label:string,min=0){if(!Number.isInteger(value)||value<min||value>max)throw new RangeError(label+' must be '+min+'..'+max);return value;}
function finite(value:number,label:string,min=-1e7,max=1e7){if(!Number.isFinite(value)||value<min||value>max)throw new RangeError(label+' is outside its finite range');return value;}
function boolean(value:boolean){if(typeof value!=='boolean')throw new TypeError('Expected a boolean');return value;}
const pad=():Pad=>({mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({value:0})),queue:new Map()});
function queueButton(p:Pad,button:number,value:number){
 const q=p.queue.get(button)||[],last=q.length?q[q.length-1]:p.buttons[button].value;if(last===value)return;
 if(q.length&&(last>=0.5)===(value>=0.5))q[q.length-1]=value;else{if(q.length>=64)throw new RangeError('Too many gamepad button transitions before a frame');q.push(value);}
 p.queue.set(button,q);
}

/** Per-runner ownership and deterministic merging; no synthetic DOM events. */
export class InputMixer {
 private physical=source();private sources=new Set<Source>();private x=0;private y=0;
 constructor(private emit:(event:any)=>void,private requireRun:()=>void,private activate:()=>void,private relativeChanged:()=>void){}
 private all(){return [this.physical,...this.sources];}
 private keyHeld(key:string){return this.all().some(s=>s.keys.has(key));}
 private buttonHeld(button:number){return this.all().some(s=>s.buttons.has(button));}
 private mods(){let n=0;for(const [bit,names] of [[1,['Left Shift','Right Shift']],[2,['Left Ctrl','Right Ctrl']],[4,['Left Alt','Right Alt']],[8,['Left GUI','Right GUI']]] as const)if(names.some(k=>this.keyHeld(k)))n|=bit;return n;}
 private key(s:Source,name:string,down:boolean,extra:any={}){const before=this.keyHeld(name);if(down)s.keys.add(name);else s.keys.delete(name);const after=this.keyHeld(name);if(before!==after||down&&extra.repeat)this.emit({kind:'key',name,down:after?1:0,repeat:0,keycode:0,...extra,mods:this.mods()|(extra.mods||0)});}
 private button(s:Source,button:number,down:boolean,extra:any={}){const before=this.buttonHeld(button);if(down)s.buttons.add(button);else s.buttons.delete(button);const after=this.buttonHeld(button);if(before!==after)this.emit({kind:'pointer',type:4,x:this.x,y:this.y,dx:0,dy:0,button,down:after?1:0,clicks:1,...extra});}
 private release(s:Source){for(const key of [...s.keys])this.key(s,key,false);for(const button of [...s.buttons])this.button(s,button,false);s.pads.clear();const relative=s.relative;s.relative=false;if(relative)this.relativeChanged();}
 reset(){for(const s of this.all())this.release(s);this.x=this.y=0;}
 get relative(){return [...this.sources].some(s=>s.relative);}
 physicalEvent(e:any){
  if(e.kind==='key'){let name:string;try{name=inputKey(e.name);}catch{return;}this.key(this.physical,name,!!e.down,{mods:e.mods,repeat:e.repeat,keycode:e.keycode});return;}
  if(e.kind==='pointer'){
   this.x=e.x;this.y=e.y;
   if(e.type===4){this.button(this.physical,e.button,!!e.down,{clicks:e.clicks});return;}
   if(e.type===9){for(const button of [...this.physical.buttons])this.button(this.physical,button,false);return;}
  }
  if(e.kind==='focus'&&!e.focused)this.reset();
  this.emit(e);
 }
 gamepads(hardware:any[]){
  for(const s of this.sources)for(const p of s.pads.values())for(const [button,q] of p.queue){p.buttons[button].value=q.shift()!;if(!q.length)p.queue.delete(button);}
  return Array.from({length:4},(_,slot)=>{
   const real=hardware[slot],virtual=[...this.sources].flatMap(s=>s.pads.has(slot)?[s.pads.get(slot)!]:[]);
   const candidates=[...(real?.mapping==='standard'?[real]:[]),...virtual];if(!candidates.length)return null;
   const out=pad();for(const p of candidates){for(let a=0;a<4;a++){const v=Number.isFinite(p.axes[a])?Math.max(-1,Math.min(1,p.axes[a])):0;if(Math.abs(v)>Math.abs(out.axes[a]))out.axes[a]=v;}
    for(let b=0;b<17;b++){const v=p.buttons[b]?.value;if(Number.isFinite(v))out.buttons[b].value=Math.max(out.buttons[b].value,Math.max(0,Math.min(1,v)));}}
   return {mapping:out.mapping,axes:out.axes,buttons:out.buttons};
  });
 }
 create():VirtualInput{
  const s=source();this.sources.add(s);
  const check=()=>{if(s.disposed)throw new Error('Virtual input has been disposed');this.requireRun();};
  const active=()=>{check();this.activate();};
  const getPad=(slot:number)=>{integer(slot,3,'Gamepad slot');let p=s.pads.get(slot);if(!p){p=pad();s.pads.set(slot,p);}return p;};
  return {
   keyDown:(name)=>{const key=inputKey(name);active();this.key(s,key,true);},
   keyUp:(name)=>{const key=inputKey(name);check();this.key(s,key,false);},
   moveMouse:(motion)=>{
    if(!motion||typeof motion!=='object')throw new TypeError('Mouse motion is required');
    const absolute=motion.x!==undefined||motion.y!==undefined,relative=motion.dx!==undefined||motion.dy!==undefined;
    if(absolute===relative)throw new TypeError('Supply either x/y or dx/dy');
    const a=finite(absolute?motion.x!:motion.dx!,'Mouse X'),b=finite(absolute?motion.y!:motion.dy!,'Mouse Y');active();
    const dx=absolute?a-this.x:a,dy=absolute?b-this.y:b;this.x=absolute?a:this.x+a;this.y=absolute?b:this.y+b;
    this.emit({kind:'pointer',type:3,x:this.x,y:this.y,dx,dy,button:0,down:0,clicks:0});
   },
   mouseButton:(button,down)=>{integer(button,7,'Mouse button',1);boolean(down);if(down)active();else check();this.button(s,button,down);},
   scroll:(x,y)=>{finite(x,'Wheel X');finite(y,'Wheel Y');active();this.emit({kind:'wheel',x,y});},
   text:(text)=>{if(typeof text!=='string'||new TextEncoder().encode(text).length>65536)throw new RangeError('Text must be a string up to 64 KiB');active();this.emit({kind:'text',text});},
   setRelativeMouse:(enabled)=>{boolean(enabled);check();s.relative=enabled;this.relativeChanged();},
   connectGamepad:(slot)=>{integer(slot,3,'Gamepad slot');active();getPad(slot);},
   disconnectGamepad:(slot)=>{integer(slot,3,'Gamepad slot');check();s.pads.delete(slot);},
   gamepadAxis:(slot,axis,value)=>{integer(slot,3,'Gamepad slot');integer(axis,5,'Gamepad axis');finite(value,'Axis value',axis<4?-1:0,1);active();const p=getPad(slot);if(axis<4)p.axes[axis]=value;else queueButton(p,axis+2,value);},
   gamepadButton:(slot,button,value)=>{integer(slot,3,'Gamepad slot');integer(button,16,'Gamepad button');finite(value,'Button value',0,1);active();queueButton(getPad(slot),button,value);},
   releaseAll:()=>{if(!s.disposed)this.release(s);},
   dispose:()=>{if(s.disposed)return;this.release(s);s.disposed=true;this.sources.delete(s);},
  };
 }
}
