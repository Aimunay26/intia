import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { AnimationMixer, Bone, Group, Object3D, Quaternion, Vector3, type AnimationClip } from "three";

import type { HuesoPersonaje, ModeloPersonaje } from "../src/lib/manual-3d";
import {
  HUESOS,
  PALM_OFFSET,
  PRODUCT_HALF_WIDTH,
  SIDE_STRIDE,
  STRIDE,
  WALK_CLIP_WEIGHT,
  blendCharacterPose,
  calibrateRig,
  castCharacters,
  castIds,
  characterActionPose,
  characterEyeHeight,
  clipOverlay,
  headLocals,
  legsLive,
  measureClipYaw,
  measureWalkStride,
  parseManifest,
  productHold,
  resolveBoneMap,
  stepFeet,
  solveArmLive,
  solvePose,
  solveTwoBone,
  travelInFrame,
  type BoneMap,
  type CharacterPose,
  type CharacterState,
  type PoseSolution,
  type RigCalibration,
} from "../src/lib/manual-characters";

/**
 * Personajes 3D del visor: manifiesto, mapa de huesos, poses procedurales (correctas e
 * incorrectas), IK, marcha sincronizada y carga real de los GLB desde disco.
 *
 * Correr con: npx tsx --test tests/manual-characters.test.mts
 */

const MODELS_DIR = path.resolve(import.meta.dirname, "..", "src/content/modelos-3d");
const hasModels = fs.existsSync(path.join(MODELS_DIR, "manifest.json"));

/* ------------------------------------------------------- ESQUELETO SINTÉTICO -- */

type Joint = { name: string; parent: string | null; at: [number, number, number] };

/** Humanoide en A-pose, pies en y=0, mirando a +Z (su izquierda es +X). Incluye huesos intermedios que no se posan. */
function joints(names: Record<HuesoPersonaje, string>, extra: { root: string; spine2: string; clavL: string; clavR: string; fingerL: string; fingerR: string; thumbL: string; thumbR: string }): Joint[] {
  const side = (s: 1 | -1, list: [string, string | null, [number, number, number]][]) => list.map(([name, parent, [x, y, z]]) => ({ name, parent, at: [x * s, y, z] as [number, number, number] }));
  return [
    { name: extra.root, parent: null, at: [0, 0.95, 0] },
    { name: names.pelvis, parent: extra.root, at: [0, 1.0, 0] },
    { name: names.spine, parent: names.pelvis, at: [0, 1.12, 0.01] },
    { name: extra.spine2, parent: names.spine, at: [0, 1.19, 0.01] },
    { name: names.chest, parent: extra.spine2, at: [0, 1.26, 0] },
    { name: names.neck, parent: names.chest, at: [0, 1.42, -0.03] },
    { name: names.head, parent: names.neck, at: [0, 1.52, -0.02] },
    ...side(1, [
      [extra.clavL, names.chest, [0.03, 1.37, -0.02]],
      [names.upperArmL, extra.clavL, [0.13, 1.38, -0.05]],
      [names.lowerArmL, names.upperArmL, [0.29, 1.19, -0.06]],
      [names.handL, names.lowerArmL, [0.44, 1.02, -0.01]],
      [extra.fingerL, names.handL, [0.48, 0.95, 0.02]],
      [extra.thumbL, names.handL, [0.45, 1.0, 0.04]],
      [names.thighL, names.pelvis, [0.09, 0.97, 0]],
      [names.calfL, names.thighL, [0.13, 0.54, -0.02]],
      [names.footL, names.calfL, [0.16, 0.1, -0.05]],
    ]),
    ...side(-1, [
      [extra.clavR, names.chest, [0.03, 1.37, -0.02]],
      [names.upperArmR, extra.clavR, [0.13, 1.38, -0.05]],
      [names.lowerArmR, names.upperArmR, [0.29, 1.19, -0.06]],
      [names.handR, names.lowerArmR, [0.44, 1.02, -0.01]],
      [extra.fingerR, names.handR, [0.48, 0.95, 0.02]],
      [extra.thumbR, names.handR, [0.45, 1.0, 0.04]],
      [names.thighR, names.pelvis, [0.09, 0.97, 0]],
      [names.calfR, names.thighR, [0.13, 0.54, -0.02]],
      [names.footR, names.calfR, [0.16, 0.1, -0.05]],
    ]),
  ];
}

const UE_NAMES: Record<HuesoPersonaje, string> = {
  pelvis: "pelvis", spine: "spine_03", chest: "spine_05", neck: "neck_01", head: "head",
  upperArmL: "upperarm_l", lowerArmL: "lowerarm_l", handL: "hand_l", upperArmR: "upperarm_r", lowerArmR: "lowerarm_r", handR: "hand_r",
  thighL: "thigh_l", calfL: "calf_l", footL: "foot_l", thighR: "thigh_r", calfR: "calf_r", footR: "foot_r",
};
const BIPED_NAMES: Record<HuesoPersonaje, string> = {
  pelvis: "Bip001_Pelvis", spine: "Bip001_Spine", chest: "Bip001_Spine1", neck: "Bip001_Neck", head: "Bip001_Head",
  upperArmL: "Bip001_L_UpperArm", lowerArmL: "Bip001_L_Forearm", handL: "Bip001_L_Hand", upperArmR: "Bip001_R_UpperArm", lowerArmR: "Bip001_R_Forearm", handR: "Bip001_R_Hand",
  thighL: "Bip001_L_Thigh", calfL: "Bip001_L_Calf", footL: "Bip001_L_Foot", thighR: "Bip001_R_Thigh", calfR: "Bip001_R_Calf", footR: "Bip001_R_Foot",
};

/** Generador determinista para orientar los huesos al azar. */
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

