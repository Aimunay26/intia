import { prisma, type AppTransaction } from "@/lib/prisma";
import { assertActor } from "@/lib/auth-transactions";
import type { SessionUser } from "@/lib/auth";
import { reserveUsage, resourceLimit, usageDay } from "@/lib/resource-limits";
import { generationStage } from "@/lib/generation-trace";

export type RequestOptions = { timeoutMs: number; signal: AbortSignal };
export type AiRequest = <T>(work: (options: RequestOptions) => Promise<T>) => Promise<T>;

/** Error local, no reintentable: no confundir con un 429 del proveedor. */
export class AiBudgetError extends Error {
  readonly retryable = false;
  constructor(message: string) { super(message); this.name = "AiBudgetError"; }
}

/** Un presupuesto por operación, una reserva por petición efectiva, sin devolver cupo incierto. */
export function createAiRequest(input: {
  user: SessionUser;
  deadlineAt: number;
  authorize?: (tx: AppTransaction, requestIndex: number) => Promise<void>;
}): AiRequest {
  let index = 0;
  return async work => {
    if (process.env.AI_JOBS_ENABLED !== "true") throw new AiBudgetError("Las llamadas de IA están deshabilitadas. Se conserva la lectura local.");
    if (input.deadlineAt - Date.now() < 1000) throw new AiBudgetError("Se agotó el tiempo total de esta operación de IA.");
    const requestIndex = ++index;
    await generationStage("quota", () => prisma.$transaction(async tx => {
      await assertActor(tx, input.user);
      const day = usageDay();
      try {
        await input.authorize?.(tx, requestIndex);
        await reserveUsage(tx, `ai:calls:${day}`, 1, resourceLimit("AI_DAILY_CALLS", 20));
        await reserveUsage(tx, `ai:user:${input.user.id}:${day}`, 1, resourceLimit("AI_USER_DAILY_CALLS", 5));
      } catch (error) {
        if (error instanceof Error && /cupo de uso configurado/.test(error.message)) throw new AiBudgetError("Se alcanzó el cupo de IA configurado. No se envió otra petición; intenta en el siguiente período.");
        throw error;
      }
    }), { requestIndex });
    const timeoutMs = input.deadlineAt - Date.now();
    if (timeoutMs < 1) throw new AiBudgetError("Se agotó el tiempo de esta operación antes de enviar la petición.");
    return work({ timeoutMs, signal: AbortSignal.timeout(timeoutMs) });
  };
}
