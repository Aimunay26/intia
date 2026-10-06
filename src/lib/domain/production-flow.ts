import { assertPreparationReady, invalidateTeamPreparation } from "@/lib/preparation";
import { randomUUID } from "node:crypto";
import { invalidateRecordingPreparation, syncVideoStepDate, stepTaskDescription } from "@/lib/domain/production-dates";
import type { SessionUser } from "@/lib/auth";
import type { AppTransaction } from "@/lib/prisma";
import { auditInTransaction } from "@/lib/audit";
import { ASSIGNMENT_ROLE_MAP, PRODUCTION_STEP_MAP } from "@/lib/constants";
import { productionChainConfigured, productionChainEnabled } from "@/lib/production-chain-flag";
import { productionFlowEnabled } from "@/lib/production-flow-flag";
import { DEFAULT_TASK_COLUMNS } from "@/lib/tasks-constants";
import { findWorkAssignee, stepAssigneeCapabilities } from "@/lib/work-assignees";
import type { Capability } from "@/lib/permissions";
import { dateKey, formatDateLong, formatDateTime, fromDateKey } from "@/lib/utils";
import {
  dueIn24hSkippingSunday,
  editingDueKey,
  endOfDayKey,
  nextRecordingDayKey,
  parseRecordingWeekdays,
  publicationDueKey,
} from "@/lib/working-days";

/**
 * Flujo de producción por equipos (PRODUCTION_FLOW_ENABLED).
 *
 *   guion unido o aprobado → grabación en el próximo día de grabación de la marca (filmmaker)
 *   grabación terminada    → edición en el día hábil siguiente, sábado → lunes (editor)
 *   revisión final         → publicación al día hábil siguiente (community)
 *   pedido del guionista   → diseño en 24 horas, sin contar el domingo (diseñador)
 *
 * Reglas:
 *  - Apagado el flag, nada aquí toca la base: cada entrada vuelve antes de la primera consulta.
 *  - Idempotente por ProductionStep.automationKey: repetir un disparo no duplica nada.
 *  - Nunca pisa datos manuales: la fecha de grabación solo se llena si está vacía; la
 *    asignación del video para esa función manda sobre la persona por defecto de la marca;
 *    solo se crea una asignación si la función no tiene a nadie apto.
 *  - Corre dentro de la transacción de quien dispara (mismo commit que su acción), en un
 *    SAVEPOINT: un fallo se registra con un código cerrado y se propaga para revertir
 *    también la acción principal. No se confirma un video con su entrega incompleta.
 *  - La automatización no exige content.assign ni tasks.manage a quien dispara (un guionista
 *    que une su guion no los tiene), pero la persona asignada siempre debe estar activa y
 *    autorizada para la marca y tener las capacidades de la función.
 *  - Todo queda en la auditoría, firmado por quien disparó o por «Sistema» (mantenimiento).
 *
 * Cadena de entregas (PRODUCTION_CHAIN_ENABLED, src/lib/domain/production-chain.ts): con la
 * cadena encendida para la marca del video, cada gancho de abajo delega en la cadena (import
 * perezoso, sin ciclo estático) y no programa nada por su cuenta. Con la cadena apagada, los
 * ganchos no hacen ninguna consulta extra y se comportan exactamente como antes.
 */

export type ProductionActor = SessionUser | null;
export type StepKind = "GUION" | "REVISION_GUION" | "GRABACION" | "EDICION" | "REVISION_FINAL" | "PUBLICACION" | "DISENO";
export type TeamRole = "ENCARGADO" | "GUIONISTA" | "FILMMAKER" | "EDITOR" | "COMMUNITY" | "DISENADOR";
export type SkipReason = "flag_off" | "video_missing" | "video_status" | "exists" | "auto_off" | "no_team" | "no_assignee" | "recording_open" | "error";
export type FlowResult = { done: true; stepId: string } | { done: false; reason: SkipReason };

