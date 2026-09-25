import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { resourceLimit } from "@/lib/resource-limits";
import { RetentionSettings } from "@/components/retention-settings";
import { readRetentionPolicy } from "@/lib/retention";

export async function OperationsStatus() {
  // Rendered only behind the owner settings page. No secrets included in these reads.
  const [retention, last, pending, total, storage] = await Promise.all([
    readRetentionPolicy(),
    prisma.appSetting.findUnique({ where: { key: "ops.maintenance.last" }, select: { updatedAt: true, value: true } }),
    prisma.generationJob.findMany({ where: { status: { in: ["QUEUED","RUNNING"] }, updatedAt: { lt: new Date(Date.now()-360000) } }, orderBy: [{createdAt:"asc"},{id:"asc"}], take: 10, select: { id: true, createdAt: true } }),
    prisma.generationJob.count({ where: { status: { in: ["QUEUED","RUNNING"] }, updatedAt: { lt: new Date(Date.now()-360000) } } }),
    prisma.$queryRaw<{ bytes: bigint }[]>`SELECT COALESCE(SUM(octet_length(data)),0)::bigint AS bytes FROM "Asset" WHERE data IS NOT NULL`,
  ]);
  let failed = false;
  try { const report = JSON.parse(last?.value ?? "{}"); failed = Boolean(report.recovery?.error || report.recovery?.value?.failed || report.cleanup?.error || report.cleanup?.value?.failed || report.retention?.error); } catch { failed = true; }
  const stale = !last || Date.now()-last.updatedAt.getTime()>48*3600000;
  return <div className="space-y-4"><section className="card space-y-2 p-4"><h2 className="font-semibold">Operación y recuperación</h2>
    <p>Último mantenimiento: {last?.updatedAt.toISOString() ?? "sin registro"}.</p>
    {(stale || failed) && <p role="alert" className="text-warn">{stale ? "No hay un mantenimiento reciente confirmado. Revisa el cron en Vercel." : "El último mantenimiento registró fallos o resultados inciertos. Revisa los logs con event=maintenance."}</p>}
    <p>{total} trabajos con más de seis minutos sin avance. Entra al trabajo para revisar su estado y reanudarlo. Caducan a las {resourceLimit("AI_JOB_MAX_AGE_HOURS",72)} horas.</p>
    {pending.map(job=><p key={job.id}><Link className="text-brand" href={`/generador/trabajos/${job.id}`}>{job.id}</Link> · {Math.floor((Date.now()-job.createdAt.getTime())/60000)} min de antigüedad</p>)}
    <p>Archivos en DB: {(Number(storage[0].bytes)/1e6).toFixed(1)} / {(resourceLimit("DB_ASSET_STORAGE_LIMIT",100_000_000)/1e6).toFixed(0)} MB reservados. Las operaciones Blob y su transferencia se registran en los contadores; los intentos de borrado se cuentan por separado y no se facturan como operaciones avanzadas.</p>
  </section><RetentionSettings initial={retention.policy} revision={retention.revision} /></div>;
}
