import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { MANUAL_ROLE_INDEX } from "../src/content/manual/index";
import {
  getManualModule,
  getManualRole,
  levelFromParam,
  manualEnabled,
  orderManualRoles,
  viewerManualRoles,
  youtubeId,
  type ManualRole,
} from "../src/lib/manual";
import {
  cameraPlacement,
  kelvinToHex,
  parseBeats,
  parseCamera,
  parseEnvironment,
  parseLighting,
  parseScene3d,
  parseSubjects,
  verticalFov,
} from "../src/lib/manual-scene";

/**
 * Manual de procedimientos: kill-switch, orden «Tu rol», YouTube, integridad del
 * contenido y el traductor de escenas 3D (texto → configuración tipada).
 *
 * Correr con: npx tsx --test tests/manual.test.mts
 */

const ROLES_DIR = path.resolve(import.meta.dirname, "..", "src/content/manual/roles");
const roleFiles = (): ManualRole[] => MANUAL_ROLE_INDEX.map(role => JSON.parse(fs.readFileSync(path.join(ROLES_DIR, `${role.slug}.json`), "utf8")) as ManualRole);

/* ------------------------------------------------------------ INTERRUPTOR -- */

test("kill-switch: encendido por defecto; solo «false» exacto lo apaga", () => {
  assert.equal(manualEnabled({}), true);
  assert.equal(manualEnabled({ MANUAL_PROCEDIMIENTOS_ENABLED: "true" }), true);
  assert.equal(manualEnabled({ MANUAL_PROCEDIMIENTOS_ENABLED: "0" }), true);
  assert.equal(manualEnabled({ MANUAL_PROCEDIMIENTOS_ENABLED: "FALSE" }), true);
  assert.equal(manualEnabled({ MANUAL_PROCEDIMIENTOS_ENABLED: "false" }), false);
});

/* ------------------------------------------------------------------ ORDEN -- */

test("perfiles → manuales: el Dueño lleva su manual y EDITOR abre editor y jefe de editores", () => {
  assert.deepEqual(viewerManualRoles({ role: "OWNER" }), ["DUENO"]);
  assert.deepEqual(viewerManualRoles({ role: "MEMBER", profiles: ["EDITOR"] }), ["EDITOR", "JEFE_EDITORES"]);
  assert.deepEqual(viewerManualRoles({ role: "MEMBER", profiles: ["TALENT", "WRITER"] }), ["GUIONISTA", "ACTOR"]);
  assert.deepEqual(viewerManualRoles({ role: "MEMBER", profiles: ["CAMERA", "PUBLISHER"] }), ["FILMMAKER", "COMMUNITY"]);
  assert.deepEqual(viewerManualRoles({ role: "MEMBER", profiles: ["STRATEGY", "ANALYST", "INVENTADO"] }), []);
  assert.deepEqual(viewerManualRoles({ role: "MEMBER" }), []);
});

test("orden de tarjetas: las propias primero y, dentro de cada grupo, el orden del flujo", () => {
  const flow = ["GUIONISTA", "FILMMAKER", "ACTOR", "EDITOR", "JEFE_EDITORES", "COMMUNITY", "ATC", "DUENO"];
  assert.deepEqual(MANUAL_ROLE_INDEX.map(role => role.id), flow);
  assert.deepEqual(orderManualRoles(MANUAL_ROLE_INDEX, []).map(role => role.id), flow);
  const talent = orderManualRoles(MANUAL_ROLE_INDEX, viewerManualRoles({ role: "MEMBER", profiles: ["TALENT"] }));
  assert.deepEqual(talent.map(role => role.id), ["ACTOR", "GUIONISTA", "FILMMAKER", "EDITOR", "JEFE_EDITORES", "COMMUNITY", "ATC", "DUENO"]);
  assert.deepEqual(talent.map(role => role.mine), [true, false, false, false, false, false, false, false]);
  const owner = orderManualRoles(MANUAL_ROLE_INDEX, viewerManualRoles({ role: "OWNER" }));
  assert.equal(owner[0].id, "DUENO");
  // Entrada desordenada: el resultado sigue el flujo igual.
  const shuffled = [...MANUAL_ROLE_INDEX].reverse();
  assert.deepEqual(orderManualRoles(shuffled, ["COMMUNITY", "FILMMAKER"]).map(role => role.id).slice(0, 3), ["FILMMAKER", "COMMUNITY", "GUIONISTA"]);
});

