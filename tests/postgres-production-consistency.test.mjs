import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { load } from './load-module.mjs';

const url = process.env.PRODUCTION_CONSISTENCY_TEST_DATABASE_URL;
if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname) || !new URL(url).pathname.endsWith('_test')) throw Error('Solo DB local efímera _test.');
process.env.PRODUCTION_FLOW_ENABLED = 'true';
process.env.PRODUCTION_CHAIN_ENABLED = 'true';
process.env.PRODUCTION_CHAIN_BRANDS = 'A';
const prisma = new PrismaClient({ datasourceUrl: url });
after(() => prisma.$disconnect());
const registry = new Map(), mocks = {
  '@/lib/prisma': { prisma }, '@/lib/ai': { normalizeSceneTimes: x => x },
  'next/headers': { cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() },
  'next/cache': { revalidatePath() {}, revalidateTag() {} },
};
const mod = file => load(file, mocks, registry);
const scope = mod('src/lib/production-scope.ts');
const consistency = mod('src/lib/production-consistency.ts');
const resolution = mod('src/lib/domain/production-consistency.ts');
const { withMutation } = mod('src/lib/mutations.ts');
const chain = mod('src/lib/domain/production-chain.ts');
const { castingInclude, castingToken } = mod('src/lib/casting.ts');
const { readCastingPending } = mod('src/lib/casting-inbox.ts');
const owner = { id: 'owner', name: 'Owner', email: 'owner@example.test', role: 'OWNER', profiles: [], brandIds: [], sessionVersion: 0 };
const writer = { id: 'writer', name: 'Writer', email: 'writer@example.test', role: 'MEMBER', profiles: ['WRITER'], brandIds: ['A'], sessionVersion: 0 };
const now = new Date('2026-10-06T15:00:00Z'), due = new Date('2026-10-07T04:59:59Z'), day = new Date('2026-10-06T12:00:00Z');
const cards = result => [...result.returned, ...Object.values(result.groups).flat()];
const run = (input, actor = owner) => withMutation(actor, false, tx => resolution.resolveProductionIssue(tx, actor, input));
const issue = async key => consistency.readConsistencyIssue(prisma, owner, key);
const fix = async (key, extra = {}) => { const row = await issue(key); assert.ok(row, key); return run({ key, revision: row.revision, mode: 'repair', ...extra }); };
async function video(id, brandId = 'A') { return prisma.contentItem.create({ data: { id, title: id, brandId, status: 'IDEA', scheduledDate: day, createdById: 'owner' } }); }
async function makeStep(id, kind = 'GUION', assigneeId = 'writer') {
  const taskId = `${id}-${kind}-task`, stepId = `${id}-${kind}`;
  await prisma.task.create({ data: { id: taskId, title: `Escribir: ${id}`, description: `Guion del video "${id}". Ficha: /contenido/${id}`, brandId: 'A', assigneeId, dueDate: day, columnId: 'todo' } });
  return prisma.productionStep.create({ data: { id: stepId, automationKey: `${id}:${kind}`, contentItemId: id, brandId: 'A', step: kind, dueAt: due, assigneeId, taskId } });
}

test('fixtures: 551 pasos, marcas ajenas y archivadas; ninguna inconsistencia inicial', async () => {
  await prisma.user.create({ data: { id: owner.id, name: owner.name, email: owner.email, role: 'OWNER', passwordHash: 'fixture' } });
  await prisma.user.create({ data: { id: writer.id, name: writer.name, email: writer.email, passwordHash: 'fixture', workProfiles: { create: { profile: 'WRITER' } } } });
  await prisma.brand.createMany({ data: ['A','B','H'].map(id => ({ id, name: id, slug: id.toLowerCase(), archived: id === 'H' })) });
  await prisma.userBrandAccess.create({ data: { userId: writer.id, brandId: 'A' } });
  await prisma.brandTeamMember.create({ data: { brandId: 'A', role: 'GUIONISTA', userId: writer.id } });
  await prisma.taskColumn.createMany({ data: [{ id: 'todo', name: 'Pendiente', order: 0 }, { id: 'done', name: 'Listo', order: 4 }] });
  const ids = Array.from({ length: 551 }, (_, i) => `bulk-${String(i).padStart(4,'0')}`);
  await prisma.contentItem.createMany({ data: ids.map(id => ({ id, title: id, brandId: 'A', status: 'IDEA', scheduledDate: day })) });
  await prisma.task.createMany({ data: ids.map(id => ({ id: `${id}-task`, title: id, description: `. Ficha: /contenido/${id}`, brandId: 'A', assigneeId: writer.id, dueDate: day, columnId: 'todo' })) });
  await prisma.productionStep.createMany({ data: ids.map(id => ({ id: `${id}-step`, contentItemId: id, brandId: 'A', step: 'GUION', assigneeId: writer.id, dueAt: due, taskId: `${id}-task`, automationKey: `${id}:GUION` })) });
  await prisma.assignment.createMany({ data: ids.map(id => ({ contentItemId: id, userId: writer.id, role: 'GUIONISTA' })) });
  await video('foreign','B'); await video('historical','H');
  const report = await consistency.readProductionConsistency(owner);
  assert.equal(report.total, 0);
});