/**
 * Arma el esqueleto con las mismas posiciones pero ejes locales distintos: «ue» orienta cada hueso con
 * su X hacia el hijo (como UE), «biped» con rotaciones al azar. `scale` imita el nodo raíz escalado del GLB.
 */
function buildRig(kind: "ue" | "biped", scale = 1) {
  const names = kind === "ue" ? UE_NAMES : BIPED_NAMES;
  const extra = kind === "ue"
    ? { root: "root", spine2: "spine_04", clavL: "clavicle_l", clavR: "clavicle_r", fingerL: "middle_metacarpal_l", fingerR: "middle_metacarpal_r", thumbL: "thumb_01_l", thumbR: "thumb_01_r" }
    : { root: "Bip001", spine2: "Bip001_Spine_extra", clavL: "Bip001_L_Clavicle", clavR: "Bip001_R_Clavicle", fingerL: "Bip001_L_Finger2", fingerR: "Bip001_R_Finger2", thumbL: "Bip001_L_Finger0", thumbR: "Bip001_R_Finger0" };
  const list = joints(names, extra);
  const next = random(kind === "ue" ? 7 : 1234);
  const worldRot = new Map<string, Quaternion>();
  const worldPos = new Map<string, Vector3>();
  for (const joint of list) {
    worldPos.set(joint.name, new Vector3(...joint.at));
    const child = list.find(item => item.parent === joint.name);
    let q: Quaternion;
    if (kind === "ue" && child) {
      const along = new Vector3(...child.at).sub(new Vector3(...joint.at)).normalize();
      q = new Quaternion().setFromUnitVectors(new Vector3(1, 0, 0), along).multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), next() * Math.PI * 2));
    } else {
      q = new Quaternion().setFromAxisAngle(new Vector3(next() - 0.5, next() - 0.5, next() - 0.5).normalize(), next() * Math.PI * 2);
    }
    worldRot.set(joint.name, q);
  }
  const root = new Group();
  const armature = new Object3D();
  armature.name = "Armature";
  armature.scale.setScalar(scale);
  root.add(armature);
  const bones = new Map<string, Bone>();
  for (const joint of list) {
    const bone = new Bone();
    bone.name = joint.name;
    const parentRot = joint.parent ? worldRot.get(joint.parent)! : new Quaternion();
    const parentPos = joint.parent ? worldPos.get(joint.parent)! : new Vector3();
    const inv = parentRot.clone().invert();
    bone.position.copy(worldPos.get(joint.name)!.clone().sub(parentPos).applyQuaternion(inv));
    bone.quaternion.copy(inv.multiply(worldRot.get(joint.name)!));
    (joint.parent ? bones.get(joint.parent)! : armature).add(bone);
    bones.set(joint.name, bone);
  }
  // Con escala en el nodo, todas las posiciones locales se expresan en unidades del nodo.
  if (scale !== 1) for (const bone of bones.values()) bone.position.divideScalar(scale);
  root.updateMatrixWorld(true);
  const spec = { huesos: names, ojos: { altura: 1.56, adelante: 0.09 } };
  return { root, names, spec, cal: calibrateRig(root, spec) };
}

function applySolution(rig: { root: Object3D; names: Record<HuesoPersonaje, string> }, solution: PoseSolution) {
  for (const key of HUESOS) rig.root.getObjectByName(rig.names[key])!.quaternion.copy(solution.local[key]);
  rig.root.getObjectByName(rig.names.pelvis)!.position.copy(solution.pelvisPosition);
  rig.root.updateMatrixWorld(true);
}

function worldOf(rig: { root: Object3D; names: Record<HuesoPersonaje, string> }, key: HuesoPersonaje) {
  const inv = rig.root.matrixWorld.clone().invert();
  return rig.root.getObjectByName(rig.names[key])!.getWorldPosition(new Vector3()).applyMatrix4(inv);
}

const BODY_OK = { elbows: "pegados", feet: "adelantado" } as const;
const state = (partial: Partial<CharacterState>): CharacterState => ({ action: "idle", p: 1, time: 0, seated: false, body: BODY_OK, ...partial });

const STATES: [string, CharacterState][] = [
  ["correcta", state({})],
  ["codos abiertos", state({ body: { elbows: "abiertos", feet: "adelantado" } })],
  ["pies juntos", state({ body: { elbows: "pegados", feet: "juntos" } })],
  ["muestra producto", state({ action: "showProduct" })],
  ["sentada", state({ action: "idle", seated: true })],
  ["sentada con codos abiertos", state({ action: "sit", seated: true, body: { elbows: "abiertos", feet: "adelantado" } })],
  ["señala", state({ action: "point" })],
  ["reacciona", state({ action: "react", p: 0.3 })],
  ["habla", state({ action: "talk", time: 1.3 })],
  ["habla con codos abiertos", state({ action: "talk", time: 1.3, body: { elbows: "abiertos", feet: "adelantado" } })],
  ["mira fuera", state({ action: "lookAway" })],
  ["gira", state({ action: "turn", p: 0.5 })],
  ["camina", state({ action: "walk", p: 0.5, gait: { distance: 0.47, speed: 0.9 } })],
  ["camina rígida", state({ action: "walkIn", p: 0.4, gait: { distance: 0.8, speed: 0.9 }, body: { elbows: "pegados", feet: "juntos" } })],
];

/** Flexión entre dos segmentos (0 = recto), en grados. */
function bendDeg(a: Vector3, b: Vector3, c: Vector3) {
  const u = b.clone().sub(a).normalize();
  const v = c.clone().sub(b).normalize();
  return (Math.acos(Math.min(1, Math.max(-1, u.dot(v)))) * 180) / Math.PI;
}