/** Función de la marca que se asigna en cada paso, función en el video y verbo de la tarea. */
export const STEP_ROLES: Record<StepKind, { team: TeamRole; assignment: string | null; task: string }> = {
  REVISION_GUION: { team: "ENCARGADO", assignment: null, task: "Revisar guion" },
  REVISION_FINAL: { team: "ENCARGADO", assignment: null, task: "Revisar vídeo final" },
  // Solo con la cadena de entregas: el guionista del equipo recibe además la asignación GUIONISTA.
  GUION: { team: "GUIONISTA", assignment: "GUIONISTA", task: "Escribir guion" },
  GRABACION: { team: "FILMMAKER", assignment: "CAMARA", task: "Grabar" },
  EDICION: { team: "EDITOR", assignment: "EDITOR", task: "Editar" },
  PUBLICACION: { team: "COMMUNITY", assignment: "COMMUNITY", task: "Publicar" },
  DISENO: { team: "DISENADOR", assignment: "DISENO", task: "Diseño" },
};

/** Estados en los que cada paso automático todavía tiene sentido. */
const OPEN_FOR: Record<Exclude<StepKind, "DISENO">, readonly string[]> = {
  REVISION_GUION: ["GUION"],
  REVISION_FINAL: ["EDICION"],
  GUION: ["IDEA", "GUION"],
  GRABACION: ["IDEA", "GUION", "APROBADO"],
  EDICION: ["APROBADO", "GRABACION", "EDICION"],
  PUBLICACION: ["EDICION", "PROGRAMADO"],
};

export const automationKey = (videoId: string, step: Exclude<StepKind, "DISENO">) => `${videoId}:${step}`;

/** Error de negocio con mensaje legible para la persona (pedido de diseño). */
export class ProductionFlowError extends Error {}

const AUTO_NOTE = "Asignación automática del flujo de producción";

const skip = (reason: SkipReason): FlowResult => ({ done: false, reason });

function reasonCode(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "";
  return /^P\d{4}$/.test(code) ? code : "unknown";
}

/**
 * Revierte el bloque y propaga el error para abortar también la acción del llamador.
 * Un fallo al crear la siguiente entrega nunca se convierte en un guardado exitoso.
 */
async function guarded(tx: AppTransaction, operation: string, work: () => Promise<FlowResult>): Promise<FlowResult> {
  if (!productionFlowEnabled()) return skip("flag_off");
  await tx.$executeRawUnsafe("SAVEPOINT intia_production_flow");
  try {
    const result = await work();
    await tx.$executeRawUnsafe("RELEASE SAVEPOINT intia_production_flow");
    // Una marca con equipo pero sin nadie apto para la función es lo único que merece aviso;
    // una marca que no usa el flujo (sin equipo) se omite en silencio.
    if (!result.done && result.reason === "no_assignee") console.info(JSON.stringify({ event: "production_flow", operation, reason: result.reason }));
    return result;
  } catch (error) {
    await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT intia_production_flow");
    await tx.$executeRawUnsafe("RELEASE SAVEPOINT intia_production_flow");
    console.warn(JSON.stringify({ event: "production_flow", operation, reason: "error", code: reasonCode(error) }));
    throw error;
  }
}

/* ------------------------------------------------------------- LECTURAS -- */

export type Video = { id: string; title: string; brandId: string; status: string; shootDate: Date | null; scheduledDate: Date };
export type Person = { id: string; name: string };
export type Flow = { autoAssign: boolean; weekdays: number[]; team: Map<string, string> };

function readVideo(tx: AppTransaction, id: string): Promise<Video | null> {
  return tx.contentItem.findUnique({ where: { id }, select: { id: true, title: true, brandId: true, status: true, shootDate: true, scheduledDate: true } });
}

/** Equipo y ajustes de la marca. Sin fila de ajustes: asignación automática activa y sin días elegidos. */
export async function readFlow(tx: AppTransaction, brandId: string): Promise<Flow> {
  const settings = await tx.brandProductionSettings.findUnique({ where: { brandId }, select: { recordingWeekdays: true, autoAssign: true } });
  const team = await tx.brandTeamMember.findMany({ where: { brandId }, select: { role: true, userId: true } });
  return {
    autoAssign: settings?.autoAssign ?? true,
    weekdays: parseRecordingWeekdays(settings?.recordingWeekdays),
    team: new Map(team.map((member) => [member.role, member.userId])),
  };
}

/** La misma elegibilidad que las asignaciones manuales, sin conceder permisos. */
export function eligiblePerson(tx: AppTransaction, userId: string, brandId: string, capabilities: readonly Capability[] = []): Promise<Person | null> {
  return findWorkAssignee(tx, userId, brandId, capabilities);
}