test('Mi trabajo: 551 totales; todas las páginas, empates y fecha Lima, sin repeticiones', async () => {
  const first = await scope.readMyWork(writer, now);
  assert.deepEqual(first.counts, { pending: 551, overdue: 0, today: 551 });
  assert.equal(cards(first).length, 25);
  const seen = new Set();
  for (let page = 1; page <= first.pages.mine.pageCount; page++) {
    const work = await scope.readMyWork(writer, now, { trabajo: String(page) });
    assert.equal(work.counts.pending, 551);
    for (const card of cards(work)) { assert.ok(!seen.has(card.id)); seen.add(card.id); }
  }
  assert.equal(seen.size, 551);
  const last = await scope.readMyWork(writer, now, { trabajo: '9999' });
  assert.equal(last.pages.mine.page, 23); assert.equal(cards(last).length, 1);
  const expired = await scope.readMyWork(writer, new Date('2026-10-07T05:00:00Z'));
  assert.equal(expired.counts.overdue, 551); assert.equal(expired.counts.today, 0);
});

test('Cadena: filtra en DB, totales >500 y ajuste de página fuera de rango', async () => {
  await video('z-design'); await makeStep('z-design','DISENO', 'owner');
  await prisma.assignment.create({ data: { contentItemId: 'z-design', userId: 'owner', role: 'DISENO' } });
  const all = await scope.readChain(owner, { now });
  assert.equal(all.header.open, 552); assert.equal(all.page.total, 552);
  assert.equal(all.stepCounts.GUION.total, 551);
  const design = await scope.readChain(owner, { now, step: 'DISENO', page: '9999' });
  assert.equal(design.page.total, 1); assert.equal(design.designs[0].video.id, 'z-design');
  assert.equal(design.header.open, 552);
  assert.equal((await scope.readChain(writer, { now })).allowed, false);
  assert.equal((await scope.readChain(owner, { brandId: 'B' })).header.open, 0);
});

test('Avisos: 60 eventos de un paso no ocultan otro; coordinación filtra antes de paginar', async () => {
  await prisma.auditLog.createMany({ data: Array.from({ length: 60 }, (_, i) => ({ id: `notice-${i}`, entity: 'ProductionStep', entityId: 'bulk-0000-step', brandId: 'A', action: 'EDITAR', summary: 'Aviso', changes: JSON.stringify({ aviso: { despues: `Aviso ${i}` } }), createdAt: new Date(now.getTime() + i) })) });
  await prisma.auditLog.create({ data: { entity: 'ProductionStep', entityId: 'bulk-0550-step', brandId: 'A', action: 'EDITAR', summary: 'Aviso antiguo', changes: JSON.stringify({ aviso: { despues: 'Último registro fuera del límite anterior' } }), createdAt: new Date(now.getTime() - 10000) } });
  const notes = await scope.stepNotes(['bulk-0000-step', 'bulk-0550-step']);
  assert.equal(notes.get('bulk-0550-step').notice.motivo, 'Último registro fuera del límite anterior');
  const work = await scope.readMyWork(owner, now);
  assert.equal(work.pages.coordination.total, 2);
  assert.equal(work.coordination.notices.length, 2);
});

