import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadPage } from "@/lib/list-pagination";

/** Caller must authorize the parent. Text and binary content never travel in lists. */
export function loadAssetPage(ownerType: string, ownerId: string, page?: string) {
  return loadPage(page, 20, () => prisma.asset.count({ where: { ownerType, ownerId } }), ({ take, skip }) =>
    prisma.$queryRaw<{ id: string; filename: string; label: string | null; mimeType: string; size: number; useForAi: boolean; hasText: boolean; textLength: number; updatedAt: Date; createdAt: Date }[]>(Prisma.sql`
      SELECT id, filename, label, "mimeType", size, "useForAi", "updatedAt", "createdAt",
        COALESCE(length("extractedText"),0)::int AS "textLength", COALESCE(length("extractedText"),0)>0 AS "hasText"
      FROM "Asset" WHERE "ownerType"=${ownerType} AND "ownerId"=${ownerId}
      ORDER BY "createdAt" DESC, id ASC LIMIT ${take} OFFSET ${skip}`));
}
