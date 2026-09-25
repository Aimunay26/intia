import assert from 'node:assert/strict';
import { test } from 'node:test';
import { load } from './load-module.mjs';
import { simulatedRequest } from './ai-fixture.mjs';

const { resolveAiModel, normalizeAiModel } = load('src/lib/ai-models.ts');

test('el descenso por saturación solo recorre los Flash aprobados y nunca sube de modelo', () => {
  const { nextOverloadModel } = load('src/lib/ai-models.ts');
  assert.equal(nextOverloadModel('google', 'gemini-3.8-flash'), 'gemini-3.7-flash');
  assert.equal(nextOverloadModel('google', 'gemini-3.7-flash'), 'gemini-3.6-flash');
  for (const model of ['gemini-3.6-flash', 'gemini-2.5-pro', 'unknown', 'claude-opus-5']) assert.equal(nextOverloadModel('google', model), undefined);
  assert.equal(nextOverloadModel('anthropic', 'claude-opus-5'), undefined);
  for (const model of ['gemini-3.7-flash', 'gemini-3.6-flash']) assert.equal(resolveAiModel('google', model), model);
});

test('el modelo alternativo y su origen sobreviven a reanudaciones sin alterar el diagnóstico anterior', () => {
  const { modelForRetry, planModelFallback, retryDiagnostics, readModelFallback } = load('src/lib/ai/model-fallback.ts');
  const original = { provider: 'google', model: 'gemini-3.8-flash', modelSource: 'settings', contextHash: 'fixture' };
  const planned = planModelFallback(original);
  assert.equal(original.modelFallback, undefined);
  assert.equal(modelForRetry('google', planned), 'gemini-3.7-flash');
  const retried = retryDiagnostics({ ...original, model: 'gemini-3.7-flash', modelSource: 'request' }, JSON.parse(JSON.stringify(planned)));
  assert.equal(retried.modelSource, 'fallback'); assert.equal(retried.modelFallback.originalSource, 'settings');
  const next = planModelFallback(retried);
  assert.deepEqual(next.modelFallback.models, ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash']);
  assert.equal(planModelFallback(retryDiagnostics({ ...original, model: 'gemini-3.6-flash' }, next)), undefined);
  assert.equal(modelForRetry('anthropic', next), undefined);
  assert.equal(readModelFallback({ ...next, modelFallback: { ...next.modelFallback, models: ['gemini-3.6-flash', 'gemini-3.8-flash'] } }), undefined);
  assert.equal(readModelFallback({ ...next, modelFallback: { ...next.modelFallback, models: ['gemini-3.8-flash', 'private-model'] } }), undefined);
});

test('solo un 503 de saturación habilita el descenso; cuota, clave, timeout y otros fallos conservan su tratamiento', () => {
  const { toAiError, esErrorDeSaturacion } = load('src/lib/ai/providers.ts');
  const raw = { status: 503, message: 'This model is currently experiencing high demand. PRIVATE-FIXTURE' };
  const wrapped = toAiError(raw, 'google', 'db');
  assert.equal(esErrorDeSaturacion(raw), true); assert.equal(esErrorDeSaturacion(wrapped), true);
  assert.equal(esErrorDeSaturacion(JSON.parse(JSON.stringify(wrapped))), true);
  assert.equal(wrapped.retryable, true); assert.match(wrapped.message, /saturado/);
  assert.doesNotMatch(JSON.stringify(wrapped), /PRIVATE-FIXTURE/);
  for (const [status, message] of [[401, 'overloaded'], [403, 'high demand'], [429, 'capacity'], [500, 'overloaded'], [503, 'temporarily unavailable'], [503, 'timeout'], [400, 'responseJsonSchema is not supported']]) {
    assert.equal(esErrorDeSaturacion(toAiError({ status, message }, 'google')), false, `${status}: ${message}`);
  }
});

test('el avance distingue el modelo usado del pendiente y conserva la lectura de trabajos anteriores', async () => {
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { default: Progress } = load('src/app/(app)/generador/trabajos/[id]/progress.tsx', {
    '@/app/actions/generation-jobs': {},
    'next/link': ({ children, ...props }) => createElement('a', props, children),
  });
  const item = { id: 'fixture-item', order: 0, status: 'QUEUED', attempts: 1, stage: 'model_fallback', diagnostics: {
    provider: 'google', model: 'gemini-3.8-flash', modelSource: 'request',
    modelFallback: { originalSource: 'request', models: ['gemini-3.8-flash', 'gemini-3.7-flash'] },
  } };
  const render = (status, row) => renderToStaticMarkup(createElement(Progress, { initial: { id: 'fixture-job', status, items: [row] } }));
  const queued = render('RUNNING', item);
  assert.match(queued, /Modelo: gemini-3.8-flash/); assert.match(queued, /El siguiente intento usará/);
  const completed = render('COMPLETED', { ...item, status: 'COMPLETED', stage: 'completed', attempts: 2, diagnostics: { ...item.diagnostics, model: 'gemini-3.7-flash', modelSource: 'fallback' } });
  assert.match(completed, /Modelo: gemini-3.7-flash/); assert.match(completed, /alternativa por saturación/); assert.doesNotMatch(completed, /El siguiente intento usará/);
  assert.doesNotMatch(render('FAILED', { ...item, status: 'FAILED', diagnostics: null }), /Alternativas por saturación/);
});

test('Gemini 3.8 es el predeterminado y acepta configuraciones anteriores sin cambiar modelos de Claude', () => {
  assert.equal(resolveAiModel('google'), 'gemini-3.8-flash');
  for (const value of ['gemini-2.5-pro', 'gemini-2.5-flash', ' models/gemini-3.8-flash ']) {
    assert.equal(resolveAiModel('google', value), 'gemini-3.8-flash');
    assert.equal(resolveAiModel('google', undefined, value), 'gemini-3.8-flash');
  }
  assert.equal(normalizeAiModel('anthropic', 'claude-sonnet-5'), 'claude-sonnet-5');
});

test('un modelo explícito de otro proveedor o fuera del catálogo se rechaza', () => {
  assert.throws(() => resolveAiModel('google', 'claude-opus-5'), /catálogo/);
  assert.throws(() => resolveAiModel('anthropic', 'gemini-3.8-flash'), /catálogo/);
  assert.throws(() => resolveAiModel('google', 'gemini-inventado'), /catálogo/);
  assert.throws(() => resolveAiModel('inventado'), /proveedor/);
});

test('el modelo heredado incompatible se omite y se respetan los ajustes del proveedor', () => {
  assert.equal(resolveAiModel('google', '', 'claude-opus-5', 'gemini-2.5-pro'), 'gemini-3.8-flash');
  assert.equal(resolveAiModel('anthropic', '', 'gemini-3.8-flash', 'claude-sonnet-5'), 'claude-sonnet-5');
  assert.equal(resolveAiModel('anthropic', 'claude-haiku-4-5', 'claude-opus-5'), 'claude-haiku-4-5');
});

function engineFixture(structure, settings = {}) {
  const calls = [];
  const engine = load('src/lib/ai/index.ts', {
    '@/lib/prisma': { prisma: { $queryRaw: async () => [], structure: { findUnique: async () => ({ id: 'structure', name: 'Fixture', updatedAt: new Date('2026-09-24T00:00:00Z'), ...structure }) }, asset: { findMany: async () => [] } } },
    '@/lib/settings': { SETTING_KEYS: { defaultGoogleModel: 'google.model', defaultAnthropicModel: 'anthropic.model', googleKey: 'google.key', anthropicKey: 'anthropic.key' }, getSettings: async () => settings, resolveApiKey: async () => ({ key: 'fixture-not-a-real-key' }) },
    '@/lib/ai/context': { buildSystemPrompt: () => 'Instrucciones ficticias', buildUserPrompt: () => 'Petición ficticia' },
    '@/lib/ai/providers': { AiError: class extends Error {}, generateWithGemini: async call => { calls.push({ provider: 'google', ...call }); return { model: call.model, provider: 'google' }; }, generateWithClaude: async call => { calls.push({ provider: 'anthropic', ...call }); return { model: call.model, provider: 'anthropic' }; } },
  });
  return { engine, calls };
}

test('regresión: seleccionar Gemini con una estructura Claude nunca envía el nombre de Claude a Google', async () => {
  const { engine, calls } = engineFixture({ defaultProvider: 'anthropic', defaultModel: 'claude-opus-5' });
  const result = await engine.generateScript({ structureId: 'structure', request: 'Fixture', provider: 'google', model: '' });
  assert.equal(result.model, 'gemini-3.8-flash');
  assert.equal(calls.length, 1);assert.equal(calls[0].provider, 'google');assert.equal(calls[0].model, 'gemini-3.8-flash');
});

test('los guiones nuevos resuelven modelos 2.5 heredados y los ajustes se usan si la estructura no define modelo', async () => {
  for (const defaultModel of ['gemini-2.5-pro', 'gemini-2.5-flash']) {
    const { engine } = engineFixture({ defaultProvider: 'google', defaultModel });
    assert.equal((await engine.generateScript({ structureId: 'structure', request: 'Fixture' })).model, 'gemini-3.8-flash');
  }
  const { engine } = engineFixture({ defaultProvider: 'anthropic', defaultModel: '' }, { 'anthropic.model': 'claude-sonnet-5' });
  assert.equal((await engine.generateScript({ structureId: 'structure', request: 'Fixture' })).model, 'claude-sonnet-5');
});

test('una selección explícita incompatible no llega a llamar al proveedor', async () => {
  const { engine, calls } = engineFixture({ defaultProvider: 'anthropic', defaultModel: 'claude-opus-5' });
  await assert.rejects(engine.generateScript({ structureId: 'structure', request: 'Fixture', provider: 'google', model: 'claude-opus-5' }), /catálogo/);
  assert.equal(calls.length, 0);
});

const call = { request: simulatedRequest, apiKey: 'fixture-not-a-real-key', model: 'gemini-3.8-flash', system: 'Fixture', user: 'Fixture', temperature: 0.7 };
function googleFixture(handler) {
  const requests = [], clients = [];
  class GoogleGenAI { constructor(options) { clients.push(options);this.models = { generateContent: async request => { requests.push(request); return handler(request); } }; } }
  return { providers: load('src/lib/ai/providers.ts', { '@google/genai': { GoogleGenAI } }), requests, clients };
}

test('la llamada a Gemini 3.8 conserva JSON estructurado y límites, sin parámetros retirados ni reintentos ocultos', async () => {
  const { providers, requests, clients } = googleFixture(async () => ({ text: JSON.stringify({ title: 'Guion ficticio', scenes: [{ beat: 'Inicio', startSec: 0, endSec: 5, voice: 'Hola' }] }), usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 } }));
  const result = await providers.generateWithGemini(call);
  assert.equal(result.model, 'gemini-3.8-flash');assert.equal(result.script.title, 'Guion ficticio');
  assert.equal(requests[0].model, 'gemini-3.8-flash');assert.equal(requests[0].config.responseMimeType, 'application/json');assert.ok(requests[0].config.responseJsonSchema);
  for (const key of ['temperature', 'topP', 'topK', 'candidateCount', 'thinkingBudget']) assert.ok(!Object.hasOwn(requests[0].config, key));
  assert.ok(requests[0].config.maxOutputTokens <= 32000);assert.equal(clients[0].httpOptions.retryOptions, undefined);assert.equal(requests.length, 1);
});

