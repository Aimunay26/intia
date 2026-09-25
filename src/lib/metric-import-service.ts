import { createHash, randomUUID } from "node:crypto";
import { Prisma, type MetricImportBatch } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertActor } from "@/lib/auth-transactions";
import { contentScope } from "@/lib/access-scope";
import { assertPermission } from "@/lib/permissions";
import type { SessionUser } from "@/lib/auth";
import { diffFields } from "@/lib/audit";
import { prepareCsvImport, type FilaValida, type ImportState, type ImportRowError } from "@/lib/metric-import-parser";

export const IMPORT_CHUNK_SIZE = 25;
type StoredRow = Omit<FilaValida, "date" | "data"> & { date: string; metricId: string; data: Record<string, string | number | null>; expectedUpdatedAt: string | null };
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const identity = (r: { contentItemId: string; date: Date | string; platform: string }) => `${r.contentItemId}|${new Date(r.date).toISOString()}|${r.platform}|WEEKLY`;
const selector = (rows: { contentItemId: string; date: Date | string; platform: string }[]) => rows.map(r => ({ contentItemId: r.contentItemId, date: new Date(r.date), platform: r.platform, period: "WEEKLY" }));
const receiptSelect = { id: true, processed: true, total: true, created: true, updated: true, status: true, issues: true } as const;