test("niveles por parámetro: valores válidos y respaldo en principiante", () => {
  assert.equal(levelFromParam("avanzado").value, "AVANZADO");
  assert.equal(levelFromParam("intermedio").value, "INTERMEDIO");
  assert.equal(levelFromParam("AVANZADO").value, "PRINCIPIANTE");
  assert.equal(levelFromParam(undefined).value, "PRINCIPIANTE");
});

/* ---------------------------------------------------------------- YOUTUBE -- */

test("youtubeId acepta watch?v=, youtu.be, shorts, embed y rechaza lo demás", () => {
  assert.equal(youtubeId("https://www.youtube.com/watch?v=ac5GwDEXHP8"), "ac5GwDEXHP8");
  assert.equal(youtubeId("https://youtube.com/watch?v=ac5GwDEXHP8&t=42s&list=PL1"), "ac5GwDEXHP8");
  assert.equal(youtubeId("https://m.youtube.com/watch?feature=share&v=ac5GwDEXHP8"), "ac5GwDEXHP8");
  assert.equal(youtubeId("https://youtu.be/ac5GwDEXHP8?si=abc"), "ac5GwDEXHP8");
  assert.equal(youtubeId("https://www.youtube.com/shorts/RpEWlyTDXAs"), "RpEWlyTDXAs");
  assert.equal(youtubeId("https://www.youtube-nocookie.com/embed/sbhqlFRubeQ?start=3"), "sbhqlFRubeQ");
  assert.equal(youtubeId("  https://www.youtube.com/watch?v=ac5GwDEXHP8  "), "ac5GwDEXHP8");
  assert.equal(youtubeId("https://evil.example/watch?v=ac5GwDEXHP8"), null);
  assert.equal(youtubeId("https://www.youtube.com/watch?v=corto"), null);
  assert.equal(youtubeId("https://www.youtube.com/watch?v=ac5GwDEXHP8<script>"), null);
  assert.equal(youtubeId("javascript:alert(1)"), null);
  assert.equal(youtubeId("no es una url"), null);
});

/* ---------------------------------------------------------------- CONTENIDO -- */

