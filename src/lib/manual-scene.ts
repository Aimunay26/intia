/**
 * Traduce el texto libre de `scene3d` (manual de procedimientos) a una configuración
 * tipada para el visor 3D. Es puro y está probado (tests/manual.test.mts).
 *
 * Trabaja por palabras clave, sin IA: reconoce lo más habitual del currículo
 * (entornos, tamaños de plano, ángulos, lentes, movimientos, esquemas de luz,
 * acciones del talento y pasos con tiempos «0-3 s»). Lo que no reconoce cae en
 * valores prudentes: estudio, plano medio a la altura de los ojos, 26 mm,
 * cámara fija y luz principal suave con relleno. Los pasos en texto siempre
 * acompañan a la escena y son el equivalente completo.
 */

export type SceneEnvironment = "estudio" | "tienda" | "mesa" | "sala" | "calle";
export type ShotSize = "general" | "entero" | "americano" | "medio" | "medioCorto" | "primerPlano" | "detalle";
export type CameraAngle = "ojos" | "picado" | "contrapicado" | "cenital" | "holandes";
export type CameraMove = "fija" | "paneo" | "tilt" | "travelling" | "pushIn" | "pullOut" | "orbita" | "seguimiento" | "mano" | "whip";
export type SubjectAction = "idle" | "walkIn" | "walk" | "turn" | "showProduct" | "lookLens" | "lookAway" | "sit" | "point" | "react" | "talk";
export type LightRole = "key" | "fill" | "back" | "background";
export type LightSource = "softbox" | "window" | "sun" | "ring" | "bounce" | "led";
export type ProductKind = "taza" | "prenda" | "plato" | "caja" | "celular";
export type BeatTone = "error" | "ok" | "neutral";

export type SceneLight = { role: LightRole; source: LightSource; side: -1 | 0 | 1; kelvin: number; hard: boolean; intensity: number };
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
};
export type Scene3dInput = { environment?: string; subjects?: string; camera?: string; lighting?: string; beats?: readonly string[] } | null | undefined;

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
  ["ojos", /altura de (los )?ojos|nivel de (los )?ojos|altura de la mirada/],
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
  ["mano", /camara en mano|\ben mano\b|handheld|a mano alzada|palo selfie|\bselfie\b/],
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
  ["talk", /\bhabla|\bdice\b|dialogo|su frase|la linea/],
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
const PERSON = /\b(actor|actriz|actores|talento|persona|personas|cliente|clienta|mujer|hombre|hij[oa]|pareja|figuras?|complice|transeunte|chef|meser[oa]|vendedor[a]?|modelo|nin[oa]|madre|padre|entrevistad[oa]|presentador[a]?|duen[oa]|manos|maniqui(?! f\b))/;

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
  const hintAction = firstMatch(normalize(hint), ACTIONS);
  const found = matchesInOrder(t, ACTIONS);
  const seated = found.includes("sit");
  // Estar sentado es un estado de toda la escena, no un paso: no ocupa lugar en la secuencia.
  const actions = [...new Set([...(hintAction ? [hintAction] : []), ...found])].filter(action => action !== "sit");
  const labelled = new Set((t.match(/\bmaniqui [a-z]\b/g) ?? []).filter(label => label !== "maniqui f"));
  const withoutOperator = t.replace(/maniqui f\b[^.;]*/g, " ");
  return {
    count: TWO_SUBJECTS.test(t) || labelled.size > 1 || (CUSTOMER.test(t) && SELLER.test(t)) ? 2 : 1,
    actions: actions.length ? actions : ["idle", "lookLens"],
    seated: seated || hintAction === "sit",
    operator: OPERATOR.test(t),
    productOnly: t.trim().length > 0 && !PERSON.test(withoutOperator),
    enterFrom: /desde la derecha|hacia -x|borde derecho|por la derecha/.test(t) ? 1 : -1,
  };
}

