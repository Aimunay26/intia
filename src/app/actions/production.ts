"use server";
import { invalidateRecordingPreparation, syncVideoStepDate } from "@/lib/domain/production-dates";
import { assertRequiredChecks } from "@/lib/approvals";
import { revalidatePath } from "next/cache";

import { assertContentAccess, contentScope, lockVideoLifecycle } from "@/lib/access-scope";
import { auditInTransaction, type Cambio } from "@/lib/audit";
import { LEVEL, requireLevel, requirePermission, type SessionUser } from "@/lib/auth";
import { CHAIN_ORDER, CHAIN_STEP_RULES, PRODUCTION_STEP_MAP, type ChainStep } from "@/lib/constants";
import {
  assertStepAccess,
  completeStep,
  ensureChainForVideo,
  notifyCoordination,
  reassignStep,
  requestDesignChanges,
  resolveNotice,
  returnStep,
  takeStep,
  type CompleteStepInput,
  type CompleteStepResult,
} from "@/lib/domain/production-chain";
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
import { productionChainConfigured, productionChainEnabled } from "@/lib/production-chain-flag";
import { productionFlowEnabled } from "@/lib/production-flow-flag";
import { dateKey, field, formatDateLong, formatDateTime, fromDateKey, instantInZone } from "@/lib/utils";
import { validDay } from "@/lib/validation";
import { invalidateDomain } from "@/lib/view-invalidation";
import { WorkflowError } from "@/lib/workflow-policy";
import { endOfDayKey } from "@/lib/working-days";
import { stepAssigneeCapabilities } from "@/lib/work-assignees";

/**
 * Acciones del panel «Producción» de un video (PRODUCTION_FLOW_ENABLED) y de la cadena de
 * entregas (PRODUCTION_CHAIN_ENABLED, src/lib/domain/production-chain.ts).
 *
 *  - pedirDiseno: guionista (scripts.write) o coordinación (content.plan) con acceso al video.
 *  - marcarPaso / guardarMaterialPaso: coordinación (content.assign) o la persona asignada
 *    al paso; el enlace del material también lo puede dejar quien graba o edita el video.
 *  - reasignarPaso: solo content.assign (excepción manual sobre la automatización).
 *
 * Cadena de entregas (solo si está encendida para la marca del paso; si no, { error }):
 *  - marcarListo: el «Listo» de cada rol (id, revisión opcional, materialUrl o publishedUrl
 *    según el paso). Lo pulsa la persona asignada, coordinación (content.assign) o el Dueño.
 *  - devolverPaso: «Devolver al filmmaker» (EDICION) y «Devolver por correcciones»
 *    (PUBLICACION) con motivo de 5 a 1000 caracteres; en un diseño entregado, «Pedir cambios».
 *  - avisarCoordinacion: comentario con motivo que llega al ENCARGADO (o al Dueño).
 *  - crearPasoManual (alias crearPaso): content.assign; asegura el paso que le toca al video.
 *    assigneeId vacío = reglas automáticas; "sin-asignar" = «Sin asignar»; o un id.
 *  - tomarPaso, atenderAviso, pedirCambiosDiseno.
 *  - Con la cadena encendida, marcarPaso delega en completeStep («Reabrir» un paso hecho es
 *    devolver desde el paso abierto que lo sigue, con motivo) y reasignarPaso en reassignStep
 *    (la tarea y la fecha del video siguen al paso).
 *
 * Toda escritura se audita en la misma transacción (el dominio audita la suya). Con el flag
 * apagado no se lee ni se escribe nada. Los errores de negocio vuelven como { error } para
 * que EditForm los muestre y conserve el borrador; el éxito de la cadena vuelve como
 * { ok: true, message } con una frase para la persona.
 */

export type ProductionActionResult = { error: string } | { ok: true; message: string } | undefined;

const APAGADO = "El flujo de producción no está activo.";
const CADENA_APAGADA = "La cadena de entregas no está activa.";
const REVISION_INVALIDA = "La revisión del formulario no es válida. Recarga la página antes de guardar.";
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const SIN_ASIGNAR = "sin-asignar";
const SAFE_MESSAGES = new Set([
  EDIT_CONFLICT,
  REVISION_INVALIDA,
  "No tienes acceso a este video.",
  "No tienes acceso a esta marca.",
  "Tu perfil no tiene permiso para realizar esta acción.",
  "El video cambió. Recarga la página antes de continuar.",
]);