export async function startMetricImport(user: SessionUser, form: FormData): Promise<ImportState> {
  assertPermission(user, "metrics.write");
  const text = String(form.get("csv") ?? "");
  if (text.length > 1_000_000) return { error: "Importa como máximo 500 filas por lote." };
  const fingerprint = createHash("sha256").update(text).digest("hex");
  // Non-browser callers without a UUID get deterministic replay protection too.
  const key = String(form.get("requestKey") || fingerprint);
  if (!/^(?:[0-9a-f-]{36}|[0-9a-f]{64})$/.test(key)) return { error: "Identificador de importación inválido. Recarga el formulario." };
  const old = await prisma.metricImportBatch.findUnique({ where: { userId_requestKey: { userId: user.id, requestKey: key } }, select: { id: true, fingerprint: true } });
  if (old) {
    if (old.fingerprint !== fingerprint) return { error: "Este envío ya corresponde a otro CSV. Inicia una nueva importación." };
    return continueMetricImport(user, old.id);
  }
  const prepared = await prepareCsvImport(user, form);
  if (!("rows" in prepared)) return prepared;
  const previous = await prisma.metric.findMany({ where: { OR: selector(prepared.rows) }, select: { id: true, contentItemId: true, date: true, platform: true, updatedAt: true } });
  const byKey = new Map(previous.map(r => [identity(r), r]));
  const rows: StoredRow[] = prepared.rows.map(row => {
    const old = byKey.get(identity(row));
    return { ...row, date: row.date.toISOString(), data: JSON.parse(JSON.stringify(row.data)), metricId: old?.id ?? randomUUID(), expectedUpdatedAt: old?.updatedAt.toISOString() ?? null };
  });
  const batch = await prisma.$transaction(async tx => {
    await assertActor(tx, user);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`metric-import:${user.id}`},0))`;
    const existing = await tx.metricImportBatch.findUnique({ where: { userId_requestKey: { userId: user.id, requestKey: key } }, select: { id: true, fingerprint: true } });
    if (existing) { if (existing.fingerprint !== fingerprint) throw new Error("El envío cambió."); return existing; }
    if (await tx.metricImportBatch.count({ where: { userId: user.id, status: "PENDING" } }) >= 5) throw new Error("Termina tus importaciones pendientes antes de iniciar otra.");
    return tx.metricImportBatch.create({ data: { userId: user.id, requestKey: key, fingerprint, total: rows.length, rows: json(rows), issues: json(prepared.issues) }, select: { id: true, fingerprint: true } });
  });
  return continueMetricImport(user, batch.id);
}

/** One bounded transaction: batch lock, scoped read, bulk writes, audits, durable receipt. */
export async function continueMetricImport(user: SessionUser, id: string): Promise<ImportState> {
  assertPermission(user, "metrics.write");
  return prisma.$transaction(async tx => {
    await assertActor(tx, user);
    // Fetch only this chunk, not the complete original CSV on every continuation.
    const [batch] = await tx.$queryRaw<Pick<MetricImportBatch, "id" | "processed" | "total" | "created" | "updated" | "status" | "issues" | "rows">[]>`
      SELECT b.id,b.processed,b.total,b.created,b.updated,b.status,b.issues,
        (SELECT jsonb_agg(b.rows->n ORDER BY n) FROM generate_series(b.processed,LEAST(b.total,b.processed+${IMPORT_CHUNK_SIZE}::int)-1) n) AS rows
      FROM "MetricImportBatch" b WHERE b.id=${id} AND b."userId"=${user.id} FOR UPDATE OF b`;
    if (!batch) throw new Error("Importación no encontrada.");
    if (batch.status === "COMPLETED") return report(batch);
    const chunk = batch.rows as unknown as StoredRow[];
    const ids = [...new Set(chunk.map(r => r.contentItemId))].sort();
    // Locks prevent a concurrent brand change or deletion after the scope check.
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "ContentItem" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR SHARE`);
    const videos = await tx.contentItem.findMany({ where: { AND: [contentScope(user, "metrics.write"), { id: { in: ids } }] }, select: { id: true, title: true, brandId: true } });
    const authorized = new Map(videos.map(v => [v.id, v]));
    const lockKeys = chunk.map(identity).sort();
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(k,0))::text FROM unnest(ARRAY[${Prisma.join(lockKeys)}]::text[]) k ORDER BY k`);
    const rowConditions = chunk.map(r => Prisma.sql`("contentItemId"=${r.contentItemId} AND date=${new Date(r.date)} AND platform=${r.platform})`);
    const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM "Metric" WHERE period='WEEKLY' AND (${Prisma.join(rowConditions, " OR ")}) ORDER BY id FOR UPDATE`);
    const existing = locked.length ? await tx.metric.findMany({ where: { OR: selector(chunk) } }) : [];
    const before = new Map(existing.map(r => [identity(r), r]));
    const issues = batch.issues as unknown as ImportRowError[];
    const accepted: StoredRow[] = [];
    for (const row of chunk) {
      const current = before.get(identity(row)), video = authorized.get(row.contentItemId);
      const reason = !video || video.brandId !== row.brandId ? "El video ya no existe o su acceso/marca cambió." :
        (current?.updatedAt.toISOString() ?? null) !== row.expectedUpdatedAt ? "La métrica cambió desde la prevalidación. Revisa el dato e importa esta fila en un lote nuevo." : null;
      if (reason) issues.push({ line: row.line, reason, preview: `Fila ${row.line}` });
      else accepted.push(row);
    }
    const creates = accepted.filter(r => !before.has(identity(r))), updates = accepted.filter(r => before.has(identity(r)));
    if (creates.length) await tx.metric.createMany({ data: creates.map(row => ({
      id: row.metricId, contentItemId: row.contentItemId, date: new Date(row.date), platform: row.platform, period: "WEEKLY", source: "IMPORT",
      ...row.data,
    })) });
    if (updates.length) {
      const columns: Record<string, string> = { views: "integer", likes: "integer", comments: "integer", shares: "integer", saves: "integer", reach: "integer", clicks: "integer", leads: "integer", orders: "integer", spend: "numeric", revenue: "numeric", retention3s: "double precision", notes: "text" };
      const fields = Object.entries(columns).map(([key, type]) => Prisma.sql`${Prisma.raw('"'+key+'"')}=CASE WHEN r->'data' ? ${key} THEN (r->'data'->>${key})::${Prisma.raw(type)} ELSE m.${Prisma.raw('"'+key+'"')} END`);
      await tx.$executeRaw(Prisma.sql`UPDATE "Metric" m SET ${Prisma.join(fields)}, source='IMPORT', "updatedAt"=CURRENT_TIMESTAMP FROM jsonb_array_elements(${JSON.stringify(updates)}::jsonb) r WHERE m.id=r->>'metricId'`);
    }
    if (accepted.length) {
      const saved = await tx.metric.findMany({ where: { id: { in: accepted.map(r => r.metricId) } } });
      const after = new Map(saved.map(r => [r.id, r]));
      await tx.auditLog.createMany({ data: accepted.map(row => ({ userId: user.id, userName: user.name, action: before.has(identity(row)) ? "EDITAR" : "CREAR", entity: "Metric", entityId: row.metricId, brandId: row.brandId,
        summary: `Importó métricas de "${authorized.get(row.contentItemId)!.title}" desde CSV · lote ${id} · fila ${row.line}`,
        changes: JSON.stringify(diffFields(before.get(identity(row)) ?? {}, after.get(row.metricId)!)),
      })) });
    }
    const processed = batch.processed + chunk.length;
    const savedBatch = await tx.metricImportBatch.update({ where: { id }, data: { processed, created: { increment: creates.length }, updated: { increment: updates.length }, issues: json(issues), status: processed === batch.total ? "COMPLETED" : "PENDING" }, select: receiptSelect });
    return report(savedBatch);
  }, { maxWait: 5000, timeout: 15000 });
}

function report(batch: { id: string; processed: number; total: number; created: number; updated: number; status: string; issues: Prisma.JsonValue }): ImportState {
  return { batchId: batch.id, pending: batch.status !== "COMPLETED", processed: batch.processed, total: batch.total, created: batch.created, updated: batch.updated,
    ignored: batch.issues as unknown as ImportRowError[], ok: `${batch.processed}/${batch.total} filas procesadas · ${batch.created} nuevas · ${batch.updated} actualizadas.` };
}

export async function recentMetricImports(user: SessionUser) {
  assertPermission(user, "metrics.write");
  return prisma.metricImportBatch.findMany({ where: { userId: user.id, status: "PENDING" }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 5, select: { id: true, processed: true, total: true, createdAt: true } });
}
