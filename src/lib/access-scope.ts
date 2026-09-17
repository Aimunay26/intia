import { assertChecklistApproved, assertScriptApproved } from "@/lib/approvals";
import type { Prisma } from "@prisma/client";
import type { AppTransaction } from "@/lib/prisma";
import { allows, assertPermission, capabilityScope, profileGrants, isFinalApproval, type AccessUser, type Capability } from "@/lib/permissions";

const none = { id: { in: [] as string[] } };
export function brandScope(user: AccessUser): Prisma.BrandWhereInput {
  return user.role === "OWNER" ? {} : { id: { in: [...user.brandIds ?? []] } };
}
export function contentScope(user: AccessUser, capability: Capability = "content.view"): Prisma.ContentItemWhereInput {
  if (!allows(user, capability)) return none;
  if (user.role === "OWNER") return {};
  const scopes: Prisma.ContentItemWhereInput[] = profileGrants(user, capability).map(p => p.id === "PUBLISHER"
    ? { checklist: { some: { kind: "FINAL_APPROVAL", done: true } } }
    : p.scope === "assigned" ? { assignments: { some: { userId: user.id } } } : {});
  return { brandId: { in: [...user.brandIds ?? []] }, ...(scopes.some(scope => Object.keys(scope).length === 0) ? {} : { OR: scopes }) };
}
export function scriptScope(user: AccessUser, capability: Capability = "scripts.view"): Prisma.ScriptWhereInput {
  if (!allows(user, capability)) return none;
  if (user.role === "OWNER") return {};
  const brands = { brandId: { in: [...user.brandIds ?? []] } };
  if (capability === "scripts.write") return { ...brands, OR: [{ authorId: user.id }, { content: { some: { assignments: { some: { userId: user.id, role: "GUIONISTA" } } } } }] };
  return { ...brands, ...(capabilityScope(user, capability) === "assigned" ? { content: { some: contentScope(user, capability) } } : {}) };
}
export function taskScope(user: AccessUser, capability: Capability = "tasks.view"): Prisma.TaskWhereInput {
  if (!allows(user, capability)) return none;
  if (user.role === "OWNER") return {};
  return { OR: [{ brandId: { in: [...user.brandIds ?? []] }, ...(capabilityScope(user, capability) === "assigned" || !allows(user, "tasks.manage") ? { assigneeId: user.id } : {}) }, { brandId: null, assigneeId: user.id }] };
}
export function eventScope(user: AccessUser): Prisma.CalendarEventWhereInput {
  if (!allows(user, "calendar.view")) return none;
  if (user.role === "OWNER") return {};
  return { OR: [
    { brandId: { in: [...user.brandIds ?? []] }, ...(capabilityScope(user, "calendar.view") === "assigned" ? { OR: [{ contentItem: contentScope(user) }, { createdById: user.id }] } : {}) },
    { brandId: null, createdById: user.id },
  ] };
}
export function archetypeScope(user: AccessUser): Prisma.ArchetypeWhereInput {
  if (!allows(user, "archetypes.view")) return none;
  if (user.role === "OWNER" || capabilityScope(user, "archetypes.view") === "brand") return {};
  return user.archetypeId ? { id: user.archetypeId } : none;
}
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
