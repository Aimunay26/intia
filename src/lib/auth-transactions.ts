import type { AppTransaction } from "@/lib/prisma";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";

export const BOOTSTRAP_COMPLETE = "security.bootstrap.complete";
export class SecurityError extends Error {}

// La misma exclusión cubre alta, roles, bajas y emisión de sesiones; nunca bcrypt/red dentro.
export async function withAuthLock<T>(work: (tx: AppTransaction) => Promise<T>) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(781240109)`;
    return work(tx);
  }, { maxWait: 10_000, timeout: 15_000 });
}

export async function assertActor(tx: AppTransaction, actor: SessionUser, owner = false) {
  const [current] = await tx.$queryRaw<{ active: boolean; role: string; sessionVersion: number }[]>`SELECT "active", "role", "sessionVersion" FROM "User" WHERE "id" = ${actor.id} FOR SHARE`;
  if (!current?.active || (owner && current.role !== "OWNER") || current.sessionVersion !== (actor.sessionVersion ?? 0)) {
    throw new SecurityError("Tu acceso cambió. Vuelve a iniciar sesión antes de continuar.");
  }
}

export async function preserveOwner(tx: AppTransaction, id: string) {
  const current = await tx.user.findUniqueOrThrow({ where: { id }, select: { role: true, active: true } });
  if (current.role === "OWNER" && current.active && await tx.user.count({ where: { role: "OWNER", active: true } }) <= 1) {
    throw new SecurityError("Es el único dueño activo. Nombra a otro dueño antes de continuar.");
  }
}
