"use server";
import { assertBrandPermission } from "@/lib/permissions";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { borrarAssetsDe } from "@/lib/assets-cleanup";
import { auditInTransaction, diffFields, FIELD_LABELS } from "@/lib/audit";
import { LEVEL, requireLevel, requirePermission, type SessionUser } from "@/lib/auth";
import {
  guardarDocumentoImportado,
  leerArchivoOpcional,
  prepararArchivoPrivado,
  type DocumentoPreparado,
} from "@/lib/asset-import";
import { OBJECTIVE_PERIODS, OBJECTIVE_STATUS_MAP } from "@/lib/constants";
import { lockRevision, withMutation } from "@/lib/mutations";
import { MAX_UPLOAD_BYTES } from "@/lib/pdf";
import { type AppTransaction } from "@/lib/prisma";
import {
	boolField,
	dateField,
	field,
	fieldOrNull,
	intField,
	linesToJson,
	numField,
	slugify,
} from "@/lib/utils";
import { boundedNumber, choice, enumField } from "@/lib/validation";

/**
 * Acciones de marcas y de sus objetivos.
 *
 * Reglas del contrato aplicadas aqui:
 *  - crear / eliminar marca: LEVEL.OWNER
 *  - editar marca y objetivos: capacidad brands.edit sobre una marca autorizada
 *  - toda escritura deja rastro en el log de auditoria, en la misma transacción
 */

/* ---------------------------------------------------------------- APOYOS -- */

const BRAND_LABELS: Record<string, string> = {
  ...FIELD_LABELS,
  name: "Nombre",
  slug: "Slug",
  tagline: "Lema",
  valueProps: "Propuestas de valor",
  doNots: "Prohibiciones",
  keywords: "Palabras clave",
  website: "Web",
  instagram: "Instagram",
  tiktok: "TikTok",
  whatsapp: "WhatsApp",
  archived: "Archivada",
};

const OBJECTIVE_LABELS: Record<string, string> = {
  ...FIELD_LABELS,
  name: "Nombre",
  description: "Descripción",
  metricKey: "Métrica",
  unit: "Unidad",
  currentValue: "Valor actual",
  targetValue: "Meta",
  baselineValue: "Punto de partida",
  period: "Periodo",
  deadline: "Fecha límite",
  status: "Estado",
  higherIsBetter: "Más es mejor",
  sortOrder: "Orden",
};

const HEX = /^#[0-9a-fA-F]{6}$/;

function colorField(fd: FormData, name: string, fallback: string): string {
  const value = field(fd, name);
  return HEX.test(value) ? value.toLowerCase() : fallback;
}

/** Devuelve un slug libre. Si "con-amor" existe, prueba "con-amor-2", "-3"... */
async function uniqueSlug(tx: AppTransaction, base: string, ignoreId?: string): Promise<string> {
  const root = slugify(base) || "marca";
  let candidate = root;

  for (let n = 2; n < 500; n++) {
    const found = await tx.brand.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!found || found.id === ignoreId) return candidate;
    candidate = `${root}-${n}`;
  }
  return `${root}-${Date.now()}`;
}

function revalidateBrand(id: string) {
  revalidatePath("/marcas");
  revalidatePath(`/marcas/${id}`);
  revalidatePath("/");
}

type BrandWrite = {
  name?: string;
  slug?: string;
  tagline?: string | null;
  description?: string | null;
  identity?: string | null;
  brief?: string | null;
  toneOfVoice?: string | null;
  audience?: string | null;
  valueProps?: string;
  doNots?: string;
  keywords?: string;
  colorPrimary?: string;
  colorSecondary?: string;
  colorAccent?: string;
  website?: string | null;
  instagram?: string | null;
  tiktok?: string | null;
  whatsapp?: string | null;
};

const TEXT_KEYS = [
  "tagline",
  "description",
  "identity",
  "brief",
  "toneOfVoice",
  "audience",
  "website",
  "instagram",
  "tiktok",
  "whatsapp",
] as const;

/**
 * Lee solo los campos que vienen realmente en el formulario.
 * Asi el formulario corto de "Nueva marca" no borra lo que no muestra.
 */
