"use client";

/**
 * Visor 3D de una lección («Escena 3D»). Se carga con next/dynamic y ssr:false
 * desde la lección, solo cuando alguien pide verla: three.js nunca entra en el
 * bundle inicial. Renderiza bajo demanda (solo mientras hay animación o
 * interacción), se pausa fuera de pantalla y libera todo al desmontarse.
 *
 * Encima de la escena: formato vertical 9:16 (por defecto) u horizontal 16:9, y
 * «Compara con lo incorrecto»: cada error rearma la escena (luces, cuerpo o
 * encuadre) y se vuelve a la versión correcta con «Correcto». Cambiar de formato
 * o de error rearma la escena sobre el mismo WebGLRenderer (texturas y shaders
 * siguen en la GPU) y conserva el tiempo, la reproducción y la vista.
 *
 * Personajes 3D (`personajes`, lo decide el servidor con MANUAL_3D_PERSONAJES): con
 * sesión se descargan de /api/modelos-3d los GLB del manifiesto (revalidando con el
 * ETag) y reemplazan a los maniquíes sin reiniciar la animación ni la cámara
 * (camarógrafo = quien graba, actriz 1 = sujeto, actriz 2 = segunda persona). Mientras
 * cargan, o si fallan, se ven los maniquíes; un conmutador «Personajes / Maniquí» vuelve
 * a los livianos (y tras un fallo, «Personajes» reintenta). Quien graba nunca aparece en
 * la «Vista de cámara». La pose se resuelve sobre el esqueleto en
 * src/lib/manual-characters.ts.
 */
