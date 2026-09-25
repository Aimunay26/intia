import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const source=process.env.DEPLOYMENT_TEST_DATABASE_URL;
if(!source||!['localhost','127.0.0.1'].includes(new URL(source).hostname)||!new URL(source).pathname.endsWith('_test'))throw new Error('Se requiere una DB efímera local.');
const connection=name=>{const url=new URL(source);url.searchParams.set('application_name',name);return url.href;};
const operatorUrl=connection('intia-migrator-20260909');
const operator=new PrismaClient({datasourceUrl:operatorUrl}), legacy=new PrismaClient({datasourceUrl:source}), previous=new PrismaClient({datasourceUrl:connection('intia-schema-20260909')}), current=new PrismaClient({datasourceUrl:connection('intia-profiles-20260910')}), workflow=new PrismaClient({datasourceUrl:connection('intia-workflow-20260917')});
const secrets=new PrismaClient({datasourceUrl:connection('intia-secrets-20260925')});
const completion=new PrismaClient({datasourceUrl:connection('intia-completion-20260924')});
const install=()=>{const result=spawnSync(process.execPath,['node_modules/prisma/build/index.js','db','execute','--file','prisma/operations/deployment-gate.sql','--schema','prisma/schema.prisma'],{env:{...process.env,DATABASE_URL:operatorUrl},encoding:'utf8'});assert.equal(result.status,0,result.stderr);};
test('control de versiones y mantenimiento con conexiones reales',async t=>{
  try{
    await operator.brand.create({data:{id:'gate-brand',name:'Fixture',slug:'gate-brand'}});
    // Sesión antigua conectada antes de instalar la guarda.
    assert.equal(await legacy.brand.count(),1);
    await operator.user.create({data:{id:'gate-owner',name:'Owner',email:'gate@fixture.test',role:'OWNER',passwordHash:'fixture'}});
    await operator.authSession.create({data:{id:'pre-profile-session',userId:'gate-owner',expiresAt:new Date(Date.now()+60000)}});
    install();
    const activated=spawnSync(process.execPath,['node_modules/prisma/build/index.js','db','execute','--file','prisma/operations/activate-team-profiles.sql','--schema','prisma/schema.prisma'],{env:{...process.env,DATABASE_URL:operatorUrl},encoding:'utf8'});assert.equal(activated.status,0,activated.stderr);
    await t.test('el modo cerrado permite lecturas y bloquea escrituras de ambas versiones',async()=>{
      assert.equal(await operator.authSession.count(),0,'La activación revoca las sesiones anteriores');
      for(const db of [legacy,previous,current]){
        assert.equal(await db.brand.count(),1);
        await assert.rejects(db.brand.update({where:{id:'gate-brand'},data:{name:'No guardar'}}),/Actualización del sistema/);
        await assert.rejects(db.$executeRawUnsafe('TRUNCATE "AuditLog"'),/Actualización del sistema/);
        await assert.rejects(db.userWorkProfile.create({data:{userId:'gate-owner',profile:'WRITER'}}),/Actualización del sistema/);
        await assert.rejects(db.userBrandAccess.create({data:{userId:'gate-owner',brandId:'gate-brand'}}),/Actualización del sistema/);
      }
    });
    await t.test('el operador puede migrar cerrado; reinstalar no reabre las escrituras',async()=>{
      await operator.brand.update({where:{id:'gate-brand'},data:{name:'Migración'}});
      install();
      assert.equal((await operator.$queryRaw`SELECT blocked FROM intia_ops.deployment_gate`)[0].blocked,true);
    });
    await t.test('abrir acepta la versión nueva y rechaza escrituras desde conexiones antiguas',async()=>{
      await operator.$executeRaw`UPDATE intia_ops.deployment_gate SET blocked=false WHERE singleton`;
      await current.brand.update({where:{id:'gate-brand'},data:{name:'Nuevo'}});
      for(const db of [legacy,previous]){
        await assert.rejects(db.brand.update({where:{id:'gate-brand'},data:{name:'Viejo'}}),/versión del sistema/);
        await assert.rejects(db.brand.create({data:{name:'Viejo',slug:'old'}}),/versión del sistema/);
        await assert.rejects(db.brand.delete({where:{id:'gate-brand'}}),/versión del sistema/);
      }
      assert.equal((await operator.brand.findUniqueOrThrow({where:{id:'gate-brand'}})).name,'Nuevo');
    });
    await t.test('cerrar espera a la transacción que ya estaba escribiendo',async()=>{
      let wrote,release;const started=new Promise(r=>{wrote=r;});const hold=new Promise(r=>{release=r;});
      const writing=current.$transaction(async tx=>{await tx.brand.update({where:{id:'gate-brand'},data:{name:'Última'}});wrote();await hold;});
      await started;
      try{
        await assert.rejects(operator.$transaction(async tx=>{await tx.$executeRawUnsafe("SET LOCAL lock_timeout='100ms'");await tx.$executeRaw`UPDATE intia_ops.deployment_gate SET blocked=true WHERE singleton`;}),/lock timeout/);
      }finally{release();await writing;}
      await operator.$executeRaw`UPDATE intia_ops.deployment_gate SET blocked=true WHERE singleton`;
      await assert.rejects(current.brand.update({where:{id:'gate-brand'},data:{name:'Posterior'}}),/Actualización del sistema/);
      assert.equal((await operator.brand.findUniqueOrThrow({where:{id:'gate-brand'}})).name,'Última');
    });
    await t.test('B07–B10 rechaza clientes anteriores y conserva las sesiones al activar',async()=>{
      await operator.authSession.create({data:{id:'workflow-session',userId:'gate-owner',expiresAt:new Date(Date.now()+60000)}});
      const activate=()=>spawnSync(process.execPath,['node_modules/prisma/build/index.js','db','execute','--file','prisma/operations/activate-workflow-consistency.sql','--schema','prisma/schema.prisma'],{env:{...process.env,DATABASE_URL:operatorUrl},encoding:'utf8'});
      await operator.$executeRaw`UPDATE intia_ops.deployment_gate SET blocked=false WHERE singleton`;
      assert.notEqual(activate().status,0,'Activar con escrituras abiertas debe fallar');
      await operator.$executeRaw`UPDATE intia_ops.deployment_gate SET blocked=true WHERE singleton`;
      const activated=activate();assert.equal(activated.status,0,activated.stderr);
      assert.equal((await operator.$queryRaw`SELECT blocked FROM intia_ops.deployment_gate`)[0].blocked,true);
      assert.equal(await operator.authSession.count({where:{id:'workflow-session'}}),1);
      await assert.rejects(workflow.brand.update({where:{id:'gate-brand'},data:{name:'Todavía cerrado'}}),/Actualización del sistema/);
      await operator.$executeRaw`UPDATE intia_ops.deployment_gate SET blocked=false WHERE singleton`;
      for(const db of [legacy,previous,current])await assert.rejects(db.brand.update({where:{id:'gate-brand'},data:{name:'Anterior'}}),/versión del sistema/);
      await workflow.brand.update({where:{id:'gate-brand'},data:{name:'Flujo nuevo'}});
      assert.equal((await operator.brand.findUniqueOrThrow({where:{id:'gate-brand'}})).name,'Flujo nuevo');
    });
    await t.test('B11–B20 protege importaciones nuevas y rechaza los escritores B07–B10',async()=>{
      const activate=()=>spawnSync(process.execPath,['node_modules/prisma/build/index.js','db','execute','--file','prisma/operations/activate-backend-completion.sql','--schema','prisma/schema.prisma'],{env:{...process.env,DATABASE_URL:operatorUrl},encoding:'utf8'});
      assert.notEqual(activate().status,0);
      await operator.$executeRaw`UPDATE intia_ops.deployment_gate SET blocked=true WHERE singleton`;
      install();const activated=activate();assert.equal(activated.status,0,activated.stderr);
      assert.equal(await operator.authSession.count({where:{id:'workflow-session'}}),1);
      const batch={userId:'gate-owner',requestKey:'fixture',fingerprint:'fixture',rows:[],issues:[],total:1};
      await assert.rejects(completion.metricImportBatch.create({data:batch}),/Actualización del sistema/);
      await operator.$executeRaw`UPDATE intia_ops.deployment_gate SET blocked=false WHERE singleton`;
      await assert.rejects(workflow.brand.update({where:{id:'gate-brand'},data:{name:'Anterior'}}),/versión del sistema/);
      await assert.rejects(workflow.metricImportBatch.create({data:batch}),/versión del sistema/);
      await completion.metricImportBatch.create({data:batch});
      assert.equal(await completion.metricImportBatch.count(),1);
    });
    await t.test('B22 exige secretos migrados y protege ambas tablas nuevas',async()=>{
      const activate=()=>spawnSync(process.execPath,['node_modules/prisma/build/index.js','db','execute','--file','prisma/operations/activate-secrets-calendar.sql','--schema','prisma/schema.prisma'],{env:{...process.env,DATABASE_URL:operatorUrl},encoding:'utf8'});
      assert.notEqual(activate().status,0);
      await operator.$executeRaw`UPDATE intia_ops.deployment_gate SET blocked=true WHERE singleton`;
      // Simulate a pre-migration row to exercise the activation preflight, in this disposable DB only.
      await operator.$executeRawUnsafe('ALTER TABLE "AppSetting" DISABLE TRIGGER "AppSetting_no_plaintext_secret"');
      await operator.appSetting.create({data:{key:'ai.google.apiKey',value:'legacy-fixture'}});
      await operator.$executeRawUnsafe('ALTER TABLE "AppSetting" ENABLE TRIGGER "AppSetting_no_plaintext_secret"');
      assert.notEqual(activate().status,0);
      await operator.appSetting.delete({where:{key:'ai.google.apiKey'}});
      install();assert.equal(activate().status,0);
      const subscription={label:'Fixture',scope:'BRAND',brandId:'gate-brand',createdById:'gate-owner',tokenHash:'a'.repeat(64),expiresAt:new Date(Date.now()+86400000)};
      await assert.rejects(secrets.calendarSubscription.create({data:subscription}),/Actualización del sistema/);
      await operator.$executeRaw`UPDATE intia_ops.deployment_gate SET blocked=false WHERE singleton`;
      await assert.rejects(completion.calendarSubscription.create({data:subscription}),/versión del sistema/);
      await assert.rejects(completion.appSecret.deleteMany(),/versión del sistema/);
      await secrets.calendarSubscription.create({data:subscription});
      assert.equal(await secrets.calendarSubscription.count(),1);
      assert.equal(await operator.authSession.count({where:{id:'workflow-session'}}),1);
    });
  }finally{await Promise.all([secrets.$disconnect(),completion.$disconnect(),operator.$disconnect(),legacy.$disconnect(),previous.$disconnect(),current.$disconnect(),workflow.$disconnect()]);}
});
