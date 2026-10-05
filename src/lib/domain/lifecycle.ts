import type { AppTransaction } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";
import { assertContentAccess, assertScriptAccess, assertPublishable, lockVideoLifecycle } from "@/lib/access-scope";
import { assertPermission, allows, contentStatusCapability, type AccessUser } from "@/lib/permissions";
import { lockRevision } from "@/lib/mutations";
import { CONTENT_FLOW, SCRIPT_FLOW, transition, WorkflowError } from "@/lib/workflow-policy";
import { CONTENT_STATUS_MAP, SCRIPT_STATUS_MAP } from "@/lib/constants";
import { approveVersion, assertApprovedVersion, assertChecklistApproved, assertRequiredChecks, assertScriptApproved, reopenContentApprovals, reopeningReason, revokeVersion } from "@/lib/approvals";
import { auditInTransaction, diffFields } from "@/lib/audit";
import { onScheduledDateChanged, onScriptApproved, onScriptStatusChanged, onVideoStatusChanged } from "@/lib/domain/production-flow";
import { productionChainConfigured, productionChainEnabled } from "@/lib/production-chain-flag";
export type TransitionInput = { id: string; status: string; expectedUpdatedAt: string; override: boolean; reason: string };

/** Quien firma lo que hace la automatización: no tiene perfiles ni marcas (assertPublishable no lo usa). */
const SYSTEM_USER: AccessUser = { id: "sistema", role: "SYSTEM" };

type AdvanceBefore = { shootDate: Date | null; scriptId: string | null; scheduledDate: Date | null; publishedUrl: string | null };

/**
 * Requisitos para avanzar una etapa (extraídos de transitionVideo sin cambiar su orden ni sus
 * mensajes). Los usan transitionVideo y la cadena de entregas (advanceVideoAsSystem).
 */
export async function assertAdvanceRequirements(tx: AppTransaction, id: string, before: AdvanceBefore, status: string, user: AccessUser = SYSTEM_USER) {
  if (status === "GUION" && (!before.scriptId || !await tx.scriptScene.count({ where: { scriptId: before.scriptId } }))) throw new WorkflowError("Vincula un guion con escenas para pasar a Guion.");
  if (["APROBADO", "GRABACION", "EDICION"].includes(status)) {
    await assertScriptApproved(tx, before.scriptId);
    await assertChecklistApproved(tx, id, "SCRIPT_APPROVAL");
  }
  if (["GRABACION", "EDICION"].includes(status) && !before.shootDate) throw new WorkflowError("Asigna una fecha de grabación antes de continuar.");
  if (status === "GRABACION") await assertRequiredChecks(tx, id, ["PREPRODUCCION"]);
  if (status === "EDICION") await assertRequiredChecks(tx, id, ["PREPRODUCCION", "GRABACION"]);
  if (["PROGRAMADO", "PUBLICADO"].includes(status)) await assertPublishable(tx, user, id);
  if (status === "PROGRAMADO" && !before.scheduledDate) throw new WorkflowError("Indica la fecha de programación.");
  if (status === "PUBLICADO") {
    if (!before.publishedUrl) throw new WorkflowError("Guarda el enlace público del video antes de publicarlo.");
    await assertRequiredChecks(tx, id, ["PUBLICACION"]);
  }
}

/**
 * Cadena de entregas: con la cadena encendida, pasar a Edición exige el enlace del material en
 * el paso de grabación (si existe). Apagada, no consulta nada.
 */
async function assertChainAdvance(tx: AppTransaction, id: string, brandId: string, status: string) {
  if (status !== "EDICION" || !productionChainEnabled(brandId)) return;
  const recording = await tx.productionStep.findUnique({ where: { automationKey: `${id}:GRABACION` }, select: { status: true, materialUrl: true } });
  if (recording && recording.status !== "CANCELADO" && !recording.materialUrl) throw new WorkflowError("Falta el enlace del material grabado en el paso de grabación.");
}

