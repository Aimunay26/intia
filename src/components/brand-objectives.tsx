import { ObjectivesPanel } from "@/app/(app)/marcas/[id]/objectives";
import { readBrandObjectives } from "@/lib/objective-service";
import { allows, type AccessUser } from "@/lib/permissions";
export async function BrandObjectives({ user, brandId }: { user: AccessUser; brandId: string }) {
  if (!allows(user, "metrics.view")) return null;
  return <ObjectivesPanel brandId={brandId} objectives={await readBrandObjectives(user, brandId)} canEdit={allows(user, "brands.edit")} canDelete={user.role === "OWNER"} />;
}
