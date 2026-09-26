import { seedApprovals } from './approval-fixture.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { PrismaClient } from '@prisma/client';
import { load } from './load-module.mjs';
import { geminiQuotaBody, validScript } from './ai-fixture.mjs';

const url = process.env.PRIORITIES_TEST_DATABASE_URL;
if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname) || !new URL(url).pathname.endsWith('_test')) throw Error('Solo DB local efímera _test.');
const prisma = new PrismaClient({ datasourceUrl: url }), context = new AsyncLocalStorage();
const require = createRequire(import.meta.url), Genai = require('@google/genai');
const fd = values => { const f = new FormData(); for (const [key, value] of Object.entries(values)) f.append(key, String(value)); return f; };
const mocks = {
  '@/lib/prisma': { prisma },
  'next/headers': { cookies: async () => ({ get: key => context.getStore()?.has(key) ? { value: context.getStore().get(key) } : undefined, set: (k, v) => context.getStore().set(k, v), delete: k => context.getStore().delete(k) }) },
  'next/cache': { revalidatePath() {}, revalidateTag() {} },
  'next/navigation': { redirect: path => { throw Error('REDIRECT:' + path); } },
};
const auth = load('src/lib/auth.ts', mocks), limits = load('src/lib/resource-limits.ts', mocks);
const as = async (id, fn) => context.run(new Map(), async () => { const user = await prisma.user.findUniqueOrThrow({ where: { id } }); await auth.createSession(id, user.sessionVersion); return fn(); });
const actor = id => as(id, () => auth.requireUser());
const scripts = load('src/app/actions/scripts.ts', mocks), assets = load('src/app/actions/assets.ts', mocks), content = load('src/app/actions/content.ts', mocks), structures = load('src/app/actions/structures.ts', mocks);
const result = () => ({ script: structuredClone(validScript), provider: 'google', model: 'fixture', raw: 'fixture', systemPrompt: 'fixture', userPrompt: 'fixture', referencesUsed: [] });
let calls = 0, run = async () => result();
const jobs = load('src/lib/generation-jobs.ts', { ...mocks, '@/lib/ai': { AiError: class extends Error {}, normalizeSceneTimes: s => s, generateScript: (input, request) => request(async () => { calls++; return run(input); }) } });
const drain = async (id, engine = jobs) => { for (let i = 0; i < 8; i++) { if ((await engine.processGeneration(id)).done) return; } throw Error('Trabajo no terminó'); };
const enqueue = async (extra = {}, engine = jobs, structureId = 'format') => engine.enqueueGeneration(await actor('writer'), randomUUID(), [structureId], { request: 'Datos ficticios', provider: 'google', brandId: 'A', ...extra });
const video = (id, extra = {}) => prisma.contentItem.create({ data: { id, title: id, brandId: 'A', scheduledDate: new Date('2026-09-16T12:00:00Z'), ...extra } });

