import assert from "node:assert/strict";
import { test } from "node:test";
import { load } from "./load-module.mjs";

/**
 * Formatos previstos (ContentItem.structureIds) y vínculo guion↔video desde el
 * generador. Se cargan las Server Actions reales con Prisma, auth y next
 * simulados; la auditoría es la real (audit.ts) sobre el mismo Prisma falso.
 *
 * La generación ya no ocurre en la petición: scripts.ts valida y registra un
 * trabajo (generation-jobs.ts) que crea los guiones en segundo plano y une el
 * primero al video con vincularGuionAVideo (generation-persist.ts). Aquí se
 * prueban esas tres piezas por separado, cada una contra su código real.
 */

const USER = { id: "u1", name: "Ana", role: "MEMBER", color: "#000", email: "ana@x.com" };
const REDIRECT = Symbol("redirect");

function fakePrisma(overrides = {}) {
  const calls = { updates: [], updateManys: [], creates: [], audits: [], jobUpdates: [] };
  const prisma = {
    $queryRaw: async () => [],
    structure: {
      findMany: async ({ where }) =>
        (where?.id?.in ?? [])
          .filter((id) => ["est-a", "est-b", "est-c"].includes(id))
          .map((id) => ({ id, name: `Estructura ${id}`, defaultDurationSec: 45 })),
      findUnique: async ({ where }) => ({ id: where.id, name: `Estructura ${where.id}`, defaultDurationSec: 45 }),
    },
    contentItem: {
      count: async ({ where }) => JSON.stringify(where).includes("closed-sentinel") ? 0 : overrides.video ? 1 : 0,
      findUniqueOrThrow: async () => overrides.video,
      findUnique: async () => overrides.video ?? null,
      // El generador busca la tarjeta dentro del alcance del usuario (findFirst con contentScope).
      findFirst: async () => overrides.video ?? null,
      update: async (args) => { calls.updates.push(args); return { id: args.where.id }; },
      // El vínculo guion↔video se escribe condicionado (scriptId: null); `updateManyCount`
      // simula que otra pestaña se adelantó (0) o que la tarjeta seguía libre (1).
      updateMany: async (args) => { calls.updateManys.push(args); return { count: overrides.updateManyCount ?? 1 }; },
      create: async (args) => { calls.creates.push(args); return { id: "copia-1", title: args.data.title, brandId: args.data.brandId, brand: { name: "Marca" } }; },
    },
    script: {
      findUnique: async () => overrides.script ?? null,
      create: async (args) => { calls.creates.push(args); return { id: "guion-1", title: args.data.title, brandId: args.data.brandId }; },
    },
    auditLog: { create: async ({ data }) => { calls.audits.push(data); return data; } },
    generationJob: { updateMany: async (args) => { calls.jobUpdates.push(args); return { count: 1 }; } },
  };
  return { prisma, calls };
}

/**
 * withMutation falso: ejecuta el trabajo sobre el mismo Prisma falso (hace de
 * `tx`) y, como el real, dispara los efectos (revalidar, redirect) solo después
 * de que el trabajo termine sin error. lockRevision no se comprueba aquí: la
 * revisión del formulario la cubre tests/postgres-permissions.test.mjs.
 */
function mutationsFalsas(prisma) {
  return {
    EDIT_CONFLICT: "conflicto",
    withMutation: async (_user, _owner, work) => {
      const effects = [];
      const result = await work(prisma, (effect) => effects.push(effect));
      for (const effect of effects) effect();
      return result;
    },
    lockRevision: async () => {},
  };
}

/** Permisos y alcance: la política real se prueba aparte; aquí todo pasa. */
const PERMISOS = {
  allows: () => true,
  assertPermission() {},
  assertBrandPermission() {},
  contentStatusCapability: () => "content.plan",
  checklistCapability: () => "content.plan",
  isFinalApproval: () => false,
};
const ALCANCE = {
  lockVideoLifecycle: async () => {},
  closedVideoWhere: { id: "closed-sentinel" },
  contentScope: () => ({}),
  scriptScope: () => ({}),
  brandScope: () => ({}),
  assertContentAccess: async () => {},
  assertScriptAccess: async () => {},
  assertVideoOpen: async () => {},
  assertAssignee: async () => {},
  assertPublishable: async () => {},
};

