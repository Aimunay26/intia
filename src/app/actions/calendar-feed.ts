"use server";

import { revalidatePath } from "next/cache";

import { LEVEL, requireLevel } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { rotarFeedToken } from "@/lib/ical";

/**
 * Cambia el token del feed de calendario.
 *
 * Se usa cuando la dirección se compartió con alguien que ya no debería verla:
 * al rotarla, la anterior deja de funcionar y hay que volver a suscribirse en
 * Google Calendar con la nueva.
 */
export async function rotarTokenCalendario() {
  const user = await requireLevel(LEVEL.OWNER);
  await rotarFeedToken();

  await logAudit({
    user,
    action: "EDITAR",
    entity: "AppSetting",
    summary:
      "Cambió la dirección secreta del calendario. Las suscripciones antiguas dejaron de funcionar.",
  });

  revalidatePath("/ajustes");
  revalidatePath("/actividad");
}