test("contenido: índice, archivos por rol, módulos, lecciones y videos coinciden", async () => {
  const roles = roleFiles();
  const slugs = new Set<string>();
  const lessonIds = new Set<string>();
  let lessonsTotal = 0;
  for (const [index, role] of roles.entries()) {
    const summary = MANUAL_ROLE_INDEX[index];
    assert.equal(role.id, summary.id);
    assert.equal(role.slug, summary.slug);
    assert.deepEqual(role.levels.map(level => level.level), ["PRINCIPIANTE", "INTERMEDIO", "AVANZADO"]);
    const modules = role.levels.flatMap(level => level.modules);
    const lessons = modules.flatMap(module => module.lessons);
    lessonsTotal += lessons.length;
    assert.equal(modules.length, summary.modules, `${role.slug}: módulos`);
    assert.equal(lessons.length, summary.lessons, `${role.slug}: lecciones`);
    assert.equal(modules.reduce((sum, module) => sum + module.videos.length, 0), summary.videos, `${role.slug}: videos`);
    assert.equal(lessons.filter(lesson => lesson.mediaType === "ESCENA_3D").length, summary.scenes, `${role.slug}: escenas`);
    assert.ok(role.mission && role.sop.length >= 3, `${role.slug}: misión y procedimiento`);
    for (const module of modules) {
      assert.match(module.slug, /^[a-z0-9-]+$/);
      assert.ok(!slugs.has(module.slug), `módulo repetido ${module.slug}`);
      slugs.add(module.slug);
      for (const video of module.videos) assert.ok(youtubeId(video.url), `${module.slug}: URL de YouTube inválida ${video.url}`);
      for (const lesson of module.lessons) {
        assert.ok(!lessonIds.has(lesson.id), `lección repetida ${lesson.id}`);
        lessonIds.add(lesson.id);
        assert.ok(lesson.title && lesson.objective, `${lesson.id}: título y objetivo`);
        assert.equal(Boolean(lesson.scene3d), lesson.mediaType === "ESCENA_3D", `${lesson.id}: escena 3D`);
        assert.ok(!("youtubeQueries" in lesson) && !("sources" in lesson), `${lesson.id}: campos de investigación fuera del runtime`);
      }
    }
  }
  assert.equal(slugs.size, 135);
  assert.equal(lessonsTotal, 618);
  const loaded = await getManualRole("filmmaker");
  assert.equal(loaded?.id, "FILMMAKER");
  assert.equal(await getManualRole("__proto__"), null);
  assert.equal(await getManualRole("constructor"), null);
  const found = await getManualModule("filmmaker", "fm-p2");
  assert.equal(found?.module.title, "Tamaños de plano");
  assert.equal(found?.level.level, "PRINCIPIANTE");
  assert.equal(found?.previous?.slug, "fm-p1");
  assert.equal(found?.next?.slug, "fm-p3");
  assert.equal(await getManualModule("actor", "fm-p2"), null);
});

/* ------------------------------------------------------------ ESCENA 3D -- */

test("escena vacía o desconocida: valores prudentes", () => {
  for (const input of [null, undefined, {}, { environment: "Un lugar cualquiera", camera: "algo", lighting: "???", beats: [] }]) {
    const scene = parseScene3d(input);
    assert.equal(scene.environment, "estudio");
    assert.deepEqual(scene.camera.shots, ["medio"]);
    assert.equal(scene.camera.angle, "ojos");
    assert.equal(scene.camera.focalMm, 26);
    assert.equal(scene.camera.move, "fija");
    assert.deepEqual(scene.lights.map(light => light.role), ["key", "fill"]);
    assert.equal(scene.subjects.count, 1);
    assert.equal(scene.beats.length, 1);
    assert.ok(scene.duration > 0);
  }
});

test("entorno: gana la primera palabra clave del texto", () => {
  assert.equal(parseEnvironment("Taller de Con Amor: mesa de madera con una taza blanca"), "tienda");
  assert.equal(parseEnvironment("Plaza de una ciudad andina (tipo Huancayo) con bancas"), "calle");
  assert.equal(parseEnvironment("Sala pequeña con sofá y pared lisa"), "sala");
  assert.equal(parseEnvironment("Fondo de cartulina crema de Con Amor y una mesa de 0,75 m"), "estudio");
  assert.equal(parseEnvironment("Mesa de restaurante con un plato de ceviche"), "mesa");
  assert.equal(parseEnvironment("Vereda frente a la tienda"), "calle");
  assert.equal(parseEnvironment("ESTUDIO BLANCO INFINITO"), "estudio");
});

