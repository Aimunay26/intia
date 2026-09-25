import { readSecret } from "@/lib/secrets";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";

/**
 * Entrada con la cuenta de Google (Gmail).
 *
 * Se implementa el flujo OAuth 2.0 a mano, sin librerías: son tres pasos y
 * así no se añade una dependencia más que mantener.
 *
 *   1. Se manda a la persona a Google con un `state` firmado en una cookie.
 *   2. Google la devuelve con un `code`.
 *   3. Se cambia ese `code` por un token y se lee su correo.
 *
 * Regla de seguridad importante: entrar con Google NO crea cuentas. Solo deja
 * pasar a quien ya existe en el equipo y está activo. Si no, cualquiera con
 * un Gmail podría entrar.
 */

export const GOOGLE_SETTING_KEYS = {
  clientId: "auth.google.clientId",
  clientSecret: "auth.google.clientSecret",
} as const;

export const GOOGLE_STATE_COOKIE = "mos_google_state";

export type GoogleConfig = {
  clientId: string;
  clientSecret: string;
  source: "env" | "db";
};

/** Devuelve la configuración de Google, o null si todavía no está puesta. */
export async function getGoogleConfig(): Promise<GoogleConfig | null> {
  const envId = process.env.GOOGLE_CLIENT_ID?.trim();
  const envSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (envId && envSecret) {
    return { clientId: envId, clientSecret: envSecret, source: "env" };
  }

  const [dbId, dbSecret] = await Promise.all([
    getSetting(GOOGLE_SETTING_KEYS.clientId),
    readSecret(GOOGLE_SETTING_KEYS.clientSecret),
  ]);
  if (dbId?.trim() && dbSecret?.trim()) {
    return { clientId: dbId.trim(), clientSecret: dbSecret.trim(), source: "db" };
  }

  return null;
}

export async function googleConfigStatus(settings?: Record<string, string>, storedKeys?: string[]) {
  if (process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim()) return { configured: true, source: "env" as const };
  const id = settings ? settings[GOOGLE_SETTING_KEYS.clientId] : await getSetting(GOOGLE_SETTING_KEYS.clientId);
  const saved = storedKeys ? storedKeys.includes(GOOGLE_SETTING_KEYS.clientSecret) : Boolean(await prisma.appSecret.findUnique({ where: { key: GOOGLE_SETTING_KEYS.clientSecret }, select: { key: true } }));
  return { configured: Boolean(id?.trim() && saved), source: id?.trim() && saved ? "db" as const : null };
}

export async function isGoogleConfigured() { return (await googleConfigStatus()).configured; }

/** La URL que hay que registrar en Google Cloud como "URI de redirección". */
export function redirectUriFor(origin: string) {
  return `${origin.replace(/\/$/, "")}/api/auth/google/callback`;
}

export function buildAuthUrl(config: GoogleConfig, origin: string, state: string) {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUriFor(origin),
    response_type: "code",
    scope: "openid email profile",
    state,
    // Se pide seleccionar cuenta para que se pueda cambiar de Gmail sin
    // tener que cerrar sesión en Google.
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export type GoogleProfile = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture: string | null;
};

/** Cambia el código por un token y devuelve el perfil. Lanza con mensaje claro. */
export async function exchangeCodeForProfile(
  config: GoogleConfig,
  origin: string,
  code: string
): Promise<GoogleProfile> {
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUriFor(origin),
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error(
      `Google rechazó el intercambio del código (${tokenResponse.status}).`
    );
  }

  const token = (await tokenResponse.json()) as { access_token?: string };
  if (!token.access_token) throw new Error("Google no devolvió un token de acceso.");

  const infoResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!infoResponse.ok) {
    throw new Error(`No se pudo leer el perfil de Google (${infoResponse.status}).`);
  }

  const info = (await infoResponse.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };

  if (!info.sub || !info.email) {
    throw new Error("La cuenta de Google no devolvió un correo utilizable.");
  }

  return {
    sub: info.sub,
    email: info.email.toLowerCase(),
    // Solo el booleano verdadero cuenta: un campo ausente o raro es "sin verificar".
    emailVerified: info.email_verified === true,
    name: info.name?.trim() || info.email.split("@")[0],
    picture: info.picture ?? null,
  };
}
