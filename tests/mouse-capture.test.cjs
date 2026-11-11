const assert=require('node:assert/strict');

async function runMouseCaptureTests({page,base}){
 const fixture=base+'/tests/runner-control.html?mode=motion';
 await page.goto(fixture);
 await page.waitForFunction(()=>window.captureStatus!=null&&window.status==='running');
 // A previous same-origin interaction can still grant transient activation.
 // Release any resulting startup lock before testing the canvas-click path.
 await page.evaluate(()=>{if(document.pointerLockElement)document.exitPointerLock();});
 await page.waitForFunction(()=>window.captureStatus.status!=='locked');
 // Emulate the older void-returning API, retaining the real browser request.
 await page.locator('canvas').evaluate(c=>{window.logs=[];const request=c.requestPointerLock.bind(c);c.requestPointerLock=()=>{request()?.catch(()=>{});};});
 await page.locator('canvas').click();
 await page.waitForFunction(()=>window.logs.includes('locked')&&window.captureStatus.status==='locked');
 assert.equal(await page.evaluate(()=>window.captureStatus.status),'locked');
 await page.evaluate(()=>{window.logs=[];const c=document.querySelector('canvas');c.style.width='640px';c.style.height='480px';
  // Explicit event deltas are deterministic in headless Chromium. The lock,
  // worker and compiled Goose mouse_delta() below are real, not mocked.
  c.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,isPrimary:true,pointerType:'mouse',movementX:24,movementY:-10}));
  c.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,movementX:24,movementY:-10}));
 });
 await page.waitForFunction(()=>window.logs.some(x=>x.startsWith('motion ')));
 const motions=await page.evaluate(()=>window.logs.filter(x=>x.startsWith('motion ')));
 assert.equal(motions.length,1,'locked pointermove and mousemove must not double-count');
 assert.deepEqual(motions[0].split(/\s+/).slice(1).map(Number),[12,-5],'Goose receives logical-canvas deltas');
 await page.keyboard.press('q');await page.waitForFunction(()=>window.logs.includes('unlocked'));
 assert.equal(await page.evaluate(()=>window.captureStatus.status),'idle');
 await page.locator('canvas').click();assert.equal(await page.evaluate(()=>!!document.pointerLockElement),false,'explicit release clears capture intent');
 await page.keyboard.press('l');await page.waitForFunction(()=>document.pointerLockElement!==null);
 await page.evaluate(()=>window.runner.stop());await page.waitForFunction(()=>document.pointerLockElement===null);

 // Browser-enforced denial must be visible; the game must keep running.
 await page.goto(base+'/tests/runner-control.html?mode=infinite');
 await page.evaluate(url=>{window.runner.stop();document.body.replaceChildren();const f=document.createElement('iframe');f.sandbox='allow-scripts allow-same-origin';f.src=url;f.style='width:700px;height:550px';document.body.append(f);},fixture);
 let game=page.frames().find(f=>f.url().includes('mode=motion'));
 if(!game){await page.waitForTimeout(100);game=page.frames().find(f=>f.url().includes('mode=motion'));}
 assert.ok(game);await game.waitForFunction(()=>window.captureStatus!=null&&window.status==='running');
 await game.locator('canvas').click();await game.waitForFunction(()=>window.captureStatus?.status==='blocked');
 assert.match(await game.evaluate(()=>window.captureStatus.message),/browser|capture|embedded/i);
 assert.equal(await game.evaluate(()=>window.runner.isRunning()),true);

 await page.locator('iframe').evaluate((f,url)=>{f.sandbox='allow-scripts allow-same-origin allow-pointer-lock';f.src=url;},fixture+'&allowed=1');
 await page.waitForFunction(()=>document.querySelector('iframe')?.contentWindow?.location.search.includes('allowed=1'));
 game=page.frames().find(f=>f.url().includes('allowed=1'));
 await game.waitForFunction(()=>window.captureStatus!=null&&window.status==='running');await game.locator('canvas').click();
 await game.waitForFunction(()=>window.logs.includes('locked'));
 await game.evaluate(()=>window.runner.stop());
 console.log('Mouse capture: gesture, legacy API, compiled movement, no duplicate motion, release/retry and iframe permissions passed');
}
module.exports={runMouseCaptureTests};
