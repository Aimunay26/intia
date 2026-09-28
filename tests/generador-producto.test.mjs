import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { load } from "./load-module.mjs";

/**
 * Producto del catálogo en el generador (PRODUCT_CATALOG_ENABLED).
 *
 * - generarGuion (scripts.ts real): con el flag y una ficha, el texto del
 *   producto sale de la base de datos filtrada por la marca, con su revisión;
 *   apagado, o sin ficha, el pedido es exactamente el de siempre.
 * - enqueueGeneration (generation-jobs.ts real): los ids solo entran al
 *   payload si vienen, se comprueba que sean de la marca y la huella de los
 *   pedidos sin ids no cambia.
 * Prisma, auth y next van simulados, como en content-structure-ids.test.mjs.
 */

const USER = { id: "u1", name: "Ana", role: "MEMBER", color: "#000", email: "ana@x.com", brandIds: ["marca-1"] };
const KEY = "11111111-1111-4111-8111-111111111111";
const REVISION = new Date("2026-09-28T10:00:00.000Z");
const MENSAJE_REVISION = "El producto cambió mientras preparabas el guion. Recarga para usar la versión nueva.";

/** Lo que el cliente manda como texto: con una ficha elegida, el nombre no cuenta. */
const BRIEF = [
  ["estructuras", "est-a"], ["peticion", "Quiero un video que incomode"], ["marca", "marca-1"],
  ["producto", "Nombre inventado por el cliente"], ["productoDetalle", "Algodón peinado, estampado a mano en Lima."],
  ["proveedor", "anthropic"], ["requestKey", KEY],
];

/** Filas tal como las devuelve el select del catálogo (CATALOG_PRODUCT_SELECT). */
const POLERA = {
  id: "prod-1", brandId: "marca-1", kind: "PRODUCTO", name: "Polera Chimuelo",
  aiNotes: "Polera de algodón con Chimuelo estampado.", features: '["Algodón peinado","Tallas S a XL"]',
  benefits: '["Regalo que se usa todos los días"]', objections: '["¿Destiñe? No: tinta al agua curada"]',
  priceLabel: "S/ 89", active: true, sortOrder: 0, updatedAt: REVISION,
};
const TAZA = { ...POLERA, id: "prod-2", name: "Taza mágica", features: '["Cambia de color con calor"]', benefits: "[]", objections: "[]", priceLabel: "S/ 35" };
const AJENA = { ...POLERA, id: "prod-9", brandId: "marca-2", name: "Polera de otra marca" };
const PACK = {
  id: "combo-1", brandId: "marca-1", kind: "PRODUCTO", name: "Pack Cumpleaños", aiNotes: "", priceLabel: "S/ 120",
  active: true, sortOrder: 0, updatedAt: REVISION,
  items: [{ productId: "prod-1", quantity: 2, product: POLERA }, { productId: "prod-2", quantity: 1, product: TAZA }],
};

/** Las claves que generarGuion manda hoy a enqueueGeneration, en su orden. */
const CLAVES_DE_SIEMPRE = [
  "brandId", "archetypeId", "request", "productFocus", "variantHint", "durationSec", "provider", "model",
  "cta", "creativeAngle", "ctaMode", "ctaTrigger", "ctaActionType", "ctaDetail", "contentItemId",
];

function form(entries) {
  const fd = new FormData();
  for (const [k, v] of entries) fd.append(k, v);
  return fd;
}

/** Permisos y alcance: la política real se prueba aparte; aquí todo pasa. */
function mocks(prisma, extra = {}) {
  return {
    "next/cache": { revalidatePath() {} },
    "next/navigation": { redirect(url) { throw new Error(`redirect ${url}`); }, notFound() { throw new Error("404"); } },
    "@/lib/prisma": { prisma },
    "@/lib/auth": {
      LEVEL: { MEMBER: 1, OWNER: 2 },
      requireLevel: async () => USER,
      requirePermission: async () => USER,
      requireUser: async () => USER,
      clientIp: async () => "127.0.0.1",
    },
    "@/lib/mutations": { EDIT_CONFLICT: "conflicto", withMutation: async (_u, _o, work) => work(prisma, () => {}), lockRevision: async () => {} },
    "@/lib/permissions": {
      allows: () => true, assertPermission() {}, assertBrandPermission() {},
      contentStatusCapability: () => "content.plan", checklistCapability: () => "content.plan", isFinalApproval: () => false,
    },
    "@/lib/access-scope": {
      lockVideoLifecycle: async () => {}, closedVideoWhere: { id: "closed-sentinel" },
      contentScope: () => ({}), scriptScope: () => ({}), brandScope: () => ({}), generationScope: () => ({}),
      assertContentAccess: async () => {}, assertScriptAccess: async () => {}, assertVideoOpen: async () => {},
      assertAssignee: async () => {}, assertPublishable: async () => {},
    },
    "@/lib/weekly-metric-mutations": { saveWeeklyMetric: async () => {} },
    "@/lib/assets-cleanup": { borrarAssetsDe: async () => {} },
    ...extra,
  };
}

