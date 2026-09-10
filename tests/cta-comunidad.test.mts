import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ANGULOS_CREATIVOS,
  CTA_ACTIONS,
  CTA_COMUNIDAD,
  CTA_MODOS,
  CTA_TRIGGERS,
  PROHIBICION_CTA_COMUNIDAD,
  armarCtaTexto,
  coherenciaCta,
  ctaAccionesDeModo,
  ctaCatalogo,
  esCtaDeVenta,
  modoDeGatillo,
} from "../src/lib/script-angles";
import { buildSystemPrompt, buildUserPrompt, type BuildPromptInput } from "../src/lib/ai/context";

/**
 * CTA sin venta (modo comunidad): el catálogo no puede oler a oferta, el
 * ensamblador no puede caer en escasez y el prompt tiene que prohibir vender
 * por encima de la categoría VENDE de la estructura.
 *
 * Correr con: npx tsx --test tests/cta-comunidad.test.mts
 */

/** Vocabulario de oferta que jamás puede aparecer en un cierre de comunidad. */
const OFERTA = /\b(promo\w*|descuento\w*|oferta\w*|precio\w*|cupo\w*|enlace en (la )?bio|DM|compra\w*|reserva\w*|catálogo|últimas unidades|quedan pocos|solo hoy)\b/i;

/** Lo que añade el ensamblador de venta y que en comunidad no puede colarse. */
const PRESION = /\b(plazas?|cupo\w*|agot\w*|enlace|DM|compra\w*|medianoche|reloj|regalo|información)\b/i;

const IDS_VENTA = ["escasez", "urgencia", "motivo_fraternidad", "incentivo_regalo", "impacto_visual", "directo"];
const ACCIONES_ORIGINALES = ["comentar", "seguir", "bio", "dm", "compra"];

/* ------------------------------------------------------------ catálogo -- */

test("ningún texto visible del catálogo de comunidad contiene vocabulario de oferta", () => {
  assert.ok(CTA_COMUNIDAD.length >= 10 && CTA_COMUNIDAD.length <= 12, `hay ${CTA_COMUNIDAD.length} gatillos`);
  for (const g of CTA_COMUNIDAD) {
    assert.equal(g.category, "comunidad", g.id);
    assert.match(g.id, /^com_/, g.id);
    const visibles = [g.name, g.shortLabel, g.badge, g.explanation, g.defaultDetailPlaceholder];
    for (const p of g.presets) visibles.push(p.label, p.detalle, p.textoCompleto);
    for (const texto of visibles) {
      assert.doesNotMatch(texto, OFERTA, `${g.id}: «${texto}»`);
    }
    assert.ok(g.presets.length >= 2, `${g.id} necesita al menos dos frases de ejemplo`);
    for (const p of g.presets) {
      // Un preset solo puede apuntar a una acción de comunidad (o a ninguna, en el cierre sin pedido).
      if (p.accion === "") {
        assert.equal(g.id, "com_sin_pedido", `${g.id}: solo el cierre sin pedido va sin acción`);
        continue;
      }
      const accion = CTA_ACTIONS.find((a) => a.id === p.accion);
      assert.ok(accion, `${g.id}: acción desconocida «${p.accion}»`);
      assert.notEqual(accion.modo, "venta", `${g.id}: la acción «${p.accion}» es de venta`);
    }
  }
});

test("cada promptGuidance de comunidad lleva la prohibición literal y las reglas de redacción", () => {
  for (const g of CTA_COMUNIDAD) {
    assert.ok(g.promptGuidance.includes(PROHIBICION_CTA_COMUNIDAD), g.id);
    assert.match(g.promptGuidance, /Un solo pedido/, g.id);
    assert.match(g.promptGuidance, /destinatario por una situación/, g.id);
    assert.match(g.promptGuidance, /pregunta a una orden/, g.id);
    assert.match(g.promptGuidance, /máximo cinco palabras/, g.id);
    assert.match(g.promptGuidance, /Ubicación:/, g.id);
  }
  assert.match(PROHIBICION_CTA_COMUNIDAD, /oferta/);
  assert.match(PROHIBICION_CTA_COMUNIDAD, /promoción/);
  assert.match(PROHIBICION_CTA_COMUNIDAD, /precio/);
  assert.match(PROHIBICION_CTA_COMUNIDAD, /cupo/);
  assert.match(PROHIBICION_CTA_COMUNIDAD, /enlace de compra/);
  assert.match(PROHIBICION_CTA_COMUNIDAD, /DM comercial/);
  // El de retención va tras el gancho, no al cierre.
  const quedate = CTA_COMUNIDAD.find((g) => g.id === "com_quedate");
  assert.ok(quedate);
  assert.match(quedate.promptGuidance, /después del gancho/);
});

