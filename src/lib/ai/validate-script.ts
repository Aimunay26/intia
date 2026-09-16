import { GeneratedScriptSchema, type GeneratedScript } from "@/lib/ai/schema";
import { parseJson } from "@/lib/utils";

export class GeneratedScriptValidationError extends Error {
  constructor(message: string) { super(`El guion necesita revisión: ${message}`); this.name = "GeneratedScriptValidationError"; }
}
const normalized = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Validación determinista. Nunca repara mediante otra llamada de IA. */
export function validateGeneratedScript(value: unknown, target: { durationSec: number; beats: string }): GeneratedScript {
  const parsed = GeneratedScriptSchema.safeParse(value);
  if (!parsed.success) throw new GeneratedScriptValidationError("la respuesta no cumple los límites de campos, tiempos o escenas. No se guardó como terminado.");
  const script = parsed.data;
  const fail = (message: string): never => { throw new GeneratedScriptValidationError(message); };
  if (!script.title.trim()) fail("falta un título.");
  let duration = 0, previousEnd = 0;
  for (const [index, scene] of script.scenes.entries()) {
    const label = `La escena ${index + 1}`;
    if (!scene.beat.trim()) fail(`${label} no identifica su beat.`);
    if (scene.endSec <= scene.startSec || Math.abs(scene.startSec - previousEnd) > 1) fail(`${label} tiene tiempos incoherentes.`);
    if (!scene.shot.trim() || !scene.action.trim()) fail(`${label} necesita plano y acción para poder producirla.`);
    if (scene.voiceType === "TEXTO" ? !scene.onScreenText.trim() : !scene.voice.trim()) fail(`${label} necesita ${scene.voiceType === "TEXTO" ? "texto en pantalla" : "el texto de la voz"}.`);
    duration += Math.round(scene.endSec - scene.startSec);
    previousEnd = scene.endSec;
  }
  const tolerance = Math.max(3, Math.round(target.durationSec * 0.15));
  if (Math.abs(duration - target.durationSec) > tolerance) fail(`la duración de ${duration} s se aleja del objetivo de ${target.durationSec} s (tolerancia ${tolerance} s).`);
  if (Math.abs(script.totalSeconds - duration) > 2) fail("la duración declarada no coincide con sus escenas.");
  const rawBeats = parseJson<unknown>(target.beats, null);
  if (!Array.isArray(rawBeats) || rawBeats.some(b => !b || typeof b.name !== "string" || !b.name.trim())) fail("la estructura tiene beats inválidos; revisa su configuración.");
  const beats = rawBeats as { name: string }[];
  if (beats.length) {
    if (beats.length !== script.scenes.length) fail("no hay una escena por cada beat de la estructura.");
    for (const [index, beat] of beats.entries()) {
      if (!(` ${normalized(script.scenes[index].beat)} `).includes(` ${normalized(beat.name!)} `)) fail(`la escena ${index + 1} no corresponde al beat esperado de la estructura.`);
    }
  }
  return script;
}