/** El flag se pone o se quita solo durante la prueba y se deja como estaba. */
async function conFlag(nombre, valor, fn) {
  const antes = process.env[nombre];
  if (valor === undefined) delete process.env[nombre]; else process.env[nombre] = valor;
  try { return await fn(); } finally {
    if (antes === undefined) delete process.env[nombre]; else process.env[nombre] = antes;
  }
}
const conCatalogo = (valor, fn) => conFlag("PRODUCT_CATALOG_ENABLED", valor, fn);

/* ------------------------------------------------------------ GENERAR GUION -- */

/** Prisma del catálogo: findFirst respeta id, marca y activo, como la consulta real. */
function catalogoFalso({ productos = [POLERA, TAZA, AJENA], combos = [PACK] } = {}) {
  const calls = { productos: [], combos: [] };
  const coincide = (fila, where) => fila.id === where.id && fila.brandId === where.brandId && (where.active === undefined || fila.active === where.active);
  const prisma = {
    $queryRaw: async () => [],
    contentItem: { findFirst: async () => null },
    brandProduct: { findFirst: async ({ where }) => { calls.productos.push(where); return productos.find((f) => coincide(f, where)) ?? null; } },
    brandCombo: { findFirst: async ({ where }) => { calls.combos.push(where); return combos.find((f) => coincide(f, where)) ?? null; } },
    generationJob: { updateMany: async () => ({ count: 1 }) },
  };
  return { prisma, calls };
}

/** scripts.ts real con el registro y el despacho simulados: se mira con qué datos registra el trabajo. */
function scriptsModule(prisma) {
  const trabajos = [];
  const mod = load("src/app/actions/scripts.ts", mocks(prisma, {
    "@/lib/ai": { normalizeSceneTimes: (scenes) => scenes },
    "@/lib/generation-jobs": { enqueueGeneration: async (user, requestKey, structureIds, input) => { trabajos.push({ user, requestKey, structureIds, input }); return "job-1"; } },
    "@/lib/generation-dispatch": { dispatchGeneration: async () => true },
  }));
  return { ...mod, trabajos };
}

const conFicha = (id, extra = []) => [...BRIEF, ["productoId", id], ["comboId", ""], ["productoRevision", REVISION.toISOString()], ["productoTipo", "SERVICIO"], ...extra];
const conCombo = (id, extra = []) => [...BRIEF, ["productoId", ""], ["comboId", id], ["productoRevision", REVISION.toISOString()], ["productoTipo", "PRODUCTO"], ...extra];

test("con el catálogo y una ficha, productFocus sale de la base de datos (no del texto del cliente) y lleva Tipo:", () => conCatalogo("true", async () => {
  const { prisma, calls } = catalogoFalso();
  const scripts = scriptsModule(prisma);
  assert.deepEqual(await scripts.generarGuion(null, form(conFicha("prod-1"))), { jobId: "job-1" });

  assert.deepEqual(calls.productos, [{ id: "prod-1", brandId: "marca-1", active: true }], "filtra por la marca ya decidida y solo activos");
  const { input } = scripts.trabajos[0];
  assert.match(input.productFocus, /^Producto\/Servicio: Polera Chimuelo\n/);
  assert.match(input.productFocus, /\nTipo: Producto físico/, "el tipo es el de la ficha, no el productoTipo del cliente");
  assert.match(input.productFocus, /\nPrecio: S\/ 89/);
  assert.match(input.productFocus, /\nCaracterísticas: Algodón peinado · Tallas S a XL/);
  assert.match(input.productFocus, /\nObjeciones que resuelve: ¿Destiñe\?/);
  assert.match(input.productFocus, /\n\nDetalle y descripción profunda:\nAlgodón peinado, estampado a mano en Lima\.$/, "lo que debe saber la IA viene del formulario (pre-llenado y editable)");
  assert.doesNotMatch(input.productFocus, /Nombre inventado/);
  assert.equal(input.productId, "prod-1");
  assert.equal("comboId" in input, false);
}));

