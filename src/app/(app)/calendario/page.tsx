import { requirePageSection } from "@/lib/render-context";
import { MemberWorkspace } from "@/components/member-workspace";
import { measurePagePhase } from "@/lib/performance-page";
import { getPageBrandContext as getBrandContext } from "@/lib/render-context";
import { getStructureChoices } from "@/lib/structure-choices";
import { endOfDay, startOfDay, timeKey } from "@/lib/utils";
import type { Prisma } from "@prisma/client";
import {
	AlertTriangle,
	CalendarClock,
	CalendarDays,
	CheckCircle2,
	ChevronLeft,
	ChevronRight,
	Clapperboard,
	Film,
	User as UserIcon,
} from "lucide-react";
import Link from "next/link";

import { ActiveFilters, FilterBar, FilterSelect } from "@/components/filters";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui";
import { LEVEL, can } from "@/lib/auth";
import { brandWhere } from "@/lib/brand-context";
import {
	ACTIVE_STATUSES,
	CONTENT_STATUSES,
	CONTENT_STATUS_MAP,
	DEAD_STATUSES,
	DONE_STATUSES,
	EVENT_KIND_MAP,
	PLATFORMS,
	PLATFORM_MAP,
	platformFilter,
} from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import {
	dateKey,
	endOfMonth,
	formatDate,
	monthGrid,
	monthLabel,
	parseList,
	startOfMonth,
} from "@/lib/utils";
import { NuevoVideoBoton } from "../contenido/content-form";
import {
	CalendarGrid,
	type CalendarAgendaItem,
	type CalendarVideo,
} from "./calendar-grid";
import { EditarEventoBoton, NuevoEventoBoton } from "./event-form";

type SearchParams = {
  anio?: string;
  mes?: string;
  estado?: string;
  plataforma?: string;
  persona?: string;
};

