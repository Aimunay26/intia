import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { PerspectiveCamera, Vector3 } from "three";

import { MANUAL_ROLE_INDEX } from "../src/content/manual/index";
import type { ManualRole } from "../src/lib/manual";
import {
  EYE_LINE,
  EYE_LINE_SHOTS,
  MANNEQUIN,
  MISTAKE_LABELS,
  PODCAST,
  PRESET_LABELS,
  RGB_COLORS,
  SCENE_MISTAKES,
  SCENE_PRESETS,
  cameraPlacement,
  chestHeight,
  eyeHeight,
  eyePoint,
  followProgress,
  frameFov,
  hipsHeight,
  lightHex,
  parseScene3d,
  placementForBeat,
  sceneVariant,
  type CameraAngle,
  type CameraPlacement,
  type FrameFormat,
  type SceneConfig,
} from "../src/lib/manual-scene";

/**
 * Visor 3D: línea de ojos (proyectada con three.js, independiente de la fórmula),
 * formatos 9:16 y 16:9, escenas armadas, palabras clave, errores para comparar y
 * contraluz de color.
 *
 * Correr con: npx tsx --test tests/manual-scene-3d.test.mts
 */

const FORMATS: readonly FrameFormat[] = ["vertical", "horizontal"];
const TOLERANCE = 0.03;

/** Dónde cae un punto en el cuadro (0..1 desde arriba a la izquierda), con la cámara de three.js. */
function project(placement: CameraPlacement, point: readonly [number, number, number]) {
  const camera = new PerspectiveCamera(placement.fov, placement.aspect, 0.01, 100);
  camera.position.set(...placement.position);
  camera.up.set(0, 1, 0);
  camera.lookAt(new Vector3(...placement.target));
  if (placement.roll) camera.rotateZ((placement.roll * Math.PI) / 180);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  const ndc = new Vector3(...point).project(camera);
  return { x: (ndc.x + 1) / 2, y: (1 - ndc.y) / 2, inFront: ndc.z < 1 };
}

function assertOnEyeLine(placement: CameraPlacement, eyes: readonly [number, number, number], label: string) {
  const screen = project(placement, eyes);
  assert.ok(screen.inFront, `${label}: los ojos quedan detrás de la cámara`);
  assert.ok(Math.abs(screen.y - EYE_LINE) < TOLERANCE, `${label}: ojos en y=${screen.y.toFixed(3)}`);
  assert.ok(screen.x > 0 && screen.x < 1, `${label}: ojos fuera del cuadro en x=${screen.x.toFixed(3)}`);
  return screen;
}

const ROLES_DIR = path.resolve(import.meta.dirname, "..", "src/content/manual/roles");
const curriculumScenes = () =>
  MANUAL_ROLE_INDEX.flatMap(summary => {
    const role = JSON.parse(fs.readFileSync(path.join(ROLES_DIR, `${summary.slug}.json`), "utf8")) as ManualRole;
    return role.levels.flatMap(level => level.modules.flatMap(module => module.lessons)).filter(lesson => lesson.scene3d);
  });

/* ---------------------------------------------------------- LÍNEA DE OJOS -- */

test("línea de ojos: en 9:16 y 16:9 los ojos caen en el tercio superior para cada plano, ángulo, lente y postura", () => {
  const angles: CameraAngle[] = ["ojos", "picado", "contrapicado", "holandes"];
  let checked = 0;
  for (const format of FORMATS) {
    for (const shot of EYE_LINE_SHOTS) {
      for (const angle of angles) {
        for (const focal of [13, 26, 48, 77]) {
          for (const seated of [false, true]) {
            const placement = cameraPlacement(shot, angle, focal, { format, seated });
            const eyes: [number, number, number] = [0, eyeHeight(seated), MANNEQUIN.eyesForward];
            assert.equal(placement.aspect, format === "vertical" ? 9 / 16 : 16 / 9);
            assert.ok(Math.abs(placement.fov - frameFov(focal, format)) < 1e-9);
            assert.deepEqual(placement.eyes, eyes);
            const screen = assertOnEyeLine(placement, eyes, `${format}/${shot}/${angle}/${focal}mm/${seated ? "sentado" : "de pie"}`);
            if (angle !== "holandes") assert.ok(Math.abs(screen.x - 0.5) < 1e-6);
            checked += 1;
          }
        }
      }
    }
  }
  assert.equal(checked, 2 * 4 * 4 * 4 * 2);
});

