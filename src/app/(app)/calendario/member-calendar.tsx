import { CalendarDays } from "lucide-react";

import type { MemberPageProps } from "@/components/member-workspace";
import { PageHeader } from "@/components/ui";
import { contentScope, eventScope } from "@/lib/access-scope";
import { brandWhere } from "@/lib/brand-context";
import {
  currentMonth,
  eventOverlapWhere,
  eventTouches,
  itemsOfDay,
  monthOfDay,
  monthWindow,
  parseDayKey,
  resolveMonth,
  videoDateWhere,
  videoEntries,
} from "@/lib/calendar-view";
import { allows } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getPageBrandContext } from "@/lib/render-context";
import { dateKey, endOfMonth, monthLabel, parseList, startOfMonth } from "@/lib/utils";
import { AgendaDelMes, DayPanel, MonthNav } from "./calendar-day";
import { CalendarGrid, type CalendarAgendaItem } from "./calendar-grid";
import { NuevoEventoBoton } from "./event-form";

/** Topes de cordura por mes; si se alcanzan se avisa en pantalla. */
const TOPE_VIDEOS = 400;
const TOPE_EVENTOS = 300;

/**
 * Calendario mensual del Equipo. Mismo alcance que el resto de su espacio:
 * videos con `contentScope(user, "calendar.view")`, agenda con `eventScope`,
 * y la marca activa del selector como único filtro de marca.
 */
export async function MemberCalendarMensual({ user, query = {} }: MemberPageProps) {
  const ctx = await getPageBrandContext();
  const dia = parseDayKey(query.dia);
  const { year, month } = dia ? monthOfDay(dia) : resolveMonth(query.anio, query.mes);
  const { desde, hasta } = monthWindow(year, month);
  const marca = brandWhere(ctx.activeId);

  const [filas, eventosBase] = await Promise.all([
    prisma.contentItem.findMany({
      where: { AND: [contentScope(user, "calendar.view"), marca, videoDateWhere(desde, hasta, true)] },
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
  ]);

  const videosCortados = filas.length > TOPE_VIDEOS;
  const eventosCortados = eventosBase.length > TOPE_EVENTOS;
  const videos = videoEntries(
    filas.slice(0, TOPE_VIDEOS).map((f) => ({
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
  const mesHref = (y: number, m: number) => `/calendario?anio=${y}&mes=${m}`;
  const anterior = month === 0 ? mesHref(year - 1, 11) : mesHref(year, month - 1);
  const siguiente = month === 11 ? mesHref(year + 1, 0) : mesHref(year, month + 1);
  const puedeAgendar = allows(user, "calendar.edit");
  const fechaPorDefecto = dia ?? (esMesActual ? dateKey(new Date()) : dateKey(inicioMes));

  const delDia = dia ? itemsOfDay(dia, videos, agenda) : null;

  return (
    <div>
      <PageHeader
        title="Calendario"
        subtitle="Grabaciones, publicaciones y agenda de tus marcas y asignaciones."
        icon={<CalendarDays size={19} />}
        actions={
          <>
            <MonthNav prevHref={anterior} todayHref="/calendario" nextHref={siguiente} />
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

      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-1">
        <h2 className="text-ink text-[16px] font-bold capitalize">{monthLabel(year, month)}</h2>
        <span className="text-inkmuted text-[12.5px]">{ctx.active ? ctx.active.name : "Todas tus marcas"}</span>
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

      <CalendarGrid
        year={year}
        month={month}
        videos={videos}
        eventos={agenda}
        hrefDia={(key) => `/calendario?dia=${key}`}
        mensual
        diaSeleccionado={dia}
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
