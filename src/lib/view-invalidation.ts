import { revalidatePath } from "next/cache";

/** Domain changes invalidate lists, cached details and derived dashboards together. */
const affectedViews = {
  script: ["/guiones", "/contenido", "/marcas", "/calendario", "/metricas", "/actividad", "/"],
  content: ["/contenido", "/guiones", "/calendario", "/metricas", "/marcas", "/actividad", "/"],
  metric: ["/metricas", "/contenido", "/marcas", "/actividad", "/"],
  objective: ["/marcas", "/metricas", "/actividad", "/"],
} as const;

/** Call after commit only. Layout scope includes previously visited child records. */
export function invalidateDomain(domain: keyof typeof affectedViews) {
  for (const path of affectedViews[domain]) {
    if (["/guiones", "/contenido", "/marcas"].includes(path)) revalidatePath(path, "layout");
    else revalidatePath(path);
  }
}