test("ángulos: a la altura de los ojos la cámara va nivelada; contrapicado mira hacia arriba y picado hacia abajo", () => {
  for (const format of FORMATS) {
    const level = cameraPlacement("medio", "ojos", 48, { format });
    assert.ok(Math.abs(level.tilt) < 1e-6, `${format}: ${level.tilt}`);
    assert.ok(level.position[1] < eyeHeight() && level.position[1] > chestHeight());
    const low = cameraPlacement("medio", "contrapicado", 48, { format });
    assert.ok(low.tilt > 15 && low.position[1] < level.position[1] - 0.2, `${format}: ${low.tilt}`);
    const high = cameraPlacement("medio", "picado", 48, { format });
    assert.ok(high.tilt < -15 && high.position[1] > eyeHeight(), `${format}: ${high.tilt}`);
  }
  // 16:9 tiene menos campo vertical que 9:16 con la misma lente: la cámara se aleja para el mismo plano.
  assert.ok(frameFov(26, "horizontal") < frameFov(26, "vertical"));
  assert.ok(cameraPlacement("medio", "ojos", 26, { format: "horizontal" }).distance > cameraPlacement("medio", "ojos", 26).distance);
});

test("trípode a la altura del pecho: plano medio al pecho y, en primer plano, a la altura de los ojos", () => {
  for (const format of FORMATS) {
    const chest = cameraPlacement("medio", "ojos", 48, { format, heightRule: "pecho" });
    assert.ok(Math.abs(chest.position[1] - chestHeight()) < 1e-9);
    assert.ok(chest.tilt > 0 && chest.tilt < 15, `${format}: inclinación mínima, ${chest.tilt}`);
    assertOnEyeLine(chest, [0, eyeHeight(), MANNEQUIN.eyesForward], `${format}/pecho`);
    const closeUp = cameraPlacement("primerPlano", "ojos", 48, { format, heightRule: "pecho" });
    assert.ok(Math.abs(closeUp.tilt) < 1e-6);
    const seated = cameraPlacement("medio", "ojos", 48, { format, heightRule: "pecho", seated: true });
    assert.ok(Math.abs(seated.position[1] - chestHeight(true)) < 1e-9);
  }
  // Maniquí de ~1,71 m: ojos a ≈1,61 m y pecho a ≈1,28 m (≈75 % de la estatura).
  assert.ok(Math.abs(eyeHeight() - 1.613) < 0.005);
  assert.ok(Math.abs(chestHeight() - 1.283) < 0.005);
});

/* --------------------------------------------------------- ESCENAS ARMADAS -- */

function eyeLineBeats(config: SceneConfig) {
  return config.beats.filter(beat => EYE_LINE_SHOTS.includes(beat.shot) && beat.angle !== "cenital");
}

test("escenas armadas: cada una encuadra los ojos en el tercio superior en 9:16 y 16:9", () => {
  for (const preset of SCENE_PRESETS) {
    const base = parseScene3d({ preset });
    assert.equal(base.preset, preset);
    assert.equal(base.format, "vertical");
    for (const format of FORMATS) {
      const config = sceneVariant(base, { format });
      const beats = eyeLineBeats(config);
      assert.ok(beats.length > 0, `${preset}: sin planos con persona`);
      for (const beat of beats) assertOnEyeLine(placementForBeat(config, beat), eyePoint(config), `${preset}/${format}`);
    }
  }
});

test("escenas armadas: pecho, contrapicado, picado, podcast, seguimiento, 3 puntos de color y luz de mano", () => {
  const chest = parseScene3d({ preset: "INFORMATIVO_PECHO" });
  assert.equal(chest.framing.heightRule, "pecho");
  assert.deepEqual([chest.camera.shots[0], chest.camera.angle, chest.camera.focalMm, chest.camera.move], ["medio", "ojos", 48, "fija"]);
  const chestShot = placementForBeat(chest, chest.beats[0]);
  assert.ok(Math.abs(chestShot.position[1] - chestHeight()) < 1e-9);

  const authority = parseScene3d({ preset: "AUTORIDAD_CONTRAPICADO" });
  const low = placementForBeat(authority, authority.beats[0]);
  assert.equal(authority.camera.angle, "contrapicado");
  assert.ok(low.tilt > 15 && low.position[1] < eyeHeight() - 0.2);

  const vulnerable = parseScene3d({ preset: "VULNERABLE_PICADO" });
  const high = placementForBeat(vulnerable, vulnerable.beats[0]);
  assert.equal(vulnerable.camera.angle, "picado");
  assert.ok(high.tilt < -15 && high.position[1] > eyeHeight());

  const podcast = parseScene3d({ preset: "PODCAST_SEMILATERAL" });
  assert.equal(podcast.staging, "podcast");
  assert.equal(podcast.subjects.seated, true);
  assert.equal(podcast.subjects.count, 2);
  for (const format of FORMATS) {
    const config = sceneVariant(podcast, { format });
    const placement = placementForBeat(config, config.beats[0]);
    const eyes = assertOnEyeLine(placement, eyePoint(config), `podcast/${format}`);
    // Tercio izquierdo, con espacio de mirada hacia la derecha (donde está quien entrevista).
    assert.ok(Math.abs(eyes.x - 1 / 3) < 0.06, `podcast/${format}: x=${eyes.x.toFixed(3)}`);
    const interviewer = project(placement, [PODCAST.interviewer.x, eyeHeight(true), PODCAST.interviewer.z]);
    assert.ok(!interviewer.inFront || interviewer.x < 0 || interviewer.x > 1, `podcast/${format}: quien entrevista queda fuera de cuadro`);
  }
  assert.equal(parseScene3d({ preset: "PODCAST_SEMILATERAL", subjects: "Entrevistada de pie junto a la ventana" }).subjects.seated, false);

  const follow = parseScene3d({ preset: "SEGUIMIENTO_RITMO" });
  assert.equal(follow.camera.move, "seguimiento");
  assert.equal(follow.subjects.operator, true);
  assert.equal(follow.subjects.actions[0], "walk");
  assert.ok(follow.mistakes.includes("MOVIMIENTO_BRUSCO"));

  const color = parseScene3d({ preset: "TRES_PUNTOS_COLOR" });
  assert.deepEqual(color.lights.map(light => light.role), ["key", "fill", "back"]);
  const back = color.lights.find(light => light.role === "back")!;
  assert.deepEqual(back.rgb, RGB_COLORS.cian);
  assert.ok(color.lights.filter(light => light.role !== "back").every(light => light.kelvin === 5600 && !light.rgb));
  assert.ok(color.lightingLabels.includes("3 puntos") && color.lightingLabels.includes("Contraluz cian"));

  const hand = parseScene3d({ preset: "LUZ_DE_MANO" });
  const key = hand.lights.find(light => light.role === "key")!;
  assert.equal(key.source, "mano");
  assert.ok(!hand.lights.some(light => light.role === "fill"));
  assert.ok(hand.lights.some(light => light.role === "back"));
  assert.ok(hand.ambient < 0.5);
  assert.ok(hand.lightingLabels.includes("Luz de mano"));

  for (const preset of SCENE_PRESETS) assert.ok(PRESET_LABELS[preset].label && PRESET_LABELS[preset].intent.length > 40, preset);
});

