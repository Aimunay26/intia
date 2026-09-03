"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { BRAND_COOKIE, TODAS } from "@/lib/brand-shared";
import { field } from "@/lib/utils";

/**
 * Cambia la marca en la que está trabajando esta persona.
 * No se registra en el log de actividad a propósito: no cambia ningún dato,
 * solo lo que se está mirando.
 */
export async function cambiarMarcaActiva(formData: FormData) {
  await requireUser();

  const brandId = field(formData, "brandId");
  const jar = await cookies();

  if (!brandId || brandId === TODAS) {
    jar.delete(BRAND_COOKIE);
  } else {
    jar.set(BRAND_COOKIE, brandId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 365 * 24 * 60 * 60,
    });
  }

  // La marca activa afecta a todas las pantallas, así que se refresca el árbol.
  revalidatePath("/", "layout");
}
