import assert from "node:assert/strict";
import { test } from "node:test";

import { PRODUCT_KINDS, isProductKind, type ProductKind } from "../src/lib/constants";
import {
  ANGULOS_CREATIVOS,
  CTA_ACTIONS,
  CTA_COMUNIDAD,
  CTA_TRIGGERS,
  angulosPara,
  armarCtaTexto,
  cierreInicialPara,
  coherenciaCta,
  ctaCatalogo,
  detallePlaceholderPara,
  encajaConTipo,
  etiquetaAccion,
  presetsPara,
  verboAccion,
} from "../src/lib/script-angles";

/**
 * Cierres y ángulos según el tipo de producto (PRODUCTO, SERVICIO, RESTAURANTE).
 * Una polera no puede arrancar con «solo puedo atender a 9 clientes»; con el
 * tipo desconocido (catálogo apagado) todo tiene que salir como siempre.
 *
 * Correr con: npx tsx --test tests/presets-tipo.test.mts
 */

const TIPOS = PRODUCT_KINDS.map((k) => k.value as ProductKind);

/** Vocabulario de servicio que una fórmula para producto no puede traer. */
const SERVICIO = /atender a \d+ clientes|asesor|agenda|cupo|plazas/i;

/** Las fórmulas que hoy muestra cada gatillo de venta, en su orden. */
const PRESETS_DE_HOY: Record<string, string[]> = {
  escasez: ["Capacidad de clientes (Hormozi)", "Lote único no reimpreso", "Horarios de agenda que se llenan"],
  urgencia: ["Medianoche / Cuenta regresiva", "Bono exclusivo que desaparece", "Subida de precio inminente"],
  motivo_fraternidad: ["Celebración / Aniversario", "Hito / Lanzamiento", "Causa o convicción"],
  incentivo_regalo: [
    "Guía a los primeros 10 (Usuario)",
    "Plantilla / Checklist por palabra clave",
    "Auditoría o diagnóstico rápido",
  ],
  impacto_visual: [
    "Mostrar el documento en tablet / mano",
    "Resultado antes vs después tangible",
    "Empaque / Unboxing en el cierre",
  ],
  directo: ["Enlace en Bio", "Mensaje Directo (DM)", "Seguir para más contenido"],
};

/* ------------------------------------------------------ tipo desconocido -- */

test("con el tipo desconocido las fórmulas, el cierre inicial y los ángulos son los de siempre", () => {
  assert.deepEqual(Object.keys(PRESETS_DE_HOY), CTA_TRIGGERS.map((g) => g.id));
  for (const g of CTA_TRIGGERS) {
    assert.equal(presetsPara(g.id, null), g.presets, `${g.id}: debe ser el mismo arreglo`);
    assert.deepEqual(g.presets.map((p) => p.label), PRESETS_DE_HOY[g.id], `${g.id}: cambió la lista de siempre`);
  }
  for (const g of CTA_COMUNIDAD) assert.equal(presetsPara(g.id, null), g.presets, g.id);
  assert.deepEqual(presetsPara("no_existe", null), []);
  assert.deepEqual(presetsPara("no_existe", "PRODUCTO"), []);

  // Lo mismo que hacía cierreInicial(modo) en el generador: primer gatillo, primera fórmula.
  for (const modo of ["venta", "comunidad"] as const) {
    const gatillo = ctaCatalogo(modo)[0];
    const preset = gatillo.presets[0];
    assert.deepEqual(cierreInicialPara(modo, null), {
      gatillo: gatillo.id,
      accion: preset.accion,
      detalle: preset.detalle,
      texto: preset.textoCompleto,
    });
  }
  assert.deepEqual(cierreInicialPara("venta", null), {
    gatillo: "escasez",
    accion: "compra",
    detalle: "Solo puedo atender a 9 clientes y ya tengo 5, las plazas de atención se llenan",
    texto:
      "Si no me compras ahora solo puedo atender a 9 clientes y ya tengo 5 clientes, así que ya lo sabes: las plazas de atención se llenan y conmigo vas a conseguir los resultados que quieres.",
  });
  assert.equal(cierreInicialPara("comunidad", null).gatillo, "com_seguir_serie");

  assert.equal(angulosPara(null), ANGULOS_CREATIVOS);
  assert.equal(angulosPara(null, ["unboxing_asmr", "detras_de_camaras"]), ANGULOS_CREATIVOS);

  for (const a of CTA_ACTIONS) {
    assert.equal(etiquetaAccion(a.id, null), a.label, a.id);
    assert.equal(verboAccion(a.id, null), a.verbo, a.id);
  }
  assert.equal(etiquetaAccion("no_existe", null), "no_existe");

  for (const g of [...CTA_TRIGGERS, ...CTA_COMUNIDAD]) {
    assert.equal(detallePlaceholderPara(g.id, null), g.defaultDetailPlaceholder, g.id);
  }
  assert.equal(detallePlaceholderPara("no_existe", "PRODUCTO"), "");
});

