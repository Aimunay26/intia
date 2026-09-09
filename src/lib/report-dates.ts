import { validDay } from "@/lib/validation";
import { weekStart } from "@/lib/weekly-metrics";
const DAY_MS = 86_400_000;

/** Semanas completas; nunca reparte valores semanales entre días. */
export function weeklyDateRange(from?: string, to?: string, now = new Date()) {
  const range = metricDateRange(from, to, now);
  const hasta = shiftReportDay(weekStart(range.hasta), 6);
  let desde = weekStart(range.desde);
  const days = Math.min(364, Math.round((Date.parse(hasta) - Date.parse(desde)) / DAY_MS) + 1);
  desde = shiftReportDay(hasta, 1 - days);
  return { desde, hasta, days, previousFrom: shiftReportDay(desde, -days), previousTo: shiftReportDay(desde, -1) };
}
export function validReportDay(value: string | undefined): value is string {
  return Boolean(value && validDay(value));
}
export function shiftReportDay(day: string, offset: number) {
  return new Date(new Date(`${day}T12:00:00.000Z`).getTime() + offset * DAY_MS).toISOString().slice(0, 10);
}
export function metricDateRange(from?: string, to?: string, now = new Date()) {
  // La fecha por defecto corresponde al día del negocio, aunque Vercel esté en UTC.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  let hasta = validReportDay(to) ? to : today;
  let desde = validReportDay(from) ? from : shiftReportDay(hasta, -29);
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  const days = Math.min(366, Math.round((Date.parse(hasta) - Date.parse(desde)) / DAY_MS) + 1);
  desde = shiftReportDay(hasta, 1 - days);
  return { desde, hasta, days, previousFrom: shiftReportDay(desde, -days), previousTo: shiftReportDay(desde, -1) };
}
