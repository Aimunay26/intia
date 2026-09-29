/**
 * Traduce el texto libre de `scene3d` (manual de procedimientos) a una configuración
 * tipada para el visor 3D. Es puro y está probado (tests/manual.test.mts y
 * tests/manual-scene-3d.test.mts).
 *
 * Trabaja por palabras clave, sin IA: reconoce lo más habitual del currículo
 * (entornos, tamaños de plano, ángulos, lentes, movimientos, esquemas de luz,
 * acciones del talento y pasos con tiempos «0-3 s»). Lo que no reconoce cae en
 * valores prudentes: estudio, plano medio a la altura de los ojos, 26 mm,
 * cámara fija y luz principal suave con relleno y contraluz. Los pasos en texto
 * siempre acompañan a la escena y son el equivalente completo.
 *
 * Además:
 * - Escenas armadas (`scene3d.preset` o palabras clave): pecho, contrapicado,
 *   picado, podcast, seguimiento, 3 puntos con contraluz de color y luz de mano.
 * - Encuadre: en los planos con persona, los ojos caen sobre la línea horizontal
 *   superior de los tercios (se resuelve la inclinación de la cámara con el FOV).
 * - Formato vertical 9:16 (por defecto) u horizontal 16:9.
 * - «Ver lo incorrecto»: `sceneVariant` arma la versión con un error para compararla. Los
 *   errores de la lección van primero y siempre se suman los universales (contraluz, codos,
 *   pies, ojos fuera del tercio…). Un paso que empieza con «[ERROR]» muestra ese error
 *   mientras dura.
 * - En 16:9 el sujeto va en un tercio (espacio de mirada), no al centro.
 */
import type { SceneMistake, ScenePreset } from "@/lib/manual";

export type { SceneMistake, ScenePreset };
export type SceneEnvironment = "estudio" | "tienda" | "mesa" | "sala" | "calle";
export type ShotSize = "general" | "entero" | "americano" | "medio" | "medioCorto" | "primerPlano" | "detalle";
export type CameraAngle = "ojos" | "picado" | "contrapicado" | "cenital" | "holandes";
export type CameraMove = "fija" | "paneo" | "tilt" | "travelling" | "pushIn" | "pullOut" | "orbita" | "seguimiento" | "mano" | "whip";
export type SubjectAction = "idle" | "walkIn" | "walk" | "turn" | "showProduct" | "lookLens" | "lookAway" | "sit" | "point" | "react" | "talk";
export type LightRole = "key" | "fill" | "back" | "background";
/**
 * `mano`: luz LED pequeña sostenida por una persona cerca del sujeto (poca luz); con `side: 0`
 * va pegada al lente (error). `lampara`: lámpara encendida detrás del sujeto (contraluz de noche).
 */
export type LightSource = "softbox" | "window" | "sun" | "ring" | "bounce" | "led" | "mano" | "lampara";
export type ProductKind = "taza" | "prenda" | "plato" | "caja" | "celular";
export type BeatTone = "error" | "ok" | "neutral";
export type FrameFormat = "vertical" | "horizontal";
/** Altura del trípode fijada por regla: pecho (informativo) o los dos errores. */
export type HeightRule = "pecho" | "muyBajo" | "muyAlto";
export type SceneMotion = "fluido" | "brusco";
/** Fondo: normal, ventana brillante detrás del sujeto (contraluz de día), lámpara detrás (contraluz de noche) o pared pegada al sujeto. */
export type SceneBackdrop = "normal" | "ventana" | "lampara" | "pegado";
export type SceneStaging = "normal" | "podcast";
export type SceneBody = {
  /** Codos cerca del cuerpo (correcto) o abiertos, brazos en jarra (incorrecto). */
  elbows: "pegados" | "abiertos";
  /** Un pie adelantado y rodillas sueltas (correcto) o pies juntos y piernas rígidas (incorrecto). */
  feet: "adelantado" | "juntos";
};

/** Color de una luz RGB (contraluz de color); sin él, la luz es bicolor y manda `kelvin`. */
export type LightColor = { hex: string; name: string };
export type SceneLight = { role: LightRole; source: LightSource; side: -1 | 0 | 1; kelvin: number; hard: boolean; intensity: number; rgb?: LightColor };
export type SceneBeat = {
  index: number;
  text: string;
  /** Tiempo original del guion de la escena («0-3 s»), si venía escrito. */
  timeLabel: string | null;
  /** Tiempo de reproducción en el visor (segundos), acumulado y con un mínimo legible. */
  start: number;
  end: number;
  shot: ShotSize;
  angle: CameraAngle;
  focalMm: number;
  action: SubjectAction;
  tone: BeatTone;
  /** El paso describe una vista de conjunto («vista superior», «vista lateral»): el visor mueve la vista libre. */
  overview: "Arriba" | "Lateral" | null;
  /** Ángulo de la luz principal respecto del eje de cámara («key a 90°»), si el paso lo mueve. */
  keyAngle: number | null;
  /** Altura de la luz principal en metros («la key sube a 2.3 m»), si el paso la cambia. */
  keyHeight: number | null;
  /** Error que el visor muestra mientras dura el paso («[CONTRALUZ] 0-2 s: …»); null = versión correcta. */
  mistake: SceneMistake | null;
};
export type SceneConfig = {
  environment: SceneEnvironment;
  props: { table: boolean; tableInFront: boolean; window: boolean; sofa: boolean; shelf: boolean; bench: boolean; product: ProductKind };
  subjects: {
    /** Personas en escena sin contar a quien opera la cámara. */
    count: 1 | 2;
    actions: SubjectAction[];
    seated: boolean;
    /** Quien graba aparece en la escena (maniquí F, filmmaker): va detrás del celular. */
    operator: boolean;
    /** Escena solo de producto: no hay talento frente a cámara. */
    productOnly: boolean;
    /** Lado por el que entra a cuadro: -1 izquierda, 1 derecha. */
    enterFrom: -1 | 1;
  };
  camera: { shots: ShotSize[]; angle: CameraAngle; focalMm: number; move: CameraMove; handheld: boolean };
  lights: SceneLight[];
  lightingLabels: string[];
  beats: SceneBeat[];
  duration: number;
  /** Escena armada: viene de `scene3d.preset` o se detecta por palabras clave. */
  preset: ScenePreset | null;
  /** Errores que se pueden comparar con «Incorrecto», en el orden en que se muestran. */
  mistakes: SceneMistake[];
  /** Error que se está mostrando (null = versión correcta). Lo fija `sceneVariant`. */
  mistake: SceneMistake | null;
  format: FrameFormat;
  staging: SceneStaging;
  body: SceneBody;
  /**
   * `eyeLine`: dónde caen los ojos, en fracción del alto del cuadro desde arriba (1/3 = correcto).
   * `screenX`: posición horizontal forzada del sujeto (NDC); null = automática (podcast o tercio en 16:9).
   * `thirdSide`: tercio en el que va el sujeto en 16:9 (-1 izquierdo, 1 derecho).
   * `forceAngle` y `tiltScale`: ángulo exagerado de los errores de contrapicado o picado.
   */
  framing: { eyeLine: number; heightRule: HeightRule | null; screenX: number | null; thirdSide: -1 | 1; forceAngle: CameraAngle | null; tiltScale: number };
  motion: SceneMotion;
  /** Luz ambiente relativa: 1 normal; menos es una escena con poca luz o a contraluz. */
  ambient: number;
  backdrop: SceneBackdrop;
};
export type Scene3dInput = {
  environment?: string;
  subjects?: string;
  camera?: string;
  lighting?: string;
  beats?: readonly string[];
  preset?: string | null;
  errores?: readonly string[] | null;
} | null | undefined;

/* ------------------------------------------------------------ CATÁLOGOS -- */

// Mismo orden que las uniones del contrato (src/lib/manual.ts).
export const SCENE_PRESETS = [
  "INFORMATIVO_PECHO",
  "AUTORIDAD_CONTRAPICADO",
  "VULNERABLE_PICADO",
  "PODCAST_SEMILATERAL",
  "SEGUIMIENTO_RITMO",
  "TRES_PUNTOS_COLOR",
  "LUZ_DE_MANO",
] as const satisfies readonly ScenePreset[];
export const SCENE_MISTAKES = [
  "CONTRALUZ",
  "CODOS_ABIERTOS",
  "PIES_JUNTOS",
  "OJOS_FUERA_DEL_TERCIO",
  "TRIPODE_MUY_BAJO",
  "TRIPODE_MUY_ALTO",
  "MOVIMIENTO_BRUSCO",
  "SIN_LUZ_TRASERA",
  "CABEZA_CORTADA",
  "CONTRAPICADO_EXAGERADO",
  "PICADO_FUERTE",
  "SIN_LUZ_DE_MANO",
  "LUZ_PEGADA_AL_LENTE",
  "TRASERA_MISMO_COLOR",
  "SIN_ESPACIO_DE_MIRADA",
] as const satisfies readonly SceneMistake[];
// Si el contrato suma un valor y estas listas no, deja de compilar.
const _presetsComplete: [Exclude<ScenePreset, (typeof SCENE_PRESETS)[number]>] extends [never] ? true : false = true;
const _mistakesComplete: [Exclude<SceneMistake, (typeof SCENE_MISTAKES)[number]>] extends [never] ? true : false = true;

