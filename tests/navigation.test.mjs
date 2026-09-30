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
  assert.deepEqual(queries[0].where.AND, [where, { period: "WEEKLY" }]);
  assert.deepEqual(queries[1].where.AND, [where, { period: "WEEKLY" }]);
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
  const { taskListOptions, normalizeTaskFilters } = load("src/lib/task-list.ts");
  const options = taskListOptions("A", { q: " buscar ", tipo: "IDEA", responsable: "UNASSIGNED", sin_marca: "1", pagina: "2" });
  assert.equal(options.where.brandId, "A");
  assert.equal(options.where.assigneeId, null);
  assert.equal(options.where.kind, "IDEA");
  assert.equal(options.where.OR[0].title.contains, "buscar");
  assert.equal(taskListOptions(null, { sin_marca: "1" }).where.brandId, null);
  assert.deepEqual(taskListOptions(null, { pagina: "Infinity" }).where, {});
  const normalized = normalizeTaskFilters({ q: "x".repeat(300), tipo: "INVALID", sin_marca: "no" });
  assert.equal(normalized.q.length, 200);
  assert.equal(normalized.tipo, undefined);
  assert.equal(normalized.sin_marca, undefined);
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
  const tx = { $executeRaw: async () => {}, taskColumn: { count: async () => columns.size, upsert: async ({ create }) => { columns.set(create.id, create); } } };
  const prisma = { $transaction: async (work, options) => {
    assert.equal(options.isolationLevel, "Serializable");
    if (++attempts === 1) throw Object.assign(new Error("Conflicto"), { code: "P2034" });
    return work(tx);
  } };
  const { asegurarColumnasIniciales } = load("src/app/actions/tasks.ts", {
    "@/lib/prisma": { prisma }, "@/lib/auth": { LEVEL: { MEMBER: 1 }, requireLevel: async () => ({ id: "u1" }) },
    "@/lib/auth-transactions": { assertActor: async () => {} },
    "@/lib/audit": { auditInTransaction: async (received) => { assert.equal(received, tx); audits++; } }, "next/cache": { revalidatePath: () => {} },
  });
  await asegurarColumnasIniciales(); await asegurarColumnasIniciales();
  assert.equal(columns.size, 5); assert.equal(audits, 1); assert.equal(attempts, 3);
});

test("un token de calendario ausente/malformado no consulta DB ni crea una suscripción", async () => {
  const { resolveCalendarSubscription } = load("src/lib/calendar-subscriptions.ts", { "@/lib/prisma": { prisma: new Proxy({}, { get: () => assert.fail("No consultar DB") }) } });
  assert.equal(await resolveCalendarSubscription(null), null);
  assert.equal(await resolveCalendarSubscription("short"), null);
});

test("el estado de claves usa solo metadatos: la clave guardada manda y el entorno es respaldo", async () => {
  const names = ["ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"];
  const before = Object.fromEntries(names.map((key) => [key, process.env[key]]));
  try {
    names.forEach((key) => delete process.env[key]);
    const prisma = { appSetting: { findUnique: () => assert.fail("Lectura duplicada de ajustes") } };
    const { aiStatus } = load("src/lib/settings.ts", { "@/lib/prisma": { prisma } });
    const snapshot = ["ai.anthropic.apiKey", "auth.google.clientSecret"];
    assert.equal((await aiStatus(snapshot)).anthropic.source, "db");
    assert.equal((await aiStatus(snapshot)).anthropic.envDefined, false);
    // Con la variable definida, la guardada en Ajustes sigue mandando.
    process.env.ANTHROPIC_API_KEY = "fixture-env-key";
    assert.equal((await aiStatus(snapshot)).anthropic.source, "db");
    assert.equal((await aiStatus(snapshot)).anthropic.envDefined, true);
    // Sin clave guardada (o guardada en blanco), la variable es el respaldo.
    assert.equal((await aiStatus([])).anthropic.source, "env");
    assert.equal((await aiStatus([])).anthropic.source, "env");
    // La entrada con Google conserva su propia precedencia (entorno manda).
    const { googleConfigStatus } = load("src/lib/google.ts", { "@/lib/settings": { getSetting: () => assert.fail("Lectura duplicada de OAuth") } });
    assert.equal((await googleConfigStatus({"auth.google.clientId":"fixture-id"}, snapshot)).source, "db");
    process.env.GOOGLE_CLIENT_ID = "fixture-env-id"; process.env.GOOGLE_CLIENT_SECRET = "fixture-env-secret";
    assert.equal((await googleConfigStatus({"auth.google.clientId":"fixture-id"}, snapshot)).source, "env");
    assert.equal((await aiStatus([])).google.configured, false);
  } finally {
    for (const key of names) { if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key]; }
  }
});

