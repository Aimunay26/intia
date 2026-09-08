import { randomUUID } from "node:crypto";
import { cache } from "react";
import { queryTrace } from "@/lib/query-performance";

const renderId = cache(() => randomUUID());

/** Activar con PERFORMANCE_LOGS=1. No registra parámetros, datos ni credenciales. */
export async function measurePhase<T>(phase: string, work: () => PromiseLike<T>): Promise<T> {
  if (process.env.PERFORMANCE_LOGS !== "1") return await work();
  const requestId = queryTrace.getStore()?.requestId ?? renderId();
  const trace = { requestId, phase, operations: 0, queryMs: 0 };
  const start = performance.now();
  let ok = false;
  try {
    const result = await queryTrace.run(trace, work);
    ok = true;
    return result;
  } finally {
    console.info("[performance]", JSON.stringify({
      kind: "phase", requestId, phase, durationMs: Math.round(performance.now() - start), ok,
      operations: trace.operations, queryMs: Math.round(trace.queryMs),
      release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12), region: process.env.VERCEL_REGION,
    }));
  }
}
