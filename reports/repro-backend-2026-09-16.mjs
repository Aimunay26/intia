/** Diagnóstico, NO test de aceptación: reproduce carencias del commit adbbc91.
 * Solo PostgreSQL local: crea y elimina SU PROPIA base aleatoria *_test.
 * Todos los proveedores se simulan; fetch está bloqueado. No lee .env.
 * DATABASE_URL=<postgres local> node reports/repro-backend-2026-09-16.mjs
 */
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { PrismaClient } from '@prisma/client';
import { assertLocalDatabase } from '../scripts/local-database-only.mjs';
import { load } from '../tests/load-module.mjs';

const require = createRequire(import.meta.url);
const rootUrl = assertLocalDatabase();
const admin = new PrismaClient({ datasourceUrl: rootUrl.href });
const database = `intia_audit_${randomBytes(5).toString('hex')}_test`;
const dbUrl = new URL(rootUrl); dbUrl.pathname = `/${database}`;
const results = [];
let prisma;
const previousFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Error('Red HTTP bloqueada en esta auditoría'); };
const env = { ...process.env, DATABASE_URL: dbUrl.href, AUTH_SECRET: randomBytes(32).toString('hex'), AI_JOBS_ENABLED: 'true', BLOB_PRIVATE_ENABLED: 'false', GENERATION_LOGS: '0', AI_DAILY_JOBS: '50', AI_DAILY_CALLS: '50', AI_USER_DAILY_CALLS: '50' };
Object.assign(process.env, env);
async function probe(id, title, fn) {
  const evidence = await fn(); results.push({ id, title, reproduced: true, evidence });
  console.log(`${id}: reproducido`);
}
const fd = values => { const f = new FormData(); for (const [k, v] of Object.entries(values)) f.append(k, String(v)); return f; };
const swallowRedirect = async fn => { try { return await fn(); } catch (e) { if (!e.message.startsWith('REDIRECT:')) throw e; } };
let created = false;
try {
  await admin.$executeRawUnsafe(`CREATE DATABASE "${database}"`); created = true;
  const migration = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env, encoding: 'utf8' });
  assert.equal(migration.status, 0, migration.stderr);
  prisma = new PrismaClient({ datasourceUrl: dbUrl.href });
  const context = new AsyncLocalStorage();
  const mocks = {
    '@/lib/prisma': { prisma },
    'next/headers': { cookies: async () => ({ get: k => context.getStore()?.has(k) ? { value: context.getStore().get(k) } : undefined, set: (k, v) => context.getStore().set(k, v), delete: k => context.getStore().delete(k) }) },
    'next/cache': { revalidatePath() {}, revalidateTag() {} },
    'next/navigation': { redirect: path => { throw Error('REDIRECT:' + path); }, notFound() { throw Error('NOT_FOUND'); } },
  };
  const auth = load('src/lib/auth.ts', mocks);
  const as = async (id, fn) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id } });
    return context.run(new Map(), async () => { await auth.createSession(id, user.sessionVersion); return fn(); });
  };
  const actor = id => as(id, () => auth.requireUser());
  await prisma.user.create({ data: { id: 'owner', name: 'Owner fixture', email: 'owner@audit.test', role: 'OWNER', passwordHash: 'fixture' } });
  for (const id of ['A', 'B']) await prisma.brand.create({ data: { id, name: `Marca ${id}`, slug: `audit-${id}` } });
  await prisma.user.create({ data: { id: 'writer', name: 'Writer fixture', email: 'writer@audit.test', passwordHash: 'fixture', workProfiles: { create: { profile: 'WRITER' } }, brandAccess: { create: { brandId: 'A' } } } });
  const scripts = load('src/app/actions/scripts.ts', mocks);
  const assets = load('src/app/actions/assets.ts', mocks);
  const content = load('src/app/actions/content.ts', mocks);
  const structures = load('src/app/actions/structures.ts', mocks);
  const events = load('src/app/actions/events.ts', mocks);
  const structure = await prisma.structure.create({ data: { id: 'format', name: 'Formato fixture', slug: 'audit-format' } });
  const script = await prisma.script.create({ data: { id: 'script', title: 'Guion publicado', authorId: 'writer', brandId: 'A', status: 'BORRADOR', scenes: { create: { id: 'scene', order: 0, beat: 'Inicio', voice: 'Original', startSec: 0, endSec: 5 } } } });
  await prisma.contentItem.create({ data: { id: 'closed', title: 'Video publicado', scheduledDate: new Date('2026-09-16T12:00:00Z'), brandId: 'A', scriptId: script.id, status: 'PUBLICADO', checklist: { create: { id: 'approval', stage: 'POSTPRODUCCION', label: 'Revisión final aprobada', done: true, doneById: 'owner' } } } });

  await probe('R01', 'Guionista edita una escena vinculada a un video publicado y aprobado', async () => {
    const revision = await prisma.script.findUniqueOrThrow({ where: { id: script.id } });
    await as('writer', () => scripts.actualizarEscena(fd({ id: 'scene', expectedUpdatedAt: revision.updatedAt.toISOString(), voice: 'Modificado después de publicar', startSec: 0, endSec: 5 })));
    const scene = await prisma.scriptScene.findUniqueOrThrow({ where: { id: 'scene' } });
    const video = await prisma.contentItem.findUniqueOrThrow({ where: { id: 'closed' } });
    const check = await prisma.checklistItem.findUniqueOrThrow({ where: { id: 'approval' } });
    assert.equal(scene.voice, 'Modificado después de publicar'); assert.equal(check.done, true); assert.equal(video.status, 'PUBLICADO');
    return { actor: 'WRITER', scriptStatus: revision.status, videoStatus: video.status, approvalStillDone: check.done, sceneChanged: true };
  });
  await probe('R02', 'Referencia documental modificable después de aprobación final', async () => {
    await prisma.asset.create({ data: { id: 'asset', ownerType: 'content', ownerId: 'closed', filename: 'fixture.txt', mimeType: 'text/plain', size: 1, data: Buffer.from('x'), extractedText: 'Original' } });
    await as('writer', () => assets.updateAssetText(fd({ id: 'asset', extractedText: 'Referencia modificada' })));
    assert.equal((await prisma.asset.findUniqueOrThrow({ where: { id: 'asset' } })).extractedText, 'Referencia modificada');
    return { actor: 'WRITER', videoStatus: 'PUBLICADO', referenceChanged: true };
  });

  const Genai = require('@google/genai');
  let requests = 0;
  const generated = { title: 'Fixture', avatar: '', focus: '', hook: '', cta: '', totalSeconds: 5, castNotes: '', propsSummary: [], scenes: [{ beat: 'Inicio', startSec: 0, endSec: 5, voiceType: 'EN_CAMARA', voice: 'Texto fixture', shot: '', action: '', actors: [], emotion: '', props: [], lighting: '', sound: '', onScreenText: '', location: '', notes: '' }] };
  const providers = load('src/lib/ai/providers.ts', { ...mocks, '@google/genai': { ...Genai, GoogleGenAI: class { models = { generateContent: async () => { requests++; if (requests % 2) throw new Genai.ApiError({ status: 400, message: 'responseJsonSchema is not supported' }); return { text: JSON.stringify(generated) }; } }; } } });
  const normalizeSceneTimes = load('src/lib/ai/index.ts', { ...mocks, '@/lib/ai/providers': providers }).normalizeSceneTimes;
  let mode = 'late';
  const ai = { AiError: providers.AiError, normalizeSceneTimes, generateScript: async input => {
    if (mode === 'late') await prisma.contentItem.update({ where: { id: input.contentItemId }, data: { status: 'CANCELADO' } });
    const response = mode === 'fallback' ? await providers.generateWithGemini({ apiKey: 'fake-not-a-key', model: 'fixture', system: 'fixture', user: 'fixture' }) : { script: generated, raw: JSON.stringify(generated), provider: 'google', model: 'fixture' };
    return { ...response, systemPrompt: 'fixture', referencesUsed: [] };
  } };
  const jobs = load('src/lib/generation-jobs.ts', { ...mocks, '@/lib/ai': ai, '@/lib/ai/providers': providers });
  await probe('R03', 'Generación en curso vincula un guion tras cancelar el video', async () => {
    await prisma.contentItem.create({ data: { id: 'late', title: 'Cancelar durante IA', scheduledDate: new Date('2026-09-16T12:00:00Z'), brandId: 'A' } });
    const id = await jobs.enqueueGeneration(await actor('writer'), randomUUID(), [structure.id], { request: 'Fixture', provider: 'google', brandId: 'A', contentItemId: 'late' });
    await jobs.processGeneration(id); await jobs.processGeneration(id);
    const video = await prisma.contentItem.findUniqueOrThrow({ where: { id: 'late' } });
    const job = await prisma.generationJob.findUniqueOrThrow({ where: { id } });
    assert.equal(video.status, 'CANCELADO'); assert.ok(video.scriptId); assert.equal(job.status, 'COMPLETED');
    return { videoStatus: video.status, linkedAfterCancellation: true, jobStatus: job.status };
  });
  await probe('R04', 'Fallback Gemini realiza dos peticiones, pero descuenta una llamada', async () => {
    mode = 'fallback';
    const key = `ai:calls:${load('src/lib/resource-limits.ts', mocks).usageDay()}`;
    const before = await prisma.usageCounter.findUnique({ where: { key } });
    const id = await jobs.enqueueGeneration(await actor('writer'), randomUUID(), [structure.id], { request: 'Fixture', provider: 'google', brandId: 'A' });
    await jobs.processGeneration(id); await jobs.processGeneration(id);
    const after = await prisma.usageCounter.findUniqueOrThrow({ where: { key } });
    const item = await prisma.generationItem.findFirstOrThrow({ where: { jobId: id } });
    const units = Number(after.amount - (before?.amount ?? 0n));
    assert.equal(requests, 2); assert.equal(units, 1); assert.equal(item.status, 'COMPLETED');
    return { simulatedProviderRequests: requests, quotaUnits: units, attempts: item.attempts };
  });
  await probe('R05', 'Eliminar estructura deja referencias previstas y trabajos pendientes huérfanos', async () => {
    await prisma.structure.create({ data: { id: 'delete-format', name: 'Solo previsto', slug: 'audit-delete' } });
    await prisma.contentItem.create({ data: { id: 'planned', title: 'Video previsto', scheduledDate: new Date('2026-09-16T12:00:00Z'), brandId: 'A', structureIds: JSON.stringify(['delete-format']) } });
    const jobId = await jobs.enqueueGeneration(await actor('writer'), randomUUID(), ['delete-format'], { request: 'Fixture', provider: 'google', brandId: 'A' });
    await as('owner', () => swallowRedirect(() => structures.eliminarEstructura(fd({ id: 'delete-format' }))));
    const video = await prisma.contentItem.findUniqueOrThrow({ where: { id: 'planned' } });
    const item = await prisma.generationItem.findFirstOrThrow({ where: { jobId } });
    assert.equal(await prisma.structure.count({ where: { id: 'delete-format' } }), 0); assert.ok(JSON.parse(video.structureIds).includes('delete-format')); assert.equal(item.structureId, 'delete-format');
    return { deleted: true, plannedReferenceRemains: true, queuedReferenceRemains: true };
  });
  await probe('R06', 'Evento puede pertenecer a una marca distinta de su video', async () => {
    await as('owner', () => events.crearEvento(fd({ title: 'Evento inconsistente', brandId: 'B', contentItemId: 'closed', startDate: '2026-09-16', allDay: 'on' })));
    const event = await prisma.calendarEvent.findFirstOrThrow({ where: { title: 'Evento inconsistente' }, include: { contentItem: true } });
    assert.equal(event.brandId, 'B'); assert.equal(event.contentItem.brandId, 'A');
    return { eventBrand: event.brandId, contentBrand: event.contentItem.brandId };
  });
  await probe('R07', 'Salida IA de 10000 segundos se acepta para un pedido de 30 segundos', async () => {
    const bad = { ...generated, totalSeconds: 10000, scenes: [{ ...generated.scenes[0], endSec: 10000, voice: '', action: '', shot: '' }] };
    const parsed = providers.parseScriptJson(JSON.stringify(bad)); assert.ok(parsed);
    const persist = load('src/lib/generation-persist.ts', { ...mocks, '@/lib/ai': ai });
    const user = await actor('owner');
    const jobId = await jobs.enqueueGeneration(user, randomUUID(), [structure.id], { request: 'Fixture', provider: 'google', brandId: 'A', durationSec: 30 });
    const item = await prisma.generationItem.findFirstOrThrow({ where: { jobId } });
    const scriptId = await prisma.$transaction(tx => persist.persistGeneratedScript(tx, user, item.id, { structureId: structure.id, brandId: 'A', provider: 'google', request: 'Fixture', durationSec: 30 }, { script: parsed, raw: JSON.stringify(bad), provider: 'google', model: 'fixture', systemPrompt: 'fixture', referencesUsed: [] }));
    const row = await prisma.script.findUniqueOrThrow({ where: { id: scriptId } }); assert.equal(row.totalSeconds, 10000);
    return { requestedSeconds: 30, savedSeconds: row.totalSeconds, emptyVoiceAccepted: true };
  });
  await probe('R08', 'Previsualización documental llama IA con trabajos deshabilitados y cupos cero', async () => {
    let extractionCalls = 0;
    const settings = load('src/lib/settings.ts', mocks);
    const preview = load('src/app/actions/importar-documento.ts', { ...mocks,
      '@/lib/settings': { ...settings, getSetting: async () => 'google', resolveApiKey: async () => ({ key: 'fake-not-a-key', source: 'db' }) },
      '@google/genai': { ...Genai, GoogleGenAI: class { models = { generateContent: async () => { extractionCalls++; return { text: '{}' }; } }; } },
    });
    process.env.AI_JOBS_ENABLED = 'false'; process.env.AI_DAILY_CALLS = '0'; process.env.AI_USER_DAILY_CALLS = '0';
    const countersBefore = await prisma.usageCounter.findMany({ orderBy: { key: 'asc' } });
    const form = fd({ tipo: 'brief', destino: 'marca' });
    form.set('file', new File(['BRIEF MAESTRO\nMarca ficticia para una auditoría local. Público adulto. Tono claro. Este texto no contiene datos reales ni privados.'], 'fixture.txt', { type: 'text/plain' }));
    const result = await as('owner', () => preview.previsualizarDocumento(form));
    assert.equal(result.ok, true); assert.equal(extractionCalls, 1);
    assert.deepEqual(await prisma.usageCounter.findMany({ orderBy: { key: 'asc' } }), countersBefore);
    Object.assign(process.env, { AI_JOBS_ENABLED: 'true', AI_DAILY_CALLS: '50', AI_USER_DAILY_CALLS: '50' });
    return { aiJobsEnabled: false, dailyLimit: 0, simulatedProviderCalls: extractionCalls, countersChanged: false };
  });
  await probe('R09', 'Edición manual de compatibilidad conserva origen SEED', async () => {
    await prisma.archetype.create({ data: { id: 'person', name: 'Persona fixture', slug: 'audit-person' } });
    await prisma.archetypeFit.create({ data: { archetypeId: 'person', structureId: structure.id, score: 1, source: 'SEED' } });
    const archetypes = load('src/app/actions/archetypes.ts', mocks);
    await as('owner', () => archetypes.guardarCompatibilidad(fd({ archetypeId: 'person', structureId: structure.id, score: 3, notes: 'Revisión humana' })));
    const fit = await prisma.archetypeFit.findUniqueOrThrow({ where: { archetypeId_structureId: { archetypeId: 'person', structureId: structure.id } } });
    assert.equal(fit.score, 3); assert.equal(fit.source, 'SEED');
    return { savedScore: fit.score, sourceAfterManualEdit: fit.source };
  });
  const indexes = await prisma.$queryRaw`SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname`;
  const constraints = await prisma.$queryRaw`SELECT c.conrelid::regclass::text AS table_name, c.conname AS name, pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'public' AND c.contype = 'c' ORDER BY table_name, name`;
  const out = { date: '2026-09-16', scope: 'PostgreSQL local efímero, acciones reales, SDK de IA simulado, sin HTTP ni datos de producción', auditedCommit: 'adbbc916dcccdb6a5fb3ef09d48ef3f5b217b812', results, indexes, constraints };
  writeFileSync(new URL('./backend-audit-probes-2026-09-16.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
  console.log(`${results.length} reproducciones completadas. Evidencias guardadas en reports/backend-audit-probes-2026-09-16.json`);
} finally {
  globalThis.fetch = previousFetch;
  await prisma?.$disconnect();
  if (created) await admin.$executeRawUnsafe(`DROP DATABASE "${database}" WITH (FORCE)`);
  await admin.$disconnect();
}
