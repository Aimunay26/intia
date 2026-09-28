import assert from "node:assert/strict";
import { test } from "node:test";
import { load } from "./load-module.mjs";

/**
 * Catálogo de productos y combos por marca (PRODUCT_CATALOG_ENABLED).
 *
 * Se cargan las Server Actions reales (products.ts, brands.ts) y la política de
 * permisos real, con un Prisma en memoria. La auditoría es la real (audit.ts)
 * sobre ese mismo Prisma. withMutation y lockRevision se simulan: la
 * transacción serializable y la revisión en SQL las cubren las pruebas de Postgres.
 */

const OWNER = { id: "u-owner", name: "Dueña", role: "OWNER", email: "owner@x.test", brandIds: [] };
const STRATEGY = { id: "u-est", name: "Ana", role: "MEMBER", email: "ana@x.test", profiles: ["STRATEGY"], brandIds: ["marca-1"] };
const WRITER = { id: "u-guion", name: "Paula", role: "MEMBER", email: "paula@x.test", profiles: ["WRITER"], brandIds: ["marca-1"] };
const REDIRECT = Symbol("redirect");
const APAGADO = "El catálogo de productos no está activo.";
const CONFLICTO = "conflicto";

/* --------------------------------------------------------------- DOBLES -- */

function fakeDb() {
  const state = {
    brands: [
      { id: "marca-1", name: "Con Amor", slug: "con-amor" },
      { id: "marca-2", name: "Otra Marca", slug: "otra-marca" },
    ],
    products: [],
    combos: [],
    items: [],
  };
  const calls = { queries: 0, creates: [], updates: [], deletes: [], itemWrites: [], audits: [], counts: [] };
  let seq = 0;
  let clock = Date.parse("2026-09-28T12:00:00.000Z");
  const now = () => new Date((clock += 1000));

  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => {
    if (key === "brandId_slug") return row.brandId === value.brandId && row.slug === value.slug;
    if (value && typeof value === "object" && "in" in value) return value.in.includes(row[key]);
    if (value && typeof value === "object" && "startsWith" in value) return String(row[key] ?? "").startsWith(value.startsWith);
    return row[key] === value;
  });
  const productView = (row) => ({ ...row, _count: { comboItems: state.items.filter((i) => i.productId === row.id).length } });
  const comboView = (row) => ({
    ...row,
    items: state.items
      .filter((i) => i.comboId === row.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((i) => ({ ...i, product: { name: state.products.find((p) => p.id === i.productId)?.name, kind: state.products.find((p) => p.id === i.productId)?.kind } })),
  });

  function table(name, rows, view, defaults) {
    const find = (where) => rows().find((r) => matches(r, where));
    return {
      findUnique: async ({ where }) => { calls.queries++; const r = find(where); return r ? view(r) : null; },
      findUniqueOrThrow: async ({ where }) => { calls.queries++; const r = find(where); if (!r) throw new Error(`${name} no existe`); return view(r); },
      findFirst: async ({ where, orderBy }) => {
        calls.queries++;
        const list = rows().filter((r) => matches(r, where));
        if (orderBy?.sortOrder === "desc") list.sort((a, b) => b.sortOrder - a.sortOrder);
        return list[0] ? view(list[0]) : null;
      },
      findMany: async ({ where } = {}) => { calls.queries++; return rows().filter((r) => matches(r, where)).map(view); },
      count: async ({ where } = {}) => { calls.queries++; calls.counts.push(name); return rows().filter((r) => matches(r, where)).length; },
      create: async ({ data }) => {
        calls.queries++;
        const at = now();
        const row = { id: `${name}-${++seq}`, ...defaults, ...data, createdAt: at, updatedAt: at };
        rows().push(row);
        calls.creates.push({ model: name, data });
        return view(row);
      },
      update: async ({ where, data }) => {
        calls.queries++;
        const row = find(where);
        if (!row) throw new Error(`${name} no existe`);
        Object.assign(row, data, { updatedAt: now() });
        calls.updates.push({ model: name, where, data });
        return view(row);
      },
      delete: async ({ where }) => {
        calls.queries++;
        const row = find(where);
        if (!row) throw new Error(`${name} no existe`);
        calls.deletes.push({ model: name, id: row.id });
        state[name === "brandProduct" ? "products" : name === "brandCombo" ? "combos" : "brands"] = rows().filter((r) => r !== row);
        // Cascada de la base: las líneas de combo caen con su producto o su combo.
        state.items = state.items.filter((i) => i.productId !== row.id && i.comboId !== row.id);
        return row;
      },
    };
  }

  const prisma = {
    brand: {
      ...table("brand", () => state.brands, (r) => ({ ...r, _count: { content: 3, objectives: 2 } }), {}),
    },
    brandProduct: table("brandProduct", () => state.products, productView, {
      kind: "PRODUCTO", aiNotes: null, features: "[]", benefits: "[]", objections: "[]", priceLabel: null, active: true, sortOrder: 0,
    }),
    brandCombo: table("brandCombo", () => state.combos, comboView, { kind: "PRODUCTO", aiNotes: null, priceLabel: null, active: true, sortOrder: 0 }),
    brandComboItem: {
      createMany: async ({ data }) => { calls.queries++; calls.itemWrites.push({ op: "createMany", data }); state.items.push(...data); return { count: data.length }; },
      deleteMany: async ({ where }) => {
        calls.queries++;
        calls.itemWrites.push({ op: "deleteMany", where });
        const before = state.items.length;
        state.items = state.items.filter((i) => !matches(i, where));
        return { count: before - state.items.length };
      },
      count: async ({ where }) => { calls.queries++; return state.items.filter((i) => matches(i, where)).length; },
      findMany: async ({ where } = {}) => { calls.queries++; return state.items.filter((i) => matches(i, where)); },
    },
    auditLog: { create: async ({ data }) => { calls.audits.push(data); return data; } },
  };
  return { prisma, state, calls };
}

