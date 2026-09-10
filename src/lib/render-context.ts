import { cache } from "react";

import { requireUser } from "@/lib/auth";
import { getBrandContext } from "@/lib/brand-context";
import { measurePhase } from "@/lib/performance";
import { redirect } from "next/navigation";
import { canAccessSection, type Section } from "@/lib/permissions";

// Solo para Server Components: comparte lecturas dentro de una petición.
// Acciones y rutas API siguen usando los helpers originales, con lecturas frescas.
export const requirePageUser = cache(() => measurePhase("session", requireUser));
export const getPageBrandContext = cache(async () => {
  const user = await requirePageUser();
  return measurePhase("brand-context", () => getBrandContext(user));
});
export async function requirePageSection(section: Section) {
  const user = await requirePageUser();
  if (!canAccessSection(user, section)) redirect("/sin-acceso");
  return user;
}
