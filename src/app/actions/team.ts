"use server";
import { EDIT_CONFLICT, lockRevision } from "@/lib/mutations";
import { parseTeamAccess, saveTeamAccess } from "@/lib/team-access";

import { revalidatePath } from "next/cache";
import { requireUser, requireLevel, can, hashPassword, createSession, LEVEL, type SessionUser } from "@/lib/auth";
import { auditInTransaction, diffFields, FIELD_LABELS } from "@/lib/audit";
import { assertActor, preserveOwner, SecurityError, withAuthLock } from "@/lib/auth-transactions";
import type { AppTransaction } from "@/lib/prisma";
import { passwordError } from "@/lib/auth-policy";
import { field, fieldOrNull } from "@/lib/utils";

export type TeamState = { ok?: string; error?: string } | null;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const LABELS = { ...FIELD_LABELS, name: "Nombre", email: "Correo", role: "Rol", color: "Color", phone: "Teléfono", bio: "Descripción", archetypeId: "Arquetipo" };
const errorState = (error: unknown): TeamState => ({ error: error instanceof SecurityError || (error instanceof Error && error.message === EDIT_CONFLICT) ? error.message : "No se pudo guardar. Comprueba los datos y que el correo no esté ocupado." });
/**
 * Calendario personal (scope USER, CALENDAR_FEED_PERSONAL): su enlace se corta junto con las
 * sesiones (desactivar la cuenta, cambiar la contraseña, cambiar correo o rol). Si no, un token
 * filtrado volvería a funcionar al reactivar la cuenta. Sin feeds, no escribe nada.
 */