test("con un combo, el texto dice qué incluye y suma las listas de sus productos", () => conCatalogo("true", async () => {
  const { prisma, calls } = catalogoFalso();
  const scripts = scriptsModule(prisma);
  assert.deepEqual(await scripts.generarGuion(null, form(conCombo("combo-1"))), { jobId: "job-1" });

  assert.deepEqual(calls.combos, [{ id: "combo-1", brandId: "marca-1", active: true }]);
  assert.equal(calls.productos.length, 0);
  const { input } = scripts.trabajos[0];
  assert.match(input.productFocus, /^Producto\/Servicio: Pack Cumpleaños\nTipo: Producto físico/);
  assert.match(input.productFocus, /\nIncluye: 2× Polera Chimuelo, 1× Taza mágica/);
  assert.match(input.productFocus, /\nCaracterísticas: Algodón peinado · Tallas S a XL · Cambia de color con calor/);
  assert.equal(input.comboId, "combo-1");
  assert.equal("productId" in input, false);
}));

test("una ficha de otra marca, archivada o sin marca se rechaza antes de registrar el trabajo", () => conCatalogo("true", async () => {
  const { prisma, calls } = catalogoFalso({ productos: [POLERA, AJENA, { ...TAZA, active: false }] });
  const scripts = scriptsModule(prisma);

  let res = await scripts.generarGuion(null, form(conFicha("prod-9")));
  assert.equal(res.error, "Ese producto ya no está en el catálogo de la marca.");
  assert.deepEqual(calls.productos.at(-1), { id: "prod-9", brandId: "marca-1", active: true }, "se busca en la marca del pedido, no en la de la ficha");

  res = await scripts.generarGuion(null, form(conFicha("prod-2")));
  assert.equal(res.error, "Ese producto ya no está en el catálogo de la marca.", "archivada");

  res = await scripts.generarGuion(null, form(conCombo("combo-x")));
  assert.equal(res.error, "Ese combo ya no está en el catálogo de la marca.");

  const sinMarca = conFicha("prod-1").filter(([k]) => k !== "marca");
  res = await scripts.generarGuion(null, form(sinMarca));
  assert.equal(res.error, "Elige la marca del producto antes de generar.");

  assert.equal(scripts.trabajos.length, 0, "no se registra ningún trabajo");
}));

test("si la ficha cambió después de abrir el generador, se pide recargar", () => conCatalogo("true", async () => {
  const { prisma } = catalogoFalso();
  const scripts = scriptsModule(prisma);
  const otraRevision = (entries) => entries.map(([k, v]) => [k, k === "productoRevision" ? "2026-09-27T09:00:00.000Z" : v]);

  assert.deepEqual(await scripts.generarGuion(null, form(otraRevision(conFicha("prod-1")))), { error: MENSAJE_REVISION });
  assert.deepEqual(await scripts.generarGuion(null, form(otraRevision(conCombo("combo-1")))), { error: MENSAJE_REVISION });
  const sinRevision = conFicha("prod-1").filter(([k]) => k !== "productoRevision");
  assert.deepEqual(await scripts.generarGuion(null, form(sinRevision)), { error: MENSAJE_REVISION });
  assert.equal(scripts.trabajos.length, 0);
}));

test("con el flag apagado (o sin ficha) el pedido es el de siempre: sin productId ni comboId y sin leer el catálogo", async () => {
  const esperado = "Producto/Servicio: Nombre inventado por el cliente\n\nDetalle y descripción profunda:\nAlgodón peinado, estampado a mano en Lima.";
  const pedidos = [];
  for (const valor of [undefined, "false", "1"]) {
    await conCatalogo(valor, async () => {
      const { prisma, calls } = catalogoFalso();
      const scripts = scriptsModule(prisma);
      await scripts.generarGuion(null, form(BRIEF));
      await scripts.generarGuion(null, form(conFicha("prod-1")));
      await scripts.generarGuion(null, form(conCombo("combo-1")));
      assert.equal(calls.productos.length + calls.combos.length, 0, `PRODUCT_CATALOG_ENABLED=${valor}: no se consultan las tablas nuevas`);
      pedidos.push(...scripts.trabajos.map((t) => t.input));
    });
  }
  // Encendido pero sin ficha elegida ni tipo: el mismo camino de texto libre.
  await conCatalogo("true", async () => {
    const { prisma, calls } = catalogoFalso();
    const scripts = scriptsModule(prisma);
    await scripts.generarGuion(null, form([...BRIEF, ["productoId", ""], ["comboId", ""], ["productoRevision", ""], ["productoTipo", ""]]));
    assert.equal(calls.productos.length + calls.combos.length, 0);
    pedidos.push(scripts.trabajos[0].input);
  });

  assert.equal(pedidos.length, 10);
  for (const input of pedidos) {
    assert.deepEqual(Object.keys(input), CLAVES_DE_SIEMPRE);
    assert.deepEqual(input, pedidos[0]);
  }
  assert.equal(pedidos[0].productFocus, esperado);
});

