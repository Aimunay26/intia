/**
 * Archivado total (M0), núcleo de ocultamiento: ARCHIVO_TOTAL_DESDE, archive-scope.ts y las piezas
 * que lo usan (sesión, permisos, alcances, cola de IA, recuperación diaria y barrido).
 *
 * La mitad de las pruebas demuestra que con la variable vacía todo queda como antes: mismas
 * consultas, mismos alcances y mismos permisos. La otra mitad, que encendida oculta a todos (también
 * al Dueño) lo de marcas archivadas y lo personal anterior a la época, y que las guardas de la cola,
 * la recuperación y el barrido excluyen las marcas archivadas siempre.
 *
 * Sin base de datos: Prisma se sustituye por objetos que registran lo que se les pide.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { SignJWT } from "jose";
import { Prisma } from "@prisma/client";
import { load } from "./load-module.mjs";

const EPOCH_ENV = "ARCHIVO_TOTAL_DESDE";
const EPOCH = "2026-10-01T05:00:00.000Z";
const NO_REDIRECT = { redirect(url) { throw new Error(`redirect ${url}`); }, notFound() { throw new Error("404"); } };

/** Ejecuta fn con las variables dadas (undefined = sin definir) y deja el entorno como estaba. */
function setEnv(values) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
async function withEnv(values, fn) {
  const before = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  setEnv(values);
  try { return await fn(); } finally { setEnv(before); }
}
const off = (fn) => withEnv({ [EPOCH_ENV]: undefined }, fn);
const on = (fn) => withEnv({ [EPOCH_ENV]: EPOCH }, fn);
/** Silencia los avisos de la traza de generación y del interruptor durante fn; devuelve lo avisado. */
async function quiet(fn) {
  const { info, warn } = console;
  const warned = [];
  console.info = () => {};
  console.warn = (...args) => warned.push(args.join(" "));
  try { await fn(); } finally { Object.assign(console, { info, warn }); }
  return warned;
}
const normalize = (sql) => sql.replace(/\s+/g, " ").trim();
/** Un tagged template de Prisma ($queryRaw`...`) convertido en Prisma.Sql, para leer su texto. */
const asSql = (strings, values) => Prisma.sql(strings, ...values);

/* --------------------------------------------------------------- ÉPOCA -- */

test("época: vacía apaga sin aviso; las fechas ISO válidas se leen igual que en el script", () => {
  const { parseArchiveEpoch } = load("src/lib/archive-epoch.ts");
  for (const raw of [undefined, null, "", "   "]) assert.deepEqual(parseArchiveEpoch(raw), { epoch: null, invalid: false });
  const cases = {
    "2026-10-01": "2026-10-01T00:00:00.000Z",
    " 2026-10-01 ": "2026-10-01T00:00:00.000Z",
    "2026-10-01T05:00:00Z": "2026-10-01T05:00:00.000Z",
    "2026-10-01T05:00Z": "2026-10-01T05:00:00.000Z",
    "2026-10-01T00:00:00.000-05:00": "2026-10-01T05:00:00.000Z",
    "2026-09-30T23:59:59.999+00:00": "2026-09-30T23:59:59.999Z",
  };
  for (const [raw, iso] of Object.entries(cases)) {
    const parsed = parseArchiveEpoch(raw);
    assert.equal(parsed.invalid, false, raw);
    assert.equal(parsed.epoch.toISOString(), iso, raw);
    // Mismo instante que new Date() del script archivo-total (--desde), que acepta el mismo formato.
    assert.equal(parsed.epoch.getTime(), new Date(raw.trim()).getTime(), raw);
  }
});

test("época: un valor inválido apaga el interruptor y avisa una sola vez por valor", async () => {
  const { parseArchiveEpoch, archiveEpoch, archiveEpochEnabled } = load("src/lib/archive-epoch.ts");
  for (const raw of ["2026-02-30", "2026-13-01", "2026-10-01T10:00", "2026-10-01T24:00Z", "2026-10-01T10:61Z", "1999-12-31", "ayer", "2026/10/01", "2026-10-01T10:00+15:00", "true"]) {
    assert.deepEqual(parseArchiveEpoch(raw), { epoch: null, invalid: true }, raw);
  }
  const warned = await quiet(async () => {
    assert.equal(archiveEpoch({ ARCHIVO_TOTAL_DESDE: "mañana" }), null);
    assert.equal(archiveEpoch({ ARCHIVO_TOTAL_DESDE: "mañana" }), null);
    assert.equal(archiveEpochEnabled({ ARCHIVO_TOTAL_DESDE: "mañana" }), false);
    assert.equal(archiveEpoch({ ARCHIVO_TOTAL_DESDE: "2026-02-30" }), null);
    assert.equal(archiveEpoch({}), null);
    assert.equal(archiveEpoch({ ARCHIVO_TOTAL_DESDE: EPOCH }).toISOString(), EPOCH);
  });
  assert.equal(warned.length, 2, "un aviso por valor inválido distinto, no uno por llamada");
  assert.deepEqual(JSON.parse(warned[0]), { event: "archivo_total", reason: "epoch_invalid", value: "mañana" });
  // Se lee el entorno en cada llamada (sin caché del valor).
  await on(() => assert.equal(archiveEpoch().toISOString(), EPOCH));
  await off(() => assert.equal(archiveEpoch(), null));
});

/* ------------------------------------------------------------- HELPERS -- */

test("helpers vivos: apagados devuelven {} y TRUE, sin cambiar ninguna consulta", async () => {
  const scope = load("src/lib/archive-scope.ts");
  await off(async () => {
    for (const name of ["liveBrand", "liveContent", "liveStep", "liveScript", "liveTask", "liveEvent", "liveColumn"]) assert.deepEqual(scope[name](), {}, name);
    assert.equal(scope.liveJobSql("j").sql, "TRUE");
    assert.equal(scope.liveBrandSql('ci."brandId"').sql, "TRUE");
    assert.equal(scope.liveBrandSql('t."brandId"', { createdAt: 't."createdAt"' }).sql, "TRUE");
    const same = { brandId: "A" };
    assert.equal(scope.withLive(same, {}), same, "withLive apagado devuelve el mismo objeto");
    let queried = false;
    assert.deepEqual(await scope.liveBrandIds({ brand: { findMany: async () => { queried = true; return []; } } }, ["b", "a"]), ["b", "a"]);
    assert.equal(queried, false, "apagado no consulta marcas");
  });
});

