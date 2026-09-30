import { assertChecklistApproved, assertScriptApproved } from "@/lib/approvals";
import type { Prisma } from "@prisma/client";
import type { AppTransaction } from "@/lib/prisma";
import { allows, assertPermission, capabilityScope, profileGrants, isFinalApproval, type AccessUser, type Capability } from "@/lib/permissions";
import { liveBrand, liveContent, liveEvent, liveScript, liveTask, withLive } from "@/lib/archive-scope";

/*
 * Archivado total (ARCHIVO_TOTAL_DESDE, archive-scope.ts): encendido, cada alcance suma su filtro
 * vivo, también para el Dueño (sin marcas archivadas ni lo personal anterior a la época). Para
 * un miembro es defensa en profundidad: su sesión ya trae brandIds sin las marcas archivadas.
 * Apagado, withLive devuelve el alcance tal cual y las consultas quedan como antes.
 */
const none = { id: { in: [] as string[] } };
export function brandScope(user: AccessUser): Prisma.BrandWhereInput {
  return withLive(user.role === "OWNER" ? {} : { id: { in: [...user.brandIds ?? []] } }, liveBrand());
}
export function contentScope(user: AccessUser, capability: Capability = "content.view"): Prisma.ContentItemWhereInput {
  if (!allows(user, capability)) return none;
  const live = liveContent();
  if (user.role === "OWNER") return live;
  const scopes: Prisma.ContentItemWhereInput[] = profileGrants(user, capability).map(p => p.id === "PUBLISHER"
    ? { checklist: { some: { kind: "FINAL_APPROVAL", done: true } } }
    : p.scope === "assigned" ? { assignments: { some: { userId: user.id } } } : {});
  return withLive({ brandId: { in: [...user.brandIds ?? []] }, ...(scopes.some(scope => Object.keys(scope).length === 0) ? {} : { OR: scopes }) }, live);
}
export function scriptScope(user: AccessUser, capability: Capability = "scripts.view"): Prisma.ScriptWhereInput {
  if (!allows(user, capability)) return none;
  const live = liveScript();
  if (user.role === "OWNER") return live;
  const brands = { brandId: { in: [...user.brandIds ?? []] } };
  if (capability === "scripts.write") return withLive({ ...brands, OR: [{ authorId: user.id }, { content: { some: { assignments: { some: { userId: user.id, role: "GUIONISTA" } } } } }] }, live);
  return withLive({ ...brands, ...(capabilityScope(user, capability) === "assigned" ? { content: { some: contentScope(user, capability) } } : {}) }, live);
}
export function taskScope(user: AccessUser, capability: Capability = "tasks.view"): Prisma.TaskWhereInput {
  if (!allows(user, capability)) return none;
  const live = liveTask();
  if (user.role === "OWNER") return live;
  return withLive({ OR: [{ brandId: { in: [...user.brandIds ?? []] }, ...(capabilityScope(user, capability) === "assigned" || !allows(user, "tasks.manage") ? { assigneeId: user.id } : {}) }, { brandId: null, assigneeId: user.id }] }, live);
}
export function eventScope(user: AccessUser): Prisma.CalendarEventWhereInput {
  if (!allows(user, "calendar.view")) return none;
  const live = liveEvent();
  if (user.role === "OWNER") return live;
  return withLive({ OR: [
    { brandId: { in: [...user.brandIds ?? []] }, ...(capabilityScope(user, "calendar.view") === "assigned" ? { OR: [{ contentItem: contentScope(user) }, { createdById: user.id }] } : {}) },
    { brandId: null, createdById: user.id },
  ] }, live);
}
export function archetypeScope(user: AccessUser): Prisma.ArchetypeWhereInput {
  if (!allows(user, "archetypes.view")) return none;
  if (user.role === "OWNER" || capabilityScope(user, "archetypes.view") === "brand") return {};
  return user.archetypeId ? { id: user.archetypeId } : none;
}
/**
 * GenerationJob no tiene columna de marca hasta M1 (va en payload.brandId), así que su filtro vivo
 * solo existe en SQL (liveJobSql): quien lee trabajos por id o en lista lo aplica además de este
 * alcance (generation-jobs.ts, generation-history.ts). Para un miembro ya basta con brandIds.
 */
