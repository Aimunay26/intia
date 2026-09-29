import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { SCREEN_IDS, SCREENS, SONY_LCD, lienzo, screenHotspots, stepPoint, stepView, type ScreenId, type ScreenSpec } from "../src/components/manual/device-guide-layout";
import { DEVICE_GUIDES, GUIDE_IDS, VARIA_SEGUN_VERSION, type DeviceGuide } from "../src/content/manual/guias";

/**
 * Guías ilustradas del manual (iPhone, Samsung y Sony ZV-E10): cobertura de GuideId,
 * integridad de cada paso contra el catálogo de maquetas y que el dedo caiga sobre
 * un elemento dibujado, dentro de la pantalla.
 *
 * Correr con: npx tsx --test tests/manual-guias.test.mts
 */

const ROOT = path.resolve(import.meta.dirname, "..");
const CONTRATO = [
  "iphone-log",
  "iphone-formato-4k",
  "iphone-foco-exposicion",
  "samsung-log",
  "samsung-formato-4k",
  "samsung-foco-exposicion",
  "zve10-formato",
  "zve10-log",
  "zve10-enfoque",
  "zve10-exposicion",
  "zve10-audio-y-energia",
];
const guias = (): DeviceGuide[] => GUIDE_IDS.map(id => DEVICE_GUIDES[id]);
const enRango = (n: number) => Number.isFinite(n) && n >= 0 && n <= 1;

/** La unión GuideId tal como está escrita en src/lib/manual.ts (fuente de verdad del contrato). */
function guideIdsDeManual(): string[] {
  const texto = fs.readFileSync(path.join(ROOT, "src/lib/manual.ts"), "utf8");
  const bloque = /export type GuideId\s*=([^;]+);/.exec(texto)?.[1] ?? "";
  return [...bloque.matchAll(/"([a-z0-9-]+)"/g)].map(m => m[1]);
}

/* ------------------------------------------------------------- COBERTURA -- */

test("cada GuideId del contrato y de src/lib/manual.ts tiene su guía, con el id correcto", () => {
  assert.deepEqual([...GUIDE_IDS].sort(), [...CONTRATO].sort());
  const delManual = guideIdsDeManual();
  assert.ok(delManual.length > 0, "src/lib/manual.ts debe declarar la unión GuideId");
  assert.deepEqual([...delManual].sort(), [...GUIDE_IDS].sort());
  for (const id of GUIDE_IDS) {
    const guia = DEVICE_GUIDES[id];
    assert.ok(guia, `falta la guía ${id}`);
    assert.equal(guia.id, id);
  }
  assert.equal(Object.keys(DEVICE_GUIDES).length, GUIDE_IDS.length);
});

test("cada guía corresponde a su equipo y usa solo maquetas de ese equipo (o del editor)", () => {
  const prefijos: Record<DeviceGuide["dispositivo"], { guia: string; pantalla: RegExp }> = {
    IPHONE: { guia: "iphone-", pantalla: /^(ios-|editor-)/ },
    SAMSUNG: { guia: "samsung-", pantalla: /^(sam-|editor-)/ },
    SONY_ZVE10: { guia: "zve10-", pantalla: /^(sony-|editor-)/ },
  };
  for (const guia of guias()) {
    const regla = prefijos[guia.dispositivo];
    assert.ok(regla, `${guia.id}: dispositivo desconocido`);
    assert.ok(guia.id.startsWith(regla.guia), `${guia.id} no es de ${guia.dispositivo}`);
    for (const paso of guia.pasos) assert.match(paso.pantalla, regla.pantalla, `${guia.id}: ${paso.pantalla} no es de ${guia.dispositivo}`);
  }
});

/* ---------------------------------------------------------------- TEXTOS -- */

test("títulos, requisitos, pasos y notas no están vacíos; fuentes oficiales por https", () => {
  const oficiales = /^https:\/\/(support\.apple\.com|www\.apple\.com|www\.blackmagicdesign\.com|www\.samsung\.com|developer\.samsung\.com|helpguide\.sony\.net|creatorscloud\.sony\.net|pro\.sony)\//;
  for (const guia of guias()) {
    assert.ok(guia.titulo.trim().length > 10, `${guia.id}: título`);
    assert.ok(guia.requisitos.length > 0 && guia.requisitos.every(r => r.trim().length > 5), `${guia.id}: requisitos`);
    assert.ok(guia.pasos.length >= 4, `${guia.id}: muy pocos pasos`);
    assert.ok(guia.notas.every(n => n.trim().length > 5), `${guia.id}: notas`);
    assert.ok(guia.fuentes.length > 0, `${guia.id}: sin fuentes`);
    assert.equal(new Set(guia.fuentes).size, guia.fuentes.length, `${guia.id}: fuentes repetidas`);
    for (const url of guia.fuentes) assert.match(url, oficiales, `${guia.id}: fuente no oficial ${url}`);
    for (const paso of guia.pasos) {
      assert.ok(paso.texto.trim().length >= 12, `${guia.id}: paso sin texto`);
      if (paso.detalle !== undefined) assert.ok(paso.detalle.trim().length > 5, `${guia.id}: detalle vacío`);
    }
  }
});