function readBrandFields(
  fd: FormData,
  current?: { colorPrimary: string; colorSecondary: string; colorAccent: string }
): BrandWrite {
  const out: BrandWrite = {};

  for (const key of TEXT_KEYS) {
    if (fd.has(key)) out[key] = fieldOrNull(fd, key);
  }
  if (fd.has("valueProps")) out.valueProps = linesToJson(field(fd, "valueProps"));
  if (fd.has("doNots")) out.doNots = linesToJson(field(fd, "doNots"));
  if (fd.has("keywords")) out.keywords = linesToJson(field(fd, "keywords"));

  if (fd.has("colorPrimary")) {
    out.colorPrimary = colorField(fd, "colorPrimary", current?.colorPrimary ?? "#ec4899");
  }
  if (fd.has("colorSecondary")) {
    out.colorSecondary = colorField(fd, "colorSecondary", current?.colorSecondary ?? "#8b5cf6");
  }
  if (fd.has("colorAccent")) {
    out.colorAccent = colorField(fd, "colorAccent", current?.colorAccent ?? "#f59e0b");
  }

  return out;
}

/* ------------------------------------------------------------ DOCUMENTOS -- */

/**
 * El formulario de marca puede traer el brief maestro (campo de archivo
 * «briefPdf») y el informe de branding (campo «brandingPdf»). Los nombres no
 * coinciden con ninguna columna a propósito: el textarea del brief permanente
 * se llama «brief», y un input de archivo con ese mismo nombre lo pisaría en
 * el FormData (readBrandFields leería un File y lo guardaría como null).
 *
 * Los campos de la ficha ya vienen rellenados desde la previsualización; aquí
 * solo se guardan los PDF como Asset con su etiqueta y su auditoría SUBIR.
 *
 * Se leen, validan y suben al almacenamiento privado ANTES de la transacción:
 * un PDF inválido no puede dejar la marca a medias, y el Blob hace red, que
 * no cabe dentro de una transacción serializable. Dentro solo se adjuntan.
 */
const CAMPOS_PDF = [
  { tipo: "brief", campo: "briefPdf" },
  { tipo: "branding", campo: "brandingPdf" },
] as const;

async function prepararDocumentosDeMarca(formData: FormData): Promise<DocumentoPreparado[]> {
  const leidos: Omit<DocumentoPreparado, "blobId">[] = [];
  for (const { tipo, campo } of CAMPOS_PDF) {
    const lectura = await leerArchivoOpcional(formData, campo);
    if (!lectura) continue;
    if (!lectura.ok) throw new Error(lectura.error);
    leidos.push({ tipo, archivo: lectura.archivo });
  }
  // Los dos viajan en el mismo cuerpo: el tope por archivo no basta. El
  // formulario ya lo impide; esto es la red de seguridad del servidor.
  const total = leidos.reduce((suma, d) => suma + d.archivo.size, 0);
  if (total > MAX_UPLOAD_BYTES) {
    throw new Error(
      "Los dos PDF juntos superan los 4 MB por guardado. Guarda la ficha con uno y sube el otro desde la pestaña Documentos."
    );
  }
  const out: DocumentoPreparado[] = [];
  for (const doc of leidos) out.push({ ...doc, blobId: await prepararArchivoPrivado(doc.archivo) });
  return out;
}

async function guardarDocumentosDeMarca(
  tx: AppTransaction,
  user: SessionUser,
  brandId: string,
  documentos: DocumentoPreparado[]
) {
  for (const { tipo, archivo, blobId } of documentos) {
    await guardarDocumentoImportado(tx, { tipo, ownerType: "brand", ownerId: brandId, archivo, blobId, user });
  }
}

function resumenDesdeDocumentos(verbo: string, name: string, documentos: DocumentoPreparado[]): string {
  return documentos.length
    ? `${verbo} la marca "${name}" desde ${documentos.map((d) => `«${d.archivo.name}»`).join(" y ")}`
    : `${verbo} la marca "${name}"`;
}

/* ----------------------------------------------------------------- CREAR -- */

