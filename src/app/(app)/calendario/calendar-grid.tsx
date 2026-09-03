import Link from "next/link";

import { CONTENT_STATUS_MAP, EVENT_KIND_MAP, platformLabels } from "@/lib/constants";
import { cn, DIAS_CORTOS, dateKey, isToday, monthGrid, withAlpha } from "@/lib/utils";

/**
 * Rejilla mensual del calendario de contenido.
 * Es un componente de servidor: no necesita estado, la navegacion y los
 * filtros viajan por la URL.
 */

export type CalendarVideo = {
  id: string;
  title: string;
  status: string;
  platforms: string[];
  scheduledDate: Date;
  brandName: string;
  brandColor: string;
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

const MAX_POR_DIA = 4;

export function CalendarGrid({
  year,
  month,
  videos,
  eventos = [],
  hrefDia,
}: {
  year: number;
  month: number;
  videos: CalendarVideo[];
  eventos?: CalendarAgendaItem[];
  /** Enlace al listado filtrado por ese dia, para el "+N más". */
  hrefDia: (key: string) => string;
}) {
  const grid = monthGrid(year, month);

  const porDia = new Map<string, CalendarVideo[]>();
  for (const v of videos) {
    const key = dateKey(v.scheduledDate);
    const lista = porDia.get(key);
    if (lista) lista.push(v);
    else porDia.set(key, [v]);
  }

  // Un evento de varios días ocupa todos sus días, no solo el primero.
  const eventosPorDia = new Map<string, CalendarAgendaItem[]>();
  const MAX_DIAS = 60; // tope de cordura por si alguien pone un fin absurdo
  for (const e of eventos) {
    let dia = new Date(e.startAt);
    const ultimo = e.endAt && e.endAt > e.startAt ? e.endAt : e.startAt;
    let vueltas = 0;
    while (dateKey(dia) <= dateKey(ultimo) && vueltas < MAX_DIAS) {
      const key = dateKey(dia);
      const lista = eventosPorDia.get(key);
      if (lista) lista.push(e);
      else eventosPorDia.set(key, [e]);
      dia = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate() + 1, 12, 0, 0, 0);
      vueltas++;
    }
  }

  const hora = (d: Date) =>
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  return (
    <div className="card overflow-hidden">
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
          const delMes = day.getMonth() === month;
          const hoy = isToday(day);
          const lista = porDia.get(key) ?? [];
          const agendaDia = eventosPorDia.get(key) ?? [];
          // La agenda ocupa como mucho dos huecos; el resto es para los videos.
          const agenda = agendaDia.slice(0, 2);
          const cupoVideos = Math.max(1, MAX_POR_DIA - agenda.length);
          const visibles = lista.slice(0, cupoVideos);
          // El "+N más" cuenta lo que se esconde de las dos listas.
          const resto = lista.length - visibles.length + (agendaDia.length - agenda.length);
          const total = lista.length + agendaDia.length;

          return (
            <div
              key={key}
              className={cn(
                "border-line min-h-[104px] border-r border-b p-1.5",
                i % 7 === 6 && "border-r-0",
                i >= 35 && "border-b-0",
                !delMes && "bg-surface2/60",
                hoy && "bg-brandsoft/45"
              )}
            >
              <div className="mb-1 flex items-center justify-between px-0.5">
                <span
                  className={cn(
                    "inline-flex h-[19px] min-w-[19px] items-center justify-center rounded-full px-1 text-[11px] leading-none font-bold",
                    hoy
                      ? "bg-brand text-[var(--brand-ink)]"
                      : delMes
                        ? "text-ink"
                        : "text-inkmuted opacity-55"
                  )}
                >
                  {day.getDate()}
                </span>
                {total > 1 ? (
                  <span className="text-inkmuted text-[10px] font-semibold">{total}</span>
                ) : null}
              </div>

              <div className={cn("space-y-1", !delMes && "opacity-55")}>
                {agenda.map((e) => {
                  const tipo = EVENT_KIND_MAP[e.kind];
                  const color = tipo?.hex ?? "#64748b";
                  return (
                    <div
                      key={e.id}
                      title={[
                        tipo?.label ?? e.kind,
                        e.brandName,
                        e.allDay ? "Todo el día" : hora(e.startAt),
                        e.location,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      className="flex items-center gap-1.5 rounded-md px-1.5 py-[3px] text-[11px] leading-tight font-semibold"
                      style={{
                        background: withAlpha(color, 0.1),
                        color,
                        boxShadow: `inset 0 0 0 1px ${withAlpha(color, 0.22)}`,
                      }}
                    >
                      <span className="shrink-0 opacity-70">
                        {e.allDay ? "•" : hora(e.startAt)}
                      </span>
                      <span className="truncate">{e.title}</span>
                    </div>
                  );
                })}

                {visibles.map((v) => {
                  const estado = CONTENT_STATUS_MAP[v.status];
                  const redes = platformLabels(v.platforms);
                  return (
                    <Link
                      key={v.id}
                      href={`/contenido/${v.id}`}
                      title={`${v.brandName} · ${v.title} · ${estado?.label ?? v.status}${
                        redes ? ` · ${redes}` : ""
                      }`}
                      className="flex items-center gap-1.5 rounded-md px-1.5 py-[3px] text-[11px] leading-tight font-semibold transition-opacity hover:opacity-75"
                      style={{
                        background: withAlpha(v.brandColor, 0.13),
                        color: v.brandColor,
                        boxShadow: `inset 0 0 0 1px ${withAlpha(v.brandColor, 0.26)}`,
                      }}
                    >
                      <span
                        className="dot"
                        style={{ background: estado?.hex ?? "#64748b" }}
                        aria-hidden
                      />
                      <span className="truncate">{v.title}</span>
                    </Link>
                  );
                })}

                {resto > 0 ? (
                  <Link
                    href={hrefDia(key)}
                    className="text-inkmuted hover:text-ink block px-1.5 text-[10.5px] font-semibold transition-colors"
                  >
                    +{resto} más
                  </Link>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
