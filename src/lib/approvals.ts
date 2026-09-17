import { createHash } from "node:crypto";
import { WorkflowError } from "@/lib/workflow-policy";
import type { Prisma } from "@prisma/client";
import type { AppTransaction } from "@/lib/prisma";
import type { AccessUser } from "@/lib/permissions";

export type ApprovalType = "SCRIPT" | "SCRIPT_APPROVAL" | "FINAL_APPROVAL";
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Lista explícita: excluye secretos, prompts y datos operativos posteriores a la aprobación. */
export async function approvalSnapshot(db: AppTransaction, type: ApprovalType, id: string): Promise<unknown> {
  if (type === "SCRIPT") {
    return db.script.findUniqueOrThrow({ where: { id }, select: {
      id: true, title: true, brandId: true, structureId: true, archetypeId: true,
      avatar: true, focus: true, hook: true, cta: true, totalSeconds: true, notes: true,
      scenes: { orderBy: [{ order: "asc" }, { id: "asc" }] },
    } });
  }
  const video = await db.contentItem.findUniqueOrThrow({ where: { id }, select: {
    id: true, brandId: true, scriptId: true, title: true, description: true, hook: true, cta: true,
    platforms: true, structureId: true, structureIds: true, thumbnailUrl: true, tags: true, notes: true,
  } });
  const script = video.scriptId ? await approvalSnapshot(db, "SCRIPT", video.scriptId) : null;
  if (type === "SCRIPT_APPROVAL") return { videoId: video.id, script };
  const assets = await db.asset.findMany({ where: { ownerType: "content", ownerId: id }, orderBy: { id: "asc" }, select: { id: true, filename: true, label: true, mimeType: true, size: true, blobId: true, updatedAt: true } });
  const checks = await db.checklistItem.findMany({ where: { contentItemId: id, kind: "TASK", stage: { not: "PUBLICACION" }, required: true }, orderBy: { id: "asc" }, select: { id: true, label: true, stage: true, done: true } });
  return { video, script, assets, checks };
}

export async function approvalToken(db: AppTransaction, type: ApprovalType, id: string) {
  return fingerprint(await approvalSnapshot(db, type, id));
}

export async function approveVersion(db: AppTransaction, user: AccessUser & { name: string }, type: ApprovalType, id: string, expectedToken?: string) {
  const snapshot = JSON.parse(JSON.stringify(await approvalSnapshot(db, type, id))) as Prisma.InputJsonValue;
  if (expectedToken !== undefined && expectedToken !== fingerprint(snapshot)) throw new WorkflowError("El contenido cambió desde que abriste la revisión. Recarga y comprueba la versión actual antes de aprobar.");
  const latest = await db.approval.findFirst({ where: { entityType: type, entityId: id }, orderBy: { version: "desc" }, select: { version: true } });
  return db.approval.create({ data: { entityType: type, entityId: id, version: (latest?.version ?? 0) + 1, snapshot, fingerprint: fingerprint(snapshot), approvedById: user.id, approvedByName: user.name } });
}

export async function assertApprovedVersion(db: AppTransaction, type: ApprovalType, id: string, approvalId: string | null) {
  const approval = approvalId ? await db.approval.findUnique({ where: { id: approvalId } }) : null;
  if (!approval || approval.entityType !== type || approval.entityId !== id || approval.revokedAt) throw new WorkflowError("Falta aprobar una versión verificable. Reabre y aprueba de nuevo si se trata de una aprobación anterior.");
  if (approval.fingerprint !== fingerprint(await approvalSnapshot(db, type, id))) throw new WorkflowError("El contenido cambió desde la aprobación. Reabre y aprueba la versión actual antes de continuar.");
}

export function reopeningReason(value: string) {
  const reason = value.trim();
  if (reason.length < 5 || reason.length > 1000) throw new WorkflowError("Indica un motivo de reapertura o excepción de entre 5 y 1000 caracteres.");
  return reason;
}

export async function revokeVersion(db: AppTransaction, id: string | null, user: AccessUser, reason: string) {
  if (!id) return;
  await db.approval.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date(), revokedById: user.id, reason: reopeningReason(reason) } });
}

export async function assertScriptApproved(db: AppTransaction, id: string | null) {
  if (!id) throw new WorkflowError("Vincula un guion aprobado antes de continuar.");
  const script = await db.script.findUniqueOrThrow({ where: { id }, select: { status: true, approvalId: true } });
  if (!["APROBADO", "GRABADO"].includes(script.status)) throw new WorkflowError("El guion vinculado todavía no está aprobado.");
  await assertApprovedVersion(db, "SCRIPT", id, script.approvalId);
}

export async function assertChecklistApproved(db: AppTransaction, id: string, kind: "SCRIPT_APPROVAL" | "FINAL_APPROVAL") {
  const check = await db.checklistItem.findFirst({ where: { contentItemId: id, kind, done: true, approvalId: { not: null } }, orderBy: [{ doneAt: { sort: "desc", nulls: "last" } }, { id: "desc" }] });
  if (!check) throw new WorkflowError(kind === "FINAL_APPROVAL" ? "Coordinación debe completar la revisión final aprobada antes de publicar." : "Completa la aprobación del guion en la lista de control.");
  await assertApprovedVersion(db, kind, id, check.approvalId);
}

export async function assertRequiredChecks(db: AppTransaction, id: string, stages: string[]) {
  const missing = await db.checklistItem.findFirst({ where: { contentItemId: id, stage: { in: stages }, required: true, kind: "TASK", done: false }, orderBy: { sortOrder: "asc" }, select: { label: true } });
  if (missing) throw new WorkflowError(`Completa el requisito: ${missing.label}.`);
}

export async function reopenContentApprovals(db: AppTransaction, id: string, user: AccessUser, reason: string, scriptToo: boolean) {
  const checks = await db.checklistItem.findMany({ where: { contentItemId: id, kind: { in: scriptToo ? ["SCRIPT_APPROVAL", "FINAL_APPROVAL"] : ["FINAL_APPROVAL"] } } });
  for (const check of checks) {
    await revokeVersion(db, check.approvalId, user, reason);
    await db.checklistItem.update({ where: { id: check.id }, data: { done: false, doneAt: null, doneById: null, approvalId: null } });
  }
}