function harness(user, { lockError } = {}) {
  const db = fakeDb();
  const trace = { permissions: [], levels: [], owners: [], locks: [], revalidated: [] };
  const permissions = load("src/lib/permissions.ts");
  const mocks = {
    "next/cache": { revalidatePath: (path) => trace.revalidated.push(path) },
    "next/navigation": { redirect(url) { throw { [REDIRECT]: url }; } },
    "@/lib/prisma": { prisma: db.prisma },
    "@/lib/auth": {
      LEVEL: { MEMBER: 1, OWNER: 2 },
      requirePermission: async (capability) => { trace.permissions.push(capability); permissions.assertPermission(user, capability); return user; },
      requireLevel: async (min) => {
        trace.levels.push(min);
        if ((user.role === "OWNER" ? 2 : 1) < min) throw new Error("No tienes permisos para hacer esto.");
        return user;
      },
      requireUser: async () => user,
      clientIp: async () => null,
    },
    "@/lib/auth-transactions": { SecurityError: class SecurityError extends Error {} },
    "@/lib/mutations": {
      EDIT_CONFLICT: CONFLICTO,
      withMutation: async (_actor, owner, work) => {
        trace.owners.push(owner);
        const effects = [];
        const result = await work(db.prisma, (effect) => effects.push(effect));
        for (const effect of effects) effect();
        return result;
      },
      lockRevision: async (_tx, model, id, expected) => {
        trace.locks.push({ model, id, expected: expected instanceof FormData ? expected.get("expectedUpdatedAt") : expected });
        if (lockError) throw new Error(lockError);
      },
    },
    "@/lib/permissions": permissions,
  };
  return { ...db, trace, mocks, products: () => load("src/app/actions/products.ts", mocks) };
}

function form(entries) {
  const fd = new FormData();
  for (const [key, value] of entries) fd.append(key, value);
  return fd;
}

async function conCatalogo(valor, fn) {
  const antes = process.env.PRODUCT_CATALOG_ENABLED;
  if (valor === undefined) delete process.env.PRODUCT_CATALOG_ENABLED;
  else process.env.PRODUCT_CATALOG_ENABLED = valor;
  try { return await fn(); } finally {
    if (antes === undefined) delete process.env.PRODUCT_CATALOG_ENABLED; else process.env.PRODUCT_CATALOG_ENABLED = antes;
  }
}
const encendido = (fn) => conCatalogo("true", fn);

const POLERA = [
  ["brandId", "marca-1"], ["name", "Polera personalizada"], ["kind", "PRODUCTO"], ["priceLabel", "S/ 89"],
  ["aiNotes", "Algodón afranelado con fecha e iniciales."], ["features", "Algodón afranelado\r\n\r\nFecha bordada \n"],
  ["benefits", "Regalo único"], ["objections", ""], ["active", "on"],
];

/** Carga un producto directamente en el Prisma en memoria. */
function sembrarProducto(state, data) {
  const row = {
    id: data.id, brandId: data.brandId ?? "marca-1", kind: data.kind ?? "PRODUCTO", name: data.name, slug: data.slug,
    aiNotes: data.aiNotes ?? null, features: "[]", benefits: "[]", objections: "[]", priceLabel: data.priceLabel ?? null,
    active: data.active ?? true, sortOrder: data.sortOrder ?? 0, createdAt: new Date("2026-09-01T00:00:00Z"), updatedAt: new Date("2026-09-01T00:00:00Z"),
  };
  state.products.push(row);
  return row;
}

/* ---------------------------------------------------------- KILL-SWITCH -- */

test("con el catálogo apagado ninguna acción autentica, lee ni escribe", async () => {
  for (const valor of [undefined, "false", "1", "TRUE"]) {
    await conCatalogo(valor, async () => {
      const h = harness(OWNER);
      const acciones = h.products();
      for (const nombre of ["crearProducto", "actualizarProducto", "archivarProducto", "crearCombo", "actualizarCombo", "archivarCombo"]) {
        assert.deepEqual(await acciones[nombre](form(POLERA)), { error: APAGADO }, `${nombre} con ${valor}`);
      }
      await assert.rejects(acciones.eliminarProducto(form([["id", "x"]])), { message: APAGADO });
      await assert.rejects(acciones.eliminarCombo(form([["id", "x"]])), { message: APAGADO });
      assert.deepEqual(await acciones.guardarProductoRapido({ brandId: "marca-1", name: "Polera", kind: "PRODUCTO", aiNotes: "" }), { ok: false, error: APAGADO });
      assert.equal(h.calls.queries, 0);
      assert.deepEqual(h.trace.permissions, []);
      assert.deepEqual(h.trace.levels, []);
      assert.deepEqual(h.calls.audits, []);
    });
  }
});

/* ------------------------------------------------------------ PRODUCTOS -- */

test("crearProducto exige brands.edit sobre la marca, guarda las listas como JSON y audita CREAR sobre BrandProduct", () => encendido(async () => {
  const h = harness(STRATEGY);
  assert.equal(await h.products().crearProducto(form(POLERA)), undefined);
  assert.deepEqual(h.trace.permissions, ["brands.edit"]);
  assert.deepEqual(h.trace.owners, [false]);
  const [creado] = h.calls.creates;
  assert.equal(creado.model, "brandProduct");
  assert.deepEqual(creado.data, {
    name: "Polera personalizada", aiNotes: "Algodón afranelado con fecha e iniciales.", priceLabel: "S/ 89", kind: "PRODUCTO",
    features: '["Algodón afranelado","Fecha bordada"]', benefits: '["Regalo único"]', objections: "[]", active: true,
    brandId: "marca-1", slug: "polera-personalizada", sortOrder: 0,
  });
  const [audit] = h.calls.audits;
  assert.equal(audit.action, "CREAR");
  assert.equal(audit.entity, "BrandProduct");
  assert.equal(audit.brandId, "marca-1");
  assert.equal(audit.userId, STRATEGY.id);
  assert.equal(audit.summary, 'Creó el producto "Polera personalizada" en Con Amor');
  assert.ok(h.trace.revalidated.includes("/generador") && h.trace.revalidated.includes("/marcas/marca-1"));

  // El segundo producto va detrás del primero.
  await h.products().crearProducto(form([["brandId", "marca-1"], ["name", "Taza personalizada"], ["kind", "PRODUCTO"]]));
  assert.equal(h.calls.creates[1].data.sortOrder, 1);
  assert.equal(h.calls.creates[1].data.active, false, "sin la casilla marcada queda archivado, como cualquier checkbox");
}));

