/**
 * Catalogos centrales de la aplicacion.
 * Se guardan como texto en la base de datos (portable SQLite/Postgres),
 * y aqui viven las etiquetas, colores y orden de cada uno.
 */

export type Option = {
  value: string;
  label: string;
  /** clases de tailwind para el chip */
  chip: string;
  /** color hex, para graficos y puntos */
  hex: string;
  description?: string;
};

const byValue = (list: Option[]) =>
  Object.fromEntries(list.map((o) => [o.value, o])) as Record<string, Option>;

/* -------------------------------------------------------------- USUARIOS -- */

/**
 * Solo hay dos posiciones, a propósito.
 *
 *   DUEÑO   manda: además de todo lo del equipo, puede eliminar, gestionar
 *           personas y tocar los ajustes y las claves de IA.
 *   EQUIPO  trabaja: crea, edita, mueve, asigna y publica. No elimina nada.
 *
 * Todo lo que hace cualquiera de los dos queda firmado en el log de actividad.
 */
export const USER_ROLES: Option[] = [
  {
    value: "OWNER",
    label: "Dueño",
    chip: "bg-violet-500/12 text-violet-600 dark:text-violet-300 ring-violet-500/25",
    hex: "#8b5cf6",
    description: "Control total. Es la única posición que puede eliminar.",
  },
  {
    value: "MEMBER",
    label: "Equipo",
    chip: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300 ring-emerald-500/25",
    hex: "#10b981",
    description: "Acceso según sus perfiles y marcas. Sin administración ni borrados.",
  },
];
export const USER_ROLE_MAP = byValue(USER_ROLES);

/** Estado de la cuenta de una persona del equipo. */
export const ACCOUNT_STATUSES: Option[] = [
  {
    value: "ACTIVA",
    label: "Activa",
    chip: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300 ring-emerald-500/25",
    hex: "#10b981",
    description: "Puede iniciar sesión.",
  },
  {
    value: "DESACTIVADA",
    label: "Desactivada",
    chip: "bg-zinc-500/12 text-zinc-600 dark:text-zinc-300 ring-zinc-500/25",
    hex: "#71717a",
    description: "No puede entrar, pero su historial y sus asignaciones se conservan.",
  },
];
export const ACCOUNT_STATUS_MAP = byValue(ACCOUNT_STATUSES);

/**
 * Jerarquía para permisos. Mayor número = más permisos.
 *
 * Solo estos dos. Un rol que no esté aquí da nivel 0, es decir, ningún permiso:
 * si alguna vez quedara una fila con un rol viejo, la cuenta se queda sin poder
 * escribir en vez de heredar permisos por accidente.
 */
export const ROLE_LEVEL: Record<string, number> = {
  MEMBER: 1,
  OWNER: 2,
};

export function hasLevel(role: string | undefined, min: number) {
  return ROLE_LEVEL[role ?? ""] >= min;
}

/* --------------------------------------------------------- CONTENIDO -- */

export const CONTENT_STATUSES: Option[] = [
  {
    value: "IDEA",
    label: "Idea",
    chip: "bg-slate-500/12 text-slate-600 dark:text-slate-300 ring-slate-500/25",
    hex: "#64748b",
  },
  {
    value: "GUION",
    label: "Guion",
    chip: "bg-violet-500/12 text-violet-600 dark:text-violet-300 ring-violet-500/25",
    hex: "#8b5cf6",
  },
  {
    value: "APROBADO",
    label: "Aprobado",
    chip: "bg-indigo-500/12 text-indigo-600 dark:text-indigo-300 ring-indigo-500/25",
    hex: "#6366f1",
  },
  {
    value: "GRABACION",
    label: "Grabación",
    chip: "bg-amber-500/12 text-amber-600 dark:text-amber-300 ring-amber-500/25",
    hex: "#f59e0b",
  },
  {
    value: "EDICION",
    label: "Edición",
    chip: "bg-orange-500/12 text-orange-600 dark:text-orange-300 ring-orange-500/25",
    hex: "#f97316",
  },
  {
    value: "PROGRAMADO",
    label: "Programado",
    chip: "bg-sky-500/12 text-sky-600 dark:text-sky-300 ring-sky-500/25",
    hex: "#0ea5e9",
  },
  {
    value: "PUBLICADO",
    label: "Publicado",
    chip: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300 ring-emerald-500/25",
    hex: "#10b981",
  },
  {
    value: "PAUSADO",
    label: "Pausado",
    chip: "bg-zinc-500/12 text-zinc-600 dark:text-zinc-300 ring-zinc-500/25",
    hex: "#71717a",
  },
  {
    value: "CANCELADO",
    label: "Cancelado",
    chip: "bg-rose-500/12 text-rose-600 dark:text-rose-300 ring-rose-500/25",
    hex: "#f43f5e",
  },
];
export const CONTENT_STATUS_MAP = byValue(CONTENT_STATUSES);