test("armarCtaTexto sin tipo arma exactamente lo de siempre", () => {
  // Las frases fijadas en tests/cta-comunidad.test.mts.
  assert.equal(
    armarCtaTexto("com_guardar", "guardar", ""),
    "Guárdalo para el domingo, que es cuando te va a tocar hacerlo en casa."
  );
  assert.equal(
    armarCtaTexto("com_compartir", "compartir", "a tu pata que nunca sabe qué regalar"),
    "Mándaselo a tu pata que nunca sabe qué regalar."
  );
  assert.equal(
    armarCtaTexto("com_pregunta", "opinar", "¿Y tú con qué lo acompañas?"),
    "¿Y tú con qué lo acompañas? Cuéntame abajo, leo todo."
  );
  assert.equal(armarCtaTexto("com_sin_pedido", "", "Nos vemos en el próximo, causa"), "Nos vemos en el próximo, causa.");
  assert.match(armarCtaTexto("escasez", "compra", "quedan 4 cupos"), /plazas/i);

  // Las frases de escasez de antes de este cambio, acción por acción.
  const det = "quedan 4 cupos";
  assert.equal(
    armarCtaTexto("escasez", "compra", det),
    "Si no tomas acción ahora: quedan 4 cupos. Las plazas se llenan, así que asegura la tuya hoy mismo."
  );
  assert.equal(armarCtaTexto("escasez", "seguir", det), "Sígueme ahora mismo: quedan 4 cupos. ¡No te quedes sin tu espacio!");
  assert.equal(
    armarCtaTexto("escasez", "comentar", det),
    "quedan 4 cupos. Comenta «QUIERO» aquí abajo antes de que se cierren las plazas."
  );
  assert.equal(
    armarCtaTexto("escasez", "bio", det),
    "quedan 4 cupos. Ve al enlace de mi perfil para asegurar tu lugar antes de que se agoten."
  );
  assert.equal(
    armarCtaTexto("escasez", "dm", det),
    "quedan 4 cupos. Mándame un mensaje directo con la palabra «CUPO» para ver si aún alcanzas."
  );
  assert.equal(armarCtaTexto("directo", "compra", "x"), "Separa tu cupo para más información: x");
  assert.equal(armarCtaTexto("incentivo_regalo", "bio", "la guía"), "Ve al enlace en mi perfil para descargar gratis: la guía.");

  // Sin detalle: la fórmula de la acción o, si no hay, la primera; nunca una de las nuevas por tipo.
  const escasez = CTA_TRIGGERS[0];
  assert.equal(armarCtaTexto("escasez", "bio", ""), escasez.presets[1].textoCompleto);
  assert.equal(armarCtaTexto("escasez", "comentar", ""), escasez.presets[0].textoCompleto);
  assert.equal(armarCtaTexto("incentivo_regalo", "compra", ""), CTA_TRIGGERS[3].presets[0].textoCompleto);

  // undefined y null son lo mismo que no pasar el tipo.
  for (const g of [...CTA_TRIGGERS, ...CTA_COMUNIDAD]) {
    for (const a of CTA_ACTIONS) {
      for (const d of ["", "quedan 4"]) {
        const base = armarCtaTexto(g.id, a.id, d);
        assert.equal(armarCtaTexto(g.id, a.id, d, undefined), base);
        assert.equal(armarCtaTexto(g.id, a.id, d, null), base);
      }
    }
  }
});

/* ---------------------------------------------------------- por tipo -- */

