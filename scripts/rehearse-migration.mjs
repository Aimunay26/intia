/** Ensayo reproducible con fixtures, backup binario y restauración a otra base vacía. */
import fs from "node:fs";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { assertLocalDatabase } from "./local-database-only.mjs";
const url=assertLocalDatabase(), admin=new PrismaClient({datasourceUrl:url.href}), suffix=randomBytes(4).toString('hex');
const source=`intia_upgrade_${suffix}_test`, target=`intia_restore_${suffix}_test`, created=[], clients=[];
function pg(binary,args,input){
  const container=process.env.PG_TEST_CONTAINER;
  const env={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password)};
  const command=container?'docker':binary, flags=container?['exec','-i',container,binary,'-U',decodeURIComponent(url.username),...args]:args;
  const result=spawnSync(command,flags,{env,input,maxBuffer:64*1024*1024});
  if(result.status!==0)throw new Error(`${binary} falló: ${result.stderr?.toString()}`);
  return result.stdout;
}
function sql(database,text){return pg('psql',['-d',database,'-v','ON_ERROR_STOP=1','-f','-'],text);}
async function snapshot(db){
  const tables=await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
  const output={};
  for(const {tablename}of tables){
    if(!/^[A-Za-z_]+$/.test(tablename))throw new Error('Tabla fuera del catálogo');
    const [row]=await db.$queryRawUnsafe(`SELECT COUNT(*)::int AS count, md5(COALESCE(string_agg(row_to_json(t)::text,'|' ORDER BY row_to_json(t)::text),'')) AS digest FROM "${tablename}" t`);output[tablename]=row;
  }
  return output;
}
async function schemaDefinitions(db) {
  return db.$queryRaw`SELECT 'column:' || c.relname || ':' || a.attname AS key,
    format_type(a.atttypid,a.atttypmod) || ':' || a.attnotnull::text || ':' || COALESCE(pg_get_expr(d.adbin,d.adrelid),'') AS value
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
    LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname='public' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped
    UNION ALL SELECT 'constraint:'||k.conname,pg_get_constraintdef(k.oid) FROM pg_constraint k JOIN pg_namespace n ON n.oid=k.connamespace WHERE n.nspname='public' AND k.contype<>'n'
    UNION ALL SELECT 'function:'||p.proname,pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f'
    ORDER BY key`;
}
try {
  for(const name of [source,target]){await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);created.push(name);const local=new URL(url);local.pathname=`/${name}`;clients.push(new PrismaClient({datasourceUrl:local.href}));}
  const [db,restored]=clients;
  sql(source,fs.readFileSync('prisma/migrations/00000000000000_baseline/migration.sql'));
  const [fingerprint]=await db.$queryRawUnsafe(fs.readFileSync('prisma/operations/schema-fingerprint.sql','utf8'));
  assert.equal(fingerprint.schema_fingerprint,JSON.parse(fs.readFileSync('prisma/operations/baseline-evidence.json')).fingerprint);
  sql(source,`INSERT INTO "User" (id,name,email,"passwordHash",role,"updatedAt") VALUES ('upgrade-owner','Fixture','upgrade@example.test','fixture-only','OWNER',now());
    INSERT INTO "Brand" (id,name,slug,"updatedAt") VALUES ('upgrade-brand','Fixture','upgrade',now());
    INSERT INTO "ContentItem" (id,"brandId",title,"scheduledDate","updatedAt") VALUES ('upgrade-video','upgrade-brand','Conservar',now(),now());
    INSERT INTO "Metric" (id,"contentItemId",date,views,likes,"retention3s","updatedAt") VALUES ('upgrade-metric','upgrade-video','2026-09-09 12:00',123,4,0,now());
    INSERT INTO "Asset" (id,"ownerType","ownerId",filename,data) VALUES ('upgrade-asset','content','upgrade-video','fixture.txt',decode('616263','hex'));
    INSERT INTO "Script" (id,title,"archetypeId","updatedAt") VALUES ('invalid-script','Fixture inválido','missing',now());`);
  const migration=fs.readFileSync('prisma/migrations/20260909190000_weekly_consistency/migration.sql');
  assert.throws(()=>sql(source,migration),/arquetipo inexistente/);
  assert.equal((await db.$queryRaw`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND table_name='Metric' AND column_name='period'`)[0].n,0);
  await db.$executeRaw`DELETE FROM "Script" WHERE id='invalid-script'`;
  const [before]=await db.$queryRaw`SELECT * FROM "Metric" WHERE id='upgrade-metric'`;
  sql(source,migration);
  await db.$disconnect(); // La sesión anterior preparó SELECT * antes de añadir columnas.
  const [after]=await db.$queryRaw`SELECT * FROM "Metric" WHERE id='upgrade-metric'`;
  const {period,platform,...unchanged}=after;assert.equal(period,'LEGACY');assert.equal(platform,'UNATTRIBUTED');assert.deepEqual(unchanged,before);
  const scalability=fs.readFileSync('prisma/migrations/20260909220000_jobs_private_storage_decimal/migration.sql');
  sql(source, `UPDATE "Metric" SET spend=0.1234567 WHERE id='upgrade-metric'`);
  assert.throws(()=>sql(source,scalability),/seis decimales/);
  assert.equal((await db.$queryRaw`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_name='GenerationJob'`)[0].n,0);
  sql(source, `UPDATE "Metric" SET spend=0.1, revenue=0.2 WHERE id='upgrade-metric'`);
  sql(source,scalability);
  await db.$disconnect();
  const exact=await db.metric.findUniqueOrThrow({where:{id:'upgrade-metric'}});
  assert.equal(exact.spend.toString(),'0.1');assert.equal(exact.revenue.toString(),'0.2');assert.equal(exact.views,123);
  assert.equal(Buffer.from((await db.asset.findUniqueOrThrow({where:{id:'upgrade-asset'}})).data).toString(),'abc');
  const original=await snapshot(db), originalSchema=await db.$queryRawUnsafe(fs.readFileSync('prisma/operations/schema-fingerprint.sql','utf8'));
  const dump=pg('pg_dump',['-d',source,'--format=custom','--no-owner','--no-acl']);
  pg('pg_restore',['-d',target,'--no-owner','--no-acl','--exit-on-error'],dump);
  const sourceDefinitions=await schemaDefinitions(db), targetDefinitions=await schemaDefinitions(restored);
  const schemaDiff=sourceDefinitions.flatMap(row=>{const other=targetDefinitions.find(item=>item.key===row.key);return other?.value===row.value?[]:[{key:row.key,source:row.value,restored:other?.value}];});
  fs.writeFileSync('.audit/migration-schema-diff.json',JSON.stringify(schemaDiff,null,2));
  assert.deepEqual(await snapshot(restored),original);assert.deepEqual(await restored.$queryRawUnsafe(fs.readFileSync('prisma/operations/schema-fingerprint.sql','utf8')),originalSchema);
  const report={checkedAt:new Date().toISOString(),environment:'local-fixture',baselineMatchesNeon:true,invalidPreflightRolledBack:true,decimalPreflightRolledBack:true,exactMoneyPreserved:true,legacyValuesPreserved:true,restoreRowsAndSchemaMatch:true,tables:Object.keys(original).length,backupBytes:dump.length};
  fs.mkdirSync('.audit',{recursive:true});fs.writeFileSync('.audit/migration-rehearsal.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
} finally {
  for(const db of clients)await db.$disconnect();
  for(const name of created)await admin.$executeRawUnsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin.$disconnect();
}
