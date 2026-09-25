import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
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

test('B22: formato ICS escapa CR, LF y pliega Unicode sin inyectar propiedades',()=>{
  const {buildIcs}=load('src/lib/ical.ts');
  const ics=buildIcs('Calendario', [{uid:'fixture@intia',title:'Título\rATTENDEE:intruso\n'+'ñ😀'.repeat(60),start:new Date('2026-09-24T12:00:00Z'),allDay:true}]);
  assert.ok(!ics.includes('\rATTENDEE:'));assert.ok(!ics.includes('\r\nATTENDEE:'));
  assert.ok(ics.includes('\\nATTENDEE:'));
  for(const line of ics.split('\r\n'))assert.ok(Buffer.byteLength(line)<=75);
  assert.equal(ics.split('BEGIN:VEVENT').length,2);
});
