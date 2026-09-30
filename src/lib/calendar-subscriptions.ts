import { createHash, randomBytes } from "node:crypto";
import { archiveEpoch } from "@/lib/archive-scope";
import type { AccessUser } from "@/lib/permissions";
import { prisma, type AppTransaction } from "@/lib/prisma";
import { calendarFeedPersonalEnabled } from "@/lib/production-chain-flag";

export const CALENDAR_CACHE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
/** Alcances que gestiona el Dueño desde Ajustes. USER es el feed personal de cada persona (Mi perfil). */
export const OWNER_SCOPES = ["ALL", "BRAND"];
export function calendarToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: createHash("sha256").update(token).digest("hex") };
}

/**
 * Resuelve el token de una descarga. ALL y BRAND: solo si los creó un Dueño activo (y la
 * marca sigue activa). USER (CALENDAR_FEED_PERSONAL): la persona dueña del feed debe estar
 * activa; sus perfiles y marcas se leen aquí, en cada descarga, así que perder una marca o un
 * perfil quita sus fechas en la siguiente lectura. Con el interruptor apagado, USER no resuelve.
 * Archivado total (ARCHIVO_TOTAL_DESDE encendido): las marcas de la persona se leen sin las
 * archivadas, igual que la sesión. Un enlace BRAND de una marca archivada ya no resuelve porque
 * archivar deja la marca inactiva.
 */
export async function resolveCalendarSubscription(token: string | null, db: AppTransaction = prisma) {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const epoch = archiveEpoch();
  const row = await db.calendarSubscription.findUnique({ where: { tokenHash }, select: {
    id: true, scope: true, brandId: true, expiresAt: true, revokedAt: true,
    createdBy: { select: { id: true, active: true, role: true, workProfiles: { select: { profile: true } }, brandAccess: { ...(epoch ? { where: { brand: { archived: false } } } : {}), select: { brandId: true } } } },
    brand: { select: { name: true, active: true } },
  } });
  if (!row || row.revokedAt || row.expiresAt <= new Date() || !row.createdBy.active) return null;
  const { createdBy, ...subscription } = row;
  if (row.scope === "USER") {
    if (!calendarFeedPersonalEnabled() || row.brandId || !["OWNER", "MEMBER"].includes(createdBy.role)) return null;
    const person: AccessUser = {
      id: createdBy.id,
      role: createdBy.role,
      profiles: createdBy.workProfiles.map((p) => p.profile),
      brandIds: createdBy.brandAccess.map((b) => b.brandId),
    };
    return { ...subscription, createdBy: { active: createdBy.active, role: createdBy.role }, person };
  }
  if (createdBy.role !== "OWNER") return null;
  if (row.scope === "BRAND" && (!row.brandId || !row.brand?.active)) return null;
  if (row.scope !== "ALL" && row.scope !== "BRAND") return null;
  return { ...subscription, createdBy: { active: createdBy.active, role: createdBy.role }, person: null };
}

/** Owner-only caller; raw tokens are never selected, stored or reconstructed. Personal feeds are not listed. */
export async function listCalendarSubscriptions() {
  const rows = await prisma.calendarSubscription.findMany({
    where: { scope: { in: OWNER_SCOPES } },
    take: 100, orderBy: [{ revokedAt: { sort: "asc", nulls: "first" } }, { expiresAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    select: { id: true, label: true, scope: true, brand: { select: { name: true } }, expiresAt: true, revokedAt: true, updatedAt: true },
  });
  return rows.map(row => ({ ...row, expiresAt: row.expiresAt.toISOString(), revokedAt: row.revokedAt?.toISOString() ?? null, updatedAt: row.updatedAt.toISOString() }));
}

/**
 * Feeds personales vigentes (scope USER, sin revocar) para que el Dueño pueda cortarlos por
 * persona desde Ajustes (solo revocar: renovarlo lo pasaría a su nombre). Sin token.
 */
export async function listPersonalCalendarSubscriptions(now: Date = new Date()) {
  const rows = await prisma.calendarSubscription.findMany({
    where: { scope: "USER", revokedAt: null },
    take: 200,
    orderBy: [{ expiresAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    select: { id: true, expiresAt: true, updatedAt: true, createdBy: { select: { name: true, active: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    person: row.createdBy.name,
    personActive: row.createdBy.active,
    expiresAt: row.expiresAt.toISOString(),
    expired: row.expiresAt <= now,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export type PersonalCalendarRow = { id: string; expiresAt: string; updatedAt: string; expired: boolean } | null;

/** El feed personal vigente (no revocado) de una persona, sin token. Para Mi perfil. */
export async function personalCalendarSubscription(userId: string, now: Date = new Date()): Promise<PersonalCalendarRow> {
  const row = await prisma.calendarSubscription.findFirst({
    where: { scope: "USER", createdById: userId, revokedAt: null },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, expiresAt: true, updatedAt: true },
  });
  return row ? { id: row.id, expiresAt: row.expiresAt.toISOString(), updatedAt: row.updatedAt.toISOString(), expired: row.expiresAt <= now } : null;
}
