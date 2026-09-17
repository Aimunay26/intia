import { seedApprovals } from './approval-fixture.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { load } from './load-module.mjs';
const url=process.env.PERMISSIONS_TEST_DATABASE_URL;
if(!url || !['localhost','127.0.0.1'].includes(new URL(url).hostname) || !new URL(url).pathname.endsWith('_test')) throw Error('Solo DB local efímera _test.');
const prisma=new PrismaClient({datasourceUrl:url}), context=new AsyncLocalStorage();
const mocks={ '@/lib/prisma':{prisma},'next/headers':{cookies:async()=>({get:key=>context.getStore().get(key)?{value:context.getStore().get(key)}:undefined,set:(key,value)=>context.getStore().set(key,value),delete:key=>context.getStore().delete(key)})},'next/cache':{revalidatePath:()=>{},revalidateTag:()=>{}},'next/navigation':{redirect:path=>{throw Error('REDIRECT:'+path);},notFound:()=>{throw Error('NOT_FOUND');}} };
const auth=load('src/lib/auth.ts',mocks), scopes=load('src/lib/access-scope.ts',mocks), pages=load('src/lib/render-context.ts',mocks);
const content=load('src/app/actions/content.ts',mocks), scripts=load('src/app/actions/scripts.ts',mocks), tasks=load('src/app/actions/tasks.ts',mocks), team=load('src/app/actions/team.ts',mocks), metrics=load('src/app/actions/metrics.ts',mocks), assetSecurity=load('src/lib/asset-security.ts',mocks), mutations=load('src/lib/mutations.ts',mocks);
const form=values=>{const fd=new FormData();for(const[key,value]of Object.entries(values))for(const item of Array.isArray(value)?value:[value])fd.append(key,String(item));return fd;};
const run=(jar,fn)=>context.run(jar,fn);
const jarFor=async id=>{const u=await prisma.user.findUniqueOrThrow({where:{id}}),jar=new Map();await run(jar,()=>auth.createSession(id,u.sessionVersion));return jar;};
const as=async(id,fn)=>run(await jarFor(id),fn);
const actor=async id=>as(id,()=>auth.requireUser());

