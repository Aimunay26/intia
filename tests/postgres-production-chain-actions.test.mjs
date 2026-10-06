import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { load } from './load-module.mjs';

/**
 * Acciones de la cadena de entregas (constructor B2) contra PostgreSQL real, con sesiones
 * firmadas y permisos reales: el «Listo», «Devolver», «Avisar a coordinación», «Crear paso» y
 * «Tomar paso» de production.ts; los ganchos de la ficha (content.ts), del tablero (tasks.ts),
 * del equipo de la marca (brand-team.ts), de Guiones (scripts.ts) y de la publicación
 * (publication.ts). Decisiones del Dueño (29-30/09/2026): sin revisión de guion ni revisión
 * final; el community devuelve por correcciones. Después de cada bloque, Q1-Q5 dan 0.
 */
const url = process.env.PRODUCTION_CHAIN_ACTIONS_TEST_DATABASE_URL;
if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname) || !new URL(url).pathname.endsWith('_test')) throw Error('Solo DB local efímera _test.');
process.env.AUTH_SECRET = randomBytes(32).toString('hex');
process.env.PRODUCTION_FLOW_ENABLED = 'true';
process.env.PRODUCTION_CHAIN_ENABLED = 'true';
delete process.env.PRODUCTION_CHAIN_BRANDS;

const prisma = new PrismaClient({ datasourceUrl: url });
const context = new AsyncLocalStorage();
const registry = new Map();
const mocks = {
  '@/lib/prisma': { prisma },
  '@/lib/ai': { normalizeSceneTimes: (x) => x },
  'next/headers': {
    cookies: async () => ({ get: (k) => context.getStore()?.has(k) ? { value: context.getStore().get(k) } : undefined, set: (k, v) => context.getStore().set(k, v), delete: (k) => context.getStore().delete(k) }),
    headers: async () => new Headers(),
  },
  'next/cache': { revalidatePath: () => {}, revalidateTag: () => {} },
  'next/navigation': { redirect: (path) => { throw Error('REDIRECT:' + path); }, notFound: () => { throw Error('NOT_FOUND'); } },
};
const mod = (file) => load(file, mocks, registry);
const auth = mod('src/lib/auth.ts');
const approvals = mod('src/lib/approvals.ts');
const scope = mod('src/lib/production-scope.ts');
const production = mod('src/app/actions/production.ts');
const content = mod('src/app/actions/content.ts');
const tasks = mod('src/app/actions/tasks.ts');
const team = mod('src/app/actions/brand-team.ts');
const scripts = mod('src/app/actions/scripts.ts');
const publication = mod('src/app/actions/publication.ts');
const utils = mod('src/lib/utils.ts');
const days = mod('src/lib/working-days.ts');
const prep = mod('src/lib/preparation.ts');
const prepActions = mod('src/app/actions/preparation.ts');

const quietly = async (fn) => { const { warn, info } = console; console.warn = () => {}; console.info = () => {}; try { return await fn(); } finally { console.warn = warn; console.info = info; } };
/** La acción con la sesión real de esa persona (cookie firmada en su propio almacén). */
const as = async (id, fn) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id } });
  const jar = new Map();
  await context.run(jar, () => auth.createSession(id, user.sessionVersion));
  return quietly(() => context.run(jar, fn));
};
const form = (values) => { const fd = new FormData(); for (const [k, v] of Object.entries(values)) for (const item of Array.isArray(v) ? v : [v]) if (item !== undefined && item !== null) fd.append(k, String(item)); return fd; };
const step = (video, kind) => prisma.productionStep.findUniqueOrThrow({ where: { automationKey: `${video}:${kind}` }, include: { task: true } });
const rev = (row) => row.updatedAt.toISOString();
const video = (id) => prisma.contentItem.findUniqueOrThrow({ where: { id } });
const today = () => utils.dateKey(new Date());
const LAST = 'initial-task-column-4', FIRST = 'initial-task-column-0';

