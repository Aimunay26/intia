import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { load } from './load-module.mjs';

/**
 * Flujo de producción contra PostgreSQL real (migraciones aplicadas por scripts/test-postgres.mjs):
 * sesiones firmadas y permisos reales, revisión con lockRevision, SAVEPOINT dentro de una
 * transacción interactiva de Prisma y barrido diario idempotente.
 */
const url = process.env.PRODUCTION_FLOW_TEST_DATABASE_URL;
if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname) || !new URL(url).pathname.endsWith('_test')) throw Error('Solo DB local efímera _test.');
process.env.AUTH_SECRET = randomBytes(32).toString('hex');
process.env.PRODUCTION_FLOW_ENABLED = 'true';
const prisma = new PrismaClient({ datasourceUrl: url }), context = new AsyncLocalStorage();
const mocks = {
  '@/lib/prisma': { prisma },
  'next/headers': { cookies: async () => ({ get: key => context.getStore().get(key) ? { value: context.getStore().get(key) } : undefined, set: (key, value) => context.getStore().set(key, value), delete: key => context.getStore().delete(key) }), headers: async () => new Headers() },
  'next/cache': { revalidatePath: () => {}, revalidateTag: () => {} },
  'next/navigation': { redirect: path => { throw Error('REDIRECT:' + path); }, notFound: () => { throw Error('NOT_FOUND'); } },
};
const auth = load('src/lib/auth.ts', mocks), flow = load('src/lib/domain/production-flow.ts', mocks);
const production = load('src/app/actions/production.ts', mocks), team = load('src/app/actions/brand-team.ts', mocks), sweep = load('src/lib/production-sweep.ts', mocks);
const form = values => { const fd = new FormData(); for (const [key, value] of Object.entries(values)) for (const item of Array.isArray(value) ? value : [value]) fd.append(key, String(item)); return fd; };
const as = async (id, fn) => { const u = await prisma.user.findUniqueOrThrow({ where: { id } }), jar = new Map(); await context.run(jar, () => auth.createSession(id, u.sessionVersion)); return context.run(jar, fn); };
const MON_10 = new Date('2026-09-28T15:00:00.000Z');
const quietly = async fn => { const { warn, info } = console; console.warn = () => {}; console.info = () => {}; try { return await fn(); } finally { console.warn = warn; console.info = info; } };

