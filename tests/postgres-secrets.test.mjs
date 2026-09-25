import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { load } from './load-module.mjs';
const url=process.env.SECRETS_TEST_DATABASE_URL;
if(!url||!['localhost','127.0.0.1'].includes(new URL(url).hostname)||!new URL(url).pathname.endsWith('_test'))throw Error('Solo fixture local');
const db=new PrismaClient({datasourceUrl:url});
let actor;
const mocks={'@/lib/prisma':{prisma:db},'@/lib/auth':{requireUser:async()=>actor,requireLevel:async()=>actor,can:role=>role==='OWNER',LEVEL:{OWNER:2}},'next/cache':{revalidatePath(){}}};
const settings=load('src/lib/settings.ts',mocks),secrets=load('src/lib/secrets.ts',mocks),actions=load('src/app/actions/app-settings.ts',mocks),calendar=load('src/app/actions/calendar-feed.ts',mocks),feed=load('src/app/api/calendario.ics/route.ts',mocks);
const fd=values=>{const form=new FormData();for(const[k,v]of Object.entries(values))form.set(k,String(v));return form;};
const get=token=>feed.GET(new Request('https://fixture.test/api/calendario.ics?token='+token));
const form=async extra=>fd({expectedUpdatedAt:(await settings.getSettingsSnapshot(Object.values(settings.SETTING_KEYS))).revision,orgName:'Fixture',defaultProvider:'google',...extra});
test('B22: secretos cifrados y calendario con alcance persistido',async t=>{
  const before={keys:process.env.APP_SECRETS_KEYS,active:process.env.APP_SECRETS_ACTIVE_KEY};
  try {
    process.env.APP_SECRETS_KEYS=JSON.stringify({v1:randomBytes(32).toString('base64')});process.env.APP_SECRETS_ACTIVE_KEY='v1';
    actor=await db.user.create({data:{id:'owner',name:'Owner',email:'owner@secrets.test',role:'OWNER',passwordHash:'fixture'}});
    const owner=actor;const member=await db.user.create({data:{id:'member',name:'Member',email:'member@secrets.test',passwordHash:'fixture'}});
    await db.brand.createMany({data:['A','B'].map(id=>({id,name:'Marca '+id,slug:id}))});
    await t.test('secretos nunca aparecen en snapshot/auditoría; guardar, quitar y conflicto son atómicos',async()=>{
      const secret='b22-provider-key-fixture';const stale=await form({googleKey:'stale-fixture'});
      assert.ok((await actions.guardarAjustes(null,await form({googleKey:secret}))).ok);
      const encrypted=await db.appSecret.findUniqueOrThrow({where:{key:'ai.google.apiKey'}});assert.ok(!encrypted.value.includes(secret));
      assert.equal(await secrets.readSecret('ai.google.apiKey'),secret);assert.equal(await db.appSetting.count({where:{key:'ai.google.apiKey'}}),0);
      const snap=await settings.getSettingsSnapshot(Object.values(settings.SETTING_KEYS));assert.deepEqual(snap.secretKeys,['ai.google.apiKey']);assert.ok(!JSON.stringify(snap).includes(secret));assert.ok(!JSON.stringify(await db.auditLog.findMany()).includes(secret));
      await assert.rejects(actions.guardarAjustes(null,stale),/Otra persona/);
      assert.equal(await secrets.readSecret('ai.google.apiKey'),secret);
      delete process.env.APP_SECRETS_ACTIVE_KEY;
      const blocked=await actions.guardarAjustes(null,await form({googleKey:'new-key',orgName:'Must roll back'}));assert.match(blocked.error,/almacén cifrado/);assert.equal((await db.appSetting.findUniqueOrThrow({where:{key:'org.name'}})).value,'Fixture');
      process.env.APP_SECRETS_ACTIVE_KEY='v1';
      assert.ok((await actions.guardarAjustes(null,await form({quitarGoogleKey:'1'}))).ok);assert.equal(await secrets.readSecret('ai.google.apiKey'),null);
      await assert.rejects(db.appSetting.create({data:{key:'ai.google.apiKey',value:'plaintext-fixture'}}),/almacén cifrado/);
    });
    const now=new Date(),outside=new Date(Date.now()+800*86400000);
    await db.contentItem.createMany({data:[{id:'a',brandId:'A',title:'Autorizado A',scheduledDate:now,hook:'HOOK_SECRETO'},{id:'b',brandId:'B',title:'PRIVADO_B',scheduledDate:now},{id:'shoot',brandId:'A',title:'SOLO_GRABACION',scheduledDate:outside,shootDate:now}]});
    await db.calendarEvent.createMany({data:[{id:'eventA',brandId:'A',title:'Reunión A',startAt:now,description:'DESCRIPCION_SECRETA',location:'UBICACION_SECRETA'},{id:'eventB',brandId:'B',title:'EVENTO_B',startAt:now},{id:'general',title:'AGENDA_GENERAL',startAt:now}]});
    let token,id,revision;
    await t.test('enlace por marca no se amplía quitando/cambiando parámetros y minimiza campos',async()=>{
      const result=await calendar.gestionarSuscripcion(null,fd({operation:'create',label:'Marca A',scope:'BRAND',brandId:'A',days:90}));token=result.token;assert.ok(token);
      const row=await db.calendarSubscription.findFirstOrThrow();id=row.id;revision=row.updatedAt.toISOString();assert.notEqual(row.tokenHash,token);assert.ok(!JSON.stringify(row).includes(token));
      for(const suffix of ['', '&marca=B','&marca=','&scope=ALL']){
        const response=await get(token+suffix);assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/private, no-store/);assert.equal(response.headers.get('vercel-cdn-cache-control'),'no-store');
        const body=await response.text();assert.match(body,/Autorizado A/);assert.match(body,/Reunión A/);assert.match(body,/SOLO_GRABACION/);assert.doesNotMatch(body,/PRIVADO_B|EVENTO_B|AGENDA_GENERAL|HOOK_SECRETO|DESCRIPCION_SECRETA|UBICACION_SECRETA|URL:|DESCRIPTION:/);
        assert.equal((body.match(/SOLO_GRABACION/g)||[]).length,1);
      }
      assert.equal((await get(token+'&token='+token)).status,401);
      assert.ok(!JSON.stringify(await db.auditLog.findMany()).includes(token));
    });
    await t.test('rotación/revocación vencimiento y revocación de acceso del creador se aplican inmediatamente',async()=>{
      const rotated=await calendar.gestionarSuscripcion(null,fd({operation:'rotate',id,expectedUpdatedAt:revision,days:30}));assert.ok(rotated.token);assert.equal((await get(token)).status,401);token=rotated.token;
      const stale=await calendar.gestionarSuscripcion(null,fd({operation:'revoke',id,expectedUpdatedAt:revision}));assert.match(stale.error,/Otra persona/);
      await db.user.update({where:{id:owner.id},data:{active:false}});assert.equal((await get(token)).status,401);await db.user.update({where:{id:owner.id},data:{active:true}});actor=await db.user.findUniqueOrThrow({where:{id:owner.id}});
      await db.brand.update({where:{id:'A'},data:{active:false}});assert.equal((await get(token)).status,401);await db.brand.update({where:{id:'A'},data:{active:true}});
      await db.calendarSubscription.update({where:{id},data:{createdAt:new Date(Date.now()-86400000),expiresAt:new Date(Date.now()-1000)}});assert.equal((await get(token)).status,401);
      await db.calendarSubscription.update({where:{id},data:{expiresAt:new Date(Date.now()+86400000)}});
      revision=(await db.calendarSubscription.findUniqueOrThrow({where:{id}})).updatedAt.toISOString();assert.ok((await calendar.gestionarSuscripcion(null,fd({operation:'revoke',id,expectedUpdatedAt:revision}))).ok);
      const denied=await get(token);assert.equal(denied.status,401);assert.match(denied.headers.get('cache-control'),/no-store/);
    });
    await t.test('Dueño crea acceso global explícito; miembros/actores obsoletos no pueden emitir enlaces',async()=>{
      const result=await calendar.gestionarSuscripcion(null,fd({operation:'create',label:'Global',scope:'ALL',days:30}));const body=await (await get(result.token)).text();assert.match(body,/PRIVADO_B/);assert.match(body,/AGENDA_GENERAL/);
      actor=member;await assert.rejects(calendar.gestionarSuscripcion(null,fd({operation:'create',label:'Intruso',scope:'ALL'})),/acceso cambió/);
      actor={...owner,sessionVersion:999};await assert.rejects(calendar.gestionarSuscripcion(null,fd({operation:'create',label:'Obsoleto',scope:'ALL'})),/acceso cambió/);
    });
    await t.test('borrar marca elimina suscripciones sin convertirlas en globales',async()=>{
      actor=await db.user.findUniqueOrThrow({where:{id:owner.id}});
      const brand=await db.brand.create({data:{name:'Temporal',slug:'temp'}});const r=await calendar.gestionarSuscripcion(null,fd({operation:'create',label:'Temporal',scope:'BRAND',brandId:brand.id}));
      await db.brand.delete({where:{id:brand.id}});assert.equal((await get(r.token)).status,401);
    });
  } finally {
    await db.$disconnect();
    for(const[key,value]of [['APP_SECRETS_KEYS',before.keys],['APP_SECRETS_ACTIVE_KEY',before.active]]) {if(value===undefined)delete process.env[key];else process.env[key]=value;}
  }
});