/** El codo y la rodilla se doblan siempre hacia su lado natural sobre la bisagra posada. */
function assertHinges(cal: RigCalibration, solution: PoseSolution, label: string) {
  for (const side of ["L", "R"] as const) {
    for (const limb of [cal.arm[side], cal.leg[side]]) {
      const hinge = limb.hinge.clone().applyQuaternion(solution.delta[limb.upper]);
      const upper = solution.pos[limb.lower].clone().sub(solution.pos[limb.upper]).normalize();
      const lower = solution.pos[limb.end].clone().sub(solution.pos[limb.lower]).normalize();
      assert.ok(new Vector3().crossVectors(upper, lower).dot(hinge) > -0.02, `${label}: ${limb.lower} doblado al revés`);
    }
  }
}

/* ------------------------------------------------------------ MANIFIESTO -- */

const VALID: ModeloPersonaje = {
  id: "actriz-1",
  nombre: "Actriz",
  archivo: "actriz-1.glb",
  altura: 1.7,
  rig: "UE",
  huesos: UE_NAMES,
  ojos: { altura: 1.57, adelante: 0.09 },
  notas: "",
};

test("manifiesto: valida estructura, lista cerrada de archivos y huesos completos", () => {
  const parsed = parseManifest({ version: 1, personajes: [VALID] });
  assert.equal(parsed.personajes[0].id, "actriz-1");
  assert.throws(() => parseManifest(null), /inválido/);
  assert.throws(() => parseManifest({ version: 1, personajes: [{ ...VALID, archivo: "../.env" }] }), /archivo no permitido/);
  assert.throws(() => parseManifest({ version: 1, personajes: [{ ...VALID, id: "hulk" }] }), /id desconocido/);
  const { head: _head, ...sinCabeza } = UE_NAMES;
  assert.throws(() => parseManifest({ version: 1, personajes: [{ ...VALID, huesos: sinCabeza }] }), /hueso head/);
  assert.throws(() => parseManifest({ version: 1, personajes: [{ ...VALID, ojos: { altura: 2.4, adelante: 0.1 } }] }), /fuera de rango/);
  assert.throws(() => parseManifest({ version: 1, personajes: [VALID, VALID] }), /repetidos/);
});

test("reparto: operador = camarógrafo, sujeto = actriz 1, segunda persona = actriz 2, nunca más de 3", () => {
  assert.deepEqual(castCharacters({ count: 1, operator: false, productOnly: false }), { subject: "actriz-1", second: null, operator: null });
  assert.deepEqual(castCharacters({ count: 2, operator: true, productOnly: false }), { subject: "actriz-1", second: "actriz-2", operator: "camarografo" });
  assert.deepEqual(castIds(castCharacters({ count: 1, operator: true, productOnly: true })), ["camarografo"]);
  assert.ok(castIds(castCharacters({ count: 2, operator: true, productOnly: false })).length <= 3);
});

/* ---------------------------------------------------------- MAPA DE HUESOS -- */

test("mapa de huesos: rechaza nombres inexistentes, nodos que no son huesos y claves repetidas", () => {
  const rig = buildRig("ue");
  assert.doesNotThrow(() => resolveBoneMap(rig.root, UE_NAMES));
  assert.throws(() => resolveBoneMap(rig.root, { ...UE_NAMES, head: "cabeza_que_no_existe" }), /Huesos inexistentes.*head.*cabeza_que_no_existe/);
  assert.throws(() => resolveBoneMap(rig.root, { ...UE_NAMES, spine: "Armature" }), /Huesos inexistentes.*spine/);
  assert.throws(() => resolveBoneMap(rig.root, { ...UE_NAMES, handR: "hand_l" }), /repetidos/);
  // Con nombres del Biped sobre un rig UE falta todo: el error los lista.
  assert.throws(() => resolveBoneMap(rig.root, BIPED_NAMES), /Bip001_Pelvis/);
});

test("calibración: bisagras del codo y la rodilla salen de las posiciones, no de los ejes locales", () => {
  for (const kind of ["ue", "biped"] as const) {
    const { cal } = buildRig(kind);
    for (const side of ["L", "R"] as const) {
      // Codo: perpendicular al brazo y casi horizontal (−X en los dos lados); rodilla: +X.
      assert.ok(cal.arm[side].hinge.x < -0.6, `${kind} codo ${side}`);
      assert.ok(cal.leg[side].hinge.x > 0.9, `${kind} rodilla ${side}`);
      assert.ok(Math.abs(cal.arm[side].hinge.dot(cal.arm[side].upperDir)) < 1e-9);
      assert.ok(cal.fingers[side] && cal.palm[side], `${kind} mano ${side}`);
    }
    assert.ok(Math.abs(cal.ankleY - 0.1) < 1e-9);
    assert.ok(Math.abs(cal.eye.y - 1.56) < 1e-9);
  }
});

/* ------------------------------------------------------------------ POSES -- */

test("poses: dos rigs con los mismos huesos y ejes locales distintos quedan en la misma postura", () => {
  const ue = buildRig("ue");
  const biped = buildRig("biped", 1.02);
  for (const [label, item] of STATES) {
    const pose = characterActionPose(item);
    const a = solvePose(ue.cal, pose);
    const b = solvePose(biped.cal, pose);
    applySolution(ue, a);
    applySolution(biped, b);
    for (const key of HUESOS) {
      const pa = worldOf(ue, key);
      const pb = worldOf(biped, key);
      assert.ok(pa.distanceTo(pb) < 1e-6, `${label}: ${key} difiere entre rigs (${pa.distanceTo(pb)})`);
      // La cinemática directa del solver coincide con la de three.js.
      assert.ok(pa.distanceTo(a.pos[key]) < 1e-6, `${label}: FK de ${key}`);
      assert.ok(pb.distanceTo(b.pos[key]) < 1e-6, `${label}: FK (biped) de ${key}`);
    }
    for (const q of Object.values(a.local)) assert.ok(Number.isFinite(q.x + q.y + q.z + q.w) && Math.abs(q.length() - 1) < 1e-9, label);
    assertHinges(ue.cal, a, label);
  }
});

