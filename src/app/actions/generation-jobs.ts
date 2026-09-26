"use server";
import { requirePermission } from "@/lib/auth";
import { cancelGeneration, generationStatus, retryFailedGeneration, GenerationRequestError } from "@/lib/generation-jobs";
import { SecurityError } from "@/lib/auth-transactions";
import { dispatchGeneration } from "@/lib/generation-dispatch";
import { revalidatePath } from "next/cache";

export async function getGenerationStatus(id: string) {
  const job = await generationStatus(await requirePermission("scripts.generate"), id);
  if (job && ["COMPLETED", "PARTIAL"].includes(job.status)) revalidatePath("/guiones");
  return job;
}

export async function cancelGenerationJob(id: string) {
  await cancelGeneration(await requirePermission("scripts.generate"), id);
}

export async function resumeGenerationJob(id: string) {
  const user = await requirePermission("scripts.generate");
  if (!await generationStatus(user, id)) throw new Error("Generación no encontrada.");
  await dispatchGeneration(id, true);
}

export async function retryFailedGenerationJob(id: string, provider?: string) {
  const user = await requirePermission("scripts.generate");
  try {
    const nextId = await retryFailedGeneration(user, id, provider);
    await dispatchGeneration(nextId, true);
    revalidatePath("/generador/trabajos");
    revalidatePath(`/generador/trabajos/${id}`);
    return { ok: true as const, id: nextId };
  } catch (error) {
    return { ok: false as const, error: error instanceof GenerationRequestError || error instanceof SecurityError
      ? error.message : "No se pudo registrar el reintento. Intenta de nuevo; los guiones terminados se conservan." };
  }
}
