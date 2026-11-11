process.once('message',async({options})=>{
 try{const {buildProject}=require('./build-core.cjs');const result=await buildProject({...options,onStage:stage=>process.send?.({type:'stage',stage})});process.send?.({type:'result',result},()=>process.exit(result.success?0:1));}
 catch(error){process.send?.({type:'result',result:{success:false,stage:'worker',error:error.stack||String(error)}},()=>process.exit(1));}
});
