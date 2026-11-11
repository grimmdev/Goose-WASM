/** Durable project files. Assets outside /project are never persisted. */
export const MAX_FILE_BYTES=16*1024*1024;
export function projectPath(path:string):string{
 if(typeof path!=='string'||!path||path.includes('\\')||path.includes('\0')||path.startsWith('/')||path.split('/').some(x=>!x||x==='.'||x==='..'))throw new Error('Invalid project-relative path: '+path);
 return path;
}
export class ProjectStore {
 private db:Promise<IDBDatabase>;
 constructor(private projectId:string){
  if(!projectId||projectId.length>256)throw new Error('Invalid project ID');
  this.db=new Promise((resolve,reject)=>{
   const req=indexedDB.open('goose-wasm-projects',1);
   req.onupgradeneeded=()=>req.result.createObjectStore('files',{keyPath:['project','path']});
   req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);req.onblocked=()=>reject(new Error('Project database upgrade blocked'));
  });
 }
 private async transact(mode:IDBTransactionMode,action:(s:IDBObjectStore)=>void):Promise<void>{
  const db=await this.db;await new Promise<void>((resolve,reject)=>{const tx=db.transaction('files',mode);action(tx.objectStore('files'));tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Project transaction aborted'));});
 }
 async files():Promise<Record<string,Uint8Array>>{
  const db=await this.db;return new Promise((resolve,reject)=>{const tx=db.transaction('files','readonly'),req=tx.objectStore('files').getAll(IDBKeyRange.bound([this.projectId,''],[this.projectId,'\uffff']));req.onsuccess=()=>{const files:Record<string,Uint8Array>=Object.create(null);for(const r of req.result)files[r.path]=new Uint8Array(r.bytes);resolve(files);};req.onerror=()=>reject(req.error);});
 }
 async write(path:string,bytes:Uint8Array){projectPath(path);if(bytes.length>MAX_FILE_BYTES)throw new Error('Project file exceeds 16 MiB');
  const files=await this.files();let total=bytes.length;for(const [name,data] of Object.entries(files))if(name!==path)total+=data.length;if(total>64*1024*1024)throw new Error('Project exceeds 64 MiB');
  await this.transact('readwrite',s=>s.put({project:this.projectId,path,bytes:bytes.slice().buffer}));
 }
 async remove(path:string){projectPath(path);await this.transact('readwrite',s=>s.delete([this.projectId,path]));}
 async close(){(await this.db).close();}
}
