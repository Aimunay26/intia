"use server";
import { revalidatePath } from "next/cache";
import { LEVEL, requireLevel } from "@/lib/auth";
import { auditInTransaction } from "@/lib/audit";
import { EDIT_CONFLICT, withMutation } from "@/lib/mutations";
import { calendarToken } from "@/lib/calendar-subscriptions";
import { field } from "@/lib/utils";
import { WorkflowError } from "@/lib/workflow-policy";

export type CalendarSubscriptionState = { error?: string; ok?: string; token?: string } | null;

/** Every mutation rechecks the owner inside the transaction. Token returned once, never audited. */
export async function gestionarSuscripcion(_prev: CalendarSubscriptionState, form: FormData): Promise<CalendarSubscriptionState> {
  const actor = await requireLevel(LEVEL.OWNER);
  try { return await withMutation(actor, true, async (tx, afterCommit) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(727106422)::text`;
    const operation = field(form, "operation");
    const id = field(form, "id");
    const days = Number(field(form, "days") || "90");
    if (![30, 90, 365].includes(days)) throw new WorkflowError("Elige un plazo de 30, 90 o 365 días.");
    const expiresAt = new Date(Date.now() + days * 86400000);
    let token: string | undefined;
    let entityId: string;
    let brandId: string | null;
    if (operation === "create") {
      const label = field(form, "label");
      const scope = field(form, "scope");
      brandId = scope === "BRAND" ? field(form, "brandId") : null;
      if (label.length < 2 || label.length > 100) throw new WorkflowError("Pon un nombre de 2 a 100 caracteres.");
      if (!["ALL", "BRAND"].includes(scope)) throw new WorkflowError("Elige el alcance del calendario.");
      if (scope === "BRAND" && (!brandId || !await tx.brand.findFirst({ where: { id: brandId, active: true }, select: { id: true } }))) throw new WorkflowError("Elige una marca activa.");
      if (await tx.calendarSubscription.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }) >= 50) throw new WorkflowError("Hay 50 enlaces activos. Revoca uno antes de crear otro.");
      const generated = calendarToken(); token = generated.token;
      const row = await tx.calendarSubscription.create({ data: { label, scope, brandId, tokenHash: generated.tokenHash, expiresAt, createdById: actor.id } });
      entityId = row.id;
    } else if (operation === "revoke" || operation === "rotate") {
      const row = await tx.calendarSubscription.findUnique({ where: { id } });
      if (!row || row.updatedAt.toISOString() !== field(form, "expectedUpdatedAt")) throw new WorkflowError(EDIT_CONFLICT);
      if (row.revokedAt) throw new WorkflowError("Este enlace ya está revocado. Crea una suscripción nueva.");
      if (operation === "rotate" && row.brandId && !await tx.brand.findFirst({ where: { id: row.brandId, active: true }, select: { id: true } })) throw new WorkflowError("La marca ya no está activa.");
      if (operation === "rotate" && row.expiresAt <= new Date() && await tx.calendarSubscription.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }) >= 50) throw new WorkflowError("Hay 50 enlaces activos. Revoca uno primero.");
      const generated = operation === "rotate" ? calendarToken() : null;
      await tx.calendarSubscription.update({ where: { id }, data: generated ? { tokenHash: generated.tokenHash, expiresAt, createdById: actor.id } : { revokedAt: new Date() } });
      token = generated?.token; entityId = id; brandId = row.brandId;
    } else throw new WorkflowError("Operación no válida.");
    await auditInTransaction(tx, { user: actor, action: "EDITAR", entity: "CalendarSubscription", entityId, brandId,
      summary: operation === "create" ? "Creó una suscripción de calendario con alcance fijo." : operation === "rotate" ? "Renovó el enlace del calendario; el anterior dejó de funcionar." : "Revocó una suscripción de calendario." });
    afterCommit(() => revalidatePath("/ajustes")); afterCommit(() => revalidatePath("/actividad"));
    return { ok: token ? "Copia el enlace ahora: no volverá a mostrarse." : "Enlace revocado.", ...(token ? { token } : {}) };
  }); } catch (error) { if (error instanceof WorkflowError || (error instanceof Error && error.message === EDIT_CONFLICT)) return { error: error.message }; throw error; }
}
