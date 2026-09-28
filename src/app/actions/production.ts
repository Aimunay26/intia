"use server";
import { revalidatePath } from "next/cache";

import { assertContentAccess, contentScope } from "@/lib/access-scope";
import { auditInTransaction, type Cambio } from "@/lib/audit";
import { LEVEL, requireLevel, requirePermission, type SessionUser } from "@/lib/auth";
import { PRODUCTION_STEP_MAP } from "@/lib/constants";
import {
  ProductionFlowError,
  eligiblePerson,
  ensureStepAssignment,
  onStepCompleted,
  requestDesign,
  type StepKind,
} from "@/lib/domain/production-flow";
import { EDIT_CONFLICT, lockRevision, withMutation } from "@/lib/mutations";
import { allows, type Capability } from "@/lib/permissions";
import type { AppTransaction } from "@/lib/prisma";
import { productionFlowEnabled } from "@/lib/production-flow-flag";
import { dateKey, field, formatDateTime, fromDateKey, instantInZone } from "@/lib/utils";
import { validDay } from "@/lib/validation";
import { invalidateDomain } from "@/lib/view-invalidation";
import { endOfDayKey } from "@/lib/working-days";

/**
 * Acciones del panel «Producción» de un video (PRODUCTION_FLOW_ENABLED).
 *
 *  - pedirDiseno: guionista (scripts.write) o coordinación (content.plan) con acceso al video.
 *  - marcarPaso / guardarMaterialPaso: coordinación (content.assign) o la persona asignada
 *    al paso; el enlace del material también lo puede dejar quien graba o edita el video.
 *  - reasignarPaso: solo content.assign (excepción manual sobre la automatización).
 *
 * Toda escritura se audita en la misma transacción. Con el flag apagado no se lee ni se
 * escribe nada. Los errores de validación vuelven como { error } para que EditForm los
 * muestre y conserve el borrador.
 */

export type ProductionActionResult = { error: string } | undefined;

const APAGADO = "El flujo de producción no está activo.";
const SAFE_MESSAGES = new Set([
  EDIT_CONFLICT,
  "No tienes acceso a este video.",
  "Tu perfil no tiene permiso para realizar esta acción.",
  "La revisión del formulario no es válida. Recarga la página antes de guardar.",
]);

function refrescar(videoId: string) {
  invalidateDomain("content");
  revalidatePath(`/contenido/${videoId}`);
  revalidatePath("/tareas");
}

/** Solo mensajes de negocio conocidos llegan a la pantalla; el resto sigue su curso. */
async function legible(work: () => Promise<ProductionActionResult | void>): Promise<ProductionActionResult> {
  try {
    return (await work()) ?? undefined;
  } catch (error) {
    if (error instanceof ProductionFlowError) return { error: error.message };
    if (error instanceof Error && SAFE_MESSAGES.has(error.message)) return { error: error.message };
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return { error: EDIT_CONFLICT };
    throw error;
  }
}

type StepRow = { id: string; contentItemId: string; brandId: string; step: string; status: string; assigneeId: string | null; materialUrl: string | null; taskId: string | null; dueAt: Date };

async function readStep(tx: AppTransaction, id: string): Promise<(StepRow & { video: { title: string } }) | null> {
  const step = await tx.productionStep.findUnique({
    where: { id },
    select: { id: true, contentItemId: true, brandId: true, step: true, status: true, assigneeId: true, materialUrl: true, taskId: true, dueAt: true, contentItem: { select: { title: true } } },
  });
  return step ? { ...step, video: step.contentItem } : null;
}

/**
 * Coordinación del video, la persona asignada al paso o, para el enlace del material,
 * quien graba o edita ese video. Siempre con acceso al video.
 */
async function assertStepWriter(tx: AppTransaction, user: SessionUser, step: StepRow, purpose: "done" | "material") {
  if (user.role === "OWNER") return;
  if (allows(user, "content.assign") && await tx.contentItem.count({ where: { AND: [{ id: step.contentItemId }, contentScope(user, "content.assign")] } })) return;
  await assertContentAccess(tx, user, step.contentItemId, "content.view");
  if (step.assigneeId === user.id) return;
  if (purpose === "material" && (step.step === "GRABACION" || step.step === "EDICION")
    && await tx.productionStep.count({ where: { contentItemId: step.contentItemId, step: { in: ["GRABACION", "EDICION"] }, assigneeId: user.id } })) return;
  throw new ProductionFlowError("Solo coordinación o la persona asignada pueden actualizar este paso.");
}

const stepLabel = (step: string) => (PRODUCTION_STEP_MAP[step]?.label ?? step).toLowerCase();

