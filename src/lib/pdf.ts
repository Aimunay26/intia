/**
 * Extraccion de texto de PDFs.
 *
 * Se usa `unpdf`, que funciona igual en local y en hosting serverless.
 * Si la extraccion falla (PDF escaneado, protegido o corrupto) NO se rompe la
 * subida: se guarda el archivo igual y se avisa para que el texto se pegue a mano.
 */

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
    const clean = normalize(raw);

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
