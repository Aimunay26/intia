/**
 * Guías ilustradas paso a paso por equipo: iPhone (app Cámara), Samsung Galaxy (app Cámara)
 * y Sony ZV-E10 / ZV-E10 II. Una lección del manual las enlaza con su campo «guia».
 *
 * Fuente de verdad: investigación del 29/09/2026 (manuales y soporte oficiales de Apple,
 * Samsung y Sony). Cada paso dibuja una maqueta SVG propia (src/components/manual/
 * device-guide-screens.tsx); nunca se copian capturas de los fabricantes. Los pasos de
 * confianza baja o con menús que cambian entre versiones lo dicen con «Puede variar según
 * versión». Solo se enlaza documentación oficial.
 *
 * Este archivo solo lo importa el componente de la guía, que se carga bajo demanda.
 */
import type { ScreenId } from "@/components/manual/device-guide-layout";
import type { GuideId } from "@/lib/manual";

export type GuideDevice = "IPHONE" | "SAMSUNG" | "SONY_ZVE10";
export type GuideGesture = "tocar" | "mantener" | "deslizar-arriba" | "deslizar-abajo" | "deslizar-lado";
export type GuideStep = {
  pantalla: ScreenId;
  /** Qué hacer, en una o dos frases. */
  texto: string;
  /** Dónde tocar (0-1 relativo a la maqueta). Si falta, se usa la posición del elemento «resaltar». */
  toque?: { x: number; y: number };
  gesto?: GuideGesture;
  /** Nombre visible del elemento a marcar en la maqueta. */
  resaltar?: string;
  /** Qué se verá después o una advertencia. */
  detalle?: string;
};
export type DeviceGuide = {
  id: GuideId;
  dispositivo: GuideDevice;
  titulo: string;
  requisitos: string[];
  pasos: GuideStep[];
  notas: string[];
  fuentes: string[];
};

/** Todas las guías, en el orden en que se muestran. Debe cubrir la unión GuideId completa. */
export const GUIDE_IDS = [
  "iphone-log",
  "iphone-formato-4k",
  "iphone-foco-exposicion",
  "samsung-log",
  "samsung-formato-4k",
  "samsung-foco-exposicion",
  "zve10-formato",
  "zve10-log",
  "zve10-enfoque",
  "zve10-exposicion",
  "zve10-audio-y-energia",
] as const satisfies readonly GuideId[];

// Si se agrega un GuideId en src/lib/manual.ts sin sumarlo aquí, esto deja de compilar.
type GuiaSinListar = Exclude<GuideId, (typeof GUIDE_IDS)[number]>;
const _GUIAS_COMPLETAS: [GuiaSinListar] extends [never] ? true : never = true;

export const DEVICE_LABELS: Record<GuideDevice, string> = {
  IPHONE: "iPhone · app Cámara",
  SAMSUNG: "Samsung Galaxy · app Cámara",
  SONY_ZVE10: "Sony ZV-E10 / ZV-E10 II",
};

/** Frase que marca un paso o nota que cambia entre versiones o viene de fuentes de confianza baja. */
export const VARIA_SEGUN_VERSION = "Puede variar según versión";

const APPLE = {
  camaraIos: "https://support.apple.com/es-mx/guide/iphone/iphde02c478d/ios",
  prores: "https://support.apple.com/es-mx/109041",
  video: "https://support.apple.com/es-mx/guide/iphone/iph61f49e4bb/ios",
  grabarVideo: "https://support.apple.com/es-mx/guide/iphone/iphc1827d32f/ios",
  enfoque: "https://support.apple.com/es-mx/guide/iphone/iph3dc593597/ios",
  controlCamara: "https://support.apple.com/es-mx/guide/iphone/iph0c397b154/ios",
  conservar: "https://support.apple.com/es-mx/guide/iphone/iph62000de98/ios",
  controlesPro: "https://support.apple.com/es-mx/guide/iphone/ipht182e41vsz41/ios",
  finalCutCamera: "https://support.apple.com/es-mx/guide/final-cut-camera/dev14d309a3f/ios",
  hevc: "https://support.apple.com/es-mx/116944",
  fichas18Pro: "https://www.apple.com/iphone-18-pro/specs/",
};
const SAMSUNG = {
  logS25: "https://www.samsung.com/us/support/answer/ANS10004861/",
  logS26: "https://www.samsung.com/us/support/answer/ANS10010360",
  developerLog: "https://developer.samsung.com/mobile/samsung-log-video.html",
  camara: "https://www.samsung.com/co/support/mobile-devices/how-to-use-the-camera-on-your-galaxy-phone/",
  ajustes: "https://www.samsung.com/us/support/answer/ANS10004601",
  pro: "https://www.samsung.com/us/support/answer/ANS10001353/",
  guiaComposicion: "https://www.samsung.com/in/support/mobile-devices/composition-guide-feature-in-galaxy-devices/",
  rastreo: "https://www.samsung.com/us/support/troubleshooting/TSG10004579",
};
const SONY = {
  zve10: "https://helpguide.sony.net/ilc/2070/v1/es/print.pdf",
  zve10ii: "https://helpguide.sony.net/ilc/2430/v1/es/print.pdf",
  licencia: "https://helpguide.sony.net/di/4k120p_2430/v1/en/print.pdf",
  creatorsCloud: "https://creatorscloud.sony.net/cameraupgrade/4k120p/",
  recursosPro: "https://pro.sony/ue_US/support-resources",
};

