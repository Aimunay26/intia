"use server";

import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";

import { requireUser, requireLevel, LEVEL } from "@/lib/auth";
import { describeKeySource, resolveApiKey, type KeySource } from "@/lib/settings";
import { toAiError, type AiErrorCode, type AiProviderId } from "@/lib/ai/providers";

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
 * Modelos fijos y baratos para la prueba. Nunca el modelo guardado en Ajustes:
 * probar una clave con Opus 5 cuesta más y, si ese modelo estuviera mal
 * escrito, la prueba fallaría con una clave buena.
 */
const MODELO_DE_PRUEBA: Record<AiProviderId, string> = {
  anthropic: "claude-haiku-4-5",
  google: "gemini-2.5-flash",
};

function esProveedor(value: string): value is AiProviderId {
  return value === "anthropic" || value === "google";
}

/**
 * Prueba en vivo una clave de API llamando al proveedor real.
 * No guarda nada en la base de datos; solo comprueba validez y saldo.
 *
 * - Con `apiKey` escrita: prueba esa clave (aún sin guardar).
 * - Sin `apiKey`: prueba la clave EN USO (la guardada en Ajustes o, si no hay,
 *   la variable de entorno del servidor). Como revela el estado de la clave del
 *   servidor y gasta tokens, solo el dueño puede hacerlo.
 */
export async function probarClaveIA(params: {
  provider: "anthropic" | "google" | string;
  apiKey?: string;
}): Promise<TestKeyResult> {
  if (!esProveedor(params.provider)) {
    await requireUser();
    return { ok: false, error: `Proveedor desconocido: ${params.provider}` };
  }
  const provider = params.provider;
  const escrita = (params.apiKey ?? "").trim();

  let key: string;
  let origen: KeySource | "input";
  if (escrita) {
    await requireUser();
    key = escrita;
    origen = "input";
  } else {
    await requireLevel(LEVEL.OWNER);
    const efectiva = await resolveApiKey(provider);
    if (!efectiva.key || !efectiva.source) {
      const nombre = provider === "anthropic" ? "Claude" : "Gemini";
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

  const modelo = MODELO_DE_PRUEBA[provider];
  const etiquetaOrigen =
    origen === "input" ? "la que escribiste (aún sin guardar)" : describeKeySource(provider, origen);
  const inicio = Date.now();

  try {
    if (provider === "anthropic") {
      const client = new Anthropic({ apiKey: key, maxRetries: 0 });
      await client.messages.create({
        model: modelo,
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      });
    } else {
      const ai = new GoogleGenAI({ apiKey: key });
      await ai.models.generateContent({
        model: modelo,
        contents: "ping",
        config: { maxOutputTokens: 1 },
      });
    }
    const latencia = Date.now() - inicio;
    const nombre = provider === "anthropic" ? "Claude" : "Gemini";
    return {
      ok: true,
      origen,
      latenciaMs: latencia,
      mensaje: `Clave de ${nombre} válida · ${etiquetaOrigen} · ${latencia} ms (probada con ${modelo}).`,
    };
  } catch (err: unknown) {
    const aiError = toAiError(err, provider, origen === "input" ? null : origen);
    const nombre = provider === "anthropic" ? "Claude" : "Gemini";
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