test('Sin paso: más de 200 videos accesibles con totales y revisión humana', async () => {
  await prisma.contentItem.createMany({ data: Array.from({ length: 205 }, (_, i) => ({ id: `missing-${i}`, title: `missing-${i}`, brandId: 'A', status: 'IDEA', scheduledDate: day })) });
  const board = await scope.readChain(owner, { missingPage: '9999' });
  assert.equal(board.missingPage.total, 206); assert.equal(board.missingPage.page, 11);
  assert.equal(board.stuck.withoutStep.length, 6);
  const one = await issue('MISSING_STEP:missing-0'); assert.equal(one.repairable, false);
  await assert.rejects(run({ key: one.key, revision: one.revision, mode: 'repair' }), /revisión humana/);
  await run({ key: one.key, revision: one.revision, mode: 'create' });
  assert.equal(await prisma.productionStep.count({ where: { contentItemId: 'missing-0', status: 'PENDIENTE' } }), 1);
  assert.equal(await prisma.approval.count(), 0);
});

test('Reparar tarea faltante: rollback, idempotencia y auditoría; sin aprobar ni avanzar', async () => {
  await video('repair'); await makeStep('repair');
  await prisma.task.delete({ where: { id: 'repair-GUION-task' } });
  const missing = await issue('MISSING_TASK:repair-GUION'); assert.equal(missing.repairable, true);
  const input = { key: missing.key, revision: missing.revision, mode: 'repair' };
  await assert.rejects(withMutation(owner, false, async tx => { await resolution.resolveProductionIssue(tx, owner, input); throw Error('fallo posterior'); }), /fallo posterior/);
  assert.equal((await prisma.productionStep.findUnique({ where: { id: 'repair-GUION' } })).taskId, null);
  assert.equal((await run(input)).changed, true);
  assert.equal((await run(input)).changed, false);
  await fix('MISSING_ASSIGNMENT:repair-GUION');
  const linked = await prisma.productionStep.findUnique({ where: { id: 'repair-GUION' }, include: { task: true } });
  assert.equal(linked.task.assigneeId, writer.id); assert.equal(linked.task.dueDate.toISOString(), day.toISOString());
  assert.equal((await prisma.contentItem.findUnique({ where: { id: 'repair' } })).status, 'IDEA');
  assert.equal(await prisma.approval.count(), 0);
  assert.ok(await prisma.auditLog.count({ where: { entityId: 'repair', changes: { contains: 'MISSING_TASK' } } }));
});

test('Tarea desfasada: revisión obsoleta, dos reparaciones concurrentes, cierre y datos reflejados', async () => {
  const step = await prisma.productionStep.findUnique({ where: { id: 'repair-GUION' } });
  await prisma.task.update({ where: { id: step.taskId }, data: { status: 'HECHO', assigneeId: 'owner', dueDate: null, columnId: 'done', description: 'Notas personales conservadas', completedById: 'owner', completedAt: now } });
  const old = await issue(`TASK_DRIFT:${step.id}`);
  await prisma.task.update({ where: { id: step.taskId }, data: { priority: 'URGENTE' } });
  await assert.rejects(run({ key: old.key, revision: old.revision, mode: 'repair' }), /cambió/);
  const fresh = await issue(old.key), input = { key: fresh.key, revision: fresh.revision, mode: 'repair' };
  const results = await Promise.allSettled([run(input), run(input)]);
  assert.equal(results.filter(r => r.status === 'fulfilled' && r.value.changed).length, 1);
  const task = await prisma.task.findUnique({ where: { id: step.taskId } });
  assert.equal(task.status, 'PENDIENTE'); assert.equal(task.assigneeId, writer.id); assert.equal(task.columnId, 'todo');
  assert.equal(task.completedById, null); assert.equal(task.completedAt, null); assert.equal(task.priority, 'URGENTE');
  assert.ok(task.description.includes('Notas personales conservadas'));
  assert.equal(await issue(old.key), null);
});