test("postura correcta vs CODOS_ABIERTOS: codos pegados al cuerpo y antebrazos hacia adelante", () => {
  const { cal } = buildRig("biped");
  const ok = solvePose(cal, characterActionPose(state({})));
  const wrong = solvePose(cal, characterActionPose(state({ body: { elbows: "abiertos", feet: "adelantado" } })));
  for (const side of ["L", "R"] as const) {
    const elbow = side === "L" ? "lowerArmL" : "lowerArmR";
    const hand = side === "L" ? "handL" : "handR";
    const shoulder = side === "L" ? "upperArmL" : "upperArmR";
    // Distancia lateral del codo al eje del torso (el error es abrirlo).
    const lateral = (solution: PoseSolution) => Math.abs(solution.pos[elbow].x - solution.pos.chest.x);
    assert.ok(lateral(wrong) - lateral(ok) > 0.08, `codo ${side}: ${lateral(ok).toFixed(3)} vs ${lateral(wrong).toFixed(3)}`);
    // Codo pegado: cerca de la vertical del hombro.
    assert.ok(Math.abs(ok.pos[elbow].x - ok.pos[shoulder].x) < 0.06);
    // Antebrazo levemente hacia adelante: la mano delante del cuerpo, entre el pecho y la cintura.
    assert.ok(ok.pos[hand].z > ok.pos.chest.z + 0.12, `mano ${side} adelante`);
    assert.ok(ok.pos[hand].y < ok.pos.chest.y && ok.pos[hand].y > ok.pos.pelvis.y - 0.05, `mano ${side} a la altura de la cintura`);
    // En jarra: la mano en la cadera, a los costados y no delante.
    assert.ok(wrong.pos[hand].z < wrong.pos.chest.z + 0.05);
  }
});

test("postura correcta vs PIES_JUNTOS: un pie adelantado ≥ 0,12 m; juntos < 0,12 m; siempre sobre el piso", () => {
  for (const kind of ["ue", "biped"] as const) {
    const { cal } = buildRig(kind);
    const ok = solvePose(cal, characterActionPose(state({})));
    const together = solvePose(cal, characterActionPose(state({ body: { elbows: "pegados", feet: "juntos" } })));
    assert.ok(ok.pos.footL.z - ok.pos.footR.z >= 0.12, `${kind}: pie adelantado ${(ok.pos.footL.z - ok.pos.footR.z).toFixed(3)}`);
    const gap = Math.hypot(together.pos.footL.x - together.pos.footR.x, together.pos.footL.z - together.pos.footR.z);
    assert.ok(gap < 0.12, `${kind}: pies juntos ${gap.toFixed(3)}`);
    for (const solution of [ok, together]) {
      assert.ok(Math.abs(solution.pos.footL.y - cal.ankleY) < 0.004 && Math.abs(solution.pos.footR.y - cal.ankleY) < 0.004, `${kind}: pies en el piso`);
    }
    // Rodillas: sueltas (algo flexionadas) en la correcta y rectas con los pies juntos.
    const knee = (solution: PoseSolution) => bendDeg(solution.pos.thighR, solution.pos.calfR, solution.pos.footR);
    assert.ok(knee(ok) > 6 && knee(ok) < 30, `${kind}: rodilla ${knee(ok).toFixed(1)}°`);
    assert.ok(knee(together) < 6, `${kind}: rodilla rígida ${knee(together).toFixed(1)}°`);
    assert.ok(ok.pos.pelvis.y < together.pos.pelvis.y, `${kind}: la cadera baja con las rodillas sueltas`);
  }
});

test("sentada: caderas y rodillas a unos 90° sobre el asiento, pies en el piso", () => {
  const { cal } = buildRig("ue");
  const seated = solvePose(cal, characterActionPose(state({ seated: true })), { seatTop: 0.485 });
  for (const side of ["L", "R"] as const) {
    const [thigh, calf, foot] = side === "L" ? (["thighL", "calfL", "footL"] as const) : (["thighR", "calfR", "footR"] as const);
    assert.ok(Math.abs(seated.pos[thigh].y - (0.485 + 0.085)) < 0.01, "cadera a la altura del asiento");
    const thighDir = seated.pos[calf].clone().sub(seated.pos[thigh]).normalize();
    assert.ok(Math.abs(thighDir.y) < 0.3 && thighDir.z > 0.9, "muslo horizontal hacia adelante");
    const knee = bendDeg(seated.pos[thigh], seated.pos[calf], seated.pos[foot]);
    assert.ok(knee > 70 && knee < 110, `rodilla ${knee.toFixed(0)}°`);
    assert.ok(Math.abs(seated.pos[foot].y - cal.ankleY) < 0.004, "pie en el piso");
  }
});

test("muestra producto: manos a la altura del pecho y antebrazos hacia la cámara", () => {
  const { cal } = buildRig("biped");
  const solution = solvePose(cal, characterActionPose(state({ action: "showProduct" })));
  for (const side of ["L", "R"] as const) {
    const [elbow, hand] = side === "L" ? (["lowerArmL", "handL"] as const) : (["lowerArmR", "handR"] as const);
    const forearm = solution.pos[hand].clone().sub(solution.pos[elbow]).normalize();
    assert.ok(forearm.z > 0.6, `antebrazo ${side} hacia la cámara (${forearm.z.toFixed(2)})`);
    assert.ok(solution.pos[hand].y > solution.pos[elbow].y && solution.pos[hand].y > solution.pos.chest.y - 0.1, `mano ${side} a la altura del pecho`);
  }
  const hold = productHold(solution);
  assert.ok(hold.z > 0.2 && Math.abs(hold.x) < 0.02, "el producto va delante, al centro");
});

