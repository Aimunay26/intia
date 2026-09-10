import Link from "next/link";
import { notFound } from "next/navigation";
import type { SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SECTIONS, WORK_PROFILES, allows, assertPermission, canAccessSection, type Section } from "@/lib/permissions";
import { contentScope, taskScope } from "@/lib/access-scope";
import { getPageBrandContext } from "@/lib/render-context";
import { Card, PageHeader } from "@/components/ui";
import { MemberContent } from "@/components/member/content";
import { MemberScripts } from "@/components/member/scripts";
import { MemberTasks, MemberCalendar, MemberMetrics, MemberCatalog } from "@/components/member/sections";

export type MemberQuery = Record<string, string | undefined>;
export type MemberPageProps = { user: SessionUser; id?: string; query?: MemberQuery };

/** Entrada de servidor. Ninguna consulta del panel administrativo se ejecuta para miembros. */
export async function MemberWorkspace({ user, section, id, query = {} }: MemberPageProps & { section: Section }) {
  assertPermission(user, SECTIONS[section].capability);
  if (section === "content") return <MemberContent user={user} id={id} query={query} />;
  if (section === "scripts") return <MemberScripts user={user} id={id} query={query} />;
  if (section === "tasks") return <MemberTasks user={user} query={query} />;
  if (section === "calendar") return <MemberCalendar user={user} query={query} />;
  if (section === "metrics") return <MemberMetrics user={user} query={query} />;
  if (["brands", "structures", "archetypes"].includes(section)) return <MemberCatalog user={user} id={id} query={query} section={section as "brands" | "structures" | "archetypes"} />;
  if (!["panel", "help"].includes(section)) notFound();
  const profiles = WORK_PROFILES.filter(p => user.profiles?.includes(p.id));
  const context = await getPageBrandContext();
  const brand = context.activeId ? { brandId: context.activeId } : {};
  const [videos, tasks] = section === "panel" ? await Promise.all([
    allows(user, "content.view") ? prisma.contentItem.count({ where: { AND: [contentScope(user), brand, { status: { not: "PUBLICADO" } }] } }) : 0,
    allows(user, "tasks.view") ? prisma.task.count({ where: { AND: [taskScope(user), brand] } }) : 0,
  ]) : [0, 0];
  return <div className="space-y-4">
    <PageHeader title={section === "panel" ? `Hola, ${user.name}` : "Tu flujo de trabajo"} subtitle="Accesos y trabajo según tus perfiles y marcas autorizadas." />
    <Card className="space-y-3 p-5">
      <h2 className="font-semibold">Tus perfiles</h2>
      {profiles.length ? profiles.map(p => <p key={p.id}><strong>{p.label}.</strong> {p.description}</p>) : <p>El Dueño debe asignarte perfiles y marcas desde Equipo para habilitar tus secciones de trabajo.</p>}
      {section === "panel" && profiles.length ? <p>{videos} videos pendientes · {tasks} tareas visibles en esta vista.</p> : null}
      <p className="text-sm text-inkmuted">Cámara, talento, edición y diseño ven sus videos y tareas asignados. La aprobación corresponde a coordinación; publicación trabaja sobre videos aprobados. Los resultados se cargan por semana.</p>
    </Card>
    <div className="grid gap-3 sm:grid-cols-3">{(Object.keys(SECTIONS) as Section[]).filter(key => key !== section && canAccessSection(user, key)).map(key => <Link className="card p-4 hover:border-brand" key={key} href={SECTIONS[key].href}>{SECTIONS[key].label}</Link>)}</div>
  </div>;
}
