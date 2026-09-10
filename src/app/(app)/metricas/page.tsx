import { requirePageSection } from "@/lib/render-context";
import { MemberWorkspace } from "@/components/member-workspace";
import { Pagination } from "@/components/filters";
import { SectionLoading } from "@/components/section-loading";
import { getMetricBreakdowns, getMetricRanking, getMetricSeries, getMetricTotals, type MetricFilters } from "@/lib/metric-dashboard";
import { measurePhase } from "@/lib/performance";
import { measurePagePhase } from "@/lib/performance-page";
import { getPageBrandContext as getBrandContext } from "@/lib/render-context";
import { weeklyDateRange as metricDateRange, shiftReportDay } from "@/lib/report-dates";
import { getStructureChoices } from "@/lib/structure-choices";
import Link from "next/link";
import { Suspense } from "react";

import {
	ArrowDown,
	ArrowDownRight,
	ArrowUpRight,
	Banknote,
	BarChart3,
	Eye,
	Heart,
	Minus,
	Radar,
	Timer,
	TrendingUp,
	Trophy,
	Wallet,
} from "lucide-react";

import { DonutChart, LineChart, RankBars, type Point } from "@/components/charts";
import { ActiveFilters, FilterBar, FilterDate, FilterSelect } from "@/components/filters";
import {
	Card,
	CardHeader,
	ColorChip,
	EmptyState,
	PageHeader,
	PlatformBadges,
	SectionTitle,
	Stat
} from "@/components/ui";
import { can, LEVEL } from "@/lib/auth";
import { brandWhere } from "@/lib/brand-context";
import { PLATFORM_MAP, PLATFORMS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import {
	cn,
	compactNumber,
	formatDate,
	formatMoney,
	formatNumber,
	formatPercent,
	fromDateKey,
	parseList,
	safeDivide
} from "@/lib/utils";
import { ImportForm } from "./import-form";

/* ------------------------------------------------------------------ TIPOS -- */

const ORDENES = ["vistas", "interacciones", "roas"] as const;
type Orden = (typeof ORDENES)[number];

type SearchParams = {
  plataforma?: string;
  estructura?: string;
  persona?: string;
  desde?: string;
  hasta?: string;
  orden?: string;
  pagina?: string;
};

function construirHref(sp: SearchParams, patch: Record<string, string | null>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (typeof value === "string" && value) params.set(key, value);
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) params.delete(key);
    else params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `/metricas?${qs}` : "/metricas";
}

/** Variación porcentual contra el periodo anterior, con color. */
function Delta({ actual, anterior }: { actual: number; anterior: number }) {
  if (!anterior) {
    return <span className="text-inkmuted">Sin datos del periodo anterior</span>;
  }
  const pct = safeDivide(actual - anterior, Math.abs(anterior)) * 100;

  if (Math.abs(pct) < 0.05) {
    return (
      <span className="text-inkmuted inline-flex items-center gap-1">
        <Minus size={11} /> Igual que el periodo anterior
      </span>
    );
  }

  const sube = pct > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-semibold",
        sube ? "text-ok" : "text-danger"
      )}
      title={`Periodo anterior: ${formatNumber(anterior, anterior % 1 === 0 ? 0 : 2)}`}
    >
      {sube ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
      {formatPercent(Math.abs(pct))}
      <span className="text-inkmuted font-normal">vs. periodo anterior</span>
    </span>
  );
}

/* ------------------------------------------------------------------ PAGINA -- */

type MetricsSectionProps = { filters: MetricFilters; range: ReturnType<typeof metricDateRange>; sp: SearchParams };

export default async function MetricasPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return measurePagePhase("page:/metricas", async () => {
  const user = await requirePageSection("metrics");
  if (user.role !== "OWNER") return <MemberWorkspace user={user} section="metrics" query={await searchParams} />;
  const [brandCtx, sp] = await Promise.all([getBrandContext(), searchParams]);
  const range = metricDateRange(sp.desde, sp.hasta);
  const filters: MetricFilters = { brandId: brandCtx.activeId, desde: range.desde, hasta: range.hasta, plataforma: sp.plataforma, estructura: sp.estructura, persona: sp.persona };
  const scope = JSON.stringify([filters, sp.orden, sp.pagina]);
  return <>
    <PageHeader title="Métricas" subtitle={`${formatDate(fromDateKey(range.desde))} — ${formatDate(fromDateKey(range.hasta))} · ${range.days / 7} semanas`} icon={<TrendingUp size={19} />} />
    <Suspense key={scope + "MetricsFilters"} fallback={<SectionLoading label="filtros" />}><MetricsFilters filters={filters} range={range} sp={sp} /></Suspense>
    <div className="space-y-4">
      <Suspense key={scope + "MetricsOverview"} fallback={<SectionLoading label="resumen" />}><MetricsOverview filters={filters} range={range} sp={sp} /></Suspense>
      <Suspense key={scope + "MetricsTrend"} fallback={<SectionLoading label="tendencia semanal" />}><MetricsTrend filters={filters} range={range} sp={sp} /></Suspense>
      <Suspense key={scope + "MetricsBreakdowns"} fallback={<SectionLoading label="comparaciones" />}><MetricsBreakdowns filters={filters} range={range} sp={sp} /></Suspense>
      <Suspense key={scope + "MetricsRanking"} fallback={<SectionLoading label="ranking de videos" />}><MetricsRanking filters={filters} range={range} sp={sp} /></Suspense>
    </div>
    {can(user.role, LEVEL.MEMBER) ? <><SectionTitle>Cargar más datos</SectionTitle><Card className="overflow-hidden"><ImportForm /></Card></> : null}
  </>;

  });
}

