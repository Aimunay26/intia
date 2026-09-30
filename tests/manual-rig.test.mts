import assert from "node:assert/strict";
import { test } from "node:test";

import { PerspectiveCamera, Vector3 } from "three";

import {
  HANDLE_PALM_GAP,
  RIG_SIZES,
  backLightSpot,
  clampToReach,
  crewHands,
  crewStand,
  handLedPoint,
  handleGrip,
  rigDirection,
  rigLayout,
  rigToWorld,
} from "../src/lib/manual-rig";
import { eyeHeight, parseScene3d, placementForBeat, sceneVariant, subjectBase } from "../src/lib/manual-scene";

/**
 * Small rig del filmmaker y soporte de la luz trasera del visor 3D del manual: geometría pura.
 * (Las manos en las asas después del IK se prueban en tests/manual-characters.test.mts.)
 *
 * Correr con: npx tsx --test tests/manual-rig.test.mts
 */

const near = (a: Vector3, b: Vector3, tolerance = 1e-9) => a.distanceTo(b) <= tolerance;

/** La cámara de la escena como la pone el visor: en la posición del paso, mirando a su objetivo. */
function sceneCamera(format: "vertical" | "horizontal", preset?: string) {
  const config = sceneVariant(parseScene3d({ environment: "Estudio", subjects: "La actriz mira al lente", camera: "Plano medio", lighting: "3 puntos", preset: preset ?? null }, ""), { format });
  const placement = placementForBeat(config, config.beats[0]);
  const camera = new PerspectiveCamera(placement.fov, placement.aspect, 0.03, 60);
  camera.position.set(...placement.position);
  camera.lookAt(new Vector3(...placement.target));
  camera.updateMatrixWorld(true);
  return { config, camera, placement };
}

test("el lente del celular es el origen del rig, en vertical y en horizontal", () => {
  for (const format of ["vertical", "horizontal"] as const) {
    const layout = rigLayout(format);
    assert.ok(near(layout.lens, new Vector3()), `${format}: lente en el origen`);
    const [w, h, d] = layout.phone.size;
    // 9:16 va parado; 16:9, acostado.
    if (format === "vertical") assert.ok(h > w, "vertical: el celular va parado");
    else assert.ok(w > h, "horizontal: el celular va acostado");
    // El lente está sobre la cara de atrás del celular (la que mira al sujeto, −Z) y dentro de su silueta.
    const c = layout.phone.center;
    assert.ok(Math.abs(c.z - d / 2 - layout.lens.z) < 1e-9, `${format}: el lente está en la cara de atrás`);
    assert.ok(Math.abs(layout.lens.x - c.x) < w / 2 && Math.abs(layout.lens.y - c.y) < h / 2, `${format}: el lente está dentro del celular`);
  }
});

test("jaula, asas, luz en la zapata y power bank con su cable", () => {
  for (const format of ["vertical", "horizontal"] as const) {
    const layout = rigLayout(format);
    const { cage, handles, led, bank, cable } = layout;
    // Asas simétricas a los costados, fuera de la jaula y a la altura de su centro.
    assert.ok(Math.abs(handles.L.center.x + handles.R.center.x - 2 * cage.center.x) < 1e-9);
    assert.ok(handles.R.center.x - cage.center.x > cage.width / 2 + RIG_SIZES.bar, `${format}: asa derecha fuera de la jaula`);
    assert.ok(cage.center.x - handles.L.center.x > cage.width / 2 + RIG_SIZES.bar, `${format}: asa izquierda fuera de la jaula`);
    assert.ok(Math.abs(handles.L.center.y - cage.center.y) < 1e-9 && handles.L.axis.y === 1);
    // Luz arriba (sobre la zapata), power bank abajo.
    assert.ok(led.center.y - led.size[1] / 2 > cage.center.y + cage.height / 2, `${format}: la luz va sobre la jaula`);
    assert.ok(bank.center.y + bank.size[1] / 2 < cage.center.y - cage.height / 2, `${format}: el power bank va debajo`);
    assert.ok(layout.shoe.y > cage.center.y + cage.height / 2 && layout.shoe.y < led.center.y);
    // El cable sale del power bank y llega a la luz.
    assert.ok(Math.abs(cable[0].y - bank.center.y) < 1e-9 && cable[0].z >= bank.center.z, "el cable sale de atrás del power bank");
    assert.ok(Math.abs(cable[cable.length - 1].y - led.center.y) < 1e-9, "el cable llega a la luz");
  }
});

