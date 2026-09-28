import assert from "node:assert/strict";
import { test } from "node:test";
import { load } from "./load-module.mjs";

/**
 * Flujo de producción por equipos (PRODUCTION_FLOW_ENABLED).
 *
 * Días hábiles puros (working-days.ts), el dominio real (domain/production-flow.ts) sobre
 * un Prisma en memoria, las Server Actions reales (production.ts, brand-team.ts) con la
 * política de permisos real, y el kill-switch: apagado no se toca la base.
 * La transacción serializable, las FK y los CHECK los cubre el ensayo de la migración.
 */

const days = load("src/lib/working-days.ts");
const permissions = load("src/lib/permissions.ts");

/* ---------------------------------------------------------- DÍAS HÁBILES -- */

// 2026-09-28 es lunes. 10-03 sábado, 10-04 domingo, 10-05 lunes.
const WEEK = { lun: "2026-09-28", mar: "2026-09-29", mie: "2026-09-30", jue: "2026-10-01", vie: "2026-10-02", sab: "2026-10-03", dom: "2026-10-04", lun2: "2026-10-05", mar2: "2026-10-06" };

test("días hábiles: lunes a sábado; el domingo nunca es día de trabajo", () => {
  assert.equal(days.isWorkingDay(WEEK.sab), true);
  assert.equal(days.isWorkingDay(WEEK.dom), false);
  assert.equal(days.weekdayOfKey(WEEK.lun), 1);
  assert.equal(days.addDaysToKey(WEEK.dom, 1), WEEK.lun2);
  assert.equal(days.addDaysToKey("2026-12-31", 1), "2027-01-01");
});

test("edición: lo del sábado se edita el lunes, lo del viernes el sábado y nunca vence en domingo", () => {
  assert.equal(days.nextWorkingDayKey(WEEK.sab), WEEK.lun2);
  assert.equal(days.nextWorkingDayKey(WEEK.dom), WEEK.lun2);
  assert.equal(days.nextWorkingDayKey(WEEK.vie), WEEK.sab);
  assert.equal(days.editingDueKey(WEEK.sab, WEEK.sab), WEEK.lun2);
  assert.equal(days.editingDueKey(WEEK.vie, WEEK.vie), WEEK.sab);
  for (let i = 0; i < 14; i++) {
    const shoot = days.addDaysToKey(WEEK.lun, i);
    assert.notEqual(days.weekdayOfKey(days.editingDueKey(shoot, shoot)), 0, `edición de ${shoot} cae en domingo`);
  }
  // Una grabación registrada tarde no nace vencida: hoy si es hábil, si no el siguiente.
  assert.equal(days.editingDueKey(WEEK.lun, WEEK.jue), WEEK.jue);
  assert.equal(days.editingDueKey(WEEK.lun, WEEK.dom), WEEK.lun2);
});

test("grabación: el próximo día elegido estrictamente después de hoy; sin días, el siguiente hábil", () => {
  assert.equal(days.nextRecordingDayKey(WEEK.lun, [2, 4]), WEEK.mar);
  assert.equal(days.nextRecordingDayKey(WEEK.mar, [2, 4]), WEEK.jue);
  assert.equal(days.nextRecordingDayKey(WEEK.jue, [2, 4]), WEEK.mar2);
  assert.equal(days.nextRecordingDayKey(WEEK.sab, []), WEEK.lun2);
  assert.equal(days.nextRecordingDayKey(WEEK.vie, [0, 7, 6]), WEEK.sab, "domingo y valores fuera de rango se ignoran");
  assert.deepEqual(days.parseRecordingWeekdays('[4,2,2,0,7,"x"]'), [2, 4]);
  assert.deepEqual(days.parseRecordingWeekdays("no-json"), []);
});

test("diseño en 24 horas: si vence en domingo pasa al lunes a la misma hora de Lima", () => {
  const sabado10 = new Date("2026-10-03T15:00:00.000Z"); // sábado 10:00 en Lima
  assert.equal(days.dueIn24hSkippingSunday(sabado10).toISOString(), "2026-10-05T15:00:00.000Z");
  const viernes10 = new Date("2026-10-02T15:00:00.000Z");
  assert.equal(days.dueIn24hSkippingSunday(viernes10).toISOString(), "2026-10-03T15:00:00.000Z");
  // Sábado 23:30 en Lima: 24 h después es domingo 23:30 → lunes 23:30.
  assert.equal(days.dueIn24hSkippingSunday(new Date("2026-10-04T04:30:00.000Z")).toISOString(), "2026-10-06T04:30:00.000Z");
});

test("publicación: día hábil siguiente, o la fecha prevista si es posterior; fin de día en Lima", () => {
  assert.equal(days.publicationDueKey(WEEK.sab, WEEK.jue), WEEK.lun2);
  assert.equal(days.publicationDueKey(WEEK.lun, WEEK.vie), WEEK.vie);
  assert.equal(days.endOfDayKey(WEEK.mar).toISOString(), "2026-09-30T04:59:59.999Z");
  assert.equal(days.dueLabel(new Date("2026-09-28T20:00:00Z"), new Date("2026-09-28T15:00:00Z")), "vence en 5 h");
  assert.equal(days.dueLabel(new Date("2026-09-28T12:00:00Z"), new Date("2026-09-28T15:00:00Z")), "venció hace 3 h");
});

/* ---------------------------------------------------------- BASE FALSA -- */

