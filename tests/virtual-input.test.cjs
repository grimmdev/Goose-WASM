const assert=require('node:assert/strict');
async function runVirtualInputTests({page,base}){
 await page.goto(base+'/tests/runner-control.html?mode=virtual');await page.waitForFunction(()=>window.status==='running'&&document.querySelector('textarea'));
 await page.evaluate(()=>{window.a=runner.createVirtualInput();window.b=runner.createVirtualInput();window.query=runner.createVirtualInput();});
 const state=async(action)=>{
  const before=await page.evaluate(()=>logs.filter(x=>x.startsWith('state|')).length);
  await page.evaluate(`(() => { (${action?action.toString():'()=>{}'})();query.keyDown('P');query.keyUp('P'); })()`);
  await page.waitForFunction(n=>logs.filter(x=>x.startsWith('state|')).length>n,before);
  const parts=(await page.evaluate(()=>logs.filter(x=>x.startsWith('state|')).at(-1))).split('|').slice(1);
  const v=parts.map(x=>x==='true'?true:x==='false'?false:Number(x));
  return Object.fromEntries(['key','pressed','released','mouse','x','y','dx','dy','wheel','relative','focused','connected','axis','trigger','button'].map((k,i)=>[k,v[i]]));
 };
 let s=await state(()=>a.keyDown('KeyA'));assert.equal(s.key,true);
 s=await state(()=>{b.keyDown('a');a.keyUp('A');});assert.equal(s.key,true,'second controller retains ownership');
 s=await state(()=>b.keyUp('A'));assert.equal(s.key,false);
 s=await state(()=>{a.keyDown('A');a.keyUp('A');});assert.equal(s.pressed,true);assert.equal(s.released,true,'quick key tap preserves both edges');
 await page.keyboard.down('a');s=await state(()=>{a.keyDown('A');a.keyUp('A');});assert.equal(s.key,true,'physical owner survives virtual release');
 await state(()=>a.keyDown('A'));await page.keyboard.up('a');s=await state();assert.equal(s.key,true,'virtual owner survives physical release');
 await state(()=>a.releaseAll());
 s=await state(()=>a.moveMouse({x:40,y:60}));assert.equal(s.x,40);assert.equal(s.y,60);
 s=await state(()=>{a.moveMouse({dx:5,dy:-3});a.scroll(0,-2);});assert.equal(s.x,45);assert.equal(s.y,57);assert.equal(s.dx,5);assert.equal(s.dy,-3);assert.equal(s.wheel,-2);
 s=await state(()=>{a.mouseButton(1,true);b.mouseButton(1,true);a.mouseButton(1,false);});assert.equal(s.mouse,true);
 s=await state(()=>b.releaseAll());assert.equal(s.mouse,false);
 await state(()=>a.mouseButton(1,true));await page.locator('canvas').hover();await page.mouse.down();await page.mouse.up();
 s=await state();assert.equal(s.mouse,true,'physical button release/capture loss retains virtual ownership');await state(()=>a.releaseAll());
 s=await state(()=>{a.setRelativeMouse(true);a.keyDown('R');a.keyUp('R');});assert.equal(s.relative,true);assert.equal(await page.evaluate(()=>!!document.pointerLockElement),false,'virtual mouse needs no browser capture');
 s=await state(()=>{a.moveMouse({dx:10,dy:2});});assert.equal(s.dx,10);assert.equal(s.dy,2);
 s=await state(()=>{a.keyDown('T');a.keyUp('T');});assert.equal(s.relative,false,'Goose can release virtual relative mode');
 await page.evaluate(()=>{window.logs=[];a.text('é🙂');});await page.waitForFunction(()=>logs.includes('text 233')&&logs.includes('text 128578'));
 s=await state(()=>{a.gamepadAxis(0,0,0.75);a.gamepadAxis(0,4,0.5);a.gamepadButton(0,0,0.8);});assert.equal(s.connected,true);assert.equal(s.axis,0.75);assert.equal(s.trigger,0.5);assert.ok(Math.abs(s.button-0.8)<1e-6);
 s=await state(()=>{b.gamepadAxis(0,0,-0.9);b.gamepadButton(0,0,1);a.releaseAll();});assert.ok(Math.abs(s.axis+0.9)<1e-6);assert.equal(s.button,1);
 await page.evaluate(()=>{window.hardware={mapping:'standard',axes:[0.25,0,0,0],buttons:Array.from({length:17},(_,i)=>({value:i===0?1:0}))};Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[hardware]});});
 s=await state();assert.ok(Math.abs(s.axis+0.9)<1e-6,'virtual stick wins over weaker hardware');assert.equal(s.button,1);
 s=await state(()=>b.releaseAll());assert.equal(s.connected,true);assert.equal(s.axis,0.25);assert.equal(s.button,1,'real gamepad is retained');
 await page.evaluate(()=>{window.hardware=null;});await state();
 await page.evaluate(()=>{logs=[];a.gamepadButton(0,0,1);a.gamepadButton(0,0,0);});await page.waitForFunction(()=>logs.includes('pad pressed')&&logs.includes('pad released'));
 s=await state(()=>a.releaseAll());assert.equal(s.connected,false);
 const errors=await page.evaluate(()=>{
  const cases=[()=>a.keyDown('bogus'),()=>a.moveMouse({dx:NaN,dy:0}),()=>a.moveMouse({x:1,y:2,dx:3,dy:4}),()=>a.mouseButton(0,true),()=>a.gamepadAxis(4,0,0),()=>a.gamepadAxis(0,0,2),()=>a.gamepadButton(0,17,1),()=>a.gamepadButton(0,0,-1)];return cases.map(fn=>{try{fn();return false;}catch{return true;}});
 });assert.ok(errors.every(Boolean),'invalid inputs reject explicitly');
 await state(()=>{a.keyDown('A');a.mouseButton(1,true);a.gamepadButton(0,0,1);window.dispatchEvent(new Event('blur'));});s=await state();assert.equal(s.key,false);assert.equal(s.mouse,false);assert.equal(s.connected,false,'blur releases virtual state');
 s=await state(()=>{b.keyDown('A');b.dispose();b.dispose();});assert.equal(s.key,false);
 assert.equal(await page.evaluate(()=>{try{b.keyDown('A');return false;}catch{return true;}}),true);
 await page.evaluate(()=>{a.keyDown('A');runner.stop();});
 assert.equal(await page.evaluate(()=>{try{a.keyDown('A');return false;}catch{return true;}}),true,'stopped runner rejects new input');
 const browserErrors=[],onError=e=>browserErrors.push(e.message);page.on('pageerror',onError);
 try{
  await page.goto(base+'/examples/virtual-input.html');await page.waitForFunction(()=>document.getElementById('status').textContent.startsWith('Running'),null,{timeout:60000});
  const forward=page.locator('[data-key="W"]');const box=await forward.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForFunction(()=>document.querySelector('[data-key="W"]').classList.contains('held'));await page.mouse.up();
  await page.waitForFunction(()=>!document.querySelector('[data-key="W"]').classList.contains('held'));
  const look=await page.locator('#look').boundingBox();await page.mouse.move(look.x+20,look.y+20);await page.mouse.down();await page.mouse.move(look.x+80,look.y+40,{steps:5});await page.mouse.up();
  assert.equal(await page.evaluate(()=>!!document.pointerLockElement),false);
  await page.selectOption('#demo','planar2d');await page.waitForFunction(()=>document.getElementById('status').textContent.startsWith('Running'),null,{timeout:60000});
  await page.locator('[data-key="Space"]').click();assert.deepEqual(browserErrors,[]);
 }finally{page.off('pageerror',onError);}
 console.log('Virtual input: compiled Goose ownership, physical mixing, motion/wheel/text, capture-free look, gamepad values/tap edges, validation and cleanup passed');
}
module.exports={runVirtualInputTests};
