import type { AppTransaction } from "@/lib/prisma";
import { prisma } from "@/lib/prisma";

/**
 * Limpieza de archivos huérfanos.
 *
 * `Asset` es polimórfico (`ownerType` + `ownerId`), y por eso NO tiene relación
 * en el esquema de Prisma. Las acciones limpian dentro de su transacción y los
 * triggers de la migración semanal protegen también borrados por FK y SQL.
 * Para revisar huérfanos históricos con conteos SQL, usar `npm run db:integridad`.
 *
 * Se llama desde TODOS los borrados de entidades que pueden tener documentos:
 * marca, estructura, arquetipo, usuario y video.
 */
export async function borrarAssetsDe(ownerType: string, ownerId: string, db: AppTransaction = prisma) {
  const { count } = await db.asset.deleteMany({ where: { ownerType, ownerId } });
  return count;
}

/**
 * Barrido de mantenimiento: encuentra los archivos cuya entidad dueña ya no
 * existe. Sirve para limpiar lo que quedó de antes de que existiera esta
 * limpieza, y para comprobar que no se escapa nada.
 */
export async function contarAssetsHuerfanos() {
  const assets = await prisma.asset.findMany({
    select: { id: true, ownerType: true, ownerId: true, size: true },
  });

  const porTipo = new Map<string, Set<string>>();
  for (const a of assets) {
    const set = porTipo.get(a.ownerType) ?? new Set<string>();
    set.add(a.ownerId);
    porTipo.set(a.ownerType, set);
  }

  const vivos = new Set<string>();
  for (const [tipo, ids] of porTipo) {
    const lista = [...ids];
    const encontrados =
      tipo === "brand"
        ? await prisma.brand.findMany({ where: { id: { in: lista } }, select: { id: true } })
        : tipo === "structure"
          ? await prisma.structure.findMany({ where: { id: { in: lista } }, select: { id: true } })
          : tipo === "archetype"
            ? await prisma.archetype.findMany({ where: { id: { in: lista } }, select: { id: true } })
            : tipo === "user"
              ? await prisma.user.findMany({ where: { id: { in: lista } }, select: { id: true } })
              : tipo === "content"
                ? await prisma.contentItem.findMany({
                    where: { id: { in: lista } },
                    select: { id: true },
                  })
                : [];
    for (const e of encontrados) vivos.add(`${tipo}:${e.id}`);
  }

  const huerfanos = assets.filter((a) => !vivos.has(`${a.ownerType}:${a.ownerId}`));
  return {
    total: huerfanos.length,
    bytes: huerfanos.reduce((sum, a) => sum + a.size, 0),
    ids: huerfanos.map((a) => a.id),
  };
}