/**
 * Quién hace el paso: la persona que ya tiene esa función en el video (asignación manual)
 * y, si no hay nadie apto, la persona por defecto de la marca. Una marca sin equipo
 * definido no usa el flujo: no se automatiza nada aunque el video tenga asignaciones.
 */
export async function resolveAssignee(tx: AppTransaction, video: Pick<Video, "id" | "brandId">, step: StepKind, flow: Flow): Promise<{ person: Person; assigned: boolean } | SkipReason> {
  if (!flow.team.size) return "no_team";
  const { assignment, team } = STEP_ROLES[step];
  const current = assignment ? await tx.assignment.findMany({
    where: { contentItemId: video.id, role: assignment },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { userId: true },
  }) : [];
  for (const row of current) {
    const person = await eligiblePerson(tx, row.userId, video.brandId, stepAssigneeCapabilities(step));
    if (person) return { person, assigned: true };
  }
  const fallback = flow.team.get(team);
  const person = fallback ? await eligiblePerson(tx, fallback, video.brandId, stepAssigneeCapabilities(step)) : null;
  if (person) return { person, assigned: false };
  if (!assignment) {
    const owners = await tx.user.findMany({ where: { role: "OWNER", active: true }, orderBy: { id: "asc" }, select: { id: true } });
    for (const owner of owners) {
      const candidate = await eligiblePerson(tx, owner.id, video.brandId, stepAssigneeCapabilities(step));
      if (candidate) return { person: candidate, assigned: false };
    }
  }
  return "no_assignee";
}

/* ------------------------------------------------------------ ESCRITURAS -- */

export async function ensureAssignment(tx: AppTransaction, actor: ProductionActor, video: Pick<Video, "id" | "title" | "brandId">, role: string | null, person: Person) {
  if (!role) return; // Una revisión asigna trabajo, no una función de producción en el vídeo.
  const existing = await tx.assignment.findUnique({
    where: { contentItemId_userId_role: { contentItemId: video.id, userId: person.id, role } },
    select: { id: true },
  });
  if (existing) return;
  const created = await tx.assignment.create({ data: { contentItemId: video.id, userId: person.id, role, notes: AUTO_NOTE }, select: { id: true } });
  if (["CAMARA", "PRODUCCION", "ACTOR", "VOZ"].includes(role)) await invalidateTeamPreparation(tx, video.id);
  await auditInTransaction(tx, {
    user: actor,
    action: "ASIGNAR",
    entity: "Assignment",
    entityId: created.id,
    brandId: video.brandId,
    summary: `Asignó a ${person.name} como ${ASSIGNMENT_ROLE_MAP[role]?.label ?? role} en "${video.title}" (flujo de producción)`,
  });
}

/**
 * Columna para las tareas del flujo: la primera del tablero que admite la marca.
 * Sin tablero, siembra las columnas iniciales (mismos ids que «asegurarColumnasIniciales»);
 * si solo hay columnas de otras marcas, crea «Producción» para esta.
 */
export async function taskColumnFor(tx: AppTransaction, actor: ProductionActor, brandId: string): Promise<string> {
  const where = { OR: [{ brandId: null }, { brandId }] };
  const first = await tx.taskColumn.findFirst({ where, orderBy: [{ order: "asc" }, { id: "asc" }], select: { id: true } });
  if (first) return first.id;
  // El mismo candado que usa el tablero de tareas al crear columnas.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(781240110)`;
  const again = await tx.taskColumn.findFirst({ where, orderBy: [{ order: "asc" }, { id: "asc" }], select: { id: true } });
  if (again) return again.id;
  if (!await tx.taskColumn.count()) {
    for (const column of DEFAULT_TASK_COLUMNS) {
      const id = `initial-task-column-${column.order}`;
      await tx.taskColumn.upsert({ where: { id }, update: {}, create: { id, name: column.name, color: column.color, order: column.order, brandId: null } });
    }
    await auditInTransaction(tx, { user: actor, action: "CREAR", entity: "TaskColumn", summary: "Creó las columnas iniciales del tablero de tareas para el flujo de producción." });
    return `initial-task-column-${DEFAULT_TASK_COLUMNS[0].order}`;
  }
  const last = await tx.taskColumn.findFirst({ orderBy: { order: "desc" }, select: { order: true } });
  const column = await tx.taskColumn.create({ data: { name: "Producción", color: "#0ea5e9", brandId, order: (last?.order ?? -1) + 1 }, select: { id: true, name: true } });
  await auditInTransaction(tx, { user: actor, action: "CREAR", entity: "TaskColumn", entityId: column.id, brandId, summary: `Creó la columna "${column.name}" para las tareas del flujo de producción` });
  return column.id;
}