test("palabras clave: el parser reconoce las escenas en el título y en su campo", () => {
  const preset = (input: Parameters<typeof parseScene3d>[0], title = "") => parseScene3d(input, title).preset;
  assert.equal(preset({ camera: "Celular en trípode a la altura del pecho del talento, plano medio." }), "INFORMATIVO_PECHO");
  assert.equal(preset({}, "Video informativo a cámara"), "INFORMATIVO_PECHO");
  // «a la altura del pecho» en las personas no habla de la cámara.
  assert.equal(preset({ subjects: "La actriz sostiene la taza a la altura del pecho." }), null);
  assert.equal(preset({}, "Contrapicado de autoridad"), "AUTORIDAD_CONTRAPICADO");
  assert.equal(preset({ camera: "Cámara baja en contrapicado desde la cintura." }), "AUTORIDAD_CONTRAPICADO");
  assert.equal(preset({}, "Picado: más vulnerable"), "VULNERABLE_PICADO");
  assert.equal(preset({ camera: "Trípode alto, inclinación -30°, lente de 26 mm." }), "VULNERABLE_PICADO");
  assert.equal(preset({}, "Encuadre de podcast"), "PODCAST_SEMILATERAL");
  assert.equal(preset({}, "Entrevista sentada"), "PODCAST_SEMILATERAL");
  assert.equal(preset({ camera: "Cámara semilateral a 35° del eje de mirada." }), "PODCAST_SEMILATERAL");
  assert.equal(preset({}, "Moverse con el sujeto"), "SEGUIMIENTO_RITMO");
  assert.equal(preset({ camera: "El filmmaker camina a su mismo ritmo, a 1,5 m." }), "SEGUIMIENTO_RITMO");
  assert.equal(preset({ lighting: "Luz LED de mano a 45° para la toma con poca luz." }), "LUZ_DE_MANO");
  assert.equal(preset({}, "Grabar con poca luz"), "LUZ_DE_MANO");
  assert.equal(preset({ lighting: "Esquema de 3 puntos con contraluz cian detrás." }), "TRES_PUNTOS_COLOR");
  assert.equal(preset({}, "Contraluz de separación"), "TRES_PUNTOS_COLOR");
  // El campo del contrato manda; un valor inventado se ignora.
  assert.equal(preset({ preset: "LUZ_DE_MANO", camera: "Contrapicado" }), "LUZ_DE_MANO");
  assert.equal(preset({ preset: "OTRO" }), null);
  assert.equal(preset({ camera: "Plano medio a la altura de los ojos" }), null);
});

/* ------------------------------------------------------------------ ERRORES -- */