const SKIP_LIGHT = /^(nota|aviso|evitar|sin|no|error|ojo|importante)\b|evitar/;
const LIGHT_SPLIT = /(?<=[.;])\s+|,\s+(?=(?:un |una |el |la )?(?:rebot|relleno|contraluz|contra\b|reflector|luz|fondo|key|fill|back))|\s+y\s+(?=(?:un |una |el |la )?(?:rebot|relleno|contraluz|contra\b|reflector|key|fill|back))/;

function lightRole(clause: string): LightRole | null {
  if (/contraluz|contra luz|^contra\b|back ?light|luz trasera|\brim\b|separa(r|rla|rlo|cion)? del fondo/.test(clause)) return "back";
  if (/^fondo\b|luz de fondo|ilumina el fondo/.test(clause)) return "background";
  if (/relleno|\bfill\b|rebot|reflector|panel blanco|cartulina blanca|pared clara|ambiente/.test(clause)) return "fill";
  if (/\bkey\b|principal|luz clave|ventana|softbox|aro de luz|ring ?light|panel|\bled\b|\bsol\b|luz natural|nublad|hora dorada|\bfoco\b|lampara|luz (dura|suave)|luz de/.test(clause)) return "key";
  return null;
}

function lightSource(clause: string, role: LightRole): LightSource {
  if (/ventana/.test(clause)) return "window";
  if (/aro de luz|ring ?light/.test(clause)) return "ring";
  if (/softbox|caja de luz/.test(clause)) return "softbox";
  if (/\bsol\b|luz natural|nublad|hora dorada|cielo|exterior/.test(clause)) return "sun";
  if (/rebot|reflector|panel blanco|cartulina|pared/.test(clause)) return "bounce";
  if (/\bled\b|panel|\bfoco\b|lampara/.test(clause)) return "led";
  return role === "key" ? "softbox" : role === "fill" ? "bounce" : "led";
}

export function parseKelvin(clause: string): number {
  const t = normalize(clause);
  const kelvin = /(\d{4,5})\s?k\b/.exec(t);
  if (kelvin) return clamp(Number(kelvin[1]), 1800, 10000);
  if (/calid|dorad|tungsteno|atardecer|\bvela\b|naranja/.test(t)) return 3200;
  if (/\bfri[oa]\b|azul|nublad|sombra/.test(t)) return 6500;
  return 5600;
}

const DEFAULT_INTENSITY: Record<LightRole, number> = { key: 1, fill: 0.45, back: 0.6, background: 0.35 };
const DEFAULT_SIDE: Record<LightRole, -1 | 0 | 1> = { key: -1, fill: 1, back: 0, background: 0 };

