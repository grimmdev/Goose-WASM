const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
function runTool(name,args,options={}){
  let executable=process.env[name.toUpperCase()]||name;
  if(process.env.EMSDK && ['emcc','em++','emar'].includes(name)){
    const file=path.join(process.env.EMSDK,'upstream','emscripten',name==='em++'?'em++.py':name+'.py');
    if(fs.existsSync(file))executable=file;
  }
  if(process.platform==='win32' && !executable.endsWith('.py')){
    for(const dir of (process.env.PATH||'').split(path.delimiter)){
      const py=path.join(dir,name+'.py');if(fs.existsSync(py)){executable=py;break;}
    }
  }
  if(executable.endsWith('.py'))return execFileSync(process.env.EMSDK_PYTHON?.replace(/^"|"$/g,'')||(process.platform==='win32'?'python':'python3'),[executable,...args],options);
  return execFileSync(executable,args,options);
}
module.exports={runTool};
