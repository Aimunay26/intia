"use server";

import { revalidatePath } from "next/cache";

import { LEVEL, requireLevel } from "@/lib/auth";
import { auditInTransaction } from "@/lib/audit";
import { withMutation } from "@/lib/mutations";
import { randomBytes } from "node:crypto";

/**
 * Cambia el token del feed de calendario.
 *
 * Se usa cuando la dirección se compartió con alguien que ya no debería verla:
 * al rotarla, la anterior deja de funcionar y hay que volver a suscribirse en
 * Google Calendar con la nueva.
 */
export async function rotarTokenCalendario() {
  const user = await requireLevel(LEVEL.OWNER);
  return withMutation(user, true, async (tx, afterCommit) => {
  const existed = await tx.appSetting.findUnique({ where: { key: "calendar.feedToken" } });
  const value = randomBytes(24).toString("base64url");
  await tx.appSetting.upsert({ where: { key: "calendar.feedToken" }, create: { key: "calendar.feedToken", value }, update: { value } });

  await auditInTransaction(tx, {
    user,
    action: "EDITAR",
    entity: "AppSetting",
    summary: existed
      ? "Cambió la dirección secreta del calendario. Las suscripciones antiguas dejaron de funcionar."
      : "Activó la dirección de suscripción al calendario.",
  });

  afterCommit(() => revalidatePath("/ajustes"));
  afterCommit(() => revalidatePath("/actividad"));
  });
}