test("español con tildes: sin «camara», «configuracion» ni «guia» sueltos en textos visibles", () => {
  const sinTilde = /\b(camara|Camara|configuracion|Configuracion|exposicion|resolucion|Resolucion|version|guia|Guia)\b/;
  for (const guia of guias()) {
    const textos = [guia.titulo, ...guia.requisitos, ...guia.notas, ...guia.pasos.flatMap(p => [p.texto, p.detalle ?? "", p.resaltar ?? ""])];
    for (const texto of textos) assert.doesNotMatch(texto, sinTilde, `${guia.id}: «${texto.slice(0, 60)}…»`);
  }
  for (const id of SCREEN_IDS) assert.doesNotMatch(SCREENS[id].nombre, sinTilde, id);
});

test("los pasos de confianza baja o con menús que cambian lo advierten con «Puede variar según versión»", () => {
  const avisados: [string, ScreenId][] = [
    ["samsung-foco-exposicion", "sam-af-ae"],
    ["samsung-foco-exposicion", "sam-bloqueo"],
    ["samsung-foco-exposicion", "sam-camera-assistant"],
    ["samsung-formato-4k", "sam-relacion-aspecto"],
    ["samsung-formato-4k", "sam-galeria-info"],
    ["samsung-log", "sam-ajustes-camara-85"],
    ["zve10-log", "sony-toma-log"],
    ["iphone-log", "ios-camara-formato"],
  ];
  for (const [id, pantalla] of avisados) {
    const pasos = DEVICE_GUIDES[id as keyof typeof DEVICE_GUIDES].pasos.filter(p => p.pantalla === pantalla);
    assert.ok(pasos.length > 0, `${id}: no usa ${pantalla}`);
    assert.ok(pasos.some(p => p.detalle?.includes(VARIA_SEGUN_VERSION)), `${id} / ${pantalla}: falta «${VARIA_SEGUN_VERSION}»`);
  }
});

test("las guías dicen lo que el equipo NO puede cumplir (4K60/4K120/Log)", () => {
  const todo = (id: keyof typeof DEVICE_GUIDES) => {
    const g = DEVICE_GUIDES[id];
    return [...g.requisitos, ...g.notas, ...g.pasos.flatMap(p => [p.texto, p.detalle ?? ""])].join("\n");
  };
  assert.match(todo("iphone-log"), /SSD/);
  assert.match(todo("iphone-log"), /Final Cut Camera/);
  assert.match(todo("zve10-formato"), /NO graba 4K a 60/);
  assert.match(todo("samsung-formato-4k"), /A56/);
  assert.match(todo("samsung-log"), /serie A/);
});

/* ------------------------------------------------------- MAQUETAS Y DEDO -- */

test("cada paso usa una pantalla del catálogo; el dedo cae sobre un elemento dibujado y dentro de 0-1", () => {
  const catalogo = new Set<string>(SCREEN_IDS);
  for (const guia of guias()) {
    guia.pasos.forEach((paso, i) => {
      const donde = `${guia.id} paso ${i + 1}`;
      assert.ok(catalogo.has(paso.pantalla), `${donde}: pantalla desconocida ${paso.pantalla}`);
      if (paso.toque) assert.ok(enRango(paso.toque.x) && enRango(paso.toque.y), `${donde}: toque fuera de la pantalla`);
      if (paso.resaltar !== undefined) {
        const puntos = screenHotspots(paso.pantalla);
        assert.ok(Object.hasOwn(puntos, paso.resaltar), `${donde}: «${paso.resaltar}» no existe en ${paso.pantalla} (hay: ${Object.keys(puntos).join(", ")})`);
      }
      const punto = stepPoint(paso);
      if (paso.gesto) assert.ok(punto, `${donde}: tiene gesto pero no dónde tocar`);
      if (punto) assert.ok(enRango(punto.x) && enRango(punto.y), `${donde}: punto fuera de 0-1 (${punto.x}, ${punto.y})`);
    });
  }
});

test("catálogo de pantallas: nombre, lienzo válido, puntos dentro de 0-1 y todas se usan", () => {
  const usadas = new Set(guias().flatMap(g => g.pasos.map(p => p.pantalla)));
  for (const id of SCREEN_IDS) {
    const spec = SCREENS[id] as ScreenSpec;
    assert.ok(spec.nombre.trim().length > 5, `${id}: sin nombre`);
    const { w, h } = lienzo(spec);
    assert.ok(w > 0 && h > 0, `${id}: lienzo`);
    for (const [nombre, punto] of Object.entries(screenHotspots(id))) {
      assert.ok(enRango(punto.x) && enRango(punto.y), `${id} / ${nombre}: fuera de la pantalla`);
    }
    assert.ok(usadas.has(id), `${id}: ninguna guía la usa`);
  }
});

