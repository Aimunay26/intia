import assert from 'node:assert/strict';
import { test } from 'node:test';
import { load } from './load-module.mjs';
const { actorRecommendation, parseMinute, recordingInterval } = load('src/lib/casting.ts');
test('el ranking distingue criterio humano, perfil pedido y datos de ejemplo',()=>{
  const profile={id:'persona',name:'Laura',archetypePrimary:'Sabio',archetypeSecondary:null,strengths:'["Explicación"]',avoid:'["Gritos"]',fits:[{score:3,source:'SEED',notes:'inventado'}]};
  const seed=actorRecommendation(profile,{archetype:'Sabio'},null);
  assert.equal(seed.rank,2);assert.ok(seed.reasons.includes('Sin valoración humana del formato'));assert.ok(!seed.reasons.join(' ').includes('inventado'));
  const human=actorRecommendation({...profile,fits:[{score:3,source:'MANO',notes:'Buen tono didáctico'}]},{archetype:'Sábio'},'persona');
  assert.equal(human.rank,6);assert.match(human.reasons.join(' '),/Criterio humano.*Buen tono didáctico/);
  assert.equal(actorRecommendation(null,{archetype:''},null).rank,-1);
});
test('horarios válidos y zona Lima explícita; sin fecha no se promete disponibilidad',()=>{
  assert.equal(parseMinute('00:00'),0);assert.equal(parseMinute('23:59'),1439);
  for(const text of ['24:00','10:60','-1:30','1:30','']) assert.throws(()=>parseMinute(text));
  assert.equal(recordingInterval({shootDate:null,shootStartMinute:600,shootEndMinute:660}),null);
  const range=recordingInterval({shootDate:new Date('2026-11-01T12:00Z'),shootStartMinute:600,shootEndMinute:660});
  assert.equal(range.startAt.toISOString(),'2026-11-01T15:00:00.000Z');assert.equal(range.endAt.toISOString(),'2026-11-01T16:00:00.000Z');
});