function mocks(prisma, extra = {}) {
  return {
    "next/cache": { revalidatePath() {} },
    "next/navigation": { redirect(url) { throw { [REDIRECT]: url }; }, notFound() { throw new Error("404"); } },
    "@/lib/prisma": { prisma },
    "@/lib/auth": {
      LEVEL: { MEMBER: 1, OWNER: 2 },
      requireLevel: async () => USER,
      requirePermission: async () => USER,
      requireUser: async () => USER,
      clientIp: async () => "127.0.0.1",
    },
    "@/lib/mutations": mutationsFalsas(prisma),
    "@/lib/permissions": PERMISOS,
    "@/lib/access-scope": ALCANCE,
    "@/lib/weekly-metric-mutations": { saveWeeklyMetric: async () => {} },
    "@/lib/assets-cleanup": { borrarAssetsDe: async () => {} },
    ...extra,
  };
}

function form(entries) {
  const fd = new FormData();
  for (const [k, v] of entries) fd.append(k, v);
  return fd;
}

const VIDEO = {
  updatedAt: new Date("2026-09-16T12:00:00Z"),
  id: "vid-1", title: "Tres errores al regalar", brandId: "marca-1", status: "IDEA", priority: "MEDIA",
  platforms: '["TIKTOK"]', structureIds: '["est-a"]', scheduledDate: new Date("2026-09-10T12:00:00Z"),
  scriptId: null, structureId: null, hook: null, cta: null, description: null, notes: null, tags: "[]",
  shootDate: null, publishedAt: null, publishedUrl: null, checklist: [], assignments: [],
  brand: { name: "Con Amor" }, script: null, structure: null,
};

test("actualizarVideo guarda solo los formatos que existen, en el orden en que llegan, y lo audita por columna", async () => {
  const { prisma, calls } = fakePrisma({ video: VIDEO });
  const content = load("src/app/actions/content.ts", mocks(prisma));
  await content.actualizarVideo(form([
    ["id", "vid-1"], ["title", "Tres errores al regalar"], ["structureIdsForm", "1"],
    ["structureIds", "est-b"], ["structureIds", "no-existe"], ["structureIds", "est-a"],
  ]));
  assert.equal(calls.updates[0].data.structureIds, '["est-b","est-a"]');
  const changes = JSON.parse(calls.audits[0].changes);
  assert.deepEqual(changes.structureIds, { etiqueta: "Formatos previstos", antes: '["est-a"]', despues: '["est-b","est-a"]' });
});

test("actualizarVideo conserva los formatos previos cuando el formulario no trae el picker", async () => {
  const { prisma, calls } = fakePrisma({ video: VIDEO });
  const content = load("src/app/actions/content.ts", mocks(prisma));
  await content.actualizarVideo(form([["id", "vid-1"], ["title", "Otro título"]]));
  assert.equal(calls.updates[0].data.structureIds, '["est-a"]');
  assert.equal(JSON.parse(calls.audits[0].changes).structureIds, undefined);
});

test("actualizarVideo vacía los formatos si el picker estaba y no quedó ninguna casilla", async () => {
  const { prisma, calls } = fakePrisma({ video: VIDEO });
  const content = load("src/app/actions/content.ts", mocks(prisma));
  await content.actualizarVideo(form([["id", "vid-1"], ["title", "Sin formatos"], ["structureIdsForm", "1"]]));
  assert.equal(calls.updates[0].data.structureIds, "[]");
});

test("crearVideo guarda los formatos previstos y duplicarVideo los copia", async () => {
  const { prisma, calls } = fakePrisma({ video: VIDEO });
  const content = load("src/app/actions/content.ts", mocks(prisma));
  await assert.rejects(
    content.crearVideo(form([["title", "Nueva idea"], ["brandId", "marca-1"], ["structureIdsForm", "1"], ["structureIds", "est-a"]])),
    (e) => e[REDIRECT] === "/contenido/copia-1",
  );
  assert.equal(calls.creates[0].data.structureIds, '["est-a"]');
  await assert.rejects(content.duplicarVideo(form([["id", "vid-1"]])), (e) => e[REDIRECT] === "/contenido/copia-1");
  assert.equal(calls.creates[1].data.structureIds, VIDEO.structureIds);
});