test("con el catálogo y texto libre, el tipo elegido en «Cargar un nuevo producto» llega a la IA como línea Tipo:", async () => {
  const conTipo = (tipo) => [...BRIEF, ["productoId", ""], ["comboId", ""], ["productoRevision", ""], ["productoTipo", tipo]];
  await conCatalogo("true", async () => {
    const { prisma, calls } = catalogoFalso();
    const scripts = scriptsModule(prisma);
    assert.deepEqual(await scripts.generarGuion(null, form(conTipo("PRODUCTO"))), { jobId: "job-1" });
    assert.equal(calls.productos.length + calls.combos.length, 0, "sin ficha no se lee el catálogo");
    const { input } = scripts.trabajos[0];
    assert.equal(
      input.productFocus,
      "Producto/Servicio: Nombre inventado por el cliente\nTipo: Producto físico (no es un servicio: no hables de cupos de atención, agenda ni asesorías)\n\nDetalle y descripción profunda:\nAlgodón peinado, estampado a mano en Lima.",
    );
    assert.deepEqual(Object.keys(input), CLAVES_DE_SIEMPRE, "sin productId ni comboId");

    // Un tipo que no es del catálogo no cuenta.
    await scripts.generarGuion(null, form(conTipo("OTRO")));
    assert.doesNotMatch(scripts.trabajos[1].input.productFocus, /\nTipo:/);
  });
  // Apagado, el tipo del cliente no cambia nada.
  await conCatalogo(undefined, async () => {
    const { prisma } = catalogoFalso();
    const scripts = scriptsModule(prisma);
    await scripts.generarGuion(null, form(conTipo("PRODUCTO")));
    assert.doesNotMatch(scripts.trabajos[0].input.productFocus, /\nTipo:/);
  });
});

test("con una ficha, un detalle más largo que «Qué debe saber la IA» se rechaza en vez de cortarse", () => conCatalogo("true", async () => {
  const { prisma } = catalogoFalso();
  const scripts = scriptsModule(prisma);
  const largo = conFicha("prod-1").map(([k, v]) => [k, k === "productoDetalle" ? "x".repeat(3001) : v]);
  assert.deepEqual(await scripts.generarGuion(null, form(largo)), { error: '"Qué debe saber la IA" admite hasta 3000 caracteres (tiene 3001).' });
  assert.equal(scripts.trabajos.length, 0);
}));

test("un combo con un producto archivado no se usa para generar", () => conCatalogo("true", async () => {
  const { prisma } = catalogoFalso({ combos: [{ ...PACK, items: [PACK.items[0], { ...PACK.items[1], product: { ...TAZA, active: false } }] }] });
  const scripts = scriptsModule(prisma);
  const res = await scripts.generarGuion(null, form(conCombo("combo-1")));
  assert.equal(res.error, "Ese combo incluye un producto archivado.");
  assert.match(res.detail, /Taza mágica/);
  assert.equal(scripts.trabajos.length, 0);
}));

/* ---------------------------------------------------------------- LA COLA -- */

/**
 * generation-jobs.ts real: la transacción es el propio objeto y los bloqueos
 * no hacen nada. brandProduct/brandCombo.count respetan id y marca.
 */
