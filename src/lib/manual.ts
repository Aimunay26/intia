/**
 * Manual de procedimientos: acceso tipado al contenido versionado en src/content/manual.
 *
 * - El índice (src/content/manual/index.ts) es liviano: tarjetas, orden y conteos.
 * - Cada rol vive en su propio JSON y se carga con import() dinámico, así una página
 *   solo arrastra el rol que muestra. Nunca importar estos JSON desde un componente
 *   cliente: el servidor entrega por props solo el módulo o la lección visibles.
 * - Kill-switch: MANUAL_PROCEDIMIENTOS_ENABLED. Encendido por defecto; solo el valor
 *   "false" (sin importar mayúsculas ni espacios) oculta el menú, las tarjetas y responde 404 en /manual/*.
 */
import { MANUAL_ROLE_INDEX, type ManualLevel, type ManualRoleId, type ManualRoleSummary } from "@/content/manual/index";

export type { ManualLevel, ManualRoleId, ManualRoleSummary };
export type ManualMediaType = "ESCENA_3D" | "VIDEO_REFERENCIA" | "CHECKLIST" | "PLANTILLA" | "CASO_PRACTICO";

/**
 * Guía ilustrada paso a paso de un equipo (maquetas SVG propias en src/content/manual/guias.ts).
 * scripts/manual-content.mjs lee esta unión para validar el currículo: agregar un id aquí
 * exige su guía en DEVICE_GUIDES.
 */
export type GuideId =
  | "iphone-log"
  | "iphone-formato-4k"
  | "iphone-foco-exposicion"
  | "samsung-log"
  | "samsung-formato-4k"
  | "samsung-foco-exposicion"
  | "zve10-formato"
  | "zve10-log"
  | "zve10-enfoque"
  | "zve10-exposicion"
  | "zve10-audio-y-energia";

/** Escena 3D armada de antemano (cámara, sujeto y luces) que el visor usa en vez de adivinar por el texto. */
export type ScenePreset =
  | "INFORMATIVO_PECHO"
  | "AUTORIDAD_CONTRAPICADO"
  | "VULNERABLE_PICADO"
  | "PODCAST_SEMILATERAL"
  | "SEGUIMIENTO_RITMO"
  | "TRES_PUNTOS_COLOR"
  | "LUZ_DE_MANO";

/**
 * Error que el visor 3D puede mostrar al pulsar «Incorrecto» para compararlo con lo correcto.
 * Un paso de la escena también puede mostrarlo mientras dura: el texto del paso empieza con
 * el error entre corchetes («[TRIPODE_MUY_BAJO] 2-4 s: …»).
 */
export type SceneMistake =
  | "CONTRALUZ"
  | "CODOS_ABIERTOS"
  | "PIES_JUNTOS"
  | "OJOS_FUERA_DEL_TERCIO"
  | "TRIPODE_MUY_BAJO"
  | "TRIPODE_MUY_ALTO"
  | "MOVIMIENTO_BRUSCO"
  | "SIN_LUZ_TRASERA"
  | "CABEZA_CORTADA"
  | "CONTRAPICADO_EXAGERADO"
  | "PICADO_FUERTE"
  | "SIN_LUZ_DE_MANO"
  | "LUZ_PEGADA_AL_LENTE"
  | "TRASERA_MISMO_COLOR"
  | "SIN_ESPACIO_DE_MIRADA";

export type ManualScene3d = {
  environment: string;
  subjects: string;
  camera: string;
  lighting: string;
  beats: string[];
  preset?: ScenePreset;
  errores?: SceneMistake[];
};
export type ManualLesson = {
  id: string;
  title: string;
  objective: string;
  procedure: string[];
  commonMistakes: string[];
  checklist: string[];
  practice: string;
  passCriteria: string;
  mediaType: ManualMediaType;
  /** Guía ilustrada del equipo (iPhone, Samsung o Sony ZV-E10) que acompaña a la lección. */
  guia?: GuideId;
  scene3d?: ManualScene3d;
};
export type ManualVideo = { url: string; title: string; channel: string; language: string; why: string };
export type ManualModule = { id: string; slug: string; title: string; summary: string; videos: ManualVideo[]; lessons: ManualLesson[] };
export type ManualLevelData = { level: ManualLevel; goal: string; modules: ManualModule[] };
export type ManualRole = {
  id: ManualRoleId;
  slug: string;
  name: string;
  fullName: string;
  mission: string;
  responsibilities: string[];
  sop: string[];
  receivesFrom: string[];
  deliversTo: string[];
  kpis: string[];
  tools: string[];
  levels: ManualLevelData[];
};

/* ------------------------------------------------------------ INTERRUPTOR -- */

/** Encendido salvo que la variable valga exactamente "false". */
export function manualEnabled(env: Record<string, string | undefined> = process.env) {
  return env.MANUAL_PROCEDIMIENTOS_ENABLED?.trim().toLowerCase() !== "false";
}

/* ----------------------------------------------------------------- NIVELES -- */

export const MANUAL_LEVELS: readonly { value: ManualLevel; param: string; label: string }[] = [
  { value: "PRINCIPIANTE", param: "principiante", label: "Principiante" },
  { value: "INTERMEDIO", param: "intermedio", label: "Intermedio" },
  { value: "AVANZADO", param: "avanzado", label: "Avanzado" },
];

export function levelFromParam(value: unknown): (typeof MANUAL_LEVELS)[number] {
  return MANUAL_LEVELS.find(level => level.param === value) ?? MANUAL_LEVELS[0];
}

