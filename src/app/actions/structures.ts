"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { borrarAssetsDe } from "@/lib/assets-cleanup";
import { requireLevel, LEVEL } from "@/lib/auth";
import { logAudit, diffFields, FIELD_LABELS } from "@/lib/audit";
import { AI_PROVIDERS, STRUCTURE_CATEGORIES } from "@/lib/constants";
import {
  boolField,
  clamp,
  field,
  fieldOrNull,
  intField,
  linesToJson,
  numField,
  parseJson,
  slugify,
} from "@/lib/utils";

/**
 * Estructuras: los formatos de guion que ya funcionaron.
 * Son globales (sirven para todas las marcas) y son la mitad del afinado
 * de la IA: beats + reglas + ejemplos + prompt propio + PDFs de referencia.
 */

export type Beat = { name: string; goal?: string; seconds?: number; notes?: string };
export type Example = { title: string; text: string };

export type StructureState = { ok?: string; error?: string } | null;

/* ------------------------------------------------------------- AYUDANTES -- */

const CATEGORY_VALUES = STRUCTURE_CATEGORIES.map((c) => c.value);
const PROVIDER_VALUES = AI_PROVIDERS.map((p) => p.value);

function safeCategory(value: string) {
  return CATEGORY_VALUES.includes(value) ? value : "VENDE";
}

function safeProvider(value: string) {
  return PROVIDER_VALUES.includes(value) ? value : "anthropic";
}

/** Genera un slug que no choque con ninguna otra estructura. */
async function uniqueSlug(base: string, ignoreId?: string) {
  const root = slugify(base) || "estructura";
  let candidate = root;
  let n = 2;
  // Se corta solo: siempre encuentra hueco anadiendo un numero.
  for (;;) {
    const found = await prisma.structure.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!found || found.id === ignoreId) return candidate;
    candidate = `${root}-${n}`;
    n += 1;
  }
}

function revalidateStructure(id?: string) {
  revalidatePath("/estructuras");
  if (id) revalidatePath(`/estructuras/${id}`);
  revalidatePath("/generador");
}

/** Limpia y tipa los beats que llegan del editor como JSON. */
function readBeats(raw: string): Beat[] {
  const parsed = parseJson<unknown>(raw, []);
  if (!Array.isArray(parsed)) return [];

  const out: Beat[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;

    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (!name) continue;

    const beat: Beat = { name };

    const goal = typeof row.goal === "string" ? row.goal.trim() : "";
    if (goal) beat.goal = goal;

    const notes = typeof row.notes === "string" ? row.notes.trim() : "";
    if (notes) beat.notes = notes;

    const rawSeconds = typeof row.seconds === "number" ? row.seconds : Number(row.seconds);
    const seconds = Number.isFinite(rawSeconds) ? Math.round(rawSeconds) : 0;
    if (seconds > 0) beat.seconds = clamp(seconds, 1, 600);

    out.push(beat);
  }
  return out;
}

/** Limpia y tipa los ejemplos ganadores que llegan del editor. */
function readExamples(raw: string): Example[] {
  const parsed = parseJson<unknown>(raw, []);
  if (!Array.isArray(parsed)) return [];

  const out: Example[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;

    const title = typeof row.title === "string" ? row.title.trim() : "";
    const text = typeof row.text === "string" ? row.text.trim() : "";
    if (!text) continue;

    out.push({ title: title || "Ejemplo sin título", text });
  }
  return out;
}

/* ----------------------------------------------------------------- CREAR -- */

export async function crearEstructura(
  _prev: StructureState,
  formData: FormData
): Promise<StructureState> {
  const user = await requireLevel(LEVEL.MEMBER);

  const name = field(formData, "name");
  if (!name) return { error: "Ponle un nombre a la estructura." };

  const provider = safeProvider(field(formData, "defaultProvider"));

  const created = await prisma.structure.create({
    data: {
      name,
      slug: await uniqueSlug(name),
      category: safeCategory(field(formData, "category")),
      family: fieldOrNull(formData, "family"),
      summary: fieldOrNull(formData, "summary"),
      active: boolField(formData, "active"),
      defaultDurationSec: clamp(intField(formData, "defaultDurationSec", 45), 5, 600),
      defaultProvider: provider,
      defaultModel: field(formData, "defaultModel"),
      temperature: clamp(numField(formData, "temperature", 1), 0, 2),
    },
    select: { id: true, name: true, category: true },
  });

  await logAudit({
    user,
    action: "CREAR",
    entity: "Structure",
    entityId: created.id,
    summary: `Creó la estructura "${created.name}"`,
  });

  revalidateStructure(created.id);
  redirect(`/estructuras/${created.id}?vista=beats`);
}

