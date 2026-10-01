/**
 * Fuente única del orden por rol (ORDEN_POR_ROL): Dueño → Estrategia → Guiones → Preparador →
 * Filmmaker → Talento → Editor → Diseñador → Community → Analista. Puro: sin React, sin Prisma y
 * sin process.env, así que lo usan por igual el servidor y el cliente. El interruptor vive aparte
 * (role-order-flag.ts) y llega aquí como parámetro `on`.
 *
 * Regla de consistencia: ROLE_ORDER.slice(1) es igual a WORK_PROFILES (permissions.ts), que ya
 * está en orden de flujo y no se toca. Nunca se recorre user.profiles directamente: llega en orden
 * alfabético desde la sesión; siempre se pasa por rolePanelsFor.
 */
import { ASSIGNMENT_ROLES, BRAND_TEAM_ROLES } from "@/lib/constants";
import { validProfiles, WORK_PROFILES, type AccessUser, type WorkProfile } from "@/lib/permissions";

/** Nombres de ícono del menú y de las tarjetas. src/components/nav-icons.ts los traduce a lucide. */
export const NAV_ICON_NAMES = [
  // Paneles
  "crown", "compass", "pen-line", "clipboard-list", "video", "drama", "scissors", "palette", "megaphone", "trending-up",
  // Enlaces
  "layout-dashboard", "workflow", "calendar-days", "film", "check-square", "book-open", "tags", "users", "activity",
  "settings", "lightbulb", "sparkles", "history", "clapperboard", "shapes", "user-square", "package-check", "camera",
  "brush", "send", "graduation-cap",
] as const;
export type NavIconName = (typeof NAV_ICON_NAMES)[number];

/** Panel de rol: el Dueño o uno de los 9 perfiles de trabajo. Los ids no cambian. */
export type RolePanelId = "OWNER" | WorkProfile;

/** Paso de la cadena de entregas que espera a este rol (CHAIN_STEP_RULES). */
export type RoleChainStep = "GUION" | "GRABACION" | "EDICION" | "PUBLICACION" | "DISENO";

export type RolePanel = {
  id: RolePanelId;
  /** Cabecera corta del menú lateral y etiqueta del pie («Guiones · Editor»). */
  label: string;
  /** Título de la tarjeta del inicio («Panel del filmmaker»). */
  title: string;
  icon: NavIconName;
  /** Etiqueta del perfil, igual que WORK_PROFILES (con el interruptor, usar profileLabelFor). */
  profileLabel: string;
  /** Estados del video que cuentan para el miembro con este perfil. */
  memberStatuses: readonly string[];
  /** Estado que cuenta la tarjeta del Dueño con la cadena apagada (null: sin conteo por estado). */
  ownerStatus: string | null;
  /** Paso de la cadena que cuenta con la cadena encendida (null: sin paso). */
  chainStep: RoleChainStep | null;
  /** Texto que acompaña al conteo de la tarjeta («en grabación»). */
  countLabel: string;
  /** Manual propio del rol (slug de MANUAL_ROLE_INDEX), o null si no tiene. */
  manual: { slug: string; label: string } | null;
  /** Funciones en el video (Assignment.role, ASSIGNMENT_ROLES) que pertenecen a este rol. */
  assignmentRoles: readonly string[];
  /** Funciones del equipo de marca (BrandTeamMember.role, BRAND_TEAM_ROLES) de este rol. */
  brandTeamRoles: readonly string[];
  /** Roles del manual (MANUAL_ROLE_INDEX.id) de este rol. */
  manualRoles: readonly string[];
};

const workLabel = (id: WorkProfile) => WORK_PROFILES.find(p => p.id === id)?.label ?? id;

