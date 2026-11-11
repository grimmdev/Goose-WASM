// Restores omitted submodules for source ZIPs as well as normal git checkouts.
const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
const root=path.resolve(__dirname,'..');
const dependencies=[['goose','https://github.com/aardappel/goose.git','f4637bfb342fb70d42bea0474eab9e62a3c99d68'],['goose_gfx','https://github.com/aardappel/goose_gfx.git','737d91acadf0a35141c16273b281f0844b2024e0'],['goose_physics','https://github.com/aardappel/goose_physics.git','805ad8698593e2f7fb05d7b3f62d8cf75b6e435f']];
for(const [name,url,revision] of dependencies){
 const dest=path.join(root,name);
 if(fs.existsSync(path.join(dest,'.git'))){
  const actual=execFileSync('git',['-C',dest,'rev-parse','HEAD'],{encoding:'utf8'}).trim();if(actual!==revision)throw new Error(`${name}: expected ${revision}, found ${actual}. Refusing to change an existing checkout.`);
 }else{if(fs.existsSync(dest)&&fs.readdirSync(dest).length)throw new Error(`${dest} is not an empty directory or git checkout`);execFileSync('git',['clone','--no-checkout',url,dest],{stdio:'inherit'});execFileSync('git',['-C',dest,'checkout','--detach',revision],{stdio:'inherit'});}
 if(name==='goose_gfx')execFileSync('git',['-C',dest,'submodule','update','--init','--depth','1','third_party/nuklear'],{stdio:'inherit'});
 if(name==='goose_physics')execFileSync('git',['-C',dest,'submodule','update','--init','--depth','1','third_party/box3d'],{stdio:'inherit'});
}
console.log('Pinned compiler, physics and UI sources ready. SDL is not needed for the web build.');
