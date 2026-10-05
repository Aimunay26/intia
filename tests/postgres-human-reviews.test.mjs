import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { load } from './load-module.mjs';

const url = process.env.HUMAN_REVIEWS_TEST_DATABASE_URL;
if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname) || !new URL(url).pathname.endsWith('_test')) throw Error('Solo DB local efímera _test.');
process.env.AUTH_SECRET = randomBytes(32).toString('hex');
process.env.PRODUCTION_FLOW_ENABLED = 'true';
process.env.PRODUCTION_CHAIN_ENABLED = 'true';
delete process.env.PRODUCTION_CHAIN_BRANDS;
const prisma = new PrismaClient({ datasourceUrl: url });
const context = new AsyncLocalStorage(), registry = new Map();
const mocks = {
  '@/lib/prisma': { prisma }, '@/lib/ai': { normalizeSceneTimes: x => x },
  'next/headers': { cookies: async () => ({ get: k => context.getStore()?.has(k) ? { value: context.getStore().get(k) } : undefined, set: (k,v) => context.getStore().set(k,v), delete: k => context.getStore().delete(k) }), headers: async () => new Headers() },
  'next/cache': { revalidatePath() {}, revalidateTag() {} },
  'next/navigation': { redirect: path => { throw Error('REDIRECT:' + path); }, notFound: () => { throw Error('NOT_FOUND'); } },
};
const mod = file => load(file, mocks, registry);
const auth = mod('src/lib/auth.ts'), chain = mod('src/lib/domain/production-chain.ts'), approvals = mod('src/lib/approvals.ts');
const mutations = mod('src/lib/mutations.ts'), content = mod('src/app/actions/content.ts'), scripts = mod('src/app/actions/scripts.ts');
const production = mod('src/app/actions/production.ts'), tasks = mod('src/app/actions/tasks.ts'), scope = mod('src/lib/production-scope.ts');
const { DEFAULT_CHECKLIST } = mod('src/lib/constants.ts');
const fd = data => { const f = new FormData(); for (const [k,v] of Object.entries(data)) if(v != null) f.set(k,String(v)); return f; };
const session = async id => { const u = await prisma.user.findUniqueOrThrow({ where: { id }, include: { workProfiles: true, brandAccess: true } }); return { ...u, profiles: u.workProfiles.map(p=>p.profile), brandIds: u.brandAccess.map(b=>b.brandId) }; };
const as = async (id, fn) => { const u=await session(id), jar=new Map(); await context.run(jar,()=>auth.createSession(id,u.sessionVersion)); return context.run(jar,fn); };
const run = async (id, fn) => mutations.withMutation(await session(id),false,fn);
const step = kind => prisma.productionStep.findUniqueOrThrow({ where: { automationKey: `video:${kind}` }, include: { task: true } });
const listo = async (who, kind, extra={}) => { const s=await step(kind); return as(who,()=>production.marcarListo(fd({ id:s.id, expectedUpdatedAt:s.updatedAt.toISOString(), expectedReviewToken:s.reviewToken, ...extra }))); };
const reject = async (kind,motivo) => { const s=await step(kind); return as('lead',()=>production.devolverPaso(fd({ id:s.id, expectedUpdatedAt:s.updatedAt.toISOString(), motivo }))); };
const noError = result => assert.ok(!result?.error, result?.error);
const video = () => prisma.contentItem.findUniqueOrThrow({where:{id:'video'}});
const shoot = async date => as('owner',async()=>content.actualizarGrabacion(fd({id:'video',shootDate:date,expectedUpdatedAt:(await video()).updatedAt.toISOString()})));
const preparation = async () => {
  const checks=await prisma.checklistItem.findMany({where:{contentItemId:'video',stage:'PREPRODUCCION',kind:'TASK',done:false,label:{not:'Guion escrito y revisado'}}});
  for(const check of checks) noError(await as('camera',()=>content.alternarCheck(fd({id:check.id,done:'1'}))));
};
after(()=>prisma.$disconnect());

