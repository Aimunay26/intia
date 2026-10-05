import { AlertTriangle, ArrowRight, Bell, CalendarClock, CalendarDays, ExternalLink, Inbox, Palette, RotateCcw, UserX, Workflow } from "lucide-react";
import Link from "next/link";

import { Badge, ColorChip } from "@/components/ui";
import { StepAnnouncement, StepAnnouncerProvider } from "@/components/work/announcer";
import { AtenderAvisoButton, PedirCambiosDiseno, StepActions, type StepActionModel } from "@/components/work/step-actions";
import { dueText, sentence, stepPermissions, workSummary } from "@/components/work/step-copy";
import type { SessionUser } from "@/lib/auth";
import { PRODUCTION_STEP_MAP, PRODUCTION_STEP_STATUS_MAP } from "@/lib/constants";
import { allows, canAccessSection } from "@/lib/permissions";
import { productionChainActiveFor } from "@/lib/production-chain-flag";
import { readMyWork, type MyWork, type StepCard } from "@/lib/production-scope";
import { cn, formatDateTime } from "@/lib/utils";

/**
 * «Mi trabajo» (cadena de entregas, PRODUCTION_CHAIN_ENABLED): lo primero del Inicio del
 * equipo y del Panel del Dueño. Pasos pendientes de la persona por plazo (Vencido, Devuelto a
 * mí, Hoy, Próximos 7 días y Más adelante plegado), cada uno con su botón «Listo» del rol; y
 * para el ENCARGADO de la marca (o el Dueño si la marca no tiene) lo que no tiene dueño: pasos
 * sin asignar, avisos y responsables bloqueados.
 *
 * Con la cadena apagada, o con el canario y ninguna marca de la persona (o la marca activa)
 * dentro, no consulta nada y no pinta nada: el Inicio queda como antes. Todo se lee de la base
 * al pedir la página (vencido = dueAt < ahora, en el día de Lima).
 */

export async function MyWorkSection({ user, brandId, className }: { user: SessionUser; brandId: string | null; className?: string }) {
  if (!productionChainActiveFor(user, brandId)) return null;
  // Sin perfiles no hay trabajo que mostrar: el Inicio ya explica cómo pedirlos.
  if (user.role !== "OWNER" && !user.profiles?.length) return null;
  const now = new Date();
  const work = await readMyWork(user, now, { brandId });
  if (!work.enabled) return null;
  return <MyWorkView user={user} work={work} className={className} />;
}

