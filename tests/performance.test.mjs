import assert from "node:assert/strict";
import { test } from "node:test";
import { load } from "./load-module.mjs";
import { summarize, parseRecords } from "../scripts/summarize-navigation.mjs";

test("O01: fases concurrentes separadas y logs sin datos, SQL ni mensajes de error", async () => {
  const saved=process.env.PERFORMANCE_LOGS; process.env.PERFORMANCE_LOGS="1";
  const lines=[]; const info=console.info; console.info=(prefix,json)=>lines.push(JSON.parse(json));
  try {
    const registry=new Map(); const mocks={react:{cache:fn=>{let value;return ()=>value??=fn();}}};
    const {measurePhase}=load("src/lib/performance.ts",mocks,registry);
    const {measureQuery}=load("src/lib/query-performance.ts",mocks,registry);
    await Promise.all([
      measurePhase("page:/contenido",()=>measureQuery("Metric","findMany",async()=>[{secret:"never-log-me"}])),
      measurePhase("page:/marcas",()=>measureQuery("Brand","count",async()=>3)),
    ]);
    await assert.rejects(measurePhase("failed",()=>measureQuery("User","findUnique",async()=>{throw new Error("password-never-log-me");})),/password/);
    assert.ok(lines.filter(row=>row.kind==="phase").every(row=>row.operations===1));
    assert.equal(lines.find(row=>row.kind==="query"&&row.model==="Metric").phase,"page:/contenido");
    assert.equal(lines.find(row=>row.kind==="query"&&row.model==="Brand").phase,"page:/marcas");
    assert.ok(!JSON.stringify(lines).includes("never-log-me"));
    const count=lines.length; process.env.PERFORMANCE_LOGS="0";
    await measurePhase("disabled",()=>measureQuery("Brand","count",async()=>1));
    assert.equal(lines.length,count);
  } finally { console.info=info; if(saved===undefined)delete process.env.PERFORMANCE_LOGS;else process.env.PERFORMANCE_LOGS=saved; }
});

test("O01: resultados grandes se estiman con recorrido limitado y percentiles separados por versión", () => {
  const {resultSize}=load("src/lib/query-performance.ts");
  const size=resultSize(Array.from({length:10000},()=>({text:"x".repeat(20)})));
  assert.equal(size.rows,10000); assert.equal(size.sampled,true); assert.ok(size.bytesApprox<10000);
  const records=parseRecords('[navigation] {"release":"a","to":"/","status":"complete","readyMs":100}\n[navigation] {"release":"b","to":"/","status":"complete","readyMs":900}\n[navigation] {"release":"a","to":"/","status":"cancelled","readyMs":1}');
  const groups=summarize(records);assert.equal(groups.length,2);assert.equal(groups[0].timings.readyMs.p95,null);assert.equal(groups[0].timings.readyMs.p50,100);assert.equal(groups[0].failures,0);assert.equal(groups[0].cancelled,1);
});

test("O05: fechas inválidas, años bisiestos y límites no dependen de la zona del servidor", () => {
  const {validReportDay,metricDateRange}=load("src/lib/report-dates.ts");
  assert.equal(validReportDay("2026-02-31"),false);assert.equal(validReportDay("2024-02-29"),true);
  const range=metricDateRange(undefined,undefined,new Date("2026-09-08T02:00:00Z"));
  assert.equal(range.hasta,"2026-09-07");assert.equal(range.days,30);
  const swapped=metricDateRange("2026-09-08","2026-09-01");assert.equal(swapped.desde,"2026-09-01");assert.equal(swapped.previousTo,"2026-08-31");
  assert.equal(metricDateRange("2020-01-01","2026-01-01").days,366);
});

test("O05: cargar más requiere sesión antes de tocar DB y verifica la marca actual", async () => {
  let authorized=false;
  const {cargarTareasColumna}=load("src/app/actions/task-pages.ts",{
    "@/lib/auth":{requirePermission:async()=>{if(!authorized)throw new Error("Sin sesión"); return {id:"owner",role:"OWNER"};}},
    "@/lib/brand-context":{getBrandContext:async()=>({activeId:"B"})},
    "@/lib/prisma":{prisma:new Proxy({},{get:()=>assert.fail("No debe consultar DB")})},
    "@/lib/task-pages":{getTaskColumnPage:()=>assert.fail("No debe cargar páginas"),taskColumnWhere:()=>({})},
    "@/lib/performance":{measurePhase:(_,work)=>work()},
  });
  const input={columnId:"column",brandId:"A",cursor:"token",filters:{}};
  await assert.rejects(cargarTareasColumna(input),/Sin sesión/);authorized=true;
  await assert.rejects(cargarTareasColumna(input),/marca cambió/);
});