/* ------------------------------------------------------- GENERADOR (JOBS) -- */

const KEY = "11111111-1111-4111-8111-111111111111";
const BRIEF = [["estructuras", "est-a"], ["peticion", "Quiero un video que incomode"], ["producto", "Ramo"], ["proveedor", "anthropic"], ["requestKey", KEY]];

/** Lote de varios formatos: `estructuras` viaja como una sola lista separada por comas. */
function lote(...ids) {
  return BRIEF.map(([k, v]) => (k === "estructuras" ? [k, ids.join(",")] : [k, v]));
}

const NORMALIZAR = { normalizeSceneTimes: (scenes) => scenes.map((s) => ({ startSec: s.startSec, endSec: s.endSec })) };

/**
 * scripts.ts real con el registro y el despacho del trabajo simulados: lo que
 * se comprueba es qué decide la Server Action antes de registrar nada y con
 * qué datos registra el trabajo. vincularGuionAVideo es la real.
 */
function scriptsModule(prisma, { enqueue, dispatch } = {}) {
  const trabajos = [];
  const mod = load("src/app/actions/scripts.ts", mocks(prisma, {
    "@/lib/ai": NORMALIZAR,
    "@/lib/generation-jobs": {
      enqueueGeneration: enqueue ?? (async (user, requestKey, structureIds, input) => { trabajos.push({ user, requestKey, structureIds, input }); return "job-1"; }),
    },
    "@/lib/generation-dispatch": { dispatchGeneration: dispatch ?? (async () => true) },
  }));
  return { ...mod, trabajos };
}

test("generarGuion rechaza el video antes de registrar el trabajo: inexistente, ya vinculado, fuera de Idea/Guion o de otra marca", async () => {
  let scripts = scriptsModule(fakePrisma({ video: null }).prisma);
  let res = await scripts.generarGuion(null, form([...BRIEF, ["video", "vid-x"]]));
  assert.equal(res.error, "Ese video ya no existe o no tienes acceso a él.");
  assert.match(res.detail, /genera un guion suelto/);

  scripts = scriptsModule(fakePrisma({ video: { ...VIDEO, scriptId: "guion-viejo" } }).prisma);
  res = await scripts.generarGuion(null, form([...BRIEF, ["video", "vid-1"]]));
  assert.equal(res.error, "Ese video ya tiene un guion vinculado.");
  assert.equal(scripts.trabajos.length, 0, "no se registra ningún trabajo");

  // Publicado o cancelado: el mismo filtro que la lista del generador, antes de gastar la llamada.
  for (const [status, etiqueta] of [["PUBLICADO", "Publicado"], ["CANCELADO", "Cancelado"]]) {
    scripts = scriptsModule(fakePrisma({ video: { ...VIDEO, status } }).prisma);
    res = await scripts.generarGuion(null, form([...BRIEF, ["video", "vid-1"]]));
    assert.equal(res.error, "Ese video ya no admite guion.", status);
    assert.match(res.detail, new RegExp(`Está en ${etiqueta}: solo se vinculan tarjetas en Idea o Guion`));
    assert.equal(scripts.trabajos.length, 0);
  }

  // En Guion todavía admite guion, pero no uno escrito para otra marca.
  scripts = scriptsModule(fakePrisma({ video: { ...VIDEO, status: "GUION" } }).prisma);
  res = await scripts.generarGuion(null, form([...BRIEF, ["video", "vid-1"], ["marca", "otra-marca"]]));
  assert.equal(res.error, "La marca elegida no es la del video.");
  assert.match(res.detail, /«Tres errores al regalar», de Con Amor/);
  assert.equal(scripts.trabajos.length, 0);

  // Y lo de siempre, antes incluso de mirar el video.
  scripts = scriptsModule(fakePrisma({ video: VIDEO }).prisma);
  assert.equal((await scripts.generarGuion(null, form([["peticion", "x"], ["video", "vid-1"]]))).error, "Elige al menos una estructura antes de generar.");
  assert.equal((await scripts.generarGuion(null, form([["estructuras", "est-a"], ["video", "vid-1"]]))).error, "Cuéntale a la IA qué quieres en este video.");
  assert.equal(scripts.trabajos.length, 0);
});

