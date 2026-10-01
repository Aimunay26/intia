import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Clapperboard,
  Film,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  Shapes,
  Sparkles,
  Tags,
  TrendingUp,
  UserRound,
  Users,
  Workflow,
} from "lucide-react";
import Link from "next/link";

import { ManualCard } from "@/components/manual/manual-card";
import { Callout, Card, CardHeader, PageHeader, SectionTitle } from "@/components/ui";
import type { SessionUser } from "@/lib/auth";
import { CONTENT_STATUS_MAP } from "@/lib/constants";
import { manualEnabled, manualRoles, manualRolesForProfile, splitHead } from "@/lib/manual";
import { SECTIONS, WORK_PROFILES, canAccessSection, permissionFlags, type Section, type WorkProfile } from "@/lib/permissions";
import { productionChainActiveFor } from "@/lib/production-chain-flag";
import { roleNavHrefOrder } from "@/lib/role-nav";
import { roleOrderEnabled } from "@/lib/role-order-flag";
import { cn, truncate } from "@/lib/utils";

/* ----------------------------------------------------- ACCESOS POR SECCIÓN -- */

const SECTION_INFO: Partial<Record<Section, { icon: typeof BookOpen; description: string }>> = {
  manual: { icon: BookOpen, description: "Cómo se hace el trabajo de cada rol" },
  panel: { icon: LayoutDashboard, description: "Tu trabajo pendiente" },
  calendar: { icon: CalendarDays, description: "Fechas de publicación y grabación" },
  content: { icon: Film, description: "Tus videos, su checklist y su equipo" },
  tasks: { icon: ListChecks, description: "Lo que tienes asignado" },
  chain: { icon: Workflow, description: "Quién tiene cada video y qué está trabado" },
  brands: { icon: Tags, description: "Identidad, tono y prohibiciones" },
  generator: { icon: Sparkles, description: "Donde nace el guion" },
  scripts: { icon: Clapperboard, description: "Los guiones, escena por escena" },
  structures: { icon: Shapes, description: "Los formatos ganadores" },
  archetypes: { icon: Users, description: "Quién sale en cámara y cómo habla" },
  metrics: { icon: TrendingUp, description: "Qué formato rinde de verdad" },
  profile: { icon: UserRound, description: "Tus datos y documentos" },
  help: { icon: GraduationCap, description: "Tus perfiles y tu flujo" },
};
const LINK_ORDER: Section[] = ["manual", "panel", "calendar", "content", "tasks", "chain", "brands", "generator", "scripts", "structures", "archetypes", "metrics", "profile", "help"];

/**
 * Secciones a las que puede entrar esta cuenta, respetando sus interruptores
 * (MANUAL_PROCEDIMIENTOS_ENABLED y, para «Cadena», la cadena de entregas). Con ORDEN_POR_ROL van
 * en el orden del menú de esta persona (roleNavHrefOrder: General y luego sus paneles en orden de
 * flujo) y «Mi perfil», que no está en el menú, al final. Apagado, LINK_ORDER: el Manual primero.
 * Lo usan «Accesos» del inicio, «Dónde está cada cosa» y el aviso de la renovación.
 */
export function memberSectionLinks(user: SessionUser, exclude: readonly Section[] = []) {
  const chain = productionChainActiveFor(user, null);
  const keys = LINK_ORDER.filter(key => !exclude.includes(key) && canAccessSection(user, key) && (key !== "manual" || manualEnabled()) && (key !== "chain" || chain));
  return orderByNav(user, keys, chain).map(key => ({
    key,
    href: SECTIONS[key].href,
    label: SECTIONS[key].label,
    icon: SECTION_INFO[key]?.icon ?? ArrowRight,
    description: key === "panel" && chain ? "Mi trabajo: lo que te toca y su botón «Listo»" : SECTION_INFO[key]?.description ?? "",
  }));
}

