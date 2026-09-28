import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertBrandPermission, type AccessUser } from "@/lib/permissions";
import { isProductKind, type ProductKind } from "@/lib/constants";
import { parseList, slugify } from "@/lib/utils";
import {
  GENERATOR_CATALOG_LIMITS,
  PRODUCT_LIMITS,
  type BrandCatalog,
  type CatalogCombo,
  type CatalogComboItem,
  type CatalogProduct,
  type GeneratorCatalogRows,
} from "@/lib/product-catalog-types";

/**
 * Catálogo de productos, servicios y combos por marca.
 *
 * Kill-switch: PRODUCT_CATALOG_ENABLED === "true". Apagado (o sin valor), las
 * pantallas y el generador no llaman a las lecturas de este módulo, así que las
 * tablas nuevas no se consultan y todo se comporta como antes del catálogo.
 * Las lecturas no miran el flag: lo decide quien las llama.
 * Excepción deliberada: la procedencia de los datos de ejemplo (demo-provenance)
 * bloquea y lee estas tablas también con el flag apagado, pero solo si ya existen
 * (catalogTablesExist), para no borrar sin aviso un catálogo cargado en la marca
 * de ejemplo. El orden sigue siendo migrar → desplegar → encender el flag.
 */

export { GENERATOR_CATALOG_LIMITS, PRODUCT_LIMITS };
export type { BrandCatalog, CatalogCombo, CatalogComboItem, CatalogProduct, ProductKind };
// El texto para la IA vive aparte, sin dependencias de servidor, para que el generador avise de los recortes.
export { avisoDeRecorte, construirFocoDeProducto, focoDeProducto, lineaDeTipo, type FocoEntry, type RecortesDelFoco } from "@/lib/product-focus";

export function productCatalogEnabled(): boolean {
  return process.env.PRODUCT_CATALOG_ENABLED === "true";
}

/* ------------------------------------------------------------- LECTURA -- */

export const CATALOG_PRODUCT_SELECT = {
  id: true,
  brandId: true,
  kind: true,
  name: true,
  aiNotes: true,
  features: true,
  benefits: true,
  objections: true,
  priceLabel: true,
  active: true,
  sortOrder: true,
  updatedAt: true,
} satisfies Prisma.BrandProductSelect;

export const CATALOG_COMBO_SELECT = {
  id: true,
  brandId: true,
  kind: true,
  name: true,
  aiNotes: true,
  priceLabel: true,
  active: true,
  sortOrder: true,
  updatedAt: true,
  items: {
    orderBy: [{ sortOrder: "asc" }, { productId: "asc" }],
    select: { productId: true, quantity: true, product: { select: { name: true, kind: true, active: true } } },
  },
} satisfies Prisma.BrandComboSelect;

type ProductRow = Prisma.BrandProductGetPayload<{ select: typeof CATALOG_PRODUCT_SELECT }>;
type ComboRow = Prisma.BrandComboGetPayload<{ select: typeof CATALOG_COMBO_SELECT }>;

/** La DB ya restringe el tipo con un CHECK; esto solo tipa el valor leído. */
const kindOf = (value: string): ProductKind => (isProductKind(value) ? value : "PRODUCTO");

