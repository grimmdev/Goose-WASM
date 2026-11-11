const fs=require('fs'),path=require('path'),{runTool}=require('./tool-runner.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'build/web-libs');fs.mkdirSync(out,{recursive:true});
const box=process.env.GOOSE_BOX3D_DIR||path.join(root,'goose_physics/third_party/box3d');
const physics=process.env.GOOSE_PHYSICS_DIR||path.join(root,'goose_physics');
const gfx=process.env.GOOSE_GFX_DIR||path.join(root,'goose_gfx');
for(const dir of [path.join(box,'src'),path.join(physics,'src'),path.join(gfx,'third_party/nuklear')])if(!fs.existsSync(dir))throw new Error(`Dependency missing: ${dir}. Run node scripts/fetch-deps.cjs.`);
function archive(name,sourceDir,includes,flags=[],exclude=[]){
    const objects=[];
    for(const file of fs.readdirSync(sourceDir).filter(x=>x.endsWith('.c')&&!exclude.includes(x)).sort()){
        const object=path.join(out,name+'_'+file.replace('.c','.o'));
        runTool('emcc',['-std=gnu17','-O2',...flags,...includes.flatMap(p=>['-I',p]),'-c',path.join(sourceDir,file),'-o',object],{stdio:'inherit'});objects.push(object);
    }
    return objects;
}
let objects=archive('box',path.join(box,'src'),[path.join(box,'include'),path.join(box,'src')],['-DBOX3D_DISABLE_SIMD'],['timer.c']);
const serial=path.join(out,'box3d_serial.o');runTool('emcc',['-std=gnu17','-O2','-DBOX3D_DISABLE_SIMD','-I',path.join(box,'include'),'-I',path.join(box,'src'),'-c',path.join(root,'platform/web/box3d_serial.c'),'-o',serial],{stdio:'inherit'});
runTool('emar',['rcs',path.join(out,'libbox3d.a'),...objects,serial]);
const patchedPhysics=require('./patched-source.cjs').patchedSource(physics,path.join(root,'build/physics-source'),[path.join(root,'patches/0002-physics-web-serial.patch')],{subdirectories:['src']});
objects=archive('phys',path.join(patchedPhysics,'src'),[path.join(box,'include'),path.join(patchedPhysics,'src')],['-DBOX3D_DISABLE_SIMD']);
runTool('emar',['rcs',path.join(out,'libgoose_physics_web.a'),...objects]);
objects=archive('ui',path.join(gfx,'src/ui'),[path.join(gfx,'third_party/nuklear'),path.join(gfx,'src/ui')]);
runTool('emar',['rcs',path.join(out,'libgoose_ui_web.a'),...objects]);
const patchedGfx=require('./patched-source.cjs').patchedSource(gfx,path.join(root,'build/audio-source'),[path.join(root,'patches/0003-audio-web-device.patch')],{subdirectories:['src/audio']});
objects=archive('audio',path.join(patchedGfx,'src/audio'),[path.join(patchedGfx,'src/audio'),path.join(root,'platform/web')]);
runTool('emar',['rcs',path.join(out,'libgoose_audio_web.a'),...objects]);
require('./build-gfx-lib.cjs');
console.log('Real physics, UI, and WebGL archives built.');
