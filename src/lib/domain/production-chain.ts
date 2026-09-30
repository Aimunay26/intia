/**
 * CADENA DE ENTREGAS POR VIDEO (PRODUCTION_CHAIN_ENABLED) — contrato estable del constructor B1.
 *
 *   GUION (guionista) ─Listo─► GRABACION (filmmaker) ─Listo─► EDICION (editor) ─Listo─► PUBLICACION (community) ─Publicado─► fin
 *                                   ▲                              │  ▲                        │
 *                                   └──── Devolver al filmmaker ───┘  └─ Devolver por correcciones ┘
 *   DISENO corre en paralelo (Pedir diseño → Entregar diseño) y no cuenta para el invariante.
 *
 * Decisiones del Dueño (29-30/09/2026) que mandan sobre la mini-spec:
 *   1. Guion → filmmaker directo, SIN aprobación del encargado. El «Listo» del guionista firma
 *      como «Sistema» (por el Listo de <guionista>; regla del dueño: sin revisión de guion):
 *      guion BORRADOR→REVISION→APROBADO con su versión (approveVersion), check «Guion escrito y
 *      revisado», SCRIPT_APPROVAL, video →GUION→APROBADO, y abre GRABACION con la fecha de
 *      grabación = próximo día de grabación de la marca posterior al Listo (recalcula la fecha
 *      automática; respeta la manual).
 *   2. Editor → community directo. El «Listo» del editor (con el enlace del máster) marca los
 *      checks de edición, firma FINAL_APPROVAL como «Sistema» (regla del dueño: sin revisión
 *      final) y abre PUBLICACION al día hábil siguiente. El community puede «Devolver por
 *      correcciones» (motivo 5-1000): se revoca la aprobación final como Sistema, PUBLICACION
 *      queda DEVUELTO y EDICION vuelve a PENDIENTE. El editor puede devolver al filmmaker y
 *      cualquiera con un paso abierto puede «Avisar a coordinación».
 *   3. El ENCARGADO supervisa y recibe «Sin asignar», avisos y bloqueos (production-scope.ts);
 *      si la marca no tiene ENCARGADO, le llegan al Dueño.
 *   5. Excepción a «las aprobaciones las firma una persona» (CONTRACT.md): cada firma automática
 *      se audita con usuario «Sistema» y la causa «por el Listo de <persona> [en nombre de …]».
 *      Approval.approvedById guarda a la persona cuyo Listo la originó y approvedByName empieza
 *      por «Sistema (…)». doneById de los checks de aprobación queda nulo.
 *
 * Reglas:
 *  - El paso manda: ProductionStep es la única verdad. Estado del video, checks y tarea son
 *    reflejos que se escriben en la MISMA transacción (completeStep, returnStep, chainEvent).
 *  - Exactamente un paso de cadena PENDIENTE por video (DISENO no cuenta). Abrir un paso cierra
 *    los demás: los anteriores quedan HECHO y los posteriores CANCELADO (Sistema).
 *  - Idempotente por automationKey (<video>:GUION|GRABACION|EDICION|PUBLICACION): un paso no se
 *    duplica, se reactiva.
 *  - Bloqueos en el orden de alternarCheck: guion → video (lockVideoLifecycle) → paso (FOR
 *    UPDATE o lockRevision con la revisión del formulario). Dos «Listo» a la vez: uno gana y el
 *    otro recibe EDIT_CONFLICT. Antes de bloquear nada, quien pulsa debe ver el paso (Dueño,
 *    responsable o video en su alcance): si no, el mismo mensaje que si no existiera, sin
 *    revelar su estado ni su marca.
 *  - Coordinación (content.assign) pulsa por la persona asignada sin firmar lo que su perfil no
 *    firma (CHAIN_COORD_CAPABILITY): revisión final, publicar, retirar la revisión final o
 *    aprobar el guion exigen su capacidad.
 *  - Responsable de un paso: activo, con la marca y con la capacidad del paso en su perfil
 *    (reasignar, «Crear paso» con persona, asignaciones del video).
 *  - Las entradas explícitas (completeStep, returnStep, notifyCoordination, reassignStep,
 *    takeStep, ensureChainForVideo y el evento TASK_MOVED) NO usan SAVEPOINT: si algo falla no
 *    se escribe nada y el error (ChainError, mensaje legible en español) llega a la persona.
 *    Un conflicto de concurrencia (P2034, o 40001/40P01 en un FOR UPDATE crudo) llega como
 *    Error(EDIT_CONFLICT); los requisitos del ciclo de vida (WorkflowError) llegan como ChainError.
 *    Los demás eventos vienen de otras acciones y corren en un SAVEPOINT: un fallo se deshace
 *    solo, se registra con un código cerrado y la acción principal sigue.
 *  - Logs: {"event":"production_chain","operation":<código>,"reason":<código>} sin datos
 *    personales. Instrumentación temporal: complete_step con milisegundos (retirar el 2026-10-20).
 *  - Con la cadena apagada (o la marca fuera del canario) nada de esto consulta la base:
 *    chainEvent vuelve con reason "chain_off" antes de la primera consulta cuando no está
 *    configurada, y los ganchos de production-flow.ts siguen su camino de siempre.
 *
 * CONTRATO (firmas estables; los tipos para UI están en src/lib/production-scope.ts y las
 * constantes de pasos en src/lib/constants.ts: CHAIN_ORDER, CHAIN_STEP_RULES):
 *
 *   completeStep(tx, actor, stepId, input?: CompleteStepInput): Promise<CompleteStepResult>
 *   returnStep(tx, actor, stepId, { motivo, expectedUpdatedAt?, now? }): Promise<ReturnStepResult>
 *   notifyCoordination(tx, actor, stepId, { motivo, now? }): Promise<NotifyResult>
 *   chainEvent(tx, actor, event: ChainEvent, { now? }?): Promise<ChainEventResult>
 *   ensureChainForVideo(tx, videoId, opts?: EnsureChainOptions): Promise<EnsureChainResult>
 *   reassignStep(tx, actor, stepId, { assigneeId, dueAt, expectedUpdatedAt? }): Promise<ReassignStepResult>
 *   takeStep(tx, actor, stepId, { expectedUpdatedAt?, now? }): Promise<ReassignStepResult>
 *   resolveNotice(tx, actor, stepId): Promise<void>
 *   requestDesignChanges(tx, actor, stepId, { motivo, expectedUpdatedAt?, now? }): Promise<ReassignStepResult>
 *   syncStepTask(tx, actor, stepId, "open" | "closed"): Promise<void>
 *   assertFinalApprovalAllowed(tx, videoId): Promise<void>              // alternarCheck (FINAL_APPROVAL)
 *   assertAssignmentRemovable(tx, videoId, userId, role): Promise<void> // quitarAsignacion
 *   expectedChainStep(videoStatus, finalApproved): ChainStep | null      // pura
 *   TEAM_ROLE_CAPABILITIES                                              // guardarEquipoDeMarca
 */
import type { SessionUser } from "@/lib/auth";
import type { AppTransaction } from "@/lib/prisma";
import { assertContentAccess, assertPublishable, contentScope, lockVideoLifecycle, scriptScope } from "@/lib/access-scope";
import { approveVersion, assertApprovedVersion, assertChecklistApproved, assertRequiredChecks, assertScriptApproved, revokeVersion, type ApprovalType } from "@/lib/approvals";
import { auditInTransaction, type Cambio } from "@/lib/audit";
import { CHAIN_COORD_CAPABILITY, CHAIN_ORDER, CHAIN_STEP_RULES, CONTENT_STATUS_MAP, DEAD_STATUSES, PRODUCTION_STEP_MAP, SCRIPT_STATUS_MAP, type ChainStep } from "@/lib/constants";
import { advanceVideoAsSystem, reopenVideoAsSystem } from "@/lib/domain/lifecycle";
import {
  ProductionFlowError,
  automationKey,
  createStep,
  eligiblePerson,
  ensureAssignment,
  readFlow,
  resolveAssignee,
  taskColumnFor,
  type Flow,
  type Person,
  type ProductionActor,
  type StepKind,
} from "@/lib/domain/production-flow";
import { EDIT_CONFLICT, lockRevision } from "@/lib/mutations";
import { allows, checklistCapability, type AccessUser, type Capability } from "@/lib/permissions";
import { productionChainConfigured, productionChainEnabled } from "@/lib/production-chain-flag";
import { dateKey, formatDateLong, formatDateTime, fromDateKey } from "@/lib/utils";
import { CONTENT_FLOW, WorkflowError } from "@/lib/workflow-policy";
import { dueIn24hSkippingSunday, earliestPublicationKey, endOfDayKey, nextRecordingDayKey, nextWorkingDayKey, publicationDueKey, scriptDueKey } from "@/lib/working-days";

/* ------------------------------------------------------------------ TIPOS -- */

export { CHAIN_ORDER, type ChainStep };
/** Reglas por paso (función, asignación, verbo, botón, capacidad, devolución, enlace). */
export const STEP_RULES = CHAIN_STEP_RULES;

/** Error de negocio con mensaje legible para la persona (production.ts ya lo muestra). */
export class ChainError extends ProductionFlowError {}

export type CompleteStepInput = {
  /** GRABACION: material grabado · EDICION: máster · DISENO: entrega. Vacío usa el ya guardado en el paso. */
  materialUrl?: string | null;
  /** PUBLICACION: enlace público. Vacío usa el ya guardado en el video. */
  publishedUrl?: string | null;
  /** Revisión del paso que vio el formulario (lockRevision): otra revisión → EDIT_CONFLICT. */
  expectedUpdatedAt?: string;
  now?: Date;
};
export type CompleteStepResult = {
  stepId: string;
  step: StepKind;
  /** "already": el paso ya estaba HECHO (doble clic o tarea movida otra vez); no se escribió nada. */
  status: "done" | "already";
  next: ChainStep | null;
  nextStepId: string | null;
  nextAssigneeId: string | null;
  videoStatus: string;
};
export type ReturnStepInput = { motivo: string; expectedUpdatedAt?: string; now?: Date };
export type ReturnStepResult = { stepId: string; reopened: ChainStep; reopenedStepId: string; assigneeId: string | null; commentId: string };
export type NotifyInput = { motivo: string; now?: Date };
export type NotifyResult = { stepId: string; commentId: string; coordinatorIds: string[] };
export type ReassignStepInput = { assigneeId: string | null; dueAt: Date; expectedUpdatedAt?: string };
export type ReassignStepResult = {
  stepId: string;
  reactivated: boolean;
  /** La fecha del video (grabación o publicación) siguió al nuevo plazo. */
  calendarMoved: boolean;
  /** Aviso legible si el calendario no se movió por falta de permiso. */
  calendarNotice: string | null;
};
export type EnsureChainOptions = {
  actor?: ProductionActor;
  /** Paso pedido («Crear paso»); si no coincide con la etapa del video, error legible. */
  step?: ChainStep;
  /** Presente: esa persona (null = «Sin asignar»). Ausente: reglas automáticas. */
  assigneeId?: string | null;
  dueAt?: Date;
  now?: Date;
};
export type EnsureChainResult = { created: boolean; stepId: string; step: ChainStep; assigneeId: string | null };

export type ChainEvent =
  | { type: "VIDEO_CREATED"; videoId: string }
  | { type: "SCRIPT_LINKED"; videoId: string }
  | { type: "SCRIPT_UNLINKED"; videoId: string }
  | { type: "SCRIPT_STATUS"; scriptId: string; from: string; to: string }
  | { type: "VIDEO_STATUS"; videoId: string; from: string; to: string }
  | { type: "CHECK_DONE"; videoId: string; stage: string; kind: string }
  | { type: "CHECK_REOPENED"; videoId: string; stage: string; kind: string }
  | { type: "DATE_CHANGED"; videoId: string; field: "shootDate" | "scheduledDate" }
  | { type: "ASSIGNMENT_CHANGED"; videoId: string; role: string; userId: string }
  | { type: "TEAM_CHANGED"; brandId: string; role: string; previousUserId: string | null; userId: string | null }
  | { type: "STEP_MARKED"; videoId: string; step: string }
  /** Sin SAVEPOINT: si el paso no puede cerrarse, lanza ChainError y el movimiento se rechaza. */
  | { type: "TASK_MOVED"; taskId: string; toColumnId: string };

export type ChainReason =
  | "ok" | "chain_off" | "video_missing" | "video_status" | "no_team" | "no_step" | "exists"
  | "chain_ahead" | "material_missing" | "not_ready" | "rejected" | "error";
export type ChainEventResult = { done: boolean; reason: ChainReason; stepId?: string | null };

