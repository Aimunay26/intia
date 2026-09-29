/**
 * Maquetas de las guías ilustradas (iPhone, Samsung Galaxy y Sony ZV-E10): catálogo de
 * pantallas, los textos que muestra cada una y la geometría de sus puntos tocables.
 *
 * TypeScript puro (sin React): lo comparten el dibujo (device-guide-screens.tsx), el
 * componente (device-guide.tsx) y las pruebas (tests/manual-guias.test.mts). Así el dedo
 * de cada paso cae exactamente sobre el elemento dibujado.
 *
 * Coordenadas: cada pantalla tiene su lienzo (ancho × alto en unidades SVG). Los puntos
 * que se exportan van de 0 a 1, relativos a ese lienzo. Los textos imitan el sistema en
 * español de Latinoamérica («Configuración»); son maquetas propias y referenciales, no
 * capturas: el orden y los nombres pueden variar según modelo y versión.
 */

export type Punto = { x: number; y: number };
type Px = readonly [number, number];
export type Marco = "IPHONE" | "GALAXY" | "SONY" | "MONITOR" | "LIBRE";

/* ------------------------------------------------------------------ TIPOS -- */

export type FilaTipo = "nav" | "on" | "off" | "check" | "radio" | "radio-on" | "texto" | "boton" | "slider";
export type IconoFila = "wifi" | "bluetooth" | "general" | "accesibilidad" | "accion" | "camara" | "control" | "pantalla";
export type Fila = { label: string; valor?: string; tipo?: FilaTipo; icono?: IconoFila };
export type Grupo = { titulo?: string; filas: Fila[]; pie?: string };
export type SonyOpciones = { titulo: string; items: string[]; activo: number };

export type IosCamVariante = "video" | "formato" | "fps" | "log" | "bloqueo" | "controles" | "controles-pro" | "lenta";
export type SamCamVariante =
  | "video"
  | "controles"
  | "tamano"
  | "tamano-pro"
  | "aspecto"
  | "mas"
  | "pro"
  | "pro-log"
  | "monitor"
  | "speed"
  | "iso"
  | "wb"
  | "focus"
  | "bloqueo"
  | "toque"
  | "af-ae"
  | "lenta";
export type SonyTomaVariante = "info" | "modo" | "log" | "cebra" | "tactil" | "resalte" | "audio" | "ae" | "cuadricula" | "marcador";
export type IlustracionVariante =
  | "ios-inicio"
  | "ios-lateral"
  | "ios-ssd"
  | "sony-superior"
  | "sony-paravientos"
  | "sony-lateral"
  | "sony-vertical"
  | "sony-licencia"
  | "editor-lut";

type Base = { nombre: string };
export type IosLista = Base & { tipo: "IOS_LISTA"; titulo: string; atras?: string; grande?: boolean; buscador?: boolean; hoja?: boolean; grupos: Grupo[] };
export type SamLista = Base & { tipo: "SAM_LISTA"; titulo: string; version?: string; grupos: Grupo[] };
export type SonyMenu = Base & {
  tipo: "SONY_MENU";
  estilo: "CLASICO" | "NUEVO";
  pestana: number;
  ruta: string;
  items: { label: string; valor?: string }[];
  activo?: number;
  opciones?: SonyOpciones;
};
export type IosCamara = Base & { tipo: "IOS_CAMARA"; variante: IosCamVariante };
export type SamCamara = Base & { tipo: "SAM_CAMARA"; variante: SamCamVariante };
export type SonyToma = Base & { tipo: "SONY_TOMA"; variante: SonyTomaVariante; opciones?: SonyOpciones };
export type Ilustracion = Base & { tipo: "ILUSTRACION"; variante: IlustracionVariante };
export type ScreenSpec = IosLista | SamLista | SonyMenu | IosCamara | SamCamara | SonyToma | Ilustracion;

/* ----------------------------------------------------------- MEDIDAS BASE -- */

export const PHONE = { w: 360, h: 780 } as const;
export const SONY_BODY = { w: 640, h: 420 } as const;
export const MONITOR = { w: 640, h: 400 } as const;
/** Pantalla abatible de la Sony dentro del dorso (3:2). */
export const SONY_LCD = { x: 28, y: 64, w: 384, h: 256 } as const;

export const SONY_PESTANAS_CLASICO = ["Ajustes de cámara1", "Ajustes de cámara2", "Red", "Reproducción", "Ajustes", "Mi menú"] as const;
export const SONY_PESTANAS_NUEVO = ["Principal", "Toma", "Exposición/color", "Enfoque", "Reproducción", "Red", "Ajustes", "Mi menú"] as const;

/* --------------------------------------------------------------- TEXTO -- */

/** Ancho aproximado de un texto (Manrope ≈ 0,55 em por carácter; mayúsculas algo más). */
export function anchoTexto(texto: string, tam: number) {
  let total = 0;
  for (const char of texto) total += char === " " ? 0.3 : /[A-ZÁÉÍÓÚÑ0-9]/.test(char) ? 0.64 : /[il.,:;'|]/.test(char) ? 0.3 : 0.55;
  return total * tam;
}

/** Parte un texto en líneas que caben en `ancho` (sin cortar palabras salvo que una sola no quepa). */
export function envolver(texto: string, ancho: number, tam: number): string[] {
  const palabras = texto.split(/\s+/).filter(Boolean);
  const lineas: string[] = [];
  let actual = "";
  for (const palabra of palabras) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (!actual || anchoTexto(prueba, tam) <= ancho) actual = prueba;
    else {
      lineas.push(actual);
      actual = palabra;
    }
  }
  if (actual) lineas.push(actual);
  return lineas.length ? lineas : [""];
}

/**
 * Punto de toque justo después del texto de una fila: el anillo y la mano quedan al
 * costado y la etiqueta se sigue leyendo. Nunca pasa de `tope` (zona de valores o flechas).
 */
function trasEtiqueta(labelX: number, lineas: string[], tam: number, tope: number) {
  const ancho = Math.max(...lineas.map(linea => anchoTexto(linea, tam)));
  return Math.min(labelX + ancho + 26, tope);
}

/* ------------------------------------------------------ LISTAS DE iPHONE -- */

export const IOS_LISTA = { x0: 16, x1: 344, tam: 16, labelX: 32, labelXIcono: 70, toggleX: 317, derecha: 330 } as const;

export type FilaUbicada = { fila: Fila; y: number; h: number; lineas: string[]; labelX: number };
export type GrupoUbicado = { tituloY?: number; titulo?: string; top: number; alto: number; filas: FilaUbicada[]; pie?: { y: number; lineas: string[] } };

function reservaDerecha(fila: Fila, tam: number, conChevron: boolean) {
  const tipo = fila.tipo ?? "nav";
  if (tipo === "on" || tipo === "off") return 64;
  if (tipo === "check" || tipo === "radio" || tipo === "radio-on") return 34;
  if (tipo === "boton" || tipo === "slider") return 0;
  const valor = fila.valor ? anchoTexto(fila.valor, tam - 1) + 10 : 0;
  return valor + (conChevron && tipo === "nav" ? 22 : 6);
}

export function iosListaLayout(spec: IosLista): GrupoUbicado[] {
  let y = spec.hoja ? 140 : spec.grande ? (spec.buscador ? 204 : 160) : 108;
  return spec.grupos.map(grupo => {
    let tituloY: number | undefined;
    if (grupo.titulo) {
      tituloY = y + 14;
      y += 24;
    }
    const top = y;
    const filas = grupo.filas.map(fila => {
      const labelX = fila.icono ? IOS_LISTA.labelXIcono : IOS_LISTA.labelX;
      const tipo = fila.tipo ?? "nav";
      const ancho = tipo === "boton" ? IOS_LISTA.x1 - IOS_LISTA.x0 - 24 : IOS_LISTA.x1 - labelX - reservaDerecha(fila, IOS_LISTA.tam, true) - 8;
      const lineas = envolver(fila.label, ancho, IOS_LISTA.tam);
      const h = Math.max(46, lineas.length * 19 + 25 + (tipo === "slider" ? 26 : 0));
      const ubicada = { fila, y, h, lineas, labelX };
      y += h;
      return ubicada;
    });
    const alto = y - top;
    let pie: GrupoUbicado["pie"];
    if (grupo.pie) {
      const lineas = envolver(grupo.pie, IOS_LISTA.x1 - IOS_LISTA.x0 - 20, 12.5);
      pie = { y: y + 18, lineas };
      y += 8 + lineas.length * 16;
    }
    y += 22;
    return { tituloY, titulo: grupo.titulo, top, alto, filas, pie };
  });
}

