import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, randomBytes } from 'node:crypto';
import { load } from './load-module.mjs';

test('B22: AES-GCM autentica nombre/versión; nonce aleatorio y rotación sin AUTH_SECRET',()=>{
  const before={keys:process.env.APP_SECRETS_KEYS,active:process.env.APP_SECRETS_ACTIVE_KEY};
  try {
    const keys={v1:randomBytes(32).toString('base64'),v2:randomBytes(32).toString('base64')};
    process.env.APP_SECRETS_KEYS=JSON.stringify(keys);process.env.APP_SECRETS_ACTIVE_KEY='v1';
    const crypto=load('src/lib/secret-crypto.ts');
    const name='ai.google.apiKey',secret='fixture-confidential-key';
    const one=crypto.encryptSecret(name,secret),two=crypto.encryptSecret(name,secret);
    assert.notEqual(one.value,two.value);assert.ok(!one.value.includes(secret));assert.equal(crypto.decryptSecret(name,one),secret);
    assert.throws(()=>crypto.decryptSecret('ai.anthropic.apiKey',one),/almacén cifrado/);
    assert.throws(()=>crypto.decryptSecret(name,{...one,keyId:'v2'}),/almacén cifrado/);
    const parts=one.value.split(':');parts[2]=(parts[2][0]==='A'?'B':'A')+parts[2].slice(1);
    assert.throws(()=>crypto.decryptSecret(name,{...one,value:parts.join(':')}),/almacén cifrado/);
    process.env.APP_SECRETS_ACTIVE_KEY='v2';assert.equal(crypto.decryptSecret(name,one),secret);
    const rotated=crypto.encryptSecret(name,secret);assert.equal(rotated.keyId,'v2');
    process.env.APP_SECRETS_KEYS=JSON.stringify({v2:keys.v2});
    assert.equal(crypto.decryptSecret(name,rotated),secret);assert.throws(()=>crypto.decryptSecret(name,one),/almacén cifrado/);
    process.env.APP_SECRETS_KEYS='invalid secret JSON';
    assert.throws(()=>crypto.encryptSecret(name,secret),error=>!error.message.includes(secret)&&!error.message.includes('JSON'));
  } finally { for(const [key,value] of [['APP_SECRETS_KEYS',before.keys],['APP_SECRETS_ACTIVE_KEY',before.active]]) {if(value===undefined)delete process.env[key];else process.env[key]=value;} }
});

