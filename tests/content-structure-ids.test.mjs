import assert from "node:assert/strict";
import { test } from "node:test";
import { load } from "./load-module.mjs";

/**
 * Formatos previstos (ContentItem.structureIds) y vínculo guion↔video desde el
 * generador. Se cargan las Server Actions reales con Prisma, auth y next
 * simulados; la auditoría es la real (audit.ts) sobre el mismo Prisma falso.
 */

const USER = { id: "u1", name: "Ana", role: "MEMBER", color: "#000", email: "ana@x.com" };
const REDIRECT = Symbol("redirect");

function fakePrisma(overrides = {}) {
  const calls = { updates: [], updateManys: [], creates: [], audits: [] };
  const prisma = {
    structure: {
      findMany: async ({ where }) =>
        (where?.id?.in ?? [])
          .filter((id) => ["est-a", "est-b", "est-c"].includes(id))
          .map((id) => ({ id, name: `Estructura ${id}`, defaultDurationSec: 45 })),
      findUnique: async ({ where }) => ({ id: where.id, name: `Estructura ${where.id}`, defaultDurationSec: 45 }),
    },
    contentItem: {
      findUniqueOrThrow: async () => overrides.video,
      findUnique: async () => overrides.video ?? null,
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
  };
  return { prisma, calls };
}

function mocks(prisma, extra = {}) {
  return {
    "next/cache": { revalidatePath() {} },
    "next/navigation": { redirect(url) { throw { [REDIRECT]: url }; }, notFound() { throw new Error("404"); } },
    "@/lib/prisma": { prisma },
    "@/lib/auth": { LEVEL: { MEMBER: 1, OWNER: 2 }, requireLevel: async () => USER, clientIp: async () => "127.0.0.1" },
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

/** El AiError falso: `code` es lo que miran esErrorDeAutenticacion / esErrorDeCuota. */
class FakeAiError extends Error {
  constructor(message, detail, code) {
    super(message);
    this.detail = detail;
    this.code = code;
  }
}

function scriptsModule(prisma, ai) {
  return load("src/app/actions/scripts.ts", mocks(prisma, {
    "@/lib/ai": {
      AiError: FakeAiError,
      normalizeSceneTimes: (scenes) => scenes.map((s) => ({ startSec: s.startSec, endSec: s.endSec })),
      generateScript: ai ?? (async () => { throw new Error("la IA no debería llamarse en esta prueba"); }),
    },
    "@/lib/ai/providers": {
      esErrorDeAutenticacion: (e) => e instanceof FakeAiError && e.code === "auth",
      esErrorDeCuota: (e) => e instanceof FakeAiError && e.code === "quota",
    },
  }));
}

const BRIEF = [["estructuras", "est-a"], ["peticion", "Quiero un video que incomode"], ["producto", "Ramo"], ["proveedor", "anthropic"]];

/** Una IA falsa que devuelve un guion de una escena, o lanza lo que diga `fallos[structureId]`. */
function iaFalsa(fallos = {}, alGenerar) {
  return async (input) => {
    const fallo = fallos[input.structureId];
    if (fallo) throw fallo;
    if (alGenerar) await alGenerar(input);
    return {
      script: { title: `Guion ${input.structureId}`, scenes: [{ beat: "Hook", startSec: 0, endSec: 5, voice: "Hola" }] },
      referencesUsed: [], provider: "anthropic", model: "claude-opus-5", systemPrompt: "p", raw: "{}",
    };
  };
}

/** El guion recién creado es el que vincularGuionAVideo vuelve a leer. */
function guionCreado(prisma) {
  prisma.script.findUnique = async ({ where }) => ({ id: where.id, title: "Guion est-a", structureId: "est-a", brandId: "marca-1", structure: { name: "Estructura A" } });
}

/** Lote de varios formatos: `estructuras` viaja como una sola lista separada por comas. */
function lote(...ids) {
  return BRIEF.map(([k, v]) => (k === "estructuras" ? [k, ids.join(",")] : [k, v]));
}

test("generarGuion rechaza el video antes de llamar a la IA: inexistente, ya vinculado, fuera de Idea/Guion o de otra marca", async () => {
  let scripts = scriptsModule(fakePrisma({ video: null }).prisma);
  assert.equal((await scripts.generarGuion(null, form([...BRIEF, ["video", "vid-x"]]))).error, "Ese video ya no existe.");

  scripts = scriptsModule(fakePrisma({ video: { ...VIDEO, scriptId: "guion-viejo" } }).prisma);
  assert.equal((await scripts.generarGuion(null, form([...BRIEF, ["video", "vid-1"]]))).error, "Ese video ya tiene un guion vinculado.");

  // Publicado o cancelado: el mismo filtro que la lista del generador, antes de gastar la llamada.
  for (const status of ["PUBLICADO", "CANCELADO"]) {
    scripts = scriptsModule(fakePrisma({ video: { ...VIDEO, status } }).prisma);
    const res = await scripts.generarGuion(null, form([...BRIEF, ["video", "vid-1"]]));
    assert.equal(res.error, "Ese video ya no admite guion.", status);
    assert.match(res.detail, /solo se vinculan tarjetas en Idea o Guion/);
  }
  scripts = scriptsModule(fakePrisma({ video: { ...VIDEO, status: "GUION" } }).prisma);
  assert.equal((await scripts.generarGuion(null, form([...BRIEF, ["video", "vid-1"], ["marca", "otra-marca"]]))).error, "La marca elegida no es la del video.");

  scripts = scriptsModule(fakePrisma({ video: VIDEO }).prisma);
  const res = await scripts.generarGuion(null, form([...BRIEF, ["video", "vid-1"], ["marca", "otra-marca"]]));
  assert.equal(res.error, "La marca elegida no es la del video.");
  assert.match(res.detail, /Con Amor/);
});

test("generarGuion con video: toma su marca, anota el video en el brief y vincula el primer guion en cuanto existe", async () => {
  const { prisma, calls } = fakePrisma({ video: VIDEO });
  const llamadas = [];
  const scripts = scriptsModule(prisma, iaFalsa({}, async (input) => {
    llamadas.push({ input, vinculosHastaAhora: calls.updateManys.length });
  }));
  guionCreado(prisma);

  const res = await scripts.generarGuion(null, form([...lote("est-a", "est-b"), ["video", "vid-1"]]));
  assert.deepEqual(res, { scriptId: "guion-1", scriptIds: ["guion-1", "guion-1"], totalGenerados: 2, contentItemId: "vid-1" });
  assert.equal(llamadas[0].input.brandId, "marca-1", "sin marca elegida se usa la del video");
  assert.match(calls.creates[0].data.briefInput, /^Video del calendario: Tres errores al regalar/);

  // Una sola escritura condicionada (la tarjeta tiene que seguir libre), hecha
  // ANTES de arrancar el segundo formato, no al final del lote.
  assert.equal(calls.updates.length, 0);
  assert.equal(calls.updateManys.length, 1);
  assert.deepEqual(calls.updateManys[0].where, { id: "vid-1", scriptId: null });
  assert.deepEqual(calls.updateManys[0].data, { scriptId: "guion-1", structureId: "est-a", status: "GUION" });
  assert.deepEqual(llamadas.map((l) => l.vinculosHastaAhora), [0, 1], "el vínculo ocurre entre el primer y el segundo guion");
  const asignar = calls.audits.find((a) => a.action === "ASIGNAR");
  const changes = JSON.parse(asignar.changes);
  assert.deepEqual(changes.status, { etiqueta: "Estado", antes: "IDEA", despues: "GUION", verAntes: "Idea", verDespues: "Guion" });
  assert.equal(changes.scriptId.despues, "guion-1");
  assert.equal(changes.structureId.despues, "est-a");
  assert.equal(changes.structureId.verDespues, "Estructura A");
});

test("generarGuion no pisa un vínculo hecho durante la generación: sin auditoría, sin contentItemId y con aviso", async () => {
  // Mientras la IA trabajaba, otra pestaña asignó un guion a la tarjeta: updateMany no toca ninguna fila.
  const { prisma, calls } = fakePrisma({ video: VIDEO, updateManyCount: 0 });
  const scripts = scriptsModule(prisma, iaFalsa());
  guionCreado(prisma);

  const res = await scripts.generarGuion(null, form([...BRIEF, ["video", "vid-1"]]));
  assert.equal(res.scriptId, "guion-1");
  assert.equal(res.totalGenerados, 1);
  assert.equal(res.contentItemId, undefined);
  assert.match(res.aviso, /no quedó unido al video «Tres errores al regalar»/);
  assert.match(res.aviso, /ya recibió otro guion mientras se generaba/);
  assert.equal(calls.updateManys.length, 1);
  assert.equal(calls.audits.some((a) => a.action === "ASIGNAR"), false, "no se audita un vínculo que no se escribió");
});

test("la clave rechazada a mitad del lote se anota como fallo: hay aviso y no se redirige como si todo hubiera salido", async () => {
  const { prisma } = fakePrisma({ video: VIDEO });
  const scripts = scriptsModule(prisma, iaFalsa({
    "est-b": new FakeAiError("La clave de Anthropic fue rechazada.", "Revísala en Ajustes.", "auth"),
  }));
  guionCreado(prisma);

  // Última del lote: antes se devolvía éxito sin aviso.
  let res = await scripts.generarGuion(null, form(lote("est-a", "est-b")));
  assert.equal(res.totalGenerados, 1);
  assert.equal(res.aviso, "Se generaron 1 de 2. Falló «Estructura est-b»: La clave de Anthropic fue rechazada.");

  // A mitad: la que falló y las que no se intentaron, cada una con su motivo.
  res = await scripts.generarGuion(null, form(lote("est-a", "est-b", "est-c")));
  assert.equal(res.totalGenerados, 1);
  assert.equal(
    res.aviso,
    "Se generaron 1 de 3. Falló «Estructura est-b»: La clave de Anthropic fue rechazada; no se intentó «Estructura est-c» porque la clave fue rechazada."
  );

  // Si no se creó ninguno, el error de clave sigue teniendo prioridad.
  const sinNada = scriptsModule(prisma, iaFalsa({
    "est-a": new FakeAiError("La clave de Anthropic fue rechazada.", "Revísala en Ajustes.", "auth"),
  }));
  res = await sinNada.generarGuion(null, form(lote("est-a", "est-b")));
  assert.deepEqual(res, { error: "La clave de Anthropic fue rechazada.", detail: "Revísala en Ajustes." });
});

test("el aviso de lote parcial no duplica el punto final ni cambia de mayúscula a mitad de frase", async () => {
  const { prisma } = fakePrisma({ video: VIDEO });
  const scripts = scriptsModule(prisma, iaFalsa({
    // Con código "server" (no "quota") para que el lote no espere 20 s antes de reintentar.
    "est-b": new FakeAiError("Claude está limitando las peticiones o la cuenta se quedó sin saldo.", undefined, "server"),
    "est-c": new Error("boom"),
  }));
  guionCreado(prisma);
  const res = await scripts.generarGuion(null, form(lote("est-a", "est-b", "est-c")));
  assert.equal(
    res.aviso,
    "Se generaron 1 de 3. Fallaron «Estructura est-b» (Claude está limitando las peticiones o la cuenta se quedó sin saldo), «Estructura est-c» (No se pudo generar el formato «Estructura est-c»)."
  );
  assert.doesNotMatch(res.aviso, /\.\./);
  assert.doesNotMatch(res.aviso, / por [A-ZÁÉÍÓÚ]/);
});

test("un formato que no cabe antes de maxDuration no se arranca y el video ya tiene su guion", async () => {
  const { prisma, calls } = fakePrisma({ video: VIDEO });
  const ahora = Date.now;
  let reloj = ahora();
  Date.now = () => reloj;
  try {
    // El primer guion «tarda» 250 s: al segundo ya no le quedan los 90 s que necesita.
    const scripts = scriptsModule(prisma, iaFalsa({}, async () => { reloj += 250_000; }));
    guionCreado(prisma);
    const res = await scripts.generarGuion(null, form([...lote("est-a", "est-b"), ["video", "vid-1"]]));
    assert.equal(res.totalGenerados, 1);
    assert.equal(res.contentItemId, "vid-1");
    assert.equal(
      res.aviso,
      "Se generaron 1 de 2. No se intentó «Estructura est-b» porque no quedaba tiempo antes del límite de 5 minutos de la generación."
    );
    assert.equal(calls.updateManys.length, 1, "el vínculo se hizo con el primer guion, sin esperar al lote");
  } finally {
    Date.now = ahora;
  }
});

test("asignarGuionAVideo usa el mismo vínculo condicionado y no cuelga un guion de otra marca", async () => {
  const otra = fakePrisma({ video: VIDEO, script: { id: "g", title: "Ajeno", structureId: "est-a", brandId: "marca-2", structure: null } });
  await scriptsModule(otra.prisma).asignarGuionAVideo(form([["scriptId", "g"], ["contentItemId", "vid-1"]]));
  assert.equal(otra.calls.updateManys.length, 0);

  const misma = fakePrisma({ video: { ...VIDEO, status: "APROBADO" }, script: { id: "g", title: "Propio", structureId: "est-b", brandId: "marca-1", structure: { name: "B" } } });
  await scriptsModule(misma.prisma).asignarGuionAVideo(form([["scriptId", "g"], ["contentItemId", "vid-1"]]));
  assert.deepEqual(misma.calls.updateManys[0].where, { id: "vid-1", scriptId: null });
  assert.deepEqual(misma.calls.updateManys[0].data, { scriptId: "g", structureId: "est-b", status: "APROBADO" });
  const changes = JSON.parse(misma.calls.audits[0].changes);
  assert.equal(changes.status, undefined, "si el estado no cambia, no se registra");
  assert.equal(changes.scriptId.antes, null);

  // Si la tarjeta recibió otro guion entre la ficha y el envío, no se escribe ni se audita.
  const tarde = fakePrisma({ video: VIDEO, updateManyCount: 0, script: { id: "g", title: "Propio", structureId: "est-b", brandId: "marca-1", structure: { name: "B" } } });
  await scriptsModule(tarde.prisma).asignarGuionAVideo(form([["scriptId", "g"], ["contentItemId", "vid-1"]]));
  assert.equal(tarde.calls.updateManys.length, 1);
  assert.equal(tarde.calls.audits.length, 0);
});
