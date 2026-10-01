import { resolveObjectiveValues } from "@/lib/objective-service";
import { MemberWorkspace } from "@/components/member-workspace";
import { SectionLoading } from "@/components/section-loading";
import { measurePhase } from "@/lib/performance";
import { measurePagePhase } from "@/lib/performance-page";
import { weeklyDateRange } from "@/lib/report-dates";
import { getPageBrandContext as getBrandContext, requirePageUser as requireUser } from "@/lib/render-context";
import { endOfDay, startOfDay } from "@/lib/utils";
import type { Prisma } from "@prisma/client";
import {
	Activity,
	AlertTriangle,
	CalendarClock,
	CheckCircle2,
	Eye,
	Film,
	ListChecks,
	PartyPopper,
	Plus,
	Sparkles,
	Tags,
	Target,
} from "lucide-react";
import Link from "next/link";
import { cache, Suspense, type ReactNode } from "react";

import { FunnelBars } from "@/components/charts";
import { ManualCard } from "@/components/manual/manual-card";
import { RolePanelCards } from "@/components/role-panel-cards";
import { MyWorkSection } from "@/components/work/my-work";
import {
	Avatar,
	AvatarStack,
	Badge,
	Card,
	CardHeader,
	ColorChip,
	EmptyState,
	PageHeader,
	ProgressBar,
	SectionTitle,
	Stat,
} from "@/components/ui";
import { archiveEpoch, liveBrand, liveContent, liveScript } from "@/lib/archive-scope";
import { brandWhere } from "@/lib/brand-context";
import {
	ACTIVE_STATUSES,
	ASSIGNMENT_ROLE_MAP,
	CONTENT_STATUS_MAP,
	CONTENT_STATUSES,
	DEAD_STATUSES,
	DONE_STATUSES,
	OBJECTIVE_STATUS_MAP,
	platformLabels
} from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { productionChainActiveFor } from "@/lib/production-chain-flag";
import { countsFromRows, openStepCounts, ownerRoleCards } from "@/lib/role-counts";
import { roleOrderEnabled } from "@/lib/role-order-flag";
import {
	addDays,
	compactNumber,
	dateKey,
	endOfMonth,
	formatDate,
	formatDateLong,
	formatNumber,
	fromDateKey,
	objectiveProgress,
	parseList,
	relativeTime,
	startOfMonth,
	truncate,
} from "@/lib/utils";

/**
 * Estados que ya no exigen trabajo: no cuentan como atraso ni como pendiente.
 * Se arma desde los catálogos para que el panel y el calendario cuenten igual;
 * un video PAUSADO con fecha vencida no es un atraso, está detenido a propósito.
 */
const CERRADOS = [...DONE_STATUSES, ...DEAD_STATUSES];

/** Color de la barra de un objetivo segun cuanto se ha avanzado. */
function colorAvance(pct: number) {
  if (pct >= 100) return "var(--ok)";
  if (pct >= 60) return "var(--warn)";
  return "var(--danger)";
}

/** "hace 3 dias", "hoy", "en 4 dias" a partir de la fecha programada. */
function etiquetaPlazo(dias: number) {
  if (dias < -1) return `${Math.abs(dias)} días de retraso`;
  if (dias === -1) return "1 día de retraso";
  if (dias === 0) return "Es hoy";
  if (dias === 1) return "Mañana";
  return `En ${dias} días`;
}

