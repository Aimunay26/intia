import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { load } from './load-module.mjs';
import { validScript } from './ai-fixture.mjs';

const url = process.env.ORGANIZATION_AI_TEST_DATABASE_URL;
if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname) || !new URL(url).pathname.endsWith('_test')) throw Error('Solo fixture local');
const db = new PrismaClient({ datasourceUrl: url });
let actor;
const mocks = {
  '@/lib/prisma': { prisma: db },
  '@/lib/auth': { requireUser: async () => actor, can: role => role === 'OWNER', LEVEL: { OWNER: 2 } },
  'next/cache': { revalidatePath() {} },
};
const settings = load('src/lib/settings.ts', mocks);
const actions = load('src/app/actions/app-settings.ts', mocks);
const calls = [], traces = [];
const providers = load('src/lib/ai/providers.ts', mocks);
const jobs = load('src/lib/generation-jobs.ts', {
  ...mocks,
  '@/lib/ai/providers': {
    ...providers,
    generateWithClaude: () => assert.fail('No se pidió Claude'),
    // Solo se simula el proveedor. Cola, permisos, cifrado y guardado son reales.
    generateWithGemini: call => call.request(async () => {
      calls.push({ key: call.apiKey, source: call.keySource });
      return { script: validScript, raw: JSON.stringify(validScript), provider: 'google', model: call.model, inputTokens: 10, outputTokens: 20 };
    }),
  },
});
const form = async values => {
  const data = new FormData();
  const revision = (await settings.getSettingsSnapshot(Object.values(settings.SETTING_KEYS))).revision;
  for (const [key, value] of Object.entries({ expectedUpdatedAt: revision, orgName: 'Organización fixture', defaultProvider: 'google', ...values })) data.set(key, String(value));
  return data;
};
const enqueue = (user, brandId = 'A') => jobs.enqueueGeneration(user, randomUUID(), ['format'], { request: 'Pedido ficticio', provider: 'google', brandId });
const drain = async id => {
  for (let n = 0; n < 6; n++) { if ((await jobs.processGeneration(id)).done) return; }
  throw Error('El trabajo local no terminó');
};