export const SHOT_LABELS: Record<ShotSize, string> = {
  general: "Plano general",
  entero: "Plano entero",
  americano: "Plano americano",
  medio: "Plano medio",
  medioCorto: "Plano medio corto",
  primerPlano: "Primer plano",
  detalle: "Plano detalle",
};
export const ANGLE_LABELS: Record<CameraAngle, string> = {
  ojos: "Altura de ojos",
  picado: "Picado",
  contrapicado: "Contrapicado",
  cenital: "Cenital",
  holandes: "Holandés",
};
/** Qué transmite cada ángulo: rótulo breve del visor. */
export const ANGLE_INTENT: Record<CameraAngle, string> = {
  ojos: "Neutral: conecta de igual a igual",
  picado: "Encuadre «sumiso/dama»: más cercano, vulnerable y coqueto, sin confrontación",
  contrapicado: "Poder, confianza y autoridad",
  cenital: "Mirada desde arriba: muestra acciones y objetos",
  holandes: "Tensión o inestabilidad",
};
export const MOVE_LABELS: Record<CameraMove, string> = {
  fija: "Cámara fija",
  paneo: "Paneo",
  tilt: "Tilt",
  travelling: "Travelling",
  pushIn: "Push-in",
  pullOut: "Dolly out",
  orbita: "Órbita",
  seguimiento: "Seguimiento con gimbal",
  mano: "Cámara en mano",
  whip: "Whip pan",
};
export const ENVIRONMENT_LABELS: Record<SceneEnvironment, string> = {
  estudio: "Estudio",
  tienda: "Tienda o taller",
  mesa: "Mesa o cocina",
  sala: "Sala",
  calle: "Exterior",
};
export const LIGHT_LABELS: Record<LightRole, string> = {
  key: "Luz principal",
  fill: "Relleno",
  back: "Contraluz",
  background: "Luz de fondo",
};
export const FORMAT_LABELS: Record<FrameFormat, { short: string; long: string; aspect: number }> = {
  vertical: { short: "Vertical 9:16", long: "Vertical 9:16 (Reels)", aspect: 9 / 16 },
  horizontal: { short: "Horizontal 16:9", long: "Horizontal 16:9 (YouTube)", aspect: 16 / 9 },
};
export const PRESET_LABELS: Record<ScenePreset, { label: string; intent: string }> = {
  INFORMATIVO_PECHO: {
    label: "Trípode a la altura del pecho",
    intent: "Video informativo: plano medio con el lente a la altura del pecho. Proporciones naturales y los ojos en la línea superior.",
  },
  AUTORIDAD_CONTRAPICADO: {
    label: "Contrapicado: autoridad",
    intent: "Cámara baja mirando hacia arriba: transmite poder, confianza y autoridad. Si se exagera, deforma (papada y fosas nasales).",
  },
  VULNERABLE_PICADO: {
    label: "Picado «sumiso/dama»",
    intent: "Cámara alta mirando hacia abajo, el encuadre «sumiso/dama»: se ve más cercano y vulnerable. Suave, favorece el rostro y da un tono amable o coqueto, sin confrontación.",
  },
  PODCAST_SEMILATERAL: {
    label: "Semilateral de podcast",
    intent: "El sujeto mira a quien lo entrevista, al costado de la cámara: muestra cómo conversa con otras personas. Se deja espacio de mirada hacia donde mira.",
  },
  SEGUIMIENTO_RITMO: {
    label: "Seguimiento a su ritmo",
    intent: "La cámara acompaña al sujeto a su mismo ritmo y distancia: el encuadre no cambia y el movimiento es fluido (rodillas flexionadas y codos pegados).",
  },
  TRES_PUNTOS_COLOR: {
    label: "3 puntos con contraluz de color",
    intent: "Principal y relleno neutros al frente; la luz trasera, de otro color, dibuja un borde en hombros y cabello que separa al sujeto del fondo.",
  },
  LUZ_DE_MANO: {
    label: "Luz LED de mano",
    intent: "Con poca luz, una luz LED pequeña a 45° y un poco por encima de los ojos ilumina el rostro sin subir el ISO ni perder los 60 fps.",
  },
};
export const MISTAKE_LABELS: Record<SceneMistake, { label: string; wrong: string; why: string; fix: string }> = {
  CONTRALUZ: {
    label: "Contraluz",
    wrong: "sujeto a contraluz",
    why: "La ventana o el sol quedan detrás y no hay luz delante: la cámara expone para el fondo y el rostro queda oscuro o en silueta.",
    fix: "Gira al sujeto hacia la luz o pon la luz LED de mano delante, a 45° y un poco por encima de los ojos.",
  },
  CODOS_ABIERTOS: {
    label: "Codos abiertos",
    wrong: "codos abiertos",
    why: "En el sujeto, los brazos en jarra ensanchan la silueta y los gestos se salen del cuadro. En quien graba, los brazos estirados hacen temblar la toma.",
    fix: "Codos cerca del cuerpo sin aplastar el brazo: el sujeto gesticula entre el pecho y la cintura y quien graba pega los codos a las costillas.",
  },
  PIES_JUNTOS: {
    label: "Pies juntos",
    wrong: "pies juntos y rodillas rígidas",
    why: "Con los pies juntos y las piernas rectas el cuerpo se ve tieso y se balancea.",
    fix: "Un pie un poco adelantado, el peso en el de atrás y las rodillas levemente flexionadas.",
  },
  OJOS_FUERA_DEL_TERCIO: {
    label: "Ojos fuera del tercio",
    wrong: "ojos en el centro, con mucho aire arriba",
    why: "Los ojos bajan de la línea superior de la cuadrícula: sobra espacio sobre la cabeza y el encuadre se ve de aficionado.",
    fix: "Ajusta la inclinación o la distancia hasta que los ojos toquen la línea horizontal superior de la cuadrícula.",
  },
  TRIPODE_MUY_BAJO: {
    label: "Trípode muy bajo",
    wrong: "trípode muy bajo",
    why: "Desde abajo la cámara mira hacia arriba: aparecen papada, fosas nasales y techo; el informativo parece un contrapicado.",
    fix: "En un video informativo, sube el lente a la altura del pecho de la persona.",
  },
  TRIPODE_MUY_ALTO: {
    label: "Trípode muy alto",
    wrong: "trípode muy alto",
    why: "Desde arriba de la cabeza la cámara mira hacia abajo: la persona se achica y la cabeza se ve grande.",
    fix: "Baja el lente a la altura del pecho de la persona.",
  },
  MOVIMIENTO_BRUSCO: {
    label: "Movimiento brusco",
    wrong: "seguimiento a tirones",
    why: "La cámara se atrasa y luego alcanza al sujeto: el encuadre salta, cambia de tamaño y la toma tiembla.",
    fix: "Camina a su mismo ritmo y a distancia constante: rodillas flexionadas, pisada de talón a punta y codos pegados al cuerpo.",
  },
  SIN_LUZ_TRASERA: {
    label: "Sin luz trasera",
    wrong: "sin luz trasera, sujeto pegado al fondo",
    why: "Sin contraluz, el sujeto se funde con el fondo y la imagen se ve plana.",
    fix: "Pon una luz detrás y por encima de la cabeza, de otro color que las de frente, y separa al sujeto de la pared.",
  },
  CABEZA_CORTADA: {
    label: "Cabeza cortada",
    wrong: "cabeza cortada",
    why: "El cuadro corta la frente o la coronilla: la toma se ve apretada y descuidada.",
    fix: "Deja un poco de aire sobre la cabeza, con los ojos en la línea superior de la cuadrícula.",
  },
  CONTRAPICADO_EXAGERADO: {
    label: "Contrapicado exagerado",
    wrong: "contrapicado exagerado (+35°)",
    why: "Con la cámara muy abajo y muy inclinada, la autoridad se vuelve caricatura: dominan la papada, las fosas nasales y el techo.",
    fix: "Contrapicado leve: lente a 0.9-1.1 m e inclinado de 10 a 20° hacia arriba, con los ojos en la línea superior.",
  },
  PICADO_FUERTE: {
    label: "Picado fuerte",
    wrong: "picado fuerte (-30°)",
    why: "Con la cámara muy alta y muy inclinada, el talento ya no se ve cercano: se ve pequeño, cabizbajo e inferior.",
    fix: "Picado suave: lente 20-40 cm por encima de los ojos e inclinado de 10 a 15° hacia abajo; que el talento levante un poco la mirada al lente.",
  },
  SIN_LUZ_DE_MANO: {
    label: "Sin luz de mano",
    wrong: "sin luz de mano, con poca luz",
    why: "Con poca luz no hay nada que ilumine el rostro: la cara queda oscura y la cámara sube el ISO, así que aparece ruido.",
    fix: "Enciende la luz LED de mano a 45° del lente y un poco por encima de los ojos, con difusor, antes de subir el ISO.",
  },
  LUZ_PEGADA_AL_LENTE: {
    label: "Luz pegada al lente",
    wrong: "luz de mano pegada al lente",
    why: "La luz de frente, en el eje de la cámara, aplana la cara, borra el volumen y deja brillos en la piel y en los lentes.",
    fix: "Aleja la luz del lente: a 45° del eje, un poco por encima de los ojos y a unos 0.8 m, con difusor.",
  },
  TRASERA_MISMO_COLOR: {
    label: "Trasera mismo color",
    wrong: "luz trasera del mismo color que el frente",
    why: "Con la trasera a la misma temperatura que la principal, el contorno apenas se distingue y el sujeto sigue pegado al fondo.",
    fix: "Dale otro color a la luz trasera: cálida (2700-3200 K) si el frente es de día, o un color RGB como cian o magenta.",
  },
  SIN_ESPACIO_DE_MIRADA: {
    label: "Sin espacio de mirada",
    wrong: "sujeto centrado, sin espacio de mirada",
    why: "Centrado y mirando al costado, parece que mira fuera del cuadro: no se entiende con quién conversa.",
    fix: "Pon al sujeto en un tercio y deja el espacio libre hacia donde mira, con los ojos en la línea superior.",
  },
};

/** Colores de luz RGB para el contraluz. */
export const RGB_COLORS = {
  cian: { hex: "#22d3ee", name: "cian" },
  magenta: { hex: "#e879f9", name: "magenta" },
  ambar: { hex: "#f59e0b", name: "ámbar" },
} as const satisfies Record<string, LightColor>;