test("muestra producto: las palmas quedan en las caras del producto, enfrentadas y sin hundirse", () => {
  for (const kind of ["ue", "biped"] as const) {
    const { cal } = buildRig(kind, kind === "biped" ? 1.02 : 1);
    for (const [product, half] of Object.entries(PRODUCT_HALF_WIDTH)) {
      const solution = solvePose(cal, characterActionPose(state({ action: "showProduct" })), { holdHalfWidth: half });
      const toChest = solution.delta.chest.clone().invert();
      const inChest = (point: Vector3) => point.clone().sub(solution.pos.chest).applyQuaternion(toChest);
      const gripL = inChest(solution.grip.L);
      const gripR = inChest(solution.grip.R);
      // Cada palma a un costado del producto: su medio ancho más el grosor de la mano (±1 cm).
      assert.ok(Math.abs(gripL.x - (half + PALM_OFFSET)) < 0.01, `${kind} ${product}: palma izquierda en ${gripL.x.toFixed(3)}`);
      assert.ok(Math.abs(gripR.x + (half + PALM_OFFSET)) < 0.01, `${kind} ${product}: palma derecha en ${gripR.x.toFixed(3)}`);
      // Las palmas se miran: la izquierda hacia −X y la derecha hacia +X (marco del pecho).
      const palm = (side: "L" | "R") => cal.palm[side]!.clone().applyQuaternion(solution.delta[side === "L" ? "handL" : "handR"]).applyQuaternion(toChest);
      assert.ok(palm("L").x < -0.7 && palm("R").x > 0.7, `${kind} ${product}: palmas enfrentadas (${palm("L").x.toFixed(2)}, ${palm("R").x.toFixed(2)})`);
      // El producto va entre ellas, al centro y delante del pecho.
      const hold = inChest(productHold(solution));
      assert.ok(Math.abs(hold.x) < 0.005 && hold.z > 0.2, `${kind} ${product}: producto en ${hold.toArray().map(v => v.toFixed(3))}`);
    }
  }
  // Al pasar de otra acción, las manos se abren de a poco: a mitad de camino quedan entre las dos posturas.
  const { cal } = buildRig("ue");
  const from = solvePose(cal, characterActionPose(state({})));
  const to = solvePose(cal, characterActionPose(state({ action: "showProduct" })));
  const mid = solvePose(cal, blendCharacterPose(characterActionPose(state({})), characterActionPose(state({ action: "showProduct" })), 0.5));
  const gap = (solution: PoseSolution) => solution.pos.handL.distanceTo(solution.pos.handR);
  assert.ok(gap(mid) > Math.min(gap(from), gap(to)) - 0.02 && gap(mid) < Math.max(gap(from), gap(to)) + 0.02, `a mitad: ${gap(mid).toFixed(3)}`);
});

test("travelInFrame y pasos cortos: el pie apoyado no patina (de costado o en diagonal) y quieto no se mueve", () => {
  // Mirando hacia −Z (yaw = π), avanzar hacia +X del mundo es ir hacia su derecha.
  const side = travelInFrame({ x: 1, z: 0 }, Math.PI);
  assert.ok(Math.abs(side.frontal) < 1e-9 && Math.abs(side.lateral + 1) < 1e-9);
  const back = travelInFrame({ x: 0, z: 1 }, Math.PI);
  assert.ok(Math.abs(back.frontal + 1) < 1e-9 && Math.abs(back.lateral) < 1e-9);
  const diagonal = { x: Math.cos(0.4), z: Math.sin(0.4) };
  for (const way of [undefined, diagonal]) {
    const dir = way ?? { x: 1, z: 0 };
    for (const direction of [1, -1] as const) {
      for (const [key, offset] of [["L", 0], ["R", 0.5]] as const) {
        let drift = 0;
        let planted: Vector3 | null = null;
        for (let i = 0; i <= 400; i += 1) {
          const distance = direction * (i / 400) * SIDE_STRIDE * 2;
          const foot = stepFeet(distance, 1, way)[key];
          const u = (Math.abs(distance) / SIDE_STRIDE + offset) % 1;
          // La raíz se desplaza lo recorrido en esa dirección.
          const world = foot.clone().add(new Vector3(dir.x * distance, 0, dir.z * distance));
          if (u < 0.58) {
            planted ??= world;
            drift = Math.max(drift, world.distanceTo(planted));
            assert.equal(foot.y, 0);
          } else planted = null;
        }
        assert.ok(drift < 0.005, `pie ${key} (${direction}, ${way ? "diagonal" : "costado"}) patina ${drift.toFixed(4)} m`);
      }
    }
  }
  const still = stepFeet(0.3, 0);
  assert.ok(still.L.length() < 1e-12 && still.R.length() < 1e-12);
});