test('IA de la organización: credencial compartida, permisos y rotación con PostgreSQL real', async t => {
  const names = ['APP_SECRETS_KEYS', 'APP_SECRETS_ACTIVE_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'ANTHROPIC_API_KEY', 'AI_JOBS_ENABLED'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const logs = { info: console.info, warn: console.warn, error: console.error };
  try {
    process.env.APP_SECRETS_KEYS = JSON.stringify({ fixture: randomBytes(32).toString('base64') });
    process.env.APP_SECRETS_ACTIVE_KEY = 'fixture';
    process.env.AI_JOBS_ENABLED = 'true';
    process.env.GEMINI_API_KEY = 'fixture-environment-shared';
    delete process.env.GOOGLE_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    console.info = console.warn = console.error = (...parts) => traces.push(parts);
    const owner = await db.user.create({ data: { id: 'owner', name: 'Dueño', email: 'owner@organization.test', role: 'OWNER', passwordHash: 'fixture' } });
    actor = owner;
    await db.brand.createMany({ data: ['A', 'B'].map(id => ({ id, name: 'Marca ' + id, slug: id })) });
    await db.structure.create({ data: { id: 'format', name: 'Formato', slug: 'format', defaultDurationSec: 5 } });
    const writers = [];
    for (const brandId of ['A', 'B']) {
      const user = await db.user.create({ data: { name: 'Guionista ' + brandId, email: brandId + '@organization.test', role: 'MEMBER', passwordHash: 'fixture', workProfiles: { create: { profile: 'WRITER' } }, brandAccess: { create: { brandId } } } });
      writers.push({ ...user, profiles: ['WRITER'], brandIds: [brandId] });
    }
    const key = 'fixture-organization-key', rotated = 'fixture-organization-rotated';

    await t.test('la clave se guarda una vez, cifrada y sin pertenecer al usuario', async () => {
      assert.ok((await actions.guardarAjustes(null, await form({ googleKey: key }))).ok);
      const rows = await db.appSecret.findMany();
      assert.equal(rows.length, 1);
      assert.equal(rows[0].key, 'ai.google.apiKey');
      assert.ok(!JSON.stringify(rows).includes(key));
      assert.equal(await db.appSetting.count({ where: { key: 'ai.google.apiKey' } }), 0);
      assert.equal((await settings.resolveApiKey('google')).key, key);
    });

    await t.test('Dueño y dos guionistas de marcas distintas generan con la misma clave', async () => {
      for (const [user, brandId] of [[owner, 'A'], [writers[0], 'A'], [writers[1], 'B']]) {
        const id = await enqueue(user, brandId);
        await drain(id);
        const script = await db.script.findFirstOrThrow({ where: { generationItem: { jobId: id } } });
        assert.equal(script.authorId, user.id);
        assert.equal(script.brandId, brandId);
      }
      assert.equal(calls.length, 3);
      assert.ok(calls.every(call => call.key === key && call.source === 'db'));
    });

    await t.test('compartir no permite administrar claves ni generar para otra marca', async () => {
      actor = writers[0];
      for (const change of [{ googleKey: 'fixture-not-authorized' }, { quitarGoogleKey: '1' }]) {
        assert.match((await actions.guardarAjustes(null, await form(change))).error, /Solo el dueño/);
      }
      await assert.rejects(enqueue(writers[0], 'B'), /acceso|permiso/i);
      const reader = await db.user.create({ data: { name: 'Producción', email: 'reader@organization.test', passwordHash: 'fixture', workProfiles: { create: { profile: 'PRODUCTION' } }, brandAccess: { create: { brandId: 'A' } } } });
      await assert.rejects(enqueue({ ...reader, profiles: ['PRODUCTION'], brandIds: ['A'] }), /permiso/i);
      assert.equal(calls.length, 3);
      assert.equal((await settings.resolveApiKey('google')).key, key);
      actor = owner;
    });

    await t.test('un trabajo pendiente usa la clave rotada, sin copiarla a la cola o sesión', async () => {
      const pending = await enqueue(writers[0]);
      assert.ok((await actions.guardarAjustes(null, await form({ googleKey: rotated }))).ok);
      await drain(pending);
      assert.equal(calls.at(-1).key, rotated);
      // Un campo vacío conserva la configuración existente.
      assert.ok((await actions.guardarAjustes(null, await form({ googleKey: '' }))).ok);
      assert.equal((await settings.resolveApiKey('google')).key, rotated);
    });

    await t.test('desactivar a quien guardó la clave no la revoca para la organización', async () => {
      await db.user.update({ where: { id: owner.id }, data: { active: false } });
      await drain(await enqueue(writers[1], 'B'));
      assert.equal(calls.at(-1).key, rotated);
      await db.user.update({ where: { id: owner.id }, data: { active: true } });
      actor = await db.user.findUniqueOrThrow({ where: { id: owner.id } });
    });

    await t.test('revocar acceso de un miembro cancela su trabajo antes de usar la clave', async () => {
      const pending = await enqueue(writers[0]), before = calls.length;
      await db.user.update({ where: { id: writers[0].id }, data: { active: false } });
      await drain(pending);
      assert.equal(calls.length, before);
      assert.equal((await db.generationJob.findUniqueOrThrow({ where: { id: pending } })).status, 'CANCELLED');
      await db.user.update({ where: { id: writers[0].id }, data: { active: true } });
    });

    await t.test('quitar la clave usa el respaldo compartido; sin respaldo no llama al proveedor', async () => {
      assert.ok((await actions.guardarAjustes(null, await form({ quitarGoogleKey: '1' }))).ok);
      await drain(await enqueue(writers[1], 'B'));
      assert.deepEqual(calls.at(-1), { key: 'fixture-environment-shared', source: 'env' });
      delete process.env.GEMINI_API_KEY;
      const before = calls.length, pending = await enqueue(writers[0]);
      await drain(pending);
      assert.equal(calls.length, before);
      const job = await db.generationJob.findUniqueOrThrow({ where: { id: pending }, include: { items: true } });
      assert.equal(job.status, 'FAILED');
      assert.match(job.items[0].error, /clave.*organización/);
    });

    await t.test('estado y auditoría no revelan claves; consultarlos no necesita descifrar', async () => {
      assert.ok((await actions.guardarAjustes(null, await form({ googleKey: rotated }))).ok);
      delete process.env.APP_SECRETS_ACTIVE_KEY;
      process.env.APP_SECRETS_KEYS = '{}';
      const status = await settings.aiStatus(), snapshot = await settings.getSettingsSnapshot(Object.values(settings.SETTING_KEYS));
      assert.equal(status.google.configured, true);
      const visible = JSON.stringify([status, snapshot, traces, await db.auditLog.findMany(), await db.generationJob.findMany({ include: { items: true } }), await db.authSession.findMany()]);
      for (const secret of [key, rotated, 'fixture-environment-shared']) assert.ok(!visible.includes(secret));
    });
  } finally {
    Object.assign(console, logs);
    for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; }
    await db.$disconnect();
  }
});
