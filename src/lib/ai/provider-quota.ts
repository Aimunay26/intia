type QuotaKind = "free_daily" | "free_unavailable" | "billing" | "daily" | "rate" | "unknown";

/** Lee solo campos de error conocidos; nunca devuelve el cuerpo del proveedor a la UI o logs. */
function quotaEvidence(error: unknown): string {
  const parts: string[] = [];
  const seen = new Set<object>();
  let remaining = 65536;
  let nodes = 100;
  const visit = (value: unknown, depth: number) => {
    if (depth > 7 || remaining <= 0 || --nodes < 0) return;
    if (typeof value === "string") {
      const text = value.slice(0, Math.min(remaining, 16384));
      remaining -= text.length;
      parts.push(text);
      if (text.trimStart().startsWith("{")) {
        try { visit(JSON.parse(text), depth + 1); } catch { /* Mensaje de texto normal. */ }
      }
    } else if (value && typeof value === "object" && !seen.has(value)) {
      seen.add(value);
      if (Array.isArray(value)) { for (const item of value.slice(0, 20)) visit(item, depth + 1); return; }
      const fields = value as Record<string, unknown>;
      for (const key of ["message", "error", "details", "violations", "quotaMetric", "quotaId", "type", "reason", "description", "cause"]) visit(fields[key], depth + 1);
      if (fields.quotaValue === 0 || fields.quotaValue === "0") parts.push("limit: 0");
    }
  };
  visit(error, 0);
  return parts.join("\n");
}

export function classifyProviderQuota(error: unknown): QuotaKind | null {
  const fields = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const status = Number(fields.status ?? fields.statusCode);
  // Un error de autenticación/servidor no es prueba de cuota agotada.
  if ([401, 403, 404].includes(status) || status >= 500) return null;
  const text = quotaEvidence(error);
  const freeUnavailable = /free[_ -]?tier.*(?:not available|not supported|unavailable)/i.test(text);
  const billing = status === 402 || /billing_error|credit balance.*(?:low|exhausted|depleted)|insufficient[_ -]?credits|(?:billing|paid plan).*(?:required|must be enabled)|(?:enable|set up) billing|(?:spend|spending)[_ -]?limit.*(?:exceeded|reached)|(?:prepaid|prepay) credits.*(?:depleted|exhausted)/i.test(text);
  if (freeUnavailable) return "free_unavailable";
  if (billing) return "billing";
  if (status !== 429 && !/rate[_ -]?limit|quota|resource[_ ]exhausted|too many requests/i.test(text)) return null;
  const free = /free[_ -]?tier|free plan/i.test(text);
  const daily = /per[_ -]?day|daily|requests?[_ -]?per[_ -]?day|\brpd\b/i.test(text);
  if (free && /limit\s*[:=]\s*0\b/i.test(text)) return "free_unavailable";
  if (free && daily) return "free_daily";
  if (daily) return "daily";
  if (/per[_ -]?minute|\brpm\b|\btpm\b|rate_limit_error/i.test(text)) return "rate";
  return "unknown";
}

export function providerQuotaMessage(error: unknown, provider: "google" | "anthropic") {
  const kind = classifyProviderQuota(error);
  const label = provider === "google" ? "Gemini" : "Claude";
  const console = provider === "google" ? "aistudio.google.com" : "console.anthropic.com → Billing";
  switch (kind) {
    case "free_daily":
      return { message: `${label} dejó de responder porque se agotó la cuota diaria gratuita de la API.`, detail: `Para continuar ahora, usa un proyecto de API con facturación habilitada y actualiza su clave en Ajustes, o espera la renovación de la cuota. Revisa el proyecto en ${console}.`, retryable: false };
    case "free_unavailable":
      return { message: `${label} no tiene cuota gratuita disponible para esta petición.`, detail: `Para continuar, usa un proyecto de API con facturación habilitada y actualiza su clave en Ajustes. Revisa el proyecto y el modelo en ${console}.`, retryable: false };
    case "billing":
      return { message: `${label} rechazó la petición por falta de saldo o un requisito de facturación.`, detail: `Revisa la facturación, el saldo y el límite de gasto en ${console}. Si usas otro proyecto o cuenta de API con facturación, actualiza su clave en Ajustes.`, retryable: false };
    case "daily":
      return { message: `${label} agotó la cuota diaria del proyecto para esta petición.`, detail: `Espera su renovación o revisa los límites del proyecto en ${console}. El proveedor no indicó que se trate del plan gratuito.`, retryable: false };
    case "rate":
      return { message: `${label} está limitando temporalmente las peticiones.`, detail: "Espera un momento y vuelve a intentarlo. Este límite temporal no significa que se haya agotado la cuota gratuita ni que debas activar facturación.", retryable: true };
    default:
      return { message: `${label} está limitando las peticiones por una restricción de cuota del proveedor.`, detail: `No especificó si es un límite temporal o de consumo. Espera un momento y, si persiste, revisa la cuota y la facturación en ${console}.`, retryable: true };
  }
}
