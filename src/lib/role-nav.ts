/**
 * Menú lateral por paneles de rol (ORDEN_POR_ROL). Puro: sin React, sin Prisma y sin process.env.
 * Devuelve datos serializables (los íconos van como nombres; src/components/nav-icons.ts los
 * traduce a lucide), así que se calcula igual en el cliente (Shell) que en el servidor (inicio,
 * ayuda del miembro).
 *
 * Reglas:
 *  - Un enlace se muestra con las mismas tres condiciones del menú de siempre: canAccessPath, el
 *    manual (/manual y /manual/*) solo con manualEnabled y /cadena solo con chainEnabled.
 *  - Cada enlace va en el PRIMER panel de su lista de prioridad que tenga quien mira. Así cada href
 *    aparece una sola vez y data-guia no se duplica.
 *  - Los paneles van en ROLE_ORDER (rolePanelsFor); un panel sin enlaces no se pinta.
 *  - Lo accesible que no cae en ningún panel va a «Consulta» (red de seguridad; hoy vacío).
 */
import { canAccessPath, type AccessUser, type PermissionFlags } from "@/lib/permissions";
import { rolePanelsFor, type NavIconName, type RolePanelId } from "@/lib/role-panels";

export type { NavIconName } from "@/lib/role-panels";

export type RoleNavItem = { href: string; label: string; icon: NavIconName };
export type RoleNavBlockId = "GENERAL" | RolePanelId | "CONSULTA" | "AYUDA";
export type RoleNavBlock = {
  id: RoleNavBlockId;
  /** Cabecera del bloque (la etiqueta corta del panel); null para «General», que no lleva. */
  title: string | null;
  /** Solo los paneles de rol se pliegan; General, Consulta y Ayuda quedan siempre abiertos. */
  collapsible: boolean;
  items: RoleNavItem[];
};
export type RoleNavFlags = { chainEnabled: boolean; manualEnabled: boolean; permissionFlags?: PermissionFlags };

type CatalogEntry = {
  label: string;
  icon: NavIconName;
  /** href fijo, o según la cadena (null: no se muestra con esa posición de la cadena). */
  href: string | ((chain: boolean) => string | null);
  /** Bloque fijo, o lista de prioridad de paneles. */
  place: "GENERAL" | "AYUDA" | readonly RolePanelId[];
  /** Solo el Dueño (enlaces de aterrizaje con query: la lista del miembro ignora ?estado). */
  ownerOnly?: boolean;
  /** Solo un MEMBER que tenga alguno de los paneles de la lista (manuales por rol). */
  memberPanelOnly?: boolean;
};

const byChain = (status: string, step: string) => (chain: boolean) => chain ? `/cadena?paso=${step}` : `/contenido?estado=${status}`;

