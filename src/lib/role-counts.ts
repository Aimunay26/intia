/**
 * Conteos y tarjetas de rol del inicio (ORDEN_POR_ROL). Las funciones que arman las tarjetas son
 * puras (se prueban sin base); solo openStepCounts consulta, y solo con la cadena encendida.
 *
 *  - ownerRoleCards: las 10 tarjetas del Dueño en ROLE_ORDER. Con la cadena apagada cuentan por
 *    estado del video (el mismo groupBy del embudo, sin consultas nuevas) y enlazan a
 *    /contenido?estado=X; con la cadena encendida, las que tienen paso cuentan pasos abiertos y
 *    enlazan a /cadena?paso=X, para que el número coincida con la lista que abren.
 *  - memberRoleCards: una tarjeta por perfil propio (rolePanelsFor, nunca user.profiles), con la
 *    suma de sus estados y los botones de su panel en el menú (memberPanelButtons). Sin enlaces
 *    filtrados: la lista /contenido del miembro solo lee q.
 */
import type { Prisma } from "@prisma/client";

import { ACTIVE_STATUSES, DEAD_STATUSES } from "@/lib/constants";
import type { AccessUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { productionChainBrands } from "@/lib/production-chain-flag";
import { memberPanelButtons, type RoleNavBlock } from "@/lib/role-nav";
import { ROLE_PANELS, rolePanelsFor, type NavIconName, type RoleChainStep, type RolePanel, type RolePanelId } from "@/lib/role-panels";

/** Conteos por clave (estado del video o paso de la cadena). */
export type CountsByKey = Readonly<Record<string, number>>;

export type RoleCardButton = { href: string; label: string };
export type RoleCard = {
  id: RolePanelId;
  /** Número de paso en el flujo (1 = Dueño en el inicio del Dueño). */
  step: number;
  title: string;
  icon: NavIconName;
  /** null: la tarjeta no lleva conteo (Diseñador con la cadena apagada). */
  count: number | null;
  countLabel: string;
  /** Lista que cuenta el número; null cuando no hay una lista que muestre lo mismo. */
  countHref: string | null;
  /** Alcance del conteo («en tus marcas autorizadas»); solo en el inicio del miembro. */
  scopeLabel?: string;
  buttons: RoleCardButton[];
};

/** Suma los conteos de varias claves. */
export function sumCounts(counts: CountsByKey, keys: readonly string[]): number {
  return keys.reduce((total, key) => total + (counts[key] ?? 0), 0);
}

/** Pasa las filas de un groupBy a un objeto clave → total. */
export function countsFromRows<K extends string>(rows: readonly ({ _count: { _all: number } } & Record<K, string>)[], key: K): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row[key]] = (counts[row[key]] ?? 0) + row._count._all;
  return counts;
}

/**
 * Total de «Videos en curso / pendientes» del inicio del miembro a partir del groupBy por estado,
 * con el mismo predicado del count de siempre: con la cadena, fuera de PUBLICADO y DEAD_STATUSES;
 * sin ella, distinto de PUBLICADO.
 */
export function memberVideoTotal(counts: CountsByKey, chain: boolean): number {
  const excluded = new Set<string>(chain ? ["PUBLICADO", ...DEAD_STATUSES] : ["PUBLICADO"]);
  return Object.entries(counts).reduce((total, [status, count]) => excluded.has(status) ? total : total + count, 0);
}

/** Texto del conteo con la cadena encendida (pasos abiertos de ese paso). */
const STEP_COUNT_LABEL: Record<RoleChainStep, string> = {
  GUION: "guiones por entregar",
  GRABACION: "por grabar",
  EDICION: "en edición",
  DISENO: "diseños pedidos",
  PUBLICACION: "por publicar",
};

const byChain = (chain: boolean, status: string, step: string) => chain ? `/cadena?paso=${step}` : `/contenido?estado=${status}`;

/** Botones de cada tarjeta del Dueño (de 1 a 3; el primero es el principal). */
function ownerButtons(id: RolePanelId, chain: boolean): RoleCardButton[] {
  const calendar = { href: "/calendario", label: "Calendario" };
  const toShoot = { href: byChain(chain, "GRABACION", "GRABACION"), label: "Por grabar" };
  switch (id) {
    case "OWNER": return [{ href: "/marcas", label: "Marcas" }, { href: "/equipo", label: "Equipo" }, { href: "/actividad", label: "Actividad" }];
    case "STRATEGY": return [chain ? { href: "/cadena", label: "Cadena" } : calendar, { href: "/contenido?vista=atrasados", label: "Atrasados" }, { href: "/estructuras", label: "Estructuras" }];
    case "WRITER": return [{ href: "/generador", label: "Generar guion" }, { href: "/guiones", label: "Guiones" }, { href: "/generador/trabajos", label: "Generaciones" }];
    case "PRODUCTION": return [{ href: "/contenido?estado=APROBADO", label: "Por preparar" }, calendar];
    case "CAMERA": return [toShoot, calendar];
    case "TALENT": return [{ href: "/arquetipos", label: "Personas" }, toShoot];
    case "EDITOR": return [{ href: byChain(chain, "EDICION", "EDICION"), label: "En edición" }];
    case "DESIGNER": return [chain ? { href: "/cadena?paso=DISENO", label: "Diseños pedidos" } : { href: "/marcas", label: "Marcas" }];
    case "PUBLISHER": return [{ href: byChain(chain, "PROGRAMADO", "PUBLICACION"), label: "Por publicar" }, calendar];
    case "ANALYST": return [{ href: "/metricas", label: "Métricas" }, { href: "/contenido?estado=PUBLICADO", label: "Publicados" }];
  }
}

