"use server";
import { revalidatePath } from "next/cache";

import { auditInTransaction, diffFields, FIELD_LABELS, type Cambio } from "@/lib/audit";
import { LEVEL, requireLevel, requirePermission } from "@/lib/auth";
import { SecurityError } from "@/lib/auth-transactions";
import { isProductKind, type ProductKind } from "@/lib/constants";
import { EDIT_CONFLICT, lockRevision, withMutation } from "@/lib/mutations";
import { assertBrandPermission } from "@/lib/permissions";
import { prisma, type AppTransaction } from "@/lib/prisma";
import {
  CATALOG_PRODUCT_SELECT,
  PRODUCT_LIMITS,
  catalogSlot,
  kindForCombo,
  productCatalogEnabled,
  toCatalogProduct,
  validateList,
  type CatalogProduct,
} from "@/lib/product-catalog";
import { boolField, field, linesToJson, slugify } from "@/lib/utils";

/**
 * Acciones del catálogo de productos y combos de cada marca.
 *
 * Reglas del contrato aplicadas aquí:
 *  - crear, editar y archivar: capacidad brands.edit sobre una marca autorizada
 *  - eliminar: LEVEL.OWNER (destruye una entidad completa)
 *  - toda escritura deja rastro en el log de auditoría, en la misma transacción
 *  - con PRODUCT_CATALOG_ENABLED apagado no se lee ni se escribe nada
 *
 * Los formularios usan EditForm: un error de validación vuelve como { error }
 * para que se lea tal cual y el borrador se conserve.
 */

/* ---------------------------------------------------------------- APOYOS -- */

function revalidateCatalog(brandId: string) {
  revalidatePath("/marcas");
  revalidatePath(`/marcas/${brandId}`);
  revalidatePath("/generador");
}

const esConflictoDeUnicidad = (error: unknown) =>
  Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");

const CATALOGO_APAGADO = "El catálogo de productos no está activo.";

/** Lo que devuelven las acciones de formulario: nada si se guardó, o el motivo si no. */
export type CatalogActionResult = { error: string } | undefined;

/**
 * Un conflicto de revisión (otra persona guardó antes) se devuelve como mensaje
 * legible para que EditForm conserve el borrador; cualquier otro error sigue su curso.
 */
async function conConflictoLegible(work: () => Promise<CatalogActionResult | void>, repetido: string): Promise<CatalogActionResult> {
  try {
    return (await work()) ?? undefined;
  } catch (error) {
    if (esConflictoDeUnicidad(error)) return { error: repetido };
    if (error instanceof Error && error.message === EDIT_CONFLICT) return { error: EDIT_CONFLICT };
    throw error;
  }
}

const unaLinea = (text: string) => text.replace(/\s+/g, " ").trim();

/** Lo que catalogSlot necesita de cada ficha que comparte la raíz del slug. */
const SLOT_SELECT = { id: true, name: true, slug: true } as const;
const QUICK_SLOT_SELECT = { ...CATALOG_PRODUCT_SELECT, slug: true } as const;

type BaseFields = { name: string; aiNotes: string | null; priceLabel: string | null };

/** Nombre, qué debe saber la IA y precio: comunes a productos y combos. */
function readBaseFields(fd: FormData, sujeto: string): { data: BaseFields } | { error: string } {
  const name = unaLinea(field(fd, "name"));
  // El navegador envía los saltos del textarea como \r\n: se cuentan como uno, igual que maxLength.
  const aiNotes = field(fd, "aiNotes").replace(/\r\n?/g, "\n");
  const priceLabel = unaLinea(field(fd, "priceLabel"));
  if (!name) return { error: `${sujeto} necesita un nombre.` };
  if (name.length > PRODUCT_LIMITS.name) return { error: `El nombre admite hasta ${PRODUCT_LIMITS.name} caracteres.` };
  if (!slugify(name)) return { error: "Escribe el nombre con letras o números." };
  if (aiNotes.length > PRODUCT_LIMITS.aiNotes) {
    return { error: `"Qué debe saber la IA" admite hasta ${PRODUCT_LIMITS.aiNotes} caracteres (tiene ${aiNotes.length}).` };
  }
  if (priceLabel.length > PRODUCT_LIMITS.priceLabel) return { error: `El precio admite hasta ${PRODUCT_LIMITS.priceLabel} caracteres.` };
  return { data: { name, aiNotes: aiNotes || null, priceLabel: priceLabel || null } };
}

