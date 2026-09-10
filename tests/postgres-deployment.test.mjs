import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const source=process.env.DEPLOYMENT_TEST_DATABASE_URL;
if(!source||!['localhost','127.0.0.1'].includes(new URL(source).hostname)||!new URL(source).pathname.endsWith('_test'))throw new Error('Se requiere una DB efímera local.');
const connection=name=>{const url=new URL(source);url.searchParams.set('application_name',name);return url.href;};
const operatorUrl=connection('intia-migrator-20260909');
const operator=new PrismaClient({datasourceUrl:operatorUrl}), legacy=new PrismaClient({datasourceUrl:source}), previous=new PrismaClient({datasourceUrl:connection('intia-schema-20260909')}), current=new PrismaClient({datasourceUrl:connection('intia-profiles-20260910')});
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
  }finally{await Promise.all([operator.$disconnect(),legacy.$disconnect(),previous.$disconnect(),current.$disconnect()]);}
});