/** Conteo de una tarjeta del Dueño: el Dueño suma lo activo; el resto, su paso (cadena) o su estado. */
function ownerCount(panel: RolePanel, statusCounts: CountsByKey, stepCounts: CountsByKey | null, chain: boolean): Pick<RoleCard, "count" | "countLabel" | "countHref"> {
  if (panel.id === "OWNER") return { count: sumCounts(statusCounts, ACTIVE_STATUSES), countLabel: panel.countLabel, countHref: "/contenido?vista=produccion" };
  if (chain && panel.chainStep) {
    return { count: stepCounts?.[panel.chainStep] ?? 0, countLabel: STEP_COUNT_LABEL[panel.chainStep], countHref: `/cadena?paso=${panel.chainStep}` };
  }
  if (panel.ownerStatus) return { count: statusCounts[panel.ownerStatus] ?? 0, countLabel: panel.countLabel, countHref: `/contenido?estado=${panel.ownerStatus}` };
  return { count: null, countLabel: panel.countLabel, countHref: null };
}

/**
 * Las 10 tarjetas del inicio del Dueño, en ROLE_ORDER y numeradas del 1 al 10. `statusCounts` es
 * el groupBy por estado del embudo; `stepCounts`, los pasos abiertos (solo con la cadena).
 */
export function ownerRoleCards({ statusCounts, stepCounts, chain }: { statusCounts: CountsByKey; stepCounts: CountsByKey | null; chain: boolean }): RoleCard[] {
  return ROLE_PANELS.map((panel, index) => ({
    id: panel.id,
    step: index + 1,
    title: panel.title,
    icon: panel.icon,
    ...ownerCount(panel, statusCounts, stepCounts, chain),
    buttons: ownerButtons(panel.id, chain),
  }));
}

/** Texto del conteo del miembro: la suma de los estados de su perfil. */
const MEMBER_COUNT_LABEL: Partial<Record<RolePanelId, string>> = {
  STRATEGY: "ideas por planificar",
  WRITER: "en guion",
  PRODUCTION: "por preparar",
  CAMERA: "por grabar",
  TALENT: "por grabar",
  EDITOR: "en edición",
  DESIGNER: "en edición",
  PUBLISHER: "programados",
  ANALYST: "publicados",
};

/**
 * Tarjetas «Tus paneles» del miembro: una por perfil propio, en ROLE_ORDER (rolePanelsFor). El
 * número de paso es el de las tarjetas de Cargos en Equipo (Estrategia = 1 … Analista = 9). El
 * conteo no lleva enlace filtrado; si su menú tiene «Videos», enlaza a la lista sin filtro.
 * `statusCounts` null: no puede ver videos, la tarjeta va sin conteo.
 */
export function memberRoleCards(user: Pick<AccessUser, "role" | "profiles">, nav: readonly RoleNavBlock[], statusCounts: CountsByKey | null, scopeLabel?: string): RoleCard[] {
  if (user.role !== "MEMBER") return [];
  const hasVideos = nav.some(block => block.items.some(item => item.href === "/contenido"));
  return rolePanelsFor(user).map(panel => ({
    id: panel.id,
    step: ROLE_PANELS.indexOf(panel),
    title: panel.title,
    icon: panel.icon,
    count: statusCounts ? sumCounts(statusCounts, panel.memberStatuses) : null,
    countLabel: MEMBER_COUNT_LABEL[panel.id] ?? panel.countLabel,
    countHref: hasVideos ? "/contenido" : null,
    scopeLabel,
    buttons: memberPanelButtons(nav, panel.id, 3).map(({ href, label }) => ({ href, label })),
  }));
}

/**
 * Pasos abiertos de la cadena por paso, con la misma regla que allOpen de readChain
 * (production-scope.ts): PENDIENTE, el video dentro de `videos` (marca activa y archivo total ya
 * aplicados) y fuera de DEAD_STATUSES, la marca sin archivar y el canario aplicado. Así el número
 * de cada tarjeta coincide con /cadena?paso=X sin filtros.
 */
export async function openStepCounts(videos: Prisma.ContentItemWhereInput): Promise<Record<string, number>> {
  const canary = productionChainBrands();
  const rows = await prisma.productionStep.groupBy({
    by: ["step"],
    _count: { _all: true },
    where: {
      status: "PENDIENTE",
      ...(canary ? { brandId: { in: canary } } : {}),
      contentItem: { AND: [videos, { status: { notIn: DEAD_STATUSES } }, { brand: { archived: false } }] },
    },
  });
  return countsFromRows(rows, "step");
}
