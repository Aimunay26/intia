import assert from "node:assert/strict";
import { test } from "node:test";
import { load } from "./load-module.mjs";
const policy=load('src/lib/permissions.ts');
const user=profiles=>({id:'me',role:'MEMBER',profiles,brandIds:['A']});
const expected={
  STRATEGY:['panel','manual','calendar','content','tasks','chain','brands','scripts','structures','archetypes','metrics','profile','help'],
  WRITER:['panel','manual','calendar','content','tasks','brands','generator','scripts','structures','archetypes','profile','help'],
  PRODUCTION:['panel','manual','calendar','content','tasks','scripts','profile','help'],
  CAMERA:['panel','manual','calendar','content','tasks','scripts','profile','help'],
  TALENT:['panel','manual','calendar','content','tasks','scripts','archetypes','profile','help'],
  EDITOR:['panel','manual','calendar','content','tasks','scripts','profile','help'],
  DESIGNER:['panel','manual','content','tasks','brands','structures','profile','help'],
  PUBLISHER:['panel','manual','calendar','content','tasks','brands','profile','help'],
  ANALYST:['panel','manual','content','tasks','brands','metrics','profile','help'],
};
for(const [profile,sections] of Object.entries(expected)) test(`perfil ${profile}: accesos predeterminados y administración denegada`,()=>{
  const actor=user([profile]);
  assert.deepEqual(Object.keys(policy.SECTIONS).filter(section=>policy.canAccessSection(actor,section)).sort(),sections.sort());
});
test('unión de perfiles no concede administración ni amplía permisos de otro perfil',()=>{
  const actor=user(['EDITOR','ANALYST']);
  assert.equal(policy.allows(actor,'metrics.write'),true);
  assert.equal(policy.allows(actor,'scripts.write'),false);
  assert.equal(policy.capabilityScope(actor,'content.editing'),'assigned');
  assert.equal(policy.allowsContentRecord(actor,'content.editing',{brandId:'A',assignments:[]}),false);
  assert.equal(policy.allowsContentRecord(actor,'content.editing',{brandId:'A',assignments:[{userId:'me'}]}),true);
  assert.equal(policy.allowsContentRecord(actor,'content.editing',{brandId:'B',assignments:[{userId:'me'}]}),false);
  for(const section of ['team','settings','activity'])assert.equal(policy.canAccessSection(user(Object.keys(expected)),section),false);
});
test('perfiles desconocidos no elevan acceso; rutas directas respetan límites de segmento',()=>{
  assert.equal(policy.canAccessPath(user(['WRITER']),'/guiones/known?edit=1'),true);
  assert.equal(policy.canAccessPath(user(['WRITER']),'/guiones-secretos'),false);
  assert.equal(policy.canAccessPath(user(['OWNER']),'/equipo'),false);
  assert.equal(policy.allows({id:'x',role:'ADMIN'},'home.view'),false);
  assert.deepEqual(Object.keys(policy.SECTIONS).filter(s=>policy.canAccessSection(user([]),s)),['panel','manual','profile','help']);
  assert.ok(Object.keys(policy.SECTIONS).every(s=>policy.canAccessSection({id:'owner',role:'OWNER'},s)));
});
test('manual de procedimientos: toda cuenta activa, rutas anidadas y límite de segmento',()=>{
  for(const actor of [user([]),user(['CAMERA']),{id:'owner',role:'OWNER'}]){
    assert.equal(policy.canAccessPath(actor,'/manual'),true);
    assert.equal(policy.canAccessPath(actor,'/manual/filmmaker/fm-p2?leccion=fm-p2-l1'),true);
  }
  assert.equal(policy.sectionForPath('/manual/actor'),'manual');
  assert.equal(policy.canAccessPath(user([]),'/manualx'),false);
  assert.equal(policy.canAccessPath({id:'x',role:'ADMIN'},'/manual'),false);
});
test('publicación requiere aprobación final incluso combinada con cámara',()=>{
  const actor=user(['PUBLISHER','CAMERA']);
  const video={brandId:'A',assignments:[],checklist:[]};
  assert.equal(policy.allowsContentRecord(actor,'content.view',video),false);
  assert.equal(policy.allowsContentRecord(actor,'assets.write',video),false);
  video.checklist.push({done:true,stage:'POSTPRODUCCION',label:'Revisión final aprobada',kind:'FINAL_APPROVAL'});
  assert.equal(policy.allowsContentRecord(actor,'content.view',video),true);
  assert.equal(policy.allowsContentRecord(actor,'content.shoot',video),false);
  assert.equal(policy.checklistCapability('POSTPRODUCCION','Revisión final aprobada','FINAL_APPROVAL'),'content.approve');
  assert.equal(policy.checklistCapability('POSTPRODUCCION','Miniatura lista'),'content.design');
});
test('cadena de entregas: solo ENCARGADO (STRATEGY) y Dueño; el diseñador ve su calendario asignado solo con la cadena',()=>{
  for(const profile of Object.keys(expected))assert.equal(policy.canAccessSection(user([profile]),'chain'),profile==='STRATEGY',profile);
  assert.equal(policy.canAccessSection(user(['PRODUCTION','EDITOR','CAMERA','PUBLISHER','WRITER','DESIGNER','TALENT','ANALYST']),'chain'),false);
  assert.equal(policy.canAccessPath(user(['STRATEGY']),'/cadena?paso=GRABACION&vencidos=1'),true);
  assert.equal(policy.canAccessPath(user(['PRODUCTION']),'/cadena'),false);
  assert.equal(policy.canAccessPath({id:'owner',role:'OWNER'},'/cadena'),true);
  assert.equal(policy.canAccessPath(user(['STRATEGY']),'/cadenas'),false);
  assert.equal(policy.sectionForPath('/cadena'),'chain');
  const designer=user(['DESIGNER']);
  // Sin la cadena (entorno de las pruebas): el diseñador sigue sin calendario, como siempre.
  assert.equal(policy.permissionFlags().designerCalendar,false);
  assert.equal(policy.allows(designer,'calendar.view'),false);
  assert.equal(policy.canAccessPath(designer,'/calendario'),false);
  // Con la cadena y CALENDARIO_PASOS (interruptor resuelto en el servidor y pasado al menú).
  const on={designerCalendar:true};
  assert.equal(policy.allows(designer,'calendar.view',on),true);
  assert.equal(policy.canAccessPath(designer,'/calendario',on),true);
  assert.equal(policy.capabilityScope(designer,'calendar.view',on),'assigned');
  assert.deepEqual(policy.profileGrants(designer,'calendar.view',on),[{id:'DESIGNER',scope:'assigned'}]);
  assert.equal(policy.allows(designer,'calendar.edit',on),false);
  const keys=['PRODUCTION_FLOW_ENABLED','PRODUCTION_CHAIN_ENABLED','CALENDARIO_PASOS'];const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  try{
    Object.assign(process.env,{PRODUCTION_FLOW_ENABLED:'true',PRODUCTION_CHAIN_ENABLED:'true'});delete process.env.CALENDARIO_PASOS;
    assert.equal(policy.allows(designer,'calendar.view'),true,'el servidor lee el interruptor en cada llamada');
    assert.equal(policy.allowsContentRecord(designer,'calendar.view',{brandId:'A',assignments:[]}),false);
    assert.equal(policy.allowsContentRecord(designer,'calendar.view',{brandId:'A',assignments:[{userId:'me'}]}),true);
    process.env.CALENDARIO_PASOS='false';
    assert.equal(policy.allows(designer,'calendar.view'),false,'CALENDARIO_PASOS=false lo apaga');
  }finally{for(const k of keys){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}}
});
