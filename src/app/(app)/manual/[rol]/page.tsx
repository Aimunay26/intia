import { ArrowDown, ArrowRight, Box, Film, Gauge, Handshake, ListOrdered, Target, Wrench } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { SegmentedControl } from "@/components/filters";
import { ROLE_ICONS } from "@/components/manual/manual-card";
import { Breadcrumb, Card, CardHeader, PageHeader } from "@/components/ui";
import { MANUAL_LEVELS, getManualRole, levelFromParam, manualRoleSummary, splitHead, viewerManualRoles } from "@/lib/manual";
import { measurePagePhase } from "@/lib/performance-page";
import { singleQueryValues } from "@/lib/query-params";

import { requireManualPage } from "../access";

export const dynamic = "force-dynamic";

function Item({ text, max = 70 }: { text: string; max?: number }) {
  const { head, body } = splitHead(text, max);
  return head ? <><strong className="text-ink font-semibold">{head}:</strong> {body}</> : <>{body}</>;
}

/** Lista que muestra los primeros elementos y pliega el resto (sin JavaScript). */
function Expandable({ items, visible, ordered = false, label }: { items: readonly string[]; visible: number; ordered?: boolean; label: string }) {
  const list = (part: readonly string[], start: number, extra = "") =>
    ordered ? (
      <ol className={`list-decimal space-y-2 pl-5 ${extra}`} start={start}>{part.map((text, i) => <li key={i}><Item text={text} /></li>)}</ol>
    ) : (
      <ul className={`list-disc space-y-1.5 pl-5 ${extra}`}>{part.map((text, i) => <li key={i}><Item text={text} /></li>)}</ul>
    );
  const rest = items.slice(visible);
  return (
    <div className="text-inksoft text-[13px] leading-relaxed">
      {list(items.slice(0, visible), 1)}
      {rest.length ? (
        <details className="mt-2">
          <summary className="text-brand cursor-pointer text-[12.5px] font-semibold">Ver {rest.length} {label} más</summary>
          {list(rest, visible + 1, "mt-2")}
        </details>
      ) : null}
    </div>
  );
}

function Section({ id, title, icon, children }: { id?: string; title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <div id={id} className="scroll-mt-20">
        <CardHeader title={title} icon={icon} />
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </Card>
  );
}