export type NewStep = {
  video: Pick<Video, "id" | "title" | "brandId">;
  step: StepKind;
  /** null: «Sin asignar» (solo la cadena de entregas crea pasos sin responsable). */
  person: Person | null;
  dueAt: Date | null;
  key: string;
  summary: string;
  source?: "AUTO" | "MANUAL";
  requestedById?: string | null;
  notes?: string | null;
  materialUrl?: string | null;
};

/** Paso + su tarea en el tablero (responsable y fecha límite), auditados. */
export async function createStep(tx: AppTransaction, actor: ProductionActor, input: NewStep) {
  const { video, step, person, dueAt } = input;
  const columnId = await taskColumnFor(tx, actor, video.brandId);
  const last = await tx.task.findFirst({ where: { columnId }, orderBy: { order: "desc" }, select: { order: true } });
  const title = `${STEP_ROLES[step].task}: ${video.title}`.slice(0, 500);
  const task = await tx.task.create({
    data: {
      title,
      description: stepTaskDescription(PRODUCTION_STEP_MAP[step]?.label ?? step, video.title, video.id, dueAt),
      kind: "ACCION",
      priority: "ALTA",
      dueDate: dueAt ? fromDateKey(dateKey(dueAt)) : null,
      columnId,
      assigneeId: person?.id ?? null,
      brandId: video.brandId,
      order: (last?.order ?? -1) + 1,
    },
    select: { id: true, title: true },
  });
  await auditInTransaction(tx, { user: actor, action: "CREAR", entity: "Task", entityId: task.id, brandId: video.brandId, summary: `Creó la tarea "${task.title}" ${person ? `para ${person.name}` : "sin responsable"} (flujo de producción)` });
  const created = await tx.productionStep.create({
    data: {
      contentItemId: video.id,
      brandId: video.brandId,
      step,
      assigneeId: person?.id ?? null,
      dueAt,
      source: input.source ?? "AUTO",
      taskId: task.id,
      automationKey: input.key,
      requestedById: input.requestedById ?? null,
      notes: input.notes ?? null,
      materialUrl: input.materialUrl ?? null,
    },
    select: { id: true },
  });
  await auditInTransaction(tx, {
    user: actor,
    action: "ASIGNAR",
    entity: "ProductionStep",
    entityId: created.id,
    brandId: video.brandId,
    summary: input.summary,
    changes: {
      assigneeId: { etiqueta: "Responsable", antes: null, despues: person?.id ?? null, verDespues: person?.name ?? "Sin asignar" },
      dueAt: { etiqueta: "Vence", antes: null, despues: dueAt?.toISOString() ?? null, verDespues: formatDateTime(dueAt) },
    },
  });
  return created;
}

/** Cierra el paso anterior cuando el siguiente arranca (grabación → edición → publicación). */
async function closePrevious(tx: AppTransaction, actor: ProductionActor, video: Video, step: "GRABACION" | "EDICION", now: Date, reason: string) {
  const previous = await tx.productionStep.findUnique({ where: { automationKey: automationKey(video.id, step) }, select: { id: true, status: true } });
  if (!previous || previous.status !== "PENDIENTE") return;
  await tx.productionStep.update({ where: { id: previous.id }, data: { status: "HECHO", doneAt: now } });
  await tx.task.updateMany({ where: { productionStep: { id: previous.id } }, data: { status: "HECHO", completedAt: now, completedById: actor?.id ?? null } });
  await auditInTransaction(tx, {
    user: actor,
    action: "COMPLETAR",
    entity: "ProductionStep",
    entityId: previous.id,
    brandId: video.brandId,
    summary: `Marcó hecha la ${PRODUCTION_STEP_MAP[step].label.toLowerCase()} de "${video.title}": ${reason}`,
    changes: { status: { etiqueta: "Estado", antes: "PENDIENTE", despues: "HECHO" } },
  });
}

/* -------------------------------------------------------- PASOS AUTOMÁTICOS -- */

type Options = { now?: Date };

