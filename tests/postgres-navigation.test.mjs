import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { load } from "./load-module.mjs";

const target = process.env.NAVIGATION_TEST_DATABASE_URL;
if (!target) throw new Error("Configura NAVIGATION_TEST_DATABASE_URL con PostgreSQL local de pruebas.");
const parsed = new URL(target);
if (!["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) || !parsed.pathname.endsWith("_test")) throw new Error("Esta suite solo permite PostgreSQL local y una base cuyo nombre termine en _test.");
const prisma = new PrismaClient({ datasourceUrl: target, log: [] });
const prefix = `nav-${randomUUID()}`;
const id = suffix => `${prefix}-${suffix}`;
const mocks = { "@/lib/prisma": { prisma } };
const dashboard = load("src/lib/metric-dashboard.ts", mocks);
const archetypes = load("src/lib/archetype-list.ts", mocks);
const tasks = load("src/lib/task-pages.ts", mocks);
const team = load("src/lib/team-list.ts", mocks);
const participation = load("src/lib/team-participation.ts", mocks);

test("PostgreSQL: agregados, páginas, cursores e inicialización concurrente", async t => {
  const initialCount = await prisma.taskColumn.count();
  if (initialCount !== 0) throw new Error("La prueba de inicialización necesita una base local de pruebas sin columnas previas.");
  let initialIds = [];
  try {
    const owner = await prisma.user.create({ data: { id: id("owner"), name: "Dueño de prueba", email: `${prefix}@example.test`, passwordHash: "fixture-not-a-password", role: "OWNER" } });
    await t.test("10 inicializaciones simultáneas crean cinco columnas y una auditoría", async () => {
      let audits = 0;
      const action = load("src/app/actions/tasks.ts", {
        ...mocks, "@/lib/auth": { LEVEL: { MEMBER: 1 }, requireLevel: async () => owner },
        "next/cache": { revalidatePath: () => {} }, "@/lib/audit": { logAudit: async () => { audits++; } },
      });
      await Promise.all(Array.from({ length: 10 }, () => action.asegurarColumnasIniciales()));
      const columns = await prisma.taskColumn.findMany();
      initialIds = columns.map(column => column.id);
      assert.equal(columns.length, 5); assert.equal(new Set(columns.map(column => column.order)).size, 5); assert.equal(audits, 1);
    });
    await prisma.brand.createMany({ data: ["A", "B"].map(name => ({ id: id(name), name, slug: id(name) })) });
    await prisma.contentItem.createMany({ data: Array.from({ length: 62 }, (_, index) => ({ id: id(`v${String(index).padStart(3,"0")}`), brandId: id(index === 61 ? "B" : "A"), title: `Video ${index}`, scheduledDate: new Date("2026-09-08T12:00:00Z"), platforms: '["TIKTOK","INSTAGRAM"]' })) });
    const content = await prisma.contentItem.findMany({ where: { brandId: { in: [id("A"),id("B")] } }, orderBy: { id: "asc" } });
    await prisma.metric.createMany({ data: content.flatMap((row,index) => [0,1,2].map(day => ({ contentItemId: row.id, date: new Date(`2026-09-0${day+1}T12:00:00Z`), views: index === 61 ? 999999 : 10 + index, likes: 2, comments: 1, spend: day === 0 ? 10 : 0, revenue: 20, retention3s: day === 0 ? 50 : day === 1 ? 100 : 0 }))) });
    await prisma.assignment.createMany({ data: ["ACTOR","EDITOR"].map(role => ({ contentItemId: content[0].id, userId: owner.id, role })) });
    const filters = { brandId: id("A"), desde: "2026-09-01", hasta: "2026-09-03" };
    await t.test("resúmenes y series coinciden con filas reales sin duplicar roles ni marcas", async () => {
      const rows = await prisma.metric.findMany({ where: { contentItem: { brandId: id("A") } } });
      const totalViews = rows.reduce((sum,row) => sum+row.views,0);
      const totals = await dashboard.getMetricTotals(filters);
      assert.equal(totals.views,totalViews); assert.equal(totals.records,183); assert.equal(totals.videos,61); assert.equal(totals.retention,75); assert.equal(totals.roas,6);
      assert.equal((await dashboard.getMetricSeries(filters)).reduce((sum,row)=>sum+row.views,0), totalViews);
      const person = await dashboard.getMetricTotals({ ...filters, persona: owner.id });
      assert.equal(person.videos,1); assert.equal(person.records,3); assert.equal(person.views,30);
      const graphs = await dashboard.getMetricBreakdowns(filters);
      assert.equal(graphs.brands.length,1); assert.equal(graphs.brands[0].value,totalViews); assert.equal(graphs.structures[0].videos,61);
      assert.equal((await dashboard.getMetricTotals({...filters,plataforma:'TIKTOK" OR 1=1 --'})).records,0);
    });
    await t.test("ranking paginado conserva empates, total y filtros al llegar a la última página", async () => {
      for (const order of ["vistas","interacciones","roas"]) {
        const first=await dashboard.getMetricRanking(filters,order,"1"), second=await dashboard.getMetricRanking(filters,order,"2");
        assert.equal(first.items.length,50); assert.equal(second.items.length,11); assert.equal(first.total,61);
        assert.equal(new Set([...first.items,...second.items].map(row=>row.id)).size,61);
        assert.ok(first.items.every(row=>row.brandName==="A"));
        assert.equal((await dashboard.getMetricRanking(filters,order,"999")).page,2);
      }
    });
    await prisma.archetype.createMany({ data: Array.from({ length: 39 },(_,index)=>({ id:id(`a${index}`),name:`José cámara ${index}`, slug:id(`a${index}`),isPerson:true,voiceTone:index===38?"Voz especial":"", personality:index===38?"Buscable únicamente al final":"" })) });
    await t.test("Arquetipos busca sin tildes en registros fuera de la primera página", async () => {
      const first=await archetypes.getArchetypeList("jose camara","1"),last=await archetypes.getArchetypeList("jose camara","2");
      assert.equal(first.items.length,36); assert.equal(last.items.length,3); assert.equal(first.total,39);
      assert.equal((await archetypes.getArchetypeList("unicamente al final")).items[0].id,id("a38"));
    });
    const columnId=initialIds[0];
    await prisma.task.createMany({ data:Array.from({length:115},(_,index)=>({id:id(`t${String(index).padStart(3,"0")}`),title:`Tarea ${index}`,columnId,brandId:id(index>=110?"B":"A"),order:Math.floor(index/2)})) });
    await t.test("cada cursor lee 50 tareas de una columna y soporta la eliminación de su ancla", async () => {
      const first=await tasks.getTaskColumnPage(columnId,id("A"),{});
      assert.equal(first.tasks.length,50); assert.ok(first.nextCursor);
      const anchor=first.tasks.at(-1); await prisma.task.delete({where:{id:anchor.id}});
      const second=await tasks.getTaskColumnPage(columnId,id("A"),{},first.nextCursor);
      const third=await tasks.getTaskColumnPage(columnId,id("A"),{},second.nextCursor);
      assert.equal(second.tasks.length,50); assert.equal(third.tasks.length,10); assert.equal(third.nextCursor,null);
      assert.equal(new Set([...first.tasks,...second.tasks,...third.tasks].map(row=>row.id)).size,110);
      await assert.rejects(tasks.getTaskColumnPage(columnId,id("B"),{},first.nextCursor),/filtros/);
      await assert.rejects(tasks.getTaskColumnPage(columnId,id("A"),{q:"otro"},first.nextCursor),/filtros/);
      assert.equal((await tasks.getTaskColumnPage(columnId,id("A"),{q:"Tarea 109"})).tasks.length,1);
    });
    await t.test("mover una tarjeta usa el orden completo de destino aunque solo se muestren 50", async () => {
      const destination = initialIds[1];
      await prisma.task.createMany({ data: Array.from({ length: 60 }, (_, index) => ({ id: id(`move${index}`), title: `Destino ${index}`, columnId: destination, brandId: id("A"), order: index })) });
      const visible = await tasks.getTaskColumnPage(destination, id("A"), {});
      assert.equal(visible.tasks.length, 50);
      const action = load("src/app/actions/tasks.ts", {
        ...mocks, "@/lib/auth": { LEVEL: { MEMBER: 1 }, requireLevel: async () => owner },
        "next/cache": { revalidatePath: () => {} }, "@/lib/audit": { logAudit: async () => {} },
      });
      await action.moverTarea(id("t109"), destination);
      const next = await tasks.getTaskColumnPage(destination, id("A"), {}, visible.nextCursor);
      assert.equal(next.tasks.at(-1).id, id("t109"));
      assert.equal(next.tasks.at(-1).order, 60);
      assert.equal(next.tasks.at(-1).brandId, id("A"));
      assert.equal((await tasks.getTaskColumnPage(columnId, id("A"), { q: "Tarea 109" })).tasks.length, 0);
    });
    await t.test("Equipo filtra antes de paginar y cuenta un video con dos funciones solo una vez", async () => {
      await prisma.user.createMany({data:Array.from({length:52},(_,index)=>({id:id(`u${index}`),name:`Persona ${index}`,email:`${prefix}-${index}@example.test`,passwordHash:"fixture",role:"MEMBER"}))});
      const listing=await team.getTeamList({q:prefix});
      assert.equal(listing.items.length,50); assert.equal(listing.total,53);
      assert.equal((await team.getTeamList({q:prefix,pagina:"2"})).items.length,3);
      const summary=await participation.getTeamParticipation([owner.id]);
      assert.equal(summary.participation.get(owner.id).videos,1); assert.equal(summary.totalAssignments,2);
    });
  } finally {
    await prisma.task.deleteMany({where:{id:{startsWith:prefix}}});
    await prisma.taskColumn.deleteMany({where:{id:{in:initialIds}}});
    await prisma.brand.deleteMany({where:{id:{startsWith:prefix}}});
    await prisma.user.deleteMany({where:{id:{startsWith:prefix}}});
    await prisma.archetype.deleteMany({where:{id:{startsWith:prefix}}});
    await prisma.$disconnect();
  }
});
