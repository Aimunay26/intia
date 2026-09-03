import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";
import { ROLE_LEVEL } from "@/lib/constants";

export const SESSION_COOKIE = "mos_session";
const DAYS = 30;

function secret() {
  const raw = process.env.AUTH_SECRET;

  if (!raw || raw.length < 16) {
    // En producción NO se degrada: la clave de reserva está escrita en el
    // código, así que cualquiera podría falsificar la sesión del dueño. Vale
    // más que la aplicación no arranque y se vea el error en el despliegue.
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Falta AUTH_SECRET. Define esa variable de entorno con una cadena larga " +
          "y aleatoria (32 caracteres o más) antes de publicar. Sin ella, las " +
          "sesiones se firmarían con una clave pública."
      );
    }
    // En desarrollo sí se deja arrancar, y Ajustes avisa en rojo.
    return new TextEncoder().encode(
      "desarrollo-inseguro-cambia-AUTH_SECRET-en-el-archivo-env"
    );
  }

  return new TextEncoder().encode(raw);
}

export function authSecretIsWeak() {
  const raw = process.env.AUTH_SECRET;
  return !raw || raw.length < 32 || raw.startsWith("cambia-esto");
}

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  color: string;
  archetypeId: string | null;
};

/* --------------------------------------------------------------- HASHING -- */

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string) {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

/* ---------------------------------------------------------------- SESION -- */

export async function createSession(userId: string) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${DAYS}d`)
    .sign(secret());

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DAYS * 24 * 60 * 60,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/**
 * Devuelve el usuario de la sesion, o null.
 * Lee de la base de datos en cada request para que un cambio de rol o una
 * desactivacion tengan efecto inmediato, sin esperar a que expire el token.
 */
export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret());
    const id = typeof payload.sub === "string" ? payload.sub : null;
    if (!id) return null;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        color: true,
        active: true,
        archetypeId: true,
      },
    });
    if (!user || !user.active) return null;

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      color: user.color,
      archetypeId: user.archetypeId,
    };
  } catch {
    return null;
  }
}

/** Igual que getSession, pero manda al login si no hay sesion. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) redirect("/login");
  return user;
}

/**
 * Dos niveles, nada más.
 *   MEMBER  puede crear, editar, mover y asignar.
 *   OWNER   además puede eliminar, gestionar el equipo y tocar los ajustes.
 */
export const LEVEL = {
  MEMBER: 1,
  OWNER: 2,
} as const;

/** Exige un nivel minimo de permisos. Lanza si no alcanza. */
export async function requireLevel(min: number): Promise<SessionUser> {
  const user = await requireUser();
  if ((ROLE_LEVEL[user.role] ?? 0) < min) {
    throw new Error("No tienes permisos para hacer esto.");
  }
  return user;
}

export function can(role: string | undefined, min: number) {
  return (ROLE_LEVEL[role ?? ""] ?? 0) >= min;
}

/* -------------------------------------------------------------------- IP -- */

export async function clientIp(): Promise<string | null> {
  try {
    const h = await headers();
    return (
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null
    );
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------- ARRANQUE -- */

/**
 * True si todavía no hay ninguna cuenta de dueño activa.
 * En ese caso la pantalla de entrada ofrece crear la primera.
 * Se cuentan solo dueños (no cualquier usuario) para que los datos
 * de ejemplo del equipo no bloqueen el alta inicial.
 */
export async function needsBootstrap() {
  const count = await prisma.user.count({ where: { role: "OWNER", active: true } });
  return count === 0;
}