test('perfiles: autorizaciones reales con sesiones firmadas y PostgreSQL',async t=>{
 process.env.AUTH_SECRET=randomBytes(32).toString('hex');process.env.BLOB_PRIVATE_ENABLED='false';
 const owner=await prisma.user.create({data:{id:'owner',name:'Owner',email:'owner@permissions.test',role:'OWNER',passwordHash:'fixture'}});
 await Promise.all(['A','B'].map(id=>prisma.brand.create({data:{id,name:'Marca '+id,slug:'profile-'+id}})));
 const archetype=await prisma.archetype.create({data:{id:'person',name:'Persona autorizada',slug:'profile-person'}});
 const profiles=['STRATEGY','WRITER','PRODUCTION','CAMERA','TALENT','EDITOR','DESIGNER','PUBLISHER','ANALYST'];
 for(const id of [...profiles,'EMPTY']){
  await prisma.user.create({data:{id,name:id,email:id+'@permissions.test',passwordHash:'fixture',archetypeId:id==='TALENT'?archetype.id:null}});
  if(id!=='EMPTY')await prisma.userWorkProfile.create({data:{userId:id,profile:id}});
  await prisma.userBrandAccess.create({data:{userId:id,brandId:'A'}});
 }
 const date=new Date('2026-09-07T12:00:00Z');
 const videos=await Promise.all(['assigned','unassigned','ready','foreign'].map(id=>prisma.contentItem.create({data:{id,title:id,brandId:id==='foreign'?'B':'A',scheduledDate:date,status:id==='ready'?'EDICION':'IDEA'}})));
 await prisma.checklistItem.create({data:{id:'approval',contentItemId:'ready',stage:'POSTPRODUCCION',label:'Revisión final aprobada',kind:'FINAL_APPROVAL',done:true,doneById:owner.id}});
 await prisma.checklistItem.createMany({data:[{id:'edit-check',contentItemId:'assigned',stage:'POSTPRODUCCION',label:'Editado'},{id:'approve-check',contentItemId:'assigned',stage:'POSTPRODUCCION',label:'Revisión final aprobada',kind:'FINAL_APPROVAL'}]});
 for(const userId of ['CAMERA','TALENT','EDITOR','DESIGNER'])await prisma.assignment.create({data:{contentItemId:'assigned',userId,role:userId==='TALENT'?'ACTOR':userId==='CAMERA'?'CAMARA':userId==='DESIGNER'?'DISENO':'EDITOR'}});
 // Even an assignment to another brand never grants brand access.
 await prisma.assignment.create({data:{contentItemId:'foreign',userId:'EDITOR',role:'EDITOR'}});
 const script=await prisma.script.create({data:{id:'script',title:'Guion A',brandId:'A',authorId:'WRITER',scenes:{create:{id:'scene',order:0,beat:'Inicio',startSec:0,endSec:5}}}});
 await prisma.contentItem.update({where:{id:'assigned'},data:{scriptId:script.id}});
 await prisma.script.create({data:{id:'foreign-script',title:'Guion B',brandId:'B',authorId:'WRITER'}});
 await prisma.taskColumn.create({data:{id:'column',name:'Pendiente'}});
 await prisma.task.createMany({data:[{id:'my-task',title:'Asignada',columnId:'column',brandId:'A',assigneeId:'EDITOR'},{id:'other-task',title:'Ajena',columnId:'column',brandId:'A',assigneeId:'CAMERA'},{id:'foreign-task',title:'Otra marca',columnId:'column',brandId:'B',assigneeId:'EDITOR'}]});
 try {
  await t.test('nueve perfiles cargan sus grants y cada consulta respeta marca y asignación',async()=>{
   const expected={STRATEGY:3,WRITER:3,PRODUCTION:3,CAMERA:1,TALENT:1,EDITOR:1,DESIGNER:1,PUBLISHER:1,ANALYST:3,EMPTY:0};
   for(const[id,count]of Object.entries(expected)){const a=await actor(id);assert.deepEqual(a.brandIds,['A']);assert.equal(await prisma.contentItem.count({where:scopes.contentScope(a)}),count,id);}
   assert.equal(await prisma.contentItem.count({where:scopes.contentScope(await actor('owner'))}),4);
   assert.deepEqual((await prisma.task.findMany({where:scopes.taskScope(await actor('EDITOR'))})).map(x=>x.id),['my-task']);
   assert.equal(await prisma.archetype.count({where:scopes.archetypeScope(await actor('TALENT'))}),1);
  });
  await t.test('URL directa a Equipo, Actividad, Ajustes e IA rechazada antes de cargar la página',async()=>{
   for(const id of profiles)for(const section of ['team','activity','settings'])await assert.rejects(as(id,()=>pages.requirePageSection(section)),/REDIRECT:\/sin-acceso/);
   await assert.rejects(as('EDITOR',()=>pages.requirePageSection('generator')),/sin-acceso/);
   await as('WRITER',()=>pages.requirePageSection('generator'));
  });
  await t.test('editor completa su checklist, pero no aprueba ni muta videos ajenos o de otra marca',async()=>{
   await as('EDITOR',()=>content.alternarCheck(form({id:'edit-check',done:'1'})));
   assert.equal((await prisma.checklistItem.findUniqueOrThrow({where:{id:'edit-check'}})).done,true);
   await assert.rejects(as('EDITOR',()=>content.alternarCheck(form({id:'approve-check',done:'1'}))),/permiso/);
   for(const id of ['unassigned','foreign']){const row=videos.find(v=>v.id===id);await assert.rejects(as('EDITOR',()=>content.cambiarEstado(form({id,status:'EDICION',expectedUpdatedAt:row.updatedAt.toISOString()}))),/acceso/);}
   await assert.rejects(as('STRATEGY',()=>content.crearVideo(form({title:'No',brandId:'A',status:'PUBLICADO'}))),/idea/);
   await assert.rejects(as('EDITOR',()=>content.asignarPersona(form({contentItemId:'unassigned',userId:'EDITOR',role:'EDITOR'}))),/permiso/);
  });
  await t.test('guionista escribe su guion, cámara solo lee y los IDs externos no autorizan',async()=>{
   await assert.rejects(as('CAMERA',()=>scripts.actualizarGuion(form({id:'script',title:'Intruso',expectedUpdatedAt:script.updatedAt.toISOString()}))),/permiso/);
   await assert.rejects(as('WRITER',()=>scripts.actualizarGuion(form({id:'foreign-script',title:'Intruso'}))),/acceso/);
   await as('WRITER',()=>scripts.actualizarGuion(form({id:'script',title:'Editado',expectedUpdatedAt:script.updatedAt.toISOString()})));
   await as('STRATEGY',async()=>{const row=await prisma.script.findUniqueOrThrow({where:{id:'script'}});await scripts.cambiarEstadoGuion(form({id:'script',status:'REVISION',expectedUpdatedAt:row.updatedAt.toISOString()}));});
   const current=await prisma.script.findUniqueOrThrow({where:{id:'script'}});assert.equal(current.status,'REVISION');
   await assert.rejects(as('WRITER',()=>scripts.cambiarEstadoGuion(form({id:'script',status:'APROBADO',expectedUpdatedAt:current.updatedAt.toISOString()}))),/permiso/);
   await as('STRATEGY',()=>scripts.cambiarEstadoGuion(form({id:'script',status:'APROBADO',expectedUpdatedAt:current.updatedAt.toISOString()})));
   await assert.rejects(as('WRITER',()=>scripts.anadirEscena(form({scriptId:'script',beat:'Sin autorización'}))),/reabrir/);
  });
  await t.test('publicación solo ve contenido con aprobación final y no puede aprobarse a sí misma',async()=>{
   await assert.rejects(as('PUBLISHER',()=>content.cambiarEstado(form({id:'unassigned',status:'PUBLICADO',expectedUpdatedAt:videos[1].updatedAt.toISOString()}))),/acceso/);
   await assert.rejects(as('PUBLISHER',()=>content.alternarCheck(form({id:'approval',done:'1'}))),/permiso/);
   await seedApprovals(prisma,'ready','owner');
   await prisma.contentItem.update({where:{id:'ready'},data:{status:'PROGRAMADO'}});
   const current=await prisma.contentItem.findUniqueOrThrow({where:{id:'ready'}});
   await as('PUBLISHER',()=>content.cambiarEstado(form({id:'ready',status:'PUBLICADO',expectedUpdatedAt:current.updatedAt.toISOString()})));
   assert.equal((await prisma.contentItem.findUniqueOrThrow({where:{id:'ready'}})).status,'PUBLICADO');
  });
  await t.test('métricas: analista escribe semanas autorizadas; estrategia lee sin poder cargar',async()=>{
   const values={contentItemId:'assigned',date:'2026-09-07',platform:'TIKTOK',views:50};
   await assert.rejects(as('STRATEGY',()=>content.guardarMetrica(form(values))),/permiso/);
   await as('ANALYST',()=>content.guardarMetrica(form(values)));
   await assert.rejects(as('ANALYST',()=>content.guardarMetrica(form({...values,contentItemId:'foreign'}))),/acceso/);
   const result=await as('ANALYST',()=>metrics.importarMetricasCsv(null,form({csv:'video,semana,plataforma,vistas\nforeign,2026-09-07,TIKTOK,999'})));
   assert.ok(result.error || result.ignored.length);assert.equal(await prisma.metric.count({where:{contentItemId:'foreign'}}),0);
  });
  await t.test('archivos: asignación, marca, catálogo y perfil personal se verifican también al descargar',async()=>{
   const editor=await actor('EDITOR'),talent=await actor('TALENT'),writer=await actor('WRITER');
   await assetSecurity.assertAssetOwner(prisma,'content','assigned',editor,true);
   await assert.rejects(assetSecurity.assertAssetOwner(prisma,'content','foreign',editor),/acceso/);
   await assert.rejects(assetSecurity.assertAssetOwner(prisma,'content','assigned',talent,true),/permiso/);
   await assetSecurity.assertAssetOwner(prisma,'brand','A',writer);
   await assert.rejects(assetSecurity.assertAssetOwner(prisma,'brand','A',writer,true),/permiso/);
   await assert.rejects(assetSecurity.assertAssetOwner(prisma,'user','owner',writer),/permiso/);
   await assetSecurity.assertAssetOwner(prisma,'user','WRITER',writer,true);
  });
  await t.test('tarea ajena y reasignación maliciosa se rechazan; el responsable actualiza su avance',async()=>{
   const row=await prisma.task.update({where:{id:'my-task'},data:{dueDate:new Date('2026-09-07T05:00:00Z')}});
   const values={id:row.id,title:row.title,description:'avance',kind:row.kind,priority:row.priority,columnId:row.columnId,brandId:'A',assigneeId:'EDITOR',dueDate:'2026-09-07',expectedUpdatedAt:row.updatedAt.toISOString()};
   await assert.rejects(as('EDITOR',()=>tasks.actualizarTarea(form({...values,assigneeId:'CAMERA'}))),/reasignar/);
   await assert.rejects(as('EDITOR',()=>tasks.actualizarTarea(form({...values,id:'other-task'}))),/acceso/);
   await assert.rejects(as('EDITOR',()=>tasks.actualizarTarea(form({...values,dueDate:'2026-09-08'}))),/planificar/);
   await as('EDITOR',()=>tasks.actualizarTarea(form(values)));
   assert.equal((await prisma.task.findUniqueOrThrow({where:{id:row.id}})).description,'avance');
   assert.equal((await prisma.task.findUniqueOrThrow({where:{id:row.id}})).dueDate.toISOString(),row.dueDate.toISOString());
  });
  await t.test('perfiles combinados no extienden edición a videos sin asignación',async()=>{
   await prisma.userWorkProfile.create({data:{userId:'EDITOR',profile:'ANALYST'}});
   const a=await actor('EDITOR');assert.equal(await prisma.contentItem.count({where:scopes.contentScope(a)}),3);assert.equal(await prisma.contentItem.count({where:scopes.contentScope(a,'content.editing')}),1);
  });
  await t.test('el Dueño asigna perfiles y marcas, audita, revoca sesiones y guardar sin cambios es idempotente',async()=>{
   const jar=await jarFor('EMPTY'), old=await run(jar,()=>auth.requireUser());
   const values={id:'EMPTY',name:'EMPTY',email:'EMPTY@permissions.test',role:'MEMBER',accessConfigured:'1',profiles:['WRITER','EDITOR'],brandIds:['A'],expectedUpdatedAt:(await prisma.user.findUniqueOrThrow({where:{id:'EMPTY'}})).updatedAt.toISOString()};
   const saved=await as('owner',()=>team.actualizarUsuario(null,form(values)));assert.ok(saved.ok);
   assert.equal(await run(jar,()=>auth.getSession()),null);
   await assert.rejects(mutations.withMutation(old,false,async()=>{}),/acceso cambió/);
   const fresh=await prisma.user.findUniqueOrThrow({where:{id:'EMPTY'}});values.email=fresh.email;values.expectedUpdatedAt=fresh.updatedAt.toISOString();
   await as('owner',()=>team.actualizarUsuario(null,form(values)));
   assert.equal((await prisma.user.findUniqueOrThrow({where:{id:'EMPTY'}})).sessionVersion,fresh.sessionVersion);
   assert.ok(await prisma.auditLog.count({where:{entity:'User',entityId:'EMPTY'}}));
   const denied=await as('EMPTY',()=>team.actualizarUsuario(null,form({...values,role:'OWNER'})));assert.ok(denied.error);
  });
  await t.test('SQL directo al retirar una marca revoca sesiones y protege las siguientes escrituras',async()=>{
   const jar=await jarFor('EMPTY'),old=await run(jar,()=>auth.requireUser());
   await prisma.userBrandAccess.delete({where:{userId_brandId:{userId:'EMPTY',brandId:'A'}}});
   assert.equal(await run(jar,()=>auth.getSession()),null);
   await assert.rejects(mutations.withMutation(old,false,async()=>{}),/acceso cambió/);
  });
  await t.test('al retirar una marca se oculta el historial IA y el trabajo se cancela sin consumir proveedor',async()=>{
   process.env.AI_JOBS_ENABLED='true';let calls=0;
   const jobs=load('src/lib/generation-jobs.ts',{...mocks,'@/lib/ai':{generateScript:async()=>{calls++;throw Error('No debe llamar');},AiError:class extends Error {}}});
   const structure=await prisma.structure.create({data:{name:'Fixture',slug:'permission-format'}});
   const id=await jobs.enqueueGeneration(await actor('WRITER'),randomUUID(),[structure.id],{request:'Solo fixture',provider:'anthropic',brandId:'A'});
   assert.equal((await jobs.generationStatus(await actor('WRITER'),id)).id,id);
   await prisma.userBrandAccess.delete({where:{userId_brandId:{userId:'WRITER',brandId:'A'}}});
   assert.equal(await jobs.generationStatus(await actor('WRITER'),id),null);
   await prisma.userBrandAccess.create({data:{userId:'WRITER',brandId:'B'}});
   assert.equal(await jobs.generationStatus(await actor('WRITER'),id),null);
   await jobs.processGeneration(id);assert.equal(calls,0);assert.equal((await prisma.generationJob.findUniqueOrThrow({where:{id}})).status,'CANCELLED');
  });
 } finally {await prisma.$disconnect();}
});
