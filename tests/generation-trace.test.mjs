import assert from 'node:assert/strict';
import { test } from 'node:test';
import { load } from './load-module.mjs';
import { simulatedRequest } from './ai-fixture.mjs';

const jobA = 'caaaaaaaaaaaaaaaaaaaaaaaa', jobB = 'cbbbbbbbbbbbbbbbbbbbbbbbb';
async function capture(work) {
  const info = console.info, warn = console.warn, rows = [];
  console.info = console.warn = line => rows.push(JSON.parse(line));
  try { await work(rows); } finally { console.info = info; console.warn = warn; }
  return rows;
}

test('las trazas separan generaciones concurrentes, emparejan etapas y no cambian resultados', async () => {
  const trace = load('src/lib/generation-trace.ts');
  const rows = await capture(async () => {
    const results = await Promise.all([jobA, jobB].map((jobId, i) => trace.withGenerationTrace({ jobId }, () =>
      trace.generationStage('generate', async () => {
        await new Promise(resolve => setTimeout(resolve, i ? 1 : 5));
        return trace.generationStage('provider_request', () => i, { model: 'gemini-3.8-flash', attempt: i + 1 });
      }))));
    assert.deepEqual(results, [0, 1]);
  });
  assert.equal(new Set(rows.map(r => r.traceId)).size, 2);
  for (const jobId of [jobA, jobB]) {
    const job = rows.filter(r => r.jobId === jobId);
    assert.equal(job.length, 4);assert.equal(new Set(job.map(r => r.traceId)).size, 1);
    assert.deepEqual(job.map(r => [r.stage, r.state]), [['generate', 'start'], ['provider_request', 'start'], ['provider_request', 'success'], ['generate', 'success']]);
    assert.ok(job.filter(r => r.state === 'success').every(r => r.durationMs >= 0));
  }
});

test('los errores conservan identidad y sólo exponen metadatos permitidos', async () => {
  const trace = load('src/lib/generation-trace.ts');
  const secret = 'private-key-and-prompt';
  const original = Object.assign(new Error(`High demand ${secret}`), { status: 503, apiKey: secret, request: secret, stack: secret });
  const rows = await capture(async () => {
    await assert.rejects(trace.withGenerationTrace({ jobId: jobA, traceId: secret, apiKey: secret }, () =>
      trace.generationStage('provider_request', () => { throw original; }, { model: secret, provider: 'google', keySource: 'db', prompt: secret })), e => e === original);
  });
  assert.doesNotMatch(JSON.stringify(rows), /private-key-and-prompt/);
  assert.equal(rows[1].httpStatus, 503);assert.equal(rows[1].reason, 'provider_overloaded');
  assert.equal(rows[1].provider, 'google');assert.equal(rows[1].keySource, 'db');
  assert.equal(rows[1].stage, 'provider_request');assert.equal(rows[1].state, 'error');
});

test('fallos del logger y desactivación no interrumpen la generación', async () => {
  const trace = load('src/lib/generation-trace.ts'), info = console.info, warn = console.warn;
  const prior = process.env.GENERATION_LOGS;
  try {
    console.info = console.warn = () => { throw new Error('logger unavailable'); };
    assert.equal(await trace.generationStage('script_save', () => 'saved'), 'saved');
    process.env.GENERATION_LOGS = '0';
    const rows = await capture(async () => assert.equal(await trace.generationStage('quota', () => 7), 7));
    assert.equal(rows.length, 0);
  } finally { console.info = info;console.warn = warn;if (prior === undefined) delete process.env.GENERATION_LOGS;else process.env.GENERATION_LOGS = prior; }
});