/** Ficha, tablero, calendario, Inicio, Guiones y la vista Cadena (después del commit). */
function refrescar(videoId: string) {
  invalidateDomain("content");
  revalidatePath(`/contenido/${videoId}`);
  revalidatePath("/tareas");
  if (productionChainConfigured()) revalidatePath("/cadena");
}

/** Solo mensajes de negocio conocidos llegan a la pantalla; el resto sigue su curso. */
async function legible(work: () => Promise<ProductionActionResult | void>): Promise<ProductionActionResult> {
  try {
    return (await work()) ?? undefined;
  } catch (error) {
    if (error instanceof ProductionFlowError || error instanceof WorkflowError) return { error: error.message };
    if (error instanceof Error && SAFE_MESSAGES.has(error.message)) return { error: error.message };
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return { error: EDIT_CONFLICT };
    throw error;
  }
}

type StepRow = { id: string; contentItemId: string; brandId: string; step: string; status: string; assigneeId: string | null; materialUrl: string | null; taskId: string | null; dueAt: Date | null };

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
  if (step.assigneeId === user.id && stepAssigneeCapabilities(step.step).every(capability => allows(user, capability))) return;
  if (purpose === "material" && (step.step === "GRABACION" || step.step === "EDICION")
    && await tx.productionStep.count({ where: { contentItemId: step.contentItemId,
      step: { in: ["GRABACION", "EDICION"].filter(kind => stepAssigneeCapabilities(kind).every(capability => allows(user, capability))) }, assigneeId: user.id } })) return;
  throw new ProductionFlowError("Solo coordinación o la persona asignada pueden actualizar este paso.");
}

const stepLabel = (step: string) => (PRODUCTION_STEP_MAP[step]?.label ?? step).toLowerCase();
const stepTitle = (step: string) => PRODUCTION_STEP_MAP[step]?.label ?? step;
/** «el guion», «la grabación», «el diseño»… */
const conArticulo = (step: string) => `${step === "GUION" || step === "DISENO" ? "el" : "la"} ${stepLabel(step)}`;

/* ------------------------------------------------------- APOYOS DE LA CADENA -- */

/** ¿La cadena maneja este paso? Sin cadena configurada no consulta nada (flujo de siempre). */
async function chainOwnsStep(tx: AppTransaction, id: string): Promise<boolean> {
  if (!productionChainConfigured()) return false;
  const step = await tx.productionStep.findUnique({ where: { id }, select: { brandId: true } });
  return Boolean(step && productionChainEnabled(step.brandId));
}

/** Revisión del formulario si viene (el dominio la valida con lockRevision); vacía = sin control. */
function optionalRevision(formData: FormData): string | undefined {
  return field(formData, "expectedUpdatedAt") || undefined;
}

/** Revisión obligatoria (formularios que ya la exigían sin cadena). */
function requiredRevision(formData: FormData): string {
  const value = field(formData, "expectedUpdatedAt");
  if (!ISO.test(value)) throw new Error(REVISION_INVALIDA);
  return value;
}

/** Motivo de una devolución o aviso: el dominio exige de 5 a 1000 caracteres. */
function motivoDe(formData: FormData): string {
  const raw = formData.get("motivo") ?? formData.get("reason");
  return typeof raw === "string" ? raw : "";
}

function listoInput(formData: FormData, revision: string | undefined): CompleteStepInput {
  return { expectedUpdatedAt: revision, expectedReviewToken: field(formData, "expectedReviewToken"), materialUrl: field(formData, "materialUrl") || null, publishedUrl: field(formData, "publishedUrl") || null };
}

async function videoOfStep(tx: AppTransaction, id: string): Promise<string> {
  return (await tx.productionStep.findUniqueOrThrow({ where: { id }, select: { contentItemId: true } })).contentItemId;
}

