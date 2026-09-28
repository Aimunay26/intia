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
} from "lucide-react";
import Link from "next/link";

import { ManualCard } from "@/components/manual/manual-card";
import { Callout, Card, CardHeader, PageHeader, SectionTitle } from "@/components/ui";
import type { SessionUser } from "@/lib/auth";
import { CONTENT_STATUS_MAP } from "@/lib/constants";
import { manualEnabled, manualRoles, manualRolesForProfile, splitHead } from "@/lib/manual";
import { SECTIONS, WORK_PROFILES, canAccessSection, type Section } from "@/lib/permissions";
import { cn, truncate } from "@/lib/utils";

/* ----------------------------------------------------- ACCESOS POR SECCIÓN -- */

const SECTION_INFO: Partial<Record<Section, { icon: typeof BookOpen; description: string }>> = {
  manual: { icon: BookOpen, description: "Cómo se hace el trabajo de cada rol" },
  panel: { icon: LayoutDashboard, description: "Tu trabajo pendiente" },
  calendar: { icon: CalendarDays, description: "Fechas de publicación y grabación" },
  content: { icon: Film, description: "Tus videos, su checklist y su equipo" },
  tasks: { icon: ListChecks, description: "Lo que tienes asignado" },
  brands: { icon: Tags, description: "Identidad, tono y prohibiciones" },
  generator: { icon: Sparkles, description: "Donde nace el guion" },
  scripts: { icon: Clapperboard, description: "Los guiones, escena por escena" },
  structures: { icon: Shapes, description: "Los formatos ganadores" },
  archetypes: { icon: Users, description: "Quién sale en cámara y cómo habla" },
  metrics: { icon: TrendingUp, description: "Qué formato rinde de verdad" },
  profile: { icon: UserRound, description: "Tus datos y documentos" },
  help: { icon: GraduationCap, description: "Tus perfiles y tu flujo" },
};
const LINK_ORDER: Section[] = ["manual", "panel", "calendar", "content", "tasks", "brands", "generator", "scripts", "structures", "archetypes", "metrics", "profile", "help"];

/** Secciones a las que puede entrar esta cuenta; el Manual primero y respetando su interruptor. */
export function memberSectionLinks(user: SessionUser, exclude: readonly Section[] = []) {
  return LINK_ORDER.filter(key => !exclude.includes(key) && canAccessSection(user, key) && (key !== "manual" || manualEnabled())).map(key => ({
    key,
    href: SECTIONS[key].href,
    label: SECTIONS[key].label,
    icon: SECTION_INFO[key]?.icon ?? ArrowRight,
    description: SECTION_INFO[key]?.description ?? "",
  }));
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
    "Agenda el día de grabación en el calendario.",
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

function ProfileCard({ profile }: { profile: (typeof WORK_PROFILES)[number] }) {
  const manualId = manualRolesForProfile(profile.id)[0];
  const manual = manualId ? manualRoles().find(role => role.id === manualId) : undefined;
  const steps = manual ? manual.sopPreview.slice(0, 4) : FALLBACK_STEPS[profile.id] ?? [];
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
        {manual && manualEnabled() ? (
          <Link href={`/manual/${manual.slug}#procedimiento`} className="text-brand mt-auto inline-flex items-center gap-1 text-[12.5px] font-semibold">
            Procedimiento completo de {manual.name} <ArrowRight size={13} />
          </Link>
        ) : null}
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- PANTALLA -- */

/** «Cómo se usa» para el equipo: perfiles, lugar en el flujo y dónde está cada cosa. */
export function MemberHelp({ user }: { user: SessionUser }) {
  const profiles = WORK_PROFILES.filter(profile => user.profiles?.includes(profile.id));
  const links = memberSectionLinks(user, ["help"]);
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
            {profiles.map(profile => <ProfileCard key={profile.id} profile={profile} />)}
          </div>
        ) : (
          <Callout tone="info" title="Todavía no tienes perfiles">
            El Dueño debe asignarte perfiles y marcas desde Equipo para habilitar tus secciones de trabajo.
            {manualEnabled() ? " Mientras tanto puedes leer el Manual de procedimientos." : ""}
          </Callout>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader title="Reglas que valen para todos" />
          <ul className="text-inksoft list-disc space-y-2 p-4 pl-9 text-[13px] leading-relaxed">
            <li><strong className="text-ink">La ficha del video es el canal oficial.</strong> Cada entrega queda como check, cambio de estado o comentario.</li>
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