/** Invariant owner for this transition; caller owns the transaction and post-commit effects. */
export async function transitionVideo(tx: AppTransaction, user: SessionUser, input: TransitionInput) {
  const { id, status } = input;
    await assertContentAccess(tx, user, id, "content.view");
    await lockVideoLifecycle(tx, id);
    await lockRevision(tx, "ContentItem", id, input.expectedUpdatedAt);
    const before = await tx.contentItem.findUniqueOrThrow({
      where: { id },
      select: { title: true, status: true, brandId: true, publishedAt: true, scriptId: true, shootDate: true, scheduledDate: true, publishedUrl: true },
    });
    if (before.status === status) return;
    const step = transition(CONTENT_FLOW, before.status, status, "CANCELADO");
    await assertContentAccess(tx, user, id, step === "reopen" || step === "stop" ? "content.approve" : contentStatusCapability(status));
    const override = user.role === "OWNER" && input.override;
    const reason = (override || step === "reopen" || step === "stop") ? reopeningReason(input.reason) : "";
    if (!override && step === "invalid") throw new WorkflowError("Avanza una etapa a la vez; completa sus requisitos antes de continuar.");
    // Una excepción de secuencia no sustituye una revisión humana.
    if (override && CONTENT_FLOW.indexOf(status) > CONTENT_FLOW.indexOf(before.status)) await assertAdvanceRequirements(tx, id, before, status, user);
    if (step === "reopen" || step === "stop" || (override && CONTENT_FLOW.indexOf(status) < CONTENT_FLOW.indexOf(before.status))) {
      assertPermission(user, "content.approve");
      await reopenContentApprovals(tx, id, user, reason, ["IDEA", "GUION", "CANCELADO"].includes(status));
    }
    if (!override && step === "advance") {
      await assertAdvanceRequirements(tx, id, before, status, user);
      await assertChainAdvance(tx, id, before.brandId, status);
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
    // Con la cadena de entregas encendida, converge el paso abierto con el nuevo estado.
    // Apagado no consulta nada; un fallo de la automatización no revierte el cambio de estado.
    await onVideoStatusChanged(tx, user, id, status, before.status);
}

/**
 * Cadena de entregas: el video avanza solo hacia adelante, una etapa a la vez y con los mismos
 * requisitos que transitionVideo, firmado como «Sistema» con la causa («por el Listo de …»).
 * No dispara los ganchos del flujo: quien llama (la cadena) ya ordena los pasos. Devuelve las
 * etapas recorridas. Quien llama ya tiene bloqueado el ciclo de vida del video.
 */
export async function advanceVideoAsSystem(tx: AppTransaction, videoId: string, target: string, cause: string, now: Date = new Date()): Promise<string[]> {
  const video = await tx.contentItem.findUniqueOrThrow({
    where: { id: videoId },
    select: { title: true, status: true, brandId: true, publishedAt: true, scriptId: true, shootDate: true, scheduledDate: true, publishedUrl: true },
  });
  const to = CONTENT_FLOW.indexOf(target);
  const from = CONTENT_FLOW.indexOf(video.status);
  if (to < 0) throw new WorkflowError("La etapa pedida no existe.");
  if (from < 0) throw new WorkflowError("El video está pausado o cancelado: la cadena no lo avanza.");
  const passed: string[] = [];
  for (let index = from + 1; index <= to; index++) {
    const status = CONTENT_FLOW[index];
    await assertAdvanceRequirements(tx, videoId, video, status);
    const publishNow = status === "PUBLICADO" && !video.publishedAt;
    await tx.contentItem.update({ where: { id: videoId }, data: { status, ...(publishNow ? { publishedAt: now } : {}) } });
    await auditInTransaction(tx, {
      user: null,
      action: "EDITAR",
      entity: "ContentItem",
      entityId: videoId,
      brandId: video.brandId,
      summary: `Cambió el estado del video "${video.title}" a ${CONTENT_STATUS_MAP[status]?.label ?? status} (Sistema, ${cause})`,
      changes: { status: { etiqueta: "Estado", antes: CONTENT_FLOW[index - 1], despues: status } },
    });
    passed.push(status);
  }
  return passed;
}

/**
 * Cadena de entregas: devuelve el video a una etapa anterior (p. ej. de Programado a Edición
 * cuando el community devuelve por correcciones), firmado como «Sistema» con la causa. Solo
 * hacia atrás; las aprobaciones las gestiona quien llama.
 */
export async function reopenVideoAsSystem(tx: AppTransaction, videoId: string, target: string, cause: string): Promise<boolean> {
  const video = await tx.contentItem.findUniqueOrThrow({ where: { id: videoId }, select: { title: true, status: true, brandId: true } });
  const from = CONTENT_FLOW.indexOf(video.status), to = CONTENT_FLOW.indexOf(target);
  if (from < 0 || to < 0 || to >= from) return false;
  await tx.contentItem.update({ where: { id: videoId }, data: { status: target } });
  await auditInTransaction(tx, {
    user: null,
    action: "EDITAR",
    entity: "ContentItem",
    entityId: videoId,
    brandId: video.brandId,
    summary: `Devolvió el video "${video.title}" a ${CONTENT_STATUS_MAP[target]?.label ?? target} (Sistema, ${cause})`,
    changes: { status: { etiqueta: "Estado", antes: video.status, despues: target } },
  });
  return true;
}

/**
 * Cadena de entregas: «Enviar a revisión» un guion exige lo mismo que el «Listo» del guionista
 * (al menos una escena y CTA en el guion o en sus videos). Sin cadena configurada no consulta nada.
 */
async function assertChainScriptReady(tx: AppTransaction, id: string, scriptBrandId: string | null, status: string) {
  if (status !== "REVISION" || !productionChainConfigured()) return;
  const videos = await tx.contentItem.findMany({ where: { scriptId: id }, select: { brandId: true, cta: true } });
  if (!videos.some((video) => productionChainEnabled(video.brandId)) && !productionChainEnabled(scriptBrandId)) return;
  if (!await tx.scriptScene.count({ where: { scriptId: id } })) throw new WorkflowError("El guion necesita al menos una escena antes de enviarlo.");
  const script = await tx.script.findUniqueOrThrow({ where: { id }, select: { cta: true } });
  if (!script.cta?.trim() && !(videos.length && videos.every((video) => video.cta?.trim()))) throw new WorkflowError("Falta el CTA del guion antes de enviarlo.");
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
    await assertChainScriptReady(tx, id, before.brandId, status);
    let approvalId = before.approvalId;
    if (step === "reopen" || step === "stop") {
      if (approvalId || ["APROBADO", "GRABADO"].includes(before.status)) assertPermission(user, "scripts.approve");
      await revokeVersion(tx, approvalId, user, reason); approvalId = null;
    }
    if (status === "APROBADO") {
      if (productionChainConfigured()) {
        const linked = await tx.contentItem.findMany({ where: { scriptId: id }, select: { brandId: true } });
        if (linked.some(video => productionChainEnabled(video.brandId))) throw new WorkflowError("Aprueba la entrega desde el paso Revisión de guion del vídeo o Mi trabajo.");
      }
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
    // Cadena de entregas: «Enviar a revisión» o aprobar equivale al Listo del guionista; volver
    // a Borrador reabre el paso del guion. Sin cadena configurada no consulta nada.
    await onScriptStatusChanged(tx, user, id, before.status, status);
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
  // Cadena de entregas: la fecha prevista manda sobre el plazo de la publicación pendiente.
  if (before.scheduledDate.getTime() !== data.scheduledDate.getTime()) await onScheduledDateChanged(tx, user, id);
}

