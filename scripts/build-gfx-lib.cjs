const fs=require('fs'),path=require('path'),{runTool}=require('./tool-runner.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'build/web-libs');fs.mkdirSync(out,{recursive:true});
const objects=[];
for(const file of ['gfx_device.c','gfx_resources.c','gfx_pipeline.c','gfx_draw.c','gfx_input.c','web_gamepad.c']){
 const object=path.join(out,file.replace('.c','.o'));objects.push(object);
 runTool('emcc',['-std=gnu11','-O2','-I',path.join(root,'platform/include'),'-I',path.join(root,'platform/web'),'-I',path.join(root,'goose_gfx/third_party/nuklear/example'),'-c',path.join(root,'platform/web',file),'-o',object],{stdio:'inherit'});
}
runTool('emar',['rcs',path.join(out,'libgoose_gfx_web.a'),...objects]);
