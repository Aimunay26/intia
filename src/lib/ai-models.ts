import { AI_MODELS, DEFAULT_MODEL } from "@/lib/constants";

/** Compatibilidad con configuraciones y trabajos anteriores, sin reescribir el historial. */
export function normalizeAiModel(provider: string, value?: string | null): string {
  const model = value?.trim().replace(/^models\//, "") ?? "";
  if (provider === "google" && ["gemini-2.5-pro", "gemini-2.5-flash"].includes(model)) return DEFAULT_MODEL.google;
  return model;
}

/** Una elección explícita inválida falla antes de gastar; los valores heredados se filtran por proveedor. */
export function resolveAiModel(provider: string, requested?: string | null, ...defaults: (string | null | undefined)[]): string {
  const models = AI_MODELS[provider];
  if (!models) throw new Error("Ese proveedor de IA no existe.");
  const supported = (model: string) => models.some(item => item.value === model);
  const explicit = normalizeAiModel(provider, requested);
  if (explicit) {
    if (!supported(explicit)) throw new Error("El modelo no está disponible para ese proveedor. Elige uno del catálogo.");
    return explicit;
  }
  for (const value of defaults) {
    const model = normalizeAiModel(provider, value);
    if (supported(model)) return model;
  }
  return DEFAULT_MODEL[provider];
}