test('equipo y guion de prueba; todas las escrituras están en PostgreSQL local', async()=>{
  await prisma.brand.create({data:{id:'brand',name:'Pruebas',slug:'human-reviews'}});
  for(const [id,profile] of [['owner',null],['lead','STRATEGY'],['writer','WRITER'],['camera','CAMERA'],['editor','EDITOR'],['publisher','PUBLISHER']]) {
    await prisma.user.create({data:{id,name:id,email:`${id}@test.invalid`,role:id==='owner'?'OWNER':'MEMBER',passwordHash:'fixture',workProfiles:profile?{create:{profile}}:undefined,brandAccess:{create:{brandId:'brand'}}}});
  }
  await prisma.brandTeamMember.createMany({data:Object.entries({ENCARGADO:'lead',GUIONISTA:'writer',FILMMAKER:'camera',EDITOR:'editor',COMMUNITY:'publisher'}).map(([role,userId])=>({brandId:'brand',role,userId}))});
  await prisma.taskColumn.createMany({data:[{id:'first',name:'Por hacer',order:0},{id:'last',name:'Final',order:1}]});
  await prisma.script.create({data:{id:'script',brandId:'brand',title:'Guion',authorId:'writer',cta:'Escríbenos',scenes:{create:{order:0,beat:'Gancho',voice:'Una idea',action:'A cámara'}}}});
  await prisma.contentItem.create({data:{id:'video',brandId:'brand',scriptId:'script',title:'Vídeo',scheduledDate:new Date(),createdById:'owner',checklist:{create:DEFAULT_CHECKLIST.map((c,i)=>({...c,kind:c.kind??'TASK',sortOrder:i}))}}});
  await run('owner',tx=>chain.chainEvent(tx,null,{type:'VIDEO_CREATED',videoId:'video'}));
});

