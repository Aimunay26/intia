import assert from "node:assert/strict";
import { test } from "node:test";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { load } from "./load-module.mjs";

const url = process.env.SECURITY_TEST_DATABASE_URL;
if (!url) throw new Error("Configura SECURITY_TEST_DATABASE_URL con PostgreSQL local de pruebas.");
const parsed = new URL(url);
if (!["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) || !parsed.pathname.endsWith("_test")) throw new Error("Solo se permite localhost y una base terminada en _test.");
const prisma = new PrismaClient({ datasourceUrl: url, log: [] });
const scope = new AsyncLocalStorage();
const headers = { cookies: async () => ({ get: key => scope.getStore().jar.has(key) ? { value: scope.getStore().jar.get(key) } : undefined, set: (key,value) => scope.getStore().jar.set(key,value), delete: key => scope.getStore().jar.delete(key) }), headers: async () => new Headers({ "x-forwarded-for": scope.getStore()?.ip ?? "127.0.0.1" }) };
const mocks = { "@/lib/prisma": { prisma }, "next/headers": headers, "next/cache": { revalidatePath: () => {} }, "next/navigation": { redirect: path => { throw new Error(`REDIRECT:${path}`); } } };
const auth = load("src/lib/auth.ts", mocks), authActions = load("src/app/actions/auth.ts", mocks), team = load("src/app/actions/team.ts", mocks), tasks = load("src/app/actions/tasks.ts", mocks), metrics = load("src/app/actions/metrics.ts", mocks), assets = load("src/app/actions/assets.ts", mocks), demo = load("src/app/actions/datos-de-ejemplo.ts", mocks), provenance = load("src/lib/demo-provenance.ts", mocks), rate = load("src/lib/auth-rate-limit.ts", mocks);
const form = values => { const result = new FormData(); for (const [key,value] of Object.entries(values)) result.set(key,value); return result; };
const run = (jar, work, ip = "127.0.0.1") => scope.run({ jar, ip }, work);
const jarFor = async user => { const jar = new Map(); await run(jar, () => auth.createSession(user.id, user.sessionVersion)); return jar; };
const suffix = randomUUID(), password = "Fixture-correcta-123";

test("seguridad sobre PostgreSQL real y sesiones firmadas", async t => {
  process.env.AUTH_SECRET = randomBytes(32).toString("hex"); process.env.BOOTSTRAP_TOKEN = randomBytes(32).toString("hex"); process.env.VERCEL = "1";
  try {
    await t.test("la actualización aditiva preservó el dueño anterior y cerró bootstrap", async () => {
      const legacy = await prisma.user.findUniqueOrThrow({ where: { id: "migration-owner" } });
      assert.equal(legacy.sessionVersion,0); assert.equal(legacy.name,"Migración ficticia");
      assert.equal(await auth.needsBootstrap(),false);
      await prisma.user.delete({ where: { id: legacy.id } });
      assert.equal(await auth.needsBootstrap(),false);
      await prisma.appSetting.delete({ where: { key: "security.bootstrap.complete" } });
    });
    await t.test("bootstrap rechaza claves incorrectas y diez altas simultáneas crean un solo dueño", async () => {
      const denied = await run(new Map(), () => authActions.bootstrapAction(null, form({ name:"Dueño",email:"wrong@example.test",password,installationKey:"incorrecta" })));
      assert.ok(denied.error); assert.equal(await prisma.user.count(),0);
      await Promise.allSettled(Array.from({ length:10 }, (_,i) => run(new Map(), () => authActions.bootstrapAction(null, form({ name:`Dueño ${i}`,email:`owner-${i}-${suffix}@example.test`,password,installationKey:process.env.BOOTSTRAP_TOKEN })))));
      assert.equal(await prisma.user.count({ where: { role:"OWNER" } }),1);
      assert.equal(await prisma.auditLog.count({ where: { action:"CREAR",entity:"User" } }),1);
      assert.equal(await auth.needsBootstrap(),false);
    });
    let owner = await prisma.user.findFirstOrThrow({ where: { role:"OWNER" } });
    let ownerJar = await jarFor(owner);
    let member = await prisma.user.create({ data:{name:"Miembro",email:`member-${suffix}@example.test`,passwordHash:await auth.hashPassword(password)} });
    let memberJar = await jarFor(member);
    await t.test("un miembro no puede cambiar a otro usuario ni elevar su propio rol", async () => {
      const denied = await run(memberJar, () => team.actualizarUsuario(null, form({ id: owner.id, name: "Intruso", email: owner.email, role: "MEMBER" })));
      assert.ok(denied.error);
      const self = await run(memberJar, () => team.actualizarUsuario(null, form({ id: member.id, name: member.name, email: "injected@example.test", role: "OWNER" })));
      assert.ok(self.error);
      const fresh = await prisma.user.findUniqueOrThrow({ where: { id: member.id } });
      assert.equal(fresh.role, "MEMBER"); assert.equal(fresh.email, member.email);
      assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).role, "OWNER");
    });
    const brand = await prisma.brand.create({ data:{name:"Real",slug:`real-${suffix}`} });
    await prisma.userWorkProfile.createMany({data:['STRATEGY','ANALYST'].map(profile=>({userId:member.id,profile}))});
    await prisma.userBrandAccess.create({data:{userId:member.id,brandId:brand.id}});
    member = await prisma.user.findUniqueOrThrow({where:{id:member.id}}); memberJar=await jarFor(member);
    const column = await prisma.taskColumn.create({ data:{name:"Trabajo"} }), spare = await prisma.taskColumn.create({ data:{name:"Vacía"} });
    const task = await prisma.task.create({ data:{title:"No perder",columnId:column.id,brandId:brand.id} });
    await t.test("miembro no borra; dueño no borra columnas con tareas ocultas; borrado correcto auditado", async () => {
      await assert.rejects(run(memberJar, () => tasks.eliminarTarea(task.id)),/permisos/);
      await assert.rejects(run(memberJar, () => tasks.eliminarColumna(column.id)),/permisos/);
      assert.equal((await run(ownerJar, () => tasks.revisarEliminacionColumna(column.id))).tasks,1);
      await assert.rejects(run(ownerJar, () => tasks.eliminarColumna(column.id)),/contiene 1 tareas/);
      assert.ok(await prisma.task.findUnique({where:{id:task.id}}));
      const broken = load("src/app/actions/tasks.ts", { ...mocks, "@/lib/audit": { auditInTransaction: async () => { throw new Error("fallo auditoría"); } } });
      await assert.rejects(run(ownerJar, () => broken.eliminarTarea(task.id)), /auditoría/);
      assert.ok(await prisma.task.findUnique({where:{id:task.id}}));
      await run(ownerJar, () => tasks.eliminarTarea(task.id));
      assert.equal(await prisma.auditLog.count({where:{entity:"Task",entityId:task.id,action:"ELIMINAR"}}),1);
      await run(ownerJar, () => tasks.eliminarColumna(column.id));
      await assert.rejects(run(ownerJar, () => tasks.eliminarColumna(spare.id)), /única/);
    });
    const video = await prisma.contentItem.create({ data:{brandId:brand.id,title:"Métricas protegidas",scheduledDate:new Date("2026-09-09T12:00:00Z")} });
    const oldMetric = await prisma.metric.create({ data:{contentItemId:video.id,date:new Date("2026-09-07T12:00:00Z"),platform:"TIKTOK",period:"WEEKLY",views:100,likes:25,spend:100,revenue:500,notes:"Conservar"} });
    await t.test("CSV parcial/vacío conserva columnas; cero explícito actualiza y registra valores anteriores", async () => {
      const result = await run(memberJar, () => metrics.importarMetricasCsv(null,form({csv:`video,fecha,plataforma,vistas,likes\n${video.id},2026-09-07,TIKTOK,200,`})));
      assert.equal(result.updated,1,JSON.stringify(result));
      const after = await prisma.metric.findUniqueOrThrow({where:{id:oldMetric.id}});
      assert.equal(after.views,200); assert.equal(after.likes,25); assert.equal(after.spend.toString(),"100"); assert.equal(after.revenue.toString(),"500"); assert.equal(after.notes,"Conservar");
      await run(memberJar, () => metrics.importarMetricasCsv(null,form({csv:`video,fecha,plataforma,likes\n${video.id},2026-09-07,TIKTOK,0`})));
      assert.equal((await prisma.metric.findUniqueOrThrow({where:{id:oldMetric.id}})).likes,0);
      const audits = await prisma.auditLog.findMany({where:{entity:"Metric",entityId:oldMetric.id}});
      assert.ok(audits.some(row=>JSON.parse(row.changes).likes?.antes===25 && JSON.parse(row.changes).likes?.despues===0));
    });
    await t.test("CSV inválido no altera filas: fechas inexistentes, negativos, texto, cabeceras duplicadas", async () => {
      for (const csv of [`video,fecha,plataforma,vistas\n${video.id},2026-02-31,TIKTOK,10`,`video,fecha,plataforma,vistas\n${video.id},2026-09-07,TIKTOK,-1`,`video,fecha,plataforma,vistas\n${video.id},2026-09-07,TIKTOK,abc12`,`video,fecha,plataforma,vistas,views\n${video.id},2026-09-07,TIKTOK,1,2`,`video,fecha,plataforma,vistas\n${video.id},2026-09-07,TIKTOK,2147483648`,`video,fecha,plataforma,vistas\n${video.id},2026-09-07,TIKTOK,1.2.3`,`video,fecha,plataforma,vistas\n${video.id},2026-09-07,TIKTOK,"12`,`video,fecha,plataforma,vistas\n${video.id},2026-09-07,TIKTOK,1"2"`,`video,fecha,plataforma,vistas\n${video.id},2026-09-07,TIKTOK,50%`]) {
        const result=await run(memberJar,()=>metrics.importarMetricasCsv(null,form({csv}))); assert.ok(result.error || result.ignored.length);
      }
      assert.equal((await prisma.metric.findUniqueOrThrow({where:{id:oldMetric.id}})).views,200);
      assert.equal(await prisma.metric.count({where:{contentItemId:video.id}}),1);
    });
    await t.test("archivo con dueño inexistente, tipo activo o propietario de otra cuenta es rechazado", async () => {
      for (const values of [{ownerType:"brand",ownerId:"missing",file:new File(["ok"],"nota.txt")},{ownerType:"brand",ownerId:brand.id,file:new File(["<html>activo</html>"],"falso.pdf",{type:"application/pdf"})},{ownerType:"user",ownerId:owner.id,file:new File(["ok"],"nota.txt")},{ownerType:"inventado",ownerId:brand.id,file:new File(["ok"],"nota.txt")}]) assert.ok((await run(memberJar,()=>assets.uploadAsset(null,form(values)))).error);
      assert.equal(await prisma.asset.count(),0);
      assert.ok((await run(memberJar,()=>assets.uploadAsset(null,form({ownerType:"brand",ownerId:brand.id,file:new File(["Texto válido"],"nota.txt",{type:"text/html"})})))).ok);
      const asset=await prisma.asset.findFirstOrThrow(); assert.equal(asset.mimeType,"text/plain");
      const route=load("src/app/api/assets/[id]/route.ts",mocks);
      assert.equal((await run(new Map(),()=>route.GET(new Request("http://localhost"),{params:Promise.resolve({id:asset.id})}))).status,401);
      const response=await run(memberJar,()=>route.GET(new Request("http://localhost"),{params:Promise.resolve({id:asset.id})}));
      assert.equal(response.status,200); assert.match(response.headers.get("Content-Disposition"),/^attachment/); assert.equal(response.headers.get("Content-Type"),"application/octet-stream");
      await assert.rejects(run(memberJar,()=>assets.deleteAsset(form({id:asset.id}))),/permisos/);
      await run(ownerJar,()=>assets.deleteAsset(form({id:asset.id})));
    });
    await t.test("logout revoca solo su sesión; cambio de contraseña y desactivación revocan todas", async () => {
      const first=await jarFor(member), second=await jarFor(member), stolen=new Map(first);
      await run(first,()=>auth.destroySession()); assert.equal(await run(stolen,()=>auth.getSession()),null); assert.ok(await run(second,()=>auth.getSession()));
      const result=await run(ownerJar,()=>team.cambiarPassword(null,form({id:member.id,password:"Nueva-fixture-123",password2:"Nueva-fixture-123"}))); assert.ok(result.ok);
      assert.equal(await run(second,()=>auth.getSession()),null); assert.equal(await run(memberJar,()=>auth.getSession()),null);
      await assert.rejects(run(new Map(),()=>auth.createSession(member.id,0)),/acceso cambió/);
      let fresh=await prisma.user.findUniqueOrThrow({where:{id:member.id}}); memberJar=await jarFor(fresh);
      assert.ok((await run(ownerJar,()=>team.desactivarUsuario(null,form({id:member.id,active:"0"})))).ok);
      assert.equal(await run(memberJar,()=>auth.getSession()),null);
      await run(ownerJar,()=>team.desactivarUsuario(null,form({id:member.id,active:"1"})));
      assert.equal(await run(memberJar,()=>auth.getSession()),null);
      fresh=await prisma.user.findUniqueOrThrow({where:{id:member.id}}); memberJar=await jarFor(fresh);
      const oldJwt=await new SignJWT({sub:member.id}).setProtectedHeader({alg:"HS256"}).setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
      assert.equal(await run(new Map([["mos_session",oldJwt]]),()=>auth.getSession()),null);
    });
    await t.test("cambiar correo o rol administrativo sigue revocando las sesiones", async () => {
      const target=await prisma.user.create({data:{name:'Cambio sensible',email:`sensitive-${suffix}@example.test`,passwordHash:'fixture'}});
      for(const change of [{email:`changed-${suffix}@example.test`},{role:'OWNER'}]) {
        const fresh=await prisma.user.findUniqueOrThrow({where:{id:target.id}}),jar=await jarFor(fresh);
        const result=await run(ownerJar,()=>team.actualizarUsuario(null,form({id:fresh.id,name:fresh.name,email:fresh.email,role:fresh.role,expectedUpdatedAt:fresh.updatedAt.toISOString(),...change})));
        assert.match(result.ok,/cerró las sesiones/);assert.equal(await run(jar,()=>auth.getSession()),null);
      }
      await prisma.user.delete({where:{id:target.id}});
    });
    await t.test("contador de acceso compartido: 20 intentos concurrentes admiten como máximo diez", async () => {
      const outcomes=await Promise.all(Array.from({length:20},()=>run(new Map(),()=>rate.consumeAccessAttempt("login",`rate-${suffix}@example.test`),"198.51.100.20")));
      assert.equal(outcomes.filter(Boolean).length,10);
      const keys=await prisma.authAttempt.findMany(); assert.ok(keys.every(row=>/^[a-f0-9]{64}$/.test(row.key)));
    });
    await t.test("dos dueños no pueden rebajarse simultáneamente y dejar cero dueños", async () => {
      const second=await prisma.user.create({data:{name:"Segundo",email:`second-${suffix}@example.test`,passwordHash:await auth.hashPassword(password),role:"OWNER"}}), secondJar=await jarFor(second);
      owner=await prisma.user.findUniqueOrThrow({where:{id:owner.id}});
      const results=await Promise.all([run(ownerJar,()=>team.actualizarUsuario(null,form({id:owner.id,name:owner.name,email:owner.email,role:"MEMBER",expectedUpdatedAt:owner.updatedAt.toISOString()}))),run(secondJar,()=>team.actualizarUsuario(null,form({id:second.id,name:second.name,email:second.email,role:"MEMBER",expectedUpdatedAt:second.updatedAt.toISOString()})))]);
      assert.equal(results.filter(r=>r.ok).length,1); assert.equal(await prisma.user.count({where:{role:"OWNER",active:true}}),1);
      owner=await prisma.user.findFirstOrThrow({where:{role:"OWNER",active:true}}); ownerJar=await jarFor(owner);
    });
    await t.test("demo: perfiles antiguos sin marca se conservan, aunque tengan isPerson=false", async () => {
      const custom=await prisma.archetype.create({data:{name:"Personalizado",slug:`custom-${suffix}`,isPerson:false}});
      const count=await run(ownerJar,()=>demo.contarDatosDeEjemplo()); assert.equal(count.perfilesGenericos,0);
      await run(ownerJar,()=>demo.vaciarDatosDeEjemplo(null,form({confirmacion:"VACIAR",reviewToken:count.reviewToken})));
      assert.ok(await prisma.archetype.findUnique({where:{id:custom.id}}));
    });
    await t.test("demo: una edición/reutilización preserva el lote; revisión vieja no permite borrarlo", async () => {
      const seeded=await prisma.archetype.create({data:{name:"Demo verificable",slug:`demo-${suffix}`,isPerson:false}});
      await provenance.recordDemoSeed(prisma,[{entityType:"Archetype",entityId:seeded.id}]);
      const before=await run(ownerJar,()=>demo.contarDatosDeEjemplo()); assert.equal(before.perfilesGenericos,1);
      await prisma.archetype.update({where:{id:seeded.id},data:{name:"Adaptado por usuario"}});
      const blocked=await run(ownerJar,()=>demo.vaciarDatosDeEjemplo(null,form({confirmacion:"VACIAR",reviewToken:before.reviewToken}))); assert.ok(blocked.error);
      assert.ok(await prisma.archetype.findUnique({where:{id:seeded.id}}));
      await prisma.demoSeedRecord.deleteMany();
      const untouched=await prisma.archetype.create({data:{name:"Demo sin cambios",slug:`untouched-${suffix}`,isPerson:false}});
      await provenance.recordDemoSeed(prisma,[{entityType:"Archetype",entityId:untouched.id}]);
      const preview=await run(ownerJar,()=>demo.contarDatosDeEjemplo());
      assert.ok((await run(ownerJar,()=>demo.vaciarDatosDeEjemplo(null,form({confirmacion:"VACIAR",reviewToken:"alterado"})))).error);
      assert.ok((await run(ownerJar,()=>demo.vaciarDatosDeEjemplo(null,form({confirmacion:"VACIAR",reviewToken:preview.reviewToken})))).ok);
      assert.equal(await prisma.archetype.findUnique({where:{id:untouched.id}}),null);
    });
  } finally { await prisma.$disconnect(); }
});