/** Estados que cuentan como "trabajo terminado". */
export const DONE_STATUSES = ["PUBLICADO"];
/** Estados que ya no avanzan. */
export const DEAD_STATUSES = ["CANCELADO", "PAUSADO"];
/** Estados en los que el video todavia esta en produccion. */
export const ACTIVE_STATUSES = [
  "IDEA",
  "GUION",
  "APROBADO",
  "GRABACION",
  "EDICION",
  "PROGRAMADO",
];

export const PLATFORMS: Option[] = [
  {
    value: "TIKTOK",
    label: "TikTok",
    chip: "bg-fuchsia-500/12 text-fuchsia-600 dark:text-fuchsia-300 ring-fuchsia-500/25",
    hex: "#d946ef",
  },
  {
    value: "INSTAGRAM",
    label: "Instagram",
    chip: "bg-pink-500/12 text-pink-600 dark:text-pink-300 ring-pink-500/25",
    hex: "#ec4899",
  },
  {
    value: "FACEBOOK",
    label: "Facebook",
    chip: "bg-blue-500/12 text-blue-600 dark:text-blue-300 ring-blue-500/25",
    hex: "#3b82f6",
  },
  {
    value: "YOUTUBE",
    label: "YouTube",
    chip: "bg-red-500/12 text-red-600 dark:text-red-300 ring-red-500/25",
    hex: "#ef4444",
  },
  {
    value: "WHATSAPP",
    label: "WhatsApp",
    chip: "bg-green-500/12 text-green-600 dark:text-green-300 ring-green-500/25",
    hex: "#22c55e",
  },
  {
    value: "OTRO",
    label: "Otro",
    chip: "bg-slate-500/12 text-slate-600 dark:text-slate-300 ring-slate-500/25",
    hex: "#64748b",
  },
];
export const PLATFORM_MAP = byValue(PLATFORMS);

/**
 * Un video puede publicarse en varias redes. En la base se guarda como JSON,
 * así que estos dos ayudantes son el único sitio donde se traduce.
 */
export function platformOptions(platforms: string[]): Option[] {
  return platforms.map((p) => PLATFORM_MAP[p]).filter((p): p is Option => Boolean(p));
}

/** "TikTok, Instagram" — para títulos y textos de una línea. */
export function platformLabels(platforms: string[]): string {
  const nombres = platformOptions(platforms).map((p) => p.label);
  return nombres.length ? nombres.join(", ") : "Sin red asignada";
}

/**
 * Filtro de Prisma para "videos que salen en esta red".
 * Relación normalizada e indexada; el JSON se conserva para formularios y compatibilidad.
 */
export function platformFilter(platform: string) {
  return { some: { platform } };
}

/** Semáforo de prioridad: azul tranquilo, naranja atento, rojo urgente. */
export const PRIORITIES: Option[] = [
  {
    value: "ALTA",
    label: "Alta",
    chip: "bg-red-500/12 text-red-600 dark:text-red-300 ring-red-500/25",
    hex: "#ef4444",
    description: "Urgente: va primero en la cola.",
  },
  {
    value: "MEDIA",
    label: "Media",
    chip: "bg-orange-500/12 text-orange-600 dark:text-orange-300 ring-orange-500/25",
    hex: "#f97316",
    description: "Ritmo normal de producción.",
  },
  {
    value: "BAJA",
    label: "Baja",
    chip: "bg-blue-500/12 text-blue-600 dark:text-blue-300 ring-blue-500/25",
    hex: "#3b82f6",
    description: "Puede esperar si hay carga.",
  },
];
export const PRIORITY_MAP = byValue(PRIORITIES);

/* ------------------------------------------------------------- AGENDA -- */

/**
 * Lo que ocupa un hueco en el calendario y no es un video.
 * Junto con los videos, es lo que se publica al feed de Google Calendar.
 */
export const EVENT_KINDS: Option[] = [
  {
    value: "REUNION",
    label: "Reunión",
    chip: "bg-violet-500/12 text-violet-600 dark:text-violet-300 ring-violet-500/25",
    hex: "#8b5cf6",
    description: "Con el equipo, con la marca o con un proveedor.",
  },
  {
    value: "GRABACION",
    label: "Día de grabación",
    chip: "bg-amber-500/12 text-amber-600 dark:text-amber-300 ring-amber-500/25",
    hex: "#f59e0b",
    description: "Jornada de rodaje, con su locación y su hora.",
  },
  {
    value: "PENDIENTE",
    label: "Pendiente",
    chip: "bg-orange-500/12 text-orange-600 dark:text-orange-300 ring-orange-500/25",
    hex: "#f97316",
    description: "Algo que hay que resolver para esa fecha.",
  },
  {
    value: "RECORDATORIO",
    label: "Recordatorio",
    chip: "bg-sky-500/12 text-sky-600 dark:text-sky-300 ring-sky-500/25",
    hex: "#0ea5e9",
    description: "Fechas clave: campañas, lanzamientos, festivos.",
  },
  {
    value: "OTRO",
    label: "Otro",
    chip: "bg-slate-500/12 text-slate-600 dark:text-slate-300 ring-slate-500/25",
    hex: "#64748b",
  },
];
export const EVENT_KIND_MAP = byValue(EVENT_KINDS);