test("piernas sobre un clip: bajar la cadera flexiona las rodillas; subirla las estira; tobillos y pies quietos", () => {
  for (const kind of ["ue", "biped"] as const) {
    const rig = buildRig(kind, kind === "biped" ? 1.02 : 1);
    const bones = resolveBoneMap(rig.root, rig.names);
    const start = solvePose(rig.cal, characterActionPose(state({})));
    const measure = (drop: number) => {
      // Parte siempre de la misma pose, como la dejaría el clip en cada cuadro.
      applySolution(rig, start);
      const ankles = { L: worldOf(rig, "footL"), R: worldOf(rig, "footR") };
      const feet = { L: bones.footL.getWorldQuaternion(new Quaternion()), R: bones.footR.getWorldQuaternion(new Quaternion()) };
      const pelvis = worldOf(rig, "pelvis").y;
      const applied = legsLive(rig.root, bones, rig.cal, { drop });
      rig.root.updateMatrixWorld(true);
      for (const side of ["L", "R"] as const) {
        const foot = side === "L" ? "footL" : "footR";
        assert.ok(worldOf(rig, foot).distanceTo(ankles[side]) < 1e-4, `${kind} ${drop}: tobillo ${side} se movió`);
        assert.ok(bones[foot].getWorldQuaternion(new Quaternion()).angleTo(feet[side]) < 1e-5, `${kind} ${drop}: pie ${side} giró`);
        // La rodilla se dobla hacia adelante (+Z), nunca hacia atrás.
        const [thigh, calf] = side === "L" ? (["thighL", "calfL"] as const) : (["thighR", "calfR"] as const);
        const mid = worldOf(rig, thigh).lerp(worldOf(rig, foot), 0.5);
        assert.ok(worldOf(rig, calf).z > mid.z - 1e-3, `${kind} ${drop}: rodilla ${side} hacia atrás`);
      }
      const knees = (["R", "L"] as const).map(side => {
        const [thigh, calf, foot] = side === "L" ? (["thighL", "calfL", "footL"] as const) : (["thighR", "calfR", "footR"] as const);
        return bendDeg(worldOf(rig, thigh), worldOf(rig, calf), worldOf(rig, foot));
      });
      return { applied, knees, lowered: pelvis - worldOf(rig, "pelvis").y };
    };
    const clip = measure(0);
    const tucked = measure(0.055);
    assert.equal(tucked.applied, 0.055);
    assert.ok(Math.abs(tucked.lowered - 0.055) < 1e-6, `${kind}: la cadera bajó ${tucked.lowered.toFixed(4)}`);
    for (const i of [0, 1]) assert.ok(tucked.knees[i] > clip.knees[i] + 10, `${kind}: rodilla ${clip.knees[i].toFixed(1)}° → ${tucked.knees[i].toFixed(1)}°`);
    const rigid = measure(-0.2);
    assert.ok(rigid.applied < 0 && rigid.applied > -0.2, `${kind}: subir se limita (${rigid.applied.toFixed(3)})`);
    assert.ok(Math.min(...rigid.knees) < 6, `${kind}: pierna rígida ${Math.min(...rigid.knees).toFixed(1)}°`);
  }
});

test("marcha: la fase sigue a los metros recorridos y el pie apoyado no patina", () => {
  const { cal } = buildRig("ue");
  const speed = 1.0;
  let drift = 0;
  let planted: number | null = null;
  let lastPhase = -1;
  for (let i = 0; i <= 240; i += 1) {
    const distance = (i / 240) * STRIDE * 2;
    const solution = solvePose(cal, characterActionPose(state({ action: "walk", gait: { distance, speed } })));
    const phase = (distance / STRIDE) % 1;
    const onGround = solution.pos.footL.y < cal.ankleY + 0.002 && phase < 0.58;
    const worldZ = solution.pos.footL.z + distance; // la raíz avanza lo recorrido
    if (onGround && planted !== null && phase > lastPhase) drift = Math.max(drift, Math.abs(worldZ - planted));
    planted = onGround ? (planted !== null && phase > lastPhase ? planted : worldZ) : null;
    lastPhase = phase;
  }
  assert.ok(drift < 0.01, `el pie patina ${drift.toFixed(3)} m`);
  // Quieta (velocidad 0) vuelve a la postura de pie.
  const still = solvePose(cal, characterActionPose(state({ action: "walk", gait: { distance: 0.3, speed: 0 } })));
  const stand = solvePose(cal, characterActionPose(state({})));
  assert.ok(still.pos.footL.distanceTo(stand.pos.footL) < 1e-9);
});

test("mezcla entre pasos: interpola la pose y los extremos coinciden", () => {
  const a = characterActionPose(state({ action: "showProduct" }));
  const b = characterActionPose(state({ action: "point" }));
  assert.deepEqual(blendCharacterPose(a, b, 0), a);
  assert.deepEqual(blendCharacterPose(a, b, 1), b);
  const mid: CharacterPose = blendCharacterPose(a, b, 0.5);
  assert.ok(Math.abs(mid.handR[2] - (a.handR[2] + b.handR[2]) / 2) < 1e-12);
});

test("IK: alcanza un punto alcanzable y se estira hacia uno lejano", () => {
  const start = new Vector3(0.15, 1.4, 0);
  const near = new Vector3(0.05, 1.3, 0.35);
  const solution = solveTwoBone(start, near, 0.25, 0.25, new Vector3(0, -1, 0));
  const elbow = start.clone().addScaledVector(solution.upper, 0.25);
  assert.ok(elbow.clone().addScaledVector(solution.lower, 0.25).distanceTo(near) < 1e-9);
  assert.ok(elbow.y < start.y, "el codo apunta hacia el polo (abajo)");
  const far = solveTwoBone(start, new Vector3(0.15, 1.4, 2), 0.25, 0.25, new Vector3(0, -1, 0));
  assert.ok(far.bend < 0.1 && far.reached.distanceTo(start) < 0.5);
});