/** crearVideo termina con redirect (después del commit): devuelve el id de la ficha nueva. */
async function crearVideo(who, brandId, title) {
  const error = await as(who, () => content.crearVideo(form({ title, brandId }))).then(() => null, (e) => e);
  const match = /^REDIRECT:\/contenido\/(.+)$/.exec(error?.message ?? '');
  assert.ok(match, `crearVideo debía redirigir a la ficha (${error?.message})`);
  return match[1];
}
async function crearGuion(id, brandId, author = 'owner') {
  await prisma.script.create({ data: { id, title: `Guion ${id}`, brandId, cta: 'Escríbenos hoy', authorId: author, scenes: { create: [{ order: 0, beat: 'Gancho', voice: 'Hola', action: 'Mira a cámara' }] } } });
}
const vincular = (who, scriptId, contentItemId) => as(who, () => scripts.asignarGuionAVideo(form({ scriptId, contentItemId })));
async function prepararEquipo(contentItemId) {
  // Fixture de sesión; los requisitos y sus firmas pasan por las acciones reales.
  const before = await video(contentItemId);
  if (before.shootStartMinute === null) await prisma.contentItem.update({ where: { id: contentItemId }, data: { shootStartMinute: 600, shootEndMinute: 660 } });
  const read = () => prisma.contentItem.findUniqueOrThrow({ where: { id: contentItemId }, include: prep.preparationInclude });
  let current = await read();
  assert.equal(await as('owner', () => prepActions.prepararGrabacion(form({ contentItemId, expectedToken: prep.preparationToken(current), expectedUpdatedAt: rev(current) }))), undefined);
  current = await read();
  for (const item of current.preparationItems.filter(i => i.status !== 'RETIRADO' && i.required)) {
    assert.ok(item.assigneeId);
    assert.equal(await as(item.assigneeId, () => prepActions.confirmarPreparacion(form({ contentItemId, id: item.id, expectedToken: prep.preparationToken(current), expectedUpdatedAt: rev(item), done: '1' }))), undefined);
  }
}
// Preparación de escenarios: entregar y aprobar son dos peticiones con sesiones distintas.
const revisar = async (video,kind) => {const row=await step(video,kind);return as(row.assigneeId??'owner',()=>production.marcarListo(form({id:row.id,expectedUpdatedAt:rev(row),expectedReviewToken:row.reviewToken})));};
const entregarYRevisar = async (who,row,extra={}) => {
  // Escenario ya preparado; el bloqueo de preparación se verifica en human-reviews.
  if(row.step==='GRABACION') {
    await prepararEquipo(row.contentItemId);
    await prisma.checklistItem.updateMany({where:{contentItemId:row.contentItemId,stage:'PREPRODUCCION',kind:'TASK',required:true},data:{done:true,doneById:'owner',doneAt:new Date()}});
  }
  const result=await as(who,()=>production.marcarListo(form({id:row.id,expectedUpdatedAt:rev(row),...extra})));
  if(!result?.error && row.status==='PENDIENTE' && ['GUION','EDICION'].includes(row.step)) return revisar(row.contentItemId,row.step==='GUION'?'REVISION_GUION':'REVISION_FINAL');
  return result;
};
const settingsRev = async (brandId) => (await prisma.brandProductionSettings.findUnique({ where: { brandId } }))?.updatedAt.toISOString() ?? 'new';
const teamForm = async (brandId, roles, extra = {}) => form({ brandId, expectedUpdatedAt: await settingsRev(brandId), ...Object.fromEntries(Object.entries(roles).map(([role, userId]) => [`role-${role}`, userId])), ...extra });
const taskForm = (task, extra = {}) => form({
  id: task.id, expectedUpdatedAt: rev(task), title: task.title, description: task.description ?? '', kind: task.kind, priority: task.priority,
  dueDate: task.dueDate ? utils.dateKey(task.dueDate) : '', assigneeId: task.assigneeId ?? '', brandId: task.brandId ?? '', columnId: task.columnId, ...extra,
});
/** Video nuevo con guion vinculado y el «Listo» de la guionista: queda en Aprobado con la grabación abierta. */
async function hastaGrabacion(videoTitle, brandId, scriptId) {
  const id = await crearVideo('edward', brandId, videoTitle);
  await crearGuion(scriptId, brandId);
  await vincular('owner', scriptId, id);
  const res = await entregarYRevisar('paula', await step(id, 'GUION'));
  assert.equal(res?.ok, true, res?.error);
  return id;
}

async function invariants() {
  const q = async (sql) => Number((await prisma.$queryRawUnsafe(sql))[0].n);
  return {
    Q1: await q(`SELECT count(*)::int AS n FROM "ProductionStep" s JOIN "Task" t ON t.id=s."taskId"
      JOIN LATERAL (SELECT c.id FROM "TaskColumn" c WHERE c."brandId" IS NULL OR c."brandId"=s."brandId" ORDER BY c."order" DESC, c.id DESC LIMIT 1) l ON true
      WHERE s."brandId" <> 'E' AND (s.status='PENDIENTE') = (t."columnId"=l.id)`),
    Q2: await q(`SELECT count(*)::int AS n FROM "ContentItem" c WHERE c."brandId" <> 'E' AND c.id NOT LIKE 'pre-%' AND c.status IN ('IDEA','GUION','APROBADO','GRABACION','EDICION','PROGRAMADO')
      AND EXISTS (SELECT 1 FROM "BrandTeamMember" m WHERE m."brandId"=c."brandId")
      AND NOT EXISTS (SELECT 1 FROM "ProductionStep" s WHERE s."contentItemId"=c.id AND s.status='PENDIENTE' AND s.step<>'DISENO')`),
    Q3: await q(`SELECT count(*)::int AS n FROM "ProductionStep" s JOIN "ContentItem" c ON c.id=s."contentItemId" WHERE s.step='PUBLICACION' AND s.status='PENDIENTE' AND c.status='PUBLICADO'`),
    Q4: await q(`SELECT count(*)::int AS n FROM (SELECT "contentItemId" FROM "ProductionStep" WHERE status='PENDIENTE' AND step<>'DISENO' GROUP BY "contentItemId" HAVING count(*)>1) x`),
    Q5: await q(`SELECT count(*)::int AS n FROM "ProductionStep" s JOIN "User" u ON u.id=s."assigneeId" WHERE s.status='PENDIENTE'
      AND (NOT u.active OR (u.role<>'OWNER' AND NOT EXISTS (SELECT 1 FROM "UserBrandAccess" a WHERE a."userId"=u.id AND a."brandId"=s."brandId")))`),
  };
}
const ZERO = { Q1: 0, Q2: 0, Q3: 0, Q4: 0, Q5: 0 };