test("cámara: planos en orden, ángulos, lente y movimiento", () => {
  const sizes = parseCamera("(1) Plano general: lente principal. (2) Plano medio a la altura del pecho. (3) Primer plano con 2x. (4) Plano detalle del nombre.");
  assert.deepEqual(sizes.shots, ["general", "medio", "primerPlano", "detalle"]);
  assert.deepEqual(parseCamera("Plano medio corto a 50 mm").shots, ["medioCorto"]);
  assert.equal(parseCamera("Contrapicado desde 40 cm del piso").angle, "contrapicado");
  assert.equal(parseCamera("Picado suave desde arriba").angle, "picado");
  assert.equal(parseCamera("Cenital sobre la mesa, 90 cm").angle, "cenital");
  assert.equal(parseCamera("Encuadre holandés inclinado").angle, "holandes");
  assert.equal(parseCamera("Celular a 2x, plano medio").focalMm, 52);
  assert.equal(parseCamera("Lente de 48 mm (2x)").focalMm, 48);
  assert.equal(parseCamera("Paneo lento de izquierda a derecha").move, "paneo");
  assert.equal(parseCamera("Push-in lento hacia el rostro").move, "pushIn");
  assert.equal(parseCamera("Seguimiento con gimbal de 3 ejes").move, "seguimiento");
  assert.equal(parseCamera("Órbita de 180° alrededor del producto").move, "orbita");
  assert.equal(parseCamera("Travelling lateral en slider de 80 cm").move, "travelling");
  assert.equal(parseCamera("Cámara en mano, estilo vlog").handheld, true);
  // La cámara de observación no es el celular: su lente y su ángulo no cuentan.
  const observed = parseCamera("Cámara de observación cenital en (2.2,1.6,2.6), 35 mm, fija. Recuadro 9:16: lente de 48 mm a la altura de los ojos.");
  assert.equal(observed.focalMm, 48);
  assert.equal(observed.angle, "ojos");
  // Con varios planos, el «dolly» es la transición entre posiciones.
  assert.equal(parseCamera("Dolly lineal: plano entero, plano americano y primer plano").move, "fija");
});

test("luces: 3 puntos, ventana, temperatura, dureza y notas ignoradas", () => {
  const window = parseLighting("Luz principal suave de ventana a 45° por la izquierda (≈5600 K), rebotador blanco de relleno a la derecha y contraluz tenue cálido (≈3200 K) detrás de la actriz para separarla del fondo.");
  assert.deepEqual(window.lights.map(light => light.role), ["key", "fill", "back"]);
  assert.equal(window.lights[0].source, "window");
  assert.equal(window.lights[0].side, -1);
  assert.equal(window.lights[1].side, 1);
  assert.equal(window.lights[2].kelvin, 3200);
  assert.ok(window.labels.includes("3 puntos") && window.labels.includes("Ventana lateral"));

  const studio = parseLighting("Key: softbox de 90 cm a 45° cámara-izquierda en (-1,0, 2,1, 1,0), 5600 K, 100%. Relleno: panel blanco de rebote en (1,0, 1,2, 0,8). Contraluz: LED de 30 cm en (0,5, 2,4, -1,0), 5600 K, 40%.");
  assert.deepEqual(studio.lights.map(light => `${light.role}:${light.source}`), ["key:softbox", "fill:bounce", "back:led"]);
  assert.equal(studio.lights[2].intensity, 0.4);

  const cloudy = parseLighting("Luz natural nublada y difusa (≈6500 K). Nota: evitar el contraluz del cielo en la cámara A.");
  assert.equal(cloudy.lights[0].source, "sun");
  assert.equal(cloudy.lights[0].kelvin, 6500);
  assert.ok(!cloudy.lights.some(light => light.role === "back"));
  assert.ok(cloudy.labels.includes("Fría"));

  assert.equal(parseLighting("Luz dura del sol directo de mediodía").lights[0].hard, true);
  const three = parseLighting("Esquema clásico de 3 puntos con luz cálida");
  assert.deepEqual(three.lights.map(light => light.role).sort(), ["back", "fill", "key"]);
  assert.equal(three.lights[0].kelvin, 3200);
});