const getPanelContext = cache(async () => {
  const user = await requireUser();
  const brandCtx = await getBrandContext();
  const soloMarca = brandWhere(brandCtx.activeId);
  // Archivo total (ARCHIVO_TOTAL_DESDE): el panel no cuenta nada de marcas archivadas ni lo
  // personal anterior a la época. Con el interruptor vacío, los filtros quedan como antes.
  const epoch = archiveEpoch();
  const videos: Prisma.ContentItemWhereInput = epoch ? { AND: [soloMarca, liveContent(epoch)] } : soloMarca;
  const guiones: Prisma.ScriptWhereInput = epoch ? { AND: [soloMarca, liveScript(epoch)] } : soloMarca;

  const ahora = new Date();
  const [businessYear, businessMonth] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(ahora).split("-").map(Number);
  const anio = businessYear;
  const mes = (businessMonth - 1);
  const inicioMes = startOfMonth(anio, mes);
  const finMes = endOfMonth(anio, mes);
  const semanasMes = weeklyDateRange(dateKey(inicioMes), dateKey(finMes));
  const hoy = fromDateKey(dateKey(ahora));
  const inicioHoy = startOfDay(ahora);
  const limite7 = addDays(endOfDay(ahora), 7);

  // Un video cuenta como publicado este mes por su fecha real de publicacion;
  // si nunca se registro, se usa la fecha en la que estaba programado.
  const publicadoEsteMes: Prisma.ContentItemWhereInput = {
    ...videos,
    status: "PUBLICADO",
    OR: [
      { publishedAt: { gte: inicioMes, lte: finMes } },
      { publishedAt: null, scheduledDate: { gte: inicioMes, lte: finMes } },
    ],
  };

  const atrasadosWhere: Prisma.ContentItemWhereInput = {
    ...videos,
    scheduledDate: { lt: inicioHoy },
    status: { notIn: CERRADOS },
  };


  return { user, brandCtx, soloMarca, epoch, videos, guiones, ahora, inicioMes, finMes, semanasMes, hoy, inicioHoy, limite7, publicadoEsteMes, atrasadosWhere };
});

