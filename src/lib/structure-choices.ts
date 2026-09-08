import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requirePageUser, getPageBrandContext } from "@/lib/render-context";
import { SESSION_COOKIE } from "@/lib/auth";
import { readCachedCatalog } from "@/lib/catalog-cache";

/** Ámbito actual: una organización por instalación. No habilita multitenancy. */
export const getStructureChoices = cache(async (includeInactive = false) => {
  const user = await requirePageUser();
  const load = () => prisma.structure.findMany({
    ...(includeInactive ? {} : { where: { active: true } }), select: { id: true, name: true }, orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  const namespace = process.env.CATALOG_CACHE_NAMESPACE;
  const database = process.env.DATABASE_URL;
  if (process.env.CATALOG_CACHE_ENABLED !== "1" || !namespace || !database) return load();
  const [jar, brand] = await Promise.all([cookies(), getPageBrandContext()]);
  const session = jar.get(SESSION_COOKIE)?.value;
  if (!session) return load();
  return readCachedCatalog({ namespace, database, userId: user.id, role: user.role, session, brandId: brand.activeId }, includeInactive, load);
});