function colaFalsa({ productos = [POLERA, AJENA], combos = [PACK], fuente = null } = {}) {
  const calls = { jobs: [], productos: [], combos: [] };
  const cuenta = (filas, lista) => async ({ where }) => { lista.push(where); return filas.filter((f) => f.id === where.id && f.brandId === where.brandId).length; };
  const tx = {
    $executeRaw: async () => 0,
    $queryRaw: async () => [],
    generationJob: {
      // lockJob pide el trabajo de origen con sus items; lo demás (requestKey, reintento previo) no existe.
      findUnique: async (args) => (args.include ? fuente : null),
      // Con AND es la comprobación de alcance del origen; sin él, las generaciones activas del usuario.
      count: async ({ where }) => (where.AND ? 1 : 0),
      create: async ({ data }) => { calls.jobs.push(data); return { id: data.id ?? "job-nuevo" }; },
    },
    generationItem: { findMany: async () => (fuente?.items ?? []).filter((i) => i.status === "FAILED").map((i) => ({ structureId: i.structureId })) },
    structure: { count: async ({ where }) => where.id.in.length },
    brand: { count: async () => 1 },
    archetype: { count: async () => 1 },
    brandProduct: { count: cuenta(productos, calls.productos) },
    brandCombo: { count: cuenta(combos, calls.combos) },
    usageCounter: { upsert: async () => ({}) },
    auditLog: { create: async ({ data }) => data },
  };
  const prisma = { ...tx, $transaction: async (fn) => fn(tx) };
  const mod = load("src/lib/generation-jobs.ts", mocks(prisma, {
    "@/lib/ai": { normalizeSceneTimes: (s) => s, AiError: class extends Error {}, generateScript: async () => assert.fail("la IA no se llama al encolar") },
    "@/lib/ai/providers": { esErrorDeAutenticacion: () => false, esErrorDeSaturacion: () => false },
    "@/lib/auth-transactions": { assertActor: async () => {} },
    "@/lib/settings": {
      aiStatus: async () => ({ anthropic: { configured: true }, google: { configured: true } }),
      getSettings: async () => ({}),
      SETTING_KEYS: { defaultGoogleModel: "defaultGoogleModel", defaultAnthropicModel: "defaultAnthropicModel" },
    },
  }));
  return { ...mod, calls };
}

/** La cola solo registra con AI_JOBS_ENABLED; la traza de cada etapa se calla durante la prueba. */
const conJobs = (fn) => conFlag("AI_JOBS_ENABLED", "true", async () => {
  const { info, warn } = console;
  console.info = () => {};
  console.warn = () => {};
  try { return await fn(); } finally { Object.assign(console, { info, warn }); }
});

/** Un pedido de hoy, con las claves en el orden de payloadSchema: así JSON.stringify(input) es el payload validado. */
const PEDIDO = {
  brandId: "marca-1", archetypeId: null, request: "Quiero un video que incomode", productFocus: "Producto/Servicio: Ramo",
  variantHint: "", durationSec: 45, provider: "anthropic", cta: "Comenta QUIERO", creativeAngle: "", ctaTrigger: "escasez",
  ctaActionType: "comentar", ctaDetail: "", contentItemId: null, ctaMode: "venta",
};
const huella = (structureIds, payload) => createHash("sha256").update(JSON.stringify({ structureIds, payload })).digest("hex");

test("la huella de un pedido sin productId ni comboId es la de siempre, aunque lleguen como undefined", () => conJobs(async () => {
  const cola = colaFalsa();
  await cola.enqueueGeneration(USER, KEY, ["est-a"], PEDIDO);
  await cola.enqueueGeneration(USER, "22222222-2222-4222-8222-222222222222", ["est-a"], { ...PEDIDO, productId: undefined, comboId: undefined });

  const [sinIds, conUndefined] = cola.calls.jobs;
  assert.equal(sinIds.fingerprint, huella(["est-a"], PEDIDO));
  assert.equal(conUndefined.fingerprint, sinIds.fingerprint);
  assert.deepEqual(sinIds.payload, PEDIDO);
  assert.equal("productId" in sinIds.payload || "comboId" in sinIds.payload, false);
  assert.equal(cola.calls.productos.length + cola.calls.combos.length, 0, "sin ids no se consultan las tablas del catálogo");
}));