/** a) Grabación: próximo día de grabación de la marca (si el video no tenía fecha) y filmmaker. */
export function scheduleRecording(tx: AppTransaction, actor: ProductionActor, videoId: string, options: Options = {}): Promise<FlowResult> {
  return guarded(tx, "schedule_recording", async () => {
    const now = options.now ?? new Date();
    const video = await readVideo(tx, videoId);
    if (!video) return skip("video_missing");
    if (!OPEN_FOR.GRABACION.includes(video.status)) return skip("video_status");
    const key = automationKey(video.id, "GRABACION");
    if (await tx.productionStep.findUnique({ where: { automationKey: key }, select: { id: true } })) return skip("exists");
    const flow = await readFlow(tx, video.brandId);
    if (!flow.autoAssign) return skip("auto_off");
    const assignee = await resolveAssignee(tx, video, "GRABACION", flow);
    if (typeof assignee === "string") return skip(assignee);

    const shootKey = video.shootDate ? dateKey(video.shootDate) : nextRecordingDayKey(dateKey(now), flow.weekdays);
    if (!video.shootDate) {
      const shootDate = fromDateKey(shootKey);
      // Condicionado: una fecha puesta a mano mientras tanto no se pisa.
      const { count } = await tx.contentItem.updateMany({ where: { id: video.id, shootDate: null }, data: { shootDate } });
      if (count) {
        await auditInTransaction(tx, {
          user: actor,
          action: "EDITAR",
          entity: "ContentItem",
          entityId: video.id,
          brandId: video.brandId,
          summary: `Programó la grabación de "${video.title}" para el ${formatDateLong(shootDate)}, el próximo día de grabación de la marca`,
          changes: { shootDate: { etiqueta: "Fecha de grabación", antes: null, despues: shootDate.toISOString(), verDespues: formatDateLong(shootDate) } },
        });
      }
    }
    if (!assignee.assigned) await ensureAssignment(tx, actor, video, STEP_ROLES.GRABACION.assignment, assignee.person);
    const dueAt = endOfDayKey(shootKey);
    const created = await createStep(tx, actor, {
      video, step: "GRABACION", person: assignee.person, dueAt, key,
      summary: `Asignó la grabación de "${video.title}" a ${assignee.person.name} para el ${formatDateLong(fromDateKey(shootKey))}`,
    });
    return { done: true, stepId: created.id };
  });
}

/**
 * b) Edición: al terminar la grabación. Vence el día hábil siguiente a la grabación
 * (sábado → lunes). `recordedNow` la toma como terminada hoy (checks, estado o paso
 * marcados); sin él (mantenimiento) cuenta desde la fecha de grabación.
 */
export function assignEditing(tx: AppTransaction, actor: ProductionActor, videoId: string, options: Options & { recordedNow?: boolean; requireRecordingChecks?: boolean; markedByPerson?: boolean } = {}): Promise<FlowResult> {
  return guarded(tx, "assign_editing", async () => {
    const now = options.now ?? new Date();
    const video = await readVideo(tx, videoId);
    if (!video) return skip("video_missing");
    // Si una persona marca la grabación como hecha, la edición se asigna aunque el video
    // no haya avanzado de estado en la app; el barrido diario sigue exigiendo el estado.
    const open = options.markedByPerson ? [...OPEN_FOR.GRABACION, ...OPEN_FOR.EDICION] : OPEN_FOR.EDICION;
    if (!open.includes(video.status)) return skip("video_status");
    const key = automationKey(video.id, "EDICION");
    if (await tx.productionStep.findUnique({ where: { automationKey: key }, select: { id: true } })) return skip("exists");
    if (options.requireRecordingChecks && await tx.checklistItem.count({ where: { contentItemId: video.id, stage: "GRABACION", kind: "TASK", required: true, done: false } })) return skip("recording_open");
    const flow = await readFlow(tx, video.brandId);
    if (!flow.autoAssign) return skip("auto_off");
    const assignee = await resolveAssignee(tx, video, "EDICION", flow);
    if (typeof assignee === "string") return skip(assignee);

    const todayKey = dateKey(now);
    const shootKey = video.shootDate ? dateKey(video.shootDate) : todayKey;
    const recordedKey = options.recordedNow || shootKey > todayKey ? todayKey : shootKey;
    const dueKey = editingDueKey(recordedKey, todayKey);
    const recording = await tx.productionStep.findUnique({ where: { automationKey: automationKey(video.id, "GRABACION") }, select: { materialUrl: true } });

    await assertPreparationReady(tx, video.id);
    if (!assignee.assigned) await ensureAssignment(tx, actor, video, STEP_ROLES.EDICION.assignment, assignee.person);
    await closePrevious(tx, actor, video, "GRABACION", now, "la edición ya está asignada");
    const created = await createStep(tx, actor, {
      video, step: "EDICION", person: assignee.person, dueAt: endOfDayKey(dueKey), key,
      // El editor recibe el enlace del material grabado, si el filmmaker ya lo dejó.
      materialUrl: recording?.materialUrl ?? null,
      summary: `Asignó la edición de "${video.title}" a ${assignee.person.name}: entrega el ${formatDateLong(fromDateKey(dueKey))}`,
    });
    return { done: true, stepId: created.id };
  });
}