function puntosIosLista(spec: IosLista): Record<string, Px> {
  const puntos: Record<string, Px> = {};
  if (spec.atras) puntos["Atrás"] = [34, 80];
  if (spec.hoja) puntos["Cerrar"] = [326, 96];
  for (const grupo of iosListaLayout(spec)) {
    for (const { fila, y, h, labelX, lineas } of grupo.filas) {
      const cy = y + h / 2;
      const tipo = fila.tipo ?? "nav";
      if (tipo === "on" || tipo === "off") puntos[fila.label] = [IOS_LISTA.toggleX, cy];
      else if (tipo === "boton") puntos[fila.label] = [180, cy];
      else if (tipo === "slider") puntos[fila.label] = [210, y + h - 22];
      else puntos[fila.label] = [trasEtiqueta(labelX, lineas, IOS_LISTA.tam, 262), cy];
    }
  }
  return puntos;
}

/* ----------------------------------------------------- LISTAS DE SAMSUNG -- */

export const SAM_LISTA = { x0: 12, x1: 348, tam: 16.5, labelX: 30, labelXRadio: 66, toggleX: 314 } as const;

export function samListaLayout(spec: SamLista): GrupoUbicado[] {
  let y = 108;
  return spec.grupos.map(grupo => {
    let tituloY: number | undefined;
    if (grupo.titulo) {
      tituloY = y + 14;
      y += 26;
    }
    const top = y;
    const filas = grupo.filas.map(fila => {
      const tipo = fila.tipo ?? "nav";
      const labelX = tipo === "radio" || tipo === "radio-on" ? SAM_LISTA.labelXRadio : SAM_LISTA.labelX;
      const ancho = SAM_LISTA.x1 - labelX - (tipo === "on" || tipo === "off" ? 70 : 20);
      const lineas = envolver(fila.label, ancho, SAM_LISTA.tam);
      const valorLineas = fila.valor ? envolver(fila.valor, ancho, 13.5).length : 0;
      const h = Math.max(56, lineas.length * 20 + valorLineas * 17 + 24);
      const ubicada = { fila, y, h, lineas, labelX };
      y += h;
      return ubicada;
    });
    const alto = y - top;
    let pie: GrupoUbicado["pie"];
    if (grupo.pie) {
      const lineas = envolver(grupo.pie, SAM_LISTA.x1 - SAM_LISTA.x0 - 28, 12.5);
      pie = { y: y + 20, lineas };
      y += 10 + lineas.length * 16;
    }
    y += 16;
    return { tituloY, titulo: grupo.titulo, top, alto, filas, pie };
  });
}

function puntosSamLista(spec: SamLista): Record<string, Px> {
  const puntos: Record<string, Px> = { "Atrás": [28, 72] };
  for (const grupo of samListaLayout(spec)) {
    for (const { fila, y, h, labelX, lineas } of grupo.filas) {
      const cy = y + h / 2;
      const tipo = fila.tipo ?? "nav";
      if (tipo === "on" || tipo === "off") puntos[fila.label] = [SAM_LISTA.toggleX, cy];
      else puntos[fila.label] = [trasEtiqueta(labelX, lineas, SAM_LISTA.tam, 270), cy];
    }
  }
  return puntos;
}

/* ------------------------------------------------------- MENÚS DE SONY -- */

export const SONY_MENU = {
  clasico: { filasY: 62, fila: 30, labelX: 12 },
  nuevo: { filasY: 38, fila: 32, labelX: 52 },
} as const;

export type OpcionesUbicadas = { x: number; y: number; w: number; fila: number; filasY: number };

/** Panel de opciones a la derecha. En el menú clásico empieza bajo la línea de ruta para no taparla. */
export function sonyOpcionesLayout(opciones: SonyOpciones, x: number, y: number): OpcionesUbicadas {
  const fila = Math.min(27, (SONY_LCD.h - y - 34) / opciones.items.length);
  return { x, y, w: SONY_LCD.w - x - 6, fila, filasY: y + 28 };
}

export function sonyMenuFilas(spec: SonyMenu) {
  const medidas = spec.estilo === "CLASICO" ? SONY_MENU.clasico : SONY_MENU.nuevo;
  return spec.items.map((item, index) => ({ item, y: medidas.filasY + index * medidas.fila, h: medidas.fila, labelX: medidas.labelX }));
}

function enCuerpo([x, y]: Px): Px {
  return [SONY_LCD.x + x, SONY_LCD.y + y];
}

/** Posición del panel de opciones según el estilo de pantalla. */
export function sonyOpcionesOrigen(estilo: "CLASICO" | "NUEVO" | "TOMA") {
  return estilo === "CLASICO" ? { x: 168, y: 60 } : { x: 176, y: 34 };
}

function puntosSonyOpciones(opciones: SonyOpciones, estilo: "CLASICO" | "NUEVO" | "TOMA"): Record<string, Px> {
  const origen = sonyOpcionesOrigen(estilo);
  const panel = sonyOpcionesLayout(opciones, origen.x, origen.y);
  const puntos: Record<string, Px> = {};
  opciones.items.forEach((item, index) => {
    puntos[item] = enCuerpo([trasEtiqueta(panel.x + 12, [item], 12.5, panel.x + panel.w - 18), panel.filasY + index * panel.fila + panel.fila / 2]);
  });
  return puntos;
}

function puntosSonyMenu(spec: SonyMenu): Record<string, Px> {
  const puntos: Record<string, Px> = { ...SONY_CUERPO_PUNTOS };
  for (const { item, y, h, labelX } of sonyMenuFilas(spec)) puntos[item.label] = enCuerpo([trasEtiqueta(labelX, [item.label], 13.5, 236), y + h / 2]);
  if (spec.opciones) Object.assign(puntos, puntosSonyOpciones(spec.opciones, spec.estilo));
  return puntos;
}

/* ------------------------------------------------ CUERPO DE LA SONY (DORSO) -- */

/** Controles físicos vistos desde atrás (mismas coordenadas en todas las pantallas SONY). */
export const SONY_CUERPO = {
  menu: [512, 84],
  rueda: [526, 231],
  iso: [567, 231],
  disp: [526, 191],
  reproduccion: [484, 352],
  producto: [563, 357],
  modo: [448, 36],
  c1: [496, 36],
  movie: [544, 36],
  disparador: [598, 34],
} as const satisfies Record<string, Px>;

const SONY_CUERPO_PUNTOS: Record<string, Px> = {
  MENU: SONY_CUERPO.menu,
  "Rueda de control": SONY_CUERPO.rueda,
  "Centro de la rueda": SONY_CUERPO.rueda,
  ISO: SONY_CUERPO.iso,
  "Reproducción": SONY_CUERPO.reproduccion,
  "Present. producto": SONY_CUERPO.producto,
  "Imagen/Película/S&Q": SONY_CUERPO.modo,
  "C1 / Desenfocar el fondo": SONY_CUERPO.c1,
  "Botón MOVIE": SONY_CUERPO.movie,
  Disparador: SONY_CUERPO.disparador,
};

/** Escena en la pantalla de toma (coordenadas del LCD). Ojos sobre el tercio superior (256/3 ≈ 85). */
export const SONY_TOMA = {
  cabeza: [192, 91],
  ojosY: 85,
  ventana: { x: 26, y: 30, w: 84, h: 92 },
  obturador: [30, 243],
  abertura: [88, 243],
  isoPantalla: [146, 243],
  mm: [222, 243],
  cancelar: [356, 38],
  medidor: [34, 206],
  barra: [252, 98],
} as const;

function puntosSonyToma(spec: SonyToma): Record<string, Px> {
  const t = SONY_TOMA;
  const lcd: Record<string, Px> = {
    Rostro: [t.cabeza[0], t.cabeza[1] - 6],
    Obturador: t.obturador,
    Abertura: t.abertura,
    "ISO en pantalla": t.isoPantalla,
    "Medidor MM": t.mm,
  };
  if (spec.variante === "cebra") lcd.Cebra = [t.ventana.x + t.ventana.w / 2, t.ventana.y + t.ventana.h / 2];
  if (spec.variante === "tactil") lcd.Cancelar = t.cancelar;
  if (spec.variante === "resalte") lcd.Contorno = [150, 176];
  if (spec.variante === "audio") lcd["Medidor de audio"] = t.medidor;
  if (spec.variante === "ae") lcd["Barra de brillo"] = t.barra;
  if (spec.variante === "cuadricula") lcd["Línea superior"] = [300, SONY_LCD.h / 3];
  if (spec.variante === "marcador") lcd["Marcador 9:16"] = [192 + 72, 150];
  const puntos: Record<string, Px> = { ...SONY_CUERPO_PUNTOS };
  for (const [nombre, px] of Object.entries(lcd)) puntos[nombre] = enCuerpo(px);
  if (spec.opciones) Object.assign(puntos, puntosSonyOpciones(spec.opciones, "TOMA"));
  return puntos;
}

