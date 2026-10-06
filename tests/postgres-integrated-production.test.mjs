/** Un mismo video atraviesa las acciones reales de todos los perfiles; sin IA ni servicios externos. */
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { load } from './load-module.mjs';

const url=process.env.INTEGRATED_PRODUCTION_TEST_DATABASE_URL;
if(!url||!['localhost','127.0.0.1'].includes(new URL(url).hostname)||!new URL(url).pathname.endsWith('_test'))throw Error('Solo DB local efímera _test.');
process.env.AUTH_SECRET=randomBytes(32).toString('hex');
process.env.PRODUCTION_FLOW_ENABLED='true';process.env.PRODUCTION_CHAIN_ENABLED='true';delete process.env.PRODUCTION_CHAIN_BRANDS;
const db=new PrismaClient({datasourceUrl:url}),context=new AsyncLocalStorage(),registry=new Map();
const mocks={'@/lib/prisma':{prisma:db},'@/lib/ai':{normalizeSceneTimes:x=>x},
 'next/cache':{revalidatePath(){},revalidateTag(){}},
 'next/headers':{cookies:async()=>({get:k=>context.getStore()?.has(k)?{value:context.getStore().get(k)}:undefined,set:(k,v)=>context.getStore().set(k,v),delete:k=>context.getStore().delete(k)}),headers:async()=>new Headers()},
 'next/navigation':{redirect:path=>{throw Error('REDIRECT:'+path);},notFound:()=>{throw Error('NOT_FOUND');}}};
const mod=f=>load(f,mocks,registry),auth=mod('src/lib/auth.ts'),content=mod('src/app/actions/content.ts'),scripts=mod('src/app/actions/scripts.ts');
const production=mod('src/app/actions/production.ts'),casting=mod('src/lib/casting.ts'),cast=mod('src/app/actions/casting.ts');
const prep=mod('src/lib/preparation.ts'),prepare=mod('src/app/actions/preparation.ts'),tasks=mod('src/app/actions/tasks.ts');
const work=mod('src/lib/production-scope.ts'),scope=mod('src/lib/access-scope.ts');
const fd=data=>{const f=new FormData();for(const [k,v]of Object.entries(data))if(v!=null)f.set(k,String(v));return f;};
const session=async id=>{const u=await db.user.findUniqueOrThrow({where:{id},include:{workProfiles:true,brandAccess:true}});return {...u,profiles:u.workProfiles.map(p=>p.profile),brandIds:u.brandAccess.map(b=>b.brandId)};};
// Cada acción entra con una sesión nueva: las autorizaciones no vienen de un mock de usuario.
const as=async(id,fn)=>{const u=await session(id),jar=new Map();await context.run(jar,()=>auth.createSession(id,u.sessionVersion));return context.run(jar,fn);};
const ok=r=>assert.ok(!r?.error,r?.error);
let videoId,designId;
const video=()=>db.contentItem.findUniqueOrThrow({where:{id:videoId},include:{...casting.castingInclude,...prep.preparationInclude}});
const step=kind=>db.productionStep.findFirstOrThrow({where:{contentItemId:videoId,step:kind},include:{task:true}});
const formStep=async(kind,extra={})=>{const s=await step(kind);return fd({id:s.id,expectedUpdatedAt:s.updatedAt.toISOString(),expectedReviewToken:s.reviewToken,...extra});};
const listo=(who,kind,extra={})=>as(who,async()=>production.marcarListo(await formStep(kind,extra)));
const returned=(who,kind,motivo)=>as(who,async()=>production.devolverPaso(await formStep(kind,{motivo})));
const castForm=async(extra={})=>{const v=await video();return fd({contentItemId:videoId,expectedToken:casting.castingToken(v),expectedUpdatedAt:v.updatedAt.toISOString(),...extra});};
const roleForm=async(extra={})=>{const r=(await video()).castRoles[0];return castForm({id:r.id,expectedUpdatedAt:r.updatedAt.toISOString(),...extra});};
const prepForm=async(extra={})=>{const v=await video();return fd({contentItemId:videoId,expectedToken:prep.preparationToken(v),expectedUpdatedAt:v.updatedAt.toISOString(),...extra});};
const prepItemForm=async(id,extra={})=>{const i=await db.preparationItem.findUniqueOrThrow({where:{id}});return prepForm({id,expectedUpdatedAt:i.updatedAt.toISOString(),...extra});};
const confirmAll=async()=>{
 for(const i of (await video()).preparationItems.filter(i=>i.status!=='RETIRADO'))ok(await as(i.assigneeId,async()=>prepare.confirmarPreparacion(await prepItemForm(i.id,{done:'1'}))));
};
async function verifyPending(kind,who){
 const rows=await db.productionStep.findMany({where:{contentItemId:videoId,status:'PENDIENTE',step:{not:'DISENO'}},include:{task:true}});
 assert.equal(rows.length,1);assert.equal(rows[0].step,kind);assert.equal(rows[0].assigneeId,who);assert.equal(rows[0].task.status,'PENDIENTE');assert.equal(rows[0].task.assigneeId,who);
 const inbox=await work.readMyWork(await session(who));assert.ok([...Object.values(inbox.groups).flat(),...inbox.returned].some(s=>s.id===rows[0].id));
 const fresh=new PrismaClient({datasourceUrl:url});try{assert.equal((await fresh.productionStep.findUniqueOrThrow({where:{id:rows[0].id}})).taskId,rows[0].taskId);}finally{await fresh.$disconnect();}
}
after(()=>db.$disconnect());