/**
 * c) Publicación: al aprobarse la revisión final (o al programar). Vence el día hábil
 * siguiente, o la fecha prevista del calendario si es posterior. Con `moveCalendar`, una
 * fecha prevista anterior se mueve a ese día para que el calendario diga la verdad.
 */
export function assignPublishing(tx: AppTransaction, actor: ProductionActor, videoId: string, options: Options & { moveCalendar?: boolean } = {}): Promise<FlowResult> {
  return guarded(tx, "assign_publishing", async () => {
    const now = options.now ?? new Date();
    const video = await readVideo(tx, videoId);
    if (!video) return skip("video_missing");
    if (!OPEN_FOR.PUBLICACION.includes(video.status)) return skip("video_status");
    const key = automationKey(video.id, "PUBLICACION");
    if (await tx.productionStep.findUnique({ where: { automationKey: key }, select: { id: true } })) return skip("exists");
    const flow = await readFlow(tx, video.brandId);
    if (!flow.autoAssign) return skip("auto_off");
    const assignee = await resolveAssignee(tx, video, "PUBLICACION", flow);
    if (typeof assignee === "string") return skip(assignee);

    const todayKey = dateKey(now);
    const scheduledKey = dateKey(video.scheduledDate);
    // Programado a mano para hoy o después: esa es la fecha que manda.
    const dueKey = !options.moveCalendar && scheduledKey >= todayKey ? scheduledKey : publicationDueKey(todayKey, scheduledKey);
    if (options.moveCalendar && scheduledKey < dueKey) {
      const scheduledDate = fromDateKey(dueKey);
      await tx.contentItem.update({ where: { id: video.id }, data: { scheduledDate } });
      await auditInTransaction(tx, {
        user: actor,
        action: "EDITAR",
        entity: "ContentItem",
        entityId: video.id,
        brandId: video.brandId,
        summary: `Movió la publicación de "${video.title}" al ${formatDateLong(scheduledDate)}: la revisión final quedó aprobada y se publica al día siguiente`,
        changes: { scheduledDate: { etiqueta: "Fecha prevista", antes: video.scheduledDate.toISOString(), despues: scheduledDate.toISOString(), verAntes: formatDateLong(video.scheduledDate), verDespues: formatDateLong(scheduledDate) } },
      });
    }
    if (!assignee.assigned) await ensureAssignment(tx, actor, video, STEP_ROLES.PUBLICACION.assignment, assignee.person);
    await closePrevious(tx, actor, video, "EDICION", now, "la revisión final quedó aprobada");
    const created = await createStep(tx, actor, {
      video, step: "PUBLICACION", person: assignee.person, dueAt: endOfDayKey(dueKey), key,
      summary: `Asignó la publicación de "${video.title}" a ${assignee.person.name} para el ${formatDateLong(fromDateKey(dueKey))}`,
    });
    return { done: true, stepId: created.id };
  });
}

/**
 * Una fecha cambiada explícitamente sincroniza cualquier grabación pendiente y su tarea.
 */
export async function syncRecordingDate(tx: AppTransaction, actor: ProductionActor, videoId: string): Promise<FlowResult> {
  const result = await syncVideoStepDate(tx, actor, videoId, "GRABACION");
  return result.done && result.stepId ? { done: true, stepId: result.stepId } : skip("exists");
}

