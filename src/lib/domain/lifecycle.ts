import type { AppTransaction } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";
import { assertContentAccess, assertScriptAccess, assertPublishable, lockVideoLifecycle } from "@/lib/access-scope";
import { assertPermission, allows, contentStatusCapability } from "@/lib/permissions";
import { lockRevision } from "@/lib/mutations";
import { CONTENT_FLOW, SCRIPT_FLOW, transition, WorkflowError } from "@/lib/workflow-policy";
import { CONTENT_STATUS_MAP, SCRIPT_STATUS_MAP } from "@/lib/constants";
import { approveVersion, assertApprovedVersion, assertChecklistApproved, assertRequiredChecks, assertScriptApproved, reopenContentApprovals, reopeningReason, revokeVersion } from "@/lib/approvals";
import { auditInTransaction, diffFields } from "@/lib/audit";
import { onScriptApproved, onVideoStatusChanged } from "@/lib/domain/production-flow";
export type TransitionInput = { id: string; status: string; expectedUpdatedAt: string; override: boolean; reason: string };

/** Invariant owner for this transition; caller owns the transaction and post-commit effects. */
export async function transitionVideo(tx: AppTransaction, user: SessionUser, input: TransitionInput) {
  const { id, status } = input;
    await assertContentAccess(tx, user, id, "content.view");
    await lockVideoLifecycle(tx, id);
    await lockRevision(tx, "ContentItem", id, input.expectedUpdatedAt);
    const before = await tx.contentItem.findUniqueOrThrow({
      where: { id },
      select: { title: true, status: true, brandId: true, publishedAt: true, scriptId: true, scheduledDate: true, publishedUrl: true },
    });
    if (before.status === status) return;
    const step = transition(CONTENT_FLOW, before.status, status, "CANCELADO");
    await assertContentAccess(tx, user, id, step === "reopen" || step === "stop" ? "content.approve" : contentStatusCapability(status));
    const override = user.role === "OWNER" && input.override;
    const reason = (override || step === "reopen" || step === "stop") ? reopeningReason(input.reason) : "";
    if (!override && step === "invalid") throw new WorkflowError("Avanza una etapa a la vez; completa sus requisitos antes de continuar.");
    if (step === "reopen" || step === "stop" || (override && CONTENT_FLOW.indexOf(status) < CONTENT_FLOW.indexOf(before.status))) {
      assertPermission(user, "content.approve");
      await reopenContentApprovals(tx, id, user, reason, ["IDEA", "GUION", "CANCELADO"].includes(status));
    }
    if (!override && step === "advance") {
      if (status === "GUION" && (!before.scriptId || !await tx.scriptScene.count({ where: { scriptId: before.scriptId } }))) throw new WorkflowError("Vincula un guion con escenas para pasar a Guion.");
      if (["APROBADO", "GRABACION", "EDICION"].includes(status)) {
        await assertScriptApproved(tx, before.scriptId);
        await assertChecklistApproved(tx, id, "SCRIPT_APPROVAL");
      }
      if (status === "GRABACION") await assertRequiredChecks(tx, id, ["PREPRODUCCION"]);
      if (status === "EDICION") await assertRequiredChecks(tx, id, ["PREPRODUCCION", "GRABACION"]);
      if (["PROGRAMADO", "PUBLICADO"].includes(status)) await assertPublishable(tx, user, id);
      if (status === "PROGRAMADO" && !before.scheduledDate) throw new WorkflowError("Indica la fecha de programación.");
      if (status === "PUBLICADO") {
        if (!before.publishedUrl) throw new WorkflowError("Guarda el enlace público del video antes de publicarlo.");
        await assertRequiredChecks(tx, id, ["PUBLICACION"]);
      }
    }

    // Al publicar, si nadie puso fecha de publicacion, la ponemos nosotros.
    const marcaPublicacion = status === "PUBLICADO" && !before.publishedAt;

    await tx.contentItem.update({
      where: { id },
      data: { status, ...(marcaPublicacion ? { publishedAt: new Date() } : {}) },
    });

    await auditInTransaction(tx, {
      user,
      action: "EDITAR",
      entity: "ContentItem",
      entityId: id,
      brandId: before.brandId,
      summary: `Cambió el estado del video "${before.title}" a ${(CONTENT_STATUS_MAP[status]?.label ?? status)}${reason ? `. ${override ? "Excepción del Dueño" : "Motivo"}: ${reason}` : ""}`,
      changes: {
        status: {
          etiqueta: "Estado",
          antes: before.status,
          despues: status,
        },
      },
    });

    // Flujo de producción (PRODUCTION_FLOW_ENABLED): grabación, edición o publicación con plazo.
    // Apagado no consulta nada; un fallo de la automatización no revierte el cambio de estado.
    await onVideoStatusChanged(tx, user, id, status);
}