test('los errores de configuración y de servidor no se confunden con modelo inexistente', async () => {
  for (const [status, message, expected, retryable] of [[400, 'generateContent: Model does not support temperature', /configuración/, false], [503, 'Model temporarily unavailable for generateContent', /error de servidor/, true], [404, 'Model not found for API version v1beta, or not supported for generateContent', /no reconoce/, false], [429, 'Resource_exhausted', /limitando/, true]]) {
    const { providers } = googleFixture(async () => { throw Object.assign(new Error(message), { status }); });
    await assert.rejects(providers.generateWithGemini(call), error => expected.test(error.message) && error.retryable === retryable);
  }
});

test('el SDK real conserva errores HTTP y hace una sola petición, sin consumir API real', async () => {
  const originalFetch = globalThis.fetch;
  const { generateWithGemini } = load('src/lib/ai/providers.ts');
  try {
    for (const [status, expected, retryable] of [[400, /configuración/, false], [401, /clave/, false], [403, /clave/, false], [404, /no reconoce/, false], [429, /limitando/, true], [500, /error de servidor/, true], [503, /error de servidor/, true], [504, /error de servidor/, true]]) {
      let calls = 0;
      globalThis.fetch = async () => {
        calls++;
        return new Response(JSON.stringify({ error: { code: status, message: 'Synthetic error', status: 'TEST' } }), {
          status, statusText: 'Synthetic', headers: { 'Content-Type': 'application/json' },
        });
      };
      await assert.rejects(generateWithGemini(call), error => expected.test(error.message) && error.retryable === retryable);
      assert.equal(calls, 1, `HTTP ${status} debe llegar al control de reintentos del job`);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test('los abortos y timeouts de transporte se reintentan y los diagnósticos no contienen secretos', async () => {
  for (const error of [new DOMException('This operation was aborted', 'AbortError'), new DOMException('The operation timed out', 'TimeoutError'), Object.assign(new TypeError('fetch failed synthetic-private-key'), { cause: { code: 'UND_ERR_HEADERS_TIMEOUT', message: 'private prompt' } })]) {
    const { providers } = googleFixture(async () => { throw error; });
    await assert.rejects(providers.generateWithGemini(call), e => {
      assert.match(e.message, /tardó demasiado/);
      assert.equal(e.retryable, true);
      assert.equal(e.diagnostic.provider, 'Gemini');
      assert.doesNotMatch(JSON.stringify(e.diagnostic), /private|prompt|key/);
      return true;
    });
  }
});

test('la comprobación de clave consulta el modelo 3.8 sin generar tokens ni afirmar saldo disponible', async () => {
  const models = [];
  class GoogleGenAI { constructor() { this.models = { get: async ({ model }) => { models.push(model);return { name: model }; }, generateContent: async () => { throw Error('No debe generar'); } }; } }
  const action = load('src/app/actions/probar-clave.ts', { '@google/genai': { GoogleGenAI }, '@/lib/auth': { requirePermission: async permission => assert.equal(permission, 'admin.settings') } });
  const result = await action.probarClaveIA({ provider: 'google', apiKey: 'fixture-not-a-real-key' });
  assert.equal(result.ok, true);assert.deepEqual(models, ['gemini-3.8-flash']);assert.match(result.mensaje, /cuota.*al generar/);assert.doesNotMatch(result.mensaje, /saldo verificado/);
});