async function MetricsFilters({ filters, range, sp }: MetricsSectionProps) {
  const [estructuras, personas] = await measurePhase("metrics.catalogs", () => Promise.all([
    getStructureChoices(false),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]));
  const desdeKey = range.desde, hastaKey = range.hasta;
  const etiquetasFiltro: Record<string, string> = {
    plataforma: PLATFORM_MAP[sp.plataforma ?? ""]?.label ?? "Plataforma",
    estructura: estructuras.find((e) => e.id === sp.estructura)?.name ?? "Estructura",
    persona: personas.find((p) => p.id === sp.persona)?.name ?? "Persona",
    desde: `Desde ${formatDate(fromDateKey(desdeKey))}`,
    hasta: `Hasta ${formatDate(fromDateKey(hastaKey))}`,
  };


  return <FilterBar>
        <FilterSelect
          param="plataforma"
          allLabel="Todas las plataformas"
          options={PLATFORMS.map((p) => ({ value: p.value, label: p.label }))}
          width={158}
        />
        <FilterSelect
          param="estructura"
          allLabel="Todas las estructuras"
          options={estructuras.map((e) => ({ value: e.id, label: e.name }))}
          width={186}
        />
        <FilterSelect
          param="persona"
          allLabel="Todo el equipo"
          options={personas.map((p) => ({ value: p.id, label: p.name }))}
          width={158}
        />
        <span className="text-inkmuted pl-1 text-[12px] font-semibold">Del</span>
        <FilterDate param="desde" label="Desde" />
        <span className="text-inkmuted text-[12px] font-semibold">al</span>
        <FilterDate param="hasta" label="Hasta" />
        <div className="ml-auto">
          <ActiveFilters labels={etiquetasFiltro} />
        </div>
      </FilterBar>;
}

async function MetricsOverview({ filters, range }: MetricsSectionProps) {
  const [hoy, antes, totalEnBase, historical] = await measurePhase("metrics.summary", () => Promise.all([
    getMetricTotals(filters), getMetricTotals({ ...filters, desde: range.previousFrom, hasta: range.previousTo }),
    prisma.metric.count({ where: { period: "WEEKLY", contentItem: brandWhere(filters.brandId) } }),
    prisma.metric.count({ where: { period: "LEGACY", contentItem: brandWhere(filters.brandId) } }),
  ]));
  return <section data-ready-block="metrics.summary">
    <p className="text-inkmuted mb-3 text-xs">Semanas completas de lunes a domingo. Las cifras pertenecen a la plataforma registrada. Retención: media simple por registro semanal; incluye 0 % y omite solo datos ausentes.</p>
    {historical ? <p className="text-warn mb-3 text-xs">{historical} registros históricos conservados en las fichas de video; excluidos de estos totales semanales.</p> : null}
    <p className="text-inkmuted mb-3 text-xs">{formatNumber(hoy.videos)} videos con datos · {formatNumber(hoy.records)} registros</p>
    {hoy.records ? <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            <Stat
              label="Vistas"
              value={compactNumber(hoy.views)}
              sub={<Delta actual={hoy.views} anterior={antes.views} />}
              icon={<Eye size={15} />}
              accent="#6366f1"
            />
            <Stat
              label="Interacciones"
              value={compactNumber(hoy.interactions)}
              sub={<Delta actual={hoy.interactions} anterior={antes.interactions} />}
              icon={<Heart size={15} />}
              accent="#ec4899"
            />
            <Stat
              label="Alcance"
              value={compactNumber(hoy.reach)}
              sub={<Delta actual={hoy.reach} anterior={antes.reach} />}
              icon={<Radar size={15} />}
              accent="#0ea5e9"
            />
            <Stat
              label="Retención 3s"
              value={hoy.retention === null ? "Sin dato" : formatPercent(hoy.retention)}
              sub={hoy.retention !== null && antes.retention !== null ? <Delta actual={hoy.retention} anterior={antes.retention} /> : <span>Sin comparación</span>}
              icon={<Timer size={15} />}
              accent="#f59e0b"
            />
            <Stat
              label="Inversión"
              value={formatMoney(hoy.spend)}
              sub={<Delta actual={hoy.spend} anterior={antes.spend} />}
              icon={<Wallet size={15} />}
              accent="#f97316"
            />
            <Stat
              label="Ingresos"
              value={formatMoney(hoy.revenue)}
              sub={<Delta actual={hoy.revenue} anterior={antes.revenue} />}
              icon={<Banknote size={15} />}
              accent="#10b981"
            />
            <Stat
              label="ROAS"
              value={hoy.spend > 0 ? `${formatNumber(hoy.roas, 2)}x` : "—"}
              sub={
                hoy.spend > 0 ? (
                  <Delta actual={hoy.roas} anterior={antes.roas} />
                ) : (
                  <span className="text-inkmuted">Sin inversión registrada</span>
                )
              }
              icon={<TrendingUp size={15} />}
              accent="#14b8a6"
            />
          </div> : <Card><EmptyState title={totalEnBase ? "No hay métricas en este rango" : "Todavía no hay ninguna métrica cargada"} description="Amplía las fechas o los filtros, o carga las métricas desde un video o mediante el formulario de importación." /></Card>}
  </section>;
}