/** Invariant owner for this transition; caller owns the transaction and post-commit effects. */
export async function transitionScript(tx: AppTransaction, user: SessionUser, input: TransitionInput) {
  const { id, status } = input;
    await assertScriptAccess(tx, user, id, status === "APROBADO" ? "scripts.approve" : "scripts.view");
    await lockRevision(tx, "Script", id, input.expectedUpdatedAt);
    const before = await tx.script.findUnique({
      where: { id },
      select: { title: true, status: true, brandId: true, approvalId: true },
    });
    if (!before || before.status === status) return;
    if (before.status === "APROBADO" || status === "APROBADO") assertPermission(user, "scripts.approve");
    else if (!allows(user, "scripts.approve")) await assertScriptAccess(tx, user, id, "scripts.write");

    const step = transition(SCRIPT_FLOW, before.status, status, "ARCHIVADO");
    const override = user.role === "OWNER" && input.override;
    const reason = step === "reopen" || step === "stop" || override ? reopeningReason(input.reason) : "";
    if (step === "invalid" && !override) throw new WorkflowError("Avanza una etapa a la vez: Borrador, Revisión, Aprobado y Grabado.");
    let approvalId = before.approvalId;
    if (step === "reopen" || step === "stop") {
      if (approvalId || ["APROBADO", "GRABADO"].includes(before.status)) assertPermission(user, "scripts.approve");
      await revokeVersion(tx, approvalId, user, reason); approvalId = null;
    }
    if (status === "APROBADO") {
      if (!await tx.scriptScene.count({ where: { scriptId: id } })) throw new WorkflowError("El guion debe tener escenas antes de aprobarse.");
      if (approvalId) await revokeVersion(tx, approvalId, user, reason || "Sustituida por una nueva aprobación explícita");
      approvalId = (await approveVersion(tx, user, "SCRIPT", id)).id;
    }
    if (status === "GRABADO" && !override) await assertApprovedVersion(tx, "SCRIPT", id, approvalId);
    await tx.script.update({ where: { id }, data: { status, approvalId } });

    await auditInTransaction(tx, {
      user,
      action: "EDITAR",
      entity: "Script",
      entityId: id,
      brandId: before.brandId,
      summary: `Cambió el guion "${before.title}" a ${SCRIPT_STATUS_MAP[status].label}${reason ? `. ${override ? "Excepción del Dueño" : "Motivo"}: ${reason}` : ""}`,
      changes: {
        status: {
          etiqueta: "Estado",
          antes: before.status,
          despues: status,
        },
      },
    });

    // Guion aprobado: cada video que lo usa recibe su día de grabación (PRODUCTION_FLOW_ENABLED).
    if (status === "APROBADO") await onScriptApproved(tx, user, id);
}

export async function recordPublication(tx: AppTransaction, user: SessionUser, input: { id: string; expectedUpdatedAt: string; publishedUrl: string | null; scheduledDate: Date | null }) {
  const { id, publishedUrl } = input;
  await assertContentAccess(tx, user, id, "content.publish");
  await lockVideoLifecycle(tx, id);
  await lockRevision(tx, "ContentItem", id, input.expectedUpdatedAt);
  const before = await tx.contentItem.findUniqueOrThrow({ where: { id } });
  await assertPublishable(tx, user, id);
  if (publishedUrl && (!URL.canParse(publishedUrl) || !["https:", "http:"].includes(new URL(publishedUrl).protocol))) throw new WorkflowError("El enlace debe ser una dirección web válida.");
  const data = { publishedUrl, scheduledDate: input.scheduledDate ?? before.scheduledDate };
  await tx.contentItem.update({ where: { id }, data });
  await auditInTransaction(tx, { user, action: "EDITAR", entity: "ContentItem", entityId: id, brandId: before.brandId, summary: "Actualizó la publicación de " + before.title, changes: diffFields(before, data) });
}
