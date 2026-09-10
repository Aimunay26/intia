"use server";
import { requirePermission } from "@/lib/auth";
import { cancelGeneration, generationStatus } from "@/lib/generation-jobs";
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
