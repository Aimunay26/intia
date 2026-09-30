import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { archiveEpoch, liveBrandSql, liveContent } from "@/lib/archive-scope";

/**
 * El historial se agrega en DB: una persona puede tener varios papeles en un video.
 * Archivo total (ARCHIVO_TOTAL_DESDE): Equipo es una pantalla operativa, así que no cuenta los videos
 * de marcas archivadas. Con el interruptor vacío, las consultas de siempre.
 */
export async function getTeamParticipation(userIds?: string[]) {
  if (userIds?.length === 0) return { participation: new Map<string, { videos: number; roles: Map<string, number> }>(), totalAssignments: 0 };
  const epoch = archiveEpoch();
  const [people, roles] = await Promise.all([
    epoch
      ? prisma.$queryRaw<Array<{ userId: string; videos: bigint; assignments: bigint }>>`
        SELECT a."userId", COUNT(DISTINCT a."contentItemId") AS "videos", COUNT(*) AS "assignments"
        FROM "Assignment" a JOIN "ContentItem" ci ON ci."id" = a."contentItemId"
        WHERE ${userIds ? Prisma.sql`a."userId" IN (${Prisma.join(userIds)})` : Prisma.sql`TRUE`} AND ${liveBrandSql('ci."brandId"', { epoch })}
        GROUP BY a."userId"
      `
      : prisma.$queryRaw<Array<{ userId: string; videos: bigint; assignments: bigint }>>`
        SELECT "userId", COUNT(DISTINCT "contentItemId") AS "videos", COUNT(*) AS "assignments"
        FROM "Assignment" ${userIds ? Prisma.sql`WHERE "userId" IN (${Prisma.join(userIds)})` : Prisma.empty} GROUP BY "userId"
      `,
    prisma.assignment.groupBy({
      by: ["userId", "role"],
      ...(userIds || epoch ? { where: { ...(userIds ? { userId: { in: userIds } } : {}), ...(epoch ? { contentItem: liveContent(epoch) } : {}) } } : {}),
      _count: { _all: true },
    }),
  ]);
  const participation = new Map(people.map((p) => [
    p.userId, { videos: Number(p.videos), roles: new Map<string, number>() },
  ]));
  for (const role of roles) participation.get(role.userId)?.roles.set(role.role, role._count._all);
  return {
    participation,
    totalAssignments: people.reduce((sum, p) => sum + Number(p.assignments), 0),
  };
}
