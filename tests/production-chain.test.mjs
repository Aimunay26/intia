import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { load } from "./load-module.mjs";

/**
 * Cadena de entregas por video (PRODUCTION_CHAIN_ENABLED), sin base de datos:
 * interruptores y canario, plazos, reglas por paso contra la política de permisos real,
 * validaciones de cada «Listo» (sin escribir nada si fallan), chips del calendario y
 * «cadena apagada = cero consultas». El recorrido completo, las devoluciones, la
 * concurrencia y las invariantes Q1-Q5 están en tests/postgres-production-chain.test.mjs.
 */

const flags = load("src/lib/production-chain-flag.ts");
const days = load("src/lib/working-days.ts");
const permissions = load("src/lib/permissions.ts");
const constants = load("src/lib/constants.ts");

const WEEK = { lun: "2026-09-28", mar: "2026-09-29", mie: "2026-09-30", jue: "2026-10-01", vie: "2026-10-02", sab: "2026-10-03", dom: "2026-10-04", lun2: "2026-10-05", mar2: "2026-10-06" };

/* ------------------------------------------------------------ INTERRUPTORES -- */

test("interruptores: la cadena exige el flujo; canario por marca; calendario y feed personal", () => {
  const on = { PRODUCTION_FLOW_ENABLED: "true", PRODUCTION_CHAIN_ENABLED: "true" };
  assert.equal(flags.productionChainConfigured({}), false);
  assert.equal(flags.productionChainConfigured({ PRODUCTION_CHAIN_ENABLED: "true" }), false, "sin el flujo no hay cadena");
  assert.equal(flags.productionChainConfigured({ ...on, PRODUCTION_CHAIN_ENABLED: "1" }), false, "solo \"true\" la enciende");
  assert.equal(flags.productionChainEnabled("b1", on), true, "sin canario: todas las marcas");
  assert.equal(flags.productionChainEnabled(undefined, on), true);
  const canary = { ...on, PRODUCTION_CHAIN_BRANDS: " b1, b2  b3 ,," };
  assert.deepEqual(flags.productionChainBrands(canary), ["b1", "b2", "b3"]);
  assert.equal(flags.productionChainEnabled("b2", canary), true);
  assert.equal(flags.productionChainEnabled("b9", canary), false);
  assert.equal(flags.productionChainEnabled(undefined, canary), false, "con canario y sin marca, conservador");
  assert.equal(flags.productionChainBrands({ PRODUCTION_CHAIN_BRANDS: "  " }), null);
  assert.equal(flags.calendarStepsEnabled(on), true, "encendido por defecto con la cadena");
  assert.equal(flags.calendarStepsEnabled({ ...on, CALENDARIO_PASOS: "FALSE" }), false);
  assert.equal(flags.calendarStepsEnabled({ CALENDARIO_PASOS: "true" }), false, "solo actúa con la cadena");
  assert.equal(flags.calendarFeedPersonalEnabled({}), false);
  assert.equal(flags.calendarFeedPersonalEnabled({ CALENDAR_FEED_PERSONAL: "true" }), true);
});

/* ------------------------------------------------------------------ PLAZOS -- */

test("plazos: guion al 2º día hábil, publicación nunca antes de grabar y editar", () => {
  assert.equal(days.scriptDueKey(WEEK.lun), WEEK.mie, "lunes → miércoles");
  assert.equal(days.scriptDueKey(WEEK.vie), WEEK.lun2, "viernes → lunes (el sábado cuenta)");
  assert.equal(days.scriptDueKey(WEEK.sab), WEEK.mar2, "sábado → martes");
  assert.equal(days.scriptDueKey(WEEK.dom), WEEK.mar2, "domingo → martes");
  assert.equal(days.addWorkingDaysKey(WEEK.lun, 0), WEEK.mar, "al menos un día");
  assert.equal(days.earliestPublicationKey(WEEK.vie), WEEK.lun2, "graba viernes, edita sábado, publica lunes");
  assert.equal(days.earliestPublicationKey(WEEK.sab), WEEK.mar2, "graba sábado, edita lunes, publica martes");
  for (let i = 0; i < 14; i++) {
    const day = days.addDaysToKey(WEEK.lun, i);
    assert.notEqual(days.weekdayOfKey(days.scriptDueKey(day)), 0, `guion de ${day} vence en domingo`);
    assert.notEqual(days.weekdayOfKey(days.earliestPublicationKey(day)), 0);
  }
});

/* ------------------------------------------------------------------- REGLAS -- */

