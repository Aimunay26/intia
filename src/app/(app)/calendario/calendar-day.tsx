import { CalendarClock, CalendarDays, Camera, ChevronLeft, ChevronRight, Send, X } from "lucide-react";
import Link from "next/link";

import { Badge, Card, CardHeader } from "@/components/ui";
import { ENTRY_KIND_LABEL, type CalendarEntryKind } from "@/lib/calendar-view";
import { CONTENT_STATUS_MAP, EVENT_KIND_MAP } from "@/lib/constants";
import { dateKey, formatDate, formatDateLong, fromDateKey, timeKey } from "@/lib/utils";
import type { CalendarAgendaItem, CalendarVideo } from "./calendar-grid";
import { EditarEventoBoton, type EventFormBrand } from "./event-form";

/**
 * Piezas de servidor compartidas por el calendario del Dueño y del Equipo:
 * navegación de mes, detalle de un día y agenda editable del mes.
 */

export function capitalizar(texto: string) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/* ------------------------------------------------------------- NAVEGACIÓN -- */

export function MonthNav({ prevHref, todayHref, nextHref }: { prevHref: string; todayHref: string; nextHref: string }) {
  return (
    <div className="flex items-center gap-1">
      <Link href={prevHref} className="btn btn-icon" aria-label="Mes anterior" title="Mes anterior">
        <ChevronLeft size={16} />
      </Link>
      <Link href={todayHref} className="btn btn-sm">
        Hoy
      </Link>
      <Link href={nextHref} className="btn btn-icon" aria-label="Mes siguiente" title="Mes siguiente">
        <ChevronRight size={16} />
      </Link>
    </div>
  );
}

/* ------------------------------------------------------------ FILAS DE DÍA -- */

export function KindIcon({ kind, size = 12 }: { kind: CalendarEntryKind; size?: number }) {
  return kind === "GRABACION" ? <Camera size={size} aria-hidden /> : <Send size={size} aria-hidden />;
}

