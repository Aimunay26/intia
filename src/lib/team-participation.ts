import { prisma } from "@/lib/prisma";

/** El historial se agrega en DB: una persona puede tener varios papeles en un video. */
export async function getTeamParticipation() {
  const [people, roles] = await Promise.all([
    prisma.$queryRaw<Array<{ userId: string; videos: bigint; assignments: bigint }>>`
      SELECT "userId", COUNT(DISTINCT "contentItemId") AS "videos", COUNT(*) AS "assignments"
      FROM "Assignment" GROUP BY "userId"
    `,
    prisma.assignment.groupBy({ by: ["userId", "role"], _count: { _all: true } }),
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