test("reglas por paso: orden, devoluciones y capacidades que concede el perfil de cada función", () => {
  assert.deepEqual([...constants.CHAIN_ORDER], ["GUION", "GRABACION", "EDICION", "PUBLICACION"], "sin REVISION_GUION ni REVISION_FINAL (decisión del Dueño)");
  for (const step of [...constants.CHAIN_ORDER, "DISENO"]) assert.ok(constants.PRODUCTION_STEP_MAP[step], step);
  assert.ok(constants.PRODUCTION_STEP_STATUS_MAP.DEVUELTO);
  const rules = constants.CHAIN_STEP_RULES;
  assert.deepEqual(Object.fromEntries(Object.entries(rules).map(([k, r]) => [k, r.returnsTo])), { GUION: null, GRABACION: null, EDICION: "GRABACION", PUBLICACION: "EDICION", DISENO: null });
  const profileOf = Object.fromEntries(constants.BRAND_TEAM_ROLES.map((r) => [r.value, r.profile]));
  for (const [step, rule] of Object.entries(rules)) {
    const member = { id: "x", role: "MEMBER", profiles: [profileOf[rule.team]], brandIds: ["b1"] };
    assert.ok(permissions.allows(member, rule.capability), `${step}: el perfil ${profileOf[rule.team]} concede ${rule.capability}`);
    assert.ok(constants.ASSIGNMENT_ROLE_MAP[rule.assignment], `${step}: la función ${rule.assignment} existe en el video`);
  }
  const chain = chainModule();
  for (const [role, capabilities] of Object.entries(chain.TEAM_ROLE_CAPABILITIES)) {
    const member = { id: "x", role: "MEMBER", profiles: [profileOf[role]], brandIds: ["b1"] };
    for (const capability of capabilities) assert.ok(permissions.allows(member, capability), `${role} (${profileOf[role]}) concede ${capability}`);
  }
});

test("paso que le toca al video según su estado (Crear paso y convergencia)", () => {
  const { expectedChainStep } = chainModule();
  const cases = [["IDEA", false, "GUION"], ["GUION", false, "GUION"], ["APROBADO", false, "GRABACION"], ["GRABACION", false, "GRABACION"], ["EDICION", false, "EDICION"], ["EDICION", true, "PUBLICACION"], ["PROGRAMADO", true, "PUBLICACION"], ["PUBLICADO", true, null], ["CANCELADO", false, null], ["PAUSADO", false, null]];
  for (const [status, final, expected] of cases) assert.equal(expectedChainStep(status, final), expected, `${status}/${final}`);
});

test("migración: solo amplía CHECK y añade un índice; nada de columnas ni tablas", () => {
  const sql = fs.readFileSync(new URL("../prisma/migrations/20260930090000_production_chain/migration.sql", import.meta.url), "utf8");
  const statements = sql.split("\n").filter((line) => line.trim() && !line.trim().startsWith("--"));
  assert.ok(!/ADD COLUMN|CREATE TABLE|DROP TABLE|DROP COLUMN|UPDATE |DELETE /i.test(statements.join("\n")));
  assert.match(sql, /"ProductionStep_step_check" CHECK \("step" IN \('GUION','GRABACION','EDICION','PUBLICACION','DISENO'\)\)/);
  assert.match(sql, /"ProductionStep_status_check" CHECK \("status" IN \('PENDIENTE','HECHO','CANCELADO','DEVUELTO'\)\)/);
  assert.match(sql, /^BEGIN;[\s\S]*COMMIT;\s*$/);
});

/* --------------------------------------------------------- CADENA APAGADA -- */

const untouchable = (label = "la base") => new Proxy({}, { get(_target, key) { throw new Error(`Con la cadena apagada no se toca ${label} (${String(key)})`); } });
const noSteps = (target) => new Proxy(target, { get(obj, key) { if (key === "productionStep") throw new Error("Con la cadena apagada no se leen pasos"); return obj[key]; } });

async function withEnv(values, work) {
  const keys = ["PRODUCTION_FLOW_ENABLED", "PRODUCTION_CHAIN_ENABLED", "PRODUCTION_CHAIN_BRANDS", "CALENDARIO_PASOS"];
  const old = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const k of keys) { if (values[k] === undefined) delete process.env[k]; else process.env[k] = values[k]; }
  try { return await work(); } finally { for (const k of keys) { if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; } }
}
const CHAIN_ON = { PRODUCTION_FLOW_ENABLED: "true", PRODUCTION_CHAIN_ENABLED: "true" };