test("crearProducto rechaza al guionista sin brands.edit y a quien no tiene acceso a la marca", () => encendido(async () => {
  let h = harness(WRITER);
  await assert.rejects(h.products().crearProducto(form(POLERA)), { message: "Tu perfil no tiene permiso para realizar esta acción." });
  assert.equal(h.calls.creates.length, 0);

  h = harness(STRATEGY);
  await assert.rejects(h.products().crearProducto(form(POLERA.map(([k, v]) => [k, k === "brandId" ? "marca-2" : v]))), { message: "No tienes acceso a esta marca." });
  assert.equal(h.calls.creates.length, 0);
  assert.equal(h.calls.audits.length, 0);
}));

test("crearProducto valida nombre, tipo, listas, notas y precio sin recortar nada en silencio", () => encendido(async () => {
  const con = (cambios) => form(POLERA.filter(([k]) => !(k in cambios)).concat(Object.entries(cambios)));
  const casos = [
    [{ name: "  " }, /El producto necesita un nombre/],
    [{ name: "x".repeat(121) }, /hasta 120 caracteres/],
    [{ name: "¡¡!!" }, /letras o números/],
    [{ kind: "OTRO" }, /producto, un servicio o un restaurante/],
    [{ kind: "producto" }, /producto, un servicio o un restaurante/],
    [{ features: Array.from({ length: 21 }, (_, i) => `Rasgo ${i}`).join("\n") }, /Características: máximo 20 elementos \(hay 21\)/],
    [{ objections: `Bien\n${"y".repeat(201)}` }, /Objeciones: cada elemento admite hasta 200 caracteres \(el 2\.º tiene 201\)/],
    [{ aiNotes: "z".repeat(3001) }, /admite hasta 3000 caracteres \(tiene 3001\)/],
    [{ priceLabel: "S/ ".padEnd(61, "9") }, /El precio admite hasta 60 caracteres/],
  ];
  for (const [cambios, esperado] of casos) {
    const h = harness(STRATEGY);
    const res = await h.products().crearProducto(con(cambios));
    assert.match(res?.error ?? "", esperado, JSON.stringify(cambios).slice(0, 60));
    assert.equal(h.calls.creates.length, 0);
  }

  // Los saltos \r\n del navegador cuentan como uno: 1500 líneas de un carácter caben en 3000.
  const h = harness(STRATEGY);
  assert.equal(await h.products().crearProducto(con({ aiNotes: Array(1500).fill("a").join("\r\n") })), undefined);

  // El mismo nombre, con otros espacios, tildes o mayúsculas, no se duplica.
  const mayusculas = await h.products().crearProducto(con({ name: "POLERA  personalizada" }));
  assert.match(mayusculas.error, /Ya hay un producto llamado "Polera personalizada"/);
  const h2 = harness(STRATEGY);
  sembrarProducto(h2.state, { id: "p-1", name: "Polerá Personalizada", slug: "polera-personalizada" });
  const repetido = await h2.products().crearProducto(con({}));
  assert.match(repetido.error, /Ya hay un producto llamado "Polerá Personalizada"/);
  assert.equal(h2.calls.creates.length, 0);
  // En otra marca el mismo nombre se crea normal.
  const h3 = harness(OWNER);
  sembrarProducto(h3.state, { id: "p-1", name: "Polera personalizada", slug: "polera-personalizada" });
  assert.equal(await h3.products().crearProducto(con({ brandId: "marca-2" })), undefined);
  assert.equal(h3.calls.creates[0].data.brandId, "marca-2");
  assert.equal(h3.calls.creates[0].data.slug, "polera-personalizada");
}));

test("actualizarProducto bloquea la revisión que vio el editor, audita por columna y solo cambia el slug si cambia el nombre", () => encendido(async () => {
  const h = harness(STRATEGY);
  sembrarProducto(h.state, { id: "p-1", name: "Polera personalizada", slug: "polera-personalizada", priceLabel: "S/ 89" });
  sembrarProducto(h.state, { id: "p-2", name: "Taza personalizada", slug: "taza-personalizada" });
  const editar = (cambios) => form([["id", "p-1"], ["expectedUpdatedAt", "2026-09-01T00:00:00.000Z"], ...POLERA.filter(([k]) => k !== "brandId" && !(k in cambios)), ...Object.entries(cambios)]);

  assert.equal(await h.products().actualizarProducto(editar({ priceLabel: "S/ 99" })), undefined);
  assert.deepEqual(h.trace.locks, [{ model: "BrandProduct", id: "p-1", expected: "2026-09-01T00:00:00.000Z" }]);
  assert.deepEqual(h.trace.permissions, ["brands.edit"]);
  const [update] = h.calls.updates;
  assert.equal(update.data.slug, undefined, "sin renombrar no se toca el slug");
  const [audit] = h.calls.audits;
  assert.equal(audit.action, "EDITAR");
  assert.equal(audit.entity, "BrandProduct");
  assert.equal(audit.brandId, "marca-1");
  const changes = JSON.parse(audit.changes);
  assert.deepEqual(changes.priceLabel, { etiqueta: "Precio", antes: "S/ 89", despues: "S/ 99" });
  assert.deepEqual(changes.features, { etiqueta: "Características", antes: "[]", despues: '["Algodón afranelado","Fecha bordada"]' });
  assert.equal(changes.name, undefined);

  // Renombrar recalcula el slug; chocar con otro producto de la marca se rechaza sin escribir.
  await h.products().actualizarProducto(editar({ name: "Polera Chimuelo" }));
  assert.equal(h.calls.updates[1].data.slug, "polera-chimuelo");
  assert.deepEqual(JSON.parse(h.calls.audits[1].changes).slug, { etiqueta: "Identificador", antes: "polera-personalizada", despues: "polera-chimuelo" });
  const choque = await h.products().actualizarProducto(editar({ name: "taza personalizada" }));
  assert.match(choque.error, /Ya hay un producto llamado "Taza personalizada"/);
  assert.equal(h.calls.updates.length, 2);

  // Sin acceso a la marca del producto no se escribe nada.
  const ajena = harness(STRATEGY);
  sembrarProducto(ajena.state, { id: "p-1", brandId: "marca-2", name: "Otra", slug: "otra" });
  await assert.rejects(ajena.products().actualizarProducto(editar({})), { message: "No tienes acceso a esta marca." });
  assert.equal(ajena.calls.updates.length, 0);
}));