/** Frase para la persona después del «Listo»: a quién le toca ahora y para cuándo. */
async function listoMessage(tx: AppTransaction, result: CompleteStepResult): Promise<string> {
  if (result.status === "already") return "Este paso ya estaba listo.";
  if (result.step === "DISENO") return "Diseño entregado: quien lo pidió ya lo ve en su trabajo.";
  if (!result.next || !result.nextStepId) return "Listo: el video quedó publicado.";
  const next = await tx.productionStep.findUniqueOrThrow({ where: { id: result.nextStepId }, select: { dueAt: true, assignee: { select: { name: true } } } });
  const label = PRODUCTION_STEP_MAP[result.next]?.label ?? result.next;
  const deadline = next.dueAt ? `vence el ${formatDateLong(fromDateKey(dateKey(next.dueAt)))}` : "sin fecha, pendiente de programación";
  return next.assignee
    ? `Listo. Ahora le toca a ${next.assignee.name}: ${label.toLowerCase()}, ${deadline}.`
    : `Listo. El paso «${label}» queda sin asignar (${deadline}): coordinación lo asignará.`;
}

/**
 * Plazo manual de un formulario (fecha y hora opcional de Lima). Vacío → null (el dominio
 * calcula el plazo); inválido → mensaje legible.
 */
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
function readDue(formData: FormData, required: boolean): { dueAt: Date | null } | { error: string } {
  const dueKey = field(formData, "dueDate");
  const dueTime = field(formData, "dueTime");
  if (!dueKey && !required) return dueTime ? { error: "Indica la fecha de entrega." } : { dueAt: null };
  if (!validDay(dueKey)) return { error: "Indica una fecha de entrega válida." };
  if (dueTime && !TIME.test(dueTime)) return { error: "Indica la hora como HH:MM." };
  return { dueAt: dueTime ? instantInZone(dueKey, dueTime) : endOfDayKey(dueKey) };
}

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
    // Cadena de entregas: «Marcar hecho» es el «Listo» y «Reabrir» es devolver con motivo.
    if (await chainOwnsStep(tx, id)) {
      const revision = requiredRevision(formData);
      if (done) {
        const result = await completeStep(tx, user, id, listoInput(formData, revision));
        const videoId = await videoOfStep(tx, id);
        afterCommit(() => refrescar(videoId));
        return { ok: true, message: await listoMessage(tx, result) };
      }
      return reabrirConCadena(tx, user, id, revision, motivoDe(formData), afterCommit);
    }

    await lockRevision(tx, "ProductionStep", id, formData);
    const step = await readStep(tx, id);
    if (!step) return { error: "El paso ya no existe. Recarga la página." };
    await assertStepWriter(tx, user, step, "done");
    if (step.status === "CANCELADO") return { error: "El paso está cancelado. Reasígnalo para reactivarlo." };
    if ((step.status === "HECHO") === done) return;

    if (done && step.step === "GRABACION") {
      const video = await tx.contentItem.findUniqueOrThrow({ where: { id: step.contentItemId }, select: { shootDate: true } });
      if (!step.dueAt || !video.shootDate) throw new WorkflowError("Asigna una fecha de grabación antes de continuar.");
      await assertRequiredChecks(tx, step.contentItemId, ["PREPRODUCCION"]);
    }
    const completedAt = done ? new Date() : null;
    await tx.productionStep.update({ where: { id }, data: { status: done ? "HECHO" : "PENDIENTE", doneAt: completedAt } });
    await tx.task.updateMany({ where: { productionStep: { id } }, data: { status: done ? "HECHO" : "PENDIENTE", completedAt, completedById: done ? user.id : null } });
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

/**
 * «Reabrir» con la cadena: un paso de la cadena ya hecho solo se rehace devolviendo desde el
 * paso abierto que lo sigue (con motivo); un diseño entregado se reabre con «Pedir cambios».
 * Primero se autoriza (quien pulsa ve el paso; si no, el mismo mensaje que si no existiera) y
 * solo después se bloquea y se responde según el estado. Bloqueos en el orden del «Listo»:
 * ciclo de vida del video, después el paso.
 */