/** Capacidad que debe conceder el perfil de quien ocupa cada función del equipo (guardarEquipoDeMarca). */
export const TEAM_ROLE_CAPABILITIES: Record<string, Capability[]> = {
  ENCARGADO: ["content.approve", "scripts.approve"],
  GUIONISTA: ["scripts.write"],
  FILMMAKER: ["content.shoot"],
  EDITOR: ["content.editing"],
  COMMUNITY: ["content.publish"],
  DISENADOR: ["content.design"],
};

/* -------------------------------------------------------------- UTILIDADES -- */

const CHAIN_KINDS: readonly string[] = CHAIN_ORDER;
const isChainStep = (step: string): step is ChainStep => CHAIN_KINDS.includes(step);
const orderOf = (step: string) => CHAIN_KINDS.indexOf(step);
const stepLabel = (step: string) => PRODUCTION_STEP_MAP[step]?.label ?? step;
const lower = (step: string) => stepLabel(step).toLowerCase();

/** Paso que le toca al video según su estado (pura; la usan la Cadena y «Crear paso»). */
export function expectedChainStep(status: string, finalApproved: boolean): ChainStep | null {
  if (status === "IDEA" || status === "GUION") return "GUION";
  if (status === "APROBADO" || status === "GRABACION") return "GRABACION";
  if (status === "EDICION") return finalApproved ? "PUBLICACION" : "EDICION";
  if (status === "PROGRAMADO") return "PUBLICACION";
  return null;
}

/** Quien marca cada check, para el error «Falta X: lo marca …». */
const WHO: Partial<Record<Capability, string>> = {
  "scripts.write": "el guionista",
  "content.shoot": "el filmmaker",
  "content.editing": "el editor",
  "content.design": "el diseñador",
  "content.publish": "el community",
  "content.plan": "coordinación",
  "content.approve": "coordinación",
};

/** Prefijo de auditoría que marca una fecha de grabación como automática (la cadena puede recalcularla). */
const AUTO_SHOOT = "Programó la grabación";
const WRITTEN_LABEL = /guion escrito/i;

const STEP_SELECT = {
  id: true, contentItemId: true, brandId: true, step: true, status: true, assigneeId: true, dueAt: true, source: true,
  taskId: true, materialUrl: true, notes: true, requestedById: true, automationKey: true, updatedAt: true, doneAt: true,
} as const;
const VIDEO_SELECT = {
  id: true, title: true, brandId: true, status: true, scriptId: true, shootDate: true, scheduledDate: true,
  publishedUrl: true, publishedAt: true, cta: true,
} as const;

type StepRow = {
  id: string; contentItemId: string; brandId: string; step: string; status: string; assigneeId: string | null; dueAt: Date;
  source: string; taskId: string | null; materialUrl: string | null; notes: string | null; requestedById: string | null;
  automationKey: string; updatedAt: Date; doneAt: Date | null;
};
type VideoRow = {
  id: string; title: string; brandId: string; status: string; scriptId: string | null; shootDate: Date | null;
  scheduledDate: Date; publishedUrl: string | null; publishedAt: Date | null; cta: string | null;
};
type ActorRole = "owner" | "coord" | "assignee" | "event";

function log(operation: string, reason: string, extra: Record<string, string | number> = {}) {
  console.info(JSON.stringify({ event: "production_chain", operation, reason, ...extra }));
}

function reasonCode(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "";
  return /^P\d{4}$/.test(code) ? code : "unknown";
}

/**
 * Conflicto de concurrencia (serialización o interbloqueo). Prisma lo entrega como P2034 en las
 * consultas normales y como P2010 con código 40001/40P01 en las crudas (FOR UPDATE): las dos se
 * convierten en EDIT_CONFLICT, el mismo mensaje que da withMutation.
 */
function isConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, meta, message } = error as { code?: unknown; meta?: { code?: unknown }; message?: unknown };
  if (code === "P2034") return true;
  const db = String(meta?.code ?? "");
  return db === "40001" || db === "40P01" || (typeof message === "string" && /Code: `(40001|40P01)`/.test(message));
}

/** Entradas explícitas: un conflicto de concurrencia llega a la persona como EDIT_CONFLICT. */
async function conflicts<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (isConflict(error)) throw new Error(EDIT_CONFLICT);
    throw error;
  }
}

/** Los requisitos del ciclo de vida lanzan WorkflowError: aquí se entregan como ChainError. */
async function business<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof WorkflowError) throw new ChainError(error.message);
    throw error;
  }
}

/** Enlace http(s) de la nube: vacío → null; inválido → ChainError. */
function readLink(value: string | null | undefined, label: string): string | null {
  const link = (value ?? "").trim();
  if (!link) return null;
  if (link.length > 2000) throw new ChainError(`El enlace «${label}» admite hasta 2000 caracteres.`);
  if (/\s/.test(link) || !URL.canParse(link) || !["http:", "https:"].includes(new URL(link).protocol)) {
    throw new ChainError(`Pega el enlace completo de «${label}» (empieza con https://).`);
  }
  return link;
}

function readMotivo(value: string | null | undefined, what: string): string {
  const motivo = (value ?? "").replace(/\r\n?/g, "\n").trim();
  if (motivo.length < 5 || motivo.length > 1000) throw new ChainError(`Indica el motivo ${what} (entre 5 y 1000 caracteres).`);
  return motivo;
}

/** Quien «firma» lo automático: la persona cuyo Listo lo originó, con nombre «Sistema (…)». */
function signer(actor: ProductionActor, label: string): AccessUser & { name: string } {
  return { id: actor?.id ?? "sistema", role: "SYSTEM", name: `Sistema (${label})`.slice(0, 200) };
}

/** Mismo mensaje para un paso que no existe y para uno que no se puede ver. */
const NO_ACCESS = "No tienes acceso a este paso o ya no existe. Recarga la página.";

/**
 * Persona apta para un paso: activa, con la marca y con la capacidad del paso en su perfil
 * (los perfiles guardados, no los de una sesión). null si no existe o no es apta para la marca.
 */
async function personFor(tx: AppTransaction, userId: string, brandId: string): Promise<(Person & { can: (capability: Capability) => boolean }) | null> {
  const row = await tx.user.findFirst({
    where: { id: userId, active: true, OR: [{ role: "OWNER" }, { brandAccess: { some: { brandId } } }] },
    select: { id: true, name: true, role: true, workProfiles: { select: { profile: true } } },
  });
  if (!row) return null;
  const access: AccessUser = { id: row.id, role: row.role, profiles: row.workProfiles.map((p) => p.profile) };
  return { id: row.id, name: row.name, can: (capability) => allows(access, capability) };
}

/** «Carlos no puede grabar: su perfil no lo permite.» */
function cannotDo(name: string, step: string): string {
  const verb = (STEP_RULES[step as ChainStep | "DISENO"]?.task ?? stepLabel(step)).toLowerCase();
  return `${name} no puede ${verb === "diseño" ? "hacer el diseño" : verb}: su perfil no lo permite. Elige a otra persona o cambia sus perfiles en Equipo.`;
}

/**
 * Responsable elegido a mano (reasignar, «Crear paso», asignación en el video): apto para la
 * marca y con la capacidad del paso. Si no, ChainError legible.
 */
async function assignablePerson(tx: AppTransaction, userId: string, brandId: string, step: string): Promise<Person> {
  const person = await personFor(tx, userId, brandId);
  if (!person) throw new ChainError("La persona debe estar activa y autorizada para esta marca.");
  const rule = STEP_RULES[step as ChainStep | "DISENO"];
  if (rule && !person.can(rule.capability)) throw new ChainError(cannotDo(person.name, step));
  return { id: person.id, name: person.name };
}

async function nameOf(tx: AppTransaction, id: string | null): Promise<string | null> {
  if (!id) return null;
  return (await tx.user.findUnique({ where: { id }, select: { name: true } }))?.name ?? null;
}