test("brazo sobre un clip: con el padre en reposo coincide con el solver completo", () => {
  const { cal } = buildRig("biped", 1.02);
  const target = new Vector3(0.05, 1.45, 0.3);
  const pose = characterActionPose(state({ time: 0.8 }));
  const full = solvePose(cal, pose, { reach: { L: target } });
  assert.ok(full.pos.handL.distanceTo(target) < 1e-6, "la muñeca llega al celular");
  // Mismo padre (la clavícula, arrastrada por el pecho), mismo hombro y mismo polo.
  const parentWorld = full.delta.chest.clone().multiply(cal.rest.upperArmL.parentWorld);
  const pole = new Vector3(...pose.poleL).applyQuaternion(full.delta.chest);
  const live = solveArmLive(cal, "L", parentWorld, full.pos.upperArmL, target, pole);
  assert.ok(live.upper.angleTo(full.local.upperArmL) < 1e-6);
  assert.ok(live.lower.angleTo(full.local.lowerArmL) < 1e-6);
  assert.ok(live.reached.distanceTo(target) < 1e-6);
});

test("cabeza: headLocals da los mismos locales que la pose completa", () => {
  const { cal } = buildRig("ue");
  const pose = characterActionPose(state({}));
  Object.assign(pose, { headYaw: 0.4, headPitch: -0.2, headRoll: 0.05 });
  const solution = solvePose(cal, pose);
  const head = headLocals(cal, 0.4, -0.2, 0.05);
  assert.ok(head.neck.angleTo(solution.local.neck) < 1e-6 && head.head.angleTo(solution.local.head) < 1e-6);
});

test("encuadre: la altura de ojos sale del manifiesto y baja al sentarse", () => {
  const { cal } = buildRig("ue");
  const standing = characterEyeHeight(cal, false);
  assert.ok(Math.abs(standing - 1.56) < 0.03, `de pie ${standing.toFixed(3)}`);
  assert.ok(characterEyeHeight(cal, true) < standing - 0.3);
});

/* ------------------------------------------------------ GLB REALES (DISCO) -- */

async function loadGlb(file: string) {
  (globalThis as { self?: unknown }).self ??= globalThis;
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  const { MeshoptDecoder } = await import("three/examples/jsm/libs/meshopt_decoder.module.js");
  const buffer = fs.readFileSync(path.join(MODELS_DIR, file));
  const data = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  // En Node no hay decodificador de imágenes: las texturas fallan (se ignoran) y la geometría y el esqueleto cargan igual.
  const { error, warn } = console;
  console.error = () => {};
  console.warn = () => {};
  try {
    return await new Promise<{ scene: Group; animations: AnimationClip[] }>((resolve, reject) => loader.parse(data, "", gltf => resolve(gltf as never), reject));
  } finally {
    console.error = error;
    console.warn = warn;
  }
}

test("GLB reales: los huesos del manifiesto existen y las poses dan rotaciones finitas", { skip: !hasModels && "faltan los modelos en src/content/modelos-3d" }, async () => {
  const manifest = parseManifest(JSON.parse(fs.readFileSync(path.join(MODELS_DIR, "manifest.json"), "utf8")));
  assert.deepEqual(manifest.personajes.map(item => item.id).sort(), ["actriz-1", "actriz-2", "camarografo"]);
  for (const spec of manifest.personajes) {
    const gltf = await loadGlb(spec.archivo);
    const bones = resolveBoneMap(gltf.scene, spec.huesos);
    const cal = calibrateRig(gltf.scene, spec, bones);
    for (const [label, item] of STATES) {
      const solution = solvePose(cal, characterActionPose(item));
      for (const q of Object.values(solution.local)) assert.ok(Number.isFinite(q.x + q.y + q.z + q.w) && Math.abs(q.length() - 1) < 1e-6, `${spec.id} ${label}`);
      assert.ok(Number.isFinite(solution.pelvisPosition.length()), `${spec.id} ${label}: pelvis`);
      // Lo aplicado en los huesos de three.js coincide con la cinemática del solver.
      for (const key of HUESOS) bones[key].quaternion.copy(solution.local[key]);
      bones.pelvis.position.copy(solution.pelvisPosition);
      gltf.scene.updateMatrixWorld(true);
      for (const key of ["handL", "handR", "footL", "footR", "head"] as const) {
        assert.ok(bones[key].getWorldPosition(new Vector3()).distanceTo(solution.pos[key]) < 1e-5, `${spec.id} ${label}: ${key}`);
      }
      if (!item.gait) assert.ok(Math.abs(solution.pos.footL.y - cal.ankleY) < 0.006, `${spec.id} ${label}: pie en el piso`);
      assertHinges(cal, solution, `${spec.id} ${label}`);
    }
    for (const key of HUESOS) bones[key].quaternion.copy(cal.rest[key].local);
    bones.pelvis.position.copy(cal.rest.pelvis.localPos);
    // Ojos: los del manifiesto, un poco más abajo con las rodillas sueltas.
    const eye = characterEyeHeight(cal, false);
    assert.ok(eye <= spec.ojos.altura + 0.005 && eye > spec.ojos.altura - 0.03, `${spec.id}: ojos ${eye.toFixed(3)} vs ${spec.ojos.altura}`);
    assert.ok(cal.fingers.L && cal.palm.L, `${spec.id}: mano izquierda`);
    if (spec.animaciones) {
      const names = gltf.animations.map(clip => clip.name);
      for (const name of Object.values(spec.animaciones)) assert.ok(names.includes(name), `${spec.id}: falta el clip ${name}`);
      const walk = gltf.animations.find(clip => clip.name === spec.animaciones!.caminar)!;
      const idle = gltf.animations.find(clip => clip.name === spec.animaciones!.reposo)!;
      const before = bones.footL.getWorldPosition(new Vector3());
      const stride = measureWalkStride(gltf.scene, bones, walk, idle, WALK_CLIP_WEIGHT);
      assert.ok(stride !== null && stride > 0.5 && stride < 2.5, `${spec.id}: zancada ${stride}`);
      // Medir no deja el modelo animado: la calibración de los clones sigue en reposo.
      assert.ok(bones.footL.getWorldPosition(new Vector3()).distanceTo(before) < 1e-9);
    }
  }
});