async function reabrirConCadena(tx: AppTransaction, user: SessionUser, id: string, revision: string, motivo: string, afterCommit: (effect: () => void) => void): Promise<ProductionActionResult> {
  const pre = await assertStepAccess(tx, user, id);
  await lockVideoLifecycle(tx, pre.contentItemId);
  await lockRevision(tx, "ProductionStep", id, revision);
  const step = await readStep(tx, id);
  if (!step) return { error: "El paso ya no existe. Recarga la página." };
  if (step.status === "PENDIENTE") return;
  if (step.status === "CANCELADO") return { error: "El paso está cancelado. Reasígnalo para reactivarlo." };
  if (step.status === "DEVUELTO") return { error: "Este paso fue devuelto: ahora le toca al paso anterior." };
  if (step.step === "DISENO") {
    await requestDesignChanges(tx, user, id, { motivo });
    afterCommit(() => refrescar(step.contentItemId));
    return { ok: true, message: "Pediste cambios en el diseño: vuelve al diseñador con 24 horas nuevas." };
  }
  const open = await tx.productionStep.findFirst({
    where: { contentItemId: step.contentItemId, status: "PENDIENTE", step: { in: [...CHAIN_ORDER] } },
    select: { id: true, step: true },
  });
  if (!open || CHAIN_STEP_RULES[open.step as ChainStep]?.returnsTo !== step.step) {
    return { error: `El paso «${stepTitle(step.step)}» ya está listo. Para rehacerlo, usa «Devolver» en el paso que sigue.` };
  }
  const result = await returnStep(tx, user, open.id, { motivo });
  afterCommit(() => refrescar(step.contentItemId));
  return { ok: true, message: `Devolviste el video: ${conArticulo(result.reopened)} vuelve a estar pendiente.` };
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
    // Cadena: el enlace de cada paso es de quien lo hace (el máster es del editor, no del filmmaker).
    const chain = await chainOwnsStep(tx, id);
    await lockRevision(tx, "ProductionStep", id, formData);
    const step = await readStep(tx, id);
    if (!step) return { error: "El paso ya no existe. Recarga la página." };
    await assertStepWriter(tx, user, step, chain ? "done" : "material");
    if (chain && (step.status !== "PENDIENTE" || step.step.startsWith("REVISION_"))) return { error: "Para cambiar una entrega cerrada, devuélvela y entrega una nueva versión desde su paso de trabajo." };
    if (step.materialUrl === read.url) return;

    await tx.productionStep.update({ where: { id }, data: { materialUrl: read.url } });
    const etiqueta = (chain ? CHAIN_STEP_RULES[step.step as ChainStep | "DISENO"]?.linkLabel : null)
      ?? (step.step === "DISENO" ? "Entrega del diseño" : "Material en la nube");
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

/** Excepción manual: otra persona u otro plazo. Queda como MANUAL y la automatización ya no lo toca. */
export async function reasignarPaso(formData: FormData): Promise<ProductionActionResult> {
  if (!productionFlowEnabled()) return { error: APAGADO };
  const user = await requirePermission("content.assign");
  const id = field(formData, "id");
  const assigneeId = field(formData, "assigneeId");
  if (!assigneeId || assigneeId.length > 100) return { error: "Elige a la persona responsable." };
  const due = readDue(formData, false);
  if ("error" in due) return { error: due.error };
  const dueAt = due.dueAt;

  return legible(() => withMutation(user, false, async (tx, afterCommit): Promise<ProductionActionResult> => {
    // Cadena de entregas: el paso manda; la tarea y la fecha del video (grabación o publicación) lo siguen.
    if (await chainOwnsStep(tx, id)) {
      const result = await reassignStep(tx, user, id, { assigneeId, dueAt, expectedUpdatedAt: requiredRevision(formData) });
      const videoId = await videoOfStep(tx, id);
      afterCommit(() => refrescar(videoId));
      return result.calendarNotice ? { ok: true, message: `Paso reasignado. ${result.calendarNotice}` } : undefined;
    }

    await lockRevision(tx, "ProductionStep", id, formData);
    const step = await readStep(tx, id);
    if (!step) return { error: "El paso ya no existe. Recarga la página." };
    await assertContentAccess(tx, user, step.contentItemId, "content.assign");
    const person = await eligiblePerson(tx, assigneeId, step.brandId, stepAssigneeCapabilities(step.step));
    if (!person) return { error: "La persona debe estar activa, autorizada para esta marca y tener permiso para realizar este paso." };
    const before = await tx.productionStep.findUniqueOrThrow({ where: { id }, select: { assignee: { select: { name: true } } } });

    if (!dueAt && step.step !== "GRABACION") throw new WorkflowError("Este paso necesita fecha límite.");
    if (step.status === "HECHO" && step.dueAt?.getTime() !== dueAt?.getTime()) throw new WorkflowError("La entrega ya terminó: su fecha histórica no se puede cambiar.");
    const reactivar = step.status === "CANCELADO";
    if ((step.status === "PENDIENTE" || reactivar) && ["GRABACION", "PUBLICACION"].includes(step.step)) {
      const video = await tx.contentItem.findUniqueOrThrow({ where: { id: step.contentItemId }, select: { shootDate: true, scheduledDate: true } });
      const field = step.step === "GRABACION" ? "shootDate" : "scheduledDate";
      const date = dueAt ? fromDateKey(dateKey(dueAt)) : null;
      if (dateKey(video[field]) !== dateKey(date)) {
        if (!allows(user, "content.plan") && !(field === "shootDate" && allows(user, "content.scheduleShoot"))) throw new WorkflowError("Necesitas permiso para planificar y cambiar este plazo.");
        if (field === "shootDate") await invalidateRecordingPreparation(tx, user, step.contentItemId);
        await tx.contentItem.update({ where: { id: step.contentItemId }, data: field === "shootDate" ? { shootDate: date } : { scheduledDate: date! } });
        await auditInTransaction(tx, { user, action: "EDITAR", entity: "ContentItem", entityId: step.contentItemId, brandId: step.brandId,
          summary: "Cambió la fecha de " + stepLabel(step.step) + " con el plazo del paso.",
          changes: { [field]: { etiqueta: "Fecha", antes: video[field]?.toISOString() ?? null, despues: date?.toISOString() ?? null } } });
      }
    }
    await tx.productionStep.update({ where: { id }, data: { assigneeId: person.id, dueAt, source: "MANUAL", ...(reactivar ? { status: "PENDIENTE" } : {}) } });
    if (reactivar) await tx.task.updateMany({ where: { productionStep: { id } }, data: { status: "PENDIENTE", completedAt: null, completedById: null } });
    const changes: Record<string, Cambio> = {};
    if (step.assigneeId !== person.id) changes.assigneeId = { etiqueta: "Responsable", antes: step.assigneeId, despues: person.id, verAntes: before.assignee?.name ?? "", verDespues: person.name };
    if (step.dueAt?.getTime() !== dueAt?.getTime()) changes.dueAt = { etiqueta: "Vence", antes: step.dueAt?.toISOString() ?? null, despues: dueAt?.toISOString() ?? null, verAntes: formatDateTime(step.dueAt), verDespues: formatDateTime(dueAt) };
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
      const dueDate = dueAt ? fromDateKey(dateKey(dueAt)) : null;
      if (task && (task.assigneeId !== person.id || task.dueDate?.getTime() !== dueDate?.getTime())) {
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
            dueDate: { etiqueta: "Fecha límite", antes: task.dueDate?.toISOString() ?? null, despues: dueDate?.toISOString() ?? null },
          },
        });
      }
    }
    if ((step.status === "PENDIENTE" || reactivar) && (step.step === "GRABACION" || step.step === "PUBLICACION")) await syncVideoStepDate(tx, user, step.contentItemId, step.step);
    await ensureStepAssignment(tx, user, step.contentItemId, step.step as StepKind, person);
    afterCommit(() => refrescar(step.contentItemId));
  }));
}

