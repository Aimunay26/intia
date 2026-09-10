import { GUIA_TARGETS, type GuiaTargetKey } from "./catalogo";

/**
 * Los módulos de la guía interactiva: solo datos.
 *
 * Un paso = un elemento al que apuntar. Cuando una instrucción nombraba dos
 * campos («escribe el título y el gancho») el aro solo podía rodear uno y el
 * otro quedaba sin señalar; por eso cada campo tiene ahora su paso.
 */

export type GuiaPaso = {
  id: string;
  titulo: string;
  instruccion: string;
  detalle?: string;
  target: GuiaTargetKey;
  /**
   * SECCIÓN donde vive el paso, no ruta exacta. Cuenta cualquier ruta hija:
   * /marcas/abc pertenece a /marcas. Comparar por igualdad devolvía al usuario
   * a la lista justo después de crear la marca, porque el servidor redirige a
   * la ficha.
   */
  url: string;
  fallbackTexto: string;
  posicionPreferida?: "top" | "bottom" | "left" | "right" | "auto";
  /**
   * Hay que interactuar con el objetivo antes de avanzar (un aviso; el segundo
   * «Siguiente» pasa igual). Si no se indica, se infiere true solo cuando el
   * objetivo empieza por "btn-".
   */
  requiereAccion?: boolean;
  /** Al hacer clic en el objetivo la guía pasa sola al paso siguiente (botones que abren una ventana). */
  avanzarAlInteractuar?: boolean;
  /** Ancla del botón que abre la ventana donde vive `target`, para poder reabrirla si está cerrada. */
  abreCon?: GuiaTargetKey;
  /** Paso que solo sirve para llegar a la ficha: si ya estamos en una ruta hija de `url`, se salta solo. */
  puente?: boolean;
};

export type GuiaModulo = {
  id: string;
  numero: number;
  titulo: string;
  subtitulo: string;
  icono: string;
  duracionMin: number;
  /** Nivel mínimo (ROLE_LEVEL) para poder completar el módulo. Sin valor: todos. */
  minLevel?: number;
  pasos: GuiaPaso[];
};

/** ¿La ruta actual pertenece a la sección del paso? La ficha /marcas/abc pertenece a /marcas. */
export function pathnameCubrePaso(
  pathname: string | null | undefined,
  paso: Pick<GuiaPaso, "url"> | undefined
): boolean {
  if (!pathname || !paso?.url) return false;
  return pathname === paso.url || pathname.startsWith(paso.url + "/");
}