test("un conflicto de revisión vuelve como mensaje legible para conservar el borrador", () => encendido(async () => {
  const h = harness(STRATEGY, { lockError: CONFLICTO });
  sembrarProducto(h.state, { id: "p-1", name: "Polera", slug: "polera" });
  const res = await h.products().actualizarProducto(form([["id", "p-1"], ["expectedUpdatedAt", "2026-01-01T00:00:00.000Z"], ...POLERA]));
  assert.deepEqual(res, { error: CONFLICTO });
  assert.deepEqual(await h.products().archivarProducto(form([["id", "p-1"], ["expectedUpdatedAt", "2026-01-01T00:00:00.000Z"]])), { error: CONFLICTO });
  assert.equal(h.calls.updates.length, 0);
}));

test("archivarProducto alterna el estado con revisión y deja el cambio en la auditoría", () => encendido(async () => {
  const h = harness(STRATEGY);
  sembrarProducto(h.state, { id: "p-1", name: "Polera", slug: "polera" });
  const fd = () => form([["id", "p-1"], ["expectedUpdatedAt", "2026-09-01T00:00:00.000Z"]]);
  await h.products().archivarProducto(fd());
  assert.equal(h.state.products[0].active, false);
  assert.equal(h.trace.locks[0].model, "BrandProduct");
  assert.equal(h.calls.audits[0].summary, 'Archivó el producto "Polera"');
  assert.deepEqual(JSON.parse(h.calls.audits[0].changes), { active: { etiqueta: "Activo", antes: true, despues: false } });
  await h.products().archivarProducto(fd());
  assert.equal(h.state.products[0].active, true);
  assert.equal(h.calls.audits[1].summary, 'Reactivó el producto "Polera"');
}));

test("eliminar un producto o un combo es solo del dueño, con la transacción de dueño", () => encendido(async () => {
  const miembro = harness(STRATEGY);
  sembrarProducto(miembro.state, { id: "p-1", name: "Polera", slug: "polera" });
  await assert.rejects(miembro.products().eliminarProducto(form([["id", "p-1"]])), { message: "No tienes permisos para hacer esto." });
  await assert.rejects(miembro.products().eliminarCombo(form([["id", "c-1"]])), { message: "No tienes permisos para hacer esto." });
  assert.deepEqual(miembro.trace.levels, [2, 2]);
  assert.equal(miembro.calls.deletes.length, 0);

  const h = harness(OWNER);
  sembrarProducto(h.state, { id: "p-1", name: "Polera", slug: "polera" });
  sembrarProducto(h.state, { id: "p-2", name: "Taza", slug: "taza" });
  h.state.combos.push({ id: "c-1", brandId: "marca-1", name: "Pack", slug: "pack", kind: "PRODUCTO", active: true, sortOrder: 0, updatedAt: new Date() });
  h.state.items.push({ comboId: "c-1", productId: "p-1", brandId: "marca-1", quantity: 2, sortOrder: 0 }, { comboId: "c-1", productId: "p-2", brandId: "marca-1", quantity: 1, sortOrder: 1 });

  await h.products().eliminarProducto(form([["id", "p-1"]]));
  assert.deepEqual(h.trace.owners, [true]);
  assert.deepEqual(h.state.products.map((p) => p.id), ["p-2"]);
  assert.deepEqual(h.state.items.map((i) => i.productId), ["p-2"], "sus líneas de combo caen en cascada");
  assert.equal(h.calls.audits[0].action, "ELIMINAR");
  assert.equal(h.calls.audits[0].entity, "BrandProduct");
  assert.equal(h.calls.audits[0].summary, 'Eliminó el producto "Polera", que estaba en 1 combo');

  // El combo que lo incluía se rehace en la misma transacción: le queda un producto, así que se archiva.
  const [combo] = h.state.combos;
  assert.equal(combo.active, false, "con menos de dos productos el combo deja de ofrecerse");
  assert.deepEqual(h.calls.updates.map((u) => u.model), ["brandCombo"], "la revisión del combo cambia");
  assert.equal(h.calls.audits[1].action, "EDITAR");
  assert.equal(h.calls.audits[1].entity, "BrandCombo");
  assert.equal(h.calls.audits[1].entityId, "c-1");
  assert.equal(h.calls.audits[1].summary, 'Archivó el combo "Pack": al eliminar "Polera" le quedan 1 producto');
  const cambios = JSON.parse(h.calls.audits[1].changes);
  assert.deepEqual(cambios.items.antes, [{ productId: "p-1", quantity: 2 }, { productId: "p-2", quantity: 1 }]);
  assert.deepEqual(cambios.items.despues, [{ productId: "p-2", quantity: 1 }]);
  assert.equal(cambios.items.verDespues, "1× Taza");
  assert.deepEqual(cambios.active, { etiqueta: "Activo", antes: true, despues: false });

  await h.products().eliminarCombo(form([["id", "c-1"]]));
  assert.deepEqual(h.trace.owners, [true, true]);
  assert.equal(h.state.combos.length, 0);
  assert.deepEqual(h.state.products.map((p) => p.id), ["p-2"], "borrar el combo no toca sus productos");
  assert.equal(h.calls.audits.at(-1).entity, "BrandCombo");
  assert.equal(h.calls.audits.at(-1).summary, 'Eliminó el combo "Pack"');
}));

