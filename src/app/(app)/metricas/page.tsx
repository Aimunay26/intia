import Link from "next/link";
import {
  ArrowDown,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Banknote,
  Eye,
  Heart,
  Minus,
  Radar,
  Timer,
  TrendingUp,
  Trophy,
  Wallet,
} from "lucide-react";

import { requireUser, can, LEVEL } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { brandWhere, getBrandContext } from "@/lib/brand-context";
import { PLATFORMS, PLATFORM_MAP, platformFilter } from "@/lib/constants";
import {
  addDays,
  cn,
  compactNumber,
  dateKey,
  formatDate,
  formatMoney,
  formatNumber,
  formatPercent,
  fromDateKey,
  parseList,
  safeDivide,
} from "@/lib/utils";
import {
  Badge,
  Card,
  CardHeader,
  ColorChip,
  EmptyState,
  PageHeader,
  PlatformBadges,
  SectionTitle,
  Stat,
} from "@/components/ui";
import { DonutChart, LineChart, RankBars, type Point } from "@/components/charts";
import { FilterBar, FilterDate, FilterSelect, ActiveFilters } from "@/components/filters";
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
};

/** Lo que sumamos de cada fila de métricas. */
type Sumable = {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  reach: number;
  spend: number;
  revenue: number;
  retention3s: number;
};

type Totales = {
  views: number;
  interactions: number;
  reach: number;
  retention: number;
  spend: number;
  revenue: number;
  roas: number;
};

type VideoAgg = {
  id: string;
  title: string;
  platforms: string[];
  fecha: Date;
  brandName: string;
  brandColor: string;
  structureId: string | null;
  structureName: string | null;
  views: number;
  interactions: number;
  reach: number;
  spend: number;
  revenue: number;
  retSum: number;
  retCount: number;
};

/* -------------------------------------------------------------- AUXILIARES -- */

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function sumar(rows: Sumable[]): Totales {
  const t = { views: 0, interactions: 0, reach: 0, spend: 0, revenue: 0 };
  let retSum = 0;
  let retCount = 0;

  for (const r of rows) {
    t.views += r.views;
    t.interactions += r.likes + r.comments + r.shares + r.saves;
    t.reach += r.reach;
    t.spend += r.spend;
    t.revenue += r.revenue;
    if (r.retention3s > 0) {
      retSum += r.retention3s;
      retCount++;
    }
  }

  return {
    ...t,
    retention: safeDivide(retSum, retCount),
    roas: safeDivide(t.revenue, t.spend),
  };
}

