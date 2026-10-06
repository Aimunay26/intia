import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { load } from './load-module.mjs';

/**
 * Cadena de entregas contra PostgreSQL real (migraciones aplicadas por scripts/test-postgres.mjs),
 * con las decisiones del Dueño del 29-30/09/2026: el Listo del guionista y el del editor firman
 * como «Sistema» las aprobaciones que antes eran del encargado. Recorrido IDEA→PUBLICADO solo con
 * «Listo», devoluciones, avisos, «Sin asignar», asignación automática apagada, «Crear paso»,
 * cancelar/reabrir, desvincular, tarea↔paso, dos «Listo» a la vez y la cadena apagada o en
 * canario sin cambios. Después de cada bloque, las invariantes Q1-Q5 de la mini-spec dan 0.
 */
const url = process.env.PRODUCTION_CHAIN_TEST_DATABASE_URL;
if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname) || !new URL(url).pathname.endsWith('_test')) throw Error('Solo DB local efímera _test.');
process.env.AUTH_SECRET = randomBytes(32).toString('hex');
process.env.PRODUCTION_FLOW_ENABLED = 'true';
process.env.PRODUCTION_CHAIN_ENABLED = 'true';
delete process.env.PRODUCTION_CHAIN_BRANDS;

const prisma = new PrismaClient({ datasourceUrl: url });
const registry = new Map();
const mocks = {
  '@/lib/prisma': { prisma },
  '@/lib/ai': { normalizeSceneTimes: (x) => x },
  'next/headers': { cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }), headers: async () => new Headers() },
  'next/cache': { revalidatePath: () => {}, revalidateTag: () => {} },
  'next/navigation': { redirect: (path) => { throw Error('REDIRECT:' + path); }, notFound: () => { throw Error('NOT_FOUND'); } },
};
const mod = (file) => load(file, mocks, registry);
const chain = mod('src/lib/domain/production-chain.ts');
const lifecycle = mod('src/lib/domain/lifecycle.ts');
const persist = mod('src/lib/generation-persist.ts');
const scope = mod('src/lib/production-scope.ts');
const mutations = mod('src/lib/mutations.ts');
const sweep = mod('src/lib/production-sweep.ts');
const { DEFAULT_CHECKLIST } = mod('src/lib/constants.ts');
const utils = mod('src/lib/utils.ts');
const days = mod('src/lib/working-days.ts');

const quietly = async (fn) => { const { warn, info } = console; console.warn = () => {}; console.info = () => {}; try { return await fn(); } finally { console.warn = warn; console.info = info; } };
const people = new Map();
async function sessionUser(id) {
  const u = await prisma.user.findUniqueOrThrow({ where: { id }, include: { workProfiles: true, brandAccess: true } });
  return { id: u.id, name: u.name, email: u.email, role: u.role, color: u.color, archetypeId: u.archetypeId, sessionVersion: u.sessionVersion, profiles: u.workProfiles.map((p) => p.profile).sort(), brandIds: u.brandAccess.map((b) => b.brandId).sort() };
}
const as = (id) => people.get(id);
/** Una acción real: transacción serializable con assertActor, como las Server Actions. */
const run = (id, fn) => quietly(() => mutations.withMutation(as(id), false, (tx) => fn(tx, as(id))));
const tx = (fn) => quietly(() => prisma.$transaction(fn, { isolationLevel: 'Serializable' }));
const step = (video, kind) => prisma.productionStep.findUniqueOrThrow({ where: { automationKey: `${video}:${kind}` }, include: { task: true } });
const openSteps = (video) => prisma.productionStep.findMany({ where: { contentItemId: video, status: 'PENDIENTE', step: { not: 'DISENO' } } });
const today = () => utils.dateKey(new Date());
const LAST = 'initial-task-column-4', FIRST = 'initial-task-column-0';

async function createVideo(id, brandId, extra = {}) {
  await prisma.contentItem.create({
    data: {
      id, brandId, title: `Video ${id}`, status: 'IDEA', scheduledDate: utils.fromDateKey(today()), createdById: 'owner', ...extra,
      checklist: { create: DEFAULT_CHECKLIST.map((item, index) => ({ label: item.label, kind: item.kind ?? 'TASK', stage: item.stage, required: item.required, sortOrder: index })) },
    },
  });
}
async function createScript(id, brandId, cta = 'Escríbenos hoy') {
  await prisma.script.create({ data: { id, title: `Guion ${id}`, brandId, cta, authorId: 'owner', scenes: { create: [{ order: 0, beat: 'Gancho', voice: 'Hola', action: 'Mira a cámara' }] } } });
}
const created = (videoId) => tx((t) => chain.chainEvent(t, as('owner'), { type: 'VIDEO_CREATED', videoId }));
const link = (scriptId, videoId) => tx((t) => persist.vincularGuionAVideo(t, as('owner'), scriptId, videoId));
// Atajo de preparación: entrega y después una SEGUNDA acción humana de revisión.
// postgres-human-reviews prueba cada estado intermedio, los rechazos y los atajos prohibidos.
const revisar = async (video, kind) => { const review=await step(video,kind); return run(review.assigneeId ?? 'owner',(t,u)=>chain.completeStep(t,u,review.id,{expectedUpdatedAt:review.updatedAt.toISOString(),expectedReviewToken:review.reviewToken})); };
const entregarYRevisar = async (who, stepId, input = {}) => {
  const pending=await prisma.productionStep.findUniqueOrThrow({where:{id:stepId}});
  // Preparación del escenario; human-reviews prueba que no puede omitirse ni sobrevivir a una reprogramación.
  if(pending.step==='GRABACION') await prisma.checklistItem.updateMany({where:{contentItemId:pending.contentItemId,stage:'PREPRODUCCION',kind:'TASK',required:true},data:{done:true,doneById:'carlos',doneAt:new Date()}});
  const result=await run(who,(t,u)=>chain.completeStep(t,u,stepId,input));
  if (result.status==='done' && ['REVISION_GUION','REVISION_FINAL'].includes(result.next)) {
    const row=await prisma.productionStep.findUniqueOrThrow({where:{id:stepId}});
    return revisar(row.contentItemId,result.next);
  }
  return result;
};

