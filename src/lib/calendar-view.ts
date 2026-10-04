import type { Prisma } from "@prisma/client";

import { CHAIN_STEP_RULES, PRODUCTION_STEP_MAP } from "@/lib/constants";
import { profileGrants, type AccessUser } from "@/lib/permissions";
import type { StepCalendarEntry } from "@/lib/production-scope";
import { DIAS_CORTOS, addDays, dateKey, endOfDay, fromDateKey, monthGrid, startOfDay } from "@/lib/utils";
import { validDay } from "@/lib/validation";

/**
 * Vista mensual del calendario, para el Dueño y para el Equipo.
 *
 * Cada video puede ocupar dos días: el de grabación (shootDate) y el de
 * publicación (scheduledDate). Aquí viven el interruptor y las funciones puras
 * que reparten videos y agenda por día; las páginas solo consultan y pintan.
 *
 * Con la cadena de entregas encendida (PRODUCTION_CHAIN_ENABLED) y CALENDARIO_PASOS, el
 * calendario suma los pasos de producción (Guion, Grabar, Editar, Publicar, Diseño) en su
 * plazo (`dueAt`), con responsable y estado. Un paso Grabar o Publicar reemplaza al chip
 * que se derivaba de la fecha del video: una sola fecha por cosa. Módulo puro a propósito
 * (sin Prisma ni sesión): las páginas consultan y aquí solo se decide qué se pinta.
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

/** Chips que salen de las fechas del video (shootDate y scheduledDate). */
export type VideoEntryKind = "GRABACION" | "PUBLICACION";
/** PASO: un paso de producción con plazo (solo con la cadena y CALENDARIO_PASOS). */
export type CalendarEntryKind = VideoEntryKind | "PASO";

export const ENTRY_KIND_LABEL: Record<CalendarEntryKind, string> = {
  GRABACION: "Grabar",
  PUBLICACION: "Publicar",
  PASO: "Paso",
};