import { ChevronLeft, ChevronRight, CircleCheck, Pause, PersonStanding, Play, RectangleHorizontal, RectangleVertical, RotateCcw, TriangleAlert, UsersRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AmbientLight,
  AnimationMixer,
  type AnimationAction,
  type AnimationClip,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CameraHelper,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  GridHelper,
  Group,
  HemisphereLight,
  Line,
  LineBasicMaterial,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Scene,
  type SkinnedMesh,
  Sphere,
  SphereGeometry,
  SpotLight,
  TorusGeometry,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { ManualScene3d } from "@/lib/manual";
import type { ModeloPersonaje, PersonajeId } from "@/lib/manual-3d";
import {
  HUESOS,
  PRODUCT_HALF_WIDTH,
  SEAT_TOP,
  STRIDE,
  WALK_CLIP_WEIGHT,
  blendCharacterPose,
  calibrateRig,
  castCharacters,
  castIds,
  characterActionPose,
  clipOverlay,
  characterEyeHeight,
  headLocals,
  legsLive,
  measureClipYaw,
  measureWalkStride,
  parseManifest,
  productHold,
  resolveBoneMap,
  solveArmLive,
  solvePose,
  stepFeet,
  travelInFrame,
  type BoneMap,
  type CharacterPose,
  type ClipOverlay,
  type Gait,
  type PoseSolution,
  type RigCalibration,
  type Side,
} from "@/lib/manual-characters";
import {
  ANGLE_INTENT,
  ANGLE_LABELS,
  ENVIRONMENT_LABELS,
  EYE_LINE,
  EYE_LINE_SHOTS,
  FORMAT_LABELS,
  LIGHT_LABELS,
  MANNEQUIN,
  MISTAKE_LABELS,
  MOVE_LABELS,
  PODCAST,
  PRESET_LABELS,
  SHOT_LABELS,
  beatAngle,
  eyeHeight,
  eyePoint,
  followProgress,
  lightHex,
  parseScene3d,
  placementForBeat,
  sceneVariant,
  subjectBase,
  type FrameFormat,
  type SceneBeat,
  type SceneBody,
  type SceneConfig,
  type SceneLight,
  type SceneMistake,
  type SubjectAction,
} from "@/lib/manual-scene";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------ CONSTANTES -- */

const HELPERS = 1; // capa de ayudas: se ven en la vista libre, nunca en la «Vista de cámara»
/** Quien graba (maniquí F o camarógrafo): está detrás del celular, así que la «Vista de cámara» nunca lo dibuja. */
const CREW_LAYER = 2;
const CAMERA_COLOR = "#c2410c";
const PATH_COLOR = "#f97316";
const SUBJECT_PATH_COLOR = "#0f766e";
const OK_COLOR = "#15a36b";
const WRONG_COLOR = "#dc2f4b";
/** Marcador de ojos mientras el sujeto camina hacia su marca con la cámara quieta: aún no se juzga el encuadre. */
const MOVING_COLOR = "#fbbf24";
const PERSON_A = "#d8c0a0";
const PERSON_B = "#9fb3c8";
const OPERATOR_COLOR = "#b7b0a4";
const JOINT = "#6b5b4b";
const EYE_COLOR = "#1b1e23";
const BLEND = 0.45; // segundos de transición entre pasos
const KEY_HEIGHT = 2.05;
/** Lámpara de pie detrás del sujeto en el contraluz de noche (pantalla a la altura de la cabeza). */
const LAMP = { x: 0.18, y: 1.62, z: -1.25 };
/** Tolerancia del marcador de ojos (fracción del alto del cuadro). */
const EYE_TOLERANCE = 0.04;
const VIEWS = {
  "3/4": [3.1, 2.3, 3.4],
  Lateral: [4.4, 1.6, 0.5],
  Arriba: [0.3, 6.4, 1.2],
} as const;
type ViewName = keyof typeof VIEWS;

export function lightGizmoColor(light: Pick<SceneLight, "kelvin" | "rgb">) {
  if (light.rgb) return light.rgb.hex;
  if (light.kelvin <= 4200) return "#fb923c";
  if (light.kelvin >= 6200) return "#60a5fa";
  return "#eab308";
}

function lightLegend(light: SceneLight) {
  const name =
    light.source === "mano"
      ? light.side === 0 ? "Luz de mano en el lente" : "Luz de mano"
      : light.source === "lampara" ? "Lámpara detrás"
      : light.role === "back" && light.source === "window" ? "Ventana detrás"
      : LIGHT_LABELS[light.role];
  return `${name} · ${light.rgb ? `RGB ${light.rgb.name}` : `${light.kelvin} K`}`;
}

/* ---------------------------------------------------------------- POSES -- */

type Pose = {
  x: number; z: number; yaw: number; hipsY: number; torsoYaw: number; headYaw: number; headPitch: number;
  lShX: number; lShZ: number; lEl: number; lElZ: number; rShX: number; rShZ: number; rEl: number; rElZ: number;
  lHip: number; lHipZ: number; lKnee: number; rHip: number; rHipZ: number; rKnee: number; product: number; look: number;
};

const NEUTRAL: Pose = {
  x: 0, z: 0, yaw: 0, hipsY: MANNEQUIN.hips, torsoYaw: 0, headYaw: 0, headPitch: 0,
  lShX: 0, lShZ: 0.08, lEl: -0.12, lElZ: 0, rShX: 0, rShZ: -0.08, rEl: -0.12, rElZ: 0,
  lHip: 0, lHipZ: 0, lKnee: 0, rHip: 0, rHipZ: 0, rKnee: 0, product: 0, look: 1,
};
/** Un pie adelantado, el peso en el de atrás y las rodillas sueltas (la cadera baja a MANNEQUIN.hips). */
const STANCE: Partial<Pose> = { hipsY: MANNEQUIN.hips, lHip: -0.22, lKnee: 0.18, rHip: 0.1, rKnee: 0.12, lHipZ: 0, rHipZ: 0 };
/** Incorrecto: pies juntos y piernas rectas. */
const FEET_TOGETHER: Partial<Pose> = { hipsY: MANNEQUIN.hipsStraight, lHip: 0, lKnee: 0, rHip: 0, rKnee: 0, lHipZ: -0.06, rHipZ: 0.06 };
/** Codos cerca del cuerpo, hombros relajados y antebrazos hacia adelante (manos entre el pecho y la cintura). */
const ARMS_CLOSE: Partial<Pose> = { lShX: -0.12, lShZ: 0.085, lEl: -1.05, lElZ: 0, rShX: -0.12, rShZ: -0.085, rEl: -1.05, rElZ: 0 };
/** Incorrecto: brazos en jarra, codos hacia afuera. */
const ARMS_AKIMBO: Partial<Pose> = { lShX: 0.12, lShZ: 0.75, lEl: 0, lElZ: -1.56, rShX: 0.12, rShZ: -0.75, rEl: 0, rElZ: 1.56 };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const smooth = (v: number) => { const x = clamp(v, 0, 1); return x * x * (3 - 2 * x); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function stancePose(body: SceneBody): Pose {
  return { ...NEUTRAL, ...(body.feet === "juntos" ? FEET_TOGETHER : STANCE), ...(body.elbows === "abiertos" ? ARMS_AKIMBO : ARMS_CLOSE) };
}

/** `stiff`: marcha con los pies juntos y las rodillas trabadas (error «Pies juntos»): pasos cortos y sin flexión. */
function gait(pose: Pose, time: number, amplitude = 0.42, swingArms = true, stiff = false) {
  const phase = time * Math.PI * 2 * 1.6;
  const swing = Math.sin(phase) * (stiff ? Math.min(amplitude, 0.2) : amplitude);
  const bend = stiff ? 0.08 : 0.55;
  pose.lHip = -swing;
  pose.rHip = swing;
  pose.lHipZ = pose.rHipZ = 0;
  pose.lKnee = Math.max(0, Math.cos(phase)) * bend;
  pose.rKnee = Math.max(0, -Math.cos(phase)) * bend;
  if (swingArms) {
    pose.lShX = swing * 0.7;
    pose.rShX = -swing * 0.7;
    pose.lShZ = 0.085;
    pose.rShZ = -0.085;
    pose.lEl = pose.rEl = -0.35;
    pose.lElZ = pose.rElZ = 0;
  }
  pose.hipsY = (stiff ? MANNEQUIN.hipsStraight : 0.95) - Math.abs(Math.sin(phase)) * 0.02;
}

function seatedLegs(pose: Pose) {
  pose.hipsY = MANNEQUIN.hipsSeated;
  pose.lHip = pose.rHip = -1.45;
  pose.lKnee = pose.rKnee = 1.45;
  pose.lHipZ = pose.rHipZ = 0;
}

function actionPose(action: SubjectAction, p: number, time: number, seated: boolean, enterFrom: -1 | 1, body: SceneBody): Pose {
  const pose = stancePose(body);
  const akimbo = body.elbows === "abiertos";
  const stiff = body.feet === "juntos";
  pose.torsoYaw = Math.sin(time * 1.3) * 0.012;
  switch (action) {
    case "walkIn": {
      const walking = p < 0.8;
      const facing = enterFrom === -1 ? Math.PI / 2 : -Math.PI / 2;
      pose.x = lerp(enterFrom * 1.7, 0, smooth(p / 0.8));
      pose.yaw = walking ? facing : lerp(facing, 0, smooth((p - 0.8) / 0.2));
      pose.look = walking ? 0 : 1;
      if (walking) gait(pose, time, 0.42, !akimbo, stiff);
      break;
    }
    case "walk":
      pose.z = lerp(-1.3, 0, smooth(p));
      if (p < 0.95) gait(pose, time, 0.42, !akimbo, stiff);
      break;
    case "turn":
      pose.yaw = Math.sin(p * Math.PI) * (Math.PI / 2);
      pose.look = 0.3;
      break;
    case "showProduct":
      pose.lShX = pose.rShX = -0.5;
      pose.lShZ = -0.15;
      pose.rShZ = 0.15;
      pose.lEl = pose.rEl = -1.3;
      pose.lElZ = pose.rElZ = 0;
      pose.product = 1;
      break;
    case "lookAway":
      pose.headYaw = 0.6;
      pose.look = 0;
      break;
    case "sit":
      seatedLegs(pose);
      if (!akimbo) {
        pose.lShX = pose.rShX = -0.45;
        pose.lEl = pose.rEl = -0.7;
      }
      break;
    case "point":
      pose.rShX = -1.35;
      pose.rShZ = 0.1;
      pose.rEl = -0.05;
      pose.rElZ = 0;
      break;
    case "react":
      pose.lShX = pose.rShX = -0.6;
      pose.lShZ = 0.5;
      pose.rShZ = -0.5;
      pose.lEl = pose.rEl = -1.7;
      pose.lElZ = pose.rElZ = 0;
      pose.headPitch = -0.12;
      pose.hipsY += Math.abs(Math.sin(p * Math.PI * 4)) * 0.015;
      break;
    case "talk":
      if (akimbo) {
        // Gesto amplio con el codo afuera: se sale de la caja pecho-cintura.
        pose.rShX = -0.35 + Math.sin(time * 3) * 0.12;
        pose.rShZ = -0.8;
        pose.rEl = -0.9 + Math.sin(time * 4) * 0.25;
        pose.rElZ = 0.2;
      } else {
        // Gestos dentro de la caja entre el pecho y la cintura, con el codo cerca.
        pose.rShX = -0.25 + Math.sin(time * 3) * 0.1;
        pose.rEl = -1.25 + Math.sin(time * 4) * 0.22;
      }
      pose.headPitch = Math.sin(time * 2.4) * 0.04;
      break;
    default:
      break;
  }
  if (seated && action !== "walkIn" && action !== "walk") seatedLegs(pose);
  return pose;
}

/** Quien graba: con codos pegados y rodillas flexionadas (fluido) o brazos estirados y piernas rígidas (brusco). */
function operatorPose(tucked: boolean, walking: boolean, time: number): Pose {
  const pose = stancePose({ elbows: "pegados", feet: tucked ? "adelantado" : "juntos" });
  if (walking) gait(pose, time, tucked ? 0.26 : 0.46, false);
  if (tucked) {
    pose.hipsY -= walking ? 0.03 : 0.055;
    pose.lHip -= 0.3;
    pose.rHip -= 0.3;
    pose.lKnee += 0.55;
    pose.rKnee += 0.55;
    pose.lShX = pose.rShX = -0.55;
    pose.lShZ = 0.1;
    pose.rShZ = -0.1;
    pose.lEl = pose.rEl = -1.55;
    pose.lElZ = 0.35;
    pose.rElZ = -0.35;
  } else {
    pose.lShX = pose.rShX = -1.3;
    pose.lShZ = -0.12;
    pose.rShZ = 0.12;
    pose.lEl = pose.rEl = -0.1;
  }
  pose.look = 0;
  return pose;
}

/** Quien sostiene la luz de mano: brazo derecho arriba y adelante. */
function assistantPose(): Pose {
  const pose = stancePose({ elbows: "pegados", feet: "adelantado" });
  pose.rShX = -1.9;
  pose.rShZ = -0.05;
  pose.rEl = -0.2;
  pose.rElZ = 0;
  pose.look = 1;
  return pose;
}

function blendPose(a: Pose, b: Pose, t: number): Pose {
  const out = { ...b };
  for (const key of Object.keys(b) as (keyof Pose)[]) out[key] = lerp(a[key], b[key], t);
  return out;
}

/* ------------------------------------------------------------- MODELOS -- */

type Rig = {
  root: Group; hips: Group; spine: Group; head: Group;
  lShoulder: Group; lElbow: Group; rShoulder: Group; rElbow: Group;
  lHip: Group; lKnee: Group; rHip: Group; rKnee: Group; product: Group; shadow: Mesh;
  /** Punto medio entre los ojos: lo que se encuadra en la línea superior. */
  eyes: Object3D;
  rHand: Object3D;
};

function mesh(geometry: BufferGeometry, material: Material) {
  return new Mesh(geometry, material);
}

function onHelperLayer(object: Object3D) {
  object.traverse(child => child.layers.set(HELPERS));
  return object;
}

function buildProduct(kind: SceneConfig["props"]["product"]) {
  const group = new Group();
  if (kind === "taza") {
    const white = new MeshStandardMaterial({ color: "#f8f6f2", roughness: 0.35 });
    const cup = mesh(new CylinderGeometry(0.045, 0.04, 0.1, 20), white);
    const handle = mesh(new TorusGeometry(0.028, 0.008, 8, 16), white);
    handle.position.set(0.05, 0, 0);
    group.add(cup, handle);
  } else if (kind === "prenda") {
    group.add(mesh(new BoxGeometry(0.32, 0.26, 0.03), new MeshStandardMaterial({ color: "#b4533a", roughness: 0.9 })));
  } else if (kind === "plato") {
    const plate = mesh(new CylinderGeometry(0.14, 0.1, 0.025, 28), new MeshStandardMaterial({ color: "#f5f3ee", roughness: 0.4 }));
    const food = mesh(new SphereGeometry(0.07, 16, 10), new MeshStandardMaterial({ color: "#c98b3b", roughness: 0.8 }));
    food.scale.y = 0.5;
    food.position.y = 0.03;
    plate.rotation.x = Math.PI / 2;
    food.rotation.x = Math.PI / 2;
    group.add(plate, food);
  } else if (kind === "celular") {
    group.add(mesh(new BoxGeometry(0.075, 0.15, 0.01), new MeshStandardMaterial({ color: "#1f2937", roughness: 0.3 })));
  } else {
    group.add(mesh(new BoxGeometry(0.17, 0.12, 0.17), new MeshStandardMaterial({ color: "#c2410c", roughness: 0.6 })));
  }
  return group;
}

function buildMannequin(color: string, product: SceneConfig["props"]["product"]): Rig {
  const skin = new MeshStandardMaterial({ color, roughness: 0.65 });
  const joint = new MeshStandardMaterial({ color: JOINT, roughness: 0.8 });
  const root = new Group();
  const hips = new Group();
  hips.position.y = MANNEQUIN.hips;
  root.add(hips);
  const pelvis = mesh(new CapsuleGeometry(0.12, 0.1, 4, 12), skin);
  pelvis.rotation.z = Math.PI / 2;
  pelvis.position.y = 0.02;
  hips.add(pelvis);
  const spine = new Group();
  spine.position.y = MANNEQUIN.spine;
  hips.add(spine);
  const torso = mesh(new CapsuleGeometry(0.15, 0.28, 4, 14), skin);
  torso.position.y = 0.23;
  torso.scale.set(1.15, 1, 0.7);
  spine.add(torso);
  const neck = new Group();
  neck.position.y = MANNEQUIN.neck;
  spine.add(neck);
  const neckMesh = mesh(new CylinderGeometry(0.045, 0.05, 0.09, 10), skin);
  neckMesh.position.y = 0.03;
  neck.add(neckMesh);
  const head = new Group();
  head.position.y = MANNEQUIN.head;
  head.rotation.order = "YXZ";
  neck.add(head);
  const skull = mesh(new SphereGeometry(0.105, 20, 16), skin);
  skull.scale.set(0.92, 1.08, 1);
  skull.position.y = 0.05;
  head.add(skull);
  const nose = mesh(new ConeGeometry(0.02, 0.05, 8), joint);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, MANNEQUIN.eyes - 0.035, 0.1);
  head.add(nose);
  // Ojos: esferas oscuras con un brillo y cejas finas. La línea de los ojos es la que se encuadra.
  const iris = new MeshStandardMaterial({ color: EYE_COLOR, roughness: 0.25 });
  const glint = new MeshBasicMaterial({ color: "#ffffff" });
  for (const side of [-1, 1] as const) {
    const eye = mesh(new SphereGeometry(0.017, 14, 10), iris);
    eye.position.set(side * 0.034, MANNEQUIN.eyes, 0.088);
    const spark = mesh(new SphereGeometry(0.0055, 8, 6), glint);
    spark.position.set(side * 0.034 + 0.005, MANNEQUIN.eyes + 0.006, 0.101);
    const brow = mesh(new BoxGeometry(0.036, 0.007, 0.01), iris);
    brow.position.set(side * 0.035, MANNEQUIN.eyes + 0.027, 0.094);
    brow.rotation.z = side * -0.12;
    head.add(eye, spark, brow);
  }
  const eyes = new Object3D();
  eyes.position.set(0, MANNEQUIN.eyes, MANNEQUIN.eyesForward);
  head.add(eyes);

  const arm = (side: 1 | -1) => {
    const shoulder = new Group();
    shoulder.position.set(0.2 * side, 0.42, 0);
    spine.add(shoulder);
    shoulder.add(mesh(new SphereGeometry(0.05, 12, 10), joint));
    const upper = mesh(new CapsuleGeometry(0.042, 0.22, 4, 10), skin);
    upper.position.y = -0.15;
    shoulder.add(upper);
    const elbow = new Group();
    elbow.position.y = -0.3;
    shoulder.add(elbow);
    const fore = mesh(new CapsuleGeometry(0.036, 0.2, 4, 10), skin);
    fore.position.y = -0.13;
    elbow.add(fore);
    const hand = mesh(new SphereGeometry(0.045, 10, 8), joint);
    hand.position.y = -0.29;
    elbow.add(hand);
    const grip = new Object3D();
    grip.position.y = -0.29;
    elbow.add(grip);
    return { shoulder, elbow, grip };
  };
  const leg = (side: 1 | -1) => {
    const hip = new Group();
    hip.position.set(0.1 * side, -0.02, 0);
    hips.add(hip);
    const thigh = mesh(new CapsuleGeometry(0.06, 0.32, 4, 10), skin);
    thigh.position.y = -0.22;
    hip.add(thigh);
    const knee = new Group();
    knee.position.y = -0.45;
    hip.add(knee);
    const shin = mesh(new CapsuleGeometry(0.05, 0.33, 4, 10), skin);
    shin.position.y = -0.22;
    knee.add(shin);
    const foot = mesh(new BoxGeometry(0.09, 0.05, 0.22), joint);
    foot.position.set(0, -0.46, 0.05);
    knee.add(foot);
    return { hip, knee };
  };
  const left = arm(1), right = arm(-1), leftLeg = leg(1), rightLeg = leg(-1);
  const held = buildProduct(product);
  held.position.set(0, 0.2, 0.36);
  spine.add(held);
  const shadow = mesh(new CircleGeometry(0.3, 24), new MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.12, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.003;
  return {
    root, hips, spine, head,
    lShoulder: left.shoulder, lElbow: left.elbow, rShoulder: right.shoulder, rElbow: right.elbow,
    lHip: leftLeg.hip, lKnee: leftLeg.knee, rHip: rightLeg.hip, rKnee: rightLeg.knee,
    product: held, shadow, eyes, rHand: right.grip,
  };
}

function applyPose(rig: Rig, pose: Pose, base: { x: number; z: number; yaw: number }, time: number) {
  rig.root.position.set(base.x + pose.x, 0, base.z + pose.z);
  rig.root.rotation.y = base.yaw + pose.yaw;
  rig.hips.position.y = pose.hipsY;
  rig.spine.rotation.y = pose.torsoYaw;
  rig.head.rotation.set(pose.headPitch, pose.headYaw, 0);
  rig.lShoulder.rotation.set(pose.lShX, 0, pose.lShZ);
  rig.rShoulder.rotation.set(pose.rShX, 0, pose.rShZ);
  rig.lElbow.rotation.set(pose.lEl, 0, pose.lElZ);
  rig.rElbow.rotation.set(pose.rEl, 0, pose.rElZ);
  rig.lHip.rotation.set(pose.lHip, 0, pose.lHipZ);
  rig.rHip.rotation.set(pose.rHip, 0, pose.rHipZ);
  rig.lKnee.rotation.x = pose.lKnee;
  rig.rKnee.rotation.x = pose.rKnee;
  const shown = pose.product > 0.02;
  rig.product.visible = shown;
  if (shown) {
    rig.product.scale.setScalar(Math.max(0.001, pose.product));
    rig.product.rotation.y = Math.sin(time * 0.8) * 0.6; // giro lento hacia la luz
  }
  rig.shadow.position.set(rig.root.position.x, 0.003, rig.root.position.z);
}

/** Cabeza hacia un punto del mundo, dentro de lo que gira un cuello real. Parte siempre de la pose. */
function aimHead(rig: Rig, pose: Pose, point: Vector3) {
  rig.head.rotation.set(pose.headPitch, pose.headYaw, 0);
  if (pose.look <= 0) return;
  const origin = new Vector3();
  rig.head.getWorldPosition(origin);
  const worldYaw = Math.atan2(point.x - origin.x, point.z - origin.z);
  const bodyYaw = rig.root.rotation.y + rig.spine.rotation.y;
  let yaw = worldYaw - bodyYaw;
  yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
  const flat = Math.hypot(point.x - origin.x, point.z - origin.z);
  const pitch = -Math.atan2(point.y - origin.y, Math.max(0.1, flat));
  rig.head.rotation.y = lerp(pose.headYaw, clamp(yaw, -1.2, 1.2), pose.look);
  rig.head.rotation.x = lerp(pose.headPitch, clamp(pitch, -0.6, 0.6), pose.look);
}

/* ------------------------------------------------------------- ENTORNO -- */

const ENV_COLORS: Record<SceneConfig["environment"], { floor: string; wall: string }> = {
  estudio: { floor: "#d9d6d1", wall: "#e8e5e0" },
  tienda: { floor: "#c9b59c", wall: "#efe4d6" },
  mesa: { floor: "#cdbfae", wall: "#eee7df" },
  sala: { floor: "#bfa488", wall: "#ece6dc" },
  calle: { floor: "#a7abaf", wall: "#d9cfc2" },
};

/** Escena con poca luz (de noche): no el contraluz, que es de día con una ventana detrás. */
function lowLight(config: SceneConfig) {
  return config.ambient < 0.6 && config.backdrop !== "ventana";
}

/** Colores del entorno: con poca luz, las superficies se ven más oscuras. */
function envColors(config: SceneConfig) {
  const base = ENV_COLORS[config.environment];
  if (!lowLight(config)) return base;
  const dim = (hex: string) => `#${new Color(hex).multiplyScalar(0.55).getHexString()}`;
  return { floor: dim(base.floor), wall: dim(base.wall) };
}

function box(w: number, h: number, d: number, color: string, x: number, y: number, z: number) {
  const item = mesh(new BoxGeometry(w, h, d), new MeshStandardMaterial({ color, roughness: 0.85 }));
  item.position.set(x, y, z);
  return item;
}

/** Silla mirando hacia `yaw`: el asiento queda bajo la cadera del maniquí sentado. */
function chair(x: number, z: number, yaw: number) {
  const group = new Group();
  group.position.set(x, 0, z);
  group.rotation.y = yaw;
  group.add(box(0.45, 0.05, 0.45, "#6b7280", 0, 0.46, -0.12), box(0.45, 0.42, 0.04, "#6b7280", 0, 0.71, -0.33));
  for (const [dx, dz] of [[-0.19, -0.31], [0.19, -0.31], [-0.19, 0.07], [0.19, 0.07]]) group.add(box(0.035, 0.45, 0.035, "#4b5563", dx, 0.225, dz));
  return group;
}

function wallDepth(config: SceneConfig) {
  if (config.environment === "calle") return -3.4;
  return config.backdrop === "pegado" ? -0.95 : -2.6;
}

function buildEnvironment(config: SceneConfig, windowSide: -1 | 1, tablePos: Vector3, hasTable: boolean) {
  const group = new Group();
  const colors = envColors(config);
  const floor = mesh(new PlaneGeometry(10, 10), new MeshStandardMaterial({ color: colors.floor, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);
  const wallZ = wallDepth(config);
  const back = mesh(new PlaneGeometry(10, 4.2), new MeshStandardMaterial({ color: colors.wall, roughness: 0.95 }));
  back.position.set(0, 2.1, wallZ);
  group.add(back);
  if (config.backdrop === "ventana") {
    // Ventana brillante justo detrás del sujeto: la cámara expone para ella y el rostro se oscurece.
    const glass = mesh(new PlaneGeometry(1.9, 2.1), new MeshBasicMaterial({ color: "#fffbf0" }));
    glass.position.set(0, 1.45, wallZ + 0.02);
    const frame = box(2.02, 2.22, 0.01, "#8a7a6a", 0, 1.45, wallZ + 0.006);
    group.add(frame, glass);
  }
  if (config.backdrop === "lampara") {
    // De noche: lámpara de pie encendida justo detrás del sujeto (contraluz sin luz delante).
    const pole = mesh(new CylinderGeometry(0.015, 0.015, LAMP.y, 8), new MeshStandardMaterial({ color: "#374151" }));
    pole.position.set(LAMP.x, LAMP.y / 2, LAMP.z);
    const shade = mesh(new CylinderGeometry(0.13, 0.2, 0.26, 20, 1, true), new MeshBasicMaterial({ color: "#ffd9a0", side: DoubleSide }));
    shade.position.set(LAMP.x, LAMP.y, LAMP.z);
    const bulb = mesh(new SphereGeometry(0.07, 12, 10), new MeshBasicMaterial({ color: "#fff4dc" }));
    bulb.position.set(LAMP.x, LAMP.y - 0.02, LAMP.z);
    group.add(pole, shade, bulb, box(0.32, 0.03, 0.32, "#374151", LAMP.x, 0.015, LAMP.z));
  }

  if (config.environment !== "calle" && (config.environment === "sala" || config.props.window)) {
    const side = mesh(new PlaneGeometry(6, 4.2), new MeshStandardMaterial({ color: colors.wall, roughness: 0.95 }));
    side.rotation.y = -windowSide * (Math.PI / 2);
    side.position.set(windowSide * 2.6, 2.1, 0.4);
    group.add(side);
  }
  if (config.props.window && config.environment !== "calle") {
    // De noche (poca luz ambiente) la ventana se ve oscura.
    const glass = mesh(new PlaneGeometry(1.1, 1.3), new MeshBasicMaterial({ color: lowLight(config) ? "#1f2937" : "#fdfbf3" }));
    glass.rotation.y = -windowSide * (Math.PI / 2);
    glass.position.set(windowSide * 2.58, 1.55, 0.5);
    const frame = box(0.04, 1.4, 1.2, "#8a7a6a", windowSide * 2.6, 1.55, 0.5);
    group.add(frame, glass);
  }
  if ((config.environment === "tienda" || config.props.shelf) && wallZ < -2) {
    for (const [i, y] of [0.9, 1.4, 1.9].entries()) {
      group.add(box(2.2, 0.04, 0.35, "#9c7b58", -0.4, y, -2.4));
      for (let k = 0; k < 5; k += 1) group.add(box(0.18, 0.2, 0.18, ["#c2410c", "#f5f3ee", "#0f766e", "#b4533a", "#e5c07b"][(k + i) % 5], -1.3 + k * 0.45, y + 0.12, -2.4));
    }
  }
  if (hasTable) {
    const top = box(1.2, 0.05, 0.7, "#a47c55", tablePos.x, 0.76, tablePos.z);
    group.add(top);
    for (const [dx, dz] of [[-0.55, -0.3], [0.55, -0.3], [-0.55, 0.3], [0.55, 0.3]]) group.add(box(0.05, 0.74, 0.05, "#7c5a3c", tablePos.x + dx, 0.37, tablePos.z + dz));
    const onTable = buildProduct(config.props.product);
    onTable.position.set(tablePos.x + 0.18, 0.84, tablePos.z);
    group.add(onTable);
  }
  if (config.props.sofa && config.staging !== "podcast") {
    const z = config.subjects.seated ? -0.32 : Math.max(-1.8, wallZ + 0.45);
    group.add(box(1.9, 0.42, 0.8, "#8b6f5a", 0, 0.21, z), box(1.9, 0.5, 0.2, "#7a604d", 0, 0.65, z - 0.4), box(0.2, 0.6, 0.8, "#7a604d", -0.95, 0.3, z), box(0.2, 0.6, 0.8, "#7a604d", 0.95, 0.3, z));
  } else if (config.subjects.seated) {
    const base = subjectBase(config);
    group.add(chair(base.x, base.z, base.yaw));
    if (config.staging === "podcast") {
      const { x, z } = PODCAST.interviewer;
      group.add(chair(x, z, Math.atan2(-x, -z)));
    }
  }
  if (config.environment === "calle") {
    const street = mesh(new PlaneGeometry(10, 1.6), new MeshStandardMaterial({ color: "#5b6168", roughness: 1 }));
    street.rotation.x = -Math.PI / 2;
    street.position.set(0, 0.004, -2.3);
    group.add(street, box(10, 0.12, 0.15, "#c8c8c8", 0, 0.06, -1.45));
    const post = mesh(new CylinderGeometry(0.05, 0.06, 3.2, 12), new MeshStandardMaterial({ color: "#374151" }));
    post.position.set(1.9, 1.6, -1.2);
    group.add(post);
    for (let k = 0; k < 4; k += 1) group.add(box(0.8, 1, 0.05, "#9fb3c8", -3 + k * 2, 2.2, -3.37));
    if (config.props.bench) group.add(box(1.4, 0.06, 0.45, "#8b5e3c", -1.4, 0.45, -0.7), box(1.4, 0.4, 0.06, "#8b5e3c", -1.4, 0.68, -0.92));
  }
  return group;
}

/* --------------------------------------------------------------- LUCES -- */

function lightPosition(light: SceneLight, windowSide: -1 | 1, eyeY: number, handAt: Vector3 | null, lensAt: Vector3): Vector3 {
  const side = light.side === 0 ? 1 : light.side;
  // Luz de mano con `side: 0` (error «Luz pegada al lente»): sobre el celular, en el eje de la cámara.
  if (light.source === "mano" && light.side === 0) return lensAt.clone().add(new Vector3(0, 0.1, 0));
  if (light.source === "mano") return handAt ? handAt.clone() : new Vector3(side * 0.46, eyeY + 0.08, 0.6);
  if (light.source === "lampara") return new Vector3(LAMP.x, LAMP.y, LAMP.z);
  // Contraluz de ventana (error «Contraluz»): la fuente está detrás, delante de la pared.
  if (light.role === "back" && light.source === "window") return new Vector3(0, 1.75, -2.25);
  if (light.source === "window") return new Vector3(windowSide * 2.3, 1.6, 0.5);
  if (light.source === "sun") return new Vector3(side * 3.2, 4.2, 1.6);
  if (light.role === "fill") return new Vector3(side * 1.45, 1.35, 1.25);
  // Contraluz de separación: detrás y en diagonal, por encima de la cabeza. Desde la cámara al pecho no se ven
  // los hombros por arriba, así que va bastante de costado para que el borde de color se lea en la silueta.
  if (light.role === "back") return new Vector3(side * 1.1, eyeY + 0.4, -1.0);
  if (light.role === "background") return new Vector3(0, 1.9, -1.5);
  return new Vector3(side * 1.48, KEY_HEIGHT, 1.48); // 45° del eje de cámara
}

function lightTarget(light: SceneLight, eyeY: number, wallZ: number) {
  if (light.role === "background") return new Vector3(0, 1.3, wallZ);
  if (light.role === "back") return new Vector3(0, eyeY - 0.12, 0);
  if (light.source === "mano") return new Vector3(0, eyeY - 0.04, 0.09);
  return new Vector3(0, Math.min(1.3, eyeY - 0.3), 0);
}

/** Luz principal móvil: la luz y sus ayudas giran alrededor del sujeto cuando un paso lo pide. */
type KeyRig = { light: Group; gizmos: Group; side: -1 | 1 };

function buildLights(config: SceneConfig, scene: Scene, helpers: Group, windowSide: -1 | 1, ringAt: Vector3, handAt: Vector3 | null): KeyRig | null {
  // Base suave para que ninguna pared quede negra; las luces del esquema marcan la diferencia.
  scene.add(new AmbientLight("#ffffff", 0.5 * config.ambient), new HemisphereLight("#ffffff", envColors(config).floor, 0.55 * config.ambient));
  const eyeY = eyeHeight(config.subjects.seated, config.body.feet);
  const wallZ = wallDepth(config);
  let keyRig: KeyRig | null = null;
  for (const light of config.lights) {
    const movable = light.role === "key" && (light.source === "softbox" || light.source === "led");
    const lightParent = movable ? new Group() : scene;
    const gizmoParent = movable ? new Group() : helpers;
    if (movable) {
      scene.add(lightParent);
      helpers.add(gizmoParent);
      keyRig = { light: lightParent as Group, gizmos: gizmoParent as Group, side: light.side === 1 ? 1 : -1 };
    }
    const color = new Color(lightHex(light));
    const gizmo = lightGizmoColor(light);
    const position = light.source === "ring" ? ringAt.clone() : lightPosition(light, windowSide, eyeY, handAt, ringAt);
    const target = lightTarget(light, eyeY, wallZ);
    // El contraluz va fuerte: su borde de color tiene que leerse en hombros y cabeza.
    const rim = light.role === "back" && light.source !== "window" && light.source !== "lampara";
    const factor = light.role === "fill" ? 1.1 : rim ? 10 : light.role === "back" ? 4.2 : light.source === "mano" ? 2.6 : 2.2;
    const strength = light.intensity * factor;
    if (light.source === "sun") {
      const sun = new DirectionalLight(color, strength);
      sun.position.copy(position);
      sun.target.position.copy(target);
      scene.add(sun, sun.target);
    } else {
      const wide = light.source === "window" || light.source === "bounce";
      // El contraluz se corta a 3 m: dibuja el borde del sujeto sin pintar el piso de adelante.
      const spot = new SpotLight(color, strength, rim ? 3 : 0, rim ? 0.45 : wide ? 0.95 : 0.6, rim ? 0.5 : light.hard ? 0.15 : 0.85, 0);
      spot.position.copy(position);
      spot.target.position.copy(target);
      lightParent.add(spot, spot.target);
    }
    // Ayudas visibles: esfera, cono de luz y línea hasta el sujeto.
    const small = light.source === "mano";
    const bulb = mesh(new SphereGeometry(light.role === "key" && !small ? 0.09 : small ? 0.045 : 0.07, 16, 12), new MeshBasicMaterial({ color: gizmo }));
    bulb.position.copy(position);
    const direction = target.clone().sub(position);
    const length = direction.length() * 0.8;
    const coneGeometry = new ConeGeometry(Math.tan(light.hard ? 0.3 : 0.55) * length, length, 28, 1, true);
    coneGeometry.translate(0, -length / 2, 0);
    const beamCone = mesh(coneGeometry, new MeshBasicMaterial({ color: gizmo, transparent: true, opacity: light.hard ? 0.2 : 0.13, side: DoubleSide, depthWrite: false }));
    beamCone.position.copy(position);
    beamCone.quaternion.setFromUnitVectors(new Vector3(0, -1, 0), direction.clone().normalize());
    const beam = new Line(new BufferGeometry().setFromPoints([position, target]), new LineBasicMaterial({ color: gizmo }));
    gizmoParent.add(bulb, beamCone, beam);
    if (light.source === "softbox" || light.source === "bounce" || small) {
      // Semitransparente: marca dónde va la fuente sin tapar al talento en la vista libre.
      const bounce = light.source === "bounce";
      const size = small ? [0.14, 0.09] : bounce ? [0.5, 0.65] : [0.45, 0.45];
      const panel = mesh(new BoxGeometry(size[0], size[1], 0.03), new MeshBasicMaterial({ color: small ? gizmo : bounce ? "#f8fafc" : "#fff7ed", transparent: true, opacity: small ? 0.9 : bounce ? 0.4 : 0.6, depthWrite: false }));
      panel.position.copy(position);
      panel.lookAt(target);
      gizmoParent.add(panel);
    }
    if (light.source === "ring") {
      const ring = mesh(new TorusGeometry(0.2, 0.025, 10, 32), new MeshBasicMaterial({ color: gizmo }));
      ring.position.copy(position);
      ring.lookAt(target);
      gizmoParent.add(ring);
    }
  }
  return keyRig;
}

/* -------------------------------------------------------------- CÁMARA -- */

function buildCameraRig() {
  const rig = new Group();
  const body = mesh(new BoxGeometry(0.08, 0.16, 0.012), new MeshStandardMaterial({ color: "#1f2937", roughness: 0.4 }));
  const lens = mesh(new CylinderGeometry(0.014, 0.014, 0.012, 16), new MeshBasicMaterial({ color: CAMERA_COLOR }));
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0.02, 0.05, -0.012);
  const marker = mesh(new SphereGeometry(0.03, 12, 10), new MeshBasicMaterial({ color: CAMERA_COLOR }));
  marker.position.set(0, 0.12, 0);
  rig.add(body, lens, marker);
  const tripod = new Group();
  const legMaterial = new MeshBasicMaterial({ color: "#4b5563" });
  for (let k = 0; k < 3; k += 1) {
    const angle = (k / 3) * Math.PI * 2;
    const foot = new Vector3(Math.cos(angle) * 0.32, -1, Math.sin(angle) * 0.32);
    const legGeometry = new CylinderGeometry(0.008, 0.008, 1, 6);
    legGeometry.translate(0, -0.5, 0);
    const legMesh = mesh(legGeometry, legMaterial);
    legMesh.quaternion.setFromUnitVectors(new Vector3(0, -1, 0), foot.clone().normalize());
    legMesh.scale.y = foot.length();
    tripod.add(legMesh);
  }
  return { rig, tripod };
}

/** Línea de dos puntos que se actualiza cada cuadro sin crear geometría nueva. */
function dynamicLine(color: string) {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(6), 3));
  const line = new Line(geometry, new LineBasicMaterial({ color }));
  line.frustumCulled = false;
  return line;
}

function setLine(line: Line, a: Vector3, b: Vector3) {
  const attribute = line.geometry.getAttribute("position") as BufferAttribute;
  attribute.setXYZ(0, a.x, a.y, a.z);
  attribute.setXYZ(1, b.x, b.y, b.z);
  attribute.needsUpdate = true;
}

/* ---------------------------------------------------------- PERSONAJES -- */

/** Ruta autenticada de los modelos (viven fuera de /public y exigen sesión). */
const MODELS_URL = "/api/modelos-3d";
/**
 * La ruta responde «private, max-age=604800, immutable» sobre URLs sin versión: pedidos así, el
 * navegador no volvería a preguntar en 7 días y podría juntar un manifiesto viejo con un GLB nuevo
 * (o seguir sirviendo los modelos sin sesión). Con «no-cache» revalida cada vez con el ETag: la ruta
 * vuelve a exigir la sesión y, si nada cambió, responde 304 sin volver a bajar los bytes.
 */
const MODELS_FETCH: RequestInit = { credentials: "same-origin", cache: "no-cache" };

/** Un GLB listo para clonar: la plantilla queda en reposo y nunca se agrega a una escena. */
type LoadedCharacter = {
  spec: ModeloPersonaje;
  template: Object3D;
  cal: RigCalibration;
  clips: { idle: AnimationClip | null; walk: AnimationClip | null };
  /** Metros por ciclo del clip de caminar tal como se mezcla (null: marcha procedural). */
  stride: number | null;
  /** Cuánto giran el torso los clips de reposo y de caminar (rad; + hacia su izquierda): se descuenta al orientarlo. */
  idleYaw: number;
  walkYaw: number;
};
export type CharacterSet = Partial<Record<PersonajeId, LoadedCharacter>>;

/*
 * Caché a nivel de módulo: una promesa por archivo, compartida entre lecciones y entre las veces que
 * el visor se recrea (formato, errores). Si una descarga falla se olvida para poder reintentar.
 */
let cloneSkinned: ((source: Object3D) => Object3D) | null = null;
let manifestPromise: Promise<ModeloPersonaje[]> | null = null;
const characterPromises = new Map<PersonajeId, Promise<LoadedCharacter>>();
const charactersReady = new Map<PersonajeId, LoadedCharacter>();
/** La nota de «no se pudieron cargar» se muestra una sola vez por visita (salvo que la persona reintente). */
let characterFailureShown = false;

function loadManifest() {
  if (!manifestPromise) {
    const pending = fetch(`${MODELS_URL}/manifest.json`, MODELS_FETCH).then(async response => {
      if (!response.ok) throw new Error(`manifiesto: HTTP ${response.status}`);
      return parseManifest(await response.json()).personajes;
    });
    pending.catch(() => {
      if (manifestPromise === pending) manifestPromise = null;
    });
    manifestPromise = pending;
  }
  return manifestPromise;
}

function loadCharacter(id: PersonajeId): Promise<LoadedCharacter> {
  const ready = charactersReady.get(id);
  if (ready) return Promise.resolve(ready);
  let pending = characterPromises.get(id);
  if (!pending) {
    pending = (async () => {
      // El cargador, el decodificador meshopt y SkeletonUtils van en su propio chunk: sin personajes no se descargan.
      const [specs, { GLTFLoader }, { MeshoptDecoder }, skeleton] = await Promise.all([
        loadManifest(),
        import("three/examples/jsm/loaders/GLTFLoader.js"),
        import("three/examples/jsm/libs/meshopt_decoder.module.js"),
        import("three/examples/jsm/utils/SkeletonUtils.js"),
      ]);
      const spec = specs.find(item => item.id === id);
      if (!spec) throw new Error(`el manifiesto no trae ${id}`);
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      // fetch propio (no loader.load) para pedirlo con MODELS_FETCH; el GLB trae todo adentro.
      const response = await fetch(`${MODELS_URL}/${spec.archivo}`, MODELS_FETCH);
      if (!response.ok) throw new Error(`${spec.archivo}: HTTP ${response.status}`);
      const gltf = await loader.parseAsync(await response.arrayBuffer(), "");
      const template = gltf.scene;
      const bones = resolveBoneMap(template, spec.huesos);
      const cal = calibrateRig(template, spec, bones);
      const named = (name?: string) => (name ? gltf.animations.find(clip => clip.name === name) ?? null : null);
      const clips = { idle: named(spec.animaciones?.reposo), walk: named(spec.animaciones?.caminar) };
      const stride = clips.walk ? measureWalkStride(template, bones, clips.walk, clips.idle, WALK_CLIP_WEIGHT) : null;
      const idleYaw = clips.idle ? measureClipYaw(template, bones, clips.idle) : 0;
      const walkYaw = clips.walk ? measureClipYaw(template, bones, clips.walk) : 0;
      cloneSkinned = skeleton.clone;
      const loaded: LoadedCharacter = { spec, template, cal, clips, stride, idleYaw, walkYaw };
      charactersReady.set(id, loaded);
      return loaded;
    })();
    const current = pending;
    current.catch(() => {
      if (characterPromises.get(id) === current) characterPromises.delete(id);
      // Si un GLB no cuadra con el manifiesto (un despliegue cambió uno de los dos), el reintento pide los dos de nuevo.
      manifestPromise = null;
    });
    characterPromises.set(id, current);
  }
  return pending;
}

function loadCharacters(ids: readonly PersonajeId[]): Promise<CharacterSet> {
  return Promise.all(ids.map(loadCharacter)).then(list => Object.fromEntries(list.map(item => [item.spec.id, item])) as CharacterSet);
}

/** Lo que ya está en memoria (otra lección los cargó): se usa al montar, sin parpadeo de maniquíes. */
function readyCharacters(ids: readonly PersonajeId[]): CharacterSet | null {
  if (!ids.length || !ids.every(id => charactersReady.has(id))) return null;
  return Object.fromEntries(ids.map(id => [id, charactersReady.get(id)!])) as CharacterSet;
}

/**
 * Una instancia en escena: clon con esqueleto propio; geometría, materiales y texturas son los de la
 * plantilla del caché. Así, con el mismo WebGLRenderer, recrear el visor (formato, errores) no vuelve
 * a subir texturas ni a compilar shaders.
 */
type CharacterInstance = {
  asset: LoadedCharacter;
  root: Object3D;
  bones: BoneMap;
  /** Punto medio entre los ojos, colgado de la cabeza: lo que se encuadra en la línea superior. */
  eyes: Object3D;
  shadow: Mesh;
  product: Group | null;
  mixer: AnimationMixer | null;
  idle: AnimationAction | null;
  walk: AnimationAction | null;
  /** Lo que se retoca encima del clip (piernas, brazos, cadera) vuelve a lo del clip antes de cada cuadro. */
  overlay: ClipOverlay | null;
};

/** Giro del producto en las manos de la actriz: la taza, con el asa hacia la cámara (así no choca con la palma). */
const HELD_YAW: Record<SceneConfig["props"]["product"], number> = { caja: 0, taza: -Math.PI / 2, prenda: 0, plato: 0, celular: 0 };

function createCharacter(asset: LoadedCharacter, product: SceneConfig["props"]["product"] | null): CharacterInstance {
  if (!cloneSkinned) throw new Error("SkeletonUtils no está cargado");
  const root = cloneSkinned(asset.template);
  root.updateMatrixWorld(true);
  const rootInv = root.matrixWorld.clone().invert();
  const height = asset.spec.altura;
  const toMesh = new Matrix4();
  root.traverse(object => {
    const item = object as Mesh;
    if (!item.isMesh) return;
    item.userData.sharedAsset = true;
    const skinned = object as SkinnedMesh;
    if (skinned.isSkinnedMesh) {
      // El volumen de reposo no cubre los brazos levantados ni la marcha: una esfera holgada (cintura,
      // radio de casi toda la estatura) en el espacio de la malla. Con ella, la «Vista de cámara» no
      // dibuja a quien queda fuera de cuadro (quien entrevista en el podcast).
      toMesh.multiplyMatrices(rootInv, skinned.matrixWorld).invert();
      const scale = Math.max(1e-6, new Matrix4().multiplyMatrices(rootInv, skinned.matrixWorld).getMaxScaleOnAxis());
      skinned.boundingSphere = new Sphere(new Vector3(0, height * 0.5, 0).applyMatrix4(toMesh), (height * 0.9) / scale);
    }
  });
  const bones = resolveBoneMap(root, asset.spec.huesos);
  const eyes = new Object3D();
  eyes.position.copy(asset.cal.eyeLocal);
  bones.head.add(eyes);
  const shadow = mesh(new CircleGeometry(0.3, 24), new MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.12, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  let mixer: AnimationMixer | null = null;
  let idle: AnimationAction | null = null;
  let walk: AnimationAction | null = null;
  if (asset.clips.idle) {
    mixer = new AnimationMixer(root);
    idle = mixer.clipAction(asset.clips.idle);
    idle.play();
    if (asset.clips.walk && asset.stride) {
      walk = mixer.clipAction(asset.clips.walk);
      walk.play();
      walk.setEffectiveWeight(0);
    }
  }
  let held: Group | null = null;
  if (product) {
    held = buildProduct(product);
    held.visible = false;
    held.rotation.y = HELD_YAW[product];
    root.add(held);
  }
  return { asset, root, bones, eyes, shadow, product: held, mixer, idle, walk, overlay: mixer ? clipOverlay(bones) : null };
}

/** Quien graba va en su propia capa: la ve la vista libre, nunca la «Vista de cámara». */
function onCrewLayer(...objects: Object3D[]) {
  for (const object of objects) object.traverse(child => child.layers.set(CREW_LAYER));
}

/** Libera lo propio de la instancia (esqueletos, sombra, producto); lo compartido queda en el caché. */
function disposeCharacter(character: CharacterInstance) {
  character.root.removeFromParent();
  character.shadow.removeFromParent();
  if (character.mixer) {
    character.mixer.stopAllAction();
    character.mixer.uncacheRoot(character.root);
  }
  character.root.traverse(object => {
    const skinned = object as SkinnedMesh;
    if (skinned.isSkinnedMesh) skinned.skeleton.dispose();
  });
  character.shadow.geometry.dispose();
  (character.shadow.material as Material).dispose();
  character.product?.traverse(object => {
    const item = object as Partial<Mesh>;
    item.geometry?.dispose();
    (item.material as Material | undefined)?.dispose();
  });
}

/**
 * Al cerrar el visor (se va el WebGLRenderer): suelta lo que ese renderer subió de las plantillas.
 * Los datos quedan en memoria y el próximo visor los vuelve a subir; sin esto, los oyentes «dispose»
 * que cada renderer deja en geometrías, materiales y texturas compartidos lo retendrían toda la visita.
 */
function releaseCharacterTemplates() {
  for (const asset of charactersReady.values()) {
    asset.template.traverse(object => {
      const item = object as Mesh;
      if (!item.isMesh) return;
      item.geometry.dispose();
      for (const material of Array.isArray(item.material) ? item.material : [item.material]) {
        for (const value of Object.values(material)) if ((value as { isTexture?: boolean } | null)?.isTexture) (value as { dispose(): void }).dispose();
        material.dispose();
      }
    });
  }
}

function placeCharacter(character: CharacterInstance, x: number, z: number, yaw: number) {
  character.root.position.set(x, 0, z);
  character.root.rotation.y = yaw;
  character.shadow.position.set(x, 0.003, z);
  // Solo la raíz: los huesos se actualizan después de posarlos.
  character.root.updateWorldMatrix(false, false);
}

function applySolution(character: CharacterInstance, solution: PoseSolution) {
  for (const key of HUESOS) character.bones[key].quaternion.copy(solution.local[key]);
  character.bones.pelvis.position.copy(solution.pelvisPosition);
  character.root.updateMatrixWorld(true);
}

const wrapAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

/** Cabeza del personaje hacia un punto del mundo (cuello 40 %, cabeza 60 %), como `aimHead` del maniquí. */
function aimCharacterHead(character: CharacterInstance, pose: CharacterPose, look: number, point: Vector3 | null) {
  let yaw = pose.headYaw;
  let pitch = pose.headPitch;
  if (point && look > 0) {
    const origin = character.bones.head.getWorldPosition(new Vector3());
    const bodyYaw = character.root.rotation.y + pose.torsoYaw + pose.pelvisYaw;
    const flat = Math.hypot(point.x - origin.x, point.z - origin.z);
    yaw = lerp(pose.headYaw, clamp(wrapAngle(Math.atan2(point.x - origin.x, point.z - origin.z) - bodyYaw), -1.2, 1.2), look);
    pitch = lerp(pose.headPitch, clamp(-Math.atan2(point.y - origin.y, Math.max(0.1, flat)) - pose.lean, -0.6, 0.6), look);
  }
  const { neck, head } = headLocals(character.asset.cal, yaw, pitch, pose.headRoll);
  character.bones.neck.quaternion.copy(neck);
  character.bones.head.quaternion.copy(head);
  character.bones.neck.updateMatrixWorld(true);
}

/**
 * Actriz: pose procedural completa. `placement` es la base más el desplazamiento de la acción; el
 * producto va entre las palmas (separadas según su ancho, `holdHalfWidth`) cuando la pose del
 * maniquí lo muestra. No gira como en el maniquí: lo sostienen las dos manos.
 */
function poseActress(character: CharacterInstance, pose: CharacterPose, placement: { x: number; z: number; yaw: number }, product: number, seatTop: number, holdHalfWidth: number) {
  placeCharacter(character, placement.x, placement.z, placement.yaw);
  const solution = solvePose(character.asset.cal, pose, { seatTop, holdHalfWidth });
  applySolution(character, solution);
  if (character.product) {
    const shown = product > 0.02;
    character.product.visible = shown;
    if (shown) {
      character.product.position.copy(productHold(solution));
      character.product.scale.setScalar(Math.max(0.001, product));
    }
  }
}

const LIVE = { rootInv: new Matrix4(), relative: new Matrix4(), parent: new Quaternion(), position: new Vector3(), scale: new Vector3() };

/** Si el hombro llega cómodo a un punto (sin estirar del todo el brazo). Todo en el espacio del personaje. */
function withinReach(character: CharacterInstance, side: Side, shoulder: Vector3, target: Vector3) {
  const limb = character.asset.cal.arm[side];
  return shoulder.distanceTo(target) <= (limb.upperLen + limb.lowerLen) * 0.97;
}

/**
 * Brazo del camarógrafo hacia un punto (espacio del personaje) sobre lo que dejó el clip. Con
 * `optional`, si no llega cómodo deja el brazo del clip (el celular en un trípode muy alto o muy bajo).
 */
function reachLive(character: CharacterInstance, side: Side, target: Vector3, pole: Vector3, optional: boolean) {
  const upper = character.bones[side === "L" ? "upperArmL" : "upperArmR"];
  const lower = character.bones[side === "L" ? "lowerArmL" : "lowerArmR"];
  const parent = upper.parent;
  if (!parent) return;
  LIVE.rootInv.copy(character.root.matrixWorld).invert();
  LIVE.relative.multiplyMatrices(LIVE.rootInv, parent.matrixWorld).decompose(LIVE.position, LIVE.parent, LIVE.scale);
  const shoulder = upper.getWorldPosition(new Vector3()).applyMatrix4(LIVE.rootInv);
  if (optional && !withinReach(character, side, shoulder, target)) return;
  const solved = solveArmLive(character.asset.cal, side, LIVE.parent, shoulder, target, pole);
  upper.quaternion.copy(solved.upper);
  lower.quaternion.copy(solved.lower);
  upper.updateMatrixWorld(true);
}

type CrewMotion = {
  walking: boolean;
  /** Metros recorridos por el camino del paso y velocidad (m/s). */
  gait: Gait;
  /** Hacia dónde va el recorrido en el mundo (unitaria y horizontal); null si no hay recorrido. */
  heading: Vector3 | null;
  time: number;
  /** Codos pegados y rodillas flexionadas (fluido) o no (brusco / codos abiertos). */
  tucked: boolean;
  elbowsOut: boolean;
  /** Muñecas en el mundo: el celular con las dos manos, o el celular y la luz. null = brazos del clip. */
  hands: Partial<Record<Side, Vector3 | null>>;
  /** En trípode sostener es opcional: si el celular queda lejos de las manos, brazos sueltos. */
  optional: boolean;
  /** Del lugar de quien graba hacia el celular (unitaria y horizontal). */
  toward: Vector3;
};

/** Cadera más baja con las rodillas flexionadas (quieto / caminando), como el maniquí; subirla estira las piernas (error). */
const CREW_KNEES = { still: 0.055, walking: 0.03, rigid: -0.03 } as const;
/** Lo más que se acerca quien graba al celular para que le lleguen los brazos. */
const CREW_MAX_STEP = 0.25;

/**
 * En mano, si el celular queda lejos de un hombro (a más del 97 % del largo del brazo), quien graba
 * da un paso hacia él: lo justo para que los dos brazos lleguen, hasta `CREW_MAX_STEP`.
 */
function stepToward(character: CharacterInstance, motion: CrewMotion) {
  let step = 0;
  for (const side of ["L", "R"] as const) {
    const target = motion.hands[side];
    if (!target) continue;
    const limb = character.asset.cal.arm[side];
    const reach = (limb.upperLen + limb.lowerLen) * 0.97;
    const shoulder = character.bones[side === "L" ? "upperArmL" : "upperArmR"].getWorldPosition(new Vector3());
    const gap = target.clone().sub(shoulder);
    // Menor s ≥ 0 con |gap − s·toward| ≤ reach; si ni así llega, lo más cerca posible.
    const along = gap.dot(motion.toward);
    const disc = along * along - gap.lengthSq() + reach * reach;
    step = Math.max(step, disc >= 0 ? along - Math.sqrt(disc) : along);
  }
  step = clamp(step, 0, CREW_MAX_STEP);
  if (step < 1e-3) return;
  character.root.position.addScaledVector(motion.toward, step);
  character.shadow.position.set(character.root.position.x, 0.003, character.root.position.z);
  character.root.updateMatrixWorld(true);
}

/**
 * Camarógrafo con clips: el torso de su «idle» gira unos 24° hacia su derecha (el de «walk», casi
 * nada); la raíz descuenta ese giro, mezclado como se mezclan los clips, para que quede de frente
 * al celular. Si el recorrido va hacia donde mira o hacia atrás (a menos de 45°), «idle» y «walk» se
 * mezclan según la velocidad y la fase de «walk» sigue a los metros recorridos de frente (equivale
 * a ajustar su timeScale, pero es determinista al saltar entre pasos); lo que quede de costado lo
 * cubren pasos cortos. Si va de costado (cámara en mano que acompaña a quien cruza el cuadro), no se
 * mezcla «walk»: da pasos cortos en la dirección del recorrido, sin patinar. Encima del clip: las
 * piernas (rodillas flexionadas o rígidas) y los brazos, que sostienen el celular. Sin clips, marcha
 * procedural.
 */
function poseCrew(character: CharacterInstance, placement: { x: number; z: number; yaw: number }, motion: CrewMotion) {
  const { cal, idleYaw, walkYaw } = character.asset;
  const { mixer, idle, walk } = character;
  const moving = motion.walking && motion.heading !== null;
  // Respecto de hacia dónde mira (el celular): ¿de frente/hacia atrás o de costado?
  const facing = moving ? travelInFrame(motion.heading!, placement.yaw) : { frontal: 0, lateral: 0 };
  const walkClip = Boolean(mixer && idle && walk) && Math.abs(facing.frontal) >= Math.SQRT1_2;
  const walkWeight = walkClip ? WALK_CLIP_WEIGHT * smooth((motion.gait.speed * Math.abs(facing.frontal)) / 0.3) : 0;
  const yaw = placement.yaw - (mixer && idle ? idleYaw * (1 - walkWeight) + walkYaw * walkWeight : 0);
  placeCharacter(character, placement.x, placement.z, yaw);
  const poleFor = (side: Side) => new Vector3(side === "L" ? 1 : -1, 0, 0).multiplyScalar(motion.elbowsOut ? 1 : 0.5).add(new Vector3(0, motion.elbowsOut ? -0.15 : -1, motion.elbowsOut ? -0.2 : -0.3));
  const local = (side: Side) => {
    const world = motion.hands[side];
    return world ? character.root.worldToLocal(world.clone()) : null;
  };
  // El recorrido en el marco de la raíz (sus pies): +Z su frente, +X su izquierda.
  const travel = moving ? travelInFrame(motion.heading!, yaw) : { frontal: 0, lateral: 0 };
  const frontal: Gait = { distance: motion.gait.distance * travel.frontal, speed: motion.gait.speed * Math.abs(travel.frontal) };
  if (mixer && idle) {
    // Lo retocado en el cuadro anterior vuelve a lo del clip: el mezclador no reescribe lo que no cambió (pausa).
    character.overlay?.restore();
    idle.time = motion.time % Math.max(0.001, idle.getClip().duration);
    idle.setEffectiveWeight(1 - walkWeight);
    if (walk) {
      walk.setEffectiveWeight(walkWeight);
      const cycles = frontal.distance / (character.asset.stride ?? STRIDE);
      walk.time = (cycles - Math.floor(cycles)) * walk.getClip().duration;
    }
    mixer.update(0);
    character.overlay?.save();
    character.root.updateMatrixWorld(true);
    // Con el celular por encima de los hombros (picado en mano) nadie se agacha: sin flexión extra.
    const shoulderY = character.root.position.y + cal.rest.upperArmL.pos.y;
    const overhead = [motion.hands.L, motion.hands.R].some(point => point && point.y > shoulderY);
    const drop = motion.tucked ? (overhead ? 0 : motion.walking ? CREW_KNEES.walking : CREW_KNEES.still) : motion.walking ? 0 : CREW_KNEES.rigid;
    let feet: Record<Side, Vector3> | undefined;
    if (moving && walkClip && Math.abs(travel.lateral) > 0.05) feet = stepFeet(motion.gait.distance * travel.lateral, motion.gait.speed * Math.abs(travel.lateral));
    else if (moving && !walkClip) feet = stepFeet(motion.gait.distance, motion.gait.speed, { x: travel.lateral, z: travel.frontal });
    if (drop !== 0 || feet) legsLive(character.root, character.bones, cal, { drop, feet });
    if (!motion.optional) stepToward(character, motion);
    for (const side of ["L", "R"] as const) {
      const target = local(side);
      if (target) reachLive(character, side, target, poleFor(side), motion.optional);
    }
    return;
  }
  const reach = { L: local("L"), R: local("R") };
  for (const side of ["L", "R"] as const) {
    const target = reach[side];
    if (target && motion.optional && !withinReach(character, side, cal.rest[side === "L" ? "upperArmL" : "upperArmR"].pos, target)) reach[side] = null;
  }
  const pose = characterActionPose({
    action: motion.walking ? "walk" : "idle",
    p: 0,
    time: motion.time,
    seated: false,
    body: { elbows: "pegados", feet: motion.tucked ? "adelantado" : "juntos" },
    gait: motion.walking ? frontal : null,
  });
  applySolution(character, solvePose(cal, pose, { reach, reachPole: { L: reach.L ? poleFor("L") : undefined, R: reach.R ? poleFor("R") : undefined } }));
}

const BODY_OK: SceneBody = { elbows: "pegados", feet: "adelantado" };

/** Base del lugar más el desplazamiento y el giro de la acción (lo mismo que hace `applyPose` con el maniquí). */
function placementOf(base: { x: number; z: number; yaw: number }, pose: Pose) {
  return { x: base.x + pose.x, z: base.z + pose.z, yaw: base.yaw + pose.yaw };
}

/* --------------------------------------------------------------- VISOR -- */

type ViewerSnapshot = { time: number; playing: boolean; view: { position: [number, number, number]; target: [number, number, number] } };
type ViewerApi = {
  play(): void; pause(): void; seek(index: number): void; restart(): void; view(name: ViewName): void; snapshot(): ViewerSnapshot;
  /**
   * Suelta el lienzo (animación, controles, observadores) y devuelve cómo liberar sus geometrías y
   * materiales. El renderer es del componente y sigue vivo: se liberan después del primer cuadro del
   * visor nuevo, así los shaders que comparten siguen compilados.
   */
  dispose(): () => void;
  /** Cambia maniquíes por personajes (o al revés) en el lugar: no toca el tiempo, la reproducción ni la vista. */
  setCharacters(set: CharacterSet | null): void;
};

/** Un solo WebGLRenderer por visor montado: se reutiliza al cambiar de formato o de error. null si no hay WebGL. */
function createRenderer(): WebGLRenderer | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ antialias: true, powerPreference: "low-power" });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.display = "block";
  renderer.domElement.style.touchAction = "none";
  return renderer;
}