/** Invariantes de la mini-spec (3.11): deben dar 0. La marca E es la del flujo viejo (cadena apagada). */
async function invariants() {
  const q = async (sql) => Number((await prisma.$queryRawUnsafe(sql))[0].n);
  return {
    Q1: await q(`SELECT count(*)::int AS n FROM "ProductionStep" s JOIN "Task" t ON t.id=s."taskId"
      JOIN LATERAL (SELECT c.id FROM "TaskColumn" c WHERE c."brandId" IS NULL OR c."brandId"=s."brandId" ORDER BY c."order" DESC, c.id DESC LIMIT 1) l ON true
      WHERE s."brandId" <> 'E' AND (s.status='PENDIENTE') = (t."columnId"=l.id)`),
    Q2: await q(`SELECT count(*)::int AS n FROM "ContentItem" c WHERE c."brandId" <> 'E' AND c.status IN ('IDEA','GUION','APROBADO','GRABACION','EDICION','PROGRAMADO')
      AND EXISTS (SELECT 1 FROM "BrandTeamMember" m WHERE m."brandId"=c."brandId")
      AND NOT EXISTS (SELECT 1 FROM "ProductionStep" s WHERE s."contentItemId"=c.id AND s.status='PENDIENTE' AND s.step<>'DISENO')`),
    Q3: await q(`SELECT count(*)::int AS n FROM "ProductionStep" s JOIN "ContentItem" c ON c.id=s."contentItemId" WHERE s.step='PUBLICACION' AND s.status='PENDIENTE' AND c.status='PUBLICADO'`),
    Q4: await q(`SELECT count(*)::int AS n FROM (SELECT "contentItemId" FROM "ProductionStep" WHERE status='PENDIENTE' AND step<>'DISENO' GROUP BY "contentItemId" HAVING count(*)>1) x`),
    Q5: await q(`SELECT count(*)::int AS n FROM "ProductionStep" s JOIN "User" u ON u.id=s."assigneeId" WHERE s.status='PENDIENTE'
      AND (NOT u.active OR (u.role<>'OWNER' AND NOT EXISTS (SELECT 1 FROM "UserBrandAccess" a WHERE a."userId"=u.id AND a."brandId"=s."brandId")))`),
  };
}
const ZERO = { Q1: 0, Q2: 0, Q3: 0, Q4: 0, Q5: 0 };

test('preparación: equipo por marca, tablero y sesiones', async () => {
  await prisma.user.create({ data: { id: 'owner', name: 'Yoryo', email: 'owner@chain.test', role: 'OWNER', passwordHash: 'fixture' } });
  for (const [id, name] of [['A', 'Con Amor'], ['B', 'Sin encargado'], ['C', 'Manual'], ['D', 'Sin equipo'], ['E', 'Flujo viejo']]) await prisma.brand.create({ data: { id, name, slug: `chain-${id.toLowerCase()}` } });
  const members = { edward: [['STRATEGY'], ['A']], paula: [['WRITER'], ['A', 'B', 'E']], carlos: [['CAMERA'], ['A', 'B', 'C', 'E']], laudder: [['EDITOR'], ['A', 'B', 'E']], silvanna: [['PUBLISHER'], ['A', 'E']], diego: [['DESIGNER'], ['A']] };
  for (const [id, [profiles, brands]] of Object.entries(members)) {
    await prisma.user.create({ data: { id, name: id[0].toUpperCase() + id.slice(1), email: `${id}@chain.test`, passwordHash: 'fixture' } });
    await prisma.userWorkProfile.createMany({ data: profiles.map((profile) => ({ userId: id, profile })) });
    await prisma.userBrandAccess.createMany({ data: brands.map((brandId) => ({ userId: id, brandId })) });
  }
  const team = (brandId, roles) => prisma.brandTeamMember.createMany({ data: Object.entries(roles).map(([role, userId]) => ({ brandId, role, userId })) });
  await team('A', { ENCARGADO: 'edward', GUIONISTA: 'paula', FILMMAKER: 'carlos', EDITOR: 'laudder', COMMUNITY: 'silvanna', DISENADOR: 'diego' });
  await team('B', { GUIONISTA: 'paula', EDITOR: 'laudder' });
  await team('C', { FILMMAKER: 'carlos' });
  await team('E', { GUIONISTA: 'paula', FILMMAKER: 'carlos', EDITOR: 'laudder', COMMUNITY: 'silvanna' });
  await prisma.brandProductionSettings.create({ data: { brandId: 'A', recordingWeekdays: '[2,4]' } });
  await prisma.brandProductionSettings.create({ data: { brandId: 'C', autoAssign: false } });
  const columns = [['Idea o Acción', 0], ['Plan', 1], ['Ejecución', 2], ['Análisis', 3], ['Listo', 4]];
  for (const [name, order] of columns) await prisma.taskColumn.create({ data: { id: `initial-task-column-${order}`, name, order } });
  for (const id of ['owner', ...Object.keys(members)]) people.set(id, await sessionUser(id));
});

