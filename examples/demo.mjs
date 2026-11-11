import {CompiledGooseRunner} from '../dist/runner.mjs';
const name=new URLSearchParams(location.search).get('demo');
const demos={minecraft:{dir:'g7_minecraft',args:[]},doom:{dir:'g8_doom',args:['--wad','/assets/freedoom1-e1m1.wad']},planar2d:{dir:'g6_planar2d',args:[]},physics:{dir:'g5_physics',args:['--boxes','1000','--rate','10']},cube:{dir:'g3_cube',args:[]},ui:{dir:'g4_ui',args:[]}};
const notify=(type,data={})=>parent.postMessage({gooseDemo:true,name,type,...data},location.origin);
const mouseStatus=document.getElementById('mouse-status');
function captureStatus(status,message){
 mouseStatus.hidden=status==='idle'||status==='locked';
 mouseStatus.textContent=message||(status==='pending'?'Click the game to capture the mouse.':'Mouse capture is blocked.');
 if(status==='blocked'&&window.top!==window){const link=document.createElement('a');link.href=location.href;link.target='_blank';link.rel='noopener';link.textContent='Open game in a separate tab';mouseStatus.append(document.createTextNode(' '),link);}
}
let runner,migrating=false;
try{
 if(location.protocol==='file:')throw Error('Serve this directory over HTTP.');
 const conf=demos[name];if(!conf)throw Error('Unknown demo');
 const files={};
 // Migrate the earlier sample-specific browser save into the general workspace.
 if(name==='minecraft')try{const old=localStorage.getItem('goose-mini-minecraft-save-v1');if(old&&old.length<3000000){files['mini_minecraft.sav']=Uint8Array.from(atob(old),c=>c.charCodeAt(0));migrating=true;}}catch(e){notify('log',{stream:'browser',text:'Legacy save migration: '+e.message});}
 runner=new CompiledGooseRunner({canvas:document.querySelector('canvas'),args:conf.args,projectId:'demo-'+name,files,
  onPointerLockChange:captureStatus,
  onStdout:text=>notify('log',{text,stream:'stdout'}),onStderr:text=>notify('log',{text,stream:'stderr'}),onWarning:text=>notify('log',{text,stream:'browser'}),
  onStatus:status=>{if(status==='running'){notify('running');if(migrating)try{localStorage.removeItem('goose-mini-minecraft-save-v1');}catch{}}},onFile:(path,bytes)=>{if(bytes&&/\.(png|sav)$/.test(path))notify('file',{filename:path.split('/').pop(),bytes});},
  onExit:code=>notify('exit',{code})});
 window.addEventListener('pagehide',()=>runner.stop(),{once:true});
 const base=new URL('../build/'+conf.dir+'/',import.meta.url);await runner.run(new URL('game.mjs',base).href,new URL('game.wasm',base).href);
}catch(error){if(error.name!=='AbortError'){notify('error',{text:error.stack||String(error)});document.body.dataset.error=error.message;}}
