import assert from 'node:assert/strict';
import { test } from 'node:test';
import { load } from './load-module.mjs';
import { validScript } from './ai-fixture.mjs';
const { validateGeneratedScript } = load('src/lib/ai/validate-script.ts');
const target = { durationSec: 5, beats: '[{"name":"Inicio"}]' };
test('B06: conserva salida válida y admite una escena de texto sin voz', () => {
  assert.deepEqual(validateGeneratedScript(validScript, target), validScript);
  const text = structuredClone(validScript); text.scenes[0].voiceType = 'TEXTO'; text.scenes[0].voice = ''; text.scenes[0].onScreenText = 'Texto visible';
  assert.equal(validateGeneratedScript(text, target).scenes[0].voice, '');
});
test('B06: configuración inválida de beats produce un error terminal legible', () => {
  for (const beats of ['{}', 'null', '[null]', '[{}]', 'not-json']) {
    assert.throws(() => validateGeneratedScript(validScript, { ...target, beats }), /estructura tiene beats inválidos/);
  }
});
for (const [name, mutate] of [
  ['10000 segundos', s => { s.scenes[0].endSec = 10000; s.totalSeconds = 10000; }],
  ['fuera de objetivo', s => { s.scenes[0].endSec = 30; s.totalSeconds = 30; }],
  ['sin voz', s => { s.scenes[0].voice = ''; }],
  ['sin acción', s => { s.scenes[0].action = ''; }],
  ['sin plano', s => { s.scenes[0].shot = ''; }],
  ['sin escenas', s => { s.scenes = []; }],
  ['hueco temporal', s => { s.scenes[0].startSec = 3; }],
  ['beat distinto', s => { s.scenes[0].beat = 'Otro'; }],
  ['campo excesivo', s => { s.scenes[0].voice = 'x'.repeat(12001); }],
]) test(`B06: rechaza ${name} sin contenido privado en el mensaje`, () => {
  const script = structuredClone(validScript); mutate(script);
  assert.throws(() => validateGeneratedScript(script, target), /necesita revisión/);
});
test('B03: cada petición usa el tiempo restante y no se envía ni registra tras vencer', async () => {
  let reservations = 0, now = 1000;
  const old = Date.now; Date.now = () => now;
  const { createAiRequest } = load('src/lib/ai/request-budget.ts', {
    '@/lib/prisma': { prisma: { $transaction: fn => fn({}) } }, '@/lib/auth-transactions': { assertActor: async () => {} },
    '@/lib/resource-limits': { usageDay: () => 'fixture', recordUsage: async () => { reservations++; } },
  });
  const before = process.env.AI_JOBS_ENABLED; process.env.AI_JOBS_ENABLED = 'true';
  try {
    const request = createAiRequest({ user: { id: 'fixture' }, deadlineAt: 251000 });
    await request(async o => { assert.equal(o.timeoutMs, 250000); now += 200000; });
    await request(async o => { assert.equal(o.timeoutMs, 50000); now += 50000; });
    assert.equal(reservations, 4); await assert.rejects(request(async () => assert.fail()), /tiempo total/); assert.equal(reservations, 4);
  } finally { Date.now = old; if (before === undefined) delete process.env.AI_JOBS_ENABLED; else process.env.AI_JOBS_ENABLED = before; }
});
