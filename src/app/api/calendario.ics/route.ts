import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { buildIcs, type IcsEvent } from "@/lib/ical";
import { CALENDAR_CACHE_HEADERS, resolveCalendarSubscription } from "@/lib/calendar-subscriptions";
import { DEAD_STATUSES } from "@/lib/constants";

export const dynamic = "force-dynamic";

/** The token's persisted scope is authoritative. URL filters never enlarge it. */
export async function GET(request: Request) {
  try { return await downloadCalendar(request); }
  catch {
    console.error("[calendar] No se pudo consultar la suscripción.");
    return new NextResponse("Calendario temporalmente no disponible.", { status: 503, headers: CALENDAR_CACHE_HEADERS });
  }
}

async function downloadCalendar(request: Request) {
  const url = new URL(request.url);
  const tokens = url.searchParams.getAll("token");
  const subscription = await resolveCalendarSubscription(tokens.length === 1 ? tokens[0] : null);
  const respond = (text: string, status: number) => new NextResponse(text, { status, headers: CALENDAR_CACHE_HEADERS });
  if (!subscription) return respond("Suscripción de calendario no válida o vencida.", 401);
  const desde = new Date(); desde.setUTCMonth(desde.getUTCMonth() - 6);
  const hasta = new Date(); hasta.setUTCFullYear(hasta.getUTCFullYear() + 1);
  const scope = subscription.scope === "BRAND" ? { brandId: subscription.brandId! } : {};
  const window = { gte: desde, lte: hasta };
  const [videos, events] = await Promise.all([
    prisma.contentItem.findMany({ where: { ...scope, brand: { active: true }, status: { notIn: DEAD_STATUSES }, OR: [{ scheduledDate: window }, { shootDate: window }] },
      take: 2001, orderBy: { id: "asc" }, select: { id: true, title: true, scheduledDate: true, shootDate: true, updatedAt: true, brand: { select: { name: true } } } }),
    prisma.calendarEvent.findMany({ where: { ...scope, AND: [{ OR: [{ brandId: null }, { brand: { active: true } }] }, { startAt: { lte: hasta }, OR: [{ startAt: { gte: desde } }, { endAt: { gte: desde } }] }] },
      take: 2001, orderBy: { id: "asc" }, select: { id: true, title: true, startAt: true, endAt: true, allDay: true, updatedAt: true } }),
  ]);
  if (videos.length > 2000 || events.length > 2000) return respond("El calendario supera el límite de esta suscripción. Usa un enlace por marca.", 503);
  const uid = (kind: string, id: string) => createHash("sha256").update(`${subscription.id}:${kind}:${id}`).digest("hex") + "@intia";
  const inWindow = (d: Date | null): d is Date => Boolean(d && d >= desde && d <= hasta);
  const items: IcsEvent[] = [];
  for (const video of videos) {
    if (inWindow(video.scheduledDate)) items.push({ uid: uid("video", video.id), title: `Publicar · ${video.brand.name}: ${video.title}`, start: video.scheduledDate, allDay: true, updatedAt: video.updatedAt });
    if (inWindow(video.shootDate)) items.push({ uid: uid("shoot", video.id), title: `Grabar · ${video.brand.name}: ${video.title}`, start: video.shootDate, allDay: true, updatedAt: video.updatedAt });
  }
  for (const event of events) items.push({ uid: uid("event", event.id), title: event.title, start: event.startAt, end: event.endAt, allDay: event.allDay, updatedAt: event.updatedAt });
  return new NextResponse(buildIcs(subscription.brand ? `ALSOS · ${subscription.brand.name}` : "ALSOS · Agenda completa", items), {
    headers: { ...CALENDAR_CACHE_HEADERS, "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'inline; filename="alsos.ics"' },
  });
}