const PEOPLE = {
  owner: { id: "owner", name: "Yoryo", role: "OWNER", active: true, brandIds: [], profiles: [] },
  edward: { id: "edward", name: "Edward", role: "MEMBER", active: true, brandIds: ["b1"], profiles: ["WRITER", "STRATEGY"] },
  carlos: { id: "carlos", name: "Carlos", role: "MEMBER", active: true, brandIds: ["b1"], profiles: ["CAMERA"] },
  laudder: { id: "laudder", name: "Laudder", role: "MEMBER", active: true, brandIds: ["b1"], profiles: ["EDITOR"] },
  silvanna: { id: "silvanna", name: "Silvanna", role: "MEMBER", active: true, brandIds: ["b1"], profiles: ["PUBLISHER"] },
  diego: { id: "diego", name: "Diego", role: "MEMBER", active: true, brandIds: ["b1"], profiles: ["DESIGNER"] },
  ajeno: { id: "ajeno", name: "Ajeno", role: "MEMBER", active: true, brandIds: ["b2"], profiles: ["CAMERA", "DESIGNER"] },
  baja: { id: "baja", name: "De baja", role: "MEMBER", active: false, brandIds: ["b1"], profiles: ["CAMERA"] },
  writer2: { id: "writer2", name: "Paula", role: "MEMBER", active: true, brandIds: ["b1"], profiles: ["WRITER"] },
};

function fakeDb(overrides = {}) {
  let seq = 0;
  let clock = Date.parse("2026-09-28T12:00:00.000Z");
  const tick = () => new Date((clock += 1000));
  const state = {
    videos: [{ id: "v1", brandId: "b1", title: "Video uno", status: "GUION", shootDate: null, scheduledDate: new Date("2026-09-28T12:00:00.000Z"), scriptId: "s1", ...overrides.video }],
    settings: overrides.settings === null ? [] : [{ brandId: "b1", recordingWeekdays: "[2,4]", autoAssign: true, updatedAt: tick(), ...overrides.settings }],
    team: overrides.team ?? [
      { id: "t1", brandId: "b1", role: "ENCARGADO", userId: "edward" },
      { id: "t2", brandId: "b1", role: "GUIONISTA", userId: "edward" },
      { id: "t3", brandId: "b1", role: "FILMMAKER", userId: "carlos" },
      { id: "t4", brandId: "b1", role: "EDITOR", userId: "laudder" },
      { id: "t5", brandId: "b1", role: "COMMUNITY", userId: "silvanna" },
      { id: "t6", brandId: "b1", role: "DISENADOR", userId: "diego" },
    ],
    assignments: overrides.assignments ?? [],
    columns: overrides.columns ?? [{ id: "col-0", name: "Idea o Acción", brandId: null, order: 0 }],
    tasks: [],
    steps: overrides.steps ?? [],
    checklist: overrides.checklist ?? [
      { id: "c1", contentItemId: "v1", stage: "GRABACION", kind: "TASK", required: true, done: false },
      { id: "c2", contentItemId: "v1", stage: "GRABACION", kind: "TASK", required: false, done: false },
    ],
    brands: [{ id: "b1", name: "Con Amor" }, { id: "b2", name: "Otra" }],
    audits: [],
    raw: [],
  };
  const user = (id) => Object.values(PEOPLE).find((p) => p.id === id);
  const pick = (row, select) => {
    if (!row) return null;
    if (!select) return { ...row };
    const out = {};
    for (const key of Object.keys(select)) {
      if (key === "contentItem") out.contentItem = { title: state.videos.find((v) => v.id === row.contentItemId)?.title };
      else if (key === "assignee") out.assignee = row.assigneeId ? { name: user(row.assigneeId)?.name } : null;
      else if (key === "user") out.user = { name: user(row.userId)?.name };
      else out[key] = row[key];
    }
    return out;
  };
  const eligible = (id, brandId) => { const u = user(id); return u && u.active && (u.role === "OWNER" || u.brandIds.includes(brandId)) ? u : null; };
  /** Alcance de contentScope simulado: capacidad real + marca + (alcance asignado → asignación). */
  const visible = (video, scope) => {
    if (!video) return false;
    if (!scope) return true;
    const u = scope.user;
    if (!permissions.allows(u, scope.capability)) return false;
    if (u.role === "OWNER") return true;
    if (!u.brandIds.includes(video.brandId)) return false;
    return permissions.capabilityScope(u, scope.capability) === "brand" || state.assignments.some((a) => a.contentItemId === video.id && a.userId === u.id);
  };
  const stepWhere = (s, where = {}) => Object.entries(where).every(([k, v]) => (v && typeof v === "object" && "in" in v ? v.in.includes(s[k]) : s[k] === v));

  const db = {
    state,
    $executeRawUnsafe: async (sql) => { state.raw.push(sql); if (overrides.failOn && sql === overrides.failOn) throw Object.assign(new Error("boom"), { code: "P2010" }); return 0; },
    $executeRaw: async (strings) => { state.raw.push(strings.join("?")); return 0; },
    // Solo el bloqueo de los ajustes del equipo lee filas con SQL.
    $queryRaw: async (strings, ...values) => (strings.join("?").includes('"BrandProductionSettings"') ? state.settings.filter((s) => s.brandId === values[0]).map((s) => ({ ...s })) : []),
    contentItem: {
      findUnique: async ({ where, select }) => pick(state.videos.find((v) => v.id === where.id), select),
      findMany: async ({ where }) => state.videos.filter((v) => v.scriptId === where.scriptId).map((v) => ({ id: v.id })),
      count: async ({ where }) => {
        const id = where.AND ? where.AND[0].id : where.id;
        const video = state.videos.find((v) => v.id === id);
        return visible(video, where.AND?.[1]?.__scope) ? 1 : 0;
      },
      updateMany: async ({ where, data }) => {
        const video = state.videos.find((v) => v.id === where.id && (!("shootDate" in where) || v.shootDate === where.shootDate));
        if (!video) return { count: 0 };
        Object.assign(video, data);
        return { count: 1 };
      },
      update: async ({ where, data }) => { const video = state.videos.find((v) => v.id === where.id); Object.assign(video, data); return video; },
    },
    brand: { findUnique: async ({ where }) => state.brands.find((b) => b.id === where.id) ?? null },
    brandProductionSettings: {
      findUnique: async ({ where }) => state.settings.find((s) => s.brandId === where.brandId) ?? null,
      upsert: async ({ where, create, update }) => {
        const row = state.settings.find((s) => s.brandId === where.brandId);
        if (row) Object.assign(row, update, { updatedAt: tick() });
        else state.settings.push({ ...create, updatedAt: tick() });
        return {};
      },
    },
    brandTeamMember: {
      findMany: async ({ where }) => state.team.filter((t) => t.brandId === where.brandId).map((t) => ({ ...t, user: { name: user(t.userId)?.name } })),
      findUnique: async ({ where }) => state.team.find((t) => t.brandId === where.brandId_role.brandId && t.role === where.brandId_role.role) ?? null,
      create: async ({ data }) => { state.team.push({ id: `t${++seq}`, ...data }); return {}; },
      update: async ({ where, data }) => { Object.assign(state.team.find((t) => t.id === where.id), data); return {}; },
      delete: async ({ where }) => { state.team = state.team.filter((t) => t.id !== where.id); return {}; },
    },
    user: {
      findFirst: async ({ where }) => {
        const brandId = where.OR?.[1]?.brandAccess?.some?.brandId;
        const u = eligible(where.id, brandId);
        return u ? { id: u.id, name: u.name } : null;
      },
      findMany: async ({ where }) => {
        const brandId = where.OR?.[1]?.brandAccess?.some?.brandId;
        return where.id.in.map((id) => eligible(id, brandId)).filter(Boolean).map((u) => ({ id: u.id, name: u.name }));
      },
    },
    assignment: {
      findMany: async ({ where }) => state.assignments.filter((a) => a.contentItemId === where.contentItemId && a.role === where.role),
      findUnique: async ({ where }) => { const k = where.contentItemId_userId_role; return state.assignments.find((a) => a.contentItemId === k.contentItemId && a.userId === k.userId && a.role === k.role) ?? null; },
      create: async ({ data }) => { const row = { id: `a${++seq}`, createdAt: tick(), ...data }; state.assignments.push(row); return { id: row.id }; },
    },
    taskColumn: {
      findFirst: async ({ where, orderBy }) => {
        const list = [...state.columns].filter((c) => !where || where.OR.some((o) => c.brandId === o.brandId)).sort((a, b) => a.order - b.order);
        if (orderBy && !Array.isArray(orderBy) && orderBy.order === "desc") list.reverse();
        return list[0] ?? null;
      },
      count: async () => state.columns.length,
      upsert: async ({ where, create }) => { if (!state.columns.some((c) => c.id === where.id)) state.columns.push({ ...create }); return {}; },
      create: async ({ data }) => { const row = { id: `col-${++seq}`, ...data }; state.columns.push(row); return row; },
    },
    task: {
      findFirst: async ({ where }) => state.tasks.filter((t) => t.columnId === where.columnId).sort((a, b) => b.order - a.order)[0] ?? null,
      create: async ({ data }) => { const row = { id: `task${++seq}`, ...data }; state.tasks.push(row); return { id: row.id, title: row.title }; },
      findUnique: async ({ where }) => state.tasks.find((t) => t.id === where.id) ?? null,
      update: async ({ where, data }) => { Object.assign(state.tasks.find((t) => t.id === where.id), data); return {}; },
    },
    productionStep: {
      findUnique: async ({ where, select }) => pick(state.steps.find((s) => (where.id ? s.id === where.id : s.automationKey === where.automationKey)), select),
      findUniqueOrThrow: async ({ where, select }) => { const s = state.steps.find((x) => x.id === where.id); if (!s) throw new Error("no existe"); return pick(s, select); },
      create: async ({ data }) => {
        if (state.steps.some((s) => s.automationKey === data.automationKey)) throw Object.assign(new Error("único"), { code: "P2002" });
        const row = { id: `step${++seq}`, status: "PENDIENTE", doneAt: null, materialUrl: null, updatedAt: tick(), ...data };
        state.steps.push(row);
        return { id: row.id };
      },
      update: async ({ where, data }) => { Object.assign(state.steps.find((s) => s.id === where.id), data, { updatedAt: tick() }); return {}; },
      updateMany: async ({ where, data }) => { const rows = state.steps.filter((s) => stepWhere(s, where)); rows.forEach((s) => Object.assign(s, data)); return { count: rows.length }; },
      count: async ({ where }) => state.steps.filter((s) => stepWhere(s, where)).length,
    },
    checklistItem: {
      count: async ({ where }) => state.checklist.filter((c) => c.contentItemId === where.contentItemId && c.stage === where.stage && c.kind === where.kind && c.required === where.required && c.done === where.done).length,
    },
    auditLog: { create: async ({ data }) => { state.audits.push(data); return data; } },
  };
  return db;
}