test("helpers vivos: encendidos ocultan marcas archivadas y lo sin marca anterior a la época", async () => {
  const scope = load("src/lib/archive-scope.ts");
  const epoch = new Date(EPOCH);
  const dated = { OR: [{ brand: { is: { archived: false } } }, { brandId: null, createdAt: { gte: epoch } }] };
  await on(async () => {
    assert.deepEqual(scope.liveBrand(), { archived: false });
    assert.deepEqual(scope.liveContent(), { brand: { archived: false } });
    assert.deepEqual(scope.liveStep(), { contentItem: { brand: { archived: false } } });
    assert.deepEqual(scope.liveScript(), dated);
    assert.deepEqual(scope.liveTask(), dated);
    assert.deepEqual(scope.liveEvent(), dated);
    // Las columnas globales nunca se ocultan por la época (T25): solo las de marcas archivadas.
    assert.deepEqual(scope.liveColumn(), { OR: [{ brandId: null }, { brand: { is: { archived: false } } }] });
    assert.doesNotMatch(JSON.stringify(scope.liveColumn()), /createdAt/);
    assert.deepEqual(scope.withLive({ brandId: "A" }, { brand: { archived: false } }), { AND: [{ brandId: "A" }, { brand: { archived: false } }] });
    assert.deepEqual(scope.withLive({}, { archived: false }), { archived: false }, "alcance vacío (Dueño): solo el filtro vivo");

    const job = scope.liveJobSql("j");
    assert.equal(normalize(job.sql), `(NOT EXISTS (SELECT 1 FROM "Brand" ab WHERE ab."id" = j."payload"->>'brandId' AND ab."archived") AND (j."payload"->>'brandId' IS NOT NULL OR j."createdAt" >= ?))`);
    assert.deepEqual(job.values, [epoch]);
    assert.equal(normalize(scope.liveBrandSql('ci."brandId"').sql), `NOT EXISTS (SELECT 1 FROM "Brand" ab WHERE ab."id" = ci."brandId" AND ab."archived")`);
    const personal = scope.liveBrandSql('t."brandId"', { createdAt: 't."createdAt"' });
    assert.equal(normalize(personal.sql), `(NOT EXISTS (SELECT 1 FROM "Brand" ab WHERE ab."id" = t."brandId" AND ab."archived") AND (t."brandId" IS NOT NULL OR t."createdAt" >= ?))`);
    // La época explícita manda sobre el entorno (una sola lectura por consulta).
    assert.equal(scope.liveBrandSql('ci."brandId"', { epoch: null }).sql, "TRUE");

    const asked = [];
    const db = { brand: { findMany: async (args) => { asked.push(args); return [{ id: "a" }, { id: "c" }]; } } };
    assert.deepEqual(await scope.liveBrandIds(db, ["c", "b", "a", "c"]), ["c", "a", "c"], "mismo orden, sin las archivadas");
    assert.deepEqual(asked, [{ where: { id: { in: ["c", "b", "a"] }, archived: false }, select: { id: true } }]);
  });
  // Columnas o alias fuera del patrón son un error de programación, encendido o apagado.
  await off(() => {
    assert.throws(() => scope.liveBrandSql("brandId; DROP TABLE x"), /columna no válida/);
    assert.throws(() => scope.liveBrandSql('ci."brandId"', { createdAt: "now()" }), /columna no válida/);
    assert.throws(() => scope.liveJobSql("j; --"), /alias no válido/);
  });
});

/* ------------------------------------------------------------ PERMISOS -- */

test("permisos: con la época apagada un miembro sin marcas conserva sus perfiles, como hoy", async () => {
  const policy = load("src/lib/permissions.ts");
  await off(() => {
    assert.deepEqual(policy.permissionFlags(), { designerCalendar: false, archiveEpoch: false });
    const writer = { id: "w", role: "MEMBER", profiles: ["WRITER"], brandIds: [] };
    assert.equal(policy.allows(writer, "scripts.generate"), true);
    assert.equal(policy.canAccessPath(writer, "/generador"), true);
    assert.deepEqual(policy.profileGrants(writer, "scripts.view"), [{ id: "WRITER", scope: "brand" }]);
  });
});

test("permisos: con la época encendida un MEMBER sin marcas vivas conserva solo base", async () => {
  const policy = load("src/lib/permissions.ts");
  const sections = (user, flags) => Object.keys(policy.SECTIONS).filter((s) => policy.canAccessSection(user, s, flags)).sort();
  const everything = ["STRATEGY", "WRITER", "PRODUCTION", "CAMERA", "TALENT", "EDITOR", "DESIGNER", "PUBLISHER", "ANALYST"];
  await on(() => {
    assert.deepEqual(policy.permissionFlags(), { designerCalendar: false, archiveEpoch: true });
    const lost = { id: "m", role: "MEMBER", profiles: everything, brandIds: [] };
    assert.deepEqual(sections(lost), ["help", "manual", "panel", "profile"]);
    for (const cap of ["content.view", "scripts.generate", "archetypes.view", "structures.view", "tasks.view", "calendar.view", "metrics.view"]) assert.equal(policy.allows(lost, cap), false, cap);
    assert.equal(policy.allows(lost, "profile.self"), true);
    assert.deepEqual(policy.profileGrants(lost, "content.view"), []);
    // Con una marca viva, nada cambia.
    const kept = { ...lost, brandIds: ["A"] };
    assert.equal(policy.allows(kept, "scripts.generate"), true);
    assert.deepEqual(policy.profileGrants(kept, "tasks.view").length, everything.length);
    // Sin la lista de marcas (menú sin brandIds, perfil guardado de otra persona) no se sabe: la regla no se aplica.
    assert.equal(policy.allows({ id: "x", role: "MEMBER", profiles: ["WRITER"] }, "scripts.generate"), true);
    // El Dueño y los roles desconocidos, como siempre.
    assert.equal(policy.allows({ id: "o", role: "OWNER", brandIds: [] }, "admin.settings"), true);
    assert.equal(policy.allows({ id: "a", role: "ADMIN", brandIds: ["A"] }, "home.view"), false);
  });
  // Las banderas explícitas (las que el layout pasa al menú) mandan sobre el entorno del navegador.
  await off(() => {
    const lost = { id: "m", role: "MEMBER", profiles: ["WRITER"], brandIds: [] };
    assert.deepEqual(sections(lost, { designerCalendar: false, archiveEpoch: true }), ["help", "manual", "panel", "profile"]);
    assert.ok(sections(lost, { designerCalendar: false }).includes("generator"), "sin archiveEpoch (Shell por defecto) queda apagado");
  });
});

/* ------------------------------------------------------------- ALCANCES -- */

const OWNER = { id: "owner", role: "OWNER", profiles: [], brandIds: [] };
const STRATEGY = { id: "lead", role: "MEMBER", profiles: ["STRATEGY"], brandIds: ["A"] };
const EDITOR = { id: "ed", role: "MEMBER", profiles: ["EDITOR"], brandIds: ["A"] };

test("alcances: con la época apagada son exactamente los de antes (Dueño {} y miembro por marca)", async () => {
  const scopes = load("src/lib/access-scope.ts", { "@/lib/prisma": { prisma: {} } });
  const steps = load("src/lib/production-scope.ts", { "@/lib/prisma": { prisma: {} } });
  await off(() => {
    for (const name of ["contentScope", "scriptScope", "taskScope", "eventScope", "generationScope", "archetypeScope", "brandScope"]) assert.deepEqual(scopes[name](OWNER), {}, name);
    assert.deepEqual(steps.productionStepScope(OWNER), {});
    assert.deepEqual(scopes.brandScope(STRATEGY), { id: { in: ["A"] } });
    assert.deepEqual(scopes.contentScope(STRATEGY), { brandId: { in: ["A"] } });
    assert.deepEqual(scopes.contentScope(EDITOR), { brandId: { in: ["A"] }, OR: [{ assignments: { some: { userId: "ed" } } }] });
    assert.deepEqual(scopes.scriptScope(STRATEGY), { brandId: { in: ["A"] } });
    assert.deepEqual(scopes.taskScope(STRATEGY), { OR: [{ brandId: { in: ["A"] } }, { brandId: null, assigneeId: "lead" }] });
    assert.deepEqual(scopes.eventScope(STRATEGY), { OR: [{ brandId: { in: ["A"] } }, { brandId: null, createdById: "lead" }] });
    assert.deepEqual(steps.productionStepScope(STRATEGY), { brandId: { in: ["A"] }, OR: [{ assigneeId: "lead" }, { contentItem: { brandId: { in: ["A"] } } }] });
  });
});