function chainModule(prisma = {}, extra = {}) {
  return load("src/lib/domain/production-chain.ts", {
    "@/lib/prisma": { prisma },
    "@/lib/auth": { clientIp: async () => "127.0.0.1" },
    "@/lib/access-scope": {
      lockVideoLifecycle: async () => {},
      contentScope: (user, capability = "content.view") => ({ __scope: { user, capability } }),
      scriptScope: (user, capability) => ({ __scriptScope: { user, capability } }),
      assertContentAccess: async (tx, user, id, capability = "content.view") => {
        permissions.assertPermission(user, capability);
        if (!await tx.contentItem.count({ where: { AND: [{ id }, { __scope: { user, capability } }] } })) throw new Error("No tienes acceso a este video.");
      },
      assertPublishable: async () => {},
    },
    "@/lib/mutations": { EDIT_CONFLICT: "conflicto", lockRevision: async () => {} },
    ...extra,
  });
}

test("cadena apagada: chainEvent, ganchos nuevos, lecturas y barrido no consultan nada", () => withEnv({ PRODUCTION_FLOW_ENABLED: "true" }, async () => {
  const chain = chainModule(untouchable());
  const tx = untouchable();
  const owner = { id: "owner", name: "Yoryo", role: "OWNER" };
  const events = [
    { type: "VIDEO_CREATED", videoId: "v1" }, { type: "SCRIPT_LINKED", videoId: "v1" }, { type: "SCRIPT_UNLINKED", videoId: "v1" },
    { type: "SCRIPT_STATUS", scriptId: "s1", from: "BORRADOR", to: "REVISION" }, { type: "VIDEO_STATUS", videoId: "v1", from: "GUION", to: "APROBADO" },
    { type: "CHECK_DONE", videoId: "v1", stage: "GRABACION", kind: "TASK" }, { type: "CHECK_REOPENED", videoId: "v1", stage: "POSTPRODUCCION", kind: "FINAL_APPROVAL" },
    { type: "DATE_CHANGED", videoId: "v1", field: "shootDate" }, { type: "ASSIGNMENT_CHANGED", videoId: "v1", role: "CAMARA", userId: "c" },
    { type: "TEAM_CHANGED", brandId: "b1", role: "FILMMAKER", previousUserId: null, userId: "c" }, { type: "STEP_MARKED", videoId: "v1", step: "GRABACION" },
    { type: "TASK_MOVED", taskId: "t1", toColumnId: "c4" },
  ];
  for (const event of events) assert.deepEqual(await chain.chainEvent(tx, owner, event), { done: false, reason: "chain_off" }, event.type);
  await chain.assertFinalApprovalAllowed(tx, "v1");
  await chain.assertAssignmentRemovable(tx, "v1", "c", "CAMARA");

  const flow = load("src/lib/domain/production-flow.ts", { "@/lib/prisma": { prisma: untouchable() }, "@/lib/auth": { clientIp: async () => "127.0.0.1" } });
  await flow.onScriptStatusChanged(tx, owner, "s1", "BORRADOR", "REVISION");
  await flow.onScheduledDateChanged(tx, owner, "v1");

  const scope = load("src/lib/production-scope.ts", { "@/lib/prisma": { prisma: untouchable() } });
  const member = { id: "c", name: "Carlos", role: "MEMBER", profiles: ["CAMERA"], brandIds: ["b1"] };
  assert.equal((await scope.readMyWork(member)).enabled, false);
  assert.deepEqual([(await scope.readChain(owner)).enabled, (await scope.readChain(owner)).allowed], [false, false]);
  assert.deepEqual(await scope.stepCalendarEntries(member, new Date(), new Date(), { mine: true }), { enabled: false, entries: [], covered: [] });

  // Sin cadena, «grabado» sale del check y nunca se lee ProductionStep.
  const readsChecks = noSteps({
    contentItem: { findUnique: async () => ({ brandId: "b1" }), findMany: async () => [{ id: "v1", title: "V", status: "GRABACION", brandId: "b1", scriptId: "s1", checklist: [{ label: "Grabado (todas las tomas)" }] }] },
    checklistItem: { findMany: async () => [{ label: "Grabado (todas las tomas)" }] },
  });
  const offScope = load("src/lib/production-scope.ts", { "@/lib/prisma": { prisma: readsChecks } });
  assert.deepEqual(await offScope.grabadoDeVideo("v1"), { grabado: true, fuente: "check" });
  const state = (await offScope.chainStateForScripts(["s1"])).get("s1");
  assert.deepEqual([state.videos, state.grabados, state.items[0].openStep], [1, 1, null]);
}));

