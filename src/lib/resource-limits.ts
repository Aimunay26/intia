import type { AppTransaction } from "@/lib/prisma";

/** Los límites configurables sólo pueden bajar el techo conservador de esta instalación. */
export function resourceLimit(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Configuración inválida: ${name}`);
  return Math.min(value, fallback);
}

export function usageDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Serializa reservas, incluyendo llamadas fallidas; nunca devuelve cupo tras un resultado incierto. */
export async function reserveUsage(tx: AppTransaction, key: string, amount: number, limit: number) {
  if (!Number.isSafeInteger(amount) || amount < 1 || !Number.isSafeInteger(limit) || limit < 0) throw new Error("Reserva de cupo inválida.");
  const value = BigInt(amount);
  await tx.usageCounter.upsert({ where: { key }, create: { key, amount: 0 }, update: {} });
  const result = await tx.usageCounter.updateMany({ where: { key, amount: { lte: BigInt(limit) - value } }, data: { amount: { increment: value } } });
  if (!result.count) throw new Error("Se alcanzó el cupo de uso configurado. Intenta en el siguiente período.");
}