/* ------------------------------------------------------ CADENA DE ENTREGAS -- */

/** Cadena apagada (o flujo apagado): responde sin sesión ni base. */
function cadenaApagada(): ProductionActionResult {
  if (!productionFlowEnabled()) return { error: APAGADO };
  if (!productionChainConfigured()) return { error: CADENA_APAGADA };
  return undefined;
}

function readId(formData: FormData, name = "id"): string | null {
  const id = field(formData, name);
  return id && id.length <= 100 ? id : null;
}

/**
 * «Listo» del paso: guion → grabación → edición → publicación (y «Entregar diseño»). Mismas
 * validaciones por cualquier camino; sin SAVEPOINT: si algo falla no se escribe nada.
 */
export async function marcarListo(formData: FormData): Promise<ProductionActionResult> {
  const off = cadenaApagada();
  if (off) return off;
  const user = await requireLevel(LEVEL.MEMBER);
  const id = readId(formData);
  if (!id) return { error: "Falta el paso. Recarga la página." };
  const input = listoInput(formData, optionalRevision(formData));

  return legible(() => withMutation(user, false, async (tx, afterCommit): Promise<ProductionActionResult> => {
    const result = await completeStep(tx, user, id, input);
    const videoId = await videoOfStep(tx, id);
    afterCommit(() => refrescar(videoId));
    return { ok: true, message: await listoMessage(tx, result) };
  }));
}