/* ---------------------------------------------------- CÁMARA DEL iPHONE -- */

/** Visor del iPhone en vertical: cuadrícula de tercios en y = 260 y 520; ojos sobre la de arriba. */
export const IOS_CAM = {
  formato: [54, 58],
  controles: [324, 58],
  modosY: 640,
  grabar: [180, 702],
  galeria: [56, 702],
  girar: [304, 702],
  cabeza: [180, 270],
  ojosY: 260,
  sol: [252, 266],
  otroPunto: [92, 470],
  chips: {
    codecY: 150,
    resY: 208,
    fpsY: 266,
    codec: { HEVC: 76, "ProRes HDR": 178, "ProRes Log": 284 },
    res: { HD: 58, "4K": 120 },
    fps: { "24": 52, "30": 110, "60": 168, "120": 236 },
  },
  herramientasY: 546,
  reguladorY: 590,
  herramientas: { Exposición: 68, Estilos: 160, Temporizador: 262 },
  pro: { y: 496, reguladorY: 560, items: { Enfoque: 42, "Apertura de lente": 111, "Velocidad del obturador": 180, "Balance de blancos": 249, Histograma: 318 } },
} as const;

function puntosIosCamara(spec: IosCamara): Record<string, Px> {
  const c = IOS_CAM;
  const rostro: Px = [c.cabeza[0], c.ojosY + 4];
  const base: Record<string, Px> = { Formato: c.formato, "Controles de cámara": c.controles, Grabar: c.grabar, Rostro: rostro, "Línea superior": [300, c.ojosY] };
  switch (spec.variante) {
    case "video":
      return { ...base, VIDEO: [180, c.modosY], "CÁMARA LENTA": [72, c.modosY], FOTO: [262, c.modosY] };
    case "lenta":
      return { ...base, "CÁMARA LENTA": [180, c.modosY], VIDEO: [296, c.modosY] };
    case "formato":
    case "fps": {
      const puntos: Record<string, Px> = { ...base };
      for (const [k, x] of Object.entries(c.chips.codec)) puntos[k] = [x, c.chips.codecY];
      for (const [k, x] of Object.entries(c.chips.res)) puntos[k] = [x, c.chips.resY];
      for (const [k, x] of Object.entries(c.chips.fps)) puntos[k] = [x, c.chips.fpsY];
      return puntos;
    }
    case "bloqueo":
      return { ...base, Sol: c.sol, "Otro punto": c.otroPunto };
    case "controles": {
      const puntos: Record<string, Px> = { ...base, Regulador: [180, c.reguladorY] };
      for (const [k, x] of Object.entries(c.herramientas)) puntos[k] = [x, c.herramientasY];
      return puntos;
    }
    case "controles-pro": {
      const puntos: Record<string, Px> = { ...base, "Regulador de enfoque": [206, c.pro.reguladorY], A: [36, c.pro.reguladorY] };
      for (const [k, x] of Object.entries(c.pro.items)) puntos[k] = [x, c.pro.y];
      return puntos;
    }
    default:
      return base;
  }
}

/* --------------------------------------------------- CÁMARA DE SAMSUNG -- */

/** Visor de One UI 7+ en vertical (posiciones de la investigación, en px del lienzo 360 × 780). */
export const SAM_CAM = {
  hdr: [222, 47],
  resolucion: [270, 47],
  fps: [314, 47],
  zoomY: 562,
  controles: [317, 593],
  modosY: 655,
  modos: { RETRATO: 46, FOTO: 122, VIDEO: 198, "MÁS": 306 },
  grabar: [180, 718],
  galeria: [54, 718],
  girar: [306, 718],
  cabeza: [180, 270],
  ojosY: 260,
  sol: [248, 266],
  barra: { y: 593, items: { Ajustes: 36, Flash: 84, Temporizador: 132, "Relación de aspecto": 180, "Resolución de video": 236, Exposición: 292 } },
  tamano: { resY: 372, fpsY: 432, res: { FHD: 110, UHD: 180, "8K": 250 }, fps: { "30": 145, "60": 215 }, fpsPro: { "24": 90, "30": 150, "60": 210, "120": 270 } },
  aspecto: { y: 508, items: { "9:16": 104, "1:1": 180, Completo: 262 } },
  mas: { filas: [484, 578], columnas: [72, 180, 288], items: ["PRO", "VIDEO PRO", "PANORAMA", "CÁMARA LENTA", "HIPERLAPSO", "VIDEO RETRATO"] },
  pro: { resolucion: [196, 47], monitor: [259, 47], log: [308, 47], controlesY: 622, controles: { ISO: 46, SPEED: 113, EV: 180, FOCUS: 247, WB: 314 }, reglaY: 566, lutY: 516 },
  reglas: {
    speed: ["1/30", "1/60", "1/120", "1/240", "1/500"],
    iso: ["50", "100", "200", "400", "800"],
    wb: ["3200K", "4000K", "5500K", "6500K", "7500K"],
  },
  reglaX: [40, 110, 180, 250, 320],
  monitor: { zebra: [318, 104], falso: [318, 146] },
  ae: [86, 168],
} as const;

function puntosSamCamara(spec: SamCamara): Record<string, Px> {
  const c = SAM_CAM;
  const rostro: Px = [c.cabeza[0], c.ojosY + 4];
  const video: Record<string, Px> = {
    "Controles rápidos": c.controles,
    Resolución: c.resolucion,
    Grabar: c.grabar,
    Rostro: rostro,
    "Línea superior": [300, c.ojosY],
  };
  for (const [k, x] of Object.entries(c.modos)) video[k] = [x, c.modosY];
  const pro: Record<string, Px> = { LOG: c.pro.log, "Monitor de exposición": c.pro.monitor, Resolución: c.pro.resolucion, Grabar: c.grabar, Rostro: rostro };
  for (const [k, x] of Object.entries(c.pro.controles)) pro[k] = [x, c.pro.controlesY];
  const regla = (valores: readonly string[]) => Object.fromEntries(valores.map((v, i) => [v, [c.reglaX[i], c.pro.reglaY] as Px]));
  switch (spec.variante) {
    case "video":
      return video;
    case "controles": {
      const puntos: Record<string, Px> = { ...video };
      for (const [k, x] of Object.entries(c.barra.items)) puntos[k] = [x, c.barra.y];
      return puntos;
    }
    case "tamano":
    case "tamano-pro": {
      const puntos: Record<string, Px> = {};
      for (const [k, x] of Object.entries(c.tamano.res)) puntos[k] = [x, c.tamano.resY];
      for (const [k, x] of Object.entries(spec.variante === "tamano" ? c.tamano.fps : c.tamano.fpsPro)) puntos[k] = [x, c.tamano.fpsY];
      return puntos;
    }
    case "aspecto": {
      const puntos: Record<string, Px> = {};
      for (const [k, x] of Object.entries(c.aspecto.items)) puntos[k] = [x, c.aspecto.y];
      return puntos;
    }
    case "mas": {
      const puntos: Record<string, Px> = {};
      c.mas.items.forEach((item, i) => (puntos[item] = [c.mas.columnas[i % 3], c.mas.filas[Math.floor(i / 3)]]));
      return puntos;
    }
    case "pro":
      return pro;
    case "pro-log":
      return { ...pro, "Vista previa LUT": [180, c.pro.lutY] };
    case "monitor":
      return { ...pro, Zebra: c.monitor.zebra, "Falso color": c.monitor.falso };
    case "speed":
      return { ...pro, ...regla(c.reglas.speed) };
    case "iso":
      return { ...pro, ...regla(c.reglas.iso) };
    case "wb":
      return { ...pro, ...regla(c.reglas.wb) };
    case "focus":
      return { ...pro, MF: [58, 520], "Regla de foco": [180, c.pro.reglaY] };
    case "bloqueo":
    case "toque":
      return { ...video, Sol: c.sol };
    case "af-ae":
      return { ...pro, AF: rostro, AE: c.ae };
    case "lenta":
      return { Resolución: c.resolucion, Grabar: c.grabar, "CÁMARA LENTA": [198, c.modosY] };
  }
}