async function MetricsTrend({ filters, range }: MetricsSectionProps) {
  const rows = await measurePhase("metrics.series", () => getMetricSeries(filters));
  const days = new Map(rows.map(row => [row.day, row.views]));
  const views = rows.reduce((sum, row) => sum + row.views, 0);
  const serie: Point[] = Array.from({ length: range.days / 7 }, (_, index) => {
    const day = shiftReportDay(range.desde, index * 7);
    return { label: day.slice(8) + "/" + day.slice(5,7), value: days.get(day) ?? 0 };
  });
  return <section data-ready-block="metrics.series"><Card className="mb-4">
            <CardHeader
              title="Vistas por semana"
              subtitle={`Total del periodo: ${formatNumber(views)} vistas`}
              icon={<BarChart3 size={14} />}
            />
            <div className="p-4">
              <LineChart
                data={serie}
                height={210}
                emptyLabel="Hacen falta al menos dos semanas con datos para dibujar la tendencia."
              />
            </div>
          </Card></section>;
}

async function MetricsBreakdowns({ filters }: MetricsSectionProps) {
  const data = await measurePhase("metrics.breakdowns", () => getMetricBreakdowns(filters));
  const byPlatform = new Map<string, number>();
  for (const row of data.platforms) for (const platform of parseList(row.platforms)) byPlatform.set(platform, (byPlatform.get(platform) ?? 0) + row.views);
  const barrasPlataformas: Point[] = [...byPlatform].filter(([, value]) => value > 0).sort((a,b)=>b[1]-a[1]).map(([key,value])=>({label:PLATFORM_MAP[key]?.label??key,value,color:PLATFORM_MAP[key]?.hex}));
  const donutMarcas: Point[] = data.brands.filter(row=>row.value>0).map(row=>({label:row.name,value:row.value,color:row.color}));
  const rankingEstructuras: Point[] = data.structures.map(row=>({label:row.name + " · " + row.videos + " videos", value:Math.round(row.average)}));
  return <section data-ready-block="metrics.breakdowns"><div className="mb-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader
                title="Vistas por red"
                subtitle="Cada registro se atribuye únicamente a la red indicada al cargarlo"
              />
              <div className="p-4">
                {barrasPlataformas.length ? (
                  <RankBars data={barrasPlataformas} />
                ) : (
                  <EmptyState
                    title="Sin vistas registradas"
                    description="Cuando cargues vistas, aquí se ve en qué redes está funcionando."
                  />
                )}
              </div>
            </Card>

            <Card>
              <CardHeader title="Vistas por marca" subtitle="Quién se está llevando el alcance" />
              <div className="p-4">
                {donutMarcas.length ? (
                  <DonutChart
                    data={donutMarcas}
                    centerValue={String(donutMarcas.length)}
                    centerLabel={donutMarcas.length === 1 ? "marca" : "marcas"}
                  />
                ) : (
                  <EmptyState
                    title="Sin vistas registradas"
                    description="Cuando cargues vistas, aquí se ve el reparto por marca."
                  />
                )}
              </div>
            </Card>
          </div>
<Card className="mb-4">
            <CardHeader
              title="Qué estructura está funcionando"
              subtitle="Media de vistas por video de cada formato. Al lado va cuántos videos tiene la muestra: con uno o dos videos el dato todavía no dice mucho."
              icon={<Trophy size={14} />}
            />
            <div className="p-4">
              <RankBars
                data={rankingEstructuras}
                format={(n) => `${compactNumber(n)} vistas/video`}
                emptyLabel="Ningún video del rango tiene estructura asignada todavía."
              />
            </div>
          </Card></section>;
}