test("generarGuion con video: toma su marca y registra el trabajo con contentItemId y ctaMode; en la petición no se escribe nada", async () => {
  const { prisma, calls } = fakePrisma({ video: VIDEO });
  const scripts = scriptsModule(prisma);

  const res = await scripts.generarGuion(null, form([
    ...lote("est-a", "est-b", "est-a"), ["video", "vid-1"], ["ctaModo", "comunidad"], ["duracion", "60"], ["modelo", "claude-sonnet-5"],
  ]));
  assert.deepEqual(res, { jobId: "job-1" });

  const [trabajo] = scripts.trabajos;
  assert.equal(trabajo.user.id, USER.id);
  assert.equal(trabajo.requestKey, KEY);
  assert.deepEqual(trabajo.structureIds, ["est-a", "est-b"], "sin repetidos, en el orden en que llegan");
  assert.equal(trabajo.input.brandId, "marca-1", "sin marca elegida se usa la del video");
  assert.equal(trabajo.input.contentItemId, "vid-1", "el trabajo sabe a qué tarjeta unir el primer guion");
  assert.equal(trabajo.input.ctaMode, "comunidad");
  assert.equal(trabajo.input.provider, "anthropic");
  assert.equal(trabajo.input.model, "claude-sonnet-5");
  assert.equal(trabajo.input.durationSec, 60);
  assert.equal(trabajo.input.request, "Quiero un video que incomode");
  assert.match(trabajo.input.productFocus, /^Producto\/Servicio: Ramo/);

  // La IA y el vínculo viven en el trabajo: la petición no crea guiones ni toca la tarjeta.
  assert.equal(calls.creates.length, 0);
  assert.equal(calls.updates.length, 0);
  assert.equal(calls.updateManys.length, 0);
  assert.equal(calls.audits.length, 0);

  // Guion suelto, con la marca elegida y sin modo: cierre de venta como siempre.
  const suelto = scriptsModule(prisma);
  assert.deepEqual(await suelto.generarGuion(null, form([...BRIEF, ["marca", "marca-9"]])), { jobId: "job-1" });
  assert.equal(suelto.trabajos[0].input.contentItemId, null);
  assert.equal(suelto.trabajos[0].input.ctaMode, "venta");
  assert.equal(suelto.trabajos[0].input.brandId, "marca-9");
  assert.equal(suelto.trabajos[0].input.durationSec, undefined);
  assert.equal(suelto.trabajos[0].input.model, undefined);
});

test("generarGuion devuelve el error legible del registro y, si el despacho falla, deja el trabajo en cola con aviso", async () => {
  const { prisma, calls } = fakePrisma({ video: VIDEO });
  const mensaje = "Ya tienes dos generaciones pendientes. Espera a que terminen o cancela una.";
  const rechazado = scriptsModule(prisma, { enqueue: async () => { throw new Error(mensaje); } });
  assert.deepEqual(await rechazado.generarGuion(null, form(BRIEF)), { error: mensaje });
  assert.equal(calls.jobUpdates.length, 0);

  const sinDespacho = scriptsModule(prisma, { dispatch: async () => { throw new Error("sin cupo de ejecuciones"); } });
  assert.deepEqual(await sinDespacho.generarGuion(null, form(BRIEF)), { jobId: "job-1" }, "el trabajo quedó registrado y se abre su avance");
  assert.deepEqual(calls.jobUpdates[0].where, { id: "job-1", status: "QUEUED" });
  assert.match(calls.jobUpdates[0].data.error, /quedó guardada, pero no pudo comenzar.*Mis generaciones/);
});

