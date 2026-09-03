/**
 * El vocabulario del motor «Por tipo de video».
 *
 * Todo lo que el dueño va a querer retocar cuando el motor se equivoque vive
 * aquí y en ningún otro sitio: las tablas de afinidad, la energía que pide
 * cada familia de formato y las palabras vacías.
 *
 * El problema que resuelve este archivo: en la base, `Archetype.avoid` y
 * `strengths` son ORACIONES ("Comedia física y ridículo"), no palabras. Buscar
 * esa cadena dentro del texto de una estructura devuelve false siempre, y el
 * motor se queda con dos señales muertas y puntuaciones planas. Por eso se
 * tokenizan los dos lados y se cruzan palabras, no frases.
 */

import type { Beat } from "@/lib/ai/context";

/* ----------------------------------------------------------- NORMALIZAR -- */

/** Minúsculas, sin tildes y sin puntuación. La misma limpieza que slugify. */
export function norm(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Palabras que aparecen en todas partes y no distinguen nada. Si no se quitan,
 * "Tono suplicante" cruza con cualquier estructura que diga "tono".
 */
export const VACIAS = new Set([
  "para",
  "sobre",
  "hacer",
  "cuando",
  "cualquier",
  "tono",
  "video",
  "videos",
  "forma",
  "mucho",
  "poco",
  "todo",
  "toda",
  "todos",
  "todas",
  "esta",
  "este",
  "estas",
  "estos",
  "como",
  "mas",
  "muy",
  "sin",
  "con",
  "que",
  "una",
  "uno",
  "los",
  "las",
  "del",
  "por",
  "ser",
  "esa",
  "ese",
  "algo",
  "nada",
  "otro",
  "otra",
  "pero",
  "porque",
  "donde",
  "quien",
  "hasta",
  "desde",
  "entre",
  "cada",
  "ya",
  "le",
  "se",
  "de",
  "en",
  "el",
  "la",
  "un",
  "es",
  "al",
  "lo",
  "su",
  "y",
  "o",
  "a",
]);

/** Palabras de contenido de un texto: 4 letras o más y que no sean vacías. */
export function tokens(texto: string | null | undefined): Set<string> {
  if (!texto) return new Set();
  const out = new Set<string>();
  for (const palabra of norm(texto).split(" ")) {
    if (palabra.length >= 4 && !VACIAS.has(palabra)) out.add(palabra);
  }
  return out;
}

/**
 * Cuánta señal hay entre una frase y una bolsa de palabras.
 * 0 = nada, 1 = una coincidencia (débil), 2 = dos o más (fuerte).
 */
export function fuerza(frase: string, bolsa: Set<string>): 0 | 1 | 2 {
  let n = 0;
  for (const t of tokens(frase)) {
    if (bolsa.has(t)) {
      n += 1;
      if (n >= 2) return 2;
    }
  }
  return n === 1 ? 1 : 0;
}

/** Igual, pero para listas de palabras sueltas: una coincidencia ya cuenta. */
export function coincidencias(palabras: string[], bolsa: Set<string>): string[] {
  const out: string[] = [];
  for (const p of palabras) {
    for (const t of tokens(p)) {
      if (bolsa.has(t)) {
        out.push(p);
        break;
      }
    }
  }
  return out;
}

/* ------------------------------------------------------ EL TIPO DE VIDEO -- */

/** Lo mínimo que el motor necesita saber de un formato. */
export type FormatoMatch = {
  name: string;
  category: string;
  family: string | null;
  summary: string | null;
  /** Ya parseados: en el cliente vienen parseados y en el servidor no. */
  beats: Beat[];
  rules: string[];
  /** El texto con más señal de toda la estructura. */
  systemPrompt: string;
  categoryDescription?: string;
};

/**
 * Todas las palabras que describen este formato. Incluye `systemPrompt`
 * a propósito: es el campo más rico de la estructura y hoy no lo lee nadie
 * fuera del generador.
 */
export function bolsaDelFormato(f: FormatoMatch): Set<string> {
  const partes = [
    f.name,
    f.family ?? "",
    f.summary ?? "",
    f.systemPrompt,
    f.categoryDescription ?? "",
    ...f.rules,
    ...f.beats.flatMap((b) => [b.name, b.goal ?? "", b.notes ?? ""]),
  ];
  const bolsa = new Set<string>();
  for (const p of partes) for (const t of tokens(p)) bolsa.add(t);
  return bolsa;
}

/* ------------------------------------------------------- ENERGIA PEDIDA -- */

/**
 * Cuánta energía pide cada familia, del 1 al 5.
 *
 * Son las 16 familias literales del catálogo. Ojo: "sketch", "vlog" y
 * "cámara escondida" son NOMBRES DE ESTRUCTURA, no familias — todas ellas
 * caen bajo "Entretenimiento".
 */
export const ENERGIA_POR_FAMILIA: Record<string, number> = {
  Humor: 5,
  Entretenimiento: 5,
  Comunidad: 4,
  "Detrás de cámaras": 4,
  UGC: 4,
  Nativo: 4,
  Narrativo: 3,
  Marca: 3,
  Producción: 3,
  Producto: 3,
  Educativo: 2,
  Comparativo: 2,
  "Prueba social": 2,
  Demostración: 2,
  Copywriting: 2,
  Directo: 2,
};

/**
 * La energía que pide este formato.
 *
 * Base por categoría, la familia manda si se conoce, y luego se ajusta por el
 * ritmo real: beats muy cortos piden más nervio que beats largos.
 */
export function energiaPedida(f: FormatoMatch): number {
  const base = f.category === "ENTRETIENE" ? 4 : 3;
  // `family` es nulable y de texto libre: si no la conocemos, la categoría manda.
  const porFamilia = f.family ? ENERGIA_POR_FAMILIA[f.family] : undefined;
  let energia = porFamilia ?? base;

  const conSegundos = f.beats.filter((b) => typeof b.seconds === "number" && b.seconds > 0);
  if (conSegundos.length > 0) {
    const medio =
      conSegundos.reduce((n, b) => n + (b.seconds ?? 0), 0) / conSegundos.length;
    if (medio <= 5) energia += 1;
    else if (medio > 12) energia -= 1;
  }

  return Math.min(5, Math.max(1, energia));
}

/** Formatos donde hay que hablar: sin voz cargada, el guion no suena a nadie. */
export function tieneDialogo(f: FormatoMatch): boolean {
  const bolsa = bolsaDelFormato(f);
  return ["voz", "dice", "habla", "dialogo", "guion", "cuenta", "explica"].some((p) =>
    bolsa.has(p)
  );
}

/* -------------------------------------------------- AFINIDAD DE ARQUETIPO -- */

/**
 * Qué familias le van y cuáles no a cada arquetipo junguiano, de -1 a 1.
 *
 * `archetypePrimary` es texto libre ("El Bufón", "Bufón / Jester"), así que
 * se busca por slug y por substring. Un arquetipo que no esté aquí vale 0
 * (neutro), nunca undefined.
 */
export const AFINIDAD_ARQUETIPO: Record<string, Record<string, number>> = {
  gobernante: {
    Marca: 1,
    Educativo: 0.8,
    Producción: 0.6,
    "Detrás de cámaras": 0.4,
    Demostración: 0.3,
    Directo: 0,
    Copywriting: 0,
    "Prueba social": -0.3,
    UGC: -0.4,
    Comparativo: -0.5,
    Narrativo: -0.2,
    Producto: -0.2,
    Comunidad: 0.2,
    Nativo: -0.6,
    Humor: -1,
    Entretenimiento: -1,
  },
  bufon: {
    Humor: 1,
    Entretenimiento: 1,
    Nativo: 0.9,
    Narrativo: 0.5,
    Comunidad: 0.5,
    UGC: 0.4,
    "Detrás de cámaras": 0.4,
    Producto: 0.2,
    Comparativo: 0.2,
    Educativo: 0,
    Demostración: -0.2,
    Directo: -0.5,
    Copywriting: -0.4,
    Producción: -0.5,
    "Prueba social": -0.8,
    Marca: -1,
  },
  mago: {
    Demostración: 1,
    Narrativo: 0.8,
    Producto: 0.7,
    Educativo: 0.6,
    Producción: 0.5,
    Marca: 0.3,
    Nativo: 0.3,
    Comparativo: 0.2,
    Comunidad: 0.2,
    "Detrás de cámaras": 0.2,
    UGC: -0.1,
    Copywriting: 0.1,
    "Prueba social": -0.2,
    Directo: -0.3,
    Humor: -0.6,
    Entretenimiento: -0.4,
  },
  sabio: {
    Educativo: 1,
    Comparativo: 0.7,
    Demostración: 0.6,
    Producción: 0.5,
    Marca: 0.3,
    Copywriting: 0.3,
    Narrativo: 0.2,
    Producto: 0.2,
    Comunidad: 0.2,
    "Detrás de cámaras": 0.1,
    UGC: -0.2,
    Nativo: -0.2,
    "Prueba social": 0,
    Directo: -0.3,
    Humor: -0.7,
    Entretenimiento: -0.6,
  },
  heroe: {
    Narrativo: 0.8,
    Demostración: 0.7,
    Comparativo: 0.6,
    Marca: 0.5,
    Copywriting: 0.4,
    Educativo: 0.3,
    Producto: 0.2,
    Directo: 0.2,
    Producción: 0.1,
    Comunidad: 0.1,
    UGC: 0,
    "Detrás de cámaras": 0,
    Nativo: 0,
    "Prueba social": 0.2,
    Humor: -0.4,
    Entretenimiento: -0.2,
  },
  forajido: {
    Comparativo: 1,
    Nativo: 0.7,
    Humor: 0.6,
    Narrativo: 0.5,
    Entretenimiento: 0.5,
    Comunidad: 0.4,
    Copywriting: 0.3,
    UGC: 0.2,
    "Detrás de cámaras": 0.2,
    Producto: 0,
    Demostración: 0,
    Educativo: -0.1,
    Directo: -0.2,
    Producción: -0.3,
    "Prueba social": -0.4,
    Marca: -0.5,
  },
  "hombre-comun": {
    UGC: 1,
    "Prueba social": 0.9,
    Comunidad: 0.7,
    "Detrás de cámaras": 0.6,
    Nativo: 0.4,
    Producto: 0.4,
    Demostración: 0.3,
    Educativo: 0.2,
    Narrativo: 0.1,
    Humor: 0.2,
    Entretenimiento: 0.2,
    Comparativo: 0,
    Directo: 0,
    Copywriting: -0.2,
    Producción: -0.3,
    Marca: -0.6,
  },
  cuidador: {
    Comunidad: 0.9,
    "Prueba social": 0.7,
    Educativo: 0.6,
    UGC: 0.5,
    Narrativo: 0.4,
    "Detrás de cámaras": 0.3,
    Demostración: 0.3,
    Producto: 0.2,
    Marca: 0.2,
    Producción: 0.1,
    Nativo: 0,
    Copywriting: 0,
    Directo: -0.2,
    Comparativo: -0.4,
    Humor: -0.3,
    Entretenimiento: -0.2,
  },
  creador: {
    "Detrás de cámaras": 1,
    Producción: 0.8,
    Producto: 0.7,
    Demostración: 0.6,
    Narrativo: 0.5,
    Educativo: 0.4,
    Nativo: 0.3,
    Marca: 0.3,
    Humor: 0.1,
    Entretenimiento: 0.1,
    Comunidad: 0.1,
    UGC: 0,
    Copywriting: 0,
    Comparativo: -0.2,
    "Prueba social": -0.3,
    Directo: -0.4,
  },
  amante: {
    Narrativo: 0.8,
    Producto: 0.7,
    Marca: 0.5,
    Demostración: 0.4,
    "Prueba social": 0.4,
    Comunidad: 0.3,
    UGC: 0.3,
    "Detrás de cámaras": 0.2,
    Producción: 0.2,
    Educativo: 0,
    Nativo: 0,
    Copywriting: 0,
    Comparativo: -0.3,
    Directo: -0.3,
    Humor: -0.4,
    Entretenimiento: -0.2,
  },
  explorador: {
    "Detrás de cámaras": 0.8,
    Narrativo: 0.6,
    Nativo: 0.5,
    Producto: 0.5,
    Entretenimiento: 0.5,
    Comunidad: 0.3,
    UGC: 0.3,
    Demostración: 0.2,
    Educativo: 0.2,
    Humor: 0.2,
    Producción: 0.1,
    Comparativo: 0,
    "Prueba social": 0,
    Copywriting: -0.2,
    Directo: -0.4,
    Marca: -0.3,
  },
  inocente: {
    UGC: 0.7,
    Comunidad: 0.6,
    "Prueba social": 0.5,
    Producto: 0.4,
    Narrativo: 0.3,
    "Detrás de cámaras": 0.3,
    Educativo: 0.2,
    Demostración: 0.2,
    Marca: 0.2,
    Nativo: 0.1,
    Entretenimiento: 0.1,
    Humor: 0,
    Producción: 0,
    Copywriting: -0.2,
    Directo: -0.3,
    Comparativo: -0.6,
  },
};

/** Resuelve un `archetypePrimary` de texto libre a una clave de la tabla. */
export function claveArquetipo(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const limpio = norm(texto).replace(/\s+/g, "-");
  for (const clave of Object.keys(AFINIDAD_ARQUETIPO)) {
    if (limpio.includes(clave)) return clave;
  }
  return null;
}

/** La afinidad de un arquetipo con una familia. Desconocido = 0, nunca undefined. */
export function afinidad(arquetipo: string | null | undefined, familia: string | null): number {
  if (!familia) return 0;
  const clave = claveArquetipo(arquetipo);
  if (!clave) return 0;
  return AFINIDAD_ARQUETIPO[clave]?.[familia] ?? 0;
}
