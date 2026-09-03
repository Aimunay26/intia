"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { borrarAssetsDe } from "@/lib/assets-cleanup";
import { requireLevel, LEVEL } from "@/lib/auth";
import { logAudit, diffFields, FIELD_LABELS } from "@/lib/audit";
import {
  field,
  fieldOrNull,
  numField,
  intField,
  boolField,
  dateField,
  linesToJson,
  slugify,
} from "@/lib/utils";

/**
 * Acciones de marcas y de sus objetivos.
 *
 * Reglas del contrato aplicadas aqui:
 *  - crear / editar marca y objetivos: LEVEL.MEMBER
 *  - eliminar marca: LEVEL.OWNER
 *  - toda escritura deja rastro en el log de auditoria
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
async function uniqueSlug(base: string, ignoreId?: string): Promise<string> {
  const root = slugify(base) || "marca";
  let candidate = root;

  for (let n = 2; n < 500; n++) {
    const found = await prisma.brand.findUnique({
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

/* ----------------------------------------------------------------- CREAR -- */

export async function crearMarca(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);

  const name = field(formData, "name");
  if (!name) throw new Error("La marca necesita un nombre.");

  const brand = await prisma.brand.create({
    data: {
      name,
      slug: await uniqueSlug(name),
      ...readBrandFields(formData),
    },
  });

  await logAudit({
    user,
    action: "CREAR",
    entity: "Brand",
    entityId: brand.id,
    brandId: brand.id,
    summary: `Creó la marca "${brand.name}"`,
  });

  revalidateBrand(brand.id);
  redirect(`/marcas/${brand.id}`);
}

/* ------------------------------------------------------------ ACTUALIZAR -- */

export async function actualizarMarca(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);

  const id = field(formData, "id");
  const before = await prisma.brand.findUniqueOrThrow({ where: { id } });

  const name = field(formData, "name") || before.name;

  const data: BrandWrite = {
    name,
    ...readBrandFields(formData, before),
  };
  if (name !== before.name) {
    data.slug = await uniqueSlug(name, id);
  }

  await prisma.brand.update({ where: { id }, data });

  await logAudit({
    user,
    action: "EDITAR",
    entity: "Brand",
    entityId: id,
    brandId: id,
    summary: `Editó la marca "${name}"`,
    changes: diffFields(before, data, BRAND_LABELS),
  });

  revalidateBrand(id);
}

/* -------------------------------------------------------------- ARCHIVAR -- */

/** Archiva o reactiva la marca. No borra nada. */
export async function archivarMarca(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);

  const id = field(formData, "id");
  const before = await prisma.brand.findUniqueOrThrow({
    where: { id },
    select: { id: true, name: true, archived: true },
  });

  const archived = !before.archived;

  await prisma.brand.update({
    where: { id },
    data: { archived, active: !archived },
  });

  await logAudit({
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

  revalidateBrand(id);
}

/* -------------------------------------------------------------- ELIMINAR -- */

export async function eliminarMarca(formData: FormData) {
  const user = await requireLevel(LEVEL.OWNER);

  const id = field(formData, "id");
  const before = await prisma.brand.findUniqueOrThrow({
    where: { id },
    select: { id: true, name: true, _count: { select: { content: true, objectives: true } } },
  });

  await borrarAssetsDe("brand", id);
  await prisma.brand.delete({ where: { id } });

  await logAudit({
    user,
    action: "ELIMINAR",
    entity: "Brand",
    entityId: id,
    brandId: id,
    summary: `Eliminó la marca "${before.name}" con sus ${before._count.content} videos y ${before._count.objectives} objetivos`,
  });

  revalidatePath("/marcas");
  revalidatePath("/");
  redirect("/marcas");
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
    period: field(fd, "period") || "MENSUAL",
    deadline: dateField(fd, "deadline"),
    status: field(fd, "status") || "EN_CURSO",
    higherIsBetter: boolField(fd, "higherIsBetter"),
    sortOrder: intField(fd, "sortOrder", 0),
  };
}

export async function crearObjetivo(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);

  const brandId = field(formData, "brandId");
  const brand = await prisma.brand.findUniqueOrThrow({
    where: { id: brandId },
    select: { id: true, name: true },
  });

  const data = readObjectiveFields(formData);
  if (!data.name) throw new Error("El objetivo necesita un nombre.");

  const objective = await prisma.brandObjective.create({
    data: { ...data, brandId: brand.id },
  });

  await logAudit({
    user,
    action: "CREAR",
    entity: "BrandObjective",
    entityId: objective.id,
    brandId: brand.id,
    summary: `Creó el objetivo "${objective.name}" en ${brand.name}`,
  });

  revalidateBrand(brand.id);
}

export async function actualizarObjetivo(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);

  const id = field(formData, "id");
  const before = await prisma.brandObjective.findUniqueOrThrow({ where: { id } });

  const data = readObjectiveFields(formData);
  if (!data.name) data.name = before.name;

  await prisma.brandObjective.update({ where: { id }, data });

  await logAudit({
    user,
    action: "EDITAR",
    entity: "BrandObjective",
    entityId: id,
    brandId: before.brandId,
    summary: `Editó el objetivo "${data.name}"`,
    changes: diffFields(before, data, OBJECTIVE_LABELS),
  });

  revalidateBrand(before.brandId);
}

export async function eliminarObjetivo(formData: FormData) {
  const user = await requireLevel(LEVEL.OWNER);

  const id = field(formData, "id");
  const before = await prisma.brandObjective.findUniqueOrThrow({
    where: { id },
    select: { id: true, name: true, brandId: true },
  });

  await prisma.brandObjective.delete({ where: { id } });

  await logAudit({
    user,
    action: "ELIMINAR",
    entity: "BrandObjective",
    entityId: id,
    brandId: before.brandId,
    summary: `Eliminó el objetivo "${before.name}"`,
  });

  revalidateBrand(before.brandId);
}
