import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export const SECRET_KEYS = ["ai.anthropic.apiKey", "ai.google.apiKey", "auth.google.clientSecret"] as const;
export type SecretName = typeof SECRET_KEYS[number];
export const isSecretName = (key: string): key is SecretName => (SECRET_KEYS as readonly string[]).includes(key);
export class SecretConfigError extends Error {
  constructor() { super("No se puede acceder al almacén cifrado. Revisa la configuración de cifrado y la migración B22 en el servidor."); this.name = "SecretConfigError"; }
}

function keyRing() {
  try {
    const parsed = JSON.parse(process.env.APP_SECRETS_KEYS ?? "{}");
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error();
    const keys = new Map<string, Buffer>();
    for (const [id, value] of Object.entries(parsed)) {
      if (!/^[a-zA-Z0-9_-]{1,40}$/.test(id) || typeof value !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(value)) throw new Error();
      const bytes = Buffer.from(value, "base64");
      if (bytes.length !== 32 || bytes.toString("base64") !== value) throw new Error();
      keys.set(id, bytes);
    }
    return keys;
  } catch { throw new SecretConfigError(); }
}

/** Master keys live only in the server environment, independently of AUTH_SECRET/DB. */
export function activeEncryptionKey() {
  const id = process.env.APP_SECRETS_ACTIVE_KEY ?? "";
  const key = keyRing().get(id);
  if (!key) throw new SecretConfigError();
  return { id, key };
}

export function encryptSecret(name: SecretName, value: string) {
  if (!isSecretName(name) || !value || value.length > 16384) throw new SecretConfigError();
  const { id: keyId, key } = activeEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  cipher.setAAD(Buffer.from(`intia:secret:v1:${name}:${keyId}`));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { keyId, value: ["v1", iv.toString("base64url"), ciphertext.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(":") };
}

export function decryptSecret(name: SecretName, row: { keyId: string; value: string }): string {
  try {
    if (!isSecretName(name)) throw new Error();
    const key = keyRing().get(row.keyId);
    const parts = row.value.split(":");
    if (!key || parts.length !== 4 || parts[0] !== "v1" || parts.slice(1).some(p => !/^[A-Za-z0-9_-]+$/.test(p))) throw new Error();
    const [iv, ciphertext, tag] = parts.slice(1).map(p => Buffer.from(p, "base64url"));
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length > 65536) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
    decipher.setAAD(Buffer.from(`intia:secret:v1:${name}:${row.keyId}`));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch { throw new SecretConfigError(); }
}