test("los ids de comunidad no chocan con los de venta ni con los ángulos creativos", () => {
  const ids = CTA_COMUNIDAD.map((g) => g.id);
  assert.equal(new Set(ids).size, ids.length, "ids repetidos");
  for (const id of ids) {
    assert.ok(!IDS_VENTA.includes(id), id);
    assert.ok(!ANGULOS_CREATIVOS.some((a) => a.id === id), id);
  }
});

test("ctaCatalogo(\"venta\") sigue devolviendo los 6 gatillos de siempre, en su orden", () => {
  assert.deepEqual(ctaCatalogo("venta").map((g) => g.id), IDS_VENTA);
  assert.equal(ctaCatalogo("venta"), CTA_TRIGGERS);
  assert.equal(ctaCatalogo("comunidad"), CTA_COMUNIDAD);
  for (const id of IDS_VENTA) {
    assert.equal(esCtaDeVenta(id), true, id);
    assert.equal(modoDeGatillo(id), "venta", id);
  }
  for (const g of CTA_COMUNIDAD) {
    assert.equal(esCtaDeVenta(g.id), false, g.id);
    assert.equal(modoDeGatillo(g.id), "comunidad", g.id);
  }
  assert.equal(modoDeGatillo("no_existe"), null);
  assert.deepEqual(CTA_MODOS.map((m) => m.id), ["venta", "comunidad"]);
});

test("las 5 acciones originales siguen intactas y el modo comunidad esconde bio, DM, compra y la palabra clave", () => {
  assert.deepEqual(CTA_ACTIONS.slice(0, 5).map((a) => a.id), ACCIONES_ORIGINALES);
  assert.deepEqual(
    CTA_ACTIONS.slice(0, 5).map((a) => a.verbo),
    ["Comenta", "Sígueme", "Ve al enlace de mi perfil", "Escríbeme al DM", "Separa tu cupo"]
  );
  assert.deepEqual(ctaAccionesDeModo("venta").map((a) => a.id), ACCIONES_ORIGINALES);
  const comunidad = ctaAccionesDeModo("comunidad").map((a) => a.id);
  // «Comentar palabra clave» es el embudo «comenta GUIA y te lo mando por DM»:
  // en comunidad el comentario se pide con «opinar».
  for (const id of ["bio", "dm", "compra", "comentar"]) assert.ok(!comunidad.includes(id), id);
  for (const id of ["seguir", "guardar", "compartir", "etiquetar", "opinar", "votar", "notificaciones", "siguiente", "mostrar"]) {
    assert.ok(comunidad.includes(id), id);
  }
});

/* --------------------------------------------------------- ensamblador -- */

test("armarCtaTexto con un gatillo de comunidad no cae en escasez ni añade presión", () => {
  // Sin detalle: la frase de ejemplo tal cual.
  assert.equal(
    armarCtaTexto("com_guardar", "guardar", ""),
    "Guárdalo para el domingo, que es cuando te va a tocar hacerlo en casa."
  );
  // Con detalle, para cada acción de comunidad y para las dos compartidas.
  for (const g of CTA_COMUNIDAD) {
    for (const accion of ctaAccionesDeModo("comunidad")) {
      const texto = armarCtaTexto(g.id, accion.id, "esto que acabas de ver");
      assert.doesNotMatch(texto, PRESION, `${g.id} + ${accion.id}: «${texto}»`);
      assert.doesNotMatch(texto, OFERTA, `${g.id} + ${accion.id}: «${texto}»`);
      assert.ok(texto.trim().length > 0);
    }
  }
  assert.equal(
    armarCtaTexto("com_compartir", "compartir", "a tu pata que nunca sabe qué regalar"),
    "Mándaselo a tu pata que nunca sabe qué regalar."
  );
  assert.equal(
    armarCtaTexto("com_pregunta", "opinar", "¿Y tú con qué lo acompañas?"),
    "¿Y tú con qué lo acompañas? Cuéntame abajo, leo todo."
  );
  assert.equal(armarCtaTexto("com_sin_pedido", "", "Nos vemos en el próximo, causa"), "Nos vemos en el próximo, causa.");
  assert.match(armarCtaTexto("com_quedate", "opinar", "el último error es el peor"), /^Quédate hasta el final/);
  // Un gatillo de venta sigue ensamblando como siempre (con su presión).
  assert.match(armarCtaTexto("escasez", "compra", "quedan 4 cupos"), /plazas/i);
});

test("coherenciaCta descarta gatillos y acciones que no son del modo enviado", () => {
  assert.deepEqual(coherenciaCta("comunidad", "escasez", "compra"), { gatillo: "", accion: "" });
  assert.deepEqual(coherenciaCta("comunidad", "com_guardar", "guardar"), { gatillo: "com_guardar", accion: "guardar" });
  // Un formulario viejo o manipulado que mande «comentar» en comunidad se queda sin acción.
  assert.deepEqual(coherenciaCta("comunidad", "com_pregunta", "comentar"), { gatillo: "com_pregunta", accion: "" });
  assert.deepEqual(coherenciaCta("comunidad", "com_pregunta", "opinar"), { gatillo: "com_pregunta", accion: "opinar" });
  assert.deepEqual(coherenciaCta("venta", "com_guardar", "guardar"), { gatillo: "", accion: "" });
  assert.deepEqual(coherenciaCta("venta", "escasez", "compra"), { gatillo: "escasez", accion: "compra" });
  assert.deepEqual(coherenciaCta("venta", "", ""), { gatillo: "", accion: "" });
});