async function MetricsRanking({ filters, sp }: MetricsSectionProps) {
  const orden = ORDENES.includes(sp.orden as Orden) ? sp.orden : "vistas";
  const result = await measurePhase("metrics.ranking", () => getMetricRanking(filters, orden, sp.pagina));
  const ranking = result.items;
  return <section data-ready-block="metrics.ranking"><Card className="mb-4 overflow-hidden">
            <CardHeader
              title="Ranking de videos"
              subtitle={`${formatNumber(result.total)} ${result.total === 1 ? "video" : "videos"} con métricas en el rango. Toca Vistas, Interacciones o ROAS para reordenar.`}
            />
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: 34 }}>#</th>
                    <th>Marca</th>
                    <th>Video</th>
                    <th>Fecha</th>
                    <th>Plataforma</th>
                    <th style={{ textAlign: "right" }}>
                      <SortHeader
                        label="Vistas"
                        activo={orden === "vistas"}
                        href={construirHref(sp, { orden: null, pagina: null })}
                      />
                    </th>
                    <th style={{ textAlign: "right" }}>
                      <SortHeader
                        label="Interacciones"
                        activo={orden === "interacciones"}
                        href={construirHref(sp, { orden: "interacciones", pagina: null })}
                      />
                    </th>
                    <th style={{ textAlign: "right" }}>Ret. 3s</th>
                    <th style={{ textAlign: "right" }}>Inversión</th>
                    <th style={{ textAlign: "right" }}>Ingresos</th>
                    <th style={{ textAlign: "right" }}>
                      <SortHeader
                        label="ROAS"
                        activo={orden === "roas"}
                        href={construirHref(sp, { orden: "roas", pagina: null })}
                      />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((v, i) => {
                    const roas = safeDivide(v.revenue, v.spend);
                    const retencion = safeDivide(v.retSum, v.retCount);
                    return (
                      <tr key={v.id}>
                        <td className="tabular-nums">
                          <span className="text-inkmuted">{(result.page - 1) * 50 + i + 1}</span>
                        </td>
                        <td>
                          <ColorChip color={v.brandColor}>{v.brandName}</ColorChip>
                        </td>
                        <td className="min-w-[220px]">
                          <Link
                            href={`/contenido/${v.id}`}
                            className="text-ink hover:text-brand font-semibold transition-colors"
                          >
                            {v.title}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap">
                          <span className="text-inkmuted">{formatDate(v.fecha)}</span>
                        </td>
                        <td>
                          <PlatformBadges platforms={parseList(v.platforms)} max={2} />
                        </td>
                        <td className="text-right tabular-nums">
                          <span className="text-ink font-semibold">{formatNumber(v.views)}</span>
                        </td>
                        <td className="text-right tabular-nums">{formatNumber(v.interactions)}</td>
                        <td className="text-right tabular-nums">
                          {v.retCount > 0 ? formatPercent(retencion) : "—"}
                        </td>
                        <td className="text-right tabular-nums">
                          {v.spend > 0 ? formatMoney(v.spend) : "—"}
                        </td>
                        <td className="text-right tabular-nums">
                          {v.revenue > 0 ? formatMoney(v.revenue) : "—"}
                        </td>
                        <td className="text-right tabular-nums">
                          {v.spend > 0 ? (
                            <span className={cn("font-semibold", roas >= 1 ? "text-ok" : "text-danger")}>
                              {formatNumber(roas, 2)}x
                            </span>
                          ) : (
                            <span className="text-inkmuted">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
    <Pagination page={result.page} pageCount={result.pageCount} total={result.total} />
  </section>;
}

/* --------------------------------------------------------- ENCABEZADO ORD -- */

function SortHeader({
  label,
  activo,
  href,
}: {
  label: string;
  activo: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "hover:text-ink inline-flex items-center gap-1 transition-colors",
        activo && "text-brand"
      )}
      title={`Ordenar por ${label.toLowerCase()}`}
    >
      {label}
      {activo ? <ArrowDown size={11} /> : null}
    </Link>
  );
}