export function parseLighting(text: string, hint = ""): { lights: SceneLight[]; labels: string[] } {
  const t = normalize(text);
  const h = normalize(hint);
  const lights: SceneLight[] = [];
  for (const raw of t.split(LIGHT_SPLIT)) {
    const clause = raw.trim();
    if (!clause || SKIP_LIGHT.test(clause)) continue;
    const role = lightRole(clause);
    if (!role || lights.some(light => light.role === role)) continue;
    const percent = /(\d{1,3})\s?%/.exec(clause);
    const side: -1 | 0 | 1 = /izquierd|-x\b/.test(clause) ? -1 : /derech|\+x\b/.test(clause) ? 1 : DEFAULT_SIDE[role];
    lights.push({
      role,
      source: lightSource(clause, role),
      side: role === "fill" && side === 0 ? 1 : side,
      kelvin: parseKelvin(clause),
      hard: /\bdura\b|directa|sol directo|mediodia|flash/.test(clause) && !/suave|difus/.test(clause),
      intensity: percent ? clamp(Number(percent[1]) / 100, 0.1, 1) : DEFAULT_INTENSITY[role],
    });
  }
  const threePoints = /\b(3|tres) puntos\b/.test(t);
  if (!lights.some(light => light.role === "key")) lights.unshift({ role: "key", source: /ventana/.test(t) ? "window" : "softbox", side: -1, kelvin: parseKelvin(t), hard: /\bdura\b/.test(t), intensity: 1 });
  const key = lights.find(light => light.role === "key")!;
  if (threePoints || !lights.some(light => light.role === "fill")) {
    if (!lights.some(light => light.role === "fill")) lights.push({ role: "fill", source: "bounce", side: key.side === 1 ? -1 : 1, kelvin: key.kelvin, hard: false, intensity: 0.4 });
  }
  if ((threePoints || /contraluz|contra luz/.test(h)) && !lights.some(light => light.role === "back")) lights.push({ role: "back", source: "led", side: 0, kelvin: key.kelvin, hard: false, intensity: 0.6 });
  if (/ventana/.test(h)) key.source = "window";
  if (/ring ?light|aro de luz/.test(h) && key.source !== "window") key.source = "ring";
  if (/\bdura\b/.test(h) && !/suave/.test(h)) key.hard = true;
  // El relleno siempre va del lado contrario a la principal.
  for (const light of lights) if (light.role === "fill" && key.side !== 0 && light.side === key.side) light.side = key.side === 1 ? -1 : 1;

  const labels: string[] = [];
  const has = (role: LightRole) => lights.some(light => light.role === role);
  if (has("key") && has("fill") && has("back")) labels.push("3 puntos");
  if (key.source === "window") labels.push("Ventana lateral");
  else if (key.source === "sun") labels.push("Luz natural");
  else if (key.source === "ring") labels.push("Aro de luz");
  if (has("back") && !labels.includes("3 puntos")) labels.push("Contraluz");
  labels.push(key.hard ? "Luz dura" : "Luz suave");
  labels.push(key.kelvin <= 4000 ? "Cálida" : key.kelvin >= 6200 ? "Fría" : "Luz de día");
  return { lights: lights.slice(0, 4), labels };
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

type RawBeat = { text: string; timeLabel: string | null; seconds: number };

function splitBeats(beats: readonly string[]): RawBeat[] {
  return beats.map(text => text.trim()).filter(Boolean).map(text => {
    const range = TIME_RANGE.exec(text);
    if (range) {
      const start = Number(range[1].replace(",", "."));
      const end = Number(range[2].replace(",", "."));
      return { text: text.slice(range[0].length).trim() || text, timeLabel: `${range[1]}–${range[2]} s`, seconds: end > start ? end - start : MIN_BEAT };
    }
    const point = TIME_POINT.exec(text);
    if (point) return { text: text.slice(point[0].length).trim() || text, timeLabel: `${point[1]} s`, seconds: MIN_BEAT };
    return { text, timeLabel: null, seconds: 3 };
  });
}

function beatAction(action: SubjectAction | undefined, subjects: SceneConfig["subjects"]): SubjectAction | undefined {
  if (action === "walk" && subjects.actions.includes("walkIn")) return "walkIn";
  if (action === "sit" && subjects.seated) return undefined;
  return action;
}

export function parseBeats(beats: readonly string[] | undefined, camera: SceneConfig["camera"], subjects: SceneConfig["subjects"]): SceneBeat[] {
  const raw = splitBeats(beats ?? []);
  const source = raw.length ? raw : [{ text: "Observa la escena desde distintos ángulos.", timeLabel: null, seconds: 4 }];
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
      tone: firstMatch(t, TONES) ?? "neutral",
      overview,
      keyAngle,
      keyHeight,
    };
  });
}

/* ------------------------------------------------------------------ ESCENA -- */