test("O06: configuración explícita del pool, sin confundir texto de la contraseña con el host", () => {
  const {databaseUrl}=load("src/lib/database-url.ts");
  const plain=new URL(databaseUrl({DATABASE_URL:"postgresql://user:my-pooler-password@localhost/db"}));
  assert.equal(plain.searchParams.has("pgbouncer"),false);
  assert.equal(plain.searchParams.get("application_name"),'intia-secrets-20260925');
  assert.equal(new URL(databaseUrl({DATABASE_URL:plain.href.replace('intia-secrets-20260925','old-client')})).searchParams.get('application_name'),'intia-secrets-20260925');
  const pooled=new URL(databaseUrl({DATABASE_URL:"postgresql://user:pass@ep-test-pooler.neon.tech/db?sslmode=require",DB_CONNECTION_LIMIT:"4",DB_POOL_TIMEOUT_SECONDS:"12"}));
  assert.equal(pooled.searchParams.get("pgbouncer"),"true");assert.equal(pooled.searchParams.get("connection_limit"),"4");assert.equal(pooled.searchParams.get("sslmode"),"require");
  assert.throws(()=>databaseUrl({DATABASE_URL:plain.href,DB_CONNECTION_LIMIT:"0"}),/entero/);
  assert.throws(()=>databaseUrl({DATABASE_URL:plain.href,DB_POOL_TIMEOUT_SECONDS:"invalid"}),/entero/);
});

test("O07: aislamiento de claves, invalidación y antigüedad máxima del catálogo", async () => {
  const values=new Map();let reads=0;let now=1000;
  const next={unstable_cache:(work,key,options)=>async()=>{const name=JSON.stringify(key);if(!values.has(name))values.set(name,{value:await work(),tags:options.tags});return values.get(name).value;},revalidateTag:tag=>{for(const[key,entry]of values)if(entry.tags.includes(tag))values.delete(key);}};
  const cache=load("src/lib/catalog-cache.ts",{"next/cache":next});
  const scope={namespace:"test-install",database:"postgresql://user:private@db/a",userId:"u1",role:"OWNER",session:"secret-cookie",brandId:"A"};
  const loader=async()=>{reads++;return[{id:"1",name:`name-${reads}`}];};
  const first=await cache.readCachedCatalog(scope,false,loader,()=>now);
  assert.deepEqual(await cache.readCachedCatalog(scope,false,loader,()=>now),first);assert.equal(reads,1);
  for(const patch of [{brandId:"B"},{role:"MEMBER"},{userId:"u2"},{session:"another"},{namespace:"another"},{database:"another"}])await cache.readCachedCatalog({...scope,...patch},false,loader,()=>now);
  assert.equal(reads,7);assert.ok(!JSON.stringify([...values.keys()]).includes("secret-cookie"));
  next.revalidateTag(cache.catalogIdentity(scope,false).tag);
  assert.notDeepEqual(await cache.readCachedCatalog(scope,false,loader,()=>now),first);
  now+=30_001;
  const prior=reads;await cache.readCachedCatalog(scope,false,loader,()=>now);assert.equal(reads,prior+1);
  assert.throws(()=>cache.catalogIdentity({...scope,userId:""},false),/alcance/);
});

test("O07: cada petición autoriza antes de acceder al catálogo incluso si existe caché", async () => {
  const saved={flag:process.env.CATALOG_CACHE_ENABLED,namespace:process.env.CATALOG_CACHE_NAMESPACE,database:process.env.DATABASE_URL};
  process.env.CATALOG_CACHE_ENABLED="1";process.env.CATALOG_CACHE_NAMESPACE="test";process.env.DATABASE_URL="postgresql://user:pass@db/test";
  let allowed=true;let cached=0;
  try {
    const {getStructureChoices}=load("src/lib/structure-choices.ts",{
      react:{cache:fn=>fn},"next/headers":{cookies:async()=>({get:()=>({value:"session"})})},
      "@/lib/prisma":{prisma:{structure:{findMany:async()=>[]}}},
      "@/lib/render-context":{requirePageUser:async()=>{if(!allowed)throw new Error("Usuario desactivado");return{id:"u1",role:"OWNER"};},getPageBrandContext:async()=>({activeId:"A"})},
      "@/lib/auth":{SESSION_COOKIE:"session"},"@/lib/catalog-cache":{readCachedCatalog:async()=>{cached++;return[];}},
    });
    await getStructureChoices();assert.equal(cached,1);allowed=false;
    await assert.rejects(getStructureChoices(),/desactivado/);assert.equal(cached,1);
  } finally {for(const[name,value]of[["CATALOG_CACHE_ENABLED",saved.flag],["CATALOG_CACHE_NAMESPACE",saved.namespace],["DATABASE_URL",saved.database]]){if(value===undefined)delete process.env[name];else process.env[name]=value;}}
});
