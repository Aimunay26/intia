"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { assertContentAccess, lockVideoLifecycle } from "@/lib/access-scope";
import { allowsContentRecord } from "@/lib/permissions";
import { assertWorkBrand } from "@/lib/work-assignees";
import { auditInTransaction } from "@/lib/audit";
import { assertScriptApproved } from "@/lib/approvals";
import { withWorkflowMutation, lockRevision } from "@/lib/mutations";
import { WorkflowError } from "@/lib/workflow-policy";
import { field } from "@/lib/utils";
import { assertPreparationSession, preparationInclude, preparationToken, preparationCurrent, preparationPerson, synchronizePreparation, syncPreparationTask, resetPreparationSummary } from "@/lib/preparation";
import type { AppTransaction } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";

function refresh(id: string) { for (const path of ["/", "/tareas", "/contenido", "/cadena", `/contenido/${id}`]) revalidatePath(path); }
async function editable(tx: AppTransaction, user: SessionUser, data: FormData, coordinate: boolean) {
  const id = field(data, "contentItemId");
  await assertContentAccess(tx, user, id, coordinate ? "content.assign" : "content.view");
  await lockVideoLifecycle(tx, id);
  const video = await tx.contentItem.findUniqueOrThrow({ where: { id }, include: preparationInclude });
  await assertWorkBrand(tx, video.brandId);
  if (["EDICION", "PROGRAMADO", "PUBLICADO", "CANCELADO"].includes(video.status) || await tx.productionStep.count({ where: { contentItemId: id, step: "GRABACION", status: "HECHO" } })) throw new WorkflowError("La grabación está cerrada; se conserva la preparación histórica.");
  if (field(data, "expectedToken") !== preparationToken(video)) throw new WorkflowError("Cambió el guion, la sesión o el equipo. Recarga antes de confirmar.");
  return video;
}
export async function prepararGrabacion(data: FormData) {
  const user = await requireUser();
  return withWorkflowMutation(user, false, async (tx, after) => {
    const video = await editable(tx, user, data, true);
    await lockRevision(tx, "ContentItem", video.id, data);
    await synchronizePreparation(tx, user, video); after(() => refresh(video.id));
  });
}
export async function guardarPreparacion(data: FormData) {
  const user = await requireUser();
  return withWorkflowMutation(user, false, async (tx, after) => {
    const video = await editable(tx, user, data, true), id = field(data, "id");
    const previous = id ? video.preparationItems.find(i => i.id === id) : null;
    if (id && !previous) throw new WorkflowError("Requisito no encontrado.");
    if (previous) await lockRevision(tx, "PreparationItem", previous.id, data);
    else await lockRevision(tx, "ContentItem", video.id, data);
    if (previous && !preparationCurrent(previous, video)) throw new WorkflowError("Actualiza la preparación desde el guion y el equipo antes de editar.");
    const assigneeId = field(data, "assigneeId") || null, kind = previous?.kind ?? field(data, "kind"), label = previous?.label ?? field(data, "label").trim();
    if (!["PERSONAL", "PROP"].includes(kind) || !label || label.length > 500) throw new WorkflowError("Indica un requisito de hasta 500 caracteres.");
    if (assigneeId && !preparationPerson(video, assigneeId)) throw new WorkflowError("Asigna antes a esa persona al vídeo y verifica que esté activa y autorizada.");
    if (previous?.sourceKey.startsWith("assignment:") && assigneeId !== previous.assigneeId) throw new WorkflowError("Reasigna al participante en Equipo y después actualiza la preparación.");
    const required = data.get("required") === "1", reason = field(data, "reason").trim();
    if (!required && (!reason || reason.length > 500)) throw new WorkflowError("Indica por qué el requisito es opcional (máximo 500 caracteres).");
    if (previous && previous.assigneeId === assigneeId && previous.required === required) return;
    const item = await tx.preparationItem.upsert({ where: { id: previous?.id ?? randomUUID() },
      create: { contentItemId: video.id, sourceKey: `manual:${randomUUID()}`, kind, label, assigneeId, required },
      update: { assigneeId, required, status: "PENDIENTE", confirmedAt: null, confirmedById: null, confirmedToken: null, overrideReason: "" } });
    await tx.contentItem.update({ where: { id: video.id }, data: { preparationRequired: true } });
    await syncPreparationTask(tx, video, item);
    await resetPreparationSummary(tx, video.id);
    await auditInTransaction(tx, { user, action: "EDITAR", entity: "PreparationItem", entityId: item.id, brandId: video.brandId,
      summary: `${previous ? "Actualizó" : "Añadió"} "${item.label}" · responsable ${preparationPerson(video, assigneeId)?.name ?? "sin asignar"} · ${required ? "obligatorio" : `opcional: ${reason}`}` });
    after(() => refresh(video.id));
  });
}
export async function confirmarPreparacion(data: FormData) {
  const user = await requireUser();
  return withWorkflowMutation(user, false, async (tx, after) => {
    const video = await editable(tx, user, data, false), item = video.preparationItems.find(i => i.id === field(data, "id"));
    if (!item || !preparationCurrent(item, video)) throw new WorkflowError("El requisito cambió o fue retirado. Actualiza la preparación.");
    await lockRevision(tx, "PreparationItem", item.id, data);
    const person = preparationPerson(video, item.assigneeId, item.sourceKey.startsWith("assignment:") ? item.sourceText : undefined);
    if (!person) throw new WorkflowError("Falta un responsable activo, asignado al vídeo y autorizado.");
    const substitute = item.assigneeId !== user.id, reason = field(data, "reason").trim();
    if (substitute && (!allowsContentRecord(user, "content.assign", video) || data.get("substitute") !== "1" || !reason || reason.length > 500)) throw new WorkflowError("Solo el responsable confirma. Coordinación puede sustituirlo expresamente con un motivo (máximo 500 caracteres).");
    const done = data.get("done") === "1";
    if (!["0", "1"].includes(field(data, "done"))) throw new WorkflowError("Estado de preparación inválido.");
    if (done) { assertPreparationSession(video); await assertScriptApproved(tx, video.scriptId); }
    const saved = await tx.preparationItem.update({ where: { id: item.id }, data: { status: done ? "LISTO" : "PENDIENTE", confirmedToken: done ? preparationToken(video) : null,
      confirmedAt: done ? new Date() : null, confirmedById: done ? user.id : null, overrideReason: substitute ? reason : "" } });
    await syncPreparationTask(tx, video, saved);
    // A reopened individual requirement cannot leave a generic logistics check marked as ready.
    if (!done) await resetPreparationSummary(tx, video.id);
    await auditInTransaction(tx, { user, action: done ? "COMPLETAR" : "REABRIR", entity: "PreparationItem", entityId: item.id, brandId: video.brandId,
      summary: `${done ? "Confirmó" : "Reabrió"} "${item.label}"${substitute ? ` en sustitución de ${person.name}: ${reason}` : " personalmente"} · ${video.title}` });
    after(() => refresh(video.id));
  });
}

export async function retirarPreparacion(data: FormData) {
  const user = await requireUser();
  return withWorkflowMutation(user, false, async (tx, after) => {
    const video = await editable(tx, user, data, true), item = video.preparationItems.find(i => i.id === field(data, "id"));
    if (!item?.sourceKey.startsWith("manual:") || item.status === "RETIRADO") throw new WorkflowError("Solo se retiran aquí requisitos añadidos manualmente. Modifica el guion o el equipo para los demás.");
    await lockRevision(tx, "PreparationItem", item.id, data);
    const reason = field(data, "reason").trim();
    if (!reason || reason.length > 500) throw new WorkflowError("Indica el motivo del retiro (máximo 500 caracteres).");
    const saved = await tx.preparationItem.update({ where: { id: item.id }, data: { status: "RETIRADO", confirmedAt: null, confirmedById: null, confirmedToken: null, overrideReason: "" } });
    await syncPreparationTask(tx, video, saved);
    await resetPreparationSummary(tx, video.id);
    await auditInTransaction(tx, { user, action: "EDITAR", entity: "PreparationItem", entityId: item.id, brandId: video.brandId, summary: `Retiró "${item.label}": ${reason}` });
    after(() => refresh(video.id));
  });
}