/* -------------------------------------------------------------- VINCULAR -- */

/** El guion recién creado por el trabajo, tal como lo vuelve a leer vincularGuionAVideo. */
const GUION = { id: "guion-1", title: "Guion est-a", structureId: "est-a", brandId: "marca-1", structure: { name: "Estructura A" } };

function persistModule(prisma) {
  return load("src/lib/generation-persist.ts", mocks(prisma, { "@/lib/ai": NORMALIZAR }));
}

test("vincularGuionAVideo escribe el vínculo condicionado (scriptId null): con count 1 audita ASIGNAR y pasa la tarjeta de Idea a Guion", async () => {
  const { prisma, calls } = fakePrisma({ video: VIDEO, script: GUION });
  const { vincularGuionAVideo } = persistModule(prisma);

  assert.equal((await vincularGuionAVideo(prisma, USER, "guion-1", "vid-1")).linked, true);
  // Una sola escritura, condicionada a que la tarjeta siga libre; nunca un update a ciegas.
  assert.equal(calls.updates.length, 0);
  assert.equal(calls.updateManys.length, 1);
  assert.deepEqual(calls.updateManys[0].where, { id: "vid-1", scriptId: null, status: { in: ["IDEA", "GUION"] }, updatedAt: VIDEO.updatedAt });
  assert.deepEqual(calls.updateManys[0].data, { scriptId: "guion-1", structureId: "est-a", status: "GUION" });

  const asignar = calls.audits.find((a) => a.action === "ASIGNAR");
  assert.equal(asignar.entity, "ContentItem");
  assert.equal(asignar.entityId, "vid-1");
  assert.equal(asignar.brandId, "marca-1");
  assert.match(asignar.summary, /Asignó el guion "Guion est-a" al video "Tres errores al regalar" y lo pasó a Guion/);
  const changes = JSON.parse(asignar.changes);
  assert.deepEqual(changes.status, { etiqueta: "Estado", antes: "IDEA", despues: "GUION", verAntes: "Idea", verDespues: "Guion" });
  assert.equal(changes.scriptId.antes, null);
  assert.equal(changes.scriptId.despues, "guion-1");
  assert.equal(changes.scriptId.verDespues, "Guion est-a");
  assert.equal(changes.structureId.despues, "est-a");
  assert.equal(changes.structureId.verDespues, "Estructura A");

  // Tarjeta que ya estaba en Guion: conserva su estado y el cambio de estado no se registra.
  const enGuion = fakePrisma({ video: { ...VIDEO, status: "GUION" }, script: GUION });
  assert.equal((await persistModule(enGuion.prisma).vincularGuionAVideo(enGuion.prisma, USER, "guion-1", "vid-1")).linked, true);
  assert.equal(enGuion.calls.updateManys[0].data.status, "GUION");
  assert.doesNotMatch(enGuion.calls.audits[0].summary, /lo pasó a Guion/);
  assert.equal(JSON.parse(enGuion.calls.audits[0].changes).status, undefined);

  // Un guion escrito para otra marca no se cuelga: ni escritura ni auditoría.
  const ajeno = fakePrisma({ video: VIDEO, script: { ...GUION, brandId: "marca-2" } });
  assert.equal((await persistModule(ajeno.prisma).vincularGuionAVideo(ajeno.prisma, USER, "guion-1", "vid-1")).linked, false);
  assert.equal(ajeno.calls.updateManys.length, 0);
  assert.equal(ajeno.calls.audits.length, 0);
});

test("vincularGuionAVideo no pisa un vínculo hecho mientras se generaba (count 0): devuelve false y no audita", async () => {
  // Otra pestaña asignó un guion a la tarjeta entre la comprobación y la escritura: updateMany no toca ninguna fila.
  const { prisma, calls } = fakePrisma({ video: VIDEO, script: GUION, updateManyCount: 0 });
  const { vincularGuionAVideo } = persistModule(prisma);
  assert.equal((await vincularGuionAVideo(prisma, USER, "guion-1", "vid-1")).linked, false);
  assert.equal(calls.updateManys.length, 1);
  assert.deepEqual(calls.updateManys[0].where, { id: "vid-1", scriptId: null, status: { in: ["IDEA", "GUION"] }, updatedAt: VIDEO.updatedAt });
  assert.equal(calls.audits.length, 0, "no se audita un vínculo que no se escribió");
});