export function toCatalogProduct(row: ProductRow): CatalogProduct {
  return {
    id: row.id,
    brandId: row.brandId,
    kind: kindOf(row.kind),
    name: row.name,
    aiNotes: row.aiNotes ?? "",
    features: parseList(row.features),
    benefits: parseList(row.benefits),
    objections: parseList(row.objections),
    priceLabel: row.priceLabel,
    active: row.active,
    sortOrder: row.sortOrder,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toCatalogCombo(row: ComboRow): CatalogCombo {
  return {
    id: row.id,
    brandId: row.brandId,
    kind: kindOf(row.kind),
    name: row.name,
    aiNotes: row.aiNotes ?? "",
    priceLabel: row.priceLabel,
    active: row.active,
    sortOrder: row.sortOrder,
    updatedAt: row.updatedAt.toISOString(),
    items: row.items.map((item) => ({
      productId: item.productId,
      name: item.product.name,
      kind: kindOf(item.product.kind),
      quantity: item.quantity,
      active: item.product.active,
    })),
  };
}

const CATALOG_ORDER = [{ sortOrder: "asc" }, { name: "asc" }] satisfies Prisma.BrandProductOrderByWithRelationInput[];

/** Pestaña de productos de una marca: incluye archivados. */
export async function readBrandCatalog(user: AccessUser, brandId: string): Promise<BrandCatalog> {
  assertBrandPermission(user, brandId, "brands.view");
  const [products, combos] = await Promise.all([
    prisma.brandProduct.findMany({ where: { brandId }, orderBy: CATALOG_ORDER, select: CATALOG_PRODUCT_SELECT }),
    prisma.brandCombo.findMany({ where: { brandId }, orderBy: CATALOG_ORDER, select: CATALOG_COMBO_SELECT }),
  ]);
  return { products: products.map(toCatalogProduct), combos: combos.map(toCatalogCombo) };
}

/**
 * Selector del generador: solo activos y con tope POR MARCA, para que una marca
 * con muchas fichas no deje sin tarjetas a las demás. Las marcas que pasan del
 * tope vuelven en `truncatedBrandIds` y el selector lo dice. Los combos con algún
 * producto archivado no se ofrecen (tampoco los acepta generarGuion).
 * Recibe marcas ya autorizadas por quien llama (brandScope de la página); no amplía el acceso.
 */
export async function readGeneratorCatalog(brandIds: string[]): Promise<GeneratorCatalogRows> {
  const ids = [...new Set(brandIds.filter(Boolean))];
  if (!ids.length) return { products: [], combos: [], truncatedBrandIds: [] };
  const { products: maxProducts, combos: maxCombos } = GENERATOR_CATALOG_LIMITS;
  const porMarca = await Promise.all(ids.map((brandId) => Promise.all([
    prisma.brandProduct.findMany({
      where: { brandId, active: true },
      orderBy: CATALOG_ORDER,
      select: CATALOG_PRODUCT_SELECT,
      take: maxProducts + 1,
    }),
    prisma.brandCombo.findMany({
      where: { brandId, active: true, items: { none: { product: { active: false } } } },
      orderBy: CATALOG_ORDER,
      select: CATALOG_COMBO_SELECT,
      take: maxCombos + 1,
    }),
  ])));
  const truncatedBrandIds = ids.filter((_, i) => porMarca[i][0].length > maxProducts || porMarca[i][1].length > maxCombos);
  return {
    products: porMarca.flatMap(([products]) => products.slice(0, maxProducts).map(toCatalogProduct)),
    combos: porMarca.flatMap(([, combos]) => combos.slice(0, maxCombos).map(toCatalogCombo)),
    truncatedBrandIds,
  };
}

/* ------------------------------------------------------------ SLUG -- */

/** Clave de comparación de nombres: sin tildes, mayúsculas ni signos. "Polera Chimuelo" = "polera-chimuelo". */
function catalogNameKey(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Slug único por marca para productos o combos, con guardado idempotente por nombre.
 * `list(root)` devuelve las fichas de la marca cuyo slug empieza por la raíz
 * ("polera", "polera-2", "polera-roja"...). Si alguna tiene el mismo nombre
 * (catalogNameKey) se devuelve como `existing`, esté en el sufijo que esté; si no,
 * el primer "raíz" o "raíz-n" libre. Mirar todas y no solo hasta el primer hueco
 * evita duplicar un nombre cuando se borró o renombró la ficha de la raíz y dos
 * nombres largos comparten los 60 caracteres del slug.
 * `ignoreId` (al editar) no cuenta como ocupado ni como repetido.
 * Devuelve null si el nombre no tiene letras ni números.
 */
export async function catalogSlot<T extends { id: string; name: string; slug: string }>(
  name: string,
  list: (root: string) => Promise<T[]>,
  ignoreId?: string,
): Promise<{ slug: string; existing: T | null } | null> {
  const root = slugify(name);
  if (!root) return null;
  const key = catalogNameKey(name);
  const rows = (await list(root)).filter((row) => row.id !== ignoreId);
  const existing = rows.find((row) => catalogNameKey(row.name) === key);
  if (existing) return { slug: existing.slug, existing };
  const taken = new Set(rows.map((row) => row.slug));
  let n = 1;
  while (taken.has(n === 1 ? root : `${root}-${n}`)) n++;
  return { slug: n === 1 ? root : `${root}-${n}`, existing: null };
}

/* ------------------------------------------------------------ TIPO -- */

function masFrecuente(kinds: readonly unknown[]): ProductKind | null {
  const counts = new Map<ProductKind, number>();
  for (const kind of kinds) if (isProductKind(kind)) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  let best: ProductKind | null = null;
  let max = 0;
  // Map conserva el orden de aparición: ante un empate gana el primero.
  for (const [kind, count] of counts) if (count > max) { best = kind; max = count; }
  return best;
}

/** Tipo del combo: el más frecuente entre sus productos; empate, el primero. Sin productos, PRODUCTO. */
export function kindForCombo(kinds: readonly ProductKind[]): ProductKind {
  return masFrecuente(kinds) ?? "PRODUCTO";
}

/** Tipo por defecto de la marca: el más frecuente entre sus productos activos. Sin productos, null. */
export function brandDominantKind(products: readonly { kind: string; active?: boolean }[]): ProductKind | null {
  return masFrecuente(products.filter((p) => p.active !== false).map((p) => p.kind));
}

/* ------------------------------------------------------ LISTAS JSON -- */

/**
 * Valida un textarea de una-línea-por-elemento antes de escribirlo con linesToJson.
 * Devuelve el error para mostrarlo, nunca descarta elementos en silencio (CONTRACT: campos JSON).
 */
export function validateList(
  lines: string | readonly string[] | null | undefined,
  options: { max?: number; maxLen?: number; label?: string } = {},
): string | null {
  const max = options.max ?? PRODUCT_LIMITS.listItems;
  const maxLen = options.maxLen ?? PRODUCT_LIMITS.listItemLength;
  const label = options.label ?? "La lista";
  const items = (typeof lines === "string" ? lines.split("\n") : [...(lines ?? [])])
    .map((line) => line.trim())
    .filter(Boolean);
  if (items.length > max) return `${label}: máximo ${max} elementos (hay ${items.length}).`;
  const long = items.findIndex((item) => item.length > maxLen);
  if (long >= 0) return `${label}: cada elemento admite hasta ${maxLen} caracteres (el ${long + 1}.º tiene ${items[long].length}).`;
  return null;
}
