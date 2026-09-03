"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { borrarAssetsDe } from "@/lib/assets-cleanup";
import { requireUser, requireLevel, can, hashPassword, LEVEL } from "@/lib/auth";
import { logAudit, diffFields, FIELD_LABELS, type Cambio } from "@/lib/audit";
import { USER_ROLE_MAP } from "@/lib/constants";
import { field, fieldOrNull } from "@/lib/utils";

/**
 * Acciones del equipo.
 *
 * Regla de oro de este archivo: en el log de auditoria NUNCA entra una
 * contrasena ni un hash. Solo se registra que la contrasena cambio.
 */

export type TeamState = { ok?: string; error?: string } | null;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** Etiquetas legibles de los campos de una persona, para el log. */
const LABELS: Record<string, string> = {
  ...FIELD_LABELS,
  name: "Nombre",
  email: "Correo",
  role: "Rol",
  color: "Color",
  phone: "Teléfono",
  bio: "Descripción",
};

function roleLabel(role: string) {
  return USER_ROLE_MAP[role]?.label ?? role;
}

function isValidRole(role: string) {
  return Boolean(USER_ROLE_MAP[role]);
}

/** Cuantos duenos activos quedan en la casa. */
async function activeAdmins() {
  return prisma.user.count({ where: { role: "OWNER", active: true } });
}

function refresh(self: boolean) {
  revalidatePath("/equipo");
  revalidatePath("/actividad");
  // El nombre y el color de la persona salen en la barra lateral.
  if (self) revalidatePath("/", "layout");
}

/* ------------------------------------------------------------------ CREAR -- */

export async function crearUsuario(
  _prev: TeamState,
  formData: FormData
): Promise<TeamState> {
  const actor = await requireUser();
  if (!can(actor.role, LEVEL.OWNER)) {
    return { error: "Solo el dueño puede invitar personas." };
  }

  const name = field(formData, "name");
  const email = field(formData, "email").toLowerCase();
  const password = field(formData, "password");
  const role = field(formData, "role") || "MEMBER";
  const colorRaw = field(formData, "color");
  const color = HEX_RE.test(colorRaw) ? colorRaw : "#6366f1";
  const phone = fieldOrNull(formData, "phone");
  const bio = fieldOrNull(formData, "bio");
  const archetypeId = fieldOrNull(formData, "archetypeId");

  if (name.length < 2) return { error: "Escribe el nombre de la persona." };
  if (!EMAIL_RE.test(email)) return { error: "Ese correo no parece válido." };
  if (password.length < 8) {
    return { error: "La contraseña inicial debe tener al menos 8 caracteres." };
  }
  if (!isValidRole(role)) return { error: "Ese rol no existe." };

  const yaExiste = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true },
  });
  if (yaExiste) {
    return { error: `Ya hay una cuenta con ese correo (${yaExiste.name}).` };
  }

  const created = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash: await hashPassword(password),
      role,
      color,
      phone,
      bio,
      archetypeId,
      active: true,
    },
    select: { id: true, name: true, role: true },
  });

  await logAudit({
    user: actor,
    action: "CREAR",
    entity: "User",
    entityId: created.id,
    summary: `Invitó a ${created.name} al equipo como ${roleLabel(created.role)}`,
  });

  refresh(false);
  return {
    ok: `${created.name} ya puede entrar. Pásale su contraseña inicial por un canal privado.`,
  };
}

/* ------------------------------------------------------------- ACTUALIZAR -- */

export async function actualizarUsuario(
  _prev: TeamState,
  formData: FormData
): Promise<TeamState> {
  const actor = await requireUser();
  const id = field(formData, "id");
  if (!id) return { error: "Falta indicar a quién editar." };

  const isSelf = actor.id === id;
  const isAdmin = can(actor.role, LEVEL.OWNER);
  if (!isSelf && !isAdmin) {
    return { error: "Solo el dueño puede editar a otras personas." };
  }

  const before = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      color: true,
      phone: true,
      bio: true,
      archetypeId: true,
    },
  });
  if (!before) return { error: "Esa persona ya no existe." };

  const name = field(formData, "name");
  if (name.length < 2) return { error: "El nombre no puede quedar vacío." };

  const colorRaw = field(formData, "color");
  const color = HEX_RE.test(colorRaw) ? colorRaw : before.color;
  const phone = fieldOrNull(formData, "phone");
  const bio = fieldOrNull(formData, "bio");

  // Correo, rol y arquetipo solo los toca el dueno.
  let email = before.email;
  let role = before.role;
  let archetypeId = before.archetypeId;

  if (isAdmin) {
    const nuevoEmail = field(formData, "email").toLowerCase();
    if (!EMAIL_RE.test(nuevoEmail)) return { error: "Ese correo no parece válido." };
    if (nuevoEmail !== before.email) {
      const ocupado = await prisma.user.findUnique({
        where: { email: nuevoEmail },
        select: { id: true, name: true },
      });
      if (ocupado && ocupado.id !== id) {
        return { error: `Ese correo ya lo usa ${ocupado.name}.` };
      }
    }
    email = nuevoEmail;

    const nuevoRol = field(formData, "role");
    if (!isValidRole(nuevoRol)) return { error: "Ese rol no existe." };
    if (before.role === "OWNER" && nuevoRol !== "OWNER" && (await activeAdmins()) <= 1) {
      return {
        error:
          "Es el único dueño activo. Nombra a otro dueño antes de cambiarle el rol.",
      };
    }
    role = nuevoRol;

    archetypeId = fieldOrNull(formData, "archetypeId");
  }

  const beforeSnapshot = {
    name: before.name,
    email: before.email,
    role: before.role,
    color: before.color,
    phone: before.phone,
    bio: before.bio,
  };
  const afterSnapshot = { name, email, role, color, phone, bio };

  const changes: Record<string, Cambio> =
    diffFields(beforeSnapshot, afterSnapshot, LABELS) ?? {};

  if (before.archetypeId !== archetypeId) {
    const ids = [before.archetypeId, archetypeId].filter(
      (x): x is string => typeof x === "string" && x.length > 0
    );
    const arquetipos = ids.length
      ? await prisma.archetype.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true },
        })
      : [];
    const nombre = (value: string | null) =>
      value ? (arquetipos.find((a) => a.id === value)?.name ?? "—") : "—";
    changes.archetypeId = {
      etiqueta: "Arquetipo",
      antes: nombre(before.archetypeId),
      despues: nombre(archetypeId),
    };
  }

  if (!Object.keys(changes).length) {
    return { ok: "No había nada que cambiar." };
  }

  await prisma.user.update({
    where: { id },
    data: { ...afterSnapshot, archetypeId },
  });

  await logAudit({
    user: actor,
    action: "EDITAR",
    entity: "User",
    entityId: id,
    summary: isSelf
      ? "Editó su propio perfil"
      : `Editó la ficha de ${before.name} en el equipo`,
    changes,
  });

  refresh(isSelf);
  return { ok: "Datos guardados." };
}

