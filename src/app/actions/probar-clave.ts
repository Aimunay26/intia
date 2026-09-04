"use server";

import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { requireUser } from "@/lib/auth";

export type TestKeyResult = {
  ok: boolean;
  mensaje?: string;
  error?: string;
  latenciaMs?: number;
};

/**
 * Prueba en vivo una clave de API llamando al proveedor real.
 * No guarda nada en la base de datos; solo comprueba validez y saldo.
 */
export async function probarClaveIA(params: {
  provider: "anthropic" | "google" | string;
  apiKey: string;
  model?: string;
}): Promise<TestKeyResult> {
  await requireUser();

  const key = params.apiKey.trim();
  if (!key) {
    return { ok: false, error: "La clave no puede estar vacía." };
  }

  const inicio = Date.now();

  try {
    if (params.provider === "anthropic") {
      const client = new Anthropic({ apiKey: key, maxRetries: 0 });
      const modelo = params.model || "claude-3-5-haiku-20241022";
      await client.messages.create({
        model: modelo,
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      });
      const latencia = Date.now() - inicio;
      return {
        ok: true,
        mensaje: `Clave de Claude válida y con saldo verificado (${latencia} ms).`,
        latenciaMs: latencia,
      };
    } else if (params.provider === "google") {
      const ai = new GoogleGenAI({ apiKey: key });
      const modelo = params.model || "gemini-2.5-flash";
      await ai.models.generateContent({
        model: modelo,
        contents: "ping",
        config: { maxOutputTokens: 1 },
      });
      const latencia = Date.now() - inicio;
      return {
        ok: true,
        mensaje: `Clave de Gemini válida y con saldo verificado (${latencia} ms).`,
        latenciaMs: latencia,
      };
    } else {
      return { ok: false, error: `Proveedor desconocido: ${params.provider}` };
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (/401|403|unauthorized|invalid api key|api_key_invalid/i.test(errorMsg)) {
      return {
        ok: false,
        error: "La clave es incorrecta o no tiene permisos de acceso.",
      };
    }
    if (/credit|balance|quota|billing|429/i.test(errorMsg)) {
      return {
        ok: false,
        error: "La clave es válida pero la cuenta no tiene saldo suficiente o excedió su cuota.",
      };
    }
    return {
      ok: false,
      error: `Error al probar la clave: ${errorMsg.slice(0, 200)}`,
    };
  }
}
