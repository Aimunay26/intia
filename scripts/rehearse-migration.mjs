/** Ensayo reproducible con fixtures, backup binario y restauración a otra base vacía. */
import fs from "node:fs";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { load } from "../tests/load-module.mjs";
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
  fs.mkdirSync('.audit',{recursive:true});
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
  assert.equal(Buffer.from((await db.asset.findUniqueOrThrow({where:{id:'upgrade-asset'},select:{data:true}})).data).toString(),'abc');
  const member=await db.user.create({data:{id:'upgrade-member',name:'Miembro previo',email:'member@upgrade.test',passwordHash:'fixture-only'}});
  await db.authSession.create({data:{id:'upgrade-session',userId:member.id,expiresAt:new Date(Date.now()+60000)}});
  sql(source,fs.readFileSync('prisma/migrations/20260910010000_team_work_profiles/migration.sql'));
  assert.equal(await db.userWorkProfile.count(),0,'La migración no infiere permisos de usuarios existentes');
  assert.equal(await db.userBrandAccess.count(),0);
  assert.equal((await db.user.findUniqueOrThrow({where:{id:member.id}})).sessionVersion,member.sessionVersion);
  await db.userWorkProfile.create({data:{userId:member.id,profile:'EDITOR'}});
  await db.userBrandAccess.create({data:{userId:member.id,brandId:'upgrade-brand'}});
  assert.equal(await db.authSession.count({where:{userId:member.id}}),0);
  assert.equal((await db.user.findUniqueOrThrow({where:{id:member.id}})).sessionVersion,member.sessionVersion+2);
  sql(source,fs.readFileSync('prisma/migrations/20260910120000_content_structure_ids/migration.sql'));
  sql(source,`INSERT INTO "Structure" (id,name,slug,"updatedAt") VALUES ('upgrade-format','Formato previo','upgrade-format',now());
    UPDATE "ContentItem" SET "structureIds"='["upgrade-format","upgrade-format"]' WHERE id='upgrade-video';
    INSERT INTO "GenerationJob" (id,"userId","sessionVersion","requestKey",fingerprint,payload,"updatedAt") VALUES ('upgrade-job','upgrade-owner',0,'fixture','fixture','{}',now());
    INSERT INTO "GenerationItem" (id,"jobId","structureId","order","updatedAt") VALUES ('upgrade-item','upgrade-job','missing-format',0,now());`);
  const priorities=fs.readFileSync('prisma/migrations/20260916180000_backend_priorities/migration.sql');
  assert.throws(()=>sql(source,priorities),/estructura inexistente/);
  const noPartialMigration=async()=>assert.equal((await db.$queryRaw`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_name='ContentPlannedStructure'`)[0].n,0);
  await noPartialMigration();
  sql(source,`UPDATE "GenerationItem" SET "structureId"='upgrade-format' WHERE id='upgrade-item';
    UPDATE "ContentItem" SET "structureIds"='["missing-format"]' WHERE id='upgrade-video';`);
  assert.throws(()=>sql(source,priorities),/ContentPlannedStructure_structureId_fkey/);
  await noPartialMigration();
  sql(source,`UPDATE "ContentItem" SET "structureIds"='invalid-json' WHERE id='upgrade-video';`);
  assert.throws(()=>sql(source,priorities),/JSON no válido/);
  await noPartialMigration();
  sql(source,`UPDATE "ContentItem" SET "structureIds"='["upgrade-format","upgrade-format"]' WHERE id='upgrade-video';`);
  const videoBefore=await db.contentItem.findUniqueOrThrow({where:{id:'upgrade-video'}});
  const preflightOutput=sql(source,fs.readFileSync('prisma/operations/preflight-backend-priorities.sql')).toString();
  assert.equal((preflightOutput.match(/\(0 rows\)/g)||[]).length,4,'Los cuatro controles del preflight deben quedar vacíos antes de migrar');
  sql(source,priorities);
  const videoAfter=await db.contentItem.findUniqueOrThrow({where:{id:'upgrade-video'}});
  assert.equal(videoAfter.title,videoBefore.title);assert.equal(videoAfter.structureIds,videoBefore.structureIds);
  assert.ok(videoAfter.updatedAt>videoBefore.updatedAt,'El backfill renueva las revisiones de los formularios previos');
  assert.deepEqual(await db.contentPlannedStructure.findMany(),[{contentItemId:'upgrade-video',structureId:'upgrade-format',order:0}]);
  assert.equal((await db.generationItem.findUniqueOrThrow({where:{id:'upgrade-item'},select:{linkWarning:true}})).linkWarning,null);
  await assert.rejects(db.structure.delete({where:{id:'upgrade-format'}}));
  const workflow=fs.readFileSync('prisma/migrations/20260917180000_workflow_consistency/migration.sql');
  sql(source,`INSERT INTO "CalendarEvent" (id,title,"contentItemId","startAt","updatedAt") VALUES ('bad-workflow','Evento previo','upgrade-video',now(),now());
    INSERT INTO "ChecklistItem" (id,"contentItemId",label,stage,done) VALUES ('legacy-final','upgrade-video','Revisión final aprobada','POSTPRODUCCION',true);`);
  assert.throws(()=>sql(source,workflow),/Preflight B07/);
  assert.equal((await db.$queryRaw`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_name='Approval'`)[0].n,0);
  sql(source,`UPDATE "CalendarEvent" SET "brandId"='upgrade-brand' WHERE id='bad-workflow';`);
  sql(source,workflow);
  const legacy=await db.checklistItem.findUniqueOrThrow({where:{id:'legacy-final'}});
  assert.equal(legacy.kind,'FINAL_APPROVAL');assert.equal(legacy.done,true);assert.equal(legacy.approvalId,null);
  assert.equal(await db.approval.count(),0,'No se inventa una versión histórica aprobada');
  sql(source,`INSERT INTO "BrandObjective" (id,"brandId",name,"currentValue","updatedAt") VALUES ('old-objective','upgrade-brand','Objetivo previo',37,now());
    INSERT INTO "Script" (id,title,"updatedAt") VALUES ('archive-script','Archivo',now());
    INSERT INTO "MatchRun" (id,"scriptId","basedOnScriptUpdatedAt","updatedAt",status) VALUES ('archive-run','archive-script',now(),now(),'OK');`);
  const archiveBefore=await db.matchRun.findUniqueOrThrow({where:{id:'archive-run'}});
  const [objectiveBefore]=await db.$queryRaw`SELECT * FROM "BrandObjective" WHERE id='old-objective'`;
  const completion=fs.readFileSync('prisma/migrations/20260924180000_backend_completion/migration.sql');
  sql(source,'CREATE INDEX "Task_columnId_order_id_idx" ON "Task" ("columnId")');
  assert.throws(()=>sql(source,completion),/Preflight B13/);
  assert.equal((await db.$queryRaw`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_name='MetricImportBatch'`)[0].n,0);
  sql(source,'DROP INDEX "Task_columnId_order_id_idx"; CREATE INDEX "Task_columnId_order_id_idx" ON "Task" ("columnId","order",id)');
  sql(source,completion);
  await db.$disconnect();
  const objectiveAfter=await db.brandObjective.findUniqueOrThrow({where:{id:'old-objective'}});
  const {calculationMode,calculationFrom,calculationTo,calculationPlatform,...originalObjective}=objectiveAfter;
  assert.equal(calculationMode,'MANUAL');assert.deepEqual([calculationFrom,calculationTo,calculationPlatform],[null,null,null]);assert.deepEqual(originalObjective,objectiveBefore);
  assert.deepEqual(await db.matchRun.findUniqueOrThrow({where:{id:'archive-run'}}),archiveBefore);
  await assert.rejects(db.matchRun.update({where:{id:'archive-run'},data:{status:'ERROR'}}),/archivo de consulta/);
  assert.equal(await db.metricImportBatch.count(),0);
  assert.deepEqual((await db.generationItem.findUniqueOrThrow({where:{id:'upgrade-item'},select:{stage:true,diagnostics:true}})),{stage:null,diagnostics:null});
  sql(source, `INSERT INTO "AppSetting" (key,value,"updatedAt") VALUES ('ai.google.apiKey','upgrade-key-fixture',now()),('calendar.feedToken','legacy-calendar-fixture',now());`);
  sql(source,fs.readFileSync('prisma/migrations/20260925010000_secrets_calendar/migration.sql'));
  assert.equal(await db.appSetting.count({where:{key:'calendar.feedToken'}}),0);
  process.env.APP_SECRETS_KEYS=JSON.stringify({first:randomBytes(32).toString('base64')});process.env.APP_SECRETS_ACTIVE_KEY='missing';
  const {migrateSecretStore}=load('src/lib/secret-migration.ts');
  await assert.rejects(db.$transaction(tx=>migrateSecretStore(tx)),/almacén cifrado/);
  assert.equal(await db.appSecret.count(),0);assert.equal(await db.appSetting.count({where:{key:'ai.google.apiKey'}}),1);
  process.env.APP_SECRETS_ACTIVE_KEY='first';
  assert.equal((await db.$transaction(tx=>migrateSecretStore(tx))).migrated,1);
  assert.equal(await db.appSetting.count({where:{key:'ai.google.apiKey'}}),0);
  const crypto=load('src/lib/secret-crypto.ts');
  assert.equal(crypto.decryptSecret('ai.google.apiKey',await db.appSecret.findUniqueOrThrow({where:{key:'ai.google.apiKey'}})),'upgrade-key-fixture');
  process.env.APP_SECRETS_KEYS=JSON.stringify({...JSON.parse(process.env.APP_SECRETS_KEYS),second:randomBytes(32).toString('base64')});process.env.APP_SECRETS_ACTIVE_KEY='second';
  assert.equal((await db.$transaction(tx=>migrateSecretStore(tx,true))).rotated,1);
  process.env.APP_SECRETS_KEYS=JSON.stringify({second:JSON.parse(process.env.APP_SECRETS_KEYS).second});
  assert.equal(crypto.decryptSecret('ai.google.apiKey',await db.appSecret.findUniqueOrThrow({where:{key:'ai.google.apiKey'}})),'upgrade-key-fixture');
  assert.deepEqual(await db.$transaction(tx=>migrateSecretStore(tx,true)),{migrated:0,rotated:0,removedLegacyRows:0});
  const [catalogBrandBefore]=await db.$queryRaw`SELECT * FROM "Brand" WHERE id='upgrade-brand'`;
  sql(source,fs.readFileSync('prisma/migrations/20260928120000_brand_catalog/migration.sql'));
  await db.$disconnect();
  assert.deepEqual((await db.$queryRaw`SELECT * FROM "Brand" WHERE id='upgrade-brand'`)[0],catalogBrandBefore);
  assert.equal(await db.brandProduct.count(),0,'El catálogo nace vacío: no se infieren productos del brief');
  sql(source,`INSERT INTO "Brand" (id,name,slug,"updatedAt") VALUES ('upgrade-other','Otra marca','upgrade-other',now());
    INSERT INTO "BrandProduct" (id,"brandId",name,slug,"updatedAt") VALUES ('upgrade-product','upgrade-brand','Polera','polera',now()),('other-product','upgrade-other','Taza','taza',now());
    INSERT INTO "BrandCombo" (id,"brandId",name,slug,"updatedAt") VALUES ('upgrade-combo','upgrade-brand','Pack','pack',now());
    INSERT INTO "BrandComboItem" ("comboId","productId","brandId",quantity) VALUES ('upgrade-combo','upgrade-product','upgrade-brand',2);`);
  assert.throws(()=>sql(source,`INSERT INTO "BrandComboItem" ("comboId","productId","brandId") VALUES ('upgrade-combo','other-product','upgrade-brand')`),/BrandComboItem_productId_brandId_fkey/);
  assert.throws(()=>sql(source,`INSERT INTO "BrandComboItem" ("comboId","productId","brandId") VALUES ('upgrade-combo','other-product','upgrade-other')`),/BrandComboItem_comboId_brandId_fkey/);
  assert.throws(()=>sql(source,`UPDATE "BrandProduct" SET kind='OTRO' WHERE id='upgrade-product'`),/BrandProduct_kind_check/);
  assert.throws(()=>sql(source,`UPDATE "BrandComboItem" SET quantity=0`),/BrandComboItem_quantity_check/);
  const productBefore=await db.brandProduct.findUniqueOrThrow({where:{id:'upgrade-product'}});
  await db.brandProduct.update({where:{id:'upgrade-product'},data:{aiNotes:'Algodón pima'}});
  assert.ok((await db.brandProduct.findUniqueOrThrow({where:{id:'upgrade-product'}})).updatedAt>productBefore.updatedAt,'El catálogo usa la revisión monótona');
  sql(source,`DELETE FROM "Brand" WHERE id='upgrade-other'`);
  assert.equal(await db.brandProduct.count({where:{brandId:'upgrade-other'}}),0);
  // Flujo de producción: solo tablas nuevas; ninguna fila ni columna existente cambia.
  const [flowBrandBefore]=await db.$queryRaw`SELECT * FROM "Brand" WHERE id='upgrade-brand'`;
  const [flowVideoBefore]=await db.$queryRaw`SELECT * FROM "ContentItem" WHERE id='upgrade-video'`;
  const [flowTaskColumns]=await db.$queryRaw`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('ContentItem','Task','Assignment','Brand','User')`;
  sql(source,fs.readFileSync('prisma/migrations/20260928180000_production_flow/migration.sql'));
  await db.$disconnect();
  assert.deepEqual((await db.$queryRaw`SELECT * FROM "Brand" WHERE id='upgrade-brand'`)[0],flowBrandBefore);
  assert.deepEqual((await db.$queryRaw`SELECT * FROM "ContentItem" WHERE id='upgrade-video'`)[0],flowVideoBefore);
  assert.deepEqual((await db.$queryRaw`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('ContentItem','Task','Assignment','Brand','User')`)[0],flowTaskColumns,'Sin columnas nuevas en tablas existentes: el código previo sigue leyendo lo mismo');
  assert.equal(await db.productionStep.count(),0,'El flujo nace vacío: no se infieren equipos ni pasos');
  assert.equal(await db.brandTeamMember.count(),0);
  sql(source,`INSERT INTO "Brand" (id,name,slug,"updatedAt") VALUES ('flow-other','Otra marca','flow-other',now());
    INSERT INTO "BrandTeamMember" (id,"brandId",role,"userId","updatedAt") VALUES ('flow-team','upgrade-brand','FILMMAKER','upgrade-member',now());
    INSERT INTO "BrandProductionSettings" ("brandId","recordingWeekdays","updatedAt") VALUES ('upgrade-brand','[2,4]',now());
    INSERT INTO "ProductionStep" (id,"contentItemId","brandId",step,"assigneeId","dueAt","automationKey","updatedAt") VALUES ('flow-step','upgrade-video','upgrade-brand','GRABACION','upgrade-member',now(),'upgrade-video:GRABACION',now());`);
  assert.throws(()=>sql(source,`INSERT INTO "BrandTeamMember" (id,"brandId",role,"userId","updatedAt") VALUES ('flow-dup','upgrade-brand','FILMMAKER','upgrade-owner',now())`),/BrandTeamMember_brandId_role_key/);
  assert.throws(()=>sql(source,`INSERT INTO "BrandTeamMember" (id,"brandId",role,"userId","updatedAt") VALUES ('flow-role','upgrade-brand','CAMARA','upgrade-owner',now())`),/BrandTeamMember_role_check/);
  assert.throws(()=>sql(source,`UPDATE "BrandProductionSettings" SET "recordingWeekdays"='[0,2]'`),/BrandProductionSettings_recordingWeekdays_check/);
  assert.throws(()=>sql(source,`INSERT INTO "ProductionStep" (id,"contentItemId","brandId",step,"dueAt","automationKey","updatedAt") VALUES ('flow-cross','upgrade-video','flow-other','EDICION',now(),'upgrade-video:EDICION',now())`),/ProductionStep_contentItemId_brandId_fkey/);
  assert.throws(()=>sql(source,`INSERT INTO "ProductionStep" (id,"contentItemId","brandId",step,"dueAt","automationKey","updatedAt") VALUES ('flow-key','upgrade-video','upgrade-brand','EDICION',now(),'otro-video:EDICION',now())`),/ProductionStep_automationKey_check/);
  assert.throws(()=>sql(source,`INSERT INTO "ProductionStep" (id,"contentItemId","brandId",step,"dueAt","automationKey","updatedAt") VALUES ('flow-twice','upgrade-video','upgrade-brand','EDICION',now(),'upgrade-video:GRABACION',now())`),/ProductionStep_automationKey_key/);
  assert.throws(()=>sql(source,`INSERT INTO "ProductionStep" (id,"contentItemId","brandId",step,"dueAt","automationKey","updatedAt") VALUES ('flow-step-kind','upgrade-video','upgrade-brand','MONTAJE',now(),'upgrade-video:MONTAJE',now())`),/ProductionStep_step_check/);
  assert.throws(()=>sql(source,`UPDATE "ProductionStep" SET status='HECHO' WHERE id='flow-step'`),/ProductionStep_done_check/);
  assert.throws(()=>sql(source,`UPDATE "ProductionStep" SET "materialUrl"='javascript:alert(1)' WHERE id='flow-step'`),/ProductionStep_materialUrl_check/);
  // Todavía estamos en el esquema anterior: seleccionar solo las columnas ya migradas.
  const flowStepBefore=await db.productionStep.findUniqueOrThrow({where:{id:'flow-step'},select:{updatedAt:true}});
  await db.productionStep.update({where:{id:'flow-step'},data:{status:'HECHO',doneAt:new Date(),materialUrl:'https://drive.example.test/material'},select:{id:true}});
  assert.ok((await db.productionStep.findUniqueOrThrow({where:{id:'flow-step'},select:{updatedAt:true}})).updatedAt>flowStepBefore.updatedAt,'Los pasos usan la revisión monótona');
  sql(source,`DELETE FROM "User" WHERE id='upgrade-member'`);
  assert.equal(await db.brandTeamMember.count(),0,'La función de la marca cae con la cuenta');
  assert.equal((await db.productionStep.findUniqueOrThrow({where:{id:'flow-step'},select:{assigneeId:true}})).assigneeId,null,'El paso conserva su historial sin responsable');
  sql(source,`DELETE FROM "Brand" WHERE id='flow-other'`);
  // Cadena de entregas: solo amplía los CHECK de ProductionStep (+GUION, +DEVUELTO) y añade un índice.
  const chainMigration=fs.readFileSync('prisma/migrations/20260930090000_production_chain/migration.sql');
  const chainStepInsert=(id,step,key)=>`INSERT INTO "ProductionStep" (id,"contentItemId","brandId",step,"dueAt","automationKey","updatedAt") VALUES ('${id}','upgrade-video','upgrade-brand','${step}',now(),'${key}',now())`;
  assert.throws(()=>sql(source,chainStepInsert('chain-early','GUION','upgrade-video:GUION')),/ProductionStep_step_check/,'Antes de migrar el código viejo nunca podría escribir GUION');
  const [chainStepBefore]=await db.$queryRaw`SELECT * FROM "ProductionStep" WHERE id='flow-step'`;
  const [chainVideoBefore]=await db.$queryRaw`SELECT * FROM "ContentItem" WHERE id='upgrade-video'`;
  const [chainColumns]=await db.$queryRaw`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public'`;
  const [chainTables]=await db.$queryRaw`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'`;
  sql(source,chainMigration);
  await db.$disconnect();
  assert.deepEqual((await db.$queryRaw`SELECT * FROM "ProductionStep" WHERE id='flow-step'`)[0],chainStepBefore,'Los pasos existentes no cambian');
  assert.deepEqual((await db.$queryRaw`SELECT * FROM "ContentItem" WHERE id='upgrade-video'`)[0],chainVideoBefore);
  assert.deepEqual((await db.$queryRaw`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public'`)[0],chainColumns,'Sin columnas nuevas');
  assert.deepEqual((await db.$queryRaw`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'`)[0],chainTables,'Sin tablas nuevas');
  assert.equal((await db.$queryRaw`SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname='public' AND indexname='ProductionStep_brandId_status_dueAt_idx'`)[0].n,1);
  sql(source,`${chainStepInsert('chain-guion','GUION','upgrade-video:GUION')}; UPDATE "ProductionStep" SET status='DEVUELTO' WHERE id='chain-guion';`);
  assert.equal((await db.productionStep.findUniqueOrThrow({where:{id:'chain-guion'},select:{status:true}})).status,'DEVUELTO');
  assert.throws(()=>sql(source,`UPDATE "ProductionStep" SET status='DEVUELTO', "doneAt"=now() WHERE id='chain-guion'`),/ProductionStep_done_check/,'DEVUELTO no lleva doneAt');
  assert.throws(()=>sql(source,chainStepInsert('chain-review','REVISION_GUION','upgrade-video:REVISION_GUION')),/ProductionStep_step_check/,'Las revisiones requieren su migración posterior');
  assert.throws(()=>sql(source,`UPDATE "ProductionStep" SET status='ARCHIVADO' WHERE id='chain-guion'`),/ProductionStep_status_check/);
  assert.throws(()=>sql(source,chainStepInsert('chain-twice','GUION','upgrade-video:GUION')),/ProductionStep_automationKey_key/,'Un paso GUION por video');
  sql(source,`DELETE FROM "ProductionStep" WHERE id='chain-guion'`);
  // Feed personal del calendario (constructor B4): si su migración ya está en la rama, también se ensaya.
  const feedPath='prisma/migrations/20260930091000_calendar_feed_user/migration.sql';
  const feedRehearsed=fs.existsSync(feedPath);
  if(feedRehearsed){
    const feedInsert=(id,brand)=>`INSERT INTO "CalendarSubscription" (id,label,"tokenHash",scope,"brandId","createdById","expiresAt","updatedAt") VALUES ('${id}','Mi calendario','${id.padEnd(64,'0').replace(/[^0-9a-f]/g,'0')}','USER',${brand},'upgrade-owner',now()+interval '30 days',now())`;
    assert.throws(()=>sql(source,feedInsert('feed-early','NULL')),/CalendarSubscription_scope_check/);
    // Los enlaces del Dueño que ya existen (ALL y BRAND) no cambian, y no aparecen columnas ni tablas.
    const ownerInsert=(id,scope,brand)=>`INSERT INTO "CalendarSubscription" (id,label,"tokenHash",scope,"brandId","createdById","expiresAt","updatedAt") VALUES ('${id}','Enlace del Dueño','${id.padEnd(64,'0').replace(/[^0-9a-f]/g,'0')}','${scope}',${brand},'upgrade-owner',now()+interval '30 days',now())`;
    sql(source,`${ownerInsert('feed-all','ALL','NULL')}; ${ownerInsert('feed-bb','BRAND',"'upgrade-brand'")};`);
    const feedBefore=await db.$queryRaw`SELECT * FROM "CalendarSubscription" ORDER BY id`;
    const [feedColumns]=await db.$queryRaw`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public'`;
    sql(source,fs.readFileSync(feedPath));
    await db.$disconnect();
    assert.deepEqual(await db.$queryRaw`SELECT * FROM "CalendarSubscription" ORDER BY id`,feedBefore,'Los enlaces existentes no cambian');
    assert.deepEqual((await db.$queryRaw`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public'`)[0],feedColumns,'Sin columnas nuevas');
    sql(source,feedInsert('feed-user','NULL'));
    assert.throws(()=>sql(source,feedInsert('feed-brand',"'upgrade-brand'")),/CalendarSubscription_scope_check/,'USER nunca lleva marca');
    assert.throws(()=>sql(source,ownerInsert('feed-ab','ALL',"'upgrade-brand'")),/CalendarSubscription_scope_check/,'ALL sigue sin marca');
    assert.throws(()=>sql(source,ownerInsert('feed-bn','BRAND','NULL')),/CalendarSubscription_scope_check/,'BRAND sigue exigiendo marca');
    assert.throws(()=>sql(source,ownerInsert('feed-0ther','OTRO','NULL')),/CalendarSubscription_scope_check/);
    sql(source,`DELETE FROM "CalendarSubscription" WHERE id IN ('feed-user','feed-all','feed-bb')`);
  }
  // Las revisiones humanas y el estado explícito de tareas también deben poder restaurarse.
  sql(source,`INSERT INTO "TaskColumn" (id,name,"order","updatedAt") VALUES ('review-column','Listo',999,now());
    INSERT INTO "Task" (id,title,"columnId","updatedAt") VALUES ('review-linked','Con paso','review-column',now()),('review-loose','Sin paso','review-column',now());
    UPDATE "ProductionStep" SET "taskId"='review-linked' WHERE id='flow-step';`);
  const [reviewVideoBefore]=await db.$queryRaw`SELECT * FROM "ContentItem" WHERE id='upgrade-video'`;
  sql(source,fs.readFileSync('prisma/migrations/20261004090000_human_reviews_task_completion/migration.sql'));
  await db.$disconnect();
  const completed=await db.task.findUniqueOrThrow({where:{id:'review-linked'}});
  assert.equal(completed.status,'HECHO');assert.ok(completed.completedAt);assert.equal(completed.completedById,null);
  assert.equal((await db.task.findUniqueOrThrow({where:{id:'review-loose'}})).status,'PENDIENTE','La columna no demuestra finalización');
  assert.deepEqual((await db.$queryRaw`SELECT * FROM "ContentItem" WHERE id='upgrade-video'`)[0],reviewVideoBefore);
  sql(source,`${chainStepInsert('review-script','REVISION_GUION','upgrade-video:REVISION_GUION')}; ${chainStepInsert('review-final','REVISION_FINAL','upgrade-video:REVISION_FINAL')};`);
  const review=await db.productionStep.findUniqueOrThrow({where:{id:'review-final'}});
  assert.equal(review.materialVersion,0);assert.equal(review.reviewToken,null);
  assert.throws(()=>sql(source,`UPDATE "Task" SET status='HECHO' WHERE id='review-loose'`),/Task_completion_check/);
  const original=await snapshot(db), originalSchema=await db.$queryRawUnsafe(fs.readFileSync('prisma/operations/schema-fingerprint.sql','utf8'));
  const dump=pg('pg_dump',['-d',source,'--format=custom','--no-owner','--no-acl']);
  pg('pg_restore',['-d',target,'--no-owner','--no-acl','--exit-on-error'],dump);
  const sourceDefinitions=await schemaDefinitions(db), targetDefinitions=await schemaDefinitions(restored);
  const schemaDiff=sourceDefinitions.flatMap(row=>{const other=targetDefinitions.find(item=>item.key===row.key);return other?.value===row.value?[]:[{key:row.key,source:row.value,restored:other?.value}];});
  fs.writeFileSync('.audit/migration-schema-diff.json',JSON.stringify(schemaDiff,null,2));
  assert.deepEqual(await snapshot(restored),original);assert.deepEqual(await restored.$queryRawUnsafe(fs.readFileSync('prisma/operations/schema-fingerprint.sql','utf8')),originalSchema);
  const report={checkedAt:new Date().toISOString(),environment:'local-fixture',baselineMatchesNeon:true,invalidPreflightRolledBack:true,decimalPreflightRolledBack:true,exactMoneyPreserved:true,legacyValuesPreserved:true,noImplicitProfileGrants:true,profileGrantsRevokeSessions:true,prioritiesOrphanPreflightRolledBack:true,prioritiesInvalidJsonRolledBack:true,plannedStructureBackfillPreservesData:true,referencedStructuresProtected:true,workflowPreflightRolledBack:true,legacyApprovalsPreservedWithoutInventedVersion:true,completionManualObjectivesPreserved:true,completionLegacyMatchingPreservedReadOnly:true,completionDefaultsSafe:true,completionIndexDriftRolledBack:true,legacyGlobalCalendarRevoked:true,secretMigrationRollbackOnMissingKey:true,secretsMigratedEncrypted:true,masterKeyRotationVerified:true,catalogExistingRowsPreserved:true,catalogSameBrandEnforced:true,productionFlowExistingRowsPreserved:true,productionFlowNoNewColumnsOnExistingTables:true,productionFlowSameBrandEnforced:true,productionChainChecksWidenedOnly:true,productionChainExistingRowsPreserved:true,calendarFeedUserRehearsed:feedRehearsed,restoreRowsAndSchemaMatch:true,tables:Object.keys(original).length,backupBytes:dump.length};
  fs.writeFileSync('.audit/migration-rehearsal.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
} finally {
  for(const db of clients)await db.$disconnect();
  for(const name of created)await admin.$executeRawUnsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin.$disconnect();
}
