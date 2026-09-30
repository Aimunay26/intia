/**
 * Small rig del filmmaker y soportes de luz del visor 3D del manual: geometría pura (sin DOM),
 * probada en tests/manual-rig.test.mts.
 *
 * Quien graba siempre lleva el celular en un «small rig»: una jaula alrededor del celular (vertical
 * en 9:16, horizontal en 16:9), dos asas laterales, una luz LED chica en la zapata de arriba y un
 * power bank debajo con su cable hasta la luz. El lente del celular es el origen del rig y es la
 * cámara de la escena: la «Vista de cámara» es lo que ve ese celular.
 *
 * Marco del rig = marco de la cámara de three.js: +X a la derecha de la toma, +Y arriba y la cámara
 * mira hacia −Z (hacia el sujeto); +Z va hacia quien graba.
 *
 * Además: dónde va el soporte de la luz trasera (detrás del sujeto respecto de la cámara, apuntando
 * a la nuca y los hombros) y qué mano toma cada asa.
 */
import { Quaternion, Vector3 } from "three";

import type { FrameFormat } from "@/lib/manual-scene";

export type RigSide = "L" | "R";
type Vec3 = [number, number, number];

/** Medidas (m). El celular se describe en vertical; en 16:9 va acostado. */
export const RIG_SIZES = {
  phone: { long: 0.155, short: 0.075, depth: 0.009 },
  /** Del borde del celular a los barrotes de la jaula. */
  cageMargin: 0.012,
  bar: 0.008,
  /** Del barrote lateral al eje del asa. */
  handleGap: 0.035,
  handle: { radius: 0.015, length: 0.13 },
  led: { width: 0.085, height: 0.05, depth: 0.018 },
  /** De la jaula a la cara de la luz (zapata fría). */
  shoe: 0.03,
  bank: { width: 0.07, height: 0.026, depth: 0.11 },
  /** Del lente al extremo del celular por el lado largo (el lente va arriba, como en un celular real). */
  lensInset: 0.024,
} as const;

export type RigLayout = {
  format: FrameFormat;
  /** Lente del celular: el origen, siempre (la cámara de la escena sale de aquí). */
  lens: Vector3;
  phone: { center: Vector3; size: Vec3 };
  /** Rectángulo interior de la jaula (centro y medidas en X e Y). */
  cage: { center: Vector3; width: number; height: number };
  /** Centro de cada asa (L: a la izquierda de la toma, R: a la derecha) y su eje (vertical en el rig). */
  handles: Record<RigSide, { center: Vector3; axis: Vector3 }>;
  /** Cara de la luz LED (mira hacia −Z, al sujeto) y la zapata que la sostiene. */
  led: { center: Vector3; size: Vec3 };
  shoe: Vector3;
  bank: { center: Vector3; size: Vec3 };
  /** Puntos del cable del power bank a la luz (pasa por detrás de la jaula). */
  cable: Vector3[];
};

