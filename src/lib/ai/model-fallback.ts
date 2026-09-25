import { nextOverloadModel } from "@/lib/ai-models";

const sources = ["request", "structure", "settings", "catalog"] as const;
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Solo se recuperan descensos válidos del mismo proveedor, nunca un modelo arbitrario. */
export function readModelFallback(diagnostics: unknown) {
  const data = record(diagnostics);
  if (data.provider !== "google") return;
  const fallback = record(data.modelFallback);
  const originalSource = sources.find(source => source === fallback.originalSource);
  const models = fallback.models;
  if (!originalSource || !Array.isArray(models) || models.length < 2 || models.length > 3) return;
  if (!models.every((model, i) => typeof model === "string" && model.length < 80
    && (i === 0 || nextOverloadModel("google", models[i - 1]) === model))) return;
  return { originalSource, models: models.slice() as string[] };
}

/** El último destino persiste incluso si el siguiente intento falla por otro motivo. */
export function modelForRetry(provider: string, diagnostics: unknown): string | undefined {
  if (provider !== "google") return;
  return readModelFallback(diagnostics)?.models.at(-1);
}

export function retryDiagnostics(current: Record<string, unknown>, previous: unknown): Record<string, unknown> {
  const fallback = readModelFallback(previous);
  return fallback && current.provider === "google" && current.model === fallback.models.at(-1)
    ? { ...current, modelSource: "fallback", modelFallback: fallback }
    : current;
}

/** Se guarda junto con QUEUED bajo la misma concesión; no cambia el pedido original. */
export function planModelFallback(diagnostics: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!diagnostics || diagnostics.provider !== "google" || typeof diagnostics.model !== "string") return;
  const next = nextOverloadModel("google", diagnostics.model);
  if (!next) return;
  const previous = readModelFallback(diagnostics);
  if (previous && previous.models.at(-1) !== diagnostics.model) return;
  const modelFallback = readModelFallback({
    ...diagnostics,
    modelFallback: {
      originalSource: previous?.originalSource ?? diagnostics.modelSource,
      models: [...(previous?.models ?? [diagnostics.model]), next],
    },
  });
  return modelFallback ? { ...diagnostics, modelFallback } : undefined;
}