/** Todo lo de un día, en filas legibles: agenda primero, luego grabar y publicar. */
export function DayItems({ videos, eventos }: { videos: CalendarVideo[]; eventos: CalendarAgendaItem[] }) {
  const agenda = [...eventos].sort(
    (a, b) => Number(b.allDay) - Number(a.allDay) || a.startAt.getTime() - b.startAt.getTime()
  );
  return (
    <ul className="divide-line divide-y">
      {agenda.map((e) => {
        const tipo = EVENT_KIND_MAP[e.kind];
        const extra = [e.brandName, e.location].filter(Boolean).join(" · ");
        return (
          <li key={`evento-${e.id}`} className="flex items-start gap-2.5 px-4 py-2.5">
            <span className="text-inkmuted w-[76px] shrink-0 pt-px text-[12px] font-semibold tabular-nums">
              {e.allDay ? "Todo el día" : timeKey(e.startAt)}
            </span>
            <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-3">
              <span className="text-ink block text-[13px] font-medium break-words sm:min-w-0 sm:flex-1">{e.title}</span>
              <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] sm:mt-0">
                {tipo ? <Badge option={tipo} /> : null}
                {extra ? <span className="text-inkmuted">{extra}</span> : null}
              </span>
            </div>
          </li>
        );
      })}
      {videos.map((v) => {
        const estado = CONTENT_STATUS_MAP[v.status];
        return (
          <li key={`${v.kind}-${v.id}`} className="flex items-start gap-2.5 px-4 py-2.5">
            <span className="text-inksoft inline-flex w-[76px] shrink-0 items-center gap-1.5 pt-px text-[12px] font-semibold">
              <span style={{ color: v.brandColor }}>
                <KindIcon kind={v.kind} />
              </span>
              {ENTRY_KIND_LABEL[v.kind]}
            </span>
            <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-3">
              <Link
                href={`/contenido/${v.id}`}
                className="text-ink hover:text-brand block text-[13px] font-medium break-words transition-colors sm:min-w-0 sm:flex-1"
              >
                {v.title}
              </Link>
              <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] sm:mt-0">
                <span className="text-inkmuted inline-flex items-center gap-1.5">
                  <span className="dot" style={{ background: v.brandColor }} aria-hidden />
                  {v.brandName}
                </span>
                {estado ? <Badge option={estado} /> : null}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* --------------------------------------------------------- DETALLE DE DÍA -- */

export function DayPanel({
  dia,
  videos,
  eventos,
  cerrarHref,
}: {
  dia: string;
  videos: CalendarVideo[];
  eventos: CalendarAgendaItem[];
  cerrarHref: string;
}) {
  const total = videos.length + eventos.length;
  return (
    <Card className="mb-4">
      <CardHeader
        title={capitalizar(formatDateLong(fromDateKey(dia)))}
        subtitle={total ? `${total} ${total === 1 ? "cosa" : "cosas"} este día` : "Nada agendado este día"}
        icon={<CalendarDays size={15} />}
        actions={
          <Link href={cerrarHref} className="btn btn-ghost btn-sm" aria-label="Cerrar el detalle del día">
            <X size={14} /> Cerrar
          </Link>
        }
      />
      {total ? (
        <DayItems videos={videos} eventos={eventos} />
      ) : (
        <p className="text-inkmuted px-4 py-4 text-[13px]">
          No hay grabaciones, publicaciones ni agenda para este día.
        </p>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------- AGENDA DEL MES -- */

export type AgendaEvent = {
  id: string;
  title: string;
  description: string | null;
  updatedAt: Date;
  kind: string;
  startAt: Date;
  endAt: Date | null;
  allDay: boolean;
  location: string | null;
  brandId: string | null;
  brandName: string | null;
  contentItemId: string | null;
};

/** Reuniones y pendientes del mes, editables desde aquí (las fichas de la rejilla no lo son). */
export function AgendaDelMes({
  eventos,
  brands,
  puedeEditar,
  puedeBorrar,
  aviso,
}: {
  eventos: AgendaEvent[];
  brands: EventFormBrand[];
  puedeEditar: boolean;
  puedeBorrar: boolean;
  aviso?: string;
}) {
  if (!eventos.length) return null;
  return (
    <Card className="mt-4">
      <CardHeader
        title="Agenda del mes"
        subtitle={`${eventos.length} ${eventos.length === 1 ? "cosa agendada" : "cosas agendadas"} además de los videos`}
        icon={<CalendarClock size={15} />}
      />
      <ul className="divide-line divide-y">
        {eventos.map((e) => {
          const tipo = EVENT_KIND_MAP[e.kind];
          const varios = e.endAt && dateKey(e.endAt) !== dateKey(e.startAt);
          return (
            <li
              key={e.id}
              className="hover:bg-surface2 flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 transition-colors"
            >
              <span className="text-inkmuted shrink-0 text-[12px] font-semibold tabular-nums sm:min-w-[104px]">
                {formatDate(e.startAt)}
                {!e.allDay ? ` · ${timeKey(e.startAt)}` : ""}
                {varios && e.endAt ? ` → ${formatDate(e.endAt)}` : ""}
              </span>
              {tipo ? <Badge option={tipo} /> : null}
              <span className="text-ink w-full min-w-0 text-[13px] font-medium break-words sm:w-auto sm:flex-1 sm:truncate">
                {e.title}
              </span>
              {e.brandName ? <span className="text-inkmuted text-[11.5px]">{e.brandName}</span> : null}
              {e.location ? <span className="text-inkmuted text-[11.5px]">{e.location}</span> : null}
              {puedeEditar ? (
                <EditarEventoBoton
                  brands={brands}
                  canDelete={puedeBorrar}
                  evento={{
                    id: e.id,
                    updatedAt: e.updatedAt.toISOString(),
                    title: e.title,
                    description: e.description ?? "",
                    kind: e.kind,
                    startDate: dateKey(e.startAt),
                    startTime: timeKey(e.startAt),
                    endDate: e.endAt ? dateKey(e.endAt) : "",
                    endTime: e.endAt ? timeKey(e.endAt) : "",
                    allDay: e.allDay,
                    location: e.location ?? "",
                    brandId: e.brandId ?? "",
                    contentItemId: e.contentItemId ?? "",
                  }}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
      {aviso ? <p className="text-inkmuted border-line border-t px-4 py-2.5 text-[12px]">{aviso}</p> : null}
    </Card>
  );
}