/** Catálogo en orden fijo: el orden de los enlaces dentro de cada panel es este. */
const CATALOG: readonly CatalogEntry[] = [
  { label: "Inicio", icon: "layout-dashboard", href: "/", place: "GENERAL" },
  { label: "Cadena", icon: "workflow", href: "/cadena", place: "GENERAL" },
  { label: "Calendario", icon: "calendar-days", href: "/calendario", place: "GENERAL" },
  { label: "Videos", icon: "film", href: "/contenido", place: "GENERAL" },
  { label: "Tareas", icon: "check-square", href: "/tareas", place: "GENERAL" },
  { label: "Manual de procedimientos", icon: "book-open", href: "/manual", place: "GENERAL" },
  { label: "Marcas", icon: "tags", href: "/marcas", place: ["OWNER", "STRATEGY", "WRITER", "DESIGNER", "PUBLISHER", "ANALYST"] },
  { label: "Equipo", icon: "users", href: "/equipo", place: ["OWNER"] },
  { label: "Actividad", icon: "activity", href: "/actividad", place: ["OWNER"] },
  { label: "Ajustes", icon: "settings", href: "/ajustes", place: ["OWNER"] },
  { label: "Ideas", icon: "lightbulb", href: "/contenido?estado=IDEA", place: ["STRATEGY"], ownerOnly: true },
  { label: "Generador IA", icon: "sparkles", href: "/generador", place: ["WRITER"] },
  { label: "Generaciones", icon: "history", href: "/generador/trabajos", place: ["WRITER"] },
  { label: "Guiones", icon: "clapperboard", href: "/guiones", place: ["WRITER", "STRATEGY", "PRODUCTION", "CAMERA", "TALENT", "EDITOR"] },
  { label: "Estructuras", icon: "shapes", href: "/estructuras", place: ["STRATEGY", "WRITER", "DESIGNER"] },
  { label: "Personas", icon: "user-square", href: "/arquetipos", place: ["TALENT", "STRATEGY", "WRITER"] },
  { label: "Por preparar", icon: "package-check", href: "/contenido?estado=APROBADO", place: ["PRODUCTION"], ownerOnly: true },
  { label: "Por grabar", icon: "camera", href: byChain("GRABACION", "GRABACION"), place: ["CAMERA"], ownerOnly: true },
  { label: "En edición", icon: "scissors", href: byChain("EDICION", "EDICION"), place: ["EDITOR"], ownerOnly: true },
  { label: "Diseños pedidos", icon: "brush", href: chain => chain ? "/cadena?paso=DISENO" : null, place: ["DESIGNER"], ownerOnly: true },
  { label: "Por publicar", icon: "send", href: byChain("PROGRAMADO", "PUBLICACION"), place: ["PUBLISHER"], ownerOnly: true },
  { label: "Métricas", icon: "trending-up", href: "/metricas", place: ["ANALYST", "STRATEGY"] },
  // Manuales por rol (slugs de src/content/manual/index.ts): solo MEMBER con ese panel.
  { label: "Manual del guionista", icon: "book-open", href: "/manual/guionista", place: ["WRITER"], memberPanelOnly: true },
  { label: "Manual del filmmaker", icon: "book-open", href: "/manual/filmmaker", place: ["CAMERA"], memberPanelOnly: true },
  { label: "Manual del actor", icon: "book-open", href: "/manual/actor", place: ["TALENT"], memberPanelOnly: true },
  { label: "Manual del editor", icon: "book-open", href: "/manual/editor", place: ["EDITOR"], memberPanelOnly: true },
  { label: "Manual del community", icon: "book-open", href: "/manual/community-manager", place: ["PUBLISHER"], memberPanelOnly: true },
  { label: "Cómo se usa", icon: "graduation-cap", href: "/tutorial", place: "AYUDA" },
];

/** Los 17 hrefs del NAV de siempre (shell.tsx). Solo para las pruebas de equivalencia. */
export const LEGACY_NAV_HREFS: readonly string[] = [
  "/", "/calendario", "/contenido", "/tareas", "/cadena", "/marcas",
  "/generador", "/generador/trabajos", "/guiones", "/estructuras", "/arquetipos",
  "/metricas", "/manual", "/tutorial", "/equipo", "/actividad", "/ajustes",
];

const pathOf = (href: string) => href.split("?", 1)[0];
const hrefOf = (entry: CatalogEntry, chain: boolean) => typeof entry.href === "function" ? entry.href(chain) : entry.href;

/** Entrada del catálogo para un href ya resuelto (con la cadena encendida o apagada). */
const ENTRY_BY_HREF = new Map<string, CatalogEntry>(
  CATALOG.flatMap(entry => [false, true].map(chain => [hrefOf(entry, chain), entry] as const))
    .filter((pair): pair is readonly [string, CatalogEntry] => pair[0] !== null),
);

/** Las tres condiciones del menú de siempre (shell.tsx), aplicadas a cualquier href. */
function visible(user: AccessUser, href: string, flags: RoleNavFlags): boolean {
  const path = pathOf(href);
  if (!flags.manualEnabled && (path === "/manual" || path.startsWith("/manual/"))) return false;
  if (!flags.chainEnabled && path === "/cadena") return false;
  return canAccessPath(user, href, flags.permissionFlags);
}

/**
 * Bloques del menú para quien mira: «General» (sin cabecera), sus paneles en ROLE_ORDER,
 * «Consulta» (si algo no cayó en ningún panel) y «Ayuda». Sin bloques vacíos.
 */