/** `hint`: el título de la lección, que suele nombrar la técnica («Push-in lento», «Contraluz de separación»). */
export function parseScene3d(input: Scene3dInput, hint = ""): SceneConfig {
  const environmentText = input?.environment ?? "";
  const subjectsText = input?.subjects ?? "";
  const scope = normalize(`${environmentText} ${subjectsText}`);
  const subjects = parseSubjects(subjectsText, hint);
  const camera = parseCamera(input?.camera ?? "", hint);
  const { lights, labels } = parseLighting(input?.lighting ?? "", hint);
  const beats = parseBeats(input?.beats, camera, subjects);
  const environment = parseEnvironment(environmentText);
  const table = /\bmesa\b|mostrador|\bbarra\b/.test(scope) || environment === "mesa";
  return {
    environment,
    props: {
      table,
      tableInFront: table && /detras de(l| la)? (mesa|mostrador|barra)|frente a la mesa|sobre la mesa|en la mesa/.test(scope),
      window: /ventana/.test(scope) || lights.some(light => light.source === "window"),
      sofa: /\bsofa\b/.test(scope),
      shelf: /estante|repisa|anaquel/.test(scope),
      bench: /\bbanca\b|\bbanco\b/.test(scope),
      product: firstMatch(normalize(subjectsText), PRODUCTS) ?? firstMatch(scope, PRODUCTS) ?? "caja",
    },
    subjects,
    camera,
    lights,
    lightingLabels: labels,
    beats,
    duration: beats.length ? beats[beats.length - 1].end : 0,
  };
}

/* --------------------------------------------------------------- GEOMETRÍA -- */

/** Campo de visión vertical del celular en 9:16 para una focal equivalente a 35 mm (36 mm en vertical). */
export function verticalFov(focalMm: number) {
  return (2 * Math.atan(18 / clamp(focalMm, 8, 300)) * 180) / Math.PI;
}

/** Alto de cuadro (m) y altura del centro de interés para una persona de 1,70 m. */
const FRAMING: Record<ShotSize, { height: number; target: number }> = {
  general: { height: 3.1, target: 1.0 },
  entero: { height: 2.1, target: 0.92 },
  americano: { height: 1.4, target: 1.12 },
  medio: { height: 1.0, target: 1.3 },
  medioCorto: { height: 0.65, target: 1.42 },
  primerPlano: { height: 0.42, target: 1.56 },
  detalle: { height: 0.22, target: 1.24 },
};

export type CameraPlacement = { position: [number, number, number]; target: [number, number, number]; fov: number; roll: number; distance: number };

/** Dónde va el celular para lograr el plano pedido: el sujeto está en el origen y mira hacia +Z. */
export function cameraPlacement(shot: ShotSize, angle: CameraAngle, focalMm: number, options: { seated?: boolean; productOnTable?: boolean } = {}): CameraPlacement {
  const fov = verticalFov(focalMm);
  const framing = FRAMING[shot];
  let targetY = framing.target;
  if (options.seated && shot !== "detalle") targetY = Math.max(0.55, targetY - 0.42);
  if (shot === "detalle" && options.productOnTable) targetY = 0.82;
  const distance = Math.max(shot === "detalle" ? 0.25 : 0.4, framing.height / 2 / Math.tan((fov * Math.PI) / 360));
  const target: [number, number, number] = [0, targetY, 0];
  let position: [number, number, number];
  if (angle === "cenital") position = [0, targetY + Math.max(distance, 0.9), 0.02];
  else if (angle === "picado") position = [0, targetY + distance * 0.55, distance * 0.85];
  else if (angle === "contrapicado") position = [0, Math.max(0.2, targetY - distance * 0.45), distance * 0.9];
  else position = [0, clamp(targetY + 0.05, 0.3, 1.7), distance];
  return { position, target, fov, roll: angle === "holandes" ? 12 : 0, distance };
}

/** Color aproximado de una temperatura de color (algoritmo de Tanner Helland), como «#rrggbb». */
export function kelvinToHex(kelvin: number) {
  const k = clamp(kelvin, 1000, 40000) / 100;
  const red = k <= 66 ? 255 : 329.698727446 * Math.pow(k - 60, -0.1332047592);
  const green = k <= 66 ? 99.4708025861 * Math.log(k) - 161.1195681661 : 288.1221695283 * Math.pow(k - 60, -0.0755148492);
  const blue = k >= 66 ? 255 : k <= 19 ? 0 : 138.5177312231 * Math.log(k - 10) - 305.0447927307;
  return "#" + [red, green, blue].map(channel => Math.round(clamp(channel, 0, 255)).toString(16).padStart(2, "0")).join("");
}
