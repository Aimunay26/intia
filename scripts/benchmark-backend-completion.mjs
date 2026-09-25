/** B12/B13 benchmark. Local disposable data only; no provider or production access. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {PrismaClient} from '@prisma/client';
import {assertLocalDatabase} from './local-database-only.mjs';
import {load} from '../tests/load-module.mjs';
const source=assertLocalDatabase(),admin=new PrismaClient({datasourceUrl:source.href});
const name=`intia_completion_perf_${randomBytes(4).toString('hex')}_test`,url=new URL(source);url.pathname='/'+name;
const baseline='6a17cc7',delayMs=20,samples=3;
fs.mkdirSync('.audit',{recursive:true});
const baselineFile='.audit/metrics-baseline.ts';fs.writeFileSync(baselineFile,execFileSync('git',['show',`${baseline}:src/app/actions/metrics.ts`],{encoding:'utf8'}));
let db,counter=0,bytes=0,latency=0;
const wait=()=>new Promise(r=>setTimeout(r,latency));
const record=value=>{if(value!==undefined)bytes+=Buffer.byteLength(JSON.stringify(value,(_k,v)=>typeof v==='bigint'?String(v):v));return value;};
function instrument(client){return new Proxy(client,{get(target,key){
 if(key==='$transaction')return async(work,options)=>{await wait();const result=await target.$transaction(tx=>work(instrument(tx)),options);await wait();return result;};
 const val=target[key];
 if(typeof val==='function')return async(...args)=>{await wait();return record(await val.apply(target,args));};
 if(val&&typeof val==='object')return new Proxy(val,{get(delegate,method){const fn=delegate[method];return typeof fn==='function'?async(...args)=>{await wait();return record(await fn.apply(delegate,args));}:fn;}});
 return val;
}});}
const percentile=(items,p)=>[...items].sort((a,b)=>a-b)[Math.ceil(items.length*p)-1];
const currentOnly=process.argv.includes('--current-only'),readsOnly=process.argv.includes('--reads-only');
const savedCsv=(currentOnly||readsOnly)?JSON.parse(fs.readFileSync('.audit/backend-completion-benchmark.json','utf8')).csv.filter(r=>readsOnly||r.mode==='before'):[];
const report={environment:'ephemeral-local-postgresql',baseline,simulatedOrmRoundTripMs:delayMs,csvSamples:samples,caveat:'p95 with 3 CSV samples equals the maximum; injected delay per awaited Prisma operation and transaction boundary, not measured Neon network latency. Bytes are serialized query results, not wire traffic.',csv:savedCsv,references:{},indexes:[]};
try{
 await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
 const migrated=spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{env:{...process.env,DATABASE_URL:url.href},encoding:'utf8'});assert.equal(migrated.status,0,migrated.stderr);
 db=new PrismaClient({datasourceUrl:url.href,log:[{emit:'event',level:'query'}]});db.$on('query',()=>counter++);
 const user=await db.user.create({data:{id:'owner',name:'Fixture',email:'perf@fixture.test',passwordHash:'fixture',role:'OWNER'}});
 await db.brand.createMany({data:[{id:'A',name:'A',slug:'a'},{id:'B',name:'B',slug:'b'}]});
 await db.contentItem.createMany({data:Array.from({length:20000},(_,i)=>({id:'video-'+i,title:'Video '+i,brandId:i%2?'A':'B',scheduledDate:new Date()}))});
 const mock=instrument(db),mocks={'@/lib/prisma':{prisma:mock},'@/lib/auth':{requirePermission:async()=>user,requireLevel:async()=>user,LEVEL:{MEMBER:1,OWNER:2}},'next/cache':{revalidatePath(){},revalidateTag(){}}};
 const old=load(baselineFile,mocks),current=load('src/lib/metric-import-service.ts',mocks);
 for(const count of (readsOnly?[]:[50,500]))for(const mode of (currentOnly?['after']:['before','after'])){
  const readings=[];
  for(let i=0;i<samples;i++){
   latency=0;await db.metric.deleteMany();await db.auditLog.deleteMany();await db.metricImportBatch.deleteMany();
   const form=new FormData();form.set('requestKey',randomUUID());form.set('csv','video,semana,plataforma,vistas\n'+Array.from({length:count},(_,n)=>`video-${n},2026-09-07,TIKTOK,100`).join('\n'));
   counter=0;bytes=0;latency=delayMs;const start=performance.now();
   let result=mode==='before'?await old.importarMetricasCsv(null,form):await current.startMetricImport(user,form);
   while(result.pending)result=await current.continueMetricImport(user,result.batchId);
   const elapsedMs=Math.round(performance.now()-start);assert.equal(result.created,count,JSON.stringify(result));
   readings.push({elapsedMs,queries:counter,serializedResultBytes:bytes});console.log(JSON.stringify({count,mode,sample:i+1,...readings.at(-1)}));
  }
  report.csv.push({rows:count,mode,p50Ms:percentile(readings.map(r=>r.elapsedMs),.5),p95Ms:percentile(readings.map(r=>r.elapsedMs),.95),readings});fs.writeFileSync('.audit/backend-completion-benchmark.json',JSON.stringify(report,null,2));
 }
 latency=0;
 await db.structure.create({data:{id:'structure',name:'S',slug:'s'}});
 await db.archetype.create({data:{id:'person',name:'Persona',slug:'persona'}});
 await db.asset.createMany({data:Array.from({length:90},(_,i)=>({id:'asset-'+i,ownerType:i<30?'structure':i<60?'brand':'archetype',ownerId:i<30?'structure':i<60?'A':'person',filename:'fixture.txt',size:1,data:Buffer.from('x'),mimeType:'text/plain',useForAi:true,extractedText:'x'.repeat(100000)}))});
 const refs=load('src/lib/ai/references.ts',mocks);
 for(const mode of ['before','after']){
  const readings=[];
  for(let i=0;i<20;i++){
   counter=0;bytes=0;latency=delayMs;const start=performance.now();
   if(mode==='before')for(const[ownerType,ownerId]of[['structure','structure'],['brand','A'],['archetype','person']])await mock.asset.findMany({where:{ownerType,ownerId,useForAi:true},select:{id:true,filename:true,label:true,extractedText:true}});
   else await refs.loadGenerationReferences('structure','person','A');
   readings.push({elapsedMs:Math.round(performance.now()-start),queries:counter,serializedResultBytes:bytes});
  }
  report.references[mode]={p50Ms:percentile(readings.map(r=>r.elapsedMs),.5),p95Ms:percentile(readings.map(r=>r.elapsedMs),.95),queries:readings[0].queries,serializedResultBytes:readings[0].serializedResultBytes,samples:20};
 }
 latency=0;
 await db.taskColumn.createMany({data:[{id:'column',name:'C'},{id:'other-column',name:'Other'}]});
 await db.$executeRawUnsafe(`INSERT INTO "Task" (id,title,"columnId","brandId","order","updatedAt") SELECT 'task-'||i,'Task '||i,CASE WHEN i%10=0 THEN 'column' ELSE 'other-column' END,CASE WHEN i%100=0 THEN 'A' ELSE 'B' END,i,now() FROM generate_series(1,100000) i`);
 await db.script.create({data:{id:'script',title:'Fixture'}});
 await db.contentItem.updateMany({where:{id:{in:['video-1','video-2']}},data:{scriptId:'script'}});
 await db.$executeRawUnsafe('ANALYZE "Task"');await db.$executeRawUnsafe('ANALYZE "ContentItem"');
 const cases=[
  {index:'Task_columnId_order_id_idx',create:'CREATE INDEX "Task_columnId_order_id_idx" ON "Task" ("columnId","order",id)',query:`SELECT id,title FROM "Task" WHERE "columnId"='column' ORDER BY "order",id LIMIT 30`},
  {index:'Task_columnId_brandId_order_id_idx',create:'CREATE INDEX "Task_columnId_brandId_order_id_idx" ON "Task" ("columnId","brandId","order",id)',query:`SELECT id,title FROM "Task" WHERE "columnId"='column' AND "brandId"='A' ORDER BY "order",id LIMIT 30`},
  {index:'ContentItem_scriptId_idx',create:'CREATE INDEX "ContentItem_scriptId_idx" ON "ContentItem" ("scriptId")',query:`SELECT id FROM "ContentItem" WHERE "scriptId"='script'`}
 ];
 // Remove only these candidates in the disposable database to reproduce the pre-migration baseline.
 for(const c of cases)await db.$executeRawUnsafe(`DROP INDEX IF EXISTS "${c.index}"`);
 for(const c of cases){
  const before=await db.$queryRawUnsafe('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '+c.query);
  await db.$executeRawUnsafe(c.create);
  const after=await db.$queryRawUnsafe('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '+c.query);
  report.indexes.push({name:c.index,query:c.query,before:before[0]['QUERY PLAN'][0],after:after[0]['QUERY PLAN'][0]});
 }
 fs.writeFileSync('.audit/backend-completion-benchmark.json',JSON.stringify(report,null,2));console.log(JSON.stringify({saved:'.audit/backend-completion-benchmark.json',csv:report.csv.map(({readings:_readings,...r})=>r),references:report.references,indexes:report.indexes.map(r=>({name:r.name,beforeMs:r.before['Execution Time'],afterMs:r.after['Execution Time']}))},null,2));
}finally{await db?.$disconnect();await admin.$executeRawUnsafe(`DROP DATABASE "${name}" WITH (FORCE)`);await admin.$disconnect();}