/* ----------------------------------------------------------- ILUSTRACIONES -- */

export const ILUSTRACION_PUNTOS: Record<IlustracionVariante, Record<string, Px>> = {
  "ios-inicio": { Configuración: [221, 227] },
  "ios-lateral": { "Control de la cámara": [311, 500] },
  "ios-ssd": { "Puerto USB‑C": [180, 452], SSD: [180, 650] },
  "sony-superior": {
    "Imagen/Película/S&Q": [404, 196],
    "C1 / Desenfocar el fondo": [446, 196],
    "Botón MOVIE": [488, 196],
    "Disparador y zoom": [542, 200],
    Micrófono: [285, 197],
  },
  "sony-paravientos": { Paravientos: [285, 190] },
  "sony-lateral": { Micrófono: [262, 176], Auriculares: [262, 236], "USB‑C": [356, 292] },
  "sony-vertical": { Pantalla: [320, 206], "Soporte en L": [236, 352] },
  "sony-licencia": { "Archivo de licencia": [290, 236], "Tarjeta SD": [556, 292] },
  "editor-lut": { LUT: [536, 326], Clip: [210, 334] },
};

/* -------------------------------------------------------------- CATÁLOGO -- */

const IOS_COMPOSICION: Grupo = { titulo: "COMPOSICIÓN", filas: [{ label: "Cuadrícula", tipo: "on" }, { label: "Nivel", tipo: "on" }] };
const SONY_FORMATO_ITEMS = [
  { label: "Formato archivo", valor: "XAVC S 4K" },
  { label: "Grabar ajuste", valor: "30p 100M" },
  { label: "Aj. cám. len+ráp" },
  { label: "Grabación proxy", valor: "Desactivar" },
];

