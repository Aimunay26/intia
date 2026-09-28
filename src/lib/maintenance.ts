import { prisma } from "@/lib/prisma";
import { dispatchGeneration } from "@/lib/generation-dispatch";
import { cleanupPrivateFiles } from "@/lib/private-storage";
import { runRetention } from "@/lib/retention";
import { runProductionSweep } from "@/lib/production-sweep";

/** An expired wait does not claim that a remote side effect was cancelled. Durable dispatch claims allow reconciliation. */
export async function boundedStep<T>(work: () => Promise<T>, milliseconds: number): Promise<{ value?: T; error?: "failed" | "uncertain" }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work().then(value => ({ value }), () => ({ error: "failed" as const })),
      new Promise<{ error: "uncertain" }>(resolve => { timer = setTimeout(() => resolve({ error: "uncertain" }), Math.max(1,milliseconds)); }),
    ]);
  } finally { clearTimeout(timer); }
}

/** Recovery gets the first time slice; a slow Blob cannot starve the job queue. */
export async function runMaintenance() {
  const started = Date.now(), deadline = started + 50000;
  const recovery = await boundedStep(async () => {
    if (process.env.AI_JOBS_ENABLED !== "true") return { attempted: 0, recovered: 0, failed: 0, oldestAgeMinutes: 0 };
    const jobs = await prisma.generationJob.findMany({ where: { status: { in: ["QUEUED","RUNNING"] }, updatedAt: { lt: new Date(started-360000) }, items: { none: { status: "RUNNING", leaseUntil: { gt: new Date(started) } } } }, orderBy: [{ createdAt: "asc" },{id:"asc"}], take: 3, select: { id: true, createdAt: true } });
    const results = await Promise.all(jobs.map(job => boundedStep(() => dispatchGeneration(job.id,true),10000)));
    return { attempted: jobs.length, recovered: results.filter(r=>r.value===true).length, failed: results.filter(r=>r.error || r.value !== true).length, oldestAgeMinutes: jobs[0] ? Math.round((started-jobs[0].createdAt.getTime())/60000) : 0 };
  },15000);
  const cleanupDeadline = Math.min(deadline-8000,Date.now()+20000);
  const cleanup = await boundedStep(() => cleanupPrivateFiles(3,cleanupDeadline),Math.max(1,cleanupDeadline-Date.now()));
  const retention = await boundedStep(() => runRetention(100),Math.max(1,Math.min(6000,deadline-Date.now())));
  // Flujo de producción: edición de los días de grabación ya pasados. Apagado (PRODUCTION_FLOW_ENABLED), no consulta nada.
  const productionBudget = Math.max(1,Math.min(8000,deadline-Date.now()-2000));
  const production = await boundedStep(() => runProductionSweep(25,new Date(),Math.max(1,productionBudget-1500)),productionBudget);
  const report = { recovery, cleanup, retention, production, durationMs: Date.now()-started };
  // Only counts/status; no prompts, file names, keys or provider error bodies.
  console.info(JSON.stringify({ event: "maintenance", ...report }));
  const saved = await boundedStep(() => prisma.appSetting.upsert({ where: { key: "ops.maintenance.last" }, create: { key: "ops.maintenance.last", value: JSON.stringify({ ...report, at: new Date().toISOString() }) }, update: { value: JSON.stringify({ ...report, at: new Date().toISOString() }) } }), Math.max(1,Math.min(1500,deadline-Date.now())));
  if (saved.error) console.warn(JSON.stringify({event:"maintenance",error:"report_not_saved"}));
  return report;
}