async function withFlag(value, work) {
  const old = process.env.PRODUCTION_FLOW_ENABLED;
  if (value === undefined) delete process.env.PRODUCTION_FLOW_ENABLED; else process.env.PRODUCTION_FLOW_ENABLED = value;
  try { return await work(); } finally { if (old === undefined) delete process.env.PRODUCTION_FLOW_ENABLED; else process.env.PRODUCTION_FLOW_ENABLED = old; }
}

function domain(prisma = {}) {
  return load("src/lib/domain/production-flow.ts", {
    "@/lib/prisma": { prisma },
    "@/lib/auth": { clientIp: async () => "127.0.0.1" },
  });
}
const silence = async (work) => { const { info, warn } = console; console.info = () => {}; console.warn = () => {}; try { return await work(); } finally { console.info = info; console.warn = warn; } };

const MON_10 = new Date("2026-09-28T15:00:00.000Z"); // lunes 10:00 en Lima

/* -------------------------------------------------------------- DOMINIO -- */

test("guion unido: grabación el próximo martes/jueves con el filmmaker, tarea en el tablero y todo auditado", () => withFlag("true", async () => {
  const db = fakeDb();
  const flow = domain();
  const result = await flow.scheduleRecording(db, PEOPLE.edward, "v1", { now: MON_10 });
  assert.equal(result.done, true);
  const video = db.state.videos[0];
  assert.equal(video.shootDate.toISOString(), "2026-09-29T12:00:00.000Z", "martes");
  const [step] = db.state.steps;
  assert.equal(step.step, "GRABACION");
  assert.equal(step.assigneeId, "carlos");
  assert.equal(step.dueAt.toISOString(), "2026-09-30T04:59:59.999Z", "fin del martes en Lima");
  assert.equal(step.automationKey, "v1:GRABACION");
  assert.deepEqual(db.state.assignments.map((a) => [a.userId, a.role]), [["carlos", "CAMARA"]]);
  const [task] = db.state.tasks;
  assert.equal(task.title, "Grabar: Video uno");
  assert.equal(task.assigneeId, "carlos");
  assert.equal(task.columnId, "col-0");
  assert.equal(task.dueDate.toISOString(), "2026-09-29T12:00:00.000Z");
  assert.equal(step.taskId, task.id);
  assert.ok(db.state.raw.includes("SAVEPOINT intia_production_flow") && db.state.raw.includes("RELEASE SAVEPOINT intia_production_flow"));
  const entities = db.state.audits.map((a) => `${a.action}:${a.entity}`);
  assert.deepEqual(entities.sort(), ["ASIGNAR:Assignment", "ASIGNAR:ProductionStep", "CREAR:Task", "EDITAR:ContentItem"].sort());
  assert.ok(db.state.audits.every((a) => a.userName === "Edward"));

  // Idempotente: repetir el disparo (p. ej. al aprobar el guion) no duplica nada.
  const again = await flow.scheduleRecording(db, PEOPLE.edward, "v1", { now: MON_10 });
  assert.deepEqual(again, { done: false, reason: "exists" });
  assert.equal(db.state.steps.length, 1);
  assert.equal(db.state.tasks.length, 1);
  assert.equal(db.state.assignments.length, 1);
}));

