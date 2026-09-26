import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { generationScope, scriptScope } from "@/lib/access-scope";
import { assertPermission, type AccessUser } from "@/lib/permissions";
import { pageNumber } from "@/lib/query-params";

/** Un único sucesor por origen, también entre pestañas y usuarios. */
export const retryJobId = (sourceId: string) => `c${createHash("sha256").update(`generation-retry:${sourceId}`).digest("hex").slice(0, 24)}`;

export async function generationHistory(user: AccessUser, requestedPage?: string, failedOnly = false) {
  assertPermission(user, "scripts.generate");
  const page = pageNumber(requestedPage, 10000);
  const rows = await prisma.generationJob.findMany({
    where: { AND: [{ userId: user.id }, generationScope(user), failedOnly ? {
      status: { in: ["FAILED", "PARTIAL", "CANCELLED"] },
      items: { some: { status: { in: ["FAILED", "CANCELLED"] }, script: { is: null } } },
    } : {}] },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 21, skip: (page - 1) * 20,
    select: { id: true, createdAt: true, status: true, items: { orderBy: { order: "asc" }, select: {
      id: true, status: true, structure: { select: { name: true } },
      script: { where: scriptScope(user), select: { id: true } },
    } } },
  });
  const visible = rows.slice(0, 20);
  const successors = visible.length ? await prisma.generationJob.findMany({
    where: { AND: [{ id: { in: visible.map(row => retryJobId(row.id)) } }, generationScope(user)] },
    select: { id: true, status: true },
  }) : [];
  const nextById = new Map(successors.map(row => [row.id, row]));
  return { page, hasNext: rows.length > 20, jobs: visible.map(row => ({
    id: row.id, createdAt: row.createdAt, status: row.status,
    formats: row.items.map(item => item.structure.name), total: row.items.length,
    completed: row.items.filter(item => Boolean(item.script)).length,
    missing: row.items.filter(item => ["FAILED", "CANCELLED"].includes(item.status) && !item.script).length,
    retry: nextById.get(retryJobId(row.id)) ?? null,
  })) };
}