export const SCREENS = {
  /* iPhone: Configuración */
  "ios-inicio": { tipo: "ILUSTRACION", variante: "ios-inicio", nombre: "Pantalla de inicio del iPhone" },
  "ios-configuracion": {
    tipo: "IOS_LISTA",
    nombre: "Configuración del iPhone",
    titulo: "Configuración",
    grande: true,
    buscador: true,
    grupos: [
      { filas: [{ label: "Wi‑Fi", valor: "Casa", icono: "wifi" }, { label: "Bluetooth", valor: "Activado", icono: "bluetooth" }] },
      {
        filas: [
          { label: "General", icono: "general" },
          { label: "Accesibilidad", icono: "accesibilidad" },
          { label: "Botón de acción", icono: "accion" },
          { label: "Cámara", icono: "camara" },
          { label: "Centro de control", icono: "control" },
          { label: "Pantalla y brillo", icono: "pantalla" },
        ],
      },
    ],
  },
  "ios-camara-ajustes": {
    tipo: "IOS_LISTA",
    nombre: "Configuración > Cámara",
    titulo: "Cámara",
    atras: "Configuración",
    grupos: [
      {
        filas: [
          { label: "Formatos" },
          { label: "Grabar video", valor: "4K a 60" },
          { label: "Cámara lenta", valor: "4K a 120" },
          { label: "Grabar sonido" },
          { label: "Conservar la configuración" },
          { label: "Control de la cámara" },
        ],
      },
      IOS_COMPOSICION,
    ],
  },
  "ios-formatos": {
    tipo: "IOS_LISTA",
    nombre: "Configuración > Cámara > Formatos",
    titulo: "Formatos",
    atras: "Cámara",
    grupos: [
      { titulo: "CAPTURA DE CÁMARA", filas: [{ label: "Alta eficiencia", tipo: "check" }, { label: "Más compatible", tipo: "texto" }] },
      {
        titulo: "CAPTURA DE VIDEO",
        filas: [
          { label: "Apple ProRes", tipo: "on" },
          { label: "Codificación de video ProRes Log", valor: "Log" },
          { label: "Almacenamiento de video profesional" },
        ],
        pie: "ProRes ocupa hasta 30 veces más que HEVC. «Codificación de video ProRes Log» solo aparece en iPhone 17 Pro y 18 Pro.",
      },
    ],
  },
  "ios-almacenamiento-pro": {
    tipo: "IOS_LISTA",
    nombre: "Almacenamiento de video profesional (iPhone 18 Pro)",
    titulo: "Almacenamiento de video profesional",
    hoja: true,
    grupos: [
      { filas: [{ label: "Espacio reservado: 128 GB", tipo: "slider" }], pie: "Un minuto de ProRes 4K a 30 fps ocupa varios GB." },
      { filas: [{ label: "Actualizar almacenamiento de video profesional", tipo: "boton" }] },
    ],
  },
  "ios-codificacion-log": {
    tipo: "IOS_LISTA",
    nombre: "Formatos > Codificación de video ProRes Log",
    titulo: "Codificación de video ProRes Log",
    atras: "Formatos",
    grupos: [{ filas: [{ label: "Log", tipo: "check" }, { label: "Log 2", tipo: "texto" }], pie: "Log 2 tiene una gama de colores más amplia (iPhone 17 Pro y 18 Pro)." }],
  },
  "ios-conservar": {
    tipo: "IOS_LISTA",
    nombre: "Cámara > Conservar la configuración",
    titulo: "Conservar la configuración",
    atras: "Cámara",
    grupos: [{ filas: [{ label: "Modo de cámara", tipo: "off" }, { label: "Ajuste de exposición", tipo: "on" }, { label: "Apple ProRes", tipo: "on" }] }],
  },
  "ios-grabar-video": {
    tipo: "IOS_LISTA",
    nombre: "Cámara > Grabar video",
    titulo: "Grabar video",
    atras: "Cámara",
    grupos: [
      {
        filas: [
          { label: "720p HD a 30 fps", tipo: "texto" },
          { label: "1080p HD a 30 fps", tipo: "texto" },
          { label: "1080p HD a 60 fps", tipo: "texto" },
          { label: "4K a 24 fps", tipo: "texto" },
          { label: "4K a 30 fps", tipo: "texto" },
          { label: "4K a 60 fps", tipo: "check" },
          { label: "4K a 120 fps", tipo: "texto" },
        ],
      },
      {
        filas: [
          { label: "Frecuencia automática", valor: "Desactivada" },
          { label: "Video HDR", tipo: "off" },
          { label: "Bloquear cámara", tipo: "on" },
          { label: "Estabilización mejorada", tipo: "on" },
          { label: "Bloq. de balance de blancos", tipo: "on" },
        ],
      },
    ],
  },
  "ios-camara-lenta-ajustes": {
    tipo: "IOS_LISTA",
    nombre: "Cámara > Cámara lenta",
    titulo: "Cámara lenta",
    atras: "Cámara",
    grupos: [
      {
        filas: [
          { label: "1080p HD a 120 fps", tipo: "texto" },
          { label: "1080p HD a 240 fps", tipo: "texto" },
          { label: "4K a 120 fps", tipo: "check" },
        ],
        pie: "4K a 120 fps: iPhone 16 Pro, 17 Pro, 18 Pro y Duo. iPhone 17, Air y 17e llegan a 1080p.",
      },
    ],
  },
  "ios-control-camara": {
    tipo: "IOS_LISTA",
    nombre: "Cámara > Control de la cámara",
    titulo: "Control de la cámara",
    atras: "Cámara",
    grupos: [
      {
        filas: [{ label: "Bloquear enfoque y exposición", tipo: "on" }],
        pie: "Con una presión ligera sostenida sobre el Control de la cámara aparece «Bloqueo de AE/AF». Al soltar se desactiva.",
      },
    ],
  },
  /* iPhone: app Cámara */
  "ios-camara-video": { tipo: "IOS_CAMARA", variante: "video", nombre: "App Cámara del iPhone en modo Video" },
  "ios-camara-formato": { tipo: "IOS_CAMARA", variante: "formato", nombre: "App Cámara: formato de video (ProRes Log, 4K, fps)" },
  "ios-camara-fps": { tipo: "IOS_CAMARA", variante: "fps", nombre: "App Cámara: formato 4K a 120 fps" },
  "ios-camara-log": { tipo: "IOS_CAMARA", variante: "log", nombre: "App Cámara grabando en ProRes Log (imagen plana)" },
  "ios-camara-bloqueo": { tipo: "IOS_CAMARA", variante: "bloqueo", nombre: "App Cámara con BLOQUEO de AE/AF" },
  "ios-camara-controles": { tipo: "IOS_CAMARA", variante: "controles", nombre: "App Cámara: Controles de cámara > Exposición" },
  "ios-camara-controles-pro": { tipo: "IOS_CAMARA", variante: "controles-pro", nombre: "App Cámara del iPhone 18 Pro: controles manuales" },
  "ios-camara-lenta": { tipo: "IOS_CAMARA", variante: "lenta", nombre: "App Cámara en modo Cámara lenta" },
  "ios-lateral": { tipo: "ILUSTRACION", variante: "ios-lateral", nombre: "iPhone con el Control de la cámara (lado derecho)" },
  "ios-ssd": { tipo: "ILUSTRACION", variante: "ios-ssd", nombre: "iPhone con un SSD USB‑C conectado" },

  /* Samsung: app Cámara */
  "sam-camara-video": { tipo: "SAM_CAMARA", variante: "video", nombre: "Cámara de Samsung Galaxy en modo VIDEO" },
  "sam-controles-rapidos": { tipo: "SAM_CAMARA", variante: "controles", nombre: "Cámara de Samsung: barra de Controles rápidos" },
  "sam-tamano-video": { tipo: "SAM_CAMARA", variante: "tamano", nombre: "Cámara de Samsung: Tamaño de video (UHD 60)" },
  "sam-tamano-video-pro": { tipo: "SAM_CAMARA", variante: "tamano-pro", nombre: "VIDEO PRO: Tamaño de video (UHD 120)" },
  "sam-relacion-aspecto": { tipo: "SAM_CAMARA", variante: "aspecto", nombre: "Cámara de Samsung: relación de aspecto" },
  "sam-mas-modos": { tipo: "SAM_CAMARA", variante: "mas", nombre: "Cámara de Samsung: modos en MÁS" },
  "sam-video-pro": { tipo: "SAM_CAMARA", variante: "pro", nombre: "VIDEO PRO con LOG apagado" },
  "sam-video-pro-log": { tipo: "SAM_CAMARA", variante: "pro-log", nombre: "VIDEO PRO con LOG activo (imagen plana)" },
  "sam-monitor-exposicion": { tipo: "SAM_CAMARA", variante: "monitor", nombre: "VIDEO PRO: Monitor de exposición (Zebra y Falso color)" },
  "sam-video-pro-speed": { tipo: "SAM_CAMARA", variante: "speed", nombre: "VIDEO PRO: velocidad de obturación (SPEED)" },
  "sam-video-pro-iso": { tipo: "SAM_CAMARA", variante: "iso", nombre: "VIDEO PRO: ISO" },
  "sam-video-pro-wb": { tipo: "SAM_CAMARA", variante: "wb", nombre: "VIDEO PRO: balance de blancos (WB)" },
  "sam-video-pro-focus": { tipo: "SAM_CAMARA", variante: "focus", nombre: "VIDEO PRO: enfoque manual con resaltado verde" },
  "sam-bloqueo": { tipo: "SAM_CAMARA", variante: "bloqueo", nombre: "Cámara de Samsung con Bloqueo AF/AE" },
  "sam-toque": { tipo: "SAM_CAMARA", variante: "toque", nombre: "Cámara de Samsung: toque para enfocar" },
  "sam-af-ae": { tipo: "SAM_CAMARA", variante: "af-ae", nombre: "VIDEO PRO: círculos de enfoque (AF) y exposición (AE) separados" },
  "sam-camara-lenta": { tipo: "SAM_CAMARA", variante: "lenta", nombre: "Cámara de Samsung en CÁMARA LENTA" },

  /* Samsung: Ajustes de cámara */
  "sam-ajustes-camara": {
    tipo: "SAM_LISTA",
    nombre: "Ajustes de cámara (One UI 7/8)",
    titulo: "Ajustes de cámara",
    version: "One UI 7/8",
    grupos: [
      { titulo: "Videos", filas: [{ label: "Opciones de video avanzadas" }, { label: "FPS automático", valor: "Desactivado" }, { label: "Estabilización de video", tipo: "on" }] },
      { titulo: "General", filas: [{ label: "Guía de composición" }, { label: "Rastreo con enfoque automático", tipo: "on" }] },
    ],
  },
  "sam-ajustes-camara-85": {
    tipo: "SAM_LISTA",
    nombre: "Ajustes de cámara (One UI 8.5 o superior)",
    titulo: "Ajustes de cámara",
    version: "One UI 8.5+",
    grupos: [
      { titulo: "Videos", filas: [{ label: "Formato de video" }, { label: "FPS automático", valor: "Desactivado" }, { label: "Estabilización de video", tipo: "on" }] },
      { titulo: "General", filas: [{ label: "Guía de composición" }, { label: "Rastreo con enfoque automático", tipo: "on" }] },
    ],
  },
  "sam-opciones-video": {
    tipo: "SAM_LISTA",
    nombre: "Ajustes de cámara > Opciones de video avanzadas",
    titulo: "Opciones de video avanzadas",
    grupos: [
      {
        filas: [
          { label: "Videos de alta eficiencia", tipo: "on" },
          { label: "Videos de alta tasa de bits", tipo: "on" },
          { label: "Videos HDR", valor: "No se usa junto con Log", tipo: "off" },
          { label: "Log", valor: "Grabar en Samsung Log (10 bits)", tipo: "on" },
          { label: "Micrófono con zoom", tipo: "off" },
          { label: "Grabación de audio 360", tipo: "off" },
        ],
      },
    ],
  },
  "sam-formato-video": {
    tipo: "SAM_LISTA",
    nombre: "Ajustes de cámara > Formato de video (One UI 8.5+)",
    titulo: "Formato de video",
    version: "One UI 8.5+",
    grupos: [
      {
        filas: [
          { label: "APV", valor: "Solo S26 Ultra y Z Fold8 Ultra. Archivos muy pesados", tipo: "off" },
          { label: "Log", valor: "Modos Video y Video Pro" },
        ],
      },
    ],
  },
  "sam-log-opciones": {
    tipo: "SAM_LISTA",
    nombre: "Formato de video > Log",
    titulo: "Log",
    version: "One UI 8.5+",
    grupos: [{ filas: [{ label: "Desactivado", tipo: "radio" }, { label: "Solo Video Pro", tipo: "radio" }, { label: "Modos Video y Video Pro", tipo: "radio-on" }] }],
  },
  "sam-guia-composicion": {
    tipo: "SAM_LISTA",
    nombre: "Ajustes de cámara > Guía de composición",
    titulo: "Guía de composición",
    grupos: [
      { filas: [{ label: "Activado", tipo: "on" }] },
      { titulo: "Cuadrícula", filas: [{ label: "Cuadrícula 3×3", tipo: "radio-on" }, { label: "Cuadrícula cuadrada", tipo: "radio" }] },
      { filas: [{ label: "Nivel", tipo: "on" }] },
    ],
  },
  "sam-galeria-info": {
    tipo: "SAM_LISTA",
    nombre: "Galería > detalles del video",
    titulo: "Detalles",
    grupos: [
      {
        filas: [
          { label: "Resolución", valor: "3840 × 2160", tipo: "texto" },
          { label: "Velocidad de fotogramas", valor: "60 fps", tipo: "texto" },
          { label: "Duración", valor: "00:00:24", tipo: "texto" },
        ],
      },
    ],
  },
  "sam-camera-assistant": {
    tipo: "SAM_LISTA",
    nombre: "Camera Assistant (Good Lock)",
    titulo: "Camera Assistant",
    version: "One UI 8.5",
    grupos: [
      { titulo: "Video Pro", filas: [{ label: "Enfoque y exposición al tocar", valor: "Solo el foco durante la grabación" }, { label: "Presets de Pro", valor: "ISO · SPEED · EV · FOCUS · WB" }] },
    ],
  },

  /* Sony ZV-E10: cuerpo y pantalla de toma */
  "sony-toma": { tipo: "SONY_TOMA", variante: "info", nombre: "Sony ZV-E10: dorso y pantalla de toma en modo M" },
  "sony-modo-toma": {
    tipo: "SONY_TOMA",
    variante: "modo",
    nombre: "Sony: selección del modo de toma",
    opciones: { titulo: "Modo de toma", items: ["Auto. inteligente", "Programa auto.", "Priorid. abertura", "Pr. tiempo expo.", "Exposic. manual"], activo: 4 },
  },
  "sony-toma-log": { tipo: "SONY_TOMA", variante: "log", nombre: "Sony: pantalla de toma en S-Log3 (imagen plana)" },
  "sony-toma-cebra": { tipo: "SONY_TOMA", variante: "cebra", nombre: "Sony: pantalla de toma con cebras" },
  "sony-toma-tactil": { tipo: "SONY_TOMA", variante: "tactil", nombre: "Sony: enfoque táctil sobre el rostro" },
  "sony-toma-resalte": { tipo: "SONY_TOMA", variante: "resalte", nombre: "Sony: enfoque manual con resalte" },
  "sony-toma-audio": { tipo: "SONY_TOMA", variante: "audio", nombre: "Sony: pantalla de toma con medidor de audio" },
  "sony-toma-ae": { tipo: "SONY_TOMA", variante: "ae", nombre: "Sony ZV-E10 II: AE táctil con barra de brillo" },
  "sony-cuadricula": { tipo: "SONY_TOMA", variante: "cuadricula", nombre: "Sony: cuadrícula de tercios con los ojos en la línea superior" },
  "sony-marcador": { tipo: "SONY_TOMA", variante: "marcador", nombre: "Sony ZV-E10 II: marcador 9:16 en un cuadro horizontal" },
  "sony-superior": { tipo: "ILUSTRACION", variante: "sony-superior", nombre: "Sony ZV-E10 vista desde arriba" },
  "sony-paravientos": { tipo: "ILUSTRACION", variante: "sony-paravientos", nombre: "Sony ZV-E10 con el paravientos puesto" },
  "sony-lateral": { tipo: "ILUSTRACION", variante: "sony-lateral", nombre: "Sony ZV-E10: tomas del costado" },
  "sony-vertical": { tipo: "ILUSTRACION", variante: "sony-vertical", nombre: "Sony en vertical sobre un soporte en L" },
  "sony-licencia": { tipo: "ILUSTRACION", variante: "sony-licencia", nombre: "Creators' Cloud: licencia 4K 120p de la ZV-E10 II" },

  /* Sony: menús (CLASICO = ZV-E10, NUEVO = ZV-E10 II) */
  "sony-menu-ntsc": {
    tipo: "SONY_MENU",
    nombre: "Sony ZV-E10: MENU > Ajustes > Selector NTSC/PAL",
    estilo: "CLASICO",
    pestana: 4,
    ruta: "Ajustes",
    activo: 0,
    items: [
      { label: "Selector NTSC/PAL", valor: "NTSC" },
      { label: "Operación táctil", valor: "Activar" },
      { label: "Asist. visual. Gamma", valor: "Automático" },
      { label: "Formatear" },
    ],
  },
  "sony-menu-formato": {
    tipo: "SONY_MENU",
    nombre: "Sony ZV-E10: MENU > Ajustes de cámara2 > Formato archivo",
    estilo: "CLASICO",
    pestana: 1,
    ruta: "Ajustes de cámara2",
    activo: 0,
    items: SONY_FORMATO_ITEMS,
    opciones: { titulo: "Formato archivo", items: ["XAVC S 4K", "XAVC S HD"], activo: 0 },
  },
  "sony-menu-grabar-ajuste": {
    tipo: "SONY_MENU",
    nombre: "Sony ZV-E10: MENU > Ajustes de cámara2 > Grabar ajuste",
    estilo: "CLASICO",
    pestana: 1,
    ruta: "Ajustes de cámara2",
    activo: 1,
    items: SONY_FORMATO_ITEMS,
    opciones: { titulo: "Grabar ajuste", items: ["30p 100M", "30p 60M", "24p 100M", "24p 60M"], activo: 0 },
  },
  "sony-menu-grabar-hd": {
    tipo: "SONY_MENU",
    nombre: "Sony ZV-E10: Grabar ajuste en XAVC S HD (120p)",
    estilo: "CLASICO",
    pestana: 1,
    ruta: "Ajustes de cámara2",
    activo: 1,
    items: [{ label: "Formato archivo", valor: "XAVC S HD" }, { label: "Grabar ajuste", valor: "120p 100M" }, { label: "Aj. cám. len+ráp" }],
    opciones: { titulo: "Grabar ajuste", items: ["120p 100M", "120p 60M", "60p 50M", "60p 25M", "30p 50M"], activo: 0 },
  },
  "sony-menu-sq": {
    tipo: "SONY_MENU",
    nombre: "Sony ZV-E10: Aj. cám. len+ráp (cámara lenta S&Q)",
    estilo: "CLASICO",
    pestana: 1,
    ruta: "Ajustes de cámara2 › Aj. cám. len+ráp",
    activo: 1,
    items: [{ label: "Grabar ajuste", valor: "30p" }, { label: "Veloc transmisión", valor: "120fps" }],
    opciones: { titulo: "Veloc transmisión", items: ["120fps", "60fps", "30fps", "15fps", "8fps"], activo: 0 },
  },
  "sony-menu-ii-video": {
    tipo: "SONY_MENU",
    nombre: "Sony ZV-E10 II: Toma > Calid. img/grab. > Ajustes de vídeo",
    estilo: "NUEVO",
    pestana: 1,
    ruta: "Toma › Calid. img/grab. › Ajustes de vídeo",
    activo: 1,
    items: [{ label: "Vel. transm. grab.", valor: "60p" }, { label: "Grabar ajuste", valor: "200M 4:2:2 10bit" }],
    opciones: { titulo: "Grabar ajuste", items: ["200M 4:2:2 10bit", "150M 4:2:0 8bit"], activo: 0 },
  },
  "sony-menu-ii-hd120": {
    tipo: "SONY_MENU",
    nombre: "Sony ZV-E10 II: XAVC S HD a 120p",
    estilo: "NUEVO",
    pestana: 1,
    ruta: "Toma › Calid. img/grab. › Ajustes de vídeo",
    activo: 0,
    items: [{ label: "Vel. transm. grab.", valor: "120p" }, { label: "Grabar ajuste", valor: "100M 4:2:0 8bit" }],
    opciones: { titulo: "Vel. transm. grab.", items: ["120p", "60p", "30p", "24p"], activo: 0 },
  },
  "sony-menu-vertical": {
    tipo: "SONY_MENU",
    nombre: "Sony ZV-E10 II: Ajustes > Monitor > Visualización vertical",
    estilo: "NUEVO",
    pestana: 6,
    ruta: "Ajustes › Monitor",
    activo: 0,
    items: [{ label: "Visualización vertical", valor: "Activar" }],
  },
  "sony-menu-marcador": {
    tipo: "SONY_MENU",
    nombre: "Sony ZV-E10 II: Toma > Visual. marcador",
    estilo: "NUEVO",
    pestana: 1,
    ruta: "Toma › Visual. marcador",
    activo: 2,
    items: [
      { label: "Visual. marcador", valor: "Activar" },
      { label: "Marcador central", valor: "Activar" },
      { label: "Marcador aspecto", valor: "9:16" },
    ],
  },
  "sony-menu-cuadricula": {
    tipo: "SONY_MENU",
    nombre: "Sony ZV-E10: MENU > Ajustes de cámara2 > Línea de cuadrícula",
    estilo: "CLASICO",
    pestana: 1,
    ruta: "Ajustes de cámara2",
    activo: 0,
    items: [{ label: "Línea de cuadrícula", valor: "Cuadr. regla tercios" }],
    opciones: { titulo: "Línea de cuadrícula", items: ["Cuadr. regla tercios", "Cuadrícula cuadrada", "Cuad. diag.+cuad.", "Desactivar"], activo: 0 },
  },
  "sony-menu-balance": {
    tipo: "SONY_MENU",
    nombre: "Sony ZV-E10: MENU > Ajustes de cámara1 > Balance blanco",
    estilo: "CLASICO",
    pestana: 0,
    ruta: "Ajustes de cámara1",
    activo: 0,
    items: [{ label: "Balance blanco", valor: "Luz diurna" }],
    opciones: { titulo: "Balance blanco", items: ["Auto", "Luz diurna", "Sombra", "Nublado", "Incandescente", "Temp.col./Filtro", "Personalizado 1"], activo: 1 },
  },
  "sony-menu-perfil": {
    tipo: "SONY_MENU",
    nombre: "Sony ZV-E10: MENU > Ajustes de cámara1 > Perfil de imagen",
    estilo: "CLASICO",
    pestana: 0,
    ruta: "Ajustes de cámara1",
    activo: 0,
    items: [{ label: "Perfil de imagen", valor: "PP8" }],
    opciones: { titulo: "Perfil de imagen", items: ["Desactivar", "PP7 S-Log2", "PP8 S-Log3", "PP9 S-Log3", "PP10 HLG2"], activo: 2 },
  },
  "sony-menu-gamma": {
    tipo: "SONY_MENU",
    nombre: "Sony ZV-E10: MENU > Ajustes > Asist. visual. Gamma",
    estilo: "CLASICO",
    pestana: 4,
    ruta: "Ajustes",
    activo: 0,
    items: [{ label: "Asist. visual. Gamma", valor: "Automático" }],
    opciones: { titulo: "Asist. visual. Gamma", items: ["Desactivar", "Automático"], activo: 1 },
  },
  "sony-menu-toma-log": {
    tipo: "SONY_MENU",
    nombre: "Sony ZV-E10 II: Toma > Calid. img/grab. > Ajuste de toma Log",
    estilo: "NUEVO",
    pestana: 1,
    ruta: "Toma › Calid. img/grab. › Ajuste de toma Log",
    activo: 0,
    items: [
      { label: "Toma Log", valor: "Activ. (ISO flexible)" },
      { label: "Gama de color", valor: "S-Gamut3.Cine" },
      { label: "Insertar archivo LUT", valor: "Activar" },
    ],
  },
  "sony-menu-lut": {
    tipo: "SONY_MENU",
    nombre: "Sony ZV-E10 II: Exposición/color > Color/tono > Seleccionar LUT",
    estilo: "NUEVO",
    pestana: 2,
    ruta: "Exposición/color › Color/tono",
    activo: 0,
    items: [{ label: "Seleccionar LUT", valor: "s709" }, { label: "Gestionar LUT usuar." }],
    opciones: { titulo: "Seleccionar LUT", items: ["S-Log3", "s709", "709(800%)", "User1"], activo: 1 },
  },
  "sony-menu-lut-usuario": {
    tipo: "SONY_MENU",
    nombre: "Sony ZV-E10 II: Gestionar LUT usuar. > Importar/editar",
    estilo: "NUEVO",
    pestana: 2,
    ruta: "Exposición/color › Color/tono › Gestionar LUT usuar.",
    activo: 0,
    items: [{ label: "Importar/editar", valor: "User1" }],
  },
  "sony-menu-perfil-ii": {
    tipo: "SONY_MENU",
    nombre: "Sony ZV-E10 II: Exposición/color > Color/tono > Perfil de imagen",
    estilo: "NUEVO",
    pestana: 2,
    ruta: "Exposición/color › Color/tono",
    activo: 0,
    items: [{ label: "Perfil de imagen", valor: "PP11" }],
    opciones: { titulo: "Perfil de imagen", items: ["Desactivar", "PP11 S-Cinetone", "PPLUT1"], activo: 1 },
  },
  "sony-menu-cebra": {
    tipo: "SONY_MENU",
    nombre: "Sony ZV-E10: MENU > Ajustes de cámara2 > Ajuste de cebra",
    estilo: "CLASICO",
    pestana: 1,
    ruta: "Ajustes de cámara2 › Ajuste de cebra",
    activo: 1,
    items: [{ label: "Visualización cebra", valor: "Activar" }, { label: "Nivel de cebra", valor: "Personalizado1" }],
    opciones: { titulo: "Nivel de cebra", items: ["70", "80", "90", "100", "100+", "Personalizado1", "Personalizado2"], activo: 5 },
  },
  "sony-menu-enfoque": {
    tipo: "SONY_MENU",
    nombre: "Sony ZV-E10: MENU > Ajustes de cámara1 > Modo de enfoque",
    estilo: "CLASICO",
    pestana: 0,
    ruta: "Ajustes de cámara1",
    activo: 0,
    items: [{ label: "Modo de enfoque", valor: "AF continuo" }, { label: "Área de enfoque", valor: "Ancho" }, { label: "Ajust. AF cara/ojos" }],
    opciones: { titulo: "Modo de enfoque", items: ["AF continuo", "Enfoque man."], activo: 0 },
  },
  "sony-menu-area": {
    tipo: "SONY_MENU",
    nombre: "Sony ZV-E10: MENU > Ajustes de cámara1 > Área de enfoque",
    estilo: "CLASICO",
    pestana: 0,
    ruta: "Ajustes de cámara1",
    activo: 1,
    items: [{ label: "Modo de enfoque", valor: "AF continuo" }, { label: "Área de enfoque", valor: "Ancho" }, { label: "Ajust. AF cara/ojos" }],
    opciones: { titulo: "Área de enfoque", items: ["Ancho", "Zona", "Fijo al centro", "Punto"], activo: 0 },
  },
  "sony-menu-cara": {
    tipo: "SONY_MENU",
    nombre: "Sony ZV-E10: MENU > Ajustes de cámara1 > Ajust. AF cara/ojos",
    estilo: "CLASICO",
    pestana: 0,
    ruta: "Ajustes de cámara1 › Ajust. AF cara/ojos",
    activo: 0,
    items: [
      { label: "Priorid. cara/ojos AF", valor: "Activar" },
      { label: "Detección de motivo", valor: "Humano" },
      { label: "Visual. cuadro c./oj.", valor: "Activar" },
    ],
  },
  "sony-menu-tactil": {
    tipo: "SONY_MENU",
    nombre: "Sony ZV-E10: MENU > Ajustes de cámara2 > Func. de oper. táctil",
    estilo: "CLASICO",
    pestana: 1,
    ruta: "Ajustes de cámara2",
    activo: 0,
    items: [{ label: "Func. de oper. táctil", valor: "Enfoque táctil" }],
    opciones: { titulo: "Func. de oper. táctil", items: ["Enfoque táctil", "Seguimiento táctil"], activo: 0 },
  },
  "sony-menu-tactil-ii": {
    tipo: "SONY_MENU",
    nombre: "Sony ZV-E10 II: Ajustes > Operación táctil > Func. táctil dur. toma",
    estilo: "NUEVO",
    pestana: 6,
    ruta: "Ajustes › Operación táctil › Pantalla de toma",
    activo: 0,
    items: [{ label: "Func. táctil dur. toma", valor: "Enfoq. táctil+AE" }],
    opciones: { titulo: "Func. táctil dur. toma", items: ["Enfoque táctil", "Seguimient. táct.", "AE táctil", "Enfoq. táctil+AE", "Seguim táct+AE"], activo: 3 },
  },
  "sony-menu-vel-af": {
    tipo: "SONY_MENU",
    nombre: "Sony ZV-E10: Vel. transición AF y S. camb motiv. AF",
    estilo: "CLASICO",
    pestana: 1,
    ruta: "Ajustes de cámara2",
    activo: 0,
    items: [{ label: "Vel. transición AF", valor: "5" }, { label: "S. camb motiv. AF", valor: "3" }],
  },
  "sony-menu-resalte": {
    tipo: "SONY_MENU",
    nombre: "Sony ZV-E10: MENU > Ajustes de cámara1 > Ajuste de resalte",
    estilo: "CLASICO",
    pestana: 0,
    ruta: "Ajustes de cámara1 › Ajuste de resalte",
    activo: 0,
    items: [
      { label: "Visual. resalte", valor: "Activar" },
      { label: "Nivel de resalte", valor: "Medio" },
      { label: "Color de resalte", valor: "Rojo" },
    ],
  },
  "sony-menu-obt-variable": {
    tipo: "SONY_MENU",
    nombre: "Sony ZV-E10 II: Toma > Obturad./silenc. > Ajust. sin parpadeo",
    estilo: "NUEVO",
    pestana: 1,
    ruta: "Toma › Obturad./silenc. › Ajust. sin parpadeo",
    activo: 0,
    items: [{ label: "Obturad. variable", valor: "Activar" }],
  },
  "sony-menu-tecla": {
    tipo: "SONY_MENU",
    nombre: "Sony ZV-E10: MENU > Ajustes de cámara2 > Tecla person.",
    estilo: "CLASICO",
    pestana: 1,
    ruta: "Ajustes de cámara2 › Tecla person.",
    activo: 0,
    items: [{ label: "Tecla libre (película)", valor: "Alternar AEL" }],
    opciones: { titulo: "Función de la tecla", items: ["Alternar AEL", "Retener AEL"], activo: 0 },
  },
  "sony-menu-obt-lento": {
    tipo: "SONY_MENU",
    nombre: "Sony ZV-E10: MENU > Ajustes de cámara2 > Auto obtur. lento",
    estilo: "CLASICO",
    pestana: 1,
    ruta: "Ajustes de cámara2",
    activo: 0,
    items: [{ label: "Auto obtur. lento", valor: "Desactivar" }],
    opciones: { titulo: "Auto obtur. lento", items: ["Activar", "Desactivar"], activo: 1 },
  },
  "sony-menu-steadyshot": {
    tipo: "SONY_MENU",
    nombre: "Sony ZV-E10: MENU > Ajustes de cámara2 > SteadyShot",
    estilo: "CLASICO",
    pestana: 1,
    ruta: "Ajustes de cámara2",
    activo: 0,
    items: [{ label: "SteadyShot", valor: "Estándar" }],
    opciones: { titulo: "SteadyShot", items: ["Activo", "Estándar", "Desactivar"], activo: 1 },
  },
  "sony-menu-audio": {
    tipo: "SONY_MENU",
    nombre: "Sony ZV-E10: MENU > Ajustes de cámara2 > audio",
    estilo: "CLASICO",
    pestana: 1,
    ruta: "Ajustes de cámara2",
    activo: 2,
    items: [
      { label: "Grabación de sonido", valor: "Activar" },
      { label: "Visual. nivel aud.", valor: "Activar" },
      { label: "Nivel grabac. audio", valor: "26" },
      { label: "Reducc. ruido viento", valor: "Desactivar" },
    ],
  },
  "sony-menu-energia": {
    tipo: "SONY_MENU",
    nombre: "Sony: MENU > Ajustes > Opc. ajuste enrg. > Temp. APAGA auto",
    estilo: "CLASICO",
    pestana: 4,
    ruta: "Ajustes › Opc. ajuste enrg.",
    activo: 0,
    items: [{ label: "Temp. APAGA auto", valor: "Alto" }],
    opciones: { titulo: "Temp. APAGA auto", items: ["Estándar", "Alto"], activo: 1 },
  },
  "sony-menu-formatear": {
    tipo: "SONY_MENU",
    nombre: "Sony ZV-E10: MENU > Ajustes > Formatear",
    estilo: "CLASICO",
    pestana: 4,
    ruta: "Ajustes",
    activo: 1,
    items: [{ label: "Selector NTSC/PAL", valor: "NTSC" }, { label: "Formatear" }, { label: "Opc. ajuste enrg." }],
  },

  /* Compartida */
  "editor-lut": { tipo: "ILUSTRACION", variante: "editor-lut", nombre: "Editor de video: aplicar la LUT (Log → Rec.709)" },
} satisfies Record<string, ScreenSpec>;