/** Recuadro de la «Vista de cámara» (píxeles, arriba a la derecha) según el formato. */
function insetRect(width: number, height: number, format: FrameFormat) {
  const margin = 10;
  if (format === "horizontal") {
    const w = Math.round(Math.min(width * 0.4, height * 0.42 * (16 / 9)));
    return { x: width - w - margin, y: height - Math.round((w * 9) / 16) - margin, w, h: Math.round((w * 9) / 16), margin };
  }
  const h = Math.round(height * 0.46);
  const w = Math.round((h * 9) / 16);
  return { x: width - w - margin, y: height - h - margin, w, h, margin };
}

function createViewer(options: {
  /** Renderer del componente: su lienzo ya está en `host` y conserva texturas y shaders entre recreaciones. */
  renderer: WebGLRenderer;
  host: HTMLDivElement;
  inset: HTMLDivElement;
  progress: HTMLSpanElement;
  eyeMarker: HTMLSpanElement;
  config: SceneConfig;
  resume: ViewerSnapshot | null;
  /** Personajes ya cargados (si no, maniquíes hasta que lleguen por `setCharacters`). */
  characters: CharacterSet | null;
  onBeat: (index: number) => void;
  onPlaying: (playing: boolean) => void;
  /** Después del primer cuadro dibujado (el componente libera ahí lo del visor anterior). */
  onFirstFrame: () => void;
  /** No se pudo armar un personaje que el reparto pedía: la escena vuelve a los maniquíes. */
  onCharactersError: (error: unknown) => void;
}): ViewerApi {
  const { renderer, host, inset, progress, eyeMarker, config, resume, onBeat, onPlaying } = options;

  const dark = document.documentElement.classList.contains("dark");
  const scene = new Scene();
  scene.background = new Color(lowLight(config) ? (dark ? "#101316" : "#2a2e33") : dark ? "#1d2126" : "#eef0f1");
  const helpers = onHelperLayer(new Group()) as Group;
  scene.add(helpers);

  const format = config.format;
  const aspect = FORMAT_LABELS[format].aspect;
  const seated = config.subjects.seated;
  const enter = config.subjects.enterFrom;
  const podcast = config.staging === "podcast";
  const following = config.camera.move === "seguimiento";
  /** La cámara viaja con el sujeto: seguimiento, o cámara en mano o selfie mientras camina. */
  const tracks = (beat: SceneBeat) => following || (config.camera.handheld && (beat.action === "walk" || beat.action === "walkIn"));
  const jerky = config.motion === "brusco";
  // «Codos abiertos» en una toma en movimiento con quien graba a la vista: el error es de quien graba (brazos estirados).
  const crewElbows = config.body.elbows === "abiertos" && config.subjects.operator && (config.camera.move !== "fija" || config.camera.handheld);
  const body: SceneBody = crewElbows ? { ...config.body, elbows: "pegados" } : config.body;
  const key = config.lights.find(light => light.role === "key");
  const windowSide: -1 | 1 = key && key.side === 1 ? 1 : -1;
  // Solo producto: la mesa va al centro y el producto queda en el origen.
  const productOnly = config.subjects.productOnly;
  const hasTable = config.props.table || productOnly;
  const tablePos = productOnly ? new Vector3(-0.18, 0, 0) : config.props.tableInFront ? new Vector3(0, 0, 0.62) : new Vector3(-1.05, 0, 0.15);
  scene.add(buildEnvironment(config, windowSide, tablePos, hasTable));

  const grid = new GridHelper(10, 20, dark ? "#56606a" : "#b9c0c6", dark ? "#3a4148" : "#d3d8dc");
  grid.position.y = 0.002;
  helpers.add(grid);

  const people = [buildMannequin(PERSON_A, config.props.product)];
  if (config.subjects.count === 2) people.push(buildMannequin(PERSON_B, config.props.product));
  const interviewer = PODCAST.interviewer;
  const bases = [subjectBase(config), podcast ? { x: interviewer.x, z: interviewer.z, yaw: Math.atan2(-interviewer.x, -interviewer.z) } : { x: 0.78, z: -0.15, yaw: -0.45 }];
  for (const person of people) scene.add(person.root, person.shadow);
  people[0].root.visible = people[0].shadow.visible = !productOnly;
  // Quien graba (maniquí F) aparece detrás del celular, con los brazos hacia él. Va en su capa: sus
  // manos quedan junto al lente y la «Vista de cámara» no debe dibujarlas.
  const operator = config.subjects.operator ? buildMannequin(OPERATOR_COLOR, config.props.product) : null;
  if (operator) {
    onCrewLayer(operator.root, operator.shadow);
    scene.add(operator.root, operator.shadow);
  }
  // Personajes que reemplazan a los maniquíes (a lo sumo 3); la persona de la luz de mano sigue como maniquí.
  const cast = castCharacters(config.subjects);
  const actors: { subject: CharacterInstance | null; second: CharacterInstance | null; operator: CharacterInstance | null } = { subject: null, second: null, operator: null };
  // Asiento: el sofá es más bajo que la silla, la banca y las sillas del podcast.
  const seatTop = config.props.sofa && !podcast ? 0.42 : SEAT_TOP;
  // Las palmas de la actriz se apoyan en las caras del producto de la escena.
  const holdHalf = PRODUCT_HALF_WIDTH[config.props.product];

  // Luz de mano: una persona la sostiene a 45°, un poco por encima de los ojos.
  const hand = config.lights.find(light => light.source === "mano");
  let handAt: Vector3 | null = null;
  // Pegada al lente (`side: 0`) va sobre el celular: no hay asistente que la sostenga.
  if (hand && hand.side !== 0 && !productOnly) {
    const assistant = buildMannequin(OPERATOR_COLOR, config.props.product);
    const side = hand.side === 1 ? 1 : -1;
    const spot = { x: side * 1.0, z: 0.75 };
    applyPose(assistant, assistantPose(), { ...spot, yaw: Math.atan2(-spot.x, -spot.z) }, 0);
    scene.add(assistant.root, assistant.shadow);
    handAt = assistant.rHand.getWorldPosition(new Vector3());
  }

  // Cámaras: la del celular (inserto) y un clon corto para dibujar su frustum.
  const shotCam = new PerspectiveCamera(40, aspect, 0.03, 60);
  const frustumCam = new PerspectiveCamera(40, aspect, 0.05, 1);
  const frustum = new CameraHelper(frustumCam);
  frustum.setColors(new Color(CAMERA_COLOR), new Color(CAMERA_COLOR), new Color(CAMERA_COLOR), new Color(CAMERA_COLOR), new Color(CAMERA_COLOR));
  const { rig: cameraRig, tripod } = buildCameraRig();
  helpers.add(frustum, cameraRig, tripod);
  // Regla de altura (pecho o los errores): línea del lente al sujeto y aro a esa altura.
  const heightRule = config.framing.heightRule;
  const heightColor = heightRule === "pecho" ? OK_COLOR : WRONG_COLOR;
  const heightLine = heightRule ? dynamicLine(heightColor) : null;
  const heightRing = heightRule ? mesh(new TorusGeometry(0.2, 0.008, 6, 40), new MeshBasicMaterial({ color: heightColor })) : null;
  if (heightRing) {
    heightRing.rotation.x = Math.PI / 2;
    heightRing.scale.set(1, 0.7, 1);
  }
  if (heightLine && heightRing) helpers.add(heightLine, heightRing);
  onHelperLayer(helpers);

  const firstBeat = config.beats[0];
  const first = firstBeat ? placementForBeat(config, firstBeat) : placementForBeat(config, { shot: "medio", angle: "ojos", focalMm: config.camera.focalMm });
  const keyRig = buildLights(config, scene, helpers, windowSide, new Vector3(...first.position), handAt);
  onHelperLayer(helpers);

  const viewCam = new PerspectiveCamera(45, 1, 0.05, 80);
  viewCam.layers.enable(HELPERS);
  viewCam.layers.enable(CREW_LAYER);
  viewCam.position.set(...VIEWS["3/4"]);
  const controls = new OrbitControls(viewCam, renderer.domElement);
  controls.target.set(0, 1, 0.35);
  if (resume) {
    viewCam.position.set(...resume.view.position);
    controls.target.set(...resume.view.target);
  }
  controls.enablePan = false;
  controls.minDistance = 1.2;
  controls.maxDistance = 10;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.update();

  function setView(name: ViewName) {
    const [x, y, z] = VIEWS[name];
    viewCam.position.set(x, y, z);
    controls.target.set(0, name === "Arriba" ? 0.6 : 1, 0.35);
    controls.update();
  }

  let cameraPath: Line | null = null;
  let subjectPath: Line | null = null;
  let width = 1, height = 1;
  let time = resume ? clamp(resume.time, 0, config.duration) : 0;
  let last = 0, raf = 0;
  let playing = false, visible = true, disposed = false, currentBeat = -1, firstFrame = true;
  const tmp = new Vector3();
  const eyeWorld = new Vector3();
  const lookAt = new Vector3(...first.position);
  // Altura de ojos y producto en mano del sujeto: los del maniquí o, con personajes, los del modelo real
  // (manifest.ojos). Se recalculan al cambiar de figuras.
  let canonicalEyeY = eyeHeight(seated, body.feet);
  const MANNEQUIN_PRODUCT = new Vector3(0, MANNEQUIN.hips + MANNEQUIN.spine + 0.2, 0.36);
  const productFocus = MANNEQUIN_PRODUCT.clone();
  // Luz de mano pegada al lente: con camarógrafo, la sostiene con la otra mano sobre el celular.
  const lensLight = hand && hand.side === 0 ? new Vector3(...first.position).add(new Vector3(0, 0.1, 0)) : null;
  // `settled`: el sujeto ya llegó a su marca (o la cámara lo acompaña); mientras camina hacia una cámara quieta, el marcador es neutro.
  const eyeScreen = { x: 0.5, y: EYE_LINE, shown: false, settled: true };

  const holdingAt = (index: number) => {
    const beat = config.beats[index];
    return beat && !productOnly ? actionPose(beat.action, 1, 0, seated, enter, body).product > 0.5 : false;
  };

  /* Personajes: lo que se ve es el personaje si está cargado; si no, el maniquí. */
  const subjectHead = (): Object3D => (actors.subject ? actors.subject.bones.head : people[0].head);
  const subjectEyes = (): Object3D => (actors.subject ? actors.subject.eyes : people[0].eyes);

  /** Metros recorridos por el sujeto en el paso y su velocidad (m/s): la marcha los sigue para que los pies no patinen. */
  function gaitFor(action: SubjectAction, p: number, duration: number, remap: (q: number) => number = q => q): Gait {
    if (action !== "walk" && action !== "walkIn") return { distance: 0, speed: 0 };
    const at = (q: number) => actionPose(action, remap(clamp(q, 0, 1)), 0, seated, enter, body);
    const start = at(0);
    const travelled = (q: number) => {
      const here = at(q);
      return Math.hypot(here.x - start.x, here.z - start.z);
    };
    const a = Math.max(0, p - 0.01);
    const b = Math.min(1, p + 0.01);
    return { distance: travelled(p), speed: Math.abs(travelled(b) - travelled(a)) / Math.max(1e-4, (b - a) * duration) };
  }

  const actressState = (item: SceneBeat, q: number, t: number) => ({ action: item.action, p: q, time: t, seated, body, gait: gaitFor(item.action, q, item.end - item.start) });

  /**
   * Camarógrafo detrás del celular. En mano o en seguimiento lo sostiene con las dos manos (o con una y
   * la luz pegada al lente en la otra) y camina al ritmo del sujeto; en trípode lo toma si le queda a mano.
   */
  function poseCamarographer(character: CharacterInstance, beat: SceneBeat, p: number, t: number, placement: { x: number; z: number; yaw: number }, state: { tucked: boolean; walking: boolean; onTripod: boolean; toward: Vector3 }) {
    const moving = tracks(beat) && (beat.action === "walk" || beat.action === "walkIn");
    // La cámara lo arrastra: a tirones con el error de movimiento brusco.
    const gait = moving ? gaitFor(beat.action, p, beat.end - beat.start, jerky ? q => followProgress(q, "brusco") : undefined) : { distance: 0, speed: 0 };
    const from = actionPose(beat.action, 0, 0, seated, enter, body);
    const to = actionPose(beat.action, 1, 0, seated, enter, body);
    // Quien graba recorre el mismo camino que el sujeto. En su marco, poseCrew decide: si el sujeto viene
    // hacia la cámara retrocede (el clip va al revés) y si cruza de costado da pasos laterales.
    const heading = new Vector3(to.x - from.x, 0, to.z - from.z);
    const right = new Vector3(1, 0, 0).applyQuaternion(shotCam.quaternion);
    const up = new Vector3(0, 1, 0).applyQuaternion(shotCam.quaternion);
    const behind = new Vector3(0, 0, 1).applyQuaternion(shotCam.quaternion);
    // Muñecas un poco detrás y debajo de los bordes del celular (los dedos lo rodean). Su derecha es la derecha de la pantalla.
    const grip = (offset: number) => shotCam.position.clone().addScaledVector(right, offset).addScaledVector(behind, 0.06).addScaledVector(up, -0.03);
    const hands = lensLight
      ? { L: lensLight.clone().addScaledVector(behind, 0.05).add(new Vector3(0, -0.05, 0)), R: grip(0) }
      : { L: grip(-0.05), R: grip(0.05) };
    poseCrew(character, placement, {
      walking: state.walking,
      gait,
      heading: heading.lengthSq() > 1e-6 ? heading.normalize() : null,
      time: t,
      tucked: state.tucked,
      elbowsOut: crewElbows,
      hands,
      optional: state.onTripod,
      toward: state.toward,
    });
  }

  type Cast = { subject: CharacterInstance | null; second: CharacterInstance | null; operator: CharacterInstance | null };
  const castMembers = (list: Cast) => [list.subject, list.second, list.operator].filter((item): item is CharacterInstance => item !== null);
  let castVersion = 0;

  /**
   * Arma las instancias que pide el reparto. Si una falla (un hueso que no está en el clon, un
   * personaje que no llegó), libera las demás, lo registra y avisa: la escena sigue con maniquíes
   * y el conmutador lo muestra.
   */
  function buildCast(set: CharacterSet): Cast | null {
    const built: Cast = { subject: null, second: null, operator: null };
    const wanted: [keyof Cast, PersonajeId | null, SceneConfig["props"]["product"] | null][] = [
      ["subject", productOnly ? null : cast.subject, config.props.product],
      ["second", people[1] ? cast.second : null, null],
      ["operator", operator ? cast.operator : null, null],
    ];
    try {
      for (const [role, id, product] of wanted) {
        if (!id) continue;
        const asset = set[id];
        if (!asset) throw new Error(`el reparto cargado no trae ${id}`);
        built[role] = createCharacter(asset, product);
      }
    } catch (error) {
      console.warn("[personajes] no se pudo armar la escena con personajes; siguen los maniquíes.", error);
      for (const character of castMembers(built)) disposeCharacter(character);
      options.onCharactersError(error);
      return null;
    }
    if (built.operator) onCrewLayer(built.operator.root, built.operator.shadow);
    return built;
  }

  /** Pone en escena un reparto armado (null: los maniquíes) y reencuadra con los ojos reales. */
  function install(next: Cast | null) {
    for (const character of castMembers(actors)) disposeCharacter(character);
    actors.subject = next?.subject ?? null;
    actors.second = next?.second ?? null;
    actors.operator = next?.operator ?? null;
    for (const character of castMembers(actors)) scene.add(character.root, character.shadow);
    people[0].root.visible = people[0].shadow.visible = !productOnly && !actors.subject;
    if (people[1]) people[1].root.visible = people[1].shadow.visible = !actors.second;
    if (operator) operator.root.visible = operator.shadow.visible = !actors.operator;
    // Encuadre con los ojos reales del personaje (manifest.ojos) y el producto entre sus manos.
    const subject = actors.subject;
    if (subject) {
      canonicalEyeY = characterEyeHeight(subject.asset.cal, seated, body.feet, seatTop);
      const held = productHold(solvePose(subject.asset.cal, characterActionPose({ action: "showProduct", p: 1, time: 0, seated, body }), { seatTop, holdHalfWidth: holdHalf }));
      const base = bases[0];
      productFocus.copy(held.applyAxisAngle(new Vector3(0, 1, 0), base.yaw)).add(new Vector3(base.x, 0, base.z));
    } else {
      canonicalEyeY = eyeHeight(seated, body.feet);
      productFocus.copy(MANNEQUIN_PRODUCT);
    }
    const beat = config.beats[currentBeat];
    if (beat) rebuildPath(beat);
    schedule();
  }

  /**
   * Reemplaza maniquíes por personajes (o al revés) sin tocar el tiempo, la reproducción ni la vista.
   * `precompile`: cuando llegan con la escena andando, sus shaders se compilan antes de mostrarlos
   * (en paralelo si el navegador tiene KHR_parallel_shader_compile, sin trabar la animación);
   * mientras tanto siguen los maniquíes. Al crear el visor con ellos ya cargados, van directo.
   */
  function setCharacters(set: CharacterSet | null, precompile: boolean) {
    const version = ++castVersion;
    const built = set ? buildCast(set) : null;
    if (!built || !precompile) {
      install(built);
      return;
    }
    const holder = new Group();
    for (const character of castMembers(built)) holder.add(character.root);
    renderer
      .compileAsync(holder, viewCam, scene)
      .catch(error => console.warn("[personajes] no se pudieron precompilar los shaders; se compilan al dibujar.", error))
      .then(() => {
        if (disposed || version !== castVersion) {
          for (const character of castMembers(built)) disposeCharacter(character);
          return;
        }
        install(built);
      });
  }

  type Subject = { x: number; z: number; eyeY: number };

  /** Posición del celular para un paso y su avance (0..1), encuadrando los ojos del sujeto. */
  function cameraAt(beat: SceneBeat, p: number, t: number, subject: Subject) {
    // Brusco: la cámara avanza a tirones, atrasada respecto del sujeto.
    const pMove = jerky ? followProgress(p, "brusco") : p;
    const e = smooth(pMove);
    let offset = { x: 0, z: 0 };
    if (tracks(beat)) {
      if (jerky) {
        const lagged = actionPose(beat.action, pMove, t, seated, enter, body);
        offset = { x: lagged.x, z: lagged.z };
      } else offset = { x: subject.x, z: subject.z };
    }
    const eyes = eyePoint(config, offset);
    eyes[1] = subject.eyeY;
    let azimuth = podcast ? PODCAST.azimuth : 0;
    let distanceScale = 1;
    if (config.camera.move === "orbita") azimuth += lerp(-0.9, 0.9, e);
    if (config.camera.move === "pushIn") distanceScale = lerp(1.4, 0.8, e);
    if (config.camera.move === "pullOut") distanceScale = lerp(0.8, 1.4, e);
    const placement = placementForBeat(config, beat, { eyes, azimuth, distanceScale, productOnTable: hasTable && !holdingAt(beat.index) });
    const position = new Vector3(...placement.position);
    const target = new Vector3(...placement.target);
    // Detalle o cenital de producto: el foco va al producto, en mano o sobre la mesa.
    if (productOnly || beat.shot === "detalle" || (beat.angle === "cenital" && hasTable && !holdingAt(beat.index))) {
      const focus = holdingAt(beat.index) ? productFocus.clone() : hasTable ? new Vector3(tablePos.x + 0.18, 0.84, tablePos.z) : null;
      if (focus) {
        const shift = position.clone().sub(target);
        target.copy(focus);
        position.copy(focus).add(shift);
      }
    }
    const distance = position.distanceTo(target);
    switch (config.camera.move) {
      case "paneo": {
        const yaw = Math.sin(pMove * Math.PI * 2) * 0.35;
        const aim = target.clone().sub(position).applyAxisAngle(new Vector3(0, 1, 0), yaw);
        target.copy(position).add(aim);
        break;
      }
      case "tilt":
        target.y += Math.sin(pMove * Math.PI * 2) * 0.35 * distance;
        break;
      case "travelling": {
        const shift = lerp(-0.9, 0.9, e) * Math.max(0.5, distance * 0.8);
        position.x += shift;
        target.x += shift * 0.35;
        break;
      }
      case "whip": {
        const pulse = Math.exp(-Math.pow((pMove - 0.5) / 0.06, 2)) * 1.2;
        const aim = target.clone().sub(position).applyAxisAngle(new Vector3(0, 1, 0), pulse);
        target.copy(position).add(aim);
        break;
      }
      default:
        break;
    }
    let roll = placement.roll;
    if (jerky) {
      // Tirones: sacudida visible y horizonte que se tuerce.
      position.x += Math.sin(t * 9.1) * 0.02 + Math.sin(t * 17.3) * 0.01;
      position.y += Math.sin(t * 11.7) * 0.018;
      target.y += Math.sin(t * 6.3) * 0.03;
      roll += Math.sin(t * 7.9) * 2.5;
    } else if (config.camera.handheld) {
      position.x += Math.sin(t * 7.3) * 0.006 + Math.sin(t * 13.1) * 0.003;
      position.y += Math.sin(t * 9.7) * 0.005;
    }
    return { position, target, fov: placement.fov, roll, eyeLine: placement.eyes !== null };
  }

  function disposeLine(line: Line | null) {
    if (!line) return;
    helpers.remove(line);
    line.geometry.dispose();
    (line.material as Material).dispose();
  }

  function rebuildPath(beat: SceneBeat) {
    disposeLine(cameraPath);
    disposeLine(subjectPath);
    cameraPath = subjectPath = null;
    const walking = beat.action === "walk" || beat.action === "walkIn";
    const subjectAt = (p: number): Subject => {
      const pose = actionPose(beat.action, p, 0, seated, enter, body);
      return { x: pose.x, z: pose.z, eyeY: canonicalEyeY };
    };
    if (walking && !productOnly) {
      const base = bases[0];
      const points = Array.from({ length: 41 }, (_, i) => {
        const at = subjectAt(i / 40);
        return new Vector3(base.x + at.x, 0.012, base.z + at.z);
      });
      subjectPath = new Line(new BufferGeometry().setFromPoints(points), new LineBasicMaterial({ color: SUBJECT_PATH_COLOR }));
      subjectPath.layers.set(HELPERS);
      helpers.add(subjectPath);
    }
    if (["fija", "mano", "paneo", "tilt", "whip"].includes(config.camera.move)) return;
    const points = Array.from({ length: 41 }, (_, i) => cameraAt(beat, i / 40, 0, subjectAt(i / 40)).position);
    cameraPath = new Line(new BufferGeometry().setFromPoints(points), new LineBasicMaterial({ color: jerky ? WRONG_COLOR : PATH_COLOR }));
    cameraPath.layers.set(HELPERS);
    helpers.add(cameraPath);
  }

  function applyTime(t: number) {
    const beats = config.beats;
    if (!beats.length) return;
    let index = beats.findIndex(beat => t < beat.end);
    if (index === -1) index = beats.length - 1;
    const beat = beats[index];
    const local = t - beat.start;
    const p = clamp(local / Math.max(0.001, beat.end - beat.start), 0, 1);
    if (index !== currentBeat) {
      const leaving = config.beats[currentBeat]?.overview;
      currentBeat = index;
      if (beat.overview) setView(beat.overview);
      else if (leaving) setView("3/4");
      rebuildPath(beat);
      onBeat(index);
    }
    // Sujeto principal
    let pose = actionPose(beat.action, p, t, seated, enter, body);
    const previous = index > 0 ? beats[index - 1] : null;
    const blend = previous && local < BLEND ? smooth(local / BLEND) : 1;
    if (previous && blend < 1) pose = blendPose(actionPose(previous.action, 1, t, seated, enter, body), pose, blend);
    // Con personaje, el maniquí sigue mandando dónde está (x, z, giro), a dónde mira y si muestra el producto;
    // el cuerpo lo pone la pose procedural del esqueleto, mezclada entre pasos igual que la del maniquí.
    let actressPose: CharacterPose | null = null;
    if (actors.subject) {
      actressPose = characterActionPose(actressState(beat, p, t));
      if (previous && blend < 1) actressPose = blendCharacterPose(characterActionPose(actressState(previous, 1, t)), actressPose, blend);
      poseActress(actors.subject, actressPose, placementOf(bases[0], pose), pose.product, seatTop, holdHalf);
    } else applyPose(people[0], pose, bases[0], t);
    const aimSubject = (point: Vector3) => {
      if (actors.subject && actressPose) aimCharacterHead(actors.subject, actressPose, pose.look, point);
      else aimHead(people[0], pose, point);
    };

    // Segunda persona. En el podcast es quien entrevista: el sujeto la mira a ella, no a la cámara.
    let lookPoint: Vector3 | null = null;
    if (people[1] && podcast) {
      const listener = actionPose("idle", p, t + 0.7, true, enter, BODY_OK);
      if (actors.second) {
        const listening = characterActionPose({ action: "idle", p, time: t + 0.7, seated: true, body: BODY_OK });
        poseActress(actors.second, listening, placementOf(bases[1], listener), 0, seatTop, holdHalf);
        aimCharacterHead(actors.second, listening, listener.look, subjectHead().getWorldPosition(tmp));
        lookPoint = actors.second.bones.head.getWorldPosition(new Vector3());
      } else {
        applyPose(people[1], listener, bases[1], t);
        aimHead(people[1], listener, subjectHead().getWorldPosition(tmp));
        lookPoint = people[1].head.getWorldPosition(new Vector3());
      }
    }

    // Cámara con la línea de ojos. Dos pasadas: la cabeza mira a la cámara y los ojos se mueven un poco.
    const camFor = (subject: Subject) => {
      let cam = cameraAt(beat, p, t, subject);
      if (previous && local < 0.8) {
        const from = cameraAt(previous, 1, t, subject);
        const k = smooth(local / 0.8);
        cam = { ...cam, position: from.position.lerp(cam.position, k), target: from.target.lerp(cam.target, k), fov: lerp(from.fov, cam.fov, k), roll: lerp(from.roll, cam.roll, k) };
      }
      return cam;
    };
    let cam = camFor({ x: pose.x, z: pose.z, eyeY: canonicalEyeY });
    for (let pass = 0; pass < 2 && !productOnly; pass += 1) {
      aimSubject(lookPoint ?? lookAt.copy(cam.position));
      subjectEyes().getWorldPosition(eyeWorld);
      cam = camFor({ x: pose.x, z: pose.z, eyeY: eyeWorld.y });
    }
    if (!productOnly) {
      aimSubject(lookPoint ?? lookAt.copy(cam.position));
      subjectEyes().getWorldPosition(eyeWorld);
    }

    if (keyRig) {
      const angleOf = (item: SceneBeat | null) => item?.keyAngle ?? 45;
      const heightOf = (item: SceneBeat | null) => item?.keyHeight ?? KEY_HEIGHT;
      const k = previous && local < 0.8 ? smooth(local / 0.8) : 1;
      const angle = lerp(angleOf(previous), angleOf(beat), previous ? k : 1);
      const lift = lerp(heightOf(previous), heightOf(beat), previous ? k : 1) - KEY_HEIGHT;
      for (const holder of [keyRig.light, keyRig.gizmos]) {
        holder.rotation.y = (keyRig.side * (angle - 45) * Math.PI) / 180;
        holder.position.y = lift;
      }
    }
    shotCam.position.copy(cam.position);
    shotCam.up.set(0, 1, 0);
    shotCam.lookAt(cam.target);
    if (cam.roll) shotCam.rotateZ((cam.roll * Math.PI) / 180);
    shotCam.fov = cam.fov;
    shotCam.updateProjectionMatrix();
    shotCam.updateMatrixWorld();
    frustumCam.position.copy(shotCam.position);
    frustumCam.quaternion.copy(shotCam.quaternion);
    frustumCam.fov = cam.fov;
    frustumCam.far = Math.max(0.3, cam.position.distanceTo(cam.target));
    frustumCam.updateProjectionMatrix();
    frustumCam.updateMatrixWorld();
    frustum.update();
    cameraRig.position.copy(shotCam.position);
    cameraRig.quaternion.copy(shotCam.quaternion);
    const onTripod = !config.camera.handheld && !["seguimiento", "orbita", "travelling"].includes(config.camera.move) && beat.angle !== "cenital";
    tripod.visible = onTripod;
    if (onTripod) {
      tripod.position.set(shotCam.position.x, shotCam.position.y - 0.09, shotCam.position.z);
      tripod.scale.set(1, Math.max(0.1, shotCam.position.y - 0.09), 1);
    }
    if (heightLine && heightRing) {
      const standing = actors.subject ? actors.subject.root : people[0].root;
      const subjectAt = new Vector3(standing.position.x, shotCam.position.y, standing.position.z);
      setLine(heightLine, shotCam.position, subjectAt);
      heightRing.position.copy(subjectAt);
    }

    // Ojos en la «Vista de cámara»: el marcador sigue a los ojos y se pinta rojo si se salen de la línea.
    eyeScreen.shown = !productOnly && cam.eyeLine;
    eyeScreen.settled = tracks(beat) || !((beat.action === "walk" && p < 0.95) || (beat.action === "walkIn" && p < 0.8));
    if (eyeScreen.shown) {
      tmp.copy(eyeWorld).project(shotCam);
      eyeScreen.x = (tmp.x + 1) / 2;
      eyeScreen.y = (1 - tmp.y) / 2;
      eyeScreen.shown = tmp.z < 1 && eyeScreen.x >= 0 && eyeScreen.x <= 1 && eyeScreen.y >= 0 && eyeScreen.y <= 1;
    }

    if (people[1] && !podcast) {
      const secondAction: SubjectAction = beat.action === "react" ? "react" : beat.action === "talk" || beat.action === "lookLens" ? "lookAway" : beat.action === "sit" ? "sit" : "idle";
      const second = actionPose(secondAction, p, t + 0.7, seated, enter, body);
      second.look = 1;
      const target = secondAction === "lookAway" ? subjectHead().getWorldPosition(tmp) : shotCam.position;
      if (actors.second) {
        const partner = characterActionPose({ action: secondAction, p, time: t + 0.7, seated, body });
        poseActress(actors.second, partner, placementOf(bases[1], second), 0, seatTop, holdHalf);
        aimCharacterHead(actors.second, partner, 1, target);
      } else {
        applyPose(people[1], second, bases[1], t);
        aimHead(people[1], second, target);
      }
    }
    if (operator) {
      const tucked = !jerky && !crewElbows;
      const walking = tracks(beat) && (beat.action === "walk" || beat.action === "walkIn") && p < 0.95;
      const back = new Vector3(0, 0, 1).applyQuaternion(shotCam.quaternion).setY(0);
      if (back.lengthSq() < 0.01) back.set(0, 0, 1);
      back.normalize().multiplyScalar(tucked ? 0.34 : 0.55);
      const x = shotCam.position.x + back.x, z = shotCam.position.z + back.z;
      const yaw = Math.atan2(cam.target.x - x, cam.target.z - z);
      if (actors.operator) poseCamarographer(actors.operator, beat, p, t, { x, z, yaw }, { tucked, walking, onTripod, toward: back.clone().normalize().negate() });
      else applyPose(operator, operatorPose(tucked, walking, t), { x, z, yaw }, t);
    }
    progress.style.width = `${config.duration ? (t / config.duration) * 100 : 0}%`;
  }

  function paintEyeMarker() {
    if (!eyeScreen.shown) {
      eyeMarker.style.display = "none";
      return;
    }
    const onLine = Math.abs(eyeScreen.y - EYE_LINE) <= EYE_TOLERANCE;
    Object.assign(eyeMarker.style, {
      display: "block",
      left: `${(eyeScreen.x * 100).toFixed(2)}%`,
      top: `${(eyeScreen.y * 100).toFixed(2)}%`,
      borderColor: !eyeScreen.settled ? MOVING_COLOR : onLine ? OK_COLOR : WRONG_COLOR,
    });
  }

  function render() {
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, width, height);
    renderer.render(scene, viewCam);
    const rect = insetRect(width, height, format);
    if (rect.w > 20 && rect.x > 0) {
      renderer.setScissorTest(true);
      renderer.setScissor(rect.x, rect.y, rect.w, rect.h);
      renderer.setViewport(rect.x, rect.y, rect.w, rect.h);
      renderer.render(scene, shotCam);
      renderer.setScissorTest(false);
    }
    paintEyeMarker();
  }

  function tick(now: number) {
    raf = 0;
    if (disposed) return;
    if (playing) {
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      time += dt;
      if (time >= config.duration) {
        time = config.duration;
        playing = false;
        onPlaying(false);
      }
    }
    applyTime(time);
    render();
    if (firstFrame) {
      firstFrame = false;
      options.onFirstFrame();
    }
    if (playing && visible && !raf) raf = requestAnimationFrame(tick);
  }
  const schedule = () => {
    if (!raf && !disposed) raf = requestAnimationFrame(tick);
  };

  function resize() {
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height, false);
    viewCam.aspect = width / height;
    // En pantallas verticales se abre el ángulo para que entren sujeto, cámara y luces.
    viewCam.fov = Math.min(80, Math.max(45, (2 * Math.atan(Math.tan((28 * Math.PI) / 180) / viewCam.aspect) * 180) / Math.PI));
    viewCam.updateProjectionMatrix();
    const rect = insetRect(width, height, format);
    Object.assign(inset.style, { top: `${rect.margin}px`, right: `${rect.margin}px`, width: `${rect.w}px`, height: `${rect.h}px` });
    schedule();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  resize();

  const intersection = new IntersectionObserver(entries => {
    visible = entries.some(entry => entry.isIntersecting) && document.visibilityState === "visible";
    if (visible && playing) {
      last = 0;
      schedule();
    }
  });
  intersection.observe(host);
  const onVisibility = () => {
    visible = document.visibilityState === "visible";
    if (visible && playing) {
      last = 0;
      schedule();
    }
  };
  document.addEventListener("visibilitychange", onVisibility);
  controls.addEventListener("change", schedule);

  const api: ViewerApi = {
    play() {
      if (time >= config.duration - 0.01) time = 0;
      playing = true;
      last = 0;
      onPlaying(true);
      schedule();
    },
    pause() {
      playing = false;
      onPlaying(false);
      schedule();
    },
    seek(index) {
      const beat = config.beats[clamp(index, 0, config.beats.length - 1)];
      if (!beat) return;
      time = beat.start + 0.001;
      last = 0;
      schedule();
    },
    restart() {
      time = 0;
      last = 0;
      schedule();
    },
    view(name) {
      setView(name);
      schedule();
    },
    snapshot() {
      return {
        time,
        playing,
        view: { position: [viewCam.position.x, viewCam.position.y, viewCam.position.z], target: [controls.target.x, controls.target.y, controls.target.z] },
      };
    },
    setCharacters(set) {
      if (!disposed) setCharacters(set, true);
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      raf = 0;
      resizeObserver.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      controls.removeEventListener("change", schedule);
      controls.dispose();
      return () => {
        frustum.dispose();
        // Los personajes liberan lo suyo (esqueletos, mezclador, sombra); geometría, materiales y texturas son del caché.
        for (const character of castMembers(actors)) disposeCharacter(character);
        actors.subject = actors.second = actors.operator = null;
        scene.traverse(object => {
          const item = object as Partial<Mesh>;
          if (item.userData?.sharedAsset) return;
          item.geometry?.dispose();
          const material = item.material;
          if (Array.isArray(material)) material.forEach(m => m.dispose());
          else material?.dispose();
        });
      };
    },
  };

  if (options.characters) setCharacters(options.characters, false);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Al cambiar de formato o de error se sigue donde estaba; la primera vez, solo sin movimiento reducido.
  if (resume ? resume.playing : !reduced) api.play();
  else schedule();
  return api;
}

