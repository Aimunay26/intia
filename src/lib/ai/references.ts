import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const REFERENCE_BUDGET = { documents: 30, perDocument: 18000, characters: 80000 } as const;
/** Apply row/text limits in PostgreSQL, before returning documents to the worker. */
export async function loadGenerationReferences(structureId: string, archetypeId?: string | null, brandId?: string | null) {
  const { documents, perDocument, characters } = REFERENCE_BUDGET;
  const rows = await prisma.$queryRaw<{ id: string; updatedAt: Date; label: string; source: string; text: string; fullLength: number; total: number }[]>(Prisma.sql`
    WITH chosen AS (
      SELECT id, "updatedAt", left(COALESCE(NULLIF(trim(label),''),filename),200) AS label,
        CASE "ownerType" WHEN 'structure' THEN 'Estructura' WHEN 'archetype' THEN 'Arquetipo' ELSE 'Marca' END AS source,
        "extractedText", length("extractedText") AS "fullLength", "createdAt",
        CASE "ownerType" WHEN 'structure' THEN 0 WHEN 'archetype' THEN 1 ELSE 2 END AS priority,
        count(*) OVER()::int AS total
      FROM "Asset" WHERE "useForAi" AND length(trim("extractedText"))>0 AND
        (("ownerType"='structure' AND "ownerId"=${structureId}) OR
         ("ownerType"='archetype' AND "ownerId"=${archetypeId ?? ""}) OR
         ("ownerType"='brand' AND "ownerId"=${brandId ?? ""}))
      ORDER BY priority, "createdAt", id LIMIT ${documents}
    ), budget AS (
      SELECT *, COALESCE(SUM(LEAST("fullLength",${perDocument})) OVER(ORDER BY priority,"createdAt",id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0)::int AS used FROM chosen
    ) SELECT id, "updatedAt", label, source, "fullLength", total,
      left("extractedText",LEAST(${perDocument},${characters}-used)::int) AS text
      FROM budget WHERE used<${characters} ORDER BY priority,"createdAt",id`);
  return rows.map(r => ({ ...r, truncated: r.text.length < r.fullLength }));
}