test("alcances: con la época encendida el Dueño tampoco ve marcas archivadas ni lo personal anterior", async () => {
  const scopes = load("src/lib/access-scope.ts", { "@/lib/prisma": { prisma: {} } });
  const steps = load("src/lib/production-scope.ts", { "@/lib/prisma": { prisma: {} } });
  const epoch = new Date(EPOCH);
  const dated = { OR: [{ brand: { is: { archived: false } } }, { brandId: null, createdAt: { gte: epoch } }] };
  await on(() => {
    assert.deepEqual(scopes.brandScope(OWNER), { archived: false });
    assert.deepEqual(scopes.contentScope(OWNER), { brand: { archived: false } });
    assert.deepEqual(scopes.scriptScope(OWNER), dated);
    assert.deepEqual(scopes.taskScope(OWNER), dated);
    assert.deepEqual(scopes.eventScope(OWNER), dated);
    assert.deepEqual(steps.productionStepScope(OWNER), { contentItem: { brand: { archived: false } } });
    // Personas y generaciones: sin columna de marca que filtrar aquí (personas se protegen por «solo base»; trabajos, por liveJobSql).
    assert.deepEqual(scopes.archetypeScope(OWNER), {});
    assert.deepEqual(scopes.generationScope(OWNER), {});
    // Miembro: su alcance de siempre, AND el filtro vivo (defensa en profundidad sobre brandIds).
    assert.deepEqual(scopes.contentScope(STRATEGY), { AND: [{ brandId: { in: ["A"] } }, { brand: { archived: false } }] });
    assert.deepEqual(scopes.brandScope(STRATEGY), { AND: [{ id: { in: ["A"] } }, { archived: false }] });
    assert.deepEqual(scopes.taskScope(STRATEGY), { AND: [{ OR: [{ brandId: { in: ["A"] } }, { brandId: null, assigneeId: "lead" }] }, dated] });
    assert.deepEqual(scopes.scriptScope({ ...STRATEGY, profiles: ["WRITER"] }, "scripts.write").AND[1], dated);
    assert.deepEqual(steps.productionStepScope(STRATEGY).AND[1], { contentItem: { brand: { archived: false } } });
    // Miembro sin marcas vivas: nada fuera de base.
    const lost = { ...STRATEGY, brandIds: [] };
    for (const name of ["contentScope", "scriptScope", "taskScope", "eventScope", "archetypeScope", "generationScope"]) assert.deepEqual(scopes[name](lost), { id: { in: [] } }, name);
  });
});

/* -------------------------------------------------------------- SESIÓN -- */

const LEGACY_SESSION_SQL = `SELECT u."id", u."name", u."email", u."role", u."color", u."archetypeId", u."sessionVersion",
        ARRAY(SELECT p.profile FROM "UserWorkProfile" p WHERE p."userId"=u.id ORDER BY p.profile) AS profiles,
        ARRAY(SELECT b."brandId" FROM "UserBrandAccess" b WHERE b."userId"=u.id ORDER BY b."brandId") AS "brandIds"
      FROM "AuthSession" s JOIN "User" u ON u."id" = s."userId"
      WHERE s."id" = ?
        AND u."id" = ? AND u."active" = true AND u."sessionVersion" = ?
        AND s."expiresAt" > CURRENT_TIMESTAMP`;

async function sessionQuery() {
  const secret = "prueba-archivo-total-".padEnd(48, "x");
  return withEnv({ AUTH_SECRET: secret }, async () => {
    const token = await new SignJWT({ sub: "u1", sv: 0 }).setJti("jti-de-prueba").setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(secret));
    const seen = [];
    const auth = load("src/lib/auth.ts", {
      "next/headers": { cookies: async () => ({ get: (key) => (key === "mos_session" ? { value: token } : undefined) }), headers: async () => new Headers() },
      "next/navigation": NO_REDIRECT,
      "@/lib/auth-transactions": { BOOTSTRAP_COMPLETE: "bootstrap", withAuthLock: async () => assert.fail("no bloquea al leer la sesión") },
      "@/lib/prisma": { prisma: { $queryRaw: async (strings, ...values) => { seen.push(asSql(strings, values)); return [{ id: "u1", name: "Ana", email: "ana@example.test", role: "MEMBER", color: "#000", archetypeId: null, sessionVersion: 0, profiles: ["WRITER"], brandIds: ["A"] }]; } } },
    });
    const user = await auth.getSession();
    assert.deepEqual(user.brandIds, ["A"]);
    assert.equal(seen.length, 1, "sigue siendo una sola consulta");
    return seen[0];
  });
}

test("sesión: apagada, la consulta es la de siempre; encendida, brandIds sin marcas archivadas", async () => {
  const legacy = await off(sessionQuery);
  assert.equal(normalize(legacy.sql), normalize(LEGACY_SESSION_SQL));
  const live = await on(sessionQuery);
  assert.equal(normalize(live.sql), normalize(LEGACY_SESSION_SQL.replace(`WHERE b."userId"=u.id ORDER BY`, `WHERE b."userId"=u.id AND NOT EXISTS (SELECT 1 FROM "Brand" ab WHERE ab."id" = b."brandId" AND ab."archived") ORDER BY`)));
  assert.equal(live.values.length, legacy.values.length, "la época no entra como parámetro en esta parte");
});

/* ------------------------------------------------------ COLA DE LA IA -- */

const KEY = "11111111-1111-4111-8111-111111111111";
const USER = { id: "owner", name: "Dueño", email: "o@example.test", role: "OWNER", color: "#000", archetypeId: null, sessionVersion: 0, profiles: [], brandIds: [] };
const PEDIDO = { brandId: "A", request: "Un video que incomode", provider: "anthropic", durationSec: 45 };

/** generation-jobs.ts real sobre un Prisma falso. Marcas: A viva, X archivada; cualquier otra no existe. */
function queue({ source = null, raw = [], user = null, brandRows = null } = {}) {
  const brands = { A: false, X: true };
  const calls = { brandCounts: [], jobs: [], raw: [], cancelled: [], itemUpdates: [], brandFindMany: [] };
  const tx = {
    $executeRaw: async () => 0,
    $queryRaw: async (strings, ...values) => { const sql = asSql(strings, values); if (/"Brand"/.test(sql.sql)) calls.raw.push(sql); return /FOR UPDATE/.test(sql.sql) ? [] : raw; },
    generationJob: {
      findUnique: async (args) => (args.include ? source : null),
      findFirst: async () => ({ id: "job-1", status: "COMPLETED", error: null, createdAt: new Date(), runId: null, payload: PEDIDO, items: [] }),
      count: async ({ where }) => (where.AND ? 1 : 0),
      create: async ({ data }) => { calls.jobs.push(data); return { id: data.id ?? "job-nuevo" }; },
      update: async (args) => { calls.cancelled.push(args); return {}; },
    },
    generationItem: {
      findMany: async () => (source?.items ?? []).map((i) => ({ structureId: i.structureId })),
      update: async (args) => { calls.itemUpdates.push(args); return {}; },
      updateMany: async (args) => { calls.itemUpdates.push(args); return { count: 1 }; },
    },
    structure: { count: async ({ where }) => where.id.in.length },
    brand: {
      count: async ({ where }) => { calls.brandCounts.push(where); if (!(where.id in brands)) return 0; return where.archived === false && brands[where.id] ? 0 : 1; },
      findMany: async (args) => { calls.brandFindMany.push(args); return brandRows ?? args.where.id.in.filter((id) => brands[id] === false).map((id) => ({ id })); },
    },
    user: { findUnique: async () => user },
    archetype: { count: async () => 1 },
    usageCounter: { upsert: async () => ({}) },
    auditLog: { create: async ({ data }) => data },
  };
  const prisma = { ...tx, $transaction: async (fn) => fn(tx) };
  const mod = load("src/lib/generation-jobs.ts", {
    "next/cache": { revalidatePath() {} },
    "next/navigation": NO_REDIRECT,
    "@/lib/prisma": { prisma },
    "@/lib/auth-transactions": { assertActor: async () => {} },
    "@/lib/ai": { AiError: class extends Error {}, generateScript: async () => assert.fail("la IA no se llama en estas pruebas") },
    "@/lib/ai/providers": { esErrorDeAutenticacion: () => false, esErrorDeSaturacion: () => false },
    "@/lib/generation-persist": { persistGeneratedScript: async () => assert.fail("no se guarda nada"), vincularGuionAVideo: async () => ({ linked: false }) },
    "@/lib/settings": {
      aiStatus: async () => assert.fail("una marca archivada se rechaza antes de mirar las claves"),
      getSettings: async () => ({}),
      SETTING_KEYS: { defaultGoogleModel: "g", defaultAnthropicModel: "a" },
    },
  });
  return { ...mod, calls };
}
const withJobs = (fn) => withEnv({ AI_JOBS_ENABLED: "true" }, () => quiet(fn));