test("la cámara de la escena sale del celular del rig y mira hacia donde mira el rig", () => {
  for (const format of ["vertical", "horizontal"] as const) {
    for (const preset of [undefined, "INFORMATIVO_PECHO", "AUTORIDAD_CONTRAPICADO", "VULNERABLE_PICADO"]) {
      const { camera, placement } = sceneCamera(format, preset);
      const layout = rigLayout(format);
      // El rig se pone donde está la cámara: el lente del celular cae exactamente en el origen del frustum.
      const lens = rigToWorld(layout.lens, camera.position, camera.quaternion);
      assert.ok(near(lens, camera.position, 1e-9), `${format} ${preset}: el frustum sale del lente`);
      assert.ok(near(lens, new Vector3(...placement.position), 1e-9));
      // El rig mira (−Z) hacia donde mira la cámara, y el aspecto del frustum es el del celular.
      const forward = camera.getWorldDirection(new Vector3());
      assert.ok(near(rigDirection(new Vector3(0, 0, -1), camera.quaternion), forward, 1e-9), `${format} ${preset}: el rig mira como la cámara`);
      const [w, h] = layout.phone.size;
      assert.equal(camera.aspect > 1, w > h, `${format}: el cuadro tiene la orientación del celular`);
    }
  }
});

test("agarre: cada palma rodea su asa y los dedos apuntan al sujeto", () => {
  const { camera } = sceneCamera("vertical");
  const layout = rigLayout("vertical");
  const forward = camera.getWorldDirection(new Vector3());
  for (const handle of ["L", "R"] as const) {
    const grip = handleGrip(layout, handle, camera.position, camera.quaternion);
    assert.ok(near(grip.point, rigToWorld(layout.handles[handle].center, camera.position, camera.quaternion), 1e-9));
    assert.ok(grip.fingers.dot(forward) > 0.999, `${handle}: dedos hacia el sujeto`);
    // La palma mira hacia el centro del rig (el asa queda entre la palma y el celular).
    const toCenter = rigToWorld(layout.cage.center, camera.position, camera.quaternion).sub(grip.point).normalize();
    assert.ok(grip.palm.dot(toCenter) > 0.9, `${handle}: la palma mira al rig`);
    assert.ok(Math.abs(grip.palm.dot(grip.fingers)) < 1e-9);
  }
  assert.ok(HANDLE_PALM_GAP > RIG_SIZES.handle.radius && HANDLE_PALM_GAP < 0.03, "la palma se apoya en el asa sin atravesarla");
});

test("qué mano toma qué: en mano las dos asas, en trípode una, con luz de mano la otra lleva la luz", () => {
  assert.deepEqual(crewHands({ tripod: false, ledHand: null }), { grips: { L: "L", R: "R" }, standSide: 0 });
  assert.deepEqual(crewHands({ tripod: false, ledHand: "L" }), { grips: { R: "R" }, standSide: 0 });
  assert.deepEqual(crewHands({ tripod: false, ledHand: "R" }), { grips: { L: "L" }, standSide: 0 });
  // En trípode se para a un costado y toma con la mano de adentro el asa de ese lado.
  assert.deepEqual(crewHands({ tripod: true, ledHand: null }), { grips: { R: "L" }, standSide: -1 });
  assert.deepEqual(crewHands({ tripod: true, ledHand: "R" }), { grips: { L: "R" }, standSide: 1 });
  const camera = new Vector3(0, 1.3, 1.4);
  const back = new Vector3(0, 0, 1);
  const right = new Vector3(1, 0, 0);
  const handheld = crewStand(camera, back, right, { distance: 0.34, standSide: 0 });
  assert.ok(near(handheld, new Vector3(0, 0, 1.74), 1e-9), "en mano, detrás del rig");
  const tripod = crewStand(camera, back, right, { distance: 0.3, standSide: -1 });
  assert.ok(tripod.z > camera.z && tripod.x < -0.2 && tripod.y === 0, "en trípode, detrás y a la izquierda de la toma");
});

