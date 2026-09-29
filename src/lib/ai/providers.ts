import { resourceLimit } from "@/lib/resource-limits";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ApiError as GeminiApiError, GoogleGenAI } from "@google/genai";

import {
  GeneratedScriptSchema,
  type GeneratedScript,
} from "@/lib/ai/schema";
import { describeKeySource, type KeySource } from "@/lib/settings";
import { generationEvent, generationStage, withGenerationTrace } from "@/lib/generation-trace";
import { AiBudgetError, type AiRequest } from "@/lib/ai/request-budget";
import { classifyProviderQuota, providerQuotaMessage } from "@/lib/ai/provider-quota";
import { geminiScriptSchema } from "@/lib/ai/gemini-schema";
import { providerErrorDetails, type ProviderErrorReason, type ProviderErrorStatus } from "@/lib/ai/error-diagnostics";

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
  request: AiRequest;
  apiKey: string;
  model: string;
  system: string;
  user: string;
  /** Se conserva por compatibilidad; Gemini 3.8 y los Claude actuales no la reciben. */
  temperature?: number;
  /** De dónde salió la clave, para decirlo en el mensaje de error. */
  keySource?: KeySource | null;
};

/**
 * Qué falló, para que quien llama decida qué hacer:
 *   auth     la clave no sirve (revocada, mal copiada, sin permisos, ausente)
 *   quota    cuota o saldo agotado, o demasiadas peticiones por minuto
 *   model    el proveedor no reconoce ese modelo
 *   server   error del proveedor o de red; suele ser temporal
 *   schema   el proveedor rechazó el esquema JSON de salida
 *   timeout  el transporte abortó o se agotó el tiempo de espera
 */
export type AiErrorCode = "auth" | "quota" | "model" | "server" | "schema" | "timeout";

/**
 * Solo metadatos para el registro del trabajo: proveedor, código HTTP,
 * código de transporte conocido y motivo/estado del proveedor de listas
 * cerradas (error-diagnostics.ts). Nunca claves, prompts ni el mensaje crudo.
 */
export type AiDiagnostic = { provider: string; status?: number; code?: string; reason?: ProviderErrorReason; providerStatus?: ProviderErrorStatus };

/** Error legible para mostrar en la interfaz. */
export class AiError extends Error {
  constructor(
    message: string,
    readonly detail?: string,
    readonly code?: AiErrorCode,
    /** Si el trabajo en segundo plano puede volver a intentarlo (cuota, servidor, timeout). */
    readonly retryable = false,
    readonly diagnostic?: AiDiagnostic
  ) {
    super(message);
    this.name = "AiError";
  }
}

/* ---------------------------------------------------------------- CLAUDE -- */

export async function generateWithClaude(call: ProviderCall): Promise<GenerationResult> {
  return withGenerationTrace({ provider: "anthropic", model: call.model, keySource: call.keySource }, () => generateClaude(call));
}

async function generateClaude(call: ProviderCall): Promise<GenerationResult> {
  let message;
  try {
    message = await call.request(({ timeoutMs, signal }) => generationStage("provider_request", async () => {
      const client = new Anthropic({ apiKey: call.apiKey, maxRetries: 0, timeout: timeoutMs });
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
      }, { signal });
      return await stream.finalMessage();
    }, { requestIndex: 1, timeoutMs, structured: true }));
  } catch (error) {
    throw toAiError(error, "anthropic", call.keySource);
  }

  generationEvent("provider_response", "info", { finishReason: message.stop_reason ?? undefined, inputTokens: message.usage?.input_tokens, outputTokens: message.usage?.output_tokens });
  return generationStage("response_parse", () => {
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
  });
}

/* ---------------------------------------------------------------- GEMINI -- */

export async function generateWithGemini(call: ProviderCall): Promise<GenerationResult> {
  return withGenerationTrace({ provider: "google", model: call.model, keySource: call.keySource }, () => generateGemini(call));
}

