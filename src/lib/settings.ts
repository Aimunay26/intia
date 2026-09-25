import { createHash } from "node:crypto";
import { prisma, type AppTransaction } from "@/lib/prisma";
import { isSecretName, SECRET_KEYS } from "@/lib/secret-crypto";
import { readSecret } from "@/lib/secrets";

/**
 * Ajustes de la aplicacion guardados en base de datos.
 *
 * Las claves de IA se resuelven en este orden:
 *   1. Valor guardado desde la pantalla de Ajustes (manda siempre que exista).
 *   2. Variable de entorno del servidor, solo como respaldo cuando no hay
 *      ninguna clave guardada.
 *
 * Asi el dueño puede rotar una clave revocada desde la propia aplicacion sin
 * tocar el panel de Vercel: lo que pega en Ajustes es lo que se usa. Para volver
 * a la variable de entorno basta con quitar la clave guardada.
 */

export type KeySource = "env" | "db";

/** Nombre de la variable de entorno que sirve de respaldo para cada proveedor. */
export const ENV_KEY_NAMES: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  google: "GEMINI_API_KEY",
};

/**
 * Nombre de la variable de entorno de la que sale (o saldría) la clave del
 * proveedor. Para Gemini se acepta también GOOGLE_API_KEY como alias: si es la
 * única definida, hay que nombrarla a ella, que es la que el dueño tendría que
 * rotar en el panel del servidor.
 */
export function envKeyNameFor(provider: string): string | undefined {
  if (provider === "google" && !process.env.GEMINI_API_KEY?.trim() && process.env.GOOGLE_API_KEY?.trim()) {
    return "GOOGLE_API_KEY";
  }
  return ENV_KEY_NAMES[provider];
}

/** Texto corto, en español, del origen de la clave en uso. */
export function describeKeySource(provider: string, source: KeySource | null | undefined): string {
  if (source === "db") return "guardada en Ajustes";
  if (source === "env") {
    return `de la variable de entorno ${envKeyNameFor(provider) ?? "del servidor"} del servidor`;
  }
  return "configurada";
}

export const SETTING_KEYS = {
  anthropicKey: "ai.anthropic.apiKey",
  googleKey: "ai.google.apiKey",
  defaultProvider: "ai.defaultProvider",
  defaultAnthropicModel: "ai.anthropic.model",
  defaultGoogleModel: "ai.google.model",
  orgName: "org.name",
} as const;

export async function getSetting(key: string): Promise<string | null> {
  if (isSecretName(key) || key === "calendar.feedToken") throw new Error("Usa el almacén de secretos.");
  const row = await prisma.appSetting.findUnique({ where: { key } });
  return row?.value ?? null;
}

export async function getSettings(keys: string[], db: AppTransaction = prisma): Promise<Record<string, string>> {
  if (keys.some(key => isSecretName(key) || key === "calendar.feedToken")) throw new Error("Los ajustes ordinarios no incluyen secretos.");
  const rows = await db.appSetting.findMany({ where: { key: { in: keys } } } );
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function getSettingsSnapshot(keys: string[], db: AppTransaction = prisma) {
  const ordinary = keys.filter(key => !isSecretName(key) && key !== "calendar.feedToken");
  const [rows, secrets, legacy] = await Promise.all([
    db.appSetting.findMany({ where: { key: { in: ordinary } }, orderBy: { key: "asc" } }),
    db.appSecret.findMany({ select: { key: true, keyId: true, updatedAt: true }, orderBy: { key: "asc" } }),
    db.appSetting.findMany({ where: { key: { in: [...SECRET_KEYS] } }, select: { key: true, updatedAt: true }, orderBy: { key: "asc" } }),
  ]);
  return { values: Object.fromEntries(rows.map(r => [r.key, r.value])), secretKeys: secrets.map(r => r.key), legacySecretKeys: legacy.map(r => r.key),
    revision: createHash("sha256").update(JSON.stringify([rows, secrets, legacy].map(group => group.map(r => [r.key, r.updatedAt.toISOString()])))).digest("hex") };
}

export async function setSetting(key: string, value: string, db: AppTransaction = prisma) {
  if (isSecretName(key) || key === "calendar.feedToken") throw new Error("Usa el almacén de secretos.");
  await db.appSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

function envKeyFor(provider: string): string | undefined {
  if (provider === "anthropic") return process.env.ANTHROPIC_API_KEY?.trim() || undefined;
  if (provider === "google") {
    // Mismo orden que envKeyNameFor: GEMINI_API_KEY manda; GOOGLE_API_KEY es el alias.
    return (process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim()) || undefined;
  }
  return undefined;
}

function settingKeyFor(provider: string): string | undefined {
  if (provider === "anthropic") return SETTING_KEYS.anthropicKey;
  if (provider === "google") return SETTING_KEYS.googleKey;
  return undefined;
}

/**
 * Devuelve la clave del proveedor y de dónde salió.
 * La guardada en Ajustes manda; la variable de entorno es solo el respaldo.
 */
export async function resolveApiKey(
  provider: string,
): Promise<{ key: string | null; source: KeySource | null }> {
  const settingKey = settingKeyFor(provider);
  if (!settingKey) return { key: null, source: null };

  const db = isSecretName(settingKey) ? (await readSecret(settingKey))?.trim() : null;
  if (db) return { key: db, source: "db" };

  const env = envKeyFor(provider);
  if (env) return { key: env, source: "env" };

  return { key: null, source: null };
}

/** Solo para mostrar en la interfaz: nunca devolvemos la clave completa. */
export function maskKey(key: string | null) {
  if (!key) return null;
  if (key.length <= 10) return "••••••";
  return `${key.slice(0, 6)}${"•".repeat(12)}${key.slice(-4)}`;
}

/** Status checks do not decrypt credentials. */
export async function aiStatus(storedKeys?: string[]) {
  const keys = storedKeys ?? (await prisma.appSecret.findMany({ select: { key: true } })).map(row => row.key);
  const status = (provider: string) => {
    const stored = keys.includes(settingKeyFor(provider) ?? "");
    const env = envKeyFor(provider);
    return { configured: stored || Boolean(env), source: stored ? "db" as const : env ? "env" as const : null,
      masked: stored ? "••••••••••••" : maskKey(env ?? null), envDefined: Boolean(env) };
  };
  return { anthropic: status("anthropic"), google: status("google") };
}
