/**
 * Estado de presentación del visor de guiones. Funciones puras: no leen el DOM
 * ni la red, así se prueban sin navegador y se comparten entre servidor y cliente.
 */

/** Parámetro de la URL que conserva la escena seleccionada al recargar. */
export const SCENE_PARAM = "escena";

/**
 * Pantallas donde el visor ocupa exactamente el alto disponible (modo ajuste).
 * Mantener sincronizado con las reglas `@media screen and (min-width: 1280px)
 * and (min-height: 600px)` de script-workspace.module.css.
 */
export const FIT_MEDIA = "screen and (min-width: 1280px) and (min-height: 600px)";

/** Kill-switch GUIONES_AJUSTE_PANTALLA: encendido por defecto; solo "false" lo apaga. */
export function fitModeEnabled(value: string | null | undefined): boolean {
  return (value ?? "").trim().toLowerCase() !== "false";
}

const SCENE_ID = /^[A-Za-z0-9_-]{1,64}$/;

type ParamSource = string | { get(name: string): string | null } | null | undefined;

/** Lee `?escena=<id>`. Devuelve null si falta o no tiene forma de identificador. */
export function readSceneParam(source: ParamSource): string | null {
  if (!source) return null;
  const params = typeof source === "string" ? new URLSearchParams(source.startsWith("?") ? source.slice(1) : source) : source;
  const value = params.get(SCENE_PARAM)?.trim() ?? "";
  return SCENE_ID.test(value) ? value : null;
}

/**
 * Devuelve la ruta relativa (ruta + búsqueda + ancla) con `?escena` actualizado.
 * Conserva el resto de parámetros; con `sceneId` nulo lo retira.
 */
export function withSceneParam(href: string, sceneId: string | null): string {
  const url = new URL(href, "http://visor.local");
  if (sceneId && SCENE_ID.test(sceneId)) url.searchParams.set(SCENE_PARAM, sceneId);
  else url.searchParams.delete(SCENE_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Índice visible. Primero por ID (la selección sigue a la escena al reordenar);
 * si ya no existe, la posición anterior acotada a las escenas que quedan.
 */
export function resolveSceneIndex(ids: readonly string[], id: string | null | undefined, fallback: number): number {
  const found = id ? ids.indexOf(id) : -1;
  if (found >= 0) return found;
  const safe = Number.isFinite(fallback) ? Math.trunc(fallback) : 0;
  return Math.min(Math.max(0, safe), Math.max(0, ids.length - 1));
}

type KeyInfo = { key: string; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; defaultPrevented?: boolean };
type TargetInfo = { tagName?: string; isContentEditable?: boolean; inWidget?: boolean } | null | undefined;

const FIELDS = new Set(["INPUT", "TEXTAREA", "SELECT", "OPTION"]);

/**
 * Atajo de teclado ←/→ para cambiar de escena. Devuelve -1, 1 o 0 (no aplica):
 * nunca dentro de campos, menús, pestañas o diálogos, ni con modificadores.
 */
export function sceneKeyStep(event: KeyInfo, target: TargetInfo): -1 | 0 | 1 {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return 0;
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return 0;
  if (target?.isContentEditable || target?.inWidget) return 0;
  if (target?.tagName && FIELDS.has(target.tagName.toUpperCase())) return 0;
  return event.key === "ArrowLeft" ? -1 : 1;
}