test('equipo de la marca: el perfil de cada función se valida con la cadena encendida', async () => {
  await prisma.user.create({ data: { id: 'owner', name: 'Yoryo', email: 'owner@actions.test', role: 'OWNER', passwordHash: 'fixture' } });
  for (const [id, name] of [['A', 'Con Amor'], ['B', 'Sin encargado'], ['C', 'Manual'], ['E', 'Flujo viejo']]) await prisma.brand.create({ data: { id, name, slug: `actions-${id.toLowerCase()}` } });
  const members = { edward: [['STRATEGY'], ['A', 'B', 'C', 'E']], paula: [['WRITER'], ['A', 'B', 'C', 'E']], carlos: [['CAMERA'], ['A', 'B', 'C', 'E']], laudder: [['EDITOR'], ['A', 'B', 'E']], silvanna: [['PUBLISHER'], ['A', 'E']], diego: [['DESIGNER'], ['A']] };
  for (const [id, [profiles, brands]] of Object.entries(members)) {
    await prisma.user.create({ data: { id, name: id[0].toUpperCase() + id.slice(1), email: `${id}@actions.test`, passwordHash: 'fixture' } });
    await prisma.userWorkProfile.createMany({ data: profiles.map((profile) => ({ userId: id, profile })) });
    await prisma.userBrandAccess.createMany({ data: brands.map((brandId) => ({ userId: id, brandId })) });
  }
  for (const [name, order] of [['Idea o Acción', 0], ['Plan', 1], ['Ejecución', 2], ['Análisis', 3], ['Listo', 4]]) await prisma.taskColumn.create({ data: { id: `initial-task-column-${order}`, name, order } });

  const full = { ENCARGADO: 'edward', GUIONISTA: 'paula', FILMMAKER: 'carlos', EDITOR: 'laudder', COMMUNITY: 'silvanna', DISENADOR: 'diego' };
  const days24 = { recordingWeekdays: [2, 4], autoAssign: '1' };
  const wrong = await as('owner', async () => team.guardarEquipoDeMarca(await teamForm('A', { ...full, EDITOR: 'carlos' }, days24)));
  assert.match(wrong.error, /perfil que permita consultar y realizar/);
  const noLead = await as('owner', async () => team.guardarEquipoDeMarca(await teamForm('A', { ...full, ENCARGADO: 'paula' }, days24)));
  assert.match(noLead.error, /perfil que permita consultar y realizar/);
  assert.equal(await prisma.brandTeamMember.count(), 0, 'el rechazo no escribe nada');
  assert.equal(await as('owner', async () => team.guardarEquipoDeMarca(await teamForm('A', full, days24))), undefined);
  assert.equal(await as('edward', async () => team.guardarEquipoDeMarca(await teamForm('B', { GUIONISTA: 'paula', EDITOR: 'laudder' }, { autoAssign: '1' }))), undefined);
  assert.equal(await as('owner', async () => team.guardarEquipoDeMarca(await teamForm('C', { FILMMAKER: 'carlos' }))), undefined, 'C: asignación automática apagada');
  assert.equal((await prisma.brandProductionSettings.findUniqueOrThrow({ where: { brandId: 'C' } })).autoAssign, false);
  // La marca E se queda con el flujo viejo (se usa al final con la cadena apagada).
  await prisma.brandTeamMember.createMany({ data: [['GUIONISTA', 'paula'], ['FILMMAKER', 'carlos'], ['EDITOR', 'laudder'], ['COMMUNITY', 'silvanna']].map(([role, userId]) => ({ brandId: 'E', role, userId })) });
});