test("nunca pisa datos manuales: fecha de grabación puesta y cámara asignada a mano mandan", () => withFlag("true", async () => {
  const shoot = new Date("2026-10-02T12:00:00.000Z"); // viernes elegido a mano
  const db = fakeDb({
    video: { shootDate: shoot },
    assignments: [{ id: "manual", contentItemId: "v1", userId: "edward", role: "CAMARA", createdAt: new Date() }],
  });
  const result = await domain().scheduleRecording(db, PEOPLE.owner, "v1", { now: MON_10 });
  assert.equal(result.done, true);
  assert.equal(db.state.videos[0].shootDate, shoot, "no se cambia la fecha manual");
  assert.equal(db.state.steps[0].assigneeId, "edward", "la asignación del video manda sobre la persona por defecto");
  assert.equal(db.state.steps[0].dueAt.toISOString(), "2026-10-03T04:59:59.999Z");
  assert.equal(db.state.assignments.length, 1, "no se añade otra cámara");
  assert.ok(!db.state.audits.some((a) => a.entity === "ContentItem"));
}));

test("una asignación manual de alguien sin acceso o de baja no bloquea: se usa el equipo de la marca", () => withFlag("true", async () => {
  const db = fakeDb({ assignments: [{ id: "old", contentItemId: "v1", userId: "baja", role: "CAMARA", createdAt: new Date() }] });
  await domain().scheduleRecording(db, null, "v1", { now: MON_10 });
  assert.equal(db.state.steps[0].assigneeId, "carlos");
  assert.ok(db.state.audits.every((a) => a.userName === "Sistema"), "sin actor firma Sistema");
}));

test("sin persona para la función, con la asignación automática apagada o en otro estado: no escribe nada", () => withFlag("true", async () => {
  for (const [label, db, reason] of [
    ["marca sin equipo", fakeDb({ team: [] }), "no_team"],
    ["marca sin equipo aunque el video tenga cámara a mano", fakeDb({ team: [], assignments: [{ id: "m", contentItemId: "v1", userId: "carlos", role: "CAMARA", createdAt: new Date() }] }), "no_team"],
    ["equipo sin filmmaker", fakeDb({ team: [{ id: "t", brandId: "b1", role: "EDITOR", userId: "laudder" }] }), "no_assignee"],
    ["filmmaker sin acceso", fakeDb({ team: [{ id: "t", brandId: "b1", role: "FILMMAKER", userId: "ajeno" }] }), "no_assignee"],
    ["automático apagado", fakeDb({ settings: { autoAssign: false } }), "auto_off"],
    ["video publicado", fakeDb({ video: { status: "PUBLICADO" } }), "video_status"],
  ]) {
    const result = await silence(() => domain().scheduleRecording(db, PEOPLE.owner, "v1", { now: MON_10 }));
    assert.deepEqual(result, { done: false, reason }, label);
    assert.equal(db.state.steps.length + db.state.tasks.length + db.state.audits.length, 0, label);
    assert.ok(db.state.assignments.every((a) => a.id === "m"), label);
    assert.equal(db.state.videos[0].shootDate, null, label);
  }
}));

test("sin ajustes guardados: asignación automática activa y se graba el siguiente día hábil", () => withFlag("true", async () => {
  const db = fakeDb({ settings: null });
  const saturday = new Date("2026-10-03T15:00:00.000Z");
  await domain().scheduleRecording(db, null, "v1", { now: saturday });
  assert.equal(db.state.videos[0].shootDate.toISOString(), "2026-10-05T12:00:00.000Z", "sábado → lunes");
}));

test("grabación del sábado sin marcar: el mantenimiento del domingo asigna edición para el lunes y cierra la grabación", () => withFlag("true", async () => {
  const db = fakeDb({
    video: { status: "GRABACION", shootDate: new Date("2026-10-03T12:00:00.000Z") },
    steps: [{ id: "g1", contentItemId: "v1", brandId: "b1", step: "GRABACION", assigneeId: "carlos", status: "PENDIENTE", doneAt: null, materialUrl: "https://drive.google.com/drive/folders/abc", automationKey: "v1:GRABACION", dueAt: new Date(), updatedAt: new Date() }],
  });
  const sunday = new Date("2026-10-04T10:00:00.000Z"); // domingo 05:00 en Lima
  const result = await domain().assignEditing(db, null, "v1", { now: sunday });
  assert.equal(result.done, true);
  const edit = db.state.steps.find((s) => s.step === "EDICION");
  assert.equal(edit.assigneeId, "laudder");
  assert.equal(edit.dueAt.toISOString(), "2026-10-06T04:59:59.999Z", "fin del lunes en Lima");
  assert.equal(edit.materialUrl, "https://drive.google.com/drive/folders/abc", "el editor recibe el material del filmmaker");
  const recording = db.state.steps.find((s) => s.step === "GRABACION");
  assert.equal(recording.status, "HECHO");
  assert.ok(recording.doneAt instanceof Date);
  assert.deepEqual(db.state.assignments.map((a) => [a.userId, a.role]), [["laudder", "EDITOR"]]);
  assert.equal(db.state.tasks[0].title, "Editar: Video uno");
  assert.ok(db.state.audits.some((a) => a.action === "COMPLETAR" && a.entity === "ProductionStep"));
}));