/** Vista sin consultas (se prueba con datos de ejemplo). */
export function MyWorkView({ user, work, className }: { user: SessionUser; work: MyWork; className?: string }) {
  const coordination = work.coordination;
  const coordinationCount = coordination ? coordination.unassigned.length + coordination.notices.length + coordination.blocked.length : 0;
  const empty = !work.counts.pending && !coordination && !work.designsDelivered.length;
  const canChain = canAccessSection(user, "chain");
  const coordinator = user.role === "OWNER" || allows(user, "content.assign");
  const later = work.groups.later;

  return (
    <StepAnnouncerProvider focusId="mi-trabajo-titulo">
    <section aria-labelledby="mi-trabajo-titulo" className={cn("card", className)} data-my-work>
      <div className="card-hd max-sm:flex-wrap">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="bg-brandsoft text-brand grid h-8 w-8 shrink-0 place-items-center rounded-lg" aria-hidden="true">
            <Inbox size={16} />
          </span>
          <div className="min-w-0">
            <h2 id="mi-trabajo-titulo" tabIndex={-1} className="text-ink text-[15px] leading-tight font-bold focus:outline-none">Mi trabajo</h2>
            <p className="card-sub mt-0.5">
              {workSummary(work.counts)}
              {coordinationCount ? ` · ${coordinationCount} de coordinación` : ""}
            </p>
          </div>
        </div>
        {canChain ? (
          <Link href="/cadena" className="btn btn-sm max-sm:min-h-11 max-sm:w-full pointer-coarse:min-h-11">
            <Workflow size={13} aria-hidden="true" /> Ver la cadena <ArrowRight size={13} aria-hidden="true" />
          </Link>
        ) : null}
      </div>
      {/* Aviso del último «Listo», «Devolver»… (la tarjeta se va con el refresco; el aviso se queda aquí). */}
      <StepAnnouncement className="border-line border-b px-4 py-2.5 sm:px-5" />

      <div className="divide-line divide-y">
        {empty ? (
          <p className="text-inkmuted px-4 py-5 text-[13px] leading-relaxed sm:px-5">
            No tienes pasos pendientes. Cuando te toque uno, aparecerá aquí con su plazo y su botón «Listo».
          </p>
        ) : null}

        <Group title="Vencido" tone="danger" icon={<AlertTriangle size={13} />} cards={work.groups.overdue} user={user} coordinator={coordinator} />
        <Group title="Devuelto a mí" tone="warn" icon={<RotateCcw size={13} />} cards={work.returned} user={user} coordinator={coordinator} />
        <Group title="Hoy" tone="brand" icon={<CalendarClock size={13} />} cards={work.groups.today} user={user} coordinator={coordinator} />
        <Group title="Sin fecha" icon={<CalendarDays size={13} />} cards={work.groups.undated ?? []} user={user} coordinator={coordinator} />
        <Group title="Próximos 7 días" icon={<CalendarDays size={13} />} cards={work.groups.next7} user={user} coordinator={coordinator} />
        {later.length ? (
          <details data-group="later">
            <summary className="text-inkmuted hover:text-ink flex min-h-11 cursor-pointer items-center gap-1.5 px-4 text-[11px] font-bold tracking-[0.09em] uppercase sm:px-5">
              <CalendarDays size={13} aria-hidden="true" /> Más adelante · {later.length}
            </summary>
            <ul className="divide-line border-line divide-y border-t">
              {later.map((card) => <WorkItem key={card.id} card={card} user={user} coordinator={coordinator} />)}
            </ul>
          </details>
        ) : null}

        {coordination ? <Coordination coordination={coordination} /> : null}

        {work.designsDelivered.length ? (
          <div data-group="designs">
            <GroupTitle title="Diseños entregados para ti" icon={<Palette size={13} />} count={work.designsDelivered.length} />
            <ul className="divide-line divide-y">
              {work.designsDelivered.map((card) => (
                <li key={card.id} className="space-y-1.5 px-4 py-3 sm:px-5">
                  <CardHead card={card} />
                  <p className="text-inksoft text-[12.5px]">Entregado{card.doneAt ? ` el ${formatDateTime(card.doneAt)}` : ""}{card.assignee ? ` por ${card.assignee.name}` : ""}</p>
                  <CardLinks card={card} />
                  <PedirCambiosDiseno key={card.revision} stepId={card.id} revision={card.revision} videoTitle={card.video.title} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
    </StepAnnouncerProvider>
  );
}

const TONES = {
  danger: "text-danger",
  warn: "text-warn",
  brand: "text-brand",
  muted: "text-inkmuted",
} as const;

/** Título de un grupo: h3 bajo «Mi trabajo»; h4 dentro de «Coordinación» (que ya es h3). */
function GroupTitle({ title, icon, count, tone = "muted", level = 3 }: { title: string; icon: React.ReactNode; count: number; tone?: keyof typeof TONES; level?: 3 | 4 }) {
  const Heading = level === 4 ? "h4" : "h3";
  return (
    <Heading className={cn("flex items-center gap-1.5 px-4 pt-3.5 pb-1 text-[11px] font-bold tracking-[0.09em] uppercase sm:px-5", TONES[tone])}>
      <span aria-hidden="true">{icon}</span>
      {title} · {count}
    </Heading>
  );
}

function Group({ title, tone = "muted", icon, cards, user, coordinator }: {
  title: string;
  tone?: keyof typeof TONES;
  icon: React.ReactNode;
  cards: StepCard[];
  user: SessionUser;
  coordinator: boolean;
}) {
  if (!cards.length) return null;
  return (
    <div data-group={title}>
      <GroupTitle title={title} icon={icon} count={cards.length} tone={tone} />
      <ul className="divide-line divide-y">
        {cards.map((card) => <WorkItem key={card.id} card={card} user={user} coordinator={coordinator} />)}
      </ul>
    </div>
  );
}

function CardHead({ card, extra }: { card: StepCard; extra?: React.ReactNode }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge option={PRODUCTION_STEP_MAP[card.step]} fallback={card.label} />
        <ColorChip color={card.brand.color} className="max-w-[60vw] sm:max-w-[240px]">
          <span className="truncate">{card.brand.name}</span>
        </ColorChip>
        {extra}
      </div>
      <Link href={card.video.href} className="text-ink hover:text-brand block text-[14px] leading-snug font-semibold [overflow-wrap:anywhere]">
        {card.video.title}
      </Link>
    </>
  );
}

function DueLine({ card }: { card: StepCard }) {
  return (
    <p className={cn("flex flex-wrap items-center gap-x-1.5 text-[12.5px]", card.overdue ? "text-danger font-semibold" : card.today ? "text-warn font-semibold" : "text-inksoft")}>
      <CalendarClock size={13} aria-hidden="true" className="shrink-0" />
      <span>{sentence(card.dueLabel)}</span>
      <span aria-hidden="true">·</span>
      <span className="font-normal">{dueText(card.step, card.dueAt)}</span>
    </p>
  );
}

const EXTERNAL = /^https?:\/\//i;

/** Ficha del video, guion, material grabado, máster o enlace público. */
function CardLinks({ card }: { card: StepCard }) {
  const links = [{ label: "Ficha del video", href: card.video.href }, ...card.links];
  return (
    <ul className="flex flex-wrap gap-x-3.5 gap-y-0.5 text-[12.5px]" aria-label={`Enlaces de ${card.video.title}`}>
      {links.map((link) => (
        <li key={`${link.label}-${link.href}`}>
          {EXTERNAL.test(link.href) ? (
            <a href={link.href} target="_blank" rel="noreferrer noopener" className="text-brand inline-flex min-h-7 items-center gap-1 font-semibold hover:underline pointer-coarse:min-h-11">
              {link.label} <ExternalLink size={11} aria-hidden="true" />
              <span className="sr-only"> (se abre en otra pestaña)</span>
            </a>
          ) : (
            <Link href={link.href} className="text-brand inline-flex min-h-7 items-center gap-1 font-semibold hover:underline pointer-coarse:min-h-11">
              {link.label}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

function actionModel(card: StepCard, user: SessionUser, coordinator: boolean): StepActionModel {
  const permissions = stepPermissions(user, { step: card.step, status: card.status, assigneeId: card.assignee?.id ?? null, dueAt: card.dueAt }, { coordinator });
  return {
    id: card.id,
    step: card.step,
    revision: card.revision,
    reviewToken: card.reviewToken,
    videoTitle: card.video.title,
    linkValue: card.linkField === "publishedUrl" ? card.video.publishedUrl : card.materialUrl,
    checksToMark: card.checksToMark,
    onBehalfOf: card.assignee && card.assignee.id !== user.id ? card.assignee.name : null,
    ...permissions,
  };
}

function WorkItem({ card, user, coordinator }: { card: StepCard; user: SessionUser; coordinator: boolean }) {
  return (
    <li className="space-y-2 px-4 py-3.5 sm:px-5" data-step={card.step} data-step-id={card.id}>
      <CardHead
        card={card}
        extra={
          <>
            {card.returned ? <Badge option={PRODUCTION_STEP_STATUS_MAP.DEVUELTO} fallback="Devuelto" /> : null}
            {card.notice ? <span className="chip chip-plain">Aviso enviado</span> : null}
          </>
        }
      />
      <DueLine card={card} />
      {card.returned ? (
        <div className="border-warn/60 bg-surface2 rounded-lg border-l-[3px] px-3 py-2 text-[12.5px] leading-relaxed">
          <p className="text-warn font-semibold">Te lo devolvió {card.returned.by}</p>
          <p className="text-inksoft whitespace-pre-wrap [overflow-wrap:anywhere]">{card.returned.motivo}</p>
        </div>
      ) : null}
      {card.step === "DISENO" && card.notes ? (
        <p className="text-inksoft text-[12.5px] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
          <span className="text-ink font-semibold">Indicaciones{card.requestedBy ? ` de ${card.requestedBy}` : ""}: </span>
          {card.notes}
        </p>
      ) : null}
      <CardLinks card={card} />
      <StepActions key={card.revision} model={actionModel(card, user, coordinator)} />
    </li>
  );
}

/* --------------------------------------------------------- COORDINACIÓN -- */

function Coordination({ coordination }: { coordination: NonNullable<MyWork["coordination"]> }) {
  const total = coordination.unassigned.length + coordination.notices.length + coordination.blocked.length;
  const brands = coordination.brands.map((brand) => brand.name).join(", ");
  return (
    <section className="bg-surface2/60" data-group="coordination" aria-labelledby="mi-trabajo-coordinacion">
      <div className="px-4 pt-3.5 sm:px-5">
        <h3 id="mi-trabajo-coordinacion" className="text-ink text-[13px] font-bold">Coordinación</h3>
        <p className="text-inkmuted text-[12px] leading-snug">
          {total ? "Lo que no tiene dueño o está trabado en " : "Nada sin asignar ni avisos pendientes en "}
          <span className="text-inksoft font-semibold">{brands}</span>.
        </p>
      </div>
      <CoordinationList title="Sin asignar" icon={<UserX size={13} />} tone="warn" cards={coordination.unassigned} reason={() => "Nadie tiene este paso: asígnalo en la ficha."} action="Asignar" />
      <CoordinationList
        title="Avisos a coordinación"
        icon={<Bell size={13} />}
        tone="brand"
        cards={coordination.notices}
        reason={(card) => (card.notice ? `${card.notice.by}: ${card.notice.motivo}` : "")}
        action="Ver la ficha"
        extra={(card) => <AtenderAvisoButton stepId={card.id} videoTitle={card.video.title} />}
      />
      <CoordinationList
        title="Bloqueados"
        icon={<AlertTriangle size={13} />}
        tone="danger"
        cards={coordination.blocked}
        reason={(card) => card.assignee && card.assignee.eligible && card.assignee.capable === false
          ? `${card.assignee.name} no puede hacer este paso: su perfil no lo permite. Reasígnalo.`
          : `${card.assignee?.name ?? "El responsable"} está inactivo o ya no tiene acceso a la marca.`}
        action="Reasignar"
      />
      <div className="h-2" aria-hidden="true" />
    </section>
  );
}

function CoordinationList({ title, icon, tone, cards, reason, action, extra }: {
  title: string;
  icon: React.ReactNode;
  tone: keyof typeof TONES;
  cards: StepCard[];
  reason: (card: StepCard) => string;
  action: string;
  extra?: (card: StepCard) => React.ReactNode;
}) {
  if (!cards.length) return null;
  return (
    <div data-group={title}>
      <GroupTitle title={title} icon={icon} count={cards.length} tone={tone} level={4} />
      <ul className="divide-line divide-y">
        {cards.map((card) => (
          <li key={card.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-5" data-step-id={card.id}>
            <div className="min-w-0 flex-1 basis-64 space-y-1.5">
              <CardHead card={card} extra={card.assignee ? <span className="text-inkmuted text-[12px]">{card.assignee.name}</span> : <span className="chip chip-plain">Sin asignar</span>} />
              <DueLine card={card} />
              <p className="text-inksoft text-[12.5px] leading-snug whitespace-pre-wrap [overflow-wrap:anywhere]">{reason(card)}</p>
            </div>
            <div className="flex flex-wrap items-start gap-2 max-sm:w-full">
              {extra ? extra(card) : null}
              <Link
                href={`${card.video.href}#produccion`}
                className="btn btn-sm max-sm:w-full max-sm:min-h-11 pointer-coarse:min-h-11"
                aria-label={`${action}: ${card.video.title}`}
              >
                {action} <ArrowRight size={13} aria-hidden="true" />
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
