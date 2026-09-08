import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");

// Ejecuta los módulos originales; solo sustituye sus fronteras de DB/Next.
function load(file, mocks = {}, registry = new Map()) {
  const fullPath = path.resolve(root, file);
  if (registry.has(fullPath)) return registry.get(fullPath).exports;
  const module = { exports: {} };
  registry.set(fullPath, module);
  const { outputText } = ts.transpileModule(fs.readFileSync(fullPath, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: fullPath,
  });
  const resolve = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.startsWith("@/")) return load(`src/${name.slice(2)}.ts`, mocks, registry);
    return require(name);
  };
  new Function("require", "module", "exports", outputText)(resolve, module, module.exports);
  return module.exports;
}

test("el listado empieza sin esperar el conteo y corrige una página eliminada", async () => {
  const { loadPage } = load("src/lib/list-pagination.ts");
  let finishCount;
  const count = new Promise((resolve) => { finishCount = resolve; });
  const ranges = [];
  const result = loadPage("4", 50, () => count, async (range) => {
    ranges.push(range);
    return range.skip === 50 ? ["última fila"] : [];
  });
  assert.deepEqual(ranges, [{ skip: 150, take: 50 }]);
  finishCount(51);
  assert.deepEqual(await result, { items: ["última fila"], total: 51, page: 2, pageCount: 2 });
  assert.deepEqual(ranges[1], { skip: 50, take: 50 });
});

test("paginación vacía y parámetros inválidos no generan offsets inválidos", async () => {
  const { loadPage } = load("src/lib/list-pagination.ts");
  for (const parameter of [undefined, "NaN", "Infinity", "-3", "1.5", "99999999999"]) {
    const result = await loadPage(parameter, 50, async () => 0, async ({ skip }) => {
      assert.equal(skip, 0);
      return [];
    });
    assert.equal(result.page, 1);
    assert.equal(result.pageCount, 1);
  }
});

test("Contenido agrega solo los videos visibles y distingue cero de ausencia de métricas", async () => {
  const where = { brandId: "marca-A", status: "PUBLICADO" };
  const rows = [{ id: "con-vistas" }, { id: "cero" }, { id: "sin-metricas" }];
  const prisma = {
    contentItem: {
      count: async (query) => { assert.deepEqual(query.where, where); return 3; },
      findMany: async (query) => {
        assert.deepEqual(query.where, where);
        assert.equal(query.take, 50);
        assert.equal(query.select.metrics, undefined);
        return rows;
      },
    },
    metric: { groupBy: async (query) => {
      assert.deepEqual(query.where.contentItemId.in, rows.map((row) => row.id));
      return [{ contentItemId: "con-vistas", _sum: { views: 150 } }, { contentItemId: "cero", _sum: { views: 0 } }];
    } },
  };
  const { getContentList } = load("src/lib/content-list.ts", { "@/lib/prisma": { prisma } });
  assert.deepEqual((await getContentList(where)).items.map((row) => row.metricViews), [150, 0, null]);
});

test("un listado vacío no consulta agregados de otras marcas", async () => {
  const prisma = { contentItem: { count: async () => 0, findMany: async () => [] }, metric: { groupBy: () => assert.fail("Consulta innecesaria") } };
  const { getContentList } = load("src/lib/content-list.ts", { "@/lib/prisma": { prisma } });
  assert.deepEqual((await getContentList({ brandId: "vacía" })).items, []);
});

test("el resumen de comparación conserva filtros, ceros y denominadores", async () => {
  const where = { date: { gte: new Date("2026-08-01") }, contentItem: { brandId: "A", assignments: { some: { userId: "u1" } } } };
  const queries = [];
  const prisma = { metric: { aggregate: async (query) => {
    queries.push(query);
    return query._sum
      ? { _sum: { views: 900, likes: 10, comments: 2, shares: 3, saves: 5, reach: 500, spend: 0, revenue: 120 } }
      : { _avg: { retention3s: 75 } };
  } } };
  const { getMetricSummary } = load("src/lib/metric-summary.ts", { "@/lib/prisma": { prisma } });
  assert.deepEqual(await getMetricSummary(where), { views: 900, interactions: 20, reach: 500, spend: 0, revenue: 120, retention: 75, roas: 0 });
  assert.deepEqual(queries[0].where, where);
  assert.deepEqual(queries[1].where.AND, [where, { retention3s: { gt: 0 } }]);
});

test("Equipo cuenta un video una vez aunque haya dos funciones: SQL real sobre fixture", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec('CREATE TABLE "Assignment" ("userId" TEXT, "contentItemId" TEXT, "role" TEXT)');
    const insert = db.prepare('INSERT INTO "Assignment" VALUES (?, ?, ?)');
    insert.run("u1", "v1", "EDITOR"); insert.run("u1", "v1", "ACTOR"); insert.run("u1", "v2", "EDITOR"); insert.run("u2", "v1", "ACTOR");
    const prisma = {
      $queryRaw: async (strings) => db.prepare(strings.join("")).all(),
      assignment: { groupBy: async () => db.prepare('SELECT "userId", "role", COUNT(*) AS count FROM "Assignment" GROUP BY "userId", "role"').all().map((row) => ({ ...row, _count: { _all: row.count } })) },
    };
    const { getTeamParticipation } = load("src/lib/team-participation.ts", { "@/lib/prisma": { prisma } });
    const result = await getTeamParticipation();
    assert.equal(result.totalAssignments, 4);
    assert.equal(result.participation.get("u1").videos, 2);
    assert.equal(result.participation.get("u1").roles.get("EDITOR"), 2);
    assert.equal(result.participation.get("u2").videos, 1);
  } finally { db.close(); }
});

