"use client";

/**
 * Visor 3D de una lección («Escena 3D»). Se carga con next/dynamic y ssr:false
 * desde la lección, solo cuando alguien pide verla: three.js nunca entra en el
 * bundle inicial. Renderiza bajo demanda (solo mientras hay animación o
 * interacción), se pausa fuera de pantalla y libera todo al desmontarse.
 */
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AmbientLight,
  BoxGeometry,
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
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  SpotLight,
  TorusGeometry,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { ManualScene3d } from "@/lib/manual";
import {
  ANGLE_LABELS,
  ENVIRONMENT_LABELS,
  LIGHT_LABELS,
  MOVE_LABELS,
  SHOT_LABELS,
  cameraPlacement,
  kelvinToHex,
  parseScene3d,
  type SceneBeat,
  type SceneConfig,
  type SceneLight,
  type SubjectAction,
} from "@/lib/manual-scene";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------ CONSTANTES -- */

const HELPERS = 1; // capa de ayudas: se ven en la vista libre, nunca en la «Vista de cámara»
const CAMERA_COLOR = "#c2410c";
const PATH_COLOR = "#f97316";
const PERSON_A = "#d8c0a0";
const PERSON_B = "#9fb3c8";
const OPERATOR_COLOR = "#b7b0a4";
const JOINT = "#6b5b4b";
const BLEND = 0.45; // segundos de transición entre pasos
const KEY_HEIGHT = 2.05;
const VIEWS = {
  "3/4": [3.1, 2.3, 3.4],
  Lateral: [4.4, 1.6, 0.5],
  Arriba: [0.3, 6.4, 1.2],
} as const;
type ViewName = keyof typeof VIEWS;

export function lightGizmoColor(light: Pick<SceneLight, "kelvin">) {
  if (light.kelvin <= 4200) return "#fb923c";
  if (light.kelvin >= 6200) return "#60a5fa";
  return "#eab308";
}

/* ---------------------------------------------------------------- POSES -- */

type Pose = {
  x: number; z: number; yaw: number; hipsY: number; torsoYaw: number; headYaw: number; headPitch: number;
  lShX: number; lShZ: number; lEl: number; rShX: number; rShZ: number; rEl: number;
  lHip: number; lKnee: number; rHip: number; rKnee: number; product: number; look: number;
};