/**
 * «Devolver al filmmaker» (editor) o «Devolver por correcciones» (community), con motivo.
 * Sobre un diseño entregado equivale a «Pedir cambios».
 */
export async function devolverPaso(formData: FormData): Promise<ProductionActionResult> {
  const off = cadenaApagada();
  if (off) return off;
  const user = await requireLevel(LEVEL.MEMBER);
  const id = readId(formData);
  if (!id) return { error: "Falta el paso. Recarga la página." };
  const motivo = motivoDe(formData);
  const expectedUpdatedAt = optionalRevision(formData);

  return legible(() => withMutation(user, false, async (tx, afterCommit): Promise<ProductionActionResult> => {
    // Paso ajeno o inexistente: el mismo mensaje, antes de mirar su tipo.
    const step = await assertStepAccess(tx, user, id);
    afterCommit(() => refrescar(step.contentItemId));
    if (step.step === "DISENO") {
      await requestDesignChanges(tx, user, id, { motivo, expectedUpdatedAt });
      return { ok: true, message: "Pediste cambios en el diseño: vuelve al diseñador con 24 horas nuevas." };
    }
    const result = await returnStep(tx, user, id, { motivo, expectedUpdatedAt });
    const back = await tx.productionStep.findUniqueOrThrow({ where: { id: result.reopenedStepId }, select: { assignee: { select: { name: true } } } });
    const label = conArticulo(result.reopened);
    return { ok: true, message: back.assignee ? `Devuelto: ${label} vuelve a ${back.assignee.name} con tu motivo.` : `Devuelto: ${label} vuelve a estar pendiente, sin asignar.` };
  }));
}

/** «Pedir cambios» de un diseño entregado (quien lo pidió o coordinación), con motivo. */
export async function pedirCambiosDiseno(formData: FormData): Promise<ProductionActionResult> {
  const off = cadenaApagada();
  if (off) return off;
  const user = await requireLevel(LEVEL.MEMBER);
  const id = readId(formData);
  if (!id) return { error: "Falta el diseño. Recarga la página." };
  const motivo = motivoDe(formData);
  const expectedUpdatedAt = optionalRevision(formData);

  return legible(() => withMutation(user, false, async (tx, afterCommit): Promise<ProductionActionResult> => {
    await requestDesignChanges(tx, user, id, { motivo, expectedUpdatedAt });
    const videoId = await videoOfStep(tx, id);
    afterCommit(() => refrescar(videoId));
    return { ok: true, message: "Pediste cambios en el diseño: vuelve al diseñador con 24 horas nuevas." };
  }));
}

/** «Avisar a coordinación»: comentario con motivo que llega al ENCARGADO de la marca o al Dueño. */
export async function avisarCoordinacion(formData: FormData): Promise<ProductionActionResult> {
  const off = cadenaApagada();
  if (off) return off;
  const user = await requireLevel(LEVEL.MEMBER);
  const id = readId(formData);
  if (!id) return { error: "Falta el paso. Recarga la página." };
  const motivo = motivoDe(formData);

  return legible(() => withMutation(user, false, async (tx, afterCommit): Promise<ProductionActionResult> => {
    const result = await notifyCoordination(tx, user, id, { motivo });
    const videoId = await videoOfStep(tx, id);
    afterCommit(() => refrescar(videoId));
    return { ok: true, message: result.coordinatorIds.length ? "Avisamos a coordinación: lo verá en su trabajo." : "Dejamos tu aviso en el video." };
  }));
}