/* ------------------------------------------------------------ PRODUCTOS -- */

const PRODUCT_LABELS: Record<string, string> = {
  ...FIELD_LABELS,
  name: "Nombre",
  slug: "Identificador",
  kind: "Tipo",
  aiNotes: "Qué debe saber la IA",
  features: "Características",
  benefits: "Beneficios",
  objections: "Objeciones",
  priceLabel: "Precio",
  active: "Activo",
};

const PRODUCT_LISTS = [
  ["features", "Características"],
  ["benefits", "Beneficios"],
  ["objections", "Objeciones"],
] as const;

type ProductWrite = {
  name: string;
  kind: ProductKind;
  aiNotes: string | null;
  features: string;
  benefits: string;
  objections: string;
  priceLabel: string | null;
  active: boolean;
  slug?: string;
};

/** Valida el formulario completo antes de escribir. Las listas no se recortan en silencio. */
function readProductFields(fd: FormData): { data: ProductWrite } | { error: string } {
  const base = readBaseFields(fd, "El producto");
  if ("error" in base) return { error: base.error };
  const kind = field(fd, "kind");
  if (!isProductKind(kind)) return { error: "Elige si es un producto, un servicio o un restaurante." };
  for (const [key, label] of PRODUCT_LISTS) {
    const error = validateList(field(fd, key), { label });
    if (error) return { error };
  }
  return {
    data: {
      ...base.data,
      kind,
      features: linesToJson(field(fd, "features")),
      benefits: linesToJson(field(fd, "benefits")),
      objections: linesToJson(field(fd, "objections")),
      active: boolField(fd, "active"),
    },
  };
}

const productoRepetido = (name: string) => `Ya hay un producto llamado "${name}" en esta marca. Edítalo o usa otro nombre.`;