test("personas: cantidad, acciones en orden y sentado", () => {
  const walk = parseSubjects("La actriz camina hasta la marca, gira abierta y muestra la taza mirando al lente.");
  assert.deepEqual(walk.actions, ["walkIn", "turn", "showProduct", "lookLens"]);
  assert.equal(walk.count, 1);
  assert.equal(parseSubjects("Pareja (dos figuras 3D) de pie sobre las marcas").count, 2);
  const withOperator = parseSubjects("Maniquí T (talento) en (0,0,0). Maniquí F (filmmaker) en (0,0,1.4).");
  assert.equal(withOperator.count, 1);
  assert.equal(withOperator.operator, true);
  assert.equal(parseSubjects("Maniquí C (clienta) abre la bolsa. Maniquí F con el celular en mano.").count, 1);
  assert.equal(parseSubjects("La vendedora le muestra la taza a la clienta").count, 2);
  assert.equal(parseSubjects("Caja de regalo abierta en (0,0.75,0) con la polera; maniquí F con el gimbal.").productOnly, true);
  assert.equal(parseSubjects("La actriz sostiene la caja").productOnly, false);
  assert.equal(parseSubjects("El actor entra desde la derecha del cuadro").enterFrom, 1);
  assert.equal(parseSubjects("El actor entra a cuadro").enterFrom, -1);
  // Sentado es un estado, no un paso de la secuencia.
  const seated = parseSubjects("Actor sentado en la mesa; muestra la taza y sonríe.");
  assert.equal(seated.seated, true);
  assert.deepEqual(seated.actions, ["showProduct", "react"]);
  assert.equal(parseSubjects("Testimonio: la clienta sentada en el sofá habla a cámara").seated, true);
  assert.deepEqual(parseSubjects("").actions, ["idle", "lookLens"]);
});

test("pasos: tiempos, tono, plano por paso y línea de tiempo continua", () => {
  const camera = parseCamera("Plano general, plano medio y primer plano");
  const subjects = parseSubjects("Sostiene la taza a la altura del pecho y mira a cámara.");
  const beats = parseBeats([
    "0-3 s · Plano general. Etiqueta «Dónde estamos».",
    "3 s · TRANSICIÓN: chasquido.",
    "3-6 s · Plano medio: dice la línea mirando a cámara.",
    "6-20 s: primer plano, sonríe.",
    "Error mostrado: la toma desde otro ángulo (rojo).",
  ], camera, subjects);
  assert.deepEqual(beats.map(beat => beat.timeLabel), ["0–3 s", "3 s", "3–6 s", "6–20 s", null]);
  assert.deepEqual(beats.map(beat => beat.shot), ["general", "general", "medio", "primerPlano", "primerPlano"]);
  assert.equal(beats[4].tone, "error");
  assert.equal(beats[2].action, "talk");
  assert.equal(beats[3].action, "react");
  assert.equal(beats[0].start, 0);
  for (let i = 1; i < beats.length; i += 1) assert.equal(beats[i].start, beats[i - 1].end);
  for (const beat of beats) assert.ok(beat.end - beat.start >= 2.5 && beat.end - beat.start <= 6);
  assert.equal(parseBeats(["0-2 s: cambio a 2x"], camera, subjects)[0].focalMm, 52);
});

test("el título de la lección orienta la escena: técnica, ángulo y luz", () => {
  const scene = { camera: "Slider de 1 m sobre trípode; lente de 48 mm, inclinación de -6°.", subjects: "Maniquí T sostiene la polera.", lighting: "Softbox a 45° por la izquierda.", beats: ["0-2 s: vista lateral del slider.", "2-6 s: push-in hacia el rostro."] };
  assert.equal(parseScene3d(scene).camera.move, "travelling");
  assert.equal(parseScene3d(scene, "Push-in lento").camera.move, "pushIn");
  assert.equal(parseCamera("Trípode alto en (0,2.1,1.2), inclinación -30°, lente de 26 mm.").angle, "picado");
  assert.equal(parseCamera("Cámara a 40 cm, inclinación +25°").angle, "contrapicado");
  assert.equal(parseCamera("Trípode a la altura de los ojos", "Picado que empequeñece").angle, "picado");
  assert.ok(parseLighting("Softbox a 45° por la izquierda", "Contraluz de separación").lights.some(light => light.role === "back"));
  assert.equal(parseLighting("Softbox a la izquierda", "Luz de ventana").lights[0].source, "window");
  assert.equal(parseSubjects("El actor camina", "Entrar a cuadro").actions[0], "walkIn");
  const beats = parseScene3d(scene, "Push-in lento").beats;
  assert.equal(beats[0].overview, "Lateral");
  assert.equal(beats[1].overview, null);
});

