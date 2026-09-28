import { notFound } from "next/navigation";

import { manualEnabled } from "@/lib/manual";
import { requirePageSection } from "@/lib/render-context";

/** Sesión y sección primero; con el interruptor apagado, /manual/* responde 404. */
export async function requireManualPage() {
  const user = await requirePageSection("manual");
  if (!manualEnabled()) notFound();
  return user;
}
