/**
 * Extraccion de texto de PDFs.
 *
 * Se usa `unpdf`, que funciona igual en local y en hosting serverless.
 * Si la extraccion falla (PDF escaneado, protegido o corrupto) NO se rompe la
 * subida: se guarda el archivo igual y se avisa para que el texto se pegue a mano.
 */

import { detectarTipoDocumento } from "@/lib/branding-parser";

const MAX_STORED_CHARS = 200_000;

export type ExtractResult = {
  text: string | null;
  pages: number;
  error: string | null;
};

export async function extractPdfText(buffer: ArrayBuffer): Promise<ExtractResult> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const result = await extractText(pdf, { mergePages: true });

    const raw = Array.isArray(result.text) ? result.text.join("\n\n") : result.text ?? "";
    const clean = limpiarSiEsDocumentoAiMunay(normalize(raw));

    if (!clean) {
      return {
        text: null,
        pages: result.totalPages ?? 0,
        error:
          "El PDF no tiene texto seleccionable (parece escaneado). Puedes pegar el contenido a mano.",
      };
    }

    return {
      text: clean.slice(0, MAX_STORED_CHARS),
      pages: result.totalPages ?? 0,
      error: null,
    };
  } catch (error) {
    return {
      text: null,
      pages: 0,
      error:
        error instanceof Error
          ? `No se pudo leer el PDF: ${error.message}`
          : "No se pudo leer el PDF.",
    };
  }
}

/** Limpia saltos raros y espacios repetidos que ensucian el prompt. */
function normalize(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
}

/* ------------------------------------------------------- LIMPIEZA INFORMES -- */

/**
 * Encabezados que los PDF de Ai Munay maquetan con las letras separadas
 * («T O N O», «E V I TA», «N OTA M E TO D O L Ó G I C A»). Es un catálogo
 * cerrado a propósito: solo se junta lo que se sabe que es un encabezado, y
 * nunca texto corriente. Los más largos van primero para que «ARQUETIPO
 * PRIMARIO» se resuelva antes que «TU ARQUETIPO».
 */
const ENCABEZADOS_ESPACIADOS = [
  "MARCAS DE TU MISMO ARQUETIPO",
  "ICONOS DE TU MISMO ARQUETIPO",
  "LO QUE DEBERÍAS VIGILAR",
  "HACIA DÓNDE EVOLUCIONAR",
  "BRIEF MAESTRO DE MARCA",
  "ESTRUCTURA DEL MENSAJE",
  "ARQUETIPO SECUNDARIO",
  "ARQUETIPO TERCIARIO",
  "ÍNDICE DE DEFINICIÓN",
  "INFORME DE BRANDING",
  "ARQUETIPO PRIMARIO",
  "NOTA METODOLÓGICA",
  "ÍNDICE DE AUDACIA",
  "TU ARQUETIPO",
  "COMUNICACIÓN",
  "VOCABULARIO",
  "REFERENTES",
  "SUENA ASÍ",
  "ACCIONES",
  "AI MUNAY",
  "VISUAL",
  "EVITA",
  "TONO",
];

const LETRA_MAYUSCULA = "A-ZÁÉÍÓÚÜÑ";

/** «TONO» → /(?<![A-Z])T\s*O\s*N\s*O/g. Las palabras del encabezado también van unidas por \s*. */
function regexEspaciado(encabezado: string): RegExp {
  const letras = encabezado.replace(/\s+/g, "").split("");
  const cuerpo = letras.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*");
  return new RegExp(`(?<![${LETRA_MAYUSCULA}])${cuerpo}`, "g");
}

const REGEX_ENCABEZADOS = ENCABEZADOS_ESPACIADOS.map((encabezado) => ({
  encabezado,
  regex: regexEspaciado(encabezado),
}));

/**
 * Un tramo solo cuenta como encabezado espaciado si de verdad viene con las
 * letras separadas: al menos la mitad de los huecos entre letras llevan espacio.
 * Así «T O N O» se junta y «ESTO NO» (que también contiene T, O, N, O) se deja en paz.
 */
function estaEspaciado(tramo: string): boolean {
  const letras = tramo.replace(/\s+/g, "").length;
  if (letras < 2) return false;
  const huecosConEspacio = (tramo.match(/\S\s+(?=\S)/g) ?? []).length;
  return huecosConEspacio * 2 >= letras - 1;
}

/**
 * Limpieza propia de los PDF de branding y de brief maestro:
 *  - quita los marcadores de página «2 / 13» y los pies del brief;
 *  - junta las letras de los encabezados del catálogo y los deja en línea propia;
 *  - separa el pie de portada «Marca personal · Generado el …» del párrafo;
 *  - deja una sola línea entre bloques, que es lo que espera branding-parser.
 * Ese último paso funde los párrafos, así que NO se aplica a documentos
 * corrientes (brand books, ejemplos de guiones): ver limpiarSiEsDocumentoAiMunay.
 */
export function limpiarTextoInforme(text: string): string {
  let out = text
    .replace(/^[ \t]*\d{1,3}[ \t]*\/[ \t]*\d{1,3}[ \t]*$/gm, "")
    .replace(/^[ \t]*BRIEF DE MARCA ·.*?\d{1,3}[ \t]*\/[ \t]*\d{1,3}[ \t]*$/gm, "")
    .replace(/(\S)(Marca personal · Generado el)/g, "$1\n$2");

  for (const { encabezado, regex } of REGEX_ENCABEZADOS) {
    out = out.replace(regex, (tramo) => (estaEspaciado(tramo) ? `\n${encabezado}\n` : tramo));
  }

  return out
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/**
 * Aplica limpiarTextoInforme solo si el texto es un brief maestro o un informe
 * de branding de Ai Munay; cualquier otro documento se queda como lo dejó
 * normalize(), con sus párrafos separados por una línea en blanco.
 *
 * La detección se hace sobre el texto ya limpio, porque los encabezados del
 * PDF vienen con las letras separadas y solo después de juntarlas se leen.
 */
export function limpiarSiEsDocumentoAiMunay(text: string): string {
  const limpio = limpiarTextoInforme(text);
  return detectarTipoDocumento(limpio) ? limpio : text;
}

/** Extrae texto de archivos de texto plano (md, txt, csv). */
export async function extractPlainText(buffer: ArrayBuffer): Promise<ExtractResult> {
  try {
    const text = new TextDecoder("utf-8").decode(buffer);
    const clean = normalize(text);
    return { text: clean.slice(0, MAX_STORED_CHARS) || null, pages: 0, error: null };
  } catch {
    return { text: null, pages: 0, error: "No se pudo leer el archivo." };
  }
}

const TEXT_TYPES = ["text/plain", "text/markdown", "text/csv", "application/json"];

export async function extractAnyText(
  buffer: ArrayBuffer,
  mimeType: string,
  filename: string
): Promise<ExtractResult> {
  const lower = filename.toLowerCase();
  if (mimeType === "application/pdf" || lower.endsWith(".pdf")) {
    return extractPdfText(buffer);
  }
  if (TEXT_TYPES.includes(mimeType) || /\.(txt|md|csv|json)$/.test(lower)) {
    return extractPlainText(buffer);
  }
  return {
    text: null,
    pages: 0,
    error: "Formato no soportado para extraer texto. Se guardó el archivo igual.",
  };
}

export const ACCEPTED_UPLOAD_TYPES = ".pdf,.txt,.md,.csv,.json";
// Vercel corta el cuerpo de una peticion serverless en 4,5 MB. Se deja por
// debajo para que el aviso lo dé la aplicación en español y no la plataforma
// con un 413 mudo que nadie entiende.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // 4 MB