test("con una ficha de la marca, el id entra al payload y a la huella; de otra marca o sin marca, no se encola", () => conCatalogo("true", () => conJobs(async () => {
  let cola = colaFalsa();
  await cola.enqueueGeneration(USER, KEY, ["est-a"], { ...PEDIDO, productId: "prod-1" });
  await cola.enqueueGeneration(USER, "33333333-3333-4333-8333-333333333333", ["est-a"], { ...PEDIDO, comboId: "combo-1" });
  assert.deepEqual(cola.calls.productos, [{ id: "prod-1", brandId: "marca-1" }]);
  assert.deepEqual(cola.calls.combos, [{ id: "combo-1", brandId: "marca-1" }]);
  const [producto, combo] = cola.calls.jobs;
  assert.equal(producto.payload.productId, "prod-1");
  assert.equal(combo.payload.comboId, "combo-1");
  assert.equal(producto.fingerprint, huella(["est-a"], { ...PEDIDO, productId: "prod-1" }));
  assert.notEqual(producto.fingerprint, huella(["est-a"], PEDIDO));

  cola = colaFalsa();
  await assert.rejects(cola.enqueueGeneration(USER, KEY, ["est-a"], { ...PEDIDO, productId: "prod-9" }), /Ese producto ya no existe o no es de la marca elegida/);
  await assert.rejects(cola.enqueueGeneration(USER, KEY, ["est-a"], { ...PEDIDO, comboId: "combo-9" }), /Ese combo ya no existe o no es de la marca elegida/);
  await assert.rejects(cola.enqueueGeneration(USER, KEY, ["est-a"], { ...PEDIDO, brandId: null, productId: "prod-1" }), /Ese producto ya no existe/);
  assert.equal(cola.calls.jobs.length, 0);
})));

test("el reintento reusa el texto del producto y suelta el id si la ficha ya no existe", () => conCatalogo("true", () => conJobs(async () => {
  const fuente = (payload) => ({
    id: "job-origen", status: "FAILED", userId: USER.id, sessionVersion: 0, payload,
    items: [{ id: "it-1", structureId: "est-a", status: "FAILED", order: 0 }],
  });
  const foco = "Producto/Servicio: Polera Chimuelo\nTipo: Producto físico (no es un servicio: no hables de cupos de atención, agenda ni asesorías)";

  let cola = colaFalsa({ fuente: fuente({ ...PEDIDO, productFocus: foco, productId: "prod-1" }) });
  await cola.retryFailedGeneration(USER, "job-origen");
  assert.equal(cola.calls.jobs[0].payload.productId, "prod-1");
  assert.equal(cola.calls.jobs[0].payload.productFocus, foco);

  cola = colaFalsa({ productos: [], fuente: fuente({ ...PEDIDO, productFocus: foco, productId: "prod-borrado" }) });
  await cola.retryFailedGeneration(USER, "job-origen");
  assert.equal("productId" in cola.calls.jobs[0].payload, false);
  assert.equal(cola.calls.jobs[0].payload.productFocus, foco, "el texto ya viajaba en el pedido");
})));

test("con el catálogo apagado, encolar o reintentar un pedido con ids no consulta las tablas nuevas y suelta los ids", () => conCatalogo(undefined, () => conJobs(async () => {
  const foco = "Producto/Servicio: Polera Chimuelo\nTipo: Producto físico (no es un servicio: no hables de cupos de atención, agenda ni asesorías)";
  let cola = colaFalsa();
  await cola.enqueueGeneration(USER, KEY, ["est-a"], { ...PEDIDO, productId: "prod-1", comboId: "combo-1" });
  assert.equal(cola.calls.productos.length + cola.calls.combos.length, 0);
  assert.equal("productId" in cola.calls.jobs[0].payload || "comboId" in cola.calls.jobs[0].payload, false);
  assert.equal(cola.calls.jobs[0].fingerprint, huella(["est-a"], PEDIDO), "la huella es la de un pedido sin ficha");

  // Trabajo creado con el flag encendido y reintentado después de apagarlo.
  cola = colaFalsa({
    fuente: {
      id: "job-origen", status: "FAILED", userId: USER.id, sessionVersion: 0,
      payload: { ...PEDIDO, productFocus: foco, productId: "prod-1", comboId: "combo-1" },
      items: [{ id: "it-1", structureId: "est-a", status: "FAILED", order: 0 }],
    },
  });
  await cola.retryFailedGeneration(USER, "job-origen");
  assert.equal(cola.calls.productos.length + cola.calls.combos.length, 0, "el reintento no cuenta filas del catálogo");
  const [reintento] = cola.calls.jobs;
  assert.equal("productId" in reintento.payload || "comboId" in reintento.payload, false);
  assert.equal(reintento.payload.productFocus, foco, "el texto del producto se conserva");
})));
