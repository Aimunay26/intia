import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { GoogleGenAI } from "@google/genai";
import type { z } from "zod/v4";

import { resolveAiModel } from "@/lib/ai-models";
import { DEFAULT_MODEL } from "@/lib/constants";
import { getSetting, resolveApiKey, SETTING_KEYS } from "@/lib/settings";
import { limpiarTextoInforme } from "@/lib/pdf";
import {
  detectarTipoDocumento,
  estaVacio,
  parseBriefMaestro,
  parseInformeBranding,
  redactarDatosSensibles,
  type Fuentes,
  type MarcaCampos,
  type PersonaCampos,
  type TipoDocumento,
} from "@/lib/branding-parser";
import {
  MARCA_IA_JSON_SCHEMA,
  MarcaIaSchema,
  PERSONA_IA_JSON_SCHEMA,
  PersonaIaSchema,
} from "@/lib/ai/branding-schema";

/**
 * Extractor de fichas desde el texto de un PDF.
 *
 * Primero pasa el parser determinista (que nunca inventa) y, si hay una clave
 * de IA configurada, le pide a un modelo barato SOLO la prosa: lema, descripción,
 * identidad, propuestas de valor, palabras clave… Los datos exactos (colores,
 * @redes, arquetipos, vocabulario, paleta, índice de coherencia) los manda el
 * parser y la IA no los toca.
 *
 * La IA es una mejora opcional: si no hay clave, falla o responde mal, se
 * devuelve el resultado determinista con un aviso. Esta función NUNCA lanza
 * por culpa de la IA.
 */

/**
 * Candidatos baratos para extraer, por orden de preferencia: una llamada por
 * PDF, nada de Opus. Se filtran por el catálogo de src/lib/ai-models.ts, así
 * un nombre retirado no llega al proveedor y el respaldo es el modelo por
 * defecto del catálogo (nunca un nombre inventado). Para Gemini se usa el
 * predeterminado del catálogo (DEFAULT_MODEL.google), que ya es el Flash barato:
 * así un cambio de versión en constants.ts no deja aquí un nombre viejo.
 */
const MODELOS_EXTRACCION: Record<string, string[]> = {
  anthropic: ["claude-haiku-4-5", "claude-sonnet-5"],
  google: [DEFAULT_MODEL.google],
};

/** Modelo válido del catálogo con el que se extrae para ese proveedor. */
export function modeloDeExtraccion(provider: string): string {
  return resolveAiModel(provider, undefined, ...(MODELOS_EXTRACCION[provider] ?? []));
}

const MAX_CHARS_IA = 60_000;
const MAX_TOKENS_SALIDA = 4_000;

export type InfoIa = { provider: string; model: string };

export type ExtraccionMarca = {
  tipo: "brief";
  campos: MarcaCampos;
  fuentes: Fuentes<MarcaCampos>;
  avisos: string[];
  ia: InfoIa | null;
  tipoDetectado: TipoDocumento | null;
  /** Texto limpio y, en el brief, redactado: es lo que se guarda para la IA. */
  textoParaIa: string;
  redactado: boolean;
};

export type ExtraccionPersona = {
  tipo: "branding";
  campos: PersonaCampos;
  fuentes: Fuentes<PersonaCampos>;
  avisos: string[];
  ia: InfoIa | null;
  tipoDetectado: TipoDocumento | null;
  textoParaIa: string;
  redactado: boolean;
};

export type ResultadoExtraccion = ExtraccionMarca | ExtraccionPersona;

export const AVISO_SIN_IA = "Sin clave de IA válida: se rellenó lo que se pudo leer directamente del PDF.";

/* ------------------------------------------------------------ PRINCIPAL -- */

