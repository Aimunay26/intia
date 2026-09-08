import { createHash } from "node:crypto";
import { unstable_cache, revalidateTag } from "next/cache";

export type CatalogScope = { namespace: string; database: string; userId: string; role: string; session: string; brandId: string | null };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export function catalogIdentity(scope: CatalogScope, includeInactive: boolean) {
  if (!scope.namespace || !scope.database || !scope.userId || !scope.role || !scope.session) throw new Error("Falta el alcance autorizado de la caché.");
  return {
    key: ["structure-choices-v1", hash(JSON.stringify([scope.namespace, scope.database, scope.userId, scope.role, scope.session, scope.brandId, includeInactive]))],
    tag: `structure-choices:${hash(JSON.stringify([scope.namespace, scope.database]))}`,
  };
}

/** Solo nombres/ids de estructuras. Autorización y cookies se resuelven fuera de esta función. */
export async function readCachedCatalog<T>(scope: CatalogScope, includeInactive: boolean, load: () => Promise<T>, now = Date.now) {
  const { key, tag } = catalogIdentity(scope, includeInactive);
  const entry = await unstable_cache(async () => ({ writtenAt: now(), value: await load() }), key, { tags: [tag], revalidate: 30 })();
  // Next puede devolver una entrada antigua mientras revalida. No se sirve fuera de la antigüedad acordada.
  if (now() - entry.writtenAt >= 30_000 || entry.writtenAt > now()) return load();
  return entry.value;
}

export function invalidateStructureCatalog() {
  const namespace = process.env.CATALOG_CACHE_NAMESPACE;
  const database = process.env.DATABASE_URL;
  if (!namespace || !database) return;
  revalidateTag(`structure-choices:${hash(JSON.stringify([namespace, database]))}`);
}
