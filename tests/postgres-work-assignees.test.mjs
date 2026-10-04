import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { load } from './load-module.mjs';

// Solo fixtures en la base propia creada y eliminada por scripts/test-postgres.mjs.
const url = process.env.WORK_ASSIGNEES_TEST_DATABASE_URL;
if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname) || !new URL(url).pathname.endsWith('_test')) throw Error('Solo DB local efímera _test.');
process.env.AUTH_SECRET = randomBytes(32).toString('hex');
process.env.PRODUCTION_FLOW_ENABLED = '';
process.env.PRODUCTION_CHAIN_ENABLED = '';
delete process.env.PRODUCTION_CHAIN_BRANDS;
delete process.env.ARCHIVO_TOTAL_DESDE;
const prisma = new PrismaClient({ datasourceUrl: url });
const context = new AsyncLocalStorage(), registry = new Map();
const mocks = {
  '@/lib/prisma': { prisma },
  '@/lib/ai': { normalizeSceneTimes: x => x },
  'next/headers': {
    cookies: async () => ({ get: k => context.getStore()?.has(k) ? { value: context.getStore().get(k) } : undefined,
      set: (k, v) => context.getStore().set(k, v), delete: k => context.getStore().delete(k) }),
    headers: async () => new Headers(),
  },
  'next/cache': { revalidatePath: () => {}, revalidateTag: () => {} },
  'next/navigation': { redirect: path => { throw Error('REDIRECT:' + path); } },
};
const mod = file => load(file, mocks, registry);
const auth = mod('src/lib/auth.ts'), scope = mod('src/lib/access-scope.ts');
const tasks = mod('src/app/actions/tasks.ts'), content = mod('src/app/actions/content.ts');
const team = mod('src/app/actions/brand-team.ts'), production = mod('src/app/actions/production.ts');
const flow = mod('src/lib/domain/production-flow.ts');
const form = values => { const fd = new FormData(); for (const [k,v] of Object.entries(values)) if(v !== null && v !== undefined) fd.set(k,String(v)); return fd; };
const as = async (id, fn) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id } }), jar = new Map();
  await context.run(jar, () => auth.createSession(id, user.sessionVersion));
  return context.run(jar, fn);
};
const counts = async () => Object.fromEntries(await Promise.all(['contentItem','checklistItem','assignment','productionStep','task','auditLog']
  .map(async model => [model, await prisma[model].count()])));
after(() => prisma.$disconnect());

test('fixtures: dos marcas nuevas, una archivada y cuentas con permisos distintos', async () => {
  for (const id of ['A','B','old']) await prisma.brand.create({ data: { id, name: id, slug: `assign-${id}`, archived: id === 'old' } });
  const members = { owner: [], blank: [], writer: ['WRITER'], camera: ['CAMERA'], other: ['CAMERA'], talent: ['TALENT'], designer: ['DESIGNER'], inactive: ['CAMERA'] };
  for (const [id, profiles] of Object.entries(members)) {
    await prisma.user.create({ data: { id, name: id, email: `${id}@assign.test`, role: id === 'owner' ? 'OWNER' : 'MEMBER',
      passwordHash: 'fixture', active: id !== 'inactive', workProfiles: { create: profiles.map(profile => ({profile})) },
      brandAccess: { create: [{brandId:id === 'other' ? 'B' : 'A'}, {brandId:'old'}] } } });
  }
  await prisma.taskColumn.createMany({ data: [{id:'todo',name:'Plan',order:0},{id:'done',name:'Listo',order:4}] });
  await prisma.contentItem.create({ data: {id:'video',title:'Video nuevo',brandId:'A',scheduledDate:new Date('2026-10-12T12:00:00Z')} });
});

test('tareas: rechaza destinatarios sin perfil, de baja, de otra marca y marcas archivadas sin escrituras parciales', async () => {
  const before = await counts();
  for (const data of [
    {assigneeId:'blank',brandId:'A'}, {assigneeId:'inactive',brandId:'A'}, {assigneeId:'other',brandId:'A'},
    {assigneeId:'blank',brandId:''}, {assigneeId:'owner',brandId:'old'},
  ]) {
    const result = await as('owner', () => tasks.crearTarea(form({ title:'No debe guardarse',columnId:'todo',...data })));
    assert.equal(result.ok,false);
    assert.match(result.error,/perfil|marca vigente/);
  }
  assert.deepEqual(await counts(),before);
});

test('tarea válida: nueva conexión y nueva sesión conservan destinatario, visibilidad, fecha y finalización', async () => {
  const created = await as('owner', () => tasks.crearTarea(form({title:'Preparar cámara',columnId:'todo',brandId:'A',assigneeId:'camera',dueDate:'2026-10-12'})));
  assert.equal(created.ok,true);
  const reader = new PrismaClient({ datasourceUrl:url });
  try {
    for (const [id, expected] of [['camera',1],['other',0],['talent',0],['blank',0]]) {
      const session = await as(id, () => auth.getSession());
      assert.equal(await reader.task.count({where:{AND:[{id:created.task.id},scope.taskScope(session)]}}),expected,id);
    }
    const stored = await reader.task.findUniqueOrThrow({where:{id:created.task.id}});
    assert.equal(stored.assigneeId,'camera');
    assert.equal(mod('src/lib/utils.ts').dateKey(stored.dueDate),'2026-10-12');
    const auditBefore = await prisma.auditLog.count();
    const wrong = await as('owner', () => tasks.actualizarTarea(form({...stored,assigneeId:'blank',dueDate:'2026-10-12',expectedUpdatedAt:stored.updatedAt.toISOString()})));
    assert.equal(wrong.ok,false);
    assert.equal((await reader.task.findUniqueOrThrow({where:{id:stored.id}})).assigneeId,'camera');
    assert.equal(await prisma.auditLog.count(),auditBefore);
    assert.equal((await as('camera', () => tasks.moverTarea(stored.id,'done',undefined,stored.updatedAt.toISOString()))).ok,true);
    const secondSession = await as('camera', () => auth.getSession());
    const completed = await reader.task.findFirstOrThrow({where:{AND:[{id:stored.id},scope.taskScope(secondSession)]}});
    assert.equal(completed.columnId,'done');
  } finally { await reader.$disconnect(); }
});

