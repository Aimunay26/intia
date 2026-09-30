/**
 * Interruptor del archivado total (M0 del GO «ALSOS marcas independientes», 30/09/2026).
 *
 * ARCHIVO_TOTAL_DESDE es la fecha de la época:
 *  - vacía o ausente: apagado, la app se comporta como antes de M0;
 *  - inválida: apagado, con un aviso en el log (una vez por valor, para no llenarlo);
 *  - válida: la app oculta a todos, también al Dueño en las pantallas operativas, las marcas
 *    archivadas con todo lo que cuelga de ellas y lo que no tiene marca y es anterior a la época.
 *    Los filtros viven en archive-scope.ts; la regla de permisos, en permissions.ts.
 *
 * Formatos aceptados (ISO 8601), los mismos que `scripts/archivo-total.ts` (--desde):
 *  - «AAAA-MM-DD»: las 00:00 UTC de ese día, como `new Date("AAAA-MM-DD")` en el script;
 *  - «AAAA-MM-DDTHH:MM[:SS[.mmm]]» con «Z» o con un desfase «±HH:MM» explícito.
 * Una hora sin zona es ambigua y cuenta como inválida. Lo recomendado es copiar tal cual el valor
 * que imprime el ensayo del script (hora completa en UTC).
 *
 * Módulo sin dependencias a propósito (como production-chain-flag.ts): lo importa permissions.ts,
 * que también corre en el navegador (el menú del Shell), donde la variable no existe y el
 * interruptor queda apagado; el layout le pasa al menú el valor ya resuelto en el servidor
 * (permissionFlags). Se lee process.env en cada llamada, sin guardar el valor: vaciar la variable
 * en Vercel y volver a desplegar surte efecto en la siguiente petición.
 */

type Env = Record<string, string | undefined>;

export const ARCHIVE_EPOCH_ENV = "ARCHIVO_TOTAL_DESDE";

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/;

export type ParsedArchiveEpoch = { epoch: Date | null; invalid: boolean };

function validDay(year: number, month: number, day: number): boolean {
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

/** Pura: interpreta el valor de la variable. Vacío = apagado sin aviso; inválido = apagado con aviso. */
export function parseArchiveEpoch(raw: string | null | undefined): ParsedArchiveEpoch {
  const value = (raw ?? "").trim();
  if (!value) return { epoch: null, invalid: false };
  const dateOnly = DATE_ONLY.exec(value);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    if (!validDay(Number(y), Number(m), Number(d))) return { epoch: null, invalid: true };
    return { epoch: new Date(`${y}-${m}-${d}T00:00:00.000Z`), invalid: false };
  }
  const dateTime = DATE_TIME.exec(value);
  if (!dateTime) return { epoch: null, invalid: true };
  const [, y, m, d, hh, mm, ss = "00", , zone] = dateTime;
  const zoneOk = zone === "Z" || (Number(zone.slice(1, 3)) <= 14 && Number(zone.slice(4, 6)) <= 59);
  if (!validDay(Number(y), Number(m), Number(d)) || Number(hh) > 23 || Number(mm) > 59 || Number(ss) > 59 || !zoneOk) return { epoch: null, invalid: true };
  const epoch = new Date(value);
  return Number.isNaN(epoch.getTime()) ? { epoch: null, invalid: true } : { epoch, invalid: false };
}

/** Último valor inválido avisado: evita repetir el aviso en cada llamada (se lee en cada petición). */
let warnedFor: string | null = null;

/**
 * La época del archivado total, o null si el interruptor está apagado (vacío o inválido).
 * Un valor inválido deja el interruptor apagado y lo registra en el log con el código
 * `archivo_total` / `epoch_invalid` (solo el valor de la variable, que no es secreto).
 */
export function archiveEpoch(env: Env = process.env): Date | null {
  const raw = env[ARCHIVE_EPOCH_ENV];
  const { epoch, invalid } = parseArchiveEpoch(raw);
  if (invalid && raw !== warnedFor) {
    warnedFor = raw ?? null;
    console.warn(JSON.stringify({ event: "archivo_total", reason: "epoch_invalid", value: String(raw).slice(0, 40) }));
  }
  return epoch;
}

/** ¿El interruptor está encendido? Atajo para quien solo necesita el sí o el no. */
export function archiveEpochEnabled(env: Env = process.env): boolean {
  return archiveEpoch(env) !== null;
}