/* -------------------------------------------------------- PEDIR DISEÑO -- */

export async function pedirDiseno(formData: FormData): Promise<ProductionActionResult> {
  if (!productionFlowEnabled()) return { error: APAGADO };
  const user = await requireLevel(LEVEL.MEMBER);
  const contentItemId = field(formData, "contentItemId");
  const designerId = field(formData, "designerId") || null;
  const notes = field(formData, "notes").replace(/\r\n?/g, "\n");
  if (!contentItemId) return { error: "Falta el video. Recarga la página." };
  if (notes.length > 2000) return { error: `Las indicaciones admiten hasta 2000 caracteres (tienen ${notes.length}).` };
  if (designerId && designerId.length > 100) return { error: "La persona elegida no es válida. Recarga la página." };
  const capability: Capability | null = allows(user, "content.plan") ? "content.plan" : allows(user, "scripts.write") ? "scripts.write" : null;
  if (!capability) return { error: "Tu perfil no puede pedir diseños." };

  return legible(() => withMutation(user, false, async (tx, afterCommit) => {
    await assertContentAccess(tx, user, contentItemId, capability);
    await requestDesign(tx, user, contentItemId, { designerId, notes: notes || null });
    afterCommit(() => refrescar(contentItemId));
  }));
}

/* ------------------------------------------------------ MARCAR / REABRIR -- */

export async function marcarPaso(formData: FormData): Promise<ProductionActionResult> {
  if (!productionFlowEnabled()) return { error: APAGADO };
  const user = await requireLevel(LEVEL.MEMBER);
  const id = field(formData, "id");
  const done = field(formData, "done") === "1";

  return legible(() => withMutation(user, false, async (tx, afterCommit): Promise<ProductionActionResult> => {
    await lockRevision(tx, "ProductionStep", id, formData);
    const step = await readStep(tx, id);
    if (!step) return { error: "El paso ya no existe. Recarga la página." };
    await assertStepWriter(tx, user, step, "done");
    if (step.status === "CANCELADO") return { error: "El paso está cancelado. Reasígnalo para reactivarlo." };
    if ((step.status === "HECHO") === done) return;

    await tx.productionStep.update({ where: { id }, data: done ? { status: "HECHO", doneAt: new Date() } : { status: "PENDIENTE", doneAt: null } });
    await auditInTransaction(tx, {
      user,
      action: done ? "COMPLETAR" : "REABRIR",
      entity: "ProductionStep",
      entityId: id,
      brandId: step.brandId,
      summary: `${done ? "Marcó hecha" : "Reabrió"} la ${stepLabel(step.step)} de "${step.video.title}"`,
      changes: { status: { etiqueta: "Estado", antes: step.status, despues: done ? "HECHO" : "PENDIENTE" } },
    });
    // Grabación hecha: la edición se asigna en este mismo momento.
    if (done) await onStepCompleted(tx, user, step);
    afterCommit(() => refrescar(step.contentItemId));
  }));
}

/* ------------------------------------------------------------- MATERIAL -- */

/** Enlace http(s) a la nube: material grabado, edición o entrega del diseño. Vacío lo quita. */
function readMaterialUrl(formData: FormData): { url: string | null } | { error: string } {
  const value = field(formData, "materialUrl");
  if (!value) return { url: null };
  if (value.length > 2000) return { error: "El enlace admite hasta 2000 caracteres." };
  if (/\s/.test(value) || !URL.canParse(value) || !["http:", "https:"].includes(new URL(value).protocol)) {
    return { error: "Pega el enlace completo de la carpeta o archivo en la nube (empieza con https://)." };
  }
  return { url: value };
}

export async function guardarMaterialPaso(formData: FormData): Promise<ProductionActionResult> {
  if (!productionFlowEnabled()) return { error: APAGADO };
  const user = await requireLevel(LEVEL.MEMBER);
  const id = field(formData, "id");
  const read = readMaterialUrl(formData);
  if ("error" in read) return { error: read.error };

  return legible(() => withMutation(user, false, async (tx, afterCommit): Promise<ProductionActionResult> => {
    await lockRevision(tx, "ProductionStep", id, formData);
    const step = await readStep(tx, id);
    if (!step) return { error: "El paso ya no existe. Recarga la página." };
    await assertStepWriter(tx, user, step, "material");
    if (step.materialUrl === read.url) return;

    await tx.productionStep.update({ where: { id }, data: { materialUrl: read.url } });
    const etiqueta = step.step === "DISENO" ? "Entrega del diseño" : "Material en la nube";
    await auditInTransaction(tx, {
      user,
      action: "EDITAR",
      entity: "ProductionStep",
      entityId: id,
      brandId: step.brandId,
      summary: read.url
        ? `Dejó el enlace «${etiqueta}» en la ${stepLabel(step.step)} de "${step.video.title}"`
        : `Quitó el enlace «${etiqueta}» de la ${stepLabel(step.step)} de "${step.video.title}"`,
      changes: { materialUrl: { etiqueta, antes: step.materialUrl ?? "", despues: read.url ?? "" } },
    });
    afterCommit(() => refrescar(step.contentItemId));
  }));
}