test('B01–B06: acciones reales y PostgreSQL, sin proveedores externos', async t => {
  process.env.AUTH_SECRET = randomBytes(32).toString('hex'); process.env.AI_JOBS_ENABLED = 'true'; process.env.BLOB_PRIVATE_ENABLED = 'false';
  const oldFetch = globalThis.fetch;
  const oldKeys = { GEMINI_API_KEY: process.env.GEMINI_API_KEY, ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY };
  process.env.GEMINI_API_KEY = 'fixture-gemini-never-sent'; process.env.ANTHROPIC_API_KEY = 'fixture-claude-never-sent';
  globalThis.fetch = async () => { throw Error('HTTP externo prohibido en esta suite'); };
  const check = (name, fn) => t.test(name, async () => { await prisma.usageCounter.deleteMany(); run = async () => result(); await fn(); });
  try {
    await prisma.user.create({ data: { id: 'owner', name: 'Owner', email: 'owner@p1.test', role: 'OWNER', passwordHash: 'fixture' } });
    await prisma.brand.createMany({ data: ['A', 'B'].map(id => ({ id, name: id, slug: id })) });
    for (const [id, profile] of [['writer', 'WRITER'], ['strategy', 'STRATEGY']]) await prisma.user.create({ data: { id, name: id, email: id + '@p1.test', passwordHash: 'fixture', workProfiles: { create: { profile } }, brandAccess: { create: { brandId: 'A' } } } });
    await prisma.structure.create({ data: { id: 'format', name: 'Fixture', slug: 'fixture', defaultDurationSec: 5 } });
    await prisma.script.create({ data: { id: 'script', title: 'Guion protegido', authorId: 'writer', brandId: 'A', scenes: { create: { id: 'scene', order: 0, beat: 'Inicio', startSec: 0, endSec: 5, voice: 'Original' } } } });
    await video('closed', { scriptId: 'script', status: 'PUBLICADO', checklist: { create: { id: 'approval', stage: 'POSTPRODUCCION', label: 'Revisión final aprobada', kind: 'FINAL_APPROVAL', done: true, doneById: 'owner' } } });
    await video('shared-open', { scriptId: 'script' });
    await prisma.asset.create({ data: { id: 'asset', ownerType: 'content', ownerId: 'closed', filename: 'fixture.txt', mimeType: 'text/plain', data: Buffer.from('x'), size: 1, extractedText: 'Original' } });

    await check('B01: escenas, título, adjuntos y vínculos bloqueados aunque otro video compartido esté abierto', async () => {
      const row = await prisma.script.findUniqueOrThrow({ where: { id: 'script' } });
      const revision = row.updatedAt.toISOString();
      for (const action of [
        () => scripts.actualizarEscena(fd({ id: 'scene', expectedUpdatedAt: revision, voice: 'Cambio', startSec: 0, endSec: 5 })),
        () => scripts.actualizarGuion(fd({ id: 'script', title: 'Cambio', expectedUpdatedAt: revision })),
        () => scripts.anadirEscena(fd({ scriptId: 'script', beat: 'Otra', expectedUpdatedAt: revision })),
        () => assets.updateAssetText(fd({ id: 'asset', extractedText: 'Cambio' })),
        () => assets.toggleAssetAi(fd({ id: 'asset', useForAi: '' })),
        () => scripts.desvincularGuionDeVideo(fd({ contentItemId: 'closed' })),
      ]) await assert.rejects(as('writer', action), /reabrir/);
      const file = fd({ ownerType: 'content', ownerId: 'closed' }); file.set('file', new File(['fixture'], 'fixture.txt'));
      assert.match((await as('writer', () => assets.uploadAsset(null, file))).error, /reabrir/);
      assert.equal((await prisma.scriptScene.findUniqueOrThrow({ where: { id: 'scene' } })).voice, 'Original');
      assert.equal(await prisma.auditLog.count({ where: { userId: 'writer' } }), 0);
    });
    await check('B01: reapertura exige retirar aprobación y salir de publicado; dueño conserva excepción auditada', async () => {
      assert.match((await as('strategy', () => content.alternarCheck(fd({ id: 'approval', done: '' })))).error, /motivo de reapertura/);
      await as('strategy', () => content.alternarCheck(fd({ id: 'approval', done: '', reason: 'Corregir referencias de producción' })));
      assert.ok(await prisma.auditLog.count({ where: { entityId: 'approval', summary: { contains: 'Corregir referencias de producción' } } }));
      await assert.rejects(as('writer', () => assets.updateAssetText(fd({ id: 'asset', extractedText: 'Cambio' }))), /reabrir/);
      const row = await prisma.contentItem.findUniqueOrThrow({ where: { id: 'closed' } });
      await as('strategy', () => content.cambiarEstado(fd({ id: 'closed', status: 'GUION', reason: 'Revisar producción nuevamente', expectedUpdatedAt: row.updatedAt.toISOString() })));
      await as('writer', async () => assets.updateAssetText(fd({ id: 'asset', expectedUpdatedAt: (await prisma.asset.findUniqueOrThrow({where:{id:'asset'}})).updatedAt.toISOString(), extractedText: 'Cambio permitido' })));
      assert.equal((await prisma.checklistItem.findUniqueOrThrow({ where: { id: 'approval' } })).done, false);
      await seedApprovals(prisma, 'closed', 'owner');
      await as('owner', async () => assets.updateAssetText(fd({ id: 'asset', expectedUpdatedAt: (await prisma.asset.findUniqueOrThrow({where:{id:'asset'}})).updatedAt.toISOString(), extractedText: 'Excepción del dueño' })));
      assert.ok(await prisma.auditLog.count({ where: { entityId: 'asset', userId: 'owner' } }));
    });
    await check('B01: una escritura que espera la aprobación no puede pasar con una lectura obsoleta', async () => {
      await prisma.checklistItem.update({ where: { id: 'approval' }, data: { done: false } });
      let entered, release;
      const acquired = new Promise(r => { entered = r; }), gate = new Promise(r => { release = r; });
      const scope = load('src/lib/access-scope.ts', mocks);
      const approve = prisma.$transaction(async tx => { await scope.lockVideoLifecycle(tx, 'closed'); entered(); await gate; await tx.checklistItem.update({ where: { id: 'approval' }, data: { done: true } }); });
      await acquired;
      const writing = assert.rejects(as('writer', () => assets.updateAssetText(fd({ id: 'asset', extractedText: 'Cambio en carrera' }))), /reabrir/);
      release(); await approve; await writing;
      assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: 'asset' } })).extractedText, 'Excepción del dueño');
    });
    await check('B02: vínculo válido conserva idempotencia del encolado y une el guion', async () => {
      await video('happy'); const user = await actor('writer'), key = randomUUID(), input = { request: 'Fixture', provider: 'google', brandId: 'A', contentItemId: 'happy' };
      const id = await jobs.enqueueGeneration(user, key, ['format'], input);
      assert.equal(await jobs.enqueueGeneration(user, key, ['format'], input), id);
      await drain(id);
      assert.ok((await prisma.contentItem.findUniqueOrThrow({ where: { id: 'happy' } })).scriptId);
      assert.equal((await prisma.generationJob.findUniqueOrThrow({ where: { id } })).error, null);
    });
    await check('B02: aprobación ya cerrada impide encolar sin consumir cupos', async () => {
      await video('approved-empty', { checklist: { create: { stage: 'POSTPRODUCCION', label: 'Revisión final aprobada', kind: 'FINAL_APPROVAL', done: true } } });
      await assert.rejects(enqueue({ contentItemId: 'approved-empty' }), /Reabre la aprobación/);
      assert.equal(await prisma.usageCounter.count(), 0);
    });
    for (const [kind, change, message] of [
      ['cancelled', id => prisma.contentItem.update({ where: { id }, data: { status: 'CANCELADO' } }), /Idea o Guion/],
      ['published', id => prisma.contentItem.update({ where: { id }, data: { status: 'PUBLICADO' } }), /Idea o Guion/],
      ['revision', id => prisma.contentItem.update({ where: { id }, data: { title: 'Otra planificación' } }), /planificación.*cambió/],
      ['approval', id => prisma.checklistItem.create({ data: { contentItemId: id, stage: 'POSTPRODUCCION', label: 'Revisión final aprobada', kind: 'FINAL_APPROVAL', done: true } }), /aprobación final/],
      ['brand', id => prisma.contentItem.update({ where: { id }, data: { brandId: 'B' } }), /acceso/],
    ]) await check(`B02: ${kind} durante la llamada conserva el guion independiente con motivo`, async () => {
      const id = `late-${kind}`; await video(id);
      run = async () => { await change(id); return result(); };
      const job = await enqueue({ contentItemId: id }), before = calls;
      await drain(job);
      assert.equal((await prisma.contentItem.findUniqueOrThrow({ where: { id } })).scriptId, null);
      assert.equal(await prisma.script.count({ where: { generationItem: { jobId: job } } }), 1);
      assert.match((await prisma.generationJob.findUniqueOrThrow({ where: { id: job } })).error, message);
      assert.equal(calls, before + 1);
    });

    const settings = load('src/lib/settings.ts', mocks);
    let providerCalls = 0, response = async () => ({ text: JSON.stringify(validScript) }), key = 'fake-key';
    const engineMocks = { ...mocks, '@/lib/settings': { ...settings, resolveApiKey: async () => ({ key, source: 'db' }) }, '@google/genai': { ...Genai, GoogleGenAI: class { models = { generateContent: async (...args) => { providerCalls++; return response(...args); } }; } } };
    const engine = load('src/lib/generation-jobs.ts', engineMocks);
    const readyForRetry = id => prisma.generationItem.updateMany({ where: { jobId: id, status: 'QUEUED' }, data: { availableAt: new Date(Date.now() - 1000) } });
    const overload = () => new Genai.ApiError({ status: 503, message: 'This model is currently experiencing high demand. PRIVATE-FIXTURE' });
    await check('saturación: 3.8 → 3.7 → 3.6 persiste entre procesos y crea un solo guion con el modelo real', async () => {
      const requests = [], before = providerCalls;
      response = async request => { requests.push(request); if (requests.length < 3) throw overload(); return { text: JSON.stringify(validScript) }; };
      const id = await enqueue({}, engine);
      await engine.processGeneration(id);
      let item = await prisma.generationItem.findFirstOrThrow({ where: { jobId: id } });
      assert.equal(item.status, 'QUEUED'); assert.equal(item.stage, 'model_fallback'); assert.equal(item.attempts, 1);
      assert.equal(item.diagnostics.model, 'gemini-3.8-flash');
      assert.equal(item.diagnostics.modelFallback.models.at(-1), 'gemini-3.7-flash');
      const originalSource = item.diagnostics.modelSource;
      assert.ok((await engine.processGeneration(id)).retryAt > Date.now()); assert.equal(providerCalls, before + 1);
      await readyForRetry(id);
      const resumed = load('src/lib/generation-jobs.ts', engineMocks);
      await Promise.all([resumed.processGeneration(id), resumed.processGeneration(id)]);
      assert.equal(providerCalls, before + 2);
      await readyForRetry(id); await drain(id, load('src/lib/generation-jobs.ts', engineMocks));
      item = await prisma.generationItem.findFirstOrThrow({ where: { jobId: id } });
      assert.equal(item.status, 'COMPLETED'); assert.equal(item.attempts, 3);
      assert.deepEqual(requests.map(r => r.model), ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash']);
      assert.equal(new Set(requests.map(r => r.contents)).size, 1);
      assert.equal(new Set(requests.map(r => r.config.systemInstruction)).size, 1);
      assert.equal(item.diagnostics.modelSource, 'fallback'); assert.equal(item.diagnostics.modelFallback.originalSource, originalSource);
      assert.equal(item.diagnostics.model, 'gemini-3.6-flash'); assert.doesNotMatch(JSON.stringify(item.diagnostics), /PRIVATE-FIXTURE|fake-key/);
      const job = await prisma.generationJob.findUniqueOrThrow({ where: { id } });
      assert.equal(job.status, 'COMPLETED'); assert.equal(job.payload.model, undefined);
      const savedScripts = await prisma.script.findMany({ where: { generationItem: { jobId: id } } });
      assert.equal(savedScripts.length, 1); assert.equal(savedScripts[0].model, 'gemini-3.6-flash');
      assert.equal((await prisma.usageCounter.findUniqueOrThrow({ where: { key: `ai:calls:${limits.usageDay()}` } })).amount, 3n);
      await drain(id, resumed); assert.equal(providerCalls, before + 3);
    });
    await check('saturación persistente: empieza en 3.7, llega a 3.6 y se detiene al tercer intento sin subir', async () => {
      const models = [];
      response = async request => { models.push(request.model); throw overload(); };
      const id = await enqueue({ model: 'gemini-3.7-flash' }, engine);
      for (let i = 0; i < 3; i++) { await readyForRetry(id); await engine.processGeneration(id); }
      await drain(id, engine); await drain(id, engine);
      assert.deepEqual(models, ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.6-flash']);
      assert.equal((await prisma.generationJob.findUniqueOrThrow({ where: { id } })).status, 'FAILED');
      assert.equal(await prisma.script.count({ where: { generationItem: { jobId: id } } }), 0);
    });
    await check('un 500 después del descenso conserva el modelo alternativo y no regresa al inicial', async () => {
      const models = [];
      response = async request => { models.push(request.model); if (models.length === 1) throw overload(); if (models.length === 2) throw new Genai.ApiError({ status: 500, message: 'Server error' }); return { text: JSON.stringify(validScript) }; };
      const id = await enqueue({ model: 'gemini-3.8-flash' }, engine);
      for (let i = 0; i < 3; i++) { await readyForRetry(id); await load('src/lib/generation-jobs.ts', engineMocks).processGeneration(id); }
      await drain(id, engine);
      assert.deepEqual(models, ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.7-flash']);
      assert.equal((await prisma.generationJob.findUniqueOrThrow({ where: { id } })).status, 'COMPLETED');
    });
    await check('el fallback de esquema y el descenso por saturación registran cada llamada sin sumar intentos ocultos', async () => {
      const requests = [];
      response = async request => { requests.push(request); if (requests.length === 1) throw new Genai.ApiError({ status: 400, message: 'responseJsonSchema is not supported' }); if (requests.length === 2) throw overload(); return { text: JSON.stringify(validScript) }; };
      const id = await enqueue({}, engine); await engine.processGeneration(id); await readyForRetry(id); await drain(id, engine);
      assert.deepEqual(requests.map(r => r.model), ['gemini-3.8-flash', 'gemini-3.8-flash', 'gemini-3.7-flash']);
      assert.ok(requests[0].config.responseJsonSchema); assert.equal(requests[1].config.responseJsonSchema, undefined); assert.ok(requests[2].config.responseJsonSchema);
      assert.equal((await prisma.generationItem.findFirstOrThrow({ where: { jobId: id } })).attempts, 2);
      assert.equal((await prisma.usageCounter.findUniqueOrThrow({ where: { key: `ai:calls:${limits.usageDay()}` } })).amount, 3n);
    });
    for (const stop of ['cancel', 'revoke']) await check(`el descenso respeta ${stop} antes del siguiente intento`, async () => {
      const before = providerCalls;
      response = async () => { throw overload(); };
      const id = await enqueue({}, engine); await engine.processGeneration(id); await readyForRetry(id);
      if (stop === 'cancel') await engine.cancelGeneration(await actor('writer'), id);
      else await prisma.user.update({ where: { id: 'writer' }, data: { sessionVersion: { increment: 1 } } });
      await drain(id, load('src/lib/generation-jobs.ts', engineMocks));
      assert.equal(providerCalls, before + 1);
      assert.equal((await prisma.generationJob.findUniqueOrThrow({ where: { id } })).status, 'CANCELLED');
      assert.equal(await prisma.script.count({ where: { generationItem: { jobId: id } } }), 0);
    });
    await check('B03: probar Claude respeta interruptor y plazo, y registra la petición', async () => {
      let probes = 0;
      const probe = load('src/app/actions/probar-clave.ts', { ...engineMocks, '@anthropic-ai/sdk': { __esModule: true, default: class {
        constructor(options) { assert.equal(options.maxRetries, 0); assert.ok(options.timeout <= 15000); }
        messages = { create: async (_input, { signal }) => { assert.ok(signal instanceof AbortSignal); probes++; return {}; } };
      } } });
      process.env.AI_JOBS_ENABLED = 'false';
      try { assert.equal((await as('owner', () => probe.probarClaveIA({ provider: 'anthropic' }))).ok, false); assert.equal(probes, 0); }
      finally { process.env.AI_JOBS_ENABLED = 'true'; }
      assert.equal((await as('owner', () => probe.probarClaveIA({ provider: 'anthropic' }))).ok, true);
      assert.equal(probes, 1); assert.equal((await prisma.usageCounter.findUniqueOrThrow({ where: { key: `ai:calls:${limits.usageDay()}` } })).amount, 1n);
    });
    await check('B03: fallback real del adaptador cuenta dos peticiones y un intento', async () => {
      const before = providerCalls;
      response = async () => { if (providerCalls === before + 1) throw new Genai.ApiError({ status: 400, message: 'responseJsonSchema is not supported' }); return { text: JSON.stringify(validScript) }; };
      const id = await enqueue({}, engine); await drain(id, engine);
      assert.equal(providerCalls - before, 2);
      assert.equal((await prisma.usageCounter.findUniqueOrThrow({ where: { key: `ai:calls:${limits.usageDay()}` } })).amount, 2n);
      assert.equal((await prisma.generationItem.findFirstOrThrow({ where: { jobId: id } })).attempts, 1);
      assert.equal((await prisma.generationJob.findUniqueOrThrow({ where: { id } })).status, 'COMPLETED');
      const diagnosticItem=await prisma.generationItem.findFirstOrThrow({where:{jobId:id}});
      assert.equal(diagnosticItem.stage,'completed');assert.match(diagnosticItem.diagnostics.contextHash,/^[a-f0-9]{64}$/);
      assert.equal(diagnosticItem.diagnostics.provider,'google');assert.ok(diagnosticItem.diagnostics.modelSource);assert.ok(diagnosticItem.diagnostics.structureRevision);
      assert.doesNotMatch(JSON.stringify(diagnosticItem.diagnostics),/fake-key|systemPrompt|userPrompt/);
    });
    await check('B03: los antiguos cupos no bloquean llamadas ni fallback; clave ausente no envía petición', async () => {
      process.env.AI_DAILY_CALLS = '0'; process.env.AI_USER_DAILY_CALLS = '0'; const before = providerCalls;
      const day = limits.usageDay();
      await prisma.usageCounter.createMany({ data: [{ key: `ai:calls:${day}`, amount: 100 }, { key: `ai:user:writer:${day}`, amount: 100 }] });
      response = async () => { if (providerCalls === before + 1) throw new Genai.ApiError({ status: 400, message: 'responseJsonSchema is not supported' }); return { text: JSON.stringify(validScript) }; };
      try {
        const id = await enqueue({}, engine); await drain(id, engine);
        assert.equal(providerCalls - before, 2);
        assert.equal((await prisma.generationJob.findUniqueOrThrow({ where: { id } })).status, 'COMPLETED');
        assert.equal((await prisma.usageCounter.findUniqueOrThrow({ where: { key: `ai:calls:${day}` } })).amount, 102n);
        assert.equal((await prisma.usageCounter.findUniqueOrThrow({ where: { key: `ai:user:writer:${day}` } })).amount, 102n);
      } finally { delete process.env.AI_DAILY_CALLS; delete process.env.AI_USER_DAILY_CALLS; }
      await prisma.usageCounter.deleteMany(); key = null;
      try { const id = await enqueue({}, engine); await drain(id, engine); assert.equal(await prisma.usageCounter.count({ where: { key: { startsWith: 'ai:calls:' } } }), 0); }
      finally { key = 'fake-key'; }
    });
    await check('B03: cuota gratuita agotada guarda aviso de facturación sin reintentar ni crear un guion', async () => {
      const before = providerCalls;
      response = async () => { throw new Genai.ApiError({ status: 429, message: geminiQuotaBody() }); };
      const id = await enqueue({}, engine); await drain(id, engine); await drain(id, engine);
      assert.equal(providerCalls, before + 1);
      const item = await prisma.generationItem.findFirstOrThrow({ where: { jobId: id } });
      assert.equal(item.status, 'FAILED'); assert.equal(item.attempts, 1);
      assert.match(item.error, /agotó la cuota diaria gratuita.*facturación habilitada.*Ajustes/);
      assert.doesNotMatch(item.error + JSON.stringify(item.diagnostics), /PRIVATE-FIXTURE|QuotaFailure|fake-key/);
      assert.equal(await prisma.script.count({ where: { generationItem: { jobId: id } } }), 0);
    });
    await check('B04: local no llama IA; respeta apagado y permite repetir una extracción explícita sin cupos diarios', async () => {
      response = async () => ({ text: '{}' });
      const preview = load('src/app/actions/importar-documento.ts', engineMocks);
      const form = fd({ tipo: 'brief', destino: 'marca' });
      form.set('file', new File(['BRIEF MAESTRO\nMarca ficticia. Texto suficientemente largo para comprobar lectura local y mejora opcional sin información privada.'], 'fixture.txt'));
      const before = providerCalls;
      assert.equal((await as('strategy', () => preview.previsualizarDocumento(form))).ok, true); assert.equal(providerCalls, before);
      form.set('aiProvider', 'google'); process.env.AI_JOBS_ENABLED = 'false';
      try { assert.equal((await as('strategy', () => preview.previsualizarDocumento(form))).ok, true); assert.equal(providerCalls, before); }
      finally { process.env.AI_JOBS_ENABLED = 'true'; }
      process.env.AI_DAILY_CALLS = '0';
      try { await as('strategy', () => preview.previsualizarDocumento(form)); assert.equal(providerCalls, before + 1); }
      finally { delete process.env.AI_DAILY_CALLS; }
      await as('strategy', () => preview.previsualizarDocumento(form)); assert.equal(providerCalls, before + 2);
      await as('strategy', () => preview.previsualizarDocumento(form)); assert.equal(providerCalls, before + 3);
      assert.equal((await prisma.usageCounter.findUniqueOrThrow({ where: { key: `ai:calls:${limits.usageDay()}` } })).amount, 3n);
    });
    await check('B04: extracción sin cuota gratuita conserva lectura local y muestra facturación', async () => {
      response = async () => { throw new Genai.ApiError({ status: 429, message: geminiQuotaBody() }); };
      const preview = load('src/app/actions/importar-documento.ts', engineMocks);
      const form = fd({ tipo: 'brief', destino: 'marca', aiProvider: 'google' });
      form.set('file', new File(['BRIEF MAESTRO\nMarca ficticia. Texto suficientemente largo para comprobar lectura local sin información privada.'], 'fixture.txt'));
      const before = providerCalls, result = await as('strategy', () => preview.previsualizarDocumento(form));
      assert.equal(result.ok, true); assert.equal(providerCalls, before + 1); assert.equal(result.resultado.ia, null);
      assert.match(result.resultado.avisos.join(' '), /cuota diaria gratuita.*facturación habilitada.*lectura directa/);
    });
    await check('B05: relación prevista sincronizada; referencias y cola impiden borrar estructura', async () => {
      await prisma.structure.create({ data: { id: 'planned-format', name: 'Previsto', slug: 'planned', defaultDurationSec: 5 } });
      await video('planned', { structureIds: '["planned-format"]' });
      assert.equal(await prisma.contentPlannedStructure.count({ where: { structureId: 'planned-format' } }), 1);
      const id = await enqueue({}, jobs, 'planned-format');
      await assert.rejects(prisma.structure.delete({ where: { id: 'planned-format' } }));
      await assert.rejects(as('owner', () => structures.eliminarEstructura(fd({ id: 'planned-format' }))), /REDIRECT:/);
      assert.equal((await prisma.structure.findUniqueOrThrow({ where: { id: 'planned-format' } })).active, false);
      await assert.rejects(enqueue({}, jobs, 'planned-format'), /desactivada/);
      await drain(id); assert.equal((await prisma.generationJob.findUniqueOrThrow({ where: { id } })).status, 'COMPLETED');
      await prisma.contentItem.update({ where: { id: 'planned' }, data: { structureIds: '[]' } });
      assert.equal(await prisma.contentPlannedStructure.count({ where: { contentItemId: 'planned' } }), 0);
      await assert.rejects(prisma.contentItem.update({ where: { id: 'planned' }, data: { structureIds: '["missing"]' } }));
      await assert.rejects(prisma.contentItem.update({ where: { id: 'planned' }, data: { structureIds: '{}' } }));
    });
    await check('B06: salida inválida recibida o recuperada queda fallida sin guardar ni gastar otra llamada', async () => {
      const invalid = result(); invalid.script.scenes[0].voice = '';
      run = async () => invalid;
      const id = await enqueue(), before = calls;
      await drain(id); await drain(id);
      assert.equal(calls, before + 1); assert.equal(await prisma.script.count({ where: { generationItem: { jobId: id } } }), 0);
      const item = await prisma.generationItem.findFirstOrThrow({ where: { jobId: id } });
      assert.equal(item.status, 'FAILED'); assert.equal(item.stage, 'response_validate'); assert.equal(item.response, null); assert.match(item.error, /necesita revisión/);
      const recovered = await enqueue();
      await prisma.generationItem.updateMany({ where: { jobId: recovered }, data: { response: invalid, attempts: 1 } });
      await drain(recovered); assert.equal(calls, before + 1);
    });
    await check('reintento manual: solo fallidos, doble clic idempotente, historial y vínculo del éxito intactos', async () => {
      await prisma.structure.create({ data: { id: 'retry-format', name: 'Reintento', slug: 'retry-format', defaultDurationSec: 5 } });
      await video('retry-partial-video');
      const user = await actor('writer');
      const sourceId = await jobs.enqueueGeneration(user, randomUUID(), ['format', 'retry-format'], { request: 'Pedido original con CTA', provider: 'google', model: 'gemini-3.8-flash', brandId: 'A', ctaMode: 'comunidad', contentItemId: 'retry-partial-video' });
      run = async input => { if (input.structureId === 'retry-format') throw Error('fallo simulado'); return result(); };
      await drain(sourceId);
      const original = await prisma.generationJob.findUniqueOrThrow({ where: { id: sourceId }, include: { items: true } });
      const linked = await prisma.contentItem.findUniqueOrThrow({ where: { id: 'retry-partial-video' } });
      assert.equal(original.status, 'PARTIAL'); assert.ok(linked.scriptId);
      const before = calls;
      const ids = await Promise.all(Array.from({ length: 4 }, () => jobs.retryFailedGeneration(user, sourceId)));
      assert.equal(new Set(ids).size, 1); const id = ids[0]; assert.notEqual(id, sourceId);
      assert.equal(calls, before);
      const child = await prisma.generationJob.findUniqueOrThrow({ where: { id }, include: { items: true } });
      assert.equal(child.status, 'QUEUED'); assert.equal(child.runId, null);
      assert.deepEqual(child.items.map(i => i.structureId), ['retry-format']); assert.equal(child.items[0].attempts, 0);
      assert.equal(child.payload.contentItemId, undefined); assert.equal(child.payload.ctaMode, 'comunidad');
      assert.equal(child.payload.request, original.payload.request); assert.equal(child.payload.model, original.payload.model); assert.equal(child.payload.retryOfJobId, sourceId);
      assert.deepEqual(await prisma.generationJob.findUniqueOrThrow({ where: { id: sourceId }, include: { items: true } }), original);
      assert.equal(await prisma.auditLog.count({ where: { entityId: id, summary: { contains: sourceId } } }), 1);
      assert.equal((await jobs.generationStatus(user, sourceId)).retryJobId, id);
      assert.equal(await jobs.retryFailedGeneration(await actor('owner'), sourceId), id);
      run = async () => result(); await drain(id);
      assert.equal(calls, before + 1);
      assert.equal((await prisma.contentItem.findUniqueOrThrow({ where: { id: 'retry-partial-video' } })).scriptId, linked.scriptId);
      assert.equal(await prisma.script.count({ where: { generationItem: { jobId: { in: [sourceId, id] } } } }), 2);
      assert.equal(await jobs.retryFailedGeneration(user, sourceId), id); assert.equal(calls, before + 1);
      assert.equal((await jobs.generationStatus(user, id)).retryableCount, 0);
    });
    await check('reintento manual: cancelado crea un trabajo nuevo y un segundo fallo se reintenta desde su propio historial', async () => {
      const user = await actor('writer'), sourceId = await enqueue();
      await jobs.cancelGeneration(user, sourceId);
      const first = await jobs.retryFailedGeneration(user, sourceId);
      run = async () => { throw Error('fallo simulado'); }; await drain(first);
      const second = await jobs.retryFailedGeneration(user, first); assert.notEqual(first, second);
      run = async () => result(); await drain(second);
      assert.equal((await prisma.generationJob.findUniqueOrThrow({ where: { id: sourceId } })).status, 'CANCELLED');
      assert.equal((await prisma.generationJob.findUniqueOrThrow({ where: { id: first } })).status, 'FAILED');
      assert.equal((await prisma.generationJob.findUniqueOrThrow({ where: { id: second } })).status, 'COMPLETED');
      assert.equal(await jobs.retryFailedGeneration(user, sourceId), first);
    });
    await check('reintento manual: vuelve a validar marca, autor, sesión y configuración antes de registrar', async () => {
      await prisma.user.create({ data: { id: 'other-writer', name: 'Otro', email: 'other@p1.test', passwordHash: 'fixture', workProfiles: { create: { profile: 'WRITER' } }, brandAccess: { create: { brandId: 'A' } } } });
      const user = await actor('writer'), sourceId = await enqueue(); await jobs.cancelGeneration(user, sourceId);
      const total = await prisma.generationJob.count(), before = calls;
      await assert.rejects(jobs.retryFailedGeneration(await actor('other-writer'), sourceId), /sin acceso/);
      await prisma.user.update({ where: { id: 'writer' }, data: { sessionVersion: { increment: 1 } } });
      await assert.rejects(jobs.retryFailedGeneration(user, sourceId), /acceso cambió/);
      await prisma.userBrandAccess.deleteMany({ where: { userId: 'writer', brandId: 'A' } });
      await assert.rejects(jobs.retryFailedGeneration(await actor('writer'), sourceId), /sin acceso/);
      await prisma.userBrandAccess.create({ data: { userId: 'writer', brandId: 'A' } });
      process.env.AI_JOBS_ENABLED = 'false';
      try { await assert.rejects(jobs.retryFailedGeneration(await actor('writer'), sourceId), /no está habilitada/); }
      finally { process.env.AI_JOBS_ENABLED = 'true'; }
      await prisma.structure.update({ where: { id: 'format' }, data: { active: false } });
      try { await assert.rejects(jobs.retryFailedGeneration(await actor('writer'), sourceId), /desactivada/); }
      finally { await prisma.structure.update({ where: { id: 'format' }, data: { active: true } }); }
      assert.equal(await prisma.generationJob.count(), total); assert.equal(calls, before);
    });
    await check('reintento manual: rechaza trabajos activos, completos, sin pedido y con dos pendientes', async () => {
      const user = await actor('writer'), activeId = await enqueue();
      await assert.rejects(jobs.retryFailedGeneration(user, activeId), /Espera a que termine/);
      await drain(activeId);
      await assert.rejects(jobs.retryFailedGeneration(user, activeId), /No hay guiones/);
      // Incluso un estado inconsistente FAILED no duplica un guion ya persistido.
      await prisma.generationJob.update({ where: { id: activeId }, data: { status: 'FAILED', items: { updateMany: { where: {}, data: { status: 'FAILED' } } } } });
      await assert.rejects(jobs.retryFailedGeneration(user, activeId), /No hay guiones/);
      const sourceId = await enqueue(); await jobs.cancelGeneration(user, sourceId);
      const pending = [await enqueue(), await enqueue()];
      await assert.rejects(jobs.retryFailedGeneration(user, sourceId), /dos generaciones pendientes/);
      for (const id of pending) await jobs.cancelGeneration(user, id);
      await prisma.generationJob.update({ where: { id: sourceId }, data: { payload: { brandId: 'A', redacted: true } } });
      await assert.rejects(jobs.retryFailedGeneration(user, sourceId), /pedido original ya no está disponible/);
    });
    await check('reintento manual: si ningún guion salió, vuelve a validar y capturar el destino', async () => {
      await video('retry-full-video');
      const user = await actor('writer'), sourceId = await enqueue({ contentItemId: 'retry-full-video' });
      await jobs.cancelGeneration(user, sourceId);
      const id = await jobs.retryFailedGeneration(user, sourceId); await drain(id);
      assert.ok((await prisma.contentItem.findUniqueOrThrow({ where: { id: 'retry-full-video' } })).scriptId);
      await video('retry-occupied-video');
      const source2 = await enqueue({ contentItemId: 'retry-occupied-video' }); await jobs.cancelGeneration(user, source2);
      await prisma.contentItem.update({ where: { id: 'retry-occupied-video' }, data: { scriptId: 'script' } });
      await assert.rejects(jobs.retryFailedGeneration(user, source2), /ya tiene un guion/);
      assert.equal((await prisma.contentItem.findUniqueOrThrow({ where: { id: 'retry-occupied-video' } })).scriptId, 'script');
    });
    await check('reintento con proveedor: cambia modelo y proveedor, conserva pedido y no hereda el modelo de formato', async () => {
      const user = await actor('writer');
      const sourceId = await enqueue({ model: 'gemini-3.8-flash', ctaMode: 'comunidad' });
      await jobs.cancelGeneration(user, sourceId);
      await prisma.appSetting.upsert({ where: { key: 'ai.anthropic.model' }, create: { key: 'ai.anthropic.model', value: 'claude-haiku-4-5' }, update: { value: 'claude-haiku-4-5' } });
      const id = await jobs.retryFailedGeneration(user, sourceId, 'anthropic');
      const child = await prisma.generationJob.findUniqueOrThrow({ where: { id } });
      assert.equal(child.payload.provider, 'anthropic'); assert.equal(child.payload.model, 'claude-haiku-4-5');
      assert.equal(child.payload.request, 'Datos ficticios'); assert.equal(child.payload.ctaMode, 'comunidad');
      assert.equal(child.payload.retryOfJobId, sourceId);
      assert.equal(await jobs.retryFailedGeneration(user, sourceId, 'anthropic'), id);
      await assert.rejects(jobs.retryFailedGeneration(user, sourceId, 'google'), /otro proveedor/);
      const inputs = []; run = async input => { inputs.push(input); throw Error('Fallo ficticio'); };
      await drain(id);
      assert.equal(inputs.length, 1); assert.equal(inputs[0].provider, 'anthropic'); assert.equal(inputs[0].model, 'claude-haiku-4-5');
      // El segundo intento puede volver a Gemini; el historial previo no se reescribe.
      const nextId = await jobs.retryFailedGeneration(user, id, 'google');
      const next = await prisma.generationJob.findUniqueOrThrow({ where: { id: nextId } });
      assert.equal(next.payload.provider, 'google'); assert.match(next.payload.model, /^gemini-/);
      await jobs.cancelGeneration(user, nextId);
      assert.equal((await prisma.generationJob.findUniqueOrThrow({ where: { id: sourceId } })).payload.model, 'gemini-3.8-flash');
      await prisma.appSetting.delete({ where: { key: 'ai.anthropic.model' } });
    });
    await check('reintento con proveedor: rechaza claves ausentes o proveedor inválido sin crear trabajos', async () => {
      const user = await actor('writer'), sourceId = await enqueue(); await jobs.cancelGeneration(user, sourceId);
      const total = await prisma.generationJob.count(), before = calls;
      await assert.rejects(jobs.retryFailedGeneration(user, sourceId, 'otro'), /Elige Claude o Gemini/);
      const key = process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_API_KEY;
      try { await assert.rejects(jobs.retryFailedGeneration(user, sourceId, 'anthropic'), /no tiene una clave de Claude/); }
      finally { process.env.ANTHROPIC_API_KEY = key; }
      assert.equal(await prisma.generationJob.count(), total); assert.equal(calls, before);
    });
    await check('reintento con proveedor: dos pestañas con distinta elección crean un solo sucesor', async () => {
      const user = await actor('writer'), sourceId = await enqueue({ model: 'gemini-3.7-flash' }); await jobs.cancelGeneration(user, sourceId);
      const total = await prisma.generationJob.count();
      const results = await Promise.allSettled(['google', 'anthropic'].map(provider => jobs.retryFailedGeneration(user, sourceId, provider)));
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
      const rejected = results.find(r => r.status === 'rejected'); assert.match(rejected.reason.message, /otro proveedor/);
      const id = results.find(r => r.status === 'fulfilled').value;
      assert.equal(await prisma.generationJob.count(), total + 1);
      const child = await prisma.generationJob.findUniqueOrThrow({ where: { id } });
      if (child.payload.provider === 'google') assert.equal(child.payload.model, 'gemini-3.7-flash');
      else assert.match(child.payload.model, /^claude-/);
      await jobs.cancelGeneration(user, id);
    });
    await check('pendientes: permisos, filtro y paginación después de excluir ancestros y éxitos', async () => {
      const { generationHistory } = load('src/lib/generation-history.ts', mocks);
      await prisma.user.create({ data: { id: 'history-writer', name: 'Historial', email: 'history@p1.test', passwordHash: 'fixture', workProfiles: { create: { profile: 'WRITER' } }, brandAccess: { create: { brandId: 'A' } } } });
      const user = await actor('history-writer');
      for (let index = 0; index < 23; index++) await prisma.generationJob.create({ data: {
        id: `history-${index}`, userId: user.id, sessionVersion: 0, requestKey: randomUUID(), fingerprint: 'fixture', status: 'FAILED',
        createdAt: new Date(Date.UTC(2026, 8, 1, 0, index)), payload: { provider: 'google', model: 'gemini-3.7-flash', request: 'PRIVATE-PROMPT-FIXTURE', brandId: 'A' },
        items: { create: { order: 0, structureId: 'format', status: 'FAILED' } },
      } });
      const successor = await jobs.retryFailedGeneration(user, 'history-22', 'anthropic');
      const first = await generationHistory(user, '1', true), second = await generationHistory(user, '2', true);
      assert.equal(first.jobs.length, 20); assert.equal(first.hasNext, true); assert.equal(second.jobs.length, 2); assert.equal(second.hasNext, false);
      assert.equal(first.total, 22); assert.equal(first.pages, 2);
      assert.equal(new Set([...first.jobs, ...second.jobs].map(j => j.id)).size, 22);
      assert.equal(first.jobs.some(j => j.id === 'history-22' || j.id === successor), false, 'El activo y sus ancestros no aparecen en Por reintentar');
      assert.equal(first.jobs[0].missing, 1); assert.deepEqual(first.jobs[0].formats, ['Fixture']);
      const all = await generationHistory(user); assert.equal(all.jobs[0].id, successor); assert.equal(all.total, 23);
      const last = await generationHistory(user, '999', true); assert.equal(last.page, 2); assert.equal(last.jobs.length, 2);
      assert.equal((await generationHistory(user, '-5', true)).page, 1);
      const publicStatus = await jobs.generationStatus(user, 'history-22');
      assert.equal(publicStatus.requestedProvider, 'google'); assert.equal(publicStatus.requestedModel, 'gemini-3.7-flash');
      assert.equal(publicStatus.items[0].structure.name, 'Fixture'); assert.equal(publicStatus.retryJobId, successor);
      assert.equal(Object.hasOwn(publicStatus, 'payload'), false);
      assert.doesNotMatch(JSON.stringify({ first, second, publicStatus }), /PRIVATE-PROMPT-FIXTURE|fixture-gemini|fixture-claude/);
      assert.equal((await generationHistory(await actor('owner'))).jobs.length, 0, 'Incluso el historial del Dueño muestra sus propias solicitudes');
      assert.equal(await jobs.generationStatus(await actor('other-writer'), 'history-22'), null);
      // COMPLETED no aparece; tampoco un FAILED inconsistente que ya tenga guion.
      await prisma.generationJob.update({ where: { id: 'history-0' }, data: { status: 'COMPLETED', items: { updateMany: { where: {}, data: { status: 'COMPLETED' } } } } });
      const persisted = await prisma.generationItem.findFirstOrThrow({ where: { jobId: 'history-1' } });
      await prisma.script.create({ data: { title: 'Éxito conservado', authorId: user.id, brandId: 'A', generationItemId: persisted.id } });
      const reduced = await generationHistory(user, '2', true);
      assert.equal(reduced.page, 1); assert.equal(reduced.pages, 1); assert.equal(reduced.total, 20); assert.equal(reduced.jobs.length, 20);
      await jobs.cancelGeneration(user, successor);
      assert.equal((await generationHistory(user, '2', true)).jobs.length, 1);
      assert.equal((await generationHistory({ ...user, brandIds: ["A') OR TRUE --"] })).total, 0);
      await prisma.userBrandAccess.deleteMany({ where: { userId: user.id } });
      assert.equal((await generationHistory(await actor(user.id))).jobs.length, 0);
      await assert.rejects(generationHistory({ ...user, profiles: ['PRODUCTION'] }), /permiso|acceso/i);
    });
    await check('pendientes: una sola tarjeta por cadena, solo formatos faltantes y desaparece al completarse', async () => {
      const { generationHistory } = load('src/lib/generation-history.ts', mocks);
      await prisma.user.create({ data: { id: 'pending-writer', name: 'Pendientes', email: 'pending@p1.test', passwordHash: 'fixture', workProfiles: { create: { profile: 'WRITER' } }, brandAccess: { create: { brandId: 'A' } } } });
      await prisma.structure.create({ data: { id: 'pending-third', name: 'Tercero', slug: 'pending-third', defaultDurationSec: 5 } });
      const user = await actor('pending-writer');
      const input = { request: 'Pedido único ficticio', provider: 'google', brandId: 'A' };
      const source = await jobs.enqueueGeneration(user, randomUUID(), ['format', 'retry-format', 'pending-third'], input);
      run = async input => { if (input.structureId !== 'format') throw Error('Fallo ficticio'); return result(); }; await drain(source);
      let list = await generationHistory(user, '1', true);
      assert.equal(list.total, 1); assert.equal(list.jobs[0].id, source); assert.equal(list.jobs[0].missing, 2);
      assert.deepEqual(new Set(list.jobs[0].formats), new Set(['Reintento', 'Tercero']));
      const first = await jobs.retryFailedGeneration(user, source, 'google');
      assert.equal((await generationHistory(user, '1', true)).total, 0, 'Un reintento activo no deja el error antiguo como pendiente de reintentar');
      assert.equal((await generationHistory(user)).jobs[0].id, first);
      run = async input => { if (input.structureId !== 'retry-format') throw Error('Fallo ficticio'); return result(); }; await drain(first);
      list = await generationHistory(user); assert.equal(list.total, 1); assert.equal(list.jobs[0].id, first);
      assert.deepEqual(list.jobs[0].formats, ['Tercero']); assert.equal(list.jobs[0].missing, 1);
      const second = await jobs.retryFailedGeneration(user, first, 'anthropic');
      run = async () => { throw Error('Fallo ficticio'); }; await drain(second);
      // La agrupación también funciona con recibos antiguos cuyo payload fue redactado.
      await prisma.generationJob.updateMany({ where: { id: { in: [source, first] } }, data: { payload: { redacted: true, brandId: 'A' } } });
      list = await generationHistory(user, '1', true); assert.equal(list.total, 1); assert.equal(list.jobs[0].id, second);
      const third = await jobs.retryFailedGeneration(user, second, 'google');
      run = async () => result(); await drain(third);
      for (const failedOnly of [true, false]) {
        list = await generationHistory(user, '900', failedOnly);
        assert.equal(list.total, 0); assert.equal(list.page, 1); assert.equal(list.pages, 1); assert.deepEqual(list.jobs, []);
      }
      assert.equal(await prisma.script.count({ where: { authorId: user.id } }), 3, 'Los guiones completados siguen en la biblioteca');
      const before = calls; assert.equal(await jobs.retryFailedGeneration(user, source), first); assert.equal(calls, before, 'El recibo antiguo evita otro despacho');
      // Dos solicitudes independientes con el mismo texto son pedidos diferentes.
      const separate = [];
      for (let i = 0; i < 2; i++) {
        const id = await jobs.enqueueGeneration(user, randomUUID(), ['format'], input);
        await jobs.cancelGeneration(user, id); separate.push(id);
      }
      assert.equal((await generationHistory(user)).total, 2);
      // Si el Dueño asume un reintento, el miembro no recibe datos ni una acción duplicada.
      const owned = await jobs.retryFailedGeneration(await actor('owner'), separate[0], 'google');
      list = await generationHistory(user); assert.equal(list.total, 1); assert.equal(list.jobs[0].id, separate[1]);
      await drain(owned); assert.equal((await generationHistory(user)).total, 1);
    });
    await check('acción de reintento: registra antes de despachar y nunca expone errores internos', async () => {
      const sourceId = await enqueue(); await jobs.cancelGeneration(await actor('writer'), sourceId);
      const dispatched = [];
      const actions = load('src/app/actions/generation-jobs.ts', { ...mocks, '@/lib/generation-dispatch': { dispatchGeneration: async (id, recover) => { assert.ok(await prisma.generationJob.findUnique({ where: { id } })); dispatched.push({ id, recover }); } } });
      const response = await as('writer', () => actions.retryFailedGenerationJob(sourceId, 'anthropic'));
      assert.equal(response.ok, true); assert.deepEqual(dispatched, [{ id: response.id, recover: true }]);
      assert.equal((await prisma.generationJob.findUniqueOrThrow({ where: { id: response.id } })).payload.provider, 'anthropic');
      await jobs.cancelGeneration(await actor('writer'), response.id);
      const failing = load('src/app/actions/generation-jobs.ts', { ...mocks, '@/lib/generation-dispatch': { dispatchGeneration: async () => { throw Error('postgresql://PRIVATE-FIXTURE'); } } });
      const error = await as('writer', () => failing.retryFailedGenerationJob(sourceId));
      assert.equal(error.ok, false); assert.doesNotMatch(error.error, /PRIVATE-FIXTURE|postgresql/);
    });
  } finally {
    globalThis.fetch = oldFetch;
    for (const [key, value] of Object.entries(oldKeys)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await prisma.$disconnect();
  }
});