test('recorrido con las acciones: crear, vincular, «Listo», tarea a «Listo», devolver, avisar y publicar', async () => {
  const v1 = await crearVideo('edward', 'A', 'Video uno');
  const guion = await step(v1, 'GUION');
  assert.deepEqual([guion.assigneeId, guion.task.columnId], ['paula', FIRST], 'crearVideo abre el guion de la guionista del equipo');
  assert.equal(await prisma.assignment.count({ where: { contentItemId: v1, userId: 'paula', role: 'GUIONISTA' } }), 1);

  // El guion lo generó otra persona (owner): la asignación GUIONISTA deja a Paula terminarlo.
  await crearGuion('s1', 'A');
  assert.equal(await vincular('owner', 's1', v1), undefined);
  assert.equal((await prisma.productionStep.count({ where: { contentItemId: v1 } })), 1, 'vincular ya no programa la grabación');
  const off = await as('paula', () => production.marcarListo(form({ id: guion.id, expectedUpdatedAt: new Date(guion.updatedAt.getTime() - 1).toISOString() })));
  assert.match(off.error, /Este registro cambió/, 'revisión vieja del formulario');
  const r1 = await entregarYRevisar('paula', await step(v1, 'GUION'));
  assert.equal(r1.ok, true);
  assert.match(r1.message, /^Listo\. Ahora le toca a Carlos: grabación, vence el /);
  assert.equal((await video(v1)).status, 'APROBADO');
  assert.equal((await prisma.script.findUniqueOrThrow({ where: { id: 's1' }, include: { approval: true } })).approval.approvedByName, 'Edward');

  // Filmmaker: soltar la tarea en «Listo» sin el enlace se rechaza con el motivo y no mueve nada.
  let grab = await step(v1, 'GRABACION');
  await assert.rejects(as('carlos', () => tasks.moverTarea(grab.taskId, LAST, undefined, rev(grab.task))), /Falta el enlace del material grabado/);
  assert.deepEqual(await as('carlos', () => tasks.moverTareaConMotivo(grab.taskId, LAST, undefined, rev(grab.task))), { ok: false, error: 'Falta el enlace del material grabado.' });
  grab = await step(v1, 'GRABACION');
  assert.deepEqual([grab.status, grab.task.columnId], ['PENDIENTE', FIRST]);
  // Mover entre columnas intermedias es solo avance del tablero.
  assert.equal((await as('carlos', () => tasks.moverTarea(grab.taskId, 'initial-task-column-2', undefined, rev(grab.task)))).ok, true);
  grab = await step(v1, 'GRABACION');
  assert.deepEqual([grab.status, grab.task.columnId], ['PENDIENTE', 'initial-task-column-2']);
  assert.equal(await as('carlos', () => production.guardarMaterialPaso(form({ id: grab.id, materialUrl: 'https://drive.example.test/crudo', expectedUpdatedAt: rev(grab) }))), undefined);
  grab = await step(v1, 'GRABACION');
  await prepararEquipo(v1);
  await prisma.checklistItem.updateMany({where:{contentItemId:v1,stage:'PREPRODUCCION',kind:'TASK',required:true},data:{done:true,doneById:'carlos',doneAt:new Date()}});
  const moved = await as('carlos', () => tasks.moverTarea(grab.taskId, LAST, undefined, rev(grab.task)));
  assert.equal(moved.task.columnId, LAST);
  grab = await step(v1, 'GRABACION');
  assert.equal(grab.status, 'HECHO', 'la tarea en «Listo» es el Listo del paso');
  assert.equal((await video(v1)).status, 'EDICION');
  const edit = await step(v1, 'EDICION');
  assert.deepEqual([edit.assigneeId, edit.status], ['laudder', 'PENDIENTE']);
  await assert.rejects(as('carlos', () => tasks.moverTarea(grab.taskId, FIRST, undefined, rev(grab.task))), /ya está listo/);

  // Editor: devolver exige motivo; devuelto, la grabación vuelve a Carlos con un comentario.
  assert.match((await as('laudder', () => production.devolverPaso(form({ id: edit.id, motivo: 'no' })))).error, /motivo/);
  const back = await as('laudder', () => production.devolverPaso(form({ id: edit.id, motivo: 'Falta la toma del producto', expectedUpdatedAt: rev(edit) })));
  assert.equal(back.message, 'Devuelto: la grabación vuelve a Carlos con tu motivo.');
  assert.equal((await step(v1, 'EDICION')).status, 'DEVUELTO');
  assert.ok(await prisma.comment.count({ where: { contentItemId: v1, userId: 'laudder', body: { contains: 'Falta la toma del producto' } } }));
  assert.equal((await entregarYRevisar('carlos', await step(v1, 'GRABACION'))).ok, true, 'el enlace guardado basta');
  assert.equal((await step(v1, 'EDICION')).id, edit.id, 'se reactiva el mismo paso');

  // Editor entrega el máster; una revisión humana posterior habilita publicación.
  const r3 = await entregarYRevisar('laudder', await step(v1, 'EDICION'), { materialUrl: 'https://drive.example.test/master' });
  assert.match(r3.message, /Ahora le toca a Silvanna: publicación/);
  const final = await prisma.checklistItem.findFirstOrThrow({ where: { contentItemId: v1, kind: 'FINAL_APPROVAL' }, include: { approval: true } });
  assert.equal(final.approval.approvedByName, 'Edward');

  // Community: «Devolver por correcciones» revoca la aprobación final y reabre la edición.
  const pub = await step(v1, 'PUBLICACION');
  const fix = await as('silvanna', () => production.devolverPaso(form({ id: pub.id, motivo: 'Corrige los subtítulos del final' })));
  assert.equal(fix.message, 'Devuelto: la edición vuelve a Laudder con tu motivo.');
  assert.ok((await prisma.approval.findUniqueOrThrow({ where: { id: final.approvalId } })).revokedAt);
  assert.equal((await step(v1, 'PUBLICACION')).status, 'DEVUELTO');
  assert.equal((await entregarYRevisar('laudder', await step(v1, 'EDICION'))).ok, true);
  const pub2 = await step(v1, 'PUBLICACION');
  assert.deepEqual([pub2.id, pub2.status], [pub.id, 'PENDIENTE']);

  // Avisar a coordinación: solo quien tiene el paso (o coordinación); llega al ENCARGADO.
  assert.match((await as('carlos', () => production.avisarCoordinacion(form({ id: pub2.id, motivo: 'No me toca, pero aviso' })))).error, /No tienes acceso|Solo coordinación/);
  const aviso = await as('silvanna', () => production.avisarCoordinacion(form({ id: pub2.id, motivo: 'La marca pidió esperar al lunes' })));
  assert.equal(aviso.message, 'Avisamos a coordinación: lo verá en su trabajo.');
  assert.ok((await scope.readMyWork(await sessionOf('edward'))).coordination.notices.some((c) => c.id === pub2.id));
  await assert.rejects(as('silvanna', () => production.atenderAviso(form({ id: pub2.id }))), /permiso/);
  assert.equal((await as('edward', () => production.atenderAviso(form({ id: pub2.id })))).ok, true);
  assert.ok(!(await scope.readMyWork(await sessionOf('edward'))).coordination.notices.some((c) => c.id === pub2.id));

  // «Guardar y marcar publicado» es el «Publicado» del community.
  const before = await video(v1);
  const published = await as('silvanna', () => publication.guardarPublicacion(form({ id: v1, expectedUpdatedAt: rev(before), publishedUrl: 'https://tiktok.example.test/@marca/v1', publicado: '1' })));
  assert.equal(published, undefined);
  const done = await video(v1);
  assert.deepEqual([done.status, done.publishedUrl], ['PUBLICADO', 'https://tiktok.example.test/@marca/v1']);
  const closed = await step(v1, 'PUBLICACION');
  assert.deepEqual([closed.status, closed.task.columnId], ['HECHO', LAST]);
  const statuses = (await prisma.auditLog.findMany({ where: { entity: 'ContentItem', entityId: v1, changes: { contains: '"status"' } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })).map((a) => JSON.parse(a.changes).status.despues);
  assert.deepEqual(statuses, ['GUION', 'APROBADO', 'GRABACION', 'EDICION', 'APROBADO', 'GRABACION', 'EDICION', 'PROGRAMADO', 'PUBLICADO']);
  assert.equal(await prisma.auditLog.count({ where: { summary: { contains: 'Excepción del Dueño' } } }), 0);
  assert.deepEqual(await invariants(), ZERO);
});

const sessions = new Map();
async function sessionOf(id) {
  if (!sessions.has(id)) {
    const u = await prisma.user.findUniqueOrThrow({ where: { id }, include: { workProfiles: true, brandAccess: true } });
    sessions.set(id, { id: u.id, name: u.name, email: u.email, role: u.role, color: u.color, archetypeId: u.archetypeId, profiles: u.workProfiles.map((p) => p.profile).sort(), brandIds: u.brandAccess.map((b) => b.brandId).sort() });
  }
  return sessions.get(id);
}

test('ficha del video: asignar, quitar, fechas, revisión final a mano, retirarla, duplicar y desvincular', async () => {
  // Marca B sin filmmaker: la grabación nace «Sin asignar», pero con su fecha.
  const v2 = await hastaGrabacion('Video dos', 'B', 's2');
  let grab = await step(v2, 'GRABACION');
  assert.equal(grab.assigneeId, null);
  assert.ok((await video(v2)).shootDate, 'la fecha de grabación se escribe igual');

  // Asignar a alguien como Cámara en el video le pasa el paso; quitarlo se bloquea.
  assert.equal(await as('owner', () => content.asignarPersona(form({ contentItemId: v2, userId: 'carlos', role: 'CAMARA' }))), undefined);
  grab = await step(v2, 'GRABACION');
  assert.deepEqual([grab.assigneeId, grab.task.assigneeId], ['carlos', 'carlos']);
  const camara = await prisma.assignment.findFirstOrThrow({ where: { contentItemId: v2, userId: 'carlos', role: 'CAMARA' } });
  // El rechazo llega como { error } legible (no rompe la página de la ficha).
  assert.match((await as('owner', () => content.quitarAsignacion(form({ id: camara.id })))).error, /^Reasigna primero el paso «Grabación»/);
  assert.equal(await prisma.assignment.count({ where: { id: camara.id } }), 1);

  // Nueva fecha de grabación: el paso y su tarea la siguen.
  const shoot = days.addDaysToKey(today(), 5);
  assert.equal(await as('owner', async () => content.actualizarGrabacion(form({ id: v2, shootDate: shoot, expectedUpdatedAt: rev(await video(v2)) }))), undefined);
  grab = await step(v2, 'GRABACION');
  assert.deepEqual([utils.dateKey(grab.dueAt), utils.dateKey(grab.task.dueDate)], [shoot, shoot]);

  // Reasignar el paso con otra fecha mueve también la fecha del video (una sola fecha).
  const moveTo = days.addDaysToKey(today(), 3);
  assert.equal(await as('edward', () => production.reasignarPaso(form({ id: grab.id, assigneeId: 'carlos', dueDate: moveTo, expectedUpdatedAt: rev(grab) }))), undefined);
  assert.equal(utils.dateKey((await video(v2)).shootDate), moveTo);
  assert.equal((await step(v2, 'GRABACION')).source, 'MANUAL');
  assert.match((await as('edward', () => production.reasignarPaso(form({ id: grab.id, assigneeId: 'carlos', dueDate: moveTo })))).error, /revisión del formulario/);

  assert.equal((await entregarYRevisar('carlos', await step(v2, 'GRABACION'), { materialUrl: 'https://drive.example.test/v2' })).ok, true);
  const edit = await step(v2, 'EDICION');
  assert.equal(edit.assigneeId, 'laudder');

  // Revisión final firmada a mano desde el checklist: exige el máster en el paso de edición.
  await prisma.checklistItem.updateMany({ where: { contentItemId: v2, stage: { in: ['POSTPRODUCCION', 'GENERAL'] }, kind: 'TASK', required: true }, data: { done: true, doneById: 'laudder', doneAt: new Date() } });
  const finalCheck = await prisma.checklistItem.findFirstOrThrow({ where: { contentItemId: v2, kind: 'FINAL_APPROVAL' } });
  const approve = async () => as('edward', async () => content.alternarCheck(form({ id: finalCheck.id, done: 'on', expectedApproval: await approvals.approvalToken(prisma, 'FINAL_APPROVAL', v2) })));
  assert.match((await approve()).error, /paso de revisión/);
  assert.equal(await as('laudder', () => production.guardarMaterialPaso(form({ id: edit.id, materialUrl: 'https://drive.example.test/v2-master', expectedUpdatedAt: rev(edit) }))), undefined);
  assert.equal((await entregarYRevisar('laudder', await step(v2,'EDICION'))).ok,true);
  assert.equal((await step(v2, 'EDICION')).status, 'HECHO');
  const pub = await step(v2, 'PUBLICACION');
  assert.deepEqual([pub.status, pub.assigneeId], ['PENDIENTE', null], 'la marca B no tiene community: «Sin asignar»');

  // Retirar la revisión final (con motivo) devuelve la edición y cancela la publicación.
  assert.equal(await as('edward', () => content.alternarCheck(form({ id: finalCheck.id, done: '', reason: 'Hay que corregir el audio' }))), undefined);
  assert.deepEqual([(await step(v2, 'EDICION')).status, (await step(v2, 'PUBLICACION')).status], ['PENDIENTE', 'CANCELADO']);
  assert.equal((await step(v2, 'PUBLICACION')).task.columnId, LAST);

  // La fecha prevista editada en la ficha mueve el plazo de la publicación pendiente.
  assert.equal((await entregarYRevisar('laudder', await step(v2, 'EDICION'))).ok, true);
  const later = days.addDaysToKey(today(), 12);
  const v2row = await video(v2);
  assert.equal(await as('owner', () => content.actualizarVideo(form({ id: v2, title: v2row.title, scheduledDate: later, shootDate: utils.dateKey(v2row.shootDate), expectedUpdatedAt: rev(v2row) }))), undefined);
  assert.equal(utils.dateKey((await step(v2, 'PUBLICACION')).dueAt), later);

  // Duplicar: la copia nace como idea con su paso de guion.
  const error = await as('edward', () => content.duplicarVideo(form({ id: v2 }))).then(() => null, (e) => e);
  const copy = /^REDIRECT:\/contenido\/(.+)$/.exec(error?.message ?? '')?.[1];
  assert.ok(copy);
  assert.deepEqual((await prisma.productionStep.findMany({ where: { contentItemId: copy } })).map((s) => [s.step, s.status]), [['GUION', 'PENDIENTE']]);
  assert.equal((await video(copy)).shootDate, null, 'la copia no hereda la fecha de grabación del original');
  // Una fecha pasada sin origen auditado (heredada o anterior a la cadena) se recalcula al Listo: la grabación no nace vencida.
  await prisma.contentItem.update({ where: { id: copy }, data: { shootDate: utils.fromDateKey(days.addDaysToKey(today(), -7)) } });
  assert.equal((await video(copy)).scriptId, 's2', 'la copia conserva el guion del original');
  const copyListo = await entregarYRevisar('paula', await step(copy, 'GUION'));
  assert.equal(copyListo.ok, true, copyListo.error);
  const copyShoot = await step(copy, 'GRABACION');
  assert.ok(utils.dateKey(copyShoot.dueAt) > today(), 'la grabación de la copia vence después del Listo');
  assert.equal(utils.dateKey((await video(copy)).shootDate), utils.dateKey(copyShoot.dueAt));

  // Desvincular el guion: vuelve el paso del guion y la grabación pendiente se cancela.
  const v3 = await hastaGrabacion('Video tres', 'A', 's3');
  assert.equal(await as('owner', () => scripts.desvincularGuionDeVideo(form({ contentItemId: v3 }))), undefined);
  const g3 = await step(v3, 'GUION');
  assert.deepEqual([g3.status, g3.task.columnId], ['PENDIENTE', FIRST]);
  assert.deepEqual([(await step(v3, 'GRABACION')).status, (await step(v3, 'GRABACION')).task.columnId], ['CANCELADO', LAST]);
  assert.match((await entregarYRevisar('paula', g3)).error, /Vincula un guion/);
  assert.deepEqual(await invariants(), ZERO);
});

test('tablero y pasos: editar la tarea reasigna el paso; «Crear paso», «Tomar paso» y el «Marcar hecho» de siempre', async () => {
  const v4 = await hastaGrabacion('Video cuatro', 'A', 's4');
  let grab = await step(v4, 'GRABACION');
  assert.equal(grab.assigneeId, 'carlos');

  // Coordinación cambia responsable y fecha desde la tarea: el paso, la asignación y la fecha del video siguen.
  const target = days.addDaysToKey(today(), 4);
  const edited = await as('edward', () => tasks.actualizarTarea(taskForm(grab.task, { assigneeId: 'owner', dueDate: target })));
  assert.equal(edited.ok, true, edited.error);
  grab = await step(v4, 'GRABACION');
  assert.deepEqual([grab.assigneeId, grab.source, utils.dateKey(grab.dueAt)], ['owner', 'MANUAL', target]);
  assert.equal(utils.dateKey((await video(v4)).shootDate), target);
  assert.equal(await prisma.assignment.count({ where: { contentItemId: v4, userId: 'owner', role: 'CAMARA' } }), 1);
  // Una tarea de paso no cambia de marca, y la columna final sin el enlace se rechaza con el motivo.
  assert.deepEqual(await as('edward', () => tasks.actualizarTarea(taskForm(grab.task, { brandId: 'B' }))), { ok: false, error: 'Esta tarea es de un paso de producción: no puede cambiar de marca.' });
  assert.deepEqual(await as('edward', () => tasks.actualizarTarea(taskForm(grab.task, { columnId: LAST }))), { ok: false, error: 'Falta el enlace del material grabado.' });
  assert.equal((await step(v4, 'GRABACION')).status, 'PENDIENTE');

  // «Marcar hecho» de siempre con la cadena: es el Listo; «Reabrir» un paso hecho exige motivo y devuelve.
  grab = await step(v4, 'GRABACION');
  assert.equal(await as('owner', () => production.guardarMaterialPaso(form({ id: grab.id, materialUrl: 'https://drive.example.test/v4', expectedUpdatedAt: rev(grab) }))), undefined);
  grab = await step(v4, 'GRABACION');
  await prepararEquipo(v4);
  await prisma.checklistItem.updateMany({where:{contentItemId:v4,stage:'PREPRODUCCION',kind:'TASK',required:true},data:{done:true,doneById:'owner',doneAt:new Date()}});
  const marked = await as('owner', () => production.marcarPaso(form({ id: grab.id, done: '1', expectedUpdatedAt: rev(grab) })));
  assert.match(marked.message, /Ahora le toca a Laudder: edición/);
  grab = await step(v4, 'GRABACION');
  assert.match((await as('owner', () => production.marcarPaso(form({ id: grab.id, done: '0', expectedUpdatedAt: rev(grab) })))).error, /motivo/);
  const reopened = await as('owner', () => production.marcarPaso(form({ id: grab.id, done: '0', expectedUpdatedAt: rev(grab), motivo: 'Falta el plano detalle' })));
  assert.equal(reopened.message, 'Devolviste el video: la grabación vuelve a estar pendiente.');
  assert.deepEqual([(await step(v4, 'GRABACION')).status, (await step(v4, 'EDICION')).status], ['PENDIENTE', 'DEVUELTO']);

  // «Crear paso»: coordinación, solo el paso que le toca a la etapa del video.
  await prisma.contentItem.create({ data: { id: 'pre-v5', brandId: 'A', title: 'Video anterior a la cadena', status: 'IDEA', scheduledDate: utils.fromDateKey(today()), createdById: 'owner' } });
  await assert.rejects(as('carlos', () => production.crearPasoManual(form({ contentItemId: 'pre-v5' }))), /permiso/);
  assert.deepEqual(await as('edward', () => production.crearPasoManual(form({ videoId: 'pre-v5', step: 'GRABACION' }))), { error: 'El video está en «Idea»: le corresponde el paso «Guion».' });
  assert.deepEqual(await as('edward', () => production.crearPasoManual(form({ videoId: 'pre-v5' }))), { ok: true, message: 'Paso creado: «Guion» para Paula.' });
  assert.deepEqual(await as('edward', () => production.crearPaso(form({ contentItemId: 'pre-v5' }))), { ok: true, message: 'El video ya tenía abierto el paso «Guion».' });

  // «Tomar paso»: en la marca C (asignación automática apagada) el guion nace sin responsable.
  const v6 = await crearVideo('edward', 'C', 'Video seis');
  const free = await step(v6, 'GUION');
  assert.equal(free.assigneeId, null);
  assert.deepEqual(await as('carlos', () => production.tomarPaso(form({ id: free.id }))), { error: 'No tienes acceso a este paso o ya no existe. Recarga la página.' }, 'no ve el video: no lo toma');
  assert.deepEqual(await as('edward', () => production.tomarPaso(form({ id: free.id }))), { error: 'Tu perfil no puede hacer este paso.' }, 've el video pero no escribe guiones');
  assert.equal((await as('paula', () => production.tomarPaso(form({ id: free.id, expectedUpdatedAt: rev(free) })))).ok, true);
  const taken = await step(v6, 'GUION');
  assert.deepEqual([taken.assigneeId, taken.task.assigneeId], ['paula', 'paula']);
  assert.deepEqual(await invariants(), ZERO);
});

test('equipo: cambiar la persona de una función mueve sus pasos automáticos; encender la asignación reparte los «Sin asignar»', async () => {
  // B sin filmmaker: al entrar Carlos al equipo recibe la grabación «Sin asignar».
  const v7 = await hastaGrabacion('Video siete', 'B', 's7');
  assert.equal((await step(v7, 'GRABACION')).assigneeId, null);
  assert.equal(await as('owner', async () => team.guardarEquipoDeMarca(await teamForm('B', { GUIONISTA: 'paula', EDITOR: 'laudder', FILMMAKER: 'carlos' }, { autoAssign: '1' }))), undefined);
  const g7 = await step(v7, 'GRABACION');
  assert.deepEqual([g7.assigneeId, g7.task.assigneeId], ['carlos', 'carlos']);
  assert.equal(await prisma.assignment.count({ where: { contentItemId: v7, userId: 'carlos', role: 'CAMARA' } }), 1);

  // A: el filmmaker cambia; el paso automático se mueve y el reasignado a mano (v4) no.
  const v8 = await hastaGrabacion('Video ocho', 'A', 's8');
  assert.equal((await step(v8, 'GRABACION')).assigneeId, 'carlos');
  const fullA = { ENCARGADO: 'edward', GUIONISTA: 'paula', EDITOR: 'laudder', COMMUNITY: 'silvanna', DISENADOR: 'diego' };
  const v4 = (await prisma.contentItem.findFirstOrThrow({ where: { title: 'Video cuatro' } })).id;
  assert.deepEqual([(await step(v4, 'GRABACION')).assigneeId, (await step(v4, 'GRABACION')).source], ['owner', 'MANUAL']);
  assert.equal(await as('owner', async () => team.guardarEquipoDeMarca(await teamForm('A', { ...fullA, FILMMAKER: 'owner' }, { recordingWeekdays: [2, 4], autoAssign: '1' }))), undefined);
  const g8 = await step(v8, 'GRABACION');
  assert.deepEqual([g8.assigneeId, g8.task.assigneeId], ['owner', 'owner']);
  assert.equal(await as('owner', async () => team.guardarEquipoDeMarca(await teamForm('A', { ...fullA, FILMMAKER: 'carlos' }, { recordingWeekdays: [2, 4], autoAssign: '1' }))), undefined);
  assert.equal((await step(v8, 'GRABACION')).assigneeId, 'carlos', 'vuelve con la persona del equipo');
  assert.equal((await step(v4, 'GRABACION')).assigneeId, 'owner', 'un paso MANUAL no lo mueve el equipo');

  // C: encender la asignación automática con guionista reparte el guion «Sin asignar».
  const v9 = await crearVideo('edward', 'C', 'Video nueve');
  assert.equal((await step(v9, 'GUION')).assigneeId, null);
  assert.equal(await as('owner', async () => team.guardarEquipoDeMarca(await teamForm('C', { FILMMAKER: 'carlos', GUIONISTA: 'paula' }, { autoAssign: '1' }))), undefined);
  assert.equal((await step(v9, 'GUION')).assigneeId, 'paula');
  assert.deepEqual(await invariants(), ZERO);
});

test('columna nueva antes de «Listo», revisión final retirada en Programado, guion eliminado, responsables por perfil y coordinación apta', async () => {
  // 1) Con la cadena, una columna nueva entra antes de «Listo»: la sincronía tarea↔paso no cambia.
  const created = await as('owner', () => tasks.crearColumna('Bloqueado', '#ef4444'));
  assert.equal(created.ok, true);
  const globals = await prisma.taskColumn.findMany({ where: { brandId: null }, orderBy: [{ order: 'desc' }, { id: 'desc' }] });
  assert.deepEqual([globals[0].id, globals[1].id], [LAST, created.column.id], '«Listo» sigue siendo la última');
  const brandColumn = await as('owner', () => tasks.crearColumna('Revisión de marca', '#6366f1', 'A'));
  const lastA = await prisma.taskColumn.findFirstOrThrow({ where: { OR: [{ brandId: null }, { brandId: 'A' }] }, orderBy: [{ order: 'desc' }, { id: 'desc' }] });
  assert.equal(lastA.id, LAST, 'la columna de una marca también entra antes de «Listo»');
  assert.ok(brandColumn.column.order < lastA.order);
  const v20 = await hastaGrabacion('Video veinte', 'A', 's20');
  let g20 = await step(v20, 'GRABACION');
  assert.equal((await as('carlos', () => tasks.moverTarea(g20.taskId, created.column.id, undefined, rev(g20.task)))).ok, true);
  assert.equal((await step(v20, 'GRABACION')).status, 'PENDIENTE', 'soltar en la columna nueva no es el Listo');
  g20 = await step(v20, 'GRABACION');
  assert.equal((await entregarYRevisar('carlos', g20, { materialUrl: 'https://drive.example.test/v20' })).ok, true);
  assert.equal((await step(v20, 'GRABACION')).task.columnId, LAST, 'el Listo deja la tarea en «Listo», no en la columna nueva');

  // 2) Reasignar solo a quien puede hacer el paso (si no, quedaría trabado).
  const e20 = await step(v20, 'EDICION');
  assert.match((await as('edward', () => production.reasignarPaso(form({ id: e20.id, assigneeId: 'paula', dueDate: today(), expectedUpdatedAt: rev(e20) })))).error, /^Paula no puede editar: su perfil no lo permite/);
  assert.equal((await step(v20, 'EDICION')).assigneeId, 'laudder');

  // 3) Revisión final retirada con el video ya en Programado: Sistema lo devuelve a Edición,
  //    la edición vuelve al editor y la publicación se cancela (como «Devolver por correcciones»).
  assert.equal((await entregarYRevisar('laudder', await step(v20, 'EDICION'), { materialUrl: 'https://drive.example.test/v20-master' })).ok, true);
  const programado = await as('silvanna', async () => content.cambiarEstado(form({ id: v20, status: 'PROGRAMADO', expectedUpdatedAt: rev(await video(v20)) })));
  assert.equal(programado, undefined, programado?.error);
  const finalCheck = await prisma.checklistItem.findFirstOrThrow({ where: { contentItemId: v20, kind: 'FINAL_APPROVAL' } });
  assert.equal(await as('edward', () => content.alternarCheck(form({ id: finalCheck.id, done: '', reason: 'El cliente pidió cambiar la música' }))), undefined);
  assert.equal((await video(v20)).status, 'EDICION', 'Sistema devuelve el video a Edición');
  assert.deepEqual([(await step(v20, 'EDICION')).status, (await step(v20, 'EDICION')).assigneeId, (await step(v20, 'PUBLICACION')).status], ['PENDIENTE', 'laudder', 'CANCELADO']);
  assert.equal((await entregarYRevisar('laudder', await step(v20, 'EDICION'))).ok, true, 'el editor vuelve a firmar con el máster guardado');
  assert.equal((await step(v20, 'PUBLICACION')).status, 'PENDIENTE');

  // 4) Eliminar el guion: sus videos vuelven al paso Guion (como al desvincular).
  const v21 = await hastaGrabacion('Video veintiuno', 'A', 's21');
  await assert.rejects(as('owner', () => scripts.eliminarGuion(form({ id: 's21' }))), /REDIRECT:\/guiones/);
  assert.equal((await video(v21)).scriptId, null);
  assert.deepEqual([(await step(v21, 'GUION')).status, (await step(v21, 'GRABACION')).status], ['PENDIENTE', 'CANCELADO']);
  assert.deepEqual([(await step(v21, 'GUION')).task.columnId, (await step(v21, 'GRABACION')).task.columnId], [FIRST, LAST]);

  // 5) Un ENCARGADO que no puede asignar (equipo guardado antes de la cadena) no recibe la
  //    bandeja ni los avisos: le llegan al Dueño y la Cadena lo muestra como atasco.
  await prisma.brandTeamMember.create({ data: { brandId: 'B', role: 'ENCARGADO', userId: 'laudder' } });
  try {
    assert.equal((await scope.readMyWork(await sessionOf('laudder'))).coordination, null, 'el editor como encargado no ve la coordinación');
    assert.ok((await scope.readMyWork(await sessionOf('owner'))).coordination.brands.some((b) => b.id === 'B'), 'la marca B le llega al Dueño');
    const board = await scope.readChain(await sessionOf('owner'));
    assert.ok(board.stuck.leadsWithoutPermission.some((lead) => lead.brand.id === 'B' && lead.person.id === 'laudder'));
    const v22 = await hastaGrabacion('Video veintidós', 'B', 's22');
    assert.equal((await step(v22, 'GRABACION')).assigneeId, 'carlos', 'filmmaker de B desde el cambio de equipo');
    const aviso = await as('carlos', async () => production.avisarCoordinacion(form({ id: (await step(v22, 'GRABACION')).id, motivo: 'No hay locación para el martes' })));
    assert.equal(aviso.message, 'Avisamos a coordinación: lo verá en su trabajo.');
    assert.ok((await scope.readMyWork(await sessionOf('owner'))).coordination.notices.some((card) => card.video.id === v22), 'el aviso le llega al Dueño');
  } finally {
    await prisma.brandTeamMember.delete({ where: { brandId_role: { brandId: 'B', role: 'ENCARGADO' } } });
  }

  // 6) Cadena: filtro «Sin asignar» y la lista de personas no depende de los filtros.
  const owner = await sessionOf('owner');
  const all = await scope.readChain(owner);
  const unassigned = await scope.readChain(owner, { personId: scope.UNASSIGNED_FILTER });
  const cardsOf = (board) => [...Object.values(board.columns).flat(), ...board.designs];
  assert.ok(cardsOf(unassigned).length > 0 && cardsOf(unassigned).every((card) => !card.assignee));
  assert.equal(cardsOf(unassigned).length, all.header.unassigned);
  const onlyCarlos = await scope.readChain(owner, { personId: 'carlos' });
  assert.deepEqual(onlyCarlos.people, all.people, 'la lista de personas no se reduce al filtrar');
  assert.deepEqual(onlyCarlos.header, all.header, 'la cabecera no depende de los filtros');
  assert.deepEqual(await invariants(), ZERO);
});

test('cadena apagada: no abre pasos nuevos, pero sí valida el perfil del equipo', async () => {
  delete process.env.PRODUCTION_CHAIN_ENABLED;
  try {
    const apagada = { error: 'La cadena de entregas no está activa.' };
    for (const action of ['marcarListo', 'devolverPaso', 'avisarCoordinacion', 'crearPasoManual', 'crearPaso', 'tomarPaso', 'atenderAviso', 'pedirCambiosDiseno']) {
      assert.deepEqual(await production[action](form({ id: 'x', contentItemId: 'x' })), apagada, action);
    }
    // Crear un video en una marca con equipo no abre pasos; la elegibilidad siempre se valida.
    const e1 = await crearVideo('edward', 'E', 'Video viejo');
    assert.equal(await prisma.productionStep.count({ where: { contentItemId: e1 } }), 0);
    assert.match((await as('owner', async () => team.guardarEquipoDeMarca(await teamForm('E', { GUIONISTA: 'paula', FILMMAKER: 'carlos', EDITOR: 'carlos', COMMUNITY: 'silvanna' }, { autoAssign: '1' })))).error, /perfil/);
    assert.equal(await as('owner', async () => team.guardarEquipoDeMarca(await teamForm('E', { GUIONISTA: 'paula', FILMMAKER: 'carlos', EDITOR: 'laudder', COMMUNITY: 'silvanna' }, { autoAssign: '1' }))), undefined);
    // El vínculo programa la grabación como antes y su tarea se mueve sin mirar el paso.
    await crearGuion('se1', 'E');
    await vincular('owner', 'se1', e1);
    const old = await step(e1, 'GRABACION');
    assert.equal(old.status, 'PENDIENTE');
    assert.equal((await as('carlos', () => tasks.moverTarea(old.taskId, LAST, undefined, rev(old.task)))).task.columnId, LAST);
    assert.equal((await step(e1, 'GRABACION')).status, 'PENDIENTE', 'sin cadena, la tarea y el paso van por separado');
  } finally {
    process.env.PRODUCTION_CHAIN_ENABLED = 'true';
  }
  assert.deepEqual(await invariants(), ZERO);
  await prisma.$disconnect();
});