test('B22: ajustes ordinarios no leen/escriben claves y un error de cifrado no cae al entorno',async()=>{
  const mocks={'@/lib/prisma':{prisma:new Proxy({},{get:()=>assert.fail('No debe consultar DB')})},'@/lib/secrets':{readSecret:async()=>{throw Error('almacén cifrado');}}};
  const settings=load('src/lib/settings.ts',mocks);
  await assert.rejects(settings.getSettings(['org.name','ai.google.apiKey']),/secretos/);
  await assert.rejects(settings.getSetting('calendar.feedToken'),/secretos/);
  await assert.rejects(settings.setSetting('auth.google.clientSecret','fixture'),/secretos/);
  const previous=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='environment-fallback';
  try {await assert.rejects(settings.resolveApiKey('google'),/almacén cifrado/);}finally{if(previous===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=previous;}
});

/* Feed personal (scope USER, CALENDAR_FEED_PERSONAL): la persona y sus marcas se leen en cada descarga. */
const ENV_KEYS=['CALENDAR_FEED_PERSONAL','PRODUCTION_FLOW_ENABLED','PRODUCTION_CHAIN_ENABLED','PRODUCTION_CHAIN_BRANDS','CALENDARIO_PASOS'];
async function withEnv(values,work){
  const before=Object.fromEntries(ENV_KEYS.map(key=>[key,process.env[key]]));
  try{for(const key of ENV_KEYS){if(values[key]===undefined)delete process.env[key];else process.env[key]=values[key];}return await work();}
  finally{for(const [key,value] of Object.entries(before)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
}
const DAY=86400000,now=Date.now();
function feedFixture(){
  const token=randomBytes(32).toString('base64url'),hash=createHash('sha256').update(token).digest('hex');
  const state={calls:[],subs:new Map(),
    videos:[{id:'v1',title:'Receta',scheduledDate:new Date(now+2*DAY),shootDate:new Date(now-DAY),updatedAt:new Date(now),brand:{name:'Marca A'}}],
    events:[{id:'e1',title:'Reunión de marca',startAt:new Date(now+DAY),endAt:null,allDay:false,updatedAt:new Date(now)}],
    steps:[{id:'s1',step:'EDICION',dueAt:new Date(now+DAY),updatedAt:new Date(now),contentItem:{title:'Receta',brand:{name:'Marca A'}}},
      {id:'s2',step:'DISENO',dueAt:new Date(now+3*DAY),updatedAt:new Date(now),contentItem:{title:'Portada',brand:{name:'Marca A'}}}],
    covering:[{contentItemId:'v1',step:'GRABACION',status:'HECHO'}]};
  const person={id:'ana',active:true,role:'MEMBER',workProfiles:[{profile:'EDITOR'}],brandAccess:[{brandId:'A'}]};
  state.subs.set(hash,{id:'sub-ana',scope:'USER',brandId:null,expiresAt:new Date(now+30*DAY),revokedAt:null,createdBy:person,brand:null});
  const prisma={
    calendarSubscription:{findUnique:async({where})=>state.subs.get(where.tokenHash)??null},
    contentItem:{findMany:async args=>(state.calls.push(['video',args]),state.videos)},
    calendarEvent:{findMany:async args=>(state.calls.push(['event',args]),state.events)},
    productionStep:{findMany:async args=>(state.calls.push(['step',args]),args.where.AND[1].status==='PENDIENTE'?state.steps:state.covering)},
  };
  const route=load('src/app/api/calendario.ics/route.ts',{'@/lib/prisma':{prisma}});
  const get=()=>route.GET(new Request('https://fixture.test/api/calendario.ics?token='+token));
  return {state,person,row:state.subs.get(hash),get};
}
const CHAIN={CALENDAR_FEED_PERSONAL:'true',PRODUCTION_FLOW_ENABLED:'true',PRODUCTION_CHAIN_ENABLED:'true'};

test('feed personal apagado: un enlace USER no resuelve ni consulta nada más',async()=>withEnv({PRODUCTION_FLOW_ENABLED:'true',PRODUCTION_CHAIN_ENABLED:'true'},async()=>{
  const {state,get}=feedFixture();
  const response=await get();assert.equal(response.status,401);assert.match(response.headers.get('cache-control'),/no-store/);
  assert.equal(state.calls.length,0);
}));

test('feed personal: sus pasos, sus videos sin duplicar Grabar/Publicar y la agenda de su alcance',async()=>withEnv(CHAIN,async()=>{
  const {state,get}=feedFixture();
  const response=await get();assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/private, no-store/);
  const body=(await response.text()).replace(/\r\n /g,'');
  assert.match(body,/X-WR-CALNAME:ALSOS · Mi trabajo/);
  assert.match(body,/SUMMARY:Editar · Marca A: Receta/);
  assert.match(body,/SUMMARY:Diseño · Marca A: Portada/);
  assert.match(body,/SUMMARY:Publicar · Marca A: Receta/,'la publicación no es suya: queda la fecha del video');
  assert.doesNotMatch(body,/Grabar · Marca A: Receta/,'su grabación hecha cubre la fecha del video');
  assert.match(body,/SUMMARY:Reunión de marca/);
  assert.doesNotMatch(body,/DESCRIPTION:|LOCATION:|URL:/);
  const events=body.split('BEGIN:VEVENT').slice(1);
  const edit=events.find(e=>e.includes('Editar ·')),design=events.find(e=>e.includes('Diseño ·'));
  assert.match(edit,/DTSTART;VALUE=DATE:/,'los pasos son de todo el día');
  assert.match(design,/DTSTART:\d{8}T\d{6}Z/,'salvo el diseño, que vence a una hora');
  // Todo se consulta con la persona de esta descarga y sus alcances de la app.
  const [,steps]=state.calls.find(([kind,args])=>kind==='step'&&args.where.AND[1].status==='PENDIENTE');
  const mine=steps.where.AND[0].AND;
  assert.deepEqual(mine[0].brandId,{in:['A']});assert.equal(mine[2].assigneeId,'ana');
  assert.deepEqual(mine[2].contentItem,{status:{notIn:['CANCELADO','PAUSADO']},brand:{active:true}});
  const [,videos]=state.calls.find(([kind])=>kind==='video');
  assert.deepEqual(videos.where.AND[0].brandId,{in:['A']});assert.deepEqual(videos.where.AND[2].assignments,{some:{userId:'ana'}});
  const [,covering]=state.calls.find(([kind,args])=>kind==='step'&&args.where.AND[1].contentItemId);
  assert.deepEqual(covering.where.AND[0],steps.where.AND[0],'solo sus pasos cubren fechas del video');
  assert.deepEqual(covering.where.AND[1].contentItemId,{in:['v1']});
}));

test('feed personal: perder una marca o la cuenta se aplica en la siguiente descarga',async()=>withEnv(CHAIN,async()=>{
  const {state,person,row,get}=feedFixture();
  person.brandAccess=[];
  assert.equal((await get()).status,200);
  const [,steps]=state.calls.find(([kind])=>kind==='step');assert.deepEqual(steps.where.AND[0].AND[0].brandId,{in:[]});
  person.active=false;assert.equal((await get()).status,401);person.active=true;
  row.brandId='A';assert.equal((await get()).status,401,'un feed personal nunca lleva marca');row.brandId=null;
  person.role='GUEST';assert.equal((await get()).status,401);person.role='MEMBER';
  row.revokedAt=new Date();assert.equal((await get()).status,401);row.revokedAt=null;
  row.expiresAt=new Date(now-1000);assert.equal((await get()).status,401);
}));

test('feed personal sin cadena: fechas de sus videos y agenda, sin pasos',async()=>withEnv({CALENDAR_FEED_PERSONAL:'true'},async()=>{
  const {state,get}=feedFixture();
  const body=(await (await get()).text()).replace(/\r\n /g,'');
  assert.match(body,/Grabar · Marca A: Receta/);assert.match(body,/Publicar · Marca A: Receta/);assert.doesNotMatch(body,/Editar ·|Diseño ·/);
  assert.equal(state.calls.filter(([kind])=>kind==='step').length,0);
}));

test('los enlaces del Dueño no cambian: exigen Dueño y nunca llevan pasos ni personas',async()=>withEnv(CHAIN,async()=>{
  const {state,person,row,get}=feedFixture();
  row.scope='ALL';
  assert.equal((await get()).status,401,'un miembro nunca emite un enlace global');
  person.role='OWNER';
  const body=(await (await get()).text()).replace(/\r\n /g,'');
  assert.match(body,/X-WR-CALNAME:ALSOS · Agenda completa/);assert.match(body,/Grabar · Marca A: Receta/);assert.match(body,/Publicar · Marca A: Receta/);
  assert.equal(state.calls.filter(([kind])=>kind==='step').length,0);
  const [,videos]=state.calls.find(([kind])=>kind==='video');assert.equal(videos.where.assignments,undefined);
}));

test('B22: formato ICS escapa CR, LF y pliega Unicode sin inyectar propiedades',()=>{
  const {buildIcs}=load('src/lib/ical.ts');
  const ics=buildIcs('Calendario', [{uid:'fixture@intia',title:'Título\rATTENDEE:intruso\n'+'ñ😀'.repeat(60),start:new Date('2026-09-24T12:00:00Z'),allDay:true}]);
  assert.ok(!ics.includes('\rATTENDEE:'));assert.ok(!ics.includes('\r\nATTENDEE:'));
  assert.ok(ics.includes('\\nATTENDEE:'));
  for(const line of ics.split('\r\n'))assert.ok(Buffer.byteLength(line)<=75);
  assert.equal(ics.split('BEGIN:VEVENT').length,2);
});
