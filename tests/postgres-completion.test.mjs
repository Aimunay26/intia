import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {load} from './load-module.mjs';
const url=process.env.COMPLETION_TEST_DATABASE_URL;
if(!url || !['localhost','127.0.0.1'].includes(new URL(url).hostname) || !new URL(url).pathname.endsWith('_test'))throw Error('Solo PostgreSQL local efímero');
const prisma=new PrismaClient({datasourceUrl:url});
const fd=values=>{const f=new FormData();for(const[k,v]of Object.entries(values))f.set(k,String(v));return f;};
let actor;
const mocks={'@/lib/prisma':{prisma},'@/lib/auth':{requirePermission:async cap=>{const {assertPermission}=load('src/lib/permissions.ts');assertPermission(actor,cap);return actor;},requireLevel:async()=>actor,LEVEL:{MEMBER:1,OWNER:2}},'next/cache':{revalidatePath(){},revalidateTag(){}},'next/navigation':{redirect(){}}};
const dashboard=load('src/lib/metric-dashboard.ts',mocks),imports=load('src/lib/metric-import-service.ts',mocks),objectives=load('src/lib/objective-service.ts',mocks),content=load('src/app/actions/content.ts',mocks),retention=load('src/lib/retention.ts',mocks);
test('B11–B20: permisos, lotes durables, consultas acotadas, semántica y retención',async t=>{
  try{
    const owner=await prisma.user.create({data:{id:'owner',name:'Owner',email:'owner@completion.test',role:'OWNER',passwordHash:'fixture'}});actor=owner;
    await prisma.brand.createMany({data:['A','B'].map(id=>({id,name:id,slug:id}))});
    const analyst={...await prisma.user.create({data:{id:'analyst',name:'Analista',email:'analyst@completion.test',passwordHash:'fixture',workProfiles:{create:{profile:'ANALYST'}},brandAccess:{create:{brandId:'A'}}}}),profiles:['ANALYST'],brandIds:['A']};
    const production={...await prisma.user.create({data:{id:'production',name:'Producción',email:'production@completion.test',passwordHash:'fixture',workProfiles:{create:{profile:'PRODUCTION'}},brandAccess:{create:{brandId:'A'}}}}),profiles:['PRODUCTION'],brandIds:['A']};
    await prisma.contentItem.createMany({data:['A','B'].map(b=>({id:'video'+b,title:'Video '+b,brandId:b,scheduledDate:new Date('2026-09-07T12:00Z')}))});
    await prisma.metric.createMany({data:[{contentItemId:'videoA',date:new Date('2026-09-07T12:00Z'),period:'WEEKLY',platform:'TIKTOK',views:1000,retention3s:0},{contentItemId:'videoA',date:new Date('2026-09-14T12:00Z'),period:'WEEKLY',platform:'TIKTOK',views:1,retention3s:100},{contentItemId:'videoB',date:new Date('2026-09-07T12:00Z'),period:'WEEKLY',platform:'TIKTOK',views:999999}]});
    await t.test('B11: cada consulta analítica aplica marcas, incluidos filtros manipulados y rankings',async()=>{
      const f={user:analyst,brandId:null,desde:'2026-09-01',hasta:'2026-09-30'};
      assert.equal((await dashboard.getMetricTotals(f)).views,1001);
      assert.equal((await dashboard.getMetricTotals({...f,brandId:'B'})).views,0);
      assert.equal((await dashboard.getMetricTotals({...f,user:undefined})).views,0);
      assert.equal((await dashboard.getMetricTotals({...f,user:production})).views,0);
      assert.deepEqual((await dashboard.getMetricRanking(f,'vistas')).items.map(r=>r.id),['videoA']);
      assert.deepEqual((await dashboard.getMetricBreakdowns(f)).brands.map(r=>r.id),['A']);
      assert.equal((await dashboard.getMetricSeries(f)).reduce((a,r)=>a+r.views,0),1001);
    });
    await t.test('B11: Producción cambia solo grabación, con revisión, alcance y protección de aprobados',async()=>{
      actor=production;let v=await prisma.contentItem.findUniqueOrThrow({where:{id:'videoA'}});
      await content.actualizarGrabacion(fd({id:v.id,expectedUpdatedAt:v.updatedAt.toISOString(),shootDate:'2026-09-28',title:'Inyección',status:'PUBLICADO'}));
      const after=await prisma.contentItem.findUniqueOrThrow({where:{id:v.id}});assert.equal(after.title,v.title);assert.equal(after.status,'IDEA');assert.ok(after.shootDate);
      await assert.rejects(content.actualizarGrabacion(fd({id:v.id,expectedUpdatedAt:v.updatedAt.toISOString(),shootDate:'2026-09-29'})),/Otra persona/);
      const other=await prisma.contentItem.findUniqueOrThrow({where:{id:'videoB'}});await assert.rejects(content.actualizarGrabacion(fd({id:other.id,expectedUpdatedAt:other.updatedAt.toISOString(),shootDate:'2026-09-29'})),/acceso/);
      actor=analyst;await assert.rejects(content.actualizarGrabacion(fd({id:after.id,expectedUpdatedAt:after.updatedAt.toISOString(),shootDate:'2026-09-29'})),/permiso/);actor=owner;
    });
    await t.test('B16: objetivos manuales intactos, suma calculada y período vacío; retención no ponderada inventada',async()=>{
      await prisma.brandObjective.createMany({data:[{id:'manual',brandId:'A',name:'Manual',currentValue:37},{id:'auto',brandId:'A',name:'Automático',calculationMode:'WEEKLY_SUM',metricKey:'views',calculationFrom:new Date('2026-09-07T12:00Z'),calculationTo:new Date('2026-09-20T12:00Z')},{id:'empty',brandId:'A',name:'Sin datos',calculationMode:'WEEKLY_SUM',metricKey:'views',calculationFrom:new Date('2025-09-01T12:00Z'),calculationTo:new Date('2025-09-07T12:00Z')}]});
      const rows=await objectives.readBrandObjectives(analyst,'A');assert.equal(rows.find(r=>r.id==='manual').currentValue,37);assert.equal(rows.find(r=>r.id==='auto').currentValue,1001);assert.equal(rows.find(r=>r.id==='empty').currentValue,0);assert.equal(rows.find(r=>r.id==='empty').records,0);
      await assert.rejects(objectives.readBrandObjectives(analyst,'B'),/marca/);
      const cardRows=await prisma.brandObjective.findMany({where:{brandId:'A'},select:{id:true,brandId:true,calculationMode:true,currentValue:true}});
      assert.equal((await objectives.resolveObjectiveValues(analyst,cardRows)).find(r=>r.id==='auto').currentValue,1001);
      await assert.rejects(objectives.resolveObjectiveValues(production,cardRows),/permiso/);
      await prisma.metric.updateMany({where:{contentItemId:'videoA',date:new Date('2026-09-07T12:00Z')},data:{views:1003}});
      assert.equal((await objectives.resolveObjectiveValues(owner,cardRows)).find(r=>r.id==='auto').currentValue,1004);
      await prisma.metric.updateMany({where:{contentItemId:'videoA',date:new Date('2026-09-07T12:00Z')},data:{views:1000}});
      assert.equal((await dashboard.getMetricTotals({user:owner,brandId:'A',desde:'2026-09-01',hasta:'2026-09-30'})).retention,50);
      await assert.rejects(prisma.brandObjective.create({data:{brandId:'A',name:'No sumar retención',calculationMode:'WEEKLY_SUM',metricKey:'retention3s',calculationFrom:new Date(),calculationTo:new Date()}}));
    });
    const csv=Array.from({length:50},(_,i)=>'csv-'+i);
    await prisma.contentItem.createMany({data:csv.map(id=>({id,title:id,brandId:'A',scheduledDate:new Date()}))});
    const body='video,semana,plataforma,vistas\n'+csv.map(id=>`${id},2026-09-07,TIKTOK,10`).join('\n'), key=randomUUID();
    let batch;
    await t.test('B12: confirma 25 filas por bloque y reanuda incluso con dos solicitudes simultáneas sin duplicar auditoría',async()=>{
      batch=await imports.startMetricImport(analyst,fd({csv:body,requestKey:key}));assert.equal(batch.created,25);assert.equal(batch.pending,true);
      const responses=await Promise.all([imports.continueMetricImport(analyst,batch.batchId),imports.continueMetricImport(analyst,batch.batchId)]);
      assert.ok(responses.every(r=>r.created===50&&!r.pending));assert.equal(await prisma.metric.count({where:{contentItemId:{in:csv}}}),50);
      const logs=await prisma.auditLog.count({where:{entity:'Metric',summary:{contains:batch.batchId}}});assert.equal(logs,50);
      await imports.startMetricImport(analyst,fd({csv:body,requestKey:key}));assert.equal(await prisma.auditLog.count({where:{entity:'Metric',summary:{contains:batch.batchId}}}),logs);
      const wrong=await imports.startMetricImport(analyst,fd({csv:body.replace(',10',',11'),requestKey:key}));assert.ok(wrong.error);
      await assert.rejects(imports.continueMetricImport(owner,batch.batchId),/no encontrada/);
    });
    await t.test('B12: cambios tras prevalidar se reportan por fila; fallo de auditoría revierte todo el bloque',async()=>{
      const change=body.replaceAll(',10',',20');const first=await imports.startMetricImport(analyst,fd({csv:change,requestKey:randomUUID()}));
      await prisma.metric.updateMany({where:{contentItemId:csv[30]},data:{views:777}});
      const broken=load('src/lib/metric-import-service.ts',{'@/lib/prisma':{prisma:new Proxy(prisma,{get(target,key){if(key==='$transaction')return (work,options)=>target.$transaction(tx=>work(new Proxy(tx,{get(t,k){if(k==='auditLog')return {...t.auditLog,createMany:async()=>{throw Error('audit unavailable');}};return t[k];}})),options);return target[key];}})}});
      await assert.rejects(broken.continueMetricImport(analyst,first.batchId),/audit unavailable/);
      assert.equal((await prisma.metricImportBatch.findUniqueOrThrow({where:{id:first.batchId}})).processed,25);
      const done=await imports.continueMetricImport(analyst,first.batchId);assert.equal(done.updated,49);assert.equal(done.ignored.length,1);assert.match(done.ignored[0].reason,/cambió/);assert.equal((await prisma.metric.findFirstOrThrow({where:{contentItemId:csv[30]}})).views,777);
    });
    await t.test('B13: referencias limitadas en SQL y páginas de archivos sin texto ni bytes',async()=>{
      await prisma.structure.create({data:{id:'structure',name:'Referencia',slug:'reference'}});
      await prisma.asset.createMany({data:Array.from({length:45},(_,i)=>({id:'asset'+String(i).padStart(2,'0'),ownerType:'structure',ownerId:'structure',filename:'doc.txt',data:Buffer.from('x'),size:1,mimeType:'text/plain',extractedText:'x'.repeat(100000),useForAi:true}))});
      const {loadGenerationReferences}=load('src/lib/ai/references.ts',mocks);const refs=await loadGenerationReferences('structure');assert.equal(refs.reduce((n,r)=>n+r.text.length,0),80000);assert.equal(refs[0].total,45);assert.ok(refs.every(r=>r.truncated&&r.text.length<=18000));
      const {loadAssetPage}=load('src/lib/asset-list.ts',mocks);const p1=await loadAssetPage('structure','structure','1'),p2=await loadAssetPage('structure','structure','2');assert.equal(p1.items.length,20);assert.equal(p1.total,45);assert.ok(p2.items.every(r=>!p1.items.some(a=>a.id===r.id)));assert.ok(p1.items.every(r=>!('extractedText'in r)&&!('data'in r)));
    });
    await t.test('B18: retención apagada, vista previa y limpieza dejan intactos datos activos y negocio',async()=>{
      const old=new Date('2025-01-01T00:00Z');
      await prisma.generationJob.createMany({data:['closed','active'].map(id=>({id,userId:'owner',sessionVersion:0,requestKey:id,fingerprint:id,status:id==='closed'?'FAILED':'RUNNING',payload:{brandId:'A',request:'technical-private-input'},createdAt:old,updatedAt:old}))});
      await prisma.generationJob.create({data:{id:'closed-without-request',userId:'owner',sessionVersion:0,requestKey:'no-request',fingerprint:'no-request',status:'COMPLETED',payload:{brandId:'A',productFocus:'private optional brief'},createdAt:old,updatedAt:old}});
      await prisma.generationItem.createMany({data:['closed','active'].map(id=>({id:'item-'+id,jobId:id,structureId:'structure',order:0,status:id==='closed'?'FAILED':'RUNNING',response:{raw:'private'},createdAt:old,updatedAt:old}))});
      await prisma.usageCounter.createMany({data:[{key:'ai:calls:2025-01-01',amount:10},{key:'ai:calls:2026-09-24',amount:3},{key:'unknown:2025-01-01',amount:8}]});
      const beforeAudit=await prisma.auditLog.count(),beforeMetrics=await prisma.metric.count();
      assert.equal((await retention.runRetention()).changed,0);
      const policy={...retention.DEFAULT_RETENTION,enabled:true};const preview=await retention.previewRetention(policy);assert.equal(preview.responses,1);assert.equal(preview.requests,2);assert.equal(preview.counters,1);
      await prisma.appSetting.create({data:{key:retention.RETENTION_KEY,value:JSON.stringify(policy)}});const applied=await retention.runRetention();assert.equal(applied.responses,1);assert.equal(applied.requests,2);
      assert.deepEqual((await prisma.generationItem.findUniqueOrThrow({where:{id:'item-active'}})).response,{raw:'private'});assert.equal((await prisma.generationJob.findUniqueOrThrow({where:{id:'closed'}})).payload.brandId,'A');
      assert.ok(await prisma.usageCounter.findUnique({where:{key:'unknown:2025-01-01'}}));assert.equal(await prisma.auditLog.count(),beforeAudit);assert.equal(await prisma.metric.count(),beforeMetrics);
      assert.equal((await retention.runRetention()).changed,0);
    });
    await t.test('B18: almacenamiento DB con cupo cero falla sin crear archivo ni auditoría',async()=>{
      const prev=process.env.DB_ASSET_STORAGE_LIMIT;process.env.DB_ASSET_STORAGE_LIMIT='0';
      try{const {crearAssetDesdeArchivo}=load('src/lib/asset-import.ts',mocks);const count=await prisma.asset.count();await assert.rejects(prisma.$transaction(tx=>crearAssetDesdeArchivo(tx,{ownerType:'brand',ownerId:'A',user:owner,label:null,blobId:null,extractedText:'x',useForAi:true,archivo:{name:'x.txt',mimeType:'text/plain',size:1,buffer:new Uint8Array([120]).buffer}})),/cupo reservado/);assert.equal(await prisma.asset.count(),count);}finally{if(prev===undefined)delete process.env.DB_ASSET_STORAGE_LIMIT;else process.env.DB_ASSET_STORAGE_LIMIT=prev;}
    });
    await t.test('B15: estructura rechaza modelo incompatible antes de guardar',async()=>{
      actor=owner;const structures=load('src/app/actions/structures.ts',mocks);const s=await prisma.structure.findUniqueOrThrow({where:{id:'structure'}});
      await assert.rejects(structures.guardarPrompt(fd({id:s.id,expectedUpdatedAt:s.updatedAt.toISOString(),defaultProvider:'google',defaultModel:'claude-opus-5',temperature:1,defaultDurationSec:45})),/catálogo/);
      assert.deepEqual(await prisma.structure.findUniqueOrThrow({where:{id:s.id}}),s);
    });
    await t.test('B20: modelo de matching legado conserva lectura pero rechaza nuevas escrituras',async()=>{
      const script=await prisma.script.create({data:{title:'Archivo',brandId:'A'}});
      await assert.rejects(prisma.matchRun.create({data:{scriptId:script.id,basedOnScriptUpdatedAt:script.updatedAt}}),/archivo de consulta/);
      assert.equal(await prisma.matchRun.count(),0);
    });
  }finally{await prisma.$disconnect();}
});
