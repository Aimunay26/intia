import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { buildIcs, type IcsEvent } from "@/lib/ical";
import { CALENDAR_CACHE_HEADERS, resolveCalendarSubscription } from "@/lib/calendar-subscriptions";
import { contentScope, eventScope } from "@/lib/access-scope";
import { archiveEpoch, liveContent, liveEvent } from "@/lib/archive-scope";
import { feedStepTitle } from "@/lib/calendar-view";
import { DEAD_STATUSES } from "@/lib/constants";
import type { AccessUser } from "@/lib/permissions";
import { calendarStepsEnabled, productionChainBrands } from "@/lib/production-chain-flag";
import { coveredVideoDates, productionStepScope } from "@/lib/production-scope";

export const dynamic = "force-dynamic";

const LIMIT = 2000;

/** The token's persisted scope is authoritative. URL filters never enlarge it. */
export async function GET(request: Request) {
  try { return await downloadCalendar(request); }
  catch {
    console.error("[calendar] No se pudo consultar la suscripción.");
    return new NextResponse("Calendario temporalmente no disponible.", { status: 503, headers: CALENDAR_CACHE_HEADERS });
  }
}

type Window = { desde: Date; hasta: Date };

async function downloadCalendar(request: Request) {
  const url = new URL(request.url);
  const tokens = url.searchParams.getAll("token");
  const subscription = await resolveCalendarSubscription(tokens.length === 1 ? tokens[0] : null);
  const respond = (text: string, status: number) => new NextResponse(text, { status, headers: CALENDAR_CACHE_HEADERS });
  if (!subscription) return respond("Suscripción de calendario no válida o vencida.", 401);
  const desde = new Date(); desde.setUTCMonth(desde.getUTCMonth() - 6);
  const hasta = new Date(); hasta.setUTCFullYear(hasta.getUTCFullYear() + 1);
  const uid = (kind: string, id: string) => createHash("sha256").update(`${subscription.id}:${kind}:${id}`).digest("hex") + "@intia";
  const ics = (name: string, items: IcsEvent[]) => new NextResponse(buildIcs(name, items), {
    headers: { ...CALENDAR_CACHE_HEADERS, "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'inline; filename="alsos.ics"' },
  });
  if (subscription.person) {
    const items = await personalItems(subscription.person, { desde, hasta }, uid);
    if (!items) return respond("Tu calendario supera el límite de esta suscripción. Pide a coordinación que cierre pasos antiguos.", 503);
    return ics("ALSOS · Mi trabajo", items);
  }
  const scope = subscription.scope === "BRAND" ? { brandId: subscription.brandId! } : {};
  const window = { gte: desde, lte: hasta };
  // Archivo total: los enlaces del Dueño (ALL/BRAND) no pasan por access-scope; sin videos ni agenda
  // de marcas archivadas, ni agenda sin marca anterior a la época. Vacío: igual que antes.
  const epoch = archiveEpoch();
  const [videos, events] = await Promise.all([
    prisma.contentItem.findMany({ where: { ...scope, brand: { active: true }, status: { notIn: DEAD_STATUSES }, OR: [{ scheduledDate: window }, { shootDate: window }], ...(epoch ? { AND: [liveContent(epoch)] } : {}) },
      take: LIMIT + 1, orderBy: { id: "asc" }, select: { id: true, title: true, scheduledDate: true, shootDate: true, updatedAt: true, brand: { select: { name: true } } } }),
    prisma.calendarEvent.findMany({ where: { ...scope, AND: [{ OR: [{ brandId: null }, { brand: { active: true } }] }, { startAt: { lte: hasta }, OR: [{ startAt: { gte: desde } }, { endAt: { gte: desde } }] }, ...(epoch ? [liveEvent(epoch)] : [])] },
      take: LIMIT + 1, orderBy: { id: "asc" }, select: { id: true, title: true, startAt: true, endAt: true, allDay: true, updatedAt: true } }),
  ]);
  if (videos.length > LIMIT || events.length > LIMIT) return respond("El calendario supera el límite de esta suscripción. Usa un enlace por marca.", 503);
  const items: IcsEvent[] = [];
  pushVideoDates(items, videos, { desde, hasta }, uid);
  for (const event of events) items.push({ uid: uid("event", event.id), title: event.title, start: event.startAt, end: event.endAt, allDay: event.allDay, updatedAt: event.updatedAt });
  return ics(subscription.brand ? `ALSOS · ${subscription.brand.name}` : "ALSOS · Agenda completa", items);
}

type VideoRow = { id: string; title: string; scheduledDate: Date; shootDate: Date | null; updatedAt: Date; brand: { name: string } };

/** Fechas del video (Publicar y Grabar), salvo las que cubre un paso (`${id}:PUBLICACION|GRABACION`). */
function pushVideoDates(items: IcsEvent[], videos: VideoRow[], { desde, hasta }: Window, uid: (kind: string, id: string) => string, covered: ReadonlySet<string> = new Set()) {
  const inWindow = (d: Date | null): d is Date => Boolean(d && d >= desde && d <= hasta);
  for (const video of videos) {
    if (inWindow(video.scheduledDate) && !covered.has(`${video.id}:PUBLICACION`)) items.push({ uid: uid("video", video.id), title: `Publicar · ${video.brand.name}: ${video.title}`, start: video.scheduledDate, allDay: true, updatedAt: video.updatedAt });
    if (inWindow(video.shootDate) && !covered.has(`${video.id}:GRABACION`)) items.push({ uid: uid("shoot", video.id), title: `Grabar · ${video.brand.name}: ${video.title}`, start: video.shootDate, allDay: true, updatedAt: video.updatedAt });
  }
}

/**
 * Feed personal (scope USER, CALENDAR_FEED_PERSONAL). Todo se calcula con la persona leída en
 * esta descarga (perfiles y marcas actuales) y sus mismos alcances de la app:
 *  - sus pasos PENDIENTE (con la cadena y CALENDARIO_PASOS): «Editar · Marca: título», de todo
 *    el día salvo Diseño, que vence a una hora;
 *  - las fechas de grabación y publicación de los videos de su alcance donde tiene una función,
 *    salvo las que ya cubre uno de sus pasos (una sola fecha por cosa);
 *  - la agenda de su alcance (eventScope).
 * Nunca incluye descripciones, ubicaciones ni otras personas. null: supera el límite.
 */
async function personalItems(person: AccessUser, { desde, hasta }: Window, uid: (kind: string, id: string) => string): Promise<IcsEvent[] | null> {
  const window = { gte: desde, lte: hasta };
  const liveBrand = { brand: { active: true } };
  const withSteps = calendarStepsEnabled();
  const canary = productionChainBrands();
  const mySteps = {
    AND: [
      productionStepScope(person, "calendar.view"),
      canary ? { brandId: { in: canary } } : {},
      { assigneeId: person.id, contentItem: { status: { notIn: DEAD_STATUSES }, ...liveBrand } },
    ],
  };
  const [videos, events, steps] = await Promise.all([
    prisma.contentItem.findMany({
      where: { AND: [contentScope(person, "calendar.view"), liveBrand, { status: { notIn: DEAD_STATUSES }, assignments: { some: { userId: person.id } } }, { OR: [{ scheduledDate: window }, { shootDate: window }] }] },
      take: LIMIT + 1, orderBy: { id: "asc" }, select: { id: true, title: true, scheduledDate: true, shootDate: true, updatedAt: true, brand: { select: { name: true } } },
    }),
    prisma.calendarEvent.findMany({
      where: { AND: [eventScope(person), { OR: [{ brandId: null }, { brand: { active: true } }] }, { startAt: { lte: hasta }, OR: [{ startAt: { gte: desde } }, { endAt: { gte: desde } }] }] },
      take: LIMIT + 1, orderBy: { id: "asc" }, select: { id: true, title: true, startAt: true, endAt: true, allDay: true, updatedAt: true },
    }),
    withSteps
      ? prisma.productionStep.findMany({
          where: { AND: [mySteps, { status: "PENDIENTE", dueAt: window }] },
          take: LIMIT + 1, orderBy: [{ dueAt: "asc" }, { id: "asc" }],
          select: { id: true, step: true, dueAt: true, updatedAt: true, contentItem: { select: { title: true, brand: { select: { name: true } } } } },
        })
      : Promise.resolve([]),
  ]);
  if (videos.length > LIMIT || events.length > LIMIT || steps.length > LIMIT) return null;
  // Sus pasos Grabar/Publicar (pendientes o hechos) reemplazan la fecha del video, aunque su plazo quede fuera de la ventana.
  const covering = withSteps && videos.length
    ? await prisma.productionStep.findMany({
        where: { AND: [mySteps, { contentItemId: { in: videos.map((v) => v.id) }, step: { in: ["GRABACION", "PUBLICACION"] }, status: { in: ["PENDIENTE", "HECHO"] } }] },
        select: { contentItemId: true, step: true, status: true },
      })
    : [];
  const items: IcsEvent[] = [];
  for (const step of steps) {
    const timed = step.step === "DISENO";
    items.push({ uid: uid("step", step.id), title: feedStepTitle(step.step, step.contentItem.brand.name, step.contentItem.title), start: step.dueAt, allDay: !timed, updatedAt: step.updatedAt });
  }
  pushVideoDates(items, videos, { desde, hasta }, uid, new Set(coveredVideoDates(covering)));
  for (const event of events) items.push({ uid: uid("event", event.id), title: event.title, start: event.startAt, end: event.endAt, allDay: event.allDay, updatedAt: event.updatedAt });
  return items;
}
