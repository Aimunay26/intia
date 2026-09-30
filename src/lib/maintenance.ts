import { Prisma } from "@prisma/client";
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

/**
 * Trabajos de IA atascados (sin avance en 6 minutos y sin concesión vigente) que la recuperación
 * vuelve a despachar, los 3 más antiguos. Nunca los de una marca archivada (payload.brandId), esté
 * o no encendido el archivado total: no se gasta IA en una marca archivada. Se filtran en la misma
 * consulta, así un trabajo de marca archivada que quedó colgado no tapa a los demás; esos los cancela
 * closeArchivedJobs antes del despacho.
 */
export function staleJobs(started: number) {
  return prisma.$queryRaw<{ id: string; createdAt: Date }[]>`SELECT j."id", j."createdAt" FROM "GenerationJob" j
    WHERE j."status" IN ('QUEUED','RUNNING') AND j."updatedAt" < ${new Date(started-360000)}
      AND NOT EXISTS (SELECT 1 FROM "GenerationItem" i WHERE i."jobId" = j."id" AND i."status" = 'RUNNING' AND i."leaseUntil" > ${new Date(started)})
      AND NOT EXISTS (SELECT 1 FROM "Brand" b WHERE b."id" = j."payload"->>'brandId' AND b."archived")
    ORDER BY j."createdAt" ASC, j."id" ASC LIMIT 3`;
}

export const ARCHIVED_JOB_ERROR = "La marca está archivada: la generación se canceló sin llamar a la IA.";

/**
 * Guarda siempre activa del archivado total: los trabajos de una marca archivada que quedaron colgados
 * (en cola o en curso, 6 minutos sin avanzar y sin concesión vigente) no se despachan (staleJobs), y
 * tampoco se dejan así: sin despacho nunca llegarían a su vencimiento, ocuparían para siempre uno de los
 * 2 pendientes de su dueño, que ya no los ve para cancelarlos, y bloquearían el `--apply` de un lote.
 * Se cancelan aquí, en una transacción y sin llamar al proveedor. Solo base de datos: corre aunque la IA
 * esté apagada. SKIP LOCKED: un trabajo que otro proceso tiene tomado se deja para la próxima pasada.
 */
export async function closeArchivedJobs(started: number): Promise<number> {
  return prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT j."id" FROM "GenerationJob" j
      WHERE j."status" IN ('QUEUED','RUNNING') AND j."updatedAt" < ${new Date(started-360000)}
        AND NOT EXISTS (SELECT 1 FROM "GenerationItem" i WHERE i."jobId" = j."id" AND i."status" = 'RUNNING' AND i."leaseUntil" > ${new Date(started)})
        AND EXISTS (SELECT 1 FROM "Brand" b WHERE b."id" = j."payload"->>'brandId' AND b."archived")
      ORDER BY j."createdAt" ASC, j."id" ASC LIMIT 25 FOR UPDATE OF j SKIP LOCKED`;
    if (!rows.length) return 0;
    const ids = rows.map(row => row.id);
    const closed = await tx.generationJob.updateMany({ where: { id: { in: ids }, status: { in: ["QUEUED","RUNNING"] } }, data: { status: "CANCELLED", error: ARCHIVED_JOB_ERROR } });
    await tx.generationItem.updateMany({ where: { jobId: { in: ids }, status: { in: ["QUEUED","RUNNING"] } }, data: { status: "CANCELLED", response: Prisma.DbNull, leaseToken: null, leaseUntil: null } });
    return closed.count;
  });
}

/** Recovery gets the first time slice; a slow Blob cannot starve the job queue. */
export async function runMaintenance() {
  const started = Date.now(), deadline = started + 50000;
  const recovery = await boundedStep(async () => {
    // Un fallo al cerrarlos no frena la recuperación de los demás; queda en el log y en el informe (null).
    const closedArchived = await closeArchivedJobs(started).catch(() => {
      console.warn(JSON.stringify({ event: "maintenance", error: "archived_jobs_not_closed" }));
      return null;
    });
    if (process.env.AI_JOBS_ENABLED !== "true") return { attempted: 0, recovered: 0, failed: 0, oldestAgeMinutes: 0, closedArchived };
    const jobs = await staleJobs(started);
    const results = await Promise.all(jobs.map(job => boundedStep(() => dispatchGeneration(job.id,true),10000)));
    return { attempted: jobs.length, recovered: results.filter(r=>r.value===true).length, failed: results.filter(r=>r.error || r.value !== true).length, oldestAgeMinutes: jobs[0] ? Math.round((started-jobs[0].createdAt.getTime())/60000) : 0, closedArchived };
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
