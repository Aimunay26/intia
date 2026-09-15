import { sleep } from "workflow";
import { processGeneration } from "@/lib/generation-jobs";
import { revalidatePath } from "next/cache";
import { generationStage, withGenerationTrace } from "@/lib/generation-trace";

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
  return withGenerationTrace({ jobId }, () => generationStage("workflow_step", async () => {
    try {
      const result = await processGeneration(jobId);
      // Al terminar cambian la lista de guiones, el inicio y, por el vínculo del
      // primer guion con el video pedido, las tarjetas de contenido y el calendario.
      if (result.done) await generationStage("cache_refresh", () => { for (const ruta of ["/guiones", "/", "/contenido", "/calendario"]) revalidatePath(ruta); });
      return result;
    }
    catch { throw new Error("No se pudo guardar el avance de la generación."); }
  }));
}
advanceGeneration.maxRetries = 3;