test('el error envuelto conserva saturación y el cambio de modelo solo registra campos permitidos', async () => {
  const trace = load('src/lib/generation-trace.ts');
  const { toAiError } = load('src/lib/ai/providers.ts');
  const error = toAiError({ status: 503, message: 'high demand private-key' }, 'google');
  const rows = await capture(() => trace.withGenerationTrace({ jobId: jobA }, async () => {
    await assert.rejects(trace.generationStage('generate', () => { throw error; }), e => e === error);
    trace.generationEvent('model_fallback', 'info', { model: 'gemini-3.8-flash', nextModel: 'gemini-3.7-flash', reason: 'provider_overloaded', prompt: 'private-prompt' });
    trace.generationEvent('model_fallback', 'info', { nextModel: 'private-key' });
  }));
  assert.equal(rows[1].reason, 'provider_overloaded'); assert.equal(rows[1].httpStatus, 503);
  assert.equal(rows[2].nextModel, 'gemini-3.7-flash'); assert.equal(rows[3].nextModel, undefined);
  assert.doesNotMatch(JSON.stringify(rows), /private-/);
});

test('el SDK real identifica el 503 en provider_request sin llegar a parsear ni filtrar el pedido', async () => {
  const registry = new Map();
  const trace = load('src/lib/generation-trace.ts', {}, registry);
  const provider = load('src/lib/ai/providers.ts', {}, registry);
  const previousFetch = globalThis.fetch;let calls = 0;
  try {
    globalThis.fetch = async () => { calls++;return new Response(JSON.stringify({ error: { code: 503, message: 'This model is currently experiencing high demand. private-reference', status: 'UNAVAILABLE' } }), { status: 503, headers: { 'Content-Type': 'application/json' } }); };
    const rows = await capture(async () => assert.rejects(trace.withGenerationTrace({ jobId: jobA, attempt: 1 }, () => provider.generateWithGemini({ request: simulatedRequest, apiKey: 'private-key', model: 'gemini-3.8-flash', user: 'private-request', system: 'private-system' })), e => e.retryable));
    assert.equal(calls, 1);assert.equal(rows.filter(r => r.stage === 'provider_request' && r.state === 'error')[0].httpStatus, 503);
    assert.ok(rows.every(r => r.jobId === jobA));assert.equal(rows.filter(r => r.stage === 'response_parse').length, 0);
    assert.doesNotMatch(JSON.stringify(rows), /private-/);
  } finally { globalThis.fetch = previousFetch; }
});

test('JSON inválido y fin por límite de tokens se localizan después de recibir la respuesta', async () => {
  class GoogleGenAI { constructor() { this.models = { generateContent: async () => ({ text: 'private-invalid-json', candidates: [{ finishReason: 'MAX_TOKENS' }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 } }) }; } }
  const provider = load('src/lib/ai/providers.ts', { '@google/genai': { GoogleGenAI } });
  const rows = await capture(async () => assert.rejects(provider.generateWithGemini({ request: simulatedRequest, apiKey: 'private-key', model: 'gemini-3.8-flash', system: 'private-system', user: 'private-user' }), /formato esperado/));
  assert.ok(rows.some(r => r.stage === 'provider_request' && r.state === 'success'));
  assert.ok(rows.some(r => r.stage === 'provider_response' && r.finishReason === 'MAX_TOKENS'));
  assert.ok(rows.some(r => r.stage === 'response_parse' && r.state === 'error'));
  assert.doesNotMatch(JSON.stringify(rows), /private-/);
});

test('un fallo al cargar el contexto registra DB y no llama al proveedor', async () => {
  let calls = 0;
  const error = Object.assign(new Error('postgresql://private:password@host/db'), { code: 'P2024' });
  const engine = load('src/lib/ai/index.ts', { '@/lib/prisma': { prisma: { structure: { findUnique: async () => { throw error; } } } }, '@/lib/ai/providers': { AiError: class extends Error {}, generateWithGemini: async () => { calls++; } } });
  const rows = await capture(async () => assert.rejects(engine.generateScript({ structureId: 'fixture', request: 'private-request' }), e => e === error));
  assert.equal(calls, 0);assert.ok(rows.some(r => r.stage === 'context_load' && r.state === 'error' && r.databaseCode === 'P2024'));
  assert.doesNotMatch(JSON.stringify(rows), /private|password|postgresql/);
});