test("cola: encolar para una marca archivada se rechaza siempre, con la época apagada o encendida", async () => {
  for (const mode of [off, on]) await mode(() => withJobs(async () => {
    const cola = queue();
    await assert.rejects(cola.enqueueGeneration(USER, KEY, ["est-a"], { ...PEDIDO, brandId: "X" }), /La marca está archivada/);
    await assert.rejects(cola.enqueueGeneration(USER, KEY, ["est-a"], { ...PEDIDO, brandId: "borrada" }), /La marca ya no existe/);
    assert.equal(cola.calls.jobs.length, 0, "no se registra ningún trabajo");
    assert.equal(await cola.enqueueGeneration(USER, KEY, ["est-a"], PEDIDO), "job-nuevo");
    assert.equal(cola.calls.jobs.length, 1);
    // Marca viva: una sola consulta, igual que antes (solo cambia que pide archived=false).
    assert.deepEqual(cola.calls.brandCounts.at(-1), { id: "A", archived: false });
  }));
});

test("cola: reintentar una generación de una marca archivada se rechaza antes de mirar claves o modelos", async () => {
  const source = { id: "origen", userId: "owner", status: "FAILED", payload: { ...PEDIDO, brandId: "X" }, items: [{ id: "i1", structureId: "est-a", status: "FAILED", order: 0 }] };
  for (const mode of [off, on]) await mode(() => withJobs(async () => {
    const cola = queue({ source, raw: [{ id: "origen" }] });
    await assert.rejects(cola.retryFailedGeneration(USER, "origen"), /La marca está archivada/);
    assert.equal(cola.calls.jobs.length, 0);
  }));
});