test('fallar al crear la revisión revierte entrega, tarea, guion y auditoría', async()=>{
  const before=await prisma.auditLog.count();
  await prisma.$executeRawUnsafe(`CREATE FUNCTION qa_reject_review() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.step='REVISION_GUION' THEN RAISE EXCEPTION 'QA review unavailable'; END IF; RETURN NEW; END $$`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER qa_reject_review BEFORE INSERT ON "ProductionStep" FOR EACH ROW EXECUTE FUNCTION qa_reject_review()`);
  try {
    await assert.rejects(listo('writer','GUION'),/QA review unavailable/);
    assert.equal((await prisma.script.findUniqueOrThrow({where:{id:'script'}})).status,'BORRADOR');
    assert.equal((await step('GUION')).status,'PENDIENTE');
    assert.equal((await step('GUION')).task.status,'PENDIENTE');
    assert.equal(await prisma.auditLog.count(),before);
    assert.equal(await prisma.productionStep.count({where:{step:'REVISION_GUION'}}),0);
  } finally {
    await prisma.$executeRawUnsafe(`DROP TRIGGER qa_reject_review ON "ProductionStep"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION qa_reject_review()`);
  }
});

test('entregar guion crea revisión asignada, sin firma ni fecha de grabación; bloquear atajos y perfiles incorrectos', async()=>{
  noError(await listo('writer','GUION'));
  const review=await step('REVISION_GUION');
  assert.equal(review.assigneeId,'lead'); assert.equal(review.task.status,'PENDIENTE'); assert.ok(review.reviewToken);
  assert.equal((await step('GUION')).task.status,'HECHO'); assert.equal((await step('GUION')).task.completedById,'writer');
  assert.equal((await prisma.script.findUniqueOrThrow({where:{id:'script'}})).status,'REVISION');
  assert.equal(await prisma.approval.count(),0);
  assert.equal((await prisma.contentItem.findUniqueOrThrow({where:{id:'video'}})).shootDate,null);
  assert.match((await listo('writer','REVISION_GUION')).error,/permisos de revisión/);
  assert.match((await as('lead',()=>tasks.moverTareaConMotivo(review.taskId,'last',undefined,review.task.updatedAt.toISOString()))).error,/Abre la revisión/);
  assert.match((await as('lead',()=>tasks.cambiarEstadoTarea(fd({id:review.taskId,status:'HECHO',expectedUpdatedAt:review.task.updatedAt.toISOString()})))).error,/paso/);
  const script=await prisma.script.findUniqueOrThrow({where:{id:'script'}});
  const result=await as('lead',()=>scripts.cambiarEstadoGuion(fd({id:'script',status:'APROBADO',expectedUpdatedAt:script.updatedAt.toISOString()})));
  assert.match(result.error,/paso Revisión/);
  const video=await prisma.contentItem.findUniqueOrThrow({where:{id:'video'}});
  const jump=await as('owner',()=>content.cambiarEstado(fd({id:'video',status:'APROBADO',expectedUpdatedAt:video.updatedAt.toISOString(),override:'1',reason:'Intento de saltar la revisión'})));
  assert.match(jump.error,/aprobado/);
  assert.equal(await prisma.approval.count(),0);
});

test('rechazo, cambio de escenas y nueva entrega: se conserva la tarea y la huella anterior no firma', async()=>{
  const old=await step('REVISION_GUION');
  noError(await reject('REVISION_GUION','Corregir el cierre del guion'));
  assert.equal((await step('REVISION_GUION')).task.status,'CANCELADO');
  assert.equal((await step('GUION')).task.status,'PENDIENTE');
  assert.equal((await step('GUION')).task.completedAt,null);
  await prisma.scriptScene.updateMany({where:{scriptId:'script'},data:{voice:'Nueva idea'}});
  noError(await listo('writer','GUION'));
  const current=await step('REVISION_GUION'); assert.equal(current.taskId,old.taskId); assert.notEqual(current.reviewToken,old.reviewToken);
  assert.match((await listo('lead','REVISION_GUION',{expectedReviewToken:old.reviewToken})).error,/Abre la revisión/);
  // Otra edición mientras está en revisión exige devolver y volver a entregar.
  await prisma.scriptScene.updateMany({where:{scriptId:'script'},data:{voice:'Cambio posterior'}});
  assert.match((await listo('lead','REVISION_GUION')).error,/entrega cambió/);
  noError(await reject('REVISION_GUION','Verificar la última modificación'));
  noError(await listo('writer','GUION'));
  noError(await listo('lead','REVISION_GUION'));
  assert.equal((await step('GRABACION')).assigneeId,'camera');
  const signed=await prisma.approval.findMany(); assert.equal(signed.length,2); assert.ok(signed.every(a=>a.approvedById==='lead'&&a.approvedByName==='lead'));
  assert.equal((await prisma.checklistItem.findFirst({where:{kind:'SCRIPT_APPROVAL',contentItemId:'video'}})).doneById,'lead');
  assert.equal(await prisma.comment.count({where:{contentItemId:'video'}}),2);
});

test('un fallo al sincronizar la tarea revierte la fecha, preparación y auditoría',async()=>{
  await preparation();
  const before=await video(), recording=await step('GRABACION'), audits=await prisma.auditLog.count();
  const checks=await prisma.checklistItem.findMany({where:{contentItemId:'video'},orderBy:{id:'asc'}});
  await prisma.$executeRawUnsafe(`CREATE FUNCTION qa_reject_date() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."dueDate" IS NULL AND OLD."dueDate" IS NOT NULL THEN RAISE EXCEPTION 'QA date unavailable'; END IF; RETURN NEW; END $$`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER qa_reject_date BEFORE UPDATE ON "Task" FOR EACH ROW EXECUTE FUNCTION qa_reject_date()`);
  try {
    await assert.rejects(shoot(''),/QA date unavailable/);
    assert.deepEqual(await video(),before); assert.deepEqual(await step('GRABACION'),recording);
    assert.deepEqual(await prisma.checklistItem.findMany({where:{contentItemId:'video'},orderBy:{id:'asc'}}),checks);
    assert.equal(await prisma.auditLog.count(),audits);
  } finally { await prisma.$executeRawUnsafe('DROP TRIGGER qa_reject_date ON "Task"'); await prisma.$executeRawUnsafe('DROP FUNCTION qa_reject_date()'); }
});