async function generateGemini(call: ProviderCall): Promise<GenerationResult> {
  // En @google/genai 1.52, retryOptions descarta el cuerpo y el status de
  // respuestas HTTP fallidas incluso con attempts: 1. Sin esta opción el SDK
  // hace un único fetch y conserva ApiError; los reintentos los gestiona el job.
  const baseConfig = {
    systemInstruction: call.system,
    responseMimeType: "application/json",
    maxOutputTokens: resourceLimit("AI_MAX_OUTPUT_TOKENS", 32000),
  };
  // Sin límites de tamaño salvo GEMINI_ESQUEMA_SIMPLE="false"; Zod los valida igual al recibir.
  const schema = geminiScriptSchema();

  let text = "";
  let usage: { input?: number; output?: number } = {};

  try {
    const response = await call.request(({ timeoutMs, signal }) => generationStage("provider_request", () => new GoogleGenAI({ apiKey: call.apiKey, httpOptions: { timeout: timeoutMs } }).models.generateContent({
      model: call.model,
      contents: call.user,
      config: { ...baseConfig, abortSignal: signal, responseJsonSchema: schema },
    }), { requestIndex: 1, structured: true, schemaBytes: Buffer.byteLength(JSON.stringify(schema)), timeoutMs, maxOutputTokens: baseConfig.maxOutputTokens }));
    generationEvent("provider_response", "info", { finishReason: response.candidates?.[0]?.finishReason, blockReason: response.promptFeedback?.blockReason, responseBytes: Buffer.byteLength(response.text ?? ""), inputTokens: response.usageMetadata?.promptTokenCount, outputTokens: response.usageMetadata?.candidatesTokenCount });
    text = response.text ?? "";
    usage = {
      input: response.usageMetadata?.promptTokenCount,
      output: response.usageMetadata?.candidatesTokenCount,
    };
  } catch (schemaError) {
    // Se reintenta pidiendo solo JSON (el contrato exacto ya va escrito en el
    // prompt del sistema) cuando Gemini rechazó el ESQUEMA o devolvió el 400
    // genérico «Request contains an invalid argument.», que es como responde a
    // varias combinaciones de esquema que no soporta, sin nombrar el esquema.
    // Cualquier otro error (clave mala, modelo desconocido, cuota, 5xx, un 400
    // de configuración, un timeout) se reporta a la primera con una sola
    // petición: repetir la llamada solo gastaría otra, y los reintentos que
    // valen la pena los decide el trabajo en segundo plano.
    const code = clasificarError(schemaError);
    const reintentable =
      code === "schema" ||
      (code === null && errorStatus(schemaError) === 400 && RE_ARGUMENTO_INVALIDO.test(errorMessage(schemaError)));
    if (!reintentable) {
      throw toAiError(schemaError, "google", call.keySource);
    }
    generationEvent("schema_fallback", "info", { requestIndex: 2, structured: false, ...providerErrorDetails(schemaError) });
    try {
      const response = await call.request(({ timeoutMs, signal }) => generationStage("provider_request", () => new GoogleGenAI({ apiKey: call.apiKey, httpOptions: { timeout: timeoutMs } }).models.generateContent({
        model: call.model,
        contents: call.user,
        config: { ...baseConfig, abortSignal: signal },
      }), { requestIndex: 2, structured: false, timeoutMs, maxOutputTokens: baseConfig.maxOutputTokens }));
      generationEvent("provider_response", "info", { finishReason: response.candidates?.[0]?.finishReason, blockReason: response.promptFeedback?.blockReason, responseBytes: Buffer.byteLength(response.text ?? ""), inputTokens: response.usageMetadata?.promptTokenCount, outputTokens: response.usageMetadata?.candidatesTokenCount });
      text = response.text ?? "";
      usage = {
        input: response.usageMetadata?.promptTokenCount,
        output: response.usageMetadata?.candidatesTokenCount,
      };
    } catch (error) {
      throw toAiError(error ?? schemaError, "google", call.keySource);
    }
  }

  const script = await generationStage("response_parse", () => {
    const script = parseScriptJson(text);
    if (!script) {
      generationEvent("response_parse", "info", { reason: "invalid_response", responseBytes: Buffer.byteLength(text) });
      throw new AiError("Gemini respondió, pero no en el formato esperado.", text.slice(0, 500));
    }
    generationEvent("response_parse", "info", { sceneCount: script.scenes.length });
    return script;
  });

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
  const message = errorFields(error).message;
  return typeof message === "string" ? message : String(error);
}

