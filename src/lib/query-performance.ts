import { renderRequestId } from "@/lib/performance-context";
import { AsyncLocalStorage } from "node:async_hooks";

export type QueryTrace = { requestId: string; phase: string; operations: number; queryMs: number };
export const queryTrace = new AsyncLocalStorage<QueryTrace>();

/** Tamaño aproximado, con recorrido acotado. Nunca devuelve ni registra valores. */
export function resultSize(value: unknown) {
  let nodes = 0;
  let sampled = false;
  function size(item: unknown): number {
    if (++nodes > 500) { sampled = true; return 0; }
    if (item == null) return 4;
    if (typeof item === "string") return Buffer.byteLength(item) + 2;
    if (typeof item === "number" || typeof item === "bigint") return String(item).length;
    if (typeof item === "boolean") return item ? 4 : 5;
    if (item instanceof Date) return 26;
    if (ArrayBuffer.isView(item)) return item.byteLength;
    if (Array.isArray(item)) {
      if (item.length > 50) sampled = true;
      return 2 + item.slice(0, 50).reduce((sum, row) => sum + size(row) + 1, 0);
    }
    if (typeof item === "object") {
      return Object.entries(item).reduce((sum, [key, row]) => sum + Buffer.byteLength(key) + size(row) + 4, 2);
    }
    return 0;
  }
  const bytesApprox = size(value);
  return { rows: Array.isArray(value) ? value.length : value == null ? 0 : 1, bytesApprox, sampled };
}

export async function measureQuery<T>(model: string | undefined, operation: string, work: () => PromiseLike<T>): Promise<T> {
  if (process.env.PERFORMANCE_LOGS !== "1") return await work();
  const trace = queryTrace.getStore();
  const started = performance.now();
  let ok = false;
  let finished: number | undefined;
  let size: ReturnType<typeof resultSize> | undefined;
  try {
    const result = await work();
    finished = performance.now();
    ok = true;
    size = resultSize(result);
    return result;
  } finally {
    const durationMs = Math.round(((finished ?? performance.now()) - started) * 100) / 100;
    if (trace) { trace.operations++; trace.queryMs += durationMs; }
    console.info("[performance]", JSON.stringify({
      kind: "query", requestId: trace?.requestId ?? renderRequestId(), phase: trace?.phase ?? "unscoped",
      model: model ?? "raw", operation, durationMs, ok, result: size,
      environment: process.env.VERCEL_ENV ?? process.env.PERFORMANCE_ENVIRONMENT ?? "local",
      release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? process.env.PERFORMANCE_RELEASE ?? "local", region: process.env.VERCEL_REGION,
    }));
  }
}