test('quitar fecha conserva la tarea asignada sin plazo, sale del calendario y bloquea la grabación',async()=>{
  await preparation();
  const before=await step('GRABACION');
  await prisma.task.update({where:{id:before.taskId},data:{description:before.task.description+'\n\nAvance: equipo confirmado por teléfono.'}});
  noError(await shoot(''));
  assert.equal((await video()).shootDate,null);
  const cleared=await step('GRABACION');
  assert.equal(cleared.id,before.id); assert.equal(cleared.taskId,before.taskId); assert.equal(cleared.assigneeId,'camera');
  assert.equal(cleared.dueAt,null); assert.equal(cleared.task.dueDate,null); assert.match(cleared.task.description,/Sin fecha/);
  assert.match(cleared.task.description,/Avance: equipo confirmado por teléfono/);
  const work=await as('camera',async()=>scope.readMyWork(await session('camera')));
  assert.ok(work.groups.undated.some(c=>c.id===cleared.id));
  assert.equal(scope.toStepEntries([{...cleared,contentItem:{title:'Vídeo',brand:{name:'Pruebas'}}}],new Date()).length,0);
  assert.match((await listo('camera','GRABACION',{materialUrl:'https://files.test/raw'})).error,/fecha de grabación/);
  const jump=await as('owner',async()=>content.cambiarEstado(fd({id:'video',status:'GRABACION',expectedUpdatedAt:(await video()).updatedAt.toISOString()})));
  assert.match(jump.error,/fecha de grabación/);
  assert.equal((await prisma.checklistItem.findFirstOrThrow({where:{contentItemId:'video',kind:'SCRIPT_APPROVAL'}})).done,true);
  assert.equal(await prisma.checklistItem.count({where:{contentItemId:'video',stage:'PREPRODUCCION',kind:'TASK',done:true,label:{not:'Guion escrito y revisado'}}}),0);
  assert.equal((await step('GRABACION')).task.status,'PENDIENTE');
  await assert.rejects(prisma.productionStep.update({where:{id:cleared.id},data:{status:'HECHO',doneAt:new Date()}}),/ProductionStep_due_date_required/);
});

test('reprogramar desde la tarea y el paso sincroniza el vídeo; cambiar la fecha exige reconfirmar preparación',async()=>{
  const current=await step('GRABACION'), t=current.task;
  noError(await as('owner',()=>tasks.actualizarTarea(fd({...t,id:t.id,dueDate:'2027-01-14',expectedUpdatedAt:t.updatedAt.toISOString()}))));
  assert.equal((await video()).shootDate.toISOString(),'2027-01-14T12:00:00.000Z');
  const moved=await step('GRABACION');
  assert.equal(moved.dueAt.toISOString(),'2027-01-15T04:59:59.999Z'); assert.equal(moved.source,'MANUAL'); assert.doesNotMatch(moved.task.description,/Sin fecha/);
  await preparation();
  noError(await as('owner',async()=>content.cambiarEstado(fd({id:'video',status:'GRABACION',expectedUpdatedAt:(await video()).updatedAt.toISOString()}))));
  noError(await shoot('2027-01-16'));
  assert.equal((await video()).status,'APROBADO');
  assert.equal((await step('GRABACION')).dueAt.toISOString(),'2027-01-17T04:59:59.999Z');
  assert.match((await listo('camera','GRABACION',{materialUrl:'https://files.test/raw'})).error,/Completa el requisito/);
  const pending=await step('GRABACION');
  noError(await as('owner',()=>production.reasignarPaso(fd({id:pending.id,assigneeId:'camera',dueDate:'',expectedUpdatedAt:pending.updatedAt.toISOString()}))));
  assert.equal((await video()).shootDate,null); assert.equal((await step('GRABACION')).task.dueDate,null);
  const noDate=await step('GRABACION');
  noError(await as('owner',()=>production.reasignarPaso(fd({id:noDate.id,assigneeId:'camera',dueDate:'2027-01-18',dueTime:'10:00',expectedUpdatedAt:noDate.updatedAt.toISOString()}))));
  assert.equal((await step('GRABACION')).dueAt.toISOString(),'2027-01-19T04:59:59.999Z');
  await preparation();
});

test('fecha manual eliminada no se inventa al abrir grabación; sincronización persiste con automatización apagada',async()=>{
  noError(await shoot(''));
  await run('owner',async tx=>{ await tx.productionStep.update({where:{id:(await step('GRABACION')).id},data:{status:'CANCELADO'}}); await chain.ensureChainForVideo(tx,'video',{actor:await session('owner')}); });
  assert.equal((await step('GRABACION')).dueAt,null); assert.equal((await video()).shootDate,null);
  process.env.PRODUCTION_FLOW_ENABLED='false';
  try {
    noError(await shoot('2027-01-20')); assert.equal((await step('GRABACION')).task.dueDate.toISOString(),'2027-01-20T12:00:00.000Z');
    const t=(await step('GRABACION')).task;
    const blocked=await as('owner',()=>tasks.actualizarTarea(fd({...t,dueDate:'2027-01-22',expectedUpdatedAt:t.updatedAt.toISOString()})));
    assert.match(blocked.error,/desde la ficha/);
    assert.equal((await step('GRABACION')).task.dueDate.toISOString(),'2027-01-20T12:00:00.000Z');
  }
  finally { process.env.PRODUCTION_FLOW_ENABLED='true'; }
  await preparation();
});