test("eliminar un producto recalcula el tipo del combo que sigue con dos o más productos", () => encendido(async () => {
  const h = harness(OWNER);
  conProductos(h);
  sembrarProducto(h.state, { id: "p-4", name: "Asesoría de talla", slug: "asesoria-de-talla", kind: "SERVICIO" });
  h.state.combos.push({ id: "c-1", brandId: "marca-1", name: "Regalo asistido", slug: "regalo-asistido", kind: "PRODUCTO", active: true, sortOrder: 0, updatedAt: new Date() });
  h.state.items.push(
    { comboId: "c-1", productId: "p-1", brandId: "marca-1", quantity: 1, sortOrder: 0 },
    { comboId: "c-1", productId: "p-3", brandId: "marca-1", quantity: 1, sortOrder: 1 },
    { comboId: "c-1", productId: "p-4", brandId: "marca-1", quantity: 1, sortOrder: 2 },
  );
  await h.products().eliminarProducto(form([["id", "p-1"]]));
  const [combo] = h.state.combos;
  assert.equal(combo.active, true, "le quedan dos productos: sigue activo");
  assert.equal(combo.kind, "SERVICIO", "el tipo sale de los productos que quedan");
  const edit = h.calls.audits.find((a) => a.entity === "BrandCombo");
  assert.equal(edit.summary, 'Quitó "Polera" del combo "Regalo asistido" al eliminar el producto');
  assert.deepEqual(JSON.parse(edit.changes).kind, { etiqueta: "Tipo", antes: "PRODUCTO", despues: "SERVICIO" });
}));

test("cambiar el tipo de un producto recalcula el tipo de sus combos y lo audita", () => encendido(async () => {
  const h = harness(STRATEGY);
  conProductos(h);
  await h.products().crearCombo(form([["brandId", "marca-1"], ["name", "Pack"], ["productIds", "p-1"], ["productIds", "p-3"]]));
  const [combo] = h.state.combos;
  assert.equal(combo.kind, "PRODUCTO", "empate: el primero");
  const editar = (kind) => form([["id", "p-1"], ["expectedUpdatedAt", "2026-09-01T00:00:00.000Z"], ["name", "Polera"], ["kind", kind], ["active", "on"]]);

  await h.products().actualizarProducto(editar("SERVICIO"));
  assert.equal(combo.kind, "SERVICIO");
  const audit = h.calls.audits.at(-1);
  assert.equal(audit.entity, "BrandCombo");
  assert.equal(audit.summary, 'Recalculó el tipo del combo "Pack" al cambiar el tipo de "Polera"');

  // Sin cambio de tipo no se toca el combo.
  const antes = h.calls.updates.length;
  await h.products().actualizarProducto(editar("SERVICIO"));
  assert.equal(h.calls.updates.length, antes + 1, "solo el producto");
}));

test("un producto archivado no entra en un combo nuevo ni editado", () => encendido(async () => {
  const h = harness(STRATEGY);
  conProductos(h);
  h.state.products.find((p) => p.id === "p-2").active = false;
  const res = await h.products().crearCombo(form([["brandId", "marca-1"], ["name", "Pack"], ["productIds", "p-1"], ["productIds", "p-2"]]));
  assert.deepEqual(res, { error: '"Taza" está archivado. Reactívalo o quítalo del combo.' });
  assert.equal(h.state.combos.length, 0);
}));

/* --------------------------------------------------------------- COMBOS -- */

function conProductos(h) {
  sembrarProducto(h.state, { id: "p-1", name: "Polera", slug: "polera", kind: "PRODUCTO" });
  sembrarProducto(h.state, { id: "p-2", name: "Taza", slug: "taza", kind: "PRODUCTO" });
  sembrarProducto(h.state, { id: "p-3", name: "Asesoría de regalo", slug: "asesoria", kind: "SERVICIO" });
  sembrarProducto(h.state, { id: "p-x", brandId: "marca-2", name: "Ajeno", slug: "ajeno" });
}

const PACK = [["brandId", "marca-1"], ["name", "Pack pareja"], ["priceLabel", "S/ 199"], ["productIds", "p-1"], ["productIds", "p-2"], ["quantity-p-1", "2"], ["quantity-p-2", ""]];

test("crearCombo guarda sus productos con cantidad y orden, calcula el tipo y audita CREAR sobre BrandCombo", () => encendido(async () => {
  const h = harness(STRATEGY);
  conProductos(h);
  assert.equal(await h.products().crearCombo(form(PACK)), undefined);
  assert.deepEqual(h.trace.permissions, ["brands.edit"]);
  const [combo] = h.state.combos;
  assert.equal(combo.kind, "PRODUCTO");
  assert.equal(combo.slug, "pack-pareja");
  assert.deepEqual(h.calls.itemWrites[0].data, [
    { comboId: combo.id, productId: "p-1", brandId: "marca-1", quantity: 2, sortOrder: 0 },
    { comboId: combo.id, productId: "p-2", brandId: "marca-1", quantity: 1, sortOrder: 1 },
  ]);
  const [audit] = h.calls.audits;
  assert.equal(audit.entity, "BrandCombo");
  assert.equal(audit.action, "CREAR");
  assert.equal(audit.brandId, "marca-1");
  assert.equal(audit.summary, 'Creó el combo "Pack pareja" en Con Amor: 2× Polera, 1× Taza');
}));