export async function extraerFicha(input: {
  tipo: TipoDocumento;
  text: string;
}): Promise<ResultadoExtraccion> {
  const texto = limpiarTextoInforme(input.text);
  const tipoDetectado = detectarTipoDocumento(texto);
  const avisos: string[] = [];

  if (tipoDetectado && tipoDetectado !== input.tipo) {
    avisos.push(
      input.tipo === "brief"
        ? "El archivo parece un informe de branding personal, no un brief maestro de marca. Los campos pueden salir vacíos: revisa antes de aplicar."
        : "El archivo parece un brief maestro de marca, no un informe de branding personal. Los campos pueden salir vacíos: revisa antes de aplicar."
    );
  }
  if (!tipoDetectado) {
    avisos.push("No se reconoció el formato de Ai Munay en el PDF: se intentó leer igual, pero revisa cada campo.");
  }

  if (input.tipo === "brief") {
    const base = parseBriefMaestro(texto);
    const { texto: redactadoTexto, redactado } = redactarDatosSensibles(texto);
    avisos.push(...base.avisos);
    if (redactado) {
      avisos.push(
        "Se ocultaron RUC, razón social, teléfonos, correos, números del negocio y ventas del texto que se guarda para la IA."
      );
    }
    const resultado: ExtraccionMarca = {
      tipo: "brief",
      campos: base.campos,
      fuentes: base.fuentes,
      avisos,
      ia: null,
      tipoDetectado,
      textoParaIa: redactadoTexto,
      redactado,
    };
    const ia = await completarConIa({
      schema: MarcaIaSchema,
      jsonSchema: MARCA_IA_JSON_SCHEMA,
      system: SISTEMA_MARCA,
      user: usuarioMarca(redactadoTexto, base.campos),
    });
    if (ia.ok) {
      fusionar(resultado.campos, resultado.fuentes, ia.data);
      resultado.ia = ia.info;
    } else {
      resultado.avisos.push(ia.aviso);
    }
    return resultado;
  }

  const base = parseInformeBranding(texto);
  avisos.push(...base.avisos);
  const resultado: ExtraccionPersona = {
    tipo: "branding",
    campos: base.campos,
    fuentes: base.fuentes,
    avisos,
    ia: null,
    tipoDetectado,
    textoParaIa: texto,
    redactado: false,
  };
  const ia = await completarConIa({
    schema: PersonaIaSchema,
    jsonSchema: PERSONA_IA_JSON_SCHEMA,
    system: SISTEMA_PERSONA,
    user: usuarioPersona(texto, base.campos),
  });
  if (ia.ok) {
    fusionar(resultado.campos, resultado.fuentes, ia.data);
    resultado.ia = ia.info;
  } else {
    resultado.avisos.push(ia.aviso);
  }
  return resultado;
}

/** La IA solo pisa un campo cuando trae algo; lo vacío se queda como estaba. */
function fusionar<T extends object>(campos: T, fuentes: Fuentes<T>, propuesta: Partial<T>) {
  for (const clave of Object.keys(propuesta) as (keyof T)[]) {
    const valor = propuesta[clave];
    if (valor === undefined || estaVacio(valor)) continue;
    campos[clave] = valor as T[keyof T];
    fuentes[clave] = "ia";
  }
}

/* --------------------------------------------------------------- PROMPTS -- */

const SISTEMA_MARCA = `Eres el asistente de marketing de Ai Munay. Recibes el brief maestro de una marca (preguntas en mayúsculas y sus respuestas) y un borrador ya extraído de forma literal.
Tu trabajo es redactar la parte de prosa de la ficha de la marca con la que luego se escriben guiones de video.
Reglas:
- Devuelve SOLO lo que esté en el documento. Si un dato no aparece, deja "" o [].
- No inventes productos, cifras, nombres, lugares ni promesas. No añadas rasgos de personalidad que el brief no diga.
- Escribe en español neutro con tildes, tuteo, frases cortas.
- Mantén las palabras propias de la marca tal como las usa el dueño.`;

const SISTEMA_PERSONA = `Eres el asistente de marketing de Ai Munay. Recibes el informe de branding de una persona que sale en cámara (arquetipos, tono, vocabulario, referentes) y un borrador ya extraído de forma literal.
Tu trabajo es redactar la parte de prosa de su ficha: resumen, personalidad, lo que le sale natural, lo que no le queda, palabras de tono y el aviso de coherencia condensado.
Reglas:
- Devuelve SOLO lo que esté en el informe. Si un dato no aparece, deja "" o [].
- No inventes rasgos, gestos ni referentes. No uses los referentes de estilo (sección Referentes) como si fueran rasgos de la persona.
- Escribe en español neutro con tildes, tuteo, frases cortas.`;

function usuarioMarca(texto: string, borrador: MarcaCampos): string {
  return [
    "DOCUMENTO (brief maestro, con datos reservados ocultos):",
    texto.slice(0, MAX_CHARS_IA),
    "",
    "BORRADOR LITERAL YA EXTRAÍDO (mejóralo sin añadir nada que no esté en el documento):",
    JSON.stringify(
      {
        name: borrador.name,
        tagline: borrador.tagline,
        description: borrador.description,
        identity: borrador.identity,
        toneOfVoice: borrador.toneOfVoice,
        audience: borrador.audience,
        valueProps: borrador.valueProps,
        doNots: borrador.doNots,
      },
      null,
      1
    ),
  ].join("\n");
}

function usuarioPersona(texto: string, borrador: PersonaCampos): string {
  return [
    "DOCUMENTO (informe de branding personal):",
    texto.slice(0, MAX_CHARS_IA),
    "",
    "BORRADOR LITERAL YA EXTRAÍDO (mejóralo sin añadir nada que no esté en el documento):",
    JSON.stringify(
      {
        name: borrador.name,
        archetypePrimary: borrador.archetypePrimary,
        coreTalent: borrador.coreTalent,
        coreTrap: borrador.coreTrap,
        voiceTone: borrador.voiceTone,
        avoidInVoice: borrador.avoidInVoice,
        visualAvoid: borrador.visualAvoid,
        watchOut: borrador.watchOut,
        summary: borrador.summary,
        strengths: borrador.strengths,
        avoid: borrador.avoid,
        toneKeywords: borrador.toneKeywords,
      },
      null,
      1
    ),
  ].join("\n");
}

