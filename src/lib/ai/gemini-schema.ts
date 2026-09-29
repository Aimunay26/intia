import { GENERATED_SCRIPT_JSON_SCHEMA } from "@/lib/ai/schema";

/**
 * Gemini compila el esquema para restringir la salida. Los límites numéricos
 * y de tamaño siguen en Zod y en el prompt; enviarlos en cada lista anidada
 * aumenta la complejidad del esquema sin reemplazar la validación del servidor.
 * Conservamos todos los campos, tipos, enums y campos obligatorios.
 */
const localConstraints = new Set([
  "$schema", "additionalProperties", "minLength", "maxLength",
  "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum",
  "minItems", "maxItems",
]);
/** Lo único que se quitaba antes: lo que el dialecto de Gemini no acepta. */
const unsupportedOnly = new Set(["$schema", "additionalProperties"]);

function withoutKeys(node: unknown, keys: ReadonlySet<string>): unknown {
  if (Array.isArray(node)) return node.map(item => withoutKeys(item, keys));
  if (!node || typeof node !== "object") return node;
  return Object.fromEntries(Object.entries(node).flatMap(([key, value]) => {
    if (keys.has(key)) return [];
    // Los nombres de propiedades son datos, no palabras clave de JSON Schema.
    if (key === "properties" && value && typeof value === "object") {
      return [[key, Object.fromEntries(Object.entries(value).map(([name, schema]) => [name, withoutKeys(schema, keys)]))]];
    }
    return [[key, withoutKeys(value, keys)]];
  }));
}

export const GEMINI_SCRIPT_SCHEMA = withoutKeys(GENERATED_SCRIPT_JSON_SCHEMA, localConstraints);
/** El esquema anterior, con todos los límites: la reversa del interruptor. */
export const GEMINI_SCRIPT_SCHEMA_WITH_LIMITS = withoutKeys(GENERATED_SCRIPT_JSON_SCHEMA, unsupportedOnly);

/**
 * Kill-switch GEMINI_ESQUEMA_SIMPLE: encendido por defecto. Solo "false" (sin
 * distinguir mayúsculas ni espacios) vuelve a enviar el esquema con límites.
 * La validación local con Zod es la misma en ambos casos.
 */
export function geminiScriptSchema(env: Record<string, string | undefined> = process.env): unknown {
  return env.GEMINI_ESQUEMA_SIMPLE?.trim().toLowerCase() === "false" ? GEMINI_SCRIPT_SCHEMA_WITH_LIMITS : GEMINI_SCRIPT_SCHEMA;
}