export async function crearProducto(formData: FormData): Promise<CatalogActionResult> {
  if (!productCatalogEnabled()) return { error: CATALOGO_APAGADO };
  const user = await requirePermission("brands.edit");
  const read = readProductFields(formData);
  if ("error" in read) return { error: read.error };
  const brandId = field(formData, "brandId");

  return conConflictoLegible(() => withMutation(user, false, async (tx, afterCommit): Promise<CatalogActionResult> => {
    assertBrandPermission(user, brandId, "brands.edit");
    const brand = await tx.brand.findUnique({ where: { id: brandId }, select: { id: true, name: true } });
    if (!brand) return { error: "La marca ya no existe. Recarga la página." };

    const slot = await catalogSlot(read.data.name, (root) =>
      tx.brandProduct.findMany({ where: { brandId: brand.id, slug: { startsWith: root } }, select: SLOT_SELECT }));
    if (!slot) return { error: "Escribe el nombre con letras o números." };
    if (slot.existing) return { error: productoRepetido(slot.existing.name) };

    const last = await tx.brandProduct.findFirst({ where: { brandId: brand.id }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
    const product = await tx.brandProduct.create({
      data: { ...read.data, brandId: brand.id, slug: slot.slug, sortOrder: (last?.sortOrder ?? -1) + 1 },
      select: { id: true, name: true },
    });

    await auditInTransaction(tx, {
      user,
      action: "CREAR",
      entity: "BrandProduct",
      entityId: product.id,
      brandId: brand.id,
      summary: `Creó el producto "${product.name}" en ${brand.name}`,
    });

    afterCommit(() => revalidateCatalog(brand.id));
  }), productoRepetido(read.data.name));
}

export async function actualizarProducto(formData: FormData): Promise<CatalogActionResult> {
  if (!productCatalogEnabled()) return { error: CATALOGO_APAGADO };
  const user = await requirePermission("brands.edit");
  const read = readProductFields(formData);
  if ("error" in read) return { error: read.error };
  const id = field(formData, "id");

  return conConflictoLegible(() => withMutation(user, false, async (tx, afterCommit): Promise<CatalogActionResult> => {
    await lockRevision(tx, "BrandProduct", id, formData);
    const before = await tx.brandProduct.findUniqueOrThrow({ where: { id } });
    assertBrandPermission(user, before.brandId, "brands.edit");

    const data: ProductWrite = { ...read.data };
    if (data.name !== before.name) {
      const slot = await catalogSlot(data.name, (root) =>
        tx.brandProduct.findMany({ where: { brandId: before.brandId, slug: { startsWith: root } }, select: SLOT_SELECT }), id);
      if (!slot) return { error: "Escribe el nombre con letras o números." };
      if (slot.existing) return { error: productoRepetido(slot.existing.name) };
      if (slot.slug !== before.slug) data.slug = slot.slug;
    }

    await tx.brandProduct.update({ where: { id }, data });

    await auditInTransaction(tx, {
      user,
      action: "EDITAR",
      entity: "BrandProduct",
      entityId: id,
      brandId: before.brandId,
      summary: `Editó el producto "${data.name}"`,
      changes: diffFields(before, data, PRODUCT_LABELS),
    });

    // El tipo de un combo sale de sus productos: se recalcula en la misma transacción.
    if (data.kind !== before.kind) await recalcularTipoDeCombos(tx, user, id, data.name);

    afterCommit(() => revalidateCatalog(before.brandId));
  }), productoRepetido(read.data.name));
}

/** Archiva o reactiva el producto. Archivado no aparece en el generador; no se borra nada. */
export async function archivarProducto(formData: FormData): Promise<CatalogActionResult> {
  if (!productCatalogEnabled()) return { error: CATALOGO_APAGADO };
  const user = await requirePermission("brands.edit");
  const id = field(formData, "id");

  return conConflictoLegible(() => withMutation(user, false, async (tx, afterCommit) => {
    await lockRevision(tx, "BrandProduct", id, formData);
    const before = await tx.brandProduct.findUniqueOrThrow({ where: { id }, select: { id: true, name: true, brandId: true, active: true } });
    assertBrandPermission(user, before.brandId, "brands.edit");

    const active = !before.active;
    await tx.brandProduct.update({ where: { id }, data: { active } });

    await auditInTransaction(tx, {
      user,
      action: "EDITAR",
      entity: "BrandProduct",
      entityId: id,
      brandId: before.brandId,
      summary: active ? `Reactivó el producto "${before.name}"` : `Archivó el producto "${before.name}"`,
      changes: { active: { etiqueta: "Activo", antes: before.active, despues: active } },
    });

    afterCommit(() => revalidateCatalog(before.brandId));
  }), EDIT_CONFLICT);
}

export async function eliminarProducto(formData: FormData): Promise<void> {
  if (!productCatalogEnabled()) throw new Error(CATALOGO_APAGADO);
  const user = await requireLevel(LEVEL.OWNER);
  return withMutation(user, true, async (tx, afterCommit) => {
    const id = field(formData, "id");
    const before = await tx.brandProduct.findUniqueOrThrow({
      where: { id },
      select: { id: true, name: true, brandId: true, _count: { select: { comboItems: true } } },
    });
    // Los combos que lo incluyen se leen antes del borrado para rehacerlos después.
    const combos = await combosDelProducto(tx, id);

    // Sus líneas en combos caen en cascada con la fila.
    await tx.brandProduct.delete({ where: { id } });

    const enCombos = before._count.comboItems;
    await auditInTransaction(tx, {
      user,
      action: "ELIMINAR",
      entity: "BrandProduct",
      entityId: id,
      brandId: before.brandId,
      summary: enCombos
        ? `Eliminó el producto "${before.name}", que estaba en ${enCombos} ${enCombos === 1 ? "combo" : "combos"}`
        : `Eliminó el producto "${before.name}"`,
    });
    await rehacerCombosSinProducto(tx, user, combos, before);

    afterCommit(() => revalidateCatalog(before.brandId));
  });
}

/* --------------------------------------------------------------- COMBOS -- */

const COMBO_LABELS: Record<string, string> = {
  ...FIELD_LABELS,
  name: "Nombre",
  slug: "Identificador",
  kind: "Tipo",
  aiNotes: "Qué debe saber la IA",
  priceLabel: "Precio",
  items: "Productos del combo",
};

const MAX_QUANTITY = 99;

type ComboLine = { productId: string; quantity: number };

/**
 * Productos marcados (formData.getAll("productIds")) y la cantidad de cada uno
 * (campo "quantity-<id>"; vacío cuenta como 1). Conserva el orden del formulario.
 */
function readComboLines(fd: FormData): { lines: ComboLine[] } | { error: string } {
  const ids = [...new Set(fd.getAll("productIds").filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean))];
  if (ids.length < 2) return { error: "Un combo necesita al menos dos productos de la marca." };
  if (ids.length > PRODUCT_LIMITS.listItems) return { error: `Un combo admite hasta ${PRODUCT_LIMITS.listItems} productos.` };
  const lines: ComboLine[] = [];
  for (const productId of ids) {
    if (productId.length > 100) return { error: "Uno de los productos no es válido. Recarga la página." };
    const raw = field(fd, `quantity-${productId}`) || "1";
    const quantity = Number(raw);
    if (!/^\d+$/.test(raw) || quantity < 1 || quantity > MAX_QUANTITY) {
      return { error: `La cantidad de cada producto va de 1 a ${MAX_QUANTITY}.` };
    }
    lines.push({ productId, quantity });
  }
  return { lines };
}

/**
 * Comprueba en la transacción que todos los productos existen, son de la marca
 * del combo y están activos: un producto archivado ya no se vende, así que no
 * entra en un combo (ni el combo que lo incluya se ofrece en el generador).
 */
async function productsForCombo(
  tx: AppTransaction,
  brandId: string,
  lines: ComboLine[],
): Promise<{ products: Map<string, { id: string; name: string; kind: string }> } | { error: string }> {
  const rows = await tx.brandProduct.findMany({
    where: { brandId, id: { in: lines.map((line) => line.productId) } },
    select: { id: true, name: true, kind: true, active: true },
  });
  if (rows.length !== lines.length) return { error: PRODUCTOS_AJENOS };
  const archivado = rows.find((row) => !row.active);
  if (archivado) return { error: `"${archivado.name}" está archivado. Reactívalo o quítalo del combo.` };
  return { products: new Map(rows.map((row) => [row.id, row])) };
}

const PRODUCTOS_AJENOS = "Algunos productos ya no existen o no son de esta marca. Recarga la página y vuelve a elegirlos.";

/** Combos que incluyen el producto, con sus líneas (nombre y tipo de cada producto). */
async function combosDelProducto(tx: AppTransaction, productId: string) {
  const lineas = await tx.brandComboItem.findMany({ where: { productId }, select: { comboId: true } });
  if (!lineas.length) return [];
  return tx.brandCombo.findMany({
    where: { id: { in: lineas.map((linea) => linea.comboId) } },
    select: {
      id: true,
      name: true,
      brandId: true,
      kind: true,
      active: true,
      items: {
        orderBy: [{ sortOrder: "asc" }, { productId: "asc" }],
        select: { productId: true, quantity: true, product: { select: { name: true, kind: true } } },
      },
    },
  });
}

type ComboDelProducto = Awaited<ReturnType<typeof combosDelProducto>>[number];
type Actor = Awaited<ReturnType<typeof requirePermission>>;

const tipoDeLineas = (items: { product: { kind: string } }[]) =>
  kindForCombo(items.map((item) => item.product.kind).filter(isProductKind));

/**
 * Tras borrar un producto, cada combo que lo incluía se rehace en la misma
 * transacción: tipo recalculado con los productos que quedan, revisión nueva
 * (un generador abierto con ese combo pide recargar) y archivado si le quedan
 * menos de dos productos, que es el mínimo para crearlo o editarlo. Cada combo
 * deja su EDITAR en la auditoría con los productos de antes y de después.
 */
async function rehacerCombosSinProducto(tx: AppTransaction, user: Actor, combos: ComboDelProducto[], producto: { id: string; name: string }) {
  for (const combo of combos) {
    const quedan = combo.items.filter((item) => item.productId !== producto.id);
    const kind = tipoDeLineas(quedan);
    const active = combo.active && quedan.length >= 2;
    // Siempre se escribe, aunque nada más cambie: la revisión del combo tiene que moverse.
    await tx.brandCombo.update({ where: { id: combo.id }, data: { kind, active } });

    const changes: Record<string, Cambio> = {
      items: {
        etiqueta: COMBO_LABELS.items,
        antes: combo.items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
        despues: quedan.map((item) => ({ productId: item.productId, quantity: item.quantity })),
        verAntes: legible(combo.items.map((item) => ({ quantity: item.quantity, name: item.product.name }))),
        verDespues: legible(quedan.map((item) => ({ quantity: item.quantity, name: item.product.name }))) || "Sin productos",
      },
    };
    if (kind !== combo.kind) changes.kind = { etiqueta: COMBO_LABELS.kind, antes: combo.kind, despues: kind };
    if (active !== combo.active) changes.active = { etiqueta: "Activo", antes: combo.active, despues: active };

    const resto = `${quedan.length} ${quedan.length === 1 ? "producto" : "productos"}`;
    await auditInTransaction(tx, {
      user,
      action: "EDITAR",
      entity: "BrandCombo",
      entityId: combo.id,
      brandId: combo.brandId,
      summary: active !== combo.active
        ? `Archivó el combo "${combo.name}": al eliminar "${producto.name}" le quedan ${resto}`
        : `Quitó "${producto.name}" del combo "${combo.name}" al eliminar el producto`,
      changes,
    });
  }
}

/** Tras cambiar el tipo de un producto, recalcula el de los combos que lo incluyen (solo si cambia). */
async function recalcularTipoDeCombos(tx: AppTransaction, user: Actor, productId: string, productName: string) {
  for (const combo of await combosDelProducto(tx, productId)) {
    const kind = tipoDeLineas(combo.items);
    if (kind === combo.kind) continue;
    await tx.brandCombo.update({ where: { id: combo.id }, data: { kind } });
    await auditInTransaction(tx, {
      user,
      action: "EDITAR",
      entity: "BrandCombo",
      entityId: combo.id,
      brandId: combo.brandId,
      summary: `Recalculó el tipo del combo "${combo.name}" al cambiar el tipo de "${productName}"`,
      changes: { kind: { etiqueta: COMBO_LABELS.kind, antes: combo.kind, despues: kind } },
    });
  }
}

function kindOfLines(lines: ComboLine[], products: Map<string, { kind: string }>): ProductKind {
  const kinds = lines.map((line) => products.get(line.productId)?.kind).filter(isProductKind);
  return kindForCombo(kinds);
}

const legible = (lines: { quantity: number; name: string }[]) =>
  lines.map((line) => `${line.quantity}× ${line.name}`).join(", ");

const comboRepetido = (name: string) => `Ya hay un combo llamado "${name}" en esta marca. Edítalo o usa otro nombre.`;

async function writeComboItems(tx: AppTransaction, comboId: string, brandId: string, lines: ComboLine[]) {
  await tx.brandComboItem.createMany({
    data: lines.map((line, index) => ({ comboId, productId: line.productId, brandId, quantity: line.quantity, sortOrder: index })),
  });
}

export async function crearCombo(formData: FormData): Promise<CatalogActionResult> {
  if (!productCatalogEnabled()) return { error: CATALOGO_APAGADO };
  const user = await requirePermission("brands.edit");
  const base = readBaseFields(formData, "El combo");
  if ("error" in base) return { error: base.error };
  const read = readComboLines(formData);
  if ("error" in read) return { error: read.error };
  const brandId = field(formData, "brandId");

  return conConflictoLegible(() => withMutation(user, false, async (tx, afterCommit): Promise<CatalogActionResult> => {
    assertBrandPermission(user, brandId, "brands.edit");
    const brand = await tx.brand.findUnique({ where: { id: brandId }, select: { id: true, name: true } });
    if (!brand) return { error: "La marca ya no existe. Recarga la página." };

    const checked = await productsForCombo(tx, brand.id, read.lines);
    if ("error" in checked) return { error: checked.error };
    const { products } = checked;

    const slot = await catalogSlot(base.data.name, (root) =>
      tx.brandCombo.findMany({ where: { brandId: brand.id, slug: { startsWith: root } }, select: SLOT_SELECT }));
    if (!slot) return { error: "Escribe el nombre con letras o números." };
    if (slot.existing) return { error: comboRepetido(slot.existing.name) };

    const last = await tx.brandCombo.findFirst({ where: { brandId: brand.id }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
    const combo = await tx.brandCombo.create({
      data: {
        ...base.data,
        brandId: brand.id,
        slug: slot.slug,
        kind: kindOfLines(read.lines, products),
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
      select: { id: true, name: true },
    });
    await writeComboItems(tx, combo.id, brand.id, read.lines);

    await auditInTransaction(tx, {
      user,
      action: "CREAR",
      entity: "BrandCombo",
      entityId: combo.id,
      brandId: brand.id,
      summary: `Creó el combo "${combo.name}" en ${brand.name}: ${legible(read.lines.map((line) => ({ quantity: line.quantity, name: products.get(line.productId)?.name ?? line.productId })))}`,
    });

    afterCommit(() => revalidateCatalog(brand.id));
  }), comboRepetido(base.data.name));
}

/** Edita el combo y reemplaza sus productos en la misma transacción. */
export async function actualizarCombo(formData: FormData): Promise<CatalogActionResult> {
  if (!productCatalogEnabled()) return { error: CATALOGO_APAGADO };
  const user = await requirePermission("brands.edit");
  const base = readBaseFields(formData, "El combo");
  if ("error" in base) return { error: base.error };
  const read = readComboLines(formData);
  if ("error" in read) return { error: read.error };
  const id = field(formData, "id");

  return conConflictoLegible(() => withMutation(user, false, async (tx, afterCommit): Promise<CatalogActionResult> => {
    await lockRevision(tx, "BrandCombo", id, formData);
    const before = await tx.brandCombo.findUniqueOrThrow({
      where: { id },
      include: {
        items: {
          orderBy: [{ sortOrder: "asc" }, { productId: "asc" }],
          select: { productId: true, quantity: true, product: { select: { name: true } } },
        },
      },
    });
    assertBrandPermission(user, before.brandId, "brands.edit");

    const checked = await productsForCombo(tx, before.brandId, read.lines);
    if ("error" in checked) return { error: checked.error };
    const { products } = checked;

    const data: { name: string; aiNotes: string | null; priceLabel: string | null; kind: ProductKind; slug?: string } = {
      ...base.data,
      kind: kindOfLines(read.lines, products),
    };
    if (data.name !== before.name) {
      const slot = await catalogSlot(data.name, (root) =>
        tx.brandCombo.findMany({ where: { brandId: before.brandId, slug: { startsWith: root } }, select: SLOT_SELECT }), id);
      if (!slot) return { error: "Escribe el nombre con letras o números." };
      if (slot.existing) return { error: comboRepetido(slot.existing.name) };
      if (slot.slug !== before.slug) data.slug = slot.slug;
    }

    // Siempre se actualiza la fila: la revisión cambia también cuando solo cambian los productos.
    await tx.brandCombo.update({ where: { id }, data });
    await tx.brandComboItem.deleteMany({ where: { comboId: id } });
    await writeComboItems(tx, id, before.brandId, read.lines);

    const antes = before.items.map((item) => ({ productId: item.productId, quantity: item.quantity }));
    const changes: Record<string, Cambio> = { ...diffFields(before, data, COMBO_LABELS) };
    if (JSON.stringify(antes) !== JSON.stringify(read.lines)) {
      changes.items = {
        etiqueta: COMBO_LABELS.items,
        antes,
        despues: read.lines,
        verAntes: legible(before.items.map((item) => ({ quantity: item.quantity, name: item.product.name }))),
        verDespues: legible(read.lines.map((line) => ({ quantity: line.quantity, name: products.get(line.productId)?.name ?? line.productId }))),
      };
    }

    await auditInTransaction(tx, {
      user,
      action: "EDITAR",
      entity: "BrandCombo",
      entityId: id,
      brandId: before.brandId,
      summary: `Editó el combo "${data.name}"`,
      changes: Object.keys(changes).length ? changes : null,
    });

    afterCommit(() => revalidateCatalog(before.brandId));
  }), comboRepetido(base.data.name));
}

/** Archiva o reactiva el combo. Archivado no aparece en el generador. */
export async function archivarCombo(formData: FormData): Promise<CatalogActionResult> {
  if (!productCatalogEnabled()) return { error: CATALOGO_APAGADO };
  const user = await requirePermission("brands.edit");
  const id = field(formData, "id");

  return conConflictoLegible(() => withMutation(user, false, async (tx, afterCommit) => {
    await lockRevision(tx, "BrandCombo", id, formData);
    const before = await tx.brandCombo.findUniqueOrThrow({ where: { id }, select: { id: true, name: true, brandId: true, active: true } });
    assertBrandPermission(user, before.brandId, "brands.edit");

    const active = !before.active;
    await tx.brandCombo.update({ where: { id }, data: { active } });

    await auditInTransaction(tx, {
      user,
      action: "EDITAR",
      entity: "BrandCombo",
      entityId: id,
      brandId: before.brandId,
      summary: active ? `Reactivó el combo "${before.name}"` : `Archivó el combo "${before.name}"`,
      changes: { active: { etiqueta: "Activo", antes: before.active, despues: active } },
    });

    afterCommit(() => revalidateCatalog(before.brandId));
  }), EDIT_CONFLICT);
}

export async function eliminarCombo(formData: FormData): Promise<void> {
  if (!productCatalogEnabled()) throw new Error(CATALOGO_APAGADO);
  const user = await requireLevel(LEVEL.OWNER);
  return withMutation(user, true, async (tx, afterCommit) => {
    const id = field(formData, "id");
    const before = await tx.brandCombo.findUniqueOrThrow({ where: { id }, select: { id: true, name: true, brandId: true } });

    // Sus líneas caen en cascada; los productos no se tocan.
    await tx.brandCombo.delete({ where: { id } });

    await auditInTransaction(tx, {
      user,
      action: "ELIMINAR",
      entity: "BrandCombo",
      entityId: id,
      brandId: before.brandId,
      summary: `Eliminó el combo "${before.name}"`,
    });

    afterCommit(() => revalidateCatalog(before.brandId));
  });
}

/* ------------------------------------------------------ GUARDADO RÁPIDO -- */

export type GuardarProductoRapidoResult = { ok: true; product: CatalogProduct } | { ok: false; error: string };

/**
 * "Cargar un nuevo producto" desde el paso 2 del generador. Idempotente por
 * (marca, slug): si el mismo nombre (sin tildes ni mayúsculas) ya existe y está
 * activo, devuelve esa ficha sin duplicarla; si está archivado, lo avisa.
 * Va aparte de generarGuion para no mezclar escrituras con la cola.
 */
export async function guardarProductoRapido(input: {
  brandId: string;
  name: string;
  kind: ProductKind;
  aiNotes: string;
}): Promise<GuardarProductoRapidoResult> {
  if (!productCatalogEnabled()) return { ok: false, error: "El catálogo de productos no está activo." };
  const user = await requirePermission("brands.edit");

  const brandId = typeof input?.brandId === "string" ? input.brandId.trim() : "";
  const name = typeof input?.name === "string" ? input.name.replace(/\s+/g, " ").trim() : "";
  const aiNotes = typeof input?.aiNotes === "string" ? input.aiNotes.trim() : "";
  const kind = input?.kind;

  if (!brandId) return { ok: false, error: "Elige la marca antes de guardar el producto." };
  if (!name) return { ok: false, error: "El producto necesita un nombre." };
  if (name.length > PRODUCT_LIMITS.name) return { ok: false, error: `El nombre admite hasta ${PRODUCT_LIMITS.name} caracteres.` };
  if (!isProductKind(kind)) return { ok: false, error: "Elige si es un producto, un servicio o un restaurante." };
  if (aiNotes.length > PRODUCT_LIMITS.aiNotes) {
    return { ok: false, error: `"Qué debe saber la IA" admite hasta ${PRODUCT_LIMITS.aiNotes} caracteres.` };
  }
  if (!slugify(name)) return { ok: false, error: "Escribe el nombre con letras o números." };

  try {
    assertBrandPermission(user, brandId, "brands.edit");
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No tienes acceso a esta marca." };
  }

  try {
    return await withMutation(user, false, async (tx, afterCommit): Promise<GuardarProductoRapidoResult> => {
      assertBrandPermission(user, brandId, "brands.edit");

      const brand = await tx.brand.findUnique({ where: { id: brandId }, select: { id: true, name: true } });
      if (!brand) return { ok: false, error: "La marca ya no existe. Recarga la página." };

      const slot = await catalogSlot(name, (root) =>
        tx.brandProduct.findMany({ where: { brandId, slug: { startsWith: root } }, select: QUICK_SLOT_SELECT }));
      if (!slot) return { ok: false, error: "Escribe el nombre con letras o números." };
      if (slot.existing) {
        if (!slot.existing.active) {
          return { ok: false, error: `"${slot.existing.name}" ya está en el catálogo, pero archivado. Actívalo desde la marca para usarlo.` };
        }
        return { ok: true, product: toCatalogProduct(slot.existing) };
      }

      const last = await tx.brandProduct.findFirst({
        where: { brandId },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });
      const product = await tx.brandProduct.create({
        data: { brandId, name, slug: slot.slug, kind, aiNotes: aiNotes || null, sortOrder: (last?.sortOrder ?? -1) + 1 },
        select: CATALOG_PRODUCT_SELECT,
      });

      await auditInTransaction(tx, {
        user,
        action: "CREAR",
        entity: "BrandProduct",
        entityId: product.id,
        brandId: brand.id,
        summary: `Creó el producto "${product.name}" en ${brand.name} desde el generador`,
      });

      afterCommit(() => revalidateCatalog(brand.id));
      return { ok: true, product: toCatalogProduct(product) };
    });
  } catch (error) {
    // Dos envíos simultáneos con el mismo nombre: gana uno y el otro recibe esa misma ficha.
    if (esConflictoDeUnicidad(error) || (error instanceof Error && error.message === EDIT_CONFLICT)) {
      const slot = await catalogSlot(name, (root) =>
        prisma.brandProduct.findMany({ where: { brandId, slug: { startsWith: root } }, select: QUICK_SLOT_SELECT }));
      if (slot?.existing?.active) return { ok: true, product: toCatalogProduct(slot.existing) };
    }
    if (error instanceof SecurityError || (error instanceof Error && error.message === EDIT_CONFLICT)) {
      return { ok: false, error: error.message };
    }
    console.error("[productos] no se pudo guardar el producto desde el generador:", error);
    return { ok: false, error: "No se pudo guardar el producto. Intenta de nuevo; el texto del formulario se conserva." };
  }
}
