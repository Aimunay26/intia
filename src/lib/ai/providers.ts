import { resourceLimit } from "@/lib/resource-limits";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { GoogleGenAI } from "@google/genai";

import {
  GENERATED_SCRIPT_JSON_SCHEMA,
  GeneratedScriptSchema,
  type GeneratedScript,
} from "@/lib/ai/schema";

export type GenerationResult = {
  script: GeneratedScript;
  raw: string;
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
};

export type ProviderCall = {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  /** Solo lo usa Gemini: Claude Opus 5 / Sonnet 5 rechazan temperature. */
  temperature?: number;
};

/** Error legible para mostrar en la interfaz. */
export class AiError extends Error {
  constructor(
    message: string,
    readonly detail?: string,
    readonly retryable = false
  ) {
    super(message);
    this.name = "AiError";
  }
}

/* ---------------------------------------------------------------- CLAUDE -- */

export async function generateWithClaude(call: ProviderCall): Promise<GenerationResult> {
  const client = new Anthropic({ apiKey: call.apiKey, maxRetries: 0, timeout: 240000 });

  let message;
  try {
    // Se usa stream + finalMessage porque max_tokens es alto: evita que la
    // peticion muera por timeout HTTP en guiones largos.
    const stream = client.messages.stream({
      model: call.model,
      max_tokens: resourceLimit("AI_MAX_OUTPUT_TOKENS", 32000),
      system: call.system,
      messages: [{ role: "user", content: call.user }],
      output_config: {
        format: zodOutputFormat(GeneratedScriptSchema),
      },
    }, { signal: AbortSignal.timeout(240000) });
    message = await stream.finalMessage();
  } catch (error) {
    throw toAiError(error, "Claude");
  }

  if (message.stop_reason === "refusal") {
    throw new AiError(
      "Claude no quiso generar este guion.",
      "El modelo rechazó la petición por sus filtros de seguridad. Reformula el pedido o prueba con Gemini."
    );
  }
  if (message.stop_reason === "max_tokens") {
    throw new AiError(
      "El guion salió cortado.",
      "Se alcanzó el límite de tokens. Reduce la duración objetivo o acorta los PDFs de referencia."
    );
  }

  const parsed = message.parsed_output;
  if (!parsed) {
    // Plan B: intentar leer el JSON del texto plano.
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const fallback = parseScriptJson(text);
    if (!fallback) {
      throw new AiError(
        "Claude respondió, pero no en el formato esperado.",
        text.slice(0, 500)
      );
    }
    return {
      script: fallback,
      raw: text,
      provider: "anthropic",
      model: call.model,
      inputTokens: message.usage?.input_tokens,
      outputTokens: message.usage?.output_tokens,
    };
  }

  return {
    script: parsed as GeneratedScript,
    raw: JSON.stringify(parsed, null, 2),
    provider: "anthropic",
    model: call.model,
    inputTokens: message.usage?.input_tokens,
    outputTokens: message.usage?.output_tokens,
  };
}

/* ---------------------------------------------------------------- GEMINI -- */

/** Gemini no acepta todos los dialectos de JSON Schema: se limpia lo que sobra. */
function geminiSchema(): unknown {
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip);
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        if (key === "additionalProperties") continue;
        out[key] = strip(value);
      }
      return out;
    }
    return node;
  };
  return strip(GENERATED_SCRIPT_JSON_SCHEMA);
}

export async function generateWithGemini(call: ProviderCall): Promise<GenerationResult> {
  const ai = new GoogleGenAI({ apiKey: call.apiKey, httpOptions: { timeout: 240000, retryOptions: { attempts: 1 } } });

  const baseConfig = {
    systemInstruction: call.system,
    responseMimeType: "application/json",
    temperature: call.temperature ?? 1,
    maxOutputTokens: resourceLimit("AI_MAX_OUTPUT_TOKENS", 32000),
  };

  let text = "";
  let usage: { input?: number; output?: number } = {};

  try {
    const response = await ai.models.generateContent({
      model: call.model,
      contents: call.user,
      config: { ...baseConfig, responseJsonSchema: geminiSchema() },
    });
    text = response.text ?? "";
    usage = {
      input: response.usageMetadata?.promptTokenCount,
      output: response.usageMetadata?.candidatesTokenCount,
    };
  } catch (error) {
    throw toAiError(error, "Gemini");
  }

  const script = parseScriptJson(text);
  if (!script) {
    throw new AiError("Gemini respondió, pero no en el formato esperado.", text.slice(0, 500));
  }

  return {
    script,
    raw: text,
    provider: "google",
    model: call.model,
    inputTokens: usage.input,
    outputTokens: usage.output,
  };
}

