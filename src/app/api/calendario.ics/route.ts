import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { buildIcs, tokenEsValido, type IcsEvent } from "@/lib/ical";
import {
  CONTENT_STATUS_MAP,
  DEAD_STATUSES,
  EVENT_KIND_MAP,
  PLATFORM_MAP,
} from "@/lib/constants";
import { getSetting, SETTING_KEYS } from "@/lib/settings";
import { parseList } from "@/lib/utils";

/**
 * Feed de calendario para suscribir desde Google Calendar.
 *
 *   /api/calendario.ics?token=XXXX             todas las marcas
 *   /api/calendario.ics?token=XXXX&marca=ID    solo una marca
 *
 * Incluye los videos programados, sus días de grabación y todo lo de la agenda
 * (reuniones, pendientes, recordatorios). Google lo relee solo cada pocas horas.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!(await tokenEsValido(token))) {
    return new NextResponse("Token de calendario no válido.", { status: 401 });
  }

  const brandId = url.searchParams.get("marca");
  const origen = url.origin;

  // Ventana razonable: seis meses atrás y un año por delante.
  const desde = new Date();
  desde.setMonth(desde.getMonth() - 6);
  const hasta = new Date();
  hasta.setFullYear(hasta.getFullYear() + 1);

  const [videos, eventos, orgName, marca] = await Promise.all([
    prisma.contentItem.findMany({
      where: {
        scheduledDate: { gte: desde, lte: hasta },
        // Un video cancelado o pausado no deberia ocupar sitio en la agenda.
        status: { notIn: DEAD_STATUSES },
        ...(brandId ? { brandId } : {}),
      },
      select: {
        id: true,
        title: true,
        status: true,
        platforms: true,
        hook: true,
        scheduledDate: true,
        shootDate: true,
        updatedAt: true,
        brand: { select: { name: true } },
      },
    }),
    prisma.calendarEvent.findMany({
      where: {
        startAt: { gte: desde, lte: hasta },
        ...(brandId ? { brandId } : {}),
      },
      select: {
        id: true,
        title: true,
        description: true,
        kind: true,
        startAt: true,
        endAt: true,
        allDay: true,
        location: true,
        updatedAt: true,
        brand: { select: { name: true } },
      },
    }),
    getSetting(SETTING_KEYS.orgName),
    brandId
      ? prisma.brand.findUnique({ where: { id: brandId }, select: { name: true } })
      : Promise.resolve(null),
  ]);

  const items: IcsEvent[] = [];

  for (const v of videos) {
    const estado = CONTENT_STATUS_MAP[v.status]?.label ?? v.status;
    const redes = parseList(v.platforms)
      .map((p) => PLATFORM_MAP[p]?.label ?? p)
      .join(", ");

    items.push({
      uid: `video-${v.id}@marketing-os`,
      title: `🎬 ${v.brand.name}: ${v.title}`,
      description: [
        `Estado: ${estado}`,
        redes ? `Redes: ${redes}` : "",
        v.hook ? `Hook: ${v.hook}` : "",
        `Ver ficha: ${origen}/contenido/${v.id}`,
      ]
        .filter(Boolean)
        .join("\n"),
      start: v.scheduledDate,
      allDay: true,
      url: `${origen}/contenido/${v.id}`,
      updatedAt: v.updatedAt,
    });

    // El día de grabación va como una entrada aparte: es otro día de trabajo.
    if (v.shootDate) {
      items.push({
        uid: `grabacion-${v.id}@marketing-os`,
        title: `🎥 Grabar: ${v.title}`,
        description: `${v.brand.name}\nVer ficha: ${origen}/contenido/${v.id}`,
        start: v.shootDate,
        allDay: true,
        url: `${origen}/contenido/${v.id}`,
        updatedAt: v.updatedAt,
      });
    }
  }

  const ICONO: Record<string, string> = {
    REUNION: "👥",
    GRABACION: "🎥",
    PENDIENTE: "📌",
    RECORDATORIO: "🔔",
    OTRO: "•",
  };

  for (const e of eventos) {
    const tipo = EVENT_KIND_MAP[e.kind]?.label ?? e.kind;
    items.push({
      uid: `evento-${e.id}@marketing-os`,
      title: `${ICONO[e.kind] ?? "•"} ${e.title}`,
      description: [
        `${tipo}${e.brand ? ` · ${e.brand.name}` : ""}`,
        e.description ?? "",
        `Ver agenda: ${origen}/calendario`,
      ]
        .filter(Boolean)
        .join("\n"),
      location: e.location,
      start: e.startAt,
      end: e.endAt,
      allDay: e.allDay,
      url: `${origen}/calendario`,
      updatedAt: e.updatedAt,
    });
  }

  const nombre = marca
    ? `${orgName || "Marketing OS"} · ${marca.name}`
    : `${orgName || "Marketing OS"} · Calendario`;

  const ics = buildIcs(nombre, items);

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="marketing-os.ics"',
      "Cache-Control": "public, max-age=1800",
    },
  });
}
