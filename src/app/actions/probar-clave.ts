"use server";

import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { requirePermission } from "@/lib/auth";
import { resolveAiModel } from "@/lib/ai-models";

export type TestKeyResult = {
  ok: boolean;
  mensaje?: string;
  error?: string;
  latenciaMs?: number;
};

/**
 * Comprueba acceso al proveedor sin guardar la clave. Gemini consulta el modelo
 * sin generar tokens; esta consulta no certifica la cuota de generación.
 */
export async function probarClaveIA(params: {
  provider: "anthropic" | "google" | string;
  apiKey: string;
  model?: string;
}): Promise<TestKeyResult> {
  await requirePermission("admin.settings");

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
      const modelo = resolveAiModel("google", params.model);
      const ai = new GoogleGenAI({ apiKey: key, httpOptions: { timeout: 15000, retryOptions: { attempts: 1 } } });
      await ai.models.get({ model: modelo });
      const latencia = Date.now() - inicio;
      return {
        ok: true,
        mensaje: `Acceso a ${modelo} confirmado (${latencia} ms). La cuota disponible se comprueba al generar.`,
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