export async function crearMarca(formData: FormData) {
  const user = await requireLevel(LEVEL.OWNER);

  const name = field(formData, "name");
  if (!name) throw new Error("La marca necesita un nombre.");

  const documentos = await prepararDocumentosDeMarca(formData);

  return withMutation(user, false, async (tx, afterCommit) => {
    const brand = await tx.brand.create({
      data: {
        name,
        slug: await uniqueSlug(tx, name),
        ...readBrandFields(formData),
      },
    });

    await auditInTransaction(tx, {
      user,
      action: "CREAR",
      entity: "Brand",
      entityId: brand.id,
      brandId: brand.id,
      summary: resumenDesdeDocumentos("Creó", brand.name, documentos),
    });

    await guardarDocumentosDeMarca(tx, user, brand.id, documentos);

    afterCommit(() => {
      revalidateBrand(brand.id);
      revalidatePath("/actividad");
    });
    afterCommit(() => redirect(`/marcas/${brand.id}`));
  });
}

/* ------------------------------------------------------------ ACTUALIZAR -- */

export async function actualizarMarca(formData: FormData) {
  const user = await requirePermission("brands.edit");
  const id = field(formData, "id");
  assertBrandPermission(user, id, "brands.edit");

  const documentos = await prepararDocumentosDeMarca(formData);

  return withMutation(user, false, async (tx, afterCommit) => {
    await lockRevision(tx, "Brand", id, formData);
    const before = await tx.brand.findUniqueOrThrow({ where: { id } });

    const name = field(formData, "name") || before.name;

    const data: BrandWrite = {
      name,
      ...readBrandFields(formData, before),
    };
    if (name !== before.name) {
      data.slug = await uniqueSlug(tx, name, id);
    }

    await tx.brand.update({ where: { id }, data });

    await auditInTransaction(tx, {
      user,
      action: "EDITAR",
      entity: "Brand",
      entityId: id,
      brandId: id,
      summary: resumenDesdeDocumentos("Editó", name, documentos),
      changes: diffFields(before, data, BRAND_LABELS),
    });

    await guardarDocumentosDeMarca(tx, user, id, documentos);

    afterCommit(() => {
      revalidateBrand(id);
      revalidatePath("/actividad");
    });
  });
}

/* -------------------------------------------------------------- ARCHIVAR -- */

/** Archiva o reactiva la marca. No borra nada. */
export async function archivarMarca(formData: FormData) {
  const user = await requireLevel(LEVEL.OWNER);
  return withMutation(user, false, async (tx, afterCommit) => {

    const id = field(formData, "id");
    await lockRevision(tx, "Brand", id, formData);
    const before = await tx.brand.findUniqueOrThrow({
      where: { id },
      select: { id: true, name: true, archived: true },
    });

    const archived = !before.archived;

    await tx.brand.update({
      where: { id },
      data: { archived, active: !archived },
    });

    await auditInTransaction(tx, {
      user,
      action: "EDITAR",
      entity: "Brand",
      entityId: id,
      brandId: id,
      summary: archived
        ? `Archivó la marca "${before.name}"`
        : `Reactivó la marca "${before.name}"`,
      changes: {
        archived: { etiqueta: "Archivada", antes: before.archived, despues: archived },
      },
    });

    afterCommit(() => revalidateBrand(id));
  });
}

/* -------------------------------------------------------------- ELIMINAR -- */

export async function eliminarMarca(formData: FormData) {
  const user = await requireLevel(LEVEL.OWNER);
  return withMutation(user, true, async (tx, afterCommit) => {

    const id = field(formData, "id");
    const before = await tx.brand.findUniqueOrThrow({
      where: { id },
      select: { id: true, name: true, _count: { select: { content: true, objectives: true } } },
    });

    await borrarAssetsDe("brand", id, tx);
    await tx.brand.delete({ where: { id } });

    await auditInTransaction(tx, {
      user,
      action: "ELIMINAR",
      entity: "Brand",
      entityId: id,
      brandId: id,
      summary: `Eliminó la marca "${before.name}" con sus ${before._count.content} videos y ${before._count.objectives} objetivos`,
    });

    afterCommit(() => revalidatePath("/marcas"));
    afterCommit(() => revalidatePath("/"));
    afterCommit(() => redirect("/marcas"));
  });
}