test("grabación terminada por los checks: solo con todos los obligatorios; el viernes se edita el sábado", () => withFlag("true", async () => {
  const friday = new Date("2026-10-02T20:00:00.000Z");
  const db = fakeDb({ video: { status: "GRABACION", shootDate: new Date("2026-10-02T12:00:00.000Z") } });
  const flow = domain();
  await flow.onChecklistCompleted(db, PEOPLE.carlos, { contentItemId: "v1", stage: "GRABACION", kind: "TASK" });
  assert.equal(db.state.steps.length, 0, "falta un check obligatorio de grabación");
  db.state.checklist[0].done = true;
  const result = await flow.assignEditing(db, PEOPLE.carlos, "v1", { now: friday, recordedNow: true, requireRecordingChecks: true });
  assert.equal(result.done, true);
  assert.equal(db.state.steps[0].dueAt.toISOString(), "2026-10-04T04:59:59.999Z", "fin del sábado en Lima");
}));

test("revisión final aprobada: community publica al día hábil siguiente y el calendario se corre si iba antes", () => withFlag("true", async () => {
  const saturday = new Date("2026-10-03T15:00:00.000Z");
  const db = fakeDb({
    video: { status: "EDICION", scheduledDate: new Date("2026-10-01T12:00:00.000Z") },
    steps: [{ id: "e1", contentItemId: "v1", brandId: "b1", step: "EDICION", assigneeId: "laudder", status: "PENDIENTE", doneAt: null, automationKey: "v1:EDICION", dueAt: new Date(), updatedAt: new Date() }],
  });
  const result = await domain().assignPublishing(db, PEOPLE.owner, "v1", { now: saturday, moveCalendar: true });
  assert.equal(result.done, true);
  assert.equal(db.state.videos[0].scheduledDate.toISOString(), "2026-10-05T12:00:00.000Z", "lunes: el domingo no se publica");
  const pub = db.state.steps.find((s) => s.step === "PUBLICACION");
  assert.equal(pub.assigneeId, "silvanna");
  assert.equal(pub.dueAt.toISOString(), "2026-10-06T04:59:59.999Z");
  assert.equal(db.state.steps.find((s) => s.step === "EDICION").status, "HECHO");
  const moved = db.state.audits.find((a) => a.entity === "ContentItem");
  assert.equal(JSON.parse(moved.changes).scheduledDate.antes, "2026-10-01T12:00:00.000Z");
  assert.deepEqual(db.state.assignments.map((a) => a.role), ["COMMUNITY"]);
}));

test("una fecha prevista posterior se respeta: la publicación vence ese día y no se mueve", () => withFlag("true", async () => {
  const db = fakeDb({ video: { status: "EDICION", scheduledDate: new Date("2026-10-09T12:00:00.000Z") } });
  await domain().assignPublishing(db, PEOPLE.owner, "v1", { now: MON_10, moveCalendar: true });
  assert.equal(db.state.videos[0].scheduledDate.toISOString(), "2026-10-09T12:00:00.000Z");
  assert.equal(db.state.steps[0].dueAt.toISOString(), "2026-10-10T04:59:59.999Z");
}));

test("un fallo de la automatización se deshace en su SAVEPOINT y no rompe la acción principal", () => withFlag("true", async () => {
  const db = fakeDb();
  db.task.create = async () => { throw Object.assign(new Error("fallo de red"), { code: "P1001" }); };
  const warnings = [];
  const { warn } = console;
  console.warn = (line) => warnings.push(line);
  try {
    const result = await domain().scheduleRecording(db, PEOPLE.edward, "v1", { now: MON_10 });
    assert.deepEqual(result, { done: false, reason: "error" });
  } finally { console.warn = warn; }
  assert.ok(db.state.raw.includes("ROLLBACK TO SAVEPOINT intia_production_flow"));
  assert.deepEqual(JSON.parse(warnings[0]), { event: "production_flow", operation: "schedule_recording", reason: "error", code: "P1001" }, "motivo cerrado, sin datos personales");
}));

test("sin tablero de tareas: siembra las columnas iniciales; con columnas solo de otra marca crea «Producción»", () => withFlag("true", async () => {
  const empty = fakeDb({ columns: [] });
  await domain().scheduleRecording(empty, null, "v1", { now: MON_10 });
  assert.equal(empty.state.columns.length, 5);
  assert.equal(empty.state.tasks[0].columnId, "initial-task-column-0");
  assert.ok(empty.state.raw.some((sql) => sql.includes("pg_advisory_xact_lock(781240110)")));
  const other = fakeDb({ columns: [{ id: "otra", name: "Otra", brandId: "b2", order: 0 }] });
  await domain().scheduleRecording(other, null, "v1", { now: MON_10 });
  const created = other.state.columns.find((c) => c.brandId === "b1");
  assert.equal(created.name, "Producción");
  assert.equal(other.state.tasks[0].columnId, created.id);
}));