/* ------------------------------------------------------- ASIGNACIONES -- */

export const ASSIGNMENT_ROLES: Option[] = [
  {
    value: "GUIONISTA",
    label: "Guionista",
    chip: "bg-violet-500/12 text-violet-600 dark:text-violet-300 ring-violet-500/25",
    hex: "#8b5cf6",
    description: "Escribió el guion",
  },
  {
    value: "ACTOR",
    label: "Actor / Actriz",
    chip: "bg-pink-500/12 text-pink-600 dark:text-pink-300 ring-pink-500/25",
    hex: "#ec4899",
    description: "Actuó frente a cámara",
  },
  {
    value: "CAMARA",
    label: "Cámara",
    chip: "bg-sky-500/12 text-sky-600 dark:text-sky-300 ring-sky-500/25",
    hex: "#0ea5e9",
    description: "Grabó el video",
  },
  {
    value: "EDITOR",
    label: "Editor",
    chip: "bg-orange-500/12 text-orange-600 dark:text-orange-300 ring-orange-500/25",
    hex: "#f97316",
    description: "Editó y montó",
  },
  {
    value: "VOZ",
    label: "Voz en off",
    chip: "bg-teal-500/12 text-teal-600 dark:text-teal-300 ring-teal-500/25",
    hex: "#14b8a6",
    description: "Puso la voz",
  },
  {
    value: "PRODUCCION",
    label: "Producción",
    chip: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300 ring-emerald-500/25",
    hex: "#10b981",
    description: "Consiguió props, locación, logística",
  },
  {
    value: "DISENO",
    label: "Diseño",
    chip: "bg-indigo-500/12 text-indigo-600 dark:text-indigo-300 ring-indigo-500/25",
    hex: "#6366f1",
    description: "Gráficos, miniatura, textos en pantalla",
  },
  {
    value: "COMMUNITY",
    label: "Community / publicación",
    chip: "bg-rose-500/12 text-rose-600 dark:text-rose-300 ring-rose-500/25",
    hex: "#f43f5e",
    description: "Sube el video a las redes",
  },
];
export const ASSIGNMENT_ROLE_MAP = byValue(ASSIGNMENT_ROLES);

/* ------------------------------------------------- FLUJO DE PRODUCCIÓN -- */

/**
 * Funciones del equipo de una marca (BrandTeamMember.role): una persona por
 * función. El flujo automático (PRODUCTION_FLOW_ENABLED) asigna desde aquí.
 * `profile` es el perfil de trabajo que se sugiere primero al elegir persona.
 */
export const BRAND_TEAM_ROLES: (Option & { profile: string })[] = [
  {
    value: "ENCARGADO",
    label: "Encargado de marca",
    chip: "bg-violet-500/12 text-violet-600 dark:text-violet-300 ring-violet-500/25",
    hex: "#8b5cf6",
    description: "Coordina la marca y responde por el calendario.",
    profile: "STRATEGY",
  },
  {
    value: "GUIONISTA",
    label: "Guionista",
    chip: "bg-fuchsia-500/12 text-fuchsia-600 dark:text-fuchsia-300 ring-fuchsia-500/25",
    hex: "#d946ef",
    description: "Escribe los guiones y pide los diseños.",
    profile: "WRITER",
  },
  {
    value: "FILMMAKER",
    label: "Filmmaker",
    chip: "bg-sky-500/12 text-sky-600 dark:text-sky-300 ring-sky-500/25",
    hex: "#0ea5e9",
    description: "Graba el día de grabación y sube el material a la nube.",
    profile: "CAMERA",
  },
  {
    value: "EDITOR",
    label: "Edición",
    chip: "bg-orange-500/12 text-orange-600 dark:text-orange-300 ring-orange-500/25",
    hex: "#f97316",
    description: "Edita el material en el siguiente día hábil.",
    profile: "EDITOR",
  },
  {
    value: "COMMUNITY",
    label: "Community",
    chip: "bg-rose-500/12 text-rose-600 dark:text-rose-300 ring-rose-500/25",
    hex: "#f43f5e",
    description: "Sube el video aprobado a las redes al día siguiente.",
    profile: "PUBLISHER",
  },
  {
    value: "DISENADOR",
    label: "Diseño",
    chip: "bg-indigo-500/12 text-indigo-600 dark:text-indigo-300 ring-indigo-500/25",
    hex: "#6366f1",
    description: "Entrega los diseños pedidos en un máximo de 24 horas.",
    profile: "DESIGNER",
  },
];
export const BRAND_TEAM_ROLE_MAP = byValue(BRAND_TEAM_ROLES);