test("errores: conjunto universal, los que pide la escena y los de scene3d.errores", () => {
  assert.deepEqual(parseScene3d({}).mistakes, ["CONTRALUZ", "CODOS_ABIERTOS", "PIES_JUNTOS", "OJOS_FUERA_DEL_TERCIO", "SIN_LUZ_TRASERA"]);
  assert.deepEqual(parseScene3d({ camera: "Seguimiento con gimbal de 3 ejes" }).mistakes.at(-1), "MOVIMIENTO_BRUSCO");
  assert.deepEqual(parseScene3d({ camera: "Cámara en mano, estilo vlog" }).mistakes.at(-1), "MOVIMIENTO_BRUSCO");
  // «Agarre a mano»: el celular va en la mano de quien graba, así «Codos abiertos» es el error del operador.
  const grip = parseScene3d({ subjects: "Maniquí T (talento). Maniquí F (filmmaker) sostiene el celular.", camera: "Cámara de observación en 3/4, 35 mm, fija." }, "Agarre a mano");
  assert.ok(grip.subjects.operator && grip.camera.handheld && grip.camera.move === "mano");
  assert.equal(parseScene3d({}, "Luz LED de mano").camera.handheld, false);
  assert.ok(!parseScene3d({ subjects: "Testimonio: la clienta sentada en el sofá habla a cámara" }).mistakes.includes("PIES_JUNTOS"));
  assert.deepEqual(parseScene3d({ subjects: "Caja de regalo abierta sobre la mesa" }).mistakes, ["CONTRALUZ", "SIN_LUZ_TRASERA"]);
  const chest = parseScene3d({ preset: "INFORMATIVO_PECHO" }).mistakes;
  assert.ok(chest.includes("TRIPODE_MUY_BAJO") && chest.includes("TRIPODE_MUY_ALTO"));
  assert.ok(parseScene3d({ camera: "Primer plano con 2x" }).mistakes.includes("CABEZA_CORTADA"));
  // Los de la lección van primero y los universales se suman siempre (sin repetir).
  assert.deepEqual(parseScene3d({ errores: ["PIES_JUNTOS", "INVENTADO", "PIES_JUNTOS", "CABEZA_CORTADA"] }).mistakes, [
    "PIES_JUNTOS",
    "CABEZA_CORTADA",
    "CONTRALUZ",
    "CODOS_ABIERTOS",
    "OJOS_FUERA_DEL_TERCIO",
    "SIN_LUZ_TRASERA",
  ]);
  assert.deepEqual(parseScene3d({ errores: [] }).mistakes.length, 5);
  // Cada escena armada suma el error propio de su técnica.
  assert.ok(parseScene3d({ preset: "AUTORIDAD_CONTRAPICADO" }).mistakes.includes("CONTRAPICADO_EXAGERADO"));
  assert.ok(parseScene3d({ preset: "VULNERABLE_PICADO" }).mistakes.includes("PICADO_FUERTE"));
  assert.ok(parseScene3d({ preset: "PODCAST_SEMILATERAL" }).mistakes.includes("SIN_ESPACIO_DE_MIRADA"));
  assert.ok(parseScene3d({ preset: "TRES_PUNTOS_COLOR" }).mistakes.includes("TRASERA_MISMO_COLOR"));
  const hand = parseScene3d({ preset: "LUZ_DE_MANO" }).mistakes;
  assert.ok(hand.includes("SIN_LUZ_DE_MANO") && hand.includes("LUZ_PEGADA_AL_LENTE") && hand.includes("CONTRALUZ"));
  // Si camina en todos los pasos, la marcha tapa la postura: no se ofrece «Pies juntos».
  const walking = parseScene3d({ subjects: "El actor camina hasta la marca", beats: ["0-3 s: entra a cuadro caminando.", "3-6 s: camina hasta la marca."] });
  assert.ok(walking.beats.every(beat => beat.action === "walk" || beat.action === "walkIn"));
  assert.ok(!walking.mistakes.includes("PIES_JUNTOS") && walking.mistakes.includes("CODOS_ABIERTOS"));
  assert.equal(SCENE_MISTAKES.length, 15);
  assert.equal(SCENE_PRESETS.length, 7);
  for (const mistake of SCENE_MISTAKES) {
    const label = MISTAKE_LABELS[mistake];
    assert.ok(label.label.length <= 22 && label.wrong && label.why.length > 30 && label.fix.length > 30, mistake);
  }
});