test("fecha de grabación cambiada a mano: la grabación automática y su tarea la siguen; la manual no se toca", () => withFlag("true", async () => {
  const db = fakeDb({ video: { shootDate: new Date("2026-10-01T12:00:00.000Z") }, steps: [{ id: "g1", contentItemId: "v1", brandId: "b1", step: "GRABACION", status: "PENDIENTE", source: "AUTO", taskId: "task-g", automationKey: "v1:GRABACION", dueAt: new Date("2026-09-30T04:59:59.999Z") }] });
  db.state.tasks.push({ id: "task-g", dueDate: new Date("2026-09-29T12:00:00.000Z") });
  db.task.updateMany = async ({ where, data }) => { Object.assign(db.state.tasks.find((t) => t.id === where.id), data); return { count: 1 }; };
  const flow = domain();
  await flow.onShootDateChanged(db, PEOPLE.edward, "v1");
  assert.equal(db.state.steps[0].dueAt.toISOString(), "2026-10-02T04:59:59.999Z", "fin del jueves en Lima");
  assert.equal(db.state.tasks[0].dueDate.toISOString(), "2026-10-01T12:00:00.000Z");
  db.state.steps[0].source = "MANUAL";
  db.state.videos[0].shootDate = new Date("2026-10-03T12:00:00.000Z");
  assert.deepEqual(await flow.syncRecordingDate(db, PEOPLE.edward, "v1"), { done: false, reason: "exists" });
  assert.equal(db.state.steps[0].dueAt.toISOString(), "2026-10-02T04:59:59.999Z");
}));

test("video cancelado: los pasos pendientes se cancelan", () => withFlag("true", async () => {
  const db = fakeDb({ steps: [{ id: "g1", contentItemId: "v1", brandId: "b1", step: "GRABACION", status: "PENDIENTE", automationKey: "v1:GRABACION" }] });
  await domain().onVideoStatusChanged(db, PEOPLE.owner, "v1", "CANCELADO");
  assert.equal(db.state.steps[0].status, "CANCELADO");
}));

/* ------------------------------------------------------------ KILL-SWITCH -- */

const untouchable = () => new Proxy({}, { get(_target, key) { throw new Error(`Con el flag apagado no se toca la base (${String(key)})`); } });

test("flag apagado: ganchos, pasos y mantenimiento no consultan nada (ni las tablas nuevas)", () => withFlag(undefined, async () => {
  const flow = domain(untouchable());
  const tx = untouchable();
  await flow.onScriptLinked(tx, PEOPLE.owner, "v1");
  await flow.onScriptApproved(tx, PEOPLE.owner, "s1");
  for (const status of ["APROBADO", "EDICION", "PROGRAMADO", "CANCELADO"]) await flow.onVideoStatusChanged(tx, PEOPLE.owner, "v1", status);
  await flow.onChecklistCompleted(tx, PEOPLE.owner, { contentItemId: "v1", stage: "GRABACION", kind: "TASK" });
  await flow.onChecklistCompleted(tx, PEOPLE.owner, { contentItemId: "v1", stage: "POSTPRODUCCION", kind: "FINAL_APPROVAL" });
  await flow.onStepCompleted(tx, PEOPLE.owner, { contentItemId: "v1", step: "GRABACION" });
  await flow.onShootDateChanged(tx, PEOPLE.owner, "v1");
  assert.deepEqual(await flow.scheduleRecording(tx, null, "v1"), { done: false, reason: "flag_off" });
  const sweep = load("src/lib/production-sweep.ts", { "@/lib/prisma": { prisma: untouchable() } });
  assert.deepEqual(await sweep.runProductionSweep(), { enabled: false, candidates: 0, assigned: 0, skipped: 0, failed: 0 });
  // Cualquier valor distinto de "true" cuenta como apagado.
  process.env.PRODUCTION_FLOW_ENABLED = "1";
  await flow.onScriptLinked(tx, PEOPLE.owner, "v1");
}));

test("vincularGuionAVideo dispara la grabación solo cuando el vínculo se escribió", async () => {
  const calls = [];
  const video = { id: "v1", title: "Video", brandId: "b1", status: "IDEA", scriptId: null, structureId: null, script: null, structure: null, updatedAt: new Date("2026-09-28T12:00:00.000Z") };
  const make = (count) => ({
    $queryRaw: async () => [],
    contentItem: {
      count: async ({ where }) => (JSON.stringify(where).includes("FINAL_APPROVAL") ? 0 : 1),
      findUnique: async () => video,
      findUniqueOrThrow: async () => ({ updatedAt: video.updatedAt }),
      updateMany: async () => ({ count }),
    },
    script: { findUnique: async () => ({ id: "s1", title: "Guion", structureId: "est", brandId: "b1", updatedAt: new Date(), structure: { name: "Est" } }) },
    auditLog: { create: async () => ({}) },
  });
  const persist = (prisma) => load("src/lib/generation-persist.ts", {
    "@/lib/prisma": { prisma },
    "@/lib/auth": { clientIp: async () => "127.0.0.1" },
    "@/lib/ai": { normalizeSceneTimes: (x) => x },
    "@/lib/access-scope": { contentScope: () => ({}), closedVideoWhere: { checklist: { some: { kind: "FINAL_APPROVAL", done: true } } } },
    "@/lib/domain/production-flow": { onScriptLinked: async (_tx, user, id) => calls.push([user.id, id]) },
  });
  const linked = await persist(make(1)).vincularGuionAVideo(make(1), PEOPLE.edward, "s1", "v1");
  assert.equal(linked.linked, true);
  assert.deepEqual(calls, [["edward", "v1"]]);
  const blocked = await persist(make(0)).vincularGuionAVideo(make(0), PEOPLE.edward, "s1", "v1");
  assert.equal(blocked.linked, false);
  assert.equal(calls.length, 1, "sin vínculo no se programa nada");
});

/* -------------------------------------------------------------- ACCIONES -- */

function form(entries) {
  const fd = new FormData();
  for (const [k, v] of entries) fd.append(k, v);
  return fd;
}