/* -------------------------------------------------------------- prompt -- */

function entrada(extra: Partial<BuildPromptInput>): BuildPromptInput {
  return {
    structure: {
      name: "PAS",
      category: "VENDE",
      family: "Venta directa",
      summary: null,
      beats: "[]",
      systemPrompt: "",
      rules: "[]",
      examples: "[]",
      defaultDurationSec: 45,
    },
    brand: {
      name: "Waffle Love",
      whatsapp: "999 999 999",
      instagram: "@waffle.love",
    },
    archetype: null,
    references: [],
    request: "Un video de la masa de los waffles",
    durationSec: 45,
    ...extra,
  };
}

test("en modo comunidad el system prompt prohíbe vender y eso prevalece sobre la categoría VENDE", () => {
  const prompt = buildSystemPrompt(
    entrada({
      ctaMode: "comunidad",
      ctaTrigger: "com_guardar",
      ctaActionType: "guardar",
      ctaDetail: "para el domingo",
      cta: "Guárdalo para el domingo.",
    })
  );
  assert.match(prompt, /### CIERRE DE COMUNIDAD \(SIN VENTA\)/);
  assert.match(prompt, /PREVALECE sobre la categoría/);
  assert.ok(prompt.includes(PROHIBICION_CTA_COMUNIDAD), "falta la prohibición literal");
  assert.match(prompt, /Categoría: VENDE, pero en ESTE video el cierre es de comunidad/);
  assert.doesNotMatch(prompt, /GATILLOS DE ALEX HORMOZI/);
  assert.doesNotMatch(prompt, /obligatorio terminar en llamado a la acción/);
  // La acción va con su etiqueta, no con el id crudo, y los canales quedan fuera.
  assert.match(prompt, /Acción solicitada al espectador\*\*: Guardar el video/);
  assert.match(prompt, /Canales de la marca \(en este video NO se mencionan/);
  assert.match(prompt, /Guardar para después/);
  assert.match(prompt, /Texto acordado para el cierre\*\*: "Guárdalo para el domingo\."/);
});

test("en modo comunidad sin gatillo elegido igual se prohíbe vender", () => {
  const prompt = buildSystemPrompt(entrada({ ctaMode: "comunidad" }));
  assert.match(prompt, /### CIERRE DE COMUNIDAD \(SIN VENTA\)/);
  assert.ok(prompt.includes(PROHIBICION_CTA_COMUNIDAD));
  assert.match(prompt, /pregunta abierta que salga del contenido/);
});

test("el modo venta sigue produciendo el bloque de Hormozi con la acción etiquetada", () => {
  const prompt = buildSystemPrompt(
    entrada({ ctaMode: "venta", ctaTrigger: "escasez", ctaActionType: "seguir", cta: "Sígueme." })
  );
  assert.match(prompt, /GATILLOS DE ALEX HORMOZI/);
  assert.match(prompt, /Acción solicitada al espectador\*\*: Seguir cuenta/);
  assert.match(prompt, /Categoría: VENDE \(obligatorio terminar en llamado a la acción\)/);
  assert.match(prompt, /Canales para el CTA/);
  assert.doesNotMatch(prompt, /CIERRE DE COMUNIDAD/);

  // Sin modo ni gatillo, una estructura que entretiene cae en el aviso de siempre.
  const suelto = buildSystemPrompt(
    entrada({ structure: { ...entrada({}).structure, category: "ENTRETIENE" } })
  );
  assert.match(suelto, /NO vendas nada y deja "cta" en ""/);
});

test("el user prompt lleva el prefijo [Sin venta · …] solo en modo comunidad", () => {
  const comunidad = buildUserPrompt(
    entrada({ ctaMode: "comunidad", ctaTrigger: "com_compartir", cta: "Mándaselo a tu pata." })
  );
  assert.match(comunidad, /Estrategia de CTA: \[Sin venta · Mándaselo\] Mándaselo a tu pata\./);

  const sinGatillo = buildUserPrompt(entrada({ ctaMode: "comunidad" }));
  assert.match(sinGatillo, /Estrategia de CTA: \[Sin venta · Comunidad\]/);

  const venta = buildUserPrompt(entrada({ ctaMode: "venta", ctaTrigger: "urgencia", cta: "Hoy termina." }));
  assert.match(venta, /Estrategia de CTA: \[Urgencia\] Hoy termina\./);
  assert.doesNotMatch(venta, /Sin venta/);
});
