import type { AppTransaction } from "@/lib/prisma";
import type { ProductionActor } from "@/lib/domain/production-flow";
import { auditInTransaction } from "@/lib/audit";
import { WorkflowError } from "@/lib/workflow-policy";
import { dateKey, fromDateKey, formatDateTime } from "@/lib/utils";
import { endOfDayKey } from "@/lib/working-days";
import { checklistCapability } from "@/lib/permissions";
import { invalidatePreparation, syncPreparationDates } from "@/lib/preparation";

export function stepTaskDescription(label: string, title: string, videoId: string, dueAt: Date | null, previous?: string | null) {
  const header = `${label} del video "${title}". ${dueAt ? `Vence: ${formatDateTime(dueAt)}` : "Sin fecha: pendiente de programación"}. Ficha: /contenido/${videoId}`;
  const marker = `. Ficha: /contenido/${videoId}`;
  // Conserva el avance escrito por la persona y sustituye solo el encabezado generado.
  const notes = previous?.startsWith(`${label} del video "`) && previous.includes(marker)
    ? previous.slice(previous.indexOf(marker) + marker.length).trim() : previous?.trim();
  return notes ? `${header}\n\n${notes}` : header;
}

/** Solo se llama si cambió el día o el horario. Una entrega terminada conserva su fecha histórica. */
export async function invalidateRecordingPreparation(tx: AppTransaction, actor: ProductionActor, videoId: string, reason = "cambió la fecha o el horario de grabación") {
  const video = await tx.contentItem.findUniqueOrThrow({ where: { id: videoId }, select: { status: true, brandId: true, title: true } });
  const recorded = await tx.productionStep.findUnique({ where: { automationKey: `${videoId}:GRABACION` }, select: { status: true } });
  if (recorded?.status === "HECHO" || ["EDICION", "PROGRAMADO", "PUBLICADO"].includes(video.status)) {
    throw new WorkflowError("La grabación ya terminó. Devuelve el trabajo a grabación antes de cambiar su fecha.");
  }
  const checks = (await tx.checklistItem.findMany({ where: { contentItemId: videoId, stage: "PREPRODUCCION", kind: "TASK", done: true }, select: { id: true, label: true, stage: true, kind: true } }))
    .filter(c => checklistCapability(c.stage, c.label, c.kind) !== "scripts.write");
  await tx.contentItem.update({ where: { id: videoId }, data: { castingRevision: { increment: 1 } } });
  await invalidatePreparation(tx, videoId);
  for (const check of checks) {
    await tx.checklistItem.update({ where: { id: check.id }, data: { done: false, doneAt: null, doneById: null } });
    await auditInTransaction(tx, { user: actor, action: "REABRIR", entity: "ChecklistItem", entityId: check.id, brandId: video.brandId,
      summary: `Reabrió "${check.label}" de "${video.title}": ${reason}; hay que confirmar la preparación otra vez.`,
      changes: { done: { etiqueta: "Completado", antes: true, despues: false } } });
  }
  if (video.status === "GRABACION") {
    await tx.contentItem.update({ where: { id: videoId }, data: { status: "APROBADO" } });
    await auditInTransaction(tx, { user: actor, action: "EDITAR", entity: "ContentItem", entityId: videoId, brandId: video.brandId,
      summary: `Devolvió "${video.title}" a preparación al cambiar la fecha de grabación.`, changes: { status: { etiqueta: "Estado", antes: "GRABACION", despues: "APROBADO" } } });
  }
}

/** La fecha del vídeo manda sobre pasos pendientes, tanto AUTO como MANUAL. */
export async function syncVideoStepDate(tx: AppTransaction, actor: ProductionActor, videoId: string, kind: "GRABACION" | "PUBLICACION") {
  if (kind === "GRABACION") await syncPreparationDates(tx, videoId);
  const video = await tx.contentItem.findUniqueOrThrow({ where: { id: videoId }, select: { title: true, brandId: true, shootDate: true, scheduledDate: true } });
  const step = await tx.productionStep.findUnique({ where: { automationKey: `${videoId}:${kind}` }, select: { id: true, status: true, dueAt: true, taskId: true } });
  if (!step || step.status !== "PENDIENTE") return { done: false, reason: "no_step" as const };
  const date = kind === "GRABACION" ? video.shootDate : video.scheduledDate;
  const dueAt = date ? endOfDayKey(dateKey(date)) : null;
  const label = kind === "GRABACION" ? "Grabación" : "Publicación";
  const changed = step.dueAt?.getTime() !== dueAt?.getTime();
  if (changed) {
    await tx.productionStep.update({ where: { id: step.id }, data: { dueAt } });
    await auditInTransaction(tx, { user: actor, action: "EDITAR", entity: "ProductionStep", entityId: step.id, brandId: video.brandId,
      summary: `${label} de "${video.title}": ${dueAt ? `vence el ${formatDateTime(dueAt)}` : "sin fecha; pendiente de programación"}.`,
      changes: { dueAt: { etiqueta: "Vence", antes: step.dueAt?.toISOString() ?? null, despues: dueAt?.toISOString() ?? null } } });
  }
  if (step.taskId) {
    const task = await tx.task.findUniqueOrThrow({ where: { id: step.taskId }, select: { dueDate: true, description: true } });
    const dueDate = date ? fromDateKey(dateKey(date)) : null;
    const description = stepTaskDescription(label, video.title, videoId, dueAt, task.description);
    if (task.dueDate?.getTime() !== dueDate?.getTime() || task.description !== description) {
      await tx.task.update({ where: { id: step.taskId }, data: { dueDate, description } });
      await auditInTransaction(tx, { user: actor, action: "EDITAR", entity: "Task", entityId: step.taskId, brandId: video.brandId,
        summary: `Sincronizó el plazo de la tarea de ${label.toLowerCase()} de "${video.title}".`,
        changes: { dueDate: { etiqueta: "Fecha límite", antes: task.dueDate?.toISOString() ?? null, despues: dueDate?.toISOString() ?? null } } });
    }
  }
  return { done: changed, reason: changed ? "ok" as const : "exists" as const, stepId: step.id };
}