const BASE_POSE: Pose = {
  x: 0, z: 0, yaw: 0, hipsY: 0.95, torsoYaw: 0, headYaw: 0, headPitch: 0,
  lShX: 0, lShZ: 0.08, lEl: -0.12, rShX: 0, rShZ: -0.08, rEl: -0.12,
  lHip: 0, lKnee: 0, rHip: 0, rKnee: 0, product: 0, look: 1,
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const smooth = (v: number) => { const x = clamp(v, 0, 1); return x * x * (3 - 2 * x); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function gait(pose: Pose, time: number) {
  const phase = time * Math.PI * 2 * 1.6;
  const swing = Math.sin(phase) * 0.42;
  pose.lHip = -swing;
  pose.rHip = swing;
  pose.lKnee = Math.max(0, Math.cos(phase)) * 0.55;
  pose.rKnee = Math.max(0, -Math.cos(phase)) * 0.55;
  pose.lShX = swing * 0.7;
  pose.rShX = -swing * 0.7;
  pose.hipsY = 0.95 - Math.abs(Math.sin(phase)) * 0.02;
}

function seatedLegs(pose: Pose) {
  pose.hipsY = 0.52;
  pose.lHip = pose.rHip = -1.45;
  pose.lKnee = pose.rKnee = 1.45;
}

function actionPose(action: SubjectAction, p: number, time: number, seated: boolean, enterFrom: -1 | 1 = -1): Pose {
  const pose = { ...BASE_POSE };
  pose.torsoYaw = Math.sin(time * 1.3) * 0.012;
  switch (action) {
    case "walkIn": {
      const walking = p < 0.8;
      const facing = enterFrom === -1 ? Math.PI / 2 : -Math.PI / 2;
      pose.x = lerp(enterFrom * 1.7, 0, smooth(p / 0.8));
      pose.yaw = walking ? facing : lerp(facing, 0, smooth((p - 0.8) / 0.2));
      pose.look = walking ? 0 : 1;
      if (walking) gait(pose, time);
      break;
    }
    case "walk":
      pose.z = lerp(-1.3, 0, smooth(p));
      if (p < 0.95) gait(pose, time);
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
      pose.product = 1;
      break;
    case "lookAway":
      pose.headYaw = 0.6;
      pose.look = 0;
      break;
    case "sit":
      seatedLegs(pose);
      pose.lShX = pose.rShX = -0.45;
      pose.lEl = pose.rEl = -0.7;
      break;
    case "point":
      pose.rShX = -1.35;
      pose.rShZ = 0.1;
      pose.rEl = -0.05;
      break;
    case "react":
      pose.lShX = pose.rShX = -0.6;
      pose.lShZ = 0.5;
      pose.rShZ = -0.5;
      pose.lEl = pose.rEl = -1.7;
      pose.headPitch = -0.12;
      pose.hipsY += Math.abs(Math.sin(p * Math.PI * 4)) * 0.015;
      break;
    case "talk":
      pose.rShX = -0.35 + Math.sin(time * 3) * 0.12;
      pose.rEl = -1 + Math.sin(time * 4) * 0.25;
      pose.lShX = -0.2;
      pose.lEl = -0.5;
      pose.headPitch = Math.sin(time * 2.4) * 0.04;
      break;
    default:
      break;
  }
  if (seated && action !== "walkIn" && action !== "walk") seatedLegs(pose);
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
  hips.position.y = 0.95;
  root.add(hips);
  const pelvis = mesh(new CapsuleGeometry(0.12, 0.1, 4, 12), skin);
  pelvis.rotation.z = Math.PI / 2;
  pelvis.position.y = 0.02;
  hips.add(pelvis);
  const spine = new Group();
  spine.position.y = 0.06;
  hips.add(spine);
  const torso = mesh(new CapsuleGeometry(0.15, 0.28, 4, 14), skin);
  torso.position.y = 0.23;
  torso.scale.set(1.15, 1, 0.7);
  spine.add(torso);
  const neck = new Group();
  neck.position.y = 0.47;
  spine.add(neck);
  const neckMesh = mesh(new CylinderGeometry(0.045, 0.05, 0.09, 10), skin);
  neckMesh.position.y = 0.03;
  neck.add(neckMesh);
  const head = new Group();
  head.position.y = 0.08;
  head.rotation.order = "YXZ";
  neck.add(head);
  const skull = mesh(new SphereGeometry(0.105, 20, 16), skin);
  skull.scale.set(0.92, 1.08, 1);
  skull.position.y = 0.05;
  head.add(skull);
  const nose = mesh(new ConeGeometry(0.02, 0.05, 8), joint);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0.04, 0.1);
  head.add(nose);

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
    return { shoulder, elbow };
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
    product: held, shadow,
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
  rig.lElbow.rotation.x = pose.lEl;
  rig.rElbow.rotation.x = pose.rEl;
  rig.lHip.rotation.x = pose.lHip;
  rig.rHip.rotation.x = pose.rHip;
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

/** Cabeza hacia un punto del mundo, dentro de lo que gira un cuello real. */
function aimHead(rig: Rig, pose: Pose, point: Vector3) {
  if (pose.look <= 0) return;
  const origin = new Vector3();
  rig.head.getWorldPosition(origin);
  const worldYaw = Math.atan2(point.x - origin.x, point.z - origin.z);
  const bodyYaw = rig.root.rotation.y + rig.spine.rotation.y;
  let yaw = worldYaw - bodyYaw;
  yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
  const flat = Math.hypot(point.x - origin.x, point.z - origin.z);
  const pitch = -Math.atan2(point.y - origin.y, Math.max(0.1, flat));
  rig.head.rotation.y = lerp(rig.head.rotation.y, clamp(yaw, -1.2, 1.2), pose.look);
  rig.head.rotation.x = lerp(rig.head.rotation.x, clamp(pitch, -0.6, 0.6), pose.look);
}

/* ------------------------------------------------------------- ENTORNO -- */

const ENV_COLORS: Record<SceneConfig["environment"], { floor: string; wall: string }> = {
  estudio: { floor: "#d9d6d1", wall: "#e8e5e0" },
  tienda: { floor: "#c9b59c", wall: "#efe4d6" },
  mesa: { floor: "#cdbfae", wall: "#eee7df" },
  sala: { floor: "#bfa488", wall: "#ece6dc" },
  calle: { floor: "#a7abaf", wall: "#d9cfc2" },
};

function box(w: number, h: number, d: number, color: string, x: number, y: number, z: number) {
  const item = mesh(new BoxGeometry(w, h, d), new MeshStandardMaterial({ color, roughness: 0.85 }));
  item.position.set(x, y, z);
  return item;
}

function buildEnvironment(config: SceneConfig, windowSide: -1 | 1, tablePos: Vector3, hasTable: boolean) {
  const group = new Group();
  const colors = ENV_COLORS[config.environment];
  const floor = mesh(new PlaneGeometry(10, 10), new MeshStandardMaterial({ color: colors.floor, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);
  const back = mesh(new PlaneGeometry(10, 4.2), new MeshStandardMaterial({ color: colors.wall, roughness: 0.95 }));
  back.position.set(0, 2.1, config.environment === "calle" ? -3.4 : -2.6);
  group.add(back);

  if (config.environment !== "calle" && (config.environment === "sala" || config.props.window)) {
    const side = mesh(new PlaneGeometry(6, 4.2), new MeshStandardMaterial({ color: colors.wall, roughness: 0.95 }));
    side.rotation.y = -windowSide * (Math.PI / 2);
    side.position.set(windowSide * 2.6, 2.1, 0.4);
    group.add(side);
  }
  if (config.props.window && config.environment !== "calle") {
    const glass = mesh(new PlaneGeometry(1.1, 1.3), new MeshBasicMaterial({ color: "#fdfbf3" }));
    glass.rotation.y = -windowSide * (Math.PI / 2);
    glass.position.set(windowSide * 2.58, 1.55, 0.5);
    const frame = box(0.04, 1.4, 1.2, "#8a7a6a", windowSide * 2.6, 1.55, 0.5);
    group.add(frame, glass);
  }
  if (config.environment === "tienda" || config.props.shelf) {
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
  if (config.props.sofa) {
    const z = config.subjects.seated ? -0.32 : -1.8;
    group.add(box(1.9, 0.42, 0.8, "#8b6f5a", 0, 0.21, z), box(1.9, 0.5, 0.2, "#7a604d", 0, 0.65, z - 0.4), box(0.2, 0.6, 0.8, "#7a604d", -0.95, 0.3, z), box(0.2, 0.6, 0.8, "#7a604d", 0.95, 0.3, z));
  } else if (config.subjects.seated) {
    group.add(box(0.45, 0.05, 0.45, "#6b7280", 0, 0.46, -0.12));
    for (const [dx, dz] of [[-0.19, -0.31], [0.19, -0.31], [-0.19, 0.07], [0.19, 0.07]]) group.add(box(0.035, 0.45, 0.035, "#4b5563", dx, 0.225, dz));
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

function lightPosition(light: SceneLight, windowSide: -1 | 1): Vector3 {
  const side = light.side === 0 ? 1 : light.side;
  if (light.source === "window") return new Vector3(windowSide * 2.3, 1.6, 0.5);
  if (light.source === "sun") return new Vector3(side * 3.2, 4.2, 1.6);
  if (light.role === "fill") return new Vector3(side * 1.45, 1.35, 1.25);
  if (light.role === "back") return new Vector3(light.side === 0 ? 0.35 : side * 0.7, 2.35, -1.35);
  if (light.role === "background") return new Vector3(0, 1.9, -1.5);
  return new Vector3(side * 1.48, KEY_HEIGHT, 1.48); // 45° del eje de cámara
}

/** Luz principal móvil: la luz y sus ayudas giran alrededor del sujeto cuando un paso lo pide. */
type KeyRig = { light: Group; gizmos: Group; side: -1 | 1 };

function buildLights(config: SceneConfig, scene: Scene, helpers: Group, windowSide: -1 | 1, ringAt: Vector3): KeyRig | null {
  // Base suave para que ninguna pared quede negra; las luces del esquema marcan la diferencia.
  scene.add(new AmbientLight("#ffffff", 0.55), new HemisphereLight("#ffffff", ENV_COLORS[config.environment].floor, 0.6));
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
    const color = new Color(kelvinToHex(light.kelvin));
    const gizmo = lightGizmoColor(light);
    const position = light.source === "ring" ? ringAt.clone() : lightPosition(light, windowSide);
    const target = light.role === "background" ? new Vector3(0, 1.3, -2.6) : new Vector3(0, light.role === "back" ? 1.5 : 1.3, 0);
    const strength = light.intensity * (light.role === "fill" ? 1.1 : 2.2);
    if (light.source === "sun") {
      const sun = new DirectionalLight(color, strength);
      sun.position.copy(position);
      sun.target.position.copy(target);
      scene.add(sun, sun.target);
    } else {
      const wide = light.source === "window" || light.source === "bounce";
      const spot = new SpotLight(color, strength, 0, wide ? 0.95 : 0.6, light.hard ? 0.15 : 0.85, 0);
      spot.position.copy(position);
      spot.target.position.copy(target);
      lightParent.add(spot, spot.target);
    }
    // Ayudas visibles: esfera, cono de luz y línea hasta el sujeto.
    const bulb = mesh(new SphereGeometry(light.role === "key" ? 0.09 : 0.07, 16, 12), new MeshBasicMaterial({ color: gizmo }));
    bulb.position.copy(position);
    const direction = target.clone().sub(position);
    const length = direction.length() * 0.8;
    const coneGeometry = new ConeGeometry(Math.tan(light.hard ? 0.3 : 0.55) * length, length, 28, 1, true);
    coneGeometry.translate(0, -length / 2, 0);
    const cone = mesh(coneGeometry, new MeshBasicMaterial({ color: gizmo, transparent: true, opacity: light.hard ? 0.2 : 0.13, side: DoubleSide, depthWrite: false }));
    cone.position.copy(position);
    cone.quaternion.setFromUnitVectors(new Vector3(0, -1, 0), direction.clone().normalize());
    const beam = new Line(new BufferGeometry().setFromPoints([position, target]), new LineBasicMaterial({ color: gizmo }));
    gizmoParent.add(bulb, cone, beam);
    if (light.source === "softbox" || light.source === "bounce") {
      // Semitransparente: marca dónde va la fuente sin tapar al talento en la vista libre.
      const bounce = light.source === "bounce";
      const panel = mesh(new BoxGeometry(bounce ? 0.5 : 0.45, bounce ? 0.65 : 0.45, 0.03), new MeshBasicMaterial({ color: bounce ? "#f8fafc" : "#fff7ed", transparent: true, opacity: bounce ? 0.4 : 0.6, depthWrite: false }));
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

/* --------------------------------------------------------------- VISOR -- */

type ViewerApi = { play(): void; pause(): void; seek(index: number): void; restart(): void; view(name: ViewName): void; dispose(): void };

function insetRect(width: number, height: number) {
  const h = Math.round(height * 0.46);
  const w = Math.round((h * 9) / 16);
  const margin = 10;
  return { x: width - w - margin, y: height - h - margin, w, h, margin };
}

function createViewer(options: {
  host: HTMLDivElement;
  inset: HTMLDivElement;
  progress: HTMLSpanElement;
  config: SceneConfig;
  onBeat: (index: number) => void;
  onPlaying: (playing: boolean) => void;
}): ViewerApi | null {
  const { host, inset, progress, config, onBeat, onPlaying } = options;
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
  host.prepend(renderer.domElement);

  const dark = document.documentElement.classList.contains("dark");
  const scene = new Scene();
  scene.background = new Color(dark ? "#1d2126" : "#eef0f1");
  const helpers = onHelperLayer(new Group()) as Group;
  scene.add(helpers);

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
  const bases = [{ x: 0, z: 0, yaw: 0 }, { x: 0.78, z: -0.15, yaw: -0.45 }];
  for (const person of people) scene.add(person.root, person.shadow);
  people[0].root.visible = people[0].shadow.visible = !productOnly;
  // Quien graba (maniquí F) aparece detrás del celular, con los brazos hacia él.
  const operator = config.subjects.operator ? buildMannequin(OPERATOR_COLOR, config.props.product) : null;
  if (operator) scene.add(operator.root, operator.shadow);

  // Cámaras: la del celular (inserto 9:16) y un clon corto para dibujar su frustum.
  const shotCam = new PerspectiveCamera(40, 9 / 16, 0.03, 60);
  const frustumCam = new PerspectiveCamera(40, 9 / 16, 0.05, 1);
  const frustum = new CameraHelper(frustumCam);
  frustum.setColors(new Color(CAMERA_COLOR), new Color(CAMERA_COLOR), new Color(CAMERA_COLOR), new Color(CAMERA_COLOR), new Color(CAMERA_COLOR));
  const { rig: cameraRig, tripod } = buildCameraRig();
  helpers.add(frustum, cameraRig, tripod);
  onHelperLayer(helpers);

  const first = cameraPlacement(config.beats[0]?.shot ?? "medio", config.beats[0]?.angle ?? "ojos", config.camera.focalMm);
  const keyRig = buildLights(config, scene, helpers, windowSide, new Vector3(...first.position));
  onHelperLayer(helpers);

  const viewCam = new PerspectiveCamera(45, 1, 0.05, 80);
  viewCam.layers.enable(HELPERS);
  viewCam.position.set(...VIEWS["3/4"]);
  const controls = new OrbitControls(viewCam, renderer.domElement);
  controls.target.set(0, 1, 0.35);
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

  let path: Line | null = null;
  let width = 1, height = 1;
  let time = 0, last = 0, raf = 0;
  let playing = false, visible = true, disposed = false, currentBeat = -1;
  const tmp = new Vector3();

  const holdingAt = (index: number) => {
    const beat = config.beats[index];
    return beat && !productOnly ? actionPose(beat.action, 1, 0, config.subjects.seated).product > 0.5 : false;
  };

  /** Posición del celular para un paso y su avance (0..1). */
  function cameraAt(beat: SceneBeat, p: number, t: number, subjectX: number) {
    const placement = cameraPlacement(beat.shot, beat.angle, beat.focalMm, { seated: config.subjects.seated, productOnTable: hasTable && !holdingAt(beat.index) });
    const position = new Vector3(...placement.position);
    const target = new Vector3(...placement.target);
    // Detalle o cenital de producto: el foco va al producto, en mano o sobre la mesa.
    if (productOnly || beat.shot === "detalle" || (beat.angle === "cenital" && hasTable && !holdingAt(beat.index))) {
      const focus = holdingAt(beat.index) ? new Vector3(0, 1.21, 0.36) : hasTable ? new Vector3(tablePos.x + 0.18, 0.84, tablePos.z) : null;
      if (focus) {
        const offset = position.clone().sub(target);
        target.copy(focus);
        position.copy(focus).add(offset);
      }
    }
    const distance = position.distanceTo(target);
    const e = smooth(p);
    switch (config.camera.move) {
      case "paneo": {
        const yaw = Math.sin(p * Math.PI * 2) * 0.35;
        const aim = target.clone().sub(position).applyAxisAngle(new Vector3(0, 1, 0), yaw);
        target.copy(position).add(aim);
        break;
      }
      case "tilt":
        target.y += Math.sin(p * Math.PI * 2) * 0.35 * distance;
        break;
      case "travelling": {
        const shift = lerp(-0.9, 0.9, e) * Math.max(0.5, distance * 0.8);
        position.x += shift;
        target.x += shift * 0.35;
        break;
      }
      case "pushIn":
      case "pullOut": {
        const [from, to] = config.camera.move === "pushIn" ? [1.4, 0.8] : [0.8, 1.4];
        position.copy(target).add(position.clone().sub(target).multiplyScalar(lerp(from, to, e)));
        break;
      }
      case "orbita": {
        const around = position.clone().sub(target).applyAxisAngle(new Vector3(0, 1, 0), lerp(-0.9, 0.9, e));
        position.copy(target).add(around);
        break;
      }
      case "seguimiento":
        position.x += subjectX * 0.9;
        target.x += subjectX;
        break;
      case "whip": {
        const pulse = Math.exp(-Math.pow((p - 0.5) / 0.06, 2)) * 1.2;
        const aim = target.clone().sub(position).applyAxisAngle(new Vector3(0, 1, 0), pulse);
        target.copy(position).add(aim);
        break;
      }
      default:
        break;
    }
    if (config.camera.handheld) {
      position.x += Math.sin(t * 7.3) * 0.006 + Math.sin(t * 13.1) * 0.003;
      position.y += Math.sin(t * 9.7) * 0.005;
    }
    return { position, target, fov: placement.fov, roll: placement.roll, distance: position.distanceTo(target) };
  }

  function rebuildPath(beat: SceneBeat) {
    if (path) {
      helpers.remove(path);
      path.geometry.dispose();
      (path.material as Material).dispose();
      path = null;
    }
    if (["fija", "mano", "paneo", "tilt", "whip"].includes(config.camera.move)) return;
    const points = Array.from({ length: 41 }, (_, i) => cameraAt(beat, i / 40, 0, 0).position);
    path = new Line(new BufferGeometry().setFromPoints(points), new LineBasicMaterial({ color: PATH_COLOR }));
    path.layers.set(HELPERS);
    helpers.add(path);
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
    const enter = config.subjects.enterFrom;
    let pose = actionPose(beat.action, p, t, config.subjects.seated, enter);
    const previous = index > 0 ? beats[index - 1] : null;
    const blend = previous && local < BLEND ? smooth(local / BLEND) : 1;
    if (previous && blend < 1) pose = blendPose(actionPose(previous.action, 1, t, config.subjects.seated, enter), pose, blend);
    // Cámara, con transición suave entre posiciones
    let cam = cameraAt(beat, p, t, pose.x);
    if (previous && local < 0.8) {
      const from = cameraAt(previous, 1, t, pose.x);
      const k = smooth(local / 0.8);
      cam = { ...cam, position: from.position.lerp(cam.position, k), target: from.target.lerp(cam.target, k), fov: lerp(from.fov, cam.fov, k) };
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
    // Personas
    applyPose(people[0], pose, bases[0], t);
    aimHead(people[0], pose, shotCam.position);
    if (people[1]) {
      const secondAction: SubjectAction = beat.action === "react" ? "react" : beat.action === "talk" || beat.action === "lookLens" ? "lookAway" : beat.action === "sit" ? "sit" : "idle";
      const second = actionPose(secondAction, p, t + 0.7, config.subjects.seated);
      second.look = 1;
      applyPose(people[1], second, bases[1], t);
      people[0].head.getWorldPosition(tmp);
      aimHead(people[1], second, secondAction === "lookAway" ? tmp : shotCam.position);
    }
    if (operator) {
      const back = new Vector3(0, 0, 1).applyQuaternion(shotCam.quaternion).setY(0);
      if (back.lengthSq() < 0.01) back.set(0, 0, 1);
      back.normalize().multiplyScalar(0.38);
      const stand = { ...BASE_POSE, lShX: -1.15, rShX: -1.15, lShZ: -0.2, rShZ: 0.2, lEl: -0.55, rEl: -0.55, look: 0 };
      const x = shotCam.position.x + back.x, z = shotCam.position.z + back.z;
      applyPose(operator, stand, { x, z, yaw: Math.atan2(cam.target.x - x, cam.target.z - z) }, t);
    }
    progress.style.width = `${config.duration ? (t / config.duration) * 100 : 0}%`;
  }

  function render() {
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, width, height);
    renderer.render(scene, viewCam);
    const rect = insetRect(width, height);
    if (rect.w > 20 && rect.x > 0) {
      renderer.setScissorTest(true);
      renderer.setScissor(rect.x, rect.y, rect.w, rect.h);
      renderer.setViewport(rect.x, rect.y, rect.w, rect.h);
      renderer.render(scene, shotCam);
      renderer.setScissorTest(false);
    }
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
    const rect = insetRect(width, height);
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
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      raf = 0;
      resizeObserver.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      controls.removeEventListener("change", schedule);
      controls.dispose();
      frustum.dispose();
      scene.traverse(object => {
        const item = object as Partial<Mesh>;
        item.geometry?.dispose();
        const material = item.material;
        if (Array.isArray(material)) material.forEach(m => m.dispose());
        else material?.dispose();
      });
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) schedule();
  else api.play();
  return api;
}

/* ------------------------------------------------------------ COMPONENTE -- */

export default function SceneViewer({ scene, title }: { scene: ManualScene3d; title: string }) {
  const config = useMemo(() => parseScene3d(scene, title), [scene, title]);
  const hostRef = useRef<HTMLDivElement>(null);
  const insetRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLSpanElement>(null);
  const apiRef = useRef<ViewerApi | null>(null);
  const [beatIndex, setBeatIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current, inset = insetRef.current, progress = progressRef.current;
    if (!host || !inset || !progress) return;
    const api = createViewer({ host, inset, progress, config, onBeat: setBeatIndex, onPlaying: setPlaying });
    if (!api) {
      setFailed(true);
      return;
    }
    apiRef.current = api;
    return () => {
      api.dispose();
      apiRef.current = null;
    };
  }, [config]);

  const beat = config.beats[beatIndex];
  const total = config.beats.length;
  const people = config.subjects.productOnly ? "solo producto" : config.subjects.count === 2 ? "dos personas" : "una persona";
  const description = `Escena 3D de «${title}»: ${ENVIRONMENT_LABELS[config.environment].toLowerCase()}, ${people}, ${beat ? SHOT_LABELS[beat.shot].toLowerCase() : ""}, ${config.lightingLabels.join(", ").toLowerCase()}. Los pasos en texto describen lo mismo.`;

  return (
    <div className="space-y-3">
      <div
        ref={hostRef}
        role="img"
        aria-label={description}
        className="border-line bg-surface2 relative w-full overflow-hidden rounded-xl border"
        style={{ height: "min(50vh, 520px)", minHeight: 260 }}
      >
        {failed ? (
          <div className="text-inkmuted grid h-full place-items-center p-6 text-center text-[13px]">
            Este navegador no puede mostrar la escena 3D. Sigue los pasos en texto: describen lo mismo.
          </div>
        ) : null}
        <div className="pointer-events-none absolute top-2.5 left-2.5 flex max-w-[calc(100%-7.5rem)] flex-wrap gap-1 sm:max-w-[60%]" aria-hidden="true">
          {beat ? (
            <>
              <span className="bg-surface/90 text-ink rounded-md px-2 py-0.5 text-[11px] font-semibold shadow-[var(--shadow-1)]">{SHOT_LABELS[beat.shot]}</span>
              <span className="bg-surface/90 text-inksoft rounded-md px-2 py-0.5 text-[11px] font-semibold shadow-[var(--shadow-1)]">{beat.focalMm} mm · {ANGLE_LABELS[beat.angle]}</span>
              <span className="bg-surface/90 text-inksoft rounded-md px-2 py-0.5 text-[11px] font-semibold shadow-[var(--shadow-1)]">{MOVE_LABELS[config.camera.move]}</span>
            </>
          ) : null}
        </div>
        <div ref={insetRef} className="pointer-events-none absolute rounded-md ring-2 ring-[#c2410c]" aria-hidden="true">
          <span className="absolute top-full left-1/2 mt-1 -translate-x-1/2 rounded bg-[#c2410c] px-1.5 py-px text-[9.5px] font-bold whitespace-nowrap text-white">Vista de cámara</span>
          <span className="absolute border border-dashed border-[#c2410c]/80" style={{ top: "10%", bottom: "22%", left: "6%", right: "13%" }} title="Zona segura" />
          <span className="absolute inset-x-0 border-t border-black/15" style={{ top: "33.3%" }} />
          <span className="absolute inset-x-0 border-t border-black/15" style={{ top: "66.6%" }} />
          <span className="absolute inset-y-0 border-l border-black/15" style={{ left: "33.3%" }} />
          <span className="absolute inset-y-0 border-l border-black/15" style={{ left: "66.6%" }} />
        </div>
        <div className="pointer-events-none absolute bottom-2 left-2.5 hidden flex-wrap gap-x-3 gap-y-1 sm:flex" aria-hidden="true">
          <span className="bg-surface/90 text-inksoft flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10.5px] font-semibold"><span className="dot" style={{ background: CAMERA_COLOR }} />Cámara y encuadre</span>
          {config.lights.map(light => (
            <span key={light.role} className="bg-surface/90 text-inksoft flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10.5px] font-semibold">
              <span className="dot" style={{ background: lightGizmoColor(light) }} />{LIGHT_LABELS[light.role]} · {light.kelvin} K
            </span>
          ))}
        </div>
      </div>

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
        <div className="bg-surface3 ml-auto inline-flex items-center gap-0.5 rounded-lg p-0.5" role="group" aria-label="Punto de vista">
          {(Object.keys(VIEWS) as ViewName[]).map(name => (
            <button key={name} type="button" className="text-inkmuted hover:text-ink rounded-md px-2.5 py-[5px] text-[12px] font-semibold" onClick={() => apiRef.current?.view(name)} disabled={failed}>
              {name}
            </button>
          ))}
        </div>
      </div>
      <div className="bar" style={{ height: 4 }} aria-hidden="true">
        <span ref={progressRef} style={{ width: "0%", background: "var(--brand)", transition: "none" }} />
      </div>

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
          <div><dt className="text-ink font-semibold">Entorno</dt><dd>{scene.environment}</dd></div>
          <div><dt className="text-ink font-semibold">Personas</dt><dd>{scene.subjects}</dd></div>
          <div><dt className="text-ink font-semibold">Cámara</dt><dd>{scene.camera}</dd></div>
          <div><dt className="text-ink font-semibold">Luz</dt><dd>{scene.lighting}</dd></div>
        </dl>
      </details>
    </div>
  );
}