/* ------------------------------------------------------------ REASIGNAR -- */

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Excepción manual: otra persona u otro plazo. Queda como MANUAL y la automatización ya no lo toca. */
export async function reasignarPaso(formData: FormData): Promise<ProductionActionResult> {
  if (!productionFlowEnabled()) return { error: APAGADO };
  const user = await requirePermission("content.assign");
  const id = field(formData, "id");
  const assigneeId = field(formData, "assigneeId");
  const dueKey = field(formData, "dueDate");
  const dueTime = field(formData, "dueTime");
  if (!assigneeId || assigneeId.length > 100) return { error: "Elige a la persona responsable." };
  if (!validDay(dueKey)) return { error: "Indica una fecha de entrega válida." };
  if (dueTime && !TIME.test(dueTime)) return { error: "Indica la hora como HH:MM." };
  const dueAt = dueTime ? instantInZone(dueKey, dueTime) : endOfDayKey(dueKey);

  return legible(() => withMutation(user, false, async (tx, afterCommit): Promise<ProductionActionResult> => {
    await lockRevision(tx, "ProductionStep", id, formData);
    const step = await readStep(tx, id);
    if (!step) return { error: "El paso ya no existe. Recarga la página." };
    await assertContentAccess(tx, user, step.contentItemId, "content.assign");
    const person = await eligiblePerson(tx, assigneeId, step.brandId);
    if (!person) return { error: "La persona debe estar activa y autorizada para esta marca." };
    const before = await tx.productionStep.findUniqueOrThrow({ where: { id }, select: { assignee: { select: { name: true } } } });

    const reactivar = step.status === "CANCELADO";
    await tx.productionStep.update({ where: { id }, data: { assigneeId: person.id, dueAt, source: "MANUAL", ...(reactivar ? { status: "PENDIENTE" } : {}) } });
    const changes: Record<string, Cambio> = {};
    if (step.assigneeId !== person.id) changes.assigneeId = { etiqueta: "Responsable", antes: step.assigneeId, despues: person.id, verAntes: before.assignee?.name ?? "", verDespues: person.name };
    if (step.dueAt.getTime() !== dueAt.getTime()) changes.dueAt = { etiqueta: "Vence", antes: step.dueAt.toISOString(), despues: dueAt.toISOString(), verAntes: formatDateTime(step.dueAt), verDespues: formatDateTime(dueAt) };
    if (reactivar) changes.status = { etiqueta: "Estado", antes: "CANCELADO", despues: "PENDIENTE" };
    await auditInTransaction(tx, {
      user,
      action: "ASIGNAR",
      entity: "ProductionStep",
      entityId: id,
      brandId: step.brandId,
      summary: `Reasignó la ${stepLabel(step.step)} de "${step.video.title}" a ${person.name}: vence el ${formatDateTime(dueAt)}`,
      changes: Object.keys(changes).length ? changes : null,
    });

    // La tarea del tablero sigue al paso: mismo responsable y misma fecha límite.
    if (step.taskId) {
      const task = await tx.task.findUnique({ where: { id: step.taskId }, select: { id: true, title: true, assigneeId: true, dueDate: true, brandId: true } });
      const dueDate = fromDateKey(dateKey(dueAt));
      if (task && (task.assigneeId !== person.id || task.dueDate?.getTime() !== dueDate.getTime())) {
        await tx.task.update({ where: { id: task.id }, data: { assigneeId: person.id, dueDate } });
        await auditInTransaction(tx, {
          user,
          action: "EDITAR",
          entity: "Task",
          entityId: task.id,
          brandId: task.brandId,
          summary: `Reasignó la tarea "${task.title}" a ${person.name}`,
          changes: {
            assigneeId: { etiqueta: "Responsable", antes: task.assigneeId, despues: person.id, verDespues: person.name },
            dueDate: { etiqueta: "Fecha límite", antes: task.dueDate?.toISOString() ?? null, despues: dueDate.toISOString() },
          },
        });
      }
    }
    await ensureStepAssignment(tx, user, step.contentItemId, step.step as StepKind, person);
    afterCommit(() => refrescar(step.contentItemId));
  }));
}