/* --------------------------------------------------------------- MANIQUÍ -- */

/**
 * Medidas del maniquí del visor (m). El visor lo arma con estos números y el
 * encuadre los usa para saber dónde están los ojos: por eso viven aquí.
 */
export const MANNEQUIN = {
  /** Cadera de pie, con las rodillas apenas flexionadas y un pie adelantado. */
  hips: 0.943,
  /** Cadera con las piernas rectas y los pies juntos. */
  hipsStraight: 0.955,
  hipsSeated: 0.52,
  spine: 0.06,
  neck: 0.47,
  /** Del cuello al pivote de la cabeza. */
  head: 0.08,
  /** Del pivote de la cabeza a la línea de los ojos. */
  eyes: 0.06,
  /** Los ojos van por delante del eje del cuerpo. */
  eyesForward: 0.09,
  /** De los ojos a la coronilla. */
  crown: 0.1,
  /** Pecho (línea del esternón) sobre la cadera. */
  chest: 0.34,
} as const;

type Feet = SceneBody["feet"];

export function hipsHeight(seated = false, feet: Feet = "adelantado") {
  if (seated) return MANNEQUIN.hipsSeated;
  return feet === "juntos" ? MANNEQUIN.hipsStraight : MANNEQUIN.hips;
}

/** Altura de los ojos del maniquí (de pie ≈ 1,61 m; sentado ≈ 1,19 m). */
export function eyeHeight(seated = false, feet: Feet = "adelantado") {
  return hipsHeight(seated, feet) + MANNEQUIN.spine + MANNEQUIN.neck + MANNEQUIN.head + MANNEQUIN.eyes;
}

/** Altura del pecho (de pie ≈ 1,28 m, el 72-75 % de la estatura). */
export function chestHeight(seated = false, feet: Feet = "adelantado") {
  return hipsHeight(seated, feet) + MANNEQUIN.chest;
}

/** Escena de podcast: el sujeto gira hacia quien entrevista, que se sienta al costado de la cámara. */
export const PODCAST = {
  /** Giro del cuerpo del sujeto (rad): 35° hacia +X, donde está quien entrevista. */
  yaw: 0.61,
  /** La cámara va de frente; el rostro se ve en 3/4 porque el sujeto mira al costado. */
  azimuth: 0,
  /** El sujeto va en el tercio izquierdo y mira hacia el derecho (espacio de mirada). */
  screenX: -1 / 3,
  /** Quien entrevista, sentado junto a la cámara y fuera de cuadro. */
  interviewer: { x: 0.45, z: 1.0 },
} as const;

/* --------------------------------------------------------------- UTILIDADES -- */