export default async function PanelGeneral() {
  const member = await requireUser();
  if (member.role !== "OWNER") return <MemberWorkspace user={member} section="panel" />;
  return measurePagePhase("page:/", async () => {
  const { user, ahora, brandCtx } = await getPanelContext();
  const scope = brandCtx.activeId ?? "all";
  const nombreCorto = user.name.trim().split(/\s+/)[0] ?? user.name;
  const fechaLarga = formatDateLong(ahora);
  const fechaTitulo = fechaLarga.charAt(0).toUpperCase() + fechaLarga.slice(1);
  // Permite comparar un solo límite de carga con el streaming de cada sección.
  // Las consultas siguen siendo paralelas; no se agrega caché de datos ni permisos.
  // Cadena de entregas: «Mi trabajo» va primero, encima del Manual (decisión del Dueño, 30/09/2026).
  // Apagada no se monta ni consulta nada.
  const chain = productionChainActiveFor(user, brandCtx.activeId);
  // ORDEN_POR_ROL: inicio por paneles de rol. Apagado, el JSX, el orden y las consultas de siempre
  // (PanelRoles no se monta).
  const roleOrder = roleOrderEnabled();
  // Bloques por nombre (no por posición): los dos modos de PANEL_RENDER_MODE y los dos estados del
  // interruptor piden cada bloque por su clave, así que reordenar uno no pinta otro en su lugar.
  const sections: PanelSections | null = process.env.PANEL_RENDER_MODE !== "streaming"
    ? await Promise.all([
        PanelStats({ ordered: roleOrder }),
        PanelPending(),
        PanelObjectives(),
        PanelFunnel(),
        PanelActivity(),
        PanelBrands(),
        chain ? MyWorkSection({ user, brandId: brandCtx.activeId, className: "mb-5" }) : null,
        roleOrder ? PanelRoles({ chain }) : null,
      ]).then(([stats, pending, objectives, funnel, activity, brands, mywork, roles]) => ({ stats, pending, objectives, funnel, activity, brands, mywork, roles }))
    : null;
  const streamed: Record<PanelSectionKey, { label: string; node: ReactNode; wrap?: boolean }> = {
    stats: { label: "indicadores", node: <PanelStats ordered={roleOrder} /> },
    pending: { label: "pendientes", node: <PanelPending /> },
    objectives: { label: "objetivos", node: <PanelObjectives /> },
    funnel: { label: "producción", node: <PanelFunnel /> },
    activity: { label: "actividad", node: <PanelActivity /> },
    brands: { label: "marcas", node: <PanelBrands /> },
    mywork: { label: "tu trabajo", node: <MyWorkSection user={user} brandId={brandCtx.activeId} className="mb-5" />, wrap: true },
    roles: { label: "paneles por rol", node: <PanelRoles chain={chain} />, wrap: true },
  };
  /** Un bloque por su nombre: ya resuelto (modo de siempre) o en su propio Suspense (streaming). */
  const block = (key: PanelSectionKey) => {
    if (sections) return sections[key];
    const { label, node, wrap } = streamed[key];
    const loading = <SectionLoading label={label} />;
    return <Suspense key={scope + key} fallback={wrap ? <div className="mb-5">{loading}</div> : loading}>{node}</Suspense>;
  };

  if (!roleOrder) {
    // ORDEN_POR_ROL=false: el inicio de siempre (cabecera, Mi trabajo, Manual, indicadores,
    // [pendientes y objetivos | embudo y actividad], marcas).
    return <>
      <PageHeader
          title={`Hola, ${nombreCorto}`}
          subtitle={fechaTitulo}
          icon={<Sparkles size={19} />}
          actions={
            <>
              <Link href="/generador" className="btn">
                <Sparkles size={14} /> Generar guion
              </Link>
              <Link href="/contenido" className="btn btn-primary">
                <Plus size={14} /> Nuevo video
              </Link>
            </>
          }
        />
      {chain ? block("mywork") : null}
      <ManualCard user={user} variant="banner" className="mb-5" />
      {block("stats")}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">{block("pending")}{block("objectives")}</div>
        <div className="min-w-0 space-y-5">{block("funnel")}{block("activity")}</div>
      </div>
      {block("brands")}
    </>;
  }

  // ORDEN_POR_ROL: Mi trabajo (con la cadena) → paneles por rol → Panel del Dueño → Panel de
  // estrategia → Manual. «Mi trabajo» sigue primero por la decisión del 30/09; si el Dueño pide
  // «panel de dueño de primero», basta con mover esa línea.
  return <>
    <PageHeader
        title={`Hola, ${nombreCorto}`}
        subtitle={fechaTitulo}
        icon={<Sparkles size={19} />}
        actions={
          <>
            <Link href="/contenido" className="btn btn-primary">
              <Plus size={14} /> Nuevo video
            </Link>
            <Link href="/generador" className="btn">
              <Sparkles size={14} /> Generar guion
            </Link>
          </>
        }
      />
    {chain ? block("mywork") : null}
    {block("roles")}
    <section aria-labelledby="panel-dueno-title" className="mb-6">
      <h2 id="panel-dueno-title" className="text-inkmuted mb-2.5 text-[11px] font-bold tracking-[0.09em] uppercase">Panel del Dueño</h2>
      {block("stats")}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">{block("objectives")}</div>
        <div className="min-w-0">{block("activity")}</div>
      </div>
      {block("brands")}
    </section>
    <section aria-labelledby="panel-estrategia-title" className="mb-5">
      <h2 id="panel-estrategia-title" className="text-inkmuted mb-2.5 text-[11px] font-bold tracking-[0.09em] uppercase">Panel de estrategia</h2>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">{block("pending")}</div>
        <div className="min-w-0">{block("funnel")}</div>
      </div>
    </section>
    <ManualCard user={user} variant="banner" />
  </>;

  });
}

type PanelSectionKey = "stats" | "pending" | "objectives" | "funnel" | "activity" | "brands" | "mywork" | "roles";
type PanelSections = Record<PanelSectionKey, ReactNode>;

/**
 * Conteo de videos por estado (el groupBy del embudo), una sola vez por petición: lo comparten
 * PanelFunnel y PanelRoles, así que con la cadena apagada las tarjetas de rol no consultan nada.
 */
