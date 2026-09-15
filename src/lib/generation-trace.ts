import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

const stages = ["enqueue", "dispatch_claim", "dispatch_start", "dispatch_save", "dispatch",
  "workflow_step", "cache_refresh", "process", "claim", "quota", "generate",
  "context_load", "references_load", "prompt_build", "settings_load", "model_resolve", "key_resolve",
  "provider_request", "provider_response", "schema_fallback", "response_parse",
  "response_save", "script_save", "script_insert", "audit_save", "video_link", "failure_save", "retry", "job_state", "cancel"] as const;
type Stage = typeof stages[number];
type State = "start" | "success" | "error" | "info";
type Fields = {
  jobId?: string; itemId?: string; runId?: string; attempt?: number; provider?: string; model?: string;
  keySource?: string | null; requestIndex?: number; structured?: boolean; durationMs?: number;
  referenceCount?: number; promptBytes?: number; responseBytes?: number; sceneCount?: number;
  inputTokens?: number; outputTokens?: number; maxOutputTokens?: number; timeoutMs?: number;
  retry?: boolean; waitMs?: number; reused?: boolean; affectedRows?: number; status?: string;
  finishReason?: string; blockReason?: string; reason?: string; httpStatus?: number;
  errorCode?: string; databaseCode?: string; transportCode?: string;
};
const context = new AsyncLocalStorage<Fields & { traceId: string }>();
const enumFields: Partial<Record<keyof Fields, readonly string[]>> = {
  provider: ["google", "anthropic", "Gemini", "Claude"], keySource: ["db", "env"],
  status: ["QUEUED", "RUNNING", "COMPLETED", "PARTIAL", "FAILED", "CANCELLED"],
  reason: ["not_runnable", "access_revoked_or_expired", "lease_wait", "attempt_limit", "lease_lost", "provider_overloaded", "invalid_response", "quota_limit", "unknown"],
  errorCode: ["auth", "quota", "model", "server", "schema", "timeout"],
  transportCode: ["UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "ECONNRESET", "ETIMEDOUT", "ECONNREFUSED"],
  finishReason: ["STOP", "MAX_TOKENS", "SAFETY", "RECITATION", "OTHER", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "MALFORMED_FUNCTION_CALL", "end_turn", "max_tokens", "refusal", "stop_sequence", "tool_use"],
  blockReason: ["SAFETY", "OTHER", "BLOCKLIST", "PROHIBITED_CONTENT", "IMAGE_SAFETY"],
};
const numbers = ["attempt", "requestIndex", "durationMs", "referenceCount", "promptBytes", "responseBytes", "sceneCount", "inputTokens", "outputTokens", "maxOutputTokens", "timeoutMs", "waitMs", "affectedRows", "httpStatus"] as const;
const booleans = ["structured", "retry", "reused"] as const;

/** Lista permitida en runtime: ni un Error completo ni metadatos extra pueden filtrar contenido. */
function safeFields(fields: Fields): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const key of numbers) {
    const value = fields[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) out[key] = Math.round(value * 100) / 100;
  }
  for (const key of booleans) if (typeof fields[key] === "boolean") out[key] = fields[key];
  for (const [key, values] of Object.entries(enumFields)) {
    const value = fields[key as keyof Fields];
    if (typeof value === "string" && values.includes(value)) out[key] = value;
  }
  for (const key of ["jobId", "itemId", "runId"] as const) {
    const value = fields[key];
    if (typeof value === "string" && /^(?:c[a-z0-9]{20,32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}|wrun_[A-Z0-9]{26})$/.test(value)) out[key] = value;
  }
  if (fields.model && /^(?:gemini-\d+(?:\.\d+)?-(?:flash|pro|flash-lite)(?:-preview)?|claude-(?:opus|sonnet|haiku)-\d+(?:-\d+)*)$/.test(fields.model) && fields.model.length < 80) out.model = fields.model;
  if (fields.databaseCode && /^(?:P\d{4}|[0-9A-Z]{5})$/.test(fields.databaseCode)) out.databaseCode = fields.databaseCode;
  return out;
}

function errorFields(error: unknown): Fields {
  const e = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const object = (value: unknown) => value && typeof value === "object" ? value as Record<string, unknown> : {};
  const diagnostic = object(e.diagnostic), cause = object(e.cause), meta = object(e.meta);
  const status = Number(e.status ?? e.statusCode ?? diagnostic.status);
  const fields: Fields = {
    httpStatus: status >= 400 && status <= 599 ? status : undefined,
    errorCode: typeof e.code === "string" ? e.code : undefined,
    transportCode: String(diagnostic.code ?? cause.code ?? e.code ?? ""),
    databaseCode: typeof e.code === "string" && /^P\d{4}$/.test(e.code) ? e.code : typeof meta.code === "string" ? meta.code : undefined,
    reason: "unknown",
  };
  // El texto sólo se clasifica; nunca se incluye en el registro.
  const message = typeof e.message === "string" ? e.message : "";
  if (status === 503 && /high demand|overload/i.test(message)) fields.reason = "provider_overloaded";
  if (/cupo de uso configurado/i.test(message)) fields.reason = "quota_limit";
  if (e.name === "AbortError" || e.name === "TimeoutError" || /timeout|timed out/i.test(message)) fields.errorCode = "timeout";
  return fields;
}

export function withGenerationTrace<T>(fields: Fields, work: () => T): T {
  const parent = context.getStore();
  return context.run({ ...parent, ...safeFields(fields), traceId: parent?.traceId ?? randomUUID() }, work);
}

export function generationEvent(stage: Stage, state: State, fields: Fields = {}) {
  if (process.env.GENERATION_LOGS === "0" || !context.getStore() || !stages.includes(stage)) return;
  try {
    const current = context.getStore()!;
    const release = process.env.VERCEL_GIT_COMMIT_SHA;
    const row = { event: "generation_trace", timestamp: new Date().toISOString(), traceId: current.traceId,
      stage, state, ...safeFields({ ...current, ...fields }),
      ...(release && /^[a-f0-9]{40}$/.test(release) ? { release: release.slice(0, 12) } : {}) };
    (state === "error" ? console.warn : console.info)(JSON.stringify(row));
  } catch { /* La observabilidad nunca altera la generación. */ }
}

/** El mismo error y resultado se propagan; no agrega llamadas ni reintentos. */
export async function generationStage<T>(stage: Stage, work: () => PromiseLike<T> | T, fields: Fields = {}): Promise<T> {
  return withGenerationTrace(fields, async () => {
    const started = performance.now();
    generationEvent(stage, "start");
    try {
      const result = await work();
      generationEvent(stage, "success", { durationMs: performance.now() - started });
      return result;
    } catch (error) {
      generationEvent(stage, "error", { durationMs: performance.now() - started, ...errorFields(error) });
      throw error;
    }
  });
}
