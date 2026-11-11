import {CompiledGooseRunner} from '../dist/runner.mjs';
const status=document.getElementById('status'),logs=document.getElementById('logs'),select=document.getElementById('demo');
let runner=null,lookInput=null,controllers=[],game='minecraft',generation=0;
const activeButtons=new Map();
function release(){for(const c of controllers)c.releaseAll();activeButtons.clear();for(const b of document.querySelectorAll('.held'))b.classList.remove('held');}
async function start(){
 const own=++generation;release();await runner?.dispose();if(own!==generation)return;
 controllers=[];game=select.value;logs.textContent='';
 runner=new CompiledGooseRunner({canvas:document.querySelector('canvas'),projectId:'virtual-demo-'+game,
  onStatus:s=>{if(own!==generation)return;status.textContent=s==='running'?'Running — use the virtual controls below.':'Status: '+s;if(s==='running'){lookInput.setRelativeMouse(game==='minecraft');}},
  onLog:line=>{logs.textContent=(logs.textContent+'\n'+line).slice(-4000);},onWarning:line=>status.textContent=line});
 lookInput=runner.createVirtualInput();controllers.push(lookInput);
 for(const button of document.querySelectorAll('button')){const c=runner.createVirtualInput();controllers.push(c);button._virtual=c;}
 try{const folder=game==='minecraft'?'g7_minecraft':'g6_planar2d';await runner.run('../build/'+folder+'/game.mjs','../build/'+folder+'/game.wasm');}
 catch(e){if(own===generation&&e.name!=='AbortError')status.textContent=e.message;}
}
for(const button of document.querySelectorAll('button')){
 button.addEventListener('pointerdown',event=>{
  if(!runner?.isRunning()||activeButtons.has(button))return;event.preventDefault();button.setPointerCapture(event.pointerId);activeButtons.set(button,event.pointerId);button.classList.add('held');
  const c=button._virtual;if(game==='planar2d'){if(button.dataset.axis){const [axis,value]=button.dataset.axis.split(',').map(Number);c.gamepadAxis(0,axis,value);}else if(button.dataset.button)c.gamepadButton(0,Number(button.dataset.button),1);}
  else if(button.dataset.key)c.keyDown(button.dataset.key);else if(button.dataset.mouse)c.mouseButton(Number(button.dataset.mouse),true);
 });
 const up=event=>{if(activeButtons.get(button)!==event.pointerId)return;activeButtons.delete(button);button.classList.remove('held');const c=button._virtual;if(event.type!=='pointerup'||!runner?.isRunning()){c.releaseAll();return;}if(game==='planar2d'){if(button.dataset.axis)c.gamepadAxis(0,Number(button.dataset.axis.split(',')[0]),0);else if(button.dataset.button)c.gamepadButton(0,Number(button.dataset.button),0);}else if(button.dataset.key)c.keyUp(button.dataset.key);else if(button.dataset.mouse)c.mouseButton(Number(button.dataset.mouse),false);};
 for(const name of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(name,up);
}
const look=document.getElementById('look');let pointer=null,previous=null;
look.addEventListener('pointerdown',e=>{if(!runner?.isRunning()||pointer!==null||game!=='minecraft')return;e.preventDefault();pointer=e.pointerId;previous={x:e.clientX,y:e.clientY};look.setPointerCapture(pointer);lookInput.setRelativeMouse(true);});
look.addEventListener('pointermove',e=>{if(e.pointerId!==pointer||!previous||!runner?.isRunning())return;e.preventDefault();lookInput.moveMouse({dx:e.clientX-previous.x,dy:e.clientY-previous.y});previous={x:e.clientX,y:e.clientY};});
for(const name of ['pointerup','pointercancel','lostpointercapture'])look.addEventListener(name,e=>{if(pointer===e.pointerId){pointer=null;previous=null;}});
window.addEventListener('blur',release);document.addEventListener('visibilitychange',()=>{if(document.hidden)release();});
select.addEventListener('change',()=>{pointer=null;previous=null;void start();});window.addEventListener('pagehide',()=>runner?.stop());void start();
