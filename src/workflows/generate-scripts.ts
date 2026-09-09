import { sleep } from "workflow";
import { processGeneration } from "@/lib/generation-jobs";
import { revalidatePath } from "next/cache";

export async function generateScriptsWorkflow(jobId: string) {
  "use workflow";
  // Límite adicional a intentos/tiempo de vida en DB para evitar ejecuciones sin fin.
  for (let step = 0; step < 40; step++) {
    const result = await advanceGeneration(jobId);
    if (result.done) return;
    if (result.retryAt) await sleep(new Date(result.retryAt));
  }
}

async function advanceGeneration(jobId: string) {
  "use step";
  try {
    const result = await processGeneration(jobId);
    if (result.done) { revalidatePath("/guiones"); revalidatePath("/"); }
    return result;
  }
  catch { throw new Error("No se pudo guardar el avance de la generación."); }
}
advanceGeneration.maxRetries = 3;