/** Arma el rig para un formato. El lente queda en el origen. */
export function rigLayout(format: FrameFormat): RigLayout {
  const s = RIG_SIZES;
  const vertical = format === "vertical";
  const phoneW = vertical ? s.phone.short : s.phone.long;
  const phoneH = vertical ? s.phone.long : s.phone.short;
  // El lente, en la cara de atrás, cerca de un extremo: el celular se corre para que el lente quede en el origen.
  const center = vertical ? new Vector3(0, -(phoneH / 2 - s.lensInset), s.phone.depth / 2) : new Vector3(phoneW / 2 - s.lensInset, 0, s.phone.depth / 2);
  const cageW = phoneW + 2 * s.cageMargin;
  const cageH = phoneH + 2 * s.cageMargin;
  const handleX = cageW / 2 + s.bar + s.handleGap;
  const handleZ = center.z + 0.01;
  const up = new Vector3(0, 1, 0);
  const handles = {
    L: { center: new Vector3(center.x - handleX, center.y, handleZ), axis: up.clone() },
    R: { center: new Vector3(center.x + handleX, center.y, handleZ), axis: up.clone() },
  };
  const top = center.y + cageH / 2 + s.bar;
  const shoe = new Vector3(center.x, top + s.shoe / 2, center.z);
  const led = new Vector3(center.x, top + s.shoe + s.led.height / 2, center.z - 0.004);
  const bottom = center.y - cageH / 2 - s.bar;
  const bank = new Vector3(center.x, bottom - s.bank.height / 2 - 0.004, center.z + 0.02);
  const cableX = center.x + cageW / 2 * 0.55;
  const cable = [
    new Vector3(cableX, bank.y, bank.z + s.bank.depth / 2),
    new Vector3(cableX + 0.012, bank.y + 0.03, bank.z + s.bank.depth / 2 + 0.03),
    new Vector3(cableX + 0.02, center.y, center.z + 0.06),
    new Vector3(cableX + 0.012, led.y - 0.03, led.z + 0.05),
    new Vector3(cableX, led.y, led.z + s.led.depth / 2),
  ];
  return {
    format,
    lens: new Vector3(0, 0, 0),
    phone: { center, size: [phoneW, phoneH, s.phone.depth] },
    cage: { center: center.clone(), width: cageW, height: cageH },
    handles,
    led: { center: led, size: [s.led.width, s.led.height, s.led.depth] },
    shoe,
    bank: { center: bank, size: [s.bank.width, s.bank.height, s.bank.depth] },
    cable,
  };
}

/** Un punto del rig en el mundo, con el rig puesto donde está la cámara (posición y giro). */
export function rigToWorld(point: Vector3, cameraPosition: Vector3, cameraQuaternion: Quaternion) {
  return point.clone().applyQuaternion(cameraQuaternion).add(cameraPosition);
}

/** Una dirección del rig en el mundo. */
export function rigDirection(direction: Vector3, cameraQuaternion: Quaternion) {
  return direction.clone().applyQuaternion(cameraQuaternion).normalize();
}

export type HandleGrip = {
  /** Centro del asa (mundo): ahí va el centro de la palma. */
  point: Vector3;
  /** Hacia dónde apuntan los dedos (mundo): hacia adelante, al sujeto. */
  fingers: Vector3;
  /** Hacia dónde mira la palma (mundo): hacia el centro del rig, rodeando el asa. */
  palm: Vector3;
};

/**
 * Agarre de cada mano en el mundo. Quien graba mira hacia donde mira la cámara: su izquierda es la
 * izquierda de la toma, así que la mano izquierda toma el asa izquierda y la derecha, la derecha
 * (en trípode, parado a un costado, una mano toma el asa del otro lado: ver `crewHands`).
 */
export function handleGrip(layout: RigLayout, handle: RigSide, cameraPosition: Vector3, cameraQuaternion: Quaternion): HandleGrip {
  const forward = rigDirection(new Vector3(0, 0, -1), cameraQuaternion);
  const inward = rigDirection(new Vector3(handle === "L" ? 1 : -1, 0, 0), cameraQuaternion);
  return { point: rigToWorld(layout.handles[handle].center, cameraPosition, cameraQuaternion), fingers: forward, palm: inward };
}

/**
 * Qué mano sostiene qué. `ledHand`: la mano que lleva la luz LED de mano (preset «Luz de mano»), o
 * null si la luz va en el rig. En mano: las dos asas (o una, si la otra mano lleva la luz). En
 * trípode: quien graba se para a un costado y detrás, y toma con una mano el asa más cercana.
 */