/* ---------------------------------------------------- TRABAJO EN SEGUNDO PLANO -- */

/** El AiError falso: `code` es lo que mira esErrorDeAutenticacion para cortar el lote. */
class FakeAiError extends Error {
  constructor(message, detail, code, retryable = false) {
    super(message);
    this.name = "AiError";
    this.detail = detail;
    this.code = code;
    this.retryable = retryable;
    this.diagnostic = { provider: "Claude" };
  }
}

/** Con el que generation-jobs.ts marca los formatos que no llegó a intentar. */
const MOTIVO_CLAVE_RECHAZADA = "No se intentó: la clave fue rechazada. Corrige la clave en Ajustes y vuelve a generar solo este formato.";

function item(id, structureId, status, extra = {}) {
  return { id, structureId, status, order: 0, attempts: 0, error: null, response: null, leaseToken: null, leaseUntil: null, availableAt: new Date(0), inputTokens: 0, outputTokens: 0, ...extra };
}

/**
 * processGeneration real sobre un Prisma falso: la transacción es el propio
 * objeto, los bloqueos SQL no hacen nada y los items se actualizan en sitio
 * para que las comprobaciones de leaseToken del código real se cumplan.
 */
function jobFixture({ job, video, unido = false, generateScript }) {
  const base = fakePrisma({ video, script: GUION });
  const calls = { ...base.calls, itemUpdates: [], itemUpdateManys: [] };
  const aplicar = (fila, data) => {
    for (const [k, v] of Object.entries(data)) fila[k] = v && typeof v === "object" && "increment" in v ? fila[k] + v.increment : v;
  };
  const prisma = {
    ...base.prisma,
    $transaction: async (fn) => fn(prisma),
    $queryRaw: async () => [],
    $executeRaw: async () => 0,
    user: { findUnique: async () => ({ id: USER.id, name: USER.name, email: USER.email, role: "OWNER", color: USER.color, archetypeId: null, sessionVersion: 0, active: true, workProfiles: [], brandAccess: [] }) },
    usageCounter: { upsert: async () => ({}), updateMany: async () => ({ count: 1 }) },
    generationJob: {
      findUnique: async () => job,
      update: async (args) => { calls.jobUpdates.push(args); aplicar(job, args.data); return job; },
      updateMany: async (args) => { calls.jobUpdates.push(args); return { count: 1 }; },
    },
    generationItem: {
      update: async (args) => { calls.itemUpdates.push(args); aplicar(job.items.find((i) => i.id === args.where.id), args.data); return {}; },
      updateMany: async (args) => {
        calls.itemUpdateManys.push(args);
        // El código real filtra por status exacto ("RUNNING", "QUEUED") o por lista ({ in: [...] }).
        const status = args.where.status;
        const conEstado = (i) => (status === undefined ? true : typeof status === "string" ? i.status === status : status.in.includes(i.status));
        const filas = job.items.filter((i) => (args.where.id ? i.id === args.where.id : true) && conEstado(i));
        for (const fila of filas) aplicar(fila, args.data);
        return { count: filas.length };
      },
    },
    script: { ...base.prisma.script, count: async () => (unido ? 1 : 0) },
  };
  const mod = load("src/lib/generation-jobs.ts", mocks(prisma, {
    "@/lib/ai": { ...NORMALIZAR, AiError: FakeAiError, generateScript: (input, request) => request(() => generateScript ? generateScript(input) : assert.fail("la IA no debería llamarse en esta prueba")) },
    "@/lib/ai/providers": { esErrorDeAutenticacion: (e) => e instanceof FakeAiError && e.code === "auth", esErrorDeSaturacion: () => false },
    "@/lib/auth-transactions": { assertActor: async () => {} },
  }));
  return { ...mod, calls, job };
}

