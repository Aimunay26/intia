import { randomUUID } from "node:crypto";
import { cache } from "react";

const renderId = cache(() => randomUUID());

/** Activar con PERFORMANCE_LOGS=1. No registra parámetros, datos ni credenciales. */
export async function measurePhase<T>(phase: string, work: () => PromiseLike<T>): Promise<T> {
  if (process.env.PERFORMANCE_LOGS !== "1") return await work();
  const requestId = renderId();
  const start = performance.now();
  let ok = false;
  try {
    const result = await work();
    ok = true;
    return result;
  } finally {
    console.info("[performance]", JSON.stringify({ requestId, phase, durationMs: Math.round(performance.now() - start), ok }));
  }
}