test("crearCombo exige dos productos de la misma marca y cantidades válidas", () => encendido(async () => {
  const casos = [
    [[["productIds", "p-1"]], /al menos dos productos/],
    [[["productIds", "p-1"], ["productIds", "p-1"]], /al menos dos productos/],
    [[["productIds", "p-1"], ["productIds", "p-x"]], /no son de esta marca/],
    [[["productIds", "p-1"], ["productIds", "no-existe"]], /no son de esta marca/],
    [[["productIds", "p-1"], ["productIds", "p-2"], ["quantity-p-1", "0"]], /va de 1 a 99/],
    [[["productIds", "p-1"], ["productIds", "p-2"], ["quantity-p-2", "1.5"]], /va de 1 a 99/],
    [[["productIds", "p-1"], ["productIds", "p-2"], ["quantity-p-2", "100"]], /va de 1 a 99/],
    [[["name", ""], ["productIds", "p-1"], ["productIds", "p-2"]], /El combo necesita un nombre/],
  ];
  for (const [entradas, esperado] of casos) {
    const h = harness(STRATEGY);
    conProductos(h);
    const base = [["brandId", "marca-1"], ["name", "Pack"]].filter(([k]) => !entradas.some(([e]) => e === k));
    const res = await h.products().crearCombo(form([...base, ...entradas]));
    assert.match(res?.error ?? "", esperado, JSON.stringify(entradas));
    assert.equal(h.state.combos.length, 0);
    assert.equal(h.calls.itemWrites.length, 0);
  }

  // Un combo de producto y servicio toma el tipo más frecuente (empate: el primero).
  const h = harness(STRATEGY);
  conProductos(h);
  await h.products().crearCombo(form([["brandId", "marca-1"], ["name", "Regalo asistido"], ["productIds", "p-3"], ["productIds", "p-1"]]));
  assert.equal(h.state.combos[0].kind, "SERVICIO");
}));

test("actualizarCombo bloquea la revisión y reemplaza sus productos en la misma transacción, con la auditoría legible", () => encendido(async () => {
  const h = harness(STRATEGY);
  conProductos(h);
  await h.products().crearCombo(form(PACK));
  const combo = h.state.combos[0];
  const antes = combo.updatedAt;

  const res = await h.products().actualizarCombo(form([
    ["id", combo.id], ["expectedUpdatedAt", antes.toISOString()], ["name", "Pack pareja"], ["priceLabel", "S/ 199"],
    ["productIds", "p-2"], ["productIds", "p-1"], ["quantity-p-1", "1"], ["quantity-p-2", "3"],
  ]));
  assert.equal(res, undefined);
  assert.deepEqual(h.trace.locks, [{ model: "BrandCombo", id: combo.id, expected: antes.toISOString() }]);
  assert.deepEqual(h.calls.itemWrites.slice(1).map((w) => w.op), ["deleteMany", "createMany"]);
  assert.deepEqual(h.state.items.map((i) => [i.productId, i.quantity, i.sortOrder]), [["p-2", 3, 0], ["p-1", 1, 1]]);
  assert.ok(combo.updatedAt > antes, "la revisión del combo cambia aunque solo cambien sus productos");
  const changes = JSON.parse(h.calls.audits[1].changes);
  assert.deepEqual(changes.items, {
    etiqueta: "Productos del combo",
    antes: [{ productId: "p-1", quantity: 2 }, { productId: "p-2", quantity: 1 }],
    despues: [{ productId: "p-2", quantity: 3 }, { productId: "p-1", quantity: 1 }],
    verAntes: "2× Polera, 1× Taza",
    verDespues: "3× Taza, 1× Polera",
  });
  assert.equal(changes.name, undefined);

  // Un producto de otra marca no entra ni por edición.
  const ajeno = await h.products().actualizarCombo(form([["id", combo.id], ["expectedUpdatedAt", combo.updatedAt.toISOString()], ["name", "Pack"], ["productIds", "p-1"], ["productIds", "p-x"]]));
  assert.match(ajeno.error, /no son de esta marca/);
  assert.equal(h.state.items.length, 2);
}));

test("archivarCombo alterna el estado con revisión de BrandCombo", () => encendido(async () => {
  const h = harness(STRATEGY);
  conProductos(h);
  await h.products().crearCombo(form(PACK));
  await h.products().archivarCombo(form([["id", h.state.combos[0].id], ["expectedUpdatedAt", "2026-09-28T12:00:00.000Z"]]));
  assert.equal(h.state.combos[0].active, false);
  assert.equal(h.trace.locks[0].model, "BrandCombo");
  assert.equal(h.calls.audits[1].entity, "BrandCombo");
  assert.match(h.calls.audits[1].summary, /^Archivó el combo "Pack pareja"$/);
}));

/* ------------------------------------------------------ GUARDADO RÁPIDO -- */