export type ScreenId = keyof typeof SCREENS;
export const SCREEN_IDS = Object.keys(SCREENS) as ScreenId[];

export function screenSpec(id: ScreenId): ScreenSpec {
  return SCREENS[id];
}

/* ----------------------------------------------------- LIENZO Y PUNTOS -- */

const ILUSTRACION_LIENZO: Record<IlustracionVariante, { w: number; h: number; marco: Marco }> = {
  "ios-inicio": { ...PHONE, marco: "IPHONE" },
  "ios-lateral": { ...PHONE, marco: "LIBRE" },
  "ios-ssd": { ...PHONE, marco: "LIBRE" },
  "sony-superior": { ...SONY_BODY, marco: "LIBRE" },
  "sony-paravientos": { ...SONY_BODY, marco: "LIBRE" },
  "sony-lateral": { ...SONY_BODY, marco: "LIBRE" },
  "sony-vertical": { ...SONY_BODY, marco: "LIBRE" },
  "sony-licencia": { ...MONITOR, marco: "MONITOR" },
  "editor-lut": { ...MONITOR, marco: "MONITOR" },
};

export function lienzo(spec: ScreenSpec): { w: number; h: number; marco: Marco } {
  switch (spec.tipo) {
    case "IOS_LISTA":
    case "IOS_CAMARA":
      return { ...PHONE, marco: "IPHONE" };
    case "SAM_LISTA":
    case "SAM_CAMARA":
      return { ...PHONE, marco: "GALAXY" };
    case "SONY_MENU":
    case "SONY_TOMA":
      return { ...SONY_BODY, marco: "SONY" };
    case "ILUSTRACION":
      return ILUSTRACION_LIENZO[spec.variante];
  }
}

