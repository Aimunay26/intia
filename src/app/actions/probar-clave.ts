"use server";

import { SecretConfigError } from "@/lib/secret-crypto";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";

import { requirePermission } from "@/lib/auth";
import { resolveAiModel } from "@/lib/ai-models";
import { describeKeySource, resolveApiKey, type KeySource } from "@/lib/settings";
import { toAiError, type AiErrorCode, type AiProviderId } from "@/lib/ai/providers";
import { createAiRequest } from "@/lib/ai/request-budget";
import { generationStage, withGenerationTrace } from "@/lib/generation-trace";

export type TestKeyResult = {
  ok: boolean;
  mensaje?: string;
  error?: string;
  /** Qué falló, con el mismo criterio que el generador. */
  code?: AiErrorCode;
  /** De dónde salió la clave probada: la escrita en el formulario, la guardada en Ajustes o la variable de entorno. */
  origen?: KeySource | "input" | null;
  latenciaMs?: number;
};

/**
 * Modelo fijo y barato para probar Claude. Nunca el modelo guardado en Ajustes:
 * probar una clave con Opus 5 cuesta más y, si ese modelo estuviera mal
 * elegido, la prueba fallaría con una clave buena.
 */
const MODELO_DE_PRUEBA_CLAUDE = "claude-haiku-4-5";

function esProveedor(value: string): value is AiProviderId {
  return value === "anthropic" || value === "google";
}

/**
 * Prueba en vivo una clave de API llamando al proveedor real.
 * No guarda la clave. La petición mínima de Claude registra una unidad de cupo.
 *
 * - Con `apiKey` escrita: prueba esa clave (aún sin guardar).
 * - Sin `apiKey`: prueba la clave EN USO (la guardada en Ajustes o, si no hay,
 *   la variable de entorno del servidor) y dice de dónde salió.
 *
 * Claude recibe una petición mínima (1 token), así que además confirma el
 * saldo. Gemini solo consulta los metadatos del modelo elegido en el catálogo:
 * no gasta tokens y no certifica la cuota de generación, que se comprueba al
 * generar. Como revela el estado de la clave del servidor, es cosa del dueño
 * (capacidad `admin.settings`).
 */
export async function probarClaveIA(params: {
  provider: "anthropic" | "google" | string;
  apiKey?: string;
  /** Modelo de Gemini a consultar; vacío = el predeterminado del catálogo. */
  model?: string;
}): Promise<TestKeyResult> {
  const user = await requirePermission("admin.settings");

  if (!esProveedor(params.provider)) {
    return { ok: false, error: `Proveedor desconocido: ${params.provider}` };
  }
  const provider = params.provider;
  const nombre = provider === "anthropic" ? "Claude" : "Gemini";
  const escrita = (params.apiKey ?? "").trim();

  let key: string;
  let origen: KeySource | "input";
  if (escrita) {
    key = escrita;
    origen = "input";
  } else {
    let efectiva;
    try { efectiva = await resolveApiKey(provider); } catch (error) {
      if (error instanceof SecretConfigError) return { ok: false, code: "server", error: error.message };
      throw error;
    }
    if (!efectiva.key || !efectiva.source) {
      return {
        ok: false,
        code: "auth",
        origen: null,
        error: `No hay ninguna clave de ${nombre} en uso: ni guardada en Ajustes ni en la variable de entorno del servidor. Pega una arriba para probarla.`,
      };
    }
    key = efectiva.key;
    origen = efectiva.source;
  }

  let modelo: string;
  if (provider === "anthropic") {
    modelo = MODELO_DE_PRUEBA_CLAUDE;
  } else {
    try {
      modelo = resolveAiModel("google", params.model);
    } catch {
      return {
        ok: false,
        code: "model",
        origen,
        error: "Elige un modelo de Gemini disponible en el catálogo antes de probar la clave.",
      };
    }
  }

  const etiquetaOrigen =
    origen === "input" ? "la que escribiste (aún sin guardar)" : describeKeySource(provider, origen);
  const inicio = Date.now();

  try {
    if (provider === "anthropic") {
      const request = createAiRequest({ user, deadlineAt: Date.now() + 15000 });
      await withGenerationTrace({ provider, model: modelo }, () => request(({ timeoutMs, signal }) => generationStage("provider_request", () => new Anthropic({ apiKey: key, maxRetries: 0, timeout: timeoutMs }).messages.create({
        model: modelo,
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      }, { signal }))));
      const latencia = Date.now() - inicio;
      return {
        ok: true,
        origen,
        latenciaMs: latencia,
        mensaje: `Clave de Claude válida · ${etiquetaOrigen} · ${latencia} ms (probada con ${modelo}, saldo verificado).`,
      };
    }

    // Sin retryOptions: en @google/genai 1.52 esa opción pierde el status y el
    // cuerpo de las respuestas fallidas, y aquí hace falta clasificarlas.
    const ai = new GoogleGenAI({ apiKey: key, httpOptions: { timeout: 15000 } });
    await ai.models.get({ model: modelo });
    const latencia = Date.now() - inicio;
    return {
      ok: true,
      origen,
      latenciaMs: latencia,
      mensaje: `Clave de Gemini válida · ${etiquetaOrigen} · ${latencia} ms (acceso a ${modelo} confirmado; la cuota disponible se comprueba al generar).`,
    };
  } catch (err: unknown) {
    const aiError = toAiError(err, provider, origen === "input" ? null : origen);
    const detalle =
      origen === "input" && aiError.code === "auth"
        ? `Se probó la clave que escribiste, sin guardarla. Genera una nueva en ${
            provider === "anthropic"
              ? "console.anthropic.com → API keys"
              : "aistudio.google.com → Get API key"
          } y vuelve a pegarla.`
        : aiError.detail;
    // Sin código conocido, toAiError habla de «generación»; aquí no se generó
    // nada, solo se probó la clave, así que el mensaje lo dice tal cual.
    const mensaje = aiError.code ? aiError.message : `No se pudo probar la clave de ${nombre}.`;
    return {
      ok: false,
      code: aiError.code,
      origen,
      latenciaMs: Date.now() - inicio,
      error: detalle ? `${mensaje} ${detalle}` : mensaje,
    };
  }
}