function jobBase(items, payload = {}) {
  return { id: "job-1", status: "RUNNING", userId: USER.id, sessionVersion: 0, createdAt: new Date(), runId: null, error: null, items,
    payload: { provider: "anthropic", request: "Quiero un video que incomode", brandId: "marca-1", contentItemId: "vid-1", ...payload } };
}

/** El trabajo solo corre con la bandera puesta; se deja como estaba al salir. */
async function conJobs(fn) {
  const antes = process.env.AI_JOBS_ENABLED;
  const warn = console.warn;
  process.env.AI_JOBS_ENABLED = "true";
  console.warn = () => {};
  try { await fn(); } finally {
    if (antes === undefined) delete process.env.AI_JOBS_ENABLED; else process.env.AI_JOBS_ENABLED = antes;
    console.warn = warn;
  }
}

test("el trabajo terminado avisa cuando el guion se creó pero la tarjeta ya había recibido otro guion mientras se generaba", () => conJobs(async () => {
  // El único item ya está COMPLETED: processGeneration cierra el lote y redacta el aviso final.
  let f = jobFixture({ job: jobBase([item("it-1", "est-a", "COMPLETED")]), video: { ...VIDEO, scriptId: "guion-ajeno" } });
  assert.deepEqual(await f.processGeneration("job-1"), { done: true, retryAt: undefined });
  assert.equal(f.calls.jobUpdates.at(-1).data.status, "COMPLETED");
  assert.equal(
    f.calls.jobUpdates.at(-1).data.error,
    "El guion se creó, pero no quedó unido al video «Tres errores al regalar»: la tarjeta ya recibió otro guion mientras se generaba. Si hace falta, asígnalo desde la ficha del guion."
  );

  // Si el guion del video salió de este mismo trabajo, no hay nada que avisar.
  f = jobFixture({ job: jobBase([item("it-1", "est-a", "COMPLETED")]), video: { ...VIDEO, scriptId: "guion-1" }, unido: true });
  await f.processGeneration("job-1");
  assert.deepEqual(f.calls.jobUpdates.at(-1).data, { status: "COMPLETED" });

  // Tarjeta borrada mientras tanto: el guion queda suelto y se dice.
  f = jobFixture({ job: jobBase([item("it-1", "est-a", "COMPLETED")]), video: null });
  await f.processGeneration("job-1");
  assert.match(f.calls.jobUpdates.at(-1).data.error, /no quedó unido al video pedido porque la tarjeta ya no existe/);
}));

test("la clave rechazada corta el lote: el formato falla sin reintento, los pendientes se anotan y el aviso final los nombra", () => conJobs(async () => {
  const f = jobFixture({
    job: jobBase([item("it-1", "est-a", "COMPLETED"), item("it-2", "est-b", "QUEUED", { order: 1 }), item("it-3", "est-c", "QUEUED", { order: 2 })]),
    video: { ...VIDEO, scriptId: "guion-1" }, unido: true,
    generateScript: async () => { throw new FakeAiError("La clave de Claude fue rechazada: está revocada o mal copiada.", "Revísala en Ajustes.", "auth"); },
  });
  assert.deepEqual(await f.processGeneration("job-1"), { done: false });
  const [it1, it2, it3] = f.job.items;
  assert.equal(it1.status, "COMPLETED", "lo ya creado se conserva");
  assert.equal(it2.status, "FAILED", "con la clave rechazada no se reintenta aunque queden intentos");
  assert.equal(it2.error, "La clave de Claude fue rechazada: está revocada o mal copiada.");
  assert.equal(it2.attempts, 1);
  assert.equal(it3.status, "FAILED", "el siguiente formato no se intenta");
  assert.equal(it3.error, MOTIVO_CLAVE_RECHAZADA);

  // La siguiente vuelta del workflow cierra el lote como PARTIAL con el aviso completo.
  assert.deepEqual(await f.processGeneration("job-1"), { done: true, retryAt: undefined });
  assert.equal(f.calls.jobUpdates.at(-1).data.status, "PARTIAL");
  assert.equal(
    f.calls.jobUpdates.at(-1).data.error,
    "Se generaron 1 de 3. Falló «Estructura est-b»: revisa el detalle de cada formato; no se intentó «Estructura est-c» porque la clave fue rechazada."
  );
}));