/* -------------------------------------------------------------- CONTRASEÑA -- */

export async function cambiarPassword(
  _prev: TeamState,
  formData: FormData
): Promise<TeamState> {
  const actor = await requireUser();
  const id = field(formData, "id");
  if (!id) return { error: "Falta indicar de quién es la contraseña." };

  const isSelf = actor.id === id;
  const isAdmin = can(actor.role, LEVEL.OWNER);
  if (!isSelf && !isAdmin) {
    return { error: "Solo el dueño puede cambiar la contraseña de otra persona." };
  }

  const password = field(formData, "password");
  const repeat = field(formData, "password2");

  if (password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }
  if (password !== repeat) {
    return { error: "Las dos contraseñas no coinciden." };
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!target) return { error: "Esa persona ya no existe." };

  await prisma.user.update({
    where: { id },
    data: { passwordHash: await hashPassword(password) },
  });

  // Aquí no va ningún dato de la contraseña: solo el hecho de que cambió.
  await logAudit({
    user: actor,
    action: "EDITAR",
    entity: "User",
    entityId: id,
    summary: isSelf
      ? "Cambió su propia contraseña"
      : `Cambió la contraseña de ${target.name}`,
  });

  refresh(false);
  return {
    ok: isSelf
      ? "Contraseña actualizada. Úsala la próxima vez que entres."
      : `Contraseña de ${target.name} actualizada. Comunícasela por un canal privado.`,
  };
}

/* ------------------------------------------------------- ACTIVAR / DESACTIVAR -- */

export async function desactivarUsuario(
  _prev: TeamState,
  formData: FormData
): Promise<TeamState> {
  const actor = await requireUser();
  if (!can(actor.role, LEVEL.OWNER)) {
    return { error: "Solo el dueño puede activar o desactivar cuentas." };
  }

  const id = field(formData, "id");
  const activar = field(formData, "active") === "1";

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, role: true, active: true },
  });
  if (!target) return { error: "Esa persona ya no existe." };
  if (target.active === activar) {
    return { ok: activar ? "Ya estaba activa." : "Ya estaba desactivada." };
  }

  if (!activar) {
    if (target.id === actor.id) {
      return {
        error: "No puedes desactivar tu propia cuenta. Pídeselo a otro dueño.",
      };
    }
    if (target.role === "OWNER" && (await activeAdmins()) <= 1) {
      return {
        error: "Es el único dueño activo. Nombra a otro antes de desactivarlo.",
      };
    }
  }

  await prisma.user.update({ where: { id }, data: { active: activar } });

  await logAudit({
    user: actor,
    action: "EDITAR",
    entity: "User",
    entityId: id,
    summary: activar
      ? `Reactivó la cuenta de ${target.name}`
      : `Desactivó la cuenta de ${target.name}`,
    changes: {
      active: { etiqueta: "Activo", antes: target.active, despues: activar },
    },
  });

  refresh(false);
  return {
    ok: activar
      ? `${target.name} vuelve a tener acceso.`
      : `${target.name} ya no puede entrar. Su historial se conserva.`,
  };
}

/* --------------------------------------------------------------- ELIMINAR -- */

export async function eliminarUsuario(formData: FormData) {
  const actor = await requireLevel(LEVEL.OWNER);
  const id = field(formData, "id");

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, role: true, active: true },
  });
  if (!target) return;

  if (target.id === actor.id) {
    throw new Error("No puedes eliminar tu propia cuenta.");
  }
  if (target.role === "OWNER" && target.active && (await activeAdmins()) <= 1) {
    throw new Error("Es el único dueño activo. No se puede eliminar.");
  }

  await borrarAssetsDe("user", id);
  await prisma.user.delete({ where: { id } });

  await logAudit({
    user: actor,
    action: "ELIMINAR",
    entity: "User",
    entityId: id,
    summary: `Eliminó a ${target.name} del equipo`,
  });

  refresh(false);
}