test('idea creada por estrategia genera tarea visible al guionista; marca ajena queda aislada',async()=>{
 await db.brand.createMany({data:[{id:'A',name:'Integración',slug:'integration'},{id:'B',name:'Ajena',slug:'foreign'}]});
 await db.archetype.create({data:{id:'sage',name:'Sabio',slug:'sage'}});
 for(const [id,profile]of [['owner',null],['lead','STRATEGY'],['writer','WRITER'],['production','PRODUCTION'],['camera','CAMERA'],['talent','TALENT'],['editor','EDITOR'],['designer','DESIGNER'],['publisher','PUBLISHER']])await db.user.create({data:{id,name:id,email:`${id}@integrated.test`,role:id==='owner'?'OWNER':'MEMBER',passwordHash:'fixture',archetypeId:id==='talent'?'sage':null,workProfiles:profile?{create:{profile}}:undefined,brandAccess:{create:{brandId:'A'}}}});
 await db.brandTeamMember.createMany({data:Object.entries({ENCARGADO:'lead',GUIONISTA:'writer',FILMMAKER:'camera',EDITOR:'editor',DISENADOR:'designer',COMMUNITY:'publisher'}).map(([role,userId])=>({brandId:'A',role,userId}))});
 await db.taskColumn.createMany({data:[{id:'first',name:'Por hacer',order:0},{id:'last',name:'Terminado',order:1}]});
 await assert.rejects(as('lead',()=>content.crearVideo(fd({brandId:'A',title:'Video integrado',status:'IDEA',scheduledDate:'2026-11-10'}))),/REDIRECT:\/contenido\//);
 videoId=(await db.contentItem.findFirstOrThrow({where:{title:'Video integrado'}})).id;
 assert.equal((await video()).preparationRequired,true);await verifyPending('GUION','writer');
 await db.contentItem.create({data:{id:'foreign',title:'Ajeno',brandId:'B',scheduledDate:new Date()}});
 for(const who of ['lead','writer','production','camera','talent','editor','designer','publisher'])assert.equal(await db.contentItem.count({where:{AND:[{id:'foreign'},scope.contentScope(await session(who))]}}),0);
});

test('guion vinculado, devolución humana y nueva entrega mantienen tarea; escritor no se autoaprueba',async()=>{
 // Respuesta sintética ya persistida. La generación con proveedor se cubre en test:workflow.
 await db.script.create({data:{id:'script',title:'Guion integrado',brandId:'A',authorId:'writer',cta:'Conoce la demo',scenes:{create:{id:'scene',order:0,beat:'Gancho',voice:'Hola',actors:'[{"role":"Presentador","archetype":"Sabio"}]',props:'["Taza QA"]'}}}});
 ok(await as('writer',()=>scripts.asignarGuionAVideo(fd({scriptId:'script',contentItemId:videoId}))));
 const original=await step('GUION');ok(await listo('writer','GUION'));await verifyPending('REVISION_GUION','lead');
 assert.match((await listo('writer','REVISION_GUION')).error,/permisos de revisión/);
 ok(await returned('lead','REVISION_GUION','Corregir el cierre del guion'));await verifyPending('GUION','writer');assert.equal((await step('GUION')).taskId,original.taskId);
 const s=await db.script.findUniqueOrThrow({where:{id:'script'}});
 ok(await as('writer',()=>scripts.actualizarEscena(fd({id:'scene',expectedUpdatedAt:s.updatedAt.toISOString(),voice:'Mira la taza de demostración',actors:'[{"role":"Presentador","archetype":"Sabio"}]',props:'Taza QA',endSec:10}))));
 ok(await listo('writer','GUION'));ok(await listo('lead','REVISION_GUION'));await verifyPending('GRABACION','camera');
 assert.equal((await db.script.findUniqueOrThrow({where:{id:'script'},include:{approval:true}})).approval.approvedById,'lead');
});

test('producción programa, reparte y asigna props; cada participante recibe y confirma su preparación',async()=>{
 ok(await as('production',async()=>content.actualizarGrabacion(fd({id:videoId,shootDate:'2026-11-05',expectedUpdatedAt:(await video()).updatedAt.toISOString()}))));
 ok(await as('production',async()=>cast.guardarHorarioReparto(await castForm({start:'10:00',end:'11:00'}))));
 ok(await as('production',async()=>cast.prepararReparto(await castForm())));
 ok(await as('production',async()=>cast.asignarPapel(await roleForm({userId:'talent'}))));
 assert.match((await as('production',async()=>cast.responderPapel(await roleForm({response:'CONFIRMADO'})))).error,/Solo el actor/);
 ok(await as('talent',async()=>cast.responderPapel(await roleForm({response:'CONFIRMADO'}))));
 ok(await as('production',async()=>prepare.prepararGrabacion(await prepForm())));
 const items=(await video()).preparationItems,prop=items.find(i=>i.kind==='PROP');assert.equal(items.length,3);
 ok(await as('production',async()=>prepare.guardarPreparacion(await prepItemForm(prop.id,{assigneeId:'camera',required:'1'}))));
 assert.match((await listo('camera','GRABACION',{materialUrl:'https://example.invalid/raw-v1'})).error,/preparación|requisito/i);
 await confirmAll();await prep.assertPreparationReady(db,videoId);await casting.assertCastingReady(db,videoId);
 for(const i of (await video()).preparationItems){const t=await db.task.findUniqueOrThrow({where:{id:i.taskId}});assert.equal(t.status,'HECHO');assert.equal(t.completedById,i.assigneeId);}
 const t=await db.task.findUniqueOrThrow({where:{id:prop.taskId??(await db.preparationItem.findUniqueOrThrow({where:{id:prop.id}})).taskId}});
 assert.match((await as('camera',()=>tasks.cambiarEstadoTarea(fd({id:t.id,status:'HECHO',expectedUpdatedAt:t.updatedAt.toISOString()})))).error,/Preparación/);
});

test('reprogramar invalida firmas y sincroniza plazos; confirmar de nuevo permite grabar',async()=>{
 const old=(await video()).preparationItems.map(i=>[i.id,i.taskId]);
 ok(await as('production',async()=>content.actualizarGrabacion(fd({id:videoId,shootDate:'2026-11-06',expectedUpdatedAt:(await video()).updatedAt.toISOString()}))));
 assert.equal((await video()).preparationItems.filter(i=>i.status==='LISTO').length,0);
 await assert.rejects(casting.assertCastingReady(db,videoId),/confirmados/);
 assert.deepEqual((await video()).preparationItems.map(i=>[i.id,i.taskId]),old);
 ok(await as('talent',async()=>cast.responderPapel(await roleForm({response:'CONFIRMADO'}))));await confirmAll();
 for(const c of await db.checklistItem.findMany({where:{contentItemId:videoId,kind:'TASK',stage:'PREPRODUCCION',required:true,done:false}}))ok(await as('camera',()=>content.alternarCheck(fd({id:c.id,done:'1'}))));
 ok(await listo('camera','GRABACION',{materialUrl:'https://example.invalid/raw-v1'}));await verifyPending('EDICION','editor');
 assert.equal((await step('GRABACION')).task.completedById,'camera');
});

test('diseño paralelo no crea otro paso secuencial; cambios de diseño bloquean al editor hasta nueva entrega',async()=>{
 ok(await as('lead',()=>content.crearCheck(fd({contentItemId:videoId,label:'Diseño gráfico listo',stage:'POSTPRODUCCION',required:'1'}))));
 ok(await as('writer',()=>production.pedirDiseno(fd({contentItemId:videoId,designerId:'designer',notes:'Portada y rótulos'}))));
 designId=(await step('DISENO')).id;await verifyPending('EDICION','editor');
 assert.match((await listo('editor','EDICION',{materialUrl:'https://example.invalid/master-v1'})).error,/Esperando diseño/);
 ok(await listo('designer','DISENO',{materialUrl:'https://example.invalid/design-v1'}));
 const delivered=await work.readMyWork(await session('writer'));assert.ok(delivered.designsDelivered.some(s=>s.id===designId));
 ok(await as('writer',async()=>production.pedirCambiosDiseno(await formStep('DISENO',{motivo:'Cambiar el color de la portada'}))));
 assert.equal((await db.checklistItem.findFirstOrThrow({where:{contentItemId:videoId,label:'Diseño gráfico listo'}})).done,false);
 assert.match((await listo('editor','EDICION',{materialUrl:'https://example.invalid/master-v1'})).error,/Esperando diseño/);
 ok(await listo('designer','DISENO',{materialUrl:'https://example.invalid/design-v2'}));
 assert.equal((await step('DISENO')).id,designId);ok(await listo('editor','EDICION',{materialUrl:'https://example.invalid/master-v1'}));await verifyPending('REVISION_FINAL','lead');
});

test('cambios de diseño durante revisión final cancelan esa revisión y reabren la edición',async()=>{
 const stale=await formStep('REVISION_FINAL'),original=await step('EDICION');
 ok(await as('writer',async()=>production.pedirCambiosDiseno(await formStep('DISENO',{motivo:'El rótulo requiere otra corrección'}))));
 await verifyPending('EDICION','editor');assert.equal((await step('REVISION_FINAL')).status,'CANCELADO');assert.equal((await step('EDICION')).taskId,original.taskId);
 assert.ok((await as('lead',()=>production.marcarListo(stale))).error);
 ok(await listo('designer','DISENO',{materialUrl:'https://example.invalid/design-v3'}));
 ok(await listo('editor','EDICION',{materialUrl:'https://example.invalid/master-design-v3'}));await verifyPending('REVISION_FINAL','lead');
});

test('devolución de revisión final y nueva entrega exigen firma humana vigente',async()=>{
 assert.match((await listo('editor','REVISION_FINAL')).error,/permisos de revisión/);
 const old=await step('REVISION_FINAL');ok(await returned('lead','REVISION_FINAL','Ajustar los subtítulos del cierre'));await verifyPending('EDICION','editor');
 ok(await listo('editor','EDICION',{materialUrl:'https://example.invalid/master-v2'}));assert.equal((await step('REVISION_FINAL')).id,old.id);
 assert.match((await listo('lead','REVISION_FINAL',{expectedReviewToken:old.reviewToken})).error,/Abre la revisión/);
 ok(await listo('lead','REVISION_FINAL'));await verifyPending('PUBLICACION','publisher');
});

test('cambios de diseño posteriores a la aprobación revocan firma y publicación; todo revierte si falla la auditoría',async()=>{
 const before=await step('DISENO'),checks=await db.checklistItem.findMany({where:{contentItemId:videoId},orderBy:{id:'asc'}});
 await db.$executeRawUnsafe(`CREATE FUNCTION qa_design_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity='ChecklistItem' AND NEW.action='REABRIR' THEN RAISE EXCEPTION 'QA design rollback'; END IF; RETURN NEW; END $$`);
 await db.$executeRawUnsafe('CREATE TRIGGER qa_design_failure BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION qa_design_failure()');
 try{await assert.rejects(as('writer',async()=>production.pedirCambiosDiseno(await formStep('DISENO',{motivo:'Corregir logo antes de publicar'}))),/QA design rollback/);assert.deepEqual(await step('DISENO'),before);assert.deepEqual(await db.checklistItem.findMany({where:{contentItemId:videoId},orderBy:{id:'asc'}}),checks);}
 finally{await db.$executeRawUnsafe('DROP TRIGGER qa_design_failure ON "AuditLog"');await db.$executeRawUnsafe('DROP FUNCTION qa_design_failure()');}
 const final=checks.find(c=>c.kind==='FINAL_APPROVAL'),publish=await formStep('PUBLICACION',{publishedUrl:'https://example.invalid/stale'});
 ok(await as('writer',async()=>production.pedirCambiosDiseno(await formStep('DISENO',{motivo:'Corregir logo antes de publicar'}))));
 await verifyPending('EDICION','editor');assert.equal((await step('PUBLICACION')).status,'CANCELADO');
 assert.ok((await db.approval.findUniqueOrThrow({where:{id:final.approvalId}})).revokedAt);assert.equal((await video()).status,'EDICION');
 assert.ok((await as('publisher',()=>production.marcarListo(publish))).error);
 ok(await listo('designer','DISENO',{materialUrl:'https://example.invalid/design-v4'}));ok(await listo('editor','EDICION',{materialUrl:'https://example.invalid/master-design-v4'}));ok(await listo('lead','REVISION_FINAL'));
 await verifyPending('PUBLICACION','publisher');
});

test('publicador devuelve y cierra solo tras nueva revisión; readback conserva todos los estados y firmas',async()=>{
 const final=await db.checklistItem.findFirstOrThrow({where:{contentItemId:videoId,kind:'FINAL_APPROVAL'}}),first=await step('PUBLICACION');
 ok(await returned('publisher','PUBLICACION','Corregir la proporción del video'));assert.ok((await db.approval.findUniqueOrThrow({where:{id:final.approvalId}})).revokedAt);
 ok(await listo('editor','EDICION',{materialUrl:'https://example.invalid/master-v3'}));ok(await listo('lead','REVISION_FINAL'));assert.equal((await step('PUBLICACION')).taskId,first.taskId);
 ok(await listo('publisher','PUBLICACION',{publishedUrl:'https://example.invalid/published-qa'}));
 const fresh=new PrismaClient({datasourceUrl:url});try{
  const v=await fresh.contentItem.findUniqueOrThrow({where:{id:videoId}});assert.equal(v.status,'PUBLICADO');assert.equal(v.publishedUrl,'https://example.invalid/published-qa');
  const steps=await fresh.productionStep.findMany({where:{contentItemId:videoId},include:{task:true}});assert.equal(steps.length,7);assert.ok(steps.every(s=>s.status==='HECHO'&&s.task.status==='HECHO'));
  assert.equal(await fresh.productionStep.count({where:{contentItemId:videoId,status:'PENDIENTE'}}),0);
  assert.ok(await fresh.comment.count({where:{contentItemId:videoId}})>=4);
 }finally{await fresh.$disconnect();}
});

test('reparto pendiente atraviesa el lote de 100 sin omisiones; diseños entregados conservan total, páginas y permisos',async()=>{
 const now=new Date(),ids=Array.from({length:105},(_,i)=>`page-${String(i).padStart(3,'0')}`);
 await db.contentItem.createMany({data:ids.map(id=>({id,brandId:'A',title:id,scriptId:'script',shootDate:now,scheduledDate:now}))});
 await db.assignment.createMany({data:ids.map(contentItemId=>({contentItemId,userId:'talent',role:'ACTOR'}))});
 await db.castRole.createMany({data:ids.map(contentItemId=>({contentItemId,slotKey:'scene:0',sceneId:'scene',role:'Presentador',archetype:'Sabio',userId:'talent'}))});
 // Una respuesta con huella antigua sigue pendiente; el listado no confía solo en response.
 await db.castRole.updateMany({where:{contentItemId:{in:ids.slice(0,2)}},data:{response:'CONFIRMADO',confirmedToken:'obsolete',respondedAt:now}});
 const inbox=mod('src/lib/casting-inbox.ts'),actor=await session('talent'),seen=[];
 for(let page=1;page<=6;page++){const r=await inbox.readCastingPending(actor,'A',String(page));assert.equal(r.total,105);assert.equal(r.pageCount,6);assert.equal(r.items.length,page===6?5:20);seen.push(...r.items.map(v=>v.id));}
 assert.deepEqual(seen,ids);assert.equal(new Set(seen).size,105);
 assert.deepEqual((await inbox.readCastingPending(actor,'A','999')).items.map(v=>v.id),ids.slice(100));
 assert.equal((await inbox.readCastingPending(await session('camera'),'A','1')).total,0);
 await db.productionStep.createMany({data:ids.slice(0,40).map(id=>({contentItemId:id,brandId:'A',step:'DISENO',status:'HECHO',doneAt:now,dueAt:now,requestedById:'writer',assigneeId:'designer',materialUrl:'https://example.invalid/design',automationKey:id+':DISENO:qa'}))});
 const designs=[];
 for(let page=1;page<=3;page++){const r=await work.readMyWork(await session('writer'),now,{brandId:'A',disenos:String(page)});assert.equal(r.pages.designs.total,41);assert.equal(r.pages.designs.pageCount,3);assert.equal(r.designsDelivered.length,page===3?1:20);designs.push(...r.designsDelivered.map(s=>s.id));}
 assert.equal(new Set(designs).size,41);assert.ok(designs.includes(designId));
 assert.equal((await work.readMyWork(await session('camera'),now,{disenos:'1'})).pages.designs.total,0);
});