/* ------------------------------------------------------------ ACTUALIZAR -- */

export async function actualizarEstructura(
  _prev: StructureState,
  formData: FormData
): Promise<StructureState> {
  const user = await requireLevel(LEVEL.MEMBER);

  const id = field(formData, "id");
  const name = field(formData, "name");
  if (!id) return { error: "No se pudo identificar la estructura." };
  if (!name) return { error: "Ponle un nombre a la estructura." };

  const before = await prisma.structure.findUnique({
    where: { id },
    select: {
      name: true,
      slug: true,
      category: true,
      family: true,
      summary: true,
      active: true,
      defaultDurationSec: true,
      defaultProvider: true,
      defaultModel: true,
      temperature: true,
    },
  });
  if (!before) return { error: "Esa estructura ya no existe." };

  const data = {
    name,
    slug: before.name === name ? before.slug : await uniqueSlug(name, id),
    category: safeCategory(field(formData, "category")),
    family: fieldOrNull(formData, "family"),
    summary: fieldOrNull(formData, "summary"),
    active: boolField(formData, "active"),
    defaultDurationSec: clamp(intField(formData, "defaultDurationSec", 45), 5, 600),
    defaultProvider: safeProvider(field(formData, "defaultProvider")),
    defaultModel: field(formData, "defaultModel"),
    temperature: clamp(numField(formData, "temperature", 1), 0, 2),
  };

  await prisma.structure.update({ where: { id }, data });

  await logAudit({
    user,
    action: "EDITAR",
    entity: "Structure",
    entityId: id,
    summary: `Editó la estructura "${data.name}"`,
    changes: diffFields(before, data, FIELD_LABELS),
  });

  revalidateStructure(id);
  return { ok: "Ficha guardada." };
}

/* -------------------------------------------------------------- DUPLICAR -- */

export async function duplicarEstructura(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);
  const id = field(formData, "id");

  const origin = await prisma.structure.findUnique({ where: { id } });
  if (!origin) return;

  const name = `${origin.name} (copia)`;

  const copy = await prisma.structure.create({
    data: {
      name,
      slug: await uniqueSlug(name),
      category: origin.category,
      family: origin.family,
      summary: origin.summary,
      active: origin.active,
      beats: origin.beats,
      systemPrompt: origin.systemPrompt,
      examples: origin.examples,
      rules: origin.rules,
      defaultDurationSec: origin.defaultDurationSec,
      defaultProvider: origin.defaultProvider,
      defaultModel: origin.defaultModel,
      temperature: origin.temperature,
    },
    select: { id: true },
  });

  await logAudit({
    user,
    action: "CREAR",
    entity: "Structure",
    entityId: copy.id,
    summary: `Duplicó la estructura "${origin.name}"`,
  });

  revalidateStructure(copy.id);
  redirect(`/estructuras/${copy.id}`);
}

/* -------------------------------------------------------------- ELIMINAR -- */

/**
 * Si la estructura ya tiene guiones generados NO se borra: se desactiva,
 * para no romper la trazabilidad de esos guiones. La lista muestra el aviso.
 */
