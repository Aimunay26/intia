const DAY_MS = 86_400_000;
export function validReportDay(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
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
