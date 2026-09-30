/**
 * Interruptores de la cadena de entregas por video (mini-spec: cadena-entregas 2026-09-29,
 * con las decisiones del Dueño del 29-30/09/2026).
 *
 *  - PRODUCTION_CHAIN_ENABLED: exactamente "true" la enciende, y además exige
 *    PRODUCTION_FLOW_ENABLED="true". Apagada (o sin valor), todo se comporta como el flujo de
 *    producción de antes: ni ganchos, ni pantallas, ni el barrido miran los pasos nuevos.
 *  - PRODUCTION_CHAIN_BRANDS: canario. Lista de IDs de marca separados por coma o espacio.
 *    Vacía = todas las marcas. Con lista, solo esas marcas usan la cadena; el resto sigue con
 *    el flujo anterior.
 *  - CALENDARIO_PASOS: encendido por defecto (solo "false" lo apaga). Muestra los pasos en el
 *    calendario y «Solo lo mío». Solo actúa con la cadena encendida.
 *  - CALENDAR_FEED_PERSONAL: apagado por defecto (solo "true" lo enciende). ICS por persona;
 *    requiere la migración 20260930091000_calendar_feed_user.
 *
 * Módulo sin dependencias a propósito (como production-flow-flag.ts): lo importan el
 * mantenimiento, el ciclo de vida, las pantallas y las pruebas sin arrastrar Prisma ni la
 * sesión. Se lee process.env en cada llamada, sin caché: apagar en Vercel y volver a
 * desplegar surte efecto en la siguiente petición.
 */

type Env = Record<string, string | undefined>;

/** Flujo y cadena encendidos (sin mirar el canario). Úsalo para decidir si hay algo que leer. */
export function productionChainConfigured(env: Env = process.env): boolean {
  return env.PRODUCTION_FLOW_ENABLED === "true" && env.PRODUCTION_CHAIN_ENABLED === "true";
}

/** Marcas del canario, o null si la cadena vale para todas. */
export function productionChainBrands(env: Env = process.env): string[] | null {
  const list = (env.PRODUCTION_CHAIN_BRANDS ?? "").split(/[\s,]+/).map((id) => id.trim()).filter(Boolean);
  return list.length ? [...new Set(list)] : null;
}

/**
 * ¿La marca usa la cadena? Sin marca y con canario, responde false (conservador): para
 * preguntas globales («¿hay cadena?») usa productionChainConfigured().
 */
export function productionChainEnabled(brandId?: string | null, env: Env = process.env): boolean {
  if (!productionChainConfigured(env)) return false;
  const brands = productionChainBrands(env);
  if (!brands) return true;
  return Boolean(brandId && brands.includes(brandId));
}

/**
 * ¿La interfaz de la cadena aplica a esta persona? Con marca activa: si esa marca usa la cadena.
 * Sin marca activa: el Dueño, con cualquier marca del canario; un miembro, si alguna de sus
 * marcas lo está. Sin canario (todas las marcas), basta con la cadena configurada. Así, con el
 * canario encendido, quien trabaja solo en marcas del flujo anterior no ve «Mi trabajo», ni los
 * textos del «Listo», ni «Solo lo mío» en el calendario.
 */
export function productionChainActiveFor(
  user: { role: string; brandIds?: readonly string[] },
  activeBrandId?: string | null,
  env: Env = process.env,
): boolean {
  if (!productionChainConfigured(env)) return false;
  const brands = productionChainBrands(env);
  if (!brands) return true;
  if (activeBrandId) return brands.includes(activeBrandId);
  if (user.role === "OWNER") return true;
  return (user.brandIds ?? []).some((id) => brands.includes(id));
}

/** Pasos en el calendario y «Solo lo mío»: encendido salvo "false", y solo con la cadena. */
export function calendarStepsEnabled(env: Env = process.env): boolean {
  return productionChainConfigured(env) && env.CALENDARIO_PASOS?.trim().toLowerCase() !== "false";
}

/** ICS por persona (scope USER). Apagado salvo "true"; requiere su migración. */
export function calendarFeedPersonalEnabled(env: Env = process.env): boolean {
  return env.CALENDAR_FEED_PERSONAL === "true";
}
