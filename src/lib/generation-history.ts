import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generationScope } from "@/lib/access-scope";
import { assertPermission, type AccessUser } from "@/lib/permissions";
import { pageNumber } from "@/lib/query-params";

/** Un único sucesor por origen, también entre pestañas y usuarios. */
export const retryJobId = (sourceId: string) => `c${createHash("sha256").update(`generation-retry:${sourceId}`).digest("hex").slice(0, 24)}`;

const PAGE_SIZE = 20;
const pendingStatuses = ["QUEUED", "RUNNING", "FAILED", "CANCELLED"];

export async function generationHistory(user: AccessUser, requestedPage?: string, failedOnly = false) {
  assertPermission(user, "scripts.generate");
  const requested = pageNumber(requestedPage, 10000);
  const brandScope = user.role === "OWNER" ? Prisma.sql`TRUE`
    : user.brandIds?.length ? Prisma.sql`j."payload"->>'brandId' IN (${Prisma.join(user.brandIds)})` : Prisma.sql`FALSE`;
  const statusFilter = failedOnly ? Prisma.sql`j."status" IN ('FAILED', 'PARTIAL', 'CANCELLED')` : Prisma.sql`TRUE`;

  return prisma.$transaction(async tx => {
    // Un solo sucesor determinista por origen. El NOT EXISTS elimina TODOS los
    // ancestros antes de contar/paginar, incluso si el payload fue redactado.
    // Se conservan los recibos técnicos para impedir reejecuciones y proteger
    // los vínculos con Script; la lista contiene solo el intento vigente.
    const rows = await tx.$queryRaw<{ id: string | null; total: number; page: number }[]>(Prisma.sql`
      WITH pending AS MATERIALIZED (
        SELECT j."id", j."createdAt"
        FROM "GenerationJob" j
        WHERE j."userId" = ${user.id} AND ${brandScope} AND ${statusFilter}
          AND EXISTS (
            SELECT 1 FROM "GenerationItem" i
            WHERE i."jobId" = j."id" AND i."status" IN (${Prisma.join(pendingStatuses)})
              AND NOT EXISTS (SELECT 1 FROM "Script" s WHERE s."generationItemId" = i."id")
          )
          AND NOT EXISTS (
            SELECT 1 FROM "GenerationJob" successor
            WHERE successor."id" = 'c' || substr(encode(sha256(convert_to('generation-retry:' || j."id", 'UTF8')), 'hex'), 1, 24)
          )
      ), summary AS (
        SELECT COUNT(*)::integer AS total,
          LEAST(${requested}, GREATEST(1, CEIL(COUNT(*)::numeric / ${PAGE_SIZE})))::integer AS page
        FROM pending
      )
      SELECT p."id", summary.total, summary.page
      FROM summary LEFT JOIN LATERAL (
        SELECT "id", "createdAt" FROM pending
        ORDER BY "createdAt" DESC, "id" DESC
        LIMIT ${PAGE_SIZE} OFFSET (summary.page - 1) * ${PAGE_SIZE}
      ) p ON TRUE
      ORDER BY p."createdAt" DESC, p."id" DESC
    `);
    const { page, total } = rows[0];
    const ids = rows.flatMap(row => row.id ? [row.id] : []);
    const jobs = ids.length ? await tx.generationJob.findMany({
      where: { AND: [{ id: { in: ids }, userId: user.id }, generationScope(user)] },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, createdAt: true, status: true, items: {
        where: { status: { in: pendingStatuses }, script: { is: null } },
        orderBy: { order: "asc" }, select: { structure: { select: { name: true } } },
      } },
    }) : [];
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    return { page, pages, total, hasNext: page < pages, jobs: jobs.map(job => ({
      id: job.id, createdAt: job.createdAt, status: job.status,
      formats: job.items.map(item => item.structure.name), missing: job.items.length,
    })) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
