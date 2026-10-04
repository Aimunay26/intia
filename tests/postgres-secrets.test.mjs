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
      await assert.rejects(actions.guardarAjustes(null,stale),/Este registro cambió/);
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
      const stale=await calendar.gestionarSuscripcion(null,fd({operation:'revoke',id,expectedUpdatedAt:revision}));assert.match(stale.error,/Este registro cambió/);
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

/* Calendario personal (scope USER, CALENDAR_FEED_PERSONAL, migración 20260930091000_calendar_feed_user). */
test('Calendario personal: cada persona gestiona su enlace y el feed sigue sus pasos y marcas en cada descarga',async t=>{
  const keys=['CALENDAR_FEED_PERSONAL','PRODUCTION_FLOW_ENABLED','PRODUCTION_CHAIN_ENABLED','PRODUCTION_CHAIN_BRANDS','CALENDARIO_PASOS'];
  const before=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  try {
    Object.assign(process.env,{CALENDAR_FEED_PERSONAL:'true',PRODUCTION_FLOW_ENABLED:'true',PRODUCTION_CHAIN_ENABLED:'true'});delete process.env.PRODUCTION_CHAIN_BRANDS;delete process.env.CALENDARIO_PASOS;
    const owner=await db.user.findUniqueOrThrow({where:{id:'owner'}});
    const ana=await db.user.create({data:{id:'ana-feed',name:'Ana Editora',email:'ana@secrets.test',passwordHash:'fixture',workProfiles:{create:[{profile:'EDITOR'}]},brandAccess:{create:[{brandId:'A'},{brandId:'B'}]}}});
    const luis=await db.user.create({data:{id:'luis-feed',name:'Luis Cámara',email:'luis@secrets.test',passwordHash:'fixture',workProfiles:{create:[{profile:'CAMERA'}]},brandAccess:{create:[{brandId:'A'}]}}});
    // Cambiar perfiles o marcas sube sessionVersion (revoca sesiones): la sesión se relee de la base.
    const session=async(user,extra)=>({...await db.user.findUniqueOrThrow({where:{id:user.id}}),profiles:extra.profiles,brandIds:extra.brandIds});
    let current=await session(ana,{profiles:['EDITOR'],brandIds:['A','B']});
    const personal={...mocks,'@/lib/auth':{...mocks['@/lib/auth'],requirePermission:async()=>current,requireLevel:async()=>current}};
    const actions=load('src/app/actions/calendar-feed.ts',personal),subs=load('src/lib/calendar-subscriptions.ts',personal);
    const day=86400000,soon=new Date(Date.now()+day),later=new Date(Date.now()+2*day);
    await db.contentItem.createMany({data:[
      {id:'feed-a',brandId:'A',title:'EDITAR_A',scheduledDate:later,shootDate:new Date()},
      {id:'feed-b',brandId:'B',title:'EDITAR_B',scheduledDate:later},
      {id:'feed-otro',brandId:'A',title:'AJENO_LUIS',scheduledDate:later},
      {id:'feed-cancelado',brandId:'A',title:'CANCELADO_A',scheduledDate:later,status:'CANCELADO'},
    ]});
    await db.assignment.createMany({data:['feed-a','feed-b','feed-cancelado'].map(contentItemId=>({contentItemId,userId:ana.id,role:'EDITOR'}))});
    const step=(video,brandId,kind,assigneeId,extra={})=>({id:`${video}-${kind}`,contentItemId:video,brandId,step:kind,assigneeId,dueAt:soon,automationKey:`${video}:${kind}`,...extra});
    await db.productionStep.createMany({data:[
      step('feed-a','A','GRABACION',luis.id,{status:'HECHO',doneAt:new Date()}),
      step('feed-a','A','EDICION',ana.id),
      step('feed-b','B','EDICION',ana.id),
      step('feed-otro','A','EDICION',luis.id),
      step('feed-cancelado','A','EDICION',ana.id),
    ]});
    let token,row;
    const body=async value=>{const response=await get(value);return {status:response.status,text:response.status===200?(await response.text()).replace(/\r\n /g,''):''};};
    await t.test('crear: uno vigente por persona, token solo en la respuesta y fuera de la lista del Dueño',async()=>{
      const created=await actions.miCalendario(null,fd({operation:'create',days:30}));token=created.token;assert.ok(token,created.error);
      assert.match((await actions.miCalendario(null,fd({operation:'create',days:30}))).error,/Ya tienes un enlace activo/);
      row=await db.calendarSubscription.findFirstOrThrow({where:{scope:'USER'}});
      assert.equal(row.createdById,ana.id);assert.equal(row.brandId,null);assert.notEqual(row.tokenHash,token);
      assert.ok(!JSON.stringify(await db.auditLog.findMany()).includes(token));
      assert.ok(!(await subs.listCalendarSubscriptions()).some(item=>item.id===row.id),'Ajustes no lista feeds personales');
      assert.equal((await subs.personalCalendarSubscription(ana.id)).id,row.id);
    });
    await t.test('descarga: solo sus pasos pendientes, sus videos y marcas; lo ajeno y lo cancelado no salen',async()=>{
      const {status,text}=await body(token);assert.equal(status,200);
      assert.match(text,/SUMMARY:Editar · Marca A: EDITAR_A/);assert.match(text,/SUMMARY:Editar · Marca B: EDITAR_B/);
      assert.match(text,/Grabar · Marca A: EDITAR_A/,'la grabación hecha es de Luis: queda la fecha del video');
      assert.doesNotMatch(text,/AJENO_LUIS|CANCELADO_A|PRIVADO_B|Autorizado A|AGENDA_GENERAL|DESCRIPTION:|LOCATION:/);
      await db.userBrandAccess.delete({where:{userId_brandId:{userId:ana.id,brandId:'B'}}});
      const without=await body(token);assert.doesNotMatch(without.text,/EDITAR_B/,'perder la marca quita sus fechas en la siguiente descarga');assert.match(without.text,/EDITAR_A/);
      current=await session(ana,{profiles:['EDITOR'],brandIds:['A']});
    });
    await t.test('nadie más gestiona el enlace: ni otra persona ni el Dueño desde Ajustes',async()=>{
      const revision=row.updatedAt.toISOString();
      current=await session(luis,{profiles:['CAMERA'],brandIds:['A']});
      assert.match((await actions.miCalendario(null,fd({operation:'revoke',id:row.id,expectedUpdatedAt:revision}))).error,/no es tuyo/);
      current=owner;
      assert.match((await actions.gestionarSuscripcion(null,fd({operation:'rotate',id:row.id,expectedUpdatedAt:revision,days:30}))).error,/personal/);
      assert.equal((await db.calendarSubscription.findUniqueOrThrow({where:{id:row.id}})).createdById,ana.id);
      current=await session(ana,{profiles:['EDITOR'],brandIds:['A']});
    });
    await t.test('renovar invalida el anterior; revocar, apagar el interruptor o desactivar la cuenta cortan la descarga',async()=>{
      const rotated=await actions.miCalendario(null,fd({operation:'rotate',id:row.id,expectedUpdatedAt:row.updatedAt.toISOString(),days:90}));assert.ok(rotated.token,rotated.error);
      assert.equal((await get(token)).status,401);token=rotated.token;assert.equal((await get(token)).status,200);
      row=await db.calendarSubscription.findUniqueOrThrow({where:{id:row.id}});
      assert.ok((await actions.miCalendario(null,fd({operation:'revoke',id:row.id,expectedUpdatedAt:row.updatedAt.toISOString()}))).ok);
      assert.equal((await get(token)).status,401);assert.equal(await subs.personalCalendarSubscription(ana.id),null);
      const again=await actions.miCalendario(null,fd({operation:'create',days:30}));assert.ok(again.token,again.error);
      process.env.CALENDAR_FEED_PERSONAL='false';
      assert.equal((await get(again.token)).status,401,'apagado, ningún feed personal responde');
      assert.match((await actions.miCalendario(null,fd({operation:'create',days:30}))).error,/no está activado/);
      process.env.CALENDAR_FEED_PERSONAL='true';assert.equal((await get(again.token)).status,200);
      // El Dueño lo ve aparte en Ajustes y puede revocarlo (no renovarlo): no pasa a su nombre.
      current=owner;
      const listed=(await subs.listPersonalCalendarSubscriptions()).find(item=>item.person==='Ana Editora');assert.ok(listed,'Ajustes lista los calendarios personales aparte');
      assert.ok(!JSON.stringify(listed).includes(again.token));
      const againRow=await db.calendarSubscription.findUniqueOrThrow({where:{id:listed.id}});
      assert.ok((await actions.gestionarSuscripcion(null,fd({operation:'revoke',id:againRow.id,expectedUpdatedAt:againRow.updatedAt.toISOString()}))).ok);
      assert.equal((await get(again.token)).status,401);
      assert.equal((await db.calendarSubscription.findUniqueOrThrow({where:{id:againRow.id}})).createdById,ana.id,'revocar no lo pasa al Dueño');
      // Desactivar la cuenta revoca su enlace: al reactivarla, un token filtrado no vuelve a funcionar.
      current=await session(ana,{profiles:['EDITOR'],brandIds:['A']});
      const third=await actions.miCalendario(null,fd({operation:'create',days:30}));assert.ok(third.token,third.error);
      current=owner;
      const team=load('src/app/actions/team.ts',personal);
      assert.equal((await team.desactivarUsuario(null,fd({id:ana.id,active:'0'}))).ok,'Cuenta desactivada y sesiones revocadas.');
      assert.equal((await get(third.token)).status,401);
      await db.user.update({where:{id:ana.id},data:{active:true}});
      assert.equal((await get(third.token)).status,401,'reactivada, el enlace revocado no vuelve');
      assert.ok(await db.auditLog.count({where:{entity:'CalendarSubscription',summary:{contains:'Revocó el calendario personal de Ana Editora'}}}));
    });
  } finally {
    for(const [key,value] of Object.entries(before)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
    await db.$disconnect();
  }
});
