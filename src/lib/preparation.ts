import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { AppTransaction } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";
import { castingInclude, castingToken, recordingInterval } from "@/lib/casting";
import { allows, type AccessUser } from "@/lib/permissions";
import { auditInTransaction } from "@/lib/audit";
import { WorkflowError } from "@/lib/workflow-policy";
import { ASSIGNMENT_ROLE_CAPABILITIES } from "@/lib/work-assignees";

export const preparationInclude = {
  ...castingInclude,
  assignments: { orderBy: { id: "asc" }, include: { user: { select: { id: true, name: true, active: true, role: true, workProfiles: { select: { profile: true } }, brandAccess: { select: { brandId: true } } } } } },
  preparationItems: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
} satisfies Prisma.ContentItemInclude;
export type PreparationVideo = Prisma.ContentItemGetPayload<{ include: typeof preparationInclude }>;
export type Preparation = PreparationVideo["preparationItems"][number];
type Definition = { sourceKey: string; kind: string; label: string; sourceText: string; assigneeId: string | null };
const ROLE_CHECKS: Record<string, string> = {
  CAMARA: "Cámara: equipo, batería, memoria y audio revisados",
  PRODUCCION: "Producción: locación, permisos y logística preparados",
  ACTOR: "Actor: vestuario y preparación personal revisados",
  VOZ: "Voz: guion y equipo de audio preparados",
};

export function preparationDefinitions(video: PreparationVideo): Definition[] {
  const people = video.assignments.filter(a => ROLE_CHECKS[a.role]).map(a => ({ sourceKey: `assignment:${a.id}`, kind: "PERSONAL", label: ROLE_CHECKS[a.role], sourceText: a.role, assigneeId: a.userId }));
  const props = (video.script?.scenes ?? []).flatMap(scene => {
    let values: unknown;
    try { values = JSON.parse(scene.props); } catch { throw new WorkflowError("La utilería del guion tiene un formato inválido. Corrige las escenas antes de preparar."); }
    if (!Array.isArray(values) || values.some(v => typeof v !== "string")) throw new WorkflowError("La utilería de cada escena debe ser una lista de textos.");
    return values.flatMap((text: string, index: number) => text.trim() ? [{ sourceKey: `scene:${scene.id}:${index}`, kind: "PROP", label: text.trim(), sourceText: text, assigneeId: null }] : []);
  });
  return [...people, ...props];
}
export function preparationToken(video: PreparationVideo) {
  return createHash("sha256").update(JSON.stringify([castingToken(video), video.assignments.filter(a => ROLE_CHECKS[a.role]).map(a => [a.id, a.userId, a.role])])).digest("hex");
}
export function preparationCurrent(item: Preparation, video: PreparationVideo) {
  if (item.status === "RETIRADO") return false;
  if (item.sourceKey.startsWith("manual:")) return true;
  const definition = preparationDefinitions(video).find(d => d.sourceKey === item.sourceKey);
  return !!definition && definition.label === item.label && definition.sourceText === item.sourceText && (item.kind !== "PERSONAL" || definition.assigneeId === item.assigneeId);
}
export function preparationPerson(video: PreparationVideo, id: string | null, role?: string) {
  const person = video.assignments.find(a => a.userId === id)?.user;
  if (!person?.active) return null;
  const access: AccessUser = { id: person.id, role: person.role, profiles: person.workProfiles.map(p => p.profile), brandIds: person.brandAccess.map(b => b.brandId) };
  return (person.role === "OWNER" || access.brandIds?.includes(video.brandId)) && (["content.view", "tasks.view", "tasks.work", ...(role ? ASSIGNMENT_ROLE_CAPABILITIES[role] ?? [] : [])] as const).every(cap => allows(access, cap as "content.view")) ? person : null;
}
export function preparationReady(item: Preparation, video: PreparationVideo) {
  return preparationCurrent(item, video) && item.status === "LISTO" && item.confirmedToken === preparationToken(video) && !!preparationPerson(video, item.assigneeId, item.sourceKey.startsWith("assignment:") ? item.sourceText : undefined);
}
export async function assertPreparationReady(tx: AppTransaction, id: string, kind?: "PROP") {
  const video = await tx.contentItem.findUniqueOrThrow({ where: { id }, include: preparationInclude });
  if (!video.preparationRequired && !video.preparationItems.length) return; // Historical recordings keep their original contract.
  const definitions = preparationDefinitions(video).filter(d => !kind || d.kind === kind);
  if (definitions.some(d => !video.preparationItems.some(i => i.sourceKey === d.sourceKey && preparationCurrent(i, video)))) throw new WorkflowError("Actualiza la preparación desde el guion y los participantes antes de grabar.");
  const items = video.preparationItems.filter(i => i.status !== "RETIRADO" && (!kind || i.kind === kind));
  const missing = items.find(i => i.required && !preparationReady(i, video));
  if (missing) throw new WorkflowError(`Falta preparación obligatoria: ${missing.label}. Revisa responsable y confirmación para la sesión vigente.`);
}
const reset = { status: "PENDIENTE", confirmedToken: null, confirmedAt: null, confirmedById: null, overrideReason: "" };

