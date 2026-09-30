"use server";
import { revalidatePath } from "next/cache";
import { LEVEL, requireLevel, requirePermission } from "@/lib/auth";
import { auditInTransaction } from "@/lib/audit";
import { EDIT_CONFLICT, withMutation } from "@/lib/mutations";
import { OWNER_SCOPES, calendarToken } from "@/lib/calendar-subscriptions";
import { calendarFeedPersonalEnabled } from "@/lib/production-chain-flag";
import { field } from "@/lib/utils";
import { WorkflowError } from "@/lib/workflow-policy";

export type CalendarSubscriptionState = { error?: string; ok?: string; token?: string } | null;

/** Plazo del enlace: 30, 90 (por defecto) o 365 días. */
function expiryFrom(form: FormData) {
  const days = Number(field(form, "days") || "90");
  if (![30, 90, 365].includes(days)) throw new WorkflowError("Elige un plazo de 30, 90 o 365 días.");
  return new Date(Date.now() + days * 86400000);
}

/** Every mutation rechecks the owner inside the transaction. Token returned once, never audited. */
export async function gestionarSuscripcion(_prev: CalendarSubscriptionState, form: FormData): Promise<CalendarSubscriptionState> {
  const actor = await requireLevel(LEVEL.OWNER);
  try { return await withMutation(actor, true, async (tx, afterCommit) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(727106422)::text`;
    const operation = field(form, "operation");
    const id = field(form, "id");
    const expiresAt = expiryFrom(form);
    // El tope de 50 es de los enlaces del Dueño; los feeds personales tienen el suyo (uno por persona).
    const activeOwnerLinks = { scope: { in: OWNER_SCOPES }, revokedAt: null, expiresAt: { gt: new Date() } };
    let token: string | undefined;
    let entityId: string;
    let brandId: string | null;
    let personal = false;
    if (operation === "create") {
      const label = field(form, "label");
      const scope = field(form, "scope");
      brandId = scope === "BRAND" ? field(form, "brandId") : null;
      if (label.length < 2 || label.length > 100) throw new WorkflowError("Pon un nombre de 2 a 100 caracteres.");
      if (!["ALL", "BRAND"].includes(scope)) throw new WorkflowError("Elige el alcance del calendario.");
      if (scope === "BRAND" && (!brandId || !await tx.brand.findFirst({ where: { id: brandId, active: true }, select: { id: true } }))) throw new WorkflowError("Elige una marca activa.");
      if (await tx.calendarSubscription.count({ where: activeOwnerLinks }) >= 50) throw new WorkflowError("Hay 50 enlaces activos. Revoca uno antes de crear otro.");
      const generated = calendarToken(); token = generated.token;
      const row = await tx.calendarSubscription.create({ data: { label, scope, brandId, tokenHash: generated.tokenHash, expiresAt, createdById: actor.id } });
      entityId = row.id;
    } else if (operation === "revoke" || operation === "rotate") {
      const row = await tx.calendarSubscription.findUnique({ where: { id } });
      if (!row || row.updatedAt.toISOString() !== field(form, "expectedUpdatedAt")) throw new WorkflowError(EDIT_CONFLICT);
      // Un feed personal es de su persona: renovarlo aquí lo pasaría al Dueño. Revocarlo sí se
      // puede (no cambia de dueño): es el corte por persona si el enlace se filtró.
      if (!OWNER_SCOPES.includes(row.scope) && (row.scope !== "USER" || operation === "rotate")) throw new WorkflowError("Ese enlace es personal: solo su dueña o dueño lo renueva desde Mi perfil. Aquí solo puedes revocarlo.");
      if (row.revokedAt) throw new WorkflowError("Este enlace ya está revocado. Crea una suscripción nueva.");
      if (operation === "rotate" && row.brandId && !await tx.brand.findFirst({ where: { id: row.brandId, active: true }, select: { id: true } })) throw new WorkflowError("La marca ya no está activa.");
      if (operation === "rotate" && row.expiresAt <= new Date() && await tx.calendarSubscription.count({ where: activeOwnerLinks }) >= 50) throw new WorkflowError("Hay 50 enlaces activos. Revoca uno primero.");
      const generated = operation === "rotate" ? calendarToken() : null;
      await tx.calendarSubscription.update({ where: { id }, data: generated ? { tokenHash: generated.tokenHash, expiresAt, createdById: actor.id } : { revokedAt: new Date() } });
      token = generated?.token; entityId = id; brandId = row.brandId; personal = row.scope === "USER";
    } else throw new WorkflowError("Operación no válida.");
    await auditInTransaction(tx, { user: actor, action: "EDITAR", entity: "CalendarSubscription", entityId, brandId,
      summary: operation === "create" ? "Creó una suscripción de calendario con alcance fijo." : operation === "rotate" ? "Renovó el enlace del calendario; el anterior dejó de funcionar." : personal ? "Revocó el calendario personal de una persona del equipo." : "Revocó una suscripción de calendario." });
    afterCommit(() => revalidatePath("/ajustes")); afterCommit(() => revalidatePath("/actividad"));
    if (personal) afterCommit(() => revalidatePath("/mi-perfil"));
    return { ok: token ? "Copia el enlace ahora: no volverá a mostrarse." : "Enlace revocado.", ...(token ? { token } : {}) };
  }); } catch (error) { if (error instanceof WorkflowError || (error instanceof Error && error.message === EDIT_CONFLICT)) return { error: error.message }; throw error; }
}

/**
 * «Mi calendario en Google» (CALENDAR_FEED_PERSONAL): cada persona crea, renueva o revoca su
 * propio feed (scope USER, uno vigente por persona). El alcance no se guarda: se calcula en
 * cada descarga con sus perfiles y marcas de ese momento. El token se muestra una sola vez y
 * solo se guarda su hash; nunca va a la auditoría.
 */
export async function miCalendario(_prev: CalendarSubscriptionState, form: FormData): Promise<CalendarSubscriptionState> {
  const actor = await requirePermission("profile.self");
  if (!calendarFeedPersonalEnabled()) return { error: "El calendario personal no está activado." };
  try { return await withMutation(actor, false, async (tx, afterCommit) => {
    // Mismo candado que los enlaces del Dueño: dos pestañas no crean dos feeds.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(727106422)::text`;
    const operation = field(form, "operation");
    const now = new Date();
    let token: string | undefined;
    let entityId: string;
    if (operation === "create") {
      const expiresAt = expiryFrom(form);
      const current = await tx.calendarSubscription.findMany({ where: { scope: "USER", createdById: actor.id, revokedAt: null }, select: { id: true, expiresAt: true } });
      if (current.some((row) => row.expiresAt > now)) throw new WorkflowError("Ya tienes un enlace activo. Renuévalo si lo perdiste o revócalo antes de crear otro.");
      // Los vencidos sin revocar se cierran: queda uno vigente por persona.
      if (current.length) await tx.calendarSubscription.updateMany({ where: { id: { in: current.map((row) => row.id) } }, data: { revokedAt: now } });
      const generated = calendarToken(); token = generated.token;
      const label = `Mi calendario · ${actor.name}`.slice(0, 100);
      const row = await tx.calendarSubscription.create({ data: { label, scope: "USER", brandId: null, tokenHash: generated.tokenHash, expiresAt, createdById: actor.id } });
      entityId = row.id;
    } else if (operation === "revoke" || operation === "rotate") {
      const id = field(form, "id");
      const row = await tx.calendarSubscription.findUnique({ where: { id } });
      // Mismo mensaje si no existe o es de otra persona: no se revela nada de otros enlaces.
      if (!row || row.scope !== "USER" || row.createdById !== actor.id) throw new WorkflowError("Ese enlace no es tuyo o ya no existe. Recarga la página.");
      if (row.updatedAt.toISOString() !== field(form, "expectedUpdatedAt")) throw new WorkflowError(EDIT_CONFLICT);
      if (row.revokedAt) throw new WorkflowError("Este enlace ya está revocado. Crea uno nuevo.");
      const generated = operation === "rotate" ? calendarToken() : null;
      await tx.calendarSubscription.update({ where: { id }, data: generated ? { tokenHash: generated.tokenHash, expiresAt: expiryFrom(form) } : { revokedAt: now } });
      token = generated?.token; entityId = id;
    } else throw new WorkflowError("Operación no válida.");
    await auditInTransaction(tx, { user: actor, action: "EDITAR", entity: "CalendarSubscription", entityId, brandId: null,
      summary: operation === "create" ? "Creó su calendario personal (sus pasos y fechas, con sus marcas de cada momento)." : operation === "rotate" ? "Renovó su calendario personal; el enlace anterior dejó de funcionar." : "Revocó su calendario personal." });
    afterCommit(() => revalidatePath("/mi-perfil"));
    return { ok: token ? "Copia el enlace ahora: no volverá a mostrarse." : "Enlace revocado.", ...(token ? { token } : {}) };
  }); } catch (error) { if (error instanceof WorkflowError || (error instanceof Error && error.message === EDIT_CONFLICT)) return { error: error.message }; throw error; }
}
