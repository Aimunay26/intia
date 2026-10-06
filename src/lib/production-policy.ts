import type { ChainStep } from "@/lib/constants";

/** La entrega abre una revisión humana; el estado por sí solo no prueba una aprobación. */
export function expectedChainStep(status: string, finalApproved: boolean, delivered: { script?: boolean; master?: boolean } = {}): ChainStep | null {
  if (status === "IDEA" || status === "GUION") return delivered.script ? "REVISION_GUION" : "GUION";
  if (status === "APROBADO" || status === "GRABACION") return "GRABACION";
  if (status === "EDICION") return finalApproved ? "PUBLICACION" : delivered.master ? "REVISION_FINAL" : "EDICION";
  if (status === "PROGRAMADO") return "PUBLICACION";
  return null;
}