function actions(db, current, extra = {}) {
  const calls = { revalidated: [], locks: [] };
  const mocks = {
    "next/cache": { revalidatePath: (path) => calls.revalidated.push(path) },
    "@/lib/prisma": { prisma: db },
    "@/lib/auth": {
      LEVEL: { MEMBER: 1, OWNER: 2 },
      clientIp: async () => "127.0.0.1",
      requireLevel: async () => { if (!current.user) throw new Error("sin sesión"); return current.user; },
      requirePermission: async (capability) => { permissions.assertPermission(current.user, capability); return current.user; },
    },
    "@/lib/mutations": {
      EDIT_CONFLICT: "conflicto",
      withMutation: async (_user, _owner, work) => { const effects = []; const result = await work(db, (e) => effects.push(e)); effects.forEach((e) => e()); return result; },
      lockRevision: async (_tx, model, id) => { calls.locks.push([model, id]); },
    },
    "@/lib/access-scope": {
      contentScope: (user, capability = "content.view") => ({ __scope: { user, capability } }),
      assertContentAccess: async (tx, user, id, capability = "content.view") => {
        permissions.assertPermission(user, capability);
        if (!await tx.contentItem.count({ where: { AND: [{ id }, { __scope: { user, capability } }] } })) throw new Error("No tienes acceso a este video.");
      },
    },
    ...extra,
  };
  return { production: load("src/app/actions/production.ts", mocks), team: load("src/app/actions/brand-team.ts", mocks), calls };
}

test("acciones con el flag apagado: responden sin sesión ni base", () => withFlag(undefined, async () => {
  const { production, team } = actions(untouchable(), { user: null });
  const apagado = { error: "El flujo de producción no está activo." };
  assert.deepEqual(await production.pedirDiseno(form([["contentItemId", "v1"]])), apagado);
  assert.deepEqual(await production.marcarPaso(form([["id", "x"]])), apagado);
  assert.deepEqual(await production.guardarMaterialPaso(form([["id", "x"]])), apagado);
  assert.deepEqual(await production.reasignarPaso(form([["id", "x"]])), apagado);
  assert.deepEqual(await team.guardarEquipoDeMarca(form([["brandId", "b1"]])), apagado);
}));

test("pedir diseño: guionista con acceso sí, diseñador o analista no; vence en 24 h sin domingo y da acceso al diseñador", () => withFlag("true", async () => {
  const db = fakeDb();
  const current = { user: PEOPLE.diego };
  const { production } = actions(db, current);
  assert.deepEqual(await production.pedirDiseno(form([["contentItemId", "v1"]])), { error: "Tu perfil no puede pedir diseños." });

  current.user = PEOPLE.edward;
  const before = new Date();
  assert.equal(await production.pedirDiseno(form([["contentItemId", "v1"], ["notes", "Miniatura con el hook"]])), undefined);
  const after = new Date();
  const [step] = db.state.steps;
  assert.equal(step.step, "DISENO");
  assert.equal(step.assigneeId, "diego", "diseñador por defecto de la marca");
  assert.equal(step.source, "MANUAL");
  assert.equal(step.requestedById, "edward");
  assert.match(step.automationKey, /^v1:DISENO:[0-9a-f-]{36}$/);
  assert.ok(step.dueAt >= days.dueIn24hSkippingSunday(before) && step.dueAt <= days.dueIn24hSkippingSunday(after));
  assert.notEqual(days.weekdayOfKey(load("src/lib/utils.ts").dateKey(step.dueAt)), 0);
  assert.deepEqual(db.state.assignments.map((a) => [a.userId, a.role]), [["diego", "DISENO"]]);
  assert.equal(db.state.tasks[0].title, "Diseño: Video uno");

  // Un segundo pedido es otro paso (clave distinta), no se confunde con el primero.
  await production.pedirDiseno(form([["contentItemId", "v1"]]));
  assert.equal(db.state.steps.length, 2);

  // Persona sin acceso a la marca: error legible y nada escrito.
  const res = await production.pedirDiseno(form([["contentItemId", "v1"], ["designerId", "ajeno"]]));
  assert.deepEqual(res, { error: "La persona debe estar activa y autorizada para esta marca." });
  assert.equal(db.state.steps.length, 2);

  // Guionista de otra marca: sin acceso al video.
  current.user = { ...PEOPLE.writer2, brandIds: ["b2"] };
  assert.deepEqual(await production.pedirDiseno(form([["contentItemId", "v1"]])), { error: "No tienes acceso a este video." });
}));

const stepRow = (extra = {}) => ({ id: "g1", contentItemId: "v1", brandId: "b1", step: "GRABACION", assigneeId: "carlos", status: "PENDIENTE", doneAt: null, materialUrl: null, taskId: null, automationKey: "v1:GRABACION", dueAt: new Date("2026-09-30T04:59:59.999Z"), updatedAt: new Date(), ...extra });

test("marcar hecho: la persona asignada o coordinación; al terminar la grabación se asigna la edición", () => withFlag("true", async () => {
  const db = fakeDb({
    video: { status: "GRABACION", shootDate: new Date("2026-09-29T12:00:00.000Z") },
    steps: [stepRow()],
    assignments: [{ id: "a-c", contentItemId: "v1", userId: "carlos", role: "CAMARA", createdAt: new Date() }, { id: "a-l", contentItemId: "v1", userId: "laudder", role: "EDITOR", createdAt: new Date() }],
  });
  const current = { user: PEOPLE.laudder };
  const { production, calls } = actions(db, current);
  const done = form([["id", "g1"], ["done", "1"], ["expectedUpdatedAt", new Date().toISOString()]]);
  assert.deepEqual(await production.marcarPaso(done), { error: "Solo coordinación o la persona asignada pueden actualizar este paso." });
  assert.equal(db.state.steps[0].status, "PENDIENTE");

  current.user = PEOPLE.carlos;
  assert.equal(await production.marcarPaso(done), undefined);
  assert.deepEqual(calls.locks[0], ["ProductionStep", "g1"], "revisión del paso bloqueada");
  assert.equal(db.state.steps[0].status, "HECHO");
  const edit = db.state.steps.find((s) => s.step === "EDICION");
  assert.equal(edit.assigneeId, "laudder", "la asignación EDITOR del video manda");
  assert.equal(db.state.assignments.length, 2, "no se duplica la asignación del editor");
  assert.ok(calls.revalidated.includes("/tareas"));
}));