/** Un video cancelado no deja pasos pendientes en el tablero de nadie. */
export function cancelOpenSteps(tx: AppTransaction, actor: ProductionActor, videoId: string): Promise<FlowResult> {
  return guarded(tx, "cancel_steps", async () => {
    const video = await readVideo(tx, videoId);
    if (!video) return skip("video_missing");
    const { count } = await tx.productionStep.updateMany({ where: { contentItemId: video.id, status: "PENDIENTE" }, data: { status: "CANCELADO" } });
    await tx.task.updateMany({ where: { productionStep: { contentItemId: video.id, status: "CANCELADO" } }, data: { status: "CANCELADO", completedAt: null, completedById: null } });
    if (!count) return skip("exists");
    await auditInTransaction(tx, {
      user: actor,
      action: "EDITAR",
      entity: "ProductionStep",
      brandId: video.brandId,
      summary: `Canceló ${count === 1 ? "el paso de producción pendiente" : `los ${count} pasos de producción pendientes`} de "${video.title}" al cancelar el video`,
    });
    return { done: true, stepId: video.id };
  });
}

/* -------------------------------------------------------- PEDIDO DE DISEÑO -- */

/**
 * d) Diseño pedido por el guionista o coordinación: entrega máxima en 24 horas (si cae en
 * domingo, el lunes a la misma hora). No depende de la asignación automática de la marca:
 * es un pedido explícito. Lanza ProductionFlowError con un motivo legible.
 */
export async function requestDesign(tx: AppTransaction, actor: SessionUser, videoId: string, input: { designerId?: string | null; notes?: string | null; now?: Date }) {
  const now = input.now ?? new Date();
  const video = await readVideo(tx, videoId);
  if (!video) throw new ProductionFlowError("El video ya no existe. Recarga la página.");
  if (["CANCELADO", "PUBLICADO"].includes(video.status)) throw new ProductionFlowError("Este video ya no admite pedidos de diseño.");
  const designerId = input.designerId || (await tx.brandTeamMember.findUnique({ where: { brandId_role: { brandId: video.brandId, role: "DISENADOR" } }, select: { userId: true } }))?.userId;
  if (!designerId) throw new ProductionFlowError("Elige quién hará el diseño o define el diseñador en el equipo de la marca.");
  const person = await eligiblePerson(tx, designerId, video.brandId, stepAssigneeCapabilities("DISENO"));
  if (!person) throw new ProductionFlowError("La persona debe estar activa, autorizada para esta marca y tener permiso para diseñar.");
  const dueAt = dueIn24hSkippingSunday(now);
  // La asignación DISENO le da al diseñador (alcance «asignado») acceso al video.
  await ensureAssignment(tx, actor, video, STEP_ROLES.DISENO.assignment, person);
  return createStep(tx, actor, {
    video, step: "DISENO", person, dueAt, key: `${video.id}:DISENO:${randomUUID()}`,
    source: "MANUAL", requestedById: actor.id, notes: input.notes ?? null,
    summary: `Pidió un diseño para "${video.title}" a ${person.name}: entrega máxima el ${formatDateTime(dueAt)}`,
  });
}

/**
 * Reasignación manual de un paso: la persona nueva recibe la función en el video (así la
 * ve en su alcance «asignado»). La asignación anterior se conserva; quitarla es aparte.
 */
export async function ensureStepAssignment(tx: AppTransaction, actor: SessionUser, videoId: string, step: StepKind, person: Person) {
  const video = await readVideo(tx, videoId);
  if (video) await ensureAssignment(tx, actor, video, STEP_ROLES[step].assignment, person);
}

/* ---------------------------------------------------------------- GANCHOS -- */

type ChainModule = typeof import("@/lib/domain/production-chain");

/** Import perezoso: la cadena importa este módulo, así que aquí no puede ser estático. */
function chain(): Promise<ChainModule> {
  return import("@/lib/domain/production-chain");
}

/**
 * ¿El video va por la cadena de entregas? Sin cadena configurada no consulta nada (así las
 * pruebas y el comportamiento con la cadena apagada no cambian). Con canario, lee la marca.
 */
async function chainOwns(tx: AppTransaction, videoId: string): Promise<boolean> {
  if (!productionChainConfigured()) return false;
  const video = await tx.contentItem.findUnique({ where: { id: videoId }, select: { brandId: true } });
  return Boolean(video && productionChainEnabled(video.brandId));
}

