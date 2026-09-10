import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ApiError as GeminiApiError, GoogleGenAI } from "@google/genai";

import {
  GENERATED_SCRIPT_JSON_SCHEMA,
  GeneratedScriptSchema,
  type GeneratedScript,
} from "@/lib/ai/schema";
import { describeKeySource, type KeySource } from "@/lib/settings";

export type AiProviderId = "anthropic" | "google";

const PROVIDER_LABEL: Record<AiProviderId, string> = {
  anthropic: "Claude",
  google: "Gemini",
};

/** Dónde se crea una clave nueva, por proveedor. */
const CONSOLE_HINT: Record<AiProviderId, string> = {
  anthropic: "console.anthropic.com → API keys",
  google: "aistudio.google.com → Get API key",
};

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
  /** De dónde salió la clave, para decirlo en el mensaje de error. */
  keySource?: KeySource | null;
};

/**
 * Qué falló, para que quien llama decida qué hacer:
 *   auth    la clave no sirve (revocada, mal copiada, sin permisos, ausente)
 *   quota   cuota o saldo agotado, o demasiadas peticiones por minuto
 *   model   el proveedor no reconoce ese modelo
 *   server  error del proveedor o de red; suele ser temporal
 *   schema  el proveedor rechazó el esquema JSON de salida
 */
export type AiErrorCode = "auth" | "quota" | "model" | "server" | "schema";

/** Error legible para mostrar en la interfaz. */
export class AiError extends Error {
  constructor(
    message: string,
    readonly detail?: string,
    readonly code?: AiErrorCode
  ) {
    super(message);
    this.name = "AiError";
  }
}

/* ---------------------------------------------------------------- CLAUDE -- */

