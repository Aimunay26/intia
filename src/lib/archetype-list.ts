import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadPage } from "@/lib/list-pagination";

/** La búsqueda conserva la normalización NFD del buscador original, también en SQL. */
export function archetypeSearch(value?: string) {
  const q = value?.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (!q) return Prisma.empty;
  return Prisma.sql`WHERE POSITION(${q} IN regexp_replace(normalize(lower(concat_ws(' ',
    a."name", COALESCE(a."summary",''), COALESCE(a."personality",''), COALESCE(a."ageRange",''), a."strengths",
    COALESCE(a."archetypePrimary",''), COALESCE(a."archetypeSecondary",''), COALESCE(a."archetypeTertiary",''),
    COALESCE(a."voiceTone",''), COALESCE(a."soundsLike",''), a."vocabulary"
  )), NFD), '[̀-ͯ]', '', 'g')) > 0`;
}

export async function getArchetypeList(q?: string, requestedPage?: string) {
  const where = archetypeSearch(q);
  const [page, [stats]] = await Promise.all([
    loadPage(requestedPage, 36,
      async () => (await prisma.$queryRaw<Array<{ total: number }>>(Prisma.sql`SELECT COUNT(*)::int AS "total" FROM "Archetype" a ${where}`))[0].total,
      async ({ skip, take }) => {
        const ids = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT a."id" FROM "Archetype" a ${where} ORDER BY a."isPerson" DESC, a."active" DESC, a."name" ASC, a."id" ASC LIMIT ${take} OFFSET ${skip}`);
        if (!ids.length) return [];
        return prisma.archetype.findMany({
          where: { id: { in: ids.map(row => row.id) } },
          orderBy: [{ isPerson: "desc" }, { active: "desc" }, { name: "asc" }, { id: "asc" }],
          select: {
            id: true, name: true, color: true, active: true, isPerson: true, photoUrl: true,
            archetypePrimary: true, archetypeSecondary: true, archetypeTertiary: true, ageRange: true,
            energyLevel: true, coherenceIndex: true, soundsLike: true, summary: true, strengths: true, voiceTone: true,
            fits: { where: { score: 3 }, select: { id: true } }, _count: { select: { users: true, fits: true } },
          },
        });
      }),
    prisma.$queryRaw<Array<{ people: number; voices: number }>>(Prisma.sql`SELECT COUNT(*) FILTER (WHERE a."isPerson")::int AS "people", COUNT(*) FILTER (WHERE a."isPerson" AND COALESCE(a."voiceTone",'') <> '')::int AS "voices" FROM "Archetype" a ${where}`),
  ]);
  return { ...page, stats };
}