/** Same transaction as the requirement. Tasks are navigation/assignment records, never a second completion path. */
export async function syncPreparationTask(tx: AppTransaction, video: Pick<PreparationVideo, "id" | "title" | "brandId" | "shootDate">, item: Preparation) {
  if (!item.assigneeId && !item.taskId) return;
  const status = item.status === "RETIRADO" ? "CANCELADO" : item.status === "LISTO" ? "HECHO" : "PENDIENTE";
  const data = { title: `${item.kind === "PROP" ? "Preparar prop" : "Preparación personal"}: ${item.label}`.slice(0, 500),
    description: `Preparación de "${video.title}". Confirma en /contenido/${video.id}#preparacion. ${item.required ? "Obligatorio" : "Opcional"}.`,
    assigneeId: item.assigneeId, brandId: video.brandId, dueDate: video.shootDate, status,
    completedAt: status === "HECHO" ? item.confirmedAt : null, completedById: status === "HECHO" ? item.confirmedById : null };
  if (item.taskId) await tx.task.update({ where: { id: item.taskId }, data });
  else {
    const column = await tx.taskColumn.findFirst({ where: { OR: [{ brandId: null }, { brandId: video.brandId }] }, orderBy: [{ order: "asc" }, { id: "asc" }] })
      ?? await tx.taskColumn.upsert({ where: { id: `preparation:${video.brandId}` }, update: {}, create: { id: `preparation:${video.brandId}`, brandId: video.brandId, name: "Preparación", color: "#6366f1", order: 0 } });
    const task = await tx.task.create({ data: { ...data, columnId: column.id } });
    await tx.preparationItem.update({ where: { id: item.id }, data: { taskId: task.id } });
  }
}

/** Date/script edits reopen both records; returning to an old date never revives a confirmation. */
export async function invalidatePreparation(tx: AppTransaction, videoId: string) {
  const items = await tx.preparationItem.findMany({ where: { contentItemId: videoId, status: { not: "RETIRADO" } } });
  await tx.preparationItem.updateMany({ where: { id: { in: items.map(i => i.id) } }, data: reset });
  await tx.task.updateMany({ where: { id: { in: items.flatMap(i => i.taskId ? [i.taskId] : []) } }, data: { status: "PENDIENTE", completedAt: null, completedById: null } });
  if (items.length) await resetPreparationSummary(tx, videoId);
}
export async function resetPreparationSummary(tx: AppTransaction, videoId: string) {
  await tx.checklistItem.updateMany({ where: { contentItemId: videoId, kind: "TASK", stage: "PREPRODUCCION", OR: [{ label: { contains: "props", mode: "insensitive" } }, { label: { contains: "vestuario", mode: "insensitive" } }] }, data: { done: false, doneAt: null, doneById: null } });
  await tx.contentItem.updateMany({ where: { id: videoId, status: "GRABACION" }, data: { status: "APROBADO" } });
}
/** Assignment mutations reopen work immediately and retire requirements that lost their participant. */
export async function invalidateTeamPreparation(tx: AppTransaction, videoId: string) {
  const video = await tx.contentItem.findUniqueOrThrow({ where: { id: videoId }, include: preparationInclude });
  if (["EDICION", "PROGRAMADO", "PUBLICADO", "CANCELADO"].includes(video.status) || await tx.productionStep.count({ where: { contentItemId: videoId, step: "GRABACION", status: "HECHO" } })) return;
  await invalidatePreparation(tx, videoId);
  for (const previous of video.preparationItems.filter(i => i.status !== "RETIRADO")) {
    const removed = previous.sourceKey.startsWith("assignment:") && !video.assignments.some(a => `assignment:${a.id}` === previous.sourceKey);
    const unavailable = previous.assigneeId && !video.assignments.some(a => a.userId === previous.assigneeId);
    if (removed || unavailable) {
      const item = await tx.preparationItem.update({ where: { id: previous.id }, data: { ...reset, ...(removed ? { status: "RETIRADO" } : { assigneeId: null }) } });
      await syncPreparationTask(tx, video, item);
    }
  }
}
export async function syncPreparationDates(tx: AppTransaction, videoId: string) {
  const video = await tx.contentItem.findUniqueOrThrow({ where: { id: videoId }, select: { shootDate: true } });
  await tx.task.updateMany({ where: { preparationItem: { contentItemId: videoId, status: { not: "RETIRADO" } } }, data: { dueDate: video.shootDate } });
}