test("guardarProductoRapido es idempotente por nombre (sin tildes ni mayúsculas) y avisa si el producto está archivado", () => encendido(async () => {
  const h = harness(STRATEGY);
  const a = await h.products().guardarProductoRapido({ brandId: "marca-1", name: "Polera  Chimuelo", kind: "PRODUCTO", aiNotes: "Algodón" });
  const b = await h.products().guardarProductoRapido({ brandId: "marca-1", name: "polerá chimuelo", kind: "SERVICIO", aiNotes: "otra cosa" });
  assert.equal(a.ok, true);
  assert.equal(a.product.name, "Polera Chimuelo");
  assert.equal(a.product.kind, "PRODUCTO");
  assert.deepEqual(b, a, "el segundo guardado devuelve la misma ficha, sin pisarla");
  assert.equal(h.calls.creates.length, 1);
  assert.equal(h.calls.audits.length, 1);
  assert.equal(h.calls.audits[0].entity, "BrandProduct");

  h.state.products[0].active = false;
  const c = await h.products().guardarProductoRapido({ brandId: "marca-1", name: "Polera Chimuelo", kind: "PRODUCTO", aiNotes: "" });
  assert.equal(c.ok, false);
  assert.match(c.error, /archivado/);

  const writer = harness(WRITER);
  await assert.rejects(writer.products().guardarProductoRapido({ brandId: "marca-1", name: "Polera", kind: "PRODUCTO", aiNotes: "" }), { message: "Tu perfil no tiene permiso para realizar esta acción." });
}));

test("el guardado idempotente encuentra el mismo nombre en cualquier sufijo del slug, aunque la raíz quede libre", () => encendido(async () => {
  const h = harness(STRATEGY);
  const guardar = (name) => h.products().guardarProductoRapido({ brandId: "marca-1", name, kind: "PRODUCTO", aiNotes: "" });
  // Dos nombres largos que comparten los 60 caracteres del slug.
  const roja = await guardar("Polera personalizada de algodon afranelado para parejas edicion roja");
  const azul = await guardar("Polera personalizada de algodon afranelado para parejas edicion azul");
  const raiz = h.state.products[0].slug;
  assert.equal(h.state.products[1].slug, `${raiz}-2`);
  assert.deepEqual(await guardar("Polera personalizada de algodón afranelado para parejas edición azul"), azul);

  // Se borra la ficha de la raíz: volver a guardar la azul no la duplica en el hueco.
  h.state.products = h.state.products.filter((p) => p.id !== roja.product.id);
  assert.deepEqual(await guardar("Polera personalizada de algodon afranelado para parejas edicion azul"), azul);
  assert.equal(h.state.products.length, 1);

  // Un nombre nuevo con la misma raíz ocupa el primer hueco.
  const verde = await guardar("Polera personalizada de algodon afranelado para parejas edicion verde");
  assert.equal(verde.ok, true);
  assert.equal(h.state.products.find((p) => p.id === verde.product.id).slug, raiz);
}));

/* -------------------------------------------------- FOCO PARA LA IA -- */

function focoModule() {
  return load("src/lib/product-catalog.ts", { "@/lib/prisma": { prisma: {} } });
}

const PRODUCTO = {
  id: "p-1", brandId: "marca-1", kind: "PRODUCTO", name: "Polera personalizada", aiNotes: "Algodón", features: ["Algodón afranelado", "Fecha bordada"],
  benefits: ["Regalo único"], objections: ["¿Llega a tiempo? Se acuerda por WhatsApp"], priceLabel: "S/ 89", active: true, sortOrder: 0, updatedAt: "2026-09-28T12:00:00.000Z",
};

test("construirFocoDeProducto conserva el prefijo del texto libre y agrega Tipo, precio y listas", () => {
  const { construirFocoDeProducto } = focoModule();
  const foco = construirFocoDeProducto({ type: "product", product: PRODUCTO }, "Detalle del formulario");
  assert.equal(foco, [
    "Producto/Servicio: Polera personalizada",
    "Tipo: Producto físico (no es un servicio: no hables de cupos de atención, agenda ni asesorías)",
    "Precio: S/ 89",
    "Características: Algodón afranelado · Fecha bordada",
    "Beneficios: Regalo único",
    "Objeciones que resuelve: ¿Llega a tiempo? Se acuerda por WhatsApp",
    "",
    "Detalle y descripción profunda:",
    "Detalle del formulario",
  ].join("\n"));
  assert.match(foco, /^Producto\/Servicio: /);

  const servicio = construirFocoDeProducto({ type: "product", product: { ...PRODUCTO, kind: "SERVICIO", priceLabel: null, features: [], benefits: [], objections: [] } }, "");
  assert.equal(servicio, "Producto/Servicio: Polera personalizada\nTipo: Servicio (se vende tiempo, atención o resultado; no inventes stock ni envíos)");
  assert.match(construirFocoDeProducto({ type: "product", product: { ...PRODUCTO, kind: "RESTAURANTE" } }, ""), /\nTipo: Restaurante /);
});

test("construirFocoDeProducto de un combo dice qué incluye y junta las listas de sus productos sin repetir", () => {
  const { construirFocoDeProducto } = focoModule();
  const taza = { ...PRODUCTO, id: "p-2", name: "Taza", features: ["Fecha bordada", "Cerámica"], benefits: [], objections: [] };
  const combo = {
    id: "c-1", brandId: "marca-1", kind: "PRODUCTO", name: "Pack pareja", aiNotes: "", priceLabel: "S/ 199", active: true, sortOrder: 0, updatedAt: "2026-09-28T12:00:00.000Z",
    items: [{ productId: "p-1", name: "Polera personalizada", kind: "PRODUCTO", quantity: 2 }, { productId: "p-2", name: "Taza", kind: "PRODUCTO", quantity: 1 }],
  };
  const foco = construirFocoDeProducto({ type: "combo", combo, products: [PRODUCTO, taza, { ...PRODUCTO, id: "p-9", features: ["No incluido"] }] }, "");
  const lineas = foco.split("\n");
  assert.equal(lineas[0], "Producto/Servicio: Pack pareja");
  assert.match(lineas[1], /^Tipo: Producto físico/);
  assert.equal(lineas[2], "Precio: S/ 199");
  assert.equal(lineas[3], "Incluye: 2× Polera personalizada, 1× Taza");
  assert.equal(lineas[4], "Características: Algodón afranelado · Fecha bordada · Cerámica");
  assert.ok(!foco.includes("No incluido"), "solo usa los productos del combo");
});