async function revocarCalendarioPersonal(tx: AppTransaction, actor: SessionUser, userId: string, name: string, why: string) {
  const { count } = await tx.calendarSubscription.updateMany({ where: { scope: "USER", createdById: userId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (count) await auditInTransaction(tx, { user: actor, action: "EDITAR", entity: "CalendarSubscription", summary: `Revocó el calendario personal de ${name} (${why}).` });
}

function refresh(self = false) { revalidatePath("/mi-perfil"); revalidatePath("/equipo"); revalidatePath("/actividad"); if (self) revalidatePath("/", "layout"); }
function profile(form: FormData) {
  const name = field(form, "name"), phone = fieldOrNull(form, "phone"), bio = fieldOrNull(form, "bio");
  if (name.length < 2 || name.length > 100 || (phone?.length ?? 0) > 50 || (bio?.length ?? 0) > 5000) throw new SecurityError("Revisa la longitud del nombre, teléfono y descripción.");
  return { name, phone, bio };
}
function account(form: FormData) {
  const email = field(form, "email").toLowerCase(), role = field(form, "role") || "MEMBER";
  if (email.length > 254 || !EMAIL_RE.test(email)) throw new SecurityError("Ese correo no parece válido.");
  if (!["OWNER", "MEMBER"].includes(role)) throw new SecurityError("Ese rol no existe.");
  return { email, role, archetypeId: fieldOrNull(form, "archetypeId") };
}

export async function crearUsuario(_prev: TeamState, formData: FormData): Promise<TeamState> {
  const actor = await requireLevel(LEVEL.OWNER);
  try {
    const data = { ...profile(formData), ...account(formData) };
    const access = parseTeamAccess(formData);
    const password = String(formData.get("password") ?? "");
    const invalid = passwordError(password); if (invalid) return { error: invalid };
    const passwordHash = await hashPassword(password);
    const colorRaw = field(formData, "color"), color = HEX_RE.test(colorRaw) ? colorRaw : "#6366f1";
    await withAuthLock(async tx => {
      await assertActor(tx, actor, true);
      const created = await tx.user.create({ data: { ...data, color, passwordHash, active: true } });
      const accessChanges = await saveTeamAccess(tx, created.id, access);
      await auditInTransaction(tx, { user: actor, action: "CREAR", entity: "User", entityId: created.id, summary: `Invitó a ${created.name} al equipo como ${created.role === "OWNER" ? "dueño" : "miembro"}`, changes: accessChanges ? { access: { etiqueta: "Perfiles y marcas autorizadas", antes: JSON.stringify(accessChanges.before), despues: JSON.stringify(accessChanges.after) } } : undefined });
    });
    refresh(); return { ok: "Cuenta creada. Comparte su contraseña inicial por un canal privado." };
  } catch (error) { return errorState(error); }
}

export async function actualizarUsuario(_prev: TeamState, formData: FormData): Promise<TeamState> {
  const actor = await requireUser(), id = field(formData, "id");
  const self = actor.id === id, admin = can(actor.role, LEVEL.OWNER);
  if (!self && !admin) return { error: "Solo el dueño puede editar a otras personas." };
  try {
    if (!admin && ["role", "archetypeId", "profiles", "brandIds", "accessConfigured"].some(key => formData.has(key))) throw new SecurityError("Solo el dueño puede cambiar los permisos.");
    const base = profile(formData), privileged = admin && formData.get("selfProfile") !== "1" ? account(formData) : null;
    const access = privileged ? parseTeamAccess(formData) : null;
    await withAuthLock(async tx => {
      await assertActor(tx, actor, admin);
      await lockRevision(tx, "User", id, formData);
      const before = await tx.user.findUniqueOrThrow({ where: { id } });
      const raw = field(formData, "color");
      const data = { ...base, color: HEX_RE.test(raw) ? raw : before.color, ...(privileged ?? {}) };
      if (privileged && before.role !== privileged.role) await preserveOwner(tx, id);
      const changes = diffFields(before, data, LABELS);
      const accessChanges = await saveTeamAccess(tx, id, access);
      if (!changes && !accessChanges) return;
      const revoke = Boolean(privileged && (before.role !== privileged.role || before.email !== privileged.email));
      await tx.user.update({ where: { id }, data: { ...data, ...(revoke ? { sessionVersion: { increment: 1 } } : {}) } });
      if (revoke) {
        await tx.authSession.deleteMany({ where: { userId: id } });
        await revocarCalendarioPersonal(tx, actor, id, before.name, "cambió su correo o su rol y se cerraron sus sesiones");
      }
      await auditInTransaction(tx, { user: actor, action: "EDITAR", entity: "User", entityId: id, summary: self ? "Editó su propio perfil" : `Editó la ficha de ${before.name}`, changes: { ...changes, ...(accessChanges ? { access: { etiqueta: "Perfiles y marcas autorizadas", antes: JSON.stringify(accessChanges.before), despues: JSON.stringify(accessChanges.after) } } : {}) } });
    });
    refresh(self); return { ok: "Datos guardados. Si cambiaste el correo, rol, perfiles o marcas, las sesiones anteriores quedaron cerradas." };
  } catch (error) { return errorState(error); }
}

export async function cambiarPassword(_prev: TeamState, formData: FormData): Promise<TeamState> {
  const actor = await requireUser(), id = field(formData, "id"), self = actor.id === id;
  if (!self && !can(actor.role, LEVEL.OWNER)) return { error: "Solo el dueño puede cambiar la contraseña de otra persona." };
  const password = String(formData.get("password") ?? ""), repeat = String(formData.get("password2") ?? "");
  const invalid = passwordError(password); if (invalid) return { error: invalid };
  if (password !== repeat) return { error: "Las dos contraseñas no coinciden." };
  const passwordHash = await hashPassword(password);
  try {
    const version = await withAuthLock(async tx => {
      await assertActor(tx, actor, !self);
      const target = await tx.user.update({ where: { id }, data: { passwordHash, sessionVersion: { increment: 1 } } });
      await tx.authSession.deleteMany({ where: { userId: id } });
      await revocarCalendarioPersonal(tx, actor, id, target.name, "cambio de contraseña");
      await auditInTransaction(tx, { user: actor, action: "EDITAR", entity: "User", entityId: id, summary: self ? "Cambió su propia contraseña y cerró sus sesiones anteriores" : `Cambió la contraseña de ${target.name} y cerró sus sesiones` });
      return target.sessionVersion;
    });
    // Solo quien cambió su propia contraseña recibe una sesión nueva; las otras quedan revocadas.
    if (self) await createSession(id, version);
    refresh(); return { ok: "Contraseña actualizada. Las sesiones anteriores quedaron cerradas." };
  } catch (error) { return errorState(error); }
}

export async function desactivarUsuario(_prev: TeamState, formData: FormData): Promise<TeamState> {
  const actor = await requireLevel(LEVEL.OWNER), id = field(formData, "id"), active = field(formData, "active") === "1";
  if (!active && actor.id === id) return { error: "No puedes desactivar tu propia cuenta." };
  try {
    await withAuthLock(async tx => {
      await assertActor(tx, actor, true);
      const target = await tx.user.findUniqueOrThrow({ where: { id } });
      if (target.active === active) return;
      if (!active) await preserveOwner(tx, id);
      await tx.user.update({ where: { id }, data: { active, sessionVersion: { increment: 1 } } });
      await tx.authSession.deleteMany({ where: { userId: id } });
      if (!active) await revocarCalendarioPersonal(tx, actor, id, target.name, "cuenta desactivada");
      await auditInTransaction(tx, { user: actor, action: "EDITAR", entity: "User", entityId: id, summary: `${active ? "Reactivó" : "Desactivó"} la cuenta de ${target.name}`, changes: { active: { etiqueta: "Activo", antes: target.active, despues: active } } });
    });
    refresh(); return { ok: active ? "Cuenta reactivada. Debe iniciar sesión de nuevo." : "Cuenta desactivada y sesiones revocadas." };
  } catch (error) { return errorState(error); }
}

export async function eliminarUsuario(formData: FormData) {
  const actor = await requireLevel(LEVEL.OWNER), id = field(formData, "id");
  if (id === actor.id) throw new SecurityError("No puedes eliminar tu propia cuenta.");
  await withAuthLock(async tx => {
    await assertActor(tx, actor, true);
    const target = await tx.user.findUnique({ where: { id } });
    if (!target) return;
    await preserveOwner(tx, id);
    await tx.asset.deleteMany({ where: { ownerType: "user", ownerId: id } });
    await tx.user.delete({ where: { id } });
    await auditInTransaction(tx, { user: actor, action: "ELIMINAR", entity: "User", entityId: id, summary: `Eliminó a ${target.name} del equipo` });
  });
  refresh();
}