test("pasos que mueven la luz principal: ángulo y altura se arrastran al paso siguiente", () => {
  const beats = parseScene3d({
    lighting: "Key: softbox a 45° cámara-izquierda.",
    beats: ["0-2 s: vista superior con un arco de 0 a 90° alrededor del talento.", "2-4 s: key a 0°: rostro plano.", "4-6 s: key a 90°: split.", "6-8 s: la key sube a 2.3 m y los ojos quedan en sombra.", "8-10 s: cierre."],
  }).beats;
  assert.deepEqual(beats.map(beat => beat.keyAngle), [null, 0, 90, 90, 90]);
  assert.deepEqual(beats.map(beat => beat.keyHeight), [null, null, null, 2.3, 2.3]);
  assert.equal(beats[0].overview, "Arriba");
  assert.equal(beats[0].angle, "ojos");
});

test("las 98 escenas del currículo producen una configuración usable", () => {
  let count = 0;
  const environments = new Set<string>();
  for (const role of roleFiles()) {
    for (const lesson of role.levels.flatMap(level => level.modules.flatMap(module => module.lessons))) {
      if (!lesson.scene3d) continue;
      count += 1;
      const scene = parseScene3d(lesson.scene3d, lesson.title);
      environments.add(scene.environment);
      assert.equal(scene.beats.length, lesson.scene3d.beats.length || 1, lesson.id);
      assert.ok(scene.duration > 0 && Number.isFinite(scene.duration), lesson.id);
      assert.ok(scene.camera.focalMm >= 10 && scene.camera.focalMm <= 200, lesson.id);
      assert.ok(scene.lights.some(light => light.role === "key"), lesson.id);
      for (const beat of scene.beats) {
        const placement = cameraPlacement(beat.shot, beat.angle, beat.focalMm);
        assert.ok(placement.position.every(Number.isFinite) && placement.distance > 0, lesson.id);
      }
    }
  }
  assert.equal(count, 98);
  assert.ok(environments.size >= 4, [...environments].join(","));
});

test("geometría: campo de visión, distancia por plano y ángulos", () => {
  assert.ok(Math.abs(verticalFov(26) - 69.4) < 0.5);
  assert.ok(Math.abs(verticalFov(50) - 39.6) < 0.5);
  const medio = cameraPlacement("medio", "ojos", 26);
  assert.ok(medio.distance > 0.6 && medio.distance < 0.85, String(medio.distance));
  assert.ok(cameraPlacement("general", "ojos", 26).distance > cameraPlacement("primerPlano", "ojos", 52).distance);
  assert.ok(cameraPlacement("primerPlano", "ojos", 26).distance >= 0.4);
  const cenital = cameraPlacement("detalle", "cenital", 26);
  assert.ok(cenital.position[1] > cenital.target[1] + 0.5);
  assert.ok(cameraPlacement("medio", "contrapicado", 26).position[1] < medio.target[1]);
  assert.ok(cameraPlacement("medio", "picado", 26).position[1] > medio.target[1] + 0.2);
  assert.equal(cameraPlacement("medio", "holandes", 26).roll, 12);
  assert.ok(cameraPlacement("medio", "ojos", 26, { seated: true }).target[1] < medio.target[1]);
});

test("temperatura de color: cálida, día y fría", () => {
  const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const [r3, , b3] = rgb(kelvinToHex(3200));
  assert.ok(r3 > b3 + 60);
  const [, , b65] = rgb(kelvinToHex(6500));
  assert.ok(b65 >= 240);
  const [r10, , b10] = rgb(kelvinToHex(10000));
  assert.ok(b10 > r10);
  assert.match(kelvinToHex(5600), /^#[0-9a-f]{6}$/);
});
