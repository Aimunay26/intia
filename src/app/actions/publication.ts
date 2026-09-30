"use server";
import { revalidatePath } from "next/cache";
import { requirePermission, type SessionUser } from "@/lib/auth";
import { withWorkflowMutation } from "@/lib/mutations";
import { recordPublication } from "@/lib/domain/lifecycle";
import { ChainError, completeStep } from "@/lib/domain/production-chain";
import { ProductionFlowError } from "@/lib/domain/production-flow";
import type { AppTransaction } from "@/lib/prisma";
import { productionChainConfigured, productionChainEnabled } from "@/lib/production-chain-flag";
import { invalidateDomain } from "@/lib/view-invalidation";
import { boolField, field, fieldOrNull, dateField } from "@/lib/utils";

/**
 * Programación y enlace publicado del video (content.publish).
 *
 * Cadena de entregas (PRODUCTION_CHAIN_ENABLED): con `publicado=1` («Guardar y marcar
 * publicado») es el «Publicado» del community: después de guardar el enlace, completa la
 * publicación pendiente con las mismas validaciones del «Listo» (checks de publicación a su
 * nombre, video → Programado → Publicado como Sistema, paso y tarea cerrados). Sin ese campo
 * solo guarda, como siempre; la fecha prevista nueva mueve el plazo del paso (recordPublication).
 * Pasar el video a Publicado por cualquier camino también cierra la publicación.
 */
export async function guardarPublicacion(form: FormData) {
  const user = await requirePermission("content.publish");
  const publicado = boolField(form, "publicado");
  try {
    return await withWorkflowMutation(user, false, async (tx, afterCommit) => {
      await recordPublication(tx, user, { id: field(form,"id"), expectedUpdatedAt: field(form,"expectedUpdatedAt"), publishedUrl: fieldOrNull(form,"publishedUrl"), scheduledDate: dateField(form,"scheduledDate") });
      if (publicado) await publicarPaso(tx, user, field(form, "id"));
      afterCommit(() => invalidateDomain("content"));
      if (productionChainConfigured()) afterCommit(() => { revalidatePath("/tareas"); revalidatePath("/cadena"); });
    });
  } catch (error) {
    // Reglas de la cadena (ChainError): legibles en el formulario; no se guarda nada.
    if (error instanceof ProductionFlowError) return { error: error.message };
    throw error;
  }
}

/** «Publicado» del community sobre el paso de publicación pendiente del video. */
async function publicarPaso(tx: AppTransaction, user: SessionUser, videoId: string) {
  const video = await tx.contentItem.findUnique({ where: { id: videoId }, select: { brandId: true, publishedUrl: true } });
  if (!video || !productionChainEnabled(video.brandId)) throw new ChainError("La cadena de entregas no está activa para esta marca: cambia el estado del video a Publicado.");
  const step = await tx.productionStep.findFirst({ where: { contentItemId: videoId, step: "PUBLICACION", status: "PENDIENTE" }, select: { id: true } });
  if (!step) throw new ChainError("El video no tiene una publicación pendiente.");
  await completeStep(tx, user, step.id, { publishedUrl: video.publishedUrl });
}
