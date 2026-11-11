export type PointerLockStatus = 'idle'|'pending'|'locked'|'blocked';

/** DOM-owned pointer lock. The request itself must run inside the click handler. */
export class MouseCapture {
 private pending:Promise<boolean>|null=null;
 private complete:((ok:boolean)=>void)|null=null;
 private timer:ReturnType<typeof setTimeout>|null=null;
 private disposed=false;
 private wanted=false;
 constructor(private canvas:HTMLCanvasElement,private changed:(locked:boolean)=>void,
  private status:(status:PointerLockStatus,message?:string)=>void){
  document.addEventListener('pointerlockchange',this.onChange);
  document.addEventListener('pointerlockerror',this.onError);
 }
 private onChange=()=>{
  if(this.disposed)return;
  const locked=document.pointerLockElement===this.canvas;
  if(locked&&!this.wanted){document.exitPointerLock();return;}
  this.changed(locked);
  this.status(locked?'locked':this.wanted?'pending':'idle');
  if(locked)this.settle(true);
 };
 private onError=()=>{if(this.pending)this.fail('The browser blocked mouse capture. If this game is embedded, open it in a separate tab; the embedding frame must allow pointer lock.');};
 private settle(ok:boolean){const done=this.complete;this.complete=null;this.pending=null;if(this.timer)clearTimeout(this.timer);this.timer=null;done?.(ok);}
 private fail(message:string){this.status('blocked',message);this.settle(false);}
 setWanted(on:boolean){
  this.wanted=on;
  if(!on){this.settle(false);if(document.pointerLockElement===this.canvas)document.exitPointerLock();this.changed(false);this.status('idle');}
 }
 request():Promise<boolean>{
  if(this.disposed||!this.wanted)return Promise.resolve(false);
  if(document.pointerLockElement===this.canvas){this.changed(true);this.status('locked');return Promise.resolve(true);}
  if(this.pending)return this.pending;
  if(!this.canvas.requestPointerLock){this.status('blocked','Mouse capture is unavailable in this browser.');return Promise.resolve(false);}
  // Loading a game is not a user gesture. Keep the intent and request on click.
  if(navigator.userActivation&&!navigator.userActivation.isActive){this.status('pending','Click the game canvas to capture the mouse.');return Promise.resolve(false);}
  const result=this.pending=new Promise<boolean>(resolve=>this.complete=resolve);
  this.status('pending');
  this.timer=setTimeout(()=>this.fail('Mouse capture did not complete. Click the canvas to retry, or open the game in a separate tab.'),3000);
  try{
   // Older browsers return void and report success/failure only through events.
   const request=this.canvas.requestPointerLock();
   request?.then?.(()=>{if(this.pending)this.onChange();},(error:Error)=>{if(this.pending)this.fail('Mouse capture denied: '+error.message+' Open the game in a separate tab if it is embedded.');});
  }catch(error:any){this.fail('Mouse capture denied: '+error.message);}
  return result;
 }
 dispose(){this.disposed=true;this.wanted=false;this.settle(false);document.removeEventListener('pointerlockchange',this.onChange);document.removeEventListener('pointerlockerror',this.onError);if(document.pointerLockElement===this.canvas)document.exitPointerLock();}
}
