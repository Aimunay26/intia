import assert from "node:assert/strict";
import { test } from "node:test";
import { load } from "./load-module.mjs";
const policy=load('src/lib/permissions.ts');
const user=profiles=>({id:'me',role:'MEMBER',profiles,brandIds:['A']});
const expected={
  STRATEGY:['panel','manual','calendar','content','tasks','brands','scripts','structures','archetypes','metrics','profile','help'],
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