/** Minúsculas y sin tildes: «Cenital», «cenital» y «CENITAL» valen lo mismo. */
export function normalize(text: string) {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

type Table<T> = readonly (readonly [T, RegExp])[];

/** Todas las coincidencias de la tabla, ordenadas por posición y sin repetir el valor. */
function matchesInOrder<T>(text: string, table: Table<T>): T[] {
  const hits: { value: T; index: number }[] = [];
  for (const [value, pattern] of table) {
    const global = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
    for (const match of text.matchAll(global)) hits.push({ value, index: match.index ?? 0 });
  }
  hits.sort((a, b) => a.index - b.index);
  const seen = new Set<T>();
  const result: T[] = [];
  for (const hit of hits) if (!seen.has(hit.value)) { seen.add(hit.value); result.push(hit.value); }
  return result;
}

function firstMatch<T>(text: string, table: Table<T>): T | undefined {
  return matchesInOrder(text, table)[0];
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const smoothstep = (value: number) => { const x = clamp(value, 0, 1); return x * x * (3 - 2 * x); };
const DEG = Math.PI / 180;

/* ----------------------------------------------------------------- TABLAS -- */

const ENVIRONMENTS: Table<SceneEnvironment> = [
  ["calle", /\b(vereda|calle|plaza|avenida|parque|exterior|mercado|via publica|acera|fachada)\b/],
  ["tienda", /\b(tienda|mostrador|taller|estante|vitrina|local|stand)\b/],
  ["mesa", /\b(restaurante|cocina|comedor|mesa|plato|barra)\b/],
  ["sala", /\b(sala|sofa|living|casa|dormitorio|habitacion|cuarto|departamento)\b/],
  ["estudio", /\b(estudio|fondo infinito|ciclorama|cartulina|fondo|set|croma|pared lisa)\b/],
];

const SHOTS: Table<ShotSize> = [
  ["general", /plano (muy )?general|gran plano general|\bpg\b|plano abierto/],
  ["entero", /plano entero|cuerpo entero|plano completo/],
  ["americano", /plano americano|\bamericano\b/],
  ["medioCorto", /plano medio corto|\bmedio corto\b|\bpmc\b/],
  ["medio", /plano medio(?! corto)|\bpm\b/],
  ["primerPlano", /primer(isimo)? plano|close[- ]?up|\bpp\b/],
  ["detalle", /plano detalle|\bdetalle\b|\bmacro\b|\bpd\b|\binserto?\b/],
];

const ANGLES: Table<CameraAngle> = [
  ["contrapicado", /contra-?picad|angulo bajo|low angle/],
  ["picado", /(?<!contra)(?<!contra-)picad|angulo alto|high angle/],
  ["cenital", /cenital|top shot/],
  ["holandes", /holandes|\bdutch\b/],
  ["ojos", /altura de (los )?ojos|nivel de (los )?ojos|altura de la mirada|(vista|plano|referencia|posicion) neutr[ao]/],
];

const MOVES: Table<CameraMove> = [
  ["orbita", /\borbit|alrededor del (producto|sujeto|plato|talento|eje)|\b360\b/],
  ["whip", /whip|barrido rapido|paneo rapido|latigazo/],
  ["pushIn", /push[- ]?in|dolly[- ]?in|acercamiento|se acerca|zoom in/],
  ["pullOut", /pull[- ]?out|dolly[- ]?out|se aleja|zoom out/],
  ["seguimiento", /gimbal|seguimiento|sigue a(l| la)|acompana a(l| la)|steadicam/],
  ["travelling", /travell?ing|slider|desplazamiento lateral|\bdolly\b(?![- ]?(in|out))/],
  ["paneo", /\bpaneo|\bpanea|\bpan\b|panoramica/],
  ["tilt", /\btilt\b/],
  // «Agarre a mano» / «grabar a mano»: el celular va en la mano de quien graba (sus codos son los del error).
  ["mano", /camara en mano|\b(en|a) mano\b|handheld|palo selfie|\bselfie\b/],
];

const ACTIONS: Table<SubjectAction> = [
  ["walkIn", /entra(r)? (a|en|al) cuadro|entra desde|entra por|llega (a|hasta) la marca|camina hasta|camina hacia|pisa(r)? la marca/],
  ["walk", /\bcamin(a|ar|ando)\b(?! (hasta|hacia))|se desplaza/],
  ["turn", /\bgir(a|ar|o|ando)\b|\bvoltea|media vuelta/],
  ["showProduct", /\b(muestra|mostrar|sostiene|sosteniendo|presenta|presentar|levanta|ensena|exhibe)\b/],
  ["lookLens", /mira(r|ndo)? (al|a) (lente|camara)|mirada al lente|mira a la camara/],
  ["lookAway", /mirada fuera|mira fuera|fuera de camara|linea de mirada|mira a su/],
  ["sit", /\bsentad[oa]s?\b|se sienta|sentarse/],
  ["point", /\bsenala|\bapunta\b/],
  ["react", /\bsonr(ie|isa)|sorpresa|reacciona|reaccion\b|emociona|asombro|\brie\b/],
  ["talk", /\bhabla|\bdice\b|dialogo|su frase|la linea(?! (superior|inferior|horizontal|vertical|de (los ojos|altura|tiempo|la cuadricula|mirada)|del eje))/],
];

const PRODUCTS: Table<ProductKind> = [
  ["taza", /\btazas?\b/],
  ["prenda", /\b(polera|casaca|prenda|ropa|camiseta|poleras)\b/],
  ["plato", /\b(plato|comida|hamburguesa|postre|bebida)\b/],
  ["celular", /\bcelular del\b/],
  ["caja", /\b(caja|regalo|paquete|producto)\b/],
];

const TWO_SUBJECTS = /\b(dos (figuras|personas|personajes|maniquies|actores|actrices)|pareja|complice|transeunte|entrevistador)\b/;
const CUSTOMER = /\b(cliente|clienta)\b/;
const SELLER = /\b(actor|actriz|vendedor|vendedora|mesero|mesera|atc|dueno|duena)\b/;
const OPERATOR = /\bmaniqui f\b|\bfilmmaker\b|camarograf|operador de camara/;
/** Oraciones sobre asistentes o ayudantes: son equipo, no talento (no cuentan ni actúan). */
const CREW = /(?:[^.;]|\.(?=\d))*\b(asistente|ayudante)\b(?:[^.;]|\.(?=\d))*/g;
const PERSON = /\b(actor|actriz|actores|talento|persona|personas|cliente|clienta|mujer|hombre|hij[oa]|pareja|figuras?|complice|transeunte|chef|meser[oa]|vendedor[a]?|modelo|nin[oa]|madre|padre|entrevistad[oa]|presentador[a]?|duen[oa]|manos|maniqui(?! f\b))/;

/** Palabras clave del título de la lección que arman una escena. */
const PRESET_TITLE: Table<ScenePreset> = [
  ["LUZ_DE_MANO", /luz (led )?de mano|poca luz|baja luz|linterna/],
  ["PODCAST_SEMILATERAL", /podcast|entrevista|semi-? ?lateral/],
  ["SEGUIMIENTO_RITMO", /seguir al|seguimiento|acompan|a su ritmo|mismo ritmo|ninja walk|moverse con/],
  ["AUTORIDAD_CONTRAPICADO", /contra-?picad|autoridad|superioridad|\bpoder\b/],
  ["VULNERABLE_PICADO", /(?<!contra)(?<!contra-)picad|vulnerab|sumis/],
  ["INFORMATIVO_PECHO", /altura del pecho|informativ/],
  ["TRES_PUNTOS_COLOR", /\b(3|tres) puntos\b|luz trasera|contraluz de (color|separacion)|\brim\b/],
];

/** En el texto de la escena, cada señal se busca solo en su campo para no confundir («sostiene la taza a la altura del pecho»). */
const PRESET_BODY: readonly { preset: ScenePreset; field: "camera" | "subjects" | "lighting"; pattern: RegExp }[] = [
  { preset: "LUZ_DE_MANO", field: "lighting", pattern: /luz (led )?de mano|poca luz|baja luz|linterna/ },
  { preset: "TRES_PUNTOS_COLOR", field: "lighting", pattern: /\b(3|tres) puntos\b[^.;]*\b(color|rgb|cian|magenta|ambar)\b|(contraluz|luz trasera) de color/ },
  { preset: "PODCAST_SEMILATERAL", field: "camera", pattern: /podcast|semi-? ?lateral/ },
  { preset: "PODCAST_SEMILATERAL", field: "subjects", pattern: /podcast/ },
  { preset: "SEGUIMIENTO_RITMO", field: "camera", pattern: /a su (mismo )?ritmo|mismo ritmo|ninja walk/ },
  { preset: "INFORMATIVO_PECHO", field: "camera", pattern: /altura del pecho|informativ/ },
];

/* ------------------------------------------------------------------ PARTES -- */

export function parseEnvironment(text: string): SceneEnvironment {
  return firstMatch(normalize(text), ENVIRONMENTS) ?? "estudio";
}

/** Oraciones sobre cámaras de observación o vistas auxiliares no describen el plano del celular. */
function cameraClauses(text: string) {
  const clauses = normalize(text).split(/(?<=[.;])\s+/);
  const main = clauses.filter(clause => !/observacion|auxiliar/.test(clause));
  return (main.length ? main : clauses).join(" ");
}

export function parseFocal(text: string): number | undefined {
  const t = normalize(text);
  const mm = /(\d{2,3})\s?mm\b/.exec(t);
  if (mm) {
    const value = Number(mm[1]);
    if (value >= 10 && value <= 200) return value;
  }
  const zoom = /\b(0[.,]5|1|2|3|5)\s?x\b/.exec(t);
  if (zoom) return Math.round(26 * Number(zoom[1].replace(",", ".")));
  if (/ultra ?gran angular/.test(t)) return 13;
  if (/teleobjetivo/.test(t)) return 77;
  if (/gran angular|lente principal/.test(t)) return 26;
  return undefined;
}

/** Inclinación explícita («inclinación -30°»): hacia abajo es picado, hacia arriba contrapicado. */
function angleFromTilt(text: string): CameraAngle | undefined {
  const tilt = /inclinacion (?:de )?([-+]?\d+)\s*°/.exec(text);
  if (!tilt) return undefined;
  const degrees = Number(tilt[1]);
  return degrees <= -20 ? "picado" : degrees >= 20 ? "contrapicado" : undefined;
}

/** `hint` es el título de la lección: su tema manda sobre el texto libre («Picado que empequeñece»). */
export function parseCamera(text: string, hint = ""): SceneConfig["camera"] {
  const t = cameraClauses(text);
  const h = normalize(hint);
  const hintShot = firstMatch(h, SHOTS);
  const shots = hintShot ? [hintShot, ...matchesInOrder(t, SHOTS).filter(shot => shot !== hintShot)] : matchesInOrder(t, SHOTS);
  const angle = firstMatch(h, ANGLES) ?? firstMatch(t, ANGLES) ?? angleFromTilt(t) ?? "ojos";
  const hintMove = firstMatch(h, MOVES);
  let move = hintMove ?? firstMatch(t, MOVES) ?? "fija";
  // Con varios tamaños de plano, el «dolly» describe el paso entre posiciones: ya lo anima el cambio de plano.
  if (shots.length > 1 && ["travelling", "pushIn", "pullOut"].includes(move) && !hintMove) move = "fija";
  return {
    shots: shots.length ? shots : ["medio"],
    angle,
    focalMm: parseFocal(t) ?? 26,
    move,
    handheld: move === "mano" || /\ben mano\b|handheld|selfie/.test(t),
  };
}

export function parseSubjects(text: string, hint = ""): SceneConfig["subjects"] {
  const t = normalize(text);
  const cast = t.replace(CREW, " ");
  const hintAction = firstMatch(normalize(hint), ACTIONS);
  const found = matchesInOrder(cast, ACTIONS);
  const seated = found.includes("sit");
  // Estar sentado es un estado de toda la escena, no un paso: no ocupa lugar en la secuencia.
  const actions = [...new Set([...(hintAction ? [hintAction] : []), ...found])].filter(action => action !== "sit");
  const labelled = new Set((cast.match(/\bmaniqui [a-z]\b/g) ?? []).filter(label => label !== "maniqui f"));
  const withoutOperator = t.replace(/maniqui f\b[^.;]*/g, " ");
  return {
    count: TWO_SUBJECTS.test(cast) || labelled.size > 1 || (CUSTOMER.test(cast) && SELLER.test(cast)) ? 2 : 1,
    actions: actions.length ? actions : ["idle", "lookLens"],
    seated: seated || hintAction === "sit",
    operator: OPERATOR.test(t),
    productOnly: t.trim().length > 0 && !PERSON.test(withoutOperator),
    enterFrom: /desde la derecha|hacia -x|borde derecho|por la derecha/.test(t) ? 1 : -1,
  };
}

const SKIP_LIGHT = /^(nota|aviso|evitar|sin|no|error|ojo|importante)\b|evitar/;
const LIGHT_SPLIT = /(?<=[.;])\s+|,\s+(?=(?:un |una |el |la )?(?:rebot|relleno|contraluz|contra\b|reflector|luz|fondo|key|fill|back))|\s+y\s+(?=(?:un |una |el |la )?(?:rebot|relleno|contraluz|contra\b|reflector|key|fill|back))/;
const EXPLICIT_KELVIN = /(\d{4,5})\s?k\b|calid|dorad|tungsteno|atardecer|\bvela\b|naranja|\bfri[oa]\b|azul|nublad|sombra/;

function lightRole(clause: string): LightRole | null {
  if (/contraluz|contra luz|^contra\b|back ?light|luz trasera|\brim\b|separa(r|rla|rlo|cion)? del fondo/.test(clause)) return "back";
  if (/^fondo\b|luz de fondo|ilumina el fondo/.test(clause)) return "background";
  if (/relleno|\bfill\b|rebot|reflector|panel blanco|cartulina blanca|pared clara|ambiente/.test(clause)) return "fill";
  if (/\bkey\b|principal|luz clave|ventana|softbox|aro de luz|ring ?light|panel|\bled\b|\bsol\b|luz natural|nublad|hora dorada|\bfoco\b|lampara|luz (dura|suave)|luz de/.test(clause)) return "key";
  return null;
}

function lightSource(clause: string, role: LightRole): LightSource {
  if (/luz (led )?de mano|linterna/.test(clause)) return "mano";
  if (/ventana/.test(clause)) return "window";
  if (/aro de luz|ring ?light/.test(clause)) return "ring";
  if (/softbox|caja de luz/.test(clause)) return "softbox";
  if (/\bsol\b|luz natural|nublad|hora dorada|cielo|exterior/.test(clause)) return "sun";
  if (/rebot|reflector|panel blanco|cartulina|pared/.test(clause)) return "bounce";
  if (/\bled\b|panel|\bfoco\b|lampara/.test(clause)) return "led";
  return role === "key" ? "softbox" : role === "fill" ? "bounce" : "led";
}

function lightRgb(clause: string): LightColor | undefined {
  if (/\bcian\b|\bcyan\b|turquesa/.test(clause)) return RGB_COLORS.cian;
  if (/magenta|\brosa\b|fucsia/.test(clause)) return RGB_COLORS.magenta;
  if (/\bambar\b/.test(clause)) return RGB_COLORS.ambar;
  return undefined;
}

export function parseKelvin(clause: string): number {
  const t = normalize(clause);
  const kelvin = /(\d{4,5})\s?k\b/.exec(t);
  if (kelvin) return clamp(Number(kelvin[1]), 1800, 10000);
  if (/calid|dorad|tungsteno|atardecer|\bvela\b|naranja/.test(t)) return 3200;
  if (/\bfri[oa]\b|azul|nublad|sombra/.test(t)) return 6500;
  return 5600;
}

/** Temperatura del contraluz para que se distinga de las luces de frente: ámbar si el frente es neutro o frío, fría si es cálido. */
export function contrastKelvin(frontKelvin: number) {
  return frontKelvin >= 4500 ? 2700 : 6200;
}

const DEFAULT_INTENSITY: Record<LightRole, number> = { key: 1, fill: 0.45, back: 0.7, background: 0.35 };
const DEFAULT_SIDE: Record<LightRole, -1 | 0 | 1> = { key: -1, fill: 1, back: 0, background: 0 };

/** Rótulos del esquema de luz, a partir de las luces que quedaron. */
export function lightingLabels(lights: readonly SceneLight[]): string[] {
  const has = (role: LightRole) => lights.some(light => light.role === role);
  const key = lights.find(light => light.role === "key");
  const back = lights.find(light => light.role === "back");
  const labels: string[] = [];
  if (!key) {
    if (back) labels.push(back.source === "window" || back.source === "sun" || back.source === "lampara" ? "Contraluz sin relleno" : "Solo contraluz");
    return labels.length ? labels : ["Sin luz principal"];
  }
  if (has("fill") && back) labels.push("3 puntos");
  if (key.source === "window") labels.push("Ventana lateral");
  else if (key.source === "sun") labels.push("Luz natural");
  else if (key.source === "ring") labels.push("Aro de luz");
  else if (key.source === "mano") labels.push("Luz de mano");
  if (back && !labels.includes("3 puntos")) labels.push("Contraluz");
  if (back?.rgb) labels.push(`Contraluz ${back.rgb.name}`);
  labels.push(key.hard ? "Luz dura" : "Luz suave");
  labels.push(key.kelvin <= 4000 ? "Cálida" : key.kelvin >= 6200 ? "Fría" : "Luz de día");
  return labels;
}

export function parseLighting(text: string, hint = ""): { lights: SceneLight[]; labels: string[] } {
  const t = normalize(text);
  const h = normalize(hint);
  const lights: SceneLight[] = [];
  const implicitKelvin = new Set<SceneLight>();
  for (const raw of t.split(LIGHT_SPLIT)) {
    const clause = raw.trim();
    if (!clause || SKIP_LIGHT.test(clause)) continue;
    const role = lightRole(clause);
    if (!role || lights.some(light => light.role === role)) continue;
    const percent = /(\d{1,3})\s?%/.exec(clause);
    const side: -1 | 0 | 1 = /izquierd|-x\b/.test(clause) ? -1 : /derech|\+x\b/.test(clause) ? 1 : DEFAULT_SIDE[role];
    const rgb = role === "back" ? lightRgb(clause) : undefined;
    const light: SceneLight = {
      role,
      source: lightSource(clause, role),
      side: role === "fill" && side === 0 ? 1 : side,
      kelvin: parseKelvin(clause),
      hard: /\bdura\b|directa|sol directo|mediodia|flash/.test(clause) && !/suave|difus/.test(clause),
      intensity: percent ? clamp(Number(percent[1]) / 100, 0.1, 1) : DEFAULT_INTENSITY[role],
      ...(rgb ? { rgb } : {}),
    };
    if (role === "back" && !rgb && !EXPLICIT_KELVIN.test(clause)) implicitKelvin.add(light);
    lights.push(light);
  }
  const threePoints = /\b(3|tres) puntos\b/.test(t);
  if (!lights.some(light => light.role === "key")) lights.unshift({ role: "key", source: /ventana/.test(t) ? "window" : /luz (led )?de mano|linterna/.test(t) ? "mano" : "softbox", side: -1, kelvin: parseKelvin(t), hard: /\bdura\b/.test(t), intensity: 1 });
  const key = lights.find(light => light.role === "key")!;
  if (threePoints || !lights.some(light => light.role === "fill")) {
    if (!lights.some(light => light.role === "fill")) lights.push({ role: "fill", source: "bounce", side: key.side === 1 ? -1 : 1, kelvin: key.kelvin, hard: false, intensity: 0.4 });
  }
  if ((threePoints || /contraluz|contra luz/.test(h)) && !lights.some(light => light.role === "back")) {
    const back: SceneLight = { role: "back", source: "led", side: key.side === 1 ? -1 : 1, kelvin: key.kelvin, hard: false, intensity: DEFAULT_INTENSITY.back };
    implicitKelvin.add(back);
    lights.push(back);
  }
  if (/ventana/.test(h)) key.source = "window";
  if (/ring ?light|aro de luz/.test(h) && key.source !== "window") key.source = "ring";
  if (/\bdura\b/.test(h) && !/suave/.test(h)) key.hard = true;
  // El relleno siempre va del lado contrario a la principal.
  for (const light of lights) if (light.role === "fill" && key.side !== 0 && light.side === key.side) light.side = key.side === 1 ? -1 : 1;
  // Un contraluz sin color escrito toma otro color que el frente: así separa al sujeto del fondo.
  for (const light of implicitKelvin) light.kelvin = contrastKelvin(key.kelvin);

  const result = lights.slice(0, 4);
  return { lights: result, labels: lightingLabels(result) };
}

/* ------------------------------------------------------------------- PASOS -- */

const TIME_RANGE = /^\s*(\d+(?:[.,]\d+)?)\s*(?:s\b)?\s*(?:-|–|—|a)\s*(\d+(?:[.,]\d+)?)\s*s\b\s*[·:.\-–—]?\s*/i;
const TIME_POINT = /^\s*(\d+(?:[.,]\d+)?)\s*s\b\s*[·:.\-–—]?\s*/i;
const MIN_BEAT = 2.5;
const MAX_BEAT = 6;
const TONES: Table<"error" | "ok"> = [
  ["error", /\berror|incorrect|\brojo\b|\broja\b|\bmal\b|\bevita|no hacer|\bnunca\b/],
  ["ok", /\bcorrect|\bverde\b|\bbien\b|asi si\b/],
];

type RawBeat = { text: string; timeLabel: string | null; seconds: number; mistake: SceneMistake | null };

/** Error que muestra el paso mientras dura: «[TRIPODE_MUY_BAJO] 2-4 s: …». No se muestra en el texto. */
const BEAT_MISTAKE = /^\[([A-Z_]+)\]\s*/;

function splitBeats(beats: readonly string[]): RawBeat[] {
  return beats.map(text => text.trim()).filter(Boolean).map(original => {
    const tag = BEAT_MISTAKE.exec(original);
    const mistake = tag && isSceneMistake(tag[1]) ? tag[1] : null;
    const text = mistake && tag ? original.slice(tag[0].length).trim() || original : original;
    const range = TIME_RANGE.exec(text);
    if (range) {
      const start = Number(range[1].replace(",", "."));
      const end = Number(range[2].replace(",", "."));
      return { text: text.slice(range[0].length).trim() || text, timeLabel: `${range[1]}–${range[2]} s`, seconds: end > start ? end - start : MIN_BEAT, mistake };
    }
    const point = TIME_POINT.exec(text);
    if (point) return { text: text.slice(point[0].length).trim() || text, timeLabel: `${point[1]} s`, seconds: MIN_BEAT, mistake };
    return { text, timeLabel: null, seconds: 3, mistake };
  });
}

function beatAction(action: SubjectAction | undefined, subjects: SceneConfig["subjects"]): SubjectAction | undefined {
  if (action === "walk" && subjects.actions.includes("walkIn")) return "walkIn";
  if (action === "sit" && subjects.seated) return undefined;
  return action;
}

export function parseBeats(beats: readonly string[] | undefined, camera: SceneConfig["camera"], subjects: SceneConfig["subjects"]): SceneBeat[] {
  const raw = splitBeats(beats ?? []);
  const source: RawBeat[] = raw.length ? raw : [{ text: "Observa la escena desde distintos ángulos.", timeLabel: null, seconds: 4, mistake: null }];
  const explicitShots = source.map(beat => firstMatch(normalize(beat.text), SHOTS));
  const anyExplicitShot = explicitShots.some(Boolean);
  let clock = 0;
  let previousShot: ShotSize | undefined;
  let focal = camera.focalMm;
  let keyAngle: number | null = null;
  let keyHeight: number | null = null;
  return source.map((beat, index) => {
    const t = normalize(beat.text);
    const spread = (list: readonly string[]) => list[Math.min(list.length - 1, Math.floor((index * list.length) / source.length))];
    const overview = /vista (superior|cenital|desde arriba|de arriba)/.test(t) ? "Arriba" : /vista lateral/.test(t) ? "Lateral" : null;
    const shot = explicitShots[index] ?? (anyExplicitShot && previousShot ? previousShot : (spread(camera.shots) as ShotSize));
    previousShot = shot;
    focal = parseFocal(t) ?? focal;
    const angleMatch = /\b(?:key|principal)\b[^.;]{0,25}?\ba (\d{1,3})\s*°/.exec(t);
    if (angleMatch) keyAngle = clamp(Number(angleMatch[1]), 0, 150);
    const heightMatch = /\b(?:key|principal)\b[^.;]{0,20}?\b(?:sube|baja) a (\d(?:[.,]\d+)?)\s*m\b/.exec(t);
    if (heightMatch) keyHeight = clamp(Number(heightMatch[1].replace(",", ".")), 0.5, 3.5);
    const seconds = clamp(beat.seconds, MIN_BEAT, MAX_BEAT);
    const start = clock;
    clock += seconds;
    return {
      index,
      text: beat.text,
      timeLabel: beat.timeLabel,
      start,
      end: clock,
      shot,
      // En una vista de conjunto, «cenital» describe al observador, no al celular.
      angle: (overview ? undefined : firstMatch(t, ANGLES)) ?? camera.angle,
      focalMm: focal,
      action: beatAction(firstMatch(t, ACTIONS), subjects) ?? (spread(subjects.actions) as SubjectAction),
      // Un paso que muestra un error es un «error a evitar», lo diga o no el texto.
      tone: beat.mistake ? "error" : (firstMatch(t, TONES) ?? "neutral"),
      overview,
      keyAngle,
      keyHeight,
      mistake: beat.mistake,
    };
  });
}

/* ---------------------------------------------------------- ESCENAS ARMADAS -- */

export function isScenePreset(value: unknown): value is ScenePreset {
  return typeof value === "string" && (SCENE_PRESETS as readonly string[]).includes(value);
}

export function isSceneMistake(value: unknown): value is SceneMistake {
  return typeof value === "string" && (SCENE_MISTAKES as readonly string[]).includes(value);
}

/**
 * Escena armada: la del contrato (`scene3d.preset`) manda; si no viene, se busca
 * en el título de la lección y luego en el campo de la escena que corresponde. El
 * ángulo ya interpretado (contrapicado o picado) también arma su escena.
 */
export function parsePreset(input: Scene3dInput, hint = "", angle?: CameraAngle): ScenePreset | null {
  const declared = input?.preset;
  if (isScenePreset(declared)) return declared;
  const fromTitle = firstMatch(normalize(hint), PRESET_TITLE);
  if (fromTitle) return fromTitle;
  const fields = { camera: cameraClauses(input?.camera ?? ""), subjects: normalize(input?.subjects ?? ""), lighting: normalize(input?.lighting ?? "") };
  for (const rule of PRESET_BODY) if (rule.pattern.test(fields[rule.field])) return rule.preset;
  const resolved = angle ?? parseCamera(input?.camera ?? "", hint).angle;
  if (resolved === "contrapicado") return "AUTORIDAD_CONTRAPICADO";
  if (resolved === "picado") return "VULNERABLE_PICADO";
  return null;
}

type Staged = {
  camera: SceneConfig["camera"];
  subjects: SceneConfig["subjects"];
  lights: SceneLight[];
  framing: SceneConfig["framing"];
  staging: SceneStaging;
  ambient: number;
};

/** Lo que la escena escribió explícitamente: la escena armada no lo pisa. */
type Explicit = { shot: boolean; focal: boolean; move: boolean; standing: boolean };

function applyPreset(preset: ScenePreset, staged: Staged, explicit: Explicit) {
  const { camera, subjects } = staged;
  const shot = (value: ShotSize) => { if (!explicit.shot) camera.shots = [value]; };
  // Para personas, 2x (≈48 mm) deforma menos el rostro que el gran angular.
  const portraitLens = () => { if (!explicit.focal) camera.focalMm = 48; };
  const fixed = () => { if (!explicit.move) { camera.move = "fija"; camera.handheld = false; } };
  const key = staged.lights.find(light => light.role === "key");
  switch (preset) {
    case "INFORMATIVO_PECHO":
      if (!subjects.productOnly) staged.framing.heightRule = "pecho";
      camera.angle = "ojos";
      shot("medio");
      portraitLens();
      fixed();
      break;
    case "AUTORIDAD_CONTRAPICADO":
      camera.angle = "contrapicado";
      shot("medio");
      portraitLens();
      break;
    case "VULNERABLE_PICADO":
      camera.angle = "picado";
      shot("medioCorto");
      portraitLens();
      break;
    case "PODCAST_SEMILATERAL":
      staged.staging = "podcast";
      subjects.count = 2;
      subjects.productOnly = false;
      if (!explicit.standing) subjects.seated = true;
      if (subjects.actions.every(action => action === "idle" || action === "lookLens")) subjects.actions = ["talk"];
      camera.angle = "ojos";
      shot("medioCorto");
      portraitLens();
      fixed();
      break;
    case "SEGUIMIENTO_RITMO":
      camera.move = "seguimiento";
      subjects.operator = true;
      subjects.productOnly = false;
      subjects.seated = false;
      // La cámara lo acompaña: el sujeto camina hacia ella (no entra de costado a un cuadro fijo).
      subjects.actions = subjects.actions.map(action => (action === "walkIn" ? "walk" : action));
      if (!subjects.actions.includes("walk")) subjects.actions = ["walk", ...subjects.actions.filter(action => action !== "idle" && action !== "lookLens")];
      shot("medio");
      break;
    case "TRES_PUNTOS_COLOR": {
      const front = key ?? { role: "key", source: "softbox", side: -1, kelvin: 5600, hard: false, intensity: 1 };
      if (!key) staged.lights.unshift(front);
      if (!staged.lights.some(light => light.role === "fill")) staged.lights.push({ role: "fill", source: "bounce", side: front.side === 1 ? -1 : 1, kelvin: front.kelvin, hard: false, intensity: 0.55 });
      const back = staged.lights.find(light => light.role === "back");
      if (back) {
        back.rgb = back.rgb ?? RGB_COLORS.cian;
        back.intensity = Math.max(back.intensity, 0.85);
      } else {
        staged.lights.push({ role: "back", source: "led", side: front.side === 1 ? -1 : 1, kelvin: contrastKelvin(front.kelvin), hard: false, intensity: 0.9, rgb: RGB_COLORS.cian });
      }
      break;
    }
    case "LUZ_DE_MANO": {
      const hand: SceneLight = { role: "key", source: "mano", side: key?.side === 1 ? 1 : -1, kelvin: key?.kelvin ?? 5600, hard: false, intensity: 0.9 };
      staged.lights = [hand, ...staged.lights.filter(light => light.role !== "key" && light.role !== "fill")];
      staged.ambient = 0.3;
      break;
    }
  }
}

/**
 * Errores que se pueden comparar, sin repetir y en este orden:
 * 1. los de `scene3d.errores` (los de la lección);
 * 2. los que muestran sus pasos («[CONTRALUZ] 0-2 s: …»);
 * 3. siempre, el conjunto universal: contraluz, codos, pies (de pie y sin caminar
 *    todo el tiempo), ojos fuera del tercio y sin luz trasera;
 * 4. los que pide la escena: luz de mano, trasera de color, trípode en el
 *    informativo, ángulo exagerado, espacio de mirada del podcast, cabeza cortada
 *    en primer plano y movimiento brusco si la cámara se mueve.
 */
export function sceneMistakes(errores: readonly string[] | null | undefined, config: Pick<SceneConfig, "subjects" | "camera" | "preset" | "lights" | "beats">): SceneMistake[] {
  const list: SceneMistake[] = [];
  const add = (...items: SceneMistake[]) => { for (const item of items) if (!list.includes(item)) list.push(item); };
  add(...(errores ?? []).filter(isSceneMistake));
  add(...config.beats.flatMap(beat => (beat.mistake ? [beat.mistake] : [])));
  const moving = config.camera.move !== "fija" || config.camera.handheld;
  // «Sin luz trasera» solo se compara si la escena correcta tiene contraluz.
  const hasBack = config.lights.some(light => light.role === "back");
  const hasHand = config.lights.some(light => light.source === "mano");
  add("CONTRALUZ");
  if (hasHand) add("SIN_LUZ_DE_MANO", "LUZ_PEGADA_AL_LENTE");
  if (config.subjects.productOnly) {
    if (hasBack) add("SIN_LUZ_TRASERA");
    if (moving) add("MOVIMIENTO_BRUSCO");
    return list;
  }
  add("CODOS_ABIERTOS");
  // Si camina en todos los pasos, la marcha tapa la postura de los pies: no se nota la diferencia.
  const walking = config.beats.length > 0 && config.beats.every(beat => beat.action === "walk" || beat.action === "walkIn");
  if (!config.subjects.seated && !walking) add("PIES_JUNTOS");
  add("OJOS_FUERA_DEL_TERCIO");
  if (hasBack) add("SIN_LUZ_TRASERA");
  if (config.preset === "TRES_PUNTOS_COLOR") add("TRASERA_MISMO_COLOR");
  if (config.preset === "INFORMATIVO_PECHO") add("TRIPODE_MUY_BAJO", "TRIPODE_MUY_ALTO");
  if (config.preset === "AUTORIDAD_CONTRAPICADO") add("CONTRAPICADO_EXAGERADO");
  if (config.preset === "VULNERABLE_PICADO") add("PICADO_FUERTE");
  if (config.preset === "PODCAST_SEMILATERAL") add("SIN_ESPACIO_DE_MIRADA");
  if (config.camera.shots.includes("primerPlano")) add("CABEZA_CORTADA");
  if (moving) add("MOVIMIENTO_BRUSCO");
  return list;
}

/* ------------------------------------------------------------------ ESCENA -- */

/** `hint`: el título de la lección, que suele nombrar la técnica («Push-in lento», «Contraluz de separación»). */
export function parseScene3d(input: Scene3dInput, hint = ""): SceneConfig {
  const environmentText = input?.environment ?? "";
  const subjectsText = input?.subjects ?? "";
  const cameraText = input?.camera ?? "";
  const scope = normalize(`${environmentText} ${subjectsText}`);
  const subjects = parseSubjects(subjectsText, hint);
  const camera = parseCamera(cameraText, hint);
  const { lights } = parseLighting(input?.lighting ?? "", hint);
  const preset = parsePreset(input, hint, camera.angle);
  // En 16:9 el sujeto va en un tercio: el izquierdo, salvo que la escena pida el derecho.
  const thirdSide: -1 | 1 = /tercio derecho/.test(cameraClauses(cameraText)) ? 1 : -1;
  const staged: Staged = {
    camera,
    subjects,
    lights,
    framing: { eyeLine: EYE_LINE, heightRule: null, screenX: null, thirdSide, forceAngle: null, tiltScale: 1 },
    staging: "normal",
    ambient: 1,
  };
  if (preset) {
    const cameraScope = cameraClauses(cameraText);
    const title = normalize(hint);
    applyPreset(preset, staged, {
      shot: Boolean(firstMatch(title, SHOTS) ?? firstMatch(cameraScope, SHOTS)),
      focal: parseFocal(cameraScope) !== undefined,
      move: Boolean(firstMatch(title, MOVES) ?? firstMatch(cameraScope, MOVES)),
      standing: /\bde pie\b|parad[oa]\b/.test(normalize(subjectsText)),
    });
  }
  // Toda escena lleva contraluz de separación, de otro color que el frente (se apaga con «Sin luz trasera»),
  // salvo que el texto diga explícitamente que no la tiene («sin contraluz fuerte» habla del error de contraluz, no de esta).
  const noBack = /\bsin (luz trasera|luz de separacion|contraluz de separacion)\b/.test(normalize(input?.lighting ?? ""));
  if (!noBack && !staged.lights.some(light => light.role === "back")) {
    const key = staged.lights.find(light => light.role === "key");
    const side: -1 | 1 = key?.side === 1 ? -1 : 1;
    staged.lights.push({ role: "back", source: "led", side, kelvin: contrastKelvin(key?.kelvin ?? 5600), hard: false, intensity: DEFAULT_INTENSITY.back });
  }
  const beats = parseBeats(input?.beats, camera, subjects);
  // Seguimiento a su ritmo: el sujeto camina en los pasos que solo dicen que habla o mira (la cámara lo acompaña).
  if (preset === "SEGUIMIENTO_RITMO") {
    for (const beat of beats) if (["talk", "idle", "lookLens", "walkIn"].includes(beat.action)) beat.action = "walk";
  }
  const environment = parseEnvironment(environmentText);
  const table = /\bmesa\b|mostrador|\bbarra\b/.test(scope) || environment === "mesa";
  const config: SceneConfig = {
    environment,
    props: {
      table,
      tableInFront: table && /detras de(l| la)? (mesa|mostrador|barra)|frente a la mesa|sobre la mesa|en la mesa/.test(scope),
      window: /ventana/.test(scope) || staged.lights.some(light => light.source === "window"),
      sofa: /\bsofa\b/.test(scope),
      shelf: /estante|repisa|anaquel/.test(scope),
      bench: /\bbanca\b|\bbanco\b/.test(scope),
      product: firstMatch(normalize(subjectsText), PRODUCTS) ?? firstMatch(scope, PRODUCTS) ?? "caja",
    },
    subjects,
    camera,
    lights: staged.lights.slice(0, 4),
    lightingLabels: [],
    beats,
    duration: beats.length ? beats[beats.length - 1].end : 0,
    preset,
    mistakes: [],
    mistake: null,
    format: "vertical",
    staging: staged.staging,
    body: { elbows: "pegados", feet: "adelantado" },
    framing: staged.framing,
    motion: "fluido",
    ambient: staged.ambient,
    backdrop: "normal",
  };
  config.lightingLabels = lightingLabels(config.lights);
  config.mistakes = sceneMistakes(input?.errores, config);
  return config;
}

/* --------------------------------------------------------------- VARIANTES -- */

/** Dónde caen los ojos en cada error de encuadre (fracción del alto desde arriba). */
const EYE_LINE_WRONG = { OJOS_FUERA_DEL_TERCIO: 0.56, CABEZA_CORTADA: 0.06 } as const;

/**
 * La escena en un formato y, si se pide, con un error a la vista. Es pura: la
 * versión correcta es la misma configuración con `mistake: null`.
 */
export function sceneVariant(config: SceneConfig, view: { format?: FrameFormat; mistake?: SceneMistake | null }): SceneConfig {
  const mistake = view.mistake ?? null;
  const next: SceneConfig = {
    ...config,
    format: view.format ?? config.format,
    mistake,
    body: { ...config.body },
    framing: { ...config.framing },
    lights: config.lights.map(light => ({ ...light })),
  };
  switch (mistake) {
    case "CONTRALUZ":
      if (config.ambient < 0.6) {
        // De noche no hay ventana de día: una lámpara encendida detrás del sujeto y nada delante.
        next.lights = [{ role: "back", source: "lampara", side: 0, kelvin: 2700, hard: false, intensity: 1 }];
        next.backdrop = "lampara";
      } else {
        // La ventana (o el sol) detrás del sujeto y nada delante.
        next.lights = [{ role: "back", source: "window", side: 0, kelvin: 6500, hard: false, intensity: 1 }];
        next.backdrop = "ventana";
      }
      next.ambient = Math.min(next.ambient, 0.32);
      break;
    case "SIN_LUZ_DE_MANO":
      // Solo queda la luz ambiente, que es poca.
      next.lights = next.lights.filter(light => light.source !== "mano");
      next.ambient = Math.min(next.ambient, 0.3);
      break;
    case "LUZ_PEGADA_AL_LENTE":
      // La luz de mano sobre el celular, en el eje de la cámara: de frente y dura.
      next.lights = next.lights.map(light => (light.source === "mano" ? { ...light, side: 0, hard: true, intensity: 1 } : light));
      break;
    case "TRASERA_MISMO_COLOR": {
      const key = next.lights.find(light => light.role === "key");
      next.lights = next.lights.map(light => {
        if (light.role !== "back") return light;
        const same: SceneLight = { ...light, kelvin: key?.kelvin ?? 5600 };
        delete same.rgb;
        return same;
      });
      break;
    }
    case "SIN_ESPACIO_DE_MIRADA":
      next.framing.screenX = 0;
      break;
    case "CONTRAPICADO_EXAGERADO":
      // Cámara muy baja: unos 35° hacia arriba en vez de 18°.
      next.framing.forceAngle = "contrapicado";
      next.framing.tiltScale = 35 / ANGLE_TILT.contrapicado;
      next.framing.heightRule = null;
      break;
    case "PICADO_FUERTE":
      // Cámara muy alta: unos 30° hacia abajo en vez de 18°.
      next.framing.forceAngle = "picado";
      next.framing.tiltScale = 30 / Math.abs(ANGLE_TILT.picado);
      next.framing.heightRule = null;
      break;
    case "SIN_LUZ_TRASERA":
      next.lights = next.lights.filter(light => light.role !== "back");
      next.backdrop = "pegado";
      break;
    case "CODOS_ABIERTOS":
      next.body.elbows = "abiertos";
      break;
    case "PIES_JUNTOS":
      next.body.feet = "juntos";
      break;
    case "OJOS_FUERA_DEL_TERCIO":
    case "CABEZA_CORTADA":
      next.framing.eyeLine = EYE_LINE_WRONG[mistake];
      break;
    case "TRIPODE_MUY_BAJO":
      next.framing.heightRule = "muyBajo";
      break;
    case "TRIPODE_MUY_ALTO":
      next.framing.heightRule = "muyAlto";
      break;
    case "MOVIMIENTO_BRUSCO":
      next.motion = "brusco";
      break;
    default:
      break;
  }
  next.lightingLabels = lightingLabels(next.lights);
  return next;
}

/**
 * Avance de la cámara según el avance del sujeto (0..1). Fluido: al mismo ritmo.
 * Brusco: se queda atrás y alcanza a tirones, cuatro veces por paso.
 */
export function followProgress(p: number, motion: SceneMotion) {
  const x = clamp(p, 0, 1);
  if (motion === "fluido") return x;
  const steps = 4;
  const scaled = x * steps;
  const index = Math.min(steps - 1, Math.floor(scaled));
  const local = scaled - index;
  // Se queda quieta el 65 % del tramo y luego alcanza al sujeto, sin adelantarlo nunca.
  return (index + (local < 0.65 ? 0 : local * smoothstep((local - 0.65) / 0.35))) / steps;
}

/* --------------------------------------------------------------- GEOMETRÍA -- */

/** Los ojos van sobre la línea horizontal superior de los tercios. */
export const EYE_LINE = 1 / 3;
/** Planos con persona en los que se aplica la línea de ojos (en los abiertos no entraría el cuerpo). */
export const EYE_LINE_SHOTS: readonly ShotSize[] = ["americano", "medio", "medioCorto", "primerPlano"];

/** Campo de visión vertical (grados) para una focal equivalente a 35 mm: el lado largo (36 mm) va en vertical en 9:16. */
export function frameFov(focalMm: number, format: FrameFormat = "vertical") {
  const half = format === "vertical" ? 18 : (18 * 9) / 16;
  return (2 * Math.atan(half / clamp(focalMm, 8, 300)) * 180) / Math.PI;
}

/** Campo de visión vertical del celular en 9:16 para una focal equivalente a 35 mm (36 mm en vertical). */
export function verticalFov(focalMm: number) {
  return frameFov(focalMm, "vertical");
}

/** Alto de cuadro (m) a la distancia del sujeto, por formato: en 16:9 el cuadro vertical es más corto. */
const FRAME_HEIGHT: Record<FrameFormat, Record<ShotSize, number>> = {
  vertical: { general: 3.1, entero: 2.1, americano: 1.4, medio: 1.0, medioCorto: 0.65, primerPlano: 0.42, detalle: 0.22 },
  horizontal: { general: 2.8, entero: 2.0, americano: 1.15, medio: 0.8, medioCorto: 0.52, primerPlano: 0.36, detalle: 0.18 },
};
/** Centro de interés de los planos sin línea de ojos, para una persona de pie. */
const FRAME_TARGET: Record<ShotSize, number> = { general: 1.0, entero: 0.92, americano: 1.12, medio: 1.3, medioCorto: 1.42, primerPlano: 1.56, detalle: 1.24 };
/** Inclinación de cada ángulo (grados; + mira hacia arriba). Altura de ojos = cámara nivelada. */
const ANGLE_TILT: Record<CameraAngle, number> = { ojos: 0, holandes: 0, contrapicado: 18, picado: -18, cenital: -90 };

/** Altura del lente según la regla de trípode. */
export function cameraHeightFor(rule: HeightRule, seated = false, feet: Feet = "adelantado") {
  if (rule === "pecho") return chestHeight(seated, feet);
  if (rule === "muyBajo") return Math.max(0.3, hipsHeight(seated, feet) - 0.3);
  return eyeHeight(seated, feet) + 0.5;
}

export type PlacementOptions = {
  seated?: boolean;
  productOnTable?: boolean;
  format?: FrameFormat;
  /** Dónde deben caer los ojos (fracción del alto desde arriba). Por defecto, la línea superior. */
  eyeLine?: number;
  heightRule?: HeightRule | null;
  /** Posición de la cámara alrededor del sujeto (rad): 0 de frente, + hacia +X. */
  azimuth?: number;
  /** Escala de la distancia (push-in / dolly out). */
  distanceScale?: number;
  /** Punto de los ojos (m). Por defecto, el del maniquí en el origen. */
  eyes?: readonly [number, number, number];
  /** Posición horizontal del sujeto en pantalla (NDC -1..1): 0 al centro, 1/3 en el tercio derecho. */
  screenX?: number;
  feet?: Feet;
  /** Multiplica la inclinación del ángulo (errores de contrapicado exagerado o picado fuerte). */
  tiltScale?: number;
};

export type CameraPlacement = {
  position: [number, number, number];
  target: [number, number, number];
  /** Campo de visión vertical (grados) del formato. */
  fov: number;
  roll: number;
  distance: number;
  aspect: number;
  /** Inclinación (grados): + hacia arriba (contrapicado), − hacia abajo (picado). */
  tilt: number;
  /** Punto de los ojos encuadrado con la línea de ojos; null si el plano no la usa. */
  eyes: [number, number, number] | null;
};

/**
 * Dónde va el celular para lograr el plano pedido: el sujeto está en el origen y mira hacia +Z.
 *
 * En los planos con persona (americano a primer plano) la inclinación se resuelve
 * para que los ojos caigan exactamente en `eyeLine`: si β es el ángulo de elevación
 * de los ojos vistos desde la cámara y θ la inclinación, en pantalla los ojos
 * quedan en y_ndc = tan(β − θ) / tan(fov/2), así que θ = β − atan((1 − 2·eyeLine)·tan(fov/2)).
 * A la altura de los ojos la cámara va nivelada (θ = 0) y se ubica a la altura justa.
 */
export function cameraPlacement(shot: ShotSize, angle: CameraAngle, focalMm: number, options: PlacementOptions = {}): CameraPlacement {
  const format = options.format ?? "vertical";
  const aspect = FORMAT_LABELS[format].aspect;
  const fov = frameFov(focalMm, format);
  const tanHalf = Math.tan((fov * Math.PI) / 360);
  const seated = options.seated ?? false;
  const feet = options.feet ?? "adelantado";
  const frameHeight = FRAME_HEIGHT[format][shot];
  const distance = Math.max(shot === "detalle" ? 0.25 : 0.4, frameHeight / 2 / tanHalf) * (options.distanceScale ?? 1);
  const roll = angle === "holandes" ? 12 : 0;
  const azimuth = options.azimuth ?? 0;
  const eyeLine = options.eyeLine ?? EYE_LINE;

  if (EYE_LINE_SHOTS.includes(shot) && angle !== "cenital") {
    const eyes: [number, number, number] = options.eyes ? [...options.eyes] : [0, eyeHeight(seated, feet), MANNEQUIN.eyesForward];
    const gamma = Math.atan((1 - 2 * eyeLine) * tanHalf);
    // En primer plano el lente va a la altura de los ojos aunque el informativo pida pecho.
    const rule = options.heightRule && !(options.heightRule === "pecho" && shot === "primerPlano") ? options.heightRule : null;
    let cameraY: number;
    let flat: number;
    if (rule) {
      cameraY = cameraHeightFor(rule, seated, feet);
      flat = distance;
    } else {
      const beta = gamma + ANGLE_TILT[angle] * (options.tiltScale ?? 1) * DEG;
      cameraY = eyes[1] - distance * Math.sin(beta);
      flat = distance * Math.cos(beta);
    }
    cameraY = clamp(cameraY, 0.15, 3);
    const position: [number, number, number] = [eyes[0] + Math.sin(azimuth) * flat, cameraY, eyes[2] + Math.cos(azimuth) * flat];
    return { ...aimAtEyes(position, eyes, gamma, Math.atan((options.screenX ?? 0) * tanHalf * aspect)), fov, roll, aspect, eyes };
  }

  const cx = options.eyes ? options.eyes[0] : 0;
  const cz = options.eyes ? options.eyes[2] - MANNEQUIN.eyesForward : 0;
  let targetY = FRAME_TARGET[shot];
  if (seated && shot !== "detalle") targetY = Math.max(0.55, targetY - 0.42);
  if (shot === "detalle" && options.productOnTable) targetY = 0.82;
  // Errores de encuadre en planos abiertos: el cuadro sube o baja respecto de los ojos.
  if (shot !== "detalle") targetY += (eyeLine - EYE_LINE) * frameHeight;
  let y: number;
  let flat: number;
  if (angle === "cenital") { y = targetY + Math.max(distance, 0.9); flat = 0.02; }
  else if (angle === "picado") { y = targetY + distance * 0.55; flat = distance * 0.85; }
  else if (angle === "contrapicado") { y = Math.max(0.2, targetY - distance * 0.45); flat = distance * 0.9; }
  else { y = clamp(targetY + 0.05, 0.3, 1.7); flat = distance; }
  if (options.heightRule && angle !== "cenital" && shot !== "detalle") y = cameraHeightFor(options.heightRule, seated, feet);
  const position: [number, number, number] = [cx + Math.sin(azimuth) * flat, y, cz + Math.cos(azimuth) * flat];
  const target: [number, number, number] = [cx, targetY, cz];
  const span = Math.hypot(position[0] - cx, position[2] - cz);
  return {
    position,
    target,
    fov,
    roll,
    aspect,
    distance: Math.hypot(position[0] - cx, position[1] - targetY, position[2] - cz),
    tilt: (Math.atan2(targetY - y, Math.max(0.001, span)) * 180) / Math.PI,
    eyes: null,
  };
}

/**
 * Orienta la cámara hacia los ojos: gira en horizontal `yawOffset` (composición) y
 * resuelve la inclinación exacta para que los ojos caigan en la línea pedida (`gamma`).
 */
function aimAtEyes(position: [number, number, number], eyes: readonly [number, number, number], gamma: number, yawOffset: number) {
  const dx = eyes[0] - position[0];
  const dz = eyes[2] - position[2];
  const yaw = Math.atan2(dx, dz) + yawOffset;
  const hx = Math.sin(yaw);
  const hz = Math.cos(yaw);
  const depth = dx * hx + dz * hz;
  const rise = eyes[1] - position[1];
  const tilt = Math.atan2(rise, depth) - gamma;
  const distance = Math.hypot(dx, rise, dz);
  const target: [number, number, number] = [
    position[0] + hx * Math.cos(tilt) * distance,
    position[1] + Math.sin(tilt) * distance,
    position[2] + hz * Math.cos(tilt) * distance,
  ];
  return { position, target, distance, tilt: (tilt * 180) / Math.PI };
}

/** Base del sujeto principal (posición y giro) según la puesta en escena. */
export function subjectBase(config: Pick<SceneConfig, "staging">): { x: number; z: number; yaw: number } {
  return config.staging === "podcast" ? { x: 0, z: 0, yaw: PODCAST.yaw } : { x: 0, z: 0, yaw: 0 };
}

/** Punto de los ojos del sujeto principal, desplazado `offset` desde su marca. */
export function eyePoint(config: Pick<SceneConfig, "staging" | "subjects" | "body">, offset: { x: number; z: number } = { x: 0, z: 0 }): [number, number, number] {
  const base = subjectBase(config);
  return [
    base.x + offset.x + Math.sin(base.yaw) * MANNEQUIN.eyesForward,
    eyeHeight(config.subjects.seated, config.body.feet),
    base.z + offset.z + Math.cos(base.yaw) * MANNEQUIN.eyesForward,
  ];
}

/**
 * Dónde va el sujeto en horizontal (NDC): lo forzado por un error, el tercio izquierdo del
 * podcast (mira hacia quien entrevista) o, en 16:9, un tercio con espacio de mirada. En 9:16, al centro.
 */
export function subjectScreenX(config: Pick<SceneConfig, "framing" | "staging" | "format" | "subjects">) {
  if (config.framing.screenX !== null) return config.framing.screenX;
  if (config.staging === "podcast") return PODCAST.screenX;
  if (config.format === "horizontal" && !config.subjects.productOnly) return config.framing.thirdSide / 3;
  return 0;
}

/** Ángulo con el que se graba un paso: el del paso, salvo que un error lo fuerce. */
export function beatAngle(config: Pick<SceneConfig, "framing">, beat: Pick<SceneBeat, "angle">): CameraAngle {
  return beat.angle !== "cenital" && config.framing.forceAngle ? config.framing.forceAngle : beat.angle;
}

/** Colocación de la cámara para un paso de la escena, con su formato, su error y su puesta en escena. */
export function placementForBeat(config: SceneConfig, beat: Pick<SceneBeat, "shot" | "angle" | "focalMm">, overrides: PlacementOptions = {}): CameraPlacement {
  const podcast = config.staging === "podcast";
  return cameraPlacement(beat.shot, beatAngle(config, beat), beat.focalMm, {
    seated: config.subjects.seated,
    format: config.format,
    eyeLine: config.framing.eyeLine,
    heightRule: config.framing.heightRule,
    azimuth: podcast ? PODCAST.azimuth : 0,
    screenX: subjectScreenX(config),
    eyes: eyePoint(config),
    feet: config.body.feet,
    tiltScale: config.framing.tiltScale,
    ...overrides,
  });
}

/** Color aproximado de una temperatura de color (algoritmo de Tanner Helland), como «#rrggbb». */
export function kelvinToHex(kelvin: number) {
  const k = clamp(kelvin, 1000, 40000) / 100;
  const red = k <= 66 ? 255 : 329.698727446 * Math.pow(k - 60, -0.1332047592);
  const green = k <= 66 ? 99.4708025861 * Math.log(k) - 161.1195681661 : 288.1221695283 * Math.pow(k - 60, -0.0755148492);
  const blue = k >= 66 ? 255 : k <= 19 ? 0 : 138.5177312231 * Math.log(k - 10) - 305.0447927307;
  return "#" + [red, green, blue].map(channel => Math.round(clamp(channel, 0, 255)).toString(16).padStart(2, "0")).join("");
}

/** Color con el que se dibuja (y se ilumina) una luz: su RGB si lo tiene, si no su temperatura. */
export function lightHex(light: Pick<SceneLight, "kelvin" | "rgb">) {
  return light.rgb?.hex ?? kelvinToHex(light.kelvin);
}
