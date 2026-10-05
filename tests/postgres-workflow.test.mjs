import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { AsyncLocalStorage } from 'node:async_hooks';
import { load } from './load-module.mjs';
import fs from 'node:fs';
import { validScript } from './ai-fixture.mjs';

const url = process.env.WORKFLOW_TEST_DATABASE_URL;
if (!url || !['localhost','127.0.0.1'].includes(new URL(url).hostname) || !new URL(url).pathname.endsWith('_test')) throw Error('Solo DB local efímera.');
const prisma = new PrismaClient({ datasourceUrl: url }), context = new AsyncLocalStorage();
const fd = values => { const f = new FormData(); for (const [k,v] of Object.entries(values)) f.set(k,String(v)); return f; };
const mocks = { '@/lib/prisma': { prisma },
  'next/headers': { cookies: async () => ({ get: k => context.getStore()?.has(k) ? { value: context.getStore().get(k) } : undefined, set: (k,v) => context.getStore().set(k,v), delete: k => context.getStore().delete(k) }) },
  'next/cache': { revalidatePath() {}, revalidateTag() {} }, 'next/navigation': { redirect: p => { throw Error('REDIRECT:'+p); } } };
const auth = load('src/lib/auth.ts',mocks), approvals = load('src/lib/approvals.ts',mocks);
const as = (id,fn) => context.run(new Map(),async () => { const u=await prisma.user.findUniqueOrThrow({where:{id}}); await auth.createSession(id,u.sessionVersion); return fn(); });
const events=load('src/app/actions/events.ts',mocks), fits=load('src/app/actions/archetypes.ts',mocks), assets=load('src/app/actions/assets.ts',mocks), team=load('src/app/actions/team.ts',mocks), settings=load('src/app/actions/app-settings.ts',mocks), content=load('src/app/actions/content.ts',mocks), scripts=load('src/app/actions/scripts.ts',mocks);
const revision=async(model,id)=>(await prisma[model].findUniqueOrThrow({where:{id}})).updatedAt.toISOString();
const eventData={title:'Reunión',startDate:'2026-09-17',allDay:'on'};
const change=async(id,status,extra={})=>as('owner',()=>content.cambiarEstado(fd({id,status,...extra,expectedUpdatedAt:extra.expectedUpdatedAt})));
async function status(id,next,extra={}) { const result=await change(id,next,{expectedUpdatedAt:await revision('contentItem',id),...extra});assert.equal(result?.error,undefined,result?.error); }
async function scriptStatus(id,next,extra={}) { const result=await as('owner',()=>scripts.cambiarEstadoGuion(fd({id,status:next,expectedUpdatedAt:extra.expectedUpdatedAt,...extra})));assert.equal(result?.error,undefined,result?.error); }
async function approve(id,kind) {
 const check=await prisma.checklistItem.findFirstOrThrow({where:{contentItemId:id,kind}});
 const token=await approvals.approvalToken(prisma,kind,id);
 const result=await as('owner',()=>content.alternarCheck(fd({id:check.id,done:'on',expectedApproval:token})));
 assert.equal(result?.error,undefined,result?.error);
 return check.id;
}
async function setupVideo(id) {
 await prisma.script.create({data:{id:'s-'+id,title:'Guion '+id,brandId:'A',authorId:'owner',scenes:{create:{order:0,beat:'Inicio',voice:'Texto de prueba',startSec:0,endSec:10}}}});
 await scriptStatus('s-'+id,'REVISION',{expectedUpdatedAt:await revision('script','s-'+id)});
 await scriptStatus('s-'+id,'APROBADO',{expectedUpdatedAt:await revision('script','s-'+id)});
 await prisma.contentItem.create({data:{id,title:id,brandId:'A',scriptId:'s-'+id,shootDate:new Date('2026-09-19T12:00:00Z'),scheduledDate:new Date('2026-09-21T12:00:00Z'),publishedUrl:'https://example.test/video',checklist:{create:[
  {label:'Autorización del texto',stage:'PREPRODUCCION',kind:'SCRIPT_APPROVAL'},
  {label:'Control de entrega',stage:'POSTPRODUCCION',kind:'FINAL_APPROVAL'},
 ]}}});
 await status(id,'GUION'); await approve(id,'SCRIPT_APPROVAL'); await status(id,'APROBADO'); await status(id,'GRABACION'); await status(id,'EDICION');
}

