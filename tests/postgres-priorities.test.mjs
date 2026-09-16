import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { PrismaClient } from '@prisma/client';
import { load } from './load-module.mjs';
import { validScript } from './ai-fixture.mjs';

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
  globalThis.fetch = async () => { throw Error('HTTP externo prohibido en esta suite'); };
  const check = (name, fn) => t.test(name, async () => { await prisma.usageCounter.deleteMany(); run = async () => result(); await fn(); });
  try {
    await prisma.user.create({ data: { id: 'owner', name: 'Owner', email: 'owner@p1.test', role: 'OWNER', passwordHash: 'fixture' } });
    await prisma.brand.createMany({ data: ['A', 'B'].map(id => ({ id, name: id, slug: id })) });
    for (const [id, profile] of [['writer', 'WRITER'], ['strategy', 'STRATEGY']]) await prisma.user.create({ data: { id, name: id, email: id + '@p1.test', passwordHash: 'fixture', workProfiles: { create: { profile } }, brandAccess: { create: { brandId: 'A' } } } });
    await prisma.structure.create({ data: { id: 'format', name: 'Fixture', slug: 'fixture', defaultDurationSec: 5 } });
    await prisma.script.create({ data: { id: 'script', title: 'Guion protegido', authorId: 'writer', brandId: 'A', scenes: { create: { id: 'scene', order: 0, beat: 'Inicio', startSec: 0, endSec: 5, voice: 'Original' } } } });
    await video('closed', { scriptId: 'script', status: 'PUBLICADO', checklist: { create: { id: 'approval', stage: 'POSTPRODUCCION', label: 'Revisión final aprobada', done: true, doneById: 'owner' } } });
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
      await assert.rejects(as('strategy', () => content.alternarCheck(fd({ id: 'approval', done: '' }))), /motivo de reapertura/);
      await as('strategy', () => content.alternarCheck(fd({ id: 'approval', done: '', reason: 'Corregir referencias de producción' })));
      assert.ok(await prisma.auditLog.count({ where: { entityId: 'approval', summary: { contains: 'Corregir referencias de producción' } } }));
      await assert.rejects(as('writer', () => assets.updateAssetText(fd({ id: 'asset', extractedText: 'Cambio' }))), /reabrir/);
      const row = await prisma.contentItem.findUniqueOrThrow({ where: { id: 'closed' } });
      await as('strategy', () => content.cambiarEstado(fd({ id: 'closed', status: 'GUION', expectedUpdatedAt: row.updatedAt.toISOString() })));
      await as('writer', () => assets.updateAssetText(fd({ id: 'asset', extractedText: 'Cambio permitido' })));
      assert.equal((await prisma.checklistItem.findUniqueOrThrow({ where: { id: 'approval' } })).done, false);
      await as('strategy', () => content.alternarCheck(fd({ id: 'approval', done: 'on' })));
      await as('owner', () => assets.updateAssetText(fd({ id: 'asset', extractedText: 'Excepción del dueño' })));
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
      await video('approved-empty', { checklist: { create: { stage: 'POSTPRODUCCION', label: 'Revisión final aprobada', done: true } } });
      await assert.rejects(enqueue({ contentItemId: 'approved-empty' }), /Reabre la aprobación/);
      assert.equal(await prisma.usageCounter.count(), 0);
    });
    for (const [kind, change, message] of [
      ['cancelled', id => prisma.contentItem.update({ where: { id }, data: { status: 'CANCELADO' } }), /Idea o Guion/],
      ['published', id => prisma.contentItem.update({ where: { id }, data: { status: 'PUBLICADO' } }), /Idea o Guion/],
      ['revision', id => prisma.contentItem.update({ where: { id }, data: { title: 'Otra planificación' } }), /planificación.*cambió/],
      ['approval', id => prisma.checklistItem.create({ data: { contentItemId: id, stage: 'POSTPRODUCCION', label: 'Revisión final aprobada', done: true } }), /aprobación final/],
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
    await check('B03: probar Claude también respeta interruptor, cupo y plazo', async () => {
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
    });
    await check('B03: un solo cupo impide fallback, y clave ausente falla sin reservar llamada', async () => {
      process.env.AI_DAILY_CALLS = '1'; const before = providerCalls;
      response = async () => { throw new Genai.ApiError({ status: 400, message: 'responseJsonSchema is not supported' }); };
      try { const id = await enqueue({}, engine); await drain(id, engine); assert.equal(providerCalls - before, 1); assert.match((await prisma.generationJob.findUniqueOrThrow({ where: { id } })).status, /FAILED/); }
      finally { delete process.env.AI_DAILY_CALLS; }
      await prisma.usageCounter.deleteMany(); key = null;
      try { const id = await enqueue({}, engine); await drain(id, engine); assert.equal(await prisma.usageCounter.count({ where: { key: { startsWith: 'ai:calls:' } } }), 0); }
      finally { key = 'fake-key'; }
    });
    await check('B04: local no llama IA; selección explícita respeta apagado/cupo/deduplicación diaria', async () => {
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
      try { await as('strategy', () => preview.previsualizarDocumento(form)); assert.equal(providerCalls, before); }
      finally { delete process.env.AI_DAILY_CALLS; }
      await as('strategy', () => preview.previsualizarDocumento(form)); assert.equal(providerCalls, before + 1);
      await as('strategy', () => preview.previsualizarDocumento(form)); assert.equal(providerCalls, before + 1);
      assert.equal((await prisma.usageCounter.findUniqueOrThrow({ where: { key: `ai:calls:${limits.usageDay()}` } })).amount, 1n);
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
      assert.equal(item.status, 'FAILED'); assert.equal(item.response, null); assert.match(item.error, /necesita revisión/);
      const recovered = await enqueue();
      await prisma.generationItem.updateMany({ where: { jobId: recovered }, data: { response: invalid, attempts: 1 } });
      await drain(recovered); assert.equal(calls, before + 1);
    });
  } finally { globalThis.fetch = oldFetch; await prisma.$disconnect(); }
});
