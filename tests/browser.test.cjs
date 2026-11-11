const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
async function runBrowserTests({demos=['cube','ui','physics','planar2d','minecraft','doom'],switching=true}={}){
 const root=path.resolve(__dirname,'..');
 const server=http.createServer((req,res)=>{
  if(req.url==='/tests/stalled.wasm'){res.writeHead(200,{'Content-Type':'application/wasm'});res.write(Buffer.from([0,97,115,109]));return;}
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  fs.readFile(file,(e,data)=>{if(e){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm'}[path.extname(file)]||'application/octet-stream'));res.end(data);});
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader',...(process.env.CHROMIUM_SINGLE_PROCESS?['--single-process','--no-zygote']:[])]});
  const page=await browser.newPage();page.on('pageerror',e=>console.error('Browser script error:',e.message));const base=`http://127.0.0.1:${server.address().port}`;const results=[];
  for(const demo of demos){
   await page.goto(`${base}/tests/browser-host.html?demo=${demo}&frames=${demo==='planar2d'?240:demo==='physics'?60:demo==='doom'||demo==='minecraft'?30:4}`);await page.waitForFunction(()=>window.__testResult!=null,null,{timeout:60000});
   const r=await page.evaluate(()=>window.__testResult);assert.ok(!r.error,`${demo}: ${r.error}`);assert.equal(r.code,0);assert.ok(r.draws>0);assert.ok(r.shaderChecks>=2);
   const png=Buffer.from(r.png);assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.ok(png.length>100);
   const width=png.readUInt32BE(16),height=png.readUInt32BE(20);assert.ok(width>0&&height>0);
   if(demo==='cube')assert.ok(r.logs.some(x=>x.includes('cube in the middle: true')),r.logs.join('\n'));
   if(demo==='planar2d'){assert.ok(r.logs.some(x=>x.includes('planar XY: true; floor collision: true')),r.logs.join('\n'));assert.ok(r.logs.includes('settled on floor: true'),r.logs.join('\n'));}
   const colors=await page.evaluate(async bytes=>{const bitmap=await createImageBitmap(new Blob([new Uint8Array(bytes)],{type:'image/png'}));const c=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=c.getContext('2d');ctx.drawImage(bitmap,0,0);const data=ctx.getImageData(0,0,c.width,c.height).data,colors=new Set();for(let y=0;y<c.height;y+=8)for(let x=0;x<c.width;x+=8){const i=(y*c.width+x)*4;colors.add(`${data[i]},${data[i+1]},${data[i+2]}`);}return colors.size;},r.png);
   if(['minecraft','doom'].includes(demo))assert.ok(colors>100,`${demo}: expected a fully rendered game scene`);
   assert.ok(colors>4,`${demo}: rendered image is blank (${colors} colors)`);
   const dir=path.join(root,'build/test-results');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,demo+'.png'),png);
   results.push({demo,draws:r.draws,shaderChecks:r.shaderChecks,pngBytes:png.length,width,height,colors,logs:r.logs});console.log('Real WebGL2 pass:',demo,width,height,colors+' colors');
  }
  if(switching){await page.addInitScript(()=>{
    window.__audioPeak=0;if(typeof AudioBufferSourceNode!=='undefined'){const start=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args){if(this.buffer)for(const x of this.buffer.getChannelData(0))window.__audioPeak=Math.max(window.__audioPeak,Math.abs(x));return start.apply(this,args);};}
  });await page.goto(base+'/examples/');await page.waitForFunction(()=>document.getElementById('status').textContent.includes('Running physics'));
  await page.click('#btn-cube');await page.waitForFunction(()=>document.getElementById('status').textContent.includes('Running cube'));
  await page.click('#btn-ui');await page.waitForFunction(()=>document.getElementById('status').textContent.includes('Running ui'));
  await page.click('#btn-planar2d');await page.waitForFunction(()=>document.getElementById('status').textContent.includes('Running planar2d'));
  await page.waitForTimeout(300);assert.ok(!/\[error\]|shader.*error/i.test(await page.locator('#logBox').textContent()));
  for(const name of ['minecraft','doom']){
    await page.click('#btn-'+name);await page.waitForFunction(n=>document.getElementById('status').textContent.includes('Running '+n),name,{timeout:60000});
    const game=page.frames().find(f=>f.url().includes('demo.html?demo='+name));await game.locator('canvas').click();
    await game.waitForFunction(()=>document.pointerLockElement!==null,null,{timeout:15000});
    if(name==='minecraft'){
      await page.keyboard.press('F5');await page.waitForFunction(async()=>{const {ProjectStore}=await import('/dist/project-store.mjs');const store=new ProjectStore('demo-minecraft');try{return !!(await store.files())['mini_minecraft.sav'];}finally{await store.close();}},null,{timeout:15000});
      await page.locator('a[download="mini_minecraft.sav"]').waitFor();await page.keyboard.press('F12');await page.locator('a[download="mini_minecraft.png"]').waitFor({timeout:15000});
    }else await game.waitForFunction(()=>window.__audioPeak>0.001,null,{timeout:15000});
    await page.keyboard.press('Escape');await game.waitForFunction(()=>document.pointerLockElement===null,null,{timeout:15000});
    assert.ok(!/\[error\]/i.test(await page.locator('#logBox').textContent()));
  }
  console.log('Interactive samples: pointer capture/release, Minecraft save/screenshots, Doom real PCM audio passed');

  }
  await page.goto(base+'/tests/browser-host.html?demo=minecraft&selftest=1');await page.waitForFunction(()=>window.__testResult!=null,null,{timeout:60000});
  const selftest=await page.evaluate(()=>window.__testResult);assert.ok(!selftest.error,JSON.stringify(selftest));assert.equal(selftest.code,0);assert.ok(selftest.logs.length>0);console.log('Minecraft compiled gameplay self-tests:',selftest.logs.join(' | '));
  await page.goto(base+'/tests/runner-host.html');await page.waitForFunction(()=>window.runnerResult!=null,null,{timeout:60000});
  const runner=await page.evaluate(()=>window.runnerResult);assert.ok(!runner.error,JSON.stringify(runner));assert.equal(runner.running,false);assert.equal(runner.restored,true);assert.ok(runner.logs.some(x=>x.includes('cube in the middle: true')));
  console.log('Public compiled runner: real WASM, async exit, canvas restore passed');
  await require('./mouse-capture.test.cjs').runMouseCaptureTests({page,base});
  await require('./virtual-input.test.cjs').runVirtualInputTests({page,base});
  for(const demo of demos){
   await page.goto(base+'/tests/worker-render-host.html?demo='+demo);await page.waitForFunction(()=>window.workerResult!=null,null,{timeout:60000});const r=await page.evaluate(()=>window.workerResult);assert.ok(!r.error,JSON.stringify(r));assert.ok(r.png&&r.png.length>100);const png=Buffer.from(r.png);assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');if(demo==='cube')assert.ok(r.logs.some(x=>x.includes('cube in the middle: true')));console.log('Dedicated worker WebGL2 pass:',demo,png.length+' PNG bytes');
  }
  await page.goto(base+'/tests/runner-control.html?mode=input');await page.waitForFunction(()=>window.status==='running');await page.locator('textarea').waitFor();await page.keyboard.down('a');await page.waitForFunction(()=>window.logs.includes('key A'));await page.keyboard.up('a');await page.locator('textarea').fill('é🙂');await page.waitForFunction(()=>window.logs.includes('text 233')&&window.logs.includes('text 128578'));await page.locator('canvas').click();await page.waitForFunction(()=>window.logs.includes('mouse down')&&window.logs.includes('mouse up'));await page.keyboard.press('Escape');await page.waitForFunction(()=>window.finished);assert.equal(await page.evaluate(()=>window.runnerError),null);console.log('Worker input bridge: keyboard, mouse and Unicode passed');
  await page.goto(base+'/tests/runner-control.html?mode=infinite');await page.waitForFunction(()=>window.status==='running');const before=await page.evaluate(()=>window.heartbeat);await page.waitForTimeout(150);assert.ok(await page.evaluate(()=>window.heartbeat)>before,'non-yielding WASM must not freeze UI');await page.evaluate(()=>window.runner.stop());await page.waitForFunction(()=>window.finished);assert.equal(await page.evaluate(()=>window.runnerError.name),'AbortError');
  await page.goto(base+'/tests/runner-control.html?mode=timeout');await page.waitForFunction(()=>window.finished);assert.ok((await page.evaluate(()=>window.runnerError.message)).includes('Execution timed out'));
  await page.goto(base+'/tests/runner-control.html?mode=terminal');await page.waitForFunction(()=>window.stdinWaiting);await page.evaluate(()=>{window.stdinWaiting=false;window.runner.writeStdin('héllo\n');});await page.waitForFunction(()=>window.logs.includes('echo: héllo'));await page.evaluate(()=>window.runner.closeStdin());await page.waitForFunction(()=>window.finished);assert.equal(await page.evaluate(()=>window.runnerError),null);assert.ok(await page.evaluate(()=>window.logs.includes('eof')));
  await page.goto(base+'/tests/runner-control.html?mode=loadtimeout');await page.waitForFunction(()=>window.finished);assert.ok((await page.evaluate(()=>window.runnerError.message)).includes('loading timed out'));
  await page.goto(base+'/tests/runner-control.html?mode=files');await page.waitForFunction(()=>window.finished);assert.equal(await page.evaluate(()=>window.runnerError),null);assert.deepEqual(await page.evaluate(()=>window.readStored()),{'state.bin':[71,111,111,115]});
  console.log('Worker runner: infinite-loop Stop, execution timeout, asynchronous stdin/EOF and durable project files passed');
  await page.goto(base+'/tests/probe-host.html');await page.waitForFunction(()=>window.probeReady||window.probeError);assert.ok(!await page.evaluate(()=>window.probeError));
  const probe=(op,a=0,b=0)=>page.evaluate(([op,a,b])=>window.probe(op,a,b),[op,a,b]);
  for(const [op,label] of [[33,'unsupported window flags rejected'],[50,'draw without pass reports misuse'],[51,'clear resets write masks'],[52,'vertex/index fetch bounds'],[53,'invalid pipeline reports misuse'],[54,'partial graphics initialization cleanup and retry'],[10,'buffer reuse and stale handles'],[11,'texture reuse'],[12,'PNG loading'],[13,'unsupported textures rejected'],[14,'upload bounds'],[15,'sampler state'],[24,'R8 texture format'],[30,'multiple color and separate depth attachments'],[31,'BGRA byte order']])assert.equal(await probe(op),1,label);
  assert.equal(await probe(17),5);assert.equal(await probe(18),69);
  await page.locator('#canvas').focus();await page.keyboard.down('a');assert.equal(await probe(1),1);await page.keyboard.up('a');assert.equal(await probe(1),0);
  await page.keyboard.down('Shift');await page.keyboard.down('1');assert.equal(await probe(32),1,'shifted digit uses physical scancode');await page.keyboard.up('1');await page.keyboard.up('Shift');
  const box=await page.locator('#canvas').boundingBox();await page.mouse.move(box.x+320,box.y+240);await page.mouse.down();assert.equal(await probe(4),1);assert.ok(Math.abs(await probe(2)-160)<2);assert.ok(Math.abs(await probe(3)-120)<2);
  await page.mouse.move(900,600);await page.mouse.up();assert.equal(await probe(4),0,'release outside canvas');
  await probe(5,0);assert.equal(await probe(6),0);assert.equal(await page.locator('#canvas').evaluate(c=>c.style.cursor),'none');await probe(5,1);
  await probe(8,1);await page.locator('textarea').fill('é🙂');assert.equal(await probe(9),2,'Unicode input is codepoints');await probe(8,0);
  await probe(16,0);assert.equal(await probe(7),0);await probe(16,1);assert.equal(await probe(7),1);
  await page.evaluate(()=>{window.virtualPad={mapping:'standard',axes:[0.75,-0.5,0,0],buttons:Array.from({length:17},()=>({value:0}))};Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[window.virtualPad]});});
  assert.equal(await probe(20,0),0.75);assert.equal(await probe(19,0),1);await page.evaluate(()=>window.virtualPad.buttons[0].value=1);await probe(20,0);assert.equal(await probe(21,0),1);await probe(20,0);assert.equal(await probe(21,0),0);await page.evaluate(()=>window.virtualPad.buttons[0].value=0);await probe(20,0);assert.equal(await probe(22,0),1);
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('denied')},readText:async()=>{throw Error('denied')}}}));assert.equal(await probe(26),0);assert.equal(await probe(27),0,'denied clipboard must not report success');
  assert.equal(await probe(40),1,'real upstream offline PCM mixer');
  await page.evaluate(()=>{window.pcmPeak=0;const start=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args){if(this.buffer){const samples=this.buffer.getChannelData(0);for(const v of samples)window.pcmPeak=Math.max(window.pcmPeak,Math.abs(v));}return start.apply(this,args);};});
  assert.equal(await probe(41),1,'real Web Audio device');assert.equal(await probe(42),1);await page.locator('#canvas').click();await page.waitForFunction(()=>window.pcmPeak>0.1);assert.ok(await page.evaluate(()=>window.pcmPeak)<=1);await probe(43);console.log('Audio: upstream PCM mixing and nonzero scheduled Web Audio output passed');
  await probe(23);assert.equal(await probe(0),1,'close/reopen with retained handle generations');assert.equal(await probe(12),1,'image readback after reopen');
  const touchSession=await page.context().newCDPSession(page);await touchSession.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  const tb=await page.locator('#canvas').boundingBox();
  await touchSession.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:tb.x+320,y:tb.y+240}]});assert.equal(await probe(4),1,'primary touch holds left mouse');
  await touchSession.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:tb.x+352,y:tb.y+240}]});assert.ok(Math.abs(await probe(2)-176)<2);
  await touchSession.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal(await probe(4),0);assert.ok(await probe(28,1)>=1);assert.ok(await probe(28,0)>=1);
  await touchSession.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:tb.x+320,y:tb.y+240}]});await touchSession.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});assert.equal(await probe(4),0,'touch cancellation releases mouse');await touchSession.detach();
  results.push({browserProbes:'passed',coverage:['real input events','single-touch mouse compatibility','Unicode text','cursor/focus','clipboard denial','virtual gamepad edges','real texture/image and sampler behavior','MRT and separate depth','generational handles','public runner','upstream offline audio mixer','real nonzero Web Audio scheduling']});
  console.log('Browser input/resource probes passed (gamepad tested using explicit virtual device)');
  fs.writeFileSync(path.join(root,'build/test-results/browser.json'),JSON.stringify(results,null,2));return results;
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
}
if(require.main===module)runBrowserTests().catch(e=>{console.error(e);process.exitCode=1;});module.exports={runBrowserTests};
