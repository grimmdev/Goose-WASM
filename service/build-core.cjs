const fs=require('fs'),path=require('path');
const {runTool}=require('../scripts/tool-runner.cjs');
const {translateShaderBlobs,findTranslator}=require('./web-shaders.cjs');
async function buildProject(options){
    const root=path.resolve(__dirname,'..'),outDir=path.resolve(options.outDir||path.join(root,'build/out'));
    fs.mkdirSync(outDir,{recursive:true});
    const output=path.join(outDir,'game.mjs'),wasm=path.join(outDir,'game.wasm');
    for(const p of [output,wasm])if(fs.existsSync(p))fs.unlinkSync(p);
    let stage='transpile';options.onStage?.('transpile');
    try{
        const createLinter=require(options.linterPath||path.join(root,'dist/goose_linter.js'));
        const mod=await createLinter({noInitialRun:true});const {compileGoose}=require('../dist/index.js');
        const compiled=await compileGoose(mod,options.source,{transpile:true,dumpAst:false,standalone:true,entryFile:options.entryFile||'/main.goose',files:options.files||{}});
        if(!compiled.success || !compiled.transpiledC)return {...compiled,success:false,stage,error:'Goose C generation failed'};
        stage='shader_translation';options.onStage?.('shader_translation');
        const converted=translateShaderBlobs(compiled.transpiledC,{executable:findTranslator(root),workDir:path.join(outDir,'shaders')});
        fs.writeFileSync(path.join(outDir,'game.c'),converted.cSource);
        fs.writeFileSync(path.join(outDir,'shaders.json'),JSON.stringify(converted.shaders,null,2));
        const tool=options.emcc||process.env.EMCC||'emcc';
        const run=args=>runTool(tool,args,{stdio:'pipe',maxBuffer:16*1024*1024});
        stage='emcc_compile_game';options.onStage?.('emcc_compile_game');
        run(['-std=gnu11','-O2','-Dmain=goose_user_main','-DGS_STACK_RESERVE=(16ull << 20)','-DGS_STACK_GAP=(64ull << 10)','-DGS_STACK_BUDGET=(256ull << 20)','-c',path.join(outDir,'game.c'),'-o',path.join(outDir,'game.o')]);
        stage='emcc_compile_entry';options.onStage?.('emcc_compile_entry');run(['-std=gnu11','-O2','-c',path.join(root,'platform/web/game_entry.c'),'-o',path.join(outDir,'entry.o')]);
        const assetFlags=[];
        if(options.assets){
            const assetDir=path.join(outDir,'assets');fs.rmSync(assetDir,{recursive:true,force:true});fs.mkdirSync(assetDir,{recursive:true});
            for(const [name,data] of Object.entries(options.assets)){
                if(!name || name.includes('\\') || name.startsWith('/') || name.split('/').some(x=>x==='..'||x==='.'||!x))throw new Error('Invalid asset path: '+name);
                const target=path.join(assetDir,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,data);
            }
            assetFlags.push('--embed-file',assetDir+'@/assets');
        }
        stage='emcc_link';options.onStage?.('emcc_link');
        const libraries=['libgoose_physics_web.a','libbox3d.a','libgoose_ui_web.a','libgoose_audio_web.a','libgoose_gfx_web.a'].map(x=>path.join(root,'build/web-libs',x));
        for(const lib of libraries)if(!fs.existsSync(lib))throw new Error(`Required archive missing: ${lib}. Run npm run build:web-libs.`);
        run(['--no-entry',path.join(outDir,'game.o'),path.join(outDir,'entry.o'),...libraries,'-lm','-O2',...assetFlags,'--js-library',path.join(root,'platform/web/terminal.js'),
            '-sMODULARIZE=1','-sEXPORT_ES6=1','-sEXPORT_NAME=createGooseGame','-sENVIRONMENT=web,worker,node',
            '-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=134217728','-sMAXIMUM_MEMORY=536870912','-sSTACK_SIZE=16777216',
            '-sFORCE_FILESYSTEM=1','-sASYNCIFY=1','-sOFFSCREENCANVAS_SUPPORT=1','-sMIN_WEBGL_VERSION=2','-sMAX_WEBGL_VERSION=2',
            '-sEXPORTED_FUNCTIONS='+JSON.stringify(['_goose_web_run','_malloc','_free']),
            '-sEXPORTED_RUNTIME_METHODS='+JSON.stringify(['ccall','FS','lengthBytesUTF8','stringToUTF8','setValue','getValue']),'-o',output]);
        return {success:true,outDir,gameMjs:output,gameWasm:wasm,shaders:converted.shaders,wasmSize:fs.statSync(wasm).size,mjsSize:fs.statSync(output).size};
    }catch(e){return {success:false,stage,error:e.message,stderr:e.stderr?.toString()||'',stdout:e.stdout?.toString()||''};}
}
module.exports={buildProject};
