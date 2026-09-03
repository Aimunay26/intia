import { prisma } from "@/lib/prisma";

/**
 * Ajustes de la aplicacion guardados en base de datos.
 *
 * Las claves de IA se resuelven en este orden:
 *   1. Variable de entorno (lo recomendado en produccion / Vercel).
 *   2. Valor guardado desde la pantalla de Ajustes.
 *
 * Asi el equipo puede empezar pegando la clave en la interfaz, y cuando se
 * publique en internet basta con poner la variable de entorno y esa manda.
 */

export const SETTING_KEYS = {
  anthropicKey: "ai.anthropic.apiKey",
  googleKey: "ai.google.apiKey",
  defaultProvider: "ai.defaultProvider",
  defaultAnthropicModel: "ai.anthropic.model",
  defaultGoogleModel: "ai.google.model",
  orgName: "org.name",
} as const;

export async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  return row?.value ?? null;
}

export async function getSettings(keys: string[]): Promise<Record<string, string>> {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: keys } } });
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function setSetting(key: string, value: string) {
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

/** Devuelve la clave del proveedor, y de donde salio. */
export async function resolveApiKey(
  provider: string
): Promise<{ key: string | null; source: "env" | "db" | null }> {
  if (provider === "anthropic") {
    const env = process.env.ANTHROPIC_API_KEY?.trim();
    if (env) return { key: env, source: "env" };
    const db = (await getSetting(SETTING_KEYS.anthropicKey))?.trim();
    return db ? { key: db, source: "db" } : { key: null, source: null };
  }
  if (provider === "google") {
    const env = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim();
    if (env) return { key: env, source: "env" };
    const db = (await getSetting(SETTING_KEYS.googleKey))?.trim();
    return db ? { key: db, source: "db" } : { key: null, source: null };
  }
  return { key: null, source: null };
}

/** Solo para mostrar en la interfaz: nunca devolvemos la clave completa. */
export function maskKey(key: string | null) {
  if (!key) return null;
  if (key.length <= 10) return "••••••";
  return `${key.slice(0, 6)}${"•".repeat(12)}${key.slice(-4)}`;
}

export async function aiStatus() {
  const [anthropic, google] = await Promise.all([
    resolveApiKey("anthropic"),
    resolveApiKey("google"),
  ]);
  return {
    anthropic: {
      configured: Boolean(anthropic.key),
      source: anthropic.source,
      masked: maskKey(anthropic.key),
    },
    google: {
      configured: Boolean(google.key),
      source: google.source,
      masked: maskKey(google.key),
    },
  };
}