/** Pasos de producción con plazo (ProductionStep.step). GUION solo existe con la cadena de entregas. */
export const PRODUCTION_STEPS: Option[] = [
  { value: "REVISION_GUION", label: "Revisión de guion", chip: "bg-violet-500/12 text-violet-600", hex: "#8b5cf6", description: "Coordinación aprueba la versión entregada o pide correcciones." },
  { value: "REVISION_FINAL", label: "Revisión final", chip: "bg-violet-500/12 text-violet-600", hex: "#8b5cf6", description: "Coordinación revisa el máster antes de autorizar su publicación." },
  {
    value: "GUION",
    label: "Guion",
    chip: "bg-fuchsia-500/12 text-fuchsia-600 dark:text-fuchsia-300 ring-fuchsia-500/25",
    hex: "#d946ef",
    description: "Hasta el final del segundo día hábil desde que nace la idea.",
  },
  {
    value: "GRABACION",
    label: "Grabación",
    chip: "bg-sky-500/12 text-sky-600 dark:text-sky-300 ring-sky-500/25",
    hex: "#0ea5e9",
    description: "El día de grabación elegido para la marca.",
  },
  {
    value: "EDICION",
    label: "Edición",
    chip: "bg-orange-500/12 text-orange-600 dark:text-orange-300 ring-orange-500/25",
    hex: "#f97316",
    description: "Hasta el final del siguiente día hábil después de grabar (el domingo no se trabaja).",
  },
  {
    value: "PUBLICACION",
    label: "Publicación",
    chip: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300 ring-emerald-500/25",
    hex: "#10b981",
    description: "Al día hábil siguiente de la revisión final.",
  },
  {
    value: "DISENO",
    label: "Diseño",
    chip: "bg-indigo-500/12 text-indigo-600 dark:text-indigo-300 ring-indigo-500/25",
    hex: "#6366f1",
    description: "Entrega en un máximo de 24 horas.",
  },
];
export const PRODUCTION_STEP_MAP = byValue(PRODUCTION_STEPS);

export const PRODUCTION_STEP_STATUSES: Option[] = [
  {
    value: "PENDIENTE",
    label: "Pendiente",
    chip: "bg-amber-500/12 text-amber-600 dark:text-amber-300 ring-amber-500/25",
    hex: "#f59e0b",
  },
  {
    value: "HECHO",
    label: "Hecho",
    chip: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300 ring-emerald-500/25",
    hex: "#10b981",
  },
  {
    value: "CANCELADO",
    label: "Cancelado",
    chip: "bg-slate-500/12 text-slate-600 dark:text-slate-300 ring-slate-500/25",
    hex: "#64748b",
  },
  {
    value: "DEVUELTO",
    label: "Devuelto",
    chip: "bg-rose-500/12 text-rose-600 dark:text-rose-300 ring-rose-500/25",
    hex: "#f43f5e",
    description: "Se devolvió al paso anterior con un motivo; ese paso vuelve a estar pendiente.",
  },
];
export const PRODUCTION_STEP_STATUS_MAP = byValue(PRODUCTION_STEP_STATUSES);

/**
 * Cadena de entregas por video (PRODUCTION_CHAIN_ENABLED), en orden. Diseño corre en
 * paralelo y no cuenta para «un paso abierto por video». Las entregas de guion y edición
 * requieren una revisión humana antes de continuar (04/10/2026).
 */
export const CHAIN_ORDER = ["GUION", "REVISION_GUION", "GRABACION", "EDICION", "REVISION_FINAL", "PUBLICACION"] as const;
export type ChainStep = (typeof CHAIN_ORDER)[number];

export type ChainStepRule = {
  /** Función del equipo de la marca (BrandTeamMember.role) que recibe el paso. */
  team: "GUIONISTA" | "FILMMAKER" | "EDITOR" | "COMMUNITY" | "DISENADOR" | "ENCARGADO";
  /** Función en el video (Assignment.role) que manda sobre la persona de la marca. */
  assignment: "GUIONISTA" | "CAMARA" | "EDITOR" | "COMMUNITY" | "DISENO" | null;
  /** Verbo de la tarea y del calendario («Grabar: título»). */
  task: string;
  /** Texto del botón «Listo». */
  listo: string;
  /** Capacidad que debe tener la persona asignada para pulsar «Listo». */
  capability: "scripts.write" | "content.shoot" | "content.editing" | "content.publish" | "content.design" | "scripts.approve" | "content.approve";
  /** Paso al que se devuelve con «Devolver» (null: no se devuelve; solo «Avisar a coordinación»). */
  returnsTo: ChainStep | null;
  /** Texto del botón «Devolver», si aplica. */
  returnLabel: string | null;
  /** Enlace que exige el «Listo». */
  link: "materialUrl" | "publishedUrl" | null;
  /** Etiqueta de ese enlace en formularios y errores. */
  linkLabel: string | null;
  /** Rol legible de quien lo recibe. */
  role: string;
};