export default async function ManualRolePage({
  params,
  searchParams,
}: {
  params: Promise<{ rol: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return measurePagePhase("page:/manual/[rol]", async () => {
    const user = await requireManualPage();
    const { rol } = await params;
    const query = singleQueryValues(await searchParams);
    const [role, summary] = [await getManualRole(rol), manualRoleSummary(rol)];
    if (!role || !summary) notFound();
    const mine = viewerManualRoles(user).includes(role.id);
    const level = levelFromParam(query.nivel);
    const levelData = role.levels.find(item => item.level === level.value) ?? role.levels[0];
    const Icon = ROLE_ICONS[role.id];

    return (
      <>
        <PageHeader
          breadcrumb={<Breadcrumb items={[{ label: "Manual de procedimientos", href: "/manual" }, { label: role.name }]} />}
          title={role.name}
          subtitle={summary.tagline}
          icon={<Icon size={20} />}
          actions={
            <>
              {mine ? <span className="chip bg-brandsoft text-brandtext">Tu rol</span> : null}
              <a href="#formacion" className="btn btn-sm">
                <ArrowDown size={14} /> Formación
              </a>
            </>
          }
        />

        <div className="space-y-4">
          <Section title="Misión" icon={<Target size={15} />}>
            <p className="text-ink text-[14px] leading-relaxed">{role.mission}</p>
            {role.responsibilities.length ? (
              <details className="mt-3">
                <summary className="text-brand cursor-pointer text-[12.5px] font-semibold">Responsabilidades ({role.responsibilities.length})</summary>
                <ul className="text-inksoft mt-2 list-disc space-y-1.5 pl-5 text-[13px] leading-relaxed">
                  {role.responsibilities.map((text, i) => <li key={i}>{text}</li>)}
                </ul>
              </details>
            ) : null}
          </Section>

          <div className="grid gap-4 xl:grid-cols-2">
            <Section id="procedimiento" title="Procedimiento" icon={<ListOrdered size={15} />}>
              <Expandable items={role.sop} visible={5} ordered label="pasos" />
            </Section>
            <div className="space-y-4">
              <Section title="Recibe de y entrega a" icon={<Handshake size={15} />}>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  <div>
                    <h3 className="text-inkmuted mb-1.5 text-[11px] font-bold tracking-wider uppercase">Recibe de</h3>
                    <Expandable items={role.receivesFrom} visible={3} label="entradas" />
                  </div>
                  <div>
                    <h3 className="text-inkmuted mb-1.5 text-[11px] font-bold tracking-wider uppercase">Entrega a</h3>
                    <Expandable items={role.deliversTo} visible={3} label="entregas" />
                  </div>
                </div>
              </Section>
              <Section title="Indicadores" icon={<Gauge size={15} />}>
                <Expandable items={role.kpis} visible={3} label="indicadores" />
                {role.tools.length ? (
                  <details className="mt-3">
                    <summary className="text-brand flex cursor-pointer items-center gap-1.5 text-[12.5px] font-semibold"><Wrench size={13} /> Herramientas ({role.tools.length})</summary>
                    <ul className="text-inksoft mt-2 list-disc space-y-1.5 pl-5 text-[13px] leading-relaxed">
                      {role.tools.map((text, i) => <li key={i}><Item text={text} /></li>)}
                    </ul>
                  </details>
                ) : null}
              </Section>
            </div>
          </div>

          <section id="formacion" className="scroll-mt-20 pt-2" aria-labelledby="formacion-titulo">
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <h2 id="formacion-titulo" className="text-ink text-[18px] font-bold tracking-tight">Formación</h2>
                <p className="text-inkmuted text-[12.5px]">{summary.modules} módulos y {summary.lessons} lecciones, de principiante a avanzado.</p>
              </div>
              <SegmentedControl param="nivel" defaultValue="principiante" options={MANUAL_LEVELS.map(item => ({ value: item.param, label: item.label }))} />
            </div>
            {levelData.goal ? (
              <p className="border-brand bg-surface2 text-inksoft mb-4 rounded-r-lg border-l-2 px-3 py-2 text-[13px] leading-relaxed">
                <strong className="text-ink">Meta de {level.label.toLowerCase()}:</strong> {levelData.goal}
              </p>
            ) : null}
            <ul className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
              {levelData.modules.map((module, index) => {
                const scenes = module.lessons.filter(lesson => lesson.mediaType === "ESCENA_3D").length;
                return (
                  <li key={module.slug}>
                    <Link href={`/manual/${role.slug}/${module.slug}`} className="card group flex h-full flex-col gap-2 p-4 transition-shadow hover:shadow-[var(--shadow-2)]">
                      <div className="text-inkmuted text-[10.5px] font-bold tracking-wider uppercase">Módulo {index + 1}</div>
                      <h3 className="text-ink text-[14.5px] leading-snug font-bold">{module.title}</h3>
                      <p className="text-inkmuted line-clamp-2 text-[12.5px] leading-snug">{module.summary}</p>
                      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
                        <span className="chip chip-plain">{module.lessons.length} lecciones</span>
                        <span className="chip chip-plain"><Film size={11} /> {module.videos.length ? `${module.videos.length} videos` : "Video pendiente"}</span>
                        {scenes ? <span className="chip chip-plain"><Box size={11} /> {scenes} en 3D</span> : null}
                        <ArrowRight size={15} className="text-inkmuted group-hover:text-brand ml-auto transition-colors" />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </>
    );
  });
}