const getStatusCounts = cache(async (): Promise<Record<string, number>> => {
  const { videos } = await getPanelContext();
  const [porEstado] = await measurePhase("panel.funnel", () => Promise.all([
    prisma.contentItem.groupBy({ by: ["status"], _count: { _all: true }, where: videos })
  ]));
  return countsFromRows(porEstado, "status");
});

/**
 * «Paneles por rol» (ORDEN_POR_ROL): las 10 tarjetas en ROLE_ORDER. Con la cadena encendida suma
 * una consulta (pasos abiertos por paso, misma regla que /cadena); apagada, solo reusa el embudo.
 */
async function PanelRoles({ chain }: { chain: boolean }) {
  const { videos } = await getPanelContext();
  const [statusCounts, stepCounts] = await measurePhase("panel.roles", () => Promise.all([
    getStatusCounts(),
    chain ? openStepCounts(videos) : Promise.resolve(null),
  ]));
  const cards = ownerRoleCards({ statusCounts, stepCounts, chain });
  return <section data-ready-block="panel.roles" aria-labelledby="panel-roles-title" className="mb-6">
    <h2 id="panel-roles-title" className="text-inkmuted mb-2.5 text-[11px] font-bold tracking-[0.09em] uppercase">Paneles por rol</h2>
    <RolePanelCards variant="owner" cards={cards} />
  </section>;
}

async function PanelStats({ ordered = false }: { ordered?: boolean } = {}) {
  const { brandCtx, epoch, videos, inicioMes, finMes, semanasMes, publicadoEsteMes, atrasadosWhere } = await getPanelContext();
  const [publicados, enProduccion, atrasados, vistasMes] = await measurePhase("panel.stats", () => Promise.all([
    prisma.contentItem.count({ where: publicadoEsteMes }),
    prisma.contentItem.count({ where: { ...videos, status: { in: ACTIVE_STATUSES } } }),
    prisma.contentItem.count({ where: atrasadosWhere }),
    prisma.metric.aggregate({
      _sum: { views: true },
      where: {
        period: "WEEKLY",
        date: { gte: fromDateKey(semanasMes.desde), lte: fromDateKey(semanasMes.hasta) },
        ...(brandCtx.activeId || epoch ? { contentItem: videos } : {}),
      },
    })
  ]));
  const vistas = vistasMes._sum.views ?? 0;
  // ORDEN_POR_ROL: mosaicos en orden de flujo (En producción, Atrasados, Publicados este mes,
  // Vistas semanales). Apagado, el orden de siempre.
  const publicadosTile = (
    <Stat
      label="Publicados este mes"
      value={formatNumber(publicados)}
      sub="Videos que ya salieron"
      icon={<CheckCircle2 size={16} />}
      accent="#10b981"
      href={`/contenido?estado=PUBLICADO&desde=${dateKey(inicioMes)}&hasta=${dateKey(finMes)}`}
    />
  );
  const produccionTile = (
    <Stat
      label="En producción"
      value={formatNumber(enProduccion)}
      sub="De la idea al programado"
      icon={<Film size={16} />}
      accent="#6366f1"
      href="/contenido?vista=produccion"
    />
  );
  const atrasadosTile = (
    <Stat
      label="Atrasados"
      value={formatNumber(atrasados)}
      sub={atrasados > 0 ? "Se pasaron de fecha" : "Nada fuera de plazo"}
      icon={<AlertTriangle size={16} />}
      accent={atrasados > 0 ? "#f43f5e" : "#64748b"}
      href="/contenido?vista=atrasados"
    />
  );
  const vistasTile = (
    <Stat
      label="Vistas semanales"
      value={compactNumber(vistas)}
      sub="Semanas que abarcan este mes"
      icon={<Eye size={16} />}
      accent="#0ea5e9"
      href={`/metricas?desde=${dateKey(inicioMes)}&hasta=${dateKey(finMes)}`}
    />
  );
  return <section data-ready-block="panel.stats"><div className="mb-5 grid grid-cols-2 gap-3 sm:gap-3.5 xl:grid-cols-4">
        {ordered ? <>{produccionTile}{atrasadosTile}{publicadosTile}{vistasTile}</> : <>{publicadosTile}{produccionTile}{atrasadosTile}{vistasTile}</>}
      </div></section>;
}

