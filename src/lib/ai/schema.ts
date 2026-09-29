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
  role: z.string().max(12000).describe("Cómo se le llama en el guion: Chica, Novio, Presentador, Voz narradora"),
  archetype: z.string().max(12000).describe("Qué arquetipo o perfil debería interpretarlo"),
  notes: z.string().max(12000).describe("Indicaciones de actuación para esta persona en esta escena"),
});

export const SceneSchema = z.object({
  beat: z
    .string().max(12000)
    .describe("Nombre del beat de la estructura: Golpe visual, Tensión, Plot twist, CTA…"),
  startSec: z.number().int().min(0).max(690).describe("Segundo en que empieza la escena"),
  endSec: z.number().int().min(1).max(690).describe("Segundo en que termina la escena"),
  voiceType: z
    .enum(["EN_CAMARA", "VOZ_EN_OFF", "DIALOGO", "TEXTO"])
    .describe("Cómo se entrega la línea"),
  voice: z
    .string().max(12000)
    .describe("Lo que se dice, palabra por palabra, listo para leer. Sin acotaciones."),
  shot: z
    .string().max(12000)
    .describe("Encuadre y movimiento de cámara: primer plano, plano medio, picada, transicion"),
  action: z.string().max(12000).describe("Qué pasa en la escena, la acción física concreta"),
  actors: z.array(ActorSchema).max(30).describe("Quienes aparecen en esta escena"),
  emotion: z.string().max(12000).describe("Emoción que deben transmitir los actores en esta escena"),
  props: z.array(z.string().max(12000)).max(100).describe("Elementos visuales y utilería necesarios"),
  lighting: z.string().max(12000).describe("Iluminación concreta que refuerza esa emoción"),
  sound: z.string().max(12000).describe("Música, efectos de sonido y ambiente de esta escena"),
  onScreenText: z.string().max(12000).describe("Texto que aparece en pantalla. Vacío si no hay."),
  location: z.string().max(12000).describe("Dónde se graba"),
  notes: z.string().max(12000).describe("Cualquier detalle extra de producción"),
});

export const GeneratedScriptSchema = z.object({
  title: z.string().max(12000).describe("Título corto y memorable del guion"),
  avatar: z.string().max(12000).describe("A quién le habla este video, en una frase"),
  focus: z.string().max(12000).describe("Enfoque de venta o de entretenimiento, en una frase"),
  hook: z.string().max(12000).describe("El gancho de los primeros 3 segundos, resumido"),
  cta: z.string().max(12000).describe("Llamado a la acción. Vacío si el video solo entretiene."),
  totalSeconds: z.number().int().min(1).max(690).describe("Duración total estimada en segundos"),
  castNotes: z.string().max(12000).describe("Resumen de cuántas personas se necesitan y de qué perfil"),
  propsSummary: z.array(z.string().max(12000)).max(100).describe("Lista consolidada de TODO lo que hay que conseguir"),
  scenes: z.array(SceneSchema).min(1).max(80).describe("Las escenas en orden, una por beat de la estructura"),
});

export type GeneratedScript = z.infer<typeof GeneratedScriptSchema>;
export type GeneratedScene = z.infer<typeof SceneSchema>;

/**
 * Contrato canónico derivado de Zod. gemini-schema.ts simplifica las
 * restricciones de la copia enviada al proveedor; Zod conserva los límites.
 */
export const GENERATED_SCRIPT_JSON_SCHEMA = z.toJSONSchema(GeneratedScriptSchema);

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

Ningun campo puede faltar. Si algo opcional no aplica, usa "" o [].
El título, cada beat, plano (shot) y acción (action) deben contener texto útil.
En escenas TEXTO, onScreenText es obligatorio; en las demás, voice es obligatorio.
Una escena por beat de la estructura, conservando su nombre y orden. Máximo 80 escenas.
Tiempos enteros en segundos: empieza en 0, continúa sin huecos ni solapamientos y usa endSec > startSec.
totalSeconds debe coincidir con la suma de las escenas. Respeta la duración pedida con tolerancia de 15% (mínimo 3 s).
Ningún tiempo puede superar 690 segundos ni ningún campo de texto 12000 caracteres.`;
