import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadPage } from "@/lib/list-pagination";

export type TeamFilters = { rol?: string; estado?: string; q?: string; pagina?: string };
export const teamMemberSelect = {
  id: true, name: true, email: true, role: true, color: true, phone: true, bio: true,
  active: true, archetypeId: true, createdAt: true, workProfiles: { select: { profile: true } }, brandAccess: { select: { brandId: true } }, archetype: { select: { id: true, name: true, color: true } },
} satisfies Prisma.UserSelect;

export function teamWhere(filters: TeamFilters): Prisma.UserWhereInput {
  const q = filters.q?.trim();
  return {
    ...(filters.rol ? { role: filters.rol } : {}),
    ...(filters.estado === "activo" ? { active: true } : filters.estado === "inactivo" ? { active: false } : {}),
    ...(q ? { OR: [
      { name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } }, { archetype: { name: { contains: q, mode: "insensitive" } } },
    ] } : {}),
  };
}

export function getTeamList(filters: TeamFilters) {
  const where = teamWhere(filters);
  return loadPage(filters.pagina, 50, () => prisma.user.count({ where }),
    ({ skip, take }) => prisma.user.findMany({ where, select: teamMemberSelect, orderBy: [{ active: "desc" }, { name: "asc" }, { id: "asc" }], skip, take }));
}

export async function getTeamStats() {
  const [users, archetypes, participation] = await Promise.all([
    prisma.user.groupBy({ by: ["role", "active"], _count: { _all: true } }),
    prisma.user.count({ where: { archetypeId: { not: null } } }),
    prisma.$queryRaw<Array<{ people: number; assignments: number }>>`SELECT COUNT(DISTINCT "userId")::int AS "people", COUNT(*)::int AS "assignments" FROM "Assignment"`,
  ]);
  return {
    total: users.reduce((sum, group) => sum + group._count._all, 0),
    active: users.filter(group => group.active).reduce((sum, group) => sum + group._count._all, 0),
    owners: users.find(group => group.active && group.role === "OWNER")?._count._all ?? 0,
    archetypes, participants: participation[0].people, assignments: participation[0].assignments,
  };
}