/* ------------------------------------------------------------ COMPONENTE -- */

const FORMATS: readonly { value: FrameFormat; short: string; Icon: typeof RectangleVertical }[] = [
  { value: "vertical", short: "9:16 Reels", Icon: RectangleVertical },
  { value: "horizontal", short: "16:9 YouTube", Icon: RectangleHorizontal },
];

type Figures = "personajes" | "maniqui";

const FIGURES: readonly { value: Figures; label: string; title: string; Icon: typeof UsersRound }[] = [
  { value: "personajes", label: "Personajes", title: "Personajes 3D (solo para uso interno del equipo)", Icon: UsersRound },
  { value: "maniqui", label: "Maniquí", title: "Maniquíes livianos, para equipos lentos", Icon: PersonStanding },
];

/**
 * Con el ahorro de datos del navegador encendido, o en equipos con muy poca memoria (2 GB o menos),
 * la escena empieza con los maniquíes livianos: los personajes bajan unos 5 MB y ocupan decenas de
 * MB de memoria de video. «Personajes» sigue a un toque.
 */
function prefersLightFigures() {
  if (typeof navigator === "undefined") return false;
  const hints = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
  return hints.connection?.saveData === true || (typeof hints.deviceMemory === "number" && hints.deviceMemory <= 2);
}

