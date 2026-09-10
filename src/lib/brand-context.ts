import { cookies } from "next/headers";

import { prisma } from "@/lib/prisma";
import { requireUser, type SessionUser } from "@/lib/auth";

/**
 * Marca activa.
 *
 * Toda la aplicación trabaja en uno de dos modos:
 *   TODAS LAS MARCAS  se ve el conjunto: totales, calendario completo, todo.
 *   UNA MARCA         se entra dentro de esa marca y solo se ve lo suyo.
 *
 * La elección se guarda en una cookie, así que se mantiene al navegar y al
 * volver otro día. Cada pantalla la lee con getBrandContext() y filtra con
 * brandWhere(); así el cableado es el mismo en todas partes.
 */

import { BRAND_COOKIE, type BrandChoice } from "@/lib/brand-shared";

export { BRAND_COOKIE, TODAS } from "@/lib/brand-shared";
export type { BrandChoice } from "@/lib/brand-shared";

export type BrandContext = {
  /** null = se están viendo todas las marcas. */
  activeId: string | null;
  active: BrandChoice | null;
  brands: BrandChoice[];
  /** true cuando hay una marca concreta seleccionada. */
  focused: boolean;
};

export async function getBrandContext(actor?: SessionUser): Promise<BrandContext> {
  const user = actor ?? await requireUser();
  const [brands, jar] = await Promise.all([
    prisma.brand.findMany({
      where: { archived: false, ...(user.role === "OWNER" ? {} : { id: { in: user.brandIds ?? [] } }) },
      orderBy: { name: "asc" },
      select: { id: true, name: true, colorPrimary: true },
    }),
    cookies(),
  ]);

  const cookieValue = jar.get(BRAND_COOKIE)?.value ?? "";
  // Si la marca guardada ya no existe (se borró o se archivó), se cae a "todas"
  // en vez de dejar la aplicación filtrando por algo invisible.
  const active = brands.find((b) => b.id === cookieValue) ?? null;

  return {
    activeId: active?.id ?? null,
    active,
    brands,
    focused: Boolean(active),
  };
}

/**
 * Filtro de Prisma para las entidades que cuelgan de una marca.
 * Con "todas las marcas" devuelve {}, que no filtra nada.
 */
export function brandWhere(activeId: string | null): { brandId?: string } {
  return activeId ? { brandId: activeId } : {};
}

/** Texto para las cabeceras: "Con Amor" o "Todas las marcas". */
export function brandLabel(ctx: BrandContext): string {
  return ctx.active?.name ?? "Todas las marcas";
}
