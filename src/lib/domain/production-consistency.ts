import type { SessionUser } from "@/lib/auth";
import type { AppTransaction } from "@/lib/prisma";
import { assertContentAccess, lockVideoLifecycle } from "@/lib/access-scope";
import { auditInTransaction } from "@/lib/audit";
import { CHAIN_ORDER, CHAIN_STEP_RULES, type ChainStep } from "@/lib/constants";
import { EDIT_CONFLICT } from "@/lib/mutations";
import { productionChainConfigured } from "@/lib/production-chain-flag";
import { readConsistencyIssue } from "@/lib/production-consistency";
import { WorkflowError } from "@/lib/workflow-policy";
import { findWorkAssignee, stepAssigneeCapabilities } from "@/lib/work-assignees";
import { ensureChainForVideo, syncStepTask } from "@/lib/domain/production-chain";
import { ensureAssignment } from "@/lib/domain/production-flow";

export type ConsistencyResolution = { key: string; revision: string; mode: "repair" | "create" | "duplicates"; keepStepId?: string; reason?: string };

/** Con withMutation: sesión vigente, snapshot serializable, bloqueo guion→video→pasos→tareas.
 * Nunca aprueba, entrega, cambia fechas del video ni elige sustitutos al reparar reflejos. */
export async function resolveProductionIssue(tx: AppTransaction, actor: SessionUser, input: ConsistencyResolution) {
  if (!productionChainConfigured()) throw new WorkflowError("La cadena de entregas no está activa.");
  if (!/^[a-f0-9]{32}$/.test(input.revision)) throw new WorkflowError(EDIT_CONFLICT);
  const pre = await readConsistencyIssue(tx, actor, input.key);
  if (!pre) return { changed: false, message: "El caso ya no está pendiente o no está en tu alcance." };
  if (!pre.videoId) throw new WorkflowError("Esta tarea requiere revisión manual en Tareas.");
  await assertContentAccess(tx, actor, pre.videoId, "content.assign");
  await lockVideoLifecycle(tx, pre.videoId);
  await tx.$queryRaw`SELECT id FROM "ProductionStep" WHERE "contentItemId" = ${pre.videoId} ORDER BY id FOR UPDATE`;
  await tx.$queryRaw`SELECT t.id FROM "Task" t JOIN "ProductionStep" s ON s."taskId" = t.id WHERE s."contentItemId" = ${pre.videoId} ORDER BY t.id FOR UPDATE OF t`;
  const issue = await readConsistencyIssue(tx, actor, input.key);
  if (!issue) return { changed: false, message: "El caso ya fue resuelto." };
  if (issue.revision !== input.revision) throw new WorkflowError(EDIT_CONFLICT);
  const video = await tx.contentItem.findUniqueOrThrow({ where: { id: pre.videoId } });

  if (input.mode === "create" && issue.code === "MISSING_STEP") {
    await ensureChainForVideo(tx, video.id, { actor });
  } else if (input.mode === "duplicates" && issue.code === "DUPLICATE_STEPS") {
    const reason = input.reason?.trim() ?? "";
    if (reason.length < 5 || reason.length > 1000) throw new WorkflowError("Indica un motivo de 5 a 1000 caracteres para resolver la duplicidad.");
    const open = await tx.productionStep.findMany({ where: { contentItemId: video.id, status: "PENDIENTE", step: { in: [...CHAIN_ORDER] } }, include: { task: { include: { preparationItem: true } } }, orderBy: { id: "asc" } });
    if (open.length < 2 || !open.some(s => s.id === input.keepStepId)) throw new WorkflowError(EDIT_CONFLICT);
    if (open.some(s => s.task && (s.task.brandId !== video.brandId || s.task.preparationItem))) throw new WorkflowError("Resuelve primero los vínculos de las tareas compartidas o de otra marca.");
    for (const step of open) {
      if (step.id === input.keepStepId) continue;
      await tx.productionStep.update({ where: { id: step.id }, data: { status: "CANCELADO", doneAt: null } });
      await auditInTransaction(tx, { user: actor, action: "EDITAR", entity: "ProductionStep", entityId: step.id, brandId: video.brandId,
        summary: `Canceló un paso duplicado de "${video.title}": ${reason}`,
        changes: { status: { etiqueta: "Estado", antes: "PENDIENTE", despues: "CANCELADO" }, motivo: { etiqueta: "Motivo", antes: null, despues: reason } } });
      await syncStepTask(tx, actor, step.id, "closed");
    }
  } else if (input.mode === "repair" && issue.repairable && issue.stepId) {
    const step = await tx.productionStep.findUniqueOrThrow({ where: { id: issue.stepId } });
    if (step.status !== "PENDIENTE") throw new WorkflowError(EDIT_CONFLICT);
    const person = step.assigneeId ? await findWorkAssignee(tx, step.assigneeId, video.brandId, stepAssigneeCapabilities(step.step)) : null;
    if (step.assigneeId && !person) throw new WorkflowError("El responsable ya no tiene permisos. Reasigna el paso antes de reparar su tarea.");
    if (issue.code === "MISSING_ASSIGNMENT" && person) {
      await ensureAssignment(tx, actor, video, CHAIN_STEP_RULES[step.step as ChainStep | "DISENO"].assignment, person);
    } else if (issue.code === "MISSING_TASK" || issue.code === "TASK_DRIFT") {
      await syncStepTask(tx, actor, step.id, "open");
    } else throw new WorkflowError("Este caso requiere revisión humana.");
  } else throw new WorkflowError("Este caso requiere revisión humana. Abre su ficha para resolverlo.");

  await auditInTransaction(tx, { user: actor, action: "EDITAR", entity: "ContentItem", entityId: video.id, brandId: video.brandId,
    summary: `Resolvió la inconsistencia ${issue.code} de "${video.title}"`,
    changes: { consistencia: { etiqueta: "Inconsistencia", antes: issue.key, despues: input.mode } } });
  return { changed: true, message: "Caso resuelto. La revisión se ha actualizado." };
}
