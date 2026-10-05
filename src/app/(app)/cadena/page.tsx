import { AlertTriangle, ArrowRight, Bell, CheckCircle2, CircleDashed, Clock, UserX, Workflow } from "lucide-react";
import Link from "next/link";

import { ActiveFilters, FilterBar, FilterDisclosure, FilterSelect } from "@/components/filters";
import { Badge, Callout, Card, CardHeader, ColorChip, EmptyState, PageHeader, Stat } from "@/components/ui";
import { StepAnnouncement, StepAnnouncerProvider } from "@/components/work/announcer";
import { AtenderAvisoButton, CrearPasoButton } from "@/components/work/step-actions";
import { dueText, sentence } from "@/components/work/step-copy";
import { CHAIN_ORDER, CHAIN_STEP_RULES, PRODUCTION_STEP_MAP, PRODUCTION_STEP_STATUS_MAP } from "@/lib/constants";
import { measurePagePhase } from "@/lib/performance-page";
import { productionChainBrands, productionChainConfigured } from "@/lib/production-chain-flag";
import { UNASSIGNED_FILTER, readChain, type ChainBoard, type StepCard, type StepKind } from "@/lib/production-scope";
import { singleQueryValues } from "@/lib/query-params";
import { getPageBrandContext, requirePageSection } from "@/lib/render-context";
import { cn, formatNumber } from "@/lib/utils";

/**
 * Vista «Cadena» (cadena de entregas, PRODUCTION_CHAIN_ENABLED): el ENCARGADO (STRATEGY) y el
 * Dueño ven cada video activo con su paso abierto, responsable, plazo y lo que está trabado
 * (vencido, devuelto, sin asignar, avisos, responsable sin acceso, sin paso). Filtros por la
 * marca activa (selector de marca), por paso, por persona (o «Sin asignar») y solo vencidos,
 * todos en la URL. La lista de personas y la cabecera no dependen de los filtros. Los avisos se
 * dan por atendidos aquí mismo.
 * En el celular la tabla se lee como tarjetas (tbl-cards); en escritorio, como tabla.
 */

export const dynamic = "force-dynamic";

type Query = { paso?: string; persona?: string; vencidos?: string };
const STEP_FILTERS: readonly StepKind[] = [...CHAIN_ORDER, "DISENO"];
const isStepFilter = (value: string | undefined): value is StepKind => Boolean(value && (STEP_FILTERS as readonly string[]).includes(value));

