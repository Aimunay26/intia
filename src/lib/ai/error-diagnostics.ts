/** Etiquetas cerradas: nunca persistir mensajes ni detalles arbitrarios del SDK. */
const statuses = ["INVALID_ARGUMENT", "FAILED_PRECONDITION", "UNAUTHENTICATED", "PERMISSION_DENIED",
  "NOT_FOUND", "RESOURCE_EXHAUSTED", "INTERNAL", "UNAVAILABLE", "DEADLINE_EXCEEDED"] as const;
export type ProviderErrorStatus = typeof statuses[number];
export type ProviderErrorReason = "provider_overloaded" | "deadline_exceeded" | "schema_rejected" | "invalid_argument";
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};

export function providerErrorDetails(error: unknown): { providerStatus?: ProviderErrorStatus; reason?: ProviderErrorReason } {
  const e = object(error), diagnostic = object(e.diagnostic);
  const message = typeof e.message === "string" ? e.message : "";
  let body: Record<string, unknown> = {};
  try { body = object(object(JSON.parse(message)).error); } catch { /* El SDK también devuelve texto simple. */ }
  const candidate = diagnostic.providerStatus ?? body.status ?? e.status;
  const providerStatus = statuses.find(status => status === candidate);
  const httpStatus = Number(e.status ?? e.statusCode ?? diagnostic.status ?? body.code);
  let reason: ProviderErrorReason | undefined;
  if (httpStatus === 408 || httpStatus === 504 || providerStatus === "DEADLINE_EXCEEDED") reason = "deadline_exceeded";
  else if (httpStatus === 503 && (diagnostic.reason === "provider_overloaded" || /high demand|overload|capacity/i.test(message))) reason = "provider_overloaded";
  else if (httpStatus === 400 && (diagnostic.reason === "schema_rejected" || /schema|response_json_schema|responseJsonSchema|response_schema/i.test(message))) reason = "schema_rejected";
  else if (httpStatus === 400 && (diagnostic.reason === "invalid_argument" || providerStatus === "INVALID_ARGUMENT" || /invalid argument/i.test(message))) reason = "invalid_argument";
  return { ...(providerStatus ? { providerStatus } : {}), reason };
}
