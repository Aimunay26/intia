"use server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSession, hashPassword, verifyPassword } from "@/lib/auth";
import { auditInTransaction, logAudit } from "@/lib/audit";
import { BOOTSTRAP_COMPLETE, withAuthLock } from "@/lib/auth-transactions";
import { equalSecret, isStrongSecret, passwordError } from "@/lib/auth-policy";
import { ACCESS_LIMIT_MESSAGE, consumeAccessAttempt } from "@/lib/auth-rate-limit";
import { field } from "@/lib/utils";

export type AuthState = { error?: string } | null;
const INVALID = "Correo o contraseña incorrectos.";
const DUMMY_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = field(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!await consumeAccessAttempt("login", email.slice(0, 254))) return { error: ACCESS_LIMIT_MESSAGE };
  if (!email || email.length > 254 || !password || Buffer.byteLength(password) > 72) return { error: INVALID };
  const user = await prisma.user.findUnique({ where: { email } });
  const matches = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user?.active || !matches || !["OWNER", "MEMBER"].includes(user.role)) return { error: INVALID };
  try { await createSession(user.id, user.sessionVersion); }
  catch { return { error: "No se pudo abrir la sesión. Vuelve a intentarlo." }; }
  await logAudit({ user, action: "LOGIN", entity: "Auth", entityId: user.id, summary: `${user.name} inició sesión` });
  redirect("/");
}

export async function bootstrapAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!await consumeAccessAttempt("bootstrap")) return { error: ACCESS_LIMIT_MESSAGE };
  const expected = process.env.BOOTSTRAP_TOKEN;
  const supplied = String(formData.get("installationKey") ?? "");
  if (!isStrongSecret(expected) || supplied.length > 1024 || !equalSecret(supplied, expected)) return { error: "La clave de instalación no es válida o el alta está deshabilitada." };
  const name = field(formData, "name"), email = field(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (name.length < 2 || name.length > 100) return { error: "El nombre debe tener entre 2 y 100 caracteres." };
  if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Ese correo no parece válido." };
  const invalidPassword = passwordError(password);
  if (invalidPassword) return { error: invalidPassword };
  const passwordHash = await hashPassword(password);
  const result = await withAuthLock(async tx => {
    if (await tx.appSetting.findUnique({ where: { key: BOOTSTRAP_COMPLETE } }) || await tx.user.count({ where: { role: "OWNER" } })) return null;
    if (await tx.user.findUnique({ where: { email }, select: { id: true } })) return { error: "Ese correo ya pertenece a una cuenta del equipo. Usa otro para el dueño inicial." };
    const created = await tx.user.create({ data: { name, email, passwordHash, role: "OWNER", color: "#5b53e8" } });
    await tx.appSetting.create({ data: { key: BOOTSTRAP_COMPLETE, value: "1" } });
    await auditInTransaction(tx, { user: created, action: "CREAR", entity: "User", entityId: created.id, summary: "Creó la cuenta inicial de dueño" });
    return { user: created };
  });
  if (!result) return { error: "La instalación ya tiene una cuenta de dueño. Inicia sesión." };
  if (result.error) return { error: result.error };
  const user = result.user!;
  try { await createSession(user.id, user.sessionVersion); }
  catch { return { error: "La cuenta se creó, pero no se pudo abrir la sesión. Entra con el correo y la contraseña que acabas de elegir." }; }
  redirect("/");
}
