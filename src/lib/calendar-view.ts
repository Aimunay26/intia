import type { Prisma } from "@prisma/client";

import { DIAS_CORTOS, addDays, dateKey, endOfDay, fromDateKey, monthGrid, startOfDay } from "@/lib/utils";
import { validDay } from "@/lib/validation";

/**
 * Vista mensual del calendario, para el Dueño y para el Equipo.
 *
 * Cada video puede ocupar dos días: el de grabación (shootDate) y el de
 * publicación (scheduledDate). Aquí viven el interruptor y las funciones puras
 * que reparten videos y agenda por día; las páginas solo consultan y pintan.
 */

/* ----------------------------------------------------------- INTERRUPTOR -- */

/**
 * CALENDARIO_MENSUAL: encendido por defecto. Solo el valor "false" lo apaga y
 * devuelve la lista de 31 días del Equipo y la rejilla anterior del Dueño
 * (solo fecha de publicación, sin detalle por día ni lista móvil).
 */
export function calendarioMensualActivo(env: Record<string, string | undefined> = process.env): boolean {
  return env.CALENDARIO_MENSUAL?.trim().toLowerCase() !== "false";
}

/* ----------------------------------------------------------------- TIPOS -- */

export type CalendarEntryKind = "GRABACION" | "PUBLICACION";

export const ENTRY_KIND_LABEL: Record<CalendarEntryKind, string> = {
  GRABACION: "Grabar",
  PUBLICACION: "Publicar",
};

/** Tope de cordura para eventos con un fin absurdo. */
export const MAX_DIAS_EVENTO = 60;

/** Huecos por día en la rejilla: la agenda ocupa como mucho dos. */
export const MAX_POR_DIA = 4;

/* ----------------------------------------------------------------- FECHAS -- */

const MIN_YEAR = 1900;
const MAX_YEAR = 9998;

/** Año y mes (0-11) de hoy en Lima. */
export function currentMonth(now: Date = new Date()): { year: number; month: number } {
  const [year, month] = dateKey(now).split("-").map(Number);
  return { year, month: month - 1 };
}

/** Mes pedido por ?anio=&mes= (0-11). Si falta o no es válido, el mes de hoy en Lima. */
export function resolveMonth(anio: unknown, mes: unknown, now: Date = new Date()): { year: number; month: number } {
  const hoy = currentMonth(now);
  const year = typeof anio === "string" && /^\d{4}$/.test(anio) ? Number(anio) : NaN;
  const month = typeof mes === "string" && /^\d{1,2}$/.test(mes) ? Number(mes) : NaN;
  return {
    year: Number.isInteger(year) && year >= MIN_YEAR && year <= MAX_YEAR ? year : hoy.year,
    month: Number.isInteger(month) && month >= 0 && month <= 11 ? month : hoy.month,
  };
}

/** ?dia=AAAA-MM-DD si es un día real dentro del rango navegable; si no, null. */
export function parseDayKey(value: unknown): string | null {
  if (typeof value !== "string" || !validDay(value)) return null;
  const year = Number(value.slice(0, 4));
  return year >= MIN_YEAR && year <= MAX_YEAR ? value : null;
}

/** El mes que contiene un día: el detalle de un día abre su propio mes. */
export function monthOfDay(key: string): { year: number; month: number } {
  const [year, month] = key.split("-").map(Number);
  return { year, month: month - 1 };
}

/** Del inicio del día a su último milisegundo, en la hora de Lima. */
export function dayWindow(key: string): { desde: Date; hasta: Date } {
  const dia = fromDateKey(key);
  return { desde: startOfDay(dia), hasta: endOfDay(dia) };
}

/** Las 6 semanas que pinta la rejilla y su ventana de consulta. */
export function monthWindow(year: number, month: number): { grid: Date[]; desde: Date; hasta: Date } {
  const grid = monthGrid(year, month);
  return { grid, desde: startOfDay(grid[0]), hasta: endOfDay(grid[grid.length - 1]) };
}

/** Claves de los días que pertenecen al mes (sin los de relleno de la rejilla). */
export function monthDayKeys(grid: Date[], month: number): string[] {
  return grid.filter((d) => d.getUTCMonth() === month).map((d) => dateKey(d));
}

/** "Lun" y 28 para un día; la semana empieza en lunes. */
export function shortDay(key: string): { semana: string; dia: number } {
  const d = fromDateKey(key);
  return { semana: DIAS_CORTOS[(d.getUTCDay() + 6) % 7], dia: d.getUTCDate() };
}

/* ------------------------------------------------------------- CONSULTAS -- */

/**
 * Videos que caen en la ventana. Con grabación: por cualquiera de sus dos
 * fechas; sin ella (interruptor apagado): solo por publicación.
 */
export function videoDateWhere(desde: Date, hasta: Date, conGrabacion: boolean): Prisma.ContentItemWhereInput {
  const rango = { gte: desde, lte: hasta };
  return conGrabacion ? { OR: [{ scheduledDate: rango }, { shootDate: rango }] } : { scheduledDate: rango };
}

/** Eventos que tocan la ventana, también los de varios días que empezaron antes. */
export function eventOverlapWhere(desde: Date, hasta: Date): Prisma.CalendarEventWhereInput {
  return { startAt: { lte: hasta }, OR: [{ startAt: { gte: desde } }, { endAt: { gte: desde } }] };
}

/** ¿El evento toca el rango [desde, hasta]? */
export function eventTouches(e: { startAt: Date; endAt: Date | null }, desde: Date, hasta: Date): boolean {
  const fin = e.endAt && e.endAt > e.startAt ? e.endAt : e.startAt;
  return e.startAt <= hasta && fin >= desde;
}

