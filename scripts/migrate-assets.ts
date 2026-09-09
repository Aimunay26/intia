/** Simulación por defecto. --apply --actor=<OWNER> copia y verifica como máximo diez archivos por ejecución. */
import { prisma } from "../src/lib/prisma";
import { stagePrivateFile, attachPrivateFile, checksum } from "../src/lib/private-storage";
import { assertActor } from "../src/lib/auth-transactions";
import { auditInTransaction } from "../src/lib/audit";

const apply = process.argv.includes("--apply");
const actorId = process.argv.find(arg => arg.startsWith("--actor="))?.slice(8);
try {
  const summary = await prisma.asset.aggregate({ where: { blobId: null }, _count: true, _sum: { size: true } });
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", legacyFiles: summary._count, bytes: summary._sum.size ?? 0, batchLimit: 10 }));
  if (apply) {
    if (!actorId) throw new Error("Indica --actor=<id de un dueño activo> para auditar la migración.");
    const actor = await prisma.user.findUniqueOrThrow({ where: { id: actorId }, select: { id: true, name: true, email: true, role: true, active: true, sessionVersion: true, color: true, archetypeId: true } });
    if (!actor.active || actor.role !== "OWNER") throw new Error("La migración requiere un dueño activo.");
    const files = await prisma.asset.findMany({ where: { blobId: null }, select: { id: true }, orderBy: { id: "asc" }, take: 10 });
    for (const file of files) {
      const original = await prisma.asset.findUnique({ where: { id: file.id } });
      if (!original?.data || original.blobId) continue;
      const digest = checksum(original.data);
      const blobId = await stagePrivateFile(original.data);
      await prisma.$transaction(async tx => {
        await assertActor(tx, actor, true);
        await tx.$queryRaw`SELECT id FROM "Asset" WHERE id = ${file.id} FOR UPDATE`;
        const current = await tx.asset.findUnique({ where: { id: file.id } });
        if (!current?.data || current.blobId || checksum(current.data) !== digest) throw new Error("El archivo cambió durante la copia. Sus bytes originales se conservan.");
        await attachPrivateFile(tx, blobId);
        await tx.asset.update({ where: { id: file.id }, data: { blobId, data: null } });
        await auditInTransaction(tx, { user: actor, action: "EDITAR", entity: "Asset", entityId: file.id, summary: "Migró un adjunto a almacenamiento privado y verificó su integridad SHA-256" });
      });
      console.log(JSON.stringify({ migrated: file.id, verified: true }));
    }
  }
} finally { await prisma.$disconnect(); }
