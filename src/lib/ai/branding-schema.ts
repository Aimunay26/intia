import { z } from "zod/v4";

import type { MarcaCampos, PersonaCampos } from "@/lib/branding-parser";

/**
 * Forma exacta de lo que el PDF puede rellenar en Brand y en Archetype.
 *
 * Se usa tres veces:
 *  - para validar el JSON «importado» que viaja en un campo oculto del
 *    formulario de nueva persona (nunca se confía en lo que manda el navegador);
 *  - para pedirle a Claude la parte de prosa (zodOutputFormat);
 *  - para Gemini, con el JSON Schema escrito a mano más abajo.
 *
 * Todos los campos son obligatorios a propósito: "" o [] cuando no aplica.
 */

const texto = z.string();
const lista = z.array(z.string());
/**
 * Un color solo puede ser #RRGGBB: se pinta como background de un swatch y
 * entra en el prompt, así que un hidden manipulado no puede colar
 * «url(javascript:1)» ni nada que no sea un hex.
 */
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const hexOVacio = hex.or(z.literal(""));

export const MarcaExtraidaSchema = z.object({
  name: texto,
  tagline: texto,
  description: texto,
  identity: texto,
  brief: texto,
  toneOfVoice: texto,
  audience: texto,
  valueProps: lista,
  doNots: lista,
  keywords: lista,
  instagram: texto,
  tiktok: texto,
  website: texto,
  whatsapp: texto,
  colorPrimary: texto,
  colorSecondary: texto,
  colorAccent: texto,
}) satisfies z.ZodType<MarcaCampos>;

export const PersonaExtraidaSchema = z.object({
  name: texto,
  summary: texto,
  personality: texto,
  strengths: lista,
  avoid: lista,
  toneKeywords: lista,
  brandingNotes: texto,
  color: hexOVacio,
  archetypePrimary: texto,
  archetypeSecondary: texto,
  archetypeTertiary: texto,
  archetypeSummary: texto,
  coreDesire: texto,
  coreFear: texto,
  coreTalent: texto,
  coreTrap: texto,
  evolveToward: texto,
  watchOut: texto,
  coherenceIndex: z.number().nullable(),
  voiceTone: texto,
  messageStructure: texto,
  vocabulary: lista,
  avoidInVoice: lista,
  soundsLike: texto,
  sameArchetypeIcons: lista,
  palette: z.array(z.object({ name: texto, hex })),
  typography: texto,
  aesthetics: texto,
  visualAvoid: texto,
}) satisfies z.ZodType<PersonaCampos>;

/**
 * Lo único que se le pide a la IA: la prosa. Los datos exactos (hex, @redes,
 * arquetipos, vocabulario, paleta, índice de coherencia) los manda el parser
 * determinista y la IA no los toca.
 */
export const MarcaIaSchema = z.object({
  tagline: texto.describe("Lema de la marca en una línea (máximo 120 caracteres), tomado o condensado del brief"),
  description: texto.describe("Qué es la marca y qué problema resuelve, en 2 o 3 líneas"),
  identity: texto.describe("Identidad y personalidad de la marca en prosa, a partir de cómo debe sonar, a dónde quiere llegar y por qué comprarle"),
  toneOfVoice: texto.describe("Cómo habla la marca: tuteo, ritmo, humor, formalidad. Expande lo que dice el brief sin añadir rasgos que no estén"),
  audience: texto.describe("Público al que le habla: quién es, qué lo motiva y qué lo frena. Solo lo que diga el brief"),
  valueProps: lista.describe("De 3 a 6 propuestas de valor cortas, cada una una frase, sacadas literalmente de las respuestas"),
  doNots: lista.describe("Lo que la marca no dice ni muestra, como frases que empiezan por «No …». Vacío si el brief no lo dice"),
  keywords: lista.describe("De 5 a 12 palabras o expresiones propias de la marca que aparezcan en el brief (productos, lugar, sensaciones)"),
});

export const PersonaIaSchema = z.object({
  summary: texto.describe("Una línea (máximo 160 caracteres) que resuma cómo es esta persona frente a cámara, según su informe"),
  personality: texto.describe("Cómo es de verdad: qué la mueve, cómo habla, cómo reacciona. Solo con lo que dice el informe"),
  strengths: lista.describe("De 3 a 5 cosas que le salen naturales frente a cámara, como frases cortas, derivadas de su talento y su tono"),
  avoid: lista.describe("De 3 a 5 cosas que NO le quedan en cámara, derivadas de EVITA, su trampa y lo que evita visualmente"),
  toneKeywords: lista.describe("De 3 a 6 adjetivos o muletillas que definen su voz, sacados de la sección TONO"),
  watchOut: texto.describe("El aviso de coherencia del informe condensado en 2 o 3 líneas. Vacío si el informe no trae ninguno"),
});

export type MarcaIa = z.infer<typeof MarcaIaSchema>;
export type PersonaIa = z.infer<typeof PersonaIaSchema>;

/** El mismo contrato en JSON Schema, para Gemini (responseJsonSchema). */
export const MARCA_IA_JSON_SCHEMA = {
  type: "object",
  required: ["tagline", "description", "identity", "toneOfVoice", "audience", "valueProps", "doNots", "keywords"],
  properties: {
    tagline: { type: "string", description: "Lema en una linea, maximo 120 caracteres" },
    description: { type: "string", description: "Que es la marca y que problema resuelve, en 2 o 3 lineas" },
    identity: { type: "string", description: "Identidad y personalidad de la marca en prosa" },
    toneOfVoice: { type: "string", description: "Como habla la marca" },
    audience: { type: "string", description: "Publico al que le habla" },
    valueProps: { type: "array", items: { type: "string" }, description: "De 3 a 6 propuestas de valor cortas" },
    doNots: { type: "array", items: { type: "string" }, description: "Lo que la marca no dice ni muestra" },
    keywords: { type: "array", items: { type: "string" }, description: "Palabras propias de la marca" },
  },
} as const;

export const PERSONA_IA_JSON_SCHEMA = {
  type: "object",
  required: ["summary", "personality", "strengths", "avoid", "toneKeywords", "watchOut"],
  properties: {
    summary: { type: "string", description: "Una linea de maximo 160 caracteres" },
    personality: { type: "string", description: "Como es de verdad esta persona" },
    strengths: { type: "array", items: { type: "string" }, description: "Lo que le sale natural frente a camara" },
    avoid: { type: "array", items: { type: "string" }, description: "Lo que no le queda en camara" },
    toneKeywords: { type: "array", items: { type: "string" }, description: "Adjetivos de su voz" },
    watchOut: { type: "string", description: "Aviso de coherencia condensado" },
  },
} as const;
