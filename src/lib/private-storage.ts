import { createHash, randomUUID } from "node:crypto";
import { put, get, del } from "@vercel/blob";
import { prisma, type AppTransaction } from "@/lib/prisma";
import { resourceLimit, usageDay } from "@/lib/resource-limits";

export function privateStorageEnabled() { return process.env.BLOB_PRIVATE_ENABLED === "true"; }
function configured() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("El almacenamiento privado aún no está configurado.");
  // SDK 2.8.0: cada petición reservada debe producir un único intento HTTP.
  process.env.VERCEL_BLOB_RETRIES = "0";
}
export const checksum = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** Ventana conservadora de 32 días, independiente del día de facturación de Vercel. */
async function reserveBlobUsage(tx: AppTransaction, kind: "advanced" | "simple" | "transfer", amount: number) {
  const max = kind === "advanced" ? resourceLimit("BLOB_ADVANCED_LIMIT", 1500) : kind === "simple" ? resourceLimit("BLOB_SIMPLE_LIMIT", 8000) : resourceLimit("BLOB_TRANSFER_LIMIT", 8_000_000_000);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(781240120)`;
  const prefix = `blob:${kind}:`;
  const since = usageDay(new Date(Date.now() - 31 * 86400000));
  const total = await tx.usageCounter.aggregate({ where: { key: { startsWith: prefix, gte: prefix + since } }, _sum: { amount: true } });
  if ((total._sum.amount ?? 0n) + BigInt(amount) > BigInt(max)) throw new Error("Se alcanzó el cupo gratuito reservado para archivos. Intenta más adelante.");
  const key = prefix + usageDay();
  await tx.usageCounter.upsert({ where: { key }, create: { key, amount }, update: { amount: { increment: amount } } });
}

/** Primero inventario durable, después red. Un fallo conserva el objeto para limpieza recuperable. */
export async function stagePrivateFile(bytes: Uint8Array) {
  configured();
  if (!privateStorageEnabled()) throw new Error("El almacenamiento privado no está habilitado.");
  const id = randomUUID(), pathname = `intia/assets/${id}`, sha256 = checksum(bytes);
  await prisma.$transaction(async tx => {
    await reserveBlobUsage(tx, "advanced", 1);
    const used = await tx.blobObject.aggregate({ where: { state: { not: "DELETED" } }, _sum: { size: true } });
    if ((used._sum.size ?? 0) + bytes.byteLength > resourceLimit("BLOB_STORAGE_LIMIT", 800_000_000)) throw new Error("El almacenamiento alcanzó su cupo reservado de 800 MB.");
    await tx.blobObject.create({ data: { id, pathname, sha256, size: bytes.byteLength } });
  });
  try {
    await put(pathname, Buffer.from(bytes), { access: "private", addRandomSuffix: false, allowOverwrite: false, contentType: "application/octet-stream", abortSignal: AbortSignal.timeout(60000) });
    const result = await readPrivateFile(pathname, bytes.byteLength);
    const verified = new Uint8Array(await new Response(result).arrayBuffer());
    if (verified.byteLength !== bytes.byteLength || checksum(verified) !== sha256) throw new Error("No se pudo verificar el archivo almacenado.");
    return id;
  } catch {
    await prisma.blobObject.updateMany({ where: { id, state: "STAGING" }, data: { state: "DELETE_PENDING" } });
    throw new Error("No se pudo guardar y verificar el archivo privado. El documento original se conserva.");
  }
}

export async function attachPrivateFile(tx: AppTransaction, blobId: string) {
  const result = await tx.blobObject.updateMany({ where: { id: blobId, state: "STAGING" }, data: { state: "ATTACHED" } });
  if (!result.count) throw new Error("El archivo temporal expiró. Vuelve a subirlo.");
}

/** Sólo admite rutas propias de inventario. El llamador autoriza el Asset antes de llegar aquí. */
export async function readPrivateFile(pathname: string, size: number) {
  configured();
  if (!/^intia\/assets\/[0-9a-f-]{36}$/.test(pathname)) throw new Error("Ruta de archivo inválida.");
  await prisma.$transaction(async tx => {
    await reserveBlobUsage(tx, "simple", 1);
    await reserveBlobUsage(tx, "transfer", size);
  });
  const result = await get(pathname, { access: "private", useCache: false, abortSignal: AbortSignal.timeout(30000) });
  if (!result || result.statusCode !== 200 || result.blob.size !== size) throw new Error("Archivo privado no disponible.");
  return result.stream;
}

export async function cleanupPrivateFiles(limit = 20) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return { deleted: 0, failed: 0 };
  configured();
  let deleted = 0, failed = 0;
  for (let n = 0; n < Math.min(20, limit); n++) {
    const item = await prisma.$transaction(async tx => {
      const [row] = await tx.$queryRaw<{ id: string; pathname: string; attempts: number }[]>`
        SELECT b."id", b."pathname", b."attempts" FROM "BlobObject" b
        WHERE b."nextAttemptAt" <= NOW() AND
          (b.state = 'DELETE_PENDING' OR (b.state = 'STAGING' AND b."createdAt" < NOW() - INTERVAL '24 hours'))
          AND NOT EXISTS (SELECT 1 FROM "Asset" a WHERE a."blobId" = b.id)
        ORDER BY b."nextAttemptAt", b.id LIMIT 1 FOR UPDATE SKIP LOCKED`;
      if (!row) return null;
      await tx.blobObject.update({ where: { id: row.id }, data: { state: "DELETE_PENDING", attempts: { increment: 1 }, nextAttemptAt: new Date(Date.now() + 300000) } });
      return row;
    });
    if (!item) break;
    try {
      if (!/^intia\/assets\/[0-9a-f-]{36}$/.test(item.pathname)) throw new Error("Ruta inválida");
      await del(item.pathname, { abortSignal: AbortSignal.timeout(5000) });
      await prisma.blobObject.update({ where: { id: item.id }, data: { state: "DELETED" } });
      deleted++;
    } catch {
      await prisma.blobObject.update({ where: { id: item.id }, data: { nextAttemptAt: new Date(Date.now() + Math.min(86400000, 300000 * 2 ** Math.min(item.attempts, 8))) } });
      failed++;
    }
  }
  return { deleted, failed };
}