test("construirFocoDeProducto no pasa del tope y nunca corta el producto ni el tipo", () => {
  const { construirFocoDeProducto, PRODUCT_LIMITS } = focoModule();
  assert.equal(PRODUCT_LIMITS.focus, 6000);
  const largo = { ...PRODUCTO, features: Array.from({ length: 20 }, (_, i) => `Rasgo ${i} `.padEnd(200, "x")), benefits: Array.from({ length: 20 }, (_, i) => `Beneficio ${i} `.padEnd(200, "y")) };
  const foco = construirFocoDeProducto({ type: "product", product: largo }, "d".repeat(9000));
  assert.ok(foco.length <= PRODUCT_LIMITS.focus, `mide ${foco.length}`);
  assert.ok(foco.startsWith("Producto/Servicio: Polera personalizada\nTipo: Producto físico"));
  assert.match(foco, /Detalle y descripción profunda:\nd+…$/);

  const soloDetalle = construirFocoDeProducto({ type: "product", product: { ...PRODUCTO, features: [], benefits: [], objections: [] } }, "e".repeat(8000));
  assert.ok(soloDetalle.length <= PRODUCT_LIMITS.focus);
  assert.ok(soloDetalle.includes("Precio: S/ 89"));
});

test("un «Qué debe saber la IA» dentro del límite llega entero y con las listas de la ficha", () => {
  const { focoDeProducto, avisoDeRecorte, PRODUCT_LIMITS } = focoModule();
  const ficha = { ...PRODUCTO, features: ["Algodón afranelado", "Fecha bordada", "Caja premium"], benefits: ["Regalo único"], objections: ["¿Destiñe? No"] };
  for (const largo of [2500, 2800, 2950, PRODUCT_LIMITS.aiNotes]) {
    const notas = "n".repeat(largo);
    const { texto, recortes } = focoDeProducto({ type: "product", product: ficha }, notas);
    assert.ok(texto.endsWith(`Detalle y descripción profunda:\n${notas}`), `${largo}: el detalle no se corta`);
    for (const linea of ["Características: Algodón afranelado · Fecha bordada · Caja premium", "Beneficios: Regalo único", "Objeciones que resuelve: ¿Destiñe? No"]) {
      assert.ok(texto.includes(linea), `${largo}: falta «${linea}»`);
    }
    assert.deepEqual(recortes, { listas: 0, incluye: 0, detalle: false, precio: false });
    assert.equal(avisoDeRecorte(recortes), null);
  }

  // Con las listas y el detalle al máximo, lo que no entra se cuenta para avisarlo; el detalle sigue entero.
  const llena = {
    ...PRODUCTO,
    features: Array.from({ length: 20 }, (_, i) => `Rasgo ${i} `.padEnd(200, "x")),
    benefits: Array.from({ length: 20 }, (_, i) => `Beneficio ${i} `.padEnd(200, "y")),
    objections: Array.from({ length: 20 }, (_, i) => `Objeción ${i} `.padEnd(200, "z")),
  };
  const notas = "n".repeat(PRODUCT_LIMITS.aiNotes);
  const { texto, recortes } = focoDeProducto({ type: "product", product: llena }, notas);
  assert.ok(texto.length <= PRODUCT_LIMITS.focus);
  assert.ok(texto.endsWith(notas));
  assert.ok(recortes.listas > 0);
  assert.equal(recortes.detalle, false);
  assert.equal(
    avisoDeRecorte(recortes),
    `Por el tope de ${PRODUCT_LIMITS.focus} caracteres, la IA no recibirá ${recortes.listas} elementos de características, beneficios u objeciones.`,
  );
});

/* -------------------------------------------------------------- MARCAS -- */

function brandsModule(h) {
  return load("src/app/actions/brands.ts", {
    ...h.mocks,
    "@/lib/objective-policy": { objectiveCalculation: () => ({}) },
    "@/lib/asset-import": { leerArchivoOpcional: async () => null, prepararArchivoPrivado: async () => "blob", guardarDocumentoImportado: async () => {} },
    "@/lib/pdf": { MAX_UPLOAD_BYTES: 4 * 1024 * 1024 },
    "@/lib/assets-cleanup": { borrarAssetsDe: async () => {} },
  });
}

test("crearMarca abre la pestaña Productos solo con el catálogo encendido", async () => {
  for (const [valor, destino] of [["true", /^\/marcas\/brand-\d+\?vista=productos$/], [undefined, /^\/marcas\/brand-\d+$/]]) {
    await conCatalogo(valor, async () => {
      const h = harness(OWNER);
      h.prisma.brand.findUnique = async () => null; // slug libre
      await assert.rejects(brandsModule(h).crearMarca(form([["name", "Marca nueva"]])), (e) => destino.test(e[REDIRECT]));
    });
  }
});

test("eliminarMarca cuenta productos y combos en la auditoría solo con el catálogo encendido", async () => {
  await conCatalogo(undefined, async () => {
    const h = harness(OWNER);
    await assert.rejects(brandsModule(h).eliminarMarca(form([["id", "marca-1"]])), (e) => e[REDIRECT] === "/marcas");
    assert.equal(h.calls.audits[0].summary, 'Eliminó la marca "Con Amor" con sus 3 videos y 2 objetivos');
    assert.deepEqual(h.calls.counts, [], "apagado no consulta las tablas del catálogo");
  });
  await encendido(async () => {
    const h = harness(OWNER);
    conProductos(h);
    await assert.rejects(brandsModule(h).eliminarMarca(form([["id", "marca-1"]])), (e) => e[REDIRECT] === "/marcas");
    assert.equal(h.calls.audits[0].summary, 'Eliminó la marca "Con Amor" con sus 3 videos, 2 objetivos, 3 productos y 0 combos');
  });
});
