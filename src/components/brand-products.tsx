import { ProductsPanel } from "@/app/(app)/marcas/[id]/products";
import { brandDominantKind, productCatalogEnabled, readBrandCatalog } from "@/lib/product-catalog";
import { allows, type AccessUser } from "@/lib/permissions";

/** Catálogo de productos y combos en la ficha de marca de un miembro. Apagado el flag, no consulta nada. */
export async function BrandProducts({ user, brandId }: { user: AccessUser; brandId: string }) {
  if (!productCatalogEnabled() || !allows(user, "brands.view")) return null;
  const catalog = await readBrandCatalog(user, brandId);
  return <ProductsPanel brandId={brandId} catalog={catalog} canEdit={allows(user, "brands.edit")} canDelete={user.role === "OWNER"} defaultKind={brandDominantKind(catalog.products) ?? "PRODUCTO"} />;
}
