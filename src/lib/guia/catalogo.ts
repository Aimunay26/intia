/**
 * Catálogo cerrado y tipado de anclas para la guía interactiva.
 *
 * Cada elemento interactivo al que la guía apunta tiene una clave única aquí.
 * Si un ancla se renombra o elimina en el código, TypeScript fallará en tiempo
 * de compilación, impidiendo enlaces rotos silenciosos.
 */

export const GUIA_TARGETS = {
  // --- NAVEGACIÓN (Sidebar / Shell) ---
  NAV_MARCAS: "nav-marcas",
  NAV_CONTENIDO: "nav-contenido",
  NAV_GENERADOR: "nav-generador",
  NAV_GUIONES: "nav-guiones",
  NAV_ESTRUCTURAS: "nav-estructuras",
  NAV_ARQUETIPOS: "nav-arquetipos",
  NAV_EQUIPO: "nav-equipo",
  NAV_AJUSTES: "nav-ajustes",
  NAV_TUTORIAL: "nav-tutorial",

  // --- MÓDULO 1: Primera Marca (/marcas) ---
  BTN_NUEVA_MARCA_HEADER: "btn-nueva-marca-header",
  BTN_NUEVA_MARCA_EMPTY: "btn-nueva-marca-empty",
  INPUT_MARCA_NOMBRE: "input-marca-nombre",
  INPUT_MARCA_LEMA: "input-marca-lema",
  BTN_SUBMIT_MARCA: "btn-submit-marca",
  MARCA_PRIMERA_CARD: "marca-primera-card",

  // --- MÓDULO 2: ADN y Branding (/marcas/[id]) ---
  MARCA_TAB_IDENTIDAD: "marca-tab-identidad",
  INPUT_MARCA_TONO: "input-marca-tono",
  INPUT_MARCA_PUBLICO: "input-marca-publico",
  INPUT_MARCA_PROHIBICIONES: "input-marca-prohibiciones",
  BTN_GUARDAR_IDENTIDAD: "btn-guardar-identidad",

  // --- MÓDULO 3: Personas frente a cámara (/arquetipos) ---
  BTN_NUEVA_PERSONA: "btn-nueva-persona",
  INPUT_PERSONA_NOMBRE: "input-persona-nombre",
  BTN_SUBMIT_PERSONA: "btn-submit-persona",
  PERSONA_PRIMERA_CARD: "persona-primera-card",

  // --- MÓDULO 4: Primer Video (/contenido) ---
  BTN_NUEVO_VIDEO: "btn-nuevo-video",
  SELECT_VIDEO_MARCA: "select-video-marca",
  INPUT_VIDEO_TITULO: "input-video-titulo",
  INPUT_VIDEO_HOOK: "input-video-hook",
  BTN_SUBMIT_VIDEO: "btn-submit-video",

  // --- MÓDULO 5: API Key IA (/ajustes) ---
  INPUT_API_KEY_ANTHROPIC: "input-api-key-anthropic",
  INPUT_API_KEY_GOOGLE: "input-api-key-google",
  BTN_PROBAR_CLAVE_AI: "btn-probar-clave-ai",
  BTN_GUARDAR_AJUSTES: "btn-guardar-ajustes",

  // --- MÓDULO 6: Generador de Guiones (/generador) ---
  GENERADOR_STEPPER_BAR: "generador-stepper-bar",
  GENERADOR_BTN_SIGUIENTE: "generador-btn-siguiente",
  SELECT_GENERADOR_ESTRUCTURA: "select-generador-estructura",
  SELECT_GENERADOR_MARCA: "select-generador-marca",
  SELECT_GENERADOR_ARQUETIPO: "select-generador-arquetipo",
  INPUT_GENERADOR_PRODUCTO: "input-generador-producto",
  INPUT_GENERADOR_PRODUCTO_DESC: "input-generador-producto-desc",
  BOTONES_GENERADOR_ANGULOS: "botones-generador-angulos",
  INPUT_GENERADOR_PETICION: "input-generador-peticion",
  BOTONES_GENERADOR_CTA: "botones-generador-cta",
  BTN_GENERAR_GUION_SUBMIT: "btn-generar-guion-submit",

  // --- MÓDULO 7: Asignar Guion a Video (/guiones / /guiones/[id]) ---
  GUION_PRIMERA_FILA: "guion-primera-fila",
  SELECT_ASIGNAR_VIDEO: "select-asignar-video",
  BTN_ASIGNAR_GUION: "btn-asignar-guion",
  VIDEO_VINCULADO_CARD: "video-vinculado-card",

  // --- MÓDULO 8: Equipo (/equipo) ---
  BTN_INVITAR_EQUIPO: "btn-invitar-equipo",
  INPUT_EQUIPO_EMAIL: "input-equipo-email",

  // --- Disparadores globales ---
  BTN_INICIAR_GUIA_VACIAR: "btn-iniciar-guia-vaciar",
  BTN_INICIAR_GUIA_TUTORIAL: "btn-iniciar-guia-tutorial",
  BANNER_GUIA_EMPTY: "banner-guia-empty",
} as const;

export type GuiaTargetKey = (typeof GUIA_TARGETS)[keyof typeof GUIA_TARGETS];

/**
 * Helper con tipado estricto para inyectar `data-guia` en elementos JSX.
 */
export function guiaAnchor(key: GuiaTargetKey): { "data-guia": string } {
  return { "data-guia": key };
}