export const CHAIN_STEP_RULES: Record<ChainStep | "DISENO", ChainStepRule> = {
  GUION: { team: "GUIONISTA", assignment: "GUIONISTA", task: "Escribir guion", listo: "Enviar a revisión", capability: "scripts.write", returnsTo: null, returnLabel: null, link: null, linkLabel: null, role: "Guionista" },
  REVISION_GUION: { team: "ENCARGADO", assignment: null, task: "Revisar guion", listo: "Aprobar guion", capability: "scripts.approve", returnsTo: "GUION", returnLabel: "Pedir correcciones al guionista", link: null, linkLabel: null, role: "Coordinación" },
  GRABACION: { team: "FILMMAKER", assignment: "CAMARA", task: "Grabar", listo: "Listo, pasar a edición", capability: "content.shoot", returnsTo: null, returnLabel: null, link: "materialUrl", linkLabel: "Material grabado", role: "Filmmaker" },
  EDICION: { team: "EDITOR", assignment: "EDITOR", task: "Editar", listo: "Enviar a revisión final", capability: "content.editing", returnsTo: "GRABACION", returnLabel: "Devolver al filmmaker", link: "materialUrl", linkLabel: "Máster (video editado)", role: "Editor" },
  REVISION_FINAL: { team: "ENCARGADO", assignment: null, task: "Revisar vídeo final", listo: "Aprobar vídeo final", capability: "content.approve", returnsTo: "EDICION", returnLabel: "Pedir correcciones al editor", link: null, linkLabel: null, role: "Coordinación" },
  PUBLICACION: { team: "COMMUNITY", assignment: "COMMUNITY", task: "Publicar", listo: "Publicado", capability: "content.publish", returnsTo: "EDICION", returnLabel: "Devolver por correcciones", link: "publishedUrl", linkLabel: "Enlace público", role: "Community" },
  DISENO: { team: "DISENADOR", assignment: "DISENO", task: "Diseño", listo: "Entregar diseño", capability: "content.design", returnsTo: null, returnLabel: null, link: "materialUrl", linkLabel: "Entrega del diseño", role: "Diseñador" },
};

/** Capacidades adicionales de coordinación: entregar no implica aprobar. */
export const CHAIN_COORD_CAPABILITY: Partial<Record<ChainStep | "DISENO", { complete?: "scripts.approve" | "content.approve" | "content.publish"; return?: "content.approve" }>> = {
  REVISION_GUION: { complete: "scripts.approve", return: "content.approve" },
  REVISION_FINAL: { complete: "content.approve", return: "content.approve" },
  PUBLICACION: { complete: "content.publish", return: "content.approve" },
};

/**
 * Checks obligatorios pendientes que el «Listo» de cada paso marca a nombre de quien pulsa («Se
 * marcarán a tu nombre: …»). Pura y segura para el cliente: la comparten «Mi trabajo»
 * (production-scope.ts) y los botones (step-copy.ts). Misma regla que production-chain.ts.
 */
export function chainChecksToMark(step: string, checks: readonly { label: string; stage: string }[]): string[] {
  const written = /guion escrito/i, design = /miniatura|portada|diseño/i;
  const pick = (stages: string[], test: (label: string) => boolean = () => true) => checks.filter((c) => stages.includes(c.stage) && test(c.label)).map((c) => c.label);
  if (step === "GUION") return pick(["PREPRODUCCION"], (label) => written.test(label));
  if (step === "GRABACION") return pick(["GRABACION"]);
  if (step === "EDICION") return [...pick(["POSTPRODUCCION"], (label) => !design.test(label)), ...pick(["GENERAL"])];
  if (step === "PUBLICACION") return pick(["PUBLICACION"]);
  if (step === "DISENO") return pick(["POSTPRODUCCION"], (label) => design.test(label));
  return [];
}

/** Días en que se puede grabar: lunes (1) a sábado (6). El domingo no se trabaja. */
export const RECORDING_WEEKDAYS: { value: number; label: string; long: string }[] = [
  { value: 1, label: "Lun", long: "lunes" },
  { value: 2, label: "Mar", long: "martes" },
  { value: 3, label: "Mié", long: "miércoles" },
  { value: 4, label: "Jue", long: "jueves" },
  { value: 5, label: "Vie", long: "viernes" },
  { value: 6, label: "Sáb", long: "sábado" },
];

/* ------------------------------------------------------------ CHECKLIST -- */

