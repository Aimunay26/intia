import { ChevronDown } from "lucide-react";
import Link from "next/link";

import {
  ENTRY_KIND_LABEL,
  daySlots,
  groupEntriesByDay,
  groupEventsByDay,
  mobileList,
  monthDayKeys,
  shortDay,
  type CalendarEntryKind,
  type ListSegment,
} from "@/lib/calendar-view";
import { CONTENT_STATUS_MAP, EVENT_KIND_MAP, platformLabels } from "@/lib/constants";
import { cn, dateKey, DIAS_CORTOS, formatDateLong, fromDateKey, monthGrid, timeKey, withAlpha } from "@/lib/utils";
import { DayItems, KindIcon, capitalizar } from "./calendar-day";

/**
 * Rejilla mensual del calendario de contenido.
 * Es un componente de servidor: no necesita estado, la navegacion y los
 * filtros viajan por la URL. En modo mensual, por debajo de 640 px se pinta
 * una lista por días (sm:hidden) y la rejilla solo desde sm: sin JS.
 */

export type CalendarVideo = {
  id: string;
  title: string;
  status: string;
  platforms: string[];
  scheduledDate: Date;
  shootDate?: Date | null;
  brandName: string;
  brandColor: string;
  /** Qué fecha representa esta ficha: la de grabación o la de publicación. */
  kind: CalendarEntryKind;
  /** Día en el que se pinta la ficha. */
  date: Date;
};

/** Reuniones, pendientes, días de grabación: todo lo que no es un video. */
export type CalendarAgendaItem = {
  id: string;
  title: string;
  kind: string;
  startAt: Date;
  /** Si dura varios días, se pinta en todos ellos. */
  endAt: Date | null;
  allDay: boolean;
  location: string | null;
  brandName: string | null;
};

/** Alto de fila: en pantallas grandes, el mes entero cabe en la ventana. */
const CELDA = "min-h-[92px] lg:min-h-[104px] xl:min-h-[clamp(100px,calc((100dvh_-_330px)/6),136px)]";