function puntosPx(spec: ScreenSpec): Record<string, Px> {
  switch (spec.tipo) {
    case "IOS_LISTA":
      return puntosIosLista(spec);
    case "SAM_LISTA":
      return puntosSamLista(spec);
    case "SONY_MENU":
      return puntosSonyMenu(spec);
    case "SONY_TOMA":
      return puntosSonyToma(spec);
    case "IOS_CAMARA":
      return puntosIosCamara(spec);
    case "SAM_CAMARA":
      return puntosSamCamara(spec);
    case "ILUSTRACION":
      return ILUSTRACION_PUNTOS[spec.variante];
  }
}

const cachePuntos = new Map<ScreenId, Record<string, Punto>>();

/** Puntos tocables de una pantalla, de 0 a 1 (nombre visible → posición). */
export function screenHotspots(id: ScreenId): Record<string, Punto> {
  const cached = cachePuntos.get(id);
  if (cached) return cached;
  const spec = SCREENS[id] as ScreenSpec;
  const { w, h } = lienzo(spec);
  const puntos: Record<string, Punto> = {};
  for (const [nombre, [x, y]] of Object.entries(puntosPx(spec))) puntos[nombre] = { x: Math.round((x / w) * 1000) / 1000, y: Math.round((y / h) * 1000) / 1000 };
  cachePuntos.set(id, puntos);
  return puntos;
}