test("ver lo incorrecto: cada error cambia la escena y «Correcto» la restaura sin tocar la base", () => {
  const base = parseScene3d({ preset: "INFORMATIVO_PECHO" });
  const snapshot = JSON.stringify(base);
  const beat = base.beats[0];
  const eyes = () => eyePoint(base);

  const backlit = sceneVariant(base, { mistake: "CONTRALUZ" });
  assert.equal(backlit.mistake, "CONTRALUZ");
  assert.ok(!backlit.lights.some(light => light.role === "key" || light.role === "fill"));
  assert.equal(backlit.lights[0].source, "window");
  assert.ok(backlit.ambient < 0.5);
  assert.equal(backlit.backdrop, "ventana");
  assert.ok(backlit.lightingLabels.includes("Contraluz sin relleno"));

  const flat = sceneVariant(base, { mistake: "SIN_LUZ_TRASERA" });
  assert.ok(!flat.lights.some(light => light.role === "back"));
  assert.equal(flat.backdrop, "pegado");

  assert.equal(sceneVariant(base, { mistake: "CODOS_ABIERTOS" }).body.elbows, "abiertos");
  const feet = sceneVariant(base, { mistake: "PIES_JUNTOS" });
  assert.equal(feet.body.feet, "juntos");
  assert.ok(eyePoint(feet)[1] > eyes()[1], "piernas rectas: la cadera sube");
  assert.equal(hipsHeight(false, "juntos"), MANNEQUIN.hipsStraight);

  for (const format of FORMATS) {
    const low = sceneVariant(base, { format, mistake: "OJOS_FUERA_DEL_TERCIO" });
    assert.ok(project(placementForBeat(low, beat), eyes()).y > 0.5, `${format}: ojos por debajo del centro`);
    const cut = sceneVariant(base, { format, mistake: "CABEZA_CORTADA" });
    const crown: [number, number, number] = [0, eyes()[1] + MANNEQUIN.crown, MANNEQUIN.eyesForward];
    assert.ok(project(placementForBeat(cut, beat), crown).y < 0, `${format}: la coronilla queda fuera del cuadro`);
  }

  const tooLow = placementForBeat(sceneVariant(base, { mistake: "TRIPODE_MUY_BAJO" }), beat);
  assert.ok(tooLow.position[1] < hipsHeight() && tooLow.tilt > 25, String(tooLow.tilt));
  const tooHigh = placementForBeat(sceneVariant(base, { mistake: "TRIPODE_MUY_ALTO" }), beat);
  assert.ok(tooHigh.position[1] > eyeHeight() + 0.3 && tooHigh.tilt < -15, String(tooHigh.tilt));
  assert.equal(sceneVariant(base, { mistake: "MOVIMIENTO_BRUSCO" }).motion, "brusco");

  // «Correcto»: la variante sin error es la base.
  assert.deepEqual(sceneVariant(base, { mistake: null }), base);
  assert.equal(JSON.stringify(base), snapshot, "las variantes no mutan la base");
  const horizontal = sceneVariant(base, { format: "horizontal" });
  assert.equal(horizontal.format, "horizontal");
  assert.equal(placementForBeat(horizontal, beat).aspect, 16 / 9);
  assert.deepEqual({ ...sceneVariant(horizontal, { format: "vertical" }) }, base);
});

test("ver lo incorrecto: ángulo exagerado, luz de mano, trasera del mismo color, espacio de mirada y contraluz de noche", () => {
  const authority = parseScene3d({ preset: "AUTORIDAD_CONTRAPICADO" });
  const beat = authority.beats[0];
  const normal = placementForBeat(authority, beat);
  const exaggerated = placementForBeat(sceneVariant(authority, { mistake: "CONTRAPICADO_EXAGERADO" }), beat);
  assert.ok(Math.abs(exaggerated.tilt - 35) < 0.5 && exaggerated.position[1] < normal.position[1], `${exaggerated.tilt}`);
  // Aunque el paso sea neutro, el error fuerza el ángulo.
  const neutral = sceneVariant(authority, { mistake: "CONTRAPICADO_EXAGERADO" });
  assert.ok(Math.abs(placementForBeat(neutral, { ...beat, angle: "ojos" }).tilt - 35) < 0.5);

  const vulnerable = parseScene3d({ preset: "VULNERABLE_PICADO" });
  const strong = placementForBeat(sceneVariant(vulnerable, { mistake: "PICADO_FUERTE" }), vulnerable.beats[0]);
  assert.ok(Math.abs(strong.tilt + 30) < 0.5, `${strong.tilt}`);
  for (const format of FORMATS) {
    for (const mistake of ["CONTRAPICADO_EXAGERADO", "PICADO_FUERTE"] as const) {
      const config = sceneVariant(mistake === "PICADO_FUERTE" ? vulnerable : authority, { format, mistake });
      assertOnEyeLine(placementForBeat(config, config.beats[0]), eyePoint(config), `${mistake}/${format}`);
    }
  }

  const hand = parseScene3d({ preset: "LUZ_DE_MANO" });
  const dark = sceneVariant(hand, { mistake: "SIN_LUZ_DE_MANO" });
  assert.ok(!dark.lights.some(light => light.source === "mano") && dark.ambient <= 0.3);
  const onLens = sceneVariant(hand, { mistake: "LUZ_PEGADA_AL_LENTE" }).lights.find(light => light.source === "mano")!;
  assert.equal(onLens.side, 0);
  assert.equal(onLens.hard, true);
  // De noche el contraluz es una lámpara detrás, no una ventana de día.
  const night = sceneVariant(hand, { mistake: "CONTRALUZ" });
  assert.equal(night.backdrop, "lampara");
  assert.deepEqual(night.lights.map(light => `${light.role}:${light.source}`), ["back:lampara"]);
  assert.ok(night.lightingLabels.includes("Contraluz sin relleno"));

  const color = parseScene3d({ preset: "TRES_PUNTOS_COLOR" });
  const same = sceneVariant(color, { mistake: "TRASERA_MISMO_COLOR" });
  const key = same.lights.find(light => light.role === "key")!;
  const back = same.lights.find(light => light.role === "back")!;
  assert.equal(back.kelvin, key.kelvin);
  assert.equal(back.rgb, undefined);
  assert.ok(color.lights.find(light => light.role === "back")!.rgb, "la base no cambia");

  const podcast = parseScene3d({ preset: "PODCAST_SEMILATERAL" });
  for (const format of FORMATS) {
    const centered = sceneVariant(podcast, { format, mistake: "SIN_ESPACIO_DE_MIRADA" });
    const eyes = assertOnEyeLine(placementForBeat(centered, centered.beats[0]), eyePoint(centered), `centrado/${format}`);
    assert.ok(Math.abs(eyes.x - 0.5) < 0.02, `centrado/${format}: x=${eyes.x.toFixed(3)}`);
  }
  for (const mistake of ["CONTRAPICADO_EXAGERADO", "PICADO_FUERTE", "SIN_LUZ_DE_MANO", "LUZ_PEGADA_AL_LENTE", "TRASERA_MISMO_COLOR", "SIN_ESPACIO_DE_MIRADA"] as const) {
    assert.ok(SCENE_MISTAKES.includes(mistake), mistake);
  }
});

