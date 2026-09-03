/**
 * Lo de la marca activa que también necesita el navegador.
 *
 * Vive aparte de `brand-context.ts` porque aquel lee cookies y base de datos
 * (solo servidor), y el selector de la barra lateral es un componente de
 * cliente: si importara aquel archivo, se arrastraría `next/headers` al
 * navegador y la compilación falla.
 */

export const BRAND_COOKIE = "mos_brand";

/** Valor especial del selector para volver a ver todas las marcas juntas. */
export const TODAS = "__todas__";

export type BrandChoice = {
  id: string;
  name: string;
  colorPrimary: string;
};