test("con PRODUCTO ningún gatillo de venta arranca con una fórmula de servicio", () => {
  for (const g of CTA_TRIGGERS) {
    const primera = presetsPara(g.id, "PRODUCTO")[0];
    assert.ok(primera, `${g.id}: sin fórmula para PRODUCTO`);
    for (const texto of [primera.label, primera.detalle, primera.textoCompleto]) {
      assert.doesNotMatch(texto, SERVICIO, `${g.id}: «${texto}»`);
    }
  }
  const cierre = cierreInicialPara("venta", "PRODUCTO");
  assert.equal(cierre.gatillo, "escasez");
  assert.equal(cierre.detalle, CTA_TRIGGERS[0].presets[1].detalle, "debe ser «Lote único no reimpreso»");
  assert.doesNotMatch(cierre.texto, SERVICIO);
  assert.doesNotMatch(cierre.detalle, SERVICIO);
});

test("ninguna fórmula que se ofrece a PRODUCTO o RESTAURANTE habla de clientes, agenda, cupos ni plazas", () => {
  for (const kind of ["PRODUCTO", "RESTAURANTE"] as const) {
    for (const g of CTA_TRIGGERS) {
      for (const p of presetsPara(g.id, kind)) {
        for (const texto of [p.label, p.detalle, p.textoCompleto]) {
          assert.doesNotMatch(texto, SERVICIO, `${kind} · ${g.id}: «${texto}»`);
        }
      }
    }
    const cierre = cierreInicialPara("venta", kind);
    assert.doesNotMatch(cierre.texto, SERVICIO, kind);
    for (const g of ["escasez", "incentivo_regalo"]) {
      assert.doesNotMatch(detallePlaceholderPara(g, kind), SERVICIO, `${kind} · ${g}`);
    }
  }
  assert.equal(cierreInicialPara("venta", "RESTAURANTE").gatillo, "escasez");
  assert.match(cierreInicialPara("venta", "RESTAURANTE").texto, /porciones/);
  // Un servicio sigue arrancando como hoy.
  assert.deepEqual(cierreInicialPara("venta", "SERVICIO"), cierreInicialPara("venta", null));
  // El modo comunidad no depende del tipo.
  for (const kind of TIPOS) assert.deepEqual(cierreInicialPara("comunidad", kind), cierreInicialPara("comunidad", null));
});

test("cada tipo tiene al menos una fórmula en cada gatillo de venta, con una acción de venta", () => {
  for (const kind of TIPOS) {
    for (const g of CTA_TRIGGERS) {
      const lista = presetsPara(g.id, kind);
      assert.ok(lista.length >= 1, `${kind} · ${g.id}: sin fórmulas`);
      for (const p of lista) {
        assert.ok(encajaConTipo(p, kind), `${kind} · ${g.id}: «${p.label}» no encaja`);
        assert.equal(coherenciaCta("venta", g.id, p.accion).accion, p.accion, `${g.id}: acción «${p.accion}»`);
      }
      // Primero las de siempre, después las propias del tipo, sin reordenar.
      const deSiempre = g.presets.filter((p) => encajaConTipo(p, kind));
      assert.deepEqual(lista.slice(0, deSiempre.length), deSiempre, `${kind} · ${g.id}`);
    }
  }
});

test("las fórmulas por tipo están etiquetadas, con títulos cortos y sin repetirse", () => {
  for (const g of [...CTA_TRIGGERS, ...CTA_COMUNIDAD]) {
    for (const p of [...g.presets, ...(g.presetsPorTipo ?? [])]) {
      for (const t of p.tipos ?? []) assert.ok(isProductKind(t), `${g.id}: tipo «${t}»`);
    }
    for (const p of g.presetsPorTipo ?? []) {
      assert.ok(p.tipos && p.tipos.length > 0, `${g.id}: «${p.label}» sin tipos`);
      assert.ok(!p.tipos.includes("SERVICIO"), `${g.id}: «${p.label}» es de servicio`);
      assert.ok(p.label.length <= 30, `${g.id}: título largo «${p.label}»`);
    }
    const labels = [...g.presets, ...(g.presetsPorTipo ?? [])].map((p) => p.label);
    assert.equal(new Set(labels).size, labels.length, `${g.id}: títulos repetidos`);
  }
  // Las de comunidad no se tocan.
  for (const g of CTA_COMUNIDAD) {
    assert.equal(g.presetsPorTipo, undefined, g.id);
    for (const kind of TIPOS) assert.deepEqual(presetsPara(g.id, kind), g.presets, `${kind} · ${g.id}`);
  }
  // Las fórmulas de servicio de siempre quedan marcadas.
  const deServicio = CTA_TRIGGERS.flatMap((g) => g.presets).filter((p) => p.tipos?.includes("SERVICIO"));
  for (const label of [
    "Capacidad de clientes (Hormozi)",
    "Horarios de agenda que se llenan",
    "Guía a los primeros 10 (Usuario)",
    "Plantilla / Checklist por palabra clave",
    "Auditoría o diagnóstico rápido",
    "Resultado antes vs después tangible",
    "Causa o convicción",
  ]) {
    assert.ok(deServicio.some((p) => p.label === label), label);
  }
});