export const CHECKLIST_STAGES: Option[] = [
  {
    value: "PREPRODUCCION",
    label: "Preproducción",
    chip: "bg-violet-500/12 text-violet-600 dark:text-violet-300 ring-violet-500/25",
    hex: "#8b5cf6",
  },
  {
    value: "GRABACION",
    label: "Grabación",
    chip: "bg-amber-500/12 text-amber-600 dark:text-amber-300 ring-amber-500/25",
    hex: "#f59e0b",
  },
  {
    value: "POSTPRODUCCION",
    label: "Postproducción",
    chip: "bg-orange-500/12 text-orange-600 dark:text-orange-300 ring-orange-500/25",
    hex: "#f97316",
  },
  {
    value: "PUBLICACION",
    label: "Publicación",
    chip: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300 ring-emerald-500/25",
    hex: "#10b981",
  },
  {
    value: "GENERAL",
    label: "General",
    chip: "bg-slate-500/12 text-slate-600 dark:text-slate-300 ring-slate-500/25",
    hex: "#64748b",
  },
];
export const CHECKLIST_STAGE_MAP = byValue(CHECKLIST_STAGES);

/** Checklist que se crea automaticamente con cada video nuevo. */
export const DEFAULT_CHECKLIST: {
  kind?: string;
  label: string;
  stage: string;
  required: boolean;
}[] = [
  { label: "Guion escrito y revisado", stage: "PREPRODUCCION", required: true },
  { kind: "SCRIPT_APPROVAL", label: "Guion aprobado por la marca", stage: "PREPRODUCCION", required: true },
  { label: "Actor asignado y confirmado", stage: "PREPRODUCCION", required: true },
  { label: "Props / vestuario conseguidos", stage: "PREPRODUCCION", required: true },
  { label: "Locación e iluminación listas", stage: "PREPRODUCCION", required: false },
  { label: "Grabado (todas las tomas)", stage: "GRABACION", required: true },
  { label: "Audio revisado", stage: "GRABACION", required: true },
  { label: "B-roll / tomas de apoyo", stage: "GRABACION", required: false },
  { label: "Editado", stage: "POSTPRODUCCION", required: true },
  { label: "Subtítulos y textos en pantalla", stage: "POSTPRODUCCION", required: true },
  { label: "Música y efectos de sonido", stage: "POSTPRODUCCION", required: false },
  { kind: "FINAL_APPROVAL", label: "Revisión final aprobada", stage: "POSTPRODUCCION", required: true },
  { label: "Copy y hashtags escritos", stage: "PUBLICACION", required: true },
  { label: "Subido a la plataforma", stage: "PUBLICACION", required: true },
  { label: "Link guardado en la ficha", stage: "PUBLICACION", required: false },
];

/* --------------------------------------------------------------- GUIONES -- */

export const SCRIPT_STATUSES: Option[] = [
  {
    value: "BORRADOR",
    label: "Borrador",
    chip: "bg-slate-500/12 text-slate-600 dark:text-slate-300 ring-slate-500/25",
    hex: "#64748b",
  },
  {
    value: "REVISION",
    label: "En revisión",
    chip: "bg-amber-500/12 text-amber-600 dark:text-amber-300 ring-amber-500/25",
    hex: "#f59e0b",
  },
  {
    value: "APROBADO",
    label: "Aprobado",
    chip: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300 ring-emerald-500/25",
    hex: "#10b981",
  },
  {
    value: "GRABADO",
    label: "Grabado",
    chip: "bg-sky-500/12 text-sky-600 dark:text-sky-300 ring-sky-500/25",
    hex: "#0ea5e9",
  },
  {
    value: "ARCHIVADO",
    label: "Archivado",
    chip: "bg-zinc-500/12 text-zinc-600 dark:text-zinc-300 ring-zinc-500/25",
    hex: "#71717a",
  },
];
export const SCRIPT_STATUS_MAP = byValue(SCRIPT_STATUSES);

export const VOICE_TYPES: Option[] = [
  {
    value: "EN_CAMARA",
    label: "En cámara",
    chip: "bg-pink-500/12 text-pink-600 dark:text-pink-300 ring-pink-500/25",
    hex: "#ec4899",
  },
  {
    value: "VOZ_EN_OFF",
    label: "Voz en off",
    chip: "bg-teal-500/12 text-teal-600 dark:text-teal-300 ring-teal-500/25",
    hex: "#14b8a6",
  },
  {
    value: "DIALOGO",
    label: "Dialogo",
    chip: "bg-violet-500/12 text-violet-600 dark:text-violet-300 ring-violet-500/25",
    hex: "#8b5cf6",
  },
  {
    value: "TEXTO",
    label: "Solo texto",
    chip: "bg-slate-500/12 text-slate-600 dark:text-slate-300 ring-slate-500/25",
    hex: "#64748b",
  },
];
export const VOICE_TYPE_MAP = byValue(VOICE_TYPES);

/* ---------------------------------------------------------- ESTRUCTURAS -- */