test("barrido con la cadena en todas las marcas: no toca grabaciones (el atraso queda visible)", () => withEnv(CHAIN_ON, async () => {
  const sweep = load("src/lib/production-sweep.ts", { "@/lib/prisma": { prisma: untouchable() } });
  assert.deepEqual(await sweep.runProductionSweep(), { enabled: true, candidates: 0, assigned: 0, skipped: 0, failed: 0 });
}));

/* -------------------------------------------------- VALIDACIONES DEL LISTO -- */

const PEOPLE = {
  owner: { id: "owner", name: "Yoryo", role: "OWNER", profiles: [], brandIds: [] },
  edward: { id: "edward", name: "Edward", role: "MEMBER", profiles: ["STRATEGY"], brandIds: ["b1"] },
  paula: { id: "paula", name: "Paula", role: "MEMBER", profiles: ["WRITER"], brandIds: ["b1"] },
  carlos: { id: "carlos", name: "Carlos", role: "MEMBER", profiles: ["CAMERA"], brandIds: ["b1"] },
  laudder: { id: "laudder", name: "Laudder", role: "MEMBER", profiles: ["EDITOR"], brandIds: ["b1"] },
  talent: { id: "talent", name: "Tali", role: "MEMBER", profiles: ["TALENT"], brandIds: ["b1"] },
  produccion: { id: "produccion", name: "Pedro", role: "MEMBER", profiles: ["PRODUCTION"], brandIds: ["b1"] },
  ajeno: { id: "ajeno", name: "Otra marca", role: "MEMBER", profiles: ["STRATEGY"], brandIds: ["b9"] },
};

/**
 * Transacción simulada: pasos, video, guion y checks en memoria. Cualquier escritura queda en
 * `writes`; las validaciones deben fallar antes de la primera.
 */
function fakeTx({ steps, video, script = null, scenes = 1, checks = [], canWriteScript = true }) {
  const writes = [];
  const byKey = (where) => steps.find((s) => (where.id ? s.id === where.id : where.taskId ? s.taskId === where.taskId : s.automationKey === where.automationKey));
  const write = (what) => async (args) => { writes.push([what, args]); return {}; };
  return {
    writes,
    $queryRaw: async () => [],
    $executeRaw: async () => 0,
    $executeRawUnsafe: async () => 0,
    productionStep: {
      findUnique: async ({ where }) => { const s = byKey(where); return s ? { ...s } : null; },
      findMany: async () => [],
      update: write("productionStep.update"), create: write("productionStep.create"), updateMany: write("productionStep.updateMany"),
    },
    contentItem: {
      findUnique: async ({ where }) => (where.id === video.id ? { ...video } : null),
      count: async ({ where }) => {
        const scope = where.AND?.[1]?.__scope;
        if (!scope) return 1;
        const { user, capability } = scope;
        if (!permissions.allows(user, capability)) return 0;
        if (user.role === "OWNER") return 1;
        if (!user.brandIds.includes(video.brandId)) return 0;
        return permissions.capabilityScope(user, capability) === "brand" || steps.some((s) => s.assigneeId === user.id) ? 1 : 0;
      },
      update: write("contentItem.update"), updateMany: write("contentItem.updateMany"),
    },
    script: { findUnique: async () => (script ? { ...script } : null), count: async () => (canWriteScript ? 1 : 0), update: write("script.update") },
    scriptScene: { count: async () => scenes },
    checklistItem: { findMany: async () => checks, findFirst: async () => null, count: async () => 0, update: write("checklistItem.update"), create: write("checklistItem.create") },
    user: { findUnique: async ({ where }) => ({ name: Object.values(PEOPLE).find((p) => p.id === where.id)?.name ?? where.id }) },
    approval: { create: write("approval.create"), updateMany: write("approval.updateMany") },
    auditLog: { create: write("auditLog.create") },
    comment: { create: write("comment.create") },
  };
}

const row = (extra = {}) => ({ id: "st", contentItemId: "v1", brandId: "b1", step: "GUION", status: "PENDIENTE", assigneeId: "paula", dueAt: new Date("2026-10-01T04:59:59.999Z"), source: "AUTO", taskId: "t1", materialUrl: null, notes: null, requestedById: null, automationKey: "v1:GUION", updatedAt: new Date(), doneAt: null, ...extra });
const VIDEO = { id: "v1", title: "Video uno", brandId: "b1", status: "GUION", scriptId: "s1", shootDate: null, scheduledDate: new Date("2026-09-28T12:00:00.000Z"), publishedUrl: null, publishedAt: null, cta: null };
const SCRIPT = { id: "s1", title: "Guion uno", status: "BORRADOR", cta: "Escríbenos", approvalId: null, brandId: "b1" };