export const DEVICE_GUIDES: Record<GuideId, DeviceGuide> = {
  /* ================================================================ iPHONE */
  "iphone-log": {
    id: "iphone-log",
    dispositivo: "IPHONE",
    titulo: "iPhone: activar Apple Log (ProRes Log) en la app Cámara",
    requisitos: [
      "iPhone 15 Pro/Pro Max, 16 Pro/Pro Max, 17 Pro/Pro Max o 18 Pro/Pro Max con iOS 26 o 27. Log 2 solo en 17 Pro y 18 Pro.",
      "Memoria interna de 256 GB o más para 4K (hasta 30 fps). Con 128 GB solo se graba 1080p a 30 fps.",
      "Para 4K a 60 fps: SSD USB‑C en exFAT, sin contraseña, de al menos 220 MB/s y 4.5 W como máximo, con cable USB 3 de 10 Gb/s.",
      "Para 4K a 120 fps (solo 16 Pro, 17 Pro y 18 Pro): SSD de al menos 440 MB/s, reformateado antes de cada sesión.",
      "Al menos un 10 % de almacenamiento libre.",
      "Que el editor aplique la LUT o la gestión de color (Apple Log → Rec.709).",
    ],
    pasos: [
      {
        pantalla: "ios-inicio",
        resaltar: "Configuración",
        gesto: "tocar",
        texto: "Toca Configuración (el engranaje gris). Si no lo ves, desliza hacia abajo en la pantalla de inicio y escribe «Configuración».",
        detalle: "Se abre Configuración. En España el menú se llama «Ajustes».",
      },
      {
        pantalla: "ios-configuracion",
        resaltar: "Cámara",
        gesto: "tocar",
        texto: "Desliza hacia arriba y toca «Cámara». También puedes escribir «Cámara» en el buscador.",
        detalle: "Se abre la pantalla Cámara, con Formatos, Grabar video, Cámara lenta y más opciones.",
      },
      {
        pantalla: "ios-camara-ajustes",
        resaltar: "Formatos",
        gesto: "tocar",
        texto: "Toca «Formatos», la primera fila.",
        detalle: "Verás «Captura de cámara» arriba y «Captura de video» más abajo.",
      },
      {
        pantalla: "ios-formatos",
        resaltar: "Apple ProRes",
        gesto: "tocar",
        texto: "En «Captura de video», activa el interruptor «Apple ProRes».",
        detalle: "El interruptor queda verde. En el iPhone 18 Pro te pide además el almacenamiento de video profesional (paso siguiente).",
      },
      {
        pantalla: "ios-almacenamiento-pro",
        resaltar: "Actualizar almacenamiento de video profesional",
        gesto: "tocar",
        texto:
          "Solo iPhone 18 Pro/Pro Max: toca «Almacenamiento de video profesional», elige cuánto reservar (reserva bastante), toca «Actualizar almacenamiento de video profesional» y cierra con la X.",
        detalle: "Se hace una sola vez. Después puedes cambiarlo o eliminarlo desde Formatos.",
      },
      {
        pantalla: "ios-codificacion-log",
        resaltar: "Log",
        gesto: "tocar",
        texto:
          "Solo 17 Pro y 18 Pro: toca «Codificación de video ProRes Log» y elige «Log» (Apple Log clásico, compatible con la LUT más usada) o «Log 2» (gama más amplia; solo si el editor lo soporta).",
        detalle: "Aparece la marca en la opción elegida. En 15 Pro y 16 Pro no hay que elegir: su Log es Apple Log.",
      },
      {
        pantalla: "ios-conservar",
        resaltar: "Apple ProRes",
        gesto: "tocar",
        texto: "Vuelve a Cámara con «<», toca «Conservar la configuración» y activa «Apple ProRes». Si quieres fijar la exposición, activa también «Ajuste de exposición».",
        detalle: "La app Cámara ya no vuelve a HEVC cada vez que la abres.",
      },
      {
        pantalla: "ios-ssd",
        resaltar: "Puerto USB‑C",
        gesto: "tocar",
        texto: "Solo para 4K a 60 o 120 fps: conecta el SSD al puerto USB‑C con el cable USB 3 antes de abrir Cámara. Sujétalo a la jaula o al soporte para que el cable no tire.",
        detalle: "La app Cámara graba directo en el SSD. Si el disco es lento, aparece «Baja velocidad de grabación».",
      },
      {
        pantalla: "ios-camara-video",
        resaltar: "VIDEO",
        gesto: "deslizar-lado",
        texto: "Abre Cámara y desliza el carrusel de modos hasta «VIDEO» (o tócalo).",
        detalle: "Arriba a la izquierda verás el formato actual, por ejemplo «4K · 60».",
      },
      {
        pantalla: "ios-camara-formato",
        resaltar: "ProRes Log",
        gesto: "tocar",
        texto:
          "Toca los valores de formato (arriba a la izquierda) y elige «ProRes Log» (no «ProRes HDR»), luego «4K» y los fps: 30 en memoria interna, 60 con SSD de 220 MB/s o más, 120 con SSD de 440 MB/s o más (16 Pro, 17 Pro y 18 Pro).",
        detalle: `Si una opción no está disponible (por ejemplo, 4K a 60 sin SSD), no aparece o sale atenuada. ${VARIA_SEGUN_VERSION}: la posición de este selector cambió entre iOS 26 y iOS 27.`,
      },
      {
        pantalla: "ios-camara-log",
        resaltar: "Grabar",
        gesto: "tocar",
        texto: "Encuadra, bloquea foco y exposición (guía «Bloquear enfoque y exposición») y toca el botón rojo. También puedes grabar con un botón de volumen o el Control de la cámara.",
        detalle: "El visor se ve gris y plano: es normal en Log. Para detener, vuelve a tocar el botón.",
      },
      {
        pantalla: "editor-lut",
        resaltar: "LUT",
        gesto: "tocar",
        texto: "En la edición (Final Cut Pro, DaVinci Resolve, Premiere Pro u otro compatible con ProRes), aplica la conversión Apple Log → Rec.709: la LUT oficial de Apple o la gestión de color del programa. Después corrige el color.",
        detalle: "El video recupera contraste y color, con más margen en luces y sombras.",
      },
    ],
    notas: [
      "Log en la app Cámara nativa SOLO existe como ProRes Log. En memoria interna llega como máximo a 4K 30 fps (256 GB o más) o a 1080p 30 fps (128 GB). Para 4K a 60 o a 120 fps hace falta el SSD.",
      "Sin SSD: usa Final Cut Camera (gratis, de Apple). Formato > códec «HEVC (H.265)» > espacio de color «Apple Log» («Apple Log 2» en 17 Pro/18 Pro) > «4K» > «60». Activa «Previsualizar con LUT» para ver el color normal mientras grabas. Requiere iPhone 15 Pro o posterior.",
      "Otra opción gratis: Blackmagic Camera (H.265 + Apple Log desde el 15 Pro), con obturación, ISO y balance de blancos manuales.",
      "ProRes no funciona en los modos Cine, Cámara lenta ni Cámara rápida. La cámara lenta en Log se hace en modo Video a 120 fps (con SSD) o en Final Cut Camera.",
      "ProRes ocupa hasta 30 veces más que HEVC: un minuto de ProRes 422 HQ en 4K 30 fps ocupa más de 6.6 GB.",
      "iPhone sin Log (13 Pro, 14 Pro, 15, 16, 16e, 17, 17e, Air y, según su ficha, Duo): graba 4K 60 fps en HEVC con «Video HDR» apagado, bloquea AE/AF y el balance de blancos, y baja un poco la exposición para no quemar las luces.",
      "Con iOS 18: Configuración > Cámara > Formatos > «ProRes de Apple» > «Codificación ProRes» > Log; luego, en Cámara, toca el botón «ProRes» de arriba.",
      "Log exige edición: si nadie aplica la LUT, el video se publica gris y apagado.",
    ],
    fuentes: [APPLE.camaraIos, APPLE.prores, APPLE.video, APPLE.conservar, APPLE.finalCutCamera, APPLE.fichas18Pro, "https://www.blackmagicdesign.com/products/blackmagiccamera/techspecs/W-APP-02"],
  },

  "iphone-formato-4k": {
    id: "iphone-formato-4k",
    dispositivo: "IPHONE",
    titulo: "iPhone: siempre 4K a 60 fps y cámara lenta en 4K a 120 fps",
    requisitos: [
      "4K a 60 fps: cualquier iPhone actual (17e, 17, Air, Duo, 15 Pro, 16 Pro, 17 Pro, 18 Pro, etc.).",
      "4K a 120 fps: solo iPhone 16 Pro/Pro Max, 17 Pro/Pro Max, 18 Pro/Pro Max y Duo (lente principal 1x). iPhone 17, Air y 17e llegan a 1080p a 120/240 fps en cámara lenta.",
      "iOS 26 o 27.",
    ],
    pasos: [
      {
        pantalla: "ios-formatos",
        resaltar: "Alta eficiencia",
        gesto: "tocar",
        texto: "Entra a Configuración > Cámara > Formatos y toca «Alta eficiencia».",
        detalle: "Queda marcada Alta eficiencia (HEVC), que es necesaria para 4K a 60 fps. Con «Más compatible» (H.264) no hay 4K a 60.",
      },
      {
        pantalla: "ios-camara-ajustes",
        resaltar: "Grabar video",
        gesto: "tocar",
        texto: "Vuelve a Cámara con «<» y toca «Grabar video».",
        detalle: "Aparece la lista de resoluciones y fps.",
      },
      {
        pantalla: "ios-grabar-video",
        resaltar: "4K a 60 fps",
        gesto: "tocar",
        texto: "Toca «4K a 60 fps».",
        detalle: "Queda como formato por defecto del modo Video.",
      },
      {
        pantalla: "ios-grabar-video",
        resaltar: "Frecuencia automática",
        gesto: "tocar",
        texto: "Más abajo, toca «Frecuencia automática» y desactívala. En algunos modelos es el interruptor «FPS para poca luz»: apágalo.",
        detalle: "Con poca luz el iPhone ya no baja a 24 fps. En 4K esta opción solo actúa en el iPhone 18 Pro; en los demás modelos afecta a 1080p y 720p. Apágala igual: con poca luz, lo que mantiene la imagen limpia es la luz LED de mano.",
      },
      {
        pantalla: "ios-grabar-video",
        resaltar: "Bloquear cámara",
        gesto: "tocar",
        texto: "Deja activada «Estabilización mejorada», activa «Bloquear cámara» y «Bloq. de balance de blancos», y desactiva «Video HDR» salvo que el editor trabaje en HDR.",
        detalle: "El video no cambia de lente ni de color a mitad de toma, y no se ve lavado en editores sin HDR.",
      },
      {
        pantalla: "ios-camara-lenta-ajustes",
        resaltar: "4K a 120 fps",
        gesto: "tocar",
        texto: "En Configuración > Cámara > «Cámara lenta», toca «4K a 120 fps» (16 Pro, 17 Pro, 18 Pro o Duo). En otros modelos elige «1080p HD a 240 fps» o «a 120 fps».",
        detalle: "El modo Cámara lenta graba en esa calidad con la cámara trasera.",
      },
      {
        pantalla: "ios-camara-ajustes",
        resaltar: "Cuadrícula",
        gesto: "tocar",
        texto: "En Configuración > Cámara, activa «Cuadrícula» y «Nivel».",
        detalle: "El visor muestra los tercios y el nivel: los ojos del sujeto van sobre la línea horizontal de arriba.",
      },
      {
        pantalla: "ios-camara-video",
        resaltar: "Formato",
        gesto: "tocar",
        texto: "En la app Cámara (modo VIDEO), revisa que arriba a la izquierda diga «4K · 60». Si alguien lo cambió, toca la resolución hasta «4K» y los fps hasta «60».",
        detalle: "Así grabas en 4K a 60 fps sin entrar a Configuración.",
      },
      {
        pantalla: "ios-camara-fps",
        resaltar: "120",
        gesto: "tocar",
        texto: "Para cámara lenta en modo Video (16 Pro, 17 Pro, 18 Pro y Duo): toca los fps arriba a la izquierda y elige «120». Si no aparece, habilita «4K a 120 fps» en Configuración > Cámara > Grabar video.",
        detalle: "Se graba en 4K a 120 fps y el editor lo ralentiza donde quiera. Con ProRes Log exige un SSD de 440 MB/s o más.",
      },
      {
        pantalla: "ios-camara-lenta",
        resaltar: "CÁMARA LENTA",
        gesto: "deslizar-lado",
        texto: "Alternativa: desliza el carrusel a «CÁMARA LENTA» (a la izquierda de VIDEO) y graba con el botón rojo.",
        detalle: "Graba a 4K 120 o 1080p 240 según lo elegido antes. En Fotos eliges qué tramo va lento. Este modo no admite ProRes ni Log.",
      },
    ],
    notas: [
      "No uses el modo Acción para las tomas 4K: graba como máximo en 2.8K.",
      "El modo Cine graba como máximo en 4K a 30 fps (4K a 60 solo en el 18 Pro y el Duo) y no admite ProRes ni Log.",
      "Si grabas en ProRes Log, el formato se elige en el selector de la app Cámara (guía de Apple Log). 4K a 60 en Log requiere SSD.",
      "Un clip de 60 fps puede ir al 50 % en una línea de tiempo de 30 fps (2 veces más lento) y uno de 120 fps al 25 % (4 veces más lento).",
      `${VARIA_SEGUN_VERSION}: la etiqueta exacta (por ejemplo, «4K a 60 fps») cambia levemente según la versión y el idioma; versiones antiguas decían «cps». En España: Ajustes > Cámara > Grabar vídeo > «Frecuencia de fps automática».`,
    ],
    fuentes: [APPLE.video, APPLE.grabarVideo, APPLE.enfoque, APPLE.hevc, APPLE.fichas18Pro, "https://www.apple.com/iphone-17/specs/"],
  },

  "iphone-foco-exposicion": {
    id: "iphone-foco-exposicion",
    dispositivo: "IPHONE",
    titulo: "iPhone: bloquear enfoque y exposición (BLOQUEO de AE/AF) al grabar video",
    requisitos: [
      "Cualquier iPhone con la app Cámara nativa (modo Video).",
      "Opcional: un modelo con Control de la cámara para bloquear con el botón lateral.",
      "Opcional: iPhone 18 Pro para enfoque manual, obturación, apertura, balance de blancos e histograma.",
    ],
    pasos: [
      {
        pantalla: "ios-camara-video",
        resaltar: "Línea superior",
        texto: "Encuadra de modo que los ojos del sujeto queden sobre la línea horizontal de arriba de la cuadrícula.",
        detalle: "Encuadre listo antes de fijar foco y luz. Si no ves la cuadrícula: Configuración > Cámara > «Cuadrícula».",
      },
      {
        pantalla: "ios-camara-bloqueo",
        resaltar: "Rostro",
        gesto: "mantener",
        texto: "Mantén el dedo 1 a 2 segundos sobre los ojos o el rostro del sujeto.",
        detalle: "Aparece un recuadro amarillo y, arriba, la etiqueta amarilla «BLOQUEO de AE/AF». Foco y exposición quedan fijos.",
      },
      {
        pantalla: "ios-camara-bloqueo",
        resaltar: "Sol",
        gesto: "deslizar-arriba",
        texto: "Sin soltar el bloqueo, desliza el dedo hacia arriba para aclarar o hacia abajo para oscurecer.",
        detalle: "Ajusta hasta que la piel se vea bien y el cielo o las ventanas no se quemen.",
      },
      {
        pantalla: "ios-camara-bloqueo",
        resaltar: "Grabar",
        gesto: "tocar",
        texto: "Toca el botón rojo para grabar.",
        detalle: "El foco no «respira» y la luz no cambia cuando alguien pasa o mueves la cámara.",
      },
      {
        pantalla: "ios-camara-bloqueo",
        resaltar: "Otro punto",
        gesto: "tocar",
        texto: "Para quitar el bloqueo o volver a enfocar (por ejemplo, si el sujeto cambió de distancia), toca cualquier otro punto de la pantalla y repite el paso 2.",
        detalle: "Desaparece «BLOQUEO de AE/AF» y vuelven el enfoque y la exposición automáticos.",
      },
      {
        pantalla: "ios-control-camara",
        resaltar: "Bloquear enfoque y exposición",
        gesto: "tocar",
        texto: "Solo modelos con Control de la cámara: en Configuración > Cámara > «Control de la cámara», activa «Bloquear enfoque y exposición».",
        detalle: "Queda listo para bloquear con el botón lateral.",
      },
      {
        pantalla: "ios-lateral",
        resaltar: "Control de la cámara",
        gesto: "mantener",
        texto: "Con la app Cámara abierta, haz una presión ligera sostenida sobre el Control de la cámara (lado derecho, parte baja).",
        detalle: "Aparece «Bloqueo de AE/AF» mientras mantienes el dedo. Al soltar se desactiva: sirve para tomas cortas.",
      },
      {
        pantalla: "ios-camara-controles",
        resaltar: "Exposición",
        gesto: "tocar",
        texto: "Toca «Controles de cámara» (arriba a la derecha) o desliza hacia arriba desde los modos, toca «Exposición» y arrastra el regulador. Luego toca «Atrás» y desliza el menú hacia abajo para cerrarlo.",
        detalle: "La compensación queda fija hasta que vuelves a abrir Cámara. Para conservarla: Configuración > Cámara > Conservar la configuración > «Ajuste de exposición».",
      },
      {
        pantalla: "ios-grabar-video",
        resaltar: "Bloq. de balance de blancos",
        gesto: "tocar",
        texto: "En Configuración > Cámara > Grabar video, activa «Bloq. de balance de blancos».",
        detalle: "El color no cambia de tono en medio de la toma. Complementa al BLOQUEO de AE/AF.",
      },
      {
        pantalla: "ios-camara-controles-pro",
        resaltar: "Enfoque",
        gesto: "tocar",
        texto:
          "Solo iPhone 18 Pro: en Controles de cámara toca «Enfoque» y arrastra el regulador de distancia («A» vuelve a automático). Para seguir a alguien que se mueve: toca al sujeto (marco amarillo) y toca dos veces el cuadro. Opcional: fija el obturador (~1/120 s a 60 fps) y el balance de blancos.",
        detalle: "Control manual tipo cámara profesional. El histograma ayuda a no quemar las luces.",
      },
    ],
    notas: [
      "Haz el BLOQUEO de AE/AF ANTES de grabar. Si el sujeto se acerca o se aleja mucho, vuelve a bloquear entre tomas.",
      "En Log el visor se ve gris: expón por la piel y vigila que no se quemen las luces. Con poca luz, usa la luz LED de mano.",
      "Si caminas con el sujeto a distancia constante, el bloqueo mantiene la exposición estable. Si la distancia cambia mucho, mejor el enfoque automático o, en el 18 Pro y el Duo, el seguimiento del enfoque.",
      "La regla de ~1/120 s de obturación a 60 fps es una práctica estándar de video (regla de 180°), no una indicación de Apple. La app Cámara nativa solo deja fijar el obturador en el 18 Pro.",
    ],
    fuentes: [APPLE.enfoque, APPLE.controlCamara, APPLE.conservar, APPLE.grabarVideo, APPLE.controlesPro],
  },

  /* =============================================================== SAMSUNG */
  "samsung-log": {
    id: "samsung-log",
    dispositivo: "SAMSUNG",
    titulo: "Samsung Galaxy: activar y grabar en Samsung Log",
    requisitos: [
      "Modelo compatible: Galaxy S24/S24+/S24 Ultra (con One UI 7 o superior), S25, S25+, S25 Edge, S25 FE, S25 Ultra, S26, S26+, S26 Ultra, Z Fold6, Fold7, Fold8 o Fold8 Ultra, o Z Flip6/7/7 FE/8. La serie A y el S23 o anteriores NO tienen Log.",
      "Sistema actualizado (Ajustes del teléfono > Actualización de software). Log requiere One UI 7+; la cámara frontal en Log, One UI 8+; la vista previa de LUT, One UI 8.5+.",
      "Unos 20 GB libres antes de grabar: Log en 4K 60 fps de 10 bits pesa bastante.",
      "Luz suficiente o la luz LED de mano: Log con ISO alto se ve con ruido.",
      "Para editar: la LUT oficial «Samsung Log to Rec709 3DLUT_v1.0.cube» de developer.samsung.com.",
    ],
    pasos: [
      {
        pantalla: "sam-camara-video",
        resaltar: "Controles rápidos",
        gesto: "tocar",
        texto: "Abre Cámara y toca Controles rápidos: los cuatro puntos, abajo a la derecha, encima del botón para cambiar de cámara.",
        detalle: "Aparece una barra con íconos; el engranaje «Ajustes» queda en el extremo izquierdo. Con One UI 6.1 o anterior, Ajustes era el engranaje de arriba a la izquierda.",
      },
      {
        pantalla: "sam-controles-rapidos",
        resaltar: "Ajustes",
        gesto: "tocar",
        texto: "Desliza la barra si hace falta y toca el engranaje «Ajustes».",
        detalle: "Se abre «Ajustes de cámara». En algunos equipos dice «Configuración de cámara».",
      },
      {
        pantalla: "sam-ajustes-camara",
        resaltar: "Opciones de video avanzadas",
        gesto: "tocar",
        texto: "One UI 7 u 8 (S24 y S25 sin 8.5, Z Fold7 y Z Flip7): en la sección Videos, toca «Opciones de video avanzadas».",
        detalle: "Según la región puede decir «Opciones avanzadas de video».",
      },
      {
        pantalla: "sam-opciones-video",
        resaltar: "Log",
        gesto: "tocar",
        texto: "Activa el interruptor «Log». Si «Videos HDR» está activado, desactívalo: HDR10+ y Log no se usan juntos.",
        detalle: "El interruptor queda azul y aparece el botón LOG en VIDEO PRO. Algunas versiones piden elegir «Solo Video Pro» o «Modos Video y Video Pro».",
      },
      {
        pantalla: "sam-ajustes-camara-85",
        resaltar: "Formato de video",
        gesto: "tocar",
        texto: "One UI 8.5 o superior (S26, S25 actualizado, Z Fold8, Z Fold8 Ultra y Z Flip8): en Ajustes de cámara toca «Formato de video».",
        detalle: `${VARIA_SEGUN_VERSION}: la etiqueta en español de One UI 8.5 no está confirmada en una fuente oficial.`,
      },
      {
        pantalla: "sam-formato-video",
        resaltar: "Log",
        gesto: "tocar",
        texto: "Toca «Log». Deja «APV» apagado salvo que haya un flujo profesional y mucho espacio: solo existe en el S26 Ultra y el Z Fold8 Ultra y genera archivos enormes.",
        detalle: "Se abren las opciones de Log.",
      },
      {
        pantalla: "sam-log-opciones",
        resaltar: "Modos Video y Video Pro",
        gesto: "tocar",
        texto: "Elige «Modos Video y Video Pro».",
        detalle: "Log queda habilitado y el botón LOG aparece también en el modo VIDEO normal.",
      },
      {
        pantalla: "sam-opciones-video",
        resaltar: "Atrás",
        gesto: "tocar",
        texto: "Toca la flecha Atrás (arriba a la izquierda) 2 o 3 veces hasta volver al visor.",
        detalle: "Vuelve el visor de la cámara.",
      },
      {
        pantalla: "sam-camara-video",
        resaltar: "MÁS",
        gesto: "tocar",
        texto: "Desliza el carrusel de modos y toca «MÁS» (extremo derecho).",
        detalle: "Se abre una cuadrícula de modos: PRO, VIDEO PRO, PANORAMA, CÁMARA LENTA…",
      },
      {
        pantalla: "sam-mas-modos",
        resaltar: "VIDEO PRO",
        gesto: "tocar",
        texto: "Toca «VIDEO PRO» (en España «Vídeo Pro»).",
        detalle: "Arriba a la derecha verás el botón LOG y, a su lado, el Monitor de exposición (dos círculos). Abajo: ISO · SPEED · EV · FOCUS · WB.",
      },
      {
        pantalla: "sam-video-pro",
        resaltar: "LOG",
        gesto: "tocar",
        texto: "Toca «LOG» (arriba a la derecha).",
        detalle: "Se pone amarillo y la imagen se ve gris y plana: así se ve el Log antes de corregir el color. En One UI 8.5+ puedes elegir una vista previa LUT; solo cambia la pantalla, el archivo sigue en Log.",
      },
      {
        pantalla: "sam-monitor-exposicion",
        resaltar: "Falso color",
        gesto: "tocar",
        texto: "Toca el ícono de dos círculos (Monitor de exposición) y activa «Zebra» y/o «Falso color».",
        detalle: "Falso color: rojo = sobreexpuesto, verde claro = bien expuesto, morado = subexpuesto. Zebra marca con rayas las zonas quemadas (umbral de 70 a 100).",
      },
      {
        pantalla: "sam-video-pro-log",
        resaltar: "Grabar",
        gesto: "tocar",
        texto: "Ajusta la exposición hasta que la cara quede verde claro y sin zebras en la piel (guía «Bloquear enfoque y exposición en Samsung»). Luego toca el botón rojo; al terminar, detener.",
        detalle: "El video queda en la Galería como HEVC de 10 bits en Log (o APV si lo activaste).",
      },
      {
        pantalla: "editor-lut",
        resaltar: "LUT",
        gesto: "tocar",
        texto: "En CapCut, Premiere o DaVinci Resolve aplica la LUT «Samsung Log to Rec709 3DLUT_v1.0.cube» (o una CineLUT) y luego ajusta exposición y balance. Con One UI 8.5+ también sirve Galería > video > Editar > LUT.",
        detalle: "El video recupera contraste y color, con más rango en luces y sombras que un video estándar.",
      },
    ],
    notas: [
      `${VARIA_SEGUN_VERSION}: los nombres cambian entre One UI 7, 8, 8.5 y 9 y según la región («Opciones de video avanzadas» u «Opciones avanzadas de video»; «VIDEO PRO», «Vídeo Pro» o «Pro video»). Desde One UI 8.5 el interruptor de Log está en «Formato de video».`,
      "Log funciona en todas las resoluciones y con todos los lentes: 4K a 60 fps y, en los Ultra (S24, S25 y S26 Ultra y Z Fold8 Ultra), 4K a 120 fps en VIDEO PRO.",
      "HDR10+ y Log son excluyentes: no actives ambos. APV (solo S26 Ultra y Z Fold8 Ultra) genera archivos enormes: no es la opción por defecto.",
      "La vista previa de LUT (One UI 8.5+) NO se graba: el archivo sigue en Log. Avisa al editor.",
      "Modelos SIN Log (serie A, S23 o anteriores): usa VIDEO PRO si existe, con ISO, velocidad, WB y foco fijos y HDR apagado, o el modo VIDEO con Bloqueo AF/AE. Sale con color estándar y no necesita LUT.",
      "Regla del dueño: siempre en Log si el equipo lo tiene. Aviso técnico, a confirmar con el dueño: un clip en Log publicado sin editar (directo del celular a la red) se ve gris; si algún video tuviera que salir así, consúltalo antes de grabar.",
    ],
    fuentes: [SAMSUNG.logS25, SAMSUNG.logS26, SAMSUNG.developerLog, SAMSUNG.camara],
  },

  "samsung-formato-4k": {
    id: "samsung-formato-4k",
    dispositivo: "SAMSUNG",
    titulo: "Samsung Galaxy: 4K (UHD) a 60 fps y 4K a 120 fps para cámara lenta",
    requisitos: [
      "4K a 60 fps: Galaxy S (S21 en adelante), Z Fold y Z Flip. Los Galaxy A56 y A57 solo llegan a 4K 30 fps (1080p 60): no deberían ser la cámara principal.",
      "4K a 120 fps: solo S24 Ultra, S25 Ultra, S26 Ultra y Z Fold8 Ultra, en VIDEO PRO y con la cámara principal (1x) o la ultra gran angular (0.6x). En el S26 Ultra también en CÁMARA LENTA. En el Z Fold8 Ultra la ficha oficial solo detalla 8K a 30 fps: confirma que el selector de VIDEO PRO ofrezca UHD 120.",
      "Mucha luz para 120 fps (obturación 1/240): la luz LED de mano o luz de día.",
      "Espacio de almacenamiento suficiente.",
    ],
    pasos: [
      {
        pantalla: "sam-camara-video",
        resaltar: "VIDEO",
        gesto: "tocar",
        texto: "Toca «VIDEO» en el carrusel de modos.",
        detalle: "El disparador se vuelve rojo. Arriba a la derecha verás HDR, la resolución (FHD, UHD u 8K) y los fps (30 o 60).",
      },
      {
        pantalla: "sam-camara-video",
        resaltar: "Resolución",
        gesto: "tocar",
        texto: "Toca el indicador de resolución, arriba a la derecha junto a HDR. Si no aparece, abre Controles rápidos y toca el ícono de resolución de video.",
        detalle: "Se abre el panel de tamaño de video. En One UI 8.5 es una tarjeta translúcida «Tamaño de video».",
      },
      {
        pantalla: "sam-tamano-video",
        resaltar: "UHD",
        gesto: "tocar",
        texto: "Toca «UHD». Samsung llama UHD al 4K.",
        detalle: "UHD queda marcado.",
      },
      {
        pantalla: "sam-tamano-video",
        resaltar: "60",
        gesto: "tocar",
        texto: "En la fila de fps, toca «60».",
        detalle: "Arriba verás «UHD» y «60»: el modo VIDEO graba en 4K a 60 fps.",
      },
      {
        pantalla: "sam-relacion-aspecto",
        resaltar: "9:16",
        gesto: "tocar",
        texto: "En Controles rápidos, toca la relación de aspecto y elige «9:16». «Completo» limita la resolución y 1:1 no sirve para Reels ni YouTube.",
        detalle: `Con el teléfono en vertical sale 9:16 (Reels, por defecto); girándolo, 16:9 (YouTube). ${VARIA_SEGUN_VERSION}: este paso no está confirmado en una fuente oficial.`,
      },
      {
        pantalla: "sam-ajustes-camara",
        resaltar: "FPS automático",
        gesto: "tocar",
        texto: "En Ajustes de cámara (sección Videos), pon «FPS automático» en Desactivado. Deja «Estabilización de video» activada para grabar a mano.",
        detalle: "El teléfono ya no baja a 30 fps con poca luz.",
      },
      {
        pantalla: "sam-opciones-video",
        resaltar: "Videos de alta tasa de bits",
        gesto: "tocar",
        texto: "En Opciones de video avanzadas (o Formato de video en One UI 8.5+): «Videos de alta eficiencia» activado, «Videos de alta tasa de bits» activado si existe y «Videos HDR» desactivado si grabas en Log.",
        detalle: "Archivos de mejor calidad.",
      },
      {
        pantalla: "sam-mas-modos",
        resaltar: "VIDEO PRO",
        gesto: "tocar",
        texto: "Cámara lenta en 4K 120 (solo S24 Ultra, S25 Ultra, S26 Ultra y Z Fold8 Ultra): en el carrusel toca «MÁS» y luego «VIDEO PRO».",
        detalle: "Se abre VIDEO PRO con sus controles manuales.",
      },
      {
        pantalla: "sam-tamano-video-pro",
        resaltar: "120",
        gesto: "tocar",
        texto: "Toca el indicador de resolución y fps y elige «UHD» y «120». Usa el zoom 1x o 0.6x: los teleobjetivos no graban 4K a 120.",
        detalle: "El archivo se reproduce a velocidad normal: se ralentiza en el editor (25 % en una línea de tiempo de 30 fps o 50 % en una de 60 fps).",
      },
      {
        pantalla: "sam-video-pro-speed",
        resaltar: "1/240",
        gesto: "tocar",
        texto: "Toca «SPEED» y fija 1/240 (o 1/120 si falta luz). Sube primero la luz (LED de mano) y recién después el ISO.",
        detalle: "Movimiento nítido para la cámara lenta. Con luz de día o una LED sin parpadeo, 1/240 va bien; con focos LED o fluorescentes de la red de 60 Hz puede mostrar bandas o pulsos de brillo: si los ves, baja a 1/120.",
      },
      {
        pantalla: "sam-camara-lenta",
        resaltar: "Resolución",
        gesto: "tocar",
        texto: "Alternativa en el S26 Ultra: «MÁS» > «CÁMARA LENTA» y elige UHD a 120 fps en el selector de resolución.",
        detalle: "Este modo es automático: da menos control manual que VIDEO PRO.",
      },
      {
        pantalla: "sam-mas-modos",
        resaltar: "CÁMARA LENTA",
        gesto: "tocar",
        texto: "Modelos sin 4K 120 (S24, S25 y S26 normales y Plus, Z Flip, Z Fold7 o cualquier equipo cuyo selector no ofrezca UHD 120): usa «CÁMARA LENTA» en FHD a 120 o 240 fps, o graba en 4K 60 y ralentiza al 50 % en el editor.",
        detalle: "Es la mejor cámara lenta posible en esos equipos.",
      },
      {
        pantalla: "sam-galeria-info",
        resaltar: "Resolución",
        texto: "En Galería, abre el video, desliza hacia arriba o toca la (i) y revisa los detalles.",
        detalle: `Debe decir 3840 × 2160 y 60 (o 120) fps. Si dice 1920 × 1080 o 30 fps, revisa el tamaño de video y FPS automático. ${VARIA_SEGUN_VERSION}: la ubicación del ícono de información cambia.`,
      },
    ],
    notas: [
      "En las series S25 y S26 el 4K a 60 funciona con todas las cámaras. El 8K solo llega a 30 fps y no hace falta para redes.",
      "VIDEO PRO también ofrece 24, 25, 48 y 50 fps (S26 Ultra y Z Fold8 Ultra). La regla del equipo es 60 (o 120 para cámara lenta).",
      "Perú usa corriente de 60 Hz: las luces de la red parpadean 120 veces por segundo. Sin parpadeo solo 1/60 y 1/120 (también 1/30). 1/240 sirve con luz de día o con una LED sin parpadeo: pruébala siempre antes de grabar. Con 1/50 o 1/100 las luces parpadean en el video.",
      `${VARIA_SEGUN_VERSION}: el nombre del panel, la posición del indicador y si HDR/LOG aparecen en la tarjeta de resolución cambian entre One UI 7 y 8.5. Las maquetas son referenciales.`,
    ],
    fuentes: [SAMSUNG.ajustes, SAMSUNG.pro, SAMSUNG.camara, SAMSUNG.developerLog],
  },

  "samsung-foco-exposicion": {
    id: "samsung-foco-exposicion",
    dispositivo: "SAMSUNG",
    titulo: "Samsung Galaxy: cuadrícula y bloqueo de enfoque y exposición",
    requisitos: [
      "Cualquier Galaxy con la app Cámara de One UI (el bloqueo AF/AE en modo VIDEO).",
      "Para el control manual completo (ISO, obturación, WB y foco manual): modelos con VIDEO PRO (series S y Z; en la serie A depende del modelo).",
      "Zebra y Falso color: modelos con Samsung Log (S24 o posterior con One UI 7+).",
    ],
    pasos: [
      {
        pantalla: "sam-controles-rapidos",
        resaltar: "Ajustes",
        gesto: "tocar",
        texto: "Toca Controles rápidos (cuatro puntos, abajo a la derecha) y luego el engranaje «Ajustes», en el extremo izquierdo de la barra.",
        detalle: "Se abre Ajustes de cámara.",
      },
      {
        pantalla: "sam-ajustes-camara",
        resaltar: "Guía de composición",
        gesto: "tocar",
        texto: "Toca «Guía de composición». En One UI 6.1 o anterior se llama «Líneas de cuadrícula» o «Líneas guía».",
        detalle: "Se abren las opciones de cuadrícula y nivel.",
      },
      {
        pantalla: "sam-guia-composicion",
        resaltar: "Cuadrícula 3×3",
        gesto: "tocar",
        texto: "Activa el interruptor, elige la cuadrícula 3×3 y activa el nivel. Vuelve con la flecha Atrás.",
        detalle: "El visor muestra 2 líneas horizontales y 2 verticales: coloca los ojos del sujeto sobre la línea horizontal de arriba.",
      },
      {
        pantalla: "sam-toque",
        resaltar: "Rostro",
        gesto: "tocar",
        texto: "En modo VIDEO, toca una vez la cara o los ojos del sujeto.",
        detalle: "Aparece un círculo de enfoque y una barra de brillo con un sol. El foco y la exposición aún pueden cambiar si el sujeto o la luz se mueven.",
      },
      {
        pantalla: "sam-bloqueo",
        resaltar: "Rostro",
        gesto: "mantener",
        texto: "Mantén el dedo sobre la cara 1 a 2 segundos, hasta que aparezca «Bloqueo AF/AE».",
        detalle: `El círculo se pone amarillo: foco y exposición quedan fijos aunque alguien cruce. ${VARIA_SEGUN_VERSION}: el gesto es clásico en Samsung, pero no hay una guía oficial reciente para el modo VIDEO. Si no aparece, usa VIDEO PRO (pasos 8 a 11).`,
      },
      {
        pantalla: "sam-bloqueo",
        resaltar: "Sol",
        gesto: "deslizar-arriba",
        texto: "Si la cara se ve muy clara u oscura, desliza la barra del sol sin tocar otra zona del visor.",
        detalle: "El brillo cambia y el bloqueo se mantiene. Para desbloquear, toca otra zona de la pantalla.",
      },
      {
        pantalla: "sam-ajustes-camara",
        resaltar: "Rastreo con enfoque automático",
        gesto: "tocar",
        texto: "Si el sujeto camina y lo acompañas: activa «Rastreo con enfoque automático» y, en modo VIDEO, toca al sujeto una vez (sin mantener).",
        detalle: "El foco sigue a la persona. Para entrevistas fijas es mejor el Bloqueo AF/AE.",
      },
      {
        pantalla: "sam-video-pro-speed",
        resaltar: "1/120",
        gesto: "tocar",
        texto: "En «MÁS» > «VIDEO PRO», toca «SPEED» y elige 1/120 para 4K 60 (1/60 si falta luz) o 1/240 para 4K 120.",
        detalle: "La obturación queda fija y el movimiento se ve natural. 1/60 y 1/120 no parpadean con las luces de 60 Hz de Perú; con 1/240, si ves bandas o pulsos de brillo, baja a 1/120.",
      },
      {
        pantalla: "sam-video-pro-iso",
        resaltar: "200",
        gesto: "tocar",
        texto: "Toca «ISO» y bájalo lo más posible sin que la cara quede oscura (unos 50 a 400 de día). Si necesitas pasar de unos 800, enciende la luz LED de mano en vez de subir más el ISO.",
        detalle: "La exposición queda fija. Con ISO y SPEED manuales, EV ya no se ajusta: se corrige con luz o ISO.",
      },
      {
        pantalla: "sam-video-pro-wb",
        resaltar: "5500K",
        gesto: "tocar",
        texto: "Toca «WB» y fija los grados Kelvin: unos 5500 K con luz de día, de 3200 a 4000 K con luz cálida de interior, o el valor que marque tu luz LED.",
        detalle: "El color de la piel no cambia durante la toma.",
      },
      {
        pantalla: "sam-video-pro-focus",
        resaltar: "Regla de foco",
        gesto: "deslizar-lado",
        texto: "Toca «FOCUS», pasa a MF y arrastra la regla (flor = cerca, montaña = lejos) hasta que los bordes verdes aparezcan sobre los ojos. Si el sujeto se va a mover, deja AF y toca los ojos.",
        detalle: "El foco queda clavado en los ojos. El resaltado verde solo se ve mientras mueves la regla (S24 o posterior).",
      },
      {
        pantalla: "sam-af-ae",
        resaltar: "AE",
        gesto: "deslizar-lado",
        texto: "Opcional, a contraluz: en VIDEO PRO con AF, mantén presionado sobre la cara y arrastra el círculo de exposición (AE) a otra zona.",
        detalle: `El foco queda en la cara y la exposición se mide en otro punto. ${VARIA_SEGUN_VERSION}: este gesto solo aparece en foros de la comunidad Samsung (confianza baja).`,
      },
      {
        pantalla: "sam-monitor-exposicion",
        resaltar: "Falso color",
        gesto: "tocar",
        texto: "Con LOG activo: toca el ícono de dos círculos, activa «Falso color» y ajusta ISO o luz hasta que la cara se vea verde claro. Activa «Zebra» y comprueba que no haya rayas sobre la piel.",
        detalle: "Exposición correcta para Log: ni quemada ni subexpuesta.",
      },
      {
        pantalla: "sam-camera-assistant",
        resaltar: "Enfoque y exposición al tocar",
        gesto: "tocar",
        texto: "Opcional (One UI 8.5): en la app Camera Assistant (Good Lock o Galaxy Store) configura cómo se comportan foco y exposición al tocar durante la grabación en Pro y guarda un preset (ISO, SPEED, EV, FOCUS, WB).",
        detalle: `Evita cambios por un toque accidental. ${VARIA_SEGUN_VERSION}: los nombres de estas opciones cambian entre versiones.`,
      },
    ],
    notas: [
      "Los nombres en VIDEO PRO pueden estar en inglés (ISO, SPEED, EV, FOCUS, WB) aunque el teléfono esté en español.",
      "Con VIDEO PRO en horizontal, la fila de controles pasa al lado derecho de la pantalla.",
      "Haz el bloqueo antes de grabar; si el sujeto cambia de distancia, vuelve a bloquear entre tomas.",
      `${VARIA_SEGUN_VERSION}: el Bloqueo AF/AE por pulsación larga en modo VIDEO (confianza media) y la separación de los círculos AF/AE (confianza baja) conviene validarlos en el equipo real.`,
    ],
    fuentes: [SAMSUNG.guiaComposicion, SAMSUNG.ajustes, SAMSUNG.rastreo, SAMSUNG.camara, SAMSUNG.pro, SAMSUNG.developerLog],
  },

  /* ================================================================== SONY */
  "zve10-formato": {
    id: "zve10-formato",
    dispositivo: "SONY_ZVE10",
    titulo: "Sony ZV-E10 y ZV-E10 II: 4K, fps, cámara lenta, vertical y cuadrícula",
    requisitos: [
      "Identifica el modelo: «ZV-E10» (2021, menú con fichas arriba) o «ZV-E10 II / ZV-E10M2» (2024, fichas en una columna a la izquierda). Las rutas cambian entre modelos.",
      "La ZV-E10 original NO graba 4K a 60 ni 4K a 120: su 4K llega a 30p y los 120 fps solo existen en Full HD. La ZV-E10 II sí graba 4K a 60 (10 bits) y, con la licencia gratuita de Sony, 4K a 120.",
      "Firmware al día: ZV-E10 Ver. 2.03; ZV-E10 II Ver. 1.02.",
      "Tarjeta: ZV-E10 → SDXC U3/V30. ZV-E10 II (acepta UHS-I y UHS-II) → U3 alcanza para 4K 60p a 200M sin proxy; V60 si activas el proxy, para la cámara lenta S&Q sin licencia o para 4K 120p con la licencia (280M); V90 para XAVC S-I y, con la licencia instalada, para cualquier cámara lenta S&Q, también en HD.",
      "Para grabar en vertical: soporte en L, jaula o cabezal que gire 90°.",
      "Batería cargada (ZV-E10: NP-FW50; ZV-E10 II: NP-FZ100).",
    ],
    pasos: [
      {
        pantalla: "sony-superior",
        resaltar: "Imagen/Película/S&Q",
        gesto: "tocar",
        texto: "ZV-E10: pulsa el botón Imagen/Película/S&Q hasta ver el modo película. ZV-E10 II: gira el conmutador de 3 posiciones a Película (ícono de videocámara).",
        detalle: "La cámara queda en modo película y los menús muestran los ajustes de video.",
      },
      {
        pantalla: "sony-modo-toma",
        resaltar: "Exposic. manual",
        gesto: "tocar",
        texto: "ZV-E10 II: con la rueda de control elige «Exposic. manual» y pulsa el centro. ZV-E10: MENU > Ajustes de cámara2 > [Modo de toma] > «Exposición manual».",
        detalle: "Aparece «M»: controlas obturador, abertura e ISO. 120p no se puede elegir en Auto. inteligente.",
      },
      {
        pantalla: "sony-toma",
        resaltar: "MENU",
        gesto: "tocar",
        texto: "Pulsa MENU (arriba a la derecha del dorso). En la ZV-E10 las fichas están arriba y Fn pasa a la ficha siguiente; en la ZV-E10 II están en una columna a la izquierda.",
        detalle: "Se abre el menú en la última ficha usada.",
      },
      {
        pantalla: "sony-menu-ntsc",
        resaltar: "Selector NTSC/PAL",
        gesto: "tocar",
        texto: "Revisa el sistema de video. ZV-E10: MENU > Ajustes > [Selector NTSC/PAL]. ZV-E10 II: MENU > Ajustes > [Área/fecha] > [Selector NTSC/PAL]. Solo si está en PAL, cámbialo a NTSC.",
        detalle: "Quedan 24p, 30p, 60p y 120p, que sirven para Perú (red de 60 Hz).",
      },
      {
        pantalla: "sony-menu-formato",
        resaltar: "XAVC S 4K",
        gesto: "tocar",
        texto: "ZV-E10: MENU > Ajustes de cámara2 > [Formato archivo] > «XAVC S 4K». ZV-E10 II: MENU > Toma > [Calid. img/grab.] > [Formato archivo] > «XAVC S 4K» (H.264, más fácil de editar) o «XAVC HS 4K» (H.265, más liviano pero exige un equipo potente).",
        detalle: "Aparece el indicador 4K en la pantalla de toma.",
      },
      {
        pantalla: "sony-menu-grabar-ajuste",
        resaltar: "30p 100M",
        gesto: "tocar",
        texto: "ZV-E10 (no tiene 4K 60p): [Grabar ajuste] > «30p 100M». Si necesitas 60 fps: [Formato archivo] «XAVC S HD» + [Grabar ajuste] «60p 50M».",
        detalle: "4K 30p con un recorte de 1.23x (el 4K 24p no recorta).",
      },
      {
        pantalla: "sony-menu-ii-video",
        resaltar: "200M 4:2:2 10bit",
        gesto: "tocar",
        texto: "ZV-E10 II: MENU > Toma > [Calid. img/grab.] > [Ajustes de vídeo]: [Vel. transm. grab.] «60p» y [Grabar ajuste] «200M 4:2:2 10bit». Si grabas en LOG, evita «150M 4:2:0 8bit».",
        detalle: "4K 60p de 10 bits, con recorte de 1.1x (1.5x si SteadyShot está en Activo).",
      },
      {
        pantalla: "sony-menu-grabar-hd",
        resaltar: "120p 100M",
        gesto: "tocar",
        texto: "Cámara lenta en la ZV-E10 (con sonido): [Formato archivo] «XAVC S HD» + [Grabar ajuste] «120p 100M». En el editor se pasa a 30p (4 veces más lento).",
        detalle: "Cámara lenta en Full HD con un recorte de ~1.14x. A 120p no funcionan la detección de cara/ojos ni el Seguimiento táctil.",
      },
      {
        pantalla: "sony-menu-sq",
        resaltar: "120fps",
        gesto: "tocar",
        texto: "Alternativa S&Q: pon la cámara en S&Q, [Modo de toma] en Exposición manual, y en MENU > Ajustes de cámara2 > [Aj. cám. len+ráp]: [Grabar ajuste] «30p» y [Veloc transmisión] «120fps».",
        detalle: "La cámara entrega el clip ya ralentizado, en Full HD y SIN sonido. A 120fps en S&Q no hay detección de cara/ojos: fija el foco con un toque o en manual antes de grabar.",
      },
      {
        pantalla: "sony-menu-ii-hd120",
        resaltar: "120p",
        gesto: "tocar",
        texto: "ZV-E10 II sin licencia: [Formato archivo] «XAVC S HD» + [Vel. transm. grab.] «120p» + [Grabar ajuste] «100M 4:2:0 8bit». En S&Q no se puede elegir 120fps con formatos 4K.",
        detalle: "Cámara lenta 4 veces más lenta en Full HD.",
      },
      {
        pantalla: "sony-licencia",
        resaltar: "Tarjeta SD",
        gesto: "tocar",
        texto: "ZV-E10 II y 4K 120p: en creatorscloud.sony.net/cameraupgrade/4k120p/ inicia sesión, genera el archivo de licencia de tu cámara y cópialo a la RAÍZ de la tarjeta. Inserta la tarjeta, enciende la cámara, sigue las instrucciones y confirma con OK.",
        detalle: "Después: «XAVC S 4K» o «XAVC HS 4K» > [Vel. transm. grab.] «120p» > [Grabar ajuste] «280M 4:2:2 10bit». Recorte de ~1.6x, sin SteadyShot Activo ni proxy.",
      },
      {
        pantalla: "sony-vertical",
        resaltar: "Soporte en L",
        texto: "Por defecto se graba en vertical (9:16, tipo Reels): monta la cámara girada 90° en un soporte en L, una jaula o un cabezal que gire.",
        detalle: "En las dos cámaras el clip vertical se ve horizontal al reproducirlo en la cámara: en el editor usa un proyecto 9:16 y rota el clip si hace falta.",
      },
      {
        pantalla: "sony-menu-vertical",
        resaltar: "Visualización vertical",
        gesto: "tocar",
        texto: "ZV-E10 II: MENU > Ajustes > [Monitor] > [Visualización vertical] > «Activar». La ZV-E10 no tiene este ajuste: la información se ve de lado, pero la cuadrícula sirve igual.",
        detalle: "En la ZV-E10 II los íconos giran con la cámara.",
      },
      {
        pantalla: "sony-menu-marcador",
        resaltar: "Marcador aspecto",
        gesto: "tocar",
        texto: "Solo si grabas en horizontal (tipo YouTube) y además quieres sacar un Reel, en la ZV-E10 II: MENU > Toma > [Visual. marcador] «Activar», [Marcador aspecto] «9:16» y [Marcador central] «Activar».",
        detalle: "Verás el recuadro vertical dentro del cuadro horizontal (siguiente paso). La ZV-E10 no tiene marcador 9:16.",
      },
      {
        pantalla: "sony-marcador",
        resaltar: "Marcador 9:16",
        texto: "Mantén al sujeto dentro del recuadro 9:16 al grabar en horizontal.",
        detalle: "Un 4K horizontal permite recortar 1215 × 2160 px, que alcanza para un Reel de 1080 × 1920.",
      },
      {
        pantalla: "sony-menu-cuadricula",
        resaltar: "Cuadr. regla tercios",
        gesto: "tocar",
        texto: "ZV-E10: MENU > Ajustes de cámara2 > [Línea de cuadrícula] > «Cuadr. regla tercios». ZV-E10 II: MENU > Toma > [Visualizac. toma] > [Vis. lín. cuadrícul.] «Activar» y [Tipo lín. cuadríc.] «Cuadr. regl. terc.».",
        detalle: "Aparecen 2 líneas horizontales y 2 verticales.",
      },
      {
        pantalla: "sony-cuadricula",
        resaltar: "Línea superior",
        texto: "Encuadra con los ojos del sujeto sobre la línea horizontal SUPERIOR.",
        detalle: "Aire justo sobre la cabeza y el rostro fuera de la franja superior de la interfaz de Reels.",
      },
    ],
    notas: [
      "Todas las rutas de menú vienen de las Guías de ayuda oficiales de Sony en español. Las posiciones de botones y fichas en las maquetas son aproximadas.",
      "Con la ZV-E10 la regla «siempre 4K 60 / cámara lenta 4K 120» no se puede cumplir. Equivalente práctico: 4K 30p para tomas normales, Full HD 60p cuando haga falta fluidez de 60 fps y Full HD 120p para cámara lenta.",
      "En la ZV-E10 II a 4K 60p con «Temp. APAGA auto: Estándar», la cámara puede apagarse a los ~5 min (25 °C). Ver la guía de audio, batería y calor.",
      "No uses [Ajust. vlogs cinemat.] de la ZV-E10 II: fija 24 fps y pone barras negras.",
    ],
    fuentes: [SONY.zve10, SONY.zve10ii, SONY.licencia, SONY.creatorsCloud],
  },

  "zve10-log": {
    id: "zve10-log",
    dispositivo: "SONY_ZVE10",
    titulo: "Sony ZV-E10 y ZV-E10 II: grabar en LOG (S-Log3)",
    requisitos: [
      "Lo ideal es la ZV-E10 II (10 bits). La ZV-E10 solo graba 8 bits 4:2:0: S-Log3 funciona, pero con más ruido y riesgo de bandas en cielos y paredes.",
      "Luz: S-Log3 sube el ISO mínimo, así que en interiores o de noche la luz LED de mano es obligatoria.",
      "Filtro ND (variable) de 40.5 mm para el objetivo de kit 16-50 en exteriores.",
      "Tarjeta SDXC (en la ZV-E10 II, [Insertar archivo LUT] no funciona con SD/SDHC).",
      "LUT de Sony para el editor (S-Log3/S-Gamut3.Cine → 709 o s709).",
      "Balance de blancos fijo, definido ANTES de activar LOG.",
    ],
    pasos: [
      {
        pantalla: "sony-menu-balance",
        resaltar: "Luz diurna",
        gesto: "tocar",
        texto: "Fija el balance de blancos ANTES de activar S-Log3. ZV-E10: MENU > Ajustes de cámara1 > [Balance blanco]. ZV-E10 II: MENU > Exposición/color > [Balance blancos] > [Balance blanco]. Elige un preajuste o haz el personalizado; no uses AWB en tomas que se van a unir.",
        detalle: "El color queda igual en toda la toma. Sony avisa que el balance personalizado puede dar error con S-Log3.",
      },
      {
        pantalla: "sony-menu-perfil",
        resaltar: "PP8 S-Log3",
        gesto: "tocar",
        texto: "ZV-E10: MENU > Ajustes de cámara1 > [Perfil de imagen] > «PP8» (S-Log3 + S-Gamut3.Cine) y pulsa el centro de la rueda.",
        detalle: "La imagen se ve gris y lavada (es normal) y aparece «PP8» en la pantalla.",
      },
      {
        pantalla: "sony-menu-gamma",
        resaltar: "Automático",
        gesto: "tocar",
        texto: "ZV-E10: MENU > Ajustes > [Asist. visual. Gamma] > «Automático».",
        detalle: "La pantalla muestra contraste normal (S-Log3 → 709(800%)), pero el archivo se sigue grabando en S-Log3.",
      },
      {
        pantalla: "sony-menu-toma-log",
        resaltar: "Toma Log",
        gesto: "tocar",
        texto: "ZV-E10 II (no tiene PP8): MENU > Toma > [Calid. img/grab.] > [Ajuste de toma Log]: [Toma Log] «Activ. (ISO flexible)», [Gama de color] «S-Gamut3.Cine» e [Insertar archivo LUT] «Activar».",
        detalle: "Graba S-Log3. [Perfil de imagen] queda en Desactivar y [Asist. visual. Gamma] se bloquea: se usa la LUT.",
      },
      {
        pantalla: "sony-menu-lut",
        resaltar: "s709",
        gesto: "tocar",
        texto: "ZV-E10 II: MENU > Exposición/color > [Color/tono] > [Seleccionar LUT] > «s709». Después MENU > Ajustes > [Opción de visual.] > [Visualizar LUT] > «Activar».",
        detalle: "Ves la imagen ya corregida mientras grabas; el archivo queda en S-Log3 con la LUT incrustada.",
      },
      {
        pantalla: "sony-menu-ii-video",
        resaltar: "200M 4:2:2 10bit",
        gesto: "tocar",
        texto: "Formato: ZV-E10 II «XAVC S 4K» 60p «200M 4:2:2 10bit» (o «XAVC HS 4K» de 10 bits); con licencia a 120p, «280M 4:2:2 10bit». ZV-E10: 4K «30p 100M», el mejor bitrate que tiene.",
        detalle: "LOG en 10 bits (ZV-E10 II) o con el bitrate máximo (ZV-E10).",
      },
      {
        pantalla: "sony-toma-log",
        resaltar: "ISO",
        gesto: "tocar",
        texto: "En modo M, pulsa ISO (lado derecho de la rueda) y baja al valor más bajo que ofrezca la cámara en LOG. Pon el obturador según los fps (guía de exposición) y ajusta abertura, luz o ND hasta que el indicador MM marque entre +1 y +1.7.",
        detalle: `Imagen algo sobreexpuesta y con menos ruido; en edición se baja con la LUT sin perder sombras. ${VARIA_SEGUN_VERSION}: Sony no publica el ISO mínimo exacto de S-Log3 en estos modelos (suele ser 800) y el +1 a +1.7 es práctica común, no dato oficial. Verifícalo en tu cámara.`,
      },
      {
        pantalla: "sony-menu-cebra",
        resaltar: "Nivel de cebra",
        gesto: "tocar",
        texto: "Activa las cebras. ZV-E10: MENU > Ajustes de cámara2 > [Ajuste de cebra]. ZV-E10 II: MENU > Exposición/color > [Visualizac. cebra]. Para ver lo quemado usa el nivel más alto; para la piel, un Personalizado 1 con ventana estrecha (±2 o ±3) alrededor de ~52 % (o ~60 % si sobreexpones +1).",
        detalle: "Las rayas marcan lo quemado y si la cara está en el nivel buscado. Las cebras no salen por HDMI.",
      },
      {
        pantalla: "sony-menu-lut-usuario",
        resaltar: "Importar/editar",
        gesto: "tocar",
        texto: "LUT propia (ZV-E10 II): copia el .cube (17 o 33 puntos, nombre de 63 caracteres como máximo) a /Private/Sony/PRO/LUT de la tarjeta. En la cámara: MENU > Exposición/color > [Color/tono] > [Gestionar LUT usuar.] > [Importar/editar], elige User1, la tarjeta y el archivo, y acepta.",
        detalle: "La LUT de la marca aparece como User1 en [Seleccionar LUT].",
      },
      {
        pantalla: "editor-lut",
        resaltar: "LUT",
        gesto: "tocar",
        texto: "En el editor (CapCut, Premiere, DaVinci Resolve) aplica primero la LUT de conversión de Sony (S-Log3/S-Gamut3.Cine → 709 o s709; DaVinci trae SLog3SGamut3.CineToLC-709) o la LUT incrustada. Después ajusta exposición y color.",
        detalle: "Colores y contraste normales, con más rango en luces y sombras.",
      },
      {
        pantalla: "sony-menu-perfil-ii",
        resaltar: "PP11 S-Cinetone",
        gesto: "tocar",
        texto: "Excepción solo si el dueño la aprueba por falta de tiempo de edición (ZV-E10 II): [Toma Log] en «Desactivar» y MENU > Exposición/color > [Color/tono] > [Perfil de imagen] > «PP11» (S-Cinetone).",
        detalle: "Look cinematográfico listo para publicar, sin LUT. La ZV-E10 no tiene S-Cinetone.",
      },
    ],
    notas: [
      "En LOG la luz LED de mano es obligatoria: sin ella, la imagen de interior o de noche sale con ruido.",
      "En la ZV-E10 (8 bits) el LOG rinde menos que en la ZV-E10 II (10 bits): sobreexpón (+1 a +1.7), ilumina bien y usa la LUT de Sony.",
      "Un tutorial que diga «elige PP8» no sirve para la ZV-E10 II: ahí el LOG se activa en [Ajuste de toma Log].",
      "No uses [Ajust. vlogs cinemat.] en la ZV-E10 II: fija 24 fps y pone barras negras.",
    ],
    fuentes: [SONY.zve10, SONY.zve10ii, SONY.recursosPro],
  },

  "zve10-enfoque": {
    id: "zve10-enfoque",
    dispositivo: "SONY_ZVE10",
    titulo: "Sony ZV-E10 y ZV-E10 II: enfoque en los ojos, fijar foco con un toque y enfoque manual",
    requisitos: [
      "Objetivo con autofoco (el 16-50 PZ de kit sirve).",
      "Operación táctil activada.",
      "Modo película: en video solo existen AF continuo y Enfoque manual.",
    ],
    pasos: [
      {
        pantalla: "sony-menu-enfoque",
        resaltar: "AF continuo",
        gesto: "tocar",
        texto: "ZV-E10: MENU > Ajustes de cámara1 > [Modo de enfoque] > «AF continuo». ZV-E10 II: MENU > Enfoque > [AF/MF] > [Modo de enfoque] > «AF continuo».",
        detalle: "El foco se corrige solo mientras el sujeto se mueve.",
      },
      {
        pantalla: "sony-menu-area",
        resaltar: "Ancho",
        gesto: "tocar",
        texto: "[Área de enfoque]: «Ancho» para una persona que habla a cámara, o «Zona» si hay objetos delante. En la ZV-E10 II el enfoque táctil solo funciona con Ancho, Zona, Fijo al centro o sus versiones de Seguimiento.",
        detalle: "La cámara busca al sujeto en toda la pantalla o en la zona elegida.",
      },
      {
        pantalla: "sony-menu-cara",
        resaltar: "Priorid. cara/ojos AF",
        gesto: "tocar",
        texto: "ZV-E10: MENU > Ajustes de cámara1 > [Ajust. AF cara/ojos]: [Priorid. cara/ojos AF] «Activar», [Detección de motivo] «Humano», [Visual. cuadro c./oj.] «Activar». ZV-E10 II: MENU > Enfoque > [Reconoc. motivo]: [Rec. motivo en AF] «Activar», [Dest. reconocim.] «Humano».",
        detalle: "Aparece un cuadro sobre la cara o el ojo y el foco se queda en los ojos.",
      },
      {
        pantalla: "sony-menu-tactil",
        resaltar: "Enfoque táctil",
        gesto: "tocar",
        texto: "Activa MENU > Ajustes > [Operación táctil]. Luego, ZV-E10: MENU > Ajustes de cámara2 > [Func. de oper. táctil]; ZV-E10 II: MENU > Ajustes > [Operación táctil] > [Pantalla de toma] > [Func. táctil dur. toma]. «Enfoque táctil» FIJA el foco; «Seguimiento táctil» sigue a quien camina.",
        detalle: "En la ZV-E10 II, «Enfoq. táctil+AE» además mide la exposición en ese punto (no la bloquea: sigue ajustándose si cambia la luz).",
      },
      {
        pantalla: "sony-toma-tactil",
        resaltar: "Rostro",
        gesto: "tocar",
        texto: "Para FIJAR el foco: con AF continuo y «Enfoque táctil», toca la cara en la pantalla, antes o durante la grabación. Para soltarlo, toca el ícono de cancelar o pulsa el centro de la rueda.",
        detalle: "La cámara pasa un momento a enfoque manual: el foco queda fijo aunque algo cruce delante. Con «Seguimiento táctil», el cuadro sigue al sujeto.",
      },
      {
        pantalla: "sony-menu-vel-af",
        resaltar: "Vel. transición AF",
        gesto: "tocar",
        texto: "Punto de partida sugerido: [Vel. transición AF] 4–5 (cambios de foco suaves) y [S. camb motiv. AF] 2–3 (que no salte al fondo). Para acción rápida, sube ambos.",
        detalle: "Transiciones más cinematográficas y menos saltos. Son valores recomendados, no oficiales.",
      },
      {
        pantalla: "sony-toma",
        resaltar: "Present. producto",
        gesto: "tocar",
        texto: "Botón Present. producto (abajo a la derecha del dorso; en la ZV-E10 comparte con Borrar): púlsalo solo para mostrar productos y vuelve a pulsarlo al terminar. No se puede cambiar mientras grabas.",
        detalle: "La cámara enfoca lo más cercano (el producto) e ignora las caras. Desactívalo al volver a grabar a una persona.",
      },
      {
        pantalla: "sony-superior",
        resaltar: "C1 / Desenfocar el fondo",
        gesto: "tocar",
        texto: "Botón C1 / Desenfocar el fondo (arriba, junto a MOVIE): alterna Desenfocado y Nítido. En la ZV-E10 II el nivel se ajusta en MENU > Toma > [Opción de toma] > [Aj. niv. desenfoc.].",
        detalle: "Fondo más desenfocado (abre el diafragma). Se cancela al pulsar MENU, cambiar de modo o apagar.",
      },
      {
        pantalla: "sony-menu-resalte",
        resaltar: "Visual. resalte",
        gesto: "tocar",
        texto: "Enfoque manual (por ejemplo, cámara lenta a 120p o en S&Q a 120fps en la ZV-E10, donde no hay detección de ojos): [Modo de enfoque] «Enfoque man.» y resalte «Activar», nivel «Medio», color «Rojo». ZV-E10 II: MENU > Enfoque > [Visualiz. resalte].",
        detalle: "Los bordes enfocados se resaltan en rojo.",
      },
      {
        pantalla: "sony-toma-resalte",
        resaltar: "Contorno",
        texto: "Gira el anillo del objetivo hasta que el contorno del sujeto brille en rojo. En la ZV-E10 II puedes ampliar con MENU > Enfoque > [Asistencia enfoq.] > [Amplific. enfoque].",
        detalle: "Foco manual preciso sobre el sujeto.",
      },
    ],
    notas: [
      "A 120p o en S&Q a 120fps, la ZV-E10 no detecta cara ni ojos (a 120p tampoco funciona el Seguimiento táctil): enfoca con un toque o en manual antes de grabar.",
      "En la ZV-E10 II, [Conm.áreaAF V/H] (MENU > Enfoque > [Área de enfoque]) recuerda un área distinta en vertical y en horizontal.",
    ],
    fuentes: [SONY.zve10, SONY.zve10ii],
  },

  "zve10-exposicion": {
    id: "zve10-exposicion",
    dispositivo: "SONY_ZVE10",
    titulo: "Sony ZV-E10 y ZV-E10 II: exposición en modo M, obturador por fps, ISO, ND y bloqueo",
    requisitos: [
      "Modo película en «Exposición manual» (guía de formato).",
      "Filtro ND variable de 40.5 mm (objetivo de kit 16-50) para exteriores.",
      "Luz LED de mano para interiores y de noche.",
      "Saber los fps elegidos (30p, 60p o 120p).",
    ],
    pasos: [
      {
        pantalla: "sony-toma",
        resaltar: "Obturador",
        gesto: "tocar",
        texto: "Pon el obturador según los fps (regla de 180° adaptada a la red de 60 Hz de Perú): 30p o 24p → 1/60; 60p → 1/125; 120p o S&Q a 120fps → 1/250. En la ZV-E10, en M, la rueda de control cambia el obturador.",
        detalle: "Movimiento natural y menos parpadeo con luces LED o fluorescentes.",
      },
      {
        pantalla: "sony-menu-obt-variable",
        resaltar: "Obturad. variable",
        gesto: "tocar",
        texto: "Si una luz parpadea o aparecen bandas a 1/125 o 1/250 (ZV-E10 II): MENU > Toma > [Obturad./silenc.] > [Ajust. sin parpadeo] > [Obturad. variable] «Activar» (solo en S o M) y ajusta a ~1/120, que no parpadea con la red de 60 Hz (a 30p también sirve ~1/60). En la ZV-E10 baja a 1/60.",
        detalle: "Imagen sin bandas oscuras.",
      },
      {
        pantalla: "sony-toma",
        resaltar: "ISO",
        gesto: "tocar",
        texto: "Pulsa ISO (lado derecho de la rueda) y pon un ISO fijo, no ISO AUTO: sin LOG, de 100 a 800 con buena luz; con LOG, el mínimo que permita la cámara.",
        detalle: "Exposición estable: en M con ISO fijo, la exposición ya queda «bloqueada».",
      },
      {
        pantalla: "sony-toma",
        resaltar: "Abertura",
        texto: "Elige el zoom ANTES de grabar y no hagas zoom durante la toma: el 16-50 de kit va de f/3.5 (16 mm) a f/5.6 (50 mm) y cambia el brillo. Con mucha luz, pon el ND en vez de subir el obturador.",
        detalle: "Brillo constante entre planos.",
      },
      {
        pantalla: "sony-menu-tecla",
        resaltar: "Alternar AEL",
        gesto: "tocar",
        texto: "Si trabajas en A/S/P o con ISO AUTO: asigna [Alternar AEL] a una tecla libre. ZV-E10: MENU > Ajustes de cámara2 > [Tecla person.] (película). ZV-E10 II: MENU > Ajustes > [Personal. operac.] > [Ajuste t. pers./dial]. Mide sobre la cara y pulsa la tecla; vuelve a pulsarla para liberar.",
        detalle: "Aparece el ícono de bloqueo AE y la exposición no cambia aunque el fondo varíe (contraluz, ventana). No funciona con zoom digital.",
      },
      {
        pantalla: "sony-menu-tactil-ii",
        resaltar: "Enfoq. táctil+AE",
        gesto: "tocar",
        texto: "Solo si trabajas en P/A/S o en M con ISO AUTO (con M e ISO fijo no cambia nada), en la ZV-E10 II: MENU > Ajustes > [Operación táctil] > [Pantalla de toma] > [Func. táctil dur. toma] > «AE táctil» o «Enfoq. táctil+AE».",
        detalle: "No disponible en la ZV-E10. Es medición automática en el punto tocado, no un bloqueo: para fijar la exposición usa [Alternar AEL] o M con ISO fijo.",
      },
      {
        pantalla: "sony-toma-ae",
        resaltar: "Rostro",
        gesto: "tocar",
        texto: "Solo en P/A/S o en M con ISO AUTO: toca la cara del sujeto y, si hace falta, desliza la barra de brillo que aparece.",
        detalle: "La cámara ajusta la exposición al brillo de la cara, pero no la bloquea. El ajuste de la barra se guarda como compensación de exposición.",
      },
      {
        pantalla: "sony-menu-obt-lento",
        resaltar: "Desactivar",
        gesto: "tocar",
        texto: "[Auto obtur. lento] > «Desactivar». ZV-E10: MENU > Ajustes de cámara2. ZV-E10 II: MENU > Exposición/color > [Exposición].",
        detalle: "La cámara no baja a 1/30 con poca luz (evita el movimiento borroso). Compensa con la luz LED.",
      },
      {
        pantalla: "sony-toma-cebra",
        resaltar: "Cebra",
        texto: "Con cebras activadas (sin LOG: «100 IRE o +» en la ZV-E10 II o Personalizado 2), baja la exposición hasta que las rayas no toquen la piel. Con LOG, sigue la guía de LOG.",
        detalle: "Las rayas marcan las zonas quemadas.",
      },
      {
        pantalla: "sony-menu-steadyshot",
        resaltar: "Estándar",
        gesto: "tocar",
        texto: "[SteadyShot]: en trípode, «Desactivar». En mano, moviéndote con el sujeto: «Activo» (recorta la imagen; en la ZV-E10 II limita el ISO a 6400 y no existe a 120p) o «Estándar» (solo el estabilizador del objetivo).",
        detalle: "Ninguna de las dos tiene estabilizador en el cuerpo.",
      },
    ],
    notas: [
      "1/125 y 1/250 son los valores de Sony más cercanos a 1/120 y 1/240. Con focos LED o fluorescentes de la red de 60 Hz pueden quedar bandas (más a 1/250 que a 1/125): prueba antes de grabar y, si aparecen, usa [Obturad. variable] a ~1/120 (ZV-E10 II) o baja a 1/60 (ZV-E10).",
      "El ND es imprescindible de día si hay que cumplir obturador por fps + LOG (ISO mínimo alto) + f/3.5.",
    ],
    fuentes: [SONY.zve10, SONY.zve10ii],
  },

  "zve10-audio-y-energia": {
    id: "zve10-audio-y-energia",
    dispositivo: "SONY_ZVE10",
    titulo: "Sony ZV-E10 y ZV-E10 II: audio, batería, calor y tarjetas",
    requisitos: [
      "Paravientos suministrado con la cámara.",
      "Opcional: micrófono externo de 3.5 mm o de zapata digital (ZV-E10 II) y auriculares de 3.5 mm.",
      "Batería de repuesto o power bank USB‑C (ZV-E10 II: USB-PD 9 V/3 A recomendado).",
      "Tarjeta correcta (ZV-E10: U3/V30; ZV-E10 II: U3 para 4K 60p sin proxy, V60 con proxy, en S&Q o en 4K 120p, y V90 para XAVC S-I y para S&Q con la licencia 4K 120p).",
    ],
    pasos: [
      {
        pantalla: "sony-paravientos",
        resaltar: "Paravientos",
        gesto: "tocar",
        texto: "Coloca el paravientos (la bola peluda) en la zapata sin que quede atrapado y no tapes el micrófono con los dedos.",
        detalle: "Menos ruido de viento en exteriores.",
      },
      {
        pantalla: "sony-menu-audio",
        resaltar: "Nivel grabac. audio",
        gesto: "tocar",
        texto: "ZV-E10: MENU > Ajustes de cámara2. ZV-E10 II: MENU > Toma > [Grabac. sonido]. [Grabación de sonido] «Activar», medidor visible y [Nivel grabac. audio] con izquierda/derecha de la rueda para que la voz no llegue al máximo. Reducción de viento solo con viento. ZV-E10 II: [Direccionalidad mic.] «Parte delantera» si habla el sujeto, «Parte trasera» si narras tú.",
        detalle: "Voz clara y sin saturar. Con micrófono externo, el interno se desactiva y la reducción de viento no actúa.",
      },
      {
        pantalla: "sony-toma-audio",
        resaltar: "Medidor de audio",
        texto: "Haz una prueba hablando a volumen normal y mira el medidor: los picos no deben tocar el máximo.",
        detalle: "S&Q y time-lapse no graban audio.",
      },
      {
        pantalla: "sony-lateral",
        resaltar: "Auriculares",
        gesto: "tocar",
        texto: "Conecta los auriculares a la toma de 3.5 mm y escucha una prueba antes de grabar.",
        detalle: "Detectas ruidos o saturación antes de la toma real.",
      },
      {
        pantalla: "sony-menu-energia",
        resaltar: "Alto",
        gesto: "tocar",
        texto: "MENU > Ajustes > [Opc. ajuste enrg.] > [Temp. APAGA auto]: en trípode y a 4K, «Alto». En mano, deja «Estándar» (Sony advierte riesgo de quemaduras leves con «Alto» en mano). Graba clips cortos, apaga entre tomas y evita el sol directo.",
        detalle: "Tiempos oficiales a 25 °C: ZV-E10 4K ~20 min (Estándar) / ~30 min (Alto). ZV-E10 II 4K 60p ~5 min (Estándar) / ~30 min (Alto); a 40 °C, ~10 min en Alto.",
      },
      {
        pantalla: "sony-lateral",
        resaltar: "USB‑C",
        gesto: "tocar",
        texto: "Sesiones largas: con la batería dentro, conecta un adaptador o power bank USB‑C (ZV-E10 II: USB-PD 9 V/3 A). En la ZV-E10 II, conecta o desconecta el cable solo con la cámara apagada.",
        detalle: "La cámara funciona con energía externa (la batería no carga mientras tanto). Autonomía oficial: ZV-E10 ~80 min de toma real; ZV-E10 II ~130 min.",
      },
      {
        pantalla: "sony-menu-formatear",
        resaltar: "Formatear",
        gesto: "tocar",
        texto: "Al empezar cada jornada, y DESPUÉS de respaldar los archivos, formatea la tarjeta en la cámara. ZV-E10: MENU > Ajustes > [Formatear]. ZV-E10 II: MENU > Toma > [Soporte] > [Formatear].",
        detalle: "Menos cortes de grabación. Formatear borra todo de forma permanente.",
      },
    ],
    notas: [
      "La ZV-E10 II a 4K 60p se calienta mucho antes que en HD: planifica tomas cortas, que en contenido vertical ya es lo normal.",
      "Si te mueves con el sujeto (cámara en mano), usa «Temp. APAGA auto: Estándar» o un gimbal o jaula con agarre: «Alto» es solo para trípode según Sony.",
      "Con SDHC los archivos se cortan cada 4 GB: usa SDXC.",
    ],
    fuentes: [SONY.zve10, SONY.zve10ii, SONY.licencia],
  },
};

export function deviceGuide(id: GuideId): DeviceGuide {
  return DEVICE_GUIDES[id];
}