test("luz de mano: del lado de la luz, delante del rig y por encima del lente; el brazo no pasa de su alcance", () => {
  const { camera } = sceneCamera("vertical", "LUZ_DE_MANO");
  const forward = camera.getWorldDirection(new Vector3()).setY(0).normalize();
  const right = new Vector3(-forward.z, 0, forward.x);
  for (const side of [-1, 1] as const) {
    const point = handLedPoint(camera.position, camera.quaternion, side);
    const offset = point.clone().sub(camera.position);
    assert.ok(offset.dot(right) * side > 0.4, `${side}: hacia el lado de la luz`);
    assert.ok(offset.dot(forward) > 0 && offset.y > 0.1, `${side}: delante y por encima del lente`);
  }
  const shoulder = new Vector3(0.2, 1.45, 1.8);
  const far = new Vector3(-1, 1.6, 0.5);
  const reached = clampToReach(shoulder, far, 0.55);
  assert.ok(Math.abs(reached.distanceTo(shoulder) - 0.55) < 1e-9, "estira el brazo hasta su alcance");
  assert.ok(reached.clone().sub(shoulder).normalize().dot(far.clone().sub(shoulder).normalize()) > 0.999999, "en la dirección pedida");
  assert.ok(near(clampToReach(shoulder, new Vector3(0.3, 1.5, 1.6), 0.55), new Vector3(0.3, 1.5, 1.6)), "si llega, no lo mueve");
});

test("luz trasera: su soporte queda detrás del sujeto respecto de la cámara, por encima de la cabeza y apunta a la nuca", () => {
  const cases = [
    { format: "vertical" as const, preset: undefined, wall: -2.6 },
    { format: "horizontal" as const, preset: "TRES_PUNTOS_COLOR", wall: -2.6 },
    { format: "vertical" as const, preset: "PODCAST_SEMILATERAL", wall: -2.6 },
    { format: "vertical" as const, preset: "TRES_PUNTOS_COLOR", wall: -0.95 },
  ];
  for (const { format, preset, wall } of cases) {
    const { config, camera } = sceneCamera(format, preset);
    const subject = subjectBase(config);
    const eyeY = eyeHeight(config.subjects.seated, config.body.feet);
    for (const side of [-1, 1] as const) {
      const { position, target } = backLightSpot(subject, { x: camera.position.x, z: camera.position.z }, eyeY, side, wall);
      const label = `${format} ${preset} pared ${wall} lado ${side}`;
      const toCamera = new Vector3(camera.position.x - subject.x, 0, camera.position.z - subject.z).normalize();
      const fromSubject = new Vector3(position.x - subject.x, 0, position.z - subject.z);
      // Detrás del sujeto visto desde la cámara, y del lado pedido de la toma.
      assert.ok(fromSubject.dot(toCamera) < -0.3, `${label}: detrás del sujeto`);
      const right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion).setY(0).normalize();
      assert.ok(fromSubject.dot(right) * side > 0.5, `${label}: del lado ${side}`);
      // Entre la pared y el sujeto: la pared no lo tapa.
      assert.ok(position.z > wall + 0.2, `${label}: delante de la pared`);
      // Por encima de la cabeza, apuntando a la nuca y los hombros.
      assert.ok(position.y > eyeY + 0.3, `${label}: por encima de la cabeza`);
      assert.ok(Math.abs(target.y - (eyeY - 0.1)) < 0.02 && Math.hypot(target.x - subject.x, target.z - subject.z) < 0.1, `${label}: apunta a la cabeza`);
      const aim = target.clone().sub(position).normalize();
      const head = new Vector3(subject.x, eyeY - 0.05, subject.z).sub(position).normalize();
      assert.ok(aim.dot(head) > 0.99, `${label}: el haz va hacia la cabeza`);
    }
  }
});

test("con la cámara de frente, la luz trasera queda detrás, a la derecha de la toma y alta", () => {
  // El visor crea la SpotLight trasera y su soporte en `backLightSpot(...).position`.
  const spot = backLightSpot({ x: 0, z: 0 }, { x: 0, z: 1.4 }, 1.6, 1, -2.6);
  assert.ok(spot.position.z < -0.5 && spot.position.x > 0.5 && spot.position.y > 1.9);
  // Con la pared pegada (error «Sin luz trasera»), el soporte se acerca al sujeto pero sigue delante de la pared.
  const close = backLightSpot({ x: 0, z: 0 }, { x: 0, z: 1.4 }, 1.6, 1, -0.95);
  assert.ok(close.position.z < 0 && close.position.z > -0.95);
});