test("pasos con error: «[ERROR]» al inicio lo muestra mientras dura el paso y no aparece en el texto", () => {
  const scene = parseScene3d({
    preset: "INFORMATIVO_PECHO",
    beats: ["[TRIPODE_MUY_BAJO] 2-4 s: trípode muy bajo, lente a 0.90 m.", "4-6 s: el lente queda a la altura del pecho (verde).", "[INVENTADO] 6-8 s: cierre."],
  });
  const [low, ok, unknown] = scene.beats;
  assert.equal(low.mistake, "TRIPODE_MUY_BAJO");
  assert.equal(low.text, "trípode muy bajo, lente a 0.90 m.");
  assert.equal(low.timeLabel, "2–4 s");
  assert.equal(low.tone, "error", "un paso con error es un «error a evitar» aunque el texto no diga «rojo»");
  assert.equal(ok.mistake, null);
  assert.equal(ok.tone, "ok");
  // Un error desconocido no se aplica y el texto se deja tal cual.
  assert.equal(unknown.mistake, null);
  assert.ok(unknown.text.startsWith("[INVENTADO]"));
  assert.ok(scene.mistakes.includes("TRIPODE_MUY_BAJO"));
  // La escena de ese paso es la variante con el error: el lente baja.
  const shown = sceneVariant(scene, { mistake: low.mistake });
  assert.ok(placementForBeat(shown, low).position[1] < placementForBeat(scene, low).position[1] - 0.3);
  // Una referencia neutra vuelve a la altura de los ojos aunque la escena sea un contrapicado.
  const reference = parseScene3d({ preset: "AUTORIDAD_CONTRAPICADO", beats: ["2-4 s: vista neutra a la altura del pecho.", "4-6 s: la cámara baja y se inclina +15° (verde)."] });
  assert.deepEqual(reference.beats.map(beat => beat.angle), ["ojos", "contrapicado"]);
});

test("16:9: el sujeto va en un tercio con espacio de mirada, y en 9:16 al centro", () => {
  const base = parseScene3d({ preset: "INFORMATIVO_PECHO" });
  const vertical = assertOnEyeLine(placementForBeat(base, base.beats[0]), eyePoint(base), "informativo/9:16");
  assert.ok(Math.abs(vertical.x - 0.5) < 0.02, `9:16: x=${vertical.x.toFixed(3)}`);
  const horizontal = sceneVariant(base, { format: "horizontal" });
  const left = assertOnEyeLine(placementForBeat(horizontal, horizontal.beats[0]), eyePoint(horizontal), "informativo/16:9");
  assert.ok(Math.abs(left.x - 1 / 3) < 0.03, `16:9: x=${left.x.toFixed(3)}`);
  // La escena puede pedir el tercio derecho.
  const right = sceneVariant(parseScene3d({ preset: "INFORMATIVO_PECHO", camera: "En 16:9 el talento queda en el tercio derecho." }), { format: "horizontal" });
  const rightEyes = assertOnEyeLine(placementForBeat(right, right.beats[0]), eyePoint(right), "tercio derecho/16:9");
  assert.ok(Math.abs(rightEyes.x - 2 / 3) < 0.03, `derecho: x=${rightEyes.x.toFixed(3)}`);
  // Solo producto: sin persona no hay tercio que respetar.
  const product = sceneVariant(parseScene3d({ subjects: "Caja de regalo sobre la mesa" }), { format: "horizontal" });
  assert.equal(product.subjects.productOnly, true);
});

