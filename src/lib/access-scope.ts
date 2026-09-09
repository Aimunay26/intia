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
    ? { checklist: { some: { stage: "POSTPRODUCCION", done: true, AND: [{ label: { contains: "final", mode: "insensitive" } }, { label: { contains: "aprobad", mode: "insensitive" } }] } } }
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
  if (user.role !== "OWNER" && capability === "scripts.write" && await db.script.count({ where: { id, status: "APROBADO" } })) throw new Error("Coordinación debe reabrir el guion aprobado antes de editarlo.");
}
export async function assertTaskAccess(db: AppTransaction, user: AccessUser, id: string, capability: Capability = "tasks.work") {
  assertPermission(user, capability);
  if (!await db.task.count({ where: { AND: [{ id }, taskScope(user, capability)] } })) throw new Error("No tienes acceso a esta tarea.");
}

export async function assertVideoOpen(db: AppTransaction, user: AccessUser, id: string) {
  if (user.role === "OWNER") return;
  const checks = await db.checklistItem.findMany({ where: { contentItemId: id, stage: "POSTPRODUCCION", done: true }, select: { label: true, stage: true } });
  if (checks.some(c => isFinalApproval(c.stage, c.label)) || await db.contentItem.count({ where: { id, status: { in: ["PROGRAMADO", "PUBLICADO"] } } })) throw new Error("Coordinación debe retirar la aprobación final y reabrir el video antes de modificarlo.");
}

export async function assertPublishable(db: AppTransaction, user: AccessUser, id: string) {
  if (user.role === "OWNER") return;
  const checks = await db.checklistItem.findMany({ where: { contentItemId: id, stage: "POSTPRODUCCION", done: true }, select: { label: true, stage: true } });
  if (!checks.some(c => isFinalApproval(c.stage, c.label))) throw new Error("Coordinación debe completar la revisión final aprobada antes de publicar.");
}

export async function assertAssignee(db: AppTransaction, id: string, brandId: string | null) {
  if (!await db.user.count({ where: { id, active: true, OR: [{ role: "OWNER" }, ...(brandId ? [{ brandAccess: { some: { brandId } } }] : [])] } })) throw new Error("La persona debe estar activa y autorizada para esta marca.");
}
