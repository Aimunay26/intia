import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { load } from './load-module.mjs';

const url = process.env.PREPARATION_TEST_DATABASE_URL;
if (!url || !['localhost','127.0.0.1'].includes(new URL(url).hostname) || !new URL(url).pathname.endsWith('_test')) throw Error('Solo DB local efímera.');
process.env.AUTH_SECRET = randomBytes(32).toString('hex');
delete process.env.PRODUCTION_FLOW_ENABLED; delete process.env.PRODUCTION_CHAIN_ENABLED;
const prisma = new PrismaClient({ datasourceUrl:url }), context = new AsyncLocalStorage(), registry = new Map();
const mocks = { '@/lib/prisma':{ prisma }, 'next/cache':{ revalidatePath(){}, revalidateTag(){} },
  'next/headers':{ cookies:async()=>({ get:k=>context.getStore()?.has(k)?{value:context.getStore().get(k)}:undefined, set:(k,v)=>context.getStore().set(k,v), delete:k=>context.getStore().delete(k) }), headers:async()=>new Headers() },
  'next/navigation':{ redirect:p=>{throw Error('REDIRECT:'+p);}, notFound:()=>{throw Error('NOT_FOUND');} } };
const mod = f=>load(f,mocks,registry), auth=mod('src/lib/auth.ts'), prep=mod('src/lib/preparation.ts'), actions=mod('src/app/actions/preparation.ts');
const content=mod('src/app/actions/content.ts'), tasks=mod('src/app/actions/tasks.ts'), scripts=mod('src/app/actions/scripts.ts'), approvals=mod('src/lib/approvals.ts'), casting=mod('src/app/actions/casting.ts');
const fd = data=>{const f=new FormData();for(const [k,v]of Object.entries(data))if(v!=null)f.set(k,String(v));return f;};
const as = async (id,fn)=>{const u=await prisma.user.findUniqueOrThrow({where:{id}}),jar=new Map();await context.run(jar,()=>auth.createSession(id,u.sessionVersion));return context.run(jar,fn);};
const video = ()=>prisma.contentItem.findUniqueOrThrow({where:{id:'video'},include:prep.preparationInclude});
const form = async (extra={})=>{const v=await video();return fd({contentItemId:v.id,expectedToken:prep.preparationToken(v),expectedUpdatedAt:v.updatedAt.toISOString(),...extra});};
const item = key=>prisma.preparationItem.findUniqueOrThrow({where:{contentItemId_sourceKey:{contentItemId:'video',sourceKey:key}}});
const itemForm = async (key,extra={})=>{const i=await item(key);return form({id:i.id,expectedUpdatedAt:i.updatedAt.toISOString(),...extra});};
const ok = r=>assert.ok(!r?.error,r?.error);
const sync = ()=>as('lead',async()=>actions.prepararGrabacion(await form()));
const confirm = (key,by='camera',extra={})=>as(by,async()=>actions.confirmarPreparacion(await itemForm(key,{done:'1',...extra})));
const save = (key,extra={})=>as('lead',async()=>actions.guardarPreparacion(await itemForm(key,{required:'1',...extra})));
const approve = async()=>{const a=await prisma.$transaction(tx=>approvals.approveVersion(tx,{id:'owner',name:'Owner'},'SCRIPT','script'));await prisma.script.update({where:{id:'script'},data:{approvalId:a.id,status:'APROBADO'}});};
const camera='assignment:camera-assignment',lead='assignment:lead-assignment',prop='scene:scene:0',wardrobe='scene:scene:1';
after(()=>prisma.$disconnect());