export function buildRoleNav(user: AccessUser, flags: RoleNavFlags): RoleNavBlock[] {
  // Archivo total: un MEMBER sin marcas vivas queda con «base» (misma regla que baseOnly de
  // permissions.ts), así que sus perfiles no abren paneles: ni siquiera sus manuales por rol.
  const baseOnly = Boolean(flags.permissionFlags?.archiveEpoch) && user.role === "MEMBER" && Array.isArray(user.brandIds) && user.brandIds.length === 0;
  const panels = baseOnly ? [] : rolePanelsFor(user);
  const own = new Set<RolePanelId>(panels.map(p => p.id));
  const general: RoleNavItem[] = [], help: RoleNavItem[] = [], loose: RoleNavItem[] = [];
  const byPanel = new Map<RolePanelId, RoleNavItem[]>(panels.map(p => [p.id, []]));
  for (const entry of CATALOG) {
    const href = hrefOf(entry, flags.chainEnabled);
    if (href === null) continue;
    if (entry.ownerOnly && user.role !== "OWNER") continue;
    if (entry.memberPanelOnly && user.role !== "MEMBER") continue;
    if (!visible(user, href, flags)) continue;
    const item: RoleNavItem = { href, label: entry.label, icon: entry.icon };
    if (entry.place === "GENERAL") general.push(item);
    else if (entry.place === "AYUDA") help.push(item);
    else {
      const panel = entry.place.find(id => own.has(id));
      if (panel) byPanel.get(panel)!.push(item);
      else if (!entry.memberPanelOnly) loose.push(item);
    }
  }
  const blocks: RoleNavBlock[] = [{ id: "GENERAL", title: null, collapsible: false, items: general }];
  for (const panel of panels) blocks.push({ id: panel.id, title: panel.label, collapsible: true, items: byPanel.get(panel.id) ?? [] });
  blocks.push({ id: "CONSULTA", title: "Consulta", collapsible: false, items: loose });
  blocks.push({ id: "AYUDA", title: "Ayuda", collapsible: false, items: help });
  return blocks.filter(block => block.items.length > 0);
}

/** Hrefs del menú de quien mira, en el orden en que se pintan (para ordenar accesos y ayudas). */
export function roleNavHrefOrder(user: AccessUser, flags: RoleNavFlags): string[] {
  return buildRoleNav(user, flags).flatMap(block => block.items.map(item => item.href));
}

/**
 * Enlace activo del menú.
 *  1. Un href con query está activo si su ruta es exactamente la actual y cada uno de sus
 *     parámetros está en `search`; si hay varios, gana el de más parámetros. Cuando uno gana, el
 *     enlace base no se marca (en /contenido?estado=APROBADO se marca «Por preparar», no «Videos»).
 *  2. Si no, la regla de siempre: el prefijo más largo entre los hrefs sin query.
 */
export function activeNavHref(pathname: string, search: string, hrefs: readonly string[]): string | undefined {
  const current = new URLSearchParams(search);
  let best: string | undefined, bestCount = -1;
  for (const href of hrefs) {
    const cut = href.indexOf("?");
    if (cut === -1 || href.slice(0, cut) !== pathname) continue;
    const wanted = [...new URLSearchParams(href.slice(cut + 1))];
    if (wanted.every(([key, value]) => current.getAll(key).includes(value)) && wanted.length > bestCount) {
      best = href;
      bestCount = wanted.length;
    }
  }
  if (best) return best;
  return hrefs.filter(href => !href.includes("?") && (pathname === href || (href !== "/" && pathname.startsWith(href + "/"))))
    .sort((a, b) => b.length - a.length)[0];
}

/** Primer panel (sin contar al Dueño) de la lista de prioridad de un enlace. */
function firstMemberPanel(href: string): RolePanelId | undefined {
  const place = ENTRY_BY_HREF.get(href)?.place;
  return Array.isArray(place) ? (place as readonly RolePanelId[]).find(id => id !== "OWNER") : undefined;
}

/**
 * Botones de la tarjeta de un panel en el inicio del miembro: los enlaces de ESE panel en su menú
 * (un enlace compartido sale solo en el primer panel). Primero los propios del panel (el panel es
 * el primero de su lista de prioridad, sin contar al Dueño; los manuales no cuentan como propios),
 * luego el resto, en el orden del catálogo. Sin enlaces, «Videos».
 */
export function memberPanelButtons(nav: readonly RoleNavBlock[], panelId: RolePanelId, max = 3): RoleNavItem[] {
  const items = nav.find(block => block.id === panelId)?.items ?? [];
  if (!items.length) return [{ href: "/contenido", label: "Videos", icon: "film" }];
  const own = (item: RoleNavItem) => !ENTRY_BY_HREF.get(item.href)?.memberPanelOnly && firstMemberPanel(item.href) === panelId;
  return [...items.filter(own), ...items.filter(item => !own(item))].slice(0, max);
}