/** Must be called under the script/video lifecycle lock. Source rows retire, never erase history. */
export async function synchronizePreparation(tx: AppTransaction, user: SessionUser, video: PreparationVideo) {
  const definitions = preparationDefinitions(video), keys = new Set(definitions.map(d => d.sourceKey));
  if (definitions.some(d => !video.preparationItems.some(i => i.sourceKey === d.sourceKey && preparationCurrent(i, video))) || video.preparationItems.some(i => i.status !== "RETIRADO" && !preparationCurrent(i, video))) await resetPreparationSummary(tx, video.id);
  for (const previous of video.preparationItems) {
    if (!previous.sourceKey.startsWith("manual:") && !keys.has(previous.sourceKey) && previous.status !== "RETIRADO") {
      const item = await tx.preparationItem.update({ where: { id: previous.id }, data: { ...reset, status: "RETIRADO" } });
      await syncPreparationTask(tx, video, item);
    }
  }
  for (const definition of definitions) {
    const previous = video.preparationItems.find(i => i.sourceKey === definition.sourceKey);
    const same = previous && preparationCurrent(previous, video);
    let item = previous;
    if (!same) item = await tx.preparationItem.upsert({ where: { contentItemId_sourceKey: { contentItemId: video.id, sourceKey: definition.sourceKey } },
      create: { ...definition, contentItemId: video.id }, update: { ...definition, ...reset } });
    else if (previous.status === "LISTO" && !preparationReady(previous, video)) item = await tx.preparationItem.update({ where: { id: previous.id }, data: reset });
    if (item) await syncPreparationTask(tx, video, item);
  }
  for (const previous of video.preparationItems.filter(i => i.sourceKey.startsWith("manual:") && i.status === "LISTO" && !preparationReady(i, video))) {
    const item = await tx.preparationItem.update({ where: { id: previous.id }, data: reset }); await syncPreparationTask(tx, video, item);
  }
  if (!video.preparationRequired) await tx.contentItem.update({ where: { id: video.id }, data: { preparationRequired: true } });
  await auditInTransaction(tx, { user, action: "EDITAR", entity: "ContentItem", entityId: video.id, brandId: video.brandId, summary: `Sincronizó preparación individual y props de "${video.title}"` });
}

export async function invalidateScriptPreparation(tx: AppTransaction, scriptId: string) {
  const videos = await tx.contentItem.findMany({ where: { scriptId, brand: { archived: false }, productionSteps: { none: { step: "GRABACION", status: "HECHO" } }, status: { notIn: ["EDICION", "PROGRAMADO", "PUBLICADO", "CANCELADO"] }, preparationItems: { some: {} } }, select: { id: true }, orderBy: { id: "asc" } });
  for (const video of videos) {
    await tx.$queryRaw`SELECT id FROM "ContentItem" WHERE id = ${video.id} FOR UPDATE`;
    await invalidatePreparation(tx, video.id);
  }
}

export function assertPreparationSession(video: PreparationVideo) {
  if (!recordingInterval(video)) throw new WorkflowError("Define fecha y horario de grabación antes de confirmar la preparación.");
}
