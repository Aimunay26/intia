import assert from 'node:assert/strict';
import { test } from 'node:test';
import { load } from './load-module.mjs';

const { resolveAiModel, normalizeAiModel } = load('src/lib/ai-models.ts');

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
    '@/lib/prisma': { prisma: { structure: { findUnique: async () => ({ id: 'structure', name: 'Fixture', ...structure }) }, asset: { findMany: async () => [] } } },
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

const call = { apiKey: 'fixture-not-a-real-key', model: 'gemini-3.8-flash', system: 'Fixture', user: 'Fixture', temperature: 0.7 };
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
  assert.ok(requests[0].config.maxOutputTokens <= 32000);assert.equal(clients[0].httpOptions.retryOptions.attempts, 1);assert.equal(requests.length, 1);
});

test('los errores de configuración y de servidor no se confunden con modelo inexistente', async () => {
  for (const [status, message, expected, retryable] of [[400, 'generateContent: Model does not support temperature', /configuración/, false], [503, 'Model temporarily unavailable for generateContent', /error de servidor/, true], [404, 'Model not found for API version v1beta, or not supported for generateContent', /no reconoce/, false], [429, 'Resource_exhausted', /limitando/, true]]) {
    const { providers } = googleFixture(async () => { throw Object.assign(new Error(message), { status }); });
    await assert.rejects(providers.generateWithGemini(call), error => expected.test(error.message) && error.retryable === retryable);
  }
});

test('la comprobación de clave consulta el modelo 3.8 sin generar tokens ni afirmar saldo disponible', async () => {
  const models = [];
  class GoogleGenAI { constructor() { this.models = { get: async ({ model }) => { models.push(model);return { name: model }; }, generateContent: async () => { throw Error('No debe generar'); } }; } }
  const action = load('src/app/actions/probar-clave.ts', { '@google/genai': { GoogleGenAI }, '@/lib/auth': { requirePermission: async permission => assert.equal(permission, 'admin.settings') } });
  const result = await action.probarClaveIA({ provider: 'google', apiKey: 'fixture-not-a-real-key' });
  assert.equal(result.ok, true);assert.deepEqual(models, ['gemini-3.8-flash']);assert.match(result.mensaje, /cuota.*al generar/);assert.doesNotMatch(result.mensaje, /saldo verificado/);
});