export default async function CadenaPage({ searchParams }: { searchParams: Promise<Query> }) {
  return measurePagePhase("page:/cadena", async () => {
    const user = await requirePageSection("chain");
    const header = (
      <PageHeader
        title="Cadena de entregas"
        subtitle="Quién tiene cada video, para cuándo y qué está trabado. Guion → Grabación → Edición → Publicación."
        icon={<Workflow size={19} />}
      />
    );
    if (!productionChainConfigured()) {
      return (
        <>
          {header}
          <Callout tone="info" title="La cadena de entregas no está activa">
            Cuando se active, aquí verás cada video con su paso abierto, su responsable y su plazo.
            {user.role === "OWNER" ? " Se enciende con PRODUCTION_CHAIN_ENABLED=true (requiere PRODUCTION_FLOW_ENABLED=true)." : ""}
          </Callout>
        </>
      );
    }

    const query = singleQueryValues(await searchParams);
    const paso = isStepFilter(query.paso) ? query.paso : null;
    const persona = query.persona?.trim().slice(0, 100) || null;
    const vencidos = query.vencidos === "1";
    const context = await getPageBrandContext();
    const now = new Date();
    const board = await readChain(user, { brandId: context.activeId, personId: persona, onlyOverdue: vencidos, now });
    if (!board.allowed) {
      return (
        <>
          {header}
          <Callout tone="warn" title="Sin acceso a la Cadena">Tu perfil no coordina marcas. Pide acceso al Dueño.</Callout>
        </>
      );
    }

    const activeBrand = context.activeId ? context.brands.find((brand) => brand.id === context.activeId) ?? null : null;
    const canary = productionChainBrands();
    const all = [...CHAIN_ORDER.flatMap((step) => board.columns[step]), ...board.designs];
    const rows = (paso ? (paso === "DISENO" ? board.designs : board.columns[paso]) : all)
      .slice()
      .sort((a, b) => (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity) || a.video.title.localeCompare(b.video.title, "es"));
    const personName = persona === UNASSIGNED_FILTER ? "Sin asignar" : persona ? board.people.find((p) => p.id === persona)?.name ?? "Persona elegida" : null;
    const labels: Record<string, string> = {
      ...(paso ? { paso: `Paso: ${PRODUCTION_STEP_MAP[paso]?.label ?? paso}` } : {}),
      ...(persona ? { persona: `Responsable: ${personName}` } : {}),
      ...(vencidos ? { vencidos: "Solo vencidos" } : {}),
    };
    const hrefFor = (next: Partial<Query>) => {
      const params = new URLSearchParams();
      const merged = { paso: paso ?? undefined, persona: persona ?? undefined, vencidos: vencidos ? "1" : undefined, ...next };
      for (const [key, value] of Object.entries(merged)) if (value) params.set(key, value);
      const qs = params.toString();
      return qs ? `/cadena?${qs}` : "/cadena";
    };

    // El aviso de «Aviso atendido» o «Crear paso» vive aquí: la fila del atasco se va al refrescar.
    return (
      <StepAnnouncerProvider focusId="atascos-titulo">
        {header}
        <p className="text-inkmuted -mt-3 mb-4 text-[12.5px]">
          {activeBrand ? <>Marca activa: <strong className="text-inksoft">{activeBrand.name}</strong> (cámbiala en el selector de marca).</> : "Todas tus marcas. Elige una en el selector de marca para ver solo esa."}
          {canary ? " Cadena en prueba: solo en las marcas del canario." : ""}
        </p>
        <StepAnnouncement className="card mb-4 px-4 py-2.5" />

        <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-3.5 xl:grid-cols-4" data-chain-header>
          <Stat label="Pasos abiertos" value={formatNumber(board.header.open)} sub="Uno por video, más diseños" icon={<CircleDashed size={16} />} accent="#6366f1" href={hrefFor({ vencidos: undefined })} />
          <Stat label="Vencidos" value={formatNumber(board.header.overdue)} sub={board.header.overdue ? "Pasaron su plazo" : "Nada fuera de plazo"} icon={<AlertTriangle size={16} />} accent={board.header.overdue ? "#f43f5e" : "#64748b"} href={hrefFor({ vencidos: "1" })} />
          <Stat label="Sin asignar" value={formatNumber(board.header.unassigned)} sub="Pasos sin responsable" icon={<UserX size={16} />} accent={board.header.unassigned ? "#d97706" : "#64748b"} href={hrefFor({ persona: UNASSIGNED_FILTER, vencidos: undefined })} />
          <Stat label="Publicados esta semana" value={formatNumber(board.header.publishedThisWeek)} sub="Desde el lunes (Lima)" icon={<CheckCircle2 size={16} />} accent="#10b981" />
        </div>

        <StepStrip board={board} active={paso} hrefFor={hrefFor} />

        <FilterBar className="mt-4">
          <FilterDisclosure count={Object.keys(labels).length}>
            <FilterSelect param="paso" allLabel="Todos los pasos" responsive options={STEP_FILTERS.map((step) => ({ value: step, label: PRODUCTION_STEP_MAP[step]?.label ?? step }))} />
            <FilterSelect param="persona" allLabel="Todas las personas" responsive width={190} options={[{ value: UNASSIGNED_FILTER, label: "Sin asignar" }, ...board.people.map((p) => ({ value: p.id, label: p.name }))]} />
            <FilterSelect param="vencidos" allLabel="Todos los plazos" responsive options={[{ value: "1", label: "Solo vencidos" }]} />
          </FilterDisclosure>
          <div className="ml-auto max-md:w-full">
            <ActiveFilters labels={labels} />
          </div>
        </FilterBar>

        <Stuck board={board} ownerView={user.role === "OWNER"} />

        <Card className="overflow-hidden">
          <CardHeader
            title="Videos en curso"
            subtitle={`${rows.length} ${rows.length === 1 ? "paso abierto" : "pasos abiertos"}, del plazo más próximo al más lejano`}
            icon={<Clock size={16} />}
          />
          {rows.length ? (
            <div className="overflow-x-auto">
              <table className="tbl tbl-cards" data-chain-table>
                <thead>
                  <tr>
                    <th>Video</th>
                    <th>Marca</th>
                    <th>Paso</th>
                    <th>Responsable</th>
                    <th>Plazo</th>
                    <th>Situación</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((card) => (
                    <tr key={card.id} data-step-id={card.id}>
                      <td className="tbl-card-head max-w-[340px] min-w-[220px]">
                        <Link href={`${card.video.href}#produccion`} className="text-ink hover:text-brand block text-[13px] leading-snug font-semibold [overflow-wrap:anywhere]">
                          {card.video.title}
                        </Link>
                        <span className="text-inkmuted text-[11.5px]">Video en {card.video.statusLabel.toLowerCase()}</span>
                      </td>
                      <td data-label="Marca">
                        <ColorChip color={card.brand.color} className="max-w-[160px]"><span className="truncate">{card.brand.name}</span></ColorChip>
                      </td>
                      <td data-label="Paso">
                        <Badge option={PRODUCTION_STEP_MAP[card.step]} fallback={card.label} />
                      </td>
                      <td data-label="Responsable">
                        {card.assignee ? (
                          <span className={cn("text-[13px] font-semibold", card.assignee.eligible ? "text-ink" : "text-danger")}>
                            {card.assignee.name}
                            {!card.assignee.eligible ? <span className="block text-[11.5px] font-normal">Sin acceso a la marca</span> : null}
                          </span>
                        ) : (
                          <span className="chip bg-amber-500/12 text-amber-700 ring-amber-500/25 dark:text-amber-300">Sin asignar</span>
                        )}
                      </td>
                      <td data-label="Plazo" className="whitespace-nowrap max-md:whitespace-normal">
                        <span className={cn("block text-[12.5px]", card.overdue ? "text-danger font-semibold" : card.today ? "text-warn font-semibold" : "text-inksoft")}>
                          {sentence(card.dueLabel)}
                        </span>
                        <span className="text-inkmuted block text-[11.5px]">{dueText(card.step, card.dueAt)}</span>
                      </td>
                      <td data-label="Situación" className="tbl-card-full">
                        <Situation card={card} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={<Workflow size={18} />}
              title={Object.keys(labels).length ? "Ningún paso coincide con los filtros" : "No hay pasos abiertos"}
              description={Object.keys(labels).length ? "Quita algún filtro para ver el resto de la cadena." : "Cuando se cree un video en una marca con equipo, su primer paso (Guion) aparecerá aquí."}
            />
          )}
        </Card>
      </StepAnnouncerProvider>
    );
  });
}

/** Resumen por paso (Guion → Grabación → Edición → Publicación, y Diseño en paralelo). */
function StepStrip({ board, active, hrefFor }: { board: ChainBoard; active: StepKind | null; hrefFor: (next: Partial<Query>) => string }) {
  return (
    <nav aria-label="Pasos de la cadena" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {STEP_FILTERS.map((step, index) => {
        const cards = step === "DISENO" ? board.designs : board.columns[step];
        const overdue = cards.filter((card) => card.overdue).length;
        const current = active === step;
        return (
          <Link
            key={step}
            href={hrefFor({ paso: current ? undefined : step })}
            aria-current={current ? "true" : undefined}
            className={cn(
              "card flex min-h-[76px] flex-col justify-between gap-1 p-3 transition-shadow hover:shadow-[var(--shadow-2)]",
              current && "border-brand ring-brand/30 ring-2",
              step === "DISENO" && "max-sm:col-span-2",
            )}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-inkmuted text-[11px] font-bold tracking-wider uppercase">
                {step === "DISENO" ? "Diseño (paralelo)" : `${index + 1}. ${PRODUCTION_STEP_MAP[step]?.label ?? step}`}
              </span>
              {step !== "DISENO" && index < CHAIN_ORDER.length - 1 ? <ArrowRight size={13} className="text-inkmuted max-lg:hidden" aria-hidden="true" /> : null}
            </span>
            <span className="text-ink text-[22px] leading-none font-bold tabular-nums">{formatNumber(cards.length)}</span>
            <span className="text-inkmuted text-[11.5px]">
              {CHAIN_STEP_RULES[step].role}
              {overdue ? <span className="text-danger font-semibold"> · {overdue} {overdue === 1 ? "vencido" : "vencidos"}</span> : null}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function Situation({ card }: { card: StepCard }) {
  const flags: React.ReactNode[] = [];
  if (card.overdue) flags.push(<span key="overdue" className="chip bg-rose-500/12 text-rose-600 ring-rose-500/25 dark:text-rose-300">Vencido</span>);
  if (card.returned) flags.push(<Badge key="returned" option={PRODUCTION_STEP_STATUS_MAP.DEVUELTO} fallback="Devuelto" />);
  if (!card.assignee) flags.push(<span key="unassigned" className="chip bg-amber-500/12 text-amber-700 ring-amber-500/25 dark:text-amber-300">Sin asignar</span>);
  else if (!card.assignee.eligible) flags.push(<span key="ineligible" className="chip bg-rose-500/12 text-rose-600 ring-rose-500/25 dark:text-rose-300">Responsable sin acceso</span>);
  if (card.notice) flags.push(<span key="notice" className="chip bg-sky-500/12 text-sky-700 ring-sky-500/25 dark:text-sky-300">Aviso</span>);
  const note = card.notice ?? card.returned;
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1">{flags.length ? flags : <span className="text-ok text-[12px] font-semibold">Al día</span>}</div>
      {note ? (
        <p className="text-inksoft max-w-[320px] text-[12px] leading-snug [overflow-wrap:anywhere] max-md:max-w-none">
          <span className="font-semibold">{note.by}:</span> {note.motivo}
        </p>
      ) : null}
    </div>
  );
}

/** Atascos: cada uno con su acción (crear paso, asignar, atender el aviso, definir el equipo). */
function Stuck({ board, ownerView }: { board: ChainBoard; ownerView: boolean }) {
  const { withoutStep, notices, ineligible, outOfSync, leadsWithoutPermission } = board.stuck;
  const total = withoutStep.length + notices.length + ineligible.length + outOfSync.length + board.brandsWithoutTeam.length + leadsWithoutPermission.length;
  if (!total) return null;
  return (
    <Card className="mb-5">
      <CardHeader title={<span id="atascos-titulo" tabIndex={-1} className="focus:outline-none">Atascos</span>} subtitle="Lo que no avanza solo: cada fila dice por qué y qué hacer." icon={<AlertTriangle size={16} />} />
      <div className="divide-line divide-y">
        {notices.length ? (
          <StuckGroup title="Avisos a coordinación" icon={<Bell size={13} />} count={notices.length}>
            {notices.map((card) => (
              <StuckRow key={card.id} title={card.video.title} href={`${card.video.href}#produccion`} brand={card.brand.name} step={card.step}
                detail={card.notice ? `${card.notice.by}: ${card.notice.motivo}` : ""} action="Ver la ficha"
                extra={<AtenderAvisoButton key={card.revision} stepId={card.id} videoTitle={card.video.title} />} />
            ))}
          </StuckGroup>
        ) : null}
        {ineligible.length ? (
          <StuckGroup title="Responsable que no puede hacer el paso" icon={<UserX size={13} />} count={ineligible.length}>
            {ineligible.map((card) => (
              <StuckRow key={card.id} title={card.video.title} href={`${card.video.href}#produccion`} brand={card.brand.name} step={card.step}
                detail={card.assignee && card.assignee.eligible && card.assignee.capable === false
                  ? `${card.assignee.name} no puede hacer este paso: su perfil no lo permite.`
                  : `${card.assignee?.name ?? "El responsable"} está inactivo o ya no tiene acceso a la marca.`} action="Reasignar" />
            ))}
          </StuckGroup>
        ) : null}
        {leadsWithoutPermission.length ? (
          <StuckGroup title="Encargado sin permisos" icon={<UserX size={13} />} count={leadsWithoutPermission.length}>
            {leadsWithoutPermission.map((lead) => (
              <StuckRow key={lead.brand.id} title={lead.brand.name} href={ownerView ? `/marcas/${lead.brand.id}?vista=equipo` : `/marcas/${lead.brand.id}`} brand={null} step={null}
                detail={`${lead.reason}: ${lead.person.name} no puede coordinar esta marca, así que «Sin asignar», avisos y bloqueos le llegan al Dueño.`}
                action={ownerView ? "Revisar el equipo" : "Ver marca"} />
            ))}
          </StuckGroup>
        ) : null}
        {withoutStep.length ? (
          <StuckGroup title="Videos sin paso abierto" icon={<CircleDashed size={13} />} count={withoutStep.length}>
            {withoutStep.map((item) => (
              <li key={item.video.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1 basis-64">
                  <Link href={item.video.href} className="text-ink hover:text-brand block text-[13px] font-semibold [overflow-wrap:anywhere]">{item.video.title}</Link>
                  <p className="text-inkmuted text-[12px]">
                    {item.brand.name} · Video en {item.video.statusLabel.toLowerCase()} · {item.reason}
                    {item.expected ? ` · Le toca: ${PRODUCTION_STEP_MAP[item.expected]?.label ?? item.expected}` : ""}
                  </p>
                </div>
                {item.expected ? <CrearPasoButton videoId={item.video.id} videoTitle={item.video.title} /> : null}
              </li>
            ))}
          </StuckGroup>
        ) : null}
        {outOfSync.length ? (
          <StuckGroup title="Estado desfasado" icon={<AlertTriangle size={13} />} count={outOfSync.length}>
            {outOfSync.map(({ card, expected }) => (
              <StuckRow key={card.id} title={card.video.title} href={`${card.video.href}#produccion`} brand={card.brand.name} step={card.step}
                detail={`El video está en ${card.video.statusLabel.toLowerCase()} pero su paso abierto es ${card.label.toLowerCase()}${expected ? `; le correspondería ${(PRODUCTION_STEP_MAP[expected]?.label ?? expected).toLowerCase()}` : ""}.`} action="Revisar" />
            ))}
          </StuckGroup>
        ) : null}
        {board.brandsWithoutTeam.length ? (
          <StuckGroup title="Marcas sin equipo" icon={<UserX size={13} />} count={board.brandsWithoutTeam.length}>
            {board.brandsWithoutTeam.map((brand) => (
              <StuckRow key={brand.id} title={brand.name} href={ownerView ? `/marcas/${brand.id}?vista=equipo` : `/marcas/${brand.id}`} brand={null} step={null}
                detail="Sin equipo la cadena no crea pasos: define guionista, filmmaker, editor y community." action={ownerView ? "Definir equipo" : "Ver marca"} />
            ))}
          </StuckGroup>
        ) : null}
      </div>
    </Card>
  );
}

function StuckGroup({ title, icon, count, children }: { title: string; icon: React.ReactNode; count: number; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-inkmuted flex items-center gap-1.5 px-4 pt-3.5 pb-1 text-[11px] font-bold tracking-[0.09em] uppercase sm:px-5">
        <span aria-hidden="true">{icon}</span>
        {title} · {count}
      </h3>
      <ul className="divide-line divide-y">{children}</ul>
    </section>
  );
}

function StuckRow({ title, href, brand, step, detail, action, extra }: { title: string; href: string; brand: string | null; step: StepKind | null; detail: string; action: string; extra?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
      <div className="min-w-0 flex-1 basis-64 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {step ? <Badge option={PRODUCTION_STEP_MAP[step]} fallback={step} /> : null}
          <span className="text-ink text-[13px] font-semibold [overflow-wrap:anywhere]">{title}</span>
          {brand ? <span className="text-inkmuted text-[12px]">· {brand}</span> : null}
        </div>
        <p className="text-inksoft text-[12.5px] leading-snug whitespace-pre-wrap [overflow-wrap:anywhere]">{detail}</p>
      </div>
      <div className="flex flex-wrap items-start gap-2 max-sm:w-full">
        {extra}
        <Link href={href} className="btn btn-sm max-sm:w-full max-sm:min-h-11 pointer-coarse:min-h-11" aria-label={`${action}: ${title}`}>
          {action} <ArrowRight size={13} aria-hidden="true" />
        </Link>
      </div>
    </li>
  );
}