test("ninguna fórmula de ningún gatillo para PRODUCTO o RESTAURANTE suena a asesoría (ni su ejemplo de detalle)", () => {
  // Más amplio que SERVICIO: también el pitch de coaching («empecemos», «dejar de improvisar») y el documento en mano.
  const ASESORIA = /asesor|agenda|cupo|clientes|empecemos|improvisar|documento/i;
  for (const kind of ["PRODUCTO", "RESTAURANTE"] as const) {
    for (const g of CTA_TRIGGERS) {
      for (const p of presetsPara(g.id, kind)) {
        for (const texto of [p.label, p.detalle, p.textoCompleto]) {
          assert.doesNotMatch(texto, ASESORIA, `${kind} · ${g.id}: «${texto}»`);
        }
      }
      assert.doesNotMatch(detallePlaceholderPara(g.id, kind), ASESORIA, `${kind} · ${g.id}: ejemplo del detalle`);
    }
  }
  // El gatillo de Impacto Visual ya no arranca con «Resultado antes vs después» para una polera.
  assert.equal(presetsPara("impacto_visual", "PRODUCTO")[0].label, "Empaque / Unboxing en el cierre");
  assert.equal(presetsPara("impacto_visual", "SERVICIO")[1].label, "Resultado antes vs después tangible");
});

test("angulosPara quita los que no encajan y pone primero los recomendados", () => {
  const ids = (kind: ProductKind, rec?: string[]) => angulosPara(kind, rec).map((a) => a.id);
  assert.ok(ids("PRODUCTO").includes("unboxing_asmr"));
  assert.ok(ids("RESTAURANTE").includes("unboxing_asmr"));
  assert.ok(!ids("SERVICIO").includes("unboxing_asmr"));
  // Sin recomendados, el orden del catálogo.
  assert.deepEqual(ids("PRODUCTO"), ANGULOS_CREATIVOS.map((a) => a.id));
  assert.deepEqual(
    ids("SERVICIO"),
    ANGULOS_CREATIVOS.filter((a) => a.id !== "unboxing_asmr").map((a) => a.id)
  );

  const rec = ["unboxing_asmr", "impacto_visual", "no_existe", "impacto_visual"];
  const producto = ids("PRODUCTO", rec);
  assert.deepEqual(producto.slice(0, 2), ["unboxing_asmr", "impacto_visual"]);
  assert.equal(new Set(producto).size, producto.length);
  assert.equal(producto.length, ANGULOS_CREATIVOS.length);
  const servicio = ids("SERVICIO", rec);
  assert.equal(servicio[0], "impacto_visual");
  assert.ok(!servicio.includes("unboxing_asmr"));
  assert.equal(servicio.length, ANGULOS_CREATIVOS.length - 1);
});

