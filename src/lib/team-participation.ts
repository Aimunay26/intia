import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

/** El historial se agrega en DB: una persona puede tener varios papeles en un video. */
export async function getTeamParticipation(userIds?: string[]) {
  if (userIds?.length === 0) return { participation: new Map<string, { videos: number; roles: Map<string, number> }>(), totalAssignments: 0 };
  const scope = userIds ? Prisma.sql`WHERE "userId" IN (${Prisma.join(userIds)})` : Prisma.empty;
  const [people, roles] = await Promise.all([
    prisma.$queryRaw<Array<{ userId: string; videos: bigint; assignments: bigint }>>`
      SELECT "userId", COUNT(DISTINCT "contentItemId") AS "videos", COUNT(*) AS "assignments"
      FROM "Assignment" ${scope} GROUP BY "userId"
    `,
    prisma.assignment.groupBy({ by: ["userId", "role"], ...(userIds ? { where: { userId: { in: userIds } } } : {}), _count: { _all: true } }),
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
