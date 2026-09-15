import { start } from "workflow/api";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { generateScriptsWorkflow } from "@/workflows/generate-scripts";
import { reserveUsage, resourceLimit, usageDay } from "@/lib/resource-limits";
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
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(781240121)`;
    const since = usageDay(new Date(Date.now() - 31 * 86400000));
    const used = await tx.usageCounter.aggregate({ where: { key: { startsWith: "ai:dispatch:", gte: `ai:dispatch:${since}` } }, _sum: { amount: true } });
    if ((used._sum.amount ?? 0n) >= BigInt(resourceLimit("AI_32D_DISPATCHES", 80))) throw new Error("Se alcanzó el cupo de ejecuciones de los últimos 32 días.");
    await reserveUsage(tx, `ai:dispatch:${usageDay()}`, 1, resourceLimit("AI_DAILY_DISPATCHES", 40));
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
