import { dateKey, fromDateKey } from "@/lib/utils";
import { requireDay } from "@/lib/validation";

/** Una semana se identifica por su lunes; no son contadores acumulados. */
export function weekStart(day: string) {
  const date = fromDateKey(requireDay(day));
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date.toISOString().slice(0, 10);
}
export function requireWeekStart(day: string) {
  requireDay(day);
  if (weekStart(day) !== day) throw new Error("Elige el lunes de la semana que estás registrando.");
  return fromDateKey(day);
}
export function currentWeek(now = new Date()) { return weekStart(dateKey(now)); }