async function rejectsWithoutWrites(tx, promise, pattern, label) {
  await assert.rejects(promise, pattern, label);
  assert.deepEqual(tx.writes, [], `${label}: no escribe nada`);
}

test("Listo del guion: guion vinculado, escenas, CTA, no archivado y permiso para escribirlo", () => withEnv(CHAIN_ON, async () => {
  const chain = chainModule();
  const cases = [
    [{ video: { ...VIDEO, scriptId: null } }, /Vincula un guion/, "sin guion"],
    [{ script: { ...SCRIPT, status: "ARCHIVADO" } }, /archivado/, "archivado"],
    [{ scenes: 0 }, /al menos una escena/, "sin escenas"],
    [{ script: { ...SCRIPT, cta: " " } }, /Falta el CTA/, "sin CTA en guion ni video"],
    [{ canWriteScript: false }, /No puedes editar este guion/, "guionista sin permiso sobre ese guion"],
  ];
  for (const [over, pattern, label] of cases) {
    const tx = fakeTx({ steps: [row()], video: VIDEO, script: SCRIPT, ...over });
    await rejectsWithoutWrites(tx, chain.completeStep(tx, PEOPLE.paula, "st"), pattern, label);
  }
}));

test("Listo: quién puede pulsar, estados del paso, video vivo y canario", () => withEnv(CHAIN_ON, async () => {
  const chain = chainModule();
  // Quien no ve el video (ni asignado ni en su alcance), otra marca o un id inexistente: el mismo mensaje, sin estado ni marca.
  let tx = fakeTx({ steps: [row({ assigneeId: "carlos", step: "GRABACION", automationKey: "v1:GRABACION" })], video: { ...VIDEO, status: "APROBADO" } });
  await rejectsWithoutWrites(tx, chain.completeStep(tx, PEOPLE.talent, "st"), /No tienes acceso a este paso o ya no existe/, "no ve el video");
  tx = fakeTx({ steps: [row({ assigneeId: "carlos", step: "GRABACION", automationKey: "v1:GRABACION", status: "HECHO" })], video: { ...VIDEO, status: "APROBADO" } });
  await rejectsWithoutWrites(tx, chain.completeStep(tx, PEOPLE.ajeno, "st"), /No tienes acceso a este paso o ya no existe/, "paso de otra marca: no revela que está hecho");
  await rejectsWithoutWrites(tx, chain.returnStep(tx, PEOPLE.ajeno, "st", { motivo: "Motivo suficiente" }), /No tienes acceso a este paso o ya no existe/, "devolver un paso ajeno");
  await rejectsWithoutWrites(tx, chain.completeStep(tx, PEOPLE.ajeno, "no-existe"), /No tienes acceso a este paso o ya no existe/, "id inexistente: mismo mensaje");
  await rejectsWithoutWrites(tx, chain.takeStep(tx, PEOPLE.talent, "st"), /No tienes acceso a este paso o ya no existe/, "tomar un paso de un video que no ve");
  tx = fakeTx({ steps: [row({ assigneeId: "carlos", step: "GRABACION", automationKey: "v1:GRABACION" })], video: { ...VIDEO, status: "APROBADO" } });
  await rejectsWithoutWrites(tx, chain.completeStep(tx, PEOPLE.paula, "st"), /Solo coordinación o la persona asignada/, "ve el video pero ni asignada ni coordinación");
  tx = fakeTx({ steps: [row({ assigneeId: "talent", step: "GRABACION", automationKey: "v1:GRABACION" })], video: { ...VIDEO, status: "APROBADO" } });
  await rejectsWithoutWrites(tx, chain.completeStep(tx, PEOPLE.talent, "st"), /Tu perfil no puede completar este paso/, "asignado sin la capacidad del paso");
  tx = fakeTx({ steps: [row({ status: "DEVUELTO" })], video: VIDEO, script: SCRIPT });
  await rejectsWithoutWrites(tx, chain.completeStep(tx, PEOPLE.paula, "st"), /fue devuelto/, "devuelto");
  tx = fakeTx({ steps: [row({ status: "CANCELADO" })], video: VIDEO, script: SCRIPT });
  await rejectsWithoutWrites(tx, chain.completeStep(tx, PEOPLE.paula, "st"), /cancelado/, "cancelado");
  tx = fakeTx({ steps: [row()], video: { ...VIDEO, status: "PAUSADO" }, script: SCRIPT });
  await rejectsWithoutWrites(tx, chain.completeStep(tx, PEOPLE.owner, "st"), /cancelado o pausado/, "video pausado");
  tx = fakeTx({ steps: [row({ status: "HECHO", doneAt: new Date() })], video: VIDEO, script: SCRIPT });
  const again = await chain.completeStep(tx, PEOPLE.paula, "st");
  assert.equal(again.status, "already", "doble clic: idempotente");
  assert.deepEqual(tx.writes, []);
  tx = fakeTx({ steps: [row()], video: VIDEO, script: SCRIPT });
  await withEnv({ ...CHAIN_ON, PRODUCTION_CHAIN_BRANDS: "otra" }, () => rejectsWithoutWrites(tx, chain.completeStep(tx, PEOPLE.paula, "st"), /no está activa para esta marca/, "fuera del canario"));
  // Coordinación (content.assign) y el Dueño pasan la regla de quién pulsa.
  tx = fakeTx({ steps: [row({ step: "GRABACION", automationKey: "v1:GRABACION", assigneeId: "carlos" })], video: { ...VIDEO, status: "APROBADO" } });
  await rejectsWithoutWrites(tx, chain.completeStep(tx, PEOPLE.edward, "st"), /Falta el enlace del material grabado/, "coordinación llega a las validaciones del paso");
  tx = fakeTx({ steps: [row({ step: "GRABACION", automationKey: "v1:GRABACION", assigneeId: "carlos" })], video: { ...VIDEO, status: "APROBADO" } });
  await rejectsWithoutWrites(tx, chain.completeStep(tx, PEOPLE.produccion, "st"), /Falta el enlace del material grabado/, "producción completa la grabación por el filmmaker");
}));

