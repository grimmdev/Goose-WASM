// Materialize a disposable source copy and fail closed when upstream patches drift.
const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
function patchedSource(source,dest,patches,{subdirectories}={}){
 fs.rmSync(dest,{recursive:true,force:true});fs.mkdirSync(dest,{recursive:true});
 if(subdirectories)for(const part of subdirectories)fs.cpSync(path.join(source,part),path.join(dest,part),{recursive:true});
 else fs.cpSync(source,dest,{recursive:true,filter:p=>path.basename(p)!=='.git'&&path.basename(p)!=='build'});
 execFileSync('git',['init','--quiet',dest]);
 for(const patch of patches){execFileSync('git',['-C',dest,'apply','--check',patch]);execFileSync('git',['-C',dest,'apply',patch]);}
 return dest;
}
module.exports={patchedSource};