test('Permisos revocados, canario y marcas archivadas: no concede acceso ni repara', async () => {
  await prisma.user.update({ where: { id: 'writer' }, data: { active: false } });
  const blocked = await issue('BLOCKED_ASSIGNEE:repair-GUION'); assert.equal(blocked.repairable, false);
  await assert.rejects(run({ key: blocked.key, revision: blocked.revision, mode: 'repair' }), /revisión humana/);
  assert.equal((await scope.readMyWork(owner, now)).pages.coordination.total, 553);
  const member = await consistency.readProductionConsistency(writer); assert.equal(member.total, 0);
  assert.equal((await consistency.readProductionConsistency(owner, { brandId: 'B' })).total, 0);
  assert.equal((await consistency.readProductionConsistency(owner, { brandId: 'H' })).total, 0);
  await prisma.user.update({ where: { id: 'writer' }, data: { active: true } });
  await prisma.userWorkProfile.deleteMany({ where: { userId: 'writer' } });
  assert.ok(await issue('BLOCKED_ASSIGNEE:repair-GUION'), 'el perfil perdido también bloquea con la cuenta activa');
  await prisma.userWorkProfile.create({ data: { userId: 'writer', profile: 'WRITER' } });
});

test('Tarea desvinculada posible duplicado: se detecta y evita crear otra automáticamente', async () => {
  await video('orphan'); const step = await makeStep('orphan');
  await prisma.productionStep.update({ where: { id: step.id }, data: { taskId: null } });
  assert.equal((await issue(`MISSING_TASK:${step.id}`)).repairable, false);
  assert.ok(await issue(`UNLINKED_TASK:${step.taskId}`));
  await assert.rejects(fix(`MISSING_TASK:${step.id}`), /revisión humana/);
});

test('Duplicidad: requiere selección humana y motivo; cancela sin entregar ni aprobar', async () => {
  await makeStep('repair','EDICION','owner');
  const duplicate = await issue('DUPLICATE_STEPS:repair');
  const input = { key: duplicate.key, revision: duplicate.revision, mode: 'duplicates', keepStepId: 'repair-GUION' };
  await assert.rejects(run(input), /motivo/);
  await run({ ...input, reason: 'La edición se abrió por error; el guion sigue pendiente.' });
  const editing = await prisma.productionStep.findUnique({ where: { id: 'repair-EDICION' }, include: { task: true } });
  assert.equal(editing.status, 'CANCELADO'); assert.equal(editing.doneAt, null); assert.equal(editing.task.status, 'CANCELADO');
  assert.equal(await issue(duplicate.key), null); assert.equal(await prisma.approval.count(), 0);
});

test('Cambio de equipo actualiza más de 200 pasos y sus tareas en el mismo commit', async () => {
  const before = await prisma.productionStep.count({ where: { brandId: 'A', step: 'GUION', status: 'PENDIENTE', source: 'AUTO', assigneeId: writer.id } });
  assert.ok(before > 500);
  await withMutation(owner, false, tx => chain.chainEvent(tx, owner, { type: 'TEAM_CHANGED', brandId: 'A', role: 'GUIONISTA', previousUserId: writer.id, userId: owner.id }));
  assert.equal(await prisma.productionStep.count({ where: { brandId: 'A', step: 'GUION', status: 'PENDIENTE', source: 'AUTO', assigneeId: writer.id } }), 0);
  const rows = await prisma.productionStep.findMany({ where: { brandId: 'A', step: 'GUION', status: 'PENDIENTE', source: 'AUTO' }, include: { task: true } });
  assert.ok(rows.every(s => s.assigneeId === owner.id && s.task.assigneeId === owner.id));
});

test('Reparto: 105 confirmados no ocultan 21 pendientes; página y total de pendientes reales', async () => {
  await prisma.user.create({ data: { id: 'actor', name: 'Actor', email: 'actor@example.test', passwordHash: 'fixture', workProfiles: { create: { profile: 'TALENT' } }, brandAccess: { create: { brandId: 'A' } } } });
  const actor = { id: 'actor', role: 'MEMBER', profiles: ['TALENT'], brandIds: ['A'] };
  await prisma.script.create({ data: { id: 'script', title: 'Guion', brandId: 'A', authorId: 'owner', scenes: { create: { id: 'scene', order: 0, beat: 'Gancho', actors: JSON.stringify([{ role: 'Presentador' }]) } } } });
  const ids = Array.from({ length: 126 }, (_, i) => `cast-${String(i).padStart(4,'0')}`);
  await prisma.contentItem.createMany({ data: ids.map(id => ({ id, title: id, brandId: 'A', status: 'APROBADO', scriptId: 'script', scheduledDate: day, shootDate: day })) });
  await prisma.assignment.createMany({ data: ids.map(id => ({ contentItemId: id, userId: 'actor', role: 'ACTOR' })) });
  const token = castingToken(await prisma.contentItem.findUnique({ where: { id: ids[0] }, include: castingInclude }));
  await prisma.castRole.createMany({ data: ids.map((id, i) => ({ contentItemId: id, slotKey: 'scene:0', sceneId: 'scene', role: 'Presentador', userId: 'actor', response: i < 105 ? 'CONFIRMADO' : 'PENDIENTE', confirmedToken: i < 105 ? token : null })) });
  const first = await readCastingPending(actor, 'A'); assert.equal(first.total, 21); assert.equal(first.items.length, 20);
  const last = await readCastingPending(actor, 'A', '9999'); assert.equal(last.page, 2); assert.equal(last.items.length, 1);
  assert.equal(new Set([...first.items, ...last.items].map(i => i.id)).size, 21);
});

