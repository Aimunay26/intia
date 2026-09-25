import { start } from "workflow/api";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { generateScriptsWorkflow } from "@/workflows/generate-scripts";
import { recordUsage, usageDay } from "@/lib/resource-limits";
import { generationEvent, generationStage, withGenerationTrace } from "@/lib/generation-trace";

/** La fila precede a la cola. Un envío incierto se puede repetir sin duplicar guiones. */
export async function dispatchGeneration(jobId: string, recover = false) {
  return withGenerationTrace({ jobId }, () => generationStage("dispatch", () => dispatchJob(jobId, recover)));
}

async function dispatchJob(jobId: string, recover: boolean) {
  if (process.env.AI_JOBS_ENABLED !== "true") return;
  const dispatchToken = `dispatching:${randomUUID()}`;
  const claimed = await generationStage("dispatch_claim", () => prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "GenerationJob" WHERE "id" = ${jobId} FOR UPDATE`;
    const job = await tx.generationJob.findUnique({ where: { id: jobId } });
    if (!job || !["QUEUED", "RUNNING"].includes(job.status) || (!recover && job.runId)) return false;
    // También limita recuperaciones manuales repetidas y carreras con el mantenimiento diario.
    if (job.runId && Date.now() - job.updatedAt.getTime() < 360000) return false;
    await recordUsage(tx, `ai:dispatch:${usageDay()}`);
    await tx.generationJob.update({ where: { id: jobId }, data: { runId: dispatchToken, error: null } });
    return true;
  }));
  if (!claimed) { generationEvent("dispatch", "info", { reason: "not_runnable" }); return; }
  try {
    const run = await generationStage("dispatch_start", () => start(generateScriptsWorkflow, [jobId]));
    await generationStage("dispatch_save", () => prisma.generationJob.updateMany({ where: { id: jobId, runId: dispatchToken }, data: { runId: run.runId, error: null } }), { runId: run.runId });
    return true;
  } catch {
    await prisma.generationJob.updateMany({ where: { id: jobId, runId: dispatchToken, status: { in: ["QUEUED", "RUNNING"] } }, data: { error: "La solicitud quedó guardada. Puedes reanudarla si no comienza en unos minutos." } });
  }
}