test("coordinación no firma lo que su perfil no firma: guion, revisión final, publicar y retirar la revisión final", () => withEnv(CHAIN_ON, async () => {
  const chain = chainModule();
  let tx = fakeTx({ steps: [row({ step: "EDICION", automationKey: "v1:EDICION", assigneeId: "laudder" })], video: { ...VIDEO, status: "EDICION" } });
  await rejectsWithoutWrites(tx, chain.completeStep(tx, PEOPLE.produccion, "st", { materialUrl: "https://drive.test/master" }), /no puede firmar la revisión final/, "PRODUCTION sin content.approve");
  tx = fakeTx({ steps: [row({ step: "GUION", assigneeId: "paula" })], video: VIDEO, script: SCRIPT });
  await rejectsWithoutWrites(tx, chain.completeStep(tx, PEOPLE.produccion, "st"), /no puede aprobar este guion/, "PRODUCTION sin scripts.approve ni scripts.write");
  tx = fakeTx({ steps: [row({ step: "PUBLICACION", automationKey: "v1:PUBLICACION", assigneeId: "silvanna" })], video: { ...VIDEO, status: "EDICION" } });
  await rejectsWithoutWrites(tx, chain.completeStep(tx, PEOPLE.edward, "st", { publishedUrl: "https://tiktok.test/v" }), /no puede publicar/, "STRATEGY sin content.publish");
  tx = fakeTx({ steps: [row({ step: "PUBLICACION", automationKey: "v1:PUBLICACION", assigneeId: "silvanna" })], video: { ...VIDEO, status: "EDICION" } });
  await rejectsWithoutWrites(tx, chain.returnStep(tx, PEOPLE.produccion, "st", { motivo: "Corrige el copy" }), /no puede retirar la revisión final/, "PRODUCTION no retira la aprobación final");
  // La persona asignada con la capacidad del paso pulsa como tal aunque además coordine.
  const both = { ...PEOPLE.produccion, id: "laudder", profiles: ["PRODUCTION", "EDITOR"] };
  tx = fakeTx({ steps: [row({ step: "EDICION", automationKey: "v1:EDICION", assigneeId: "laudder" })], video: { ...VIDEO, status: "EDICION" } });
  await rejectsWithoutWrites(tx, chain.completeStep(tx, both, "st"), /Falta el enlace del máster/, "editor asignado con perfil de producción: llega a las validaciones");
}));