/**
 * `personajes`: lo calcula el servidor (MANUAL_3D_PERSONAJES) y baja por ModuleLessons. Apagado, el
 * visor usa solo maniquíes y no pide nada a /api/modelos-3d.
 */
export default function SceneViewer({ scene, title, personajes }: { scene: ManualScene3d; title: string; personajes: boolean }) {
  const base = useMemo(() => parseScene3d(scene, title), [scene, title]);
  const [format, setFormat] = useState<FrameFormat>("vertical");
  const [mistake, setMistake] = useState<SceneMistake | null>(null);
  const config = useMemo(() => sceneVariant(base, { format, mistake }), [base, format, mistake]);
  const hostRef = useRef<HTMLDivElement>(null);
  const insetRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLSpanElement>(null);
  const eyeMarkerRef = useRef<HTMLSpanElement>(null);
  const apiRef = useRef<ViewerApi | null>(null);
  const resumeRef = useRef<ViewerSnapshot | null>(null);
  const [beatIndex, setBeatIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  // Un paso con error («[CONTRALUZ] 0-2 s: …») lo muestra mientras dura y, al salir de él, vuelve a lo correcto.
  // Entre pasos sin error se respeta lo que la persona eligió en «Compara».
  const stepMistakeRef = useRef<SceneMistake | null>(null);
  const onBeat = useCallback(
    (index: number) => {
      setBeatIndex(index);
      const next = base.beats[index]?.mistake ?? null;
      if (next === stepMistakeRef.current) return;
      stepMistakeRef.current = next;
      setMistake(next);
    },
    [base],
  );

  // Personajes: quién aparece no cambia con el formato ni con los errores, solo con la escena.
  const castKey = useMemo(() => castIds(castCharacters(base.subjects)).join(","), [base]);
  const ids = useMemo(() => (castKey ? (castKey.split(",") as PersonajeId[]) : []), [castKey]);
  const [figures, setFigures] = useState<Figures>(() => (prefersLightFigures() ? "maniqui" : "personajes"));
  const [characters, setCharacters] = useState<CharacterSet | null>(() => (personajes ? readyCharacters(ids) : null));
  const [charactersFailed, setCharactersFailed] = useState(false);
  const [failureNote, setFailureNote] = useState(false);
  const wantsCharacters = personajes && ids.length > 0 && figures === "personajes" && !failed && !charactersFailed;
  // Si no se pudieron cargar, el conmutador muestra lo que se ve: los maniquíes.
  const shownFigures: Figures = charactersFailed ? "maniqui" : figures;
  const loadingCharacters = wantsCharacters && !characters;
  const charactersRef = useRef<CharacterSet | null>(null);
  /** La persona pidió reintentar: si vuelve a fallar, la nota se muestra otra vez. */
  const retryRef = useRef(false);

  // Descarga o armado fallido: maniquíes y el conmutador en «Maniquí» (tocar «Personajes» reintenta).
  const reportCharactersFailure = useCallback(() => {
    setCharactersFailed(true);
    if (!characterFailureShown || retryRef.current) {
      characterFailureShown = true;
      retryRef.current = false;
      setFailureNote(true);
    }
  }, []);

  useEffect(() => {
    if (!loadingCharacters) return;
    let cancelled = false;
    loadCharacters(ids).then(
      set => {
        if (!cancelled) setCharacters(set);
      },
      error => {
        // 401 (sesión vencida), 404 (interruptor apagado), red, un GLB inválido o huesos que no cuadran:
        // queda registrado y la escena sigue con los maniquíes.
        console.warn("[personajes] no se pudieron cargar los modelos; siguen los maniquíes.", error);
        if (!cancelled) reportCharactersFailure();
      },
    );
    return () => {
      cancelled = true;
    };
  }, [loadingCharacters, ids, reportCharactersFailure]);

  useEffect(() => {
    if (!failureNote) return;
    const timer = window.setTimeout(() => setFailureNote(false), 7000);
    return () => window.clearTimeout(timer);
  }, [failureNote]);

  // Va antes que el efecto que crea el visor: al montarlo (o recrearlo) ya sabe qué figuras usar.
  useEffect(() => {
    charactersRef.current = wantsCharacters ? characters : null;
    apiRef.current?.setCharacters(charactersRef.current);
  }, [wantsCharacters, characters]);

  /*
   * Un solo WebGLRenderer mientras el visor está montado. Cambiar de formato o de error (también los
   * pasos «[ERROR]» durante la reproducción) rearma la escena, no el contexto: texturas y shaders de
   * los personajes siguen en la GPU. Lo del visor anterior se libera después del primer cuadro del
   * nuevo, así los shaders que comparten no se destruyen y se vuelven a compilar.
   */
  const gpuRef = useRef<{ renderer: WebGLRenderer | null; retired: (() => void)[] }>({ renderer: null, retired: [] });

  useEffect(() => {
    const host = hostRef.current, inset = insetRef.current, progress = progressRef.current, eyeMarker = eyeMarkerRef.current;
    if (!host || !inset || !progress || !eyeMarker) return;
    const gpu = gpuRef.current;
    if (!gpu.renderer) {
      gpu.renderer = createRenderer();
      if (!gpu.renderer) {
        setFailed(true);
        return;
      }
      host.prepend(gpu.renderer.domElement);
    }
    const flush = () => {
      for (const release of gpu.retired.splice(0)) release();
    };
    const api = createViewer({
      renderer: gpu.renderer,
      host,
      inset,
      progress,
      eyeMarker,
      config,
      resume: resumeRef.current,
      characters: charactersRef.current,
      onBeat,
      onPlaying: setPlaying,
      onFirstFrame: flush,
      onCharactersError: reportCharactersFailure,
    });
    apiRef.current = api;
    return () => {
      resumeRef.current = api.snapshot();
      const release = api.dispose();
      // Si el renderer ya se cerró (desmontaje), se libera ahora.
      if (gpu.renderer) gpu.retired.push(release);
      else release();
      apiRef.current = null;
    };
  }, [config, onBeat, reportCharactersFailure]);

  // Va después del efecto del visor: al desmontar, primero se retira el último visor y luego se cierra el contexto.
  useEffect(() => {
    const gpu = gpuRef.current;
    return () => {
      for (const release of gpu.retired.splice(0)) release();
      const renderer = gpu.renderer;
      gpu.renderer = null;
      if (!renderer) return;
      releaseCharacterTemplates();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);

  const beat = config.beats[beatIndex];
  const angle = beat ? beatAngle(config, beat) : null;
  const total = config.beats.length;
  const vertical = config.format === "vertical";
  const wrong = mistake ? MISTAKE_LABELS[mistake] : null;
  const preset = config.preset ? PRESET_LABELS[config.preset] : null;
  const angleIntent = angle && angle !== "ojos" ? `${ANGLE_LABELS[angle]}: ${ANGLE_INTENT[angle].toLowerCase()}` : null;
  const eyeLineShot = Boolean(beat && !config.subjects.productOnly && EYE_LINE_SHOTS.includes(beat.shot) && beat.angle !== "cenital");
  const people = config.subjects.productOnly ? "solo producto" : config.subjects.count === 2 ? "dos personas" : "una persona";
  const description = [
    `Escena 3D de «${title}»: ${ENVIRONMENT_LABELS[config.environment].toLowerCase()}, ${people}, ${beat ? SHOT_LABELS[beat.shot].toLowerCase() : ""}, ${config.lightingLabels.join(", ").toLowerCase()}.`,
    `Formato ${FORMAT_LABELS[config.format].long}.`,
    preset ? `${preset.label}.` : "",
    wrong ? `Se muestra lo incorrecto: ${wrong.wrong}.` : "",
    "Los pasos en texto describen lo mismo.",
  ].filter(Boolean).join(" ");

  return (
    <div className="space-y-3">
      <div
        ref={hostRef}
        role="img"
        aria-label={description}
        className={cn("border-line bg-surface2 relative w-full overflow-hidden rounded-xl border", wrong && "border-danger ring-danger ring-2")}
        style={{ height: "min(50vh, 520px)", minHeight: 260 }}
      >
        {failed ? (
          <div className="text-inkmuted grid h-full place-items-center p-6 text-center text-[13px]">
            Este navegador no puede mostrar la escena 3D. Sigue los pasos en texto: describen lo mismo.
          </div>
        ) : null}
        <div
          className={cn("pointer-events-none absolute top-2.5 left-2.5 flex flex-wrap gap-1", vertical ? "max-w-[calc(100%-7.5rem)] sm:max-w-[60%]" : "max-w-[calc(54%-1.5rem)]")}
          aria-hidden="true"
        >
          {wrong ? (
            <span className="bg-danger rounded-md px-2 py-0.5 text-[11px] font-bold text-white shadow-[var(--shadow-1)]">Incorrecto: {wrong.wrong}</span>
          ) : preset ? (
            <span className="bg-brand rounded-md px-2 py-0.5 text-[11px] font-bold text-white shadow-[var(--shadow-1)]">{preset.label}</span>
          ) : null}
          {beat ? (
            <>
              <span className="bg-surface/90 text-ink rounded-md px-2 py-0.5 text-[11px] font-semibold shadow-[var(--shadow-1)]">{SHOT_LABELS[beat.shot]}</span>
              <span className="bg-surface/90 text-inksoft rounded-md px-2 py-0.5 text-[11px] font-semibold shadow-[var(--shadow-1)]">{beat.focalMm} mm · {ANGLE_LABELS[angle ?? beat.angle]}</span>
              <span className="bg-surface/90 text-inksoft rounded-md px-2 py-0.5 text-[11px] font-semibold shadow-[var(--shadow-1)]">{MOVE_LABELS[config.camera.move]}</span>
              {angleIntent && !wrong ? <span className="bg-surface/90 text-inksoft hidden rounded-md px-2 py-0.5 text-[11px] font-semibold shadow-[var(--shadow-1)] sm:inline">{angleIntent}</span> : null}
            </>
          ) : null}
        </div>
        <div ref={insetRef} className={cn("pointer-events-none absolute rounded-md ring-2", wrong ? "ring-danger" : "ring-[#c2410c]")} aria-hidden="true">
          <span className={cn("absolute top-full left-1/2 mt-1 -translate-x-1/2 rounded px-1.5 py-px text-[9.5px] font-bold whitespace-nowrap text-white", wrong ? "bg-danger" : "bg-[#c2410c]")}>
            Vista de cámara · {vertical ? "9:16" : "16:9"}
          </span>
          {vertical ? <span className="absolute border border-dashed border-[#c2410c]/80" style={{ top: "14%", bottom: "35%", left: "6%", right: "6%" }} title="Zona segura de Reels" /> : null}
          <span className="absolute inset-x-0 border-t border-white/45 shadow-[0_1px_0_rgba(0,0,0,0.28)]" style={{ top: "66.6667%" }} />
          <span className="absolute inset-y-0 border-l border-white/45 shadow-[1px_0_0_rgba(0,0,0,0.28)]" style={{ left: "33.3333%" }} />
          <span className="absolute inset-y-0 border-l border-white/45 shadow-[1px_0_0_rgba(0,0,0,0.28)]" style={{ left: "66.6667%" }} />
          {/* Línea superior de los tercios: ahí van los ojos. */}
          <span className="absolute inset-x-0 border-t-2 border-[#fbbf24] shadow-[0_1px_0_rgba(0,0,0,0.35)]" style={{ top: `${EYE_LINE * 100}%` }} />
          {eyeLineShot ? (
            <span className="absolute right-1 -translate-y-full rounded-sm bg-[#fbbf24] px-1 text-[8.5px] leading-[13px] font-bold text-[#1b1e23]" style={{ top: `${EYE_LINE * 100}%` }}>ojos</span>
          ) : null}
          {/* Aro hueco sobre los ojos: verde en la línea, rojo fuera de ella (sin tapar los ojos). */}
          <span ref={eyeMarkerRef} className="absolute hidden h-3 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-[0_0_0_1px_rgba(255,255,255,0.85)]" />
        </div>
        <div className="pointer-events-none absolute bottom-2 left-2.5 hidden flex-wrap gap-x-3 gap-y-1 sm:flex" aria-hidden="true">
          <span className="bg-surface/90 text-inksoft flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10.5px] font-semibold"><span className="dot" style={{ background: CAMERA_COLOR }} />Cámara · {FORMAT_LABELS[config.format].short}</span>
          {config.lights.map(light => (
            <span key={light.role} className="bg-surface/90 text-inksoft flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10.5px] font-semibold">
              <span className="dot" style={{ background: lightGizmoColor(light) }} />{lightLegend(light)}
            </span>
          ))}
        </div>
        {loadingCharacters || failureNote ? (
          <span className="bg-surface/90 text-inkmuted pointer-events-none absolute right-2.5 bottom-2 max-w-[60%] rounded-md px-2 py-0.5 text-right text-[10.5px] font-semibold shadow-[var(--shadow-1)]" aria-hidden="true">
            {loadingCharacters ? "Cargando personajes…" : "No se pudieron cargar los personajes: se muestran los maniquíes."}
          </span>
        ) : null}
      </div>
      <p className="sr-only" aria-live="polite">
        {loadingCharacters ? "Cargando personajes…" : failureNote ? "No se pudieron cargar los personajes: se muestran los maniquíes." : ""}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-sm btn-primary" onClick={() => (playing ? apiRef.current?.pause() : apiRef.current?.play())} disabled={failed}>
          {playing ? <Pause size={14} /> : <Play size={14} />}
          {playing ? "Pausa" : "Reproducir"}
        </button>
        <button type="button" className="btn btn-sm" onClick={() => apiRef.current?.restart()} disabled={failed}>
          <RotateCcw size={14} /> Reiniciar
        </button>
        <button type="button" className="btn btn-sm btn-icon" aria-label="Paso anterior" onClick={() => apiRef.current?.seek(beatIndex - 1)} disabled={failed || beatIndex === 0}>
          <ChevronLeft size={15} />
        </button>
        <button type="button" className="btn btn-sm btn-icon" aria-label="Paso siguiente" onClick={() => apiRef.current?.seek(beatIndex + 1)} disabled={failed || beatIndex >= total - 1}>
          <ChevronRight size={15} />
        </button>
        <div className="bg-surface3 inline-flex items-center gap-0.5 rounded-lg p-0.5" role="group" aria-label="Formato del encuadre">
          {FORMATS.map(({ value, short, Icon }) => (
            <button
              key={value}
              type="button"
              aria-pressed={format === value}
              title={FORMAT_LABELS[value].long}
              onClick={() => setFormat(value)}
              disabled={failed}
              className={cn(
                "inline-flex min-h-[30px] items-center gap-1.5 rounded-md px-2.5 py-[5px] text-[12px] font-semibold",
                format === value ? "bg-surface text-ink shadow-[var(--shadow-1)]" : "text-inkmuted hover:text-ink",
              )}
            >
              <Icon size={14} aria-hidden="true" />
              <span className="sm:hidden">{short}</span>
              <span className="hidden sm:inline">{FORMAT_LABELS[value].long}</span>
            </button>
          ))}
        </div>
        {personajes && ids.length ? (
          <div className="bg-surface3 inline-flex items-center gap-0.5 rounded-lg p-0.5" role="group" aria-label="Figuras de la escena">
            {FIGURES.map(({ value, label, title: hint, Icon }) => (
              <button
                key={value}
                type="button"
                aria-pressed={shownFigures === value}
                title={value === "personajes" && charactersFailed ? "No se pudieron cargar los personajes: toca para reintentar" : hint}
                onClick={() => {
                  // Tras un fallo, «Personajes» reintenta (la caché ya olvidó las descargas fallidas).
                  if (value === "personajes" && charactersFailed) {
                    retryRef.current = true;
                    setCharactersFailed(false);
                  }
                  setFigures(value);
                }}
                disabled={failed}
                className={cn(
                  "inline-flex min-h-[30px] items-center gap-1.5 rounded-md px-2.5 py-[5px] text-[12px] font-semibold",
                  shownFigures === value ? "bg-surface text-ink shadow-[var(--shadow-1)]" : "text-inkmuted hover:text-ink",
                )}
              >
                <Icon size={14} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        ) : null}
        <div className="bg-surface3 ml-auto inline-flex items-center gap-0.5 rounded-lg p-0.5" role="group" aria-label="Punto de vista">
          {(Object.keys(VIEWS) as ViewName[]).map(name => (
            <button key={name} type="button" className="text-inkmuted hover:text-ink min-h-[30px] rounded-md px-2.5 py-[5px] text-[12px] font-semibold" onClick={() => apiRef.current?.view(name)} disabled={failed}>
              {name}
            </button>
          ))}
        </div>
      </div>
      <div className="bar" style={{ height: 4 }} aria-hidden="true">
        <span ref={progressRef} style={{ width: "0%", background: "var(--brand)", transition: "none" }} />
      </div>

      {config.mistakes.length ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Compara con lo incorrecto">
            <span className="text-inkmuted mr-0.5 text-[11.5px] font-semibold">Compara:</span>
            <button
              type="button"
              aria-pressed={mistake === null}
              onClick={() => setMistake(null)}
              disabled={failed}
              className={cn("btn btn-sm", mistake === null && "border-ok text-ok bg-[color-mix(in_oklab,var(--ok)_10%,transparent)]")}
            >
              <CircleCheck size={14} aria-hidden="true" /> Correcto
            </button>
            {config.mistakes.map(item => (
              <button
                key={item}
                type="button"
                aria-pressed={mistake === item}
                onClick={() => setMistake(current => (current === item ? null : item))}
                disabled={failed}
                className={cn("btn btn-sm", mistake === item && "border-danger text-danger bg-[color-mix(in_oklab,var(--danger)_10%,transparent)]")}
              >
                {mistake === item ? <TriangleAlert size={14} aria-hidden="true" /> : null}
                {MISTAKE_LABELS[item].label}
              </button>
            ))}
          </div>
          <div aria-live="polite">
            {wrong ? (
              <div className="rounded-xl px-3.5 py-3 text-[13px] leading-relaxed" style={{ background: "rgba(220,47,75,.09)", boxShadow: "inset 0 0 0 1px rgba(220,47,75,.26)" }}>
                <div className="text-danger mb-0.5 font-semibold">Incorrecto: {wrong.wrong}</div>
                <p className="text-inksoft">{wrong.why}</p>
                <p className="text-inksoft mt-1"><span className="text-ok font-semibold">Cómo corregirlo: </span>{wrong.fix}</p>
              </div>
            ) : preset ? (
              <p className="text-inksoft text-[12.5px] leading-relaxed"><span className="text-ink font-semibold">{preset.label}. </span>{preset.intent}</p>
            ) : (
              <p className="text-inkmuted text-[12.5px] leading-relaxed">Toca un error para ver cómo se ve mal y vuelve a «Correcto» para comparar.{eyeLineShot ? " En la vista de cámara, los ojos van sobre la línea amarilla." : ""}</p>
            )}
          </div>
        </div>
      ) : null}

      <ol className="flex flex-wrap gap-1.5" aria-label="Pasos de la escena">
        {config.beats.map(item => (
          <li key={item.index}>
            <button
              type="button"
              onClick={() => apiRef.current?.seek(item.index)}
              aria-current={item.index === beatIndex ? "step" : undefined}
              disabled={failed}
              className={cn(
                "btn btn-sm",
                item.index === beatIndex && "border-brand bg-brandsoft text-brandtext",
                item.tone === "error" && "text-danger",
              )}
            >
              Paso {item.index + 1}
            </button>
          </li>
        ))}
      </ol>
      {beat ? (
        <div className="border-line rounded-lg border p-3" aria-live="polite">
          <div className="text-inkmuted mb-1 flex flex-wrap items-center gap-2 text-[11.5px] font-semibold">
            <span>Paso {beatIndex + 1} de {total}{beat.timeLabel ? ` · ${beat.timeLabel}` : ""}</span>
            {beat.tone === "error" ? <span className="chip" style={{ color: "var(--danger)" }}>Error a evitar</span> : null}
            {beat.tone === "ok" ? <span className="chip" style={{ color: "var(--ok)" }}>Así sí</span> : null}
          </div>
          <p className="text-inksoft text-[13px] leading-relaxed">{beat.text}</p>
        </div>
      ) : null}
      <details className="text-[12.5px]">
        <summary className="text-inkmuted cursor-pointer font-semibold">Descripción completa de la escena</summary>
        <dl className="text-inksoft mt-2 space-y-2 leading-relaxed">
          {preset ? <div><dt className="text-ink font-semibold">Intención</dt><dd>{preset.intent}</dd></div> : null}
          <div><dt className="text-ink font-semibold">Entorno</dt><dd>{scene.environment}</dd></div>
          <div><dt className="text-ink font-semibold">Personas</dt><dd>{scene.subjects}</dd></div>
          <div><dt className="text-ink font-semibold">Cámara</dt><dd>{scene.camera}</dd></div>
          <div><dt className="text-ink font-semibold">Luz</dt><dd>{scene.lighting}</dd></div>
          <div>
            <dt className="text-ink font-semibold">Encuadre</dt>
            <dd>Los ojos van sobre la línea horizontal superior de la cuadrícula. Por defecto se muestra en {FORMAT_LABELS.vertical.long}; también se puede ver en {FORMAT_LABELS.horizontal.long}.</dd>
          </div>
        </dl>
      </details>
    </div>
  );
}