test("GLB reales: las actrices sostienen el producto con las palmas en sus caras", { skip: !hasModels && "faltan los modelos en src/content/modelos-3d" }, async () => {
  const manifest = parseManifest(JSON.parse(fs.readFileSync(path.join(MODELS_DIR, "manifest.json"), "utf8")));
  for (const spec of manifest.personajes.filter(item => item.id !== "camarografo")) {
    const gltf = await loadGlb(spec.archivo);
    const cal = calibrateRig(gltf.scene, spec);
    for (const product of ["caja", "taza", "prenda"] as const) {
      const half = PRODUCT_HALF_WIDTH[product];
      const solution = solvePose(cal, characterActionPose(state({ action: "showProduct" })), { holdHalfWidth: half });
      const gap = solution.grip.L.x - solution.grip.R.x;
      // Antes quedaban a unos 7 cm entre sí, enterradas en la caja de 17 cm.
      assert.ok(Math.abs(gap - 2 * (half + PALM_OFFSET)) < 0.02, `${spec.id} ${product}: palmas a ${gap.toFixed(3)} m`);
    }
  }
});

test("GLB reales: quien graba flexiona las rodillas sobre el clip y el giro del «idle» se mide", { skip: !hasModels && "faltan los modelos en src/content/modelos-3d" }, async () => {
  const manifest = parseManifest(JSON.parse(fs.readFileSync(path.join(MODELS_DIR, "manifest.json"), "utf8")));
  const spec = manifest.personajes.find(item => item.id === "camarografo")!;
  const gltf = await loadGlb(spec.archivo);
  const bones: BoneMap = resolveBoneMap(gltf.scene, spec.huesos);
  const cal = calibrateRig(gltf.scene, spec, bones);
  const idle = gltf.animations.find(clip => clip.name === spec.animaciones!.reposo)!;
  // El torso del «idle» gira unos 24° hacia su derecha: el visor lo descuenta al orientarlo hacia el celular.
  const restFoot = bones.footL.getWorldPosition(new Vector3());
  const yaw = measureClipYaw(gltf.scene, bones, idle);
  assert.ok(yaw < -0.35 && yaw > -0.5, `giro del idle ${((yaw * 180) / Math.PI).toFixed(1)}°`);
  assert.ok(bones.footL.getWorldPosition(new Vector3()).distanceTo(restFoot) < 1e-9, "medir deja el modelo en reposo");

  const mixer = new AnimationMixer(gltf.scene);
  const action = mixer.clipAction(idle);
  action.play();
  const overlay = clipOverlay(bones);
  const inRoot = (bone: Bone) => bone.getWorldPosition(new Vector3()).applyMatrix4(gltf.scene.matrixWorld.clone().invert());
  // Siempre el mismo instante del clip, como con la escena en pausa: el mezclador no reescribe nada y
  // lo retocado en el cuadro anterior tiene que volver a lo del clip (si no, la cadera se hunde cada cuadro).
  const measure = (drop: number) => {
    overlay.restore();
    action.time = 0.4;
    mixer.update(0);
    overlay.save();
    gltf.scene.updateMatrixWorld(true);
    const ankles = { L: inRoot(bones.footL), R: inRoot(bones.footR) };
    const pelvis = inRoot(bones.pelvis).y;
    const applied = legsLive(gltf.scene, bones, cal, { drop });
    gltf.scene.updateMatrixWorld(true);
    assert.ok(inRoot(bones.footL).distanceTo(ankles.L) < 0.002 && inRoot(bones.footR).distanceTo(ankles.R) < 0.002, `${drop}: los tobillos se movieron`);
    const knee = (side: "L" | "R") => side === "L" ? bendDeg(inRoot(bones.thighL), inRoot(bones.calfL), inRoot(bones.footL)) : bendDeg(inRoot(bones.thighR), inRoot(bones.calfR), inRoot(bones.footR));
    return { applied, knees: [knee("L"), knee("R")], lowered: pelvis - inRoot(bones.pelvis).y };
  };
  const clip = measure(0);
  const tucked = measure(0.055);
  const again = measure(0.055);
  const rigid = measure(-0.04);
  const clipAgain = measure(0);
  assert.ok(Math.abs(tucked.lowered - 0.055) < 0.002, `la cadera bajó ${tucked.lowered.toFixed(3)}`);
  // En pausa no se acumula: el mismo retoque da la misma pose y sin retoque vuelve la del clip.
  assert.ok(Math.abs(again.lowered - tucked.lowered) < 1e-6 && Math.abs(again.knees[0] - tucked.knees[0]) < 1e-3, "el retoque se acumuló en pausa");
  assert.ok(Math.abs(clipAgain.knees[0] - clip.knees[0]) < 1e-3 && Math.abs(clipAgain.knees[1] - clip.knees[1]) < 1e-3, "no volvió la pose del clip");
  assert.ok(rigid.applied < 0, `subir la cadera (${rigid.applied.toFixed(3)})`);
  const mean = (list: number[]) => list.reduce((sum, value) => sum + value, 0) / list.length;
  // Correcto (codos pegados, rodillas flexionadas) frente al error (piernas rígidas): la diferencia se ve.
  assert.ok(mean(tucked.knees) > mean(clip.knees) + 12, `rodillas ${mean(clip.knees).toFixed(1)}° → ${mean(tucked.knees).toFixed(1)}°`);
  assert.ok(Math.min(...rigid.knees) < Math.min(...clip.knees) - 5, `rígidas ${rigid.knees.map(v => v.toFixed(1))} vs clip ${clip.knees.map(v => v.toFixed(1))}`);
  assert.ok(mean(tucked.knees) - mean(rigid.knees) > 20);
  mixer.stopAllAction();
  mixer.uncacheRoot(gltf.scene);
});