test('deriva checklist por persona y cada prop; repetir conserva identidades y tareas',async()=>{
  await prisma.brand.createMany({data:[{id:'brand',slug:'prep',name:'Preparación'},{id:'other',slug:'other',name:'Otra'}]});
  for(const [id,profile,brandId]of [['owner',null,'brand'],['lead','PRODUCTION','brand'],['camera','CAMERA','brand'],['camera2','CAMERA','brand'],['outsider','PRODUCTION','other']])await prisma.user.create({data:{id,name:id,email:`${id}@test.invalid`,passwordHash:'fixture',role:profile?'MEMBER':'OWNER',workProfiles:profile?{create:{profile}}:undefined,brandAccess:{create:{brandId}}}});
  await prisma.script.create({data:{id:'script',brandId:'brand',title:'Preparar',scenes:{create:{id:'scene',props:JSON.stringify(['Taza azul','Chaqueta blanca']),actors:'[]'}}}});await approve();
  await prisma.contentItem.create({data:{id:'video',title:'Preparación',brandId:'brand',scriptId:'script',preparationRequired:true,shootDate:new Date('2026-11-05T12:00Z'),shootStartMinute:600,shootEndMinute:660,scheduledDate:new Date('2026-11-06T12:00Z'),assignments:{create:[{id:'camera-assignment',userId:'camera',role:'CAMARA'},{id:'lead-assignment',userId:'lead',role:'PRODUCCION'}]},checklist:{create:[{id:'props-check',label:'Vestuario y props listos',stage:'PREPRODUCCION'},{id:'record-check',label:'Material grabado',stage:'GRABACION'}]}}});
  await assert.rejects(prep.assertPreparationReady(prisma,'video'),/Actualiza/);ok(await sync());
  const first=await video();assert.equal(first.preparationItems.length,4);assert.equal(await prisma.task.count(),2);
  ok(await sync());assert.deepEqual((await video()).preparationItems.map(i=>[i.id,i.taskId]),first.preparationItems.map(i=>[i.id,i.taskId]));
  assert.equal((await item(prop)).sourceText,'Taza azul');
});
test('responsables elegibles y aislados por marca; no se puede confirmar por otro',async()=>{
  assert.match((await save(prop,{assigneeId:'outsider'})).error,/Asigna antes/);
  assert.match((await save(prop,{assigneeId:'camera2'})).error,/Asigna antes/);
  await assert.rejects(as('outsider',async()=>actions.prepararGrabacion(await form())),/permiso|acceso/i);
  assert.match((await confirm(lead)).error,/Solo el responsable/);
  assert.match((await confirm(camera,'owner')).error,/Solo el responsable/);
  ok(await save(prop,{assigneeId:'camera'}));ok(await save(wardrobe,{assigneeId:'lead'}));
  assert.equal(await prisma.task.count(),4);
});
test('confirmación y tarea persisten juntas en una nueva conexión; revisión vieja rechazada',async()=>{
  const old=await itemForm(camera,{done:'1'});ok(await confirm(camera));
  const fresh=new PrismaClient({datasourceUrl:url});try{const i=await fresh.preparationItem.findUniqueOrThrow({where:{id:(await item(camera)).id},include:{task:true}});assert.equal(i.status,'LISTO');assert.equal(i.confirmedById,'camera');assert.equal(i.task.status,'HECHO');assert.equal(i.task.completedById,'camera');}finally{await fresh.$disconnect();}
  assert.match((await as('camera',()=>actions.confirmarPreparacion(old))).error,/registro cambió/);
  ok(await sync());assert.equal((await item(camera)).status,'LISTO');
  const t=await prisma.task.findUniqueOrThrow({where:{id:(await item(camera)).taskId}});
  assert.match((await as('camera',()=>tasks.cambiarEstadoTarea(fd({id:t.id,status:'HECHO',expectedUpdatedAt:t.updatedAt.toISOString()})))).error,/Preparación/);
});
test('sustitución explícita auditada; checklist genérico no evita requisitos',async()=>{
  assert.match((await confirm(lead,'owner',{substitute:'1'})).error,/motivo/);
  ok(await confirm(lead,'owner',{substitute:'1',reason:'Verificado junto al responsable'}));
  assert.equal((await item(lead)).overrideReason,'Verificado junto al responsable');assert.equal((await item(lead)).confirmedById,'owner');
  assert.equal(await prisma.auditLog.count({where:{entity:'PreparationItem',entityId:(await item(lead)).id,summary:{contains:'sustitución de lead'}}}),1);
  assert.match((await as('owner',()=>content.alternarCheck(fd({id:'props-check',done:'1'})))).error,/Falta preparación/);
  assert.match((await as('camera',()=>content.alternarCheck(fd({id:'record-check',done:'1'})))).error,/Falta preparación/);
  ok(await confirm(prop));ok(await confirm(wardrobe,'lead'));await prep.assertPreparationReady(prisma,'video');
  ok(await as('owner',()=>content.alternarCheck(fd({id:'props-check',done:'1'}))));
});
test('los estados de grabación y edición exigen preparación aunque el checklist global esté completo',async()=>{
  const a=await prisma.$transaction(tx=>approvals.approveVersion(tx,{id:'owner',name:'Owner'},'SCRIPT_APPROVAL','video'));
  await prisma.checklistItem.create({data:{contentItemId:'video',label:'Guion aprobado',stage:'PREPRODUCCION',kind:'SCRIPT_APPROVAL',done:true,approvalId:a.id,doneAt:new Date(),doneById:'owner'}});
  await prisma.contentItem.update({where:{id:'video'},data:{status:'APROBADO'}});
  ok(await confirm(prop,'camera',{done:'0'}));
  await prisma.checklistItem.updateMany({where:{contentItemId:'video',kind:'TASK'},data:{done:true,doneAt:new Date(),doneById:'owner'}});
  assert.match((await as('owner',async()=>content.cambiarEstado(fd({id:'video',status:'GRABACION',expectedUpdatedAt:(await video()).updatedAt.toISOString()})))).error,/Falta preparación/);
  await assert.rejects(mod('src/lib/domain/lifecycle.ts').assertAdvanceRequirements(prisma,'video',await video(),'EDICION'),/Falta preparación/);
  ok(await confirm(prop));ok(await as('owner',async()=>content.cambiarEstado(fd({id:'video',status:'GRABACION',expectedUpdatedAt:(await video()).updatedAt.toISOString()}))));
  assert.equal((await video()).status,'GRABACION');
});
test('reabrir prop reabre tarea y resumen; opcional exige motivo',async()=>{
  ok(await confirm(prop,'camera',{done:'0'}));assert.equal((await prisma.checklistItem.findUniqueOrThrow({where:{id:'props-check'}})).done,false);
  assert.equal((await prisma.task.findUniqueOrThrow({where:{id:(await item(prop)).taskId}})).status,'PENDIENTE');
  assert.match((await save(prop,{assigneeId:'camera',required:'0'})).error,/por qué/);
  ok(await save(prop,{assigneeId:'camera',required:'0',reason:'Plano alternativo sin taza'}));await prep.assertPreparationReady(prisma,'video');
  ok(await save(prop,{assigneeId:'camera'}));await assert.rejects(prep.assertPreparationReady(prisma,'video'),/Falta preparación/);ok(await confirm(prop));
});
test('fecha y horario reabren tareas aun con automatización apagada; volver no revive firmas',async()=>{
  const old=await itemForm(camera,{done:'1'});
  for(const shootDate of ['2026-11-07','2026-11-05'])ok(await as('owner',async()=>content.actualizarGrabacion(fd({id:'video',shootDate,expectedUpdatedAt:(await video()).updatedAt.toISOString()}))));
  assert.equal(await prisma.task.count({where:{status:'HECHO'}}),0);assert.equal(await prisma.task.count({where:{dueDate:(await video()).shootDate}}),4);
  assert.match((await as('camera',()=>actions.confirmarPreparacion(old))).error,/Cambió/);
  ok(await confirm(camera));
  const v=await video(),cast=mod('src/lib/casting.ts');ok(await as('lead',()=>casting.guardarHorarioReparto(fd({contentItemId:v.id,expectedToken:cast.castingToken(v),expectedUpdatedAt:v.updatedAt.toISOString(),start:'11:00',end:'12:00'}))));
  assert.equal((await item(camera)).status,'PENDIENTE');
});
test('edición real del guion reabre tareas, exige aprobación y retira props eliminados sin borrar historial',async()=>{
  ok(await confirm(camera));const s=await prisma.script.findUniqueOrThrow({where:{id:'script'}});
  ok(await as('owner',()=>scripts.actualizarEscena(fd({id:'scene',expectedUpdatedAt:s.updatedAt.toISOString(),props:'Taza roja',voice:'Nuevo texto',endSec:'10'}))));
  assert.equal((await item(camera)).status,'PENDIENTE');assert.match((await confirm(camera)).error,/aprobación|aprobado/);
  const oldTask=(await item(wardrobe)).taskId;ok(await sync());assert.equal((await item(wardrobe)).status,'RETIRADO');assert.equal((await prisma.task.findUniqueOrThrow({where:{id:oldTask}})).status,'CANCELADO');
  assert.equal((await item(prop)).label,'Taza roja');assert.equal((await item(prop)).assigneeId,null);await approve();
});
test('cambio de participante retira su requisito y cancela su tarea; nueva persona recibe trabajo',async()=>{
  ok(await confirm(camera));const oldTask=(await item(camera)).taskId;
  ok(await as('lead',()=>content.quitarAsignacion(fd({id:'camera-assignment'}))));
  assert.equal((await item(camera)).status,'RETIRADO');assert.equal((await prisma.task.findUniqueOrThrow({where:{id:oldTask}})).status,'CANCELADO');
  ok(await as('lead',()=>content.asignarPersona(fd({contentItemId:'video',userId:'camera2',role:'CAMARA'}))));ok(await sync());
  const next=(await video()).preparationItems.find(i=>i.assigneeId==='camera2');assert.ok(next.taskId);assert.equal(next.status,'PENDIENTE');
  await assert.rejects(confirm(camera),/acceso|permiso/);
});
test('requisitos manuales se asignan, confirman y retiran con motivo y tarea cancelada',async()=>{
  ok(await as('lead',async()=>actions.guardarPreparacion(await form({kind:'PERSONAL',label:'Revisar baterías de reserva',assigneeId:'camera2',required:'1'}))));
  const i=(await video()).preparationItems.find(i=>i.sourceKey.startsWith('manual:'));ok(await confirm(i.sourceKey,'camera2'));
  assert.match((await as('lead',async()=>actions.retirarPreparacion(await itemForm(i.sourceKey)))).error,/motivo/);
  ok(await as('lead',async()=>actions.retirarPreparacion(await itemForm(i.sourceKey,{reason:'Sustituido por equipo conectado'}))));assert.equal((await item(i.sourceKey)).status,'RETIRADO');assert.equal((await prisma.task.findUniqueOrThrow({where:{id:i.taskId}})).status,'CANCELADO');
});
test('fallo de auditoría revierte también la tarea y la confirmación',async()=>{
  const i=(await video()).preparationItems.find(i=>i.assigneeId==='camera2'&&i.status!=='RETIRADO'),before=await item(i.sourceKey),taskBefore=await prisma.task.findUniqueOrThrow({where:{id:before.taskId}});
  await prisma.$executeRawUnsafe(`CREATE FUNCTION qa_prep_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'QA audit failure'; END $$`);
  await prisma.$executeRawUnsafe('CREATE TRIGGER qa_prep_fail BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION qa_prep_fail()');
  try{await assert.rejects(confirm(i.sourceKey,'camera2'),/QA audit failure/);assert.deepEqual(await item(i.sourceKey),before);assert.deepEqual(await prisma.task.findUniqueOrThrow({where:{id:before.taskId}}),taskBefore);}finally{await prisma.$executeRawUnsafe('DROP TRIGGER qa_prep_fail ON "AuditLog"');await prisma.$executeRawUnsafe('DROP FUNCTION qa_prep_fail()');}
});
test('dos confirmaciones simultáneas conservan ambas firmas tras resolver el conflicto',async()=>{
  const i=(await video()).preparationItems.find(i=>i.assigneeId==='camera2'&&i.status!=='RETIRADO');
  const result=await Promise.all([confirm(i.sourceKey,'camera2'),confirm(lead,'lead')]);
  for(let index=0;index<result.length;index++)if(result[index]?.error){assert.match(result[index].error,/cambió|simult|conflicto/i);ok(await confirm(index===0?i.sourceKey:lead,index===0?'camera2':'lead'));}
  assert.equal((await item(i.sourceKey)).status,'LISTO');assert.equal((await item(lead)).status,'LISTO');
});
test('revocar perfil invalida la preparación; historial cerrado y archivo no se modifican',async()=>{
  const i=(await video()).preparationItems.find(i=>i.assigneeId==='camera2'&&i.status!=='RETIRADO');ok(await confirm(i.sourceKey,'camera2'));
  await prisma.userWorkProfile.updateMany({where:{userId:'camera2'},data:{profile:'TALENT'}});assert.equal(prep.preparationReady(await item(i.sourceKey),await video()),false);
  await prisma.contentItem.update({where:{id:'video'},data:{status:'EDICION'}});assert.match((await sync()).error,/cerrada/);
  await prisma.brand.update({where:{id:'brand'},data:{archived:true}});assert.match((await sync()).error,/archivadas/);
});
test('migración exige preparación en trabajo abierto y conserva grabaciones históricas y archivos',async()=>{
  for(const [id,brandId,status]of [['m-open','other','APROBADO'],['m-closed','other','EDICION'],['m-archived','brand','APROBADO'],['m-recorded','other','GRABACION']])await prisma.contentItem.create({data:{id,brandId,title:id,status,scheduledDate:new Date()}});
  await prisma.productionStep.create({data:{contentItemId:'m-recorded',brandId:'other',step:'GRABACION',status:'HECHO',doneAt:new Date(),dueAt:new Date(),automationKey:'m-recorded:GRABACION'}});
  const sql=readFileSync(new URL('../prisma/migrations/20261006140000_individual_preparation/migration.sql',import.meta.url),'utf8').match(/UPDATE "ContentItem"[\s\S]+?;/)[0];
  await prisma.$executeRawUnsafe(sql);
  for(const id of ['m-open','m-closed','m-archived','m-recorded'])assert.equal((await prisma.contentItem.findUniqueOrThrow({where:{id}})).preparationRequired,id==='m-open');
});