test("Listo de grabación, edición y publicación: enlaces obligatorios y válidos", () => withEnv(CHAIN_ON, async () => {
  const chain = chainModule();
  const grab = row({ step: "GRABACION", automationKey: "v1:GRABACION", assigneeId: "carlos" });
  let tx = fakeTx({ steps: [grab], video: { ...VIDEO, status: "APROBADO" } });
  await rejectsWithoutWrites(tx, chain.completeStep(tx, PEOPLE.carlos, "st"), /Falta el enlace del material grabado/, "sin material");
  tx = fakeTx({ steps: [grab], video: { ...VIDEO, status: "APROBADO" } });
  await rejectsWithoutWrites(tx, chain.completeStep(tx, PEOPLE.carlos, "st", { materialUrl: "javascript:alert(1)" }), /Pega el enlace completo de «Material grabado»/, "enlace no http");
  tx = fakeTx({ steps: [grab], video: { ...VIDEO, status: "APROBADO" } });
  await rejectsWithoutWrites(tx, chain.completeStep(tx, PEOPLE.carlos, "st", { materialUrl: "https://x.test/a b" }), /Pega el enlace completo/, "enlace con espacios");

  const recorded = row({ id: "g", step: "GRABACION", automationKey: "v1:GRABACION", status: "HECHO", materialUrl: "https://drive.test/crudo", assigneeId: "carlos" });
  const edit = row({ step: "EDICION", automationKey: "v1:EDICION", assigneeId: "laudder" });
  tx = fakeTx({ steps: [edit, recorded], video: { ...VIDEO, status: "EDICION" } });
  await rejectsWithoutWrites(tx, chain.completeStep(tx, PEOPLE.laudder, "st"), /Falta el enlace del máster/, "sin máster");
  tx = fakeTx({ steps: [edit, recorded], video: { ...VIDEO, status: "EDICION" } });
  await rejectsWithoutWrites(tx, chain.completeStep(tx, PEOPLE.laudder, "st", { materialUrl: "https://drive.test/crudo" }), /distinto del material grabado/, "máster igual al material");
  tx = fakeTx({ steps: [edit, recorded], video: { ...VIDEO, status: "EDICION" }, checks: [{ id: "c", label: "Miniatura lista", stage: "POSTPRODUCCION", kind: "TASK" }] });
  await rejectsWithoutWrites(tx, chain.completeStep(tx, PEOPLE.laudder, "st", { materialUrl: "https://drive.test/master" }), /Esperando diseño: «Miniatura lista»/, "diseño pendiente");
  tx = fakeTx({ steps: [edit, recorded], video: { ...VIDEO, status: "EDICION" }, checks: [{ id: "c", label: "Miniatura lista", stage: "POSTPRODUCCION", kind: "TASK" }] });
  await rejectsWithoutWrites(tx, chain.completeStep(tx, PEOPLE.owner, "st", { materialUrl: "https://drive.test/master" }), /Esperando diseño: «Miniatura lista»/, "el Dueño tampoco marca el diseño con el Listo del editor");
  tx = fakeTx({ steps: [edit, recorded], video: { ...VIDEO, status: "EDICION" }, checks: [{ id: "c", label: "Aprobado por legal", stage: "GENERAL", kind: "TASK" }] });
  await rejectsWithoutWrites(tx, chain.completeStep(tx, PEOPLE.laudder, "st", { materialUrl: "https://drive.test/master" }), /Falta «Aprobado por legal»: lo marca coordinación/, "check que el editor no puede marcar");

  const pub = row({ step: "PUBLICACION", automationKey: "v1:PUBLICACION", assigneeId: "owner" });
  tx = fakeTx({ steps: [pub], video: { ...VIDEO, status: "EDICION" } });
  await rejectsWithoutWrites(tx, chain.completeStep(tx, PEOPLE.owner, "st"), /Falta el enlace público/, "sin enlace público");
}));

test("Devolver y Avisar: motivo de 5 a 1000 caracteres antes de tocar la base; solo pasos que se devuelven", () => withEnv(CHAIN_ON, async () => {
  const chain = chainModule();
  const tx = untouchable();
  await assert.rejects(chain.returnStep(tx, PEOPLE.laudder, "st", { motivo: " no " }), /motivo de la devolución/);
  await assert.rejects(chain.returnStep(tx, PEOPLE.laudder, "st", { motivo: "x".repeat(1001) }), /entre 5 y 1000/);
  await assert.rejects(chain.notifyCoordination(tx, PEOPLE.carlos, "st", { motivo: "" }), /motivo del aviso/);
  const guion = fakeTx({ steps: [row()], video: VIDEO, script: SCRIPT });
  await rejectsWithoutWrites(guion, chain.returnStep(guion, PEOPLE.paula, "st", { motivo: "Falta el CTA" }), /no se puede devolver/, "el guion es el primer paso");
  const grab = fakeTx({ steps: [row({ step: "GRABACION", automationKey: "v1:GRABACION", assigneeId: "carlos" })], video: { ...VIDEO, status: "APROBADO" } });
  await rejectsWithoutWrites(grab, chain.returnStep(grab, PEOPLE.carlos, "st", { motivo: "No hay locación" }), /Avisar a coordinación/, "el filmmaker avisa, no devuelve el guion");
  const published = fakeTx({ steps: [row({ step: "PUBLICACION", automationKey: "v1:PUBLICACION", assigneeId: "owner" })], video: { ...VIDEO, status: "PUBLICADO" } });
  await rejectsWithoutWrites(published, chain.returnStep(published, PEOPLE.owner, "st", { motivo: "Corrige el copy" }), /ya está publicado/, "publicado no se devuelve");
}));

