import { z } from "zod/v4";

/**
 * Forma exacta del guion que devuelve la IA.
 *
 * Se usa dos veces:
 *  - Claude: se convierte a formato de salida estructurada (zodOutputFormat).
 *  - Gemini: se manda el JSON Schema de abajo y luego se valida con este Zod.
 *
 * Todos los campos son OBLIGATORIOS a proposito. Los modelos rellenan ""
 * cuando algo no aplica, y asi la salida siempre tiene la misma forma.
 */

export const ActorSchema = z.object({
  role: z.string().describe("Cómo se le llama en el guion: Chica, Novio, Presentador, Voz narradora"),
  archetype: z.string().describe("Qué arquetipo o perfil debería interpretarlo"),
  notes: z.string().describe("Indicaciones de actuación para esta persona en esta escena"),
});

export const SceneSchema = z.object({
  beat: z
    .string()
    .describe("Nombre del beat de la estructura: Golpe visual, Tensión, Plot twist, CTA…"),
  startSec: z.number().describe("Segundo en que empieza la escena"),
  endSec: z.number().describe("Segundo en que termina la escena"),
  voiceType: z
    .enum(["EN_CAMARA", "VOZ_EN_OFF", "DIALOGO", "TEXTO"])
    .describe("Cómo se entrega la línea"),
  voice: z
    .string()
    .describe("Lo que se dice, palabra por palabra, listo para leer. Sin acotaciones."),
  shot: z
    .string()
    .describe("Encuadre y movimiento de cámara: primer plano, plano medio, picada, transicion"),
  action: z.string().describe("Qué pasa en la escena, la acción física concreta"),
  actors: z.array(ActorSchema).describe("Quienes aparecen en esta escena"),
  emotion: z.string().describe("Emoción que deben transmitir los actores en esta escena"),
  props: z.array(z.string()).describe("Elementos visuales y utilería necesarios"),
  lighting: z.string().describe("Iluminación concreta que refuerza esa emoción"),
  sound: z.string().describe("Música, efectos de sonido y ambiente de esta escena"),
  onScreenText: z.string().describe("Texto que aparece en pantalla. Vacío si no hay."),
  location: z.string().describe("Dónde se graba"),
  notes: z.string().describe("Cualquier detalle extra de producción"),
});

export const GeneratedScriptSchema = z.object({
  title: z.string().describe("Título corto y memorable del guion"),
  avatar: z.string().describe("A quién le habla este video, en una frase"),
  focus: z.string().describe("Enfoque de venta o de entretenimiento, en una frase"),
  hook: z.string().describe("El gancho de los primeros 3 segundos, resumido"),
  cta: z.string().describe("Llamado a la acción. Vacío si el video solo entretiene."),
  totalSeconds: z.number().describe("Duración total estimada en segundos"),
  castNotes: z.string().describe("Resumen de cuántas personas se necesitan y de qué perfil"),
  propsSummary: z.array(z.string()).describe("Lista consolidada de TODO lo que hay que conseguir"),
  scenes: z.array(SceneSchema).describe("Las escenas en orden, una por beat de la estructura"),
});

export type GeneratedScript = z.infer<typeof GeneratedScriptSchema>;
export type GeneratedScene = z.infer<typeof SceneSchema>;

/**
 * El mismo contrato en JSON Schema, para Gemini (responseJsonSchema).
 * Se mantiene a mano y a la par del Zod de arriba.
 */
export const GENERATED_SCRIPT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "avatar",
    "focus",
    "hook",
    "cta",
    "totalSeconds",
    "castNotes",
    "propsSummary",
    "scenes",
  ],
  properties: {
    title: { type: "string", description: "Título corto y memorable del guion" },
    avatar: { type: "string", description: "A quien le habla este video" },
    focus: { type: "string", description: "Enfoque de venta o entretenimiento" },
    hook: { type: "string", description: "El gancho de los primeros 3 segundos" },
    cta: { type: "string", description: "Llamado a la accion. Vacio si solo entretiene." },
    totalSeconds: { type: "number", description: "Duracion total en segundos" },
    castNotes: { type: "string", description: "Cuantas personas y de que perfil" },
    propsSummary: {
      type: "array",
      items: { type: "string" },
      description: "Lista consolidada de todo lo que hay que conseguir",
    },
    scenes: {
      type: "array",
      description: "Las escenas en orden, una por beat de la estructura",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "beat",
          "startSec",
          "endSec",
          "voiceType",
          "voice",
          "shot",
          "action",
          "actors",
          "emotion",
          "props",
          "lighting",
          "sound",
          "onScreenText",
          "location",
          "notes",
        ],
        properties: {
          beat: { type: "string", description: "Nombre del beat de la estructura" },
          startSec: { type: "number" },
          endSec: { type: "number" },
          voiceType: {
            type: "string",
            enum: ["EN_CAMARA", "VOZ_EN_OFF", "DIALOGO", "TEXTO"],
          },
          voice: { type: "string", description: "Lo que se dice, palabra por palabra" },
          shot: { type: "string", description: "Encuadre y movimiento de cámara" },
          action: { type: "string", description: "Accion fisica concreta de la escena" },
          actors: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["role", "archetype", "notes"],
              properties: {
                role: { type: "string" },
                archetype: { type: "string" },
                notes: { type: "string" },
              },
            },
          },
          emotion: { type: "string", description: "Emocion que transmiten los actores" },
          props: { type: "array", items: { type: "string" } },
          lighting: { type: "string", description: "Iluminacion que refuerza la emocion" },
          sound: { type: "string", description: "Musica, efectos y ambiente" },
          onScreenText: { type: "string" },
          location: { type: "string" },
          notes: { type: "string" },
        },
      },
    },
  },
} as const;

/** Descripcion en texto del contrato, para reforzar en el prompt. */
export const OUTPUT_CONTRACT_TEXT = `Devuelve UNICAMENTE un objeto JSON con esta forma exacta:

{
  "title": string,
  "avatar": string,
  "focus": string,
  "hook": string,
  "cta": string,
  "totalSeconds": number,
  "castNotes": string,
  "propsSummary": string[],
  "scenes": [
    {
      "beat": string,
      "startSec": number,
      "endSec": number,
      "voiceType": "EN_CAMARA" | "VOZ_EN_OFF" | "DIALOGO" | "TEXTO",
      "voice": string,
      "shot": string,
      "action": string,
      "actors": [{ "role": string, "archetype": string, "notes": string }],
      "emotion": string,
      "props": string[],
      "lighting": string,
      "sound": string,
      "onScreenText": string,
      "location": string,
      "notes": string
    }
  ]
}

Ningun campo puede faltar. Si algo no aplica, usa "" o [].`;