export const STRUCTURE_CATEGORIES: Option[] = [
  {
    value: "VENDE",
    label: "Vende",
    chip: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300 ring-emerald-500/25",
    hex: "#10b981",
    description: "Siempre lleva llamado a la acción: busca que el espectador haga algo.",
  },
  {
    value: "ENTRETIENE",
    label: "Entretiene",
    chip: "bg-fuchsia-500/12 text-fuchsia-600 dark:text-fuchsia-300 ring-fuchsia-500/25",
    hex: "#d946ef",
    description: "Solo busca entretener y ganar alcance. Sin venta directa.",
  },
];
export const STRUCTURE_CATEGORY_MAP = byValue(STRUCTURE_CATEGORIES);

/* ---------------------------------------------------------- OBJETIVOS -- */

export const OBJECTIVE_STATUSES: Option[] = [
  {
    value: "EN_CURSO",
    label: "En curso",
    chip: "bg-sky-500/12 text-sky-600 dark:text-sky-300 ring-sky-500/25",
    hex: "#0ea5e9",
  },
  {
    value: "LOGRADO",
    label: "Logrado",
    chip: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300 ring-emerald-500/25",
    hex: "#10b981",
  },
  {
    value: "EN_RIESGO",
    label: "En riesgo",
    chip: "bg-rose-500/12 text-rose-600 dark:text-rose-300 ring-rose-500/25",
    hex: "#f43f5e",
  },
  {
    value: "PAUSADO",
    label: "Pausado",
    chip: "bg-zinc-500/12 text-zinc-600 dark:text-zinc-300 ring-zinc-500/25",
    hex: "#71717a",
  },
];
export const OBJECTIVE_STATUS_MAP = byValue(OBJECTIVE_STATUSES);

export const OBJECTIVE_PERIODS: Option[] = [
  { value: "SEMANAL", label: "Semanal", chip: "", hex: "#64748b" },
  { value: "MENSUAL", label: "Mensual", chip: "", hex: "#64748b" },
  { value: "TRIMESTRAL", label: "Trimestral", chip: "", hex: "#64748b" },
  { value: "ANUAL", label: "Anual", chip: "", hex: "#64748b" },
];

/* ---------------------------------------------------------- PRODUCTOS -- */

/** Qué vende la marca con cada ficha del catálogo. Decide qué cierres y ángulos encajan. */
export type ProductKind = "PRODUCTO" | "SERVICIO" | "RESTAURANTE";

export const PRODUCT_KINDS: Option[] = [
  {
    value: "PRODUCTO",
    label: "Producto",
    chip: "bg-sky-500/12 text-sky-600 dark:text-sky-300 ring-sky-500/25",
    hex: "#0ea5e9",
    description: "Algo físico que se envía o entrega.",
  },
  {
    value: "SERVICIO",
    label: "Servicio",
    chip: "bg-violet-500/12 text-violet-600 dark:text-violet-300 ring-violet-500/25",
    hex: "#8b5cf6",
    description: "Se vende tiempo, atención o un resultado.",
  },
  {
    value: "RESTAURANTE",
    label: "Restaurante",
    chip: "bg-orange-500/12 text-orange-600 dark:text-orange-300 ring-orange-500/25",
    hex: "#f97316",
    description: "Platos, menú o experiencia en local o delivery.",
  },
];
export const PRODUCT_KIND_MAP = byValue(PRODUCT_KINDS);

export function isProductKind(v: unknown): v is ProductKind {
  return v === "PRODUCTO" || v === "SERVICIO" || v === "RESTAURANTE";
}

/* ------------------------------------------------------------------- IA -- */

export const AI_PROVIDERS: Option[] = [
  {
    value: "anthropic",
    label: "Claude (Anthropic)",
    chip: "bg-orange-500/12 text-orange-600 dark:text-orange-300 ring-orange-500/25",
    hex: "#d97757",
  },
  {
    value: "google",
    label: "Gemini (Google)",
    chip: "bg-blue-500/12 text-blue-600 dark:text-blue-300 ring-blue-500/25",
    hex: "#4285f4",
  },
];
export const AI_PROVIDER_MAP = byValue(AI_PROVIDERS);

/**
 * Catálogo de modelos admitidos por el generador y sus trabajos durables.
 */
export const AI_MODELS: Record<string, { value: string; label: string }[]> = {
  anthropic: [
    { value: "claude-opus-5", label: "Claude Opus 5 - el más capaz" },
    { value: "claude-sonnet-5", label: "Claude Sonnet 5 - equilibrado" },
    { value: "claude-haiku-4-5", label: "Claude Haiku 4.5 - rápido y barato" },
  ],
  google: [
    { value: "gemini-3.8-flash", label: "Gemini 3.8 Flash - rápido, con nivel gratuito" },
    { value: "gemini-3.7-flash", label: "Gemini 3.7 Flash" },
    { value: "gemini-3.6-flash", label: "Gemini 3.6 Flash" },
  ],
};

