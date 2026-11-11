const name=new URLSearchParams(location.search).get('demo');
const demos={minecraft:{dir:'g7_minecraft',args:[],w:1280,h:800},doom:{dir:'g8_doom',args:['--wad','/assets/freedoom1-e1m1.wad'],w:960,h:600},planar2d:{dir:'g6_planar2d',args:[],w:800,h:600},physics:{dir:'g5_physics',args:['--boxes','1000','--rate','10'],w:1280,h:720},cube:{dir:'g3_cube',args:[],w:640,h:480},ui:{dir:'g4_ui',args:[],w:760,h:520}};
const notify=(type,data={})=>parent.postMessage({gooseDemo:true,name,type,...data},location.origin);
try{
    if(location.protocol==='file:')throw new Error('Serve the repository over HTTP; JavaScript modules and WASM cannot reliably load from file://.');
    const conf=demos[name];if(!conf)throw new Error('Unknown demo');
    const base=new URL(`../build/${conf.dir}/`,import.meta.url),canvas=document.querySelector('canvas');canvas.width=conf.w;canvas.height=conf.h;
    const response=await fetch(new URL('game.wasm',base));if(!response.ok)throw new Error(`Missing game.wasm (${response.status}); run npm run build:demos.`);
    const wasmBinary=await response.arrayBuffer();
    const {default:createGame}=await import(new URL('game.mjs',base));
    const mod=await createGame({canvas,wasmBinary,noInitialRun:true,locateFile:p=>new URL(p,base).href,print:text=>notify('log',{text,stream:'stdout'}),printErr:text=>notify('log',{text,stream:'stderr'})});
    // Observe completed native filesystem writes; keep the Goose sample unchanged.
    const saveKey='goose-mini-minecraft-save-v1';
    if(name==='minecraft')try{
        const encoded=localStorage.getItem(saveKey);if(encoded && encoded.length<3000000){const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));mod.FS.writeFile('/mini_minecraft.sav',bytes);}
    }catch(error){notify('log',{text:'Browser save restore unavailable: '+error.message,stream:'browser'});}
    const completedFile=path=>{
        const filename=path.split('/').pop();if(!['mini_minecraft.sav','mini_minecraft.png','mini_doom.png'].includes(filename))return;
        try{
            const bytes=mod.FS.readFile(path);notify('file',{filename,bytes});
            if(name==='minecraft' && filename==='mini_minecraft.sav'){
                if(bytes.length>2000000)throw Error('Save exceeds browser persistence limit');
                let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
                localStorage.setItem(saveKey,btoa(binary));notify('log',{text:'Minecraft save stored in this browser; F9 loads it.',stream:'browser'});
            }
        }catch(error){notify('log',{text:'File export/persistence unavailable: '+error.message,stream:'browser'});}
    };
    const close=mod.FS.close,rename=mod.FS.rename;
    mod.FS.close=function(stream){const path=stream.path,writing=(stream.flags&3)!==0;const value=close.call(this,stream);if(writing&&path)completedFile(path);return value;};
    mod.FS.rename=function(from,to){const value=rename.call(this,from,to);completedFile(to);return value;};
    const args=['goose_game',...conf.args],allocations=[];let argv=0;
    try{
        argv=mod._malloc((args.length+1)*4);allocations.push(argv);
        for(let i=0;i<args.length;i++){const length=mod.lengthBytesUTF8(args[i])+1,pointer=mod._malloc(length);allocations.push(pointer);mod.stringToUTF8(args[i],pointer,length);mod.setValue(argv+i*4,pointer,'i32');}
        mod.setValue(argv+args.length*4,0,'i32');canvas.focus();notify('running');
        const code=await mod.ccall('goose_web_run','number',['number','number'],[args.length,argv],{async:true});
        notify('exit',{code});
        for(const file of mod.FS.readdir('/').filter(x=>x.endsWith('.png'))){const bytes=mod.FS.readFile('/'+file);notify('file',{filename:file,bytes});}
    }finally{for(const pointer of allocations.reverse())mod._free(pointer);}
}catch(error){notify('error',{text:error.stack||String(error)});document.body.dataset.error=error.message;}