test("un evento que viene de otra acción corre en su SAVEPOINT y registra un código cerrado", () => withEnv(CHAIN_ON, async () => {
  const chain = chainModule();
  const raw = [];
  const tx = {
    $executeRawUnsafe: async (sql) => { raw.push(sql); return 0; },
    contentItem: { findUnique: async () => { throw Object.assign(new Error("fallo de red"), { code: "P1001" }); } },
  };
  const warnings = [];
  const { warn } = console;
  console.warn = (line) => warnings.push(line);
  try {
    assert.deepEqual(await chain.chainEvent(tx, PEOPLE.owner, { type: "VIDEO_CREATED", videoId: "v1" }), { done: false, reason: "error" });
  } finally { console.warn = warn; }
  assert.deepEqual(raw, ["SAVEPOINT intia_production_chain", "ROLLBACK TO SAVEPOINT intia_production_chain", "RELEASE SAVEPOINT intia_production_chain"]);
  assert.deepEqual(JSON.parse(warnings[0]), { event: "production_chain", operation: "video_created", reason: "error", code: "P1001" }, "sin datos personales");
  // TASK_MOVED no usa SAVEPOINT: su rechazo llega a quien movió la tarea.
  const moved = { $executeRawUnsafe: async (sql) => { raw.push(sql); return 0; }, productionStep: { findUnique: async () => null } };
  raw.length = 0;
  assert.deepEqual(await chain.chainEvent(moved, PEOPLE.owner, { type: "TASK_MOVED", taskId: "t", toColumnId: "c" }), { done: false, reason: "no_step" });
  assert.deepEqual(raw, []);
}));

/* ------------------------------------------------------------- CALENDARIO -- */

test("pasos en el calendario: fecha del plazo, orden de la cadena, hora solo en diseño y sin duplicar Grabar/Publicar", () => {
  const scope = load("src/lib/production-scope.ts", { "@/lib/prisma": { prisma: untouchable() } });
  const now = new Date("2026-09-30T15:00:00.000Z");
  const base = { contentItemId: "v1", brandId: "b1", assigneeId: "carlos", assignee: { name: "Carlos" }, contentItem: { title: "Video uno", brand: { name: "Con Amor" } } };
  const rows = [
    { ...base, id: "p", step: "PUBLICACION", status: "PENDIENTE", dueAt: new Date("2026-10-02T04:59:59.999Z") },
    { ...base, id: "g", step: "GRABACION", status: "PENDIENTE", dueAt: new Date("2026-09-30T04:59:59.999Z") },
    { ...base, id: "d", step: "DISENO", status: "PENDIENTE", dueAt: new Date("2026-10-01T20:30:00.000Z") },
    { ...base, id: "e", step: "EDICION", status: "HECHO", dueAt: new Date("2026-10-01T04:59:59.999Z") },
    { ...base, id: "x", step: "EDICION", status: "CANCELADO", dueAt: new Date("2026-10-01T04:59:59.999Z") },
    { ...base, id: "gu", step: "GUION", status: "PENDIENTE", dueAt: new Date("2026-10-01T04:59:59.999Z"), assigneeId: null, assignee: null },
  ];
  const entries = scope.toStepEntries(rows, now);
  assert.deepEqual(entries.map((e) => [e.id, e.dateKey]), [["g", "2026-09-29"], ["gu", "2026-09-30"], ["e", "2026-09-30"], ["p", "2026-10-01"], ["d", "2026-10-01"]], "dentro del día, el orden de la cadena y Diseño al final");
  const byId = Object.fromEntries(entries.map((e) => [e.id, e]));
  assert.equal(byId.g.overdue, true, "grabación de ayer sin hacer: vencida");
  assert.equal(byId.e.overdue, false, "lo hecho nunca sale vencido");
  assert.equal(byId.d.time, "15:30", "el diseño lleva hora (Lima)");
  assert.equal(byId.g.time, null);
  assert.deepEqual([byId.g.verb, byId.gu.verb, byId.e.verb, byId.p.verb], ["Grabar", "Escribir guion", "Editar", "Publicar"]);
  assert.equal(byId.gu.assigneeName, null, "sin asignar");
  assert.deepEqual(scope.coveredVideoDates(rows).sort(), ["v1:GRABACION", "v1:PUBLICACION"]);
});