test("seguimiento a su ritmo: el sujeto camina en los pasos en que la cámara lo acompaña", () => {
  const follow = parseScene3d({
    preset: "SEGUIMIENTO_RITMO",
    beats: ["0-3 s: F camina con los codos abiertos (rojo).", "3-6 s: F pega los codos: la línea de altura se estabiliza (verde).", "6-9 s: F acompaña el ritmo de T (verde 'mismo ritmo').", "9-11 s: T se detiene y muestra la taza (verde)."],
  });
  assert.deepEqual(follow.beats.map(beat => beat.action), ["walk", "walk", "walk", "showProduct"]);
  // «la línea de altura» o «la línea superior» no son una línea de diálogo.
  const line = parseScene3d({ beats: ["0-2 s: los ojos caen sobre la línea superior.", "2-4 s: dice la línea mirando a cámara."] });
  assert.notEqual(line.beats[0].action, "talk");
  assert.equal(line.beats[1].action, "talk");
});

test("seguimiento: fluido va al mismo ritmo; brusco se atrasa y alcanza a tirones", () => {
  let maxLag = 0;
  let previous = 0;
  for (let i = 0; i <= 200; i += 1) {
    const p = i / 200;
    assert.equal(followProgress(p, "fluido"), p);
    const jerky = followProgress(p, "brusco");
    assert.ok(jerky >= previous - 1e-12, "no retrocede");
    assert.ok(jerky <= p + 1e-12, "nunca se adelanta");
    maxLag = Math.max(maxLag, p - jerky);
    previous = jerky;
  }
  assert.ok(maxLag > 0.12, String(maxLag));
  assert.equal(followProgress(0, "brusco"), 0);
  assert.equal(followProgress(1, "brusco"), 1);
});

/* ----------------------------------------------------------------- LUCES -- */

test("contraluz de separación: siempre presente y de otro color que el frente", () => {
  const plain = parseScene3d({});
  const key = plain.lights.find(light => light.role === "key")!;
  const back = plain.lights.find(light => light.role === "back")!;
  assert.ok(Math.abs(back.kelvin - key.kelvin) >= 1500, `${back.kelvin} vs ${key.kelvin}`);
  assert.equal(back.side, -key.side);
  assert.notEqual(lightHex(back), lightHex(key));

  const warm = parseScene3d({ lighting: "Softbox cálido (3200 K) a la izquierda" });
  assert.equal(warm.lights.find(light => light.role === "back")!.kelvin, 6200);
  // Lo que el texto escribe manda.
  const written = parseScene3d({ lighting: "Key: softbox a 45°, 5600 K. Contraluz: LED detrás a 5600 K, 40%." });
  assert.equal(written.lights.find(light => light.role === "back")!.kelvin, 5600);
  const magenta = parseScene3d({ lighting: "Softbox a la izquierda y contraluz magenta detrás del actor" });
  const rgb = magenta.lights.find(light => light.role === "back")!;
  assert.deepEqual(rgb.rgb, RGB_COLORS.magenta);
  assert.equal(lightHex(rgb), RGB_COLORS.magenta.hex);
  // También en escenas de producto.
  assert.ok(parseScene3d({ subjects: "Caja de regalo sobre la mesa" }).lights.some(light => light.role === "back"));
  // Si el texto dice que no hay luz trasera, no se agrega ni se ofrece compararla.
  const none = parseScene3d({ lighting: "Luz LED de mano a 45°, 3200 K. Sin luz trasera." });
  assert.ok(!none.lights.some(light => light.role === "back"));
  assert.ok(!none.mistakes.includes("SIN_LUZ_TRASERA"));
});

test("asistentes: son equipo, no talento; no cuentan como segunda persona ni actúan", () => {
  const scene = parseScene3d({
    preset: "LUZ_DE_MANO",
    subjects: "Maniquí T (talento) de pie en (0,0,0) mirando a cámara. Maniquí A (asistente) en (-0.7,0,0.7) sostiene la luz LED de mano.",
  });
  assert.equal(scene.subjects.count, 1);
  assert.ok(!scene.subjects.actions.includes("showProduct"));
  const follow = parseScene3d({
    preset: "SEGUIMIENTO_RITMO",
    subjects: "Maniquí T camina hacia +Z desde (0,0,-5) hasta (0,0,0). Maniquí F retrocede delante de él. Maniquí A (asistente) guía a F con la mano en su cintura.",
  });
  assert.equal(follow.subjects.count, 1);
  assert.equal(follow.subjects.actions[0], "walk", "camina hacia la cámara que lo acompaña, no entra de costado");
});

/* ---------------------------------------------------------------- CURRÍCULO -- */

