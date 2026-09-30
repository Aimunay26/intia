import type { AppTransaction } from "@/lib/prisma";

/**
 * Registro del archivo total (M0) visto desde la app: `intia_ops.archive_*`, que instala
 * prisma/operations/archive-registry.sql y escribe scripts/archivo-total.ts.
 *
 * La app solo hace una cosa con él: cuando el Dueño usa «Reactivar» en /marcas sobre una marca que
 * el lote APPLIED mantiene archivada, deja registrada esa restauración en la misma transacción, igual
 * que `--restore-marca`: YA_ESTABA si la marca volvió a su estado anterior exacto, RESPETADA si no.
 * Sin esto, la entrada quedaría ARCHIVED sin restaurar: `--verificar` daría A1/A2 > 0 para siempre y
 * M1 trataría como archivada una marca viva (sin dar el rol de dueño a quien la creó).
 *
 * No concede dueño (eso es de `--restore --dueno`, con M1), no borra ni reescribe nada: el trigger del
 * registro solo admite marcar la restauración de una entrada una vez. Sin registro instalado (local o
 * pruebas) o sin privilegios sobre `intia_ops`, no hace nada y no falla.
 */

type Tx = Pick<AppTransaction, "$queryRaw" | "$executeRaw">;
type BrandState = { archived: boolean; active: boolean };

/** ¿Existe el registro y esta conexión puede leer el lote y marcar entradas? Sin errores si no existe. */
async function registryWritable(tx: Tx): Promise<boolean> {
  const [row] = await tx.$queryRaw<{ ok: boolean }[]>`SELECT has_schema_privilege(n.oid, 'USAGE')
      AND has_table_privilege(l.oid, 'SELECT') AND has_table_privilege(e.oid, 'SELECT') AND has_table_privilege(e.oid, 'UPDATE') AS ok
    FROM pg_namespace n
    JOIN pg_class l ON l.relnamespace = n.oid AND l.relname = 'archive_batch'
    JOIN pg_class e ON e.relnamespace = n.oid AND e.relname = 'archive_entry'
    WHERE n.nspname = 'intia_ops'`;
  return Boolean(row?.ok);
}

/**
 * Registra que una marca del lote APPLIED se reactivó a mano. Devuelve el lote afectado, o null si la
 * marca no tenía entrada pendiente (o no hay registro). Llamar después de actualizar la marca, dentro
 * de la misma transacción.
 */
export async function registerManualBrandRestore(tx: Tx, brandId: string, now: BrandState): Promise<string | null> {
  if (!(await registryWritable(tx))) return null;
  const [entry] = await tx.$queryRaw<{ batch_id: string; prev_archived: boolean; prev_active: boolean }[]>`
    SELECT x.batch_id, x.prev_archived, x.prev_active FROM intia_ops.archive_entry x
    JOIN intia_ops.archive_batch l ON l.id = x.batch_id
    WHERE l.status = 'APPLIED' AND x.entity = 'Brand' AND x.entity_id = ${brandId} AND x.restored_at IS NULL
    FOR UPDATE OF x`;
  if (!entry) return null;
  const result = entry.prev_archived === now.archived && entry.prev_active === now.active ? "YA_ESTABA" : "RESPETADA";
  await tx.$executeRaw`UPDATE intia_ops.archive_entry SET restored_at = (clock_timestamp() AT TIME ZONE 'UTC'), restore_result = ${result}
    WHERE batch_id = ${entry.batch_id} AND entity = 'Brand' AND entity_id = ${brandId} AND restored_at IS NULL`;
  return entry.batch_id;
}
