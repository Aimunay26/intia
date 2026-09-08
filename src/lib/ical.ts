import { randomBytes, timingSafeEqual } from "node:crypto";

import { getSetting, setSetting } from "@/lib/settings";

/**
 * Feed iCal para Google Calendar.
 *
 * Google Calendar (y Outlook, y el calendario del iPhone) saben suscribirse a
 * una URL que devuelve un archivo .ics y refrescarla sola cada pocas horas.
 * Así todo lo que hay aquí —videos programados, días de grabación, reuniones y
 * pendientes— aparece en el calendario del equipo sin que nadie copie nada.
 *
 * Como Google pide la URL desde sus servidores, sin cookies, la dirección lleva
 * un token secreto. Quien tenga esa URL ve la agenda: se puede rotar cuando
 * haga falta desde Ajustes.
 */

const FEED_TOKEN_KEY = "calendar.feedToken";

export async function getFeedToken(): Promise<string | null> {
  const existente = await getSetting(FEED_TOKEN_KEY);
  if (existente && existente.length >= 24) return existente;

  return null;
}

export async function rotarFeedToken(): Promise<string> {
  const nuevo = randomBytes(24).toString("base64url");
  await setSetting(FEED_TOKEN_KEY, nuevo);
  return nuevo;
}

export async function tokenEsValido(token: string | null): Promise<boolean> {
  if (!token) return false;
  const actual = await getSetting(FEED_TOKEN_KEY);
  if (!actual) return false;

  // Comparación de tiempo constante: un `===` normal corta en el primer
  // carácter distinto y filtra información por el tiempo de respuesta.
  const a = Buffer.from(actual, "utf8");
  const b = Buffer.from(token, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/* ------------------------------------------------------------ FORMATO ICS -- */

/** Escapa los caracteres que iCalendar trata como especiales. */
function esc(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** 20260314T153000Z */
function stampUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** 20260314 — para eventos de día completo. */
function stampDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function addDays(d: Date, days: number) {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

/**
 * Las líneas de un .ics no pueden pasar de 75 OCTETOS: se parten con un
 * espacio al principio de la continuación. Sin esto, Google descarta el feed.
 *
 * Se cuentan octetos, no caracteres: en español casi todo lleva tildes y ñ,
 * que ocupan dos bytes, y los emojis cuatro. Contar caracteres dejaría pasar
 * líneas que en realidad se exceden. Se corta por carácter completo para no
 * partir una tilde ni un emoji por la mitad.
 */
function plegar(linea: string): string {
  const bytes = (s: string) => Buffer.byteLength(s, "utf8");
  if (bytes(linea) <= 73) return linea;

  const partes: string[] = [];
  let actual = "";
  let limite = 73; // la primera línea no lleva el espacio de continuación

  for (const caracter of Array.from(linea)) {
    if (bytes(actual) + bytes(caracter) > limite) {
      partes.push(actual);
      actual = "";
      limite = 72; // las siguientes sí llevan el espacio inicial
    }
    actual += caracter;
  }
  if (actual) partes.push(actual);

  return partes.map((p, i) => (i === 0 ? p : " " + p)).join("\r\n");
}

export type IcsEvent = {
  uid: string;
  title: string;
  description?: string | null;
  location?: string | null;
  start: Date;
  end?: Date | null;
  allDay: boolean;
  url?: string | null;
  updatedAt?: Date | null;
};

export function buildIcs(nombre: string, eventos: IcsEvent[]): string {
  const ahora = new Date();
  const lineas: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Marketing OS//Calendario//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    plegar(`X-WR-CALNAME:${esc(nombre)}`),
    "X-WR-TIMEZONE:America/Lima",
    // Cada cuánto sugerimos a Google que vuelva a leer el feed.
    "REFRESH-INTERVAL;VALUE=DURATION:PT2H",
    "X-PUBLISHED-TTL:PT2H",
  ];

  for (const e of eventos) {
    lineas.push("BEGIN:VEVENT");
    lineas.push(`UID:${e.uid}`);
    lineas.push(`DTSTAMP:${stampUtc(ahora)}`);

    if (e.allDay) {
      // En iCalendar el fin de un evento de día completo es exclusivo:
      // un evento de un solo día termina "al día siguiente".
      const fin = e.end ? addDays(e.end, 1) : addDays(e.start, 1);
      lineas.push(`DTSTART;VALUE=DATE:${stampDate(e.start)}`);
      lineas.push(`DTEND;VALUE=DATE:${stampDate(fin)}`);
    } else {
      const fin = e.end ?? new Date(e.start.getTime() + 60 * 60 * 1000);
      lineas.push(`DTSTART:${stampUtc(e.start)}`);
      lineas.push(`DTEND:${stampUtc(fin)}`);
    }

    lineas.push(plegar(`SUMMARY:${esc(e.title)}`));
    if (e.description) lineas.push(plegar(`DESCRIPTION:${esc(e.description)}`));
    if (e.location) lineas.push(plegar(`LOCATION:${esc(e.location)}`));
    if (e.url) lineas.push(plegar(`URL:${esc(e.url)}`));
    if (e.updatedAt) lineas.push(`LAST-MODIFIED:${stampUtc(e.updatedAt)}`);
    lineas.push("END:VEVENT");
  }

  lineas.push("END:VCALENDAR");
  return lineas.join("\r\n") + "\r\n";
}