test('recorrido completo IDEA→PUBLICADO solo con «Listo» de cada perfil; firmas humanas auditadas', async () => {
  await createVideo('v1', 'A');
  await createScript('s1', 'A');
  const born = await created('v1');
  assert.equal(born.done, true);
  const guion = await step('v1', 'GUION');
  assert.equal(guion.assigneeId, 'paula', 'guionista del equipo');
  assert.equal(guion.dueAt.toISOString(), days.endOfDayKey(days.scriptDueKey(today())).toISOString(), 'fin del 2º día hábil');
  assert.equal(guion.task.title, 'Escribir guion: Video v1');
  assert.equal(guion.task.columnId, FIRST);
  assert.equal(await prisma.assignment.count({ where: { contentItemId: 'v1', userId: 'paula', role: 'GUIONISTA' } }), 1, 'recibe la asignación GUIONISTA para poder editar el guion');
  assert.equal((await created('v1')).reason, 'exists', 'repetir el disparo no duplica');

  // Unir el guion ya no programa la grabación.
  assert.equal((await link('s1', 'v1')).linked, true);
  assert.equal(await prisma.productionStep.count({ where: { contentItemId: 'v1' } }), 1);
  assert.equal((await prisma.contentItem.findUniqueOrThrow({ where: { id: 'v1' } })).shootDate, null);

  // Guionista entrega y coordinación aprueba → guion aprobado, video Aprobado, grabación el próximo martes o jueves.
  const r1 = await entregarYRevisar('paula', guion.id, { expectedUpdatedAt: guion.updatedAt.toISOString() });
  assert.deepEqual([r1.status, r1.next, r1.nextAssigneeId, r1.videoStatus], ['done', 'GRABACION', 'carlos', 'APROBADO']);
  const script = await prisma.script.findUniqueOrThrow({ where: { id: 's1' }, include: { approval: true } });
  assert.equal(script.status, 'APROBADO');
  assert.equal(script.approval.approvedByName, 'Edward');
  const checks = await prisma.checklistItem.findMany({ where: { contentItemId: 'v1' } });
  const byLabel = (label) => checks.find((c) => c.label === label);
  assert.equal(byLabel('Guion escrito y revisado').doneById, 'paula');
  assert.ok(byLabel('Guion aprobado por la marca').done && byLabel('Guion aprobado por la marca').approvalId);
  assert.equal(byLabel('Guion aprobado por la marca').doneById, 'edward', 'firma de quien revisó');
  const v1 = await prisma.contentItem.findUniqueOrThrow({ where: { id: 'v1' } });
  const shootKey = days.nextRecordingDayKey(today(), [2, 4]);
  assert.equal(utils.dateKey(v1.shootDate), shootKey, 'próximo día de grabación posterior al Listo');
  assert.ok(utils.dateKey(v1.scheduledDate) > shootKey, 'nunca se publica antes de grabar');
  const grab = await step('v1', 'GRABACION');
  assert.equal(grab.dueAt.toISOString(), days.endOfDayKey(shootKey).toISOString());
  assert.equal((await step('v1', 'GUION')).task.columnId, LAST, 'Listo mueve la tarea a la última columna');

  // Filmmaker: sin enlace no pasa (ni por Listo ni moviendo la tarea); con enlace, video a Edición.
  await assert.rejects(entregarYRevisar('carlos', grab.id), /Falta el enlace del material grabado/);
  await assert.rejects(run('carlos', (t, user) => chain.chainEvent(t, user, { type: 'TASK_MOVED', taskId: grab.taskId, toColumnId: LAST })), /Falta el enlace del material grabado/);
  assert.equal((await step('v1', 'GRABACION')).status, 'PENDIENTE', 'el rechazo no escribe nada');
  await assert.rejects(entregarYRevisar('laudder', grab.id, { materialUrl: 'https://drive.example.test/crudo' }), /No tienes acceso|Solo coordinación/);
  const r2 = await entregarYRevisar('carlos', grab.id, { materialUrl: 'https://drive.example.test/crudo' });
  assert.deepEqual([r2.next, r2.nextAssigneeId, r2.videoStatus], ['EDICION', 'laudder', 'EDICION']);
  const edit = await step('v1', 'EDICION');
  assert.equal(edit.materialUrl, null, 'el material no se copia: se lee del paso de grabación');
  assert.equal(edit.dueAt.toISOString(), days.endOfDayKey(days.nextWorkingDayKey(today())).toISOString());
  assert.equal(await prisma.checklistItem.count({ where: { contentItemId: 'v1', stage: { in: ['PREPRODUCCION', 'GRABACION'] }, required: true, kind: 'TASK', done: false } }), 0);

  // Editor: el máster debe ser otro enlace; su entrega pasa a revisión; coordinación habilita publicación.
  await assert.rejects(entregarYRevisar('laudder', edit.id, { materialUrl: 'https://drive.example.test/crudo' }), /distinto del material grabado/);
  const r3 = await entregarYRevisar('laudder', edit.id, { materialUrl: 'https://drive.example.test/master' });
  assert.deepEqual([r3.next, r3.nextAssigneeId], ['PUBLICACION', 'silvanna']);
  const final = await prisma.checklistItem.findFirstOrThrow({ where: { contentItemId: 'v1', kind: 'FINAL_APPROVAL' }, include: { approval: true } });
  assert.ok(final.done);
  assert.equal(final.approval.approvedByName, 'Edward');
  const pub = await step('v1', 'PUBLICACION');
  const scheduled = (await prisma.contentItem.findUniqueOrThrow({ where: { id: 'v1' } })).scheduledDate;
  assert.equal(pub.dueAt.toISOString(), days.endOfDayKey(days.publicationDueKey(today(), utils.dateKey(scheduled))).toISOString());

  // Community: publicado con el enlace público.
  await assert.rejects(entregarYRevisar('silvanna', pub.id), /Falta el enlace público/);
  const r4 = await entregarYRevisar('silvanna', pub.id, { publishedUrl: 'https://tiktok.example.test/@marca/v1' });
  assert.deepEqual([r4.next, r4.videoStatus], [null, 'PUBLICADO']);
  const done = await prisma.contentItem.findUniqueOrThrow({ where: { id: 'v1' } });
  assert.ok(done.publishedAt);

  // Evidencia del criterio de HECHO.
  const statusAudits = await prisma.auditLog.findMany({ where: { entity: 'ContentItem', entityId: 'v1', changes: { contains: '"status"' } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  assert.deepEqual(statusAudits.map((a) => JSON.parse(a.changes).status.despues), ['GUION', 'APROBADO', 'GRABACION', 'EDICION', 'PROGRAMADO', 'PUBLICADO']);
  assert.equal(await prisma.auditLog.count({ where: { summary: { contains: 'Excepción del Dueño' } } }), 0);
  const steps = await prisma.productionStep.findMany({ where: { contentItemId: 'v1' }, include: { task: true } });
  assert.deepEqual(steps.map((s) => s.status).sort(), Array(6).fill('HECHO'));
  assert.ok(steps.every((s) => s.task.columnId === LAST), 'cuatro tareas en «Listo»');
  const approvals = await prisma.approval.findMany({ where: { OR: [{ entityId: 'v1' }, { entityId: 's1' }] } });
  assert.deepEqual(approvals.map((a) => a.entityType).sort(), ['FINAL_APPROVAL', 'SCRIPT', 'SCRIPT_APPROVAL']);
  assert.ok(approvals.every((a) => a.approvedByName === 'Edward'));
  const systemAudits = await prisma.auditLog.findMany({ where: { userName: 'Sistema', summary: { contains: 'regla del dueño' } } });
  assert.equal(systemAudits.length, 0);
  assert.equal((await scope.grabadoDeVideo('v1')).grabado, true);
  const state = (await scope.chainStateForScripts(['s1'])).get('s1');
  assert.deepEqual([state.videos, state.grabados], [1, 1]);
  assert.deepEqual(await invariants(), ZERO);
});

test('devoluciones: editor → filmmaker y community → editor (revoca la aprobación final con identidad)', async () => {
  await createVideo('v2', 'A', { cta: 'Llama ya' });
  await createScript('s2', 'A', null);
  await created('v2');
  await link('s2', 'v2');
  // Coordinación marca en nombre de la guionista; el CTA del video basta.
  const r = await entregarYRevisar('owner', (await step('v2', 'GUION')).id);
  assert.equal(r.next, 'GRABACION');
  assert.ok(await prisma.auditLog.count({ where: { entityId: (await step('v2', 'GUION')).id, summary: { contains: 'en nombre de Paula' } } }));
  await entregarYRevisar('carlos', (await step('v2', 'GRABACION')).id, { materialUrl: 'https://drive.example.test/v2-crudo' });
  const edit = await step('v2', 'EDICION');

  await assert.rejects(run('laudder', (t, u) => chain.returnStep(t, u, edit.id, { motivo: 'no' })), /motivo/);
  await assert.rejects(run('carlos', (t, u) => chain.returnStep(t, u, (edit).id, { motivo: 'Falta una toma' })), /No tienes acceso|Solo coordinación/);
  const back = await run('laudder', (t, u) => chain.returnStep(t, u, edit.id, { motivo: 'Falta la toma del producto' }));
  assert.equal(back.reopened, 'GRABACION');
  assert.equal((await step('v2', 'EDICION')).status, 'DEVUELTO');
  const regrab = await step('v2', 'GRABACION');
  assert.equal(regrab.status, 'PENDIENTE');
  assert.equal(regrab.assigneeId, 'carlos', 'vuelve a quien lo hizo');
  assert.equal(regrab.task.columnId, FIRST);
  assert.equal(utils.dateKey(regrab.dueAt), days.nextRecordingDayKey(today(), [2, 4]));
  assert.equal(utils.dateKey((await prisma.contentItem.findUniqueOrThrow({ where: { id: 'v2' } })).shootDate), utils.dateKey(regrab.dueAt), 'una sola fecha');
  assert.equal((await prisma.contentItem.findUniqueOrThrow({ where: { id: 'v2' } })).status, 'APROBADO', 'la devolución habilita preparar y confirmar la nueva grabación');
  assert.ok(await prisma.comment.count({ where: { contentItemId: 'v2', body: { contains: 'Falta la toma del producto' } } }));
  assert.equal((await openSteps('v2')).length, 1);
  const mine = await scope.readMyWork(as('carlos'));
  assert.equal(mine.returned.find((c) => c.video.id === 'v2')?.returned?.motivo, 'Falta la toma del producto', '«Te lo devolvieron» con el motivo');

  await entregarYRevisar('carlos', regrab.id, {});
  const again = await step('v2', 'EDICION');
  assert.equal(again.id, edit.id, 'se reactiva el mismo paso, no se duplica');
  assert.equal(again.status, 'PENDIENTE');
  await entregarYRevisar('laudder', again.id, { materialUrl: 'https://drive.example.test/v2-master' });
  const pub = await step('v2', 'PUBLICACION');

  const firstFinal = await prisma.checklistItem.findFirstOrThrow({ where: { contentItemId: 'v2', kind: 'FINAL_APPROVAL' } });
  const returned = await run('silvanna', (t, u) => chain.returnStep(t, u, pub.id, { motivo: 'Corrige los subtítulos del final' }));
  assert.equal(returned.reopened, 'EDICION');
  const revoked = await prisma.approval.findUniqueOrThrow({ where: { id: firstFinal.approvalId } });
  assert.ok(revoked.revokedAt);
  assert.equal(revoked.reason, 'Corrige los subtítulos del final');
  assert.equal(revoked.revokedById, 'silvanna');
  assert.equal((await prisma.checklistItem.findUniqueOrThrow({ where: { id: firstFinal.id } })).done, false);
  assert.equal((await step('v2', 'PUBLICACION')).status, 'DEVUELTO');
  assert.equal((await step('v2', 'EDICION')).status, 'PENDIENTE');
  assert.equal(utils.dateKey((await step('v2', 'EDICION')).dueAt), days.nextWorkingDayKey(today()));
  assert.ok(await prisma.comment.count({ where: { contentItemId: 'v2', body: { contains: 'Corrige los subtítulos' } } }));

  await entregarYRevisar('laudder', (await step('v2', 'EDICION')).id, {});
  const resigned = await prisma.checklistItem.findFirstOrThrow({ where: { contentItemId: 'v2', kind: 'FINAL_APPROVAL' }, include: { approval: true } });
  assert.equal(resigned.approval.version, 2, 'nueva versión firmada');
  assert.equal((await step('v2', 'PUBLICACION')).status, 'PENDIENTE');
  assert.equal((await step('v2', 'PUBLICACION')).id, pub.id);
  assert.deepEqual(await invariants(), ZERO);
});

test('coordinación: «Sin asignar», avisos y bloqueos llegan al ENCARGADO o, sin él, al Dueño', async () => {
  await createVideo('v3', 'B');
  await createScript('s3', 'B');
  await created('v3');
  await link('s3', 'v3');
  await entregarYRevisar('paula', (await step('v3', 'GUION')).id);
  const grab = await step('v3', 'GRABACION');
  assert.equal(grab.assigneeId, null, 'la marca B no tiene filmmaker: «Sin asignar»');
  assert.equal(grab.task.assigneeId, null);
  const v3 = await prisma.contentItem.findUniqueOrThrow({ where: { id: 'v3' } });
  assert.equal(utils.dateKey(v3.shootDate), days.nextWorkingDayKey(today()), 'la fecha de grabación se escribe igual');

  const ownerWork = await scope.readMyWork(as('owner'));
  assert.ok(ownerWork.coordination.unassigned.some((c) => c.id === grab.id), 'sin ENCARGADO, le llega al Dueño');
  assert.ok(!ownerWork.coordination.brands.some((b) => b.id === 'A'), 'la marca A tiene ENCARGADO');
  const leadWork = await scope.readMyWork(as('edward'));
  assert.deepEqual(leadWork.coordination.brands.map((b) => b.id), ['A']);
  assert.ok(!leadWork.coordination.unassigned.some((c) => c.id === grab.id));

  // Reasignar sincroniza tarea, asignación y la fecha del video.
  const target = days.addDaysToKey(today(), 3);
  const moved = await run('owner', (t, u) => chain.reassignStep(t, u, grab.id, { assigneeId: 'carlos', dueAt: days.endOfDayKey(target), expectedUpdatedAt: grab.updatedAt.toISOString() }));
  assert.equal(moved.calendarMoved, true);
  const after = await step('v3', 'GRABACION');
  assert.deepEqual([after.assigneeId, after.task.assigneeId, after.source], ['carlos', 'carlos', 'MANUAL']);
  assert.equal(utils.dateKey((await prisma.contentItem.findUniqueOrThrow({ where: { id: 'v3' } })).shootDate), target);
  assert.equal(await prisma.assignment.count({ where: { contentItemId: 'v3', userId: 'carlos', role: 'CAMARA' } }), 1);
  await assert.rejects(run('owner', (t, u) => chain.reassignStep(t, u, after.id, { assigneeId: 'silvanna', dueAt: days.endOfDayKey(target) })), /autorizada/);

  // Avisar a coordinación: comentario y aviso en «Mi trabajo» de quien coordina.
  await assert.rejects(run('carlos', (t, u) => chain.notifyCoordination(t, u, after.id, { motivo: 'x' })), /motivo/);
  await run('carlos', (t, u) => chain.notifyCoordination(t, u, after.id, { motivo: 'No hay locación disponible' }));
  assert.ok((await scope.readMyWork(as('owner'))).coordination.notices.some((c) => c.id === after.id && c.notice.motivo === 'No hay locación disponible'));
  const pubA = await step('v2', 'PUBLICACION');
  const notice = await run('silvanna', (t, u) => chain.notifyCoordination(t, u, pubA.id, { motivo: 'La marca pidió esperar al lunes' }));
  assert.deepEqual(notice.coordinatorIds, ['edward']);
  assert.ok((await scope.readMyWork(as('edward'))).coordination.notices.some((c) => c.id === pubA.id));
  assert.ok(!(await scope.readMyWork(as('owner'))).coordination.notices.some((c) => c.id === pubA.id));
  await run('edward', (t, u) => chain.resolveNotice(t, u, pubA.id));
  assert.ok(!(await scope.readMyWork(as('edward'))).coordination.notices.some((c) => c.id === pubA.id), 'atendido');

  // Vista Cadena: coordinación sí, filmmaker no.
  const board = await scope.readChain(as('owner'));
  assert.ok(board.columns.GRABACION.some((c) => c.id === after.id));
  assert.ok(board.brandsWithoutTeam.some((b) => b.id === 'D'));
  assert.equal((await scope.readChain(as('carlos'))).allowed, false);
  const cal = await scope.stepCalendarEntries(as('carlos'), new Date(Date.now() - 86400000), new Date(Date.now() + 30 * 86400000), { mine: true });
  const chip = cal.entries.find((e) => e.id === after.id);
  assert.equal(chip.dateKey, target, 'el paso sale en el calendario de su responsable el día del plazo');
  assert.ok(cal.covered.includes('v3:GRABACION'));
  assert.deepEqual(await invariants(), ZERO);
});

test('asignación automática apagada, «Crear paso» y marca sin equipo', async () => {
  await createVideo('v5', 'C');
  await created('v5');
  const guion = await step('v5', 'GUION');
  assert.equal(guion.assigneeId, null, 'autoAssign apagado: el paso nace «Sin asignar»');
  assert.equal(await prisma.assignment.count({ where: { contentItemId: 'v5' } }), 0);

  // Video anterior a la cadena (sin pasos): la Cadena lo muestra y «Crear paso» lo arregla.
  await createVideo('v6', 'A');
  assert.ok((await scope.readChain(as('owner'))).stuck.withoutStep.some((s) => s.video.id === 'v6' && s.expected === 'GUION'));
  await assert.rejects(run('carlos', (t, u) => chain.ensureChainForVideo(t, 'v6', { actor: u })), /permiso|acceso/);
  await assert.rejects(run('edward', (t, u) => chain.ensureChainForVideo(t, 'v6', { actor: u, step: 'GRABACION' })), /le corresponde el paso «Guion»/);
  const due = days.endOfDayKey(days.addDaysToKey(today(), 2));
  const made = await run('edward', (t, u) => chain.ensureChainForVideo(t, 'v6', { actor: u, assigneeId: 'paula', dueAt: due }));
  assert.equal(made.created, true);
  const s6 = await step('v6', 'GUION');
  assert.deepEqual([s6.assigneeId, s6.source, s6.dueAt.toISOString()], ['paula', 'MANUAL', due.toISOString()]);
  assert.equal((await run('edward', (t, u) => chain.ensureChainForVideo(t, 'v6', { actor: u }))).created, false, 'idempotente');

  await createVideo('v7d', 'D');
  assert.equal((await created('v7d')).reason, 'no_team');
  await assert.rejects(run('owner', (t, u) => chain.ensureChainForVideo(t, 'v7d', { actor: u })), /no tiene equipo/);
  assert.deepEqual(await invariants(), ZERO);
});

test('desvincular, cancelar y reabrir dejan un solo paso abierto y las tareas en su columna', async () => {
  await createVideo('v7', 'A');
  await createScript('s7', 'A');
  await created('v7');
  await link('s7', 'v7');
  await entregarYRevisar('paula', (await step('v7', 'GUION')).id);
  assert.equal((await step('v7', 'GRABACION')).status, 'PENDIENTE');

  // Desvincular (la acción de B2 escribe el vínculo y emite el evento en la misma transacción).
  await tx(async (t) => {
    await t.contentItem.update({ where: { id: 'v7' }, data: { scriptId: null, structureId: null } });
    return chain.chainEvent(t, as('paula'), { type: 'SCRIPT_UNLINKED', videoId: 'v7' });
  });
  assert.equal((await step('v7', 'GUION')).status, 'PENDIENTE');
  assert.equal((await step('v7', 'GUION')).task.columnId, FIRST, 'la tarea vuelve a la primera columna');
  assert.equal((await step('v7', 'GRABACION')).status, 'CANCELADO');
  assert.equal((await step('v7', 'GRABACION')).task.columnId, LAST);
  await assert.rejects(entregarYRevisar('paula', (await step('v7', 'GUION')).id), /Vincula un guion/);

  // Cancelar el video (ciclo de vida real) cancela los pasos; reabrirlo reactiva el que toca.
  const cancel = async (status, reason) => {
    const video = await prisma.contentItem.findUniqueOrThrow({ where: { id: 'v7' } });
    await run('owner', (t, u) => lifecycle.transitionVideo(t, u, { id: 'v7', status, expectedUpdatedAt: video.updatedAt.toISOString(), override: false, reason }));
  };
  await cancel('CANCELADO', 'La marca canceló la campaña');
  assert.equal((await openSteps('v7')).length, 0);
  assert.equal((await step('v7', 'GUION')).status, 'CANCELADO');
  assert.equal((await step('v7', 'GUION')).task.columnId, LAST);
  await cancel('IDEA', 'La marca retomó la campaña');
  const reopened = await openSteps('v7');
  assert.deepEqual(reopened.map((s) => s.step), ['GUION']);
  assert.equal((await step('v7', 'GUION')).task.columnId, FIRST);
  assert.deepEqual(await invariants(), ZERO);
});

test('dos «Listo» a la vez: uno gana y el otro recibe EDIT_CONFLICT; la tarea en «Listo» equivale al Listo', async () => {
  await createVideo('v8', 'A');
  await createScript('s8', 'A');
  await created('v8');
  await link('s8', 'v8');
  await entregarYRevisar('paula', (await step('v8', 'GUION')).id);
  const grab = await step('v8', 'GRABACION');
  const input = { materialUrl: 'https://drive.example.test/v8', expectedUpdatedAt: grab.updatedAt.toISOString() };
  const results = await Promise.allSettled([entregarYRevisar('carlos', grab.id, input), entregarYRevisar('owner', grab.id, input)]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.match(results.find((r) => r.status === 'rejected').reason.message, /Este registro cambió/);
  assert.equal(await prisma.productionStep.count({ where: { contentItemId: 'v8', step: 'EDICION' } }), 1);

  // Tarea↔paso: el editor deja el máster y mueve su tarea a «Listo» → publicación.
  const edit = await step('v8', 'EDICION');
  await prisma.productionStep.update({ where: { id: edit.id }, data: { materialUrl: 'https://drive.example.test/v8-master' } });
  const moved = await run('laudder', (t, u) => chain.chainEvent(t, u, { type: 'TASK_MOVED', taskId: edit.taskId, toColumnId: LAST }));
  assert.equal(moved.done, true);
  await revisar('v8','REVISION_FINAL');
  assert.equal((await step('v8', 'PUBLICACION')).status, 'PENDIENTE');
  await assert.rejects(run('owner', (t, u) => chain.chainEvent(t, u, { type: 'TASK_MOVED', taskId: edit.taskId, toColumnId: FIRST })), /ya está listo/);
  // Repetir el Listo de un paso hecho no escribe nada.
  assert.equal((await entregarYRevisar('laudder', edit.id)).status, 'already');
  assert.deepEqual(await invariants(), ZERO);
});

test('caminos viejos convergen: guion enviado a revisión, checks, revisión final a mano, estado a mano y fechas', async () => {
  await createVideo('v9', 'A');
  await createScript('s9', 'A');
  await created('v9');
  await link('s9', 'v9');
  // «Enviar a revisión» desde Guiones equivale al Listo del guionista (regla del dueño).
  const s9 = await prisma.script.findUniqueOrThrow({ where: { id: 's9' } });
  await run('paula', (t, u) => lifecycle.transitionScript(t, u, { id: 's9', status: 'REVISION', expectedUpdatedAt: s9.updatedAt.toISOString(), override: false, reason: '' }));
  assert.equal((await prisma.script.findUniqueOrThrow({ where: { id: 's9' } })).status, 'REVISION');
  await revisar('v9','REVISION_GUION');
  assert.equal((await step('v9', 'GUION')).status, 'HECHO');
  assert.equal((await prisma.contentItem.findUniqueOrThrow({ where: { id: 'v9' } })).status, 'APROBADO');
  // Con la cadena, «Enviar a revisión» exige el CTA (en el guion o en sus videos).
  await createScript('s9b', 'A', null);
  const s9b = await prisma.script.findUniqueOrThrow({ where: { id: 's9b' } });
  await assert.rejects(run('owner', (t, u) => lifecycle.transitionScript(t, u, { id: 's9b', status: 'REVISION', expectedUpdatedAt: s9b.updatedAt.toISOString(), override: false, reason: '' })), /CTA/);

  // Fecha de grabación cambiada a mano: el paso y su tarea la siguen.
  const newShoot = days.addDaysToKey(today(), 5);
  await tx(async (t) => {
    await t.contentItem.update({ where: { id: 'v9' }, data: { shootDate: utils.fromDateKey(newShoot) } });
    return chain.chainEvent(t, as('owner'), { type: 'DATE_CHANGED', videoId: 'v9', field: 'shootDate' });
  });
  const grab = await step('v9', 'GRABACION');
  assert.equal(utils.dateKey(grab.dueAt), newShoot);
  assert.equal(utils.dateKey(grab.task.dueDate), newShoot);

  // Checks de grabación: sin completar no pasa nada; completos sin enlace, tampoco; con enlace, Listo de quien los marcó.
  const checkEvent = () => tx((t) => chain.chainEvent(t, as('carlos'), { type: 'CHECK_DONE', videoId: 'v9', stage: 'GRABACION', kind: 'TASK' }));
  assert.equal((await checkEvent()).reason, 'not_ready');
  await prisma.checklistItem.updateMany({ where: { contentItemId: 'v9', stage: { in: ['PREPRODUCCION', 'GRABACION'] }, kind: 'TASK', required: true }, data: { done: true, doneById: 'carlos', doneAt: new Date() } });
  assert.equal((await checkEvent()).reason, 'material_missing');
  assert.equal((await step('v9', 'GRABACION')).status, 'PENDIENTE');
  await prisma.productionStep.update({ where: { id: grab.id }, data: { materialUrl: 'https://drive.example.test/v9' } });
  assert.equal((await checkEvent()).done, true);
  assert.equal((await step('v9', 'GRABACION')).status, 'HECHO');
  assert.equal((await prisma.contentItem.findUniqueOrThrow({ where: { id: 'v9' } })).status, 'EDICION');

  // Revisión final firmada por una persona desde el checklist: exige el máster y abre la publicación.
  await assert.rejects(tx((t) => chain.assertFinalApprovalAllowed(t, 'v9')), /máster/);
  const edit = await step('v9', 'EDICION');
  await prisma.productionStep.update({ where: { id: edit.id }, data: { materialUrl: 'https://drive.example.test/v9-master' } });
  await prisma.checklistItem.updateMany({ where: { contentItemId: 'v9', stage: 'POSTPRODUCCION', kind: 'TASK', required: true }, data: { done: true, doneById: 'laudder', doneAt: new Date() } });
  const approvals = mod('src/lib/approvals.ts');
  await tx(async (t) => {
    await chain.assertFinalApprovalAllowed(t, 'v9');
    const approval = await approvals.approveVersion(t, as('edward'), 'FINAL_APPROVAL', 'v9');
    await t.checklistItem.updateMany({ where: { contentItemId: 'v9', kind: 'FINAL_APPROVAL' }, data: { done: true, doneById: 'edward', doneAt: new Date(), approvalId: approval.id } });
    return chain.chainEvent(t, as('edward'), { type: 'CHECK_DONE', videoId: 'v9', stage: 'POSTPRODUCCION', kind: 'FINAL_APPROVAL' });
  });
  assert.equal((await step('v9', 'EDICION')).status, 'HECHO');
  const pub = await step('v9', 'PUBLICACION');
  assert.deepEqual([pub.status, pub.assigneeId], ['PENDIENTE', 'silvanna']);

  // Estado a mano: Programado no duplica nada; la fecha prevista mueve el plazo; Publicado cierra el paso.
  const video = async () => prisma.contentItem.findUniqueOrThrow({ where: { id: 'v9' } });
  const later = days.addDaysToKey(today(), 9);
  await run('silvanna', async (t, u) => lifecycle.recordPublication(t, u, { id: 'v9', expectedUpdatedAt: (await video()).updatedAt.toISOString(), publishedUrl: 'https://tiktok.example.test/@marca/v9', scheduledDate: utils.fromDateKey(later) }));
  assert.equal(utils.dateKey((await step('v9', 'PUBLICACION')).dueAt), later, 'la fecha prevista manda sobre el plazo');
  await run('silvanna', async (t, u) => lifecycle.transitionVideo(t, u, { id: 'v9', status: 'PROGRAMADO', expectedUpdatedAt: (await video()).updatedAt.toISOString(), override: false, reason: '' }));
  assert.equal((await openSteps('v9')).length, 1);
  await prisma.checklistItem.updateMany({ where: { contentItemId: 'v9', stage: 'PUBLICACION', kind: 'TASK', required: true }, data: { done: true, doneById: 'silvanna', doneAt: new Date() } });
  await run('silvanna', async (t, u) => lifecycle.transitionVideo(t, u, { id: 'v9', status: 'PUBLICADO', expectedUpdatedAt: (await video()).updatedAt.toISOString(), override: false, reason: '' }));
  assert.equal((await step('v9', 'PUBLICACION')).status, 'HECHO', 'publicar cierra el paso del community');
  assert.equal((await step('v9', 'PUBLICACION')).task.columnId, LAST);

  // A mano hacia Edición: con la cadena exige el enlace del material en el paso de grabación.
  await createVideo('v12', 'A');
  await createScript('s12', 'A');
  await created('v12');
  await link('s12', 'v12');
  await entregarYRevisar('paula', (await step('v12', 'GUION')).id);
  await prisma.checklistItem.updateMany({ where: { contentItemId: 'v12', stage: { in: ['PREPRODUCCION', 'GRABACION'] }, kind: 'TASK', required: true }, data: { done: true, doneById: 'carlos', doneAt: new Date() } });
  const v12 = async () => prisma.contentItem.findUniqueOrThrow({ where: { id: 'v12' } });
  await run('carlos', async (t, u) => lifecycle.transitionVideo(t, u, { id: 'v12', status: 'GRABACION', expectedUpdatedAt: (await v12()).updatedAt.toISOString(), override: false, reason: '' }));
  assert.equal((await openSteps('v12'))[0].step, 'GRABACION');
  await assert.rejects(run('owner', async (t, u) => lifecycle.transitionVideo(t, u, { id: 'v12', status: 'EDICION', expectedUpdatedAt: (await v12()).updatedAt.toISOString(), override: false, reason: '' })), /Falta el enlace del material grabado/);

  // Reabrir hacia atrás (Edición → Grabación) reactiva la grabación y cancela lo posterior.
  const v8 = async () => prisma.contentItem.findUniqueOrThrow({ where: { id: 'v8' } });
  await prisma.checklistItem.updateMany({where:{contentItemId:'v8',stage:'PREPRODUCCION',kind:'TASK',required:true},data:{done:true,doneById:'carlos',doneAt:new Date()}});
  await run('owner', async (t, u) => lifecycle.transitionVideo(t, u, { id: 'v8', status: 'GRABACION', expectedUpdatedAt: (await v8()).updatedAt.toISOString(), override: false, reason: 'Hay que regrabar el final' }));
  assert.deepEqual((await openSteps('v8')).map((s) => s.step), ['GRABACION']);
  assert.equal((await step('v8', 'PUBLICACION')).status, 'CANCELADO');
  assert.deepEqual(await invariants(), ZERO);
});

test('equipo y asignaciones mueven los pasos; diseño entregado; «Tomar paso»; marcado viejo converge', async () => {
  // Marca B sin filmmaker: el paso nace sin asignar y lo recibe la persona que entra al equipo.
  await createVideo('v10', 'B');
  await createScript('s10', 'B');
  await created('v10');
  await link('s10', 'v10');
  await entregarYRevisar('paula', (await step('v10', 'GUION')).id);
  assert.equal((await step('v10', 'GRABACION')).assigneeId, null);
  await tx(async (t) => {
    await t.brandTeamMember.create({ data: { brandId: 'B', role: 'FILMMAKER', userId: 'carlos' } });
    return chain.chainEvent(t, as('owner'), { type: 'TEAM_CHANGED', brandId: 'B', role: 'FILMMAKER', previousUserId: null, userId: 'carlos' });
  });
  const grab = await step('v10', 'GRABACION');
  assert.deepEqual([grab.assigneeId, grab.task.assigneeId], ['carlos', 'carlos']);
  assert.equal(await prisma.assignment.count({ where: { contentItemId: 'v10', userId: 'carlos', role: 'CAMARA' } }), 1);
  assert.equal((await step('v3', 'GRABACION')).assigneeId, 'carlos', 'el paso manual no lo mueve el equipo');

  // Quitar la función de quien tiene el paso pendiente se bloquea.
  await assert.rejects(tx((t) => chain.assertAssignmentRemovable(t, 'v10', 'carlos', 'CAMARA')), /Reasigna primero/);

  // Asignación manual en el video: el paso sin responsable pasa a esa persona.
  await tx(async (t) => {
    await t.assignment.create({ data: { contentItemId: 'v5', userId: 'owner', role: 'GUIONISTA' } });
    return chain.chainEvent(t, as('owner'), { type: 'ASSIGNMENT_CHANGED', videoId: 'v5', role: 'GUIONISTA', userId: 'owner' });
  });
  assert.equal((await step('v5', 'GUION')).assigneeId, 'owner');

  // «Tomar paso»: solo quien ya ve el video (alcance), tiene la capacidad del paso y la marca.
  await createVideo('v11', 'C');
  await created('v11');
  const free = await step('v11', 'GUION');
  await assert.rejects(run('carlos', (t, u) => chain.takeStep(t, u, free.id)), /No tienes acceso a este paso o ya no existe/, 'no ve el video: el mismo mensaje que si no existiera');
  await prisma.assignment.create({ data: { contentItemId: 'v11', userId: 'carlos', role: 'CAMARA' } });
  await assert.rejects(run('carlos', (t, u) => chain.takeStep(t, u, free.id)), /Tu perfil no puede/, 've el video, pero su perfil no escribe guiones');
  await run('owner', (t, u) => chain.takeStep(t, u, free.id));
  assert.equal((await step('v11', 'GUION')).assigneeId, 'owner');

  // Diseño en paralelo: «Entregar diseño» exige el enlace y no toca el paso abierto de la cadena.
  const flow = mod('src/lib/domain/production-flow.ts');
  const design = await tx((t) => flow.requestDesign(t, as('paula'), 'v10', { designerId: 'owner', notes: 'Miniatura con el producto' }));
  await assert.rejects(entregarYRevisar('diego', design.id), /No tienes acceso|Solo coordinación/, 'diego no tiene la marca B');
  await prisma.productionStep.update({ where: { id: design.id }, data: { assigneeId: 'paula' } });
  await assert.rejects(entregarYRevisar('paula', design.id), /Tu perfil no puede/, 've el video pero no tiene content.design');
  await prisma.productionStep.update({ where: { id: design.id }, data: { assigneeId: 'owner' } });
  await assert.rejects(entregarYRevisar('owner', design.id), /entrega del diseño/);
  await entregarYRevisar('owner', design.id, { materialUrl: 'https://drive.example.test/miniatura' });
  assert.equal((await prisma.productionStep.findUniqueOrThrow({ where: { id: design.id } })).status, 'HECHO');
  assert.equal((await step('v10', 'GRABACION')).status, 'PENDIENTE');
  assert.ok((await scope.readMyWork(as('paula'))).designsDelivered.some((c) => c.id === design.id), '«Diseños entregados para ti»');
  // «Pedir cambios»: quien lo pidió lo reabre con 24 h nuevas; vuelve como «Te lo devolvieron».
  await assert.rejects(run('carlos', (t, u) => chain.requestDesignChanges(t, u, design.id, { motivo: 'Cambia el color' })), /permiso|acceso/);
  await run('paula', (t, u) => chain.requestDesignChanges(t, u, design.id, { motivo: 'El logo debe ir más grande' }));
  const redo = await prisma.productionStep.findUniqueOrThrow({ where: { id: design.id }, include: { task: true } });
  assert.deepEqual([redo.status, redo.task.columnId], ['PENDIENTE', FIRST]);
  assert.equal((await scope.readMyWork(as('owner'))).returned.find((c) => c.id === design.id)?.returned?.motivo, 'El logo debe ir más grande');
  await entregarYRevisar('owner', design.id, {});

  // «Marcar hecho» viejo (sin completeStep): la cadena abre el siguiente para no dejar el video sin
  // paso, y la vista Cadena lo muestra desfasado (el estado del video quedó atrás).
  await tx(async (t) => {
    await t.productionStep.update({ where: { id: grab.id }, data: { status: 'HECHO', doneAt: new Date() } });
    return flow.onStepCompleted(t, as('carlos'), { contentItemId: 'v10', step: 'GRABACION' });
  });
  assert.equal((await step('v10', 'EDICION')).status, 'PENDIENTE');
  const board = await scope.readChain(as('owner'));
  assert.ok(board.stuck.outOfSync.some(({ card, expected }) => card.video.id === 'v10' && expected === 'GRABACION'));
  assert.equal((await step('v10', 'GRABACION')).task.columnId, LAST, 'la tarea del paso marcado a mano también se cierra');
  assert.deepEqual(await invariants(), ZERO);
});

test('cadena apagada o fuera del canario: el flujo de siempre, sin pasos nuevos', async () => {
  delete process.env.PRODUCTION_CHAIN_ENABLED;
  try {
    await createVideo('e1', 'E');
    await createScript('se1', 'E');
    assert.deepEqual(await created('e1'), { done: false, reason: 'chain_off' });
    await link('se1', 'e1');
    const steps = await prisma.productionStep.findMany({ where: { contentItemId: 'e1' } });
    assert.deepEqual(steps.map((s) => s.step), ['GRABACION'], 'el vínculo programa la grabación como antes');
    assert.equal((await scope.readMyWork(as('carlos'))).enabled, false);
    assert.equal((await scope.stepCalendarEntries(as('carlos'), new Date(), new Date())).enabled, false);
  } finally {
    process.env.PRODUCTION_CHAIN_ENABLED = 'true';
  }
  process.env.PRODUCTION_CHAIN_BRANDS = 'A, B';
  try {
    await createVideo('e2', 'E');
    await createScript('se2', 'E');
    assert.equal((await created('e2')).reason, 'chain_off', 'E no está en el canario');
    await link('se2', 'e2');
    assert.deepEqual((await prisma.productionStep.findMany({ where: { contentItemId: 'e2' } })).map((s) => s.step), ['GRABACION']);
    const swept = await sweep.runProductionSweep(25, new Date());
    assert.equal(swept.enabled, true);
    assert.ok(!(await scope.readMyWork(as('carlos'))).groups.later.concat(...Object.values((await scope.readMyWork(as('carlos'))).groups)).some((c) => c.brand.id === 'E'));
  } finally {
    delete process.env.PRODUCTION_CHAIN_BRANDS;
  }
  assert.deepEqual(await sweep.runProductionSweep(25, new Date()), { enabled: true, candidates: 0, assigned: 0, skipped: 0, failed: 0 }, 'con la cadena en todas las marcas el barrido no toca grabaciones');
  assert.deepEqual(await invariants(), ZERO);
  await prisma.$disconnect();
});
