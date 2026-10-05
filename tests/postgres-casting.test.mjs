import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { load } from './load-module.mjs';

const url = process.env.CASTING_TEST_DATABASE_URL;
if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname) || !new URL(url).pathname.endsWith('_test')) throw Error('Solo DB local efímera _test.');
process.env.AUTH_SECRET = randomBytes(32).toString('hex');
delete process.env.PRODUCTION_FLOW_ENABLED; delete process.env.PRODUCTION_CHAIN_ENABLED;
const prisma = new PrismaClient({ datasourceUrl: url }), context = new AsyncLocalStorage(), registry = new Map();
const mocks = { '@/lib/prisma': { prisma }, 'next/cache': { revalidatePath() {}, revalidateTag() {} },
  'next/headers': { cookies: async () => ({ get: k => context.getStore()?.has(k) ? { value: context.getStore().get(k) } : undefined, set: (k,v) => context.getStore().set(k,v), delete: k => context.getStore().delete(k) }), headers: async () => new Headers() },
  'next/navigation': { redirect: path => { throw Error('REDIRECT:' + path); }, notFound: () => { throw Error('NOT_FOUND'); } },
};
const mod = file => load(file, mocks, registry), auth = mod('src/lib/auth.ts');
const casting = mod('src/lib/casting.ts'), actions = mod('src/app/actions/casting.ts'), content = mod('src/app/actions/content.ts'), approvals = mod('src/lib/approvals.ts');
const scope = mod('src/lib/access-scope.ts');
const fd = data => { const f = new FormData(); for (const [k,v] of Object.entries(data)) if (v != null) f.set(k,String(v)); return f; };
const session = async id => { const u = await prisma.user.findUniqueOrThrow({ where:{id}, include:{ workProfiles:true,brandAccess:true } }); return { ...u, profiles:u.workProfiles.map(p=>p.profile), brandIds:u.brandAccess.map(b=>b.brandId) }; };
const as = async (id, fn) => { const u = await session(id), jar = new Map(); await context.run(jar,()=>auth.createSession(id,u.sessionVersion)); return context.run(jar,fn); };
const video = (id='video') => prisma.contentItem.findUniqueOrThrow({ where:{id},include:casting.castingInclude });
const form = async (extra={}, id='video') => { const v=await video(id); return fd({contentItemId:id,expectedToken:casting.castingToken(v),expectedUpdatedAt:v.updatedAt.toISOString(),...extra}); };
const roleForm = async (roleId, extra={}) => { const role=await prisma.castRole.findUniqueOrThrow({where:{id:roleId}}); return form({id:roleId,expectedUpdatedAt:role.updatedAt.toISOString(),...extra},role.contentItemId); };
const ok = result => assert.ok(!result?.error,result?.error);
const assign = async (roleId,userId,by='lead') => as(by,async()=>actions.asignarPapel(await roleForm(roleId,{userId})));
const respond = async (roleId,by='actor',extra={}) => as(by,async()=>actions.responderPapel(await roleForm(roleId,{response:'CONFIRMADO',...extra})));
const roles = async (id='video') => (await video(id)).castRoles;
const prepare = async (id='video') => as('lead',async()=>actions.prepararReparto(await form({},id)));
const hours = async (start='10:00',end='11:00',id='video') => as('lead',async()=>actions.guardarHorarioReparto(await form({start,end},id)));
const approve = async () => { const a=await prisma.$transaction(tx=>approvals.approveVersion(tx,{id:'lead',name:'Lead'},'SCRIPT','script')); await prisma.script.update({where:{id:'script'},data:{approvalId:a.id,status:'APROBADO'}}); };
after(()=>prisma.$disconnect());