/** Dónde va el dedo de un paso: el toque explícito o, si no, el elemento resaltado. */
export function stepPoint(step: { pantalla: ScreenId; toque?: Punto; resaltar?: string }): Punto | null {
  if (step.toque) return step.toque;
  if (step.resaltar) return screenHotspots(step.pantalla)[step.resaltar] ?? null;
  return null;
}

/* ----------------------------------------------------- MARCO Y VISTA -- */

export type FrameBox = { vw: number; vh: number; x: number; y: number };

/** Tamaño total del dibujo (con el marco del equipo) y dónde va el lienzo de la pantalla dentro de él. */
export function frameBox(marco: Marco, w: number, h: number): FrameBox {
  switch (marco) {
    case "IPHONE":
      return { vw: 396, vh: 808, x: 18, y: 14 };
    case "GALAXY":
      return { vw: 392, vh: 804, x: 16, y: 12 };
    case "MONITOR":
      return { vw: w + 32, vh: h + 58, x: 16, y: 16 };
    default:
      return { vw: w, vh: h, x: 0, y: 0 };
  }
}

export type StepView = {
  /** Proporción del dibujo completo: el contenedor la usa para no dejar espacio vacío. */
  vw: number;
  vh: number;
  /** Más ancho que alto (editor, monitor o cámara Sony): va en un contenedor apaisado de ancho completo. */
  apaisado: boolean;
  /** En pantallas angostas, solo la pantalla de la Sony (sus menús se leen más grandes); null = todo el dibujo. */
  recorte: { x: number; y: number; w: number; h: number } | null;
};

/**
 * Cómo se muestra la maqueta de un paso. Depende de la pantalla del paso, no del equipo de
 * la guía: el último paso de las guías de celular (aplicar la LUT) es un editor apaisado.
 * Los menús y la toma de la Sony se recortan a su pantalla si el dedo cae dentro de ella.
 */
export function stepView(step: { pantalla: ScreenId; toque?: Punto; resaltar?: string }): StepView {
  const spec = SCREENS[step.pantalla] as ScreenSpec;
  const { w, h, marco } = lienzo(spec);
  const box = frameBox(marco, w, h);
  const punto = stepPoint(step);
  const sony = spec.tipo === "SONY_MENU" || spec.tipo === "SONY_TOMA";
  const dentro = (p: Punto) => p.x * w >= SONY_LCD.x && p.x * w <= SONY_LCD.x + SONY_LCD.w && p.y * h >= SONY_LCD.y && p.y * h <= SONY_LCD.y + SONY_LCD.h;
  return { vw: box.vw, vh: box.vh, apaisado: box.vw > box.vh, recorte: sony && (!punto || dentro(punto)) ? { ...SONY_LCD } : null };
}
