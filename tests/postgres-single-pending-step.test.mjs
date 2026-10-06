import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { PrismaClient } from '@prisma/client';

const url = process.env.SINGLE_PENDING_STEP_TEST_DATABASE_URL;
if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname) || !new URL(url).pathname.endsWith('_test')) throw Error('Solo DB local efímera _test.');
const db = new PrismaClient({ datasourceUrl: url });
after(() => db.$disconnect());
const date = new Date('2026-11-06T12:00:00Z');
const data = (id, video = 'video', step = 'GUION', status = 'PENDIENTE') => ({ id, contentItemId: video, brandId: 'brand', step, status, dueAt: date, automationKey: `${video}:${id}`, doneAt: status === 'HECHO' ? date : null });
const unique = error => error.code === 'P2002';

test('DB: rechaza pasos pendientes distintos y claves manuales, permite diseño e historial', async () => {
  await db.brand.create({ data: { id: 'brand', name: 'Prueba', slug: 'single-pending' } });
  await db.contentItem.createMany({ data: ['video', 'parallel', 'rollback', 'race', 'race-history'].map(id => ({ id, title: id, brandId: 'brand', scheduledDate: date })) });
  await db.productionStep.create({ data: data('first') });
  await assert.rejects(db.productionStep.create({ data: data('other-kind', 'video', 'EDICION') }), unique);
  await assert.rejects(db.productionStep.create({ data: { ...data('manual'), source: 'MANUAL' } }), unique);
  await db.productionStep.createMany({ data: [data('design-1', 'video', 'DISENO'), data('design-2', 'video', 'DISENO'), ...['HECHO','CANCELADO','DEVUELTO'].map(status => data(status, 'video', 'EDICION', status)), data('independent', 'parallel')] });
  await assert.rejects(db.productionStep.update({ where: { id: 'CANCELADO' }, data: { status: 'PENDIENTE' } }), unique);
  await assert.rejects(db.productionStep.update({ where: { id: 'design-1' }, data: { step: 'REVISION_FINAL' } }), unique);
  await assert.rejects(db.productionStep.update({ where: { id: 'independent' }, data: { contentItemId: 'video', automationKey: 'video:moved' } }), unique);
  await db.brand.update({ where: { id: 'brand' }, data: { archived: true } });
  await assert.rejects(db.productionStep.create({ data: data('archived', 'video', 'GRABACION') }), unique);
  await db.brand.update({ where: { id: 'brand' }, data: { archived: false } });
  assert.equal(await db.productionStep.count({ where: { contentItemId: 'video' } }), 6);
});

test('DB: avanzar cierra antes de abrir; un fallo posterior revierte ambos cambios', async () => {
  await db.productionStep.create({ data: data('rollback-original', 'rollback') });
  await assert.rejects(db.$transaction(async tx => {
    await tx.productionStep.update({ where: { id: 'rollback-original' }, data: { status: 'HECHO', doneAt: date } });
    await tx.productionStep.create({ data: data('rollback-next', 'rollback', 'REVISION_GUION') });
    throw Error('Fallo posterior a la apertura');
  }), /Fallo posterior/);
  assert.equal((await db.productionStep.findUniqueOrThrow({ where: { id: 'rollback-original' } })).status, 'PENDIENTE');
  assert.equal(await db.productionStep.count({ where: { id: 'rollback-next' } }), 0);
  await db.$transaction(async tx => {
    await tx.productionStep.update({ where: { id: 'rollback-original' }, data: { status: 'HECHO', doneAt: date } });
    await tx.productionStep.create({ data: data('rollback-next', 'rollback', 'REVISION_GUION') });
  });
  assert.equal(await db.productionStep.count({ where: { contentItemId: 'rollback', status: 'PENDIENTE' } }), 1);
});

test('DB: dos transacciones concurrentes solo pueden abrir un paso', async () => {
  let inserted, release;
  const ready = new Promise(resolve => { inserted = resolve; });
  const commit = new Promise(resolve => { release = resolve; });
  const first = db.$transaction(async tx => {
    await tx.productionStep.create({ data: data('winner', 'race', 'GUION') });
    inserted();
    await commit;
  });
  await ready;
  const second = db.productionStep.create({ data: data('loser', 'race', 'EDICION') });
  // La segunda conexión intenta escribir mientras la primera aún no ha confirmado.
  const rejected = assert.rejects(second, unique);
  release();
  await Promise.all([first, rejected]);
  assert.deepEqual((await db.productionStep.findMany({ where: { contentItemId: 'race' } })).map(s => s.id), ['winner']);
});

test('DB: dos reactivaciones concurrentes no duplican pendientes ni destruyen historial', async () => {
  await db.productionStep.createMany({ data: [data('old-script', 'race-history', 'GUION', 'DEVUELTO'), data('old-edit', 'race-history', 'EDICION', 'CANCELADO')] });
  const results = await Promise.allSettled(['old-script','old-edit'].map(id => db.productionStep.update({ where: { id }, data: { status: 'PENDIENTE' } })));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.ok(unique(results.find(r => r.status === 'rejected').reason));
  assert.equal(await db.productionStep.count({ where: { contentItemId: 'race-history' } }), 2);
  assert.equal(await db.productionStep.count({ where: { contentItemId: 'race-history', status: 'PENDIENTE' } }), 1);
});
