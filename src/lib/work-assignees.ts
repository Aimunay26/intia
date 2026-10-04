import type { AppTransaction } from "@/lib/prisma";
import { CHAIN_STEP_RULES, type ChainStep } from "@/lib/constants";
import { allows, type AccessUser, type Capability } from "@/lib/permissions";
import { WorkflowError } from "@/lib/workflow-policy";

/** La asignación no concede permisos: se comprueba la cuenta guardada, no su sesión. */
export const TASK_ASSIGNEE_CAPABILITIES: readonly Capability[] = ["tasks.view", "tasks.work"];
export const TEAM_ROLE_CAPABILITIES: Record<string, readonly Capability[]> = {
  ENCARGADO: ["content.assign", "content.approve", "scripts.approve"],
  GUIONISTA: ["scripts.write"], FILMMAKER: ["content.shoot"], EDITOR: ["content.editing"],
  COMMUNITY: ["content.publish"], DISENADOR: ["content.design"],
};
export const ASSIGNMENT_ROLE_CAPABILITIES: Record<string, readonly Capability[]> = {
  GUIONISTA: ["scripts.view", "scripts.write"], ACTOR: ["scripts.view"], VOZ: ["scripts.view"],
  CAMARA: ["content.shoot"], EDITOR: ["content.editing"], PRODUCCION: ["content.scheduleShoot"],
  DISENO: ["content.design"], COMMUNITY: ["content.publish"],
};

export function stepAssigneeCapabilities(step: string): readonly Capability[] {
  const rule = CHAIN_STEP_RULES[step as ChainStep | "DISENO"];
  if (!rule) throw new WorkflowError("El tipo de paso no admite asignaciones.");
  return step === "REVISION_GUION" ? ["content.view", "scripts.approve", "content.approve"] : ["content.view", rule.capability];
}

export type WorkAssignee = { id: string; name: string; can: (capability: Capability) => boolean };

/** Una marca archivada no recibe trabajo nuevo, tampoco de una cuenta Dueño. */
export async function assertWorkBrand(tx: AppTransaction, brandId: string) {
  const brand = await tx.brand.findUnique({ where: { id: brandId }, select: { archived: true } });
  if (!brand || brand.archived) throw new WorkflowError("Elige una marca vigente para asignar trabajo. Las marcas archivadas conservan su historial.");
}

/** null permite que el reparto automático pruebe el siguiente candidato sin escribir nada. */
export async function findWorkAssignee(tx: AppTransaction, userId: string, brandId: string | null,
  capabilities: readonly Capability[] = []): Promise<WorkAssignee | null> {
  if (brandId) {
    const brand = await tx.brand.findUnique({ where: { id: brandId }, select: { archived: true } });
    if (!brand || brand.archived) return null;
  }
  const row = await tx.user.findFirst({
    where: { id: userId, active: true, ...(brandId ? { OR: [{ role: "OWNER" }, { brandAccess: { some: { brandId } } }] } : {}) },
    select: { id: true, name: true, role: true, workProfiles: { select: { profile: true } },
      brandAccess: { where: { brand: { archived: false } }, select: { brandId: true } } },
  });
  if (!row) return null;
  const access: AccessUser = { id: row.id, role: row.role, profiles: row.workProfiles.map(p => p.profile), brandIds: row.brandAccess.map(b => b.brandId) };
  const can = (capability: Capability) => allows(access, capability);
  if (![...TASK_ASSIGNEE_CAPABILITIES, ...capabilities].every(can)) return null;
  return { id: row.id, name: row.name, can };
}

export async function assertWorkAssignee(tx: AppTransaction, userId: string, brandId: string | null,
  capabilities: readonly Capability[] = []): Promise<WorkAssignee> {
  if (brandId) await assertWorkBrand(tx, brandId);
  const person = await findWorkAssignee(tx, userId, brandId, capabilities);
  if (!person) throw new WorkflowError("La persona debe estar activa, tener acceso a la marca y un perfil que permita consultar y realizar el trabajo asignado. Revisa sus permisos en Equipo.");
  return person;
}
