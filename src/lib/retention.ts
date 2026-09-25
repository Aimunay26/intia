import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma, type AppTransaction } from "@/lib/prisma";
import { usageDay } from "@/lib/resource-limits";

export const RETENTION_KEY = "ops.retention.policy";
export const DEFAULT_RETENTION = { enabled: false, responseDays: 90, requestDays: 90, importDays: 90, counterDays: 120 };
export type RetentionPolicy = typeof DEFAULT_RETENTION;
const closed = ["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"];
export function retentionPolicy(value: unknown): RetentionPolicy {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_RETENTION };
  const raw = value as Record<string, unknown>;
  const days = (key: string, fallback: number, min = 30) => {
    const n = Number(raw[key] ?? fallback);
    if (!Number.isInteger(n) || n < min || n > 3650) throw new Error(`Retención ${key}: indica entre ${min} y 3650 días.`);
    return n;
  };
  return { enabled: raw.enabled === true, responseDays: days("responseDays",90), requestDays: days("requestDays",90), importDays: days("importDays",90), counterDays: days("counterDays",120,90) };
}
export function retentionFingerprint(policy: RetentionPolicy) { return createHash("sha256").update(JSON.stringify(policy)).digest("hex"); }
export async function readRetentionPolicy(db: AppTransaction = prisma) {
  const row = await db.appSetting.findUnique({ where: { key: RETENTION_KEY } });
  return { policy: retentionPolicy(row ? JSON.parse(row.value) : null), revision: row?.updatedAt.toISOString() ?? "new" };
}
const cutoff = (days: number, now: number) => new Date(now - days * 86400000);

export async function previewRetention(policy: RetentionPolicy, now = Date.now()) {
  const [responses, requests, imports, counters] = await Promise.all([
    prisma.generationItem.count({ where: { status: { in: closed }, updatedAt: { lt: cutoff(policy.responseDays,now) }, response: { not: Prisma.DbNull }, job: { status: { in: closed } } } }),
    prisma.$queryRaw<{ total: number }[]>`SELECT count(*)::int AS total FROM "GenerationJob" WHERE status IN ('COMPLETED','PARTIAL','FAILED','CANCELLED') AND "updatedAt"<${cutoff(policy.requestDays,now)} AND NOT payload @> '{"redacted":true}'::jsonb`,
    prisma.metricImportBatch.count({ where: { status: "COMPLETED", updatedAt: { lt: cutoff(policy.importDays,now) }, NOT: { rows: { equals: [] } } } }),
    prisma.$queryRaw<{ total: number }[]>`SELECT count(*)::int AS total FROM "UsageCounter" WHERE key ~ '^(ai:|blob:|db-storage:)' AND key ~ '[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND right(key,10)<${usageDay(cutoff(policy.counterDays,now))}`,
  ]);
  return { responses, requests: requests[0].total, imports, counters: counters[0].total };
}

/** Technical payloads only. No deletion of business records, approvals, scripts or audit. */
export async function runRetention(limit = 100, now = Date.now()) {
  const { policy } = await readRetentionPolicy();
  if (!policy.enabled) return { enabled: false, changed: 0 };
  const take = Math.max(1, Math.min(limit,100));
  return prisma.$transaction(async tx => {
    const responses = await tx.$executeRaw`WITH candidates AS (
      SELECT i.id FROM "GenerationItem" i JOIN "GenerationJob" j ON j.id=i."jobId"
      WHERE i.status IN ('COMPLETED','FAILED','CANCELLED') AND j.status IN ('COMPLETED','PARTIAL','FAILED','CANCELLED')
        AND i."updatedAt"<${cutoff(policy.responseDays,now)} AND i.response IS NOT NULL
      ORDER BY i.id LIMIT ${take} FOR UPDATE OF i SKIP LOCKED
    ) UPDATE "GenerationItem" SET response=NULL FROM candidates c WHERE "GenerationItem".id=c.id`;
    const requests = await tx.$executeRaw`WITH candidates AS (
      SELECT id FROM "GenerationJob" WHERE status IN ('COMPLETED','PARTIAL','FAILED','CANCELLED') AND "updatedAt"<${cutoff(policy.requestDays,now)} AND NOT payload @> '{"redacted":true}'::jsonb
      ORDER BY id LIMIT ${take} FOR UPDATE SKIP LOCKED
    ) UPDATE "GenerationJob" j SET payload=jsonb_build_object('brandId',j.payload->'brandId','contentItemId',j.payload->'contentItemId','provider',j.payload->'provider','model',j.payload->'model','redacted',true)
      FROM candidates c WHERE j.id=c.id`;
    const imports = await tx.$executeRaw`WITH candidates AS (
      SELECT id FROM "MetricImportBatch" WHERE status='COMPLETED' AND "updatedAt"<${cutoff(policy.importDays,now)} AND rows<>'[]'::jsonb ORDER BY id LIMIT ${take} FOR UPDATE SKIP LOCKED
    ) UPDATE "MetricImportBatch" b SET rows='[]'::jsonb FROM candidates c WHERE b.id=c.id`;
    const counters = await tx.$executeRaw`WITH candidates AS (
      SELECT key FROM "UsageCounter" WHERE key ~ '^(ai:|blob:|db-storage:)' AND key ~ '[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND right(key,10)<${usageDay(cutoff(policy.counterDays,now))} ORDER BY key LIMIT ${take} FOR UPDATE SKIP LOCKED
    ) DELETE FROM "UsageCounter" u USING candidates c WHERE u.key=c.key`;
    return { enabled: true, changed: responses+requests+imports+counters, responses, requests, imports, counters };
  }, { maxWait: 1000, timeout: 5000 });
}
