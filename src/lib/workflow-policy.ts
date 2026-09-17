export const CONTENT_FLOW = ["IDEA", "GUION", "APROBADO", "GRABACION", "EDICION", "PROGRAMADO", "PUBLICADO"];
export const SCRIPT_FLOW = ["BORRADOR", "REVISION", "APROBADO", "GRABADO"];
export class WorkflowError extends Error {}

/** Clasificación pura; permisos y requisitos se comprueban dentro de la transacción. */
export function transition(flow: string[], from: string, to: string, stopped: string) {
  if (from === to) return "same";
  if (to === stopped) return "stop";
  if (from === stopped) return to === flow[0] ? "reopen" : "invalid";
  const a = flow.indexOf(from), b = flow.indexOf(to);
  if (a < 0 || b < 0) return "invalid";
  if (b < a) return "reopen";
  return b === a + 1 ? "advance" : "invalid";
}