/** Los 10 paneles, en el orden del flujo. */
export const ROLE_PANELS: readonly RolePanel[] = [
  { id: "OWNER", label: "Dueño", title: "Panel del Dueño", icon: "crown", profileLabel: "Dueño", memberStatuses: [], ownerStatus: null, chainStep: null, countLabel: "en producción", manual: { slug: "dueno", label: "Manual del dueño" }, assignmentRoles: [], brandTeamRoles: [], manualRoles: ["DUENO"] },
  { id: "STRATEGY", label: "Estrategia", title: "Panel de estrategia", icon: "compass", profileLabel: workLabel("STRATEGY"), memberStatuses: ["IDEA"], ownerStatus: "IDEA", chainStep: null, countLabel: "ideas por planificar", manual: null, assignmentRoles: [], brandTeamRoles: ["ENCARGADO"], manualRoles: [] },
  { id: "WRITER", label: "Guiones", title: "Panel de guiones", icon: "pen-line", profileLabel: workLabel("WRITER"), memberStatuses: ["GUION"], ownerStatus: "GUION", chainStep: "GUION", countLabel: "en guion", manual: { slug: "guionista", label: "Manual del guionista" }, assignmentRoles: ["GUIONISTA"], brandTeamRoles: ["GUIONISTA"], manualRoles: ["GUIONISTA"] },
  { id: "PRODUCTION", label: "Preparador", title: "Panel del preparador", icon: "clipboard-list", profileLabel: workLabel("PRODUCTION"), memberStatuses: ["APROBADO"], ownerStatus: "APROBADO", chainStep: null, countLabel: "por preparar", manual: null, assignmentRoles: ["PRODUCCION"], brandTeamRoles: [], manualRoles: [] },
  { id: "CAMERA", label: "Filmmaker", title: "Panel del filmmaker", icon: "video", profileLabel: workLabel("CAMERA"), memberStatuses: ["APROBADO", "GRABACION"], ownerStatus: "GRABACION", chainStep: "GRABACION", countLabel: "en grabación", manual: { slug: "filmmaker", label: "Manual del filmmaker" }, assignmentRoles: ["CAMARA"], brandTeamRoles: ["FILMMAKER"], manualRoles: ["FILMMAKER"] },
  { id: "TALENT", label: "Talento", title: "Panel de talento", icon: "drama", profileLabel: workLabel("TALENT"), memberStatuses: ["APROBADO", "GRABACION"], ownerStatus: "GRABACION", chainStep: "GRABACION", countLabel: "en grabación", manual: { slug: "actor", label: "Manual del actor" }, assignmentRoles: ["ACTOR", "VOZ"], brandTeamRoles: [], manualRoles: ["ACTOR"] },
  { id: "EDITOR", label: "Editor", title: "Panel del editor", icon: "scissors", profileLabel: workLabel("EDITOR"), memberStatuses: ["EDICION"], ownerStatus: "EDICION", chainStep: "EDICION", countLabel: "en edición", manual: { slug: "editor", label: "Manual del editor" }, assignmentRoles: ["EDITOR"], brandTeamRoles: ["EDITOR"], manualRoles: ["EDITOR", "JEFE_EDITORES"] },
  { id: "DESIGNER", label: "Diseñador", title: "Panel del diseñador", icon: "palette", profileLabel: workLabel("DESIGNER"), memberStatuses: ["EDICION"], ownerStatus: null, chainStep: "DISENO", countLabel: "diseños pedidos", manual: null, assignmentRoles: ["DISENO"], brandTeamRoles: ["DISENADOR"], manualRoles: [] },
  { id: "PUBLISHER", label: "Community", title: "Panel del community", icon: "megaphone", profileLabel: workLabel("PUBLISHER"), memberStatuses: ["PROGRAMADO"], ownerStatus: "PROGRAMADO", chainStep: "PUBLICACION", countLabel: "programados", manual: { slug: "community-manager", label: "Manual del community" }, assignmentRoles: ["COMMUNITY"], brandTeamRoles: ["COMMUNITY"], manualRoles: ["COMMUNITY", "ATC"] },
  { id: "ANALYST", label: "Analista", title: "Panel del analista", icon: "trending-up", profileLabel: workLabel("ANALYST"), memberStatuses: ["PUBLICADO"], ownerStatus: "PUBLICADO", chainStep: null, countLabel: "publicados", manual: null, assignmentRoles: [], brandTeamRoles: [], manualRoles: [] },
];

/** Ids de los paneles en orden de flujo: ["OWNER", ...ids de WORK_PROFILES]. */
export const ROLE_ORDER: readonly RolePanelId[] = ROLE_PANELS.map(p => p.id);

const PANEL_BY_ID = new Map<string, RolePanel>(ROLE_PANELS.map(p => [p.id, p]));