/* Archivo total (M0, ARCHIVO_TOTAL_DESDE): pantallas y lecturas directas del Dueño. */
async function withArchiveEpoch(value, work) {
  const before = process.env.ARCHIVO_TOTAL_DESDE;
  try {
    if (value === undefined) delete process.env.ARCHIVO_TOTAL_DESDE; else process.env.ARCHIVO_TOTAL_DESDE = value;
    return await work();
  } finally {
    if (before === undefined) delete process.env.ARCHIVO_TOTAL_DESDE; else process.env.ARCHIVO_TOTAL_DESDE = before;
  }
}

test("archivo total: Contenido oculta los videos de marcas archivadas solo con la época", async () => {
  const where = { brandId: "marca-A" };
  const seen = [];
  const prisma = { contentItem: { count: async (query) => (seen.push(query.where), 0), findMany: async (query) => (seen.push(query.where), []) } };
  const { getContentList } = load("src/lib/content-list.ts", { "@/lib/prisma": { prisma } });
  await withArchiveEpoch("2026-10-01", () => getContentList(where));
  assert.deepEqual(seen, [{ AND: [where, { brand: { archived: false } }] }, { AND: [where, { brand: { archived: false } }] }]);
  seen.length = 0;
  await withArchiveEpoch(undefined, () => getContentList(where));
  assert.deepEqual(seen, [where, where], "con el interruptor vacío el filtro no cambia");
  seen.length = 0;
  await withArchiveEpoch("no-es-fecha", () => getContentList(where));
  assert.deepEqual(seen, [where, where], "un valor inválido deja el interruptor apagado");
});

test("archivo total: el tablero conserva las columnas globales y oculta tareas archivadas o personales viejas", async () => {
  const seen = [];
  const prisma = { task: { findMany: async (query) => (seen.push(query.where), []) } };
  const { taskColumnWhere, getTaskColumnPage } = load("src/lib/task-pages.ts", { "@/lib/prisma": { prisma } });
  await withArchiveEpoch(undefined, async () => {
    assert.deepEqual(taskColumnWhere(null), {});
    assert.deepEqual(taskColumnWhere("A"), { OR: [{ brandId: null }, { brandId: "A" }] });
    await getTaskColumnPage("col-1", null, {});
  });
  assert.equal(seen[0].AND.length, 4, "apagado: la consulta de tareas queda igual");
  await withArchiveEpoch("2026-10-01", async () => {
    const liveColumns = { OR: [{ brandId: null }, { brand: { is: { archived: false } } }] };
    assert.deepEqual(taskColumnWhere(null), { AND: [{}, liveColumns] }, "las columnas globales nunca se ocultan por la época");
    assert.deepEqual(taskColumnWhere("A"), { AND: [{ OR: [{ brandId: null }, { brandId: "A" }] }, liveColumns] });
    await getTaskColumnPage("col-1", null, {});
  });
  const live = seen[1].AND.at(-1);
  assert.deepEqual(live.OR[0], { brand: { is: { archived: false } } });
  assert.equal(live.OR[1].brandId, null);
  assert.ok(live.OR[1].createdAt.gte instanceof Date, "lo personal sin marca se oculta si es anterior a la época");
});

test("archivo total: métricas y generaciones pendientes filtran marcas archivadas en SQL directo", async () => {
  const owner = { id: "duena", role: "OWNER" };
  const filters = { user: owner, brandId: null, desde: "2026-09-01", hasta: "2026-09-28" };
  const { metricSource } = load("src/lib/metric-dashboard.ts", { "@/lib/prisma": { prisma: {} } });
  const off = await withArchiveEpoch(undefined, () => metricSource(filters));
  const on = await withArchiveEpoch("2026-10-01", () => metricSource(filters));
  assert.doesNotMatch(off.sql, /"Brand" ab/);
  assert.match(on.sql, /NOT EXISTS \(SELECT 1 FROM "Brand" ab WHERE ab\."id" = ci\."brandId" AND ab\."archived"\)/);

  const queries = [];
  const tx = { $queryRaw: async (query) => (queries.push(query), [{ id: null, total: 0, page: 1 }]), generationJob: { findMany: () => assert.fail("Sin ids no consulta trabajos") } };
  const prisma = { $transaction: async (work) => work(tx) };
  const { generationHistory } = load("src/lib/generation-history.ts", { "@/lib/prisma": { prisma } });
  await withArchiveEpoch(undefined, () => generationHistory(owner));
  await withArchiveEpoch("2026-10-01", () => generationHistory(owner));
  assert.doesNotMatch(queries[0].sql, /"Brand" ab/);
  assert.match(queries[1].sql, /NOT EXISTS \(SELECT 1 FROM "Brand" ab WHERE ab\."id" = j\."payload"->>'brandId' AND ab\."archived"\)/);
  assert.ok(queries[1].values.some((value) => value instanceof Date), "los trabajos sin marca anteriores a la época también se ocultan");
});
