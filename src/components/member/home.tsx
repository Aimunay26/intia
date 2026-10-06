import { PreparationPending } from "@/components/preparation-pending";
import type { Prisma } from "@prisma/client";
import { CastingPending } from "@/components/casting-pending";
import { Film, ListChecks, Sparkles } from "lucide-react";
import Link from "next/link";

import { ManualCard } from "@/components/manual/manual-card";
import { memberSectionLinks } from "@/components/member/help";
import { RolePanelCards } from "@/components/role-panel-cards";
import { Callout, PageHeader, SectionTitle, Stat } from "@/components/ui";
import { MyWorkSection } from "@/components/work/my-work";
import { contentScope, taskScope } from "@/lib/access-scope";
import { archiveEpoch } from "@/lib/archive-scope";
import type { SessionUser } from "@/lib/auth";
import type { BrandContext } from "@/lib/brand-context";
import { DEAD_STATUSES } from "@/lib/constants";
import { manualEnabled } from "@/lib/manual";
import { allows, permissionFlags, type Section } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { productionChainActiveFor } from "@/lib/production-chain-flag";
import { getPageBrandContext } from "@/lib/render-context";
import { countsFromRows, memberRoleCards, memberVideoTotal } from "@/lib/role-counts";
import { buildRoleNav } from "@/lib/role-nav";
import { roleOrderEnabled } from "@/lib/role-order-flag";
import { formatDateLong, formatNumber } from "@/lib/utils";

/** El estado persistido determina las tareas abiertas, independientemente de la columna. */
async function openTasksWhere(_user: SessionUser): Promise<Prisma.TaskWhereInput> {
  return { status: "PENDIENTE" };
}

/* ------------------------------------------------- ARCHIVO TOTAL (M0) -- */

/** Lo único que queda a mano mientras la cuenta no tiene marcas vivas. */
const RENOVACION: readonly Section[] = ["manual", "profile", "help"];

/**
 * Archivo total (ARCHIVO_TOTAL_DESDE encendido): la cuenta del equipo no tiene ninguna marca viva
 * (el selector nunca lista archivadas). Con el interruptor vacío siempre es false.
 */
export function sinMarcasVivas(user: SessionUser, context: BrandContext): boolean {
  return user.role !== "OWNER" && archiveEpoch() !== null && context.brands.length === 0;
}

/**
 * Pantalla provisional para quien no tiene marcas vivas: el aviso de la renovación más el Manual,
 * Mi perfil y «Cómo se usa». Sin consultas; la comparten el inicio y /sin-acceso.
 */
export function RenovacionAviso({ user }: { user: SessionUser }) {
  const links = memberSectionLinks(user).filter(({ key }) => RENOVACION.includes(key));
  return (
    <div className="space-y-6">
      <Callout tone="info" title="ALSOS se está renovando: pronto podrás crear tu marca o unirte a la de tu equipo">
        Mientras tanto, tienes a mano el Manual, tu perfil y «Cómo se usa».
      </Callout>
      <ManualCard user={user} />
      <AccessLinks links={links} />
    </div>
  );
}

function AccessLinks({ links }: { links: ReturnType<typeof memberSectionLinks> }) {
  return (
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
  );
}

/**
 * Inicio del equipo. Con la cadena de entregas encendida para sus marcas (o para la marca
 * activa, con el canario), «Mi trabajo» va primero (decisión del Dueño, 30/09/2026) y los
 * contadores cuentan solo lo abierto; si no, el Manual primero, luego su trabajo y los accesos,
 * como antes. Sin consultas del panel del Dueño.
 *
 * ORDEN_POR_ROL: después de «Mi trabajo» van «Tus paneles» (una tarjeta por perfil propio, en
 * orden de flujo) y el conteo de videos sale de un único groupBy por estado (mismas idas a la
 * base; el total usa el mismo predicado de siempre). Apagado, los bloques y consultas de siempre.
 */
export async function MemberHome({ user, query = {} }: { user: SessionUser; query?: Record<string, string | undefined> }) {
  const context = await getPageBrandContext();
  const firstName = user.name.trim().split(/\s+/)[0] || user.name;
  const today = formatDateLong(new Date());
  const header = <PageHeader title={`Hola, ${firstName}`} subtitle={today.charAt(0).toUpperCase() + today.slice(1)} icon={<Sparkles size={19} />} />;
  // Archivo total: sin marcas vivas no hay trabajo que contar; pantalla provisional sin consultas.
  if (sinMarcasVivas(user, context)) return <div className="space-y-6">{header}<RenovacionAviso user={user} /></div>;
  const brand = context.activeId ? { brandId: context.activeId } : {};
  const chain = productionChainActiveFor(user, context.activeId);
  const hasProfiles = Boolean(user.profiles?.length);
  const canVideos = hasProfiles && allows(user, "content.view");
  const canTasks = hasProfiles && allows(user, "tasks.view");
  const roleOrder = roleOrderEnabled();
  const [videoCounts, tasks] = await Promise.all([
    canVideos
      ? roleOrder
        ? prisma.contentItem.groupBy({ by: ["status"], _count: { _all: true }, where: { AND: [contentScope(user), brand] } }).then((rows) => countsFromRows(rows, "status"))
        : prisma.contentItem.count({ where: { AND: [contentScope(user), brand, chain ? { status: { notIn: ["PUBLICADO", ...DEAD_STATUSES] } } : { status: { not: "PUBLICADO" } }] } })
      : 0,
    canTasks
      ? chain
        ? openTasksWhere(user).then((open) => prisma.task.count({ where: { AND: [taskScope(user), brand, open] } }))
        : prisma.task.count({ where: { AND: [taskScope(user), brand] } })
      : 0,
  ]);
  const videos = typeof videoCounts === "number" ? videoCounts : memberVideoTotal(videoCounts, chain);
  const scope = context.activeId ? "En la marca activa" : "En tus marcas autorizadas";
  const links = memberSectionLinks(user, ["panel"]);
  // «Tus paneles»: los botones salen del menú de esta persona (mismas banderas que el layout).
  const panelCards = roleOrder && hasProfiles
    ? memberRoleCards(
        user,
        buildRoleNav(user, { chainEnabled: productionChainActiveFor(user, null), manualEnabled: manualEnabled(), permissionFlags: permissionFlags() }),
        typeof videoCounts === "number" ? null : videoCounts,
        scope.toLowerCase(),
      )
    : [];

  return (
    <div className="space-y-6">
      {header}
      <CastingPending user={user} page={query.reparto} brandId={context.activeId} />
      <PreparationPending user={user} brandId={context.activeId} />
      {chain ? <MyWorkSection user={user} query={query} brandId={context.activeId} /> : null}
      {panelCards.length ? (
        <section aria-labelledby="tus-paneles-title">
          <h2 id="tus-paneles-title" className="text-inkmuted mb-2.5 text-[11px] font-bold tracking-[0.09em] uppercase">Tus paneles</h2>
          <RolePanelCards variant="member" cards={panelCards} />
        </section>
      ) : null}
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
              <Stat label={chain ? "Tareas abiertas" : "Tareas visibles"} value={formatNumber(tasks)} sub={chain ? `Pendientes · ${scope.toLowerCase()}` : scope} icon={<ListChecks size={16} />} href="/tareas" />
            ) : null}
          </div>
        ) : (
          <Callout tone="info" title="Aún no tienes trabajo asignado">
            El Dueño debe asignarte perfiles y marcas desde Equipo para habilitar tus secciones de trabajo.
          </Callout>
        )}
      </section>

      <AccessLinks links={links} />
    </div>
  );
}