/* -------------------------------------------------------------- REPARTO -- */

export type VideoDates = { title: string; scheduledDate: Date; shootDate?: Date | null };
export type CalendarEntry<T> = T & { kind: CalendarEntryKind; date: Date };

/**
 * Una entrada por fecha del video: grabación (si la tiene y se pide) y
 * publicación. Con ventana, se descartan las fechas que caen fuera.
 */
export function videoEntries<T extends VideoDates>(
  videos: T[],
  { grabacion, desde, hasta }: { grabacion: boolean; desde?: Date; hasta?: Date },
): CalendarEntry<T>[] {
  const dentro = (d: Date) => (!desde || d >= desde) && (!hasta || d <= hasta);
  const out: CalendarEntry<T>[] = [];
  for (const v of videos) {
    if (grabacion && v.shootDate && dentro(v.shootDate)) out.push({ ...v, kind: "GRABACION", date: v.shootDate });
    if (dentro(v.scheduledDate)) out.push({ ...v, kind: "PUBLICACION", date: v.scheduledDate });
  }
  return out;
}

const ORDEN_KIND: Record<CalendarEntryKind, number> = { GRABACION: 0, PUBLICACION: 1 };

/** Entradas por día de Lima; dentro de cada día, primero lo que se graba. */
export function groupEntriesByDay<T extends { kind: CalendarEntryKind; date: Date; title: string }>(
  entries: T[],
): Map<string, T[]> {
  const porDia = new Map<string, T[]>();
  for (const e of entries) {
    const key = dateKey(e.date);
    const lista = porDia.get(key);
    if (lista) lista.push(e);
    else porDia.set(key, [e]);
  }
  for (const lista of porDia.values()) {
    lista.sort((a, b) => ORDEN_KIND[a.kind] - ORDEN_KIND[b.kind] || a.title.localeCompare(b.title, "es"));
  }
  return porDia;
}

/** Días (claves de Lima) que ocupa un evento: todos, no solo el primero. */
export function eventDayKeys(startAt: Date, endAt: Date | null, max: number = MAX_DIAS_EVENTO): string[] {
  const primero = dateKey(startAt);
  const ultimo = dateKey(endAt && endAt > startAt ? endAt : startAt);
  const keys: string[] = [];
  let dia = fromDateKey(primero);
  while (keys.length < max) {
    const key = dateKey(dia);
    if (key > ultimo) break;
    keys.push(key);
    dia = addDays(dia, 1);
  }
  return keys;
}

/** Agenda por día; los que duran varios días aparecen en cada uno. */
export function groupEventsByDay<T extends { startAt: Date; endAt: Date | null }>(events: T[]): Map<string, T[]> {
  const porDia = new Map<string, T[]>();
  for (const e of events) {
    for (const key of eventDayKeys(e.startAt, e.endAt)) {
      const lista = porDia.get(key);
      if (lista) lista.push(e);
      else porDia.set(key, [e]);
    }
  }
  return porDia;
}

/**
 * Detalle de un día (?dia=): sus videos por cualquiera de las dos fechas y la
 * agenda que lo toca. Se filtra sobre lo ya consultado con el mismo alcance y
 * la misma marca activa, así el detalle nunca enseña más que la rejilla.
 */
export function itemsOfDay<
  V extends { kind: CalendarEntryKind; date: Date; title: string },
  E extends { startAt: Date; endAt: Date | null },
>(key: string, videos: V[], eventos: E[]): { key: string; videos: V[]; eventos: E[] } {
  return {
    key,
    videos: groupEntriesByDay(videos.filter((v) => dateKey(v.date) === key)).get(key) ?? [],
    eventos: eventos.filter((e) => eventDayKeys(e.startAt, e.endAt).includes(key)),
  };
}

/**
 * Cuánto cabe en una celda: la agenda ocupa como mucho dos huecos, el resto es
 * para los videos (al menos uno), y "+N más" cuenta lo escondido de ambas.
 */
export function daySlots(videos: number, eventos: number, max: number = MAX_POR_DIA) {
  const agenda = Math.min(eventos, 2);
  const cupoVideos = Math.max(1, max - agenda);
  const visibles = Math.min(videos, cupoVideos);
  return { agenda, videos: visibles, resto: videos - visibles + (eventos - agenda) };
}

/* ------------------------------------------------------------ LISTA MÓVIL -- */

export type ListSegment =
  | { tipo: "dia"; key: string }
  | { tipo: "vacio"; desde: string; hasta: string; dias: number };

function segments(keys: string[], conDatos: Set<string>): ListSegment[] {
  const out: ListSegment[] = [];
  for (const key of keys) {
    if (conDatos.has(key)) {
      out.push({ tipo: "dia", key });
      continue;
    }
    const last = out[out.length - 1];
    if (last?.tipo === "vacio") {
      last.hasta = key;
      last.dias += 1;
    } else out.push({ tipo: "vacio", desde: key, hasta: key, dias: 1 });
  }
  return out;
}

/**
 * Lista del mes para pantallas estrechas. Si hoy cae en el mes, va primero y
 * los días ya pasados quedan aparte (plegados); los días sin nada se agrupan
 * en tramos para no ocupar pantalla.
 */
export function mobileList(keys: string[], conDatos: Set<string>, hoy: string) {
  if (!keys.includes(hoy)) return { hoy: null, siguientes: segments(keys, conDatos), anteriores: [] as ListSegment[] };
  return {
    hoy,
    siguientes: segments(keys.filter((k) => k > hoy), conDatos),
    anteriores: segments(keys.filter((k) => k < hoy), conDatos),
  };
}
