import type { Prisma } from "@prisma/client";
import { CalendarDays } from "lucide-react";

import type { MemberPageProps } from "@/components/member-workspace";
import { PageHeader } from "@/components/ui";
import { contentScope, eventScope } from "@/lib/access-scope";
import { brandWhere } from "@/lib/brand-context";
import {
  currentMonth,
  dedupeVideoEntries,
  eventOverlapWhere,
  eventTouches,
  itemsOfDay,
  mineParam,
  monthOfDay,
  monthWindow,
  parseDayKey,
  resolveMine,
  resolveMonth,
  returnedStepKeys,
  toCalendarSteps,
  videoDateWhere,
  videoEntries,
  type CalendarStepEntry,
} from "@/lib/calendar-view";
import { DEAD_STATUSES } from "@/lib/constants";
import { allows, type AccessUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { calendarStepsEnabled, productionChainActiveFor, productionChainBrands } from "@/lib/production-chain-flag";
import { coveredVideoDates, productionStepScope, stepCalendarEntries, type StepCalendar } from "@/lib/production-scope";
import { getPageBrandContext } from "@/lib/render-context";
import { dateKey, endOfMonth, monthLabel, parseList, startOfMonth } from "@/lib/utils";
import { AgendaDelMes, DayPanel, MineToggle, MonthNav } from "./calendar-day";
import { CalendarGrid, type CalendarAgendaItem, type CalendarItem } from "./calendar-grid";
import { NuevoEventoBoton } from "./event-form";

/** Topes de cordura por mes; si se alcanzan se avisa en pantalla. */
const TOPE_VIDEOS = 400;
const TOPE_EVENTOS = 300;
/** Mismo tope que aplica stepCalendarEntries por ventana. */
export const TOPE_PASOS = 600;

/* ------------------------------------------------------------ CAPA DE PASOS -- */

export type StepLayer = { steps: CalendarStepEntry[]; covered: Set<string>; truncated: boolean };
export const SIN_PASOS: StepLayer = { steps: [], covered: new Set(), truncated: false };

/**
 * Segunda vuelta de los pasos del calendario (compartida por el Dueño y el Equipo). Con los
 * pasos de la ventana ya leídos por stepCalendarEntries y los videos que se van a pintar:
 *  - aplica a los pasos los filtros de la página sobre el video (estado, plataforma);
 *  - marca «Devuelto» el paso que volvió por una devolución (el siguiente quedó DEVUELTO);
 *  - calcula qué chips Grabar/Publicar derivados cubre un paso visible con el mismo filtro de
 *    persona (`assigneeId`), aunque el plazo del paso caiga fuera de la ventana: una sola
 *    fecha por cosa, y la del paso manda.
 * Solo lectura; con la cadena o CALENDARIO_PASOS apagados no consulta nada.
 */
export async function completarPasos(
  user: AccessUser,
  cal: StepCalendar | null,
  opts: { videoIds: string[]; assigneeId: string | null; videoFilter?: Prisma.ContentItemWhereInput | null },
): Promise<StepLayer> {
  if (!cal?.enabled) return SIN_PASOS;
  const canary = productionChainBrands();
  const stepVideoIds = [...new Set(cal.entries.map((e) => e.videoId))];
  const pendientes = [...new Set(cal.entries.filter((e) => e.status === "PENDIENTE").map((e) => e.videoId))];
  const [filtrados, devueltos, cubiertos] = await Promise.all([
    opts.videoFilter && stepVideoIds.length
      ? prisma.contentItem.findMany({ where: { AND: [{ id: { in: stepVideoIds } }, opts.videoFilter] }, select: { id: true } })
      : Promise.resolve(null),
    pendientes.length
      ? prisma.productionStep.findMany({
          where: { contentItemId: { in: pendientes }, status: "DEVUELTO" },
          select: { contentItemId: true, step: true, status: true },
        })
      : Promise.resolve([]),
    opts.videoIds.length
      ? prisma.productionStep.findMany({
          where: {
            AND: [
              productionStepScope(user, "calendar.view"),
              canary ? { brandId: { in: canary } } : {},
              opts.assigneeId ? { assigneeId: opts.assigneeId } : {},
              {
                contentItemId: { in: opts.videoIds },
                step: { in: ["GRABACION", "PUBLICACION"] },
                status: { in: ["PENDIENTE", "HECHO"] },
                contentItem: { status: { notIn: DEAD_STATUSES } },
              },
            ],
          },
          select: { contentItemId: true, step: true, status: true },
        })
      : Promise.resolve([]),
  ]);
  const permitidos = filtrados ? new Set(filtrados.map((row) => row.id)) : null;
  const entries = permitidos ? cal.entries.filter((e) => permitidos.has(e.videoId)) : cal.entries;
  return {
    steps: toCalendarSteps(entries, { returned: returnedStepKeys(devueltos), userId: user.id }),
    covered: new Set(coveredVideoDates(cubiertos)),
    truncated: cal.entries.length >= TOPE_PASOS,
  };
}

/* --------------------------------------------------------------- PÁGINA -- */

/**
 * Calendario mensual del Equipo. Mismo alcance que el resto de su espacio:
 * videos con `contentScope(user, "calendar.view")`, agenda con `eventScope`,
 * y la marca activa del selector como único filtro de marca.
 *
 * Con la cadena y CALENDARIO_PASOS: suma los pasos de producción de su alcance
 * (productionStepScope) con responsable y estado, quita los videos cancelados o pausados
 * y ofrece «Solo lo mío» (?mio=1), activo por defecto en los perfiles por asignación y en
 * el community. Sin cadena, es el calendario de siempre. Con el canario, solo si la marca activa
 * (o, sin marca activa, alguna de sus marcas) usa la cadena, y el filtro de videos («lo mío»,
 * sin cancelados ni pausados) solo toca a los videos de esas marcas: el resto se ve como antes.
 */
export async function MemberCalendarMensual({ user, query = {} }: MemberPageProps) {
  const ctx = await getPageBrandContext();
  const dia = parseDayKey(query.dia);
  const { year, month } = dia ? monthOfDay(dia) : resolveMonth(query.anio, query.mes);
  const { desde, hasta } = monthWindow(year, month);
  const marca = brandWhere(ctx.activeId);
  const hoyAhora = new Date();

  const pasos = calendarStepsEnabled() && productionChainActiveFor(user, ctx.activeId);
  const mio = pasos && resolveMine(query.mio, user);
  const mioQuery = pasos ? mineParam(mio, user) : undefined;
  // Con pasos, el calendario del miembro sigue al ICS: sin videos cancelados ni pausados, y
  // en «Solo lo mío» solo los videos donde tiene una función. Con el canario, solo en sus marcas.
  const chainVideo: Prisma.ContentItemWhereInput = { status: { notIn: DEAD_STATUSES }, ...(mio ? { assignments: { some: { userId: user.id } } } : {}) };
  const canario = productionChainBrands();
  const videoWhere: Prisma.ContentItemWhereInput = !pasos
    ? {}
    : canario
      ? { OR: [{ brandId: { notIn: canario } }, { AND: [{ brandId: { in: canario } }, chainVideo] }] }
      : chainVideo;

  const [filas, eventosBase, calPasos] = await Promise.all([
    prisma.contentItem.findMany({
      where: { AND: [contentScope(user, "calendar.view"), marca, videoWhere, videoDateWhere(desde, hasta, true)] },
      select: {
        id: true,
        title: true,
        status: true,
        platforms: true,
        scheduledDate: true,
        shootDate: true,
        brand: { select: { name: true, colorPrimary: true } },
      },
      orderBy: [{ scheduledDate: "asc" }, { title: "asc" }, { id: "asc" }],
      take: TOPE_VIDEOS + 1,
    }),
    prisma.calendarEvent.findMany({
      where: { AND: [eventScope(user), marca, eventOverlapWhere(desde, hasta)] },
      select: {
        id: true,
        title: true,
        description: true,
        updatedAt: true,
        kind: true,
        startAt: true,
        endAt: true,
        allDay: true,
        contentItemId: true,
        location: true,
        brandId: true,
        brand: { select: { name: true } },
      },
      orderBy: [{ startAt: "asc" }, { id: "asc" }],
      take: TOPE_EVENTOS + 1,
    }),
    pasos ? stepCalendarEntries(user, desde, hasta, { mine: mio, brandId: ctx.activeId, now: hoyAhora }) : Promise.resolve(null),
  ]);

  const videosCortados = filas.length > TOPE_VIDEOS;
  const eventosCortados = eventosBase.length > TOPE_EVENTOS;
  const visibles = filas.slice(0, TOPE_VIDEOS);
  const capa = await completarPasos(user, calPasos, { videoIds: visibles.map((f) => f.id), assigneeId: mio ? user.id : null });
  const derivadas = videoEntries(
    visibles.map((f) => ({
      id: f.id,
      title: f.title,
      status: f.status,
      platforms: parseList(f.platforms),
      scheduledDate: f.scheduledDate,
      shootDate: f.shootDate,
      brandName: f.brand.name,
      brandColor: f.brand.colorPrimary,
    })),
    { grabacion: true, desde, hasta }
  );
  const videos: CalendarItem[] = [...dedupeVideoEntries(derivadas, capa.covered), ...capa.steps];
  const eventos = eventosBase.slice(0, TOPE_EVENTOS);
  const agenda: CalendarAgendaItem[] = eventos.map((e) => ({
    id: e.id,
    title: e.title,
    kind: e.kind,
    startAt: e.startAt,
    endAt: e.endAt,
    allDay: e.allDay,
    location: e.location,
    brandName: e.brand?.name ?? null,
  }));

  const inicioMes = startOfMonth(year, month);
  const finMes = endOfMonth(year, month);
  const hoy = currentMonth();
  const esMesActual = year === hoy.year && month === hoy.month;
  // `extra` puede traer su propio `mio` (aunque sea undefined): manda sobre el de la vista actual.
  const enlace = (extra: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ mio: mioQuery, ...extra })) if (v) params.set(k, v);
    const qs = params.toString();
    return qs ? `/calendario?${qs}` : "/calendario";
  };
  const mesHref = (y: number, m: number) => enlace({ anio: String(y), mes: String(m) });
  const anterior = month === 0 ? mesHref(year - 1, 11) : mesHref(year, month - 1);
  const siguiente = month === 11 ? mesHref(year + 1, 0) : mesHref(year, month + 1);
  const puedeAgendar = allows(user, "calendar.edit");
  const fechaPorDefecto = dia ?? (esMesActual ? dateKey(new Date()) : dateKey(inicioMes));
  const vista = { anio: String(year), mes: String(month), dia: dia ?? undefined };

  const delDia = dia ? itemsOfDay(dia, videos, agenda) : null;

  return (
    <div>
      <PageHeader
        title="Calendario"
        subtitle={
          pasos
            ? "Tus pasos de producción, grabaciones, publicaciones y agenda de tus marcas y asignaciones."
            : "Grabaciones, publicaciones y agenda de tus marcas y asignaciones."
        }
        icon={<CalendarDays size={19} />}
        actions={
          <>
            <MonthNav prevHref={anterior} todayHref={enlace({})} nextHref={siguiente} />
            {puedeAgendar ? (
              <NuevoEventoBoton
                brands={ctx.brands.map((b) => ({ id: b.id, name: b.name }))}
                defaultDate={fechaPorDefecto}
                defaultBrandId={ctx.activeId ?? undefined}
              />
            ) : null}
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-1">
        <h2 className="text-ink text-[16px] font-bold capitalize">{monthLabel(year, month)}</h2>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-inkmuted text-[12.5px]">{ctx.active ? ctx.active.name : "Todas tus marcas"}</span>
          {pasos ? (
            <MineToggle
              mine={mio}
              todoHref={enlace({ ...vista, mio: mineParam(false, user) })}
              mioHref={enlace({ ...vista, mio: mineParam(true, user) })}
            />
          ) : null}
        </div>
      </div>

      {delDia ? (
        <DayPanel dia={delDia.key} videos={delDia.videos} eventos={delDia.eventos} cerrarHref={mesHref(year, month)} />
      ) : null}

      {videosCortados || eventosCortados ? (
        <p className="text-inkmuted mb-3 px-1 text-[12.5px]">
          Este mes tiene más de lo que cabe en una vista: se muestran los primeros {TOPE_VIDEOS} videos y {TOPE_EVENTOS} cosas
          agendadas. Entra en una marca desde el selector para ver el resto.
        </p>
      ) : null}
      {capa.truncated ? (
        <p className="text-inkmuted mb-3 px-1 text-[12.5px]">
          Este mes tiene más de {TOPE_PASOS} pasos de producción: se muestran los primeros. Entra en una marca o usa «Solo lo
          mío» para ver el resto.
        </p>
      ) : null}

      <CalendarGrid
        year={year}
        month={month}
        videos={videos}
        eventos={agenda}
        hrefDia={(key) => enlace({ dia: key })}
        mensual
        diaSeleccionado={dia}
        pasos={pasos}
      />

      <AgendaDelMes
        eventos={eventos
          .filter((e) => eventTouches(e, inicioMes, finMes))
          .map((e) => ({ ...e, brandName: e.brand?.name ?? null }))}
        brands={ctx.brands.map((b) => ({ id: b.id, name: b.name }))}
        puedeEditar={puedeAgendar}
        puedeBorrar={false}
      />
    </div>
  );
}