/**
 * Predeterminados del catálogo. Los valores heredados de Gemini (2.5 Pro y
 * 2.5 Flash) que sigan guardados en estructuras, ajustes o trabajos se
 * resuelven a 3.8 en `normalizeAiModel` (src/lib/ai-models.ts).
 */
export const DEFAULT_MODEL: Record<string, string> = {
  anthropic: "claude-opus-5",
  google: "gemini-3.8-flash",
};

/* ---------------------------------------------------------- AUDITORIA -- */

export const AUDIT_ACTIONS: Option[] = [
  {
    value: "CREAR",
    label: "Creó",
    chip: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300 ring-emerald-500/25",
    hex: "#10b981",
  },
  {
    value: "EDITAR",
    label: "Editó",
    chip: "bg-sky-500/12 text-sky-600 dark:text-sky-300 ring-sky-500/25",
    hex: "#0ea5e9",
  },
  {
    value: "ELIMINAR",
    label: "Eliminó",
    chip: "bg-rose-500/12 text-rose-600 dark:text-rose-300 ring-rose-500/25",
    hex: "#f43f5e",
  },
  {
    value: "COMPLETAR",
    label: "Completó",
    chip: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300 ring-emerald-500/25",
    hex: "#059669",
  },
  {
    value: "REABRIR",
    label: "Reabrió",
    chip: "bg-amber-500/12 text-amber-600 dark:text-amber-300 ring-amber-500/25",
    hex: "#f59e0b",
  },
  {
    value: "ASIGNAR",
    label: "Asignó",
    chip: "bg-violet-500/12 text-violet-600 dark:text-violet-300 ring-violet-500/25",
    hex: "#8b5cf6",
  },
  {
    value: "DESASIGNAR",
    label: "Quitó",
    chip: "bg-zinc-500/12 text-zinc-600 dark:text-zinc-300 ring-zinc-500/25",
    hex: "#71717a",
  },
  {
    value: "GENERAR",
    label: "Generó con IA",
    chip: "bg-fuchsia-500/12 text-fuchsia-600 dark:text-fuchsia-300 ring-fuchsia-500/25",
    hex: "#d946ef",
  },
  {
    value: "SUBIR",
    label: "Subió archivo",
    chip: "bg-indigo-500/12 text-indigo-600 dark:text-indigo-300 ring-indigo-500/25",
    hex: "#6366f1",
  },
  {
    value: "LOGIN",
    label: "Entró",
    chip: "bg-slate-500/12 text-slate-600 dark:text-slate-300 ring-slate-500/25",
    hex: "#64748b",
  },
  {
    value: "LOGOUT",
    label: "Salió",
    chip: "bg-slate-500/12 text-slate-600 dark:text-slate-300 ring-slate-500/25",
    hex: "#64748b",
  },
];
export const AUDIT_ACTION_MAP = byValue(AUDIT_ACTIONS);

export const AUDIT_ENTITIES = [
  "TaskColumn",
  "Brand",
  "BrandObjective",
  "BrandProduct",
  "BrandCombo",
  "CalendarEvent",
  "ContentItem",
  "ChecklistItem",
  "Assignment",
  "Script",
  "ScriptScene",
  "Structure",
  "Archetype",
  "ArchetypeFit",
  "Metric",
  "Asset",
  "User",
  "Comment",
  "AppSetting",
  "Auth",
  "Task",
  "BrandTeamMember",
  "ProductionStep",
];

export const ENTITY_LABELS: Record<string, string> = {
  TaskColumn: "Columna de tareas",
  Brand: "Marca",
  BrandObjective: "Objetivo",
  BrandProduct: "Producto",
  BrandCombo: "Combo",
  CalendarEvent: "Agenda",
  ContentItem: "Video",
  ChecklistItem: "Check",
  Assignment: "Asignación",
  Script: "Guion",
  ScriptScene: "Escena",
  Structure: "Estructura",
  Archetype: "Arquetipo",
  ArchetypeFit: "Compatibilidad",
  Metric: "Métrica",
  Asset: "Archivo",
  User: "Usuario",
  Comment: "Comentario",
  AppSetting: "Ajuste",
  Auth: "Sesión",
  Task: "Tarea",
  BrandTeamMember: "Equipo de marca",
  ProductionStep: "Paso de producción",
};

/* ------------------------------------------------------------- PALETA -- */

/** Colores sugeridos para marcas y usuarios. */
export const PALETTE = [
  "#ec4899",
  "#f43f5e",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#10b981",
  "#14b8a6",
  "#06b6d4",
  "#0ea5e9",
  "#6366f1",
  "#8b5cf6",
  "#d946ef",
  "#64748b",
];

export const FIT_SCORES: { value: number; label: string; hex: string }[] = [
  { value: 0, label: "No encaja", hex: "#f43f5e" },
  { value: 1, label: "Flojo", hex: "#f59e0b" },
  { value: 2, label: "Sirve", hex: "#0ea5e9" },
  { value: 3, label: "Encaja perfecto", hex: "#10b981" },
];