test("cola: con la época encendida, el avance y el reintento de un trabajo oculto responden como inexistente", async () => {
  await off(() => withJobs(async () => {
    const cola = queue({ raw: [] });
    assert.equal((await cola.generationStatus(USER, "job-1")).id, "job-1");
    assert.equal(cola.calls.raw.length, 0, "apagada no consulta nada más");
  }));
  await on(() => withJobs(async () => {
    const hidden = queue({ raw: [] });
    assert.equal(await hidden.generationStatus(USER, "job-1"), null);
    assert.match(hidden.calls.raw[0].sql, /FROM "GenerationJob" j WHERE j."id" = \? AND \(NOT EXISTS \(SELECT 1 FROM "Brand" ab/);
    const visible = queue({ raw: [{ id: "job-1" }] });
    assert.equal((await visible.generationStatus(USER, "job-1")).id, "job-1");
    const source = { id: "origen", userId: "owner", status: "FAILED", payload: PEDIDO, items: [{ id: "i1", structureId: "est-a", status: "FAILED", order: 0 }] };
    await assert.rejects(queue({ source, raw: [] }).retryFailedGeneration(USER, "origen"), /Generación no encontrada o sin acceso/);
  }));
});

test("cola: el trabajo de un miembro cuya única marca está archivada se cancela solo con la época encendida", async () => {
  const member = { id: "w", name: "W", email: "w@example.test", role: "MEMBER", color: "#000", archetypeId: null, sessionVersion: 0, active: true, workProfiles: [{ profile: "WRITER" }], brandAccess: [{ brandId: "X" }] };
  // Un solo formato con los 3 intentos agotados: sin cancelar, el reclamo lo marca FAILED sin llamar a la IA.
  const job = () => ({ id: "job-x", status: "QUEUED", userId: "w", sessionVersion: 0, createdAt: new Date(), payload: { ...PEDIDO, brandId: "X" },
    items: [{ id: "i1", structureId: "est-a", status: "QUEUED", order: 0, attempts: 3, response: null, leaseToken: null, leaseUntil: null, availableAt: new Date(0) }] });
  await off(() => withJobs(async () => {
    const cola = queue({ source: job(), user: member });
    await cola.processGeneration("job-x");
    assert.equal(cola.calls.cancelled.length, 0, "apagada, el miembro conserva el acceso de siempre");
    assert.equal(cola.calls.brandFindMany.length, 0, "apagada no mira el estado de sus marcas");
    assert.equal(cola.calls.itemUpdates[0].data.status, "FAILED");
  }));
  await on(() => withJobs(async () => {
    const cola = queue({ source: job(), user: member });
    await cola.processGeneration("job-x");
    assert.equal(cola.calls.cancelled[0].data.status, "CANCELLED");
    assert.deepEqual(cola.calls.brandFindMany[0].where, { id: { in: ["X"] }, archived: false });
  }));
});

/* --------------------------------------------- RECUPERACIÓN Y BARRIDO -- */

test("recuperación diaria: nunca despacha trabajos de marcas archivadas y los filtra en la misma consulta", async () => {
  const seen = [], dispatched = [], closing = [], updates = [];
  // La transacción que cierra los colgados de marcas archivadas: aquí no encuentra ninguno.
  const tx = { $queryRaw: async (strings, ...values) => { closing.push(asSql(strings, values)); return []; },
    generationJob: { updateMany: async (args) => (updates.push(args), { count: 0 }) }, generationItem: { updateMany: async (args) => (updates.push(args), { count: 0 }) } };
  const maintenance = load("src/lib/maintenance.ts", {
    "@/lib/prisma": { prisma: { $queryRaw: async (strings, ...values) => { seen.push(asSql(strings, values)); return [{ id: "vivo", createdAt: new Date(Date.now() - 3600000) }]; }, $transaction: async (fn) => fn(tx), appSetting: { upsert: async () => ({}) } } },
    "@/lib/generation-dispatch": { dispatchGeneration: async (id) => { dispatched.push(id); return true; } },
    "@/lib/private-storage": { cleanupPrivateFiles: async () => ({}) },
    "@/lib/retention": { runRetention: async () => ({ enabled: false, changed: 0 }) },
    "@/lib/production-sweep": { runProductionSweep: async () => ({ enabled: false }) },
  });
  for (const mode of [off, on]) await mode(() => withJobs(async () => {
    seen.length = 0; dispatched.length = 0; closing.length = 0; updates.length = 0;
    const report = await maintenance.runMaintenance();
    assert.equal(report.recovery.value.recovered, 1);
    assert.equal(report.recovery.value.closedArchived, 0);
    assert.deepEqual(dispatched, ["vivo"]);
    assert.equal(updates.length, 0, "sin colgados de marcas archivadas no se escribe nada");
    assert.match(normalize(closing[0].sql), /AND EXISTS \(SELECT 1 FROM "Brand" b WHERE b."id" = j."payload"->>'brandId' AND b."archived"\)/);
    const sql = normalize(seen[0].sql);
    assert.match(sql, /AND NOT EXISTS \(SELECT 1 FROM "Brand" b WHERE b."id" = j."payload"->>'brandId' AND b."archived"\)/);
    // El resto de la consulta es la de antes: atascados 6 min, sin concesión vigente, los 3 más antiguos.
    assert.match(sql, /j."status" IN \('QUEUED','RUNNING'\) AND j."updatedAt" < \?/);
    assert.match(sql, /NOT EXISTS \(SELECT 1 FROM "GenerationItem" i WHERE i."jobId" = j."id" AND i."status" = 'RUNNING' AND i."leaseUntil" > \?\)/);
    assert.match(sql, /ORDER BY j."createdAt" ASC, j."id" ASC LIMIT 3$/);
  }));
});

test("recuperación diaria: un trabajo colgado de una marca archivada se cancela sin llamar al proveedor, aunque la IA esté apagada", async () => {
  const updates = [], closing = [];
  const tx = { $queryRaw: async (strings, ...values) => { closing.push(asSql(strings, values)); return [{ id: "colgado" }]; },
    generationJob: { updateMany: async (args) => (updates.push(["job", args]), { count: 1 }) }, generationItem: { updateMany: async (args) => (updates.push(["item", args]), { count: 2 }) } };
  const maintenance = load("src/lib/maintenance.ts", {
    "@/lib/prisma": { prisma: { $queryRaw: async () => [], $transaction: async (fn) => fn(tx), appSetting: { upsert: async () => ({}) } } },
    "@/lib/generation-dispatch": { dispatchGeneration: async () => assert.fail("no se despacha nada") },
    "@/lib/private-storage": { cleanupPrivateFiles: async () => ({}) },
    "@/lib/retention": { runRetention: async () => ({ enabled: false, changed: 0 }) },
    "@/lib/production-sweep": { runProductionSweep: async () => ({ enabled: false }) },
  });
  for (const ai of ["true", undefined]) await off(() => withEnv({ AI_JOBS_ENABLED: ai }, () => quiet(async () => {
    updates.length = 0; closing.length = 0;
    const report = await maintenance.runMaintenance();
    assert.equal(report.recovery.value.closedArchived, 1, `IA ${ai ?? "apagada"}`);
    const sql = normalize(closing[0].sql);
    // Los mismos «colgados» que la recuperación: 6 min sin avanzar y sin concesión vigente; tomados sin esperar a otro proceso.
    assert.match(sql, /j."status" IN \('QUEUED','RUNNING'\) AND j."updatedAt" < \?/);
    assert.match(sql, /NOT EXISTS \(SELECT 1 FROM "GenerationItem" i WHERE i."jobId" = j."id" AND i."status" = 'RUNNING' AND i."leaseUntil" > \?\)/);
    assert.match(sql, /FOR UPDATE OF j SKIP LOCKED$/);
    assert.deepEqual(updates[0], ["job", { where: { id: { in: ["colgado"] }, status: { in: ["QUEUED", "RUNNING"] } }, data: { status: "CANCELLED", error: maintenance.ARCHIVED_JOB_ERROR } }]);
    assert.equal(updates[1][0], "item");
    assert.deepEqual(updates[1][1].where, { jobId: { in: ["colgado"] }, status: { in: ["QUEUED", "RUNNING"] } });
    assert.equal(updates[1][1].data.status, "CANCELLED");
    assert.deepEqual([updates[1][1].data.leaseToken, updates[1][1].data.leaseUntil], [null, null]);
  })));
  // Si cerrar falla, la recuperación de los demás sigue y el fallo queda en el log.
  const broken = load("src/lib/maintenance.ts", {
    "@/lib/prisma": { prisma: { $queryRaw: async () => [{ id: "vivo", createdAt: new Date() }], $transaction: async () => { throw new Error("db"); }, appSetting: { upsert: async () => ({}) } } },
    "@/lib/generation-dispatch": { dispatchGeneration: async () => true },
    "@/lib/private-storage": { cleanupPrivateFiles: async () => ({}) },
    "@/lib/retention": { runRetention: async () => ({ enabled: false, changed: 0 }) },
    "@/lib/production-sweep": { runProductionSweep: async () => ({ enabled: false }) },
  });
  let report;
  const warned = await withEnv({ AI_JOBS_ENABLED: "true" }, () => quiet(async () => { report = await broken.runMaintenance(); }));
  assert.equal(report.recovery.value.recovered, 1);
  assert.equal(report.recovery.value.closedArchived, null);
  assert.ok(warned.some((line) => line.includes("archived_jobs_not_closed")));
});

test("barrido de producción: excluye marcas archivadas siempre, en la búsqueda y dentro de la transacción", async () => {
  const seen = [];
  const tx = { $queryRaw: async (strings, ...values) => { seen.push(asSql(strings, values)); return []; } };
  const sweep = load("src/lib/production-sweep.ts", {
    "@/lib/prisma": { prisma: { $queryRaw: async (strings, ...values) => { seen.push(asSql(strings, values)); return [{ id: "video-1" }]; }, $transaction: async (fn) => fn(tx) } },
    "@/lib/domain/production-flow": { assignEditing: async () => assert.fail("no se asigna la edición de un video de marca archivada") },
  });
  for (const mode of [off, on]) await mode(() => withEnv({ PRODUCTION_FLOW_ENABLED: "true", PRODUCTION_CHAIN_ENABLED: undefined }, async () => {
    seen.length = 0;
    // El video pasa la búsqueda (base falsa) pero la marca se archivó antes del bloqueo: se salta.
    assert.deepEqual(await sweep.runProductionSweep(25, new Date("2026-10-10T15:00:00Z")), { enabled: true, candidates: 1, assigned: 0, skipped: 1, failed: 0 });
    assert.match(normalize(seen[0].sql), /AND NOT EXISTS \(SELECT 1 FROM "Brand" b WHERE b.id = c."brandId" AND b.archived\) ORDER BY/);
    assert.match(normalize(seen[1].sql), /WHERE c.id = \? AND NOT EXISTS \(SELECT 1 FROM "Brand" b WHERE b.id = c."brandId" AND b.archived\) FOR UPDATE OF c SKIP LOCKED$/);
  }));
});

/* ------------------------------------------------ CALENDARIO PERSONAL -- */

test("ICS personal: las marcas de la persona se leen sin las archivadas solo con la época encendida", async () => {
  const selects = [];
  const row = { id: "s", scope: "USER", brandId: null, expiresAt: new Date(Date.now() + 86400000), revokedAt: null, brand: null,
    createdBy: { id: "p", active: true, role: "MEMBER", workProfiles: [{ profile: "EDITOR" }], brandAccess: [{ brandId: "A" }] } };
  const db = { calendarSubscription: { findUnique: async (args) => { selects.push(args.select.createdBy.select.brandAccess); return row; } } };
  const { resolveCalendarSubscription } = load("src/lib/calendar-subscriptions.ts", { "@/lib/prisma": { prisma: db } });
  const token = "a".repeat(43);
  await withEnv({ CALENDAR_FEED_PERSONAL: "true" }, async () => {
    await off(async () => assert.deepEqual((await resolveCalendarSubscription(token, db)).person.brandIds, ["A"]));
    await on(async () => assert.deepEqual((await resolveCalendarSubscription(token, db)).person.brandIds, ["A"]));
  });
  assert.deepEqual(selects[0], { select: { brandId: true } }, "apagada, la misma selección de siempre");
  assert.deepEqual(selects[1], { where: { brand: { archived: false } }, select: { brandId: true } });
});

/* ------------------------------------------------------------- EQUIPO -- */

test("equipo: guardar a una persona conserva sus accesos a marcas archivadas solo con la época encendida", async () => {
  const { saveTeamAccess } = load("src/lib/team-access.ts");
  const fake = () => {
    const calls = { deleted: [], created: [], archived: [] };
    const tx = {
      brand: { count: async (args) => args.where.id.in.length, findMany: async (args) => (calls.archived.push(args.where), [{ id: "X" }]) },
      userWorkProfile: { findMany: async () => [{ profile: "WRITER" }], deleteMany: async () => ({}), createMany: async () => ({}) },
      userBrandAccess: { findMany: async () => [{ brandId: "X" }], deleteMany: async (args) => (calls.deleted.push(args.where), {}), createMany: async (args) => (calls.created.push(args.data), {}) },
    };
    return { tx, calls };
  };
  // El formulario trae solo la marca viva A (Equipo no ofrece la archivada X).
  const access = { profiles: ["WRITER"], brandIds: ["A"] };
  await off(async () => {
    const { tx, calls } = fake();
    assert.deepEqual((await saveTeamAccess(tx, "p", access)).after.brandIds, ["A"], "apagada, el formulario manda como antes");
    assert.deepEqual(calls.deleted[0], { userId: "p", brandId: { notIn: ["A"] } });
    assert.equal(calls.archived.length, 0, "apagada no consulta el estado de las marcas");
  });
  await on(async () => {
    const { tx, calls } = fake();
    assert.deepEqual((await saveTeamAccess(tx, "p", access)).after.brandIds, ["A", "X"]);
    assert.deepEqual(calls.archived[0], { id: { in: ["X"] }, archived: true }, "solo mira las marcas que el formulario quitaría");
    assert.deepEqual(calls.deleted[0], { userId: "p", brandId: { notIn: ["A", "X"] } }, "el acceso a la archivada no se borra");
    assert.deepEqual(calls.created[0], [{ userId: "p", brandId: "A" }]);
  });
});

test("equipo: la participación en videos no cuenta los de marcas archivadas solo con la época encendida", async () => {
  const sqls = [], groups = [];
  const prisma = {
    $queryRaw: async (strings, ...values) => (sqls.push(asSql(strings, values)), [{ people: 0, assignments: 0 }]),
    assignment: { groupBy: async (args) => (groups.push(args), []) },
    user: { groupBy: async () => [], count: async () => 0 },
  };
  const { getTeamParticipation } = load("src/lib/team-participation.ts", { "@/lib/prisma": { prisma } });
  const { getTeamStats } = load("src/lib/team-list.ts", { "@/lib/prisma": { prisma } });
  await off(async () => {
    await getTeamParticipation(["u1"]);
    await getTeamParticipation();
    await getTeamStats();
    assert.equal(normalize(sqls[0].sql), 'SELECT "userId", COUNT(DISTINCT "contentItemId") AS "videos", COUNT(*) AS "assignments" FROM "Assignment" WHERE "userId" IN (?) GROUP BY "userId"');
    assert.equal(normalize(sqls[1].sql), 'SELECT "userId", COUNT(DISTINCT "contentItemId") AS "videos", COUNT(*) AS "assignments" FROM "Assignment" GROUP BY "userId"');
    assert.equal(normalize(sqls[2].sql), 'SELECT COUNT(DISTINCT "userId")::int AS "people", COUNT(*)::int AS "assignments" FROM "Assignment"');
    assert.deepEqual(groups, [{ by: ["userId", "role"], where: { userId: { in: ["u1"] } }, _count: { _all: true } }, { by: ["userId", "role"], _count: { _all: true } }], "apagada, las consultas de siempre");
  });
  sqls.length = 0; groups.length = 0;
  await on(async () => {
    await getTeamParticipation(["u1"]);
    await getTeamStats();
    const archived = 'NOT EXISTS (SELECT 1 FROM "Brand" ab WHERE ab."id" = ci."brandId" AND ab."archived")';
    assert.equal(normalize(sqls[0].sql), `SELECT a."userId", COUNT(DISTINCT a."contentItemId") AS "videos", COUNT(*) AS "assignments" FROM "Assignment" a JOIN "ContentItem" ci ON ci."id" = a."contentItemId" WHERE a."userId" IN (?) AND ${archived} GROUP BY a."userId"`);
    assert.equal(normalize(sqls[1].sql), `SELECT COUNT(DISTINCT a."userId")::int AS "people", COUNT(*)::int AS "assignments" FROM "Assignment" a JOIN "ContentItem" ci ON ci."id" = a."contentItemId" WHERE ${archived}`);
    assert.deepEqual(groups[0], { by: ["userId", "role"], where: { userId: { in: ["u1"] }, contentItem: { brand: { archived: false } } }, _count: { _all: true } });
  });
});

/* ------------------------------------------------------------ TABLERO -- */

test("tablero: con la época encendida, eliminar una columna no cuenta ni pide mover las tareas archivadas", async () => {
  const calls = [];
  const prisma = {
    taskColumn: { findUniqueOrThrow: async (args) => (calls.push(["column", args]), { name: "Listo", _count: { tasks: args.select._count.select.tasks === true ? 4 : 1 } }) },
    task: { count: async (args) => (calls.push(["count", args]), 4) },
  };
  const tasks = load("src/app/actions/tasks.ts", {
    "@/lib/prisma": { prisma },
    "@/lib/auth": { requireLevel: async () => ({ id: "owner", role: "OWNER" }), requirePermission: async () => assert.fail("no aplica"), LEVEL: { OWNER: 3, MEMBER: 1 } },
    "next/cache": { revalidatePath() {}, revalidateTag() {} },
    "next/navigation": NO_REDIRECT,
  });
  await off(async () => {
    assert.deepEqual(await tasks.revisarEliminacionColumna("c"), { name: "Listo", tasks: 4, archived: false });
    assert.deepEqual(calls, [["column", { where: { id: "c" }, select: { name: true, _count: { select: { tasks: true } } } }]], "apagada, la consulta de siempre");
  });
  calls.length = 0;
  await on(async () => {
    const info = await tasks.revisarEliminacionColumna("c");
    assert.equal(info.tasks, 1, "solo las que el tablero muestra");
    assert.equal(info.archived, true);
    assert.match(info.archivedMessage, /no se puede eliminar.*renómbrala/);
    assert.doesNotMatch(info.archivedMessage, /\d/, "no dice cuántas ocultas hay");
    const where = calls.find(([kind]) => kind === "column")[1].select._count.select.tasks.where;
    assert.deepEqual(where, { OR: [{ brand: { is: { archived: false } } }, { brandId: null, createdAt: { gte: new Date(EPOCH) } }] });
    assert.deepEqual(calls.find(([kind]) => kind === "count")[1], { where: { columnId: "c" } }, "el total real, sin filtro");
  });
});

/* ------------------------------------------------ POSTGRESQL (opcional) -- */

/**
 * Las mismas reglas contra PostgreSQL real: valida que Prisma acepta los filtros (relaciones
 * opcionales con `is`, pasos por su video) y que el SQL directo filtra lo que dice. Solo corre con
 * ARCHIVE_SCOPE_TEST_DATABASE_URL apuntando a una base local efímera «_test» ya migrada; sin ella
 * se salta (npm test no toca ninguna base).
 */
const PG_URL = process.env.ARCHIVE_SCOPE_TEST_DATABASE_URL;
const pgLocal = (() => { try { const url = new URL(PG_URL); return ["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname.endsWith("_test"); } catch { return false; } })();

test("PostgreSQL: apagado se ve todo como hoy; encendido nadie ve lo archivado y las guardas valen siempre", { skip: pgLocal ? false : "requiere ARCHIVE_SCOPE_TEST_DATABASE_URL (base local efímera _test)" }, async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { AsyncLocalStorage } = await import("node:async_hooks");
  const { randomUUID } = await import("node:crypto");
  const prisma = new PrismaClient({ datasourceUrl: PG_URL });
  const context = new AsyncLocalStorage();
  const mocks = {
    "@/lib/prisma": { prisma },
    "next/headers": { cookies: async () => ({ get: (key) => (context.getStore().has(key) ? { value: context.getStore().get(key) } : undefined), set: (key, value) => context.getStore().set(key, value), delete: (key) => context.getStore().delete(key) }), headers: async () => new Headers() },
    "next/cache": { revalidatePath() {}, revalidateTag() {} },
    "next/navigation": NO_REDIRECT,
  };
  const auth = load("src/lib/auth.ts", mocks), scopes = load("src/lib/access-scope.ts", mocks), live = load("src/lib/archive-scope.ts", mocks), policy = load("src/lib/permissions.ts", mocks);
  const steps = load("src/lib/production-scope.ts", mocks), maintenance = load("src/lib/maintenance.ts", { ...mocks, "@/lib/generation-dispatch": { dispatchGeneration: async () => true } });
  const assigned = [];
  const sweep = load("src/lib/production-sweep.ts", { ...mocks, "@/lib/domain/production-flow": { assignEditing: async (_tx, _actor, id) => { assigned.push(id); return { done: true }; } } });
  const jobs = load("src/lib/generation-jobs.ts", { ...mocks, "@/lib/ai": { generateScript: async () => assert.fail("la IA no se llama"), AiError: class extends Error {} } });

  // Época dos días atrás: lo «anterior» y lo «posterior» quedan en el pasado, como en producción.
  const epochIso = new Date(Date.now() - 2 * 86400000).toISOString();
  const before = new Date(Date.parse(epochIso) - 86400000), after = new Date(Date.parse(epochIso) + 3600000);
  const epochOn = (fn) => withEnv({ [EPOCH_ENV]: epochIso }, fn);
  const secret = "prueba-archivo-total-pg-".padEnd(48, "y");
  const actor = (id) => withEnv({ AUTH_SECRET: secret }, async () => {
    const jar = new Map();
    const { sessionVersion } = await prisma.user.findUniqueOrThrow({ where: { id } });
    await context.run(jar, () => auth.createSession(id, sessionVersion));
    return context.run(jar, () => auth.requireUser());
  });
  const ids = async (model, where) => (await prisma[model].findMany({ where, select: { id: true }, orderBy: { id: "asc" } })).map((row) => row.id);

  try {
    await prisma.brand.createMany({ data: [
      { id: "A", name: "Viva", slug: "archivo-viva", createdAt: after },
      { id: "X", name: "Archivada", slug: "archivo-archivada", archived: true, active: false, createdAt: before },
    ] });
    await prisma.user.createMany({ data: [
      { id: "owner", name: "Dueño", email: "owner@archivo.test", role: "OWNER", passwordHash: "fixture-only" },
      { id: "both", name: "Ambas", email: "both@archivo.test", role: "MEMBER", passwordHash: "fixture-only" },
      { id: "lost", name: "Solo archivada", email: "lost@archivo.test", role: "MEMBER", passwordHash: "fixture-only" },
    ] });
    await prisma.userWorkProfile.createMany({ data: ["both", "lost"].flatMap((userId) => ["STRATEGY", "WRITER"].map((profile) => ({ userId, profile }))) });
    await prisma.userBrandAccess.createMany({ data: [{ userId: "both", brandId: "A" }, { userId: "both", brandId: "X" }, { userId: "lost", brandId: "X" }] });
    const now = new Date();
    const shot = new Date(now.getTime() - 86400000);
    await prisma.contentItem.createMany({ data: [
      { id: "vA", brandId: "A", title: "Video vivo", scheduledDate: after, status: "APROBADO", shootDate: shot },
      { id: "vX", brandId: "X", title: "Video archivado", scheduledDate: before, status: "APROBADO", shootDate: shot },
    ] });
    await prisma.script.createMany({ data: [
      { id: "sA", title: "Guion vivo", brandId: "A" },
      { id: "sX", title: "Guion archivado", brandId: "X" },
      { id: "sOld", title: "Guion suelto viejo", createdAt: before },
      { id: "sNew", title: "Guion suelto nuevo", createdAt: after },
    ] });
    await prisma.taskColumn.createMany({ data: [{ id: "cG", name: "Global", order: 0 }, { id: "cA", name: "Viva", brandId: "A", order: 1 }, { id: "cX", name: "Archivada", brandId: "X", order: 2 }] });
    await prisma.task.createMany({ data: [
      { id: "tA", title: "Tarea viva", columnId: "cA", brandId: "A" },
      { id: "tX", title: "Tarea archivada", columnId: "cX", brandId: "X" },
      { id: "tOld", title: "Personal vieja", columnId: "cG", assigneeId: "both", createdAt: before },
      { id: "tNew", title: "Personal nueva", columnId: "cG", assigneeId: "both", createdAt: after },
    ] });
    await prisma.calendarEvent.createMany({ data: [
      { id: "eX", title: "Evento archivado", brandId: "X", startAt: after },
      { id: "eOld", title: "Evento personal viejo", startAt: after, createdById: "both", createdAt: before },
      { id: "eNew", title: "Evento personal nuevo", startAt: after, createdById: "both", createdAt: after },
    ] });
    await prisma.structure.create({ data: { id: "est", name: "Formato", slug: "archivo-formato" } });
    // Trabajos de otra persona: el Dueño ve el avance de todos y conserva sus 2 cupos de pendientes para encolar.
    const job = (id, payload, createdAt) => ({ id, userId: "both", sessionVersion: 0, requestKey: randomUUID(), fingerprint: id, payload: { request: "fixture", provider: "anthropic", ...payload }, status: "QUEUED", createdAt });
    await prisma.generationJob.createMany({ data: [
      job("jA", { brandId: "A" }, after), job("jX", { brandId: "X" }, before),
      job("jOld", {}, before), job("jNull", { brandId: null }, before), job("jNew", {}, after),
    ] });
    await prisma.$executeRaw`UPDATE "GenerationJob" SET "updatedAt" = ${new Date(now.getTime() - 3600000)}`;
    const liveJobs = async () => (await prisma.$queryRaw`SELECT j.id FROM "GenerationJob" j WHERE ${live.liveJobSql("j")} ORDER BY j.id`).map((row) => row.id);

    // Guardas siempre activas: recuperación, barrido y cola ignoran la marca archivada aunque la época esté apagada.
    for (const mode of [off, epochOn]) await mode(async () => {
      const stale = await maintenance.staleJobs(Date.now());
      assert.deepEqual(stale.map((row) => row.id), ["jNull", "jOld", "jA"], "los 3 más antiguos, sin el de la marca archivada");
      assigned.length = 0;
      const swept = await withEnv({ PRODUCTION_FLOW_ENABLED: "true", PRODUCTION_CHAIN_ENABLED: undefined }, () => sweep.runProductionSweep(25, now));
      assert.equal(swept.candidates, 1);
      assert.deepEqual(assigned, ["vA"]);
      const owner = await actor("owner");
      await withJobs(async () => {
        await assert.rejects(jobs.enqueueGeneration(owner, randomUUID(), ["est"], { brandId: "X", request: "fixture", provider: "anthropic" }), /La marca está archivada/);
      });
      assert.equal(await prisma.generationJob.count({ where: { userId: "owner" } }), 0, "no se registró ningún trabajo nuevo");
    });

    // Apagado: todo como hoy.
    await off(async () => {
      const both = await actor("both"), lost = await actor("lost"), owner = await actor("owner");
      assert.deepEqual(both.brandIds, ["A", "X"]);
      assert.deepEqual(lost.brandIds, ["X"]);
      assert.equal(policy.allows(lost, "scripts.generate"), true);
      assert.deepEqual(await ids("contentItem", scopes.contentScope(owner)), ["vA", "vX"]);
      assert.deepEqual(await ids("script", scopes.scriptScope(owner)), ["sA", "sNew", "sOld", "sX"]);
      assert.deepEqual(await ids("task", scopes.taskScope(both)), ["tA", "tNew", "tOld", "tX"]);
      assert.deepEqual(await ids("taskColumn", live.liveColumn()), ["cA", "cG", "cX"]);
      assert.deepEqual(await liveJobs(), ["jA", "jNew", "jNull", "jOld", "jX"]);
      assert.equal((await jobs.generationStatus(owner, "jX")).id, "jX");
    });

    // Encendido: nadie ve lo archivado ni lo personal anterior; las columnas globales siguen.
    await epochOn(async () => {
      const both = await actor("both"), lost = await actor("lost"), owner = await actor("owner");
      assert.deepEqual(both.brandIds, ["A"]);
      assert.deepEqual(lost.brandIds, []);
      assert.equal(policy.allows(lost, "scripts.generate"), false);
      assert.equal(policy.canAccessSection(lost, "generator"), false);
      assert.equal(policy.canAccessSection(lost, "profile"), true);
      assert.deepEqual(await ids("brand", scopes.brandScope(owner)), ["A"]);
      assert.deepEqual(await ids("contentItem", scopes.contentScope(owner)), ["vA"]);
      assert.deepEqual(await ids("contentItem", scopes.contentScope(both)), ["vA"]);
      assert.deepEqual(await ids("script", scopes.scriptScope(owner)), ["sA", "sNew"]);
      assert.deepEqual(await ids("task", scopes.taskScope(owner)), ["tA", "tNew"]);
      assert.deepEqual(await ids("task", scopes.taskScope(both)), ["tA", "tNew"]);
      assert.deepEqual(await ids("calendarEvent", scopes.eventScope(owner)), ["eNew"]);
      assert.deepEqual(await ids("taskColumn", live.liveColumn()), ["cA", "cG"], "la columna global sigue a la vista (T25)");
      assert.equal(await prisma.productionStep.count({ where: steps.productionStepScope(owner) }), 0);
      assert.deepEqual(await liveJobs(), ["jA", "jNew"]);
      assert.equal(await jobs.generationStatus(owner, "jX"), null);
      assert.equal((await jobs.generationStatus(owner, "jA")).id, "jA");
      assert.deepEqual(await live.liveBrandIds(prisma, ["X", "A"]), ["A"]);
      // Restaurar la marca (reversa de nivel 2) la devuelve con todo lo suyo, sin tocar nada más.
      await prisma.brand.update({ where: { id: "X" }, data: { archived: false, active: true } });
      assert.deepEqual((await actor("lost")).brandIds, ["X"]);
      assert.deepEqual(await ids("contentItem", scopes.contentScope(owner)), ["vA", "vX"]);
      assert.deepEqual(await liveJobs(), ["jA", "jNew", "jX"]);
      await prisma.brand.update({ where: { id: "X" }, data: { archived: true, active: false } });
    });
    // Equipo, Estructuras y el tablero (pantallas operativas del Dueño) cuentan solo lo vivo con la época encendida.
    await prisma.assignment.createMany({ data: [
      { contentItemId: "vA", userId: "both", role: "EDITOR" }, { contentItemId: "vX", userId: "both", role: "EDITOR" }, { contentItemId: "vX", userId: "lost", role: "ACTOR" },
    ] });
    await prisma.script.updateMany({ data: { structureId: "est" } });
    await prisma.taskColumn.create({ data: { id: "cV", name: "Vieja", order: 3 } });
    await prisma.task.create({ data: { id: "tV", title: "Personal en columna vieja", columnId: "cV", assigneeId: "both", createdAt: before } });
    const team = load("src/lib/team-participation.ts", mocks), teamList = load("src/lib/team-list.ts", mocks), board = load("src/app/actions/tasks.ts", mocks);
    // La misma consulta que la lista de /estructuras.
    const structureScripts = async () => {
      const epoch = live.archiveEpoch();
      return (await prisma.structure.findUniqueOrThrow({ where: { id: "est" }, include: { _count: { select: { scripts: epoch ? { where: live.liveScript(epoch) } : true } } } }))._count.scripts;
    };
    const asOwner = (fn) => withEnv({ AUTH_SECRET: secret }, async () => {
      const jar = new Map();
      const { sessionVersion } = await prisma.user.findUniqueOrThrow({ where: { id: "owner" } });
      await context.run(jar, () => auth.createSession("owner", sessionVersion));
      return context.run(jar, fn);
    });
    await off(async () => {
      const summary = await team.getTeamParticipation(["both", "lost"]);
      assert.deepEqual([summary.participation.get("both").videos, summary.participation.get("lost").videos, summary.totalAssignments], [2, 1, 3]);
      const stats = await teamList.getTeamStats();
      assert.deepEqual([stats.participants, stats.assignments], [2, 3]);
      assert.equal(await structureScripts(), 4);
      assert.deepEqual(await asOwner(() => board.revisarEliminacionColumna("cV")), { name: "Vieja", tasks: 1, archived: false });
      await assert.rejects(asOwner(() => board.eliminarColumna("cV")), /contiene 1 tareas, incluidas las ocultas por filtros/);
    });
    await epochOn(async () => {
      const summary = await team.getTeamParticipation(["both", "lost"]);
      assert.equal(summary.participation.get("both").videos, 1);
      assert.equal(summary.participation.get("both").roles.get("EDITOR"), 1);
      assert.equal(summary.participation.has("lost"), false, "solo participó en la marca archivada");
      assert.equal(summary.totalAssignments, 1);
      const stats = await teamList.getTeamStats();
      assert.deepEqual([stats.participants, stats.assignments], [1, 1]);
      assert.equal(await structureScripts(), 2, "sA y sNew: sin el de la marca archivada ni el suelto anterior");
      const vieja = await asOwner(() => board.revisarEliminacionColumna("cV"));
      assert.deepEqual([vieja.tasks, vieja.archived], [0, true]);
      assert.match(vieja.archivedMessage, /renómbrala/);
      const global = await asOwner(() => board.revisarEliminacionColumna("cG"));
      assert.deepEqual([global.tasks, global.archived], [1, true], "tNew a la vista; tOld guardada");
      await assert.rejects(asOwner(() => board.eliminarColumna("cV")), /guarda tareas archivadas/);
      await assert.rejects(asOwner(() => board.eliminarColumna("cG")), /contiene 1 tareas/);
    });
    assert.equal(await prisma.task.count({ where: { columnId: "cV" } }), 1, "el bloqueo protege la tarea archivada (CASCADE)");

    // Guarda siempre activa: el trabajo colgado de la marca archivada se cancela sin despacharlo y deja libre el cupo.
    assert.equal(await maintenance.closeArchivedJobs(Date.now()), 1);
    assert.equal((await prisma.generationJob.findUniqueOrThrow({ where: { id: "jX" } })).status, "CANCELLED");
    assert.deepEqual(await ids("generationJob", { status: "QUEUED" }), ["jA", "jNew", "jNull", "jOld"]);
    assert.equal(await maintenance.closeArchivedJobs(Date.now()), 0, "una segunda pasada no encuentra nada");

    // Ni el interruptor ni los filtros escriben: los accesos siguen intactos.
    assert.equal(await prisma.userBrandAccess.count(), 3);
  } finally {
    await prisma.$disconnect();
  }
});