test("currículo: en todas las escenas con persona los ojos caen en la línea superior, en 9:16 y 16:9", () => {
  let checked = 0;
  for (const lesson of curriculumScenes()) {
    const base = parseScene3d(lesson.scene3d, lesson.title);
    assert.ok(base.mistakes.length >= 1, lesson.id);
    const noBack = /sin luz trasera/i.test(lesson.scene3d?.lighting ?? "");
    assert.equal(base.lights.some(light => light.role === "back"), !noBack, lesson.id);
    if (lesson.scene3d?.preset) assert.equal(base.preset, lesson.scene3d.preset, lesson.id);
    // Los errores de la lección van primero; el contraluz y la postura se pueden comparar siempre.
    const given = lesson.scene3d?.errores ?? [];
    assert.deepEqual(base.mistakes.slice(0, given.length), given, lesson.id);
    assert.ok(base.mistakes.includes("CONTRALUZ"), `${lesson.id}: sin «Contraluz»`);
    if (!base.subjects.productOnly) assert.ok(base.mistakes.includes("CODOS_ABIERTOS"), `${lesson.id}: sin «Codos abiertos»`);
    const walksAlways = base.beats.every(beat => beat.action === "walk" || beat.action === "walkIn");
    if (!base.subjects.productOnly && !base.subjects.seated && !walksAlways) assert.ok(base.mistakes.includes("PIES_JUNTOS"), `${lesson.id}: sin «Pies juntos»`);
    for (const beat of base.beats) if (beat.mistake) assert.ok(base.mistakes.includes(beat.mistake), `${lesson.id}: el paso ${beat.index + 1} muestra un error que no se compara`);
    for (const format of FORMATS) {
      const config = sceneVariant(base, { format });
      for (const beat of config.beats) {
        const placement = placementForBeat(config, beat);
        assert.ok([...placement.position, ...placement.target].every(Number.isFinite), lesson.id);
        if (config.subjects.productOnly || !EYE_LINE_SHOTS.includes(beat.shot) || beat.angle === "cenital") continue;
        assertOnEyeLine(placement, eyePoint(config), `${lesson.id}/${format}/paso ${beat.index + 1}`);
        checked += 1;
      }
    }
  }
  assert.ok(checked > 100, String(checked));
});

test("currículo: la luz trasera de las escenas con persona es de otro color que el frente", () => {
  for (const lesson of curriculumScenes()) {
    const base = parseScene3d(lesson.scene3d, lesson.title);
    // Solo donde se encuadra a una persona (no los planos detalle de producto con una mano).
    if (base.subjects.productOnly || !eyeLineBeats(base).length) continue;
    const key = base.lights.find(light => light.role === "key");
    const back = base.lights.find(light => light.role === "back");
    // Una ventana o el sol detrás son luz natural: su color no se elige.
    if (!key || !back || back.rgb || back.source === "window" || back.source === "sun") continue;
    assert.ok(Math.abs(back.kelvin - key.kelvin) >= 1500, `${lesson.id}: trasera a ${back.kelvin} K y frente a ${key.kelvin} K`);
  }
});

test("currículo: los pasos rojos de las lecciones del pedido muestran su error en la escena", () => {
  const scenes = new Map(curriculumScenes().map(lesson => [lesson.id, parseScene3d(lesson.scene3d, lesson.title)]));
  const mistakesOf = (id: string) => scenes.get(id)!.beats.map(beat => beat.mistake);
  assert.deepEqual(mistakesOf("fm-p1-l5"), [null, "TRIPODE_MUY_BAJO", "TRIPODE_MUY_ALTO", null, null]);
  assert.deepEqual(mistakesOf("fm-p0-l2").slice(0, 2), ["SIN_LUZ_DE_MANO", "LUZ_PEGADA_AL_LENTE"]);
  assert.equal(mistakesOf("fm-i1-l1")[3], "CONTRAPICADO_EXAGERADO");
  assert.equal(mistakesOf("fm-i1-l2")[3], "PICADO_FUERTE");
  assert.deepEqual(mistakesOf("fm-i3-l3").slice(0, 2), ["SIN_LUZ_TRASERA", "TRASERA_MISMO_COLOR"]);
  // En cada lección del pedido, todo paso rojo muestra su error: nunca «Error a evitar» sobre la escena correcta.
  for (const id of ["fm-p0-l2", "fm-p1-l5", "fm-p1-l9", "fm-i1-l1", "fm-i1-l2", "fm-i1-l6", "fm-i2-l6", "fm-i3-l3", "fm-i6-l4", "fm-i6-l5", "ACT-P1-L5"]) {
    for (const beat of scenes.get(id)!.beats) if (beat.tone === "error") assert.ok(beat.mistake, `${id}: el paso ${beat.index + 1} es rojo y no muestra su error`);
  }
  // Seguir al sujeto: en los pasos verdes camina (la cámara lo acompaña a su ritmo).
  const follow = scenes.get("fm-i2-l6")!;
  const green = follow.beats.filter(beat => beat.tone === "ok" && beat.action !== "showProduct");
  assert.ok(green.length >= 2 && green.every(beat => beat.action === "walk"), green.map(beat => beat.action).join(","));
});
