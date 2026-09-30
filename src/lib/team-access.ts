import type { AppTransaction } from "@/lib/prisma";
import { archiveEpoch } from "@/lib/archive-epoch";
import { SecurityError } from "@/lib/auth-transactions";
import { validProfiles } from "@/lib/permissions";

export function parseTeamAccess(form: FormData) {
  if (form.get("accessConfigured") !== "1") return null;
  const requested = form.getAll("profiles").map(String);
  const profiles = validProfiles(requested);
  const brandIds = [...new Set(form.getAll("brandIds").map(String))].sort();
  if (requested.some(p => !profiles.includes(p as typeof profiles[number])) || brandIds.length > 500 || brandIds.some(id => !id || id.length > 100)) throw new SecurityError("Los perfiles o las marcas no son válidos.");
  return { profiles, brandIds };
}

/**
 * Accesos que se conservan aunque el formulario no los traiga. Archivo total (ARCHIVO_TOTAL_DESDE
 * encendido): Equipo no ofrece las marcas archivadas y M0 no toca accesos, así que los de una marca
 * archivada siguen tal cual (además de los keptBrandIds ocultos del formulario). Apagado, no consulta
 * nada y el formulario manda, como antes.
 */
async function archivedAccess(tx: AppTransaction, brandIds: string[]): Promise<string[]> {
  if (!archiveEpoch() || !brandIds.length) return [];
  return (await tx.brand.findMany({ where: { id: { in: brandIds }, archived: true }, select: { id: true } })).map(b => b.id);
}

/** Solo el administrador llama a este servicio, dentro de la transacción autenticada. */
export async function saveTeamAccess(tx: AppTransaction, userId: string, access: ReturnType<typeof parseTeamAccess>) {
  if (!access) return null;
  if (await tx.brand.count({ where: { id: { in: access.brandIds } } }) !== access.brandIds.length) throw new SecurityError("Una marca seleccionada ya no existe.");
  const [previousProfiles, previousBrands] = await Promise.all([
    tx.userWorkProfile.findMany({ where: { userId }, select: { profile: true } }),
    tx.userBrandAccess.findMany({ where: { userId }, select: { brandId: true } }),
  ]);
  const before = { profiles: previousProfiles.map(p => p.profile).sort(), brandIds: previousBrands.map(b => b.brandId).sort() };
  const kept = await archivedAccess(tx, before.brandIds.filter(id => !access.brandIds.includes(id)));
  const after = { profiles: [...access.profiles].sort(), brandIds: kept.length ? [...new Set([...access.brandIds, ...kept])].sort() : access.brandIds };
  if (JSON.stringify(before) === JSON.stringify(after)) return null;
  await tx.userWorkProfile.deleteMany({ where: { userId, profile: { notIn: after.profiles } } });
  await tx.userBrandAccess.deleteMany({ where: { userId, brandId: { notIn: after.brandIds } } });
  await tx.userWorkProfile.createMany({ data: after.profiles.filter(p => !before.profiles.includes(p)).map(profile => ({ userId, profile })), skipDuplicates: true });
  await tx.userBrandAccess.createMany({ data: after.brandIds.filter(b => !before.brandIds.includes(b)).map(brandId => ({ userId, brandId })), skipDuplicates: true });
  return { before, after };
}