test('entregar máster abre revisión final, accesible a coordinación, sin abrir publicación', async()=>{
  noError(await listo('camera','GRABACION',{materialUrl:'https://files.test/raw'}));
  const recorded=await step('GRABACION');
  assert.match((await shoot('')).error,/grabación ya terminó/);
  assert.equal((await step('GRABACION')).dueAt.toISOString(),recorded.dueAt.toISOString());
  await prisma.checklistItem.updateMany({where:{contentItemId:'video',kind:'TASK',label:{contains:'Miniatura',mode:'insensitive'}},data:{done:true,doneAt:new Date(),doneById:'owner'}});
  noError(await listo('editor','EDICION',{materialUrl:'https://files.test/master-v1'}));
  assert.equal((await step('REVISION_FINAL')).assigneeId,'lead');
  assert.equal(await prisma.productionStep.count({where:{contentItemId:'video',step:'PUBLICACION'}}),0);
  assert.equal(await prisma.approval.count({where:{entityType:'FINAL_APPROVAL'}}),0);
  assert.match((await listo('editor','REVISION_FINAL')).error,/permisos de revisión/);
  const check=await prisma.checklistItem.findFirstOrThrow({where:{kind:'FINAL_APPROVAL',contentItemId:'video'}});
  const token=await approvals.approvalToken(prisma,'FINAL_APPROVAL','video');
  assert.match((await as('lead',()=>content.alternarCheck(fd({id:check.id,done:'1',expectedApproval:token})))).error,/paso de revisión/);
  const work=await scope.readMyWork(await session('lead'));
  assert.ok(Object.values(work.groups).flat().some(c=>c.step==='REVISION_FINAL'&&c.reviewToken&&c.links.some(l=>l.href==='https://files.test/master-v1')));
});

test('devolución final y nueva versión del mismo enlace requieren otra firma; doble aprobación es atómica', async()=>{
  const before=await step('REVISION_FINAL');
  noError(await reject('REVISION_FINAL','Ajustar la música y los subtítulos'));
  noError(await listo('editor','EDICION',{materialUrl:'https://files.test/master-v1'}));
  const current=await step('REVISION_FINAL');
  assert.notEqual(current.reviewToken,before.reviewToken); assert.equal((await step('EDICION')).materialVersion,2);
  const input={id:current.id,expectedUpdatedAt:current.updatedAt.toISOString(),expectedReviewToken:current.reviewToken};
  const results=await Promise.all([as('lead',()=>production.marcarListo(fd(input))),as('owner',()=>production.marcarListo(fd(input)))]);
  assert.equal(results.filter(r=>!r?.error).length,1);
  assert.match(results.find(r=>r?.error).error,/cambió/);
  assert.equal(await prisma.approval.count({where:{entityType:'FINAL_APPROVAL'}}),1);
  assert.equal((await step('PUBLICACION')).assigneeId,'publisher');
  noError(await listo('publisher','PUBLICACION',{publishedUrl:'https://social.test/published'}));
  assert.equal((await prisma.contentItem.findUniqueOrThrow({where:{id:'video'}})).status,'PUBLICADO');
  assert.equal(await prisma.productionStep.count({where:{contentItemId:'video',status:'PENDIENTE'}}),0);
  // La huella del máster detecta cambios posteriores aunque la casilla todavía aparezca marcada.
  await prisma.productionStep.update({where:{id:(await step('EDICION')).id},data:{materialUrl:'https://files.test/master-v3'}});
  await assert.rejects(approvals.assertChecklistApproved(prisma,'video','FINAL_APPROVAL'),/cambió desde la aprobación/);
});