export function generationScope(user: AccessUser): Prisma.GenerationJobWhereInput {
  if (!allows(user, "scripts.generate")) return none;
  if (user.role === "OWNER") return {};
  const brandIds = user.brandIds ?? [];
  if (!brandIds.length) return none;
  return { userId: user.id, OR: brandIds.map(brandId => ({ payload: { path: ["brandId"], equals: brandId } })) };
}
export async function assertContentAccess(db: AppTransaction, user: AccessUser, id: string, capability: Capability = "content.view") {
  assertPermission(user, capability);
  if (!await db.contentItem.count({ where: { AND: [{ id }, contentScope(user, capability)] } })) throw new Error("No tienes acceso a este video.");
}
export async function assertScriptAccess(db: AppTransaction, user: AccessUser, id: string, capability: Capability = "scripts.view") {
  assertPermission(user, capability);
  if (!await db.script.count({ where: { AND: [{ id }, scriptScope(user, capability)] } })) throw new Error("No tienes acceso a este guion.");
  if (user.role !== "OWNER" && capability === "scripts.write" && await db.script.count({ where: { id, status: { in: ["APROBADO", "GRABADO"] } } })) throw new Error("Coordinación debe reabrir el guion aprobado antes de editarlo.");
  if (capability === "scripts.write" && user.role !== "OWNER") {
    await db.$queryRaw`SELECT id FROM "Script" WHERE id = ${id} FOR UPDATE`;
    const videos = await db.contentItem.findMany({ where: { scriptId: id }, select: { id: true }, orderBy: { id: "asc" } });
    for (const video of videos) await assertVideoOpen(db, user, video.id);
  }
}
export async function assertTaskAccess(db: AppTransaction, user: AccessUser, id: string, capability: Capability = "tasks.work") {
  assertPermission(user, capability);
  if (!await db.task.count({ where: { AND: [{ id }, taskScope(user, capability)] } })) throw new Error("No tienes acceso a esta tarea.");
}

/** Compartido por aprobación y escrituras. Orden de locks: guion, después video. */
export async function lockVideoLifecycle(db: AppTransaction, id: string) {
  const before = await db.contentItem.findUnique({ where: { id }, select: { scriptId: true } });
  if (before?.scriptId) await db.$queryRaw`SELECT id FROM "Script" WHERE id = ${before.scriptId} FOR UPDATE`;
  const rows = await db.$queryRaw<{ scriptId: string | null }[]>`SELECT "scriptId" FROM "ContentItem" WHERE id = ${id} FOR UPDATE`;
  if (!rows.length || rows[0].scriptId !== before?.scriptId) throw new Error("El video cambió. Recarga la página antes de continuar.");
}

export const closedVideoWhere: Prisma.ContentItemWhereInput = { OR: [
  { status: { in: ["PROGRAMADO", "PUBLICADO"] } },
  { checklist: { some: { kind: "FINAL_APPROVAL", done: true } } },
] };

export async function assertVideoOpen(db: AppTransaction, user: AccessUser, id: string) {
  await lockVideoLifecycle(db, id);
  if (user.role === "OWNER") return;
  const checks = await db.checklistItem.findMany({ where: { contentItemId: id, kind: "FINAL_APPROVAL", done: true }, select: { kind: true } });
  if (checks.some(c => isFinalApproval(c.kind)) || await db.contentItem.count({ where: { id, status: { in: ["PROGRAMADO", "PUBLICADO"] } } })) throw new Error("Coordinación debe retirar la aprobación final y reabrir el video antes de modificarlo.");
}

export async function assertPublishable(db: AppTransaction, _user: AccessUser, id: string) {
  const video = await db.contentItem.findUniqueOrThrow({ where: { id }, select: { scriptId: true } });
  await assertScriptApproved(db, video.scriptId);
  await assertChecklistApproved(db, id, "SCRIPT_APPROVAL");
  await assertChecklistApproved(db, id, "FINAL_APPROVAL");
}

export async function assertAssignee(db: AppTransaction, id: string, brandId: string | null) {
  if (!await db.user.count({ where: { id, active: true, OR: [{ role: "OWNER" }, ...(brandId ? [{ brandAccess: { some: { brandId } } }] : [])] } })) throw new Error("La persona debe estar activa y autorizada para esta marca.");
}