/** Etiqueta corta para el eje del gráfico de línea: "14/8". */
function etiquetaDia(d: Date) {
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

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

export default async function MetricasPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const puedeImportar = can(user.role, LEVEL.MEMBER);
  const brandCtx = await getBrandContext();

  /* --- Rango de fechas: por defecto los últimos 30 días --- */
  const hoyKey = dateKey(new Date());
  let hastaKey = sp.hasta && ISO.test(sp.hasta) ? sp.hasta : hoyKey;
  let desdeKey =
    sp.desde && ISO.test(sp.desde) ? sp.desde : dateKey(addDays(fromDateKey(hastaKey), -29));
  if (desdeKey > hastaKey) [desdeKey, hastaKey] = [hastaKey, desdeKey];

  let dias = Math.max(
    1,
    Math.round((fromDateKey(hastaKey).getTime() - fromDateKey(desdeKey).getTime()) / 86400000) + 1
  );
  // Tope de un año: más que eso no se lee en un gráfico y hace la consulta pesada.
  if (dias > 366) {
    desdeKey = dateKey(addDays(fromDateKey(hastaKey), -365));
    dias = 366;
  }

  const inicio = fromDateKey(desdeKey);
  inicio.setHours(0, 0, 0, 0);
  const fin = fromDateKey(hastaKey);
  fin.setHours(23, 59, 59, 999);

  const prevFin = addDays(inicio, -1);
  prevFin.setHours(23, 59, 59, 999);
  const prevInicio = addDays(inicio, -dias);
  prevInicio.setHours(0, 0, 0, 0);

  /* --- Filtros --- */
  const filtroContenido = {
    ...brandWhere(brandCtx.activeId),
    ...(sp.plataforma ? { platforms: platformFilter(sp.plataforma) } : {}),
    ...(sp.estructura ? { structureId: sp.estructura } : {}),
    ...(sp.persona ? { assignments: { some: { userId: sp.persona } } } : {}),
  };

  const [filas, filasPrevias, estructuras, personas, totalEnBase] = await Promise.all([
    prisma.metric.findMany({
      where: { date: { gte: inicio, lte: fin }, contentItem: filtroContenido },
      select: {
        id: true,
        date: true,
        views: true,
        likes: true,
        comments: true,
        shares: true,
        saves: true,
        reach: true,
        spend: true,
        revenue: true,
        retention3s: true,
        contentItem: {
          select: {
            id: true,
            title: true,
            platforms: true,
            scheduledDate: true,
            publishedAt: true,
            brand: { select: { id: true, name: true, colorPrimary: true } },
            structure: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { date: "asc" },
    }),
    prisma.metric.findMany({
      where: { date: { gte: prevInicio, lte: prevFin }, contentItem: filtroContenido },
      select: {
        views: true,
        likes: true,
        comments: true,
        shares: true,
        saves: true,
        reach: true,
        spend: true,
        revenue: true,
        retention3s: true,
      },
    }),
    prisma.structure.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    // Cuenta solo lo de la marca activa: si no, dentro de una marca sin métricas
    // se ocultaría el estado vacío porque otras marcas sí tienen.
    prisma.metric.count({ where: { contentItem: brandWhere(brandCtx.activeId) } }),
  ]);

  const hoy = sumar(filas);
  const antes = sumar(filasPrevias);

  /* --- Serie diaria de vistas --- */
  const vistasPorDia = new Map<string, number>();
  for (const f of filas) {
    const key = dateKey(f.date);
    vistasPorDia.set(key, (vistasPorDia.get(key) ?? 0) + f.views);
  }
  const serie: Point[] = Array.from({ length: dias }, (_, i) => {
    const d = addDays(fromDateKey(desdeKey), i);
    return { label: etiquetaDia(d), value: vistasPorDia.get(dateKey(d)) ?? 0 };
  });

  /* --- Agregado por video --- */
  const porVideo = new Map<string, VideoAgg>();
  for (const f of filas) {
    const ci = f.contentItem;
    let agg = porVideo.get(ci.id);
    if (!agg) {
      agg = {
        id: ci.id,
        title: ci.title,
        platforms: parseList(ci.platforms),
        fecha: ci.publishedAt ?? ci.scheduledDate,
        brandName: ci.brand.name,
        brandColor: ci.brand.colorPrimary,
        structureId: ci.structure?.id ?? null,
        structureName: ci.structure?.name ?? null,
        views: 0,
        interactions: 0,
        reach: 0,
        spend: 0,
        revenue: 0,
        retSum: 0,
        retCount: 0,
      };
      porVideo.set(ci.id, agg);
    }
    agg.views += f.views;
    agg.interactions += f.likes + f.comments + f.shares + f.saves;
    agg.reach += f.reach;
    agg.spend += f.spend;
    agg.revenue += f.revenue;
    if (f.retention3s > 0) {
      agg.retSum += f.retention3s;
      agg.retCount++;
    }
  }
  const videos = [...porVideo.values()];

  /* --- Vistas por plataforma y por marca --- */
  const vistasPlataforma = new Map<string, number>();
  const vistasMarca = new Map<string, { name: string; color: string; value: number }>();
  for (const f of filas) {
    const ci = f.contentItem;
    // Las vistas se guardan por video y por día, no por red. Si un video salió
    // en varias redes, se suma en todas: por eso esto va en barras y no en una
    // dona, que daría a entender que son porciones de un mismo total.
    for (const red of parseList(ci.platforms)) {
      vistasPlataforma.set(red, (vistasPlataforma.get(red) ?? 0) + f.views);
    }
    const m = vistasMarca.get(ci.brand.id) ?? {
      name: ci.brand.name,
      color: ci.brand.colorPrimary,
      value: 0,
    };
    m.value += f.views;
    vistasMarca.set(ci.brand.id, m);
  }

  const barrasPlataformas: Point[] = [...vistasPlataforma.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([value, total]) => ({
      label: PLATFORM_MAP[value]?.label ?? value,
      value: total,
      color: PLATFORM_MAP[value]?.hex ?? "#64748b",
    }));

  const donutMarcas: Point[] = [...vistasMarca.values()]
    .filter((m) => m.value > 0)
    .sort((a, b) => b.value - a.value)
    .map((m) => ({ label: m.name, value: m.value, color: m.color }));

  /* --- Media de vistas por estructura: qué formato conviene repetir --- */
  const porEstructura = new Map<string, { name: string; total: number; videos: number }>();
  for (const v of videos) {
    const key = v.structureId ?? "__sin__";
    const grupo = porEstructura.get(key) ?? {
      name: v.structureName ?? "Sin estructura asignada",
      total: 0,
      videos: 0,
    };
    grupo.total += v.views;
    grupo.videos++;
    porEstructura.set(key, grupo);
  }

  const rankingEstructuras: Point[] = [...porEstructura.values()]
    .map((g) => ({
      label: `${g.name} · ${g.videos} ${g.videos === 1 ? "video" : "videos"}`,
      value: Math.round(safeDivide(g.total, g.videos)),
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  /* --- Ranking de videos --- */
  const ordenParam = sp.orden ?? "";
  const orden: Orden = ORDENES.includes(ordenParam as Orden) ? (ordenParam as Orden) : "vistas";

  const ranking = [...videos].sort((a, b) => {
    if (orden === "interacciones") return b.interactions - a.interactions;
    if (orden === "roas") return safeDivide(b.revenue, b.spend) - safeDivide(a.revenue, a.spend);
    return b.views - a.views;
  });

  /* --- Etiquetas de los filtros activos --- */
  const etiquetasFiltro: Record<string, string> = {
    plataforma: PLATFORM_MAP[sp.plataforma ?? ""]?.label ?? "Plataforma",
    estructura: estructuras.find((e) => e.id === sp.estructura)?.name ?? "Estructura",
    persona: personas.find((p) => p.id === sp.persona)?.name ?? "Persona",
    desde: `Desde ${formatDate(fromDateKey(desdeKey))}`,
    hasta: `Hasta ${formatDate(fromDateKey(hastaKey))}`,
  };

  const bloqueImportacion = puedeImportar ? (
    <Card className="overflow-hidden">
      <ImportForm />
    </Card>
  ) : null;

  /* --- Nada cargado todavía en toda la base --- */
  if (totalEnBase === 0) {
    return (
      <>
        <PageHeader
          title="Métricas"
          subtitle="Qué vistas, interacciones y dinero está trayendo cada video."
          icon={<TrendingUp size={19} />}
        />
        <Card className="mb-4">
          <EmptyState
            icon={<BarChart3 size={19} />}
            title="Todavía no hay ninguna métrica cargada"
            description="Hay dos maneras de llenar esto: entrar a la ficha de un video y anotar los números del día a mano, o pegar aquí abajo el CSV que exportas de la plataforma. En cuanto haya datos, aparecen las tendencias, el ranking de videos y qué estructura está funcionando mejor."
            action={
              <Link href="/contenido" className="btn btn-primary">
                Ir a los videos
              </Link>
            }
          />
        </Card>
        {bloqueImportacion}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Métricas"
        subtitle={`${formatDate(fromDateKey(desdeKey))} — ${formatDate(fromDateKey(hastaKey))} · ${dias} ${dias === 1 ? "día" : "días"} · ${formatNumber(videos.length)} ${videos.length === 1 ? "video con datos" : "videos con datos"} · ${formatNumber(filas.length)} ${filas.length === 1 ? "registro" : "registros"}`}
        icon={<TrendingUp size={19} />}
      />

      <FilterBar>
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
      </FilterBar>

      {filas.length === 0 ? (
        <Card className="mb-4">
          <EmptyState
            icon={<BarChart3 size={19} />}
            title="No hay métricas en este rango"
            description="Con los filtros y las fechas que elegiste no aparece ningún registro. Prueba a ampliar el rango de fechas o a quitar algún filtro."
            action={
              <Link href="/metricas" className="btn">
                Volver a los últimos 30 días
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          {/* 1 · Resumen del periodo -------------------------------------- */}
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
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
              value={hoy.retention > 0 ? formatPercent(hoy.retention) : "—"}
              sub={<Delta actual={hoy.retention} anterior={antes.retention} />}
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
          </div>

          {/* 2 · Vistas por día ------------------------------------------- */}
          <Card className="mb-4">
            <CardHeader
              title="Vistas por día"
              subtitle={`Total del periodo: ${formatNumber(hoy.views)} vistas`}
              icon={<BarChart3 size={14} />}
            />
            <div className="p-4">
              <LineChart
                data={serie}
                height={210}
                emptyLabel="Hacen falta al menos dos días con datos para dibujar la tendencia."
              />
            </div>
          </Card>

          {/* 3 · Reparto por plataforma y por marca ------------------------ */}
          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader
                title="Vistas por red"
                subtitle="Un video publicado en varias redes suma en cada una"
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

          {/* 4 · Qué estructura funciona ---------------------------------- */}
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
          </Card>

          {/* 5 · Ranking de videos ---------------------------------------- */}
          <Card className="mb-4 overflow-hidden">
            <CardHeader
              title="Ranking de videos"
              subtitle={`${formatNumber(ranking.length)} ${ranking.length === 1 ? "video" : "videos"} con métricas en el rango. Toca Vistas, Interacciones o ROAS para reordenar.`}
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
                        href={construirHref(sp, { orden: null })}
                      />
                    </th>
                    <th style={{ textAlign: "right" }}>
                      <SortHeader
                        label="Interacciones"
                        activo={orden === "interacciones"}
                        href={construirHref(sp, { orden: "interacciones" })}
                      />
                    </th>
                    <th style={{ textAlign: "right" }}>Ret. 3s</th>
                    <th style={{ textAlign: "right" }}>Inversión</th>
                    <th style={{ textAlign: "right" }}>Ingresos</th>
                    <th style={{ textAlign: "right" }}>
                      <SortHeader
                        label="ROAS"
                        activo={orden === "roas"}
                        href={construirHref(sp, { orden: "roas" })}
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
                          <span className="text-inkmuted">{i + 1}</span>
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
                          <PlatformBadges platforms={v.platforms} max={2} />
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
        </>
      )}

      {/* 6 · Importación ----------------------------------------------- */}
      {bloqueImportacion ? (
        <>
          <SectionTitle>Cargar más datos</SectionTitle>
          {bloqueImportacion}
        </>
      ) : null}
    </>
  );
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
