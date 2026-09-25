import assert from 'node:assert/strict';
import {test} from 'node:test';
import {load} from './load-module.mjs';
const params=load('src/lib/query-params.ts');
test('B17: offsets y fechas hostiles nunca producen NaN, Infinity ni fechas imposibles',()=>{
  for(const value of ['Infinity','1.5','-1','0','1000001','1e3','',undefined,['2']])assert.equal(params.pageNumber(value),1);
  assert.equal(params.pageNumber('12'),12);
  assert.deepEqual(params.singleQueryValues({q:['one','two'],pagina:'2',desde:null}),{q:undefined,pagina:'2',desde:undefined});
  assert.deepEqual(params.optionalDateRange('2026-02-31','invalid'),{desde:undefined,hasta:undefined});
  assert.deepEqual(params.optionalDateRange('2026-09-30','2026-09-01'),{desde:'2026-09-01',hasta:'2026-09-30'});
});
test('B16: solo métricas sumables y semanas completas, no porcentajes ni seguidores inventados',()=>{
  const {objectiveCalculation}=load('src/lib/objective-policy.ts');
  const form=values=>{const f=new FormData();for(const[k,v]of Object.entries(values))f.set(k,v);return f;};
  const data={calculationMode:'WEEKLY_SUM',metricKey:'views',calculationFrom:'2026-09-07',calculationTo:'2026-09-20'};
  assert.equal(objectiveCalculation(form(data)).calculationMode,'WEEKLY_SUM');
  for(const patch of [{metricKey:'retention3s'},{metricKey:'followers'},{calculationFrom:'2026-09-08'},{calculationTo:'2026-09-19'},{calculationPlatform:'injected'}])assert.throws(()=>objectiveCalculation(form({...data,...patch})));
});
test('B15: modelo efectivo conserva procedencia y rechaza configuración activa inválida',()=>{
  const {effectiveAiModel}=load('src/lib/ai-models.ts');
  assert.deepEqual(effectiveAiModel('google','gemini-3.8-flash'),{model:'gemini-3.8-flash',source:'request'});
  assert.equal(effectiveAiModel('anthropic','','claude-sonnet-5').source,'structure');
  assert.equal(effectiveAiModel('anthropic','','','claude-haiku-4-5').source,'settings');
  assert.throws(()=>effectiveAiModel('google','','retired-model','gemini-3.8-flash'),/catálogo/);
});
test('B18: textos grandes dejan huella verificable sin duplicar su contenido',()=>{
  const {compactAuditChanges}=load('src/lib/audit.ts',{'@/lib/prisma':{prisma:{}},'@/lib/auth':{}});
  const changes=compactAuditChanges({text:{etiqueta:'Texto',antes:'private-text'.repeat(500),despues:'ok'}});
  assert.equal(changes.text.antes.characters,6000);assert.match(changes.text.antes.sha256,/^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(changes),/private-text/);assert.equal(changes.text.despues,'ok');
});
test('B18: retención técnica apagada por defecto y jamás reduce la ventana de cuotas vigente',()=>{
  const retention=load('src/lib/retention.ts',{'@/lib/prisma':{prisma:{}}});
  assert.equal(retention.retentionPolicy(null).enabled,false);
  assert.throws(()=>retention.retentionPolicy({enabled:true,counterDays:31}));
});
test('B14: el fallo de limpieza no impide despachar; límites de espera distinguen resultado incierto',async()=>{
  const old=process.env.AI_JOBS_ENABLED;process.env.AI_JOBS_ENABLED='true';
  const calls=[];
  try{
    const m=load('src/lib/maintenance.ts',{
      '@/lib/prisma':{prisma:{generationJob:{findMany:async()=>[{id:'job',createdAt:new Date(Date.now()-3600000)}]},appSetting:{upsert:async()=>({})}}},
      '@/lib/generation-dispatch':{dispatchGeneration:async()=>{calls.push('dispatch');return true;}},
      '@/lib/private-storage':{cleanupPrivateFiles:async()=>{calls.push('cleanup');throw Error('failed blob');}},
      '@/lib/retention':{runRetention:async()=>{calls.push('retention');return {enabled:false,changed:0};}},
    });
    const result=await m.runMaintenance();assert.deepEqual(calls,['dispatch','cleanup','retention']);assert.equal(result.recovery.value.recovered,1);assert.equal(result.cleanup.error,'failed');
    assert.equal((await m.boundedStep(()=>new Promise(()=>{}),5)).error,'uncertain');
  }finally{if(old===undefined)delete process.env.AI_JOBS_ENABLED;else process.env.AI_JOBS_ENABLED=old;}
});
test('B17: invalidación incluye fichas derivadas de un guion borrado y objetivos al editar métricas',()=>{
  const paths=[];const {invalidateDomain}=load('src/lib/view-invalidation.ts',{'next/cache':{revalidatePath:(...p)=>paths.push(p)}});
  invalidateDomain('script');assert.ok(paths.some(([p,s])=>p==='/contenido'&&s==='layout'));assert.ok(paths.some(([p])=>p==='/calendario'));
  invalidateDomain('metric');assert.ok(paths.some(([p,s])=>p==='/marcas'&&s==='layout'));
});

test('B14: una limpieza que nunca responde agota su presupuesto después de recuperar IA',async()=>{
  const old=process.env.AI_JOBS_ENABLED;process.env.AI_JOBS_ENABLED='true';
  let dispatched=false;
  try{
    const m=load('src/lib/maintenance.ts',{
      '@/lib/prisma':{prisma:{generationJob:{findMany:async()=>[{id:'slow-cleanup-job',createdAt:new Date()}]},appSetting:{upsert:async()=>({})}}},
      '@/lib/generation-dispatch':{dispatchGeneration:async()=>{dispatched=true;return true;}},
      '@/lib/private-storage':{cleanupPrivateFiles:async()=>{assert.equal(dispatched,true);return new Promise(()=>{});}},
      '@/lib/retention':{runRetention:async()=>({enabled:false,changed:0})},
    });
    const start=Date.now(),result=await m.runMaintenance();
    assert.equal(result.recovery.value.recovered,1);assert.equal(result.cleanup.error,'uncertain');assert.equal(result.retention.value.enabled,false);
    assert.ok(Date.now()-start<30000,'La limpieza no consume los 50 segundos del mantenimiento');
  }finally{if(old===undefined)delete process.env.AI_JOBS_ENABLED;else process.env.AI_JOBS_ENABLED=old;}
});
