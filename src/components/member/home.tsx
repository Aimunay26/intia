import type { Prisma } from "@prisma/client";
import { Film, ListChecks, Sparkles } from "lucide-react";
import Link from "next/link";

import { ManualCard } from "@/components/manual/manual-card";
import { memberSectionLinks } from "@/components/member/help";
import { Callout, PageHeader, SectionTitle, Stat } from "@/components/ui";
import { MyWorkSection } from "@/components/work/my-work";
import { contentScope, taskScope } from "@/lib/access-scope";
import type { SessionUser } from "@/lib/auth";
import { DEAD_STATUSES } from "@/lib/constants";
import { allows } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { productionChainActiveFor } from "@/lib/production-chain-flag";
import { getPageBrandContext } from "@/lib/render-context";
import { formatDateLong, formatNumber } from "@/lib/utils";

/**
 * Tareas sin terminar: fuera de la última columna (por orden) que admite su marca, que es la de
 * «Listo». Misma regla que la cadena (syncStepTask) y que el invariante Q1.
 */
async function openTasksWhere(user: SessionUser): Promise<Prisma.TaskWhereInput> {
  const brandIds = [...user.brandIds ?? []];
  const columns = await prisma.taskColumn.findMany({
    where: { OR: [{ brandId: null }, { brandId: { in: brandIds } }] },
    orderBy: [{ order: "desc" }, { id: "desc" }],
    select: { id: true, brandId: true },
  });
  const lastFor = (brandId: string | null) => columns.find((column) => !column.brandId || column.brandId === brandId)?.id;
  return {
    OR: [null, ...brandIds].map((brandId) => {
      const last = lastFor(brandId);
      return last ? { brandId, columnId: { not: last } } : { brandId };
    }),
  };
}

/**
 * Inicio del equipo. Con la cadena de entregas encendida para sus marcas (o para la marca
 * activa, con el canario), «Mi trabajo» va primero (decisión del Dueño, 30/09/2026) y los
 * contadores cuentan solo lo abierto; si no, el Manual primero, luego su trabajo y los accesos,
 * como antes. Sin consultas del panel del Dueño.
 */
export async function MemberHome({ user }: { user: SessionUser }) {
  const context = await getPageBrandContext();
  const brand = context.activeId ? { brandId: context.activeId } : {};
  const chain = productionChainActiveFor(user, context.activeId);
  const hasProfiles = Boolean(user.profiles?.length);
  const canVideos = hasProfiles && allows(user, "content.view");
  const canTasks = hasProfiles && allows(user, "tasks.view");
  const [videos, tasks] = await Promise.all([
    canVideos
      ? prisma.contentItem.count({ where: { AND: [contentScope(user), brand, chain ? { status: { notIn: ["PUBLICADO", ...DEAD_STATUSES] } } : { status: { not: "PUBLICADO" } }] } })
      : 0,
    canTasks
      ? chain
        ? openTasksWhere(user).then((open) => prisma.task.count({ where: { AND: [taskScope(user), brand, open] } }))
        : prisma.task.count({ where: { AND: [taskScope(user), brand] } })
      : 0,
  ]);
  const firstName = user.name.trim().split(/\s+/)[0] || user.name;
  const today = formatDateLong(new Date());
  const scope = context.activeId ? "En la marca activa" : "En tus marcas autorizadas";
  const links = memberSectionLinks(user, ["panel"]);

  return (
    <div className="space-y-6">
      <PageHeader title={`Hola, ${firstName}`} subtitle={today.charAt(0).toUpperCase() + today.slice(1)} icon={<Sparkles size={19} />} />
      {chain ? <MyWorkSection user={user} brandId={context.activeId} /> : null}
      <ManualCard user={user} />

      <section>
        <SectionTitle>Tu trabajo</SectionTitle>
        {canVideos || canTasks ? (
          <div className="grid grid-cols-1 gap-3.5 min-[480px]:grid-cols-2 lg:grid-cols-3">
            {canVideos ? (
              <Stat
                label={chain ? "Videos en curso" : "Videos pendientes"}
                value={formatNumber(videos)}
                sub={`${chain ? "Sin publicar, cancelar ni pausar" : "Sin publicar"} · ${scope.toLowerCase()}`}
                icon={<Film size={16} />}
                href="/contenido"
              />
            ) : null}
            {canTasks ? (
              <Stat label={chain ? "Tareas abiertas" : "Tareas visibles"} value={formatNumber(tasks)} sub={chain ? `Fuera de «Listo» · ${scope.toLowerCase()}` : scope} icon={<ListChecks size={16} />} href="/tareas" />
            ) : null}
          </div>
        ) : (
          <Callout tone="info" title="Aún no tienes trabajo asignado">
            El Dueño debe asignarte perfiles y marcas desde Equipo para habilitar tus secciones de trabajo.
          </Callout>
        )}
      </section>

      <section>
        <SectionTitle>Accesos</SectionTitle>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {links.map(({ key, href, label, icon: Icon }) => (
            <li key={key}>
              <Link
                href={href}
                className={`card flex h-full min-h-[64px] items-center gap-2.5 p-3.5 transition-shadow hover:shadow-[var(--shadow-2)] ${key === "manual" ? "border-brand" : ""}`}
              >
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${key === "manual" ? "bg-brandsoft text-brand" : "bg-surface3 text-inkmuted"}`}>
                  <Icon size={16} />
                </span>
                <span className="text-ink min-w-0 text-[13px] leading-tight font-semibold">{label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