/** Coordinación da por atendido un aviso sin tocar el paso. */
export async function atenderAviso(formData: FormData): Promise<ProductionActionResult> {
  const off = cadenaApagada();
  if (off) return off;
  const user = await requirePermission("content.assign");
  const id = readId(formData);
  if (!id) return { error: "Falta el paso. Recarga la página." };

  return legible(() => withMutation(user, false, async (tx, afterCommit): Promise<ProductionActionResult> => {
    await resolveNotice(tx, user, id);
    const videoId = await videoOfStep(tx, id);
    afterCommit(() => refrescar(videoId));
    return { ok: true, message: "Aviso atendido." };
  }));
}

/** «Tomar paso»: alguien apto (capacidad del paso y acceso a la marca) se asigna un paso sin responsable. */
export async function tomarPaso(formData: FormData): Promise<ProductionActionResult> {
  const off = cadenaApagada();
  if (off) return off;
  const user = await requireLevel(LEVEL.MEMBER);
  const id = readId(formData);
  if (!id) return { error: "Falta el paso. Recarga la página." };
  const expectedUpdatedAt = optionalRevision(formData);

  return legible(() => withMutation(user, false, async (tx, afterCommit): Promise<ProductionActionResult> => {
    await takeStep(tx, user, id, { expectedUpdatedAt });
    const videoId = await videoOfStep(tx, id);
    afterCommit(() => refrescar(videoId));
    return { ok: true, message: "El paso ahora es tuyo: lo verás en tu trabajo." };
  }));
}

/**
 * «Crear paso» (coordinación): asegura el paso de la cadena que le toca al video por su etapa
 * (videos anteriores a la cadena, asignación automática apagada o un paso perdido).
 * Campos: contentItemId (o videoId), step (opcional, debe coincidir con la etapa), assigneeId (vacío =
 * reglas del equipo; "sin-asignar" = sin responsable; o un id) y dueDate/dueTime opcionales.
 */
export async function crearPasoManual(formData: FormData): Promise<ProductionActionResult> {
  const off = cadenaApagada();
  if (off) return off;
  const user = await requirePermission("content.assign");
  const contentItemId = readId(formData, "contentItemId") ?? readId(formData, "videoId");
  if (!contentItemId) return { error: "Falta el video. Recarga la página." };
  const stepValue = field(formData, "step");
  if (stepValue && !(CHAIN_ORDER as readonly string[]).includes(stepValue)) return { error: "Elige un paso válido." };
  const step = (stepValue || undefined) as ChainStep | undefined;
  const assigneeValue = field(formData, "assigneeId");
  if (assigneeValue.length > 100) return { error: "La persona elegida no es válida. Recarga la página." };
  const due = readDue(formData, false);
  if ("error" in due) return { error: due.error };

  return legible(() => withMutation(user, false, async (tx, afterCommit): Promise<ProductionActionResult> => {
    const result = await ensureChainForVideo(tx, contentItemId, {
      actor: user,
      ...(step ? { step } : {}),
      ...(assigneeValue ? { assigneeId: assigneeValue === SIN_ASIGNAR ? null : assigneeValue } : {}),
      ...(due.dueAt ? { dueAt: due.dueAt } : {}),
    });
    afterCommit(() => refrescar(contentItemId));
    const label = stepTitle(result.step);
    if (!result.created) return { ok: true, message: `El video ya tenía abierto el paso «${label}».` };
    const person = result.assigneeId ? await tx.user.findUnique({ where: { id: result.assigneeId }, select: { name: true } }) : null;
    return { ok: true, message: person ? `Paso creado: «${label}» para ${person.name}.` : `Paso creado: «${label}», sin asignar.` };
  }));
}

/** Alias de crearPasoManual con el nombre de la mini-spec. */
export async function crearPaso(formData: FormData): Promise<ProductionActionResult> {
  return crearPasoManual(formData);
}
