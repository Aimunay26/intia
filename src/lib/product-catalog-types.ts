/**
 * Tipos del catálogo de productos por marca. Sin dependencias de servidor:
 * los importan el selector del generador y la pestaña de productos.
 */
import type { ProductKind } from "@/lib/constants";

export type { ProductKind };

/** Topes compartidos por formularios (maxLength) y acciones (validación). El nombre coincide con el CHECK de la migración. */
export const PRODUCT_LIMITS = {
  name: 120,
  aiNotes: 3000,
  priceLabel: 60,
  listItems: 20,
  listItemLength: 200,
  /**
   * Texto del producto que llega a la IA; se envía en dos secciones del prompt.
   * Cabe la cabecera completa (unos 500 caracteres) más un detalle de `aiNotes`
   * sin cortar, y deja al menos 2500 para las listas. Lo que no entra se avisa
   * en el generador (avisoDeRecorte). El payload admite 12000 por campo.
   */
  focus: 6000,
} as const;

/** Tope de fichas activas por marca en el selector del generador (van enteras al cliente, con sus notas). */
export const GENERATOR_CATALOG_LIMITS = { products: 100, combos: 50 } as const;

/** Ficha de producto, servicio o plato lista para el cliente (fechas en ISO). */
export type CatalogProduct = {
  id: string;
  brandId: string;
  kind: ProductKind;
  name: string;
  /** "Qué debe saber la IA". Vacío si no se cargó. */
  aiNotes: string;
  features: string[];
  benefits: string[];
  objections: string[];
  priceLabel: string | null;
  active: boolean;
  sortOrder: number;
  /** Revisión que vio el editor: se compara antes de encolar o guardar. */
  updatedAt: string;
};

export type CatalogComboItem = {
  productId: string;
  name: string;
  kind: ProductKind;
  quantity: number;
  /** Falso si el producto está archivado: el combo no se ofrece en el generador hasta reactivarlo o quitarlo. */
  active: boolean;
};

/** Varios productos de la misma marca que se venden juntos. */
export type CatalogCombo = {
  id: string;
  brandId: string;
  kind: ProductKind;
  name: string;
  aiNotes: string;
  priceLabel: string | null;
  active: boolean;
  sortOrder: number;
  updatedAt: string;
  items: CatalogComboItem[];
};

export type BrandCatalog = { products: CatalogProduct[]; combos: CatalogCombo[] };

/** Lo que lee el generador: fichas activas con tope por marca y las marcas que pasaron del tope. */
export type GeneratorCatalogRows = BrandCatalog & { truncatedBrandIds: string[] };