export const MEDIA_LABELS: Record<ManualMediaType, string> = {
  ESCENA_3D: "Escena 3D",
  VIDEO_REFERENCIA: "Video de referencia",
  CHECKLIST: "Checklist",
  PLANTILLA: "Plantilla",
  CASO_PRACTICO: "Caso práctico",
};

/* ------------------------------------------------------------ ROLES Y ORDEN -- */

/** Orden del flujo del video: Guionista → Filmmaker → … → Dueño de negocio. */
export const MANUAL_FLOW: readonly ManualRoleId[] = MANUAL_ROLE_INDEX.map(role => role.id);

export function manualRoles(): readonly ManualRoleSummary[] {
  return MANUAL_ROLE_INDEX;
}

export function manualRoleSummary(slug: string): ManualRoleSummary | undefined {
  return MANUAL_ROLE_INDEX.find(role => role.slug === slug);
}

/** Perfil de trabajo de ALSOS → manual. ATC y jefe de editores todavía no tienen perfil propio. */
const PROFILE_TO_MANUAL: Record<string, readonly ManualRoleId[]> = {
  WRITER: ["GUIONISTA"],
  CAMERA: ["FILMMAKER"],
  TALENT: ["ACTOR"],
  EDITOR: ["EDITOR", "JEFE_EDITORES"],
  PUBLISHER: ["COMMUNITY"],
};

export function manualRolesForProfile(profile: string): readonly ManualRoleId[] {
  return Object.hasOwn(PROFILE_TO_MANUAL, profile) ? PROFILE_TO_MANUAL[profile] : [];
}

/** Manuales que corresponden a quien mira, en orden de flujo. La posición de Dueño suma su manual. */
export function viewerManualRoles(user: { role: string; profiles?: readonly string[] }): ManualRoleId[] {
  const ids = new Set<ManualRoleId>();
  if (user.role === "OWNER") ids.add("DUENO");
  for (const profile of user.profiles ?? []) for (const id of manualRolesForProfile(profile)) ids.add(id);
  return MANUAL_FLOW.filter(id => ids.has(id));
}

/** Los manuales propios primero («Tu rol»); dentro de cada grupo se respeta el orden del flujo. */
export function orderManualRoles<T extends { id: ManualRoleId }>(roles: readonly T[], mine: readonly ManualRoleId[]): (T & { mine: boolean })[] {
  const position = (id: ManualRoleId) => {
    const index = MANUAL_FLOW.indexOf(id);
    return index === -1 ? MANUAL_FLOW.length : index;
  };
  return roles
    .map(role => ({ ...role, mine: mine.includes(role.id) }))
    .sort((a, b) => Number(b.mine) - Number(a.mine) || position(a.id) - position(b.id));
}

/* ----------------------------------------------------------------- YOUTUBE -- */

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"]);

/** ID de 11 caracteres desde watch?v=, youtu.be/, shorts/, embed/ o live/. Cualquier otra cosa → null. */
export function youtubeId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  const host = parsed.hostname.toLowerCase();
  let candidate: string | null = null;
  if (host === "youtu.be" || host === "www.youtu.be") candidate = parsed.pathname.split("/")[1] ?? null;
  else if (YOUTUBE_HOSTS.has(host)) {
    if (parsed.pathname === "/watch") candidate = parsed.searchParams.get("v");
    else candidate = /^\/(?:shorts|embed|live|v)\/([^/]+)/.exec(parsed.pathname)?.[1] ?? null;
  }
  return candidate && YOUTUBE_ID.test(candidate) ? candidate : null;
}

export function youtubeThumbnail(id: string) {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

export function youtubeEmbed(id: string) {
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`;
}

/* ----------------------------------------------------- CONTENIDO (SERVIDOR) -- */

// Un import() por archivo: el bundler separa cada rol en su propio chunk de servidor.
const ROLE_LOADERS: Record<string, () => Promise<{ default: unknown }>> = {
  guionista: () => import("@/content/manual/roles/guionista.json"),
  filmmaker: () => import("@/content/manual/roles/filmmaker.json"),
  actor: () => import("@/content/manual/roles/actor.json"),
  editor: () => import("@/content/manual/roles/editor.json"),
  "jefe-de-editores": () => import("@/content/manual/roles/jefe-de-editores.json"),
  "community-manager": () => import("@/content/manual/roles/community-manager.json"),
  atc: () => import("@/content/manual/roles/atc.json"),
  dueno: () => import("@/content/manual/roles/dueno.json"),
};

export async function getManualRole(slug: string): Promise<ManualRole | null> {
  if (!Object.hasOwn(ROLE_LOADERS, slug)) return null;
  const loaded = await ROLE_LOADERS[slug]();
  return loaded.default as ManualRole;
}

export type ManualModuleContext = {
  role: ManualRole;
  level: ManualLevelData;
  module: ManualModule;
  position: number;
  previous: ManualModule | null;
  next: ManualModule | null;
};

export async function getManualModule(roleSlug: string, moduleSlug: string): Promise<ManualModuleContext | null> {
  const role = await getManualRole(roleSlug);
  if (!role) return null;
  for (const level of role.levels) {
    const position = level.modules.findIndex(module => module.slug === moduleSlug);
    if (position === -1) continue;
    return {
      role,
      level,
      module: level.modules[position],
      position,
      previous: level.modules[position - 1] ?? null,
      next: level.modules[position + 1] ?? null,
    };
  }
  return null;
}

/** «Encabezado: resto» → partes separadas cuando el encabezado es corto; si no, todo es texto. */
export function splitHead(text: string, max = 64): { head: string | null; body: string } {
  const index = text.indexOf(":");
  if (index > 0 && index <= max) return { head: text.slice(0, index).trim(), body: text.slice(index + 1).trim() };
  return { head: null, body: text };
}
