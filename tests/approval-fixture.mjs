import { load } from './load-module.mjs';
/** Datos ficticios para suites de permisos. El recorrido de negocio se prueba en postgres-workflow. */
export async function seedApprovals(db, videoId, userId) {
 const approvals=load('src/lib/approvals.ts',{'@/lib/prisma':{prisma:db}});
 const user=await db.user.findUniqueOrThrow({where:{id:userId}});
 await db.$transaction(async tx=>{
  let video=await tx.contentItem.findUniqueOrThrow({where:{id:videoId}});
  if(!video.scriptId){const s=await tx.script.create({data:{title:'Guion fixture aprobado',brandId:video.brandId,authorId:userId,scenes:{create:{order:0,beat:'Inicio',voice:'Texto fixture',startSec:0,endSec:5}}}});video=await tx.contentItem.update({where:{id:videoId},data:{scriptId:s.id}});}
  const s=await approvals.approveVersion(tx,user,'SCRIPT',video.scriptId);
  await tx.script.update({where:{id:video.scriptId},data:{approvalId:s.id,status:'APROBADO'}});
  for(const kind of ['SCRIPT_APPROVAL','FINAL_APPROVAL']){
   let check=await tx.checklistItem.findFirst({where:{contentItemId:videoId,kind}});
   if(!check)check=await tx.checklistItem.create({data:{contentItemId:videoId,kind,label:kind,stage:kind==='SCRIPT_APPROVAL'?'PREPRODUCCION':'POSTPRODUCCION'}});
   const a=await approvals.approveVersion(tx,user,kind,videoId);
   await tx.checklistItem.update({where:{id:check.id},data:{approvalId:a.id,done:true,doneById:userId,doneAt:new Date()}});
  }
  await tx.contentItem.update({where:{id:videoId},data:{status:'EDICION',publishedUrl:'https://example.test/fixture'}});
 });
}
