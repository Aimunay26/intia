import type { AppTransaction } from "@/lib/prisma";
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

/** Solo el administrador llama a este servicio, dentro de la transacción autenticada. */
export async function saveTeamAccess(tx: AppTransaction, userId: string, access: ReturnType<typeof parseTeamAccess>) {
  if (!access) return null;
  if (await tx.brand.count({ where: { id: { in: access.brandIds } } }) !== access.brandIds.length) throw new SecurityError("Una marca seleccionada ya no existe.");
  const [previousProfiles, previousBrands] = await Promise.all([
    tx.userWorkProfile.findMany({ where: { userId }, select: { profile: true } }),
    tx.userBrandAccess.findMany({ where: { userId }, select: { brandId: true } }),
  ]);
  const before = { profiles: previousProfiles.map(p => p.profile).sort(), brandIds: previousBrands.map(b => b.brandId).sort() };
  const after = { profiles: [...access.profiles].sort(), brandIds: access.brandIds };
  if (JSON.stringify(before) === JSON.stringify(after)) return null;
  await tx.userWorkProfile.deleteMany({ where: { userId, profile: { notIn: after.profiles } } });
  await tx.userBrandAccess.deleteMany({ where: { userId, brandId: { notIn: after.brandIds } } });
  await tx.userWorkProfile.createMany({ data: after.profiles.filter(p => !before.profiles.includes(p)).map(profile => ({ userId, profile })), skipDuplicates: true });
  await tx.userBrandAccess.createMany({ data: after.brandIds.filter(b => !before.brandIds.includes(b)).map(brandId => ({ userId, brandId })), skipDuplicates: true });
  return { before, after };
}