test("material en la nube: solo enlaces http(s); el filmmaker puede dejarlo en la edición", () => withFlag("true", async () => {
  const db = fakeDb({
    video: { status: "EDICION" },
    steps: [stepRow({ status: "HECHO", doneAt: new Date() }), stepRow({ id: "e1", step: "EDICION", assigneeId: "laudder", automationKey: "v1:EDICION" })],
    assignments: [{ id: "a-c", contentItemId: "v1", userId: "carlos", role: "CAMARA", createdAt: new Date() }, { id: "a-d", contentItemId: "v1", userId: "diego", role: "DISENO", createdAt: new Date() }],
  });
  const current = { user: PEOPLE.carlos };
  const { production } = actions(db, current);
  const rev = ["expectedUpdatedAt", new Date().toISOString()];
  assert.match((await production.guardarMaterialPaso(form([["id", "e1"], ["materialUrl", "javascript:alert(1)"], rev]))).error, /https/);
  assert.match((await production.guardarMaterialPaso(form([["id", "e1"], ["materialUrl", "https://x.test/a b"], rev]))).error, /https/);
  assert.equal(await production.guardarMaterialPaso(form([["id", "e1"], ["materialUrl", "https://drive.google.com/drive/folders/xyz"], rev])), undefined);
  assert.equal(db.state.steps[1].materialUrl, "https://drive.google.com/drive/folders/xyz");
  const audit = db.state.audits.at(-1);
  assert.equal(JSON.parse(audit.changes).materialUrl.etiqueta, "Material en la nube");

  current.user = PEOPLE.diego; // ve el video por su asignación de diseño, pero no es de este paso
  assert.deepEqual(await production.guardarMaterialPaso(form([["id", "e1"], ["materialUrl", "https://x.test/y"], rev])), { error: "Solo coordinación o la persona asignada pueden actualizar este paso." });
}));

test("reasignar es de coordinación: exige content.assign, persona autorizada y deja el paso como manual", () => withFlag("true", async () => {
  const db = fakeDb({ video: { status: "GRABACION" }, steps: [stepRow({ taskId: "task-x" })] });
  db.state.tasks.push({ id: "task-x", title: "Grabar: Video uno", assigneeId: "carlos", dueDate: new Date("2026-09-29T12:00:00.000Z"), brandId: "b1" });
  const current = { user: PEOPLE.carlos };
  const { production } = actions(db, current);
  const request = (assigneeId) => form([["id", "g1"], ["assigneeId", assigneeId], ["dueDate", "2026-10-01"], ["dueTime", ""], ["expectedUpdatedAt", new Date().toISOString()]]);
  await assert.rejects(production.reasignarPaso(request("edward")), /permiso/);

  current.user = PEOPLE.edward; // STRATEGY: content.assign en su marca
  assert.deepEqual(await production.reasignarPaso(request("ajeno")), { error: "La persona debe estar activa y autorizada para esta marca." });
  assert.equal(await production.reasignarPaso(request("owner")), undefined);
  const step = db.state.steps[0];
  assert.equal(step.assigneeId, "owner");
  assert.equal(step.source, "MANUAL");
  assert.equal(step.dueAt.toISOString(), "2026-10-02T04:59:59.999Z");
  assert.equal(db.state.tasks[0].assigneeId, "owner", "la tarea sigue al paso");
  assert.deepEqual(db.state.assignments.map((a) => [a.userId, a.role]), [["owner", "CAMARA"]]);
  assert.match((await production.reasignarPaso(form([["id", "g1"], ["assigneeId", "owner"], ["dueDate", "2026-02-31"]]))).error, /fecha/);
}));

test("equipo de marca: brands.edit sobre la marca, personas autorizadas, días de lunes a sábado y auditoría por función", () => withFlag("true", async () => {
  const db = fakeDb({ settings: null, team: [] });
  const current = { user: PEOPLE.carlos };
  const { team } = actions(db, current);
  const payload = (extra = []) => form([["brandId", "b1"], ["expectedUpdatedAt", "new"], ["role-ENCARGADO", "edward"], ["role-FILMMAKER", "carlos"], ["recordingWeekdays", "4"], ["recordingWeekdays", "2"], ["autoAssign", "1"], ...extra]);
  await assert.rejects(team.guardarEquipoDeMarca(payload()), /permiso/, "un filmmaker no edita la marca");

  current.user = { ...PEOPLE.edward, brandIds: ["b2"] };
  await assert.rejects(team.guardarEquipoDeMarca(payload()), /acceso a esta marca/);

  current.user = PEOPLE.edward;
  assert.match((await team.guardarEquipoDeMarca(form([["brandId", "b1"], ["expectedUpdatedAt", "new"], ["recordingWeekdays", "0"]]))).error, /domingo/);
  assert.match((await team.guardarEquipoDeMarca(payload([["role-EDITOR", "ajeno"]]))).error, /autorizada/);
  assert.equal(db.state.team.length, 0);

  assert.equal(await team.guardarEquipoDeMarca(payload()), undefined);
  assert.deepEqual(db.state.team.map((t) => [t.role, t.userId]).sort(), [["ENCARGADO", "edward"], ["FILMMAKER", "carlos"]]);
  assert.equal(db.state.settings[0].recordingWeekdays, "[2,4]");
  const audit = db.state.audits.at(-1);
  assert.equal(audit.entity, "BrandTeamMember");
  const changes = JSON.parse(audit.changes);
  assert.equal(changes.FILMMAKER.despues, "carlos");
  assert.equal(changes.FILMMAKER.verDespues, "Carlos");
  assert.equal(changes.recordingWeekdays.verDespues, "martes, jueves");

  // Revisión vieja: conflicto y nada cambia.
  assert.deepEqual(await team.guardarEquipoDeMarca(payload([["role-EDITOR", "laudder"]])), { error: "conflicto" });
  assert.equal(db.state.team.length, 2);
}));