test('fixtures, migración y reparto de varios papeles por escena',async()=>{
  await prisma.brand.createMany({data:[{id:'brand',name:'Brand',slug:'casting'},{id:'other',name:'Other',slug:'casting-other'}]});
  for(const [id,profile,brandId] of [['owner',null,'brand'],['lead','PRODUCTION','brand'],['actor','TALENT','brand'],['actor2','TALENT','brand'],['camera','CAMERA','brand'],['outsider','TALENT','other']]) {
    await prisma.user.create({data:{id,name:id,email:`${id}@test.invalid`,role:id==='owner'?'OWNER':'MEMBER',passwordHash:'fixture',workProfiles:profile?{create:{profile}}:undefined,brandAccess:{create:{brandId}}}});
  }
  await prisma.script.create({data:{id:'script',title:'Escenas de prueba',brandId:'brand',cta:'CTA',scenes:{create:[{id:'scene1',order:0,actors:JSON.stringify([{role:'Cliente',archetype:'Sabio'},{role:'Vendedor'}])},{id:'scene2',order:1,actors:JSON.stringify([{role:'Cliente'}])}]}}});
  await approve();
  await prisma.contentItem.create({data:{id:'video',brandId:'brand',title:'Reparto',scriptId:'script',shootDate:new Date('2026-11-01T12:00Z'),scheduledDate:new Date('2026-11-02T12:00Z'),checklist:{create:{label:'Actor asignado y confirmado',stage:'PREPRODUCCION'}}}});
  await assert.rejects(casting.assertCastingReady(prisma,'video'),/horario/);
  ok(await prepare()); assert.equal((await roles()).length,3);
  ok(await hours());
});
test('perfil y marca se verifican en backend; acceso aparece por asignación real',async()=>{
  const [r1,r2,r3]=await roles();
  assert.match((await assign(r1.id,'camera')).error,/Talento/);
  assert.match((await assign(r1.id,'outsider')).error,/acceso/);
  ok(await assign(r1.id,'actor')); ok(await assign(r2.id,'actor2')); ok(await assign(r3.id,'actor'));
  assert.equal(await prisma.assignment.count({where:{contentItemId:'video',role:'ACTOR'}}),2);
  assert.equal(await prisma.contentItem.count({where:{AND:[{id:'video'},scope.contentScope(await session('actor'))]}}),1);
  assert.equal(await prisma.script.count({where:{AND:[{id:'script'},scope.scriptScope(await session('actor'))]}}),1);
  await assert.rejects(assign(r1.id,'actor2','camera'),/permiso|acceso/i);
});
test('cada actor responde solo sus papeles; coordinador no firma por otro',async()=>{
  const rs=await roles();
  assert.match((await respond(rs[0].id,'owner')).error,/Solo el actor/);
  assert.match((await respond(rs[0].id,'actor2')).error,/Solo el actor/);
  ok(await respond(rs[0].id)); ok(await respond(rs[1].id,'actor2'));
  await assert.rejects(casting.assertCastingReady(prisma,'video'),/todos los papeles/);
  ok(await respond(rs[2].id)); await casting.assertCastingReady(prisma,'video');
  assert.equal((await roles()).filter(r=>r.respondedAt).length,3);
  ok(await prepare()); await casting.assertCastingReady(prisma,'video');
});
test('reasignar exige nueva confirmación y retira solo accesos gestionados por reparto',async()=>{
  const [r1,,r3]=await roles();
  const old=await roleForm(r1.id,{response:'CONFIRMADO'});
  ok(await assign(r1.id,'actor2')); ok(await assign(r3.id,'actor2'));
  assert.equal(await prisma.assignment.count({where:{contentItemId:'video',userId:'actor'}}),0);
  await assert.rejects(as('actor',()=>actions.responderPapel(old)),/acceso|permiso/i);
  await prisma.assignment.create({data:{contentItemId:'video',userId:'actor',role:'ACTOR',castingManaged:false}});
  ok(await assign(r1.id,'actor')); ok(await assign(r1.id,'actor2'));
  assert.equal(await prisma.assignment.count({where:{contentItemId:'video',userId:'actor',castingManaged:false}}),1);
  await assert.rejects(casting.assertCastingReady(prisma,'video'),/confirmados/);
  for(const r of await roles()) ok(await respond(r.id,'actor2'));
});
test('fecha y horario invalidan respuestas; volver a la misma fecha no resucita confirmaciones',async()=>{
  const [r]=await roles(), old=await roleForm(r.id,{response:'CONFIRMADO'});
  ok(await hours('11:00','12:00'));
  assert.match((await as('actor2',()=>actions.responderPapel(old))).error,/sesión cambió/);
  ok(await hours());
  const changed=await video(); assert.equal(changed.castRoles.filter(r=>casting.roleConfirmed(r,changed)).length,0);
  for(const date of ['2026-11-03','2026-11-01']) ok(await as('owner',async()=>content.actualizarGrabacion(fd({id:'video',shootDate:date,expectedUpdatedAt:(await video()).updatedAt.toISOString()}))));
  await assert.rejects(casting.assertCastingReady(prisma,'video'),/confirmados/);
  for(const r of await roles()) ok(await respond(r.id,'actor2'));
});
test('cambio de escena invalida la firma y exige aprobación humana vigente',async()=>{
  await prisma.scriptScene.update({where:{id:'scene1'},data:{voice:'Nueva línea'}});
  await assert.rejects(casting.assertCastingReady(prisma,'video'),/confirmados/);
  assert.match((await respond((await roles())[0].id,'actor2')).error,/cambió desde la aprobación/);
  await approve(); for(const r of await roles()) ok(await respond(r.id,'actor2'));
  await casting.assertCastingReady(prisma,'video');
});
test('rechazo, nota y revisión obsoleta persisten sin suplantación',async()=>{
  const [r]=await roles(), old=await roleForm(r.id,{response:'CONFIRMADO'});
  assert.match((await respond(r.id,'actor2',{response:'RECHAZADO'})).error,/motivo/);
  ok(await respond(r.id,'actor2',{response:'RECHAZADO',note:'No puedo a esa hora'}));
  assert.equal((await prisma.castRole.findUniqueOrThrow({where:{id:r.id}})).responseNote,'No puedo a esa hora');
  assert.match((await as('actor2',()=>actions.responderPapel(old))).error,/registro cambió/);
  ok(await respond(r.id,'actor2'));
});
test('bloqueo personal invalida confirmaciones; retirarlo no las reactiva',async()=>{
  ok(await as('actor2',()=>actions.guardarIndisponibilidad(fd({contentItemId:'video',date:'2026-11-01',start:'10:30',end:'11:30'}))));
  const [r]=await roles(); assert.match((await respond(r.id,'actor2')).error,/No disponible/);
  const block=await prisma.actorUnavailability.findFirstOrThrow({where:{userId:'actor2'}});
  assert.match((await as('actor',()=>actions.guardarIndisponibilidad(fd({contentItemId:'video',blockId:block.id})))).error,/propia disponibilidad/);
  assert.equal(await prisma.actorUnavailability.count({where:{id:block.id}}),1);
  ok(await as('actor2',()=>actions.guardarIndisponibilidad(fd({contentItemId:'video',blockId:block.id}))));
  await assert.rejects(casting.assertCastingReady(prisma,'video'),/confirmados/);
});
test('confirmaciones simultáneas no permiten reservar dos grabaciones que se cruzan',async()=>{
  await prisma.contentItem.create({data:{id:'second',brandId:'brand',title:'Otra grabación',scriptId:'script',shootDate:new Date('2026-11-01T12:00Z'),scheduledDate:new Date()}});
  ok(await prepare('second'));ok(await hours('10:30','11:30','second'));
  const r1=(await roles())[0],r2=(await roles('second'))[0];ok(await assign(r2.id,'actor2'));
  const results=await Promise.all([respond(r1.id,'actor2'),respond(r2.id,'actor2')]);
  assert.equal(results.filter(r=>!r?.error).length,1);
  const failed=results[0]?.error?r1:r2;
  assert.match((await respond(failed.id,'actor2')).error,/otra grabación/);
  // Adjacent time intervals are allowed.
  ok(await hours('11:30','12:30'));
  ok(await respond(r1.id,'actor2'));
});
test('quitar participantes no deja papeles huérfanos; escenas eliminadas requieren reconciliar',async()=>{
  const assignment=await prisma.assignment.findUniqueOrThrow({where:{contentItemId_userId_role:{contentItemId:'video',userId:'actor2',role:'ACTOR'}}});
  assert.match((await as('lead',()=>content.quitarAsignacion(fd({id:assignment.id})))).error,/Reasigna primero/);
  await prisma.scriptScene.delete({where:{id:'scene2'}});
  await assert.rejects(casting.assertCastingReady(prisma,'video'),/reparto/);
  ok(await prepare()); assert.equal((await roles()).length,2);
  await approve();
});
test('fallo de auditoría revierte confirmación y checklist en la misma transacción',async()=>{
  const [r]=await roles(), before=await prisma.castRole.findUniqueOrThrow({where:{id:r.id}});
  await prisma.$executeRawUnsafe(`CREATE FUNCTION qa_cast_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'QA audit failure'; END $$`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER qa_cast_fail BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION qa_cast_fail()`);
  try { await assert.rejects(respond(r.id,'actor2'),/QA audit failure/); assert.deepEqual(await prisma.castRole.findUniqueOrThrow({where:{id:r.id}}),before); }
  finally {await prisma.$executeRawUnsafe('DROP TRIGGER qa_cast_fail ON "AuditLog"');await prisma.$executeRawUnsafe('DROP FUNCTION qa_cast_fail()');}
});
test('checklist no sustituye confirmaciones; historial cerrado y marcas archivadas protegidos',async()=>{
  const check=await prisma.checklistItem.findFirstOrThrow({where:{contentItemId:'video'}});
  assert.match((await as('owner',()=>content.alternarCheck(fd({id:check.id,done:'1'})))).error,/confirmados/);
  await prisma.contentItem.update({where:{id:'video'},data:{status:'EDICION'}});
  assert.match((await prepare()).error,/cerrada/);
  await prisma.brand.update({where:{id:'brand'},data:{archived:true}});
  assert.match((await prepare()).error,/archivadas/);
});