test("etiquetaAccion nombra la compra según el tipo sin tocar label ni verbo", () => {
  assert.equal(etiquetaAccion("compra", "PRODUCTO"), "Comprar");
  assert.equal(etiquetaAccion("compra", "SERVICIO"), "Reservar cupo");
  assert.equal(etiquetaAccion("compra", "RESTAURANTE"), "Pedir / reservar");
  assert.doesNotMatch(verboAccion("compra", "PRODUCTO"), /cupo/i);
  assert.doesNotMatch(verboAccion("compra", "RESTAURANTE"), /cupo/i);
  assert.equal(verboAccion("compra", "SERVICIO"), "Separa tu cupo");
  const compra = CTA_ACTIONS.find((a) => a.id === "compra");
  assert.equal(compra?.label, "Comprar / Reservar cupo");
  assert.equal(compra?.verbo, "Separa tu cupo");
  // El resto de acciones se llama igual con cualquier tipo.
  for (const a of CTA_ACTIONS.filter((x) => x.id !== "compra")) {
    for (const kind of TIPOS) {
      assert.equal(etiquetaAccion(a.id, kind), a.label, `${kind} · ${a.id}`);
      assert.equal(verboAccion(a.id, kind), a.verbo, `${kind} · ${a.id}`);
    }
  }
});

test("armarCtaTexto con tipo cambia plazas y cupo por unidades, o por porciones y mesas", () => {
  const ventas = CTA_ACTIONS.filter((a) => a.modo === "venta" || !a.modo).map((a) => a.id);
  for (const accion of ventas) {
    const producto = armarCtaTexto("escasez", accion, "quedan 7 en talla M", "PRODUCTO");
    assert.doesNotMatch(producto, /plazas|cupo|espacio|tu lugar/i, `PRODUCTO · ${accion}: «${producto}»`);
    assert.match(producto, /unidades|el tuyo/, `PRODUCTO · ${accion}: «${producto}»`);

    const plato = armarCtaTexto("escasez", accion, "hoy solo hay 30", "RESTAURANTE");
    assert.doesNotMatch(plato, /plazas|cupo|espacio|tu lugar/i, `RESTAURANTE · ${accion}: «${plato}»`);
    assert.match(plato, /porci[oó]n|mesa|probarlo/, `RESTAURANTE · ${accion}: «${plato}»`);
  }
  assert.match(armarCtaTexto("escasez", "compra", "quedan 7", "PRODUCTO"), /unidades/);
  assert.match(armarCtaTexto("escasez", "compra", "quedan 30", "RESTAURANTE"), /porciones y las mesas/);

  // Un regalo de producto se lleva con el pedido, no se descarga.
  for (const kind of ["PRODUCTO", "RESTAURANTE"] as const) {
    for (const accion of ["seguir", "comentar", "dm", "bio"]) {
      const texto = armarCtaTexto("incentivo_regalo", accion, "un llavero de regalo", kind);
      assert.doesNotMatch(texto, /descargar|te compartiré|te lo envío de inmediato/i, `${kind} · ${accion}: «${texto}»`);
      assert.match(texto, /un llavero de regalo/);
    }
  }
  assert.equal(armarCtaTexto("directo", "compra", "x", "PRODUCTO"), "Pide el tuyo para más información: x");
  assert.equal(armarCtaTexto("directo", "bio", "x", "PRODUCTO"), armarCtaTexto("directo", "bio", "x"));

  // Sin detalle, la fórmula sale del tipo.
  for (const kind of ["PRODUCTO", "RESTAURANTE"] as const) {
    for (const g of CTA_TRIGGERS) {
      for (const accion of ventas) {
        const texto = armarCtaTexto(g.id, accion, "", kind);
        assert.ok(
          presetsPara(g.id, kind).some((p) => p.textoCompleto === texto),
          `${kind} · ${g.id} · ${accion}: «${texto}»`
        );
        assert.doesNotMatch(texto, SERVICIO, `${kind} · ${g.id} · ${accion}`);
      }
    }
  }

  // Con SERVICIO y con detalle, la frase de siempre; comunidad no cambia con ningún tipo.
  for (const g of CTA_TRIGGERS) {
    for (const a of CTA_ACTIONS) {
      assert.equal(armarCtaTexto(g.id, a.id, "quedan 4", "SERVICIO"), armarCtaTexto(g.id, a.id, "quedan 4"), `${g.id} · ${a.id}`);
    }
  }
  for (const g of CTA_COMUNIDAD) {
    for (const a of CTA_ACTIONS) {
      for (const kind of TIPOS) {
        for (const d of ["", "esto que acabas de ver"]) {
          assert.equal(armarCtaTexto(g.id, a.id, d, kind), armarCtaTexto(g.id, a.id, d), `${kind} · ${g.id} · ${a.id}`);
        }
      }
    }
  }
});
