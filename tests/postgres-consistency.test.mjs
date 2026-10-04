import assert from "node:assert/strict";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { load } from "./load-module.mjs";

const url=process.env.CONSISTENCY_TEST_DATABASE_URL;
if(!url || !['localhost','127.0.0.1'].includes(new URL(url).hostname) || !new URL(url).pathname.endsWith('_test'))throw new Error('Usa PostgreSQL local con sufijo _test.');
const prisma=new PrismaClient({datasourceUrl:url}), form=values=>{const f=new FormData();for(const[k,v]of Object.entries(values))f.set(k,String(v));return f;};
test('consistencia con PostgreSQL real: auditoría, revisiones, métricas y relaciones',async t=>{
  const owner=await prisma.user.create({data:{name:'Fixture',email:'consistency@example.test',role:'OWNER',passwordHash:'fixture-not-a-password'}});
  const mocks={'@/lib/prisma':{prisma},'@/lib/auth':{requireLevel:async()=>owner,requirePermission:async()=>owner,LEVEL:{MEMBER:1,OWNER:2}},'next/cache':{revalidatePath:()=>{},revalidateTag:()=>{}},'next/navigation':{redirect:()=>{}}};
  const tasks=load('src/app/actions/tasks.ts',mocks), content=load('src/app/actions/content.ts',mocks), scripts=load('src/app/actions/scripts.ts',mocks), metric=load('src/app/actions/metrics.ts',mocks), dashboard=load('src/lib/metric-dashboard.ts',mocks);
  const brand=await prisma.brand.create({data:{name:'Marca A',slug:'consistency-a'}}), other=await prisma.brand.create({data:{name:'Marca B',slug:'consistency-b'}});
  const column=await prisma.taskColumn.create({data:{name:'Trabajo'}});
  const task=await prisma.task.create({data:{title:'Inicial',columnId:column.id,brandId:brand.id}});
  const editTask={id:task.id,title:'Edición 1',columnId:column.id,brandId:brand.id,kind:'ACCION',priority:'NORMAL',expectedUpdatedAt:task.updatedAt.toISOString()};
  try {
    await t.test('edición vieja no sobrescribe; timestamp avanza incluso con reloj repetido',async()=>{
      await tasks.actualizarTarea(form(editTask));
      const current=await prisma.task.findUniqueOrThrow({where:{id:task.id}});assert.ok(current.updatedAt>task.updatedAt);
      assert.match((await tasks.actualizarTarea(form({...editTask,title:'Perdida'}))).error,/Este registro cambió/);
      assert.equal((await prisma.task.findUniqueOrThrow({where:{id:task.id}})).title,'Edición 1');
      await prisma.task.update({where:{id:task.id},data:{updatedAt:current.updatedAt}});
      assert.ok((await prisma.task.findUniqueOrThrow({where:{id:task.id}})).updatedAt>current.updatedAt);
    });
    await t.test('fallar auditoría revierte edición y no ejecuta invalidaciones',async()=>{
      let refreshed=false;
      const broken=load('src/app/actions/tasks.ts',{...mocks,'@/lib/audit':{auditInTransaction:async()=>{throw new Error('Fallo audit');},diffFields:()=>({})},'next/cache':{revalidatePath:()=>{refreshed=true;}}});
      const before=await prisma.task.findUniqueOrThrow({where:{id:task.id}});
      await assert.rejects(broken.actualizarTarea(form({...editTask,title:'No guardar',expectedUpdatedAt:before.updatedAt.toISOString()})),/Fallo audit/);
      assert.deepEqual(await prisma.task.findUniqueOrThrow({where:{id:task.id}}),before);assert.equal(refreshed,false);
    });
    await t.test('dos ediciones con la misma revisión admiten una y auditan una',async()=>{
      const before=await prisma.task.findUniqueOrThrow({where:{id:task.id}}), count=await prisma.auditLog.count({where:{entityId:task.id}});
      const results=await Promise.allSettled(['A','B'].map(title=>tasks.actualizarTarea(form({...editTask,title,expectedUpdatedAt:before.updatedAt.toISOString()}))));
      assert.equal(results.filter(r=>r.status==='fulfilled' && !r.value?.error).length,1);assert.equal(await prisma.auditLog.count({where:{entityId:task.id}}),count+1);
      assert.ok(results.some(r=>r.status==='fulfilled' && /Este registro cambió/.test(r.value?.error)));
    });
    await t.test('agenda rechaza título, fecha e intervalo inválidos sin cerrar una edición como exitosa',async()=>{
      const events=load('src/app/actions/events.ts',mocks);
      const event=await prisma.calendarEvent.create({data:{title:'Reunión',startAt:new Date('2026-09-07T15:00Z'),createdById:owner.id}});
      const values={id:event.id,title:'Reunión',startDate:'2026-09-07',startTime:'10:00',endTime:'11:00',expectedUpdatedAt:event.updatedAt.toISOString()};
      for(const patch of [{title:''},{startDate:'2026-02-31'},{endTime:'09:00'}])await assert.rejects(events.actualizarEvento(form({...values,...patch})));
      assert.deepEqual(await prisma.calendarEvent.findUniqueOrThrow({where:{id:event.id}}),event);
      assert.equal(await prisma.auditLog.count({where:{entityId:event.id}}),0);
    });
    const video=await prisma.contentItem.create({data:{brandId:brand.id,title:'Video semanal',scheduledDate:new Date('2026-09-07T12:00Z'),platforms:'["TIKTOK","INSTAGRAM"]'}});
    const legacy=await prisma.metric.create({data:{contentItemId:video.id,date:new Date('2026-09-07T12:00Z'),views:9000,retention3s:0}});
    const base={contentItemId:video.id,date:'2026-09-07',platform:'TIKTOK',views:100,retention3s:0};
    await t.test('una fila por semana/plataforma, históricos intactos y cero de retención válido',async()=>{
      await content.guardarMetrica(form(base));
      await content.guardarMetrica(form({...base,platform:'INSTAGRAM',views:200,retention3s:100}));
      await content.guardarMetrica(form({...base,date:'2026-09-14',views:50,retention3s:''}));
      await assert.rejects(content.guardarMetrica(form(base))); // alta duplicada no sobreescribe
      assert.deepEqual(await prisma.metric.findUniqueOrThrow({where:{id:legacy.id}}),legacy);
      const filter={ user:owner, brandId:brand.id,desde:'2026-09-01',hasta:'2026-09-30'};
      const all=await dashboard.getMetricTotals(filter);assert.equal(all.views,350);assert.equal(all.records,3);assert.equal(all.retention,50);
      assert.equal((await dashboard.getMetricTotals({...filter,plataforma:'INSTAGRAM'})).views,200);
      const by=await dashboard.getMetricBreakdowns(filter);assert.equal(by.platforms.reduce((sum,row)=>sum+row.views,0),350);
      assert.equal((await dashboard.getMetricTotals({...filter,plataforma:'YOUTUBE'})).retention,null);
    });
    await t.test('CSV semanal parcial no borra columnas y no duplica entre plataformas; porcentaje decimal no es fracción',async()=>{
      const result=await metric.importarMetricasCsv(null,form({csv:`video,semana,plataforma,vistas,likes,retencion\n${video.id},2026-09-07,TIKTOK,150,,0.5\n${video.id},2026-09-07,INSTAGRAM,250,0,0\n${video.id},2026-09-08,TIKTOK,600,5,2`}));
      assert.equal(result.updated,2,JSON.stringify(result));assert.equal(result.ignored.length,1);
      const row=await prisma.metric.findFirstOrThrow({where:{contentItemId:video.id,platform:'TIKTOK',period:'WEEKLY',date:new Date('2026-09-07T12:00Z')}});assert.equal(row.retention3s,0.5);assert.equal(row.views,150);
      const count=await prisma.auditLog.count({where:{entityId:row.id}});assert.equal(count,2);
      assert.ok((await metric.importarMetricasCsv(null,form({csv:`video,fecha,vistas\n${video.id},2026-09-07,999`}))).error);
    });
    await t.test('backend y DB rechazan fechas, valores y plataforma inválidos',async()=>{
      for(const patch of [{views:-1},{views:'1.2'},{date:'2026-02-31'},{date:'2026-09-08'},{platform:'INVENTADA'},{retention3s:101}]) await assert.rejects(content.guardarMetrica(form({...base,...patch})));
      await assert.rejects(prisma.metric.create({data:{contentItemId:video.id,date:new Date('2026-09-08T12:00Z'),platform:'TIKTOK',period:'WEEKLY',views:-1}}));
    });
    const structure=await prisma.structure.create({data:{name:'Estructura',slug:'consistency-structure',systemPrompt:''}}), alternative=await prisma.structure.create({data:{name:'Otra',slug:'consistency-alt',systemPrompt:''}});
    const script=await prisma.script.create({data:{title:'Guion',brandId:brand.id,structureId:structure.id}});
    await t.test('escenas rechazan JSON inválido y auditan la resecuenciación junto con la duración',async()=>{
      const sceneScript=await prisma.script.create({data:{title:'Escenas',brandId:brand.id,totalSeconds:10,
        scenes:{create:[{order:0,beat:'A',startSec:0,endSec:5,actors:'[{"role":"Actor"}]'},{order:1,beat:'B',startSec:5,endSec:10}]}}});
      const [first,second]=await prisma.scriptScene.findMany({where:{scriptId:sceneScript.id},orderBy:{order:'asc'}});
      const values={id:first.id,startSec:0,endSec:8,expectedUpdatedAt:sceneScript.updatedAt.toISOString()};
      await assert.rejects(scripts.actualizarEscena(form({...values,actors:'{broken'})),/actores/);
      assert.deepEqual(await prisma.scriptScene.findUniqueOrThrow({where:{id:first.id}}),first);
      await scripts.actualizarEscena(form({...values,actors:first.actors}));
      const moved=await prisma.scriptScene.findUniqueOrThrow({where:{id:second.id}});
      assert.equal(moved.startSec,8);assert.equal(moved.endSec,13);
      assert.equal((await prisma.script.findUniqueOrThrow({where:{id:sceneScript.id}})).totalSeconds,13);
      for(const entityId of [first.id,second.id,sceneScript.id])assert.ok(await prisma.auditLog.count({where:{entityId}})>0);
    });
    await t.test('ajustes y claves se revierten si falla la auditoría; claves nunca se registran',async()=>{
      const settingsMocks={...mocks,'@/lib/auth':{...mocks['@/lib/auth'],requireUser:async()=>owner,can:()=>true}};
      const lib=load('src/lib/settings.ts',mocks), google=load('src/lib/google.ts',mocks);
      const snapshot=await lib.getSettingsSnapshot([...Object.values(lib.SETTING_KEYS),...Object.values(google.GOOGLE_SETTING_KEYS)]);
      const values=form({expectedUpdatedAt:snapshot.revision,orgName:'Organización de prueba',defaultProvider:'anthropic',anthropicKey:'fixture-secret-never-log'});
      const broken=load('src/app/actions/app-settings.ts',{...settingsMocks,'@/lib/audit':{auditInTransaction:async()=>{throw new Error('Fallo audit');}}});
      await assert.rejects(broken.guardarAjustes(null,values),/Fallo audit/);
      assert.equal(await prisma.appSetting.findUnique({where:{key:'org.name'}}),null);
      assert.equal(await prisma.appSetting.findUnique({where:{key:'ai.anthropic.apiKey'}}),null);
      assert.equal(await prisma.appSecret.count(),0);
      const settings=load('src/app/actions/app-settings.ts',settingsMocks);
      assert.ok((await settings.guardarAjustes(null,values)).ok);
      assert.equal(await load('src/lib/secrets.ts',mocks).readSecret('ai.anthropic.apiKey'),'fixture-secret-never-log');
      assert.equal(await prisma.appSetting.count({where:{key:'ai.anthropic.apiKey'}}),0);
      assert.ok(!JSON.stringify(await prisma.auditLog.findMany()).includes('fixture-secret-never-log'));
    });
    await t.test('vínculo hereda estructura y rechaza otra marca, también fuera de acciones',async()=>{
      await scripts.asignarGuionAVideo(form({contentItemId:video.id,scriptId:script.id}));
      const linked=await prisma.contentItem.findUniqueOrThrow({where:{id:video.id}});assert.equal(linked.structureId,structure.id);
      await assert.rejects(prisma.script.update({where:{id:script.id},data:{brandId:other.id}}));
      await scripts.actualizarGuion(form({id:script.id,structureId:alternative.id,expectedUpdatedAt:script.updatedAt.toISOString()}));
      assert.equal((await prisma.contentItem.findUniqueOrThrow({where:{id:video.id}})).structureId,alternative.id);
      const foreign=await prisma.contentItem.create({data:{brandId:other.id,title:'Otra marca',scheduledDate:new Date()}});
      await assert.rejects(scripts.asignarGuionAVideo(form({scriptId:script.id,contentItemId:foreign.id})),/misma marca/);
      await prisma.script.delete({where:{id:script.id}});
      const unlinked=await prisma.contentItem.findUniqueOrThrow({where:{id:video.id}});assert.equal(unlinked.scriptId,null);assert.equal(unlinked.structureId,null);
    });
    await t.test('borrar marca limpia archivos de videos en cascada; inserción huérfana es rechazada',async()=>{
      await prisma.asset.create({data:{ownerType:'content',ownerId:video.id,filename:'fixture.txt',data:Buffer.from('fixture')}});
      await assert.rejects(prisma.asset.create({data:{ownerType:'content',ownerId:'missing',filename:'fixture.txt',data:Buffer.from('fixture')}}));
      await prisma.brand.delete({where:{id:brand.id}});assert.equal(await prisma.asset.count({where:{ownerId:video.id}}),0);
    });
  } finally {await prisma.$disconnect();}
});
