import { dateKey, endOfDay, fromDateKey, parseJson } from "@/lib/utils";

/**
 * Días hábiles del flujo de producción, siempre en el día de negocio de Lima
 * (APP_TIMEZONE). Se trabaja de lunes a sábado; el domingo no se trabaja.
 *
 * Todo opera sobre claves "AAAA-MM-DD" (dateKey) para no depender de la zona
 * del servidor: fromDateKey fija el mediodía UTC, que en Lima cae el mismo día.
 * Lima no tiene horario de verano, así que "24 horas después" es la misma hora
 * del día siguiente.
 */

const DAY_MS = 86_400_000;
const KEY = /^\d{4}-\d{2}-\d{2}$/;

/** 0 = domingo … 6 = sábado, del día de negocio. */
export function weekdayOfKey(key: string): number {
  return fromDateKey(key).getUTCDay();
}

/** Suma días a una clave de día sin pasar por la zona del servidor. */
export function addDaysToKey(key: string, days: number): string {
  return new Date(fromDateKey(key).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** Lunes a sábado. */
export function isWorkingDay(key: string): boolean {
  return weekdayOfKey(key) !== 0;
}

/** El siguiente día hábil estrictamente posterior: sábado → lunes, domingo → lunes, viernes → sábado. */
export function nextWorkingDayKey(key: string): string {
  let next = addDaysToKey(key, 1);
  while (!isWorkingDay(next)) next = addDaysToKey(next, 1);
  return next;
}

/** El n-ésimo día hábil estrictamente posterior (n ≥ 1): lunes + 2 → miércoles; sábado + 2 → martes. */
export function addWorkingDaysKey(key: string, n: number): string {
  let day = key;
  for (let i = 0; i < Math.max(1, Math.trunc(n)); i++) day = nextWorkingDayKey(day);
  return day;
}

/**
 * Plazo del guion en la cadena de entregas: fin del segundo día hábil desde que nace el paso
 * (lunes → miércoles, viernes → lunes, sábado o domingo → martes).
 */
export function scriptDueKey(bornKey: string): string {
  return addWorkingDaysKey(bornKey, 2);
}

/**
 * Primer día en que se puede publicar sin adelantarse a la grabación: el día hábil siguiente
 * al plazo de edición (grabación → edición al día hábil siguiente → publicación al otro).
 */
export function earliestPublicationKey(shootKey: string): string {
  return nextWorkingDayKey(nextWorkingDayKey(shootKey));
}

/** Solo días 1 (lunes) a 6 (sábado), sin repetir y en orden. Tolera JSON viejo o dañado. */
export function normalizeWeekdays(values: readonly unknown[]): number[] {
  return [...new Set(values.filter((v): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 6))].sort((a, b) => a - b);
}

export function parseRecordingWeekdays(value: string | null | undefined): number[] {
  const parsed = parseJson<unknown>(value ?? "[]", []);
  return Array.isArray(parsed) ? normalizeWeekdays(parsed) : [];
}

/**
 * Próximo día de grabación estrictamente posterior a hoy entre los días elegidos
 * por la marca. Sin días elegidos, el siguiente día hábil.
 */
export function nextRecordingDayKey(todayKey: string, weekdays: readonly number[]): string {
  const days = normalizeWeekdays(weekdays);
  if (!days.length) return nextWorkingDayKey(todayKey);
  for (let offset = 1; offset <= 7; offset++) {
    const candidate = addDaysToKey(todayKey, offset);
    if (days.includes(weekdayOfKey(candidate))) return candidate;
  }
  return nextWorkingDayKey(todayKey);
}

/**
 * Plazo de la edición: el día hábil siguiente a la grabación (sábado → lunes).
 * Si ese día ya pasó (la grabación se registró tarde), nunca nace vencido: se
 * usa hoy si es hábil o el siguiente hábil.
 */
export function editingDueKey(recordedKey: string, todayKey: string): string {
  const due = nextWorkingDayKey(recordedKey);
  if (due >= todayKey) return due;
  return isWorkingDay(todayKey) ? todayKey : nextWorkingDayKey(todayKey);
}

/**
 * Plazo de la publicación: el día hábil siguiente a hoy; si el calendario ya
 * tenía prevista una fecha posterior, se respeta esa fecha.
 */
export function publicationDueKey(todayKey: string, scheduledKey?: string | null): string {
  const next = nextWorkingDayKey(todayKey);
  return scheduledKey && KEY.test(scheduledKey) && scheduledKey > next ? scheduledKey : next;
}

/** Fin del día de negocio (23:59:59.999 en Lima) de una clave. */
export function endOfDayKey(key: string): Date {
  return endOfDay(fromDateKey(key));
}

/**
 * 24 horas después; si ese momento cae en domingo, el lunes a la misma hora.
 * Es el plazo de un diseño pedido por el guionista.
 */
export function dueIn24hSkippingSunday(now: Date): Date {
  const due = new Date(now.getTime() + DAY_MS);
  return isWorkingDay(dateKey(due)) ? due : new Date(due.getTime() + DAY_MS);
}

/** "vence en 5 h", "vence en 2 d", "venció hace 3 h": legible y sin inventar precisión. */
export function dueLabel(dueAt: Date | null, now: Date = new Date()): string {
  if (!dueAt) return "Sin fecha";
  const diff = dueAt.getTime() - now.getTime();
  const minutes = Math.round(Math.abs(diff) / 60_000);
  const amount = minutes < 60 ? `${Math.max(1, minutes)} min` : minutes < 48 * 60 ? `${Math.round(minutes / 60)} h` : `${Math.round(minutes / 1440)} d`;
  return diff >= 0 ? `vence en ${amount}` : `venció hace ${amount}`;
}
