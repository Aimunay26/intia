/**
 * Personajes 3D del visor del manual: lógica pura (sin DOM) para posar los esqueletos de
 * los GLB descritos en el manifiesto. Probado en tests/manual-characters.test.mts.
 *
 * Cómo se posa sin suponer los ejes de cada rig (el Biped de 3ds Max y el rig estilo UE tienen
 * ejes locales distintos):
 * - Todo se expresa en el «espacio del personaje», el de la raíz del GLB: +X es su izquierda,
 *   +Y arriba y +Z adelante (los modelos miran a +Z con los pies en y=0).
 * - De la pose de reposo (A-pose = bind pose) se toma la posición y la rotación de cada hueso en ese
 *   espacio. La dirección de cada segmento sale de la posición de su hijo (hombro→codo, codo→muñeca,
 *   cadera→rodilla, rodilla→tobillo) y la bisagra del codo y de la rodilla, del producto vectorial de
 *   esa dirección con el frente (codo) o la espalda (rodilla). Nunca se leen los ejes locales.
 * - Cada hueso recibe un giro D expresado en el espacio del personaje y arrastrado por sus padres. El
 *   cuaternión local es L = L0 · W0⁻¹ · D · W0 (L0: local de reposo; W0: rotación de reposo en el
 *   espacio del personaje), así que el mismo D mueve igual a los dos rigs.
 * - Brazos y piernas se resuelven con IK de dos huesos (objetivo + polo): el segmento superior gira
 *   sobre su eje hasta alinear la bisagra y el inferior solo se dobla sobre ella (el codo y la rodilla
 *   nunca se doblan al revés).
 */
import { AnimationMixer, Euler, Matrix4, Quaternion, Vector3, type AnimationClip, type Bone, type Object3D } from "three";

import type { HuesoPersonaje, ManifestoPersonajes, ModeloPersonaje, PersonajeId } from "@/lib/manual-3d";
import type { ProductKind, SceneBody, SubjectAction } from "@/lib/manual-scene";

/* ------------------------------------------------------------ CATÁLOGOS -- */

/** Huesos que se posan, en orden de la cadena (cada padre antes que sus hijos en los rigs conocidos). */
export const HUESOS = [
  "pelvis", "spine", "chest", "neck", "head",
  "upperArmL", "lowerArmL", "handL", "upperArmR", "lowerArmR", "handR",
  "thighL", "calfL", "footL", "thighR", "calfR", "footR",
] as const satisfies readonly HuesoPersonaje[];
// Si el contrato suma un hueso y esta lista no, deja de compilar.
const _huesosCompletos: [Exclude<HuesoPersonaje, (typeof HUESOS)[number]>] extends [never] ? true : false = true;

export const PERSONAJE_IDS = ["camarografo", "actriz-1", "actriz-2"] as const satisfies readonly PersonajeId[];
const ARCHIVOS_GLB = ["camarografo.glb", "actriz-1.glb", "actriz-2.glb"] as const;

/** Rol en la escena → personaje. Quien graba es el camarógrafo; el sujeto, la actriz 1; la segunda persona, la actriz 2. */
export type CharacterCast = { subject: PersonajeId | null; second: PersonajeId | null; operator: PersonajeId | null };

/**
 * Qué personaje ocupa cada lugar. Como mucho 3 instancias (sujeto, segunda persona y quien graba):
 * cualquier otra figura (la persona que sostiene la luz de mano, por ejemplo) sigue como maniquí.
 */
export function castCharacters(subjects: { count: 1 | 2; operator: boolean; productOnly: boolean }): CharacterCast {
  return {
    subject: subjects.productOnly ? null : "actriz-1",
    second: subjects.count === 2 ? "actriz-2" : null,
    operator: subjects.operator ? "camarografo" : null,
  };
}

/** Personajes distintos que hay que descargar para un reparto. */
export function castIds(cast: CharacterCast): PersonajeId[] {
  return [...new Set([cast.subject, cast.second, cast.operator].filter((id): id is PersonajeId => id !== null))];
}

/* ------------------------------------------------------------ MANIFIESTO -- */

