/** Utilidades compartidas. Sin dependencias externas. */

/** Une clases de tailwind ignorando falsos. */
export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ JSON -- */

/** Lee un campo de texto que guarda JSON. Nunca lanza. */
export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

export function parseList(value: string | null | undefined): string[] {
  const out = parseJson<unknown>(value, []);
  if (!Array.isArray(out)) return [];
  return out.map((x) => String(x)).filter((x) => x.trim().length > 0);
}

export function stringifyJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return "null";
  }
}

/** Convierte un textarea de una-linea-por-item en JSON de lista. */
export function linesToJson(text: string | null | undefined): string {
  const items = (text ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return JSON.stringify(items);
}

/** Lo contrario: JSON de lista a texto de una-linea-por-item. */
export function jsonToLines(value: string | null | undefined): string {
  return parseList(value).join("\n");
}

/* ------------------------------------------------------------------ TEXTO -- */

export function slugify(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita tildes
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export function truncate(text: string, max: number) {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + "…";
}

/* ----------------------------------------------------------------- NUMEROS -- */

const numberFmt = new Intl.NumberFormat("es-PE");

export function formatNumber(n: number | null | undefined, decimals = 0) {
  if (n === null || n === undefined || Number.isNaN(n)) return "0";
  if (decimals > 0) {
    return new Intl.NumberFormat("es-PE", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(n);
  }
  return numberFmt.format(Math.round(n));
}

/** 12 400 -> 12.4K ; 1 250 000 -> 1.3M */
export function compactNumber(n: number | null | undefined) {
  const v = n ?? 0;
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (Math.abs(v) >= 1_000) return (v / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return formatNumber(v);
}

export function formatMoney(n: number | null | undefined, currency = "S/") {
  return `${currency} ${formatNumber(n ?? 0, 2)}`;
}

export function formatPercent(n: number | null | undefined, decimals = 1) {
  return `${formatNumber(n ?? 0, decimals)}%`;
}

export function safeDivide(a: number, b: number) {
  if (!b) return 0;
  return a / b;
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/** Avance de un objetivo en % (0-100+), respetando si menos es mejor. */
export function objectiveProgress(
  current: number,
  target: number,
  baseline = 0,
  higherIsBetter = true
) {
  if (higherIsBetter) {
    const span = target - baseline;
    if (span <= 0) return current >= target ? 100 : 0;
    return clamp(((current - baseline) / span) * 100, 0, 999);
  }
  // menos es mejor: bajar de baseline hacia target
  const span = baseline - target;
  if (span <= 0) return current <= target ? 100 : 0;
  return clamp(((baseline - current) / span) * 100, 0, 999);
}

/* ------------------------------------------------------------------ FECHAS -- */

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export const DIAS_CORTOS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** yyyy-mm-dd en hora local (no UTC): sirve para inputs date y para agrupar. */
export function dateKey(value: Date | string | null | undefined): string {
  const d = toDate(value);
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Convierte "2026-03-14" a un Date a mediodia local (evita saltos de zona). */
export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}

export function formatDate(value: Date | string | null | undefined) {
  const d = toDate(value);
  if (!d) return "—";
  return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
}

export function formatDateLong(value: Date | string | null | undefined) {
  const d = toDate(value);
  if (!d) return "—";
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

export function formatDateTime(value: Date | string | null | undefined) {
  const d = toDate(value);
  if (!d) return "—";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${formatDate(d)}, ${hh}:${mm}`;
}

export function monthLabel(year: number, month: number) {
  return `${MESES[month]} ${year}`;
}

export function relativeTime(value: Date | string | null | undefined) {
  const d = toDate(value);
  if (!d) return "—";
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const days = Math.round(h / 24);
  if (days < 30) return `hace ${days} d`;
  return formatDate(d);
}

export function startOfMonth(year: number, month: number) {
  return new Date(year, month, 1, 0, 0, 0, 0);
}

export function endOfMonth(year: number, month: number) {
  return new Date(year, month + 1, 0, 23, 59, 59, 999);
}

export function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Devuelve la grilla de 6 semanas (42 dias) que cubre el mes,
 * empezando en lunes.
 */
export function monthGrid(year: number, month: number): Date[] {
  const first = startOfMonth(year, month);
  // getDay(): 0=domingo. Queremos lunes como primer dia.
  const offset = (first.getDay() + 6) % 7;
  const start = addDays(first, -offset);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function isSameDay(a: Date, b: Date) {
  return dateKey(a) === dateKey(b);
}

export function isToday(d: Date) {
  return isSameDay(d, new Date());
}

/* ------------------------------------------------------------ ZONA HORARIA -- */

/**
 * Zona horaria del negocio.
 *
 * Importa porque el servidor puede estar en cualquier parte: en local corre con
 * la hora de esta computadora, pero en Vercel corre en UTC. Sin fijar la zona,
 * una reunión guardada "a las 10:00" acabaría publicándose en Google Calendar
 * cinco horas antes.
 */
export const APP_TIMEZONE = "America/Lima";

/** Minutos de desfase de una zona respecto a UTC en ese instante concreto. */
export function zoneOffsetMinutes(date: Date, timeZone: string = APP_TIMEZONE): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const get = (tipo: string) => Number(parts.find((p) => p.type === tipo)?.value ?? 0);
  const comoUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );
  return (comoUtc - date.getTime()) / 60000;
}

/**
 * Convierte una fecha "2026-03-14" y una hora "10:30" escritas en la zona del
 * negocio al instante real, sin depender de dónde esté el servidor.
 */
export function instantInZone(
  key: string,
  time: string,
  timeZone: string = APP_TIMEZONE
): Date {
  const [y, m, d] = key.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);

  // Primer intento: interpretarlo como si fuera UTC.
  const tentativo = new Date(
    Date.UTC(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0, 0)
  );
  // Y corregir con el desfase real de la zona en ese momento.
  return new Date(tentativo.getTime() - zoneOffsetMinutes(tentativo, timeZone) * 60000);
}

/* ---------------------------------------------------------------- TIEMPO -- */

/** 45 -> "0:45" ; 95 -> "1:35" */
export function formatSeconds(total: number | null | undefined) {
  const s = Math.max(0, Math.round(total ?? 0));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function formatRange(start: number, end: number) {
  return `${formatSeconds(start)} - ${formatSeconds(end)}`;
}

/* ------------------------------------------------------------------ VARIOS -- */

/** Lee un campo de FormData como texto limpio. */
export function field(fd: FormData, name: string): string {
  const v = fd.get(name);
  return typeof v === "string" ? v.trim() : "";
}

export function fieldOrNull(fd: FormData, name: string): string | null {
  const v = field(fd, name);
  return v.length ? v : null;
}

export function numField(fd: FormData, name: string, fallback = 0): number {
  const v = Number(field(fd, name).replace(/,/g, "."));
  return Number.isFinite(v) ? v : fallback;
}

export function intField(fd: FormData, name: string, fallback = 0): number {
  return Math.round(numField(fd, name, fallback));
}

export function boolField(fd: FormData, name: string): boolean {
  const v = fd.get(name);
  return v === "on" || v === "true" || v === "1";
}

export function dateField(fd: FormData, name: string): Date | null {
  const v = field(fd, name);
  if (!v) return null;
  return fromDateKey(v);
}

/** Color de texto legible (blanco o negro) sobre un fondo hex. */
export function readableOn(hex: string) {
  const h = hex.replace("#", "");
  if (h.length < 6) return "#0a0a0a";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#0a0a0a" : "#ffffff";
}

/** hex + alfa -> rgba() css */
export function withAlpha(hex: string, alpha: number) {
  const h = hex.replace("#", "");
  if (h.length < 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