/** Pasos que se pintan en el calendario, con el verbo corto del chip. */
export type StepChipKind = "GUION" | "REVISION_GUION" | "GRABACION" | "EDICION" | "REVISION_FINAL" | "PUBLICACION" | "DISENO";
export const STEP_CHIP_KINDS: readonly StepChipKind[] = ["GUION", "REVISION_GUION", "GRABACION", "EDICION", "REVISION_FINAL", "PUBLICACION", "DISENO"];
export const STEP_CHIP_LABEL: Record<StepChipKind, string> = {
  GUION: "Guion",
  REVISION_GUION: "Revisión de guion",
  REVISION_FINAL: "Revisión final",
  GRABACION: "Grabar",
  EDICION: "Editar",
  PUBLICACION: "Publicar",
  DISENO: "Diseño",
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
export type CalendarEntry<T> = T & { kind: VideoEntryKind; date: Date };

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

/** Orden de la cadena dentro del día: Guion, Grabar, Editar, Publicar y Diseño al final. */
const ORDEN_PASO: Record<StepChipKind, number> = { GUION: 0, REVISION_GUION: 1, GRABACION: 2, EDICION: 3, REVISION_FINAL: 4, PUBLICACION: 5, DISENO: 6 };
const ORDEN_KIND: Record<VideoEntryKind, number> = { GRABACION: ORDEN_PASO.GRABACION, PUBLICACION: ORDEN_PASO.PUBLICACION };

type Ordenable = { kind: CalendarEntryKind; date: Date; title: string; step?: string };

function ordenDe(e: Ordenable): number {
  if (e.kind === "PASO") return ORDEN_PASO[e.step as StepChipKind] ?? 9;
  return ORDEN_KIND[e.kind];
}

/** Entradas por día de Lima; dentro de cada día, el orden de la cadena (primero lo que se graba). */
export function groupEntriesByDay<T extends Ordenable>(entries: T[]): Map<string, T[]> {
  const porDia = new Map<string, T[]>();
  for (const e of entries) {
    const key = dateKey(e.date);
    const lista = porDia.get(key);
    if (lista) lista.push(e);
    else porDia.set(key, [e]);
  }
  for (const lista of porDia.values()) {
    lista.sort((a, b) => ordenDe(a) - ordenDe(b) || a.title.localeCompare(b.title, "es"));
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
  V extends Ordenable,
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

/* ------------------------------------------------------------------ PASOS -- */

/** Un paso de producción pintado en el calendario, en el día de su plazo. */
export type CalendarStepEntry = {
  kind: "PASO";
  /** Id del paso (ProductionStep). */
  id: string;
  videoId: string;
  step: StepChipKind;
  /** Verbo corto del chip: Guion, Grabar, Editar, Publicar o Diseño. */
  label: string;
  title: string;
  date: Date;
  /** Hora del plazo solo en Diseño (24 h); el resto vence al final del día. */
  time: string | null;
  brandName: string;
  /** Color del tipo de paso (PRODUCTION_STEP_MAP). */
  color: string;
  /** null: «Sin asignar». */
  assigneeName: string | null;
  status: "PENDIENTE" | "HECHO";
  overdue: boolean;
  /** Volvió con «Devolver»: el paso siguiente de la cadena quedó DEVUELTO. */
  returned: boolean;
  unassigned: boolean;
  /** Es de quien mira: en «Solo lo mío» el nombre del responsable sobra. */
  mine: boolean;
};

/**
 * Pasos que vuelven a estar pendientes por una devolución: si el paso T de un video quedó
 * DEVUELTO, el paso al que devuelve (CHAIN_STEP_RULES[T].returnsTo) está «Devuelto».
 * Claves `${videoId}:${paso}`.
 */
export function returnedStepKeys(rows: { contentItemId: string; step: string; status: string }[]): Set<string> {
  const out = new Set<string>();
  for (const row of rows) {
    if (row.status !== "DEVUELTO") continue;
    const back = CHAIN_STEP_RULES[row.step as keyof typeof CHAIN_STEP_RULES]?.returnsTo;
    if (back) out.add(`${row.contentItemId}:${back}`);
  }
  return out;
}

/** Filas de pasos del calendario (stepCalendarEntries) → chips con estado. */
export function toCalendarSteps(
  entries: StepCalendarEntry[],
  { returned = new Set<string>(), userId }: { returned?: ReadonlySet<string>; userId: string },
): CalendarStepEntry[] {
  return entries.map((e) => {
    const step = (STEP_CHIP_KINDS.includes(e.step) ? e.step : "DISENO") as StepChipKind;
    const pendiente = e.status === "PENDIENTE";
    return {
      kind: "PASO" as const,
      id: e.id,
      videoId: e.videoId,
      step,
      label: STEP_CHIP_LABEL[step],
      title: e.title,
      date: e.date,
      time: step === "DISENO" ? e.time : null,
      brandName: e.brandName,
      color: e.color || PRODUCTION_STEP_MAP[step]?.hex || "#64748b",
      assigneeName: e.assigneeName,
      status: e.status,
      overdue: pendiente && e.overdue,
      returned: pendiente && returned.has(`${e.videoId}:${e.step}`),
      unassigned: pendiente && !e.assigneeId,
      mine: Boolean(e.assigneeId) && e.assigneeId === userId,
    };
  });
}

/** Estados del chip, del más urgente al menos. Hecho excluye a los demás. */
export function stepFlags(s: Pick<CalendarStepEntry, "status" | "overdue" | "returned" | "unassigned">): string[] {
  if (s.status === "HECHO") return ["Hecho"];
  const flags: string[] = [];
  if (s.overdue) flags.push("Vencido");
  if (s.returned) flags.push("Devuelto");
  if (s.unassigned) flags.push("Sin asignar");
  return flags.length ? flags : ["Pendiente"];
}

/** Texto completo del chip (title y aria-label): tipo, marca, video, hora, responsable y estado. */
export function stepDescription(s: CalendarStepEntry): string {
  return [s.label, s.brandName, s.title, s.time ? `vence a las ${s.time}` : null, s.assigneeName ?? "Sin asignar", ...stepFlags(s)]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Una sola fecha por cosa: los chips Grabar/Publicar derivados de la fecha del video se
 * quitan cuando un paso visible los cubre (`${videoId}:GRABACION|PUBLICACION`).
 */
export function dedupeVideoEntries<T extends { id: string; kind: VideoEntryKind }>(entries: T[], covered: Iterable<string>): T[] {
  const cubiertas = covered instanceof Set ? (covered as Set<string>) : new Set(covered);
  if (!cubiertas.size) return entries;
  return entries.filter((e) => !cubiertas.has(`${e.id}:${e.kind}`));
}

/**
 * «Solo lo mío» por defecto: activo para quien ve el calendario por asignación (filmmaker,
 * editor, talento, diseñador) y para el community; apagado para el Dueño y para quien tiene
 * un perfil de marca completo (estrategia, guion, producción).
 */
export function mineByDefault(user: AccessUser): boolean {
  if (user.role === "OWNER") return false;
  return profileGrants(user, "calendar.view").every((g) => g.scope === "assigned" || g.id === "PUBLISHER");
}

/** ?mio=1 lo enciende, ?mio=0 lo apaga; sin valor, el de su perfil. */
export function resolveMine(value: unknown, user: AccessUser): boolean {
  if (value === "1") return true;
  if (value === "0") return false;
  return mineByDefault(user);
}

/** Valor de ?mio= que conserva la elección en los enlaces (undefined si es la de su perfil). */
export function mineParam(mine: boolean, user: AccessUser): string | undefined {
  return mine === mineByDefault(user) ? undefined : mine ? "1" : "0";
}

/** Título de un paso en el feed ICS: «Editar · Marca: título». */
export function feedStepTitle(step: string, brandName: string, title: string): string {
  const rule = CHAIN_STEP_RULES[step as keyof typeof CHAIN_STEP_RULES];
  return `${rule?.task ?? PRODUCTION_STEP_MAP[step]?.label ?? step} · ${brandName}: ${title}`;
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
