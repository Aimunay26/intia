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
];
export const ASSIGNMENT_ROLE_MAP = byValue(ASSIGNMENT_ROLES);

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
];

export const ENTITY_LABELS: Record<string, string> = {
  TaskColumn: "Columna de tareas",
  Brand: "Marca",
  BrandObjective: "Objetivo",
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