test('video: el rol requiere capacidades reales y la asignación válida permite leer el guion enlazado', async () => {
  const before = await counts();
  for (const [userId,role] of [['blank','ACTOR'],['writer','CAMARA'],['designer','ACTOR'],['other','CAMARA']]) {
    assert.match((await as('owner', () => content.asignarPersona(form({contentItemId:'video',userId,role})))).error,/perfil/);
  }
  assert.deepEqual(await counts(),before);
  await prisma.script.create({data:{id:'script',title:'Guion nuevo',brandId:'A',authorId:'writer'}});
  await prisma.contentItem.update({where:{id:'video'},data:{scriptId:'script'}});
  assert.equal(await as('owner', () => content.asignarPersona(form({contentItemId:'video',userId:'talent',role:'ACTOR'}))),undefined);
  const session = await as('talent', () => auth.getSession());
  assert.equal(await prisma.contentItem.count({where:{AND:[{id:'video'},scope.contentScope(session)]}}),1);
  assert.equal(await prisma.script.count({where:{AND:[{id:'script'},scope.scriptScope(session)]}}),1);
});

test('equipo preparado con flujo apagado: rechaza perfil incompatible y guarda funciones sin crear entregas', async () => {
  assert.match((await as('owner', () => team.guardarEquipoDeMarca(form({brandId:'A',expectedUpdatedAt:'new','role-FILMMAKER':'writer'})))).error,/perfil/);
  assert.equal(await prisma.brandTeamMember.count(),0);
  const before = await counts();
  assert.equal(await as('owner', () => team.guardarEquipoDeMarca(form({brandId:'A',expectedUpdatedAt:'new','role-GUIONISTA':'writer','role-FILMMAKER':'camera',autoAssign:'1'}))),undefined);
  assert.equal(await prisma.brandTeamMember.count({where:{brandId:'A'}}),2);
  assert.equal(await prisma.productionStep.count(),before.productionStep);
  assert.equal(await prisma.task.count(),before.task);
});

test('automatización: descarta cámara histórica sin capacidad; revocar perfil impide cerrar el paso anterior', async () => {
  process.env.PRODUCTION_FLOW_ENABLED = 'true';
  await prisma.assignment.create({data:{contentItemId:'video',userId:'writer',role:'CAMARA'}});
  const result = await prisma.$transaction(tx => flow.scheduleRecording(tx,null,'video'),{isolationLevel:'Serializable'});
  assert.equal(result.done,true);
  const step = await prisma.productionStep.findUniqueOrThrow({where:{id:result.stepId},include:{task:true}});
  assert.equal(step.assigneeId,'camera');
  assert.equal(step.task.assigneeId,'camera');
  await prisma.userWorkProfile.update({where:{userId_profile:{userId:'camera',profile:'CAMERA'}},data:{profile:'TALENT'}});
  const denied = await as('camera', () => production.marcarPaso(form({id:step.id,done:'1',expectedUpdatedAt:step.updatedAt.toISOString()})));
  assert.match(denied.error,/Solo coordinación/);
  assert.equal((await prisma.productionStep.findUniqueOrThrow({where:{id:step.id}})).status,'PENDIENTE');
});

test('crear video: un fallo real al insertar su tarea revierte video, checklist, asignación, paso y auditoría', async () => {
  process.env.PRODUCTION_CHAIN_ENABLED = 'true';
  await prisma.$executeRawUnsafe(`CREATE FUNCTION assignment_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.title LIKE '%Atomic%' THEN RAISE EXCEPTION 'entrega fallida de prueba'; END IF; RETURN NEW; END $$`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER assignment_test_fail BEFORE INSERT ON "Task" FOR EACH ROW EXECUTE FUNCTION assignment_test_fail()`);
  const before = await counts();
  try {
    await assert.rejects(as('owner', () => content.crearVideo(form({brandId:'A',title:'Atomic entrega'}))),/entrega fallida de prueba/);
    assert.deepEqual(await counts(),before);
  } finally { await prisma.$executeRawUnsafe(`DROP TRIGGER assignment_test_fail ON "Task"`); }
  // Reintentar después de recuperar la DB crea exactamente una entrega completa.
  await assert.rejects(as('owner', () => content.crearVideo(form({brandId:'A',title:'Atomic entrega'}))),/^Error: REDIRECT:\/contenido\//);
  const video = await prisma.contentItem.findFirstOrThrow({where:{title:'Atomic entrega'},include:{productionSteps:{include:{task:true}}}});
  assert.equal(video.productionSteps.length,1);
  assert.equal(video.productionSteps[0].assigneeId,'writer');
  assert.equal(video.productionSteps[0].task.assigneeId,'writer');
});