/* ----------------------------------------------------------------- COMUN -- */

/** Extrae y valida el JSON del guion desde texto libre. Devuelve null si falla. */
export function parseScriptJson(text: string): GeneratedScript | null {
  if (!text?.trim()) return null;

  const candidates: string[] = [];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1]);
  candidates.push(text);

  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(text.slice(first, last + 1));

  for (const candidate of candidates) {
    try {
      const data = JSON.parse(candidate.trim());
      const result = GeneratedScriptSchema.safeParse(data);
      if (result.success) return result.data;
      // Salvavidas: si solo faltan campos opcionales, se rellenan.
      const repaired = repair(data);
      const second = GeneratedScriptSchema.safeParse(repaired);
      if (second.success) return second.data;
    } catch {
      // seguimos con el siguiente candidato
    }
  }
  return null;
}

/** Rellena los campos que el modelo pudo omitir, para no perder un guion bueno. */
function repair(data: unknown): unknown {
  if (!data || typeof data !== "object") return data;
  const d = data as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);

  const scenes = arr(d.scenes).map((raw) => {
    const s = (raw ?? {}) as Record<string, unknown>;
    const voiceType = str(s.voiceType).toUpperCase();
    return {
      beat: str(s.beat),
      startSec: num(s.startSec),
      endSec: num(s.endSec),
      voiceType: ["EN_CAMARA", "VOZ_EN_OFF", "DIALOGO", "TEXTO"].includes(voiceType)
        ? voiceType
        : "EN_CAMARA",
      voice: str(s.voice),
      shot: str(s.shot),
      action: str(s.action),
      actors: arr(s.actors).map((a) => {
        const actor = (a ?? {}) as Record<string, unknown>;
        return {
          role: str(actor.role),
          archetype: str(actor.archetype),
          notes: str(actor.notes),
        };
      }),
      emotion: str(s.emotion),
      props: arr(s.props).map(str),
      lighting: str(s.lighting),
      sound: str(s.sound),
      onScreenText: str(s.onScreenText),
      location: str(s.location),
      notes: str(s.notes),
    };
  });

  return {
    title: str(d.title) || "Guion sin título",
    avatar: str(d.avatar),
    focus: str(d.focus),
    hook: str(d.hook),
    cta: str(d.cta),
    totalSeconds:
      num(d.totalSeconds) ||
      scenes.reduce((max, s) => Math.max(max, s.endSec), 0),
    castNotes: str(d.castNotes),
    propsSummary: arr(d.propsSummary).map(str),
    scenes,
  };
}

function toAiError(error: unknown, providerLabel: string): AiError {
  const message = error instanceof Error ? error.message : String(error);
  const status =
    error && typeof error === "object" && "status" in error
      ? Number((error as { status?: unknown }).status)
      : undefined;

  if (status === 401 || status === 403 || /api[_ -]?key|unauthorized|permission/i.test(message)) {
    return new AiError(
      `La clave de ${providerLabel} no es válida o no tiene permisos.`,
      "Revísala en Ajustes o en las variables de entorno."
    );
  }
  if (status === 429 || /rate|quota|resource[_ ]exhausted/i.test(message)) {
    return new AiError(
      `${providerLabel} está limitando las peticiones.`,
      "Espera un momento y vuelve a intentar, o cambia de proveedor.", true
    );
  }
  if (status === 404 || /model|not found/i.test(message)) {
    return new AiError(
      `${providerLabel} no reconoce ese modelo.`,
      `${message}. Revisa el nombre del modelo en la estructura o en Ajustes.`
    );
  }
  if (status && status >= 500) {
    return new AiError(
      `${providerLabel} tuvo un error de servidor.`,
      "Es temporal. Intenta de nuevo en unos segundos.", true
    );
  }
  return new AiError(`Falló la generación con ${providerLabel}.`, "Revisa el proveedor y vuelve a intentar.", /timeout|timed out|connection|network|fetch failed/i.test(message));
}