export async function generateWithClaude(call: ProviderCall): Promise<GenerationResult> {
  const client = new Anthropic({ apiKey: call.apiKey, maxRetries: 2 });

  let message;
  try {
    // Se usa stream + finalMessage porque max_tokens es alto: evita que la
    // peticion muera por timeout HTTP en guiones largos.
    const stream = client.messages.stream({
      model: call.model,
      max_tokens: 32000,
      system: call.system,
      messages: [{ role: "user", content: call.user }],
      output_config: {
        format: zodOutputFormat(GeneratedScriptSchema),
      },
    });
    message = await stream.finalMessage();
  } catch (error) {
    throw toAiError(error, "anthropic", call.keySource);
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
  const ai = new GoogleGenAI({ apiKey: call.apiKey });

  const baseConfig = {
    systemInstruction: call.system,
    responseMimeType: "application/json",
    temperature: call.temperature ?? 1,
    maxOutputTokens: 32000,
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
  } catch (schemaError) {
    // Se reintenta pidiendo solo JSON (el contrato exacto ya va escrito en el
    // prompt del sistema) cuando Gemini rechazó el ESQUEMA o devolvió un 400
    // sin clasificar: Gemini responde «Request contains an invalid argument.»
    // a varias combinaciones de esquema que no soporta, sin nombrar el esquema.
    // Una clave mala, un modelo desconocido, la cuota agotada o un 5xx se
    // reportan a la primera: repetir la llamada solo gastaría otra petición.
    const code = clasificarError(schemaError);
    const reintentable = code === "schema" || (code === null && errorStatus(schemaError) === 400);
    if (!reintentable) {
      throw toAiError(schemaError, "google", call.keySource);
    }
    try {
      const response = await ai.models.generateContent({
        model: call.model,
        contents: call.user,
        config: baseConfig,
      });
      text = response.text ?? "";
      usage = {
        input: response.usageMetadata?.promptTokenCount,
        output: response.usageMetadata?.candidatesTokenCount,
      };
    } catch (error) {
      throw toAiError(error ?? schemaError, "google", call.keySource);
    }
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

/* --------------------------------------------------- CLASIFICAR ERRORES -- */

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Código HTTP del error, venga del SDK que venga. */
function errorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object" || !("status" in error)) return undefined;
  const raw = (error as { status?: unknown }).status;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

const RE_AUTH = /api[_ -]?key|unauthorized|authentication|permission[_ ]denied|invalid x-api-key/i;
const RE_QUOTA = /rate[_ -]?limit|quota|resource[_ ]exhausted|credit balance|too many requests/i;
const RE_MODEL = /model .*not (found|supported)|not_found_error|no encontr|is not found for api version/i;
const RE_SCHEMA = /schema|response_json_schema|responseJsonSchema|response_schema|output_config|unknown name/i;

/**
 * Clasifica un error del proveedor. Primero por las clases tipadas del SDK,
 * luego por el código HTTP y solo al final por el texto del mensaje: una regex
 * sobre el mensaje confunde con facilidad un 400 de esquema que menciona
 * "model" con un modelo desconocido.
 */
export function clasificarError(error: unknown): AiErrorCode | null {
  if (error instanceof AiError) return error.code ?? null;

  // Claude: clases tipadas del SDK.
  if (error instanceof Anthropic.AuthenticationError) return "auth";
  if (error instanceof Anthropic.PermissionDeniedError) return "auth";
  if (error instanceof Anthropic.RateLimitError) return "quota";
  if (error instanceof Anthropic.NotFoundError) return "model";
  if (error instanceof Anthropic.InternalServerError) return "server";
  if (error instanceof Anthropic.APIConnectionError) return "server";
  if (error instanceof Anthropic.BadRequestError) {
    // Anthropic devuelve la falta de saldo como 400 invalid_request_error
    // («credit balance is too low»), no como 429: hay que mirar el texto.
    const m = error.message;
    if (RE_AUTH.test(m)) return "auth";
    if (RE_QUOTA.test(m)) return "quota";
    if (RE_SCHEMA.test(m)) return "schema";
    if (RE_MODEL.test(m)) return "model";
    return null;
  }

  const status = errorStatus(error);
  const message = errorMessage(error);

  // Gemini: ApiError con status numérico. Una clave mal copiada llega como
  // 400 "API key not valid", no como 401.
  const esGemini = error instanceof GeminiApiError;
  if (esGemini || status !== undefined) {
    if (status === 401 || status === 403) return "auth";
    if (status === 429) return "quota";
    if (status === 404) return "model";
    if (status !== undefined && status >= 500) return "server";
    if (status === 400) {
      if (RE_AUTH.test(message)) return "auth";
      if (RE_QUOTA.test(message)) return "quota";
      if (RE_SCHEMA.test(message)) return "schema";
      if (RE_MODEL.test(message)) return "model";
      return null;
    }
  }

  // Último recurso: el texto del mensaje (errores de red, envoltorios raros).
  if (RE_AUTH.test(message)) return "auth";
  if (RE_QUOTA.test(message)) return "quota";
  if (RE_MODEL.test(message)) return "model";
  if (/fetch failed|ECONNRESET|ENOTFOUND|ETIMEDOUT|network/i.test(message)) return "server";
  return null;
}

/** Para el lote del generador: si falla así, no tiene sentido seguir con la siguiente estructura. */
export function esErrorDeAutenticacion(e: unknown): boolean {
  return clasificarError(e) === "auth";
}

/** Para el lote del generador: si falla así, conviene esperar antes de reintentar. */
export function esErrorDeCuota(e: unknown): boolean {
  return clasificarError(e) === "quota";
}

/** Gemini rechazó el esquema de salida (400): se puede reintentar sin él. */
export function esErrorDeEsquema(e: unknown): boolean {
  return clasificarError(e) === "schema";
}

/**
 * Convierte cualquier error del proveedor en un AiError con un mensaje que
 * dice qué pasó y qué hacer, incluido de dónde salió la clave que se usó.
 */
export function toAiError(
  error: unknown,
  provider: AiProviderId,
  keySource?: KeySource | null
): AiError {
  if (error instanceof AiError) return error;

  const label = PROVIDER_LABEL[provider];
  const message = errorMessage(error);
  const code = clasificarError(error);
  const origen = describeKeySource(provider, keySource);

  switch (code) {
    case "auth":
      return new AiError(
        `La clave de ${label} fue rechazada: está revocada o mal copiada.`,
        `Se usó la clave ${origen}. Genera una nueva en ${CONSOLE_HINT[provider]} y pégala en Ajustes: la guardada ahí manda sobre la variable de entorno.`,
        "auth"
      );
    case "quota":
      return provider === "google"
        ? new AiError(
            "Gemini agotó la cuota del proyecto (peticiones por minuto o por día del plan gratuito).",
            "Espera un minuto y vuelve a intentar con menos estructuras, usa gemini-2.5-flash, o activa facturación en aistudio.google.com. La cuota es por proyecto y se reinicia a medianoche (hora del Pacífico).",
            "quota"
          )
        : new AiError(
            "Claude está limitando las peticiones o la cuenta se quedó sin saldo.",
            "Espera un minuto y vuelve a intentar con menos estructuras, o revisa el saldo y los límites en console.anthropic.com → Billing.",
            "quota"
          );
    case "model":
      return new AiError(
        `${label} no reconoce ese modelo.`,
        `${message}. Revisa el nombre del modelo en la estructura o en Ajustes.`,
        "model"
      );
    case "schema":
      return new AiError(
        `${label} rechazó el formato de salida pedido.`,
        `${message.slice(0, 300)}. Es un problema del esquema JSON, no de la clave.`,
        "schema"
      );
    case "server":
      return new AiError(
        `${label} tuvo un error de servidor o de conexión.`,
        "Suele ser temporal. Intenta de nuevo en unos segundos.",
        "server"
      );
    default:
      return new AiError(`Falló la generación con ${label}.`, message);
  }
}