/* ------------------------------------------------------------ OBJETIVOS -- */

type ObjectiveWrite = {
  name: string;
  description: string | null;
  metricKey: string | null;
  unit: string;
  currentValue: number;
  targetValue: number;
  baselineValue: number;
  period: string;
  deadline: Date | null;
  status: string;
  higherIsBetter: boolean;
  sortOrder: number;
};

function readObjectiveFields(fd: FormData): ObjectiveWrite {
  return {
    name: field(fd, "name"),
    description: fieldOrNull(fd, "description"),
    metricKey: fieldOrNull(fd, "metricKey"),
    unit: field(fd, "unit"),
    currentValue: numField(fd, "currentValue", 0),
    targetValue: numField(fd, "targetValue", 0),
    baselineValue: numField(fd, "baselineValue", 0),
    period: choice(field(fd, "period") || "MENSUAL", OBJECTIVE_PERIODS.map(p => p.value), "Periodo"),
    deadline: dateField(fd, "deadline"),
    status: enumField(fd, "status", OBJECTIVE_STATUS_MAP, "EN_CURSO"),
    higherIsBetter: boolField(fd, "higherIsBetter"),
    sortOrder: boundedNumber(intField(fd, "sortOrder", 0), 0, 2147483647, "Orden", true),
  };
}

export async function crearObjetivo(formData: FormData) {
  const user = await requirePermission("brands.edit");
  return withMutation(user, false, async (tx, afterCommit) => {
    assertBrandPermission(user, field(formData, "brandId"), "brands.edit");

    const brandId = field(formData, "brandId");
    const brand = await tx.brand.findUniqueOrThrow({
      where: { id: brandId },
      select: { id: true, name: true },
    });

    const data = readObjectiveFields(formData);
    if (!data.name) throw new Error("El objetivo necesita un nombre.");

    const objective = await tx.brandObjective.create({
      data: { ...data, brandId: brand.id },
    });

    await auditInTransaction(tx, {
      user,
      action: "CREAR",
      entity: "BrandObjective",
      entityId: objective.id,
      brandId: brand.id,
      summary: `Creó el objetivo "${objective.name}" en ${brand.name}`,
    });

    afterCommit(() => revalidateBrand(brand.id));
  });
}

export async function actualizarObjetivo(formData: FormData) {
  const user = await requirePermission("brands.edit");
  return withMutation(user, false, async (tx, afterCommit) => {

    const id = field(formData, "id");
    await lockRevision(tx, "BrandObjective", id, formData);
    const before = await tx.brandObjective.findUniqueOrThrow({ where: { id } });
    assertBrandPermission(user, before.brandId, "brands.edit");

    const data = readObjectiveFields(formData);
    if (!data.name) data.name = before.name;

    await tx.brandObjective.update({ where: { id }, data });

    await auditInTransaction(tx, {
      user,
      action: "EDITAR",
      entity: "BrandObjective",
      entityId: id,
      brandId: before.brandId,
      summary: `Editó el objetivo "${data.name}"`,
      changes: diffFields(before, data, OBJECTIVE_LABELS),
    });

    afterCommit(() => revalidateBrand(before.brandId));
  });
}

export async function eliminarObjetivo(formData: FormData) {
  const user = await requireLevel(LEVEL.OWNER);
  return withMutation(user, true, async (tx, afterCommit) => {

    const id = field(formData, "id");
    const before = await tx.brandObjective.findUniqueOrThrow({
      where: { id },
      select: { id: true, name: true, brandId: true },
    });

    await tx.brandObjective.delete({ where: { id } });

    await auditInTransaction(tx, {
      user,
      action: "ELIMINAR",
      entity: "BrandObjective",
      entityId: id,
      brandId: before.brandId,
      summary: `Eliminó el objetivo "${before.name}"`,
    });

    afterCommit(() => revalidateBrand(before.brandId));
  });
}
