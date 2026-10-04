import assert from 'node:assert/strict';
import { test } from 'node:test';
import { load } from './load-module.mjs';

const policy = load('src/lib/work-assignees.ts');
const person = (profiles, extra={}) => ({id:'p', name:'Persona', role:'MEMBER', active:true,
  workProfiles:profiles.map(profile=>({profile})), brandAccess:[{brandId:'new'}], ...extra});
function db(row, archived=false) {
  return {
    brand:{findUnique:async()=>({archived})},
    user:{findFirst:async({where})=>row?.active && (!where.OR || row.role==='OWNER' || row.brandAccess.some(b=>b.brandId===where.OR[1].brandAccess.some.brandId))?row:null},
  };
}
test('no asignar tareas invisibles por falta de perfil, baja o marca ajena', async()=>{
  for(const row of [person([]), person(['CAMERA'],{active:false}), person(['CAMERA'],{brandAccess:[{brandId:'other'}]})]){
    assert.equal(await policy.findWorkAssignee(db(row),'p','new'),null);
    await assert.rejects(()=>policy.assertWorkAssignee(db(row),'p','new'),/consultar y realizar/);
  }
  assert.ok(await policy.findWorkAssignee(db(person(['CAMERA'])),'p','new'));
});
test('cada paso exige su propia capacidad aunque la cuenta pueda trabajar tareas', async()=>{
  const cases={GUION:'WRITER',GRABACION:'CAMERA',EDICION:'EDITOR',PUBLICACION:'PUBLISHER',DISENO:'DESIGNER'};
  for(const [step,profile] of Object.entries(cases)){
    const capabilities=policy.stepAssigneeCapabilities(step);
    assert.ok(await policy.findWorkAssignee(db(person([profile])),'p','new',capabilities),step);
    assert.equal(await policy.findWorkAssignee(db(person(['TALENT'])),'p','new',capabilities),null,step);
  }
});
test('marca archivada no recibe nuevas asignaciones, incluido Dueño', async()=>{
  const owner=person([],{role:'OWNER'});
  assert.equal(await policy.findWorkAssignee(db(owner,true),'p','new'),null);
  await assert.rejects(()=>policy.assertWorkAssignee(db(owner,true),'p','new'),/marca vigente/);
  assert.ok(await policy.findWorkAssignee(db(owner),'p','new',policy.stepAssigneeCapabilities('EDICION')));
});
test('el archivo total también impide tareas personales sin marcas vivas', async()=>{
  const before=process.env.ARCHIVO_TOTAL_DESDE;
  try{
    process.env.ARCHIVO_TOTAL_DESDE='2026-10-04';
    assert.equal(await policy.findWorkAssignee(db(person(['WRITER'],{brandAccess:[]})),'p',null),null);
    assert.ok(await policy.findWorkAssignee(db(person(['WRITER'])),'p',null));
  }finally{if(before===undefined)delete process.env.ARCHIVO_TOTAL_DESDE;else process.env.ARCHIVO_TOTAL_DESDE=before;}
});
test('los actores deben poder consultar guiones; coordinar exige asignar y aprobar', async()=>{
  assert.equal(await policy.findWorkAssignee(db(person(['DESIGNER'])),'p','new',policy.ASSIGNMENT_ROLE_CAPABILITIES.ACTOR),null);
  assert.ok(await policy.findWorkAssignee(db(person(['TALENT'])),'p','new',policy.ASSIGNMENT_ROLE_CAPABILITIES.ACTOR));
  assert.equal(await policy.findWorkAssignee(db(person(['PRODUCTION'])),'p','new',policy.TEAM_ROLE_CAPABILITIES.ENCARGADO),null);
  assert.ok(await policy.findWorkAssignee(db(person(['STRATEGY'])),'p','new',policy.TEAM_ROLE_CAPABILITIES.ENCARGADO));
});