test('Diseños entregados: todos accesibles después de los primeros veinte', async () => {
  await prisma.productionStep.createMany({ data: Array.from({ length: 27 }, (_, i) => ({
    id: `delivered-${i}`, automationKey: `z-design:DISENO:${i}`, contentItemId: 'z-design', brandId: 'A',
    step: 'DISENO', assigneeId: 'owner', requestedById: 'owner', dueAt: due, status: 'HECHO', doneAt: now,
  })) });
  const first = await scope.readMyWork(owner, now);
  assert.equal(first.pages.designs.total, 27); assert.equal(first.designsDelivered.length, 20);
  const last = await scope.readMyWork(owner, now, { disenos: '2' });
  assert.equal(last.designsDelivered.length, 7);
  assert.equal(new Set([...first.designsDelivered, ...last.designsDelivered].map(s => s.id)).size, 27);
});

test('No repara vínculos entre marcas ni tareas compartidas con preparación', async () => {
  await video('cross-brand'); const cross = await makeStep('cross-brand', 'GUION', 'owner');
  await prisma.task.update({ where: { id: cross.taskId }, data: { brandId: 'B' } });
  assert.equal((await issue(`TASK_BRAND:${cross.id}`)).repairable, false);
  await assert.rejects(fix(`TASK_BRAND:${cross.id}`), /revisión humana/);
  assert.equal((await prisma.task.findUnique({ where: { id: cross.taskId } })).brandId, 'B');
  await video('shared'); const shared = await makeStep('shared', 'GUION', 'owner');
  await prisma.preparationItem.create({ data: { contentItemId: 'shared', sourceKey: 'manual:fixture', kind: 'PROP', label: 'Prop', taskId: shared.taskId } });
  assert.ok(await issue(`SHARED_TASK:${shared.id}`));
  await assert.rejects(fix(`SHARED_TASK:${shared.id}`), /revisión humana/);
});

test('Guion entregado sin siguiente paso propone revisión humana y no vuelve a escritura', async () => {
  await prisma.script.create({ data: { id: 'review-script', title: 'Entregado', status: 'REVISION', brandId: 'A', authorId: 'owner' } });
  await video('review-gap'); await prisma.contentItem.update({ where: { id: 'review-gap' }, data: { status: 'GUION', scriptId: 'review-script' } });
  const step = await makeStep('review-gap','GUION','owner');
  await prisma.productionStep.update({ where: { id: step.id }, data: { status: 'HECHO', doneAt: now } });
  // Aislar el vídeo para que no caiga en otra página de la lista de incidencias.
  const key = 'MISSING_STEP:review-gap', row = await issue(key);
  await run({ key, revision: row.revision, mode: 'create' });
  const review = await prisma.productionStep.findFirst({ where: { contentItemId: 'review-gap', step: 'REVISION_GUION' } });
  assert.equal(review.status, 'PENDIENTE'); assert.ok(review.reviewToken);
  const board = await scope.readChain(owner, { step: 'REVISION_GUION' });
  assert.ok(!board.stuck.outOfSync.some(s => s.card.video.id === 'review-gap'));
  assert.equal(await prisma.approval.count(), 0);
});

test('Cadena apagada: diagnósticos vacíos y reparación bloqueada sin cambios', async () => {
  process.env.PRODUCTION_CHAIN_ENABLED = 'false';
  assert.equal((await consistency.readProductionConsistency(owner)).total, 0);
  await assert.rejects(run({ key: 'MISSING_STEP:missing-1', revision: '0'.repeat(32), mode: 'create' }), /no está activa/);
});