test("maquetas coherentes con la investigación: posiciones clave de iPhone y Samsung", () => {
  // Research: Grabar abajo al centro (0.5, 0.9); VIDEO en el carrusel (0.5, 0.82); formato arriba a la izquierda.
  const ios = screenHotspots("ios-camara-video");
  assert.deepEqual([ios.Grabar.x, Math.round(ios.Grabar.y * 100) / 100], [0.5, 0.9]);
  assert.equal(Math.round(ios.VIDEO.y * 100) / 100, 0.82);
  assert.ok(ios.Formato.x < 0.2 && ios.Formato.y < 0.1);
  // Los ojos del sujeto van en la línea superior de tercios (y = 1/3).
  assert.equal(Math.round(ios["Línea superior"].y * 1000) / 1000, 0.333);
  // Samsung One UI 7+: cuatro puntos abajo a la derecha (0.88, 0.76) y MÁS en el carrusel (0.85, 0.84).
  const sam = screenHotspots("sam-camara-video");
  assert.equal(Math.round(sam["Controles rápidos"].x * 100) / 100, 0.88);
  assert.equal(Math.round(sam["Controles rápidos"].y * 100) / 100, 0.76);
  assert.equal(Math.round(sam["MÁS"].y * 100) / 100, 0.84);
  // Sony: MENU arriba a la derecha del dorso y Present. producto abajo a la derecha.
  const sony = screenHotspots("sony-toma");
  assert.deepEqual([sony.MENU.x, sony.MENU.y], [0.8, 0.2]);
  assert.deepEqual([sony["Present. producto"].x, sony["Present. producto"].y], [0.88, 0.85]);
  // Interruptores de iOS a la derecha (≈ 0.88).
  assert.equal(Math.round(screenHotspots("ios-formatos")["Apple ProRes"].x * 100) / 100, 0.88);
});

test("vista de cada paso: la proporción sale de la maqueta del paso y la Sony se recorta a su pantalla", () => {
  for (const guia of guias()) {
    guia.pasos.forEach((paso, i) => {
      const donde = `${guia.id} paso ${i + 1}`;
      const vista = stepView(paso);
      const { w, h } = lienzo(SCREENS[paso.pantalla] as ScreenSpec);
      assert.ok(vista.vw >= w && vista.vh >= h, `${donde}: el dibujo debe contener el lienzo`);
      assert.equal(vista.apaisado, vista.vw > vista.vh, donde);
      // El editor de la LUT (último paso de las guías de celular) es apaisado aunque la guía sea de un celular.
      if (paso.pantalla === "editor-lut") assert.ok(vista.apaisado, `${donde}: el editor va en un contenedor apaisado`);
      if (/^(ios-|sam-)/.test(paso.pantalla)) assert.ok(!vista.apaisado && !vista.recorte, `${donde}: los celulares van en vertical y enteros`);
      if (vista.recorte) {
        assert.equal(guia.dispositivo, "SONY_ZVE10", donde);
        const punto = stepPoint(paso);
        if (punto) {
          const x = punto.x * w, y = punto.y * h;
          const r = vista.recorte;
          assert.ok(x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h, `${donde}: el dedo queda fuera del recorte`);
        }
      }
    });
  }
  // Los menús de la Sony se recortan a la pantalla; un botón del cuerpo (MENU) no.
  const menu = DEVICE_GUIDES["zve10-formato"].pasos.find(p => p.pantalla === "sony-menu-formato")!;
  assert.deepEqual(stepView(menu).recorte, { ...SONY_LCD });
  const boton = DEVICE_GUIDES["zve10-formato"].pasos.find(p => p.pantalla === "sony-toma" && p.resaltar === "MENU")!;
  assert.equal(stepView(boton).recorte, null);
});

/* ------------------------------------------------------------ CURRÍCULO -- */

test("las lecciones del manual solo enlazan guías que existen", () => {
  const dir = path.join(ROOT, "src/content/manual/roles");
  const validos = new Set<string>(GUIDE_IDS);
  for (const archivo of fs.readdirSync(dir).filter(f => f.endsWith(".json"))) {
    const rol = JSON.parse(fs.readFileSync(path.join(dir, archivo), "utf8")) as { levels: { modules: { lessons: { id: string; guia?: string }[] }[] }[] };
    for (const nivel of rol.levels)
      for (const modulo of nivel.modules)
        for (const leccion of modulo.lessons) {
          if (leccion.guia !== undefined) assert.ok(validos.has(leccion.guia), `${archivo} / ${leccion.id}: guía inexistente «${leccion.guia}»`);
        }
  }
});