export function CalendarGrid({
  year,
  month,
  videos,
  eventos = [],
  hrefDia,
  mensual = false,
  diaSeleccionado = null,
}: {
  year: number;
  month: number;
  videos: CalendarVideo[];
  eventos?: CalendarAgendaItem[];
  /** Enlace al detalle de ese día, para el número y el "+N más". */
  hrefDia: (key: string) => string;
  /** Vista nueva: número de día enlazado, leyenda y lista en móvil. */
  mensual?: boolean;
  diaSeleccionado?: string | null;
}) {
  const grid = monthGrid(year, month);
  const porDia = groupEntriesByDay(videos);
  const eventosPorDia = groupEventsByDay(eventos);
  const hoy = dateKey(new Date());

  const rejilla = (
    <div className={cn("card overflow-hidden", mensual && "hidden sm:block")}>
      <div className="border-line grid grid-cols-7 border-b">
        {DIAS_CORTOS.map((d) => (
          <div
            key={d}
            className="bg-surface2 text-inkmuted px-2 py-1.5 text-center text-[10.5px] font-bold tracking-[0.08em] uppercase"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {grid.map((day, i) => {
          const key = dateKey(day);
          const delMes = day.getUTCMonth() === month;
          const esHoy = key === hoy;
          const lista = porDia.get(key) ?? [];
          const agendaDia = eventosPorDia.get(key) ?? [];
          const cupo = daySlots(lista.length, agendaDia.length);
          const agenda = agendaDia.slice(0, cupo.agenda);
          const visibles = lista.slice(0, cupo.videos);
          const total = lista.length + agendaDia.length;
          const numero = cn(
            "inline-flex h-[19px] min-w-[19px] shrink-0 items-center justify-center rounded-full px-1 text-[11px] leading-none font-bold",
            esHoy ? "bg-brand text-[var(--brand-ink)]" : delMes ? "text-ink" : "text-inkmuted opacity-55"
          );

          return (
            <div
              key={key}
              className={cn(
                "border-line min-w-0 border-r border-b p-1",
                CELDA,
                i % 7 === 6 && "border-r-0",
                i >= 35 && "border-b-0",
                !delMes && "bg-surface2/60",
                esHoy && "bg-brandsoft/45",
                key === diaSeleccionado && "ring-brand ring-2 ring-inset"
              )}
            >
              <div className="mb-0.5 flex items-center justify-between gap-1 px-0.5">
                {mensual ? (
                  <Link
                    href={hrefDia(key)}
                    className={cn(numero, !esHoy && "hover:bg-surface3")}
                    aria-label={`Ver el ${formatDateLong(day)}`}
                  >
                    {day.getUTCDate()}
                  </Link>
                ) : (
                  <span className={numero}>{day.getUTCDate()}</span>
                )}
                {cupo.resto > 0 ? (
                  <Link
                    href={hrefDia(key)}
                    className="text-inkmuted hover:text-ink truncate text-[10.5px] font-semibold transition-colors"
                  >
                    +{cupo.resto} más
                  </Link>
                ) : total > 1 ? (
                  <span className="text-inkmuted text-[10px] font-semibold">{total}</span>
                ) : null}
              </div>

              <div className={cn("space-y-0.5", !delMes && "opacity-55")}>
                {agenda.map((e) => (
                  <EventChip key={e.id} e={e} />
                ))}
                {visibles.map((v) => (
                  <VideoChip key={`${v.kind}-${v.id}`} v={v} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  if (!mensual) return rejilla;

  const keys = monthDayKeys(grid, month);
  const conDatos = new Set(keys.filter((k) => porDia.has(k) || eventosPorDia.has(k)));
  const lista = mobileList(keys, conDatos, hoy);
  const diaMovil = (key: string, destacado = false) => (
    <MobileDay
      key={key}
      dia={key}
      hoy={destacado}
      videos={porDia.get(key) ?? []}
      eventos={eventosPorDia.get(key) ?? []}
      href={hrefDia(key)}
    />
  );
  const tramos = (segmentos: ListSegment[]) =>
    segmentos.map((s) => (s.tipo === "dia" ? diaMovil(s.key) : <EmptyRun key={s.desde} s={s} />));

  return (
    <>
      <Legend />
      <div className="space-y-2 sm:hidden">
        {lista.hoy ? diaMovil(lista.hoy, true) : null}
        {tramos(lista.siguientes)}
        {lista.anteriores.length ? (
          <details className="card group">
            <summary className="text-inksoft flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[13px] font-semibold [&::-webkit-details-marker]:hidden">
              <ChevronDown size={14} className="shrink-0 transition-transform group-open:rotate-180" aria-hidden />
              <span className="flex-1">Días anteriores de este mes</span>
              <span className="text-inkmuted text-[12px] font-medium">
                {lista.anteriores.filter((s) => s.tipo === "dia").length} con actividad
              </span>
            </summary>
            <div className="space-y-2 px-2 pb-2">{tramos(lista.anteriores)}</div>
          </details>
        ) : null}
        {!conDatos.size ? (
          <p className="text-inkmuted px-1 text-[13px]">No hay grabaciones, publicaciones ni agenda este mes.</p>
        ) : null}
      </div>
      {rejilla}
    </>
  );
}

/* ----------------------------------------------------------------- FICHAS -- */

function VideoChip({ v }: { v: CalendarVideo }) {
  const estado = CONTENT_STATUS_MAP[v.status];
  const redes = platformLabels(v.platforms);
  const descripcion = [ENTRY_KIND_LABEL[v.kind], v.brandName, v.title, estado?.label ?? v.status, redes]
    .filter(Boolean)
    .join(" · ");
  const grabar = v.kind === "GRABACION";
  return (
    <Link
      href={`/contenido/${v.id}`}
      title={descripcion}
      aria-label={descripcion}
      className={cn(
        "text-ink flex min-w-0 items-center gap-1 rounded-[5px] border-l-[3px] px-1 py-px text-[10.5px] leading-[14px] font-semibold transition-opacity hover:opacity-75",
        grabar && "border border-l-[3px] border-dashed"
      )}
      style={{
        background: withAlpha(v.brandColor, grabar ? 0.06 : 0.14),
        borderColor: grabar ? withAlpha(v.brandColor, 0.6) : v.brandColor,
        borderLeftStyle: "solid",
        borderLeftColor: v.brandColor,
      }}
    >
      {grabar ? (
        <span className="shrink-0" style={{ color: v.brandColor }}>
          <KindIcon kind="GRABACION" size={10} />
        </span>
      ) : (
        <span className="dot shrink-0" style={{ background: estado?.hex ?? "#64748b" }} aria-hidden />
      )}
      <span className="truncate">{v.title}</span>
    </Link>
  );
}

function EventChip({ e }: { e: CalendarAgendaItem }) {
  const tipo = EVENT_KIND_MAP[e.kind];
  const color = tipo?.hex ?? "#64748b";
  return (
    <div
      title={[tipo?.label ?? e.kind, e.title, e.brandName, e.allDay ? "Todo el día" : timeKey(e.startAt), e.location]
        .filter(Boolean)
        .join(" · ")}
      className="flex min-w-0 items-center gap-1 rounded-[5px] px-1 py-px text-[10.5px] leading-[14px] font-semibold"
      style={{
        background: withAlpha(color, 0.1),
        color,
        boxShadow: `inset 0 0 0 1px ${withAlpha(color, 0.22)}`,
      }}
    >
      <span className="shrink-0 opacity-70">{e.allDay ? "•" : timeKey(e.startAt)}</span>
      <span className="truncate">{e.title}</span>
    </div>
  );
}

function Legend() {
  return (
    <div className="text-inkmuted mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11.5px]">
      <span className="inline-flex items-center gap-1.5">
        <span className="text-inksoft">
          <KindIcon kind="GRABACION" size={12} />
        </span>
        Grabar
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="text-inksoft">
          <KindIcon kind="PUBLICACION" size={12} />
        </span>
        Publicar
      </span>
      <span>El color es el de la marca y el punto, el estado del video.</span>
    </div>
  );
}

/* ------------------------------------------------------------ LISTA MÓVIL -- */

function MobileDay({
  dia,
  hoy,
  videos,
  eventos,
  href,
}: {
  dia: string;
  hoy: boolean;
  videos: CalendarVideo[];
  eventos: CalendarAgendaItem[];
  href: string;
}) {
  const { semana, dia: numero } = shortDay(dia);
  const total = videos.length + eventos.length;
  return (
    <section className={cn("card overflow-hidden", hoy && "outline-brand outline-2")} aria-label={capitalizar(formatDateLong(fromDateKey(dia)))}>
      <Link
        href={href}
        className={cn(
          "border-line flex items-center gap-3 border-b px-4 py-2.5",
          hoy ? "bg-brandsoft/45" : "bg-surface2"
        )}
      >
        <span
          className={cn(
            "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[14px] font-bold",
            hoy ? "bg-brand text-[var(--brand-ink)]" : "text-ink bg-surface"
          )}
        >
          {numero}
        </span>
        <span className="text-ink min-w-0 flex-1 text-[13px] font-semibold">
          {hoy ? "Hoy · " : ""}
          {semana}
        </span>
        <span className="text-inkmuted text-[12px]">
          {total ? `${total} ${total === 1 ? "cosa" : "cosas"}` : "Sin nada"}
        </span>
      </Link>
      {total ? (
        <DayItems videos={videos} eventos={eventos} />
      ) : (
        <p className="text-inkmuted px-4 py-3 text-[13px]">Nada para hoy.</p>
      )}
    </section>
  );
}

function EmptyRun({ s }: { s: Extract<ListSegment, { tipo: "vacio" }> }) {
  const desde = shortDay(s.desde);
  const hasta = shortDay(s.hasta);
  return (
    <p className="text-inkmuted border-line border-l-2 border-dashed py-1 pl-3 text-[12px]">
      {s.dias === 1
        ? `${desde.semana} ${desde.dia} · sin nada agendado`
        : `Del ${desde.semana} ${desde.dia} al ${hasta.semana} ${hasta.dia} · sin nada agendado`}
    </p>
  );
}