export async function eliminarEstructura(formData: FormData) {
  const user = await requireLevel(LEVEL.OWNER);
  const id = field(formData, "id");

  const structure = await prisma.structure.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      active: true,
      _count: { select: { scripts: true, content: true } },
    },
  });
  if (!structure) redirect("/estructuras");

  const guiones = structure._count.scripts;

  if (guiones > 0) {
    if (structure.active) {
      await prisma.structure.update({ where: { id }, data: { active: false } });
      await logAudit({
        user,
        action: "EDITAR",
        entity: "Structure",
        entityId: id,
        summary: `Desactivó la estructura "${structure.name}" porque ya tiene ${guiones} ${
          guiones === 1 ? "guion" : "guiones"
        }`,
        changes: {
          active: { etiqueta: "Activa", antes: true, despues: false },
        },
      });
    }
    revalidateStructure(id);
    redirect(`/estructuras?aviso=desactivada&guiones=${guiones}`);
  }

  await borrarAssetsDe("structure", id);
  await prisma.structure.delete({ where: { id } });
  await prisma.asset.deleteMany({ where: { ownerType: "structure", ownerId: id } });

  await logAudit({
    user,
    action: "ELIMINAR",
    entity: "Structure",
    entityId: id,
    summary: `Eliminó la estructura "${structure.name}"`,
  });

  revalidateStructure(id);
  redirect("/estructuras?aviso=eliminada");
}

/* ----------------------------------------------------------------- BEATS -- */

export async function guardarBeats(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);

  const id = field(formData, "id");
  const structure = await prisma.structure.findUnique({
    where: { id },
    select: { name: true, beats: true },
  });
  if (!structure) return;

  const beats = readBeats(field(formData, "beats"));
  const value = JSON.stringify(beats);

  await prisma.structure.update({ where: { id }, data: { beats: value } });

  await logAudit({
    user,
    action: "EDITAR",
    entity: "Structure",
    entityId: id,
    summary: `Actualizó la secuencia de beats de la estructura "${structure.name}" (${beats.length} ${
      beats.length === 1 ? "paso" : "pasos"
    })`,
    changes: diffFields({ beats: structure.beats }, { beats: value }, FIELD_LABELS),
  });

  revalidateStructure(id);
}

/* -------------------------------------------------------------- EJEMPLOS -- */

export async function guardarEjemplos(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);

  const id = field(formData, "id");
  const structure = await prisma.structure.findUnique({
    where: { id },
    select: { name: true, examples: true },
  });
  if (!structure) return;

  const examples = readExamples(field(formData, "examples"));
  const value = JSON.stringify(examples);

  await prisma.structure.update({ where: { id }, data: { examples: value } });

  await logAudit({
    user,
    action: "EDITAR",
    entity: "Structure",
    entityId: id,
    summary: `Actualizó los ejemplos ganadores de la estructura "${structure.name}" (${
      examples.length
    } ${examples.length === 1 ? "ejemplo" : "ejemplos"})`,
    changes: diffFields({ examples: structure.examples }, { examples: value }, FIELD_LABELS),
  });

  revalidateStructure(id);
}

/* --------------------------------------------------------------- REGLAS -- */

export async function guardarReglas(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);

  const id = field(formData, "id");
  const structure = await prisma.structure.findUnique({
    where: { id },
    select: { name: true, rules: true },
  });
  if (!structure) return;

  const value = linesToJson(field(formData, "rules"));

  await prisma.structure.update({ where: { id }, data: { rules: value } });

  await logAudit({
    user,
    action: "EDITAR",
    entity: "Structure",
    entityId: id,
    summary: `Actualizó las reglas duras de la estructura "${structure.name}"`,
    changes: diffFields({ rules: structure.rules }, { rules: value }, FIELD_LABELS),
  });

  revalidateStructure(id);
}

/* --------------------------------------------------------------- PROMPT -- */

export async function guardarPrompt(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);

  const id = field(formData, "id");
  const before = await prisma.structure.findUnique({
    where: { id },
    select: {
      name: true,
      systemPrompt: true,
      defaultProvider: true,
      defaultModel: true,
      defaultDurationSec: true,
      temperature: true,
    },
  });
  if (!before) return;

  const data = {
    systemPrompt: field(formData, "systemPrompt"),
    defaultProvider: safeProvider(field(formData, "defaultProvider")),
    defaultModel: field(formData, "defaultModel"),
    defaultDurationSec: clamp(intField(formData, "defaultDurationSec", 45), 5, 600),
    temperature: clamp(numField(formData, "temperature", 1), 0, 2),
  };

  await prisma.structure.update({ where: { id }, data });

  await logAudit({
    user,
    action: "EDITAR",
    entity: "Structure",
    entityId: id,
    summary: `Ajustó el prompt de la estructura "${before.name}"`,
    changes: diffFields(before, data, FIELD_LABELS),
  });

  revalidateStructure(id);
}