function loadStep(tx: AppTransaction, id: string): Promise<StepRow | null> {
  return tx.productionStep.findUnique({ where: { id }, select: STEP_SELECT });
}
function loadVideo(tx: AppTransaction, id: string): Promise<VideoRow | null> {
  return tx.contentItem.findUnique({ where: { id }, select: VIDEO_SELECT });
}
async function reloadVideo(tx: AppTransaction, id: string): Promise<VideoRow> {
  const video = await loadVideo(tx, id);
  if (!video) throw new ChainError("El video ya no existe. Recarga la página.");
  return video;
}
function openChainSteps(tx: AppTransaction, videoId: string): Promise<StepRow[]> {
  return tx.productionStep.findMany({
    where: { contentItemId: videoId, status: "PENDIENTE", step: { in: [...CHAIN_ORDER] } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: STEP_SELECT,
  });
}
async function finalApproved(tx: AppTransaction, videoId: string): Promise<boolean> {
  return (await tx.checklistItem.count({ where: { contentItemId: videoId, kind: "FINAL_APPROVAL", done: true } })) > 0;
}
async function validApproval(tx: AppTransaction, type: ApprovalType, id: string, approvalId: string | null): Promise<boolean> {
  try {
    await assertApprovedVersion(tx, type, id, approvalId);
    return true;
  } catch (error) {
    if (error instanceof WorkflowError) return false;
    throw error;
  }
}

/**
 * ¿Quien pulsa puede ver este paso? El Dueño; la persona asignada con acceso a la marca; o quien
 * tiene el video en su alcance (content.view). Si no, NO_ACCESS: el mismo mensaje que si el paso
 * no existiera, antes de revelar su estado, su tipo o su marca y antes de bloquear filas.
 */
async function assertStepVisible(tx: AppTransaction, actor: SessionUser, pre: { contentItemId: string; brandId: string; assigneeId: string | null }) {
  if (actor.role === "OWNER") return;
  if (!actor.brandIds?.includes(pre.brandId)) throw new ChainError(NO_ACCESS);
  if (pre.assigneeId === actor.id) return;
  if (allows(actor, "content.view") && await tx.contentItem.count({ where: { AND: [{ id: pre.contentItemId }, contentScope(actor, "content.view")] } })) return;
  throw new ChainError(NO_ACCESS);
}

/**
 * Para las acciones que miran el paso antes de llamar al dominio («Reabrir», «Devolver»): el
 * paso existe y quien pulsa lo puede ver; si no, ChainError con el mensaje uniforme.
 */
export async function assertStepAccess(tx: AppTransaction, actor: SessionUser, stepId: string): Promise<{ contentItemId: string; brandId: string; step: string }> {
  const pre = await tx.productionStep.findUnique({ where: { id: stepId }, select: { contentItemId: true, brandId: true, assigneeId: true, step: true } });
  if (!pre) throw new ChainError(NO_ACCESS);
  await assertStepVisible(tx, actor, pre);
  return pre;
}

/**
 * Autoriza la vista del paso y bloquea en el orden de alternarCheck (guion → video → paso) y
 * vuelve a leer ya bloqueado. Con revisión del formulario, una revisión vieja lanza
 * EDIT_CONFLICT (lockRevision).
 */
async function lockStep(tx: AppTransaction, actor: SessionUser, stepId: string, expectedUpdatedAt?: string): Promise<{ step: StepRow; video: VideoRow }> {
  const pre = await tx.productionStep.findUnique({ where: { id: stepId }, select: { contentItemId: true, brandId: true, assigneeId: true } });
  if (!pre) throw new ChainError(NO_ACCESS);
  await assertStepVisible(tx, actor, pre);
  if (!productionChainEnabled(pre.brandId)) throw new ChainError("La cadena de entregas no está activa para esta marca.");
  await lockVideoLifecycle(tx, pre.contentItemId);
  if (expectedUpdatedAt) await lockRevision(tx, "ProductionStep", stepId, expectedUpdatedAt);
  else await tx.$queryRaw`SELECT id FROM "ProductionStep" WHERE id = ${stepId} FOR UPDATE`;
  const step = await loadStep(tx, stepId);
  if (!step) throw new ChainError(NO_ACCESS);
  return { step, video: await reloadVideo(tx, step.contentItemId) };
}

type RoleAction = "complete" | "return" | "notify";

/**
 * Coordinación pulsa por otra persona, pero no firma lo que su perfil no firma: aprobar el guion
 * (scripts.approve, o scripts.write sobre ese guion), la revisión final (content.approve),
 * publicar (content.publish) ni retirar la revisión final (content.approve).
 */
async function assertCoordinationCan(tx: AppTransaction, actor: SessionUser, step: StepRow, video: VideoRow, action: RoleAction) {
  if (action === "notify") return;
  if (step.step === "GUION" && action === "complete") {
    if (allows(actor, "scripts.approve")) return;
    if (video.scriptId && allows(actor, "scripts.write") && await tx.script.count({ where: { AND: [{ id: video.scriptId }, scriptScope(actor, "scripts.write")] } })) return;
    throw new ChainError("Tu perfil no puede aprobar este guion: el «Listo» lo pulsa el guionista o quien pueda aprobar guiones.");
  }
  const needed = CHAIN_COORD_CAPABILITY[step.step as ChainStep]?.[action];
  if (!needed || allows(actor, needed)) return;
  if (step.step === "PUBLICACION" && action === "complete") throw new ChainError("Tu perfil no puede publicar: el «Publicado» lo pulsa el community o quien pueda publicar.");
  if (action === "return") throw new ChainError("Tu perfil no puede retirar la revisión final: la devolución la hace el community o quien pueda aprobar.");
  throw new ChainError("Tu perfil no puede firmar la revisión final: el «Listo» lo pulsa el editor o quien pueda aprobar.");
}

/**
 * Quién puede pulsar en un paso: el Dueño; la persona asignada con acceso al video y con la
 * capacidad del paso; o coordinación (content.assign sobre el video), por la persona asignada y
 * solo si su perfil firma lo que el paso firma (assertCoordinationCan).
 */
async function actorRole(tx: AppTransaction, actor: SessionUser, step: StepRow, video: VideoRow, action: RoleAction): Promise<ActorRole> {
  if (actor.role === "OWNER") return "owner";
  const rule = STEP_RULES[step.step as ChainStep | "DISENO"];
  const mine = Boolean(step.assigneeId) && step.assigneeId === actor.id;
  if (mine && (!rule || allows(actor, rule.capability))) {
    await assertContentAccess(tx, actor, step.contentItemId, "content.view");
    return "assignee";
  }
  if (allows(actor, "content.assign") && await tx.contentItem.count({ where: { AND: [{ id: step.contentItemId }, contentScope(actor, "content.assign")] } })) {
    await assertCoordinationCan(tx, actor, step, video, action);
    return "coord";
  }
  if (mine) throw new ChainError("Tu perfil no puede completar este paso. Pide a coordinación que lo complete.");
  throw new ChainError("Solo coordinación o la persona asignada pueden actualizar este paso.");
}

/** « en nombre de Carlos» cuando coordinación pulsa por la persona asignada. */
async function onBehalf(tx: AppTransaction, actor: ProductionActor, step: StepRow): Promise<string> {
  if (!actor || !step.assigneeId || step.assigneeId === actor.id) return "";
  const name = await nameOf(tx, step.assigneeId);
  return name ? ` en nombre de ${name}` : "";
}

/* ----------------------------------------------------------- SAVEPOINT -- */

const SAVEPOINT = "intia_production_chain";
const LOGGED: ReadonlySet<ChainReason> = new Set(["material_missing", "not_ready", "chain_ahead", "video_status"]);

/** Evento que viene de otra acción: un fallo se deshace solo y la acción principal sigue. */
async function guardedChain(tx: AppTransaction, operation: string, work: () => Promise<ChainEventResult>): Promise<ChainEventResult> {
  await tx.$executeRawUnsafe(`SAVEPOINT ${SAVEPOINT}`);
  try {
    const result = await work();
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${SAVEPOINT}`);
    if (!result.done && LOGGED.has(result.reason)) log(operation, result.reason);
    return result;
  } catch (error) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${SAVEPOINT}`);
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${SAVEPOINT}`);
    const rejected = error instanceof ProductionFlowError || error instanceof WorkflowError;
    console.warn(JSON.stringify({ event: "production_chain", operation, reason: rejected ? "rejected" : "error", ...(rejected ? {} : { code: reasonCode(error) }) }));
    return { done: false, reason: rejected ? "rejected" : "error" };
  }
}

/* -------------------------------------------------------- TAREA DEL PASO -- */

/** Columna «Listo»: la última por orden que admite la marca. Con una sola columna, crea «Listo». */
async function lastColumnFor(tx: AppTransaction, actor: ProductionActor, brandId: string): Promise<{ id: string; name: string }> {
  const first = await taskColumnFor(tx, actor, brandId);
  const where = { OR: [{ brandId: null }, { brandId }] };
  const last = await tx.taskColumn.findFirst({ where, orderBy: [{ order: "desc" }, { id: "desc" }], select: { id: true, name: true } });
  if (last && last.id !== first) return last;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(781240110)`;
  const again = await tx.taskColumn.findFirst({ where, orderBy: [{ order: "desc" }, { id: "desc" }], select: { id: true, name: true } });
  if (again && again.id !== first) return again;
  const max = await tx.taskColumn.findFirst({ orderBy: { order: "desc" }, select: { order: true } });
  const column = await tx.taskColumn.create({ data: { name: "Listo", color: "#10b981", brandId, order: (max?.order ?? 0) + 1 }, select: { id: true, name: true } });
  await auditInTransaction(tx, { user: actor, action: "CREAR", entity: "TaskColumn", entityId: column.id, brandId, summary: `Creó la columna "${column.name}" para cerrar las tareas de la cadena de entregas` });
  return column;
}

/**
 * La tarea sigue al paso (un paso, una tarea): cerrado → columna «Listo»; abierto → fuera de
 * «Listo» (a la primera si estaba ahí). Además copia responsable y fecha límite. Si el paso
 * abierto perdió su tarea, se crea otra.
 */
export async function syncStepTask(tx: AppTransaction, actor: ProductionActor, stepId: string, state: "open" | "closed"): Promise<void> {
  const step = await tx.productionStep.findUnique({ where: { id: stepId }, select: { id: true, taskId: true, brandId: true, assigneeId: true, dueAt: true, step: true, contentItemId: true } });
  if (!step) return;
  const dueDate = fromDateKey(dateKey(step.dueAt));
  if (!step.taskId) {
    if (state === "closed") return;
    const video = await tx.contentItem.findUniqueOrThrow({ where: { id: step.contentItemId }, select: { title: true } });
    const columnId = await taskColumnFor(tx, actor, step.brandId);
    const last = await tx.task.findFirst({ where: { columnId }, orderBy: { order: "desc" }, select: { order: true } });
    const rule = STEP_RULES[step.step as ChainStep | "DISENO"];
    const task = await tx.task.create({
      data: {
        title: `${rule?.task ?? stepLabel(step.step)}: ${video.title}`.slice(0, 500),
        description: `${stepLabel(step.step)} del video "${video.title}". Vence: ${formatDateTime(step.dueAt)}. Ficha: /contenido/${step.contentItemId}`.slice(0, 2000),
        kind: "ACCION", priority: "ALTA", dueDate, columnId, assigneeId: step.assigneeId, brandId: step.brandId, order: (last?.order ?? -1) + 1,
      },
      select: { id: true, title: true },
    });
    await tx.productionStep.update({ where: { id: step.id }, data: { taskId: task.id } });
    await auditInTransaction(tx, { user: actor, action: "CREAR", entity: "Task", entityId: task.id, brandId: step.brandId, summary: `Creó la tarea "${task.title}" (cadena de entregas)` });
    return;
  }
  const task = await tx.task.findUnique({ where: { id: step.taskId }, select: { id: true, title: true, columnId: true, assigneeId: true, dueDate: true } });
  if (!task) return;
  const listo = await lastColumnFor(tx, actor, step.brandId);
  let columnId = task.columnId;
  if (state === "closed" && task.columnId !== listo.id) columnId = listo.id;
  if (state === "open" && task.columnId === listo.id) columnId = await taskColumnFor(tx, actor, step.brandId);
  const changes: Record<string, Cambio> = {};
  if (columnId !== task.columnId) changes.columnId = { etiqueta: "Etapa", antes: task.columnId, despues: columnId, verDespues: state === "closed" ? listo.name : "Pendiente" };
  if (task.assigneeId !== step.assigneeId) changes.assigneeId = { etiqueta: "Responsable", antes: task.assigneeId, despues: step.assigneeId };
  if (state === "open" && task.dueDate?.getTime() !== dueDate.getTime()) changes.dueDate = { etiqueta: "Fecha límite", antes: task.dueDate?.toISOString() ?? null, despues: dueDate.toISOString() };
  if (!Object.keys(changes).length) return;
  const order = columnId !== task.columnId ? ((await tx.task.findFirst({ where: { columnId }, orderBy: { order: "desc" }, select: { order: true } }))?.order ?? -1) + 1 : undefined;
  await tx.task.update({
    where: { id: task.id },
    data: { columnId, assigneeId: step.assigneeId, ...(state === "open" ? { dueDate } : {}), ...(order !== undefined ? { order } : {}) },
  });
  await auditInTransaction(tx, {
    user: actor,
    action: "EDITAR",
    entity: "Task",
    entityId: task.id,
    brandId: step.brandId,
    summary: changes.columnId
      ? `Movió la tarea "${task.title}" a ${state === "closed" ? `«${listo.name}»` : "pendientes"} (cadena de entregas)`
      : `Actualizó la tarea "${task.title}" con su paso (cadena de entregas)`,
    changes,
  });
}

/* --------------------------------------------------------- ESTADO DEL PASO -- */

async function closeStep(tx: AppTransaction, actor: ProductionActor, step: StepRow, video: VideoRow, status: "HECHO" | "CANCELADO" | "DEVUELTO", now: Date, summary: string, extra: Record<string, Cambio> = {}) {
  await tx.productionStep.update({ where: { id: step.id }, data: { status, doneAt: status === "HECHO" ? now : null } });
  await auditInTransaction(tx, {
    user: actor,
    action: status === "HECHO" ? "COMPLETAR" : "EDITAR",
    entity: "ProductionStep",
    entityId: step.id,
    brandId: video.brandId,
    summary,
    changes: { status: { etiqueta: "Estado", antes: step.status, despues: status }, ...extra },
  });
  await syncStepTask(tx, actor, step.id, "closed");
}

/**
 * Invariante: un solo paso de cadena abierto. Los anteriores a `keep` quedan HECHO y los
 * posteriores CANCELADO, firmados como Sistema con la causa. keep null (publicado): todos HECHO.
 */
async function closeOtherOpen(tx: AppTransaction, video: VideoRow, keep: ChainStep | null, now: Date, cause: string) {
  for (const other of await openChainSteps(tx, video.id)) {
    if (other.step === keep) continue;
    const earlier = keep === null || orderOf(other.step) < orderOf(keep);
    await closeStep(tx, null, other, video, earlier ? "HECHO" : "CANCELADO", now,
      `${earlier ? "Cerró" : "Canceló"} la ${lower(other.step)} de "${video.title}" (Sistema, ${cause})`);
  }
}

/** Un video cancelado o pausado no deja pasos pendientes (tampoco diseños). */
async function cancelAllOpen(tx: AppTransaction, video: VideoRow, now: Date, cause: string): Promise<number> {
  const open = await tx.productionStep.findMany({ where: { contentItemId: video.id, status: "PENDIENTE" }, select: STEP_SELECT });
  for (const step of open) await closeStep(tx, null, step, video, "CANCELADO", now, `Canceló la ${lower(step.step)} de "${video.title}" (Sistema, ${cause})`);
  return open.length;
}

/* ------------------------------------------------------------------ FECHAS -- */

/**
 * Origen de la fecha de grabación según la última auditoría del video que la cambió:
 * "auto" (la programó el sistema), "manual" (una persona) o null (nadie la auditó en este
 * video: p. ej. una copia de «Duplicar» que heredó la del original).
 */
async function shootDateOrigin(tx: AppTransaction, videoId: string): Promise<"auto" | "manual" | null> {
  const last = await tx.auditLog.findFirst({
    where: { entity: "ContentItem", entityId: videoId, changes: { contains: '"shootDate"' } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { summary: true },
  });
  if (!last) return null;
  return last.summary.startsWith(AUTO_SHOOT) ? "auto" : "manual";
}

async function writeShootDate(tx: AppTransaction, video: VideoRow, key: string, origin: "auto" | "manual", cause: string) {
  const shootDate = fromDateKey(key);
  if (video.shootDate && dateKey(video.shootDate) === key) return;
  await tx.contentItem.update({ where: { id: video.id }, data: { shootDate } });
  await auditInTransaction(tx, {
    user: null,
    action: "EDITAR",
    entity: "ContentItem",
    entityId: video.id,
    brandId: video.brandId,
    summary: origin === "auto"
      ? `${AUTO_SHOOT} de "${video.title}" para el ${formatDateLong(shootDate)}, el próximo día de grabación de la marca (Sistema, ${cause})`
      : `Movió la grabación de "${video.title}" al ${formatDateLong(shootDate)} con el plazo del paso (Sistema, ${cause})`,
    changes: { shootDate: { etiqueta: "Fecha de grabación", antes: video.shootDate?.toISOString() ?? null, despues: shootDate.toISOString(), verDespues: formatDateLong(shootDate) } },
  });
  video.shootDate = shootDate;
}

async function writeScheduledDate(tx: AppTransaction, video: VideoRow, key: string, why: string, cause: string) {
  const scheduledDate = fromDateKey(key);
  if (dateKey(video.scheduledDate) === key) return;
  await tx.contentItem.update({ where: { id: video.id }, data: { scheduledDate } });
  await auditInTransaction(tx, {
    user: null,
    action: "EDITAR",
    entity: "ContentItem",
    entityId: video.id,
    brandId: video.brandId,
    summary: `Movió la publicación de "${video.title}" al ${formatDateLong(scheduledDate)}: ${why} (Sistema, ${cause})`,
    changes: { scheduledDate: { etiqueta: "Fecha prevista", antes: video.scheduledDate.toISOString(), despues: scheduledDate.toISOString(), verAntes: formatDateLong(video.scheduledDate), verDespues: formatDateLong(scheduledDate) } },
  });
  video.scheduledDate = scheduledDate;
}

/**
 * Fecha de grabación al abrir GRABACION: sin fecha, el próximo día de grabación posterior a
 * hoy; fecha automática (auditada como tal), se recalcula igual; fecha puesta a mano, manda.
 * Una fecha sin origen auditado en este video (heredada al duplicar, o anterior a la cadena)
 * que ya pasó o es de hoy también se recalcula: la grabación no nace vencida.
 * Nunca se publica antes de grabar: una fecha prevista anterior se corre.
 */
async function planRecording(tx: AppTransaction, video: VideoRow, flow: Flow, now: Date, cause: string): Promise<string> {
  const todayKey = dateKey(now);
  let shootKey: string;
  const origin = video.shootDate ? await shootDateOrigin(tx, video.id) : null;
  const stale = Boolean(video.shootDate && dateKey(video.shootDate) <= todayKey);
  if (!video.shootDate || origin === "auto" || (origin === null && stale)) {
    shootKey = nextRecordingDayKey(todayKey, flow.weekdays);
    await writeShootDate(tx, video, shootKey, "auto", cause);
  } else {
    shootKey = dateKey(video.shootDate);
  }
  if (dateKey(video.scheduledDate) <= shootKey) await writeScheduledDate(tx, video, earliestPublicationKey(shootKey), "no se publica antes de grabar y editar", cause);
  return shootKey;
}

/* ------------------------------------------------------------ ABRIR PASO -- */

type OpenOptions = {
  now: Date;
  cause: string;
  /** Presente: esa persona (null = sin asignar). Ausente: se conserva o se resuelve. */
  assigneeId?: string | null;
  /** Plazo explícito (devolución, «Crear paso», reasignación). */
  dueAt?: Date;
  /** Origen de una fecha explícita de grabación: auto (devolución) o manual (coordinación). */
  dateOrigin?: "auto" | "manual";
  source?: "AUTO" | "MANUAL";
  /** Auditoría de la reactivación (p. ej. el motivo de una devolución). */
  reopenChanges?: Record<string, Cambio>;
  reopenSummary?: string;
};
type Opened = { stepId: string; assigneeId: string | null; created: boolean; reopened: boolean };

/**
 * Abre (crea o reactiva) el paso `kind` del video y cierra los demás abiertos. Un paso HECHO,
 * CANCELADO o DEVUELTO se reactiva con plazo nuevo: conserva a su persona si sigue apta (MANUAL
 * o devolución); si no, vuelve a buscarla (AUTO). Sin persona apta: «Sin asignar».
 */
async function openChainStep(tx: AppTransaction, actor: ProductionActor, videoIn: VideoRow, kind: ChainStep, opts: OpenOptions): Promise<Opened> {
  const video = { ...videoIn };
  const flow = await readFlow(tx, video.brandId);
  if (!flow.team.size) throw new ChainError("La marca no tiene equipo: define el equipo antes de crear pasos.");
  const todayKey = dateKey(opts.now);
  const existing = await tx.productionStep.findUnique({ where: { automationKey: automationKey(video.id, kind) }, select: STEP_SELECT });
  if (existing?.status === "PENDIENTE" && opts.assigneeId === undefined && !opts.dueAt) {
    await closeOtherOpen(tx, video, kind, opts.now, opts.cause);
    return { stepId: existing.id, assigneeId: existing.assigneeId, created: false, reopened: false };
  }

  // Plazo (y las fechas del video que lo reflejan).
  let dueKey: string;
  if (opts.dueAt) {
    dueKey = dateKey(opts.dueAt);
    if (kind === "GRABACION") await writeShootDate(tx, video, dueKey, opts.dateOrigin ?? "manual", opts.cause);
    if (kind === "PUBLICACION") await writeScheduledDate(tx, video, dueKey, "sigue el plazo de la publicación", opts.cause);
  } else if (kind === "GUION") dueKey = scriptDueKey(todayKey);
  else if (kind === "GRABACION") dueKey = await planRecording(tx, video, flow, opts.now, opts.cause);
  else if (kind === "EDICION") dueKey = nextWorkingDayKey(todayKey);
  else {
    dueKey = publicationDueKey(todayKey, dateKey(video.scheduledDate));
    if (dateKey(video.scheduledDate) < dueKey) await writeScheduledDate(tx, video, dueKey, "se publica al día hábil siguiente", opts.cause);
  }
  const dueAt = opts.dueAt ?? endOfDayKey(dueKey);

  // Responsable.
  let person: Person | null = null;
  if (opts.assigneeId !== undefined) {
    person = opts.assigneeId ? await eligiblePerson(tx, opts.assigneeId, video.brandId) : null;
    if (opts.assigneeId && !person) throw new ChainError("La persona debe estar activa y autorizada para esta marca.");
  } else {
    const keep = existing?.assigneeId ? await eligiblePerson(tx, existing.assigneeId, video.brandId) : null;
    if (keep && (existing?.source === "MANUAL" || existing?.status === "HECHO" || existing?.status === "DEVUELTO")) person = keep;
    else if (flow.autoAssign) {
      const resolved = await resolveAssignee(tx, video, kind, flow);
      if (typeof resolved !== "string") person = resolved.person;
    }
  }
  // Una persona o una fecha elegidas a mano dejan el paso MANUAL; una reactivación conserva su origen.
  const manual = opts.assigneeId !== undefined || (Boolean(opts.dueAt) && opts.dateOrigin === "manual");
  const source = opts.source ?? (manual ? "MANUAL" : (existing?.source === "MANUAL" ? "MANUAL" : "AUTO"));

  let stepId: string;
  let created = false, reopened = false;
  if (existing) {
    const changes: Record<string, Cambio> = { ...(opts.reopenChanges ?? {}) };
    if (existing.status !== "PENDIENTE") changes.status = { etiqueta: "Estado", antes: existing.status, despues: "PENDIENTE" };
    if (existing.assigneeId !== (person?.id ?? null)) changes.assigneeId = { etiqueta: "Responsable", antes: existing.assigneeId, despues: person?.id ?? null, verDespues: person?.name ?? "Sin asignar" };
    if (existing.dueAt.getTime() !== dueAt.getTime()) changes.dueAt = { etiqueta: "Vence", antes: existing.dueAt.toISOString(), despues: dueAt.toISOString(), verAntes: formatDateTime(existing.dueAt), verDespues: formatDateTime(dueAt) };
    await tx.productionStep.update({ where: { id: existing.id }, data: { status: "PENDIENTE", doneAt: null, dueAt, assigneeId: person?.id ?? null, source } });
    reopened = existing.status !== "PENDIENTE";
    await auditInTransaction(tx, {
      user: actor,
      action: reopened ? "REABRIR" : "ASIGNAR",
      entity: "ProductionStep",
      entityId: existing.id,
      brandId: video.brandId,
      summary: opts.reopenSummary ?? `${reopened ? "Reabrió" : "Actualizó"} la ${lower(kind)} de "${video.title}" para ${person?.name ?? "nadie (sin asignar)"}: vence el ${formatDateLong(fromDateKey(dueKey))} (${opts.cause})`,
      changes,
    });
    stepId = existing.id;
    await syncStepTask(tx, actor, stepId, "open");
  } else {
    const createdStep = await createStep(tx, actor, {
      video, step: kind, person, dueAt, key: automationKey(video.id, kind), source,
      summary: person
        ? `Asignó la ${lower(kind)} de "${video.title}" a ${person.name}: vence el ${formatDateLong(fromDateKey(dueKey))} (cadena de entregas)`
        : `Abrió la ${lower(kind)} de "${video.title}" sin responsable: vence el ${formatDateLong(fromDateKey(dueKey))} (cadena de entregas)`,
    });
    stepId = createdStep.id;
    created = true;
  }
  // La asignación en el video da acceso a los perfiles de alcance «asignado» (y al guionista, escribir el guion).
  if (person) await ensureAssignment(tx, actor, video, STEP_RULES[kind].assignment, person);
  if (!person) log("open_step", "unassigned", { step: kind });
  await closeOtherOpen(tx, video, kind, opts.now, opts.cause);
  return { stepId, assigneeId: person?.id ?? null, created, reopened };
}

/* --------------------------------------------------------- CONVERGENCIA -- */

/**
 * Ordena los pasos con el estado del video (caminos viejos: estado cambiado a mano, checks,
 * vínculo, alta). Cancelado o pausado: cancela todo. Publicado: cierra todo. Si no, abre el
 * paso que le toca; hacia adelante no retrocede un paso posterior que ya esté abierto.
 */
async function converge(tx: AppTransaction, actor: ProductionActor, video: VideoRow, opts: { now: Date; cause: string; backward: boolean }): Promise<ChainEventResult> {
  if (DEAD_STATUSES.includes(video.status)) {
    const count = await cancelAllOpen(tx, video, opts.now, opts.cause);
    return { done: count > 0, reason: count ? "ok" : "exists" };
  }
  const flow = await readFlow(tx, video.brandId);
  if (!flow.team.size) return { done: false, reason: "no_team" };
  const expected = expectedChainStep(video.status, await finalApproved(tx, video.id));
  if (!expected) {
    await closeOtherOpen(tx, video, null, opts.now, opts.cause);
    return { done: true, reason: "ok" };
  }
  const open = await openChainSteps(tx, video.id);
  if (!opts.backward) {
    const ahead = open.filter((step) => orderOf(step.step) > orderOf(expected)).sort((a, b) => orderOf(b.step) - orderOf(a.step))[0];
    if (ahead) {
      await closeOtherOpen(tx, video, ahead.step as ChainStep, opts.now, opts.cause);
      return { done: false, reason: "chain_ahead", stepId: ahead.id };
    }
  }
  const opened = await openChainStep(tx, actor, video, expected, { now: opts.now, cause: opts.cause });
  return opened.created || opened.reopened ? { done: true, reason: "ok", stepId: opened.stepId } : { done: false, reason: "exists", stepId: opened.stepId };
}

/* ----------------------------------------------------------------- CHECKS -- */

type CheckRow = { id: string; label: string; stage: string; kind: string };

function pendingRequired(tx: AppTransaction, videoId: string, stages: string[]): Promise<CheckRow[]> {
  return tx.checklistItem.findMany({
    where: { contentItemId: videoId, stage: { in: stages }, required: true, kind: "TASK", done: false },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: { id: true, label: true, stage: true, kind: true },
  });
}

/**
 * Checks que el Listo marca a nombre de quien pulsa. Los de la capacidad del paso los puede
 * marcar quien completa el paso (también coordinación en nombre de la persona asignada); los
 * demás exigen su propia capacidad y, si falta, el error dice quién debe marcarlo.
 */
function markable(checks: CheckRow[], actor: ProductionActor, role: ActorRole, stepCapability: Capability): CheckRow[] {
  for (const check of checks) {
    const capability = checklistCapability(check.stage, check.label, check.kind);
    if (capability === stepCapability) continue;
    if (role === "event" || (actor && allows(actor, capability))) continue;
    if (capability === "content.design") throw new ChainError(`Esperando diseño: «${check.label}».`);
    throw new ChainError(`Falta «${check.label}»: lo marca ${WHO[capability] ?? "coordinación"}.`);
  }
  return checks;
}

async function markChecks(tx: AppTransaction, actor: ProductionActor, video: VideoRow, checks: CheckRow[], now: Date, cause: string) {
  for (const check of checks) {
    await tx.checklistItem.update({ where: { id: check.id }, data: { done: true, doneById: actor?.id ?? null, doneAt: now } });
    await auditInTransaction(tx, {
      user: null,
      action: "COMPLETAR",
      entity: "ChecklistItem",
      entityId: check.id,
      brandId: video.brandId,
      summary: `Marcó el check "${check.label}" del video "${video.title}" (Sistema, ${cause})`,
    });
  }
}

/** Firma (o vuelve a firmar) SCRIPT_APPROVAL o FINAL_APPROVAL del video como «Sistema». */
async function signVideoApproval(tx: AppTransaction, actor: ProductionActor, video: VideoRow, kind: "SCRIPT_APPROVAL" | "FINAL_APPROVAL", now: Date, cause: string, label: string) {
  let check = await tx.checklistItem.findFirst({ where: { contentItemId: video.id, kind }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { id: true, label: true, done: true, approvalId: true } });
  if (!check) {
    const last = await tx.checklistItem.findFirst({ where: { contentItemId: video.id }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
    check = await tx.checklistItem.create({
      data: {
        contentItemId: video.id, kind, required: true, sortOrder: (last?.sortOrder ?? -1) + 1,
        label: kind === "SCRIPT_APPROVAL" ? "Guion aprobado por la marca" : "Revisión final aprobada",
        stage: kind === "SCRIPT_APPROVAL" ? "PREPRODUCCION" : "POSTPRODUCCION",
      },
      select: { id: true, label: true, done: true, approvalId: true },
    });
    await auditInTransaction(tx, { user: null, action: "CREAR", entity: "ChecklistItem", entityId: check.id, brandId: video.brandId, summary: `Añadió la aprobación "${check.label}" al video "${video.title}" (Sistema, ${cause})` });
  }
  if (check.done && check.approvalId && await validApproval(tx, kind, video.id, check.approvalId)) return;
  const sign = signer(actor, label);
  if (check.approvalId) await revokeVersion(tx, check.approvalId, sign, "Sustituida por la aprobación automática de la cadena de entregas.");
  const approval = await approveVersion(tx, sign, kind, video.id);
  await tx.checklistItem.update({ where: { id: check.id }, data: { done: true, doneById: null, doneAt: now, approvalId: approval.id } });
  await auditInTransaction(tx, {
    user: null,
    action: "COMPLETAR",
    entity: "ChecklistItem",
    entityId: check.id,
    brandId: video.brandId,
    summary: `Firmó "${check.label}" del video "${video.title}", versión ${approval.version} (Sistema, ${cause})`,
  });
}

/* ------------------------------------------------------------ LISTO POR PASO -- */

type ListoContext = { tx: AppTransaction; actor: SessionUser; role: ActorRole; step: StepRow; video: VideoRow; now: Date; cause: string; input: CompleteStepInput };

async function saveStepLink(ctx: ListoContext, link: string, label: string) {
  const { tx, actor, step, video } = ctx;
  if (step.materialUrl === link) return;
  await tx.productionStep.update({ where: { id: step.id }, data: { materialUrl: link } });
  await auditInTransaction(tx, {
    user: actor, action: "EDITAR", entity: "ProductionStep", entityId: step.id, brandId: video.brandId,
    summary: `Dejó el enlace «${label}» en la ${lower(step.step)} de "${video.title}"`,
    changes: { materialUrl: { etiqueta: label, antes: step.materialUrl ?? "", despues: link } },
  });
  step.materialUrl = link;
}

/** GUION: guion listo → aprobado como Sistema (regla del dueño), video a Aprobado. */
async function listoGuion(ctx: ListoContext) {
  const { tx, actor, video, now, cause } = ctx;
  const noScript = `Vincula un guion al video antes de marcarlo listo: genéralo en el Generador (/generador?video=${video.id}) o únelo desde Guiones.`;
  if (!video.scriptId) throw new ChainError(noScript);
  const script = await tx.script.findUnique({ where: { id: video.scriptId }, select: { id: true, title: true, status: true, cta: true, approvalId: true, brandId: true } });
  if (!script) throw new ChainError(noScript);
  if (script.status === "ARCHIVADO") throw new ChainError("El guion está archivado: vincula otro guion al video.");
  if (!await tx.scriptScene.count({ where: { scriptId: script.id } })) throw new ChainError("El guion necesita al menos una escena.");
  if (!script.cta?.trim() && !video.cta?.trim()) throw new ChainError("Falta el CTA: escríbelo en el guion o en el video.");
  if (ctx.role === "assignee" && ["BORRADOR", "REVISION"].includes(script.status)
    && !await tx.script.count({ where: { AND: [{ id: script.id }, scriptScope(actor, "scripts.write")] } })) {
    throw new ChainError("No puedes editar este guion. Pide a coordinación que te asigne como guionista del video.");
  }
  const sign = signer(actor, `Listo de ${actor.name}`);
  const scriptAudit = (to: string, extra = "") => auditInTransaction(tx, {
    user: null, action: "EDITAR", entity: "Script", entityId: script.id, brandId: script.brandId,
    summary: `Cambió el guion "${script.title}" a ${SCRIPT_STATUS_MAP[to]?.label ?? to}${extra} (Sistema, ${cause})`,
    changes: { status: { etiqueta: "Estado", antes: script.status, despues: to } },
  });
  if (script.status === "BORRADOR") {
    await tx.script.update({ where: { id: script.id }, data: { status: "REVISION" } });
    await scriptAudit("REVISION");
    script.status = "REVISION";
  }
  if (script.status === "REVISION" || !await validApproval(tx, "SCRIPT", script.id, script.approvalId)) {
    if (script.approvalId) await revokeVersion(tx, script.approvalId, sign, "Sustituida por la aprobación automática de la cadena de entregas.");
    const approval = await approveVersion(tx, sign, "SCRIPT", script.id);
    const status = script.status === "GRABADO" ? "GRABADO" : "APROBADO";
    await tx.script.update({ where: { id: script.id }, data: { status, approvalId: approval.id } });
    await scriptAudit(status, `, versión ${approval.version}`);
  }
  const written = (await tx.checklistItem.findMany({
    where: { contentItemId: video.id, kind: "TASK", stage: "PREPRODUCCION", done: false },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: { id: true, label: true, stage: true, kind: true },
  })).filter((check) => WRITTEN_LABEL.test(check.label));
  await markChecks(tx, actor, video, written, now, cause);
  await business(() => advanceVideoAsSystem(tx, video.id, "GUION", cause, now));
  await signVideoApproval(tx, actor, video, "SCRIPT_APPROVAL", now, cause, `Listo de ${actor.name}`);
  await business(() => advanceVideoAsSystem(tx, video.id, "APROBADO", cause, now));
}

/** GRABACION: material grabado, checks de preproducción y grabación, video a Edición. */
async function listoGrabacion(ctx: ListoContext) {
  const { tx, actor, role, step, video, now, cause, input } = ctx;
  const link = readLink(input.materialUrl, "Material grabado") ?? step.materialUrl;
  if (!link) throw new ChainError("Falta el enlace del material grabado.");
  await business(() => assertScriptApproved(tx, video.scriptId));
  await business(() => assertChecklistApproved(tx, video.id, "SCRIPT_APPROVAL"));
  const checks = markable(await pendingRequired(tx, video.id, ["PREPRODUCCION", "GRABACION"]), actor, role, STEP_RULES.GRABACION.capability);
  await saveStepLink(ctx, link, "Material grabado");
  await markChecks(tx, actor, video, checks, now, cause);
  await business(() => advanceVideoAsSystem(tx, video.id, "EDICION", cause, now));
}

/** EDICION: máster, checks de edición y aprobación final firmada por Sistema (regla del dueño). */
async function listoEdicion(ctx: ListoContext) {
  const { tx, actor, role, step, video, now, cause, input } = ctx;
  const link = readLink(input.materialUrl, "Máster (video editado)") ?? step.materialUrl;
  if (!link) throw new ChainError("Falta el enlace del máster (video editado).");
  const recording = await tx.productionStep.findUnique({ where: { automationKey: automationKey(video.id, "GRABACION") }, select: { materialUrl: true } });
  if (recording?.materialUrl && recording.materialUrl === link) throw new ChainError("El máster debe ser un enlace distinto del material grabado.");
  if (CONTENT_FLOW.indexOf(video.status) < CONTENT_FLOW.indexOf("EDICION")) await business(() => advanceVideoAsSystem(tx, video.id, "EDICION", cause, now));
  // El diseño nunca se marca con el Listo del editor (sea quien sea quien pulse, también el
  // Dueño): lo entrega el diseñador (paso DISENO) o se marca a mano. Mismo criterio que
  // chainChecksToMark, que no lo anuncia en «Se marcarán a tu nombre».
  const pending = await pendingRequired(tx, video.id, ["POSTPRODUCCION", "GENERAL"]);
  const design = pending.find((check) => checklistCapability(check.stage, check.label, check.kind) === "content.design");
  if (design) throw new ChainError(`Esperando diseño: «${design.label}». Lo entrega el diseñador o se marca en el checklist.`);
  const checks = markable(pending, actor, role, STEP_RULES.EDICION.capability);
  await saveStepLink(ctx, link, "Máster (video editado)");
  await markChecks(tx, actor, video, checks, now, cause);
  await business(async () => {
    await assertScriptApproved(tx, video.scriptId);
    await assertChecklistApproved(tx, video.id, "SCRIPT_APPROVAL");
    await assertRequiredChecks(tx, video.id, ["PREPRODUCCION", "GRABACION", "POSTPRODUCCION", "GENERAL"]);
  });
  await signVideoApproval(tx, actor, video, "FINAL_APPROVAL", now, cause, `Listo de ${actor.name}`);
}

/** PUBLICACION: enlace público, checks de publicación y video a Programado → Publicado. */
async function listoPublicacion(ctx: ListoContext) {
  const { tx, actor, role, video, now, cause, input } = ctx;
  const url = readLink(input.publishedUrl, "Enlace público") ?? video.publishedUrl;
  if (!url) throw new ChainError("Falta el enlace público del video.");
  await business(() => assertPublishable(tx, actor, video.id));
  const checks = markable(await pendingRequired(tx, video.id, ["PUBLICACION"]), actor, role, STEP_RULES.PUBLICACION.capability);
  if (url !== video.publishedUrl) {
    await tx.contentItem.update({ where: { id: video.id }, data: { publishedUrl: url } });
    await auditInTransaction(tx, {
      user: actor, action: "EDITAR", entity: "ContentItem", entityId: video.id, brandId: video.brandId,
      summary: `Guardó el enlace público de "${video.title}"`,
      changes: { publishedUrl: { etiqueta: "Enlace público", antes: video.publishedUrl, despues: url } },
    });
  }
  await markChecks(tx, actor, video, checks, now, cause);
  await business(() => advanceVideoAsSystem(tx, video.id, "PUBLICADO", cause, now));
}

/** DISENO: enlace de la entrega; marca los checks de diseño que quien entrega puede marcar. */
async function listoDiseno(ctx: ListoContext) {
  const { tx, actor, role, step, video, now, cause, input } = ctx;
  const link = readLink(input.materialUrl, "Entrega del diseño") ?? step.materialUrl;
  if (!link) throw new ChainError("Falta el enlace de la entrega del diseño.");
  await saveStepLink(ctx, link, "Entrega del diseño");
  const design = (await pendingRequired(tx, video.id, ["POSTPRODUCCION"])).filter((check) => checklistCapability(check.stage, check.label, check.kind) === "content.design");
  if (role !== "assignee" || allows(actor, "content.design")) await markChecks(tx, actor, video, design, now, cause);
}

const NEXT: Record<StepKind, ChainStep | null> = { GUION: "GRABACION", GRABACION: "EDICION", EDICION: "PUBLICACION", PUBLICACION: null, DISENO: null };

function listoCause(kind: string, actor: SessionUser, behalf: string): string {
  const base = `por el Listo de ${actor.name}${behalf}`;
  if (kind === "GUION") return `${base} (regla del dueño: sin revisión de guion)`;
  if (kind === "EDICION") return `${base}; regla del dueño: sin revisión final`;
  return base;
}

/** Núcleo del Listo: valida, escribe estado/checks/aprobaciones, cierra el paso y abre el siguiente. */
async function runListo(tx: AppTransaction, actor: SessionUser, role: ActorRole, step: StepRow, video: VideoRow, input: CompleteStepInput, now: Date, causeOverride?: string): Promise<CompleteStepResult> {
  if (DEAD_STATUSES.includes(video.status)) throw new ChainError("El video está cancelado o pausado: reábrelo antes de continuar.");
  const behalf = await onBehalf(tx, actor, step);
  const cause = causeOverride ?? listoCause(step.step, actor, behalf);
  const ctx: ListoContext = { tx, actor, role, step, video, now, cause, input };
  if (step.step === "GUION") await listoGuion(ctx);
  else if (step.step === "GRABACION") await listoGrabacion(ctx);
  else if (step.step === "EDICION") await listoEdicion(ctx);
  else if (step.step === "PUBLICACION") await listoPublicacion(ctx);
  else if (step.step === "DISENO") await listoDiseno(ctx);
  else throw new ChainError("Este paso no admite «Listo».");

  const after = await reloadVideo(tx, video.id);
  await closeStep(tx, actor, step, after, "HECHO", now, `Marcó listo el paso «${stepLabel(step.step)}» de "${video.title}"${behalf}`);
  const next = NEXT[step.step as StepKind] ?? null;
  let opened: Opened | null = null;
  if (next) opened = await openChainStep(tx, actor, after, next, { now, cause });
  const final = await reloadVideo(tx, video.id);
  return { stepId: step.id, step: step.step as StepKind, status: "done", next, nextStepId: opened?.stepId ?? null, nextAssigneeId: opened?.assigneeId ?? null, videoStatus: final.status };
}

/* ------------------------------------------------------- ENTRADAS EXPLÍCITAS -- */

/**
 * «Listo» de un paso (también desde «Mi trabajo», la ficha, la columna final de /tareas y la
 * Previa de guiones). Sin SAVEPOINT: si falla, no se escribe nada y el ChainError llega a la
 * persona. Un paso ya HECHO devuelve status "already" sin escribir.
 */
export async function completeStep(tx: AppTransaction, actor: SessionUser, stepId: string, input: CompleteStepInput = {}): Promise<CompleteStepResult> {
  return conflicts(async () => {
    const started = Date.now();
    const now = input.now ?? new Date();
    const { step, video } = await lockStep(tx, actor, stepId, input.expectedUpdatedAt);
    const role = await actorRole(tx, actor, step, video, "complete");
    if (step.status === "HECHO") {
      const open = await openChainSteps(tx, video.id);
      return { stepId, step: step.step as StepKind, status: "already", next: (open[0]?.step as ChainStep | undefined) ?? null, nextStepId: open[0]?.id ?? null, nextAssigneeId: open[0]?.assigneeId ?? null, videoStatus: video.status };
    }
    if (step.status === "DEVUELTO") throw new ChainError("Este paso fue devuelto: ahora le toca al paso anterior.");
    if (step.status !== "PENDIENTE") throw new ChainError("El paso está cancelado. Pide a coordinación que lo reactive.");
    const result = await runListo(tx, actor, role, step, video, input, now);
    // Instrumentación temporal (retirar el 2026-10-20 o cuando Q1-Q5 lleven 7 días en 0).
    log("complete_step", "ok", { step: step.step, ms: Date.now() - started });
    return result;
  });
}

/**
 * «Devolver»: EDICION → GRABACION (editor al filmmaker) y PUBLICACION → EDICION (community al
 * editor, «Devolver por correcciones»). Motivo obligatorio (5-1000). El paso actual queda
 * DEVUELTO, el anterior vuelve a PENDIENTE con plazo nuevo y el motivo se guarda como
 * comentario del video. Desde PUBLICACION revoca la aprobación final como Sistema.
 */
export async function returnStep(tx: AppTransaction, actor: SessionUser, stepId: string, input: ReturnStepInput): Promise<ReturnStepResult> {
  return conflicts(async () => {
    const now = input.now ?? new Date();
    const motivo = readMotivo(input.motivo, "de la devolución");
    const { step, video } = await lockStep(tx, actor, stepId, input.expectedUpdatedAt);
    await actorRole(tx, actor, step, video, "return");
    const target = isChainStep(step.step) ? STEP_RULES[step.step].returnsTo : null;
    if (!target) throw new ChainError("Este paso no se puede devolver. Usa «Avisar a coordinación».");
    if (step.status !== "PENDIENTE") throw new ChainError("Solo se puede devolver un paso pendiente. Recarga la página.");
    if (DEAD_STATUSES.includes(video.status)) throw new ChainError("El video está cancelado o pausado.");
    const cause = `por la devolución de ${actor.name}: ${motivo}`;
  
    if (step.step === "PUBLICACION") {
      if (video.status === "PUBLICADO") throw new ChainError("El video ya está publicado; no se puede devolver.");
      const finals = await tx.checklistItem.findMany({ where: { contentItemId: video.id, kind: "FINAL_APPROVAL", done: true }, select: { id: true, label: true, approvalId: true } });
      for (const check of finals) {
        await revokeVersion(tx, check.approvalId, signer(actor, `devolución de ${actor.name}`), motivo);
        await tx.checklistItem.update({ where: { id: check.id }, data: { done: false, doneById: null, doneAt: null, approvalId: null } });
        await auditInTransaction(tx, {
          user: null, action: "REABRIR", entity: "ChecklistItem", entityId: check.id, brandId: video.brandId,
          summary: `Retiró "${check.label}" del video "${video.title}" (Sistema, ${cause})`,
        });
      }
      if (video.status === "PROGRAMADO") await reopenVideoAsSystem(tx, video.id, "EDICION", cause);
    }
  
    const devolucion = { etiqueta: "Motivo de la devolución", antes: null, despues: motivo };
    await closeStep(tx, actor, step, video, "DEVUELTO", now, `Devolvió la ${lower(step.step)} de "${video.title}" a ${lower(target)}. Motivo: ${motivo}`, { devolucion });
    const dueKey = target === "GRABACION" ? nextRecordingDayKey(dateKey(now), (await readFlow(tx, video.brandId)).weekdays) : nextWorkingDayKey(dateKey(now));
    const opened = await openChainStep(tx, actor, await reloadVideo(tx, video.id), target, {
      now, cause, dueAt: endOfDayKey(dueKey), dateOrigin: "auto",
      reopenChanges: { devolucion },
      reopenSummary: `Recibió de vuelta la ${lower(target)} de "${video.title}" (devuelta por ${actor.name}): vence el ${formatDateLong(fromDateKey(dueKey))}. Motivo: ${motivo}`,
    });
    const comment = await tx.comment.create({ data: { contentItemId: video.id, userId: actor.id, body: `Devolución a ${STEP_RULES[target].role.toLowerCase()} (${stepLabel(step.step)} → ${stepLabel(target)}): ${motivo}` }, select: { id: true } });
    await auditInTransaction(tx, { user: actor, action: "CREAR", entity: "Comment", entityId: comment.id, brandId: video.brandId, summary: `Comentó en el video "${video.title}" (devolución)` });
    return { stepId, reopened: target, reopenedStepId: opened.stepId, assigneeId: opened.assigneeId, commentId: comment.id };
  });
}

/**
 * «Pedir cambios» de un diseño entregado: quien lo pidió o coordinación lo reabren con 24 horas
 * nuevas (sin domingo) y el motivo como comentario. Vuelve a «Mi trabajo» del diseñador como
 * «Te lo devolvieron».
 */
export async function requestDesignChanges(tx: AppTransaction, actor: SessionUser, stepId: string, input: ReturnStepInput): Promise<ReassignStepResult> {
  const now = input.now ?? new Date();
  const motivo = readMotivo(input.motivo, "de los cambios");
  return conflicts(async () => {
    const { step, video } = await lockStep(tx, actor, stepId, input.expectedUpdatedAt);
    // Primero quién (quien lo pidió o coordinación); después el tipo y el estado del paso.
    if (actor.role !== "OWNER" && step.requestedById !== actor.id) await assertContentAccess(tx, actor, step.contentItemId, "content.assign");
    if (step.requestedById === actor.id) await assertContentAccess(tx, actor, step.contentItemId, "content.view");
    if (step.step !== "DISENO") throw new ChainError("Solo un diseño entregado admite «Pedir cambios».");
    if (step.status !== "HECHO") throw new ChainError("El diseño todavía no se entregó. Recarga la página.");
    if (DEAD_STATUSES.includes(video.status) || video.status === "PUBLICADO") throw new ChainError("Este video ya no admite cambios de diseño.");
    const dueAt = dueIn24hSkippingSunday(now);
    await tx.productionStep.update({ where: { id: step.id }, data: { status: "PENDIENTE", doneAt: null, dueAt } });
    await auditInTransaction(tx, {
      user: actor, action: "REABRIR", entity: "ProductionStep", entityId: step.id, brandId: video.brandId,
      summary: `Pidió cambios en el diseño de "${video.title}": entrega máxima el ${formatDateTime(dueAt)}. Motivo: ${motivo}`,
      changes: {
        status: { etiqueta: "Estado", antes: "HECHO", despues: "PENDIENTE" },
        dueAt: { etiqueta: "Vence", antes: step.dueAt.toISOString(), despues: dueAt.toISOString(), verDespues: formatDateTime(dueAt) },
        devolucion: { etiqueta: "Motivo de la devolución", antes: null, despues: motivo },
      },
    });
    await syncStepTask(tx, actor, step.id, "open");
    const comment = await tx.comment.create({ data: { contentItemId: video.id, userId: actor.id, body: `Cambios en el diseño: ${motivo}` }, select: { id: true } });
    await auditInTransaction(tx, { user: actor, action: "CREAR", entity: "Comment", entityId: comment.id, brandId: video.brandId, summary: `Comentó en el video "${video.title}" (cambios de diseño)` });
    return { stepId, reactivated: true, calendarMoved: false, calendarNotice: null };
  });
}

/**
 * Coordinación que recibe los avisos de la marca: su ENCARGADO apto (activo, con la marca y con
 * content.assign: puede asignar y dar el aviso por atendido) o, si no hay, los Dueños. Misma
 * regla que coordinationBrands (production-scope.ts).
 */
async function coordinatorsOf(tx: AppTransaction, brandId: string): Promise<string[]> {
  const lead = await tx.brandTeamMember.findUnique({ where: { brandId_role: { brandId, role: "ENCARGADO" } }, select: { userId: true } });
  if (lead && (await personFor(tx, lead.userId, brandId))?.can("content.assign")) return [lead.userId];
  return (await tx.user.findMany({ where: { role: "OWNER", active: true }, select: { id: true }, orderBy: { id: "asc" } })).map((user) => user.id);
}

/**
 * «Avisar a coordinación»: deja el motivo como comentario del video y marca el paso como
 * bloqueado en la Cadena y en «Mi trabajo» del ENCARGADO (o del Dueño si la marca no tiene),
 * hasta que coordinación actúe sobre el paso (reasignar, cambiar el plazo, resolver).
 */
export async function notifyCoordination(tx: AppTransaction, actor: SessionUser, stepId: string, input: NotifyInput): Promise<NotifyResult> {
  return conflicts(async () => {
    const motivo = readMotivo(input.motivo, "del aviso");
    const { step, video } = await lockStep(tx, actor, stepId);
    await actorRole(tx, actor, step, video, "notify");
    if (step.status !== "PENDIENTE") throw new ChainError("Solo se avisa sobre un paso pendiente. Recarga la página.");
    const comment = await tx.comment.create({ data: { contentItemId: video.id, userId: actor.id, body: `Aviso a coordinación (${stepLabel(step.step)}): ${motivo}` }, select: { id: true } });
    await auditInTransaction(tx, { user: actor, action: "CREAR", entity: "Comment", entityId: comment.id, brandId: video.brandId, summary: `Comentó en el video "${video.title}" (aviso a coordinación)` });
    await auditInTransaction(tx, {
      user: actor, action: "EDITAR", entity: "ProductionStep", entityId: step.id, brandId: video.brandId,
      summary: `Avisó a coordinación sobre la ${lower(step.step)} de "${video.title}": ${motivo}`,
      changes: { aviso: { etiqueta: "Aviso a coordinación", antes: null, despues: motivo } },
    });
    return { stepId, commentId: comment.id, coordinatorIds: await coordinatorsOf(tx, video.brandId) };
  });
}

/** Coordinación da por atendido un aviso (sin tocar el paso). */
export async function resolveNotice(tx: AppTransaction, actor: SessionUser, stepId: string): Promise<void> {
  return conflicts(async () => {
    const { step, video } = await lockStep(tx, actor, stepId);
    if (actor.role !== "OWNER") await assertContentAccess(tx, actor, step.contentItemId, "content.assign");
    await auditInTransaction(tx, {
      user: actor, action: "EDITAR", entity: "ProductionStep", entityId: step.id, brandId: video.brandId,
      summary: `Atendió el aviso sobre la ${lower(step.step)} de "${video.title}"`,
      changes: { avisoResuelto: { etiqueta: "Aviso atendido", antes: null, despues: true } },
    });
  });
}

/**
 * Reasignar o mover el plazo (coordinación, content.assign). La tarea sigue al paso y la fecha
 * del video también: GRABACION → fecha de grabación, PUBLICACION → fecha prevista, si quien
 * reasigna puede planificar; si no, se avisa de que el calendario siguió igual. Reactivar un
 * paso cerrado solo se permite si el video no tiene otro paso de cadena abierto.
 */
export async function reassignStep(tx: AppTransaction, actor: SessionUser, stepId: string, input: ReassignStepInput): Promise<ReassignStepResult> {
  return conflicts(async () => {
    const { step, video } = await lockStep(tx, actor, stepId, input.expectedUpdatedAt);
    if (actor.role !== "OWNER") await assertContentAccess(tx, actor, step.contentItemId, "content.assign");
    // Activa, con la marca y con la capacidad del paso: si no, el paso quedaría trabado.
    const person = input.assigneeId ? await assignablePerson(tx, input.assigneeId, video.brandId, step.step) : null;
    const reactivate = step.status === "CANCELADO" || step.status === "DEVUELTO";
    if (reactivate && isChainStep(step.step)) {
      const other = (await openChainSteps(tx, video.id)).find((open) => open.id !== step.id);
      if (other) throw new ChainError(`El video ya tiene abierta la ${lower(other.step)}. Ciérrala o devuélvela antes de reactivar este paso.`);
      if (DEAD_STATUSES.includes(video.status)) throw new ChainError("El video está cancelado o pausado: reábrelo antes de reactivar el paso.");
    }
    const changes: Record<string, Cambio> = {};
    if (step.assigneeId !== (person?.id ?? null)) changes.assigneeId = { etiqueta: "Responsable", antes: step.assigneeId, despues: person?.id ?? null, verAntes: (await nameOf(tx, step.assigneeId)) ?? "Sin asignar", verDespues: person?.name ?? "Sin asignar" };
    if (step.dueAt.getTime() !== input.dueAt.getTime()) changes.dueAt = { etiqueta: "Vence", antes: step.dueAt.toISOString(), despues: input.dueAt.toISOString(), verAntes: formatDateTime(step.dueAt), verDespues: formatDateTime(input.dueAt) };
    if (reactivate) changes.status = { etiqueta: "Estado", antes: step.status, despues: "PENDIENTE" };
    if (step.source !== "MANUAL") changes.source = { etiqueta: "Origen", antes: step.source, despues: "MANUAL" };
    await tx.productionStep.update({ where: { id: step.id }, data: { assigneeId: person?.id ?? null, dueAt: input.dueAt, source: "MANUAL", ...(reactivate ? { status: "PENDIENTE", doneAt: null } : {}) } });
    await auditInTransaction(tx, {
      user: actor, action: "ASIGNAR", entity: "ProductionStep", entityId: step.id, brandId: video.brandId,
      summary: `Reasignó la ${lower(step.step)} de "${video.title}" a ${person?.name ?? "nadie (sin asignar)"}: vence el ${formatDateTime(input.dueAt)}`,
      changes: Object.keys(changes).length ? changes : null,
    });
    await syncStepTask(tx, actor, step.id, step.status === "PENDIENTE" || reactivate ? "open" : "closed");
    if (person) await ensureAssignment(tx, actor, video, STEP_RULES[step.step as ChainStep | "DISENO"]?.assignment ?? step.step, person);
  
    let calendarMoved = false, calendarNotice: string | null = null;
    const dueKey = dateKey(input.dueAt);
    const open = step.status === "PENDIENTE" || reactivate;
    if (open && step.step === "GRABACION" && (!video.shootDate || dateKey(video.shootDate) !== dueKey)) {
      if (allows(actor, "content.plan") || allows(actor, "content.scheduleShoot")) { await writeShootDate(tx, video, dueKey, "manual", `por la reasignación de ${actor.name}`); calendarMoved = true; }
      else calendarNotice = "El calendario sigue con la fecha de grabación anterior: pide a producción que la cambie.";
    }
    if (open && step.step === "PUBLICACION" && dateKey(video.scheduledDate) !== dueKey) {
      if (allows(actor, "content.plan")) { await writeScheduledDate(tx, video, dueKey, "sigue el plazo de la publicación", `por la reasignación de ${actor.name}`); calendarMoved = true; }
      else calendarNotice = "El calendario sigue con la fecha prevista anterior: pide a coordinación que la cambie.";
    }
    return { stepId, reactivated: reactivate, calendarMoved, calendarNotice };
  });
}

/** «Tomar paso»: alguien apto (capacidad del paso y acceso a la marca) se asigna un paso sin responsable. */
export async function takeStep(tx: AppTransaction, actor: SessionUser, stepId: string, input: { expectedUpdatedAt?: string; now?: Date } = {}): Promise<ReassignStepResult> {
  return conflicts(async () => {
    const { step, video } = await lockStep(tx, actor, stepId, input.expectedUpdatedAt);
    // Solo quien ya ve el video (lo que muestra la ficha): tomar el paso no abre videos ajenos.
    if (actor.role !== "OWNER") await assertContentAccess(tx, actor, step.contentItemId, "content.view");
    if (step.status !== "PENDIENTE" || step.assigneeId) throw new ChainError("Este paso ya tiene responsable. Recarga la página.");
    const rule = STEP_RULES[step.step as ChainStep | "DISENO"];
    if (!rule || !allows(actor, rule.capability)) throw new ChainError("Tu perfil no puede hacer este paso.");
    const person = await eligiblePerson(tx, actor.id, video.brandId);
    if (!person) throw new ChainError("No tienes acceso a esta marca.");
    await tx.productionStep.update({ where: { id: step.id }, data: { assigneeId: person.id, source: "MANUAL" } });
    await auditInTransaction(tx, {
      user: actor, action: "ASIGNAR", entity: "ProductionStep", entityId: step.id, brandId: video.brandId,
      summary: `Tomó la ${lower(step.step)} de "${video.title}"`,
      changes: { assigneeId: { etiqueta: "Responsable", antes: null, despues: person.id, verDespues: person.name } },
    });
    await syncStepTask(tx, actor, step.id, "open");
    await ensureAssignment(tx, actor, video, rule.assignment, person);
    return { stepId, reactivated: false, calendarMoved: false, calendarNotice: null };
  });
}

/**
 * «Crear paso»: asegura el paso de cadena que le toca al video (videos anteriores a la cadena,
 * marcas con asignación automática apagada o un paso perdido). Idempotente: si ya está abierto,
 * lo devuelve. Con actor (acción de coordinación) exige content.assign sobre el video.
 */
export async function ensureChainForVideo(tx: AppTransaction, videoId: string, opts: EnsureChainOptions = {}): Promise<EnsureChainResult> {
  return conflicts(async () => {
    const now = opts.now ?? new Date();
    const actor = opts.actor ?? null;
    // Primero el acceso (un video ajeno responde igual que uno inexistente); después la marca.
    if (actor && actor.role !== "OWNER") await assertContentAccess(tx, actor, videoId, "content.assign");
    const pre = await tx.contentItem.findUnique({ where: { id: videoId }, select: { brandId: true } });
    if (!pre) throw new ChainError("El video ya no existe. Recarga la página.");
    if (!productionChainEnabled(pre.brandId)) throw new ChainError("La cadena de entregas no está activa para esta marca.");
    await lockVideoLifecycle(tx, videoId);
    const video = await reloadVideo(tx, videoId);
    if (!(await readFlow(tx, video.brandId)).team.size) throw new ChainError("La marca no tiene equipo: define el equipo antes de crear pasos.");
    const expected = expectedChainStep(video.status, await finalApproved(tx, video.id));
    if (!expected) throw new ChainError(`El video está ${(CONTENT_STATUS_MAP[video.status]?.label ?? video.status).toLowerCase()}: ya no admite pasos.`);
    if (opts.step && opts.step !== expected) throw new ChainError(`El video está en «${CONTENT_STATUS_MAP[video.status]?.label ?? video.status}»: le corresponde el paso «${stepLabel(expected)}».`);
    const open = await openChainSteps(tx, video.id);
    const current = open.find((step) => step.step === expected);
    if (current && opts.assigneeId === undefined && !opts.dueAt) return { created: false, stepId: current.id, step: expected, assigneeId: current.assigneeId };
    const other = open.find((step) => step.step !== expected);
    if (other) throw new ChainError(`El video ya tiene abierta la ${lower(other.step)}.`);
    // Una persona elegida a mano debe poder hacer el paso (si no, quedaría trabado).
    if (opts.assigneeId) await assignablePerson(tx, opts.assigneeId, video.brandId, expected);
    const opened = await openChainStep(tx, actor, video, expected, {
      now, cause: actor ? `creado a mano por ${actor.name}` : "cadena de entregas",
      ...(opts.assigneeId !== undefined ? { assigneeId: opts.assigneeId } : {}),
      ...(opts.dueAt ? { dueAt: opts.dueAt, dateOrigin: "manual" as const } : {}),
    });
    return { created: opened.created || opened.reopened, stepId: opened.stepId, step: expected, assigneeId: opened.assigneeId };
  });
}

/**
 * Con la cadena, la aprobación final marcada a mano desde el checklist exige el máster en el
 * paso de edición (si existe). Sin cadena para la marca, no consulta pasos.
 */
export async function assertFinalApprovalAllowed(tx: AppTransaction, videoId: string): Promise<void> {
  if (!productionChainConfigured()) return;
  const video = await tx.contentItem.findUnique({ where: { id: videoId }, select: { brandId: true } });
  if (!video || !productionChainEnabled(video.brandId)) return;
  const editing = await tx.productionStep.findUnique({ where: { automationKey: automationKey(videoId, "EDICION") }, select: { status: true, materialUrl: true } });
  if (editing && editing.status !== "CANCELADO" && !editing.materialUrl) throw new ChainError("Falta el enlace del máster en el paso de edición.");
}

const ROLE_TO_STEP: Record<string, StepKind> = { GUIONISTA: "GUION", CAMARA: "GRABACION", EDITOR: "EDICION", COMMUNITY: "PUBLICACION", DISENO: "DISENO" };
const TEAM_TO_STEP: Record<string, StepKind> = { GUIONISTA: "GUION", FILMMAKER: "GRABACION", EDITOR: "EDICION", COMMUNITY: "PUBLICACION", DISENADOR: "DISENO" };

/** Quitar una función del video que tiene un paso pendiente se bloquea: primero se reasigna el paso. */
export async function assertAssignmentRemovable(tx: AppTransaction, videoId: string, userId: string, role: string): Promise<void> {
  if (!productionChainConfigured()) return;
  const kind = ROLE_TO_STEP[role];
  if (!kind) return;
  const video = await tx.contentItem.findUnique({ where: { id: videoId }, select: { brandId: true } });
  if (!video || !productionChainEnabled(video.brandId)) return;
  const pending = await tx.productionStep.findFirst({ where: { contentItemId: videoId, step: kind, status: "PENDIENTE", assigneeId: userId }, select: { step: true } });
  if (pending) throw new ChainError(`Reasigna primero el paso «${stepLabel(pending.step)}»: esta persona lo tiene pendiente.`);
}

/* ------------------------------------------------------------------ EVENTOS -- */

async function lockVideoRow(tx: AppTransaction, videoId: string): Promise<VideoRow | null> {
  await tx.$queryRaw`SELECT id FROM "ContentItem" WHERE id = ${videoId} FOR UPDATE`;
  return loadVideo(tx, videoId);
}

async function videoEvent(tx: AppTransaction, videoId: string, work: (video: VideoRow) => Promise<ChainEventResult>): Promise<ChainEventResult> {
  const pre = await tx.contentItem.findUnique({ where: { id: videoId }, select: { brandId: true } });
  if (!pre) return { done: false, reason: "video_missing" };
  if (!productionChainEnabled(pre.brandId)) return { done: false, reason: "chain_off" };
  const video = await lockVideoRow(tx, videoId);
  if (!video) return { done: false, reason: "video_missing" };
  return work(video);
}

/** Checks de grabación completos con el enlace ya guardado: se intenta el Listo de GRABACION de quien los marcó. */
async function onRecordingChecks(tx: AppTransaction, actor: ProductionActor, video: VideoRow, now: Date): Promise<ChainEventResult> {
  const step = await tx.productionStep.findUnique({ where: { automationKey: automationKey(video.id, "GRABACION") }, select: STEP_SELECT });
  if (!step || step.status !== "PENDIENTE") return { done: false, reason: "no_step" };
  if ((await pendingRequired(tx, video.id, ["PREPRODUCCION", "GRABACION"])).length) return { done: false, reason: "not_ready" };
  if (!step.materialUrl) return { done: false, reason: "material_missing", stepId: step.id };
  if (!actor) return { done: false, reason: "not_ready" };
  const result = await runListo(tx, actor, "event", step, video, {}, now, `por los checks de grabación completos de ${actor.name}`);
  return { done: true, reason: "ok", stepId: result.nextStepId };
}

async function handleEvent(tx: AppTransaction, actor: ProductionActor, event: Exclude<ChainEvent, { type: "TASK_MOVED" }>, now: Date): Promise<ChainEventResult> {
  const who = actor?.name ?? "Sistema";
  switch (event.type) {
    case "VIDEO_CREATED":
      return videoEvent(tx, event.videoId, (video) => converge(tx, actor, video, { now, cause: `al crear el video (${who})`, backward: false }));
    case "SCRIPT_LINKED":
      return videoEvent(tx, event.videoId, (video) => ["IDEA", "GUION"].includes(video.status)
        ? converge(tx, actor, video, { now, cause: `al unir el guion (${who})`, backward: false })
        : Promise.resolve({ done: false, reason: "video_status" as const }));
    case "SCRIPT_UNLINKED":
      return videoEvent(tx, event.videoId, async (video) => {
        if (!["IDEA", "GUION", "APROBADO"].includes(video.status)) return { done: false, reason: "video_status" };
        if (!(await readFlow(tx, video.brandId)).team.size) return { done: false, reason: "no_team" };
        const opened = await openChainStep(tx, actor, video, "GUION", { now, cause: `al quitar el guion (${who})` });
        return { done: true, reason: "ok", stepId: opened.stepId };
      });
    case "VIDEO_STATUS": {
      const from = CONTENT_FLOW.indexOf(event.from), to = CONTENT_FLOW.indexOf(event.to);
      const backward = DEAD_STATUSES.includes(event.from) || (from >= 0 && to >= 0 && to < from);
      return videoEvent(tx, event.videoId, (video) => converge(tx, actor, video, { now, cause: `por el cambio de estado a «${CONTENT_STATUS_MAP[event.to]?.label ?? event.to}» de ${who}`, backward }));
    }
    case "CHECK_DONE":
      return videoEvent(tx, event.videoId, async (video) => {
        if (event.kind === "FINAL_APPROVAL") return converge(tx, actor, video, { now, cause: `por la revisión final aprobada de ${who}`, backward: false });
        if (event.kind === "TASK" && (event.stage === "GRABACION" || event.stage === "PREPRODUCCION")) return onRecordingChecks(tx, actor, video, now);
        return { done: false, reason: "exists" };
      });
    case "CHECK_REOPENED":
      return videoEvent(tx, event.videoId, async (video) => {
        // Retirar la revisión final, o la aprobación del guion (que también la retira), devuelve la
        // edición al editor y cancela la publicación, igual que «Devolver por correcciones».
        if (event.kind !== "FINAL_APPROVAL" && event.kind !== "SCRIPT_APPROVAL") return { done: false, reason: "exists" };
        if (video.status !== "EDICION" && video.status !== "PROGRAMADO") return { done: false, reason: "video_status" };
        if (await finalApproved(tx, video.id)) return { done: false, reason: "exists" };
        if (event.kind === "SCRIPT_APPROVAL" && video.status === "EDICION" && !(await openChainSteps(tx, video.id)).some((step) => step.step === "PUBLICACION")) return { done: false, reason: "exists" };
        if (!(await readFlow(tx, video.brandId)).team.size) return { done: false, reason: "no_team" };
        const cause = `al retirar ${event.kind === "FINAL_APPROVAL" ? "la revisión final" : "la aprobación del guion"} (${who})`;
        let current = video;
        if (video.status === "PROGRAMADO") {
          await reopenVideoAsSystem(tx, video.id, "EDICION", cause);
          current = await reloadVideo(tx, video.id);
        }
        const opened = await openChainStep(tx, actor, current, "EDICION", { now, cause, dueAt: endOfDayKey(nextWorkingDayKey(dateKey(now))) });
        return { done: true, reason: "ok", stepId: opened.stepId };
      });
    case "DATE_CHANGED":
      return videoEvent(tx, event.videoId, async (video) => {
        const kind = event.field === "shootDate" ? "GRABACION" : "PUBLICACION";
        const date = event.field === "shootDate" ? video.shootDate : video.scheduledDate;
        const step = await tx.productionStep.findUnique({ where: { automationKey: automationKey(video.id, kind) }, select: STEP_SELECT });
        if (!date || !step || step.status !== "PENDIENTE") return { done: false, reason: "no_step" };
        const dueAt = endOfDayKey(dateKey(date));
        if (step.dueAt.getTime() === dueAt.getTime()) return { done: false, reason: "exists", stepId: step.id };
        await tx.productionStep.update({ where: { id: step.id }, data: { dueAt } });
        await auditInTransaction(tx, {
          user: actor, action: "EDITAR", entity: "ProductionStep", entityId: step.id, brandId: video.brandId,
          summary: `Movió la ${lower(kind)} de "${video.title}" al ${formatDateLong(date)} con la nueva ${event.field === "shootDate" ? "fecha de grabación" : "fecha prevista"}`,
          changes: { dueAt: { etiqueta: "Vence", antes: step.dueAt.toISOString(), despues: dueAt.toISOString(), verAntes: formatDateTime(step.dueAt), verDespues: formatDateTime(dueAt) } },
        });
        await syncStepTask(tx, actor, step.id, "open");
        return { done: true, reason: "ok", stepId: step.id };
      });
    case "ASSIGNMENT_CHANGED":
      return videoEvent(tx, event.videoId, async (video) => {
        const kind = ROLE_TO_STEP[event.role];
        if (!kind) return { done: false, reason: "no_step" };
        // Solo pasa el paso a quien puede hacerlo (activa, con la marca y la capacidad del paso).
        const candidate = await personFor(tx, event.userId, video.brandId);
        if (!candidate || !candidate.can(STEP_RULES[kind].capability)) return { done: false, reason: "rejected" };
        const person: Person = { id: candidate.id, name: candidate.name };
        const steps = await tx.productionStep.findMany({ where: { contentItemId: video.id, step: kind, status: "PENDIENTE" }, select: STEP_SELECT });
        let moved: string | null = null;
        for (const step of steps) {
          if (step.assigneeId === person.id) continue;
          const holds = step.assigneeId
            && await tx.assignment.count({ where: { contentItemId: video.id, userId: step.assigneeId, role: event.role } })
            && await eligiblePerson(tx, step.assigneeId, video.brandId);
          if (holds) continue;
          await tx.productionStep.update({ where: { id: step.id }, data: { assigneeId: person.id } });
          await auditInTransaction(tx, {
            user: actor, action: "ASIGNAR", entity: "ProductionStep", entityId: step.id, brandId: video.brandId,
            summary: `Pasó la ${lower(kind)} de "${video.title}" a ${person.name} (nueva asignación en el video)`,
            changes: { assigneeId: { etiqueta: "Responsable", antes: step.assigneeId, despues: person.id, verDespues: person.name } },
          });
          await syncStepTask(tx, actor, step.id, "open");
          moved = step.id;
        }
        return moved ? { done: true, reason: "ok", stepId: moved } : { done: false, reason: "exists" };
      });
    case "TEAM_CHANGED": {
      if (!productionChainEnabled(event.brandId)) return { done: false, reason: "chain_off" };
      const kind = TEAM_TO_STEP[event.role];
      if (!kind) return { done: false, reason: "no_step" };
      const flow = await readFlow(tx, event.brandId);
      const person = event.userId ? await eligiblePerson(tx, event.userId, event.brandId) : null;
      const steps = await tx.productionStep.findMany({
        where: {
          brandId: event.brandId, step: kind, status: "PENDIENTE", source: "AUTO",
          OR: [...(event.previousUserId ? [{ assigneeId: event.previousUserId }] : []), ...(person && flow.autoAssign ? [{ assigneeId: null }] : [])],
        },
        orderBy: [{ dueAt: "asc" }, { id: "asc" }],
        take: 200,
        select: { ...STEP_SELECT, contentItem: { select: { title: true } } },
      });
      for (const step of steps) {
        if (step.assigneeId === (person?.id ?? null)) continue;
        await tx.productionStep.update({ where: { id: step.id }, data: { assigneeId: person?.id ?? null } });
        await auditInTransaction(tx, {
          user: actor, action: "ASIGNAR", entity: "ProductionStep", entityId: step.id, brandId: event.brandId,
          summary: `Pasó la ${lower(kind)} de "${step.contentItem.title}" a ${person?.name ?? "nadie (sin asignar)"} (cambio en el equipo de la marca)`,
          changes: { assigneeId: { etiqueta: "Responsable", antes: step.assigneeId, despues: person?.id ?? null, verDespues: person?.name ?? "Sin asignar" } },
        });
        await syncStepTask(tx, actor, step.id, "open");
        if (person) await ensureAssignment(tx, actor, { id: step.contentItemId, title: step.contentItem.title, brandId: event.brandId }, STEP_RULES[kind as ChainStep | "DISENO"].assignment, person);
      }
      return { done: steps.length > 0, reason: steps.length ? "ok" : "exists" };
    }
    case "STEP_MARKED":
      return videoEvent(tx, event.videoId, async (video) => {
        // El camino viejo no mueve la tarea: el paso marcado deja su tarea en «Listo».
        if (isChainStep(event.step)) {
          const marked = await tx.productionStep.findUnique({ where: { automationKey: automationKey(video.id, event.step) }, select: { id: true, status: true } });
          if (marked && marked.status !== "PENDIENTE") await syncStepTask(tx, actor, marked.id, "closed");
        }
        const next = NEXT[event.step as StepKind] ?? null;
        if (!next || !(await readFlow(tx, video.brandId)).team.size) return { done: false, reason: "no_step" };
        const opened = await openChainStep(tx, actor, video, next, { now, cause: `por el paso marcado hecho de ${who}` });
        return { done: true, reason: "ok", stepId: opened.stepId };
      });
    case "SCRIPT_STATUS": {
      const videos = await tx.contentItem.findMany({ where: { scriptId: event.scriptId }, select: { id: true, brandId: true }, orderBy: { id: "asc" } });
      let done = 0;
      for (const { id, brandId } of videos) {
        if (!productionChainEnabled(brandId)) continue;
        // Cada video en su propio SAVEPOINT: uno que no cumple no deshace a los demás.
        const result = await guardedChain(tx, "script_status_video", async () => {
          const video = await lockVideoRow(tx, id);
          if (!video) return { done: false, reason: "video_missing" };
          const guion = await tx.productionStep.findUnique({ where: { automationKey: automationKey(id, "GUION") }, select: STEP_SELECT });
          if (event.to === "REVISION" || event.to === "APROBADO") {
            if (!guion || guion.status !== "PENDIENTE" || !actor) return { done: false, reason: "no_step" };
            const label = SCRIPT_STATUS_MAP[event.to]?.label ?? event.to;
            const result = await runListo(tx, actor, "event", guion, video, {}, now, `por el cambio del guion a «${label}» de ${actor.name} (regla del dueño: sin revisión de guion)`);
            return { done: true, reason: "ok", stepId: result.nextStepId };
          }
          if (event.to === "BORRADOR" && ["IDEA", "GUION", "APROBADO"].includes(video.status)) {
            if (!(await readFlow(tx, video.brandId)).team.size) return { done: false, reason: "no_team" };
            const opened = await openChainStep(tx, actor, video, "GUION", { now, cause: `al volver el guion a Borrador (${who})` });
            return { done: true, reason: "ok", stepId: opened.stepId };
          }
          return { done: false, reason: "exists" };
        });
        if (result.done) done++;
      }
      return { done: done > 0, reason: done ? "ok" : "exists" };
    }
  }
}

/**
 * Tarea movida en /tareas o editada con otra columna. Sin SAVEPOINT: entrar en la última
 * columna es el «Listo» del paso con las mismas validaciones (si falla, lanza y el movimiento se
 * rechaza con ese mensaje). Sacar de «Listo» la tarea de un paso cerrado se rechaza.
 */
async function onTaskMoved(tx: AppTransaction, actor: ProductionActor, event: { taskId: string; toColumnId: string }, now: Date): Promise<ChainEventResult> {
  const step = await tx.productionStep.findUnique({ where: { taskId: event.taskId }, select: { id: true, brandId: true, status: true, step: true } });
  if (!step) return { done: false, reason: "no_step" };
  if (!productionChainEnabled(step.brandId)) return { done: false, reason: "chain_off" };
  const listo = await lastColumnFor(tx, actor, step.brandId);
  const entering = event.toColumnId === listo.id;
  if (step.status === "PENDIENTE") {
    if (!entering) return { done: false, reason: "exists", stepId: step.id };
    if (!actor) throw new ChainError("Solo una persona puede marcar listo un paso.");
    const result = await completeStep(tx, actor, step.id, { now });
    return { done: result.status === "done", reason: result.status === "done" ? "ok" : "exists", stepId: step.id };
  }
  if (!entering) throw new ChainError(`Este paso ya está ${step.status === "HECHO" ? "listo" : step.status === "DEVUELTO" ? "devuelto" : "cancelado"}: su tarea se queda en «${listo.name}». Para rehacerlo, usa «Devolver» en el paso siguiente.`);
  return { done: false, reason: "exists", stepId: step.id };
}

/**
 * Un solo punto de entrada para los caminos viejos (vínculo, checks, estado, publicación,
 * desvincular, cancelar, reabrir, reasignar, mover fecha, tarea movida, equipo). Sin cadena
 * configurada vuelve con "chain_off" sin consultar la base. Todos van en SAVEPOINT salvo
 * TASK_MOVED.
 */
export async function chainEvent(tx: AppTransaction, actor: ProductionActor, event: ChainEvent, options: { now?: Date } = {}): Promise<ChainEventResult> {
  if (!productionChainConfigured()) return { done: false, reason: "chain_off" };
  const now = options.now ?? new Date();
  if (event.type === "TASK_MOVED") return onTaskMoved(tx, actor, event, now);
  return guardedChain(tx, event.type.toLowerCase(), () => handleEvent(tx, actor, event, now));
}
