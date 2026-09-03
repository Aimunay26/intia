"use server";

import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { createSession, hashPassword, verifyPassword, needsBootstrap } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { field } from "@/lib/utils";

export type AuthState = { error?: string } | null;

export async function loginAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = field(formData, "email").toLowerCase();
  const password = field(formData, "password");

  if (!email || !password) {
    return { error: "Escribe tu correo y tu contraseña." };
  }

  const user = await prisma.user.findUnique({ where: { email } });

  // Mismo mensaje en ambos casos: no revelamos si el correo existe.
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "Correo o contraseña incorrectos." };
  }
  if (!user.active) {
    return { error: "Tu cuenta está desactivada. Habla con el dueño." };
  }

  await createSession(user.id);
  await logAudit({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      color: user.color,
      archetypeId: user.archetypeId,
    },
    action: "LOGIN",
    entity: "Auth",
    entityId: user.id,
    summary: `${user.name} inició sesión`,
  });

  redirect("/");
}

/** Alta del primer dueño cuando la base esta vacia. */
export async function bootstrapAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  if (!(await needsBootstrap())) {
    return { error: "Ya existe una cuenta. Inicia sesión." };
  }

  const name = field(formData, "name");
  const email = field(formData, "email").toLowerCase();
  const password = field(formData, "password");

  if (name.length < 2) return { error: "Escribe tu nombre." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: "Ese correo no parece válido." };
  }
  if (password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }

  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash: await hashPassword(password),
      role: "OWNER",
      color: "#5b53e8",
    },
  });

  await createSession(user.id);
  await logAudit({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      color: user.color,
      archetypeId: null,
    },
    action: "CREAR",
    entity: "User",
    entityId: user.id,
    summary: `Se creó la cuenta de dueño de ${user.name}`,
  });

  redirect("/");
}