test('tarea independiente: termina/reabre con identidad; columna y orden no determinan el cierre',async()=>{
  await prisma.task.create({data:{id:'standalone',title:'Tarea de cámara',columnId:'last',brandId:'brand',assigneeId:'camera'}});
  let task=await prisma.task.findUniqueOrThrow({where:{id:'standalone'}}); assert.equal(task.status,'PENDIENTE');
  await assert.rejects(as('writer',()=>tasks.cambiarEstadoTarea(fd({id:task.id,status:'HECHO',expectedUpdatedAt:task.updatedAt.toISOString()}))),/acceso/);
  noError(await as('camera',()=>tasks.cambiarEstadoTarea(fd({id:task.id,status:'HECHO',expectedUpdatedAt:task.updatedAt.toISOString()}))));
  task=await prisma.task.findUniqueOrThrow({where:{id:task.id}}); assert.equal(task.completedById,'camera'); assert.ok(task.completedAt); assert.equal(task.status,'HECHO');
  noError(await as('camera',()=>tasks.moverTareaConMotivo(task.id,'first',undefined,task.updatedAt.toISOString())));
  task=await prisma.task.findUniqueOrThrow({where:{id:task.id}}); assert.equal(task.status,'HECHO');
  noError(await as('camera',()=>tasks.cambiarEstadoTarea(fd({id:task.id,status:'PENDIENTE',expectedUpdatedAt:task.updatedAt.toISOString()}))));
  task=await prisma.task.findUniqueOrThrow({where:{id:task.id}}); assert.equal(task.status,'PENDIENTE'); assert.equal(task.completedAt,null); assert.equal(task.completedById,null);
});

test('dos formularios del mismo vídeo: el segundo recibe conflicto legible y no sobreescribe',async()=>{
  const actor=await session('owner'), old=await prisma.contentItem.findUniqueOrThrow({where:{id:'video'}});
  const save=notes=>mutations.withWorkflowMutation(actor,false,async tx=>{await mutations.lockRevision(tx,'ContentItem','video',old.updatedAt.toISOString());await tx.contentItem.update({where:{id:'video'},data:{notes}});return {ok:true};});
  noError(await save('Guardado desde el primer formulario'));
  assert.equal((await save('Formulario antiguo')).error,mutations.EDIT_CONFLICT);
  assert.equal((await prisma.contentItem.findUniqueOrThrow({where:{id:'video'}})).notes,'Guardado desde el primer formulario');
});

test('migración con registros históricos conserva filas y solo deriva cierres desde los pasos',async()=>{
  const sql=readFileSync(new URL('../prisma/migrations/20261004090000_human_reviews_task_completion/migration.sql',import.meta.url),'utf8');
  await prisma.$transaction(async tx=>{
    // Tablas temporales privadas de esta conexión; la migración no toca las tablas de las otras pruebas.
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE "Task" (id TEXT PRIMARY KEY, "columnId" TEXT NOT NULL) ON COMMIT DROP`);
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE "ProductionStep" (id TEXT PRIMARY KEY, "taskId" TEXT, step TEXT, status TEXT, "doneAt" TIMESTAMP(3), CONSTRAINT "ProductionStep_step_check" CHECK(step IN ('GUION','EDICION'))) ON COMMIT DROP`);
    await tx.$executeRawUnsafe(`INSERT INTO "Task" VALUES ('entregada','primera'),('devuelta','ultima'),('suelta','ultima')`);
    await tx.$executeRawUnsafe(`INSERT INTO "ProductionStep" VALUES ('p1','entregada','GUION','HECHO','2026-10-01T12:00:00'),('p2','devuelta','EDICION','DEVUELTO',NULL)`);
    for(const statement of sql.replace(/--[^\n]*/g,'').split(';').map(s=>s.trim()).filter(s=>s && !['BEGIN','COMMIT'].includes(s))) await tx.$executeRawUnsafe(statement);
    const rows=await tx.$queryRawUnsafe(`SELECT id,status,"completedAt","completedById","columnId" FROM "Task" ORDER BY id`);
    assert.equal(rows.length,3);
    assert.equal(rows.find(r=>r.id==='entregada').status,'HECHO');
    assert.equal(rows.find(r=>r.id==='entregada').completedAt.toISOString(),'2026-10-01T12:00:00.000Z');
    assert.equal(rows.find(r=>r.id==='devuelta').status,'CANCELADO');
    assert.equal(rows.find(r=>r.id==='suelta').status,'PENDIENTE');
    assert.equal(rows.find(r=>r.id==='suelta').columnId,'ultima');
    assert.ok(rows.every(r=>r.completedById===null),'no inventa firmas de personas para el historial');
  });
});