const FILTROS = ["estado", "plataforma", "persona"] as const;

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return measurePagePhase("page:/calendario", async () => {
  const user = await requirePageSection("calendar");
  if (user.role !== "OWNER") return <MemberWorkspace user={user} section="calendar" query={await searchParams} />;
  const sp = await searchParams;

  const hoy = new Date();
  const [businessYear, businessMonth] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(hoy).split("-").map(Number);
  const anioPedido = Number(sp.anio);
  const mesPedido = Number(sp.mes);
  const year = Number.isInteger(anioPedido) && anioPedido >= 1900 && anioPedido <= 9998 ? anioPedido : businessYear;
  const month =
    Number.isInteger(mesPedido) && mesPedido >= 0 && mesPedido <= 11 ? mesPedido : (businessMonth - 1);

  /* -------------------------------------------------------------- enlaces -- */

  const base: Record<string, string | undefined> = {
    estado: sp.estado,
    plataforma: sp.plataforma,
    persona: sp.persona,
  };

  const href = (extra: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...base, ...extra })) {
      if (v) params.set(k, v);
    }
    const qs = params.toString();
    return qs ? `/calendario?${qs}` : "/calendario";
  };

  const anterior = new Date(year, month - 1, 1);
  const siguiente = new Date(year, month + 1, 1);

  /* ---------------------------------------------------------------- datos -- */

  const where: Prisma.ContentItemWhereInput = {};
  const brandCtx = await getBrandContext();
  Object.assign(where, brandWhere(brandCtx.activeId));
  if (sp.estado) where.status = sp.estado;
  if (sp.plataforma) where.platformLinks = platformFilter(sp.plataforma);
  if (sp.persona) where.assignments = { some: { userId: sp.persona } };

  const grid = monthGrid(year, month);
  const desde = startOfDay(grid[0]);
  const hasta = endOfDay(grid[41]);

  const [filas, brands, people, eventosBase, structures] = await Promise.all([
    prisma.contentItem.findMany({
      where: { ...where, scheduledDate: { gte: desde, lte: hasta } },
      select: {
        id: true,
        title: true,
        status: true,
        platforms: true,
        scheduledDate: true,
        brand: { select: { name: true, colorPrimary: true } },
      },
      orderBy: [{ scheduledDate: "asc" }, { title: "asc" }],
    }),
    brandCtx.brands,
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.calendarEvent.findMany({
      where: {
        startAt: { gte: desde, lte: hasta },
        ...brandWhere(brandCtx.activeId),
      },
      orderBy: { startAt: "asc" },
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
    }),
    // Estructuras activas para los formatos previstos del alta de video.
    getStructureChoices(false),
  ]);

  const videos: CalendarVideo[] = filas.map((f) => ({
    id: f.id,
    title: f.title,
    status: f.status,
    platforms: parseList(f.platforms),
    scheduledDate: f.scheduledDate,
    brandName: f.brand.name,
    brandColor: f.brand.colorPrimary,
  }));

  /* -------------------------------------------------------------- resumen -- */

  const inicioMes = startOfMonth(year, month);
  const finMes = endOfMonth(year, month);
  const delMes = videos.filter(
    (v) => v.scheduledDate >= inicioMes && v.scheduledDate <= finMes
  );
  const inicioHoy = startOfDay(hoy);

  const publicados = delMes.filter((v) => DONE_STATUSES.includes(v.status)).length;
  const atrasados = delMes.filter(
    (v) =>
      v.scheduledDate < inicioHoy &&
      !DONE_STATUSES.includes(v.status) &&
      !DEAD_STATUSES.includes(v.status)
  ).length;
  // Se cuenta sobre el conjunto real, no por resta: restar metería aquí a los
  // videos cancelados o pausados con fecha futura, que no se están produciendo.
  const enProduccion = delMes.filter(
    (v) => ACTIVE_STATUSES.includes(v.status) && v.scheduledDate >= inicioHoy
  ).length;

  /* ------------------------------------------------------------ etiquetas -- */

  const personaMap = new Map(people.map((p) => [p.id, p.name]));
  const etiquetas: Record<string, string> = {
    estado: `Estado: ${CONTENT_STATUS_MAP[sp.estado ?? ""]?.label ?? sp.estado ?? ""}`,
    plataforma: `Plataforma: ${PLATFORM_MAP[sp.plataforma ?? ""]?.label ?? sp.plataforma ?? ""}`,
    persona: `Equipo: ${personaMap.get(sp.persona ?? "") ?? sp.persona ?? ""}`,
  };
  const hayFiltros = FILTROS.some((f) => Boolean(sp[f]));

  const puedeCrear = can(user.role, LEVEL.MEMBER);
  const puedeBorrar = can(user.role, LEVEL.OWNER);
  const fechaPorDefecto =
    year === businessYear && month === (businessMonth - 1)
      ? dateKey(hoy)
      : dateKey(startOfMonth(year, month));

  /* --------------------------------------------------------------- agenda -- */

  const horaDe = timeKey;

  const agenda: CalendarAgendaItem[] = eventosBase.map((e) => ({
    id: e.id, updatedAt: e.updatedAt.toISOString(),
    title: e.title,
    kind: e.kind,
    startAt: e.startAt,
    endAt: e.endAt,
    allDay: e.allDay,
    location: e.location,
    brandName: e.brand?.name ?? null,
  }));

  const agendaDelMes = eventosBase.filter(
    (e) => e.startAt >= inicioMes && e.startAt <= finMes
  );

  const brandOptions = brands.map((b) => ({ id: b.id, name: b.name }));

  /**
   * Reparto por marca del mes. Solo tiene sentido cuando se están viendo
   * todas juntas: si ya se entró en una marca, el total es el de esa marca.
   */
  const porMarca = brandCtx.focused
    ? []
    : brands
        .map((b) => ({
          ...b,
          total: delMes.filter((v) => v.brandName === b.name).length,
        }))
        .filter((b) => b.total > 0)
        .sort((a, b) => b.total - a.total);

  return (
    <>
      <PageHeader
        title="Calendario"
        subtitle="Todo lo que se graba y se publica este mes, marca por marca."
        icon={<CalendarDays size={19} />}
        actions={
          <>
            <div className="flex items-center gap-1">
              <Link
                href={href({ anio: String(anterior.getFullYear()), mes: String(anterior.getMonth()) })}
                className="btn btn-icon"
                aria-label="Mes anterior"
                title="Mes anterior"
              >
                <ChevronLeft size={16} />
              </Link>
              <Link href={href({ anio: undefined, mes: undefined })} className="btn btn-sm">
                Hoy
              </Link>
              <Link
                href={href({
                  anio: String(siguiente.getFullYear()),
                  mes: String(siguiente.getMonth()),
                })}
                className="btn btn-icon"
                aria-label="Mes siguiente"
                title="Mes siguiente"
              >
                <ChevronRight size={16} />
              </Link>
            </div>
            {puedeCrear ? (
              <>
                <NuevoEventoBoton
                  brands={brandOptions}
                  defaultDate={fechaPorDefecto}
                  defaultBrandId={brandCtx.activeId ?? undefined}
                />
                <NuevoVideoBoton
                  brands={brands.map((b) => ({ id: b.id, name: b.name, color: b.colorPrimary }))}
                  structures={structures}
                  defaultDate={fechaPorDefecto}
                  defaultBrandId={brandCtx.activeId ?? undefined}
                />
              </>
            ) : null}
          </>
        }
      />

      <FilterBar>
        <span className="text-ink px-1 text-[13.5px] font-bold capitalize">
          {monthLabel(year, month)}
        </span>
        <span className="bg-line mx-1 h-5 w-px" />
        <FilterSelect
          param="estado"
          allLabel="Todos los estados"
          icon={<Clapperboard size={13} />}
          options={CONTENT_STATUSES.map((o) => ({ value: o.value, label: o.label }))}
          width={180}
        />
        <FilterSelect
          param="plataforma"
          allLabel="Todas las plataformas"
          icon={<Film size={13} />}
          options={PLATFORMS.map((o) => ({ value: o.value, label: o.label }))}
          width={190}
        />
        <FilterSelect
          param="persona"
          allLabel="Todo el equipo"
          icon={<UserIcon size={13} />}
          options={people.map((p) => ({ value: p.id, label: p.name }))}
          width={180}
        />
        <div className="ml-auto">
          <ActiveFilters labels={etiquetas} />
        </div>
      </FilterBar>

      <CalendarGrid
        year={year}
        month={month}
        videos={videos}
        eventos={agenda}
        hrefDia={(key) => `/contenido?desde=${key}&hasta=${key}`}
      />

      {porMarca.length > 1 ? (
        <Card className="mt-4 p-3.5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-inkmuted text-[11px] font-bold tracking-[0.08em] uppercase">
              Reparto del mes
            </span>
            {porMarca.map((b) => (
              <span key={b.id} className="flex items-center gap-1.5 text-[12.5px]">
                <span
                  className="h-2.5 w-2.5 rounded-[3px]"
                  style={{ background: b.colorPrimary }}
                />
                <span className="text-inksoft">{b.name}</span>
                <span className="text-ink font-semibold tabular-nums">{b.total}</span>
              </span>
            ))}
            <span className="text-inkmuted ml-auto text-[12.5px]">
              Total <span className="text-ink font-bold">{delMes.length}</span> videos
            </span>
          </div>
        </Card>
      ) : null}

      {agendaDelMes.length ? (
        <Card className="mt-4">
          <CardHeader
            title="Agenda del mes"
            subtitle={`${agendaDelMes.length} ${agendaDelMes.length === 1 ? "cosa agendada" : "cosas agendadas"} además de los videos`}
            icon={<CalendarClock size={15} />}
          />
          <ul className="divide-line divide-y">
            {agendaDelMes.map((e) => {
              const tipo = EVENT_KIND_MAP[e.kind];
              return (
                <li
                  key={e.id}
                  className="hover:bg-surface2 flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 transition-colors"
                >
                  <span className="text-inkmuted w-[104px] shrink-0 text-[12px] font-semibold tabular-nums">
                    {formatDate(e.startAt)}
                    {!e.allDay ? ` · ${horaDe(e.startAt)}` : ""}
                  </span>
                  {tipo ? <Badge option={tipo} /> : null}
                  <span className="text-ink min-w-0 flex-1 truncate text-[13px] font-medium">
                    {e.title}
                  </span>
                  {e.brand ? (
                    <span className="text-inkmuted text-[11.5px]">{e.brand.name}</span>
                  ) : null}
                  {e.location ? (
                    <span className="text-inkmuted text-[11.5px]">{e.location}</span>
                  ) : null}
                  {puedeCrear ? (
                    <EditarEventoBoton
                      brands={brandOptions}
                      canDelete={puedeBorrar}
                      evento={{
                        id: e.id, updatedAt: e.updatedAt.toISOString(),
                        title: e.title,
                        description: e.description ?? "",
                        kind: e.kind,
                        startDate: dateKey(e.startAt),
                        startTime: horaDe(e.startAt),
                        endDate: e.endAt ? dateKey(e.endAt) : "",
                        endTime: e.endAt ? horaDe(e.endAt) : "",
                        allDay: e.allDay,
                        location: e.location ?? "",
                        brandId: e.brandId ?? "", contentItemId: e.contentItemId ?? "",
                      }}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      {videos.length === 0 ? (
        <Card className="mt-4">
          <EmptyState
            icon={<CalendarDays size={19} />}
            title={
              hayFiltros
                ? "Ningún video coincide con estos filtros"
                : `Nada programado en ${monthLabel(year, month)}`
            }
            description={
              hayFiltros
                ? "Quita algún filtro o cambia de mes para ver el resto del calendario."
                : "Crea el primer video del mes y aparecerá aquí con su checklist de producción listo."
            }
            action={
              hayFiltros ? (
                <Link
                  href={href({
                    anio: sp.anio,
                    mes: sp.mes,
                    marca: undefined,
                    estado: undefined,
                    plataforma: undefined,
                    persona: undefined,
                  })}
                  className="btn btn-sm"
                >
                  Limpiar filtros
                </Link>
              ) : puedeCrear ? (
                <NuevoVideoBoton
                  className="btn btn-primary btn-sm"
                  brands={brands.map((b) => ({ id: b.id, name: b.name, color: b.colorPrimary }))}
                  structures={structures}
                  defaultDate={fechaPorDefecto}
                  defaultBrandId={brandCtx.activeId ?? undefined}
                />
              ) : null
            }
          />
        </Card>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Programados"
          value={delMes.length}
          sub={`Videos con fecha en ${monthLabel(year, month)}`}
          icon={<CalendarDays size={15} />}
        />
        <Stat
          label="Publicados"
          value={publicados}
          sub={
            delMes.length
              ? `${Math.round((publicados / delMes.length) * 100)}% del mes cerrado`
              : "Todavía nada publicado"
          }
          icon={<CheckCircle2 size={15} />}
          accent="#10b981"
        />
        <Stat
          label="En producción"
          value={enProduccion}
          sub="Con fecha por delante o en curso"
          icon={<Clapperboard size={15} />}
          accent="#f59e0b"
        />
        <Stat
          label="Atrasados"
          value={atrasados}
          sub={atrasados ? "Pasó la fecha y siguen sin publicar" : "Nadie va tarde. Bien ahí."}
          icon={<AlertTriangle size={15} />}
          accent={atrasados ? "#f43f5e" : "#64748b"}
        />
      </div>
    </>
  );

  });
}
