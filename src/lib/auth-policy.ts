import { createHash, timingSafeEqual } from "node:crypto";

export function isStrongSecret(value: string | undefined): value is string {
  return Boolean(value && value.length >= 32 && value.length <= 1024 && value.trim() === value &&
    !/\s/.test(value) && new Set(value).size >= 12 &&
    !/cambia|change.?me|example|placeholder|desarrollo-inseguro|secret.?key/i.test(value));
}

export function equalSecret(actual: string, expected: string) {
  return timingSafeEqual(createHash("sha256").update(actual).digest(), createHash("sha256").update(expected).digest());
}

export function passwordError(value: string): string | null {
  // bcrypt trunca a 72 bytes: no aceptar contraseñas distintas que tengan el mismo prefijo.
  return value.length < 8 || Buffer.byteLength(value, "utf8") > 72
    ? "La contraseña debe tener al menos 8 caracteres y como máximo 72 bytes." : null;
}
