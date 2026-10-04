import { BrandTeamPanel } from "@/app/(app)/marcas/[id]/team";
import { prisma } from "@/lib/prisma";
import { allows, type AccessUser } from "@/lib/permissions";
import { productionFlowEnabled } from "@/lib/production-flow-flag";
import { roleOrderEnabled } from "@/lib/role-order-flag";
import { parseRecordingWeekdays } from "@/lib/working-days";

/**
 * Equipo de producción de la marca, para la ficha del Dueño y la de los miembros.
 * Preparar el equipo no requiere activar las automatizaciones.
 * Quien llama ya autorizó la marca; aquí se repite la comprobación por si acaso.
 */
export async function BrandTeam({ user, brandId }: { user: AccessUser; brandId: string }) {
  if (!allows(user, "brands.view")) return null;
  if (user.role !== "OWNER" && !user.brandIds?.includes(brandId)) return null;

  const [members, settings, available, brand] = await Promise.all([
    prisma.brandTeamMember.findMany({ where: { brandId }, select: { role: true, userId: true } }),
    prisma.brandProductionSettings.findUnique({ where: { brandId }, select: { recordingWeekdays: true, autoAssign: true, updatedAt: true } }),
    prisma.user.findMany({
      where: { active: true, OR: [{ role: "OWNER" }, { brandAccess: { some: { brandId } } }] },
      select: { id: true, name: true, role: true, workProfiles: { select: { profile: true } } },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
    prisma.brand.findUnique({ where: { id: brandId }, select: { archived: true } }),
  ]);
  // Quien quedó en el equipo pero perdió el acceso o fue desactivado se muestra aparte, sin poder elegirse.
  const missingIds = members.map((m) => m.userId).filter((id) => !available.some((p) => p.id === id));
  const missing = missingIds.length ? await prisma.user.findMany({ where: { id: { in: missingIds } }, select: { id: true, name: true } }) : [];

  return (
    <BrandTeamPanel
      brandId={brandId}
      canEdit={Boolean(brand && !brand.archived && allows(user, "brands.edit"))}
      productionEnabled={productionFlowEnabled()}
      revision={settings?.updatedAt.toISOString() ?? "new"}
      team={Object.fromEntries(members.map((m) => [m.role, m.userId]))}
      weekdays={parseRecordingWeekdays(settings?.recordingWeekdays)}
      autoAssign={settings?.autoAssign ?? true}
      roleOrder={roleOrderEnabled()}
      people={[
        ...available.map((p) => ({ id: p.id, name: p.name, owner: p.role === "OWNER", profiles: p.workProfiles.map((w) => w.profile), available: true })),
        ...missing.map((p) => ({ id: p.id, name: p.name, owner: false, profiles: [], available: false })),
      ]}
    />
  );
}
