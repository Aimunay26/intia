import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { archiveEpoch, liveBrandSql } from "@/lib/archive-scope";
import { isStrongSecret, passwordError } from "@/lib/auth-policy";
import { BOOTSTRAP_COMPLETE, withAuthLock } from "@/lib/auth-transactions";

import { prisma } from "@/lib/prisma";
import { ROLE_LEVEL } from "@/lib/constants";
import { assertPermission, type Capability } from "@/lib/permissions";

export const SESSION_COOKIE = "mos_session";
const DAYS = 30;

/**
 * Describe lo que el servidor ve en AUTH_SECRET, SIN revelar el valor.
 *
 * Existe porque el mensaje "falta AUTH_SECRET" es ambiguo: no distingue entre
 * la variable ausente, vacía, con espacios pegados o demasiado corta, y cada
 * una se arregla de forma distinta. Solo se emiten longitudes y booleanos.
 */
function diagnosticoDelSecreto(donde: string): string {
  const raw = process.env.AUTH_SECRET;
  const partes = [
    `origen=${donde}`,
    `definida=${raw !== undefined}`,
    `longitud=${raw?.length ?? 0}`,
    `soloEspacios=${raw !== undefined && raw.trim().length === 0}`,
    `espaciosAlBorde=${raw !== undefined && raw !== raw.trim()}`,
    `entorno=${process.env.NODE_ENV}`,
    `vercelEnv=${process.env.VERCEL_ENV ?? "(ninguno)"}`,
    // Si estas dos faltan también, el problema no es AUTH_SECRET en concreto:
    // es que a esta función no le está llegando NINGUNA variable del proyecto.
    `hayDatabaseUrl=${Boolean(process.env.DATABASE_URL)}`,
    `numeroDeVariables=${Object.keys(process.env).length}`,
  ];
  return partes.join(" ");
}

function secret(donde = "sin-especificar") {
  const raw = process.env.AUTH_SECRET;

  if (!isStrongSecret(raw)) {
    // En producción NO se degrada: la clave de reserva está escrita en el
    // código, así que cualquiera podría falsificar la sesión del dueño. Vale
    // más que la aplicación no arranque y se vea el error en el despliegue.
    if (process.env.NODE_ENV === "production") {
      // Al log del servidor, para poder diagnosticarlo sin adivinar.
      console.error("[auth] AUTH_SECRET no utilizable —", diagnosticoDelSecreto(donde));
      throw new Error(
        "Falta AUTH_SECRET. Define esa variable de entorno con una cadena larga " +
          "y aleatoria (32 caracteres o más) antes de publicar. Sin ella, las " +
          "sesiones se firmarían con una clave pública. " +
          `[${diagnosticoDelSecreto(donde)}]`
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
  return !isStrongSecret(process.env.AUTH_SECRET);
}

export function authSecretBytes() { return secret("control-acceso"); }

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  color: string;
  archetypeId: string | null;
  sessionVersion?: number;
  profiles?: string[];
  brandIds?: string[];
};

/* --------------------------------------------------------------- HASHING -- */

export async function hashPassword(plain: string) {
  const error = passwordError(plain);
  if (error) throw new Error(error);
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

export async function createSession(userId: string, expectedVersion: number) {
  const sessionId = randomBytes(32).toString("hex");
  const id = createHash("sha256").update(sessionId).digest("hex");
  const expiresAt = new Date(Date.now() + DAYS * 86400_000);
  const key = secret("crear-sesion");
  await withAuthLock(async tx => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { active: true, sessionVersion: true } });
    if (!user?.active || user.sessionVersion !== expectedVersion) throw new Error("El acceso cambió. Vuelve a iniciar sesión.");
    await tx.authSession.create({ data: { id, userId, expiresAt } });
    await tx.$executeRaw`DELETE FROM "AuthSession" WHERE "id" IN (SELECT "id" FROM "AuthSession" WHERE "expiresAt" < CURRENT_TIMESTAMP LIMIT 100)`;
  });
  const token = await new SignJWT({ sub: userId, sv: expectedVersion })
    .setJti(sessionId)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${DAYS}d`)
    .sign(key);

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
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, secret("cerrar-sesion"), { algorithms: ["HS256"] });
      if (typeof payload.jti === "string") {
        await prisma.authSession.deleteMany({ where: { id: createHash("sha256").update(payload.jti).digest("hex") } });
      }
    } catch (error) {
      // Un JWT inválido se descarta; un fallo de DB no debe aparentar una revocación correcta.
      if (!(error instanceof Error && (error.name.startsWith("JWT") || error.name.startsWith("JWS") || error.name.startsWith("JOSE")))) throw error;
    }
  }
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
    const { payload } = await jwtVerify(token, secret("leer-sesion"), { algorithms: ["HS256"] });
    const id = typeof payload.sub === "string" ? payload.sub : null;
    if (!id || typeof payload.jti !== "string" || !Number.isInteger(payload.sv)) return null;

    // Archivado total (ARCHIVO_TOTAL_DESDE): encendido, brandIds trae solo las marcas vivas; los
    // accesos a marcas archivadas siguen en la base, sin tocar. Apagado, la consulta es la de antes.
    const epoch = archiveEpoch();
    const liveAccess = epoch ? Prisma.sql`AND ${liveBrandSql('b."brandId"', { epoch })}` : Prisma.empty;
    // Una sola consulta para sesión, revocación, versión y permisos frescos.
    const [user] = await prisma.$queryRaw<(SessionUser & { sessionVersion: number })[]>`
      SELECT u."id", u."name", u."email", u."role", u."color", u."archetypeId", u."sessionVersion",
        ARRAY(SELECT p.profile FROM "UserWorkProfile" p WHERE p."userId"=u.id ORDER BY p.profile) AS profiles,
        ARRAY(SELECT b."brandId" FROM "UserBrandAccess" b WHERE b."userId"=u.id ${liveAccess} ORDER BY b."brandId") AS "brandIds"
      FROM "AuthSession" s JOIN "User" u ON u."id" = s."userId"
      WHERE s."id" = ${createHash("sha256").update(payload.jti).digest("hex")}
        AND u."id" = ${id} AND u."active" = true AND u."sessionVersion" = ${payload.sv}
        AND s."expiresAt" > CURRENT_TIMESTAMP`;
    if (!user || !["OWNER", "MEMBER"].includes(user.role)) return null;

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      color: user.color,
      archetypeId: user.archetypeId,
      sessionVersion: user.sessionVersion,
      profiles: user.profiles ?? [],
      brandIds: user.brandIds ?? [],
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

/** Acciones/API: consulta sesión y permisos actuales, sin caché entre peticiones. */
export async function requirePermission(capability: Capability): Promise<SessionUser> {
  const user = await requireUser();
  assertPermission(user, capability);
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
 * El alta solo se ofrece con clave de instalación, sin marcador de cierre
 * y sin ningún dueño (incluidos los inactivos). No se reabre por una baja.
 */
export async function needsBootstrap() {
  if (!isStrongSecret(process.env.BOOTSTRAP_TOKEN)) return false;
  const [marker, count] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: BOOTSTRAP_COMPLETE }, select: { key: true } }),
    prisma.user.count({ where: { role: "OWNER" } }),
  ]);
  return !marker && count === 0;
}