function errorFields(error: unknown): Record<string, unknown> {
  return error && typeof error === "object" ? (error as Record<string, unknown>) : {};
}

/** Código HTTP del error, venga del SDK que venga. */
function errorStatus(error: unknown): number | undefined {
  const fields = errorFields(error);
  const raw = fields.status ?? fields.statusCode;
  if (raw === undefined || raw === null) return undefined;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Códigos de transporte de Node/undici que se admiten en el diagnóstico del trabajo. */
const CODIGOS_TRANSPORTE = [
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNREFUSED",
];

/** Código de transporte conocido, en el error o en su `cause`. */
function transportCode(error: unknown): string | undefined {
  const fields = errorFields(error);
  const cause = errorFields(fields.cause);
  return [fields.code, cause.code].find(
    (value): value is string => typeof value === "string" && CODIGOS_TRANSPORTE.includes(value)
  );
}

function esTimeout(error: unknown): boolean {
  const fields = errorFields(error);
  const code = transportCode(error);
  return (
    providerErrorDetails(error).reason === "deadline_exceeded" ||
    fields.name === "AbortError" ||
    fields.name === "TimeoutError" ||
    Boolean(code?.includes("TIMEOUT")) ||
    code === "ETIMEDOUT" ||
    /timeout|timed out|aborted/i.test(errorMessage(error))
  );
}

const RE_AUTH = /api[_ -]?key|unauthorized|authentication|permission[_ ]denied|invalid x-api-key/i;
const RE_QUOTA = /rate[_ -]?limit|quota|resource[_ ]exhausted|credit balance|too many requests/i;
const RE_MODEL = /model .*not (found|supported)|not_found_error|no encontr|is not found for api version/i;
const RE_SCHEMA = /schema|response_json_schema|responseJsonSchema|response_schema|output_config|unknown name/i;
/** El 400 genérico de Gemini ante un esquema que no soporta. */
const RE_ARGUMENTO_INVALIDO = /invalid argument/i;

/**
 * Clasifica un error del proveedor. Primero por las clases tipadas del SDK,
 * luego por el código HTTP y solo al final por el texto del mensaje: una regex
 * sobre el mensaje confunde con facilidad un 400 de esquema que menciona
 * "model" con un modelo desconocido.
 */
export function clasificarError(error: unknown): AiErrorCode | null {
  if (error instanceof AiError) return error.code ?? null;

  // Abortos y timeouts del transporte, antes que nada: el SDK de Anthropic los
  // envuelve como error de conexión y el de Google como TypeError de fetch.
  if (esTimeout(error)) return "timeout";

  // Claude: clases tipadas del SDK.
  if (error instanceof Anthropic.AuthenticationError) return "auth";
  if (error instanceof Anthropic.PermissionDeniedError) return "auth";
  if (error instanceof Anthropic.RateLimitError) return "quota";
  if (error instanceof Anthropic.NotFoundError) return "model";
  if (error instanceof Anthropic.InternalServerError) return "server";
  if (error instanceof Anthropic.APIConnectionError) return "server";
  if (classifyProviderQuota(error)) return "quota";
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
  // 400 "API key not valid", no como 401. (En pruebas el SDK puede venir
  // simulado sin ApiError: por eso se comprueba que exista la clase.)
  const esGemini = typeof GeminiApiError === "function" && error instanceof GeminiApiError;
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
  if (transportCode(error) || /fetch failed|ECONNRESET|ENOTFOUND|ETIMEDOUT|network/i.test(message)) return "server";
  return null;
}

/**
 * Para el lote del generador: si falla así, no tiene sentido seguir con la
 * siguiente estructura (generation-jobs.ts corta los formatos pendientes).
 *
 * Un AiError ya clasificado se lee por su `code`; si llegó sin código pero el
 * diagnóstico trae un 401/403, también es la clave. Se mira por campos y no
 * solo por `instanceof`: el error puede venir de otra instancia del módulo o
 * de un paso del workflow que perdió el prototipo.
 */
export function esErrorDeAutenticacion(e: unknown): boolean {
  const fields = errorFields(e);
  if (e instanceof AiError || fields.name === "AiError") {
    if (fields.code === "auth") return true;
    const status = errorFields(fields.diagnostic).status;
    if (status === 401 || status === 403) return true;
    if (typeof fields.code === "string") return false;
  }
  return clasificarError(e) === "auth";
}

/** Para el lote del generador: si falla así, conviene esperar antes de reintentar. */
export function esErrorDeCuota(e: unknown): boolean {
  return clasificarError(e) === "quota";
}

/** Una cuota agotada, un timeout o un 500 genérico no justifican cambiar de modelo. */
export function esErrorDeSaturacion(error: unknown): boolean {
  const fields = errorFields(error);
  const diagnostic = errorFields(fields.diagnostic);
  if (fields.name === "AiError") {
    return fields.code === "server" && diagnostic.status === 503 && diagnostic.reason === "provider_overloaded";
  }
  return errorStatus(error) === 503 && clasificarError(error) === "server"
    && /high demand|overload|capacity/i.test(errorMessage(error));
}

/** Gemini rechazó el esquema de salida (400): se puede reintentar sin él. */
export function esErrorDeEsquema(e: unknown): boolean {
  return clasificarError(e) === "schema";
}

/**
 * Convierte cualquier error del proveedor en un AiError con un mensaje que
 * dice qué pasó y qué hacer, incluido de dónde salió la clave que se usó.
 * `retryable` y `diagnostic` son para el trabajo en segundo plano: cuota,
 * temporal, servidor y timeout se reintentan; saldo y cuota diaria agotados no.
 */
export function toAiError(
  error: unknown,
  provider: AiProviderId,
  keySource?: KeySource | null
): AiError {
  if (error instanceof AiError) return error;
  if (error instanceof AiBudgetError) return new AiError(error.message, undefined, error.code, false);

  const label = PROVIDER_LABEL[provider];
  const message = errorMessage(error);
  const code = clasificarError(error);
  const origen = describeKeySource(provider, keySource);
  const status = errorStatus(error);
  const diagnostic: AiDiagnostic = {
    provider: label,
    status: status !== undefined && status >= 400 && status <= 599 ? status : undefined,
    code: transportCode(error),
    ...providerErrorDetails(error),
  };
  const fallo = (resumen: string, detalle: string, retryable = false) =>
    new AiError(resumen, detalle, code ?? undefined, retryable, diagnostic);

  switch (code) {
    case "auth":
      return fallo(
        `La clave de ${label} fue rechazada: está revocada o mal copiada.`,
        `Se usó la clave ${origen}. Genera una nueva en ${CONSOLE_HINT[provider]} y pégala en Ajustes: la guardada ahí manda sobre la variable de entorno.`
      );
    case "quota": {
      const quota = providerQuotaMessage(error, provider);
      return fallo(quota.message, quota.detail, quota.retryable);
    }
    case "model":
      return fallo(
        `${label} no reconoce ese modelo.`,
        `${message}. Revisa el nombre del modelo en la estructura o en Ajustes.`
      );
    case "schema":
      return fallo(
        `${label} rechazó el formato de salida pedido.`,
        `${message.slice(0, 300)}. Es un problema del esquema JSON, no de la clave.`
      );
    case "timeout":
      return fallo(
        `${label} tardó demasiado en responder.`,
        "Se agotó el plazo de respuesta. El trabajo reintenta si quedan intentos; si terminó, usa el botón de reintento.",
        true
      );
    case "server":
      return fallo(
        diagnostic.reason === "provider_overloaded" ? `${label} está saturado temporalmente.` : `${label} tuvo un error de servidor o de conexión.`,
        "Suele ser temporal. Intenta de nuevo en unos segundos.",
        true
      );
    default:
      if (status === 400) {
        // Un 400 que no es de clave, cuota, esquema ni modelo: parámetros que
        // ese modelo no acepta. Repetirlo tal cual no lo arregla.
        return fallo(
          `${label} rechazó la configuración de la generación.`,
          `${message.slice(0, 300)}. Revisa los parámetros y el modelo seleccionados.`
        );
      }
      return fallo(`Falló la generación con ${label}.`, message, Boolean(diagnostic.code));
  }
}
