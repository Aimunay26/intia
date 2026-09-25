import { createHash, randomBytes } from "node:crypto";
import { prisma, type AppTransaction } from "@/lib/prisma";

export const CALENDAR_CACHE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
export function calendarToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: createHash("sha256").update(token).digest("hex") };
}
export async function resolveCalendarSubscription(token: string | null, db: AppTransaction = prisma) {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const row = await db.calendarSubscription.findUnique({ where: { tokenHash }, select: {
    id: true, scope: true, brandId: true, expiresAt: true, revokedAt: true,
    createdBy: { select: { active: true, role: true } }, brand: { select: { name: true, active: true } },
  } });
  if (!row || row.revokedAt || row.expiresAt <= new Date() || !row.createdBy.active || row.createdBy.role !== "OWNER") return null;
  if (row.scope === "BRAND" && (!row.brandId || !row.brand?.active)) return null;
  if (row.scope !== "ALL" && row.scope !== "BRAND") return null;
  return row;
}

/** Owner-only caller; raw tokens are never selected, stored or reconstructed. */
export async function listCalendarSubscriptions() {
  const rows = await prisma.calendarSubscription.findMany({
    take: 100, orderBy: [{ revokedAt: { sort: "asc", nulls: "first" } }, { expiresAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    select: { id: true, label: true, scope: true, brand: { select: { name: true } }, expiresAt: true, revokedAt: true, updatedAt: true },
  });
  return rows.map(row => ({ ...row, expiresAt: row.expiresAt.toISOString(), revokedAt: row.revokedAt?.toISOString() ?? null, updatedAt: row.updatedAt.toISOString() }));
}