/** Guion unido a un video (vincularGuionAVideo): se programa la grabación. Con la cadena: paso del guion. */
export async function onScriptLinked(tx: AppTransaction, actor: ProductionActor, videoId: string) {
  if (!productionFlowEnabled()) return;
  if (await chainOwns(tx, videoId)) {
    await (await chain()).chainEvent(tx, actor, { type: "SCRIPT_LINKED", videoId });
    return;
  }
  await scheduleRecording(tx, actor, videoId);
}

/** Guion aprobado (transitionScript): cada video que lo usa recibe su grabación. Con la cadena, lo decide onScriptStatusChanged. */
export async function onScriptApproved(tx: AppTransaction, actor: ProductionActor, scriptId: string) {
  if (!productionFlowEnabled()) return;
  const videos = await tx.contentItem.findMany({ where: { scriptId }, select: { id: true, brandId: true }, orderBy: { id: "asc" } });
  for (const video of videos) {
    if (productionChainConfigured() && productionChainEnabled(video.brandId)) continue;
    await scheduleRecording(tx, actor, video.id);
  }
}

/** Cadena de entregas: cualquier cambio de estado de un guion (transitionScript). Sin cadena no consulta nada. */
export async function onScriptStatusChanged(tx: AppTransaction, actor: ProductionActor, scriptId: string, from: string, to: string) {
  if (!productionFlowEnabled() || !productionChainConfigured()) return;
  await (await chain()).chainEvent(tx, actor, { type: "SCRIPT_STATUS", scriptId, from, to });
}

/** Cambio de estado del video (transitionVideo). */
export async function onVideoStatusChanged(tx: AppTransaction, actor: ProductionActor, videoId: string, status: string, from?: string) {
  if (!productionFlowEnabled()) return;
  if (await chainOwns(tx, videoId)) {
    await (await chain()).chainEvent(tx, actor, { type: "VIDEO_STATUS", videoId, from: from ?? "", to: status });
    return;
  }
  if (status === "APROBADO") await scheduleRecording(tx, actor, videoId);
  else if (status === "EDICION") await assignEditing(tx, actor, videoId, { recordedNow: true });
  else if (status === "PROGRAMADO") await assignPublishing(tx, actor, videoId);
  else if (status === "CANCELADO") await cancelOpenSteps(tx, actor, videoId);
}

/** Check completado (alternarCheck): grabación terminada o revisión final aprobada. */
export async function onChecklistCompleted(tx: AppTransaction, actor: ProductionActor, check: { contentItemId: string; stage: string; kind: string }) {
  if (!productionFlowEnabled()) return;
  if (await chainOwns(tx, check.contentItemId)) {
    await (await chain()).chainEvent(tx, actor, { type: "CHECK_DONE", videoId: check.contentItemId, stage: check.stage, kind: check.kind });
    return;
  }
  if (check.kind === "FINAL_APPROVAL") await assignPublishing(tx, actor, check.contentItemId, { moveCalendar: true });
  else if (check.stage === "GRABACION") await assignEditing(tx, actor, check.contentItemId, { recordedNow: true, requireRecordingChecks: true });
}

/** Fecha de grabación editada a mano (actualizarVideo, actualizarGrabacion). */
export async function onShootDateChanged(tx: AppTransaction, actor: ProductionActor, videoId: string) {
  await invalidateRecordingPreparation(tx, actor, videoId);
  await syncVideoStepDate(tx, actor, videoId, "GRABACION");
}

/** Sincronización de datos existentes, también con la automatización apagada. No crea pasos. */
export async function onScheduledDateChanged(tx: AppTransaction, actor: ProductionActor, videoId: string) {
  await syncVideoStepDate(tx, actor, videoId, "PUBLICACION");
}

/** Paso de grabación marcado hecho por el filmmaker o coordinación: la edición arranca ya. */
export async function onStepCompleted(tx: AppTransaction, actor: ProductionActor, step: { contentItemId: string; step: string }) {
  if (!productionFlowEnabled()) return;
  if (await chainOwns(tx, step.contentItemId)) {
    // Camino viejo («Marcar hecho» sin completeStep): la cadena solo abre el paso siguiente para
    // no dejar el video sin paso abierto. Con la cadena, las acciones deben usar completeStep.
    await (await chain()).chainEvent(tx, actor, { type: "STEP_MARKED", videoId: step.contentItemId, step: step.step });
    return;
  }
  if (step.step === "GRABACION") await assignEditing(tx, actor, step.contentItemId, { recordedNow: true, markedByPerson: true });
}