function invalid(why: string): never {
  throw new Error(`Manifiesto de personajes inválido: ${why}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) invalid(`${what} no es un número`);
  return value;
}

function text(value: unknown, what: string): string {
  if (typeof value !== "string" || !value.trim()) invalid(`falta ${what}`);
  return value;
}

function parsePersonaje(raw: unknown, index: number): ModeloPersonaje {
  if (!isRecord(raw)) invalid(`el personaje ${index} no es un objeto`);
  const id = raw.id;
  if (!(PERSONAJE_IDS as readonly unknown[]).includes(id)) invalid(`id desconocido en el personaje ${index}`);
  const archivo = raw.archivo;
  if (!(ARCHIVOS_GLB as readonly unknown[]).includes(archivo)) invalid(`archivo no permitido en ${String(id)}`);
  const rig = raw.rig;
  if (rig !== "BIPED" && rig !== "UE") invalid(`rig desconocido en ${String(id)}`);
  if (!isRecord(raw.huesos)) invalid(`faltan los huesos de ${String(id)}`);
  const source = raw.huesos;
  const huesos = {} as Record<HuesoPersonaje, string>;
  for (const key of HUESOS) huesos[key] = text(source[key], `el hueso ${key} de ${String(id)}`);
  if (!isRecord(raw.ojos)) invalid(`faltan los ojos de ${String(id)}`);
  const altura = finite(raw.altura, `la altura de ${String(id)}`);
  const ojos = { altura: finite(raw.ojos.altura, "ojos.altura"), adelante: finite(raw.ojos.adelante, "ojos.adelante") };
  if (altura <= 0.5 || altura > 2.5 || ojos.altura <= 0.3 || ojos.altura >= altura) invalid(`medidas fuera de rango en ${String(id)}`);
  const personaje: ModeloPersonaje = {
    id: id as PersonajeId,
    nombre: text(raw.nombre, `el nombre de ${String(id)}`),
    archivo: archivo as ModeloPersonaje["archivo"],
    altura,
    rig,
    huesos,
    ojos,
    notas: typeof raw.notas === "string" ? raw.notas : "",
  };
  if (raw.animaciones !== undefined) {
    if (!isRecord(raw.animaciones)) invalid(`animaciones inválidas en ${String(id)}`);
    const a = raw.animaciones;
    personaje.animaciones = { reposo: text(a.reposo, "animaciones.reposo"), caminar: text(a.caminar, "animaciones.caminar"), hablar: text(a.hablar, "animaciones.hablar") };
  }
  return personaje;
}

/** Valida el manifiesto que llega por la red. Lanza un error legible si algo no cuadra. */
export function parseManifest(raw: unknown): ManifestoPersonajes {
  if (!isRecord(raw)) invalid("no es un objeto");
  const version = finite(raw.version, "version");
  if (!Array.isArray(raw.personajes)) invalid("falta la lista de personajes");
  const personajes = raw.personajes.map(parsePersonaje);
  if (new Set(personajes.map(item => item.id)).size !== personajes.length) invalid("hay personajes repetidos");
  return { version, personajes };
}

/* ---------------------------------------------------------- MAPA DE HUESOS -- */

export type BoneMap = Record<HuesoPersonaje, Bone>;

/**
 * Busca cada hueso del manifiesto por su nombre exacto. Rechaza nombres inexistentes (o que no
 * sean huesos) y dos claves apuntando al mismo hueso.
 */
export function resolveBoneMap(root: Object3D, huesos: Record<HuesoPersonaje, string>): BoneMap {
  const byName = new Map<string, Bone>();
  root.traverse(object => {
    const bone = object as Bone;
    if (bone.isBone && bone.name && !byName.has(bone.name)) byName.set(bone.name, bone);
  });
  const missing: string[] = [];
  const used = new Map<Bone, HuesoPersonaje>();
  const map = {} as BoneMap;
  for (const key of HUESOS) {
    const name = huesos[key];
    const bone = typeof name === "string" ? byName.get(name) : undefined;
    if (!bone) {
      missing.push(`${key} («${String(name)}»)`);
      continue;
    }
    const twin = used.get(bone);
    if (twin) throw new Error(`Huesos repetidos en el manifiesto: ${twin} y ${key} apuntan a «${name}».`);
    used.set(bone, key);
    map[key] = bone;
  }
  if (missing.length) throw new Error(`Huesos inexistentes en el modelo: ${missing.join(", ")}.`);
  return map;
}

/* ------------------------------------------------------------ CALIBRACIÓN -- */

type BoneRest = {
  /** Cuaternión y posición locales de reposo. */
  local: Quaternion;
  localPos: Vector3;
  /** Rotación y posición de reposo en el espacio del personaje. */
  world: Quaternion;
  worldInv: Quaternion;
  pos: Vector3;
  /** Rotación de reposo del padre inmediato (aunque no esté en el mapa), en el espacio del personaje. */
  parentWorld: Quaternion;
};

type LimbRest = {
  upper: HuesoPersonaje;
  lower: HuesoPersonaje;
  end: HuesoPersonaje;
  upperDir: Vector3;
  lowerDir: Vector3;
  upperLen: number;
  lowerLen: number;
  /** Bisagra (codo o rodilla) en reposo: perpendicular al segmento superior. */
  hinge: Vector3;
  /** Flexión de reposo alrededor de la bisagra (rad). */
  restBend: number;
};

export type Side = "L" | "R";

export type RigCalibration = {
  rest: Record<HuesoPersonaje, BoneRest>;
  /** Ancestro más cercano que también está en el mapa (null solo para la pelvis). */
  ancestor: Record<HuesoPersonaje, HuesoPersonaje | null>;
  /** Orden en que se resuelven los huesos (cada ancestro antes que sus descendientes). */
  order: HuesoPersonaje[];
  arm: Record<Side, LimbRest>;
  leg: Record<Side, LimbRest>;
  /** Largo del brazo (hombro→muñeca), promedio de los dos lados. */
  armLength: number;
  /** Altura de reposo de los tobillos: al posar se mantienen ahí para que los pies pisen el piso. */
  ankleY: number;
  /**
   * Dirección de los dedos en reposo (muñeca → nudillo del dedo medio), si el rig la tiene: permite
   * doblar la muñeca (manos en la cintura) sin suponer los ejes de la mano.
   */
  fingers: Record<Side, Vector3 | null>;
  /** Hacia dónde mira la palma en reposo (sale de la posición del pulgar), perpendicular a los dedos. */
  palm: Record<Side, Vector3 | null>;
  /** Del espacio del personaje al espacio local del padre de la pelvis (solo rotación y escala). */
  pelvisParentInv: Matrix4;
  /** Punto medio entre los ojos en reposo (espacio del personaje) y el mismo punto en el espacio de la cabeza. */
  eye: Vector3;
  eyeLocal: Vector3;
};

/** Qué cadena tiene que cumplirse para que el IK tenga sentido. */
const CHAIN: readonly [HuesoPersonaje, HuesoPersonaje][] = [
  ["lowerArmL", "upperArmL"], ["handL", "lowerArmL"], ["lowerArmR", "upperArmR"], ["handR", "lowerArmR"],
  ["calfL", "thighL"], ["footL", "calfL"], ["calfR", "thighR"], ["footR", "calfR"], ["head", "neck"],
];

/** Hijo de la mano que marca hacia dónde apuntan los dedos: el dedo medio (UE: middle_*, Biped: Finger2). */
const MIDDLE_FINGER = /middle|finger2/i;
const THUMB = /thumb|finger0/i;
const NOT_FINGERS = /thumb|finger0|vol|twist|_end|nub/i;

/** Dedos (muñeca → dedo medio) y palma (perpendicular, del lado contrario al dorso) de una mano en reposo. */
function restHand(hand: Bone, rootInv: Matrix4, handPos: Vector3, side: Side) {
  const children = hand.children.filter(child => (child as Bone).isBone);
  const at = (child: Object3D) => new Vector3().setFromMatrixPosition(child.matrixWorld).applyMatrix4(rootInv).sub(handPos);
  const middle = children.find(child => MIDDLE_FINGER.test(child.name));
  const picked = middle ? [middle] : children.filter(child => !NOT_FINGERS.test(child.name));
  if (!picked.length) return { fingers: null, palm: null };
  const fingers = picked.reduce((sum, child) => sum.add(at(child)), new Vector3());
  if (fingers.lengthSq() < 1e-8) return { fingers: null, palm: null };
  fingers.normalize();
  const thumbBone = children.find(child => THUMB.test(child.name));
  if (!thumbBone) return { fingers, palm: null };
  const thumb = at(thumbBone).normalize();
  // Mano izquierda: dedos × pulgar apunta a la palma; en la derecha (espejo) es al revés.
  const palm = side === "L" ? new Vector3().crossVectors(fingers, thumb) : new Vector3().crossVectors(thumb, fingers);
  palm.addScaledVector(fingers, -palm.dot(fingers));
  return { fingers, palm: palm.lengthSq() > 1e-8 ? palm.normalize() : null };
}

const FORWARD = new Vector3(0, 0, 1);
const BACKWARD = new Vector3(0, 0, -1);

function signedAngle(from: Vector3, to: Vector3, axis: Vector3) {
  return Math.atan2(new Vector3().crossVectors(from, to).dot(axis), from.dot(to));
}

function limbRest(rest: Record<HuesoPersonaje, BoneRest>, upper: HuesoPersonaje, lower: HuesoPersonaje, end: HuesoPersonaje, bendToward: Vector3): LimbRest {
  const upperVec = rest[lower].pos.clone().sub(rest[upper].pos);
  const lowerVec = rest[end].pos.clone().sub(rest[lower].pos);
  const upperDir = upperVec.clone().normalize();
  const lowerDir = lowerVec.clone().normalize();
  // La bisagra sale de la dirección del hueso y del lado hacia el que se dobla (codo: adelante; rodilla: atrás).
  const hinge = new Vector3().crossVectors(upperDir, bendToward);
  if (hinge.lengthSq() < 1e-8) throw new Error(`No se puede calcular la bisagra de ${upper}: el hueso apunta hacia adelante en reposo.`);
  hinge.normalize();
  const projected = lowerDir.clone().addScaledVector(hinge, -hinge.dot(lowerDir)).normalize();
  return {
    upper, lower, end, upperDir, lowerDir,
    upperLen: upperVec.length(),
    lowerLen: lowerVec.length(),
    hinge,
    restBend: signedAngle(upperDir, projected, hinge),
  };
}

/**
 * Lee la pose de reposo del modelo (debe estar en su bind pose, sin animar). Se hace una vez por
 * archivo: los clones comparten la misma calibración.
 */
export function calibrateRig(root: Object3D, spec: Pick<ModeloPersonaje, "huesos" | "ojos">, bones: BoneMap = resolveBoneMap(root, spec.huesos)): RigCalibration {
  root.updateMatrixWorld(true);
  const rootInv = root.matrixWorld.clone().invert();
  const scratchPos = new Vector3();
  const scratchScale = new Vector3();
  const relative = (object: Object3D) => new Matrix4().multiplyMatrices(rootInv, object.matrixWorld);
  const rest = {} as Record<HuesoPersonaje, BoneRest>;
  for (const key of HUESOS) {
    const bone = bones[key];
    const pos = new Vector3();
    const world = new Quaternion();
    relative(bone).decompose(pos, world, new Vector3());
    const parentWorld = new Quaternion();
    if (bone.parent) relative(bone.parent).decompose(scratchPos, parentWorld, scratchScale);
    rest[key] = { local: bone.quaternion.clone(), localPos: bone.position.clone(), world, worldInv: world.clone().invert(), pos, parentWorld };
  }

  const keyOf = new Map<Object3D, HuesoPersonaje>(HUESOS.map(key => [bones[key], key]));
  const ancestor = {} as Record<HuesoPersonaje, HuesoPersonaje | null>;
  for (const key of HUESOS) {
    let node = bones[key].parent;
    while (node && !keyOf.has(node)) node = node.parent;
    ancestor[key] = node ? keyOf.get(node)! : null;
  }
  for (const key of HUESOS) {
    if (key !== "pelvis" && ancestor[key] === null) throw new Error(`El hueso ${key} no cuelga de la pelvis.`);
  }
  if (ancestor.pelvis !== null) throw new Error("La pelvis tiene que ser la raíz de los huesos del manifiesto.");
  for (const [child, parent] of CHAIN) {
    if (ancestor[child] !== parent) throw new Error(`Cadena inesperada: ${child} debería colgar de ${parent}.`);
  }
  // Orden topológico: se resuelve primero lo que está más arriba en la jerarquía.
  const level = (key: HuesoPersonaje): number => (ancestor[key] ? level(ancestor[key]!) + 1 : 0);
  const order = [...HUESOS].sort((a, b) => level(a) - level(b) || HUESOS.indexOf(a) - HUESOS.indexOf(b));

  const arm = {
    L: limbRest(rest, "upperArmL", "lowerArmL", "handL", FORWARD),
    R: limbRest(rest, "upperArmR", "lowerArmR", "handR", FORWARD),
  };
  const leg = {
    L: limbRest(rest, "thighL", "calfL", "footL", BACKWARD),
    R: limbRest(rest, "thighR", "calfR", "footR", BACKWARD),
  };

  const hands = { L: restHand(bones.handL, rootInv, rest.handL.pos, "L"), R: restHand(bones.handR, rootInv, rest.handR.pos, "R") };
  const pelvisParentInv = new Matrix4();
  const pelvisParent = bones.pelvis.parent;
  if (pelvisParent) {
    pelvisParentInv.copy(relative(pelvisParent)).setPosition(0, 0, 0).invert();
  }
  const eye = new Vector3(rest.head.pos.x, spec.ojos.altura, rest.head.pos.z + spec.ojos.adelante);
  const eyeLocal = eye.clone().applyMatrix4(relative(bones.head).invert());
  return {
    rest,
    ancestor,
    order,
    arm,
    leg,
    armLength: (arm.L.upperLen + arm.L.lowerLen + arm.R.upperLen + arm.R.lowerLen) / 2,
    ankleY: (rest.footL.pos.y + rest.footR.pos.y) / 2,
    fingers: { L: hands.L.fingers, R: hands.R.fingers },
    palm: { L: hands.L.palm, R: hands.R.palm },
    pelvisParentInv,
    eye,
    eyeLocal,
  };
}

/* ---------------------------------------------------------------- IK -- */

export type TwoBoneSolution = {
  /** Dirección del segmento superior, bisagra y flexión (rad) resueltas, en el espacio del objetivo. */
  upper: Vector3;
  lower: Vector3;
  hinge: Vector3;
  bend: number;
  /** Punto alcanzado: el objetivo, o lo más cerca que llega el brazo estirado. */
  reached: Vector3;
};

/**
 * IK analítico de dos huesos. `pole` indica hacia dónde apunta la articulación del medio (el codo o
 * la rodilla). La bisagra resultante es `normalize(polo⊥ × dirección al objetivo)`, que no depende de
 * cuánto se doble: sigue definida con el brazo estirado.
 */
export function solveTwoBone(start: Vector3, target: Vector3, upperLen: number, lowerLen: number, pole: Vector3): TwoBoneSolution {
  const toTarget = target.clone().sub(start);
  let distance = toTarget.length();
  const w = distance > 1e-6 ? toTarget.divideScalar(distance) : new Vector3(0, -1, 0);
  distance = Math.min(Math.max(distance, Math.abs(upperLen - lowerLen) + 1e-4), (upperLen + lowerLen) * 0.9995);
  const q = pole.clone().addScaledVector(w, -pole.dot(w));
  if (q.lengthSq() < 1e-10) q.set(0, 0, 1).addScaledVector(w, -w.z);
  if (q.lengthSq() < 1e-10) q.set(1, 0, 0).addScaledVector(w, -w.x);
  q.normalize();
  const cosAlpha = clampUnit((upperLen * upperLen + distance * distance - lowerLen * lowerLen) / (2 * upperLen * distance));
  const alpha = Math.acos(cosAlpha);
  const upper = w.clone().multiplyScalar(Math.cos(alpha)).addScaledVector(q, Math.sin(alpha));
  const reached = start.clone().addScaledVector(w, distance);
  const elbow = start.clone().addScaledVector(upper, upperLen);
  const lower = reached.clone().sub(elbow).normalize();
  const interior = Math.acos(clampUnit((upperLen * upperLen + lowerLen * lowerLen - distance * distance) / (2 * upperLen * lowerLen)));
  return { upper, lower, hinge: new Vector3().crossVectors(q, w).normalize(), bend: Math.PI - interior, reached };
}

/** Giro que lleva el par ortogonal (a1, b1) a (a2, b2). */
function frameRotation(a1: Vector3, b1: Vector3, a2: Vector3, b2: Vector3) {
  const orthonormal = (a: Vector3, b: Vector3) => {
    const x = a.clone().normalize();
    const y = b.clone().addScaledVector(x, -b.dot(x)).normalize();
    return new Matrix4().makeBasis(x, y, new Vector3().crossVectors(x, y));
  };
  const from = orthonormal(a1, b1);
  const to = orthonormal(a2, b2);
  return new Quaternion().setFromRotationMatrix(to.multiply(from.transpose()));
}

/** D (espacio del personaje, arrastrado por el padre) → cuaternión local del hueso. */
function localFrom(rest: BoneRest, delta: Quaternion) {
  return rest.local.clone().multiply(rest.worldInv).multiply(delta).multiply(rest.world);
}

function limbDeltas(limb: LimbRest, parentDelta: Quaternion, ik: TwoBoneSolution) {
  const toParent = parentDelta.clone().invert();
  const upper = frameRotation(limb.upperDir, limb.hinge, ik.upper.clone().applyQuaternion(toParent), ik.hinge.clone().applyQuaternion(toParent));
  // El segmento inferior se dobla sobre la bisagra; como en reposo no queda exactamente en el plano de
  // la bisagra (1-2°), un giro mínimo final lo lleva justo a la dirección del IK (la mano llega al punto).
  const bend = new Quaternion().setFromAxisAngle(limb.hinge, ik.bend - limb.restBend);
  const desired = ik.lower.clone().applyQuaternion(parentDelta.clone().multiply(upper).invert());
  const lower = new Quaternion().setFromUnitVectors(limb.lowerDir.clone().applyQuaternion(bend), desired).multiply(bend);
  return { upper, lower };
}

/* ---------------------------------------------------------------- POSE -- */

export type Vec3 = [number, number, number];

/**
 * Pose de un personaje en números (se mezcla entre pasos con `blendCharacterPose`).
 * - Torso y cabeza: radianes en el espacio del personaje (+ adelante en `lean`; `headPitch` + mira abajo).
 * - Manos: muñeca respecto del hombro, en largos de brazo y en el marco del pecho (+X su izquierda).
 *   Los polos marcan hacia dónde apunta cada codo. `wrist*`: hacia dónde apuntan los dedos (marco del
 *   pecho), con la palma hacia el cuerpo; su largo (0..1) es cuánto se dobla la muñeca, 0 = la mano
 *   sigue al antebrazo.
 * - Pies: tobillo en metros desde el centro de la pelvis a nivel del piso (y = cuánto se levanta).
 * - `knee`: flexión mínima de rodilla (rad) de la pierna más estirada; fija la altura de la cadera.
 * - `sit`: 0 de pie, 1 sentado sobre el asiento (caderas y rodillas a unos 90°).
 * - `hold`: 0..1, cuánto se separan las manos para sostener el producto entre las palmas (su ancho
 *   va en `SolveOptions.holdHalfWidth`).
 */
export type CharacterPose = {
  lean: number; torsoYaw: number; torsoRoll: number; pelvisYaw: number;
  headYaw: number; headPitch: number; headRoll: number;
  handL: Vec3; handR: Vec3; poleL: Vec3; poleR: Vec3; wristL: Vec3; wristR: Vec3;
  footL: Vec3; footR: Vec3; toeL: number; toeR: number;
  knee: number; sit: number; lift: number; hipShift: number; hold: number;
};

type ArmSpec = { hand: readonly [number, number, number]; pole: readonly [number, number, number]; wrist?: readonly [number, number, number] };

const ARMS: Record<"close" | "akimbo" | "show" | "point" | "react" | "lap", ArmSpec> = {
  /** Correcto: codos cerca del cuerpo, hombros sueltos y antebrazos un poco hacia adelante (manos entre pecho y cintura). */
  close: { hand: [-0.02, -0.66, 0.5], pole: [0.35, -1, -0.35] },
  /** Incorrecto: brazos en jarra, manos en la cintura y codos hacia afuera. */
  akimbo: { hand: [0.1, -0.66, 0.08], pole: [1, 0.05, -0.45], wrist: [0.05, -0.6, 0.8] },
  /**
   * Muestra el producto: manos a la altura del pecho, antebrazos hacia la cámara y dedos hacia
   * adelante con las palmas enfrentadas (el ancho entre ellas lo pone `hold`).
   */
  show: { hand: [-0.13, -0.3, 0.62], pole: [0.3, -1, -0.2], wrist: [0, 0.16, 0.987] },
  point: { hand: [-0.1, 0.1, 1], pole: [0.2, -1, 0] },
  react: { hand: [-0.2, -0.12, 0.46], pole: [1, -0.7, -0.2] },
  /** Sentada: manos apoyadas sobre los muslos. */
  lap: { hand: [-0.06, -0.62, 0.62], pole: [0.3, -1, -0.3] },
};

/** Postura correcta: un pie adelantado, el peso en el de atrás y las rodillas sueltas. */
const STANCE = { footL: [0.11, 0, 0.12] as Vec3, footR: [-0.12, 0, -0.06] as Vec3, knee: 0.2, hipShift: -0.02 };
/** Incorrecto: pies juntos y piernas rectas. */
const FEET_TOGETHER = { footL: [0.05, 0, 0.01] as Vec3, footR: [-0.05, 0, 0.01] as Vec3, knee: 0.02, hipShift: 0 };

/** Largo de un ciclo de marcha (dos pasos), en metros. */
export const STRIDE = 1.2;
const STIFF_STRIDE = 0.6;

// «+ 0» evita el −0 al reflejar un 0 (la mezcla entre pasos debe devolver exactamente la pose).
const mirror = (v: readonly number[], s: 1 | -1): Vec3 => [v[0] * s + 0, v[1], v[2]];
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const clampUnit = (v: number) => clamp(v, -1, 1);
const smooth = (v: number) => { const x = clamp(v, 0, 1); return x * x * (3 - 2 * x); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const fract = (v: number) => v - Math.floor(v);

function armsFor(pose: CharacterPose, left: ArmSpec, right = left) {
  pose.handL = mirror(left.hand, 1);
  pose.poleL = mirror(left.pole, 1);
  pose.wristL = left.wrist ? mirror(left.wrist, 1) : [0, 0, 0];
  pose.handR = mirror(right.hand, -1);
  pose.poleR = mirror(right.pole, -1);
  pose.wristR = right.wrist ? mirror(right.wrist, -1) : [0, 0, 0];
}

/** De pie, con la postura correcta o con los errores de codos y pies. */
export function standingPose(body: SceneBody): CharacterPose {
  const legs = body.feet === "juntos" ? FEET_TOGETHER : STANCE;
  const pose: CharacterPose = {
    lean: 0, torsoYaw: 0, torsoRoll: 0, pelvisYaw: 0, headYaw: 0, headPitch: 0, headRoll: 0,
    handL: [0, 0, 0], handR: [0, 0, 0], poleL: [0, 0, 0], poleR: [0, 0, 0], wristL: [0, 0, 0], wristR: [0, 0, 0],
    footL: [...legs.footL], footR: [...legs.footR], toeL: 0, toeR: 0,
    knee: legs.knee, sit: 0, lift: 0, hipShift: legs.hipShift, hold: 0,
  };
  armsFor(pose, body.elbows === "abiertos" ? ARMS.akimbo : ARMS.close);
  return pose;
}

export type Gait = { distance: number; speed: number };

/**
 * Marcha sincronizada con el desplazamiento: la fase avanza con los metros recorridos (un ciclo por
 * `STRIDE`) y, durante el apoyo, el pie retrocede respecto de la cadera a la misma velocidad a la que
 * avanza el cuerpo (no patina). La amplitud baja con la velocidad hasta la postura de pie.
 */
export function applyGait(pose: CharacterPose, gait: Gait, stiff: boolean, swingArms: boolean) {
  const stride = stiff ? STIFF_STRIDE : STRIDE;
  const k = smooth(gait.speed / 0.35);
  if (k <= 0) return pose;
  const reach = 0.3 * stride;
  const phase = gait.distance / stride;
  const foot = (offset: number, s: 1 | -1) => {
    const u = fract(phase + offset);
    let z: number;
    let lift = 0;
    let toe = 0;
    if (u < 0.6) z = reach * (1 - (2 * u) / 0.6);
    else {
      const w = (u - 0.6) / 0.4;
      z = -reach + 2 * reach * smooth(w);
      lift = Math.sin(Math.PI * w) * (stiff ? 0.03 : 0.1);
      toe = -Math.sin(Math.PI * w) * 0.25;
    }
    return { target: [s * (stiff ? 0.05 : 0.1), lift, z] as Vec3, toe, swing: z / reach };
  };
  const left = foot(0, 1);
  const right = foot(0.5, -1);
  const mix = (from: Vec3, to: Vec3): Vec3 => [lerp(from[0], to[0], k), lerp(from[1], to[1], k), lerp(from[2], to[2], k)];
  pose.footL = mix(pose.footL, left.target);
  pose.footR = mix(pose.footR, right.target);
  pose.toeL = left.toe * k;
  pose.toeR = right.toe * k;
  pose.knee = lerp(pose.knee, stiff ? 0.02 : 0.1, k);
  pose.hipShift = lerp(pose.hipShift, 0, k);
  pose.pelvisYaw = -0.07 * left.swing * k;
  pose.torsoYaw += 0.05 * left.swing * k;
  pose.lean += 0.04 * k;
  if (swingArms) {
    // Cada brazo acompaña a la pierna contraria.
    const arm = (swing: number, s: 1 | -1) => mirror([0.1, -0.93, 0.05 - swing * 0.26 * (stiff ? 0.5 : 1)], s);
    const hangPole: Vec3 = [0.2, -0.3, -1];
    pose.handL = mix(pose.handL, arm(left.swing, 1));
    pose.handR = mix(pose.handR, arm(right.swing, -1));
    pose.poleL = mix(pose.poleL, mirror(hangPole, 1));
    pose.poleR = mix(pose.poleR, mirror(hangPole, -1));
    pose.wristL = mix(pose.wristL, [0, 0, 0]);
    pose.wristR = mix(pose.wristR, [0, 0, 0]);
  }
  return pose;
}

export type CharacterState = {
  action: SubjectAction;
  /** Avance del paso (0..1) y tiempo de la escena (s). */
  p: number;
  time: number;
  /** Toda la escena es sentada (el asiento ya está puesto). */
  seated: boolean;
  body: SceneBody;
  /** Metros recorridos y velocidad (m/s) en «walk» y «walkIn». */
  gait?: Gait | null;
};

/** Pose de las actrices para cada acción de la escena. Es pura: depende solo del estado. */
export function characterActionPose(state: CharacterState): CharacterPose {
  const { action, p, time, seated, body } = state;
  const akimbo = body.elbows === "abiertos";
  const pose = standingPose(body);
  // Respiración leve y un balanceo mínimo: una persona quieta nunca está congelada.
  pose.lean = Math.sin((time * 2 * Math.PI) / 4.2) * 0.012;
  pose.torsoYaw = Math.sin(time * 1.3) * 0.012;
  switch (action) {
    case "walk":
    case "walkIn":
      if (state.gait) applyGait(pose, state.gait, body.feet === "juntos", !akimbo);
      break;
    case "turn":
      // El cuerpo gira en la raíz; el torso se adelanta un poco al giro.
      pose.torsoYaw += Math.sin(p * Math.PI) * 0.18;
      break;
    case "showProduct":
      armsFor(pose, ARMS.show);
      pose.hold = 1;
      pose.lean += 0.03;
      break;
    case "lookAway":
      pose.headYaw = 0.6;
      break;
    case "sit":
      pose.sit = 1;
      if (!akimbo) armsFor(pose, ARMS.lap);
      break;
    case "point":
      armsFor(pose, akimbo ? ARMS.akimbo : ARMS.close, ARMS.point);
      break;
    case "react":
      armsFor(pose, ARMS.react);
      pose.lean -= 0.05;
      pose.headPitch = -0.12;
      pose.lift = Math.abs(Math.sin(p * Math.PI * 4)) * 0.015;
      break;
    case "talk": {
      // Leve movimiento de cabeza; el gesto va entre el pecho y la cintura (o abierto, con el error).
      pose.headPitch = Math.sin(time * 2.4) * 0.04;
      pose.headYaw = Math.sin(time * 1.1) * 0.05;
      pose.headRoll = Math.sin(time * 1.7) * 0.03;
      if (akimbo) {
        pose.handR = mirror([0.45, -0.4 + Math.sin(time * 4) * 0.08, 0.35 + Math.sin(time * 3) * 0.05], -1);
        pose.poleR = mirror([1, -0.2, -0.3], -1);
      } else {
        pose.handR = mirror([-0.06 + Math.sin(time * 3) * 0.05, -0.52 + Math.sin(time * 4) * 0.08, 0.6], -1);
      }
      break;
    }
    default:
      break;
  }
  if (seated && action !== "walk" && action !== "walkIn") pose.sit = 1;
  return pose;
}

/** Mezcla lineal de dos poses (exacta en t = 0 y t = 1). */
export function blendCharacterPose(a: CharacterPose, b: CharacterPose, t: number): CharacterPose {
  const mix = (x: number, y: number) => x * (1 - t) + y * t;
  const out = { ...b };
  for (const key of Object.keys(b) as (keyof CharacterPose)[]) {
    const from = a[key];
    const to = b[key];
    if (Array.isArray(from) && Array.isArray(to)) (out[key] as Vec3) = [mix(from[0], to[0]), mix(from[1], to[1]), mix(from[2], to[2])];
    else (out[key] as number) = mix(from as number, to as number);
  }
  return out;
}

/* -------------------------------------------------------------- SOLVER -- */

export type SolveOptions = {
  /** Altura del asiento (m). Por defecto, la silla del visor. */
  seatTop?: number;
  /** Muñecas a un punto fijo del espacio del personaje (sostener el celular o la luz). Pisa las manos de la pose. */
  reach?: Partial<Record<Side, Vector3 | null>>;
  reachPole?: Partial<Record<Side, Vector3>>;
  /** Medio ancho (m) del producto que sostiene entre las palmas con `hold`. Por defecto, la caja. */
  holdHalfWidth?: number;
};

/**
 * Medio ancho (m) de cada producto visto de frente, que es lo que queda entre las palmas: las
 * mismas medidas con las que lo arma el visor (`buildProduct` en scene-viewer.tsx; la taza se
 * sostiene con el asa hacia la cámara).
 */
export const PRODUCT_HALF_WIDTH: Record<ProductKind, number> = { caja: 0.085, taza: 0.045, prenda: 0.16, plato: 0.14, celular: 0.0375 };
/** Del eje de la mano (muñeca → dedos) a la palma: con este margen las palmas se apoyan en las caras del producto sin hundirse. */
export const PALM_OFFSET = 0.02;
/** Del eje de la muñeca al centro de la palma, a lo largo de los dedos. */
const GRIP_REACH = 0.07;

export type PoseSolution = {
  /** Cuaterniones locales listos para copiar en cada hueso. */
  local: Record<HuesoPersonaje, Quaternion>;
  /** Posición local de la pelvis (baja con las rodillas, sube al saltar, se sienta). */
  pelvisPosition: Vector3;
  /** Posición y giro acumulado (respecto del reposo) de cada hueso, en el espacio del personaje. */
  pos: Record<HuesoPersonaje, Vector3>;
  delta: Record<HuesoPersonaje, Quaternion>;
  /** Punto medio entre los ojos y agarre de cada mano (palma, un poco más allá de la muñeca). */
  eye: Vector3;
  grip: Record<Side, Vector3>;
};

/** Asiento de la silla del visor (0.46 m + el grosor del tablero). */
export const SEAT_TOP = 0.485;
/** De la articulación de la cadera a la parte baja del muslo, sentada. */
const THIGH_DEPTH = 0.085;

const euler = new Euler();
function rotation(pitch: number, yaw: number, roll: number) {
  return new Quaternion().setFromEuler(euler.set(pitch, yaw, roll, "YXZ"));
}

function legReach(limb: LimbRest, knee: number) {
  const a = limb.upperLen;
  const b = limb.lowerLen;
  return Math.sqrt(a * a + b * b + 2 * a * b * Math.cos(knee));
}

/** Resuelve la pose completa sobre el esqueleto calibrado. */
export function solvePose(cal: RigCalibration, pose: CharacterPose, options: SolveOptions = {}): PoseSolution {
  const { rest } = cal;
  const delta = {} as Record<HuesoPersonaje, Quaternion>;
  const pos = {} as Record<HuesoPersonaje, Vector3>;
  const own = {} as Record<HuesoPersonaje, Quaternion>;
  for (const key of HUESOS) own[key] = new Quaternion();
  own.pelvis = rotation(0, pose.pelvisYaw, 0);
  own.spine = rotation(pose.lean * 0.4, pose.torsoYaw * 0.4, pose.torsoRoll * 0.4);
  own.chest = rotation(pose.lean * 0.6, pose.torsoYaw * 0.6, pose.torsoRoll * 0.6);
  own.neck = rotation(pose.headPitch * 0.4, pose.headYaw * 0.4, pose.headRoll * 0.4);
  own.head = rotation(pose.headPitch * 0.6, pose.headYaw * 0.6, pose.headRoll * 0.6);

  // Cadera: la altura sale de las piernas (de pie) o del asiento (sentada).
  const pelvisRot = own.pelvis;
  const sit = clamp(pose.sit, 0, 1);
  const hipAt = (side: Side) => rest.pelvis.pos.clone().add(new Vector3(0, 0, pose.hipShift * (1 - sit))).add(rest[cal.leg[side].upper].pos.clone().sub(rest.pelvis.pos).applyQuaternion(pelvisRot));
  const hips = { L: hipAt("L"), R: hipAt("R") };
  const seatTop = options.seatTop ?? SEAT_TOP;
  const ankles = {} as Record<Side, Vector3>;
  let standingHip = Infinity;
  for (const side of ["L", "R"] as const) {
    const foot = side === "L" ? pose.footL : pose.footR;
    const limb = cal.leg[side];
    const standing = new Vector3(foot[0], cal.ankleY + foot[1], foot[2]);
    const seated = new Vector3(side === "L" ? 0.12 : -0.12, cal.ankleY, hips[side].z + limb.upperLen * 0.96 + 0.04);
    ankles[side] = standing.clone().lerp(seated, sit);
    const reach = legReach(limb, pose.knee);
    const horizontal = Math.hypot(standing.x - hips[side].x, standing.z - hips[side].z);
    const height = cal.ankleY + Math.sqrt(Math.max(reach * reach - horizontal * horizontal, reach * reach * 0.25));
    standingHip = Math.min(standingHip, height);
  }
  const hipY = lerp(standingHip, seatTop + THIGH_DEPTH, sit) + pose.lift;
  const offset = new Vector3(0, hipY - (hips.L.y + hips.R.y) / 2, pose.hipShift * (1 - sit));

  // Las manos de la pose van en largos de brazo: la misma pose sirve para cualquier estatura.
  const chestHand = (side: Side) => {
    const spec = side === "L" ? pose.handL : pose.handR;
    return new Vector3(spec[0], spec[1], spec[2]).multiplyScalar(cal.arm[side].upperLen + cal.arm[side].lowerLen);
  };
  const toeFor = (side: Side) => (side === "L" ? pose.toeL : pose.toeR);
  const holdHalf = options.holdHalfWidth ?? PRODUCT_HALF_WIDTH.caja;

  for (const key of cal.order) {
    const parent = cal.ancestor[key];
    if (!parent) {
      pos[key] = rest[key].pos.clone().add(offset);
      delta[key] = own[key].clone();
      continue;
    }
    pos[key] = pos[parent].clone().add(rest[key].pos.clone().sub(rest[parent].pos).applyQuaternion(delta[parent]));
    const armSide = key === "upperArmL" ? "L" : key === "upperArmR" ? "R" : null;
    const legSide = key === "thighL" ? "L" : key === "thighR" ? "R" : null;
    if (armSide) {
      const limb = cal.arm[armSide];
      const spec = armSide === "L" ? pose.poleL : pose.poleR;
      const chest = delta.chest;
      const fixed = options.reach?.[armSide];
      let target = fixed ?? pos[key].clone().add(chestHand(armSide).applyQuaternion(chest));
      if (!fixed && pose.hold > 0) {
        // Sostiene el producto: cada muñeca a un costado de él (en el marco del pecho), así las palmas
        // quedan en sus caras y no dentro. Con los dedos hacia adelante, la palma queda a la misma distancia.
        const toChest = chest.clone().invert();
        const local = target.clone().sub(pos.chest).applyQuaternion(toChest);
        local.x = lerp(local.x, (armSide === "L" ? 1 : -1) * (holdHalf + PALM_OFFSET), clamp(pose.hold, 0, 1));
        target = pos.chest.clone().add(local.applyQuaternion(chest));
      }
      const pole = options.reachPole?.[armSide] ?? new Vector3(spec[0], spec[1], spec[2]).applyQuaternion(chest);
      const ik = solveTwoBone(pos[key], target, limb.upperLen, limb.lowerLen, pole);
      const d = limbDeltas(limb, delta[parent], ik);
      own[key] = d.upper;
      own[limb.lower] = d.lower;
    } else if (legSide) {
      const limb = cal.leg[legSide];
      const pole = new Vector3(legSide === "L" ? 0.08 : -0.08, 0, 1).applyQuaternion(pelvisRot);
      const ik = solveTwoBone(pos[key], ankles[legSide], limb.upperLen, limb.lowerLen, pole);
      const d = limbDeltas(limb, delta[parent], ik);
      own[key] = d.upper;
      own[limb.lower] = d.lower;
    } else if ((key === "handL" || key === "handR") && !options.reach?.[key === "handL" ? "L" : "R"]) {
      // Muñeca: los dedos giran hacia la dirección pedida, en el marco del pecho, con el peso de su largo.
      const side = key === "handL" ? "L" : "R";
      const wrist = side === "L" ? pose.wristL : pose.wristR;
      const fingers = cal.fingers[side];
      const palm = cal.palm[side];
      const weight = Math.min(1, Math.hypot(wrist[0], wrist[1], wrist[2]));
      if (fingers && weight > 1e-3) {
        const toCarried = delta[parent].clone().invert().multiply(delta.chest);
        const desired = new Vector3(wrist[0], wrist[1], wrist[2]).normalize().applyQuaternion(toCarried);
        // La palma mira hacia el centro del cuerpo (−X en la mano izquierda, +X en la derecha).
        const inward = new Vector3(side === "L" ? -1 : 1, 0, 0).applyQuaternion(toCarried);
        const turn = palm && Math.abs(inward.dot(desired)) < 0.95 ? frameRotation(fingers, palm, desired, inward) : new Quaternion().setFromUnitVectors(fingers, desired);
        own[key] = new Quaternion().slerp(turn, weight);
      }
    } else if (key === "footL" || key === "footR") {
      // Pie paralelo al piso (salvo la punta al dar el paso), sin seguir el giro de la cadera.
      own[key] = delta[parent].clone().invert().multiply(rotation(toeFor(key === "footL" ? "L" : "R"), 0, 0));
    }
    delta[key] = delta[parent].clone().multiply(own[key]);
  }

  const local = {} as Record<HuesoPersonaje, Quaternion>;
  for (const key of HUESOS) local[key] = localFrom(rest[key], own[key]);
  const pelvisPosition = rest.pelvis.localPos.clone().add(offset.clone().applyMatrix4(cal.pelvisParentInv));
  const eye = pos.head.clone().add(cal.eye.clone().sub(rest.head.pos).applyQuaternion(delta.head));
  // Centro de la palma: sigue a los dedos (si la muñeca se dobla, se dobla con ella); sin dedos en el rig, al antebrazo.
  const grip = (side: Side) => {
    const hand = side === "L" ? "handL" : "handR";
    const fore = side === "L" ? "lowerArmL" : "lowerArmR";
    const fingers = cal.fingers[side];
    const along = fingers ? fingers.clone().applyQuaternion(delta[hand]) : pos[hand].clone().sub(pos[fore]).normalize();
    return pos[hand].clone().addScaledVector(along, GRIP_REACH);
  };
  return { local, pelvisPosition, pos, delta, eye, grip: { L: grip("L"), R: grip("R") } };
}

/**
 * Cabeza y cuello hacia (yaw, pitch, roll) sin volver a resolver el cuerpo: sus locales dependen solo
 * de su propio giro. `yaw` se mide desde el frente del pecho; `pitch` + mira hacia abajo.
 */
export function headLocals(cal: RigCalibration, yaw: number, pitch: number, roll = 0) {
  return {
    neck: localFrom(cal.rest.neck, rotation(pitch * 0.4, yaw * 0.4, roll * 0.4)),
    head: localFrom(cal.rest.head, rotation(pitch * 0.6, yaw * 0.6, roll * 0.6)),
  };
}

/**
 * Brazo hacia un punto cuando el resto del cuerpo lo mueve un clip (el camarógrafo camina con su
 * animación y sostiene el celular): usa la rotación real del padre inmediato en ese momento.
 * Todo en el espacio del personaje.
 */
export function solveArmLive(cal: RigCalibration, side: Side, parentWorld: Quaternion, shoulder: Vector3, target: Vector3, pole: Vector3) {
  return solveLimbLive(cal, "arm", side, parentWorld, shoulder, target, pole);
}

/** Lo mismo para un brazo o una pierna: `start` es el hombro o la cadera y `pole`, hacia dónde apunta el codo o la rodilla. */
export function solveLimbLive(cal: RigCalibration, kind: "arm" | "leg", side: Side, parentWorld: Quaternion, start: Vector3, target: Vector3, pole: Vector3) {
  const limb = (kind === "arm" ? cal.arm : cal.leg)[side];
  const parentDelta = parentWorld.clone().multiply(cal.rest[limb.upper].parentWorld.clone().invert());
  const ik = solveTwoBone(start, target, limb.upperLen, limb.lowerLen, pole);
  const d = limbDeltas(limb, parentDelta, ik);
  return { upper: localFrom(cal.rest[limb.upper], d.upper), lower: localFrom(cal.rest[limb.lower], d.lower), reached: ik.reached };
}

/** Posición y giro de un objeto en el espacio de la raíz (las matrices tienen que estar al día). */
function inRootSpace(rootInv: Matrix4, object: Object3D) {
  const position = new Vector3();
  const rotation = new Quaternion();
  new Matrix4().multiplyMatrices(rootInv, object.matrixWorld).decompose(position, rotation, new Vector3());
  return { position, rotation };
}

const ARM_KEYS = {
  L: { upper: "upperArmL", lower: "lowerArmL", hand: "handL" },
  R: { upper: "upperArmR", lower: "lowerArmR", hand: "handR" },
} as const satisfies Record<Side, { upper: HuesoPersonaje; lower: HuesoPersonaje; hand: HuesoPersonaje }>;

/**
 * Centro de la palma (espacio del personaje) tal como están los huesos ahora: un poco más allá de la
 * muñeca, siguiendo a los dedos (o al antebrazo si el rig no tiene dedos). Es el mismo punto que
 * `PoseSolution.grip`. Las matrices del modelo tienen que estar al día.
 */
export function palmLive(root: Object3D, bones: BoneMap, cal: RigCalibration, side: Side): Vector3 {
  const rootInv = root.matrixWorld.clone().invert();
  const keys = ARM_KEYS[side];
  const hand = inRootSpace(rootInv, bones[keys.hand]);
  const fingers = cal.fingers[side];
  const along = fingers
    ? fingers.clone().applyQuaternion(hand.rotation.multiply(cal.rest[keys.hand].worldInv))
    : hand.position.clone().sub(inRootSpace(rootInv, bones[keys.lower]).position).normalize();
  return hand.position.clone().addScaledVector(along, GRIP_REACH);
}

/** Agarre de una mano en el espacio del personaje: dónde va el centro de la palma y, si se pide, hacia dónde apuntan los dedos y la palma. */
export type LiveGrip = {
  point: Vector3;
  fingers?: Vector3 | null;
  palm?: Vector3 | null;
  /** De la palma al punto (m), a lo largo de `palm`: la mano se apoya en un asa sin atravesarla. */
  gap?: number;
};

/**
 * Mano de quien graba en un asa del rig, encima de lo que dejó el clip: el brazo se resuelve con IK
 * de dos huesos y la muñeca gira para que los dedos y la palma rodeen el asa, así el centro de la
 * palma cae en `point` (menos `gap`). Sin dedos o palma pedidos, la mano sigue al antebrazo y la
 * muñeca se corrige dos veces hasta que la palma llega al punto. Con `optional`, si el punto queda
 * fuera del alcance cómodo deja el brazo del clip y devuelve false. Todo en el espacio del
 * personaje; las matrices del modelo tienen que estar al día.
 */
export function gripLive(root: Object3D, bones: BoneMap, cal: RigCalibration, side: Side, grip: LiveGrip, pole: Vector3, optional = false): boolean {
  const keys = ARM_KEYS[side];
  const upper = bones[keys.upper];
  const lower = bones[keys.lower];
  const hand = bones[keys.hand];
  const upperParent = upper.parent;
  const handParent = hand.parent;
  if (!upperParent || !handParent) return false;
  const rootInv = root.matrixWorld.clone().invert();
  const shoulder = inRootSpace(rootInv, upper).position;
  const fingers = cal.fingers[side];
  const restPalm = cal.palm[side];
  let handRotation: Quaternion | null = null;
  const wrist = grip.point.clone();
  if (grip.fingers && fingers) {
    const towards = grip.fingers.clone().normalize();
    const turn = grip.palm && restPalm ? frameRotation(fingers, restPalm, towards, grip.palm) : new Quaternion().setFromUnitVectors(fingers, towards);
    handRotation = turn.multiply(cal.rest[keys.hand].world);
    wrist.addScaledVector(towards, -GRIP_REACH);
    if (grip.palm) wrist.addScaledVector(grip.palm.clone().normalize(), -(grip.gap ?? 0));
  }
  const limb = cal.arm[side];
  if (optional && shoulder.distanceTo(wrist) > (limb.upperLen + limb.lowerLen) * 0.97) return false;
  const solveTo = (target: Vector3) => {
    const solved = solveArmLive(cal, side, inRootSpace(rootInv, upperParent).rotation, shoulder, target, pole);
    upper.quaternion.copy(solved.upper);
    lower.quaternion.copy(solved.lower);
    upper.updateMatrixWorld(true);
  };
  solveTo(wrist);
  if (handRotation) {
    hand.quaternion.copy(inRootSpace(rootInv, handParent).rotation.invert().multiply(handRotation));
    hand.updateMatrixWorld(true);
  } else {
    for (let pass = 0; pass < 2; pass += 1) {
      wrist.add(grip.point.clone().sub(palmLive(root, bones, cal, side)));
      solveTo(wrist);
    }
  }
  return true;
}

/** Huesos que se retocan encima de un clip: la cadera (baja o sube), las piernas, los brazos y las muñecas (agarre del rig). */
const OVER_CLIP = ["pelvis", "thighL", "calfL", "footL", "thighR", "calfR", "footR", "upperArmL", "lowerArmL", "upperArmR", "lowerArmR", "handL", "handR"] as const satisfies readonly HuesoPersonaje[];

/**
 * Retoques encima de un clip sin que se acumulen. El AnimationMixer solo reescribe un hueso cuando
 * el valor del clip cambia respecto del cuadro anterior: con la escena en pausa (mismo tiempo) no lo
 * hace y lo retocado quedaría, así que la cadera bajaría un poco más en cada cuadro. Antes de
 * `mixer.update` se llama a `restore` (esos huesos vuelven a lo que dejó el clip en el cuadro
 * anterior) y después a `save` (se guarda lo que dejó ahora, antes de retocarlo).
 */
export function clipOverlay(bones: BoneMap) {
  const saved = OVER_CLIP.map(key => ({ bone: bones[key], quaternion: bones[key].quaternion.clone(), position: bones[key].position.clone() }));
  return {
    restore() {
      for (const item of saved) {
        item.bone.quaternion.copy(item.quaternion);
        item.bone.position.copy(item.position);
      }
    },
    save() {
      for (const item of saved) {
        item.quaternion.copy(item.bone.quaternion);
        item.position.copy(item.bone.position);
      }
    },
  };
}
export type ClipOverlay = ReturnType<typeof clipOverlay>;

/** Hasta dónde se estira una pierna al subir la cadera (fracción del largo total: ≈ 5° de flexión). */
const LEG_STRAIGHT = 0.999;

/**
 * Piernas encima de un clip (quien graba): baja la cadera `drop` metros (rodillas flexionadas) o,
 * con `drop` negativo, la sube sin estirar las piernas del todo (piernas rígidas), y resuelve las
 * dos piernas con IK para que cada tobillo quede donde lo dejó el clip, más `feet` (pasos laterales,
 * en el espacio del personaje). Los pies conservan su giro y las rodillas apuntan hacia donde las
 * dejó el clip. Las matrices del modelo tienen que estar al día (después de `mixer.update`).
 * Devuelve cuánto bajó la cadera de verdad (negativo si subió).
 */
export function legsLive(root: Object3D, bones: BoneMap, cal: RigCalibration, options: { drop: number; feet?: Partial<Record<Side, Vector3 | null>> }): number {
  const rootInv = root.matrixWorld.clone().invert();
  const inRoot = (object: Object3D) => new Vector3().setFromMatrixPosition(object.matrixWorld).applyMatrix4(rootInv);
  const rotationInRoot = (object: Object3D) => {
    const rotation = new Quaternion();
    new Matrix4().multiplyMatrices(rootInv, object.matrixWorld).decompose(new Vector3(), rotation, new Vector3());
    return rotation;
  };
  const legOf = (side: Side) => (side === "L" ? { thigh: bones.thighL, calf: bones.calfL, foot: bones.footL } : { thigh: bones.thighR, calf: bones.calfR, foot: bones.footR });
  const sides = ["L", "R"] as const;
  // Tobillos y giro de los pies antes de mover la cadera.
  const goals = {} as Record<Side, { ankle: Vector3; footWorld: Quaternion }>;
  for (const side of sides) {
    const { foot } = legOf(side);
    const ankle = inRoot(foot);
    const extra = options.feet?.[side];
    if (extra) ankle.add(extra);
    goals[side] = { ankle, footWorld: foot.getWorldQuaternion(new Quaternion()) };
  }
  let drop = options.drop;
  if (drop < 0) {
    let room = Infinity;
    for (const side of sides) {
      const limb = cal.leg[side];
      const hip = inRoot(legOf(side).thigh);
      const ankle = goals[side].ankle;
      const reach = (limb.upperLen + limb.lowerLen) * LEG_STRAIGHT;
      const flat = Math.hypot(hip.x - ankle.x, hip.z - ankle.z);
      room = Math.min(room, Math.sqrt(Math.max(0, reach * reach - flat * flat)) - (hip.y - ankle.y));
    }
    drop = Math.max(drop, -Math.max(0, room));
  }
  const pelvis = bones.pelvis;
  if (drop !== 0 && pelvis.parent) {
    const toParent = new Matrix4().multiplyMatrices(rootInv, pelvis.parent.matrixWorld).setPosition(0, 0, 0).invert();
    pelvis.position.add(new Vector3(0, -drop, 0).applyMatrix4(toParent));
    pelvis.updateMatrixWorld(true);
  }
  for (const side of sides) {
    const { thigh, calf, foot } = legOf(side);
    if (!thigh.parent) continue;
    const limb = cal.leg[side];
    // La rodilla sigue al muslo del clip: el frente de reposo, girado como gira el muslo respecto del reposo.
    const pole = FORWARD.clone().applyQuaternion(rotationInRoot(thigh).multiply(cal.rest[limb.upper].worldInv));
    const solved = solveLimbLive(cal, "leg", side, rotationInRoot(thigh.parent), inRoot(thigh), goals[side].ankle, pole);
    thigh.quaternion.copy(solved.upper);
    calf.quaternion.copy(solved.lower);
    thigh.updateMatrixWorld(true);
    if (foot.parent) {
      foot.quaternion.copy(foot.parent.getWorldQuaternion(new Quaternion()).invert().multiply(goals[side].footWorld));
      foot.updateMatrixWorld(true);
    }
  }
  return drop;
}

/** Recorrido en el marco de quien camina (giro `yaw` de su raíz): cuánto va hacia su frente (+Z) y cuánto hacia su izquierda (+X). */
export function travelInFrame(heading: { x: number; z: number }, yaw: number) {
  return {
    frontal: heading.x * Math.sin(yaw) + heading.z * Math.cos(yaw),
    lateral: heading.x * Math.cos(yaw) - heading.z * Math.sin(yaw),
  };
}

/** Largo de un ciclo de pasos cortos (dos pasos), en metros. */
export const SIDE_STRIDE = 0.5;

/**
 * Pasos cortos de quien graba cuando acompaña de costado (o en diagonal): desplazamiento de cada
 * tobillo (espacio del personaje) respecto de donde lo deja el clip de reposo. El cuerpo recorre
 * `distance` metros en la dirección `direction` (unitaria y horizontal en el espacio del personaje;
 * por defecto hacia su izquierda, +X; con `distance` negativo, al revés). Como en `applyGait`, durante
 * el apoyo el pie retrocede a la velocidad del cuerpo (no patina) y en el vuelo se adelanta
 * levantándose; la amplitud baja con la velocidad hasta la postura quieta.
 */
export function stepFeet(distance: number, speed: number, direction: { x: number; z: number } = { x: 1, z: 0 }): Record<Side, Vector3> {
  const k = smooth(speed / 0.3);
  const reach = 0.3 * SIDE_STRIDE;
  // −0 (0 metros hacia el otro lado) también cuenta como ir al revés: el primer cuadro no salta.
  const sign = distance < 0 || Object.is(distance, -0) ? -1 : 1;
  const phase = Math.abs(distance) / SIDE_STRIDE;
  const along = (amount: number, lift: number) => new Vector3(direction.x * sign * amount * k, lift * k, direction.z * sign * amount * k);
  const foot = (offset: number) => {
    const u = fract(phase + offset);
    if (u < 0.6) return along(reach * (1 - (2 * u) / 0.6), 0);
    const w = (u - 0.6) / 0.4;
    return along(-reach + 2 * reach * smooth(w), Math.sin(Math.PI * w) * 0.06);
  };
  return { L: foot(0), R: foot(0.5) };
}

/** Altura de los ojos de pie (postura correcta o pies juntos) o sentada: la usa el encuadre. */
export function characterEyeHeight(cal: RigCalibration, seated: boolean, feet: SceneBody["feet"] = "adelantado", seatTop = SEAT_TOP) {
  const pose = characterActionPose({ action: "idle", p: 0, time: 0, seated, body: { elbows: "pegados", feet } });
  return solvePose(cal, pose, { seatTop }).eye.y;
}

/** Dónde queda el centro del producto al mostrarlo: entre las palmas, apoyado en ellas. Espacio del personaje. */
export function productHold(solution: PoseSolution) {
  return solution.grip.L.clone().add(solution.grip.R).multiplyScalar(0.5);
}

/* ------------------------------------------------------------ ANIMACIÓN -- */

/**
 * Peso del clip «walk» del camarógrafo mezclado con «idle». El clip es un trote largo (≈ 5 m por
 * ciclo, con fase de vuelo): al 35 % queda una marcha de ≈ 1 m por ciclo, con la cadencia de una
 * caminata a 0,6-1 m/s y los pies apenas despegados del piso.
 */
export const WALK_CLIP_WEIGHT = 0.35;

/**
 * Metros que avanza el cuerpo en un ciclo del clip de caminar, mezclado con el de reposo como se
 * reproduce en el visor: se mide la velocidad del pie apoyado (el clip camina en el lugar). Con eso
 * la fase del clip sigue a la distancia recorrida y los pies no patinan. Deja el modelo en reposo.
 */
export function measureWalkStride(root: Object3D, bones: Pick<BoneMap, "footL" | "footR">, walk: AnimationClip, idle: AnimationClip | null, walkWeight: number): number | null {
  return withClips(root, mixer => {
    const walking = mixer.clipAction(walk);
    walking.play();
    walking.setEffectiveWeight(walkWeight);
    if (idle) {
      const resting = mixer.clipAction(idle);
      resting.play();
      resting.setEffectiveWeight(1 - walkWeight);
      resting.time = 0;
    }
    const rootInv = new Matrix4();
    const samples = 72;
    const tracks: { y: number[]; z: number[] }[] = [{ y: [], z: [] }, { y: [], z: [] }];
    const point = new Vector3();
    for (let i = 0; i < samples; i += 1) {
      walking.time = (walk.duration * i) / samples;
      mixer.update(0);
      root.updateMatrixWorld(true);
      rootInv.copy(root.matrixWorld).invert();
      [bones.footL, bones.footR].forEach((foot, index) => {
        point.setFromMatrixPosition(foot.matrixWorld).applyMatrix4(rootInv);
        tracks[index].y.push(point.y);
        tracks[index].z.push(point.z);
      });
    }
    const dt = walk.duration / samples;
    const speeds: number[] = [];
    for (const track of tracks) {
      const floor = Math.min(...track.y);
      for (let i = 0; i < samples; i += 1) {
        const next = (i + 1) % samples;
        if (track.y[i] < floor + 0.025 && track.y[next] < floor + 0.025) speeds.push(Math.abs(track.z[next] - track.z[i]) / dt);
      }
    }
    if (!speeds.length) return null;
    speeds.sort((a, b) => a - b);
    const speed = speeds[Math.floor(speeds.length / 2)];
    return speed > 0.05 ? speed * walk.duration : null;
  });
}

/**
 * Cuánto gira el torso un clip (rad, en el espacio del personaje; + hacia su izquierda): el promedio
 * de la línea de los hombros a lo largo del clip. El «idle» del camarógrafo gira el torso unos 24°
 * hacia su derecha; el visor lo descuenta al orientarlo para que quede de frente al celular. Deja el
 * modelo en reposo.
 */
export function measureClipYaw(root: Object3D, bones: Pick<BoneMap, "upperArmL" | "upperArmR">, clip: AnimationClip): number {
  return withClips(root, mixer => {
    const action = mixer.clipAction(clip);
    action.play();
    const rootInv = new Matrix4();
    const left = new Vector3();
    const right = new Vector3();
    let sin = 0;
    let cos = 0;
    const samples = 24;
    for (let i = 0; i < samples; i += 1) {
      action.time = (clip.duration * i) / samples;
      mixer.update(0);
      root.updateMatrixWorld(true);
      rootInv.copy(root.matrixWorld).invert();
      left.setFromMatrixPosition(bones.upperArmL.matrixWorld).applyMatrix4(rootInv);
      right.setFromMatrixPosition(bones.upperArmR.matrixWorld).applyMatrix4(rootInv);
      // De hombro derecho a izquierdo: en reposo apunta a +X; girado θ sobre Y queda en (cos θ, 0, −sin θ).
      const yaw = Math.atan2(right.z - left.z, left.x - right.x);
      sin += Math.sin(yaw);
      cos += Math.cos(yaw);
    }
    return Math.atan2(sin, cos);
  });
}

/** Corre `work` con un mezclador sobre el modelo y lo deja como estaba (la calibración de los clones sigue en reposo). */
function withClips<T>(root: Object3D, work: (mixer: AnimationMixer) => T): T {
  const saved: { object: Object3D; position: Vector3; quaternion: Quaternion; scale: Vector3 }[] = [];
  root.traverse(object => saved.push({ object, position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone() }));
  const mixer = new AnimationMixer(root);
  try {
    return work(mixer);
  } finally {
    mixer.stopAllAction();
    mixer.uncacheRoot(root);
    for (const item of saved) {
      item.object.position.copy(item.position);
      item.object.quaternion.copy(item.quaternion);
      item.object.scale.copy(item.scale);
    }
    root.updateMatrixWorld(true);
  }
}