test("un fallo reintentable se vuelve a encolar con espera y la cuota se cobra por intento; sin AI_JOBS_ENABLED el trabajo se cancela", async () => {
  await conJobs(async () => {
    const f = jobFixture({
      job: jobBase([item("it-1", "est-a", "QUEUED")]), video: VIDEO,
      generateScript: async () => { throw new FakeAiError("Claude está limitando las peticiones.", undefined, "quota", true); },
    });
    assert.deepEqual(await f.processGeneration("job-1"), { done: false });
    const [it1] = f.job.items;
    assert.equal(it1.status, "QUEUED");
    assert.equal(it1.attempts, 1);
    assert.equal(it1.leaseToken, null);
    assert.ok(it1.availableAt.getTime() > Date.now() + 20_000, "espera 30 s antes del segundo intento");
  });

  const f = jobFixture({ job: jobBase([item("it-1", "est-a", "QUEUED")]), video: VIDEO });
  const antes = process.env.AI_JOBS_ENABLED;
  delete process.env.AI_JOBS_ENABLED;
  try {
    assert.deepEqual(await f.processGeneration("job-1"), { done: true, retryAt: undefined });
    assert.equal(f.job.status, "CANCELLED");
    assert.equal(f.job.items[0].status, "CANCELLED");
  } finally {
    if (antes !== undefined) process.env.AI_JOBS_ENABLED = antes;
  }
});

/* ------------------------------------------------- DESDE LA FICHA DEL GUION -- */

test("asignarGuionAVideo avisa con un error legible si el video ya tiene guion o es de otra marca; si no, usa el mismo vínculo condicionado", async () => {
  const PROPIO = { id: "g", title: "Propio", structureId: "est-b", brandId: "marca-1", structure: { name: "B" } };
  const pedido = form([["scriptId", "g"], ["contentItemId", "vid-1"]]);

  const ocupado = fakePrisma({ video: { ...VIDEO, scriptId: "guion-viejo" }, script: PROPIO });
  await assert.rejects(
    scriptsModule(ocupado.prisma).asignarGuionAVideo(pedido),
    { message: "Ese video ya tiene un guion vinculado. Quítalo desde su ficha si quieres cambiarlo." }
  );
  assert.equal(ocupado.calls.updateManys.length, 0);
  assert.equal(ocupado.calls.audits.length, 0);

  const otra = fakePrisma({ video: VIDEO, script: { ...PROPIO, brandId: "marca-2" } });
  await assert.rejects(scriptsModule(otra.prisma).asignarGuionAVideo(pedido), /misma marca/);
  assert.equal(otra.calls.updateManys.length, 0);

  const misma = fakePrisma({ video: { ...VIDEO, status: "GUION" }, script: PROPIO });
  await scriptsModule(misma.prisma).asignarGuionAVideo(pedido);
  assert.deepEqual(misma.calls.updateManys[0].where, { id: "vid-1", scriptId: null, status: { in: ["IDEA", "GUION"] }, updatedAt: VIDEO.updatedAt });
  assert.deepEqual(misma.calls.updateManys[0].data, { scriptId: "g", structureId: "est-b", status: "GUION" });
  const changes = JSON.parse(misma.calls.audits[0].changes);
  assert.equal(misma.calls.audits[0].action, "ASIGNAR");
  assert.equal(changes.status, undefined, "si el estado no cambia, no se registra");
  assert.equal(changes.scriptId.antes, null);

  // Si la tarjeta recibió otro guion entre la ficha y el envío, no se escribe, no se audita y se pide recargar.
  const tarde = fakePrisma({ video: VIDEO, updateManyCount: 0, script: PROPIO });
  await assert.rejects(scriptsModule(tarde.prisma).asignarGuionAVideo(pedido), /el video cambió mientras se vinculaba/);
  assert.equal(tarde.calls.updateManys.length, 1);
  assert.equal(tarde.calls.audits.length, 0);
});
