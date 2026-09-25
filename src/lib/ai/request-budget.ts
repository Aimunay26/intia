import { prisma, type AppTransaction } from "@/lib/prisma";
import { assertActor } from "@/lib/auth-transactions";
import type { SessionUser } from "@/lib/auth";
import { recordUsage, usageDay } from "@/lib/resource-limits";
import { generationStage } from "@/lib/generation-trace";

export type RequestOptions = { timeoutMs: number; signal: AbortSignal };
export type AiRequest = <T>(work: (options: RequestOptions) => Promise<T>) => Promise<T>;

/** Error local, no reintentable: no confundir con un 429 del proveedor. */
export class AiBudgetError extends Error {
  readonly retryable = false;
  constructor(message: string, readonly code: "server" | "timeout" = "server") { super(message); this.name = "AiBudgetError"; }
}

/** Autoriza y registra cada petición; las peticiones de una operación comparten plazo. */
export function createAiRequest(input: {
  user: SessionUser;
  deadlineAt: number;
  authorize?: (tx: AppTransaction, requestIndex: number) => Promise<void>;
}): AiRequest {
  let index = 0;
  return async work => {
    if (process.env.AI_JOBS_ENABLED !== "true") throw new AiBudgetError("Las llamadas de IA están deshabilitadas. Se conserva la lectura local.");
    if (input.deadlineAt - Date.now() < 1000) throw new AiBudgetError("Se agotó el tiempo total de esta operación de IA.", "timeout");
    const requestIndex = ++index;
    await generationStage("request_access", () => prisma.$transaction(async tx => {
      await assertActor(tx, input.user);
      const day = usageDay();
      await input.authorize?.(tx, requestIndex);
      await recordUsage(tx, `ai:calls:${day}`);
      await recordUsage(tx, `ai:user:${input.user.id}:${day}`);
    }), { requestIndex });
    const timeoutMs = input.deadlineAt - Date.now();
    if (timeoutMs < 1) throw new AiBudgetError("Se agotó el tiempo de esta operación antes de enviar la petición.", "timeout");
    return work({ timeoutMs, signal: AbortSignal.timeout(timeoutMs) });
  };
}
