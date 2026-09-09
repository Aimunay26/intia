import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
try {
  const [counts] = await db.$queryRaw`
    SELECT
      (SELECT COUNT(*)::int FROM "Script" s WHERE s."archetypeId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Archetype" a WHERE a.id=s."archetypeId")) AS "missingArchetypes",
      (SELECT COUNT(*)::int FROM "CalendarEvent" e WHERE e."contentItemId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "ContentItem" c WHERE c.id=e."contentItemId")) AS "missingVideos",
      (SELECT COUNT(*)::int FROM "ContentItem" c JOIN "Script" s ON s.id=c."scriptId" WHERE (s."brandId" IS NOT NULL AND s."brandId"<>c."brandId") OR s."structureId" IS DISTINCT FROM c."structureId") AS "inconsistentLinks",
      (SELECT COUNT(*)::int FROM "Asset" a WHERE NOT (
        (a."ownerType"='brand' AND EXISTS(SELECT 1 FROM "Brand" b WHERE b.id=a."ownerId")) OR
        (a."ownerType"='content' AND EXISTS(SELECT 1 FROM "ContentItem" c WHERE c.id=a."ownerId")) OR
        (a."ownerType"='structure' AND EXISTS(SELECT 1 FROM "Structure" s WHERE s.id=a."ownerId")) OR
        (a."ownerType"='archetype' AND EXISTS(SELECT 1 FROM "Archetype" p WHERE p.id=a."ownerId")) OR
        (a."ownerType"='user' AND EXISTS(SELECT 1 FROM "User" u WHERE u.id=a."ownerId"))
      )) AS "orphanAssets"`;
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), ...counts }, null, 2));
  if (Object.values(counts).some(value => value > 0)) process.exitCode = 1;
} finally { await db.$disconnect(); }