async function PanelPending() {
  const { videos, hoy, limite7 } = await getPanelContext();
  const [pendientes] = await measurePhase("panel.pending", () => Promise.all([
    prisma.contentItem.findMany({
      where: {
        ...videos,
        status: { notIn: CERRADOS },
        scheduledDate: { lte: limite7 },
      },
      orderBy: [{ scheduledDate: "asc" }, { title: "asc" }],
      take: 14,
      select: {
        id: true,
        title: true,
        status: true,
        platforms: true,
        scheduledDate: true,
        brand: { select: { id: true, name: true, colorPrimary: true } },
        assignments: {
          select: { role: true, user: { select: { name: true, color: true } } },
        },
        checklist: { select: { done: true } },
      },
    })
  ]));

  return <section data-ready-block="panel.pending"><Card>
            <CardHeader
              title="Qué falta por hacer"
              subtitle="Atrasados y lo que vence en los próximos 7 días"
              icon={<ListChecks size={16} />}
              actions={
                <Link href="/calendario" className="btn btn-sm btn-ghost">
                  Ver calendario
                </Link>
              }
            />
            {pendientes.length === 0 ? (
              <EmptyState
                icon={<PartyPopper size={18} />}
                title="Todo al día"
                description="No hay videos atrasados ni con fecha en los próximos 7 días. Buen momento para adelantar guiones."
                action={
                  <Link href="/generador" className="btn btn-primary btn-sm">
                    <Sparkles size={13} /> Generar un guion
                  </Link>
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="tbl tbl-cards">
                  <thead>
                    <tr>
                      <th>Video</th>
                      <th className="w-[104px]">Estado</th>
                      <th className="w-[150px]">Fecha</th>
                      <th className="w-[110px]">Equipo</th>
                      <th className="w-[132px]">Checklist</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendientes.map((item) => {
                      const dias = Math.round(
                        (fromDateKey(dateKey(item.scheduledDate)).getTime() -
                          hoy.getTime()) /
                          86_400_000
                      );
                      const tarde = dias < 0;
                      const hechos = item.checklist.filter((c) => c.done).length;
                      const total = item.checklist.length;
                      const pct = total ? (hechos / total) * 100 : 0;

                      return (
                        <tr key={item.id}>
                          <td className="tbl-card-head">
                            <Link
                              href={`/contenido/${item.id}`}
                              className="flex min-w-0 items-center gap-2.5"
                            >
                              <span
                                className="h-6 w-[3px] shrink-0 rounded-full"
                                style={{ background: item.brand.colorPrimary }}
                              />
                              <span className="min-w-0">
                                <span className="text-ink hover:text-brand block truncate text-[13px] font-semibold transition-colors">
                                  {truncate(item.title, 62)}
                                </span>
                                <span className="text-inkmuted mt-0.5 flex items-center gap-1.5 text-[11.5px]">
                                  <span className="truncate">{item.brand.name}</span>
                                  <span className="opacity-40">·</span>
                                  <span className="truncate">
                                    {platformLabels(parseList(item.platforms))}
                                  </span>
                                </span>
                              </span>
                            </Link>
                          </td>
                          <td data-label="Estado">
                            <Badge
                              option={CONTENT_STATUS_MAP[item.status]}
                              fallback={item.status}
                            />
                          </td>
                          <td data-label="Fecha">
                            <div className="text-inksoft text-[12.5px] font-medium">
                              {formatDate(item.scheduledDate)}
                            </div>
                            <div
                              className={
                                tarde
                                  ? "text-danger mt-0.5 text-[11.5px] font-semibold"
                                  : "text-inkmuted mt-0.5 text-[11.5px]"
                              }
                            >
                              {etiquetaPlazo(dias)}
                            </div>
                          </td>
                          <td data-label="Equipo">
                            <AvatarStack
                              size={22}
                              people={item.assignments.map((a) => ({
                                name: a.user.name,
                                color: a.user.color,
                                label: `${a.user.name} — ${
                                  ASSIGNMENT_ROLE_MAP[a.role]?.label ?? a.role
                                }`,
                              }))}
                            />
                          </td>
                          <td data-label="Checklist">
                            {total === 0 ? (
                              <span className="text-inkmuted text-xs">—</span>
                            ) : (
                              <div>
                                <div className="text-inksoft mb-1 text-[11.5px] font-semibold tabular-nums">
                                  {hechos}/{total}
                                </div>
                                <ProgressBar
                                  value={pct}
                                  height={5}
                                  color={pct >= 100 ? "var(--ok)" : "var(--brand)"}
                                />
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card></section>;
}

async function PanelObjectives() {
  const { user, soloMarca, epoch } = await getPanelContext();
  const [objetivosBase] = await measurePhase("panel.objectives", () => Promise.all([
    prisma.brandObjective.findMany({
      // Archivo total: solo objetivos de marcas vivas.
      where: { ...soloMarca, status: { in: ["EN_CURSO", "EN_RIESGO"] }, ...(epoch ? { brand: liveBrand(epoch) } : {}) },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        unit: true,
        currentValue: true, brandId: true, calculationMode: true,
        targetValue: true,
        baselineValue: true,
        higherIsBetter: true,
        status: true,
        deadline: true,
        brand: { select: { id: true, name: true, colorPrimary: true } },
      },
    })
  ]));
  const objetivos = await resolveObjectiveValues(user, objetivosBase);
  const objetivosConAvance = objetivos
    .map((o) => ({
      ...o,
      avance: objectiveProgress(
        o.currentValue,
        o.targetValue,
        o.baselineValue,
        o.higherIsBetter
      ),
    }))
    .sort((a, b) => b.avance - a.avance);

  const logrando = objetivosConAvance.filter((o) => o.avance >= 80);
  const enCamino = objetivosConAvance.filter((o) => o.avance >= 50 && o.avance < 80);
  const fallando = objetivosConAvance.filter((o) => o.avance < 50);


  return <section data-ready-block="panel.objectives"><Card>
            <CardHeader
              title="Objetivos de las marcas"
              subtitle="Lo que cada marca prometió mover este período"
              icon={<Target size={16} />}
              actions={
                <Link href="/marcas" className="btn btn-sm btn-ghost">
                  Ver marcas
                </Link>
              }
            />
            {objetivosConAvance.length === 0 ? (
              <EmptyState
                icon={<Target size={18} />}
                title="Ninguna marca tiene objetivos activos"
                description="Sin un número que perseguir no se sabe si el contenido está funcionando. Define al menos un objetivo por marca."
                action={
                  <Link href="/marcas" className="btn btn-primary btn-sm">
                    Definir objetivos
                  </Link>
                }
              />
            ) : (
              <div className="space-y-5 p-4">
                <GrupoObjetivos
                  titulo="Se está logrando"
                  vacio="Todavía ningún objetivo pasa del 80 %."
                  objetivos={logrando}
                />
                {enCamino.length > 0 ? (
                  <GrupoObjetivos titulo="A medio camino" objetivos={enCamino} />
                ) : null}
                <GrupoObjetivos
                  titulo="No se está logrando"
                  vacio="Ningún objetivo está por debajo del 50 %. Buena señal."
                  objetivos={fallando}
                />
              </div>
            )}
          </Card></section>;
}

async function PanelFunnel() {
  const conteoEstado = await getStatusCounts();
  const embudo = CONTENT_STATUSES.map((estado) => ({
    label: estado.label,
    value: conteoEstado[estado.value] ?? 0,
    color: estado.hex,
  }));


  return <section data-ready-block="panel.funnel"><Card>
            <CardHeader
              title="Embudo de producción"
              subtitle="Videos en cada etapa"
              icon={<Film size={16} />}
            />
            <div className="p-4">
              <FunnelBars data={embudo} />
            </div>
          </Card></section>;
}

async function PanelActivity() {
  const { brandCtx, epoch } = await getPanelContext();
  // Archivo total: con «todas las marcas», solo lo de marcas vivas (las del selector, que nunca
  // incluye archivadas) y lo sin marca desde la época. /actividad conserva el historial completo.
  const actividadWhere: Prisma.AuditLogWhereInput = brandCtx.activeId
    ? { brandId: brandCtx.activeId }
    : epoch
      ? { OR: [{ brandId: { in: brandCtx.brands.map((b) => b.id) } }, { brandId: null, createdAt: { gte: epoch } }] }
      : {};
  const [actividad] = await measurePhase("panel.activity", () => Promise.all([
    prisma.auditLog.findMany({
      where: actividadWhere,
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        summary: true,
        createdAt: true,
        userName: true,
        user: { select: { name: true, color: true } },
      },
    })
  ]));

  return <section data-ready-block="panel.activity"><Card>
            <CardHeader
              title="Última actividad"
              icon={<Activity size={16} />}
              actions={
                <Link href="/actividad" className="btn btn-sm btn-ghost">
                  Ver todo
                </Link>
              }
            />
            {actividad.length === 0 ? (
              <EmptyState
                icon={<Activity size={18} />}
                title="Sin movimientos todavía"
                description="Aquí aparecerá cada cambio que haga el equipo: quién, qué y cuándo."
              />
            ) : (
              <ul className="divide-line divide-y">
                {actividad.map((log) => {
                  const nombre = log.user?.name ?? log.userName ?? "Sistema";
                  const color = log.user?.color ?? "#64748b";
                  return (
                    <li key={log.id} className="flex items-start gap-2.5 px-4 py-2.5">
                      <span className="mt-0.5 shrink-0">
                        <Avatar name={nombre} color={color} size={24} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-inksoft text-[12.5px] leading-snug">
                          <span className="text-ink font-semibold">{nombre}</span>{" "}
                          {log.summary}
                        </p>
                        <p className="text-inkmuted mt-0.5 text-[11px]">
                          {relativeTime(log.createdAt)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card></section>;
}

async function PanelBrands() {
  const { brandCtx, videos, guiones, inicioMes, finMes, publicadoEsteMes } = await getPanelContext();
  const [marcas, videosPorMarca, publicadosPorMarca, guionesPorMarca] = await measurePhase("panel.brands", () => Promise.all([
    prisma.brand.findMany({
      where: {
        active: true,
        archived: false,
        ...(brandCtx.activeId ? { id: brandCtx.activeId } : {}),
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, tagline: true, colorPrimary: true },
    }),
    prisma.contentItem.groupBy({
      by: ["brandId"],
      _count: { _all: true },
      where: { ...videos, scheduledDate: { gte: inicioMes, lte: finMes } },
    }),
    prisma.contentItem.groupBy({
      by: ["brandId"],
      _count: { _all: true },
      where: publicadoEsteMes,
    }),
    prisma.script.groupBy({ by: ["brandId"], _count: { _all: true }, where: guiones })
  ]));
  const videosMarca = new Map<string, number>(
    videosPorMarca.map((r) => [r.brandId, r._count._all] as const)
  );
  const publicadosMarca = new Map<string, number>(
    publicadosPorMarca.map((r) => [r.brandId, r._count._all] as const)
  );
  const guionesMarca = new Map<string, number>(
    guionesPorMarca
      .filter((r): r is typeof r & { brandId: string } => r.brandId !== null)
      .map((r) => [r.brandId, r._count._all] as const)
  );


  return <section data-ready-block="panel.brands"><div className="mt-6">
        <SectionTitle
          action={
            <Link href="/marcas" className="btn btn-sm btn-ghost">
              Ver todas
            </Link>
          }
        >
          Marcas
        </SectionTitle>

        {marcas.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Tags size={18} />}
              title="Todavía no hay marcas"
              description="Crea la primera marca para empezar a planificar contenido, guiones y objetivos."
              action={
                <Link href="/marcas" className="btn btn-primary btn-sm">
                  <Plus size={13} /> Crear marca
                </Link>
              }
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
            {marcas.map((marca) => {
              const delMes = videosMarca.get(marca.id) ?? 0;
              const pub = publicadosMarca.get(marca.id) ?? 0;
              const gui = guionesMarca.get(marca.id) ?? 0;
              return (
                <Link key={marca.id} href={`/marcas/${marca.id}`} className="block">
                  <Card
                    className="brand-strip h-full p-4 pl-5 transition-shadow hover:shadow-[var(--shadow-2)]"
                    style={{ ["--strip" as string]: marca.colorPrimary }}
                  >
                    <ColorChip color={marca.colorPrimary}>{marca.name}</ColorChip>
                    <p className="text-inkmuted mt-2 min-h-[32px] text-[12px] leading-snug">
                      {marca.tagline ? truncate(marca.tagline, 70) : "Sin lema definido"}
                    </p>
                    <div className="border-line mt-3 grid grid-cols-3 gap-2 border-t pt-3">
                      <MiniCifra label="Del mes" valor={delMes} />
                      <MiniCifra label="Publicados" valor={pub} />
                      <MiniCifra label="Guiones" valor={gui} />
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div></section>;
}

/* --------------------------------------------------------------- AUXILIARES */

type ObjetivoConAvance = {
  id: string;
  name: string;
  unit: string;
  currentValue: number;
  targetValue: number;
  status: string;
  deadline: Date | null;
  avance: number;
  brand: { id: string; name: string; colorPrimary: string };
};

function GrupoObjetivos({
  titulo,
  objetivos,
  vacio,
}: {
  titulo: string;
  objetivos: ObjetivoConAvance[];
  vacio?: string;
}) {
  if (objetivos.length === 0 && !vacio) return null;

  return (
    <div>
      <div className="mb-2.5 flex items-center gap-2">
        <h3 className="text-inkmuted text-[11px] font-bold tracking-[0.09em] uppercase">
          {titulo}
        </h3>
        <span className="bg-surface3 text-inkmuted rounded-md px-1.5 py-px text-[10.5px] font-bold tabular-nums">
          {objetivos.length}
        </span>
        <span className="border-line flex-1 border-t" />
      </div>

      {objetivos.length === 0 ? (
        <p className="text-inkmuted text-[12.5px] leading-relaxed">{vacio}</p>
      ) : (
        <div className="space-y-3">
          {objetivos.map((o) => (
            <div key={o.id} className="min-w-0">
              <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                <ColorChip color={o.brand.colorPrimary} href={`/marcas/${o.brand.id}`}>
                  {o.brand.name}
                </ColorChip>
                <span className="text-ink min-w-0 truncate text-[13px] font-semibold">
                  {o.name}
                </span>
                <Badge option={OBJECTIVE_STATUS_MAP[o.status]} fallback={o.status} />
                {o.deadline ? (
                  <span className="text-inkmuted flex items-center gap-1 text-[11.5px]">
                    <CalendarClock size={11} /> {formatDate(o.deadline)}
                  </span>
                ) : null}
                <span className="text-ink ml-auto shrink-0 text-[12.5px] font-bold tabular-nums">
                  {formatNumber(o.avance)} %
                </span>
              </div>
              <ProgressBar value={o.avance} color={colorAvance(o.avance)} height={7} />
              <div className="text-inkmuted mt-1 text-[11.5px] tabular-nums">
                {formatNumber(o.currentValue)}
                {o.unit ? ` ${o.unit}` : ""} de {formatNumber(o.targetValue)}
                {o.unit ? ` ${o.unit}` : ""}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MiniCifra({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="min-w-0">
      <div className="text-ink text-[15px] leading-none font-bold tabular-nums">
        {formatNumber(valor)}
      </div>
      <div className="text-inkmuted mt-1 truncate text-[10.5px] font-medium">{label}</div>
    </div>
  );
}