export const MODULOS_GUIA: GuiaModulo[] = [
  {
    id: "modulo-1",
    numero: 1,
    titulo: "Tu marca y su ADN de branding",
    subtitulo: "Crea tu marca, carga tu branding en PDF y fija sus reglas permanentes",
    icono: "Tags",
    duracionMin: 5,
    pasos: [
      {
        id: "m1-nav",
        titulo: "Entra en la sección de Marcas",
        instruccion: "Haz clic en «Marcas» en el menú lateral para ver tu catálogo.",
        detalle: "Todo en Marketing OS pertenece a una marca. Aquí definimos identidades y reglas de comunicación.",
        target: GUIA_TARGETS.NAV_MARCAS,
        url: "/marcas",
        fallbackTexto: "Enlace «Marcas» en el menú de navegación lateral.",
        posicionPreferida: "right",
      },
      {
        id: "m1-boton-crear",
        titulo: "Inicia la creación",
        instruccion: "Haz clic en «Nueva marca» para abrir el formulario.",
        detalle: "Solo necesitas el nombre y el lema para empezar. La personalidad completa la afinamos después.",
        target: GUIA_TARGETS.BTN_NUEVA_MARCA_HEADER,
        url: "/marcas",
        fallbackTexto: "El botón «Nueva marca» en la cabecera, o «Crear tu primera marca» en el centro si la lista está vacía.",
        posicionPreferida: "bottom",
        avanzarAlInteractuar: true,
      },
      {
        id: "m1-nombre",
        titulo: "Escribe el nombre comercial",
        instruccion: "Indica cómo se llama tu proyecto o negocio.",
        detalle: "Ejemplo: «Con Amor», «FitLife» o «Café Andino».",
        target: GUIA_TARGETS.INPUT_MARCA_NOMBRE,
        url: "/marcas",
        fallbackTexto: "Campo «Nombre» en la ventana de nueva marca.",
        posicionPreferida: "bottom",
        abreCon: GUIA_TARGETS.BTN_NUEVA_MARCA_HEADER,
      },
      {
        id: "m1-lema",
        titulo: "Escribe el lema",
        instruccion: "Escribe en una línea la promesa o lema de tu marca.",
        detalle: "Es lo que la marca le promete a quien la elige. Corto y en tus palabras.",
        target: GUIA_TARGETS.INPUT_MARCA_LEMA,
        url: "/marcas",
        fallbackTexto: "Campo «Lema» en la ventana de nueva marca.",
        posicionPreferida: "bottom",
        abreCon: GUIA_TARGETS.BTN_NUEVA_MARCA_HEADER,
      },
      {
        id: "m1-submit",
        titulo: "Crea la marca",
        instruccion: "Presiona «Crear marca».",
        detalle: "Al crearla entrarás directamente a su ficha de identidad para consolidar su ADN.",
        target: GUIA_TARGETS.BTN_SUBMIT_MARCA,
        url: "/marcas",
        fallbackTexto: "Botón «Crear marca» al pie del formulario.",
        posicionPreferida: "top",
        abreCon: GUIA_TARGETS.BTN_NUEVA_MARCA_HEADER,
      },
      {
        id: "m1-abrir-ficha",
        titulo: "Abre la ficha de tu marca",
        instruccion: "Haz clic en la tarjeta de tu marca para entrar en su ficha de identidad.",
        detalle: "Si acabas de crearla, ya estás dentro y este paso se salta solo.",
        target: GUIA_TARGETS.MARCA_PRIMERA_CARD,
        url: "/marcas",
        fallbackTexto: "La primera tarjeta del listado de Marcas.",
        posicionPreferida: "bottom",
        requiereAccion: true,
        puente: true,
      },
      {
        id: "m1-branding-pdf",
        titulo: "Carga tu informe de branding en PDF",
        instruccion: "Carga el informe de branding (o el brief maestro, con el botón de al lado) para rellenar la ficha, o continúa para escribirla a mano.",
        detalle: "Verás lo que se leyó del PDF antes de aplicarlo: cada campo con su origen (PDF, IA o vacío). El PDF se guarda en Documentos al pulsar «Guardar cambios».",
        target: GUIA_TARGETS.BTN_CARGAR_BRANDING_PDF,
        url: "/marcas",
        fallbackTexto: "Botón «Cargar informe de branding» al principio del formulario de identidad de tu marca.",
        posicionPreferida: "bottom",
        requiereAccion: false,
      },
      {
        id: "m1-identidad",
        titulo: "Define el tono de voz",
        instruccion: "Describe cómo habla tu marca: cálida, directa, con humor, seca…",
        detalle: "La IA lee esto en cada guion para sonar auténtica y no genérica.",
        target: GUIA_TARGETS.INPUT_MARCA_TONO,
        url: "/marcas",
        fallbackTexto: "Campo «Tono de voz» en el formulario de identidad de la ficha.",
        posicionPreferida: "top",
      },
      {
        id: "m1-publico",
        titulo: "Define el público objetivo",
        instruccion: "Describe a quién se dirige la marca: edad, ciudad, qué busca.",
        detalle: "Ejemplo: «Mujeres de 25 a 40 en Lima que compran por Instagram y desconfían de las promesas milagro».",
        target: GUIA_TARGETS.INPUT_MARCA_PUBLICO,
        url: "/marcas",
        fallbackTexto: "Campo «Público» en el formulario de identidad de la ficha.",
        posicionPreferida: "top",
      },
      {
        id: "m1-guardar",
        titulo: "Guarda el ADN de tu marca",
        instruccion: "Haz clic en «Guardar cambios» para consolidar la identidad.",
        detalle: "A partir de ahora, cualquier guion de esta marca adopta estas instrucciones.",
        target: GUIA_TARGETS.BTN_GUARDAR_IDENTIDAD,
        url: "/marcas",
        fallbackTexto: "Botón «Guardar cambios» al pie del formulario de identidad.",
        posicionPreferida: "top",
      },
    ],
  },
  {
    id: "modulo-2",
    numero: 2,
    titulo: "Tu equipo frente a cámara",
    subtitulo: "Configura a las personas que salen en video y su personalidad",
    icono: "UserSquare2",
    duracionMin: 3,
    pasos: [
      {
        id: "m2-nav",
        titulo: "Ve a la sección Personas",
        instruccion: "Haz clic en «Personas» en el menú de navegación.",
        detalle: "Aquí registramos a quienes dan la cara en tus videos, con su energía y su arquetipo.",
        target: GUIA_TARGETS.NAV_ARQUETIPOS,
        url: "/arquetipos",
        fallbackTexto: "Enlace «Personas» en la barra lateral.",
        posicionPreferida: "right",
      },
      {
        id: "m2-crear",
        titulo: "Agrega a tu primer creador o actor",
        instruccion: "Haz clic en «Añadir persona» para registrar un perfil.",
        detalle: "Eliges el arquetipo al que más se parece y su marca personal queda rellena desde el primer momento.",
        target: GUIA_TARGETS.BTN_NUEVA_PERSONA,
        url: "/arquetipos",
        fallbackTexto: "Botón «Añadir persona» arriba a la derecha, o «Añadir a la primera» si la lista está vacía.",
        posicionPreferida: "bottom",
        avanzarAlInteractuar: true,
      },
      {
        id: "m2-nombre",
        titulo: "Indica su nombre",
        instruccion: "Escribe el nombre de la persona que saldrá en cámara.",
        detalle: "Cada persona tiene palabras que le salen naturales y temas que prefiere evitar. Eso se afina después.",
        target: GUIA_TARGETS.INPUT_PERSONA_NOMBRE,
        url: "/arquetipos",
        fallbackTexto: "Campo «Nombre de la persona» en la ventana.",
        posicionPreferida: "bottom",
        abreCon: GUIA_TARGETS.BTN_NUEVA_PERSONA,
      },
      {
        id: "m2-guardar",
        titulo: "Crea el perfil",
        instruccion: "Pulsa el botón de crear al pie de la ventana.",
        detalle: "Al generar guiones podrás elegir a esta persona para que el texto suene exactamente a su voz.",
        target: GUIA_TARGETS.BTN_SUBMIT_PERSONA,
        url: "/arquetipos",
        fallbackTexto: "El botón de crear al pie de la ventana.",
        posicionPreferida: "top",
        abreCon: GUIA_TARGETS.BTN_NUEVA_PERSONA,
      },
    ],
  },
  {
    id: "modulo-3",
    numero: 3,
    titulo: "La primera idea de video",
    subtitulo: "Nace la tarjeta en el calendario: título, gancho y fecha",
    icono: "Film",
    duracionMin: 3,
    pasos: [
      {
        id: "m3-nav",
        titulo: "Entra en Videos",
        instruccion: "Haz clic en «Videos» en el menú lateral.",
        detalle: "El planificador donde cada idea se sigue hasta que está grabada y publicada.",
        target: GUIA_TARGETS.NAV_CONTENIDO,
        url: "/contenido",
        fallbackTexto: "Enlace «Videos» en el menú de navegación.",
        posicionPreferida: "right",
      },
      {
        id: "m3-nuevo",
        titulo: "Crea una nueva tarjeta de video",
        instruccion: "Haz clic en «Nuevo video».",
        detalle: "Un video nace como IDEA, sin guion ni estructura todavía. Eso llega en los módulos 5 y 6.",
        target: GUIA_TARGETS.BTN_NUEVO_VIDEO,
        url: "/contenido",
        fallbackTexto: "Botón «Nuevo video» en la cabecera. Si no hay marcas, en su lugar verás «Crea una marca primero».",
        posicionPreferida: "bottom",
        avanzarAlInteractuar: true,
      },
      {
        id: "m3-marca",
        titulo: "Elige la marca",
        instruccion: "Elige la marca que creaste en el Módulo 1.",
        detalle: "El video y el guion tienen que compartir marca para poder unirlos después.",
        target: GUIA_TARGETS.SELECT_VIDEO_MARCA,
        url: "/contenido",
        fallbackTexto: "Selector «Marca» en la ventana de nuevo video.",
        posicionPreferida: "bottom",
        abreCon: GUIA_TARGETS.BTN_NUEVO_VIDEO,
      },
      {
        id: "m3-titulo",
        titulo: "Escribe el título",
        instruccion: "Escribe el título de trabajo de tu video.",
        detalle: "Ejemplo: «El error al lavar ropa delicada».",
        target: GUIA_TARGETS.INPUT_VIDEO_TITULO,
        url: "/contenido",
        fallbackTexto: "Campo «Título» en la ventana de nuevo video.",
        posicionPreferida: "top",
        abreCon: GUIA_TARGETS.BTN_NUEVO_VIDEO,
      },
      {
        id: "m3-hook",
        titulo: "Escribe el gancho",
        instruccion: "Escribe la primera frase, la que decide si se quedan o pasan de largo.",
        detalle: "Ejemplo: «Llevas años lavando esto mal y nadie te lo dijo».",
        target: GUIA_TARGETS.INPUT_VIDEO_HOOK,
        url: "/contenido",
        fallbackTexto: "Campo «Gancho» en la ventana de nuevo video.",
        posicionPreferida: "bottom",
        abreCon: GUIA_TARGETS.BTN_NUEVO_VIDEO,
      },
      {
        id: "m3-guardar",
        titulo: "Guarda la idea",
        instruccion: "Haz clic en «Crear video» para programar la tarjeta.",
        detalle: "Nace con su checklist de producción de 15 pasos, listo para el rodaje.",
        target: GUIA_TARGETS.BTN_SUBMIT_VIDEO,
        url: "/contenido",
        fallbackTexto: "Botón «Crear video» al pie de la ventana.",
        posicionPreferida: "top",
        abreCon: GUIA_TARGETS.BTN_NUEVO_VIDEO,
      },
    ],
  },
  {
    id: "modulo-4",
    numero: 4,
    titulo: "Conectar la IA y probar la clave",
    subtitulo: "Pega tu clave de API y compruébala con una llamada real",
    icono: "KeyRound",
    duracionMin: 4,
    // Ajustes es solo del dueño: un miembro no vería la página y la guía le
    // pediría pulsar algo que no existe.
    minLevel: 2,
    pasos: [
      {
        id: "m4-nav",
        titulo: "Ve a Ajustes",
        instruccion: "Haz clic en «Ajustes» en el menú lateral.",
        detalle: "Aquí se administran las claves de inteligencia artificial y la configuración general.",
        target: GUIA_TARGETS.NAV_AJUSTES,
        url: "/ajustes",
        fallbackTexto: "Enlace «Ajustes» en la barra lateral.",
        posicionPreferida: "right",
      },
      {
        id: "m4-key",
        titulo: "Pega tu clave de API",
        instruccion: "Pega tu clave de Gemini (Google) o de Claude (Anthropic).",
        detalle: "Gemini tiene un plan gratuito para empezar en segundos creando un proyecto en Google AI Studio.",
        target: GUIA_TARGETS.INPUT_API_KEY_GOOGLE,
        url: "/ajustes",
        fallbackTexto: "Campo de clave de Gemini o de Claude en Ajustes.",
        posicionPreferida: "top",
      },
      {
        id: "m4-probar",
        titulo: "Prueba la clave en vivo",
        instruccion: "Haz clic en «Probar esta clave» (o en «Probar la clave en uso» si no escribiste ninguna) para verificarla con una llamada real.",
        detalle: "Así sabes ahora, y no en plena generación, si la clave está revocada o la cuenta no tiene saldo.",
        target: GUIA_TARGETS.BTN_PROBAR_CLAVE_AI,
        url: "/ajustes",
        fallbackTexto: "Botón «Probar esta clave» / «Probar la clave en uso» junto al campo de la clave.",
        posicionPreferida: "bottom",
      },
      {
        id: "m4-guardar",
        titulo: "Guarda los ajustes",
        instruccion: "Haz clic en «Guardar ajustes».",
        detalle: "Con esto la app ya puede redactar guiones con inteligencia artificial.",
        target: GUIA_TARGETS.BTN_GUARDAR_AJUSTES,
        url: "/ajustes",
        fallbackTexto: "Botón «Guardar ajustes» al final de la página.",
        posicionPreferida: "top",
      },
    ],
  },
  {
    id: "modulo-5",
    numero: 5,
    titulo: "Generar guiones con IA por etapas",
    subtitulo: "Asistente por etapas, varios formatos a la vez y cierre con gatillos",
    icono: "Sparkles",
    duracionMin: 4,
    pasos: [
      {
        id: "m5-nav",
        titulo: "Entra al Generador IA",
        instruccion: "Haz clic en «Generador IA» en el menú.",
        detalle: "Un asistente en 5 etapas que valida cada una antes de dejarte continuar.",
        target: GUIA_TARGETS.NAV_GENERADOR,
        url: "/generador",
        fallbackTexto: "Enlace «Generador IA» en el menú lateral.",
        posicionPreferida: "right",
      },
      {
        id: "m5-estructura",
        titulo: "Etapa 1: elige el formato",
        instruccion: "Marca uno o varios formatos de guion (Camaleón, Ellos vs Nosotros, PAS, UGC…).",
        detalle: "Si marcas varios, la IA genera una versión de tu idea por cada formato.",
        target: GUIA_TARGETS.SELECT_GENERADOR_ESTRUCTURA,
        url: "/generador",
        fallbackTexto: "Las tarjetas de formato de la etapa 1 del generador.",
        posicionPreferida: "bottom",
      },
      {
        id: "m5-continuar-1",
        titulo: "Pasa a la etapa 2",
        instruccion: "Con al menos un formato marcado, pulsa «Continuar: Identidad y Producto».",
        detalle: "Cada etapa se desbloquea con su botón Continuar; la guía te lo va señalando.",
        target: GUIA_TARGETS.BTN_GENERADOR_CONTINUAR_1,
        // Al pulsar Continuar cambia la etapa y el paso siguiente vive en ella: no pedir otro clic.
        avanzarAlInteractuar: true,
        url: "/generador",
        fallbackTexto: "Botón «Continuar» al pie de la etapa 1.",
        posicionPreferida: "top",
      },
      {
        id: "m5-marca",
        titulo: "Etapa 2: elige la marca",
        instruccion: "Elige la MISMA marca que usaste en el video del Módulo 3.",
        detalle: "Si no coinciden, después no podrás unir el guion a esa tarjeta.",
        target: GUIA_TARGETS.SELECT_GENERADOR_MARCA,
        url: "/generador",
        fallbackTexto: "Selector «Marca» de la etapa 2.",
        posicionPreferida: "bottom",
      },
      {
        id: "m5-producto",
        titulo: "Nombra el producto",
        instruccion: "Escribe qué producto o servicio va a vender este guion.",
        target: GUIA_TARGETS.INPUT_GENERADOR_PRODUCTO,
        url: "/generador",
        fallbackTexto: "Campo «Producto» de la etapa 2.",
        posicionPreferida: "bottom",
      },
      {
        id: "m5-producto-desc",
        titulo: "Describe el producto",
        instruccion: "Cuenta a fondo qué es, qué resuelve y por qué es mejor.",
        detalle: "Aunque el formato no lo mencione hasta el final, la IA asimila todos sus beneficios de antemano.",
        target: GUIA_TARGETS.INPUT_GENERADOR_PRODUCTO_DESC,
        url: "/generador",
        fallbackTexto: "Campo de descripción del producto, etapa 2.",
        posicionPreferida: "top",
      },
      {
        id: "m5-actor",
        titulo: "Elige quién sale en cámara",
        instruccion: "Elige a la persona del Módulo 2 que va a actuar este guion.",
        detalle: "La IA escribe con su tono de voz y su vocabulario, no con uno genérico.",
        target: GUIA_TARGETS.SELECT_GENERADOR_ARQUETIPO,
        url: "/generador",
        fallbackTexto: "Si la lista está vacía, primero añade una persona en el Módulo 2 y pulsa Siguiente.",
        posicionPreferida: "top",
      },
      {
        id: "m5-continuar-2",
        titulo: "Pasa a la etapa 3",
        instruccion: "Con el producto descrito (el botón se activa al hacerlo), pulsa «Continuar: Ángulo e Idea».",
        target: GUIA_TARGETS.BTN_GENERADOR_CONTINUAR_2,
        // Al pulsar Continuar cambia la etapa y el paso siguiente vive en ella: no pedir otro clic.
        avanzarAlInteractuar: true,
        url: "/generador",
        fallbackTexto: "Botón «Continuar» al pie de la etapa 2.",
        posicionPreferida: "top",
      },
      {
        id: "m5-angulo-idea",
        titulo: "Etapa 3: elige el ángulo creativo",
        instruccion: "Elige el ángulo psicológico: Camaleón, Ellos vs Nosotros, Impacto visual…",
        detalle: "De una misma idea y producto, el ángulo define el giro que atrapa al espectador.",
        target: GUIA_TARGETS.BOTONES_GENERADOR_ANGULOS,
        url: "/generador",
        fallbackTexto: "Botones de «Ángulo creativo» de la etapa 3.",
        posicionPreferida: "top",
      },
      {
        id: "m5-idea",
        titulo: "Escribe la idea",
        instruccion: "Escribe la idea central del video en una o dos frases.",
        detalle: "Mínimo cinco caracteres para poder continuar.",
        target: GUIA_TARGETS.INPUT_GENERADOR_PETICION,
        url: "/generador",
        fallbackTexto: "Campo de idea central de la etapa 3.",
        posicionPreferida: "top",
      },
      {
        id: "m5-continuar-3",
        titulo: "Pasa a la etapa 4",
        instruccion: "Con la idea escrita, pulsa «Continuar: Cierre y CTA».",
        target: GUIA_TARGETS.BTN_GENERADOR_CONTINUAR_3,
        // Al pulsar Continuar cambia la etapa y el paso siguiente vive en ella: no pedir otro clic.
        avanzarAlInteractuar: true,
        url: "/generador",
        fallbackTexto: "Botón «Continuar» al pie de la etapa 3.",
        posicionPreferida: "top",
      },
      {
        id: "m5-cta-hormozi",
        titulo: "Etapa 4: cierre con gatillos",
        instruccion: "Elige si el cierre vende o solo pide una acción de comunidad, y luego el gatillo (escasez, urgencia o regalo si vende; guardar, enviar o pregunta si no) y la acción que quieres.",
        detalle: "Arma un llamado a la acción persuasivo, sin sonar a vendedor. En modo comunidad la IA tiene prohibido meter precios, ofertas o enlaces.",
        target: GUIA_TARGETS.BOTONES_GENERADOR_CTA,
        url: "/generador",
        fallbackTexto: "Constructor de «Llamado a la acción» de la etapa 4.",
        posicionPreferida: "top",
      },
      {
        id: "m5-continuar-4",
        titulo: "Pasa a la etapa 5",
        instruccion: "Pulsa «Continuar: Motor y Generación» para revisar el resumen y generar.",
        target: GUIA_TARGETS.BTN_GENERADOR_CONTINUAR_4,
        // Al pulsar Continuar cambia la etapa y el paso siguiente vive en ella: no pedir otro clic.
        avanzarAlInteractuar: true,
        url: "/generador",
        fallbackTexto: "Botón «Continuar» al pie de la etapa 4.",
        posicionPreferida: "top",
      },
      {
        id: "m5-generar",
        titulo: "Etapa 5: genera el guion",
        instruccion: "Revisa el resumen y haz clic en «Generar guion con IA».",
        detalle: "En unos segundos tendrás el guion desglosado escena por escena, listo para rodar.",
        target: GUIA_TARGETS.BTN_GENERAR_GUION_SUBMIT,
        url: "/generador",
        fallbackTexto: "Botón «Generar guion con IA» al pie del generador.",
        posicionPreferida: "top",
      },
    ],
  },
  {
    id: "modulo-6",
    numero: 6,
    titulo: "Unir el guion al video",
    subtitulo: "Conecta la creatividad con la producción real en el calendario",
    icono: "Clapperboard",
    duracionMin: 3,
    pasos: [
      {
        id: "m6-nav",
        titulo: "Entra en la sección de Guiones",
        instruccion: "Haz clic en «Guiones» en el menú lateral.",
        detalle: "Aquí están todos los guiones creados, desglosados y listos para asignar al calendario.",
        target: GUIA_TARGETS.NAV_GUIONES,
        url: "/guiones",
        fallbackTexto: "Enlace «Guiones» en el menú de navegación.",
        posicionPreferida: "right",
      },
      {
        id: "m6-abrir-guion",
        titulo: "Abre la ficha del guion",
        instruccion: "Haz clic en tu guion en la lista para ver su desglose completo.",
        detalle: "Si acabas de generarlo, ya estás en su ficha y este paso se salta solo.",
        target: GUIA_TARGETS.GUION_PRIMERA_FILA,
        url: "/guiones",
        fallbackTexto:
          "Haz clic en tu guion en la tabla. Si la lista sale vacía, cambia el selector de marca de la cabecera. Si ya ves la ficha del guion, pulsa Siguiente.",
        posicionPreferida: "bottom",
        requiereAccion: true,
        puente: true,
      },
      {
        id: "m6-select",
        titulo: "Elige la tarjeta de video",
        instruccion: "Selecciona la idea de video que creaste en el Módulo 3.",
        detalle: "Al unirlos, el video hereda la estructura del guion y pasa de «Idea» a «Guion».",
        target: GUIA_TARGETS.SELECT_ASIGNAR_VIDEO,
        url: "/guiones",
        fallbackTexto:
          "Si no ves el selector, este guion no tiene videos libres de su marca: crea uno en Videos con esa misma marca, o cambia la marca del guion en «Editar ficha».",
        posicionPreferida: "top",
        requiereAccion: true,
      },
      {
        id: "m6-asignar",
        titulo: "Confirma la unión",
        instruccion: "Haz clic en «Asignar» para unir ambos.",
        detalle: "Marca definida, video programado y guion asignado: el ciclo completo.",
        target: GUIA_TARGETS.BTN_ASIGNAR_GUION,
        url: "/guiones",
        fallbackTexto: "Botón «Asignar» junto al selector de tarjeta dentro del guion.",
        posicionPreferida: "left",
      },
      {
        id: "m6-exito",
        titulo: "¡Flujo completado!",
        instruccion: "Tu video ya tiene guion completo y checklist listo para rodar.",
        detalle: "Así se mueve una idea en Marketing OS: de cero al set de grabación.",
        target: GUIA_TARGETS.VIDEO_VINCULADO_CARD,
        url: "/guiones",
        fallbackTexto: "La tarjeta del video asignado, arriba en la ficha del guion.",
        posicionPreferida: "bottom",
      },
    ],
  },
  {
    id: "modulo-7",
    numero: 7,
    titulo: "Organizar tu equipo de trabajo",
    subtitulo: "Reparte funciones y asigna colaboradores a cada paso",
    icono: "Users",
    duracionMin: 3,
    // Invitar gente es solo del dueño.
    minLevel: 2,
    pasos: [
      {
        id: "m7-nav",
        titulo: "Explora la sección de Equipo",
        instruccion: "Haz clic en «Equipo» para gestionar a los miembros.",
        detalle: "Solo hay dos niveles de permiso (dueño y miembro), pero muchas funciones de trabajo.",
        target: GUIA_TARGETS.NAV_EQUIPO,
        url: "/equipo",
        fallbackTexto: "Enlace «Equipo» en el menú lateral.",
        posicionPreferida: "right",
      },
      {
        id: "m7-invitar",
        titulo: "Invita a tu equipo",
        instruccion: "Haz clic en «Invitar persona» para dar de alta a editores, guionistas o filmmakers.",
        detalle: "A cada persona le podrás asignar sus funciones en el checklist de cada video.",
        target: GUIA_TARGETS.BTN_INVITAR_EQUIPO,
        url: "/equipo",
        fallbackTexto: "Botón «Invitar persona» en la sección de equipo.",
        posicionPreferida: "bottom",
        avanzarAlInteractuar: true,
      },
    ],
  },
];