export function crewHands(mode: { tripod: boolean; ledHand: RigSide | null }): { grips: Partial<Record<RigSide, RigSide>>; standSide: -1 | 0 | 1 } {
  if (mode.tripod) {
    // Parado del lado contrario a la luz de mano (o a la izquierda de la toma): la mano de adentro toma el asa de su lado.
    const standSide: -1 | 1 = mode.ledHand === "R" ? 1 : -1;
    return standSide === -1 ? { grips: { R: "L" }, standSide } : { grips: { L: "R" }, standSide };
  }
  if (mode.ledHand === "L") return { grips: { R: "R" }, standSide: 0 };
  if (mode.ledHand === "R") return { grips: { L: "L" }, standSide: 0 };
  return { grips: { L: "L", R: "R" }, standSide: 0 };
}

/** De la palma al eje del asa: la palma se apoya en el asa, no la atraviesa. */
export const HANDLE_PALM_GAP = 0.022;

/**
 * Dónde se para quien graba (su raíz, a nivel del piso) respecto del celular: detrás, a lo largo
 * de `back` (horizontal y unitaria, del celular hacia atrás), y en trípode corrido hacia un costado.
 */
export function crewStand(cameraPosition: Vector3, back: Vector3, right: Vector3, options: { distance: number; standSide: -1 | 0 | 1 }) {
  const spot = cameraPosition.clone().addScaledVector(back, options.distance);
  if (options.standSide) spot.addScaledVector(right, options.standSide * 0.3);
  spot.y = 0;
  return spot;
}

/**
 * Dónde lleva quien graba la luz LED de mano: con el brazo estirado hacia el lado de la luz (`side`:
 * +1 derecha de la toma), un poco delante del rig y por encima del lente, apuntando al rostro. Desde
 * detrás de la cámara es lo más cerca de los 45° que se llega (unos 25-30° a 1.3 m del sujeto); el
 * brazo no pasa de su alcance (ver `clampToReach`).
 */
export function handLedPoint(cameraPosition: Vector3, cameraQuaternion: Quaternion, side: -1 | 1) {
  const forward = new Vector3(0, 0, -1).applyQuaternion(cameraQuaternion).setY(0);
  if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
  forward.normalize();
  const right = new Vector3(-forward.z, 0, forward.x);
  return cameraPosition.clone().addScaledVector(right, side * 0.5).addScaledVector(forward, 0.12).add(new Vector3(0, 0.16, 0));
}

/** Un punto llevado al alcance cómodo (`reach` m) desde el hombro, en la misma dirección. */
export function clampToReach(shoulder: Vector3, point: Vector3, reach: number) {
  const gap = point.clone().sub(shoulder);
  return gap.length() <= reach ? point.clone() : shoulder.clone().addScaledVector(gap.normalize(), reach);
}

/* ------------------------------------------------------------ LUZ TRASERA -- */

/**
 * Soporte de la luz trasera: detrás del sujeto (respecto de la cámara), hacia un costado y por encima
 * de la cabeza, apuntando a la nuca y los hombros. `subject`: dónde está parado (mundo); `camera`:
 * dónde está el celular; `side`: hacia qué lado de la toma va (+1 derecha, −1 izquierda); `wallZ`: la
 * pared de atrás, que nunca lo tapa (el soporte queda entre la pared y el sujeto).
 */
export function backLightSpot(subject: { x: number; z: number }, camera: { x: number; z: number }, eyeY: number, side: -1 | 1, wallZ: number) {
  const toCamera = new Vector3(camera.x - subject.x, 0, camera.z - subject.z);
  if (toCamera.lengthSq() < 1e-6) toCamera.set(0, 0, 1);
  toCamera.normalize();
  // Derecha de la toma vista desde la cámara (mira hacia −toCamera).
  const right = new Vector3(toCamera.z, 0, -toCamera.x);
  const behind = Math.min(1.0, Math.max(0.35, subject.z - wallZ - 0.3));
  const position = new Vector3(subject.x, eyeY + 0.42, subject.z).addScaledVector(toCamera, -behind).addScaledVector(right, side * 0.95);
  const target = new Vector3(subject.x, eyeY - 0.1, subject.z).addScaledVector(toCamera, -0.04);
  return { position, target };
}