/** ORDEN_POR_ROL: ordena las secciones como el menú de esta persona; lo que no está en él, al final. */
function orderByNav(user: SessionUser, keys: Section[], chain: boolean): Section[] {
  if (!roleOrderEnabled()) return keys;
  const order = roleNavHrefOrder(user, { chainEnabled: chain, manualEnabled: manualEnabled(), permissionFlags: permissionFlags() });
  const rank = (key: Section) => {
    const index = order.indexOf(SECTIONS[key].href);
    return index === -1 ? order.length : index;
  };
  return keys.map((key, index) => ({ key, index, rank: rank(key) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(entry => entry.key);
}

/* ------------------------------------------------------------------ FLUJO -- */

const FLOW = ["IDEA", "GUION", "APROBADO", "GRABACION", "EDICION", "PROGRAMADO", "PUBLICADO"] as const;
const PROFILE_STAGES: Record<string, readonly string[]> = {
  STRATEGY: ["IDEA", "APROBADO"],
  WRITER: ["GUION"],
  PRODUCTION: ["APROBADO", "GRABACION"],
  CAMERA: ["GRABACION"],
  TALENT: ["GRABACION"],
  EDITOR: ["EDICION"],
  DESIGNER: ["EDICION"],
  PUBLISHER: ["PROGRAMADO", "PUBLICADO"],
  ANALYST: ["PUBLICADO"],
};
/** Perfiles que todavía no tienen manual propio: su flujo resumido. */
const FALLBACK_STEPS: Record<string, readonly string[]> = {
  STRATEGY: [
    "Crea las tarjetas en IDEA con fecha, gancho, redes y formatos previstos.",
    "Revisa el guion unido y marca «Guion aprobado por la marca» para pasar a APROBADO.",
    "Asigna guionista, filmmaker, talento y editor en la ficha del video.",
    "Firma la «Revisión final aprobada» cuando el corte esté listo.",
  ],
  PRODUCTION: [
    "Confirma locación, props, vestuario y talento de cada video APROBADO.",
    "Marca «Actor asignado y confirmado» y «Props / vestuario conseguidos».",
    "Ajusta la fecha de grabación en la ficha del video: el calendario la toma de ahí.",
    "Acompaña el set y deja al día los checks de grabación.",
  ],
  DESIGNER: [
    "Abre los videos que tienes asignados en EDICION.",
    "Prepara miniatura, portada y textos en pantalla con los colores de la marca.",
    "Sube los archivos a la ficha del video y avisa en comentarios.",
  ],
  ANALYST: [
    "Reúne cada semana los resultados de los videos PUBLICADOS.",
    "Carga vistas, retención y ventas en Métricas, de lunes a domingo.",
    "Comparte qué formato rindió mejor antes de la reunión semanal.",
  ],
};

/** Con la cadena, el diseñador entrega con su botón en vez de avisar en comentarios. */
const CHAIN_FALLBACK: Partial<Record<string, readonly string[]>> = {
  DESIGNER: [
    "Abre en Mi trabajo los diseños que te pidieron, con sus indicaciones y su plazo de 24 horas.",
    "Prepara miniatura, portada y textos en pantalla con los colores de la marca.",
    "Pulsa «Entregar diseño» con el enlace de la entrega: quien lo pidió lo ve al instante.",
  ],
};

/** «Cuando termines»: qué botón pulsar y a quién pasa el video (cadena de entregas). */
const CHAIN_HANDOFF: Partial<Record<WorkProfile, string>> = {
  STRATEGY: "Supervisas en «Cadena». A tu Mi trabajo llegan los pasos sin asignar, los avisos y los bloqueos de tus marcas: asígnalos o destrábalos desde la ficha del video.",
  WRITER: "Con el guion listo (al menos una escena y el CTA), pulsa «Listo, enviar al filmmaker» en Mi trabajo. Se aprueba solo (regla del dueño) y pasa al filmmaker.",
  PRODUCTION: "Ajusta la fecha de grabación en la ficha del video: el plazo del filmmaker la sigue.",
  CAMERA: "Después de grabar, pulsa «Listo, pasar a edición» en Mi trabajo con el enlace del material. Pasa al editor. Si algo te bloquea, «Avisar a coordinación».",
  EDITOR: "Con el corte terminado, pulsa «Listo, enviar al community» con el enlace del máster. La revisión final se firma sola (regla del dueño) y pasa al community. Si falta material, «Devolver al filmmaker».",
  DESIGNER: "Pulsa «Entregar diseño» en Mi trabajo con el enlace de la entrega. Tienes 24 horas; el domingo no cuenta.",
  PUBLISHER: "Publica y pulsa «Publicado» con la URL pública: la cadena termina. Si hay que corregir, «Devolver por correcciones» al editor; si algo te bloquea, «Avisar a coordinación».",
};

function FlowStrip({ active }: { active: readonly string[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-1" aria-label="Etapas del video">
      {FLOW.map((stage, index) => {
        const on = active.includes(stage);
        return (
          <li key={stage} className="flex items-center gap-1">
            <span
              className={cn("rounded-md px-1.5 py-0.5 text-[10.5px] font-bold", on ? "bg-brandsoft text-brandtext" : "bg-surface3 text-inkmuted")}
              aria-current={on ? "step" : undefined}
            >
              {CONTENT_STATUS_MAP[stage]?.label ?? stage}
            </span>
            {index < FLOW.length - 1 ? <span className="text-inkmuted text-[10px]" aria-hidden="true">→</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

function ProfileCard({ profile, chain }: { profile: (typeof WORK_PROFILES)[number]; chain: boolean }) {
  const manualId = manualRolesForProfile(profile.id)[0];
  const manual = manualId ? manualRoles().find(role => role.id === manualId) : undefined;
  const steps = manual ? manual.sopPreview.slice(0, 4) : (chain ? CHAIN_FALLBACK[profile.id] : undefined) ?? FALLBACK_STEPS[profile.id] ?? [];
  const handoff = chain ? CHAIN_HANDOFF[profile.id] : undefined;
  return (
    <Card className="flex h-full flex-col">
      <CardHeader title={profile.label} subtitle={profile.description} />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <FlowStrip active={PROFILE_STAGES[profile.id] ?? []} />
        {steps.length ? (
          <div>
            <h3 className="text-inkmuted mb-1.5 text-[11px] font-bold tracking-wider uppercase">Tu flujo</h3>
            <ol className="text-inksoft list-decimal space-y-1.5 pl-5 text-[12.5px] leading-snug">
              {steps.map((step, index) => {
                const { head, body } = splitHead(step, 60);
                return (
                  <li key={index}>
                    {head ? <strong className="text-ink font-semibold">{head}: </strong> : null}
                    {truncate(body, 150)}
                  </li>
                );
              })}
            </ol>
          </div>
        ) : null}
        {handoff ? (
          <div className="border-brand/40 bg-brandsoft/40 rounded-lg border-l-[3px] px-3 py-2">
            <h3 className="text-brandtext text-[11px] font-bold tracking-wider uppercase">Cuando termines</h3>
            <p className="text-inksoft mt-0.5 text-[12.5px] leading-snug">{handoff}</p>
          </div>
        ) : null}
        {manual && manualEnabled() ? (
          <Link href={`/manual/${manual.slug}#procedimiento`} className="text-brand mt-auto inline-flex items-center gap-1 text-[12.5px] font-semibold">
            Procedimiento completo de {manual.name} <ArrowRight size={13} />
          </Link>
        ) : null}
      </div>
    </Card>
  );
}

/** La cadena de entregas explicada para todos: el botón «Listo», plazos, devolver y avisar. */
function ChainHelp() {
  const steps = [
    { label: "Guion", role: "guionista" },
    { label: "Grabación", role: "filmmaker" },
    { label: "Edición", role: "editor" },
    { label: "Publicación", role: "community" },
  ];
  return (
    <Card>
      <CardHeader title="La cadena de entregas y el botón «Listo»" subtitle="Cada video pasa de mano en mano: nadie tiene que buscar qué le toca." icon={<Workflow size={15} />} />
      <div className="text-inksoft space-y-3 p-4 text-[13px] leading-relaxed">
        <ol className="flex flex-wrap items-center gap-1" aria-label="Pasos de la cadena">
          {steps.map((step, index) => (
            <li key={step.label} className="flex items-center gap-1">
              <span className="bg-surface3 text-ink rounded-md px-2 py-0.5 text-[12px] font-semibold">
                {step.label} <span className="text-inkmuted font-normal">({step.role})</span>
              </span>
              {index < steps.length - 1 ? <span className="text-inkmuted text-[11px]" aria-hidden="true">→</span> : null}
            </li>
          ))}
        </ol>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><strong className="text-ink">Tu Inicio empieza por «Mi trabajo»:</strong> lo vencido, lo que te devolvieron, lo de hoy y lo próximo, cada paso con su plazo en hora de Lima.</li>
          <li><strong className="text-ink">«Listo» pasa el video a la siguiente persona:</strong> marca tus checks, avanza el estado y le abre su paso con su plazo. Si falta algo (enlace, escenas, CTA), te dice qué.</li>
          <li><strong className="text-ink">Sin revisiones intermedias (regla del dueño):</strong> el guion pasa directo al filmmaker y la edición directo al community; esas aprobaciones quedan firmadas como «Sistema» en el historial.</li>
          <li><strong className="text-ink">Plazos:</strong> guion, fin del segundo día hábil; grabación, el próximo día de grabación de la marca; edición y publicación, el día hábil siguiente. Diseño, 24 horas. El domingo no se trabaja.</li>
          <li><strong className="text-ink">Devolver:</strong> el editor puede devolver al filmmaker y el community al editor, siempre con el motivo; queda como comentario en la ficha.</li>
          <li><strong className="text-ink">Avisar a coordinación:</strong> si algo te bloquea, el encargado de la marca (o el Dueño, si no hay encargado) lo recibe en su Mi trabajo.</li>
          <li><strong className="text-ink">Mover la tarea a «Listo» en Tareas</strong> es lo mismo que pulsar «Listo», con las mismas validaciones.</li>
        </ul>
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- PANTALLA -- */

/** «Cómo se usa» para el equipo: perfiles, lugar en el flujo y dónde está cada cosa. */
export function MemberHelp({ user }: { user: SessionUser }) {
  const profiles = WORK_PROFILES.filter(profile => user.profiles?.includes(profile.id));
  const links = memberSectionLinks(user, ["help"]);
  const chain = productionChainActiveFor(user, null);
  return (
    <div className="space-y-5">
      <PageHeader
        title="Cómo se usa"
        subtitle="Qué hace cada uno de tus perfiles, dónde entra en el flujo del video y dónde está cada cosa."
        icon={<GraduationCap size={19} />}
      />
      <ManualCard user={user} />

      <section>
        <SectionTitle>Tus perfiles</SectionTitle>
        {profiles.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {profiles.map(profile => <ProfileCard key={profile.id} profile={profile} chain={chain} />)}
          </div>
        ) : (
          <Callout tone="info" title="Todavía no tienes perfiles">
            El Dueño debe asignarte perfiles y marcas desde Equipo para habilitar tus secciones de trabajo.
            {manualEnabled() ? " Mientras tanto puedes leer el Manual de procedimientos." : ""}
          </Callout>
        )}
      </section>

      {chain ? <ChainHelp /> : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader title="Reglas que valen para todos" />
          <ul className="text-inksoft list-disc space-y-2 p-4 pl-9 text-[13px] leading-relaxed">
            <li><strong className="text-ink">La ficha del video es el canal oficial.</strong> Cada entrega queda como check, cambio de estado o comentario.</li>
            {chain ? <li><strong className="text-ink">Cuando termines tu parte, pulsa «Listo» en Mi trabajo.</strong> La siguiente persona la recibe al instante con su plazo.</li> : null}
            <li><strong className="text-ink">Una entrega está hecha cuando quien recibe la acepta,</strong> no cuando la envías.</li>
            <li>Cámara, talento, edición y diseño ven sus videos y tareas asignados. La aprobación corresponde a coordinación; publicación trabaja sobre videos aprobados.</li>
            <li>Los resultados se cargan por semana. Solo el Dueño elimina; todo movimiento queda registrado.</li>
          </ul>
        </Card>
        <Card>
          <CardHeader title="Dónde está cada cosa" />
          <ul className="divide-line divide-y text-[13px]">
            {links.map(({ key, href, label, description, icon: Icon }) => (
              <li key={key}>
                <Link href={href} className="hover:bg-surface2 flex items-start gap-2.5 px-4 py-2.5 transition-colors">
                  <Icon size={14} className="text-inkmuted mt-0.5 shrink-0" />
                  <span className="min-w-0">
                    <span className="text-ink block font-semibold">{label}</span>
                    <span className="text-inkmuted block text-[12px] leading-snug">{description}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