test('flujo de producción con PostgreSQL: equipo, grabación, edición, diseño, savepoint y barrido', async () => {
  try {
    await prisma.user.create({ data: { id: 'owner', name: 'Yoryo', email: 'owner@flow.test', role: 'OWNER', passwordHash: 'fixture' } });
    await prisma.brand.create({ data: { id: 'A', name: 'Con Amor', slug: 'flow-a' } });
    const members = { edward: ['WRITER', 'STRATEGY'], carlos: ['CAMERA'], laudder: ['EDITOR'], silvanna: ['PUBLISHER'], diego: ['DESIGNER'] };
    for (const [id, profiles] of Object.entries(members)) {
      await prisma.user.create({ data: { id, name: id[0].toUpperCase() + id.slice(1), email: `${id}@flow.test`, passwordHash: 'fixture' } });
      await prisma.userWorkProfile.createMany({ data: profiles.map(profile => ({ userId: id, profile })) });
      await prisma.userBrandAccess.create({ data: { userId: id, brandId: 'A' } });
    }
    await prisma.taskColumn.create({ data: { id: 'col', name: 'Plan', order: 0 } });
    for (const [id, title, status] of [['v1', 'Video uno', 'GUION'], ['v2', 'FALLA controlada', 'GUION'], ['v3', 'Video atrasado', 'GRABACION']]) {
      await prisma.contentItem.create({ data: { id, title, status, brandId: 'A', scheduledDate: new Date('2026-09-28T12:00:00.000Z') } });
    }

    // Equipo de la marca desde la acción real (Dueño), con revisión "new" y conflicto al repetirla.
    const payload = { brandId: 'A', expectedUpdatedAt: 'new', 'role-ENCARGADO': 'edward', 'role-GUIONISTA': 'edward', 'role-FILMMAKER': 'carlos', 'role-EDITOR': 'laudder', 'role-COMMUNITY': 'silvanna', 'role-DISENADOR': 'diego', recordingWeekdays: [4, 2], autoAssign: '1' };
    assert.equal(await as('owner', () => team.guardarEquipoDeMarca(form(payload))), undefined);
    assert.equal(await prisma.brandTeamMember.count({ where: { brandId: 'A' } }), 6);
    assert.equal((await prisma.brandProductionSettings.findUniqueOrThrow({ where: { brandId: 'A' } })).recordingWeekdays, '[2,4]');
    assert.match((await as('owner', () => team.guardarEquipoDeMarca(form(payload)))).error, /Este registro cambió/);
    await assert.rejects(as('carlos', () => team.guardarEquipoDeMarca(form(payload))), /permiso/);

    // Grabación: próximo martes, filmmaker, tarea y paso en una transacción serializable real.
    const scheduled = await prisma.$transaction(tx => flow.scheduleRecording(tx, null, 'v1', { now: MON_10 }), { isolationLevel: 'Serializable' });
    assert.equal(scheduled.done, true);
    const v1 = await prisma.contentItem.findUniqueOrThrow({ where: { id: 'v1' } });
    assert.equal(v1.shootDate.toISOString(), '2026-09-29T12:00:00.000Z');
    const recording = await prisma.productionStep.findUniqueOrThrow({ where: { automationKey: 'v1:GRABACION' }, include: { task: true } });
    assert.equal(recording.assigneeId, 'carlos');
    assert.equal(recording.brandId, 'A');
    assert.equal(recording.dueAt.toISOString(), '2026-09-30T04:59:59.999Z');
    assert.equal(recording.task.title, 'Grabar: Video uno');
    assert.equal(await prisma.assignment.count({ where: { contentItemId: 'v1', userId: 'carlos', role: 'CAMARA' } }), 1);
    assert.equal((await prisma.$transaction(tx => flow.scheduleRecording(tx, null, 'v1', { now: MON_10 }))).reason, 'exists');

    // Un fallo al crear la entrega revierte también las escrituras previas de la acción principal.
    await prisma.$executeRawUnsafe(`CREATE FUNCTION flow_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.title LIKE '%FALLA%' THEN RAISE EXCEPTION 'falla de prueba'; END IF; RETURN NEW; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER flow_test_fail BEFORE INSERT ON "Task" FOR EACH ROW EXECUTE FUNCTION flow_test_fail()`);
    await assert.rejects(quietly(() => prisma.$transaction(async tx => {
      await tx.contentItem.update({ where: { id: 'v2' }, data: { notes: 'escritura principal' } });
      const result = await flow.scheduleRecording(tx, null, 'v2', { now: MON_10 });
      await tx.contentItem.update({ where: { id: 'v2' }, data: { hook: 'sigue viva' } });
      return result;
    }, { isolationLevel: 'Serializable' })), /falla de prueba/);
    const v2 = await prisma.contentItem.findUniqueOrThrow({ where: { id: 'v2' } });
    assert.equal(v2.notes, null);
    assert.equal(v2.hook, null);
    assert.equal(v2.shootDate, null, 'la fecha escrita por la automatización se deshizo con su savepoint');
    assert.equal(await prisma.assignment.count({ where: { contentItemId: 'v2' } }), 0);
    assert.equal(await prisma.productionStep.count({ where: { contentItemId: 'v2' } }), 0);
    await prisma.$executeRawUnsafe(`DROP TRIGGER flow_test_fail ON "Task"`);

    // Pedido de diseño del guionista: 24 h, asignación que le da acceso al diseñador.
    assert.equal(await as('edward', () => production.pedirDiseno(form({ contentItemId: 'v1', notes: 'Miniatura' }))), undefined);
    const design = await prisma.productionStep.findFirstOrThrow({ where: { contentItemId: 'v1', step: 'DISENO' } });
    assert.equal(design.assigneeId, 'diego');
    assert.equal(design.requestedById, 'edward');
    const lead = design.dueAt.getTime() - design.createdAt.getTime();
    assert.ok(lead > 86400000 - 60000 && lead < 2 * 86400000 + 60000, '24 h, o 48 h si caía en domingo');
    assert.equal(await prisma.assignment.count({ where: { contentItemId: 'v1', userId: 'diego', role: 'DISENO' } }), 1);
    assert.deepEqual(await as('diego', () => production.pedirDiseno(form({ contentItemId: 'v1' }))), { error: 'Tu perfil no puede pedir diseños.' });

    // Filmmaker marca la grabación con la revisión que vio: la edición queda asignada al editor.
    await prisma.contentItem.update({ where: { id: 'v1' }, data: { status: 'GRABACION' } });
    const stale = form({ id: recording.id, done: '1', expectedUpdatedAt: new Date(recording.updatedAt.getTime() - 1).toISOString() });
    assert.match((await as('carlos', () => production.marcarPaso(stale))).error, /Este registro cambió/);
    assert.deepEqual(await as('laudder', () => production.marcarPaso(form({ id: recording.id, done: '1', expectedUpdatedAt: recording.updatedAt.toISOString() }))), { error: 'No tienes acceso a este video.' });
    assert.equal(await as('carlos', () => production.marcarPaso(form({ id: recording.id, done: '1', expectedUpdatedAt: recording.updatedAt.toISOString() }))), undefined);
    assert.equal((await prisma.productionStep.findUniqueOrThrow({ where: { id: recording.id } })).status, 'HECHO');
    const edit = await prisma.productionStep.findUniqueOrThrow({ where: { automationKey: 'v1:EDICION' } });
    assert.equal(edit.assigneeId, 'laudder');
    assert.equal(await prisma.assignment.count({ where: { contentItemId: 'v1', userId: 'laudder', role: 'EDITOR' } }), 1);

    // Barrido diario: grabación de ayer sin marcar → edición firmada por Sistema; repetir no duplica.
    const now = new Date();
    const utils = load('src/lib/utils.ts'), days = load('src/lib/working-days.ts');
    const yesterday = days.addDaysToKey(utils.dateKey(now), -1);
    await prisma.contentItem.update({ where: { id: 'v3' }, data: { shootDate: utils.fromDateKey(yesterday) } });
    const first = await sweep.runProductionSweep(25, now);
    assert.deepEqual({ enabled: first.enabled, assigned: first.assigned, failed: first.failed }, { enabled: true, assigned: 1, failed: 0 });
    const swept = await prisma.productionStep.findUniqueOrThrow({ where: { automationKey: 'v3:EDICION' } });
    assert.equal(swept.assigneeId, 'laudder');
    assert.ok(swept.dueAt >= now, 'nunca nace vencida');
    assert.equal((await prisma.auditLog.findFirstOrThrow({ where: { entity: 'ProductionStep', entityId: swept.id } })).userName, 'Sistema');
    const second = await sweep.runProductionSweep(25, now);
    assert.equal(second.candidates, 0);
    assert.equal(await prisma.productionStep.count({ where: { contentItemId: 'v3' } }), 1);
  } finally {
    await prisma.$disconnect();
  }
});