/* ------------------------------------------------------------ PROVEEDOR -- */

type Llamada<T> = {
  schema: z.ZodType<T>;
  jsonSchema: unknown;
  system: string;
  user: string;
};

type RespuestaIa<T> = { ok: true; data: T; info: InfoIa } | { ok: false; aviso: string };

/** Elige proveedor y clave. Devuelve null si no hay ninguna clave usable. */
async function elegirProveedor(): Promise<{ provider: string; apiKey: string; model: string } | null> {
  let preferido: string;
  try {
    preferido = (await getSetting(SETTING_KEYS.defaultProvider)) ?? "anthropic";
  } catch {
    preferido = "anthropic";
  }
  const orden = preferido === "google" ? ["google", "anthropic"] : ["anthropic", "google"];
  for (const provider of orden) {
    try {
      const { key } = await resolveApiKey(provider);
      if (key) return { provider, apiKey: key, model: modeloDeExtraccion(provider) };
    } catch {
      // seguimos con el otro proveedor
    }
  }
  return null;
}

async function completarConIa<T>(llamada: Llamada<T>): Promise<RespuestaIa<T>> {
  const proveedor = await elegirProveedor();
  if (!proveedor) return { ok: false, aviso: AVISO_SIN_IA };

  try {
    const data =
      proveedor.provider === "google"
        ? await completarConGemini(proveedor.apiKey, proveedor.model, llamada)
        : await completarConClaude(proveedor.apiKey, proveedor.model, llamada);
    if (!data) {
      return {
        ok: false,
        aviso: "La IA respondió, pero no en el formato esperado: se usó solo la lectura directa del PDF.",
      };
    }
    return { ok: true, data, info: { provider: proveedor.provider, model: proveedor.model } };
  } catch (error) {
    return { ok: false, aviso: `${describirFallo(error, proveedor.provider)} Se usó solo la lectura directa del PDF.` };
  }
}

async function completarConClaude<T>(apiKey: string, model: string, llamada: Llamada<T>): Promise<T | null> {
  const client = new Anthropic({ apiKey, maxRetries: 1 });
  const stream = client.messages.stream({
    model,
    max_tokens: MAX_TOKENS_SALIDA,
    system: llamada.system,
    messages: [{ role: "user", content: llamada.user }],
    output_config: { format: zodOutputFormat(llamada.schema) },
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") return null;

  const parsed = message.parsed_output;
  if (parsed) {
    const check = llamada.schema.safeParse(parsed);
    return check.success ? check.data : null;
  }
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  return leerJson(text, llamada.schema);
}

/** Gemini no acepta todos los dialectos de JSON Schema: se quitan las claves que sobran. */
function esquemaGemini(schema: unknown): unknown {
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip);
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        if (key === "additionalProperties") continue;
        out[key] = strip(value);
      }
      return out;
    }
    return node;
  };
  return strip(schema);
}

async function completarConGemini<T>(apiKey: string, model: string, llamada: Llamada<T>): Promise<T | null> {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents: llamada.user,
    config: {
      systemInstruction: llamada.system,
      responseMimeType: "application/json",
      responseJsonSchema: esquemaGemini(llamada.jsonSchema),
      temperature: 0.2,
      maxOutputTokens: MAX_TOKENS_SALIDA,
    },
  });
  return leerJson(response.text ?? "", llamada.schema);
}

/** Saca un JSON válido del texto de la IA, o null. Nunca lanza. */
function leerJson<T>(text: string, schema: z.ZodType<T>): T | null {
  if (!text.trim()) return null;
  const candidatos: string[] = [];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidatos.push(fenced[1]);
  candidatos.push(text);
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) candidatos.push(text.slice(first, last + 1));

  for (const candidato of candidatos) {
    try {
      const result = schema.safeParse(JSON.parse(candidato.trim()));
      if (result.success) return result.data;
    } catch {
      // siguiente candidato
    }
  }
  return null;
}

function describirFallo(error: unknown, provider: string): string {
  const etiqueta = provider === "google" ? "Gemini" : "Claude";
  const message = error instanceof Error ? error.message : String(error);
  const status =
    error && typeof error === "object" && "status" in error
      ? Number((error as { status?: unknown }).status)
      : undefined;
  if (status === 401 || status === 403 || /api[_ -]?key|unauthorized|permission/i.test(message)) {
    return `La clave de ${etiqueta} no es válida o no tiene permisos.`;
  }
  if (status === 429 || /rate|quota|resource[_ ]exhausted/i.test(message)) {
    return `${etiqueta} está limitando las peticiones.`;
  }
  if (status === 404 || /model|not found/i.test(message)) {
    return `${etiqueta} no reconoce el modelo de extracción.`;
  }
  return `La IA (${etiqueta}) no respondió.`;
}