test('B07–B10 con acciones reales, sin proveedores externos',async t=>{
 const oldFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('HTTP externo prohibido');};process.env.BLOB_PRIVATE_ENABLED='false';
 try {
 await prisma.user.create({data:{id:'owner',name:'Dueño fixture',email:'owner@workflow.test',role:'OWNER',passwordHash:'fixture'}});
 await prisma.user.create({data:{id:'member',name:'Miembro fixture',email:'member@workflow.test',passwordHash:'fixture'}});
 await prisma.brand.createMany({data:['A','B'].map(id=>({id,name:id,slug:id}))});
 await prisma.user.create({data:{id:'strategy',name:'Coordinación',email:'strategy@workflow.test',passwordHash:'fixture',workProfiles:{create:{profile:'STRATEGY'}},brandAccess:{create:{brandId:'A'}}}});
 await prisma.contentItem.createMany({data:['vA','vB'].map((id,i)=>({id,title:id,brandId:i?'B':'A',scheduledDate:new Date()}))});
 await t.test('B07: rechaza marca cruzada, deriva marca y persiste cambio, conservación y desvinculación',async()=>{
  await assert.rejects(as('owner',()=>events.crearEvento(fd({...eventData,brandId:'B',contentItemId:'vA'}))),/misma marca/);
  assert.equal(await prisma.calendarEvent.count(),0);
  await as('owner',()=>events.crearEvento(fd({...eventData,contentItemId:'vA'})));
  let e=await prisma.calendarEvent.findFirstOrThrow();assert.equal(e.brandId,'A');
  await as('owner',()=>events.actualizarEvento(fd({...eventData,id:e.id,brandId:'B',contentItemId:'vB',expectedUpdatedAt:e.updatedAt.toISOString()})));
  e=await prisma.calendarEvent.findUniqueOrThrow({where:{id:e.id}});assert.equal(e.contentItemId,'vB');
  await as('owner',()=>events.actualizarEvento(fd({...eventData,id:e.id,brandId:'B',expectedUpdatedAt:e.updatedAt.toISOString()})));
  e=await prisma.calendarEvent.findUniqueOrThrow({where:{id:e.id}});assert.equal(e.contentItemId,'vB');
  await as('owner',()=>events.actualizarEvento(fd({...eventData,id:e.id,brandId:'B',contentItemId:'',expectedUpdatedAt:e.updatedAt.toISOString()})));
  assert.equal((await prisma.calendarEvent.findUniqueOrThrow({where:{id:e.id}})).contentItemId,null);
 });
 await t.test('B07: DB rechaza cruces y nulos; cambiar marca propaga; borrar video conserva evento',async()=>{
  for(const brandId of ['B',null])await assert.rejects(prisma.calendarEvent.create({data:{title:'Inválido',startAt:new Date(),brandId,contentItemId:'vA'}}));
  const e=await prisma.calendarEvent.create({data:{title:'Vinculado',startAt:new Date(),brandId:'A',contentItemId:'vA'}});
  await prisma.contentItem.update({where:{id:'vA'},data:{brandId:'B'}});
  assert.equal((await prisma.calendarEvent.findUniqueOrThrow({where:{id:e.id}})).brandId,'B');
  await prisma.contentItem.delete({where:{id:'vA'}});
  assert.equal((await prisma.calendarEvent.findUniqueOrThrow({where:{id:e.id}})).contentItemId,null);
  await prisma.brand.create({data:{id:'cascade',name:'Cascade',slug:'cascade'}});
  await prisma.contentItem.create({data:{id:'cascade',brandId:'cascade',title:'Cascade',scheduledDate:new Date()}});
  await prisma.calendarEvent.create({data:{id:'cascade',title:'Cascade',brandId:'cascade',contentItemId:'cascade',startAt:new Date()}});
  await prisma.brand.delete({where:{id:'cascade'}});
  const kept=await prisma.calendarEvent.findUniqueOrThrow({where:{id:'cascade'}});assert.equal(kept.brandId,null);assert.equal(kept.contentItemId,null);
 });
 await prisma.archetype.create({data:{id:'person',name:'Persona',slug:'persona'}});
 await prisma.structure.createMany({data:['format','format2'].map(id=>({id,name:id,slug:id}))});
 await t.test('B08/B10: humano sustituye sugerencia, registra autor y origen anterior, rechaza formulario viejo',async()=>{
  let row=await prisma.archetypeFit.create({data:{archetypeId:'person',structureId:'format',score:1,source:'AUTO',sourceScriptId:'historical'}});
  const values={archetypeId:'person',structureId:'format',score:3,notes:'Decisión humana',expectedUpdatedAt:row.updatedAt.toISOString()};
  await as('owner',()=>fits.guardarCompatibilidad(fd(values)));
  row=await prisma.archetypeFit.findUniqueOrThrow({where:{id:row.id}});
  assert.equal(row.source,'MANO');assert.equal(row.sourceScriptId,null);assert.equal(row.updatedById,'owner');assert.equal(row.revision,2);
  assert.match((await prisma.auditLog.findFirstOrThrow({where:{entityId:row.id}})).changes,/historical/);
  await assert.rejects(as('owner',()=>fits.guardarCompatibilidad(fd({...values,score:0}))),/Este registro cambió/);
  assert.equal((await prisma.archetypeFit.findUniqueOrThrow({where:{id:row.id}})).score,3);
 });
 await t.test('B10: dos altas simultáneas de compatibilidad solo aceptan una',async()=>{
  const values={archetypeId:'person',structureId:'format2',score:2,expectedUpdatedAt:'new'};
  const outcomes=await Promise.allSettled([1,2].map(()=>as('owner',()=>fits.guardarCompatibilidad(fd(values)))));
  assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal(await prisma.archetypeFit.count({where:{structureId:'format2'}}),1);
 });
 await t.test('B08: el contexto real de IA solo incluye la evaluación humana, con proveedor simulado',async()=>{
  const lib=load('src/lib/settings.ts',mocks), captured=[];
  const engine=load('src/lib/ai/index.ts',{...mocks,'@/lib/settings':{...lib,resolveApiKey:async()=>({key:'fixture',source:'db'})},'@/lib/ai/providers':{
   AiError:class extends Error {},generateWithGemini:async call=>{captured.push(call.system+'\n'+call.user);return {script:structuredClone(validScript),provider:'google',model:'fixture',raw:'fixture'};},
  }});
  await engine.generateScript({structureId:'format',archetypeId:'person',provider:'google',request:'Fixture'},async fn=>fn());
  assert.match(captured[0],/Decisión humana/);
  await prisma.archetypeFit.update({where:{archetypeId_structureId:{archetypeId:'person',structureId:'format2'}},data:{source:'SEED',notes:'SUGERENCIA_NO_VALIDADA'}});
  await engine.generateScript({structureId:'format2',archetypeId:'person',provider:'google',request:'Fixture'},async fn=>fn());
  assert.doesNotMatch(captured[1],/SUGERENCIA_NO_VALIDADA/);assert.equal(captured.length,2);
 });
 await t.test('B10: importar branding con revisión antigua no sobrescribe ni adjunta el archivo',async()=>{
  const document=fs.readFileSync(new URL('./fixtures/informe-branding-eru.txt',import.meta.url),'utf8');
  const values=fd({sobrescribir:'on',expectedUpdatedAt:await revision('archetype','person')});values.set('branding',new File([document],'fixture.txt'));
  await prisma.archetype.update({where:{id:'person'},data:{voiceTone:'Edición más reciente'}});
  const assetsBefore=await prisma.asset.count();
  const outcome=await as('owner',()=>fits.guardarInformeEnPersona('person',values));assert.match(outcome.error,/Este registro cambió/);
  assert.equal((await prisma.archetype.findUniqueOrThrow({where:{id:'person'}})).voiceTone,'Edición más reciente');
  assert.equal(await prisma.asset.count(),assetsBefore);
  values.set('expectedUpdatedAt',await revision('archetype','person'));
  assert.ok((await as('owner',()=>fits.guardarInformeEnPersona('person',values))).ok);
  assert.equal(await prisma.asset.count(),assetsBefore+1);
 });
 await t.test('B10: ficha de usuario y archivos no sobrescriben desde formularios obsoletos',async()=>{
  const values={id:'member',name:'Nombre guardado',selfProfile:'1',expectedUpdatedAt:await revision('user','member')};
  assert.ok((await as('member',()=>team.actualizarUsuario(null,fd(values)))).ok);
  assert.ok((await as('member',()=>team.actualizarUsuario(null,fd({...values,name:'Obsoleto'})))).error);
  assert.equal((await prisma.user.findUniqueOrThrow({where:{id:'member'}})).name,'Nombre guardado');
  const asset=await prisma.asset.create({data:{id:'a',ownerType:'archetype',ownerId:'person',filename:'fixture.txt',data:Buffer.from('x'),size:1,extractedText:'Original'}});
  await as('owner',()=>assets.updateAssetText(fd({id:'a',extractedText:'Actual',expectedUpdatedAt:asset.updatedAt.toISOString()})));
  await assert.rejects(as('owner',()=>assets.toggleAssetAi(fd({id:'a',useForAi:'',expectedUpdatedAt:asset.updatedAt.toISOString()}))),/Este registro cambió/);
  assert.equal((await prisma.asset.findUniqueOrThrow({where:{id:'a'}})).extractedText,'Actual');
 });
 await t.test('B10: ajustes protegen incluso creación de claves antes ausentes y no filtran secretos',async()=>{
  const lib=load('src/lib/settings.ts',mocks), google=load('src/lib/google.ts',mocks);
  const snap=await lib.getSettingsSnapshot([...Object.values(lib.SETTING_KEYS),...Object.values(google.GOOGLE_SETTING_KEYS)]);
  const values={orgName:'Organización fixture',defaultProvider:'google',googleKey:'fixture-do-not-log',expectedUpdatedAt:snap.revision};
  assert.ok((await as('owner',()=>settings.guardarAjustes(null,fd(values)))).ok);
  await assert.rejects(as('owner',()=>settings.guardarAjustes(null,fd({...values,orgName:'Obsoleto'}))),/Este registro cambió/);
  assert.equal((await prisma.appSetting.findUniqueOrThrow({where:{key:'org.name'}})).value,'Organización fixture');
  assert.ok(!JSON.stringify(await prisma.auditLog.findMany()).includes('fixture-do-not-log'));
 });
 await t.test('B09: recorrido completo con aprobaciones versionadas y etiquetas libres',async()=>{
  await setupVideo('flow');await approve('flow','FINAL_APPROVAL');await status('flow','PROGRAMADO');await status('flow','PUBLICADO');
  assert.equal((await prisma.contentItem.findUniqueOrThrow({where:{id:'flow'}})).status,'PUBLICADO');
  const rows=await prisma.approval.findMany({where:{entityId:{in:['flow','s-flow']}}});assert.equal(rows.length,3);
  assert.ok(rows.every(r=>r.version===1&&r.approvedById==='owner'&&r.snapshot&&r.fingerprint.length===64));
  await assert.rejects(prisma.approval.update({where:{id:rows[0].id},data:{fingerprint:'alterado'}}));
  await assert.rejects(prisma.approval.delete({where:{id:rows[0].id}}));
  const currentRevision=await revision('contentItem','flow');
  const reopened=await as('strategy',()=>content.cambiarEstado(fd({id:'flow',status:'EDICION',reason:'Corregir la entrega audiovisual',expectedUpdatedAt:currentRevision})));
  assert.equal(reopened?.error,undefined);assert.equal((await prisma.contentItem.findUniqueOrThrow({where:{id:'flow'}})).status,'EDICION');
  assert.equal((await prisma.checklistItem.findFirstOrThrow({where:{contentItemId:'flow',kind:'FINAL_APPROVAL'}})).done,false);
 });
 await t.test('B09: saltos, requisitos, falso check y excepción auditada',async()=>{
  await prisma.contentItem.create({data:{id:'rules',brandId:'A',title:'Rules',scheduledDate:new Date()}});
  assert.match((await change('rules','PUBLICADO',{expectedUpdatedAt:await revision('contentItem','rules')})).error,/etapa/);
  assert.match((await change('rules','GUION',{expectedUpdatedAt:await revision('contentItem','rules')})).error,/guion con escenas/);
  assert.match((await change('rules','PUBLICADO',{override:'1',expectedUpdatedAt:await revision('contentItem','rules')})).error,/motivo/);
  assert.match((await change('rules','PUBLICADO',{override:'1',reason:'Carga histórica autorizada',expectedUpdatedAt:await revision('contentItem','rules')})).error,/guion aprobado/);
  await status('rules','CANCELADO',{override:'1',reason:'Carga histórica autorizada'});
  assert.match((await prisma.auditLog.findFirstOrThrow({where:{entityId:'rules'},orderBy:{createdAt:'desc'}})).summary,/Excepción del Dueño.*Carga histórica/);
  await prisma.checklistItem.create({data:{contentItemId:'rules',label:'Revisión final aprobada',stage:'POSTPRODUCCION',done:true,kind:'TASK'}});
  await assert.rejects(approvals.assertChecklistApproved(prisma,'rules','FINAL_APPROVAL'),/revisión final/);
 });
 await t.test('B09: no aprueba una versión distinta a la que se revisó; cambios posteriores invalidan publicación',async()=>{
  await setupVideo('version');
  const check=await prisma.checklistItem.findFirstOrThrow({where:{contentItemId:'version',kind:'FINAL_APPROVAL'}});
  const token=await approvals.approvalToken(prisma,'FINAL_APPROVAL','version');
  await prisma.contentItem.update({where:{id:'version'},data:{hook:'Cambió mientras revisaban'}});
  assert.match((await as('owner',()=>content.alternarCheck(fd({id:check.id,done:'on',expectedApproval:token})))).error,/desde que abriste/);
  await approve('version','FINAL_APPROVAL');
  const row=await prisma.checklistItem.findUniqueOrThrow({where:{id:check.id}});
  await prisma.asset.create({data:{ownerType:'content',ownerId:'version',filename:'nuevo.txt',data:Buffer.from('x'),size:1}});
  assert.match((await change('version','PROGRAMADO',{expectedUpdatedAt:await revision('contentItem','version')})).error,/cambió desde la aprobación/);
  assert.match((await as('owner',()=>content.alternarCheck(fd({id:check.id,done:''})))).error,/motivo/);
  await as('owner',()=>content.alternarCheck(fd({id:check.id,done:'',reason:'Revisar material actualizado'})));
  const historical=await prisma.approval.findUniqueOrThrow({where:{id:row.approvalId}});assert.ok(historical.revokedAt);assert.equal(historical.reason,'Revisar material actualizado');
  await approve('version','FINAL_APPROVAL');
  assert.equal(await prisma.approval.count({where:{entityId:'version',entityType:'FINAL_APPROVAL'}}),2);
  await status('version','PROGRAMADO');
 });
 await t.test('B09: retirar aprobación del guion impide publicar aunque la revisión final siga marcada',async()=>{
  await setupVideo('reopen');await approve('reopen','FINAL_APPROVAL');await status('reopen','PROGRAMADO');
  await scriptStatus('s-reopen','REVISION',{expectedUpdatedAt:await revision('script','s-reopen'),reason:'Corregir el texto hablado'});
  assert.match((await change('reopen','PUBLICADO',{expectedUpdatedAt:await revision('contentItem','reopen')})).error,/no está aprobado/);
 });
 } finally {globalThis.fetch=oldFetch;await prisma.$disconnect();}
});
