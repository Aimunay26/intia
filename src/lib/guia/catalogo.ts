/**
 * Catálogo cerrado y tipado de anclas para la guía interactiva.
 *
 * Cada elemento al que la guía apunta tiene una clave única aquí. Lo que
 * protege TypeScript es el NOMBRE: si alguien renombra o borra una clave, deja
 * de compilar. Lo que TypeScript no puede saber es si el elemento está en el
 * DOM en ese momento: de eso se ocupa la guía en tiempo de ejecución, y nunca
 * dibuja una flecha hacia algo que no encontró.
 */

export const GUIA_TARGETS = {
  // --- NAVEGACIÓN (barra lateral y cajón móvil) ---
  NAV_MARCAS: "nav-marcas",
  NAV_CONTENIDO: "nav-contenido",
  NAV_GENERADOR: "nav-generador",
  NAV_GUIONES: "nav-guiones",
  NAV_ESTRUCTURAS: "nav-estructuras",
  NAV_ARQUETIPOS: "nav-arquetipos",
  NAV_EQUIPO: "nav-equipo",
  NAV_AJUSTES: "nav-ajustes",
  NAV_TUTORIAL: "nav-tutorial",

  // --- MÓDULO 1: Primera marca y su branding (/marcas y /marcas/[id]) ---
  BTN_NUEVA_MARCA_HEADER: "btn-nueva-marca-header",
  BTN_NUEVA_MARCA_EMPTY: "btn-nueva-marca-empty",
  INPUT_MARCA_NOMBRE: "input-marca-nombre",
  INPUT_MARCA_LEMA: "input-marca-lema",
  BTN_SUBMIT_MARCA: "btn-submit-marca",
  MARCA_PRIMERA_CARD: "marca-primera-card",
  BTN_CARGAR_BRANDING_PDF: "btn-cargar-branding-pdf",
  MARCA_TAB_IDENTIDAD: "marca-tab-identidad",
  INPUT_MARCA_TONO: "input-marca-tono",
  INPUT_MARCA_PUBLICO: "input-marca-publico",
  INPUT_MARCA_PROHIBICIONES: "input-marca-prohibiciones",
  BTN_GUARDAR_IDENTIDAD: "btn-guardar-identidad",

  // --- MÓDULO 2: Personas frente a cámara (/arquetipos) ---
  BTN_NUEVA_PERSONA: "btn-nueva-persona",
  INPUT_PERSONA_NOMBRE: "input-persona-nombre",
  BTN_SUBMIT_PERSONA: "btn-submit-persona",
  PERSONA_PRIMERA_CARD: "persona-primera-card",

  // --- MÓDULO 3: Primer video (/contenido) ---
  BTN_NUEVO_VIDEO: "btn-nuevo-video",
  SELECT_VIDEO_MARCA: "select-video-marca",
  INPUT_VIDEO_TITULO: "input-video-titulo",
  INPUT_VIDEO_HOOK: "input-video-hook",
  BTN_SUBMIT_VIDEO: "btn-submit-video",

  // --- MÓDULO 4: Clave de IA (/ajustes) ---
  INPUT_API_KEY_ANTHROPIC: "input-api-key-anthropic",
  INPUT_API_KEY_GOOGLE: "input-api-key-google",
  BTN_PROBAR_CLAVE_AI: "btn-probar-clave-ai",
  BTN_GUARDAR_AJUSTES: "btn-guardar-ajustes",

  // --- MÓDULO 5: Generador de guiones (/generador) ---
  GENERADOR_STEPPER_BAR: "generador-stepper-bar",
  // Un ancla por botón «Continuar». Compartir una sola clave hacía que el aro
  // saltara al botón de la etapa siguiente en cuanto se pulsaba el actual.
  // Prefijo btn- para que la guía lo trate como acción sin reglas aparte.
  BTN_GENERADOR_CONTINUAR_1: "btn-generador-continuar-1",
  BTN_GENERADOR_CONTINUAR_2: "btn-generador-continuar-2",
  BTN_GENERADOR_CONTINUAR_3: "btn-generador-continuar-3",
  BTN_GENERADOR_CONTINUAR_4: "btn-generador-continuar-4",
  SELECT_GENERADOR_ESTRUCTURA: "select-generador-estructura",
  // Selector «¿Para qué video es?» de la etapa 2. Todavía sin paso en la guía.
  SELECT_GENERADOR_VIDEO: "select-generador-video",
  SELECT_GENERADOR_MARCA: "select-generador-marca",
  SELECT_GENERADOR_ARQUETIPO: "select-generador-arquetipo",
  INPUT_GENERADOR_PRODUCTO: "input-generador-producto",
  INPUT_GENERADOR_PRODUCTO_DESC: "input-generador-producto-desc",
  BOTONES_GENERADOR_ANGULOS: "botones-generador-angulos",
  INPUT_GENERADOR_PETICION: "input-generador-peticion",
  BOTONES_GENERADOR_CTA: "botones-generador-cta",
  BTN_GENERAR_GUION_SUBMIT: "btn-generar-guion-submit",

  // --- MÓDULO 6: Unir guion y video (/guiones y /guiones/[id]) ---
  GUION_PRIMERA_FILA: "guion-primera-fila",
  SELECT_ASIGNAR_VIDEO: "select-asignar-video",
  BTN_ASIGNAR_GUION: "btn-asignar-guion",
  VIDEO_VINCULADO_CARD: "video-vinculado-card",

  // --- MÓDULO 7: Equipo (/equipo) ---
  BTN_INVITAR_EQUIPO: "btn-invitar-equipo",
} as const;

export type GuiaTargetKey = (typeof GUIA_TARGETS)[keyof typeof GUIA_TARGETS];

/** Inyecta `data-guia` en un elemento JSX con tipado estricto. */
export function guiaAnchor(key: GuiaTargetKey): { "data-guia": string } {
  return { "data-guia": key };
}

/**
 * Selector CSS de un ancla. Vive aquí, y no repetido en el contexto y en el
 * overlay, para que los dos busquen exactamente lo mismo.
 *
 * «Nueva marca» tiene dos botones —cabecera y estado vacío— y cualquiera de
 * los dos satisface el paso.
 */
export function selectorGuia(target: GuiaTargetKey): string {
  if (target === GUIA_TARGETS.BTN_NUEVA_MARCA_HEADER) {
    return `[data-guia="${GUIA_TARGETS.BTN_NUEVA_MARCA_HEADER}"], [data-guia="${GUIA_TARGETS.BTN_NUEVA_MARCA_EMPTY}"]`;
  }
  return `[data-guia="${target}"]`;
}