/** Panel por id, o undefined si el id no es un panel. */
export function rolePanel(id: string): RolePanel | undefined {
  return PANEL_BY_ID.get(id);
}

/** Posición del panel en ROLE_ORDER; un id desconocido (o vacío) va al final: ROLE_ORDER.length. */
export function roleRank(id: string | null | undefined): number {
  const index = id ? ROLE_ORDER.indexOf(id as RolePanelId) : -1;
  return index === -1 ? ROLE_ORDER.length : index;
}

/**
 * Ordena por panel de rol sin mutar la lista. Es estable: dos elementos del mismo panel conservan
 * su orden original, y lo que no tiene panel va al final, también en su orden original.
 */
export function sortByRole<T>(items: readonly T[], roleOf: (item: T) => string | null | undefined): T[] {
  return items.map((item, index) => ({ item, index, rank: roleRank(roleOf(item)) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(entry => entry.item);
}

/**
 * Paneles de quien mira, siempre en ROLE_ORDER. El Dueño recibe los 10; un MEMBER, solo los de sus
 * perfiles válidos (un perfil inventado se ignora); cualquier otro rol, ninguno.
 */
export function rolePanelsFor(user: Pick<AccessUser, "role" | "profiles">): RolePanel[] {
  if (user.role === "OWNER") return [...ROLE_PANELS];
  if (user.role !== "MEMBER") return [];
  const own = new Set<string>(validProfiles(user.profiles ?? []));
  return ROLE_PANELS.filter(p => own.has(p.id));
}

const panelOf = (field: "assignmentRoles" | "brandTeamRoles" | "manualRoles") => (value: string): RolePanelId | undefined =>
  ROLE_PANELS.find(p => p[field].includes(value))?.id;

/** Panel al que pertenece una función en el video (ASSIGNMENT_ROLES.value). */
export const panelOfAssignmentRole = panelOf("assignmentRoles");
/** Panel al que pertenece una función del equipo de marca (BRAND_TEAM_ROLES.value). */
export const panelOfBrandTeamRole = panelOf("brandTeamRoles");
/** Panel al que pertenece un rol del manual (MANUAL_ROLE_INDEX.id, p. ej. JEFE_EDITORES → EDITOR). */
export const panelOfManualRole = panelOf("manualRoles");

const ORDERED_ASSIGNMENT_ROLES = sortByRole(ASSIGNMENT_ROLES, o => panelOfAssignmentRole(o.value));
const ORDERED_BRAND_TEAM_ROLES = sortByRole(BRAND_TEAM_ROLES, o => panelOfBrandTeamRole(o.value));

/**
 * Funciones en el video para mostrar. Con el interruptor: GUIONISTA, PRODUCCION, CAMARA, ACTOR, VOZ,
 * EDITOR, DISENO, COMMUNITY. Apagado devuelve la MISMA referencia de ASSIGNMENT_ROLES. La constante
 * no se toca: el servidor sigue validando con ASSIGNMENT_ROLE_MAP.
 */
export function orderedAssignmentRoles(on: boolean): typeof ASSIGNMENT_ROLES {
  return on ? ORDERED_ASSIGNMENT_ROLES : ASSIGNMENT_ROLES;
}

/**
 * Funciones del equipo de marca para mostrar. Con el interruptor: ENCARGADO, GUIONISTA, FILMMAKER,
 * EDITOR, DISENADOR, COMMUNITY (Diseño antes de Community). Apagado devuelve la MISMA referencia de
 * BRAND_TEAM_ROLES; los bucles del servidor (actions/brand-team.ts) siguen con la constante.
 */
export function orderedBrandTeamRoles(on: boolean): typeof BRAND_TEAM_ROLES {
  return on ? ORDERED_BRAND_TEAM_ROLES : BRAND_TEAM_ROLES;
}

/**
 * Etiqueta de un perfil. Con el interruptor, PRODUCTION se muestra como «Preparador / producción»;
 * el resto, igual que WORK_PROFILES (el Dueño, «Dueño»). Un id desconocido se devuelve tal cual.
 */
export function profileLabelFor(id: string, on: boolean): string {
  if (on && id === "PRODUCTION") return "Preparador / producción";
  return PANEL_BY_ID.get(id)?.profileLabel ?? id;
}
