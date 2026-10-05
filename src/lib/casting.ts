import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { AppTransaction } from "@/lib/prisma";
import { dateKey, instantInZone } from "@/lib/utils";
import { WorkflowError } from "@/lib/workflow-policy";

export const castingInclude = {
  script: { include: { scenes: { orderBy: [{ order: "asc" }, { id: "asc" }] } } },
  castRoles: { include: { user: { select: { id: true, name: true, active: true, role: true, workProfiles: { select: { profile: true } }, brandAccess: { select: { brandId: true } } } } }, orderBy: { slotKey: "asc" } },
} satisfies Prisma.ContentItemInclude;
export type CastingVideo = Prisma.ContentItemGetPayload<{ include: typeof castingInclude }>;
export type RoleSlot = { slotKey: string; sceneId: string; role: string; archetype: string; notes: string; sceneOrder: number };
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function scriptRoles(video: CastingVideo): RoleSlot[] {
  return (video.script?.scenes ?? []).flatMap(scene => {
    let actors: unknown;
    try { actors = JSON.parse(scene.actors); } catch { return []; }
    if (!Array.isArray(actors)) return [];
    return actors.flatMap((actor, index) => {
      if (!actor || typeof actor.role !== "string" || !actor.role.trim()) return [];
      return [{ slotKey: `${scene.id}:${index}`, sceneId: scene.id, role: actor.role.trim(),
        archetype: typeof actor.archetype === "string" ? actor.archetype.trim() : "",
        notes: typeof actor.notes === "string" ? actor.notes.trim() : "", sceneOrder: scene.order }];
    });
  });
}

/** Both the displayed script and the session are signed; scene edits cannot reuse a response. */
export function castingToken(video: CastingVideo) {
  return hash({ script: video.script, shootDate: video.shootDate, start: video.shootStartMinute,
    end: video.shootEndMinute, revision: video.castingRevision });
}
export function roleCurrent(role: CastingVideo["castRoles"][number], video: CastingVideo) {
  const slot = scriptRoles(video).find(s => s.slotKey === role.slotKey);
  return !!slot && slot.role === role.role && slot.archetype === role.archetype && slot.notes === role.notes;
}
export function eligibleActor(user: NonNullable<CastingVideo["castRoles"][number]["user"]>, brandId: string) {
  return user.active && (user.role === "OWNER" || (user.workProfiles.some(p => p.profile === "TALENT") && user.brandAccess.some(b => b.brandId === brandId)));
}
export function roleConfirmed(role: CastingVideo["castRoles"][number], video: CastingVideo) {
  return roleCurrent(role, video) && role.response === "CONFIRMADO" && role.confirmedToken === castingToken(video)
    && !!role.user && eligibleActor(role.user, video.brandId);
}
export const minuteText = (minute: number | null) => minute === null ? "" : `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
export function parseMinute(value: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new WorkflowError("Indica una hora válida.");
  const [h, m] = value.split(":").map(Number); return h * 60 + m;
}
export function recordingInterval(video: Pick<CastingVideo, "shootDate" | "shootStartMinute" | "shootEndMinute">) {
  if (!video.shootDate || video.shootStartMinute === null || video.shootEndMinute === null || video.shootEndMinute <= video.shootStartMinute) return null;
  return { startAt: instantInZone(dateKey(video.shootDate), minuteText(video.shootStartMinute)), endAt: instantInZone(dateKey(video.shootDate), minuteText(video.shootEndMinute)) };
}

/** Returns no titles, names or brand data from other productions. Adjacent intervals do not overlap. */
export async function actorConflict(db: AppTransaction, userId: string, video: CastingVideo) {
  const interval = recordingInterval(video);
  if (!interval) return "Falta definir el horario de grabación";
  if (await db.actorUnavailability.count({ where: { userId, startAt: { lt: interval.endAt }, endAt: { gt: interval.startAt } } })) return "No disponible en este horario";
  const others = await db.contentItem.findMany({ where: { id: { not: video.id }, shootDate: video.shootDate,
    status: { notIn: ["CANCELADO", "PUBLICADO"] }, brand: { archived: false }, castRoles: { some: { userId, response: "CONFIRMADO" } } }, include: castingInclude });
  for (const other of others) {
    const range = recordingInterval(other);
    if (range && range.startAt < interval.endAt && range.endAt > interval.startAt && other.castRoles.some(r => r.userId === userId && roleConfirmed(r, other))) return "Coincide con otra grabación confirmada";
  }
  return null;
}

/** Only scripts with declared roles use the new gate. Existing scripts without actors retain their checklist. */
export async function assertCastingReady(db: AppTransaction, videoId: string) {
  const video = await db.contentItem.findUniqueOrThrow({ where: { id: videoId }, include: castingInclude });
  const slots = scriptRoles(video);
  if (!slots.length && !video.castRoles.length) return;
  if (!recordingInterval(video)) throw new WorkflowError("Define fecha y horario de grabación para confirmar el reparto.");
  if (video.castRoles.length !== slots.length || slots.some(s => !video.castRoles.some(r => r.slotKey === s.slotKey && roleConfirmed(r, video)))) {
    throw new WorkflowError("Completa el reparto: todos los papeles deben estar asignados y confirmados para este guion y horario.");
  }
  for (const userId of [...new Set(video.castRoles.map(r => r.userId!))].sort()) {
    const conflict = await actorConflict(db, userId, video);
    if (conflict) throw new WorkflowError(`Revisa la disponibilidad del reparto: ${conflict.toLowerCase()}.`);
  }
}

export function actorRecommendation(archetype: { id: string; name: string; archetypePrimary: string | null; archetypeSecondary: string | null; strengths: string; avoid: string; fits: { score: number; source: string; notes: string | null }[] } | null,
  role: Pick<RoleSlot, "archetype">, scriptArchetypeId: string | null) {
  if (!archetype) return { rank: -1, reasons: ["Sin perfil de actuación: selección manual"] };
  const reasons = [`Perfil: ${archetype.name}`];
  let rank = 0;
  const fit = archetype.fits.find(f => f.source === "MANO");
  if (fit) { rank += fit.score; reasons.push(`Criterio humano del formato: ${["no encaja", "encaje bajo", "adecuado", "encaje alto"][fit.score] ?? fit.score}${fit.notes ? ` — ${fit.notes}` : ""}`); }
  else reasons.push("Sin valoración humana del formato");
  const normalize = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  if (role.archetype && [archetype.name, archetype.archetypePrimary, archetype.archetypeSecondary].some(v => v && normalize(v) === normalize(role.archetype))) { rank += 2; reasons.push(`Coincide con el perfil pedido: ${role.archetype}`); }
  if (archetype.id === scriptArchetypeId) { rank++; reasons.push("Perfil de actuación usado al escribir el guion"); }
  for (const [label, json] of [["Fortalezas", archetype.strengths], ["Evitar", archetype.avoid]]) {
    try { const list: unknown = JSON.parse(json); if (Array.isArray(list) && list.length) reasons.push(`${label}: ${list.filter(x => typeof x === "string").slice(0, 5).join(", ")}`); } catch { /* Invalid legacy lists do not become recommendations. */ }
  }
  return { rank, reasons };
}