test("Tareas conserva el alcance de marca y los filtros al cargar más", () => {
  const { taskListOptions } = load("src/lib/task-list.ts");
  const options = taskListOptions("A", { q: " buscar ", tipo: "IDEA", responsable: "UNASSIGNED", sin_marca: "1", pagina: "2" });
  assert.equal(options.where.brandId, "A");
  assert.equal(options.where.assigneeId, null);
  assert.equal(options.limit, 100);
  const next = new URL(options.loadMoreHref, "https://example.test");
  assert.equal(next.searchParams.get("pagina"), "3");
  assert.equal(next.searchParams.get("tipo"), "IDEA");
  assert.equal(taskListOptions(null, { sin_marca: "1" }).where.brandId, null);
  assert.equal(taskListOptions(null, { pagina: "Infinity" }).limit, 50);
});

test("el inicializador rechaza una sesión ausente antes de tocar DB", async () => {
  const { asegurarColumnasIniciales } = load("src/app/actions/tasks.ts", {
    "@/lib/prisma": { prisma: new Proxy({}, { get: () => assert.fail("DB consultada antes de autorizar") }) },
    "@/lib/auth": { LEVEL: { MEMBER: 1 }, requireLevel: async () => { throw new Error("Sin sesión"); } },
    "@/lib/audit": { logAudit: () => assert.fail("Auditoría inesperada") },
    "next/cache": { revalidatePath: () => {} },
  });
  await assert.rejects(asegurarColumnasIniciales(), /Sin sesión/);
});

test("inicialización idempotente, con reintento de conflicto y una auditoría", async () => {
  const columns = new Map(); let attempts = 0; let audits = 0;
  const tx = { taskColumn: { count: async () => columns.size, upsert: async ({ create }) => { columns.set(create.id, create); } } };
  const prisma = { $transaction: async (work, options) => {
    assert.equal(options.isolationLevel, "Serializable");
    if (++attempts === 1) throw Object.assign(new Error("Conflicto"), { code: "P2034" });
    return work(tx);
  } };
  const { asegurarColumnasIniciales } = load("src/app/actions/tasks.ts", {
    "@/lib/prisma": { prisma }, "@/lib/auth": { LEVEL: { MEMBER: 1 }, requireLevel: async () => ({ id: "u1" }) },
    "@/lib/audit": { logAudit: async () => { audits++; } }, "next/cache": { revalidatePath: () => {} },
  });
  await asegurarColumnasIniciales(); await asegurarColumnasIniciales();
  assert.equal(columns.size, 5); assert.equal(audits, 1); assert.equal(attempts, 3);
});

test("leer el feed sin token no escribe y conserva tokens existentes", async () => {
  let token = null;
  const { getFeedToken } = load("src/lib/ical.ts", { "@/lib/settings": { getSetting: async () => token, setSetting: () => assert.fail("Una lectura no debe crear el token") } });
  assert.equal(await getFeedToken(), null);
  token = "existing-calendar-token-at-least-24-characters";
  assert.equal(await getFeedToken(), token);
});

test("el snapshot de ajustes evita lecturas adicionales y respeta la precedencia del entorno", async () => {
  const names = ["ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"];
  const before = Object.fromEntries(names.map((key) => [key, process.env[key]]));
  try {
    names.forEach((key) => delete process.env[key]);
    const prisma = { appSetting: { findUnique: () => assert.fail("Lectura duplicada de ajustes") } };
    const { aiStatus } = load("src/lib/settings.ts", { "@/lib/prisma": { prisma } });
    const snapshot = { "ai.anthropic.apiKey": "fixture-db-key", "auth.google.clientId": "fixture-id", "auth.google.clientSecret": "fixture-secret" };
    assert.equal((await aiStatus(snapshot)).anthropic.source, "db");
    process.env.ANTHROPIC_API_KEY = "fixture-env-key";
    assert.equal((await aiStatus(snapshot)).anthropic.source, "env");
    const { getGoogleConfig } = load("src/lib/google.ts", { "@/lib/settings": { getSetting: () => assert.fail("Lectura duplicada de OAuth") } });
    assert.equal((await getGoogleConfig(snapshot)).source, "db");
    process.env.GOOGLE_CLIENT_ID = "fixture-env-id"; process.env.GOOGLE_CLIENT_SECRET = "fixture-env-secret";
    assert.equal((await getGoogleConfig(snapshot)).source, "env");
    assert.equal((await aiStatus({})).google.configured, false);
  } finally {
    for (const key of names) { if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key]; }
  }
});
