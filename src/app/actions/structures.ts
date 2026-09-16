"use server";
import { requirePermission } from "@/lib/auth";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { borrarAssetsDe } from "@/lib/assets-cleanup";
import { auditInTransaction, diffFields, FIELD_LABELS } from "@/lib/audit";
import { LEVEL, requireLevel } from "@/lib/auth";
import { invalidateStructureCatalog } from "@/lib/catalog-cache";
import { AI_PROVIDERS, STRUCTURE_CATEGORIES } from "@/lib/constants";
import { lockRevision, withMutation } from "@/lib/mutations";
import { type AppTransaction } from "@/lib/prisma";
import {
	boolField,
	field,
	fieldOrNull,
	intField,
	linesToJson,
	numField,
	parseJson,
	slugify
} from "@/lib/utils";
import { boundedNumber, choice } from "@/lib/validation";
import { z } from "zod";

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
  return choice(value || "VENDE", CATEGORY_VALUES, "Categoría");
}

function safeProvider(value: string) {
  return choice(value || "anthropic", PROVIDER_VALUES, "Proveedor");
}

/** Genera un slug que no choque con ninguna otra estructura. */
async function uniqueSlug(tx: AppTransaction, base: string, ignoreId?: string) {
  const root = slugify(base) || "estructura";
  let candidate = root;
  let n = 2;
  // Se corta solo: siempre encuentra hueco anadiendo un numero.
  for (;;) {
    const found = await tx.structure.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!found || found.id === ignoreId) return candidate;
    candidate = `${root}-${n}`;
    n += 1;
  }
}

function revalidateStructure(id?: string) {
  invalidateStructureCatalog();
  revalidatePath("/estructuras");
  if (id) revalidatePath(`/estructuras/${id}`);
  revalidatePath("/generador");
}

/** Limpia y tipa los beats que llegan del editor como JSON. */
function readBeats(raw: string): Beat[] {
  return z.array(z.object({ name: z.string().trim().min(1).max(200), goal: z.string().optional(), seconds: z.number().int().min(1).max(600).optional(), notes: z.string().optional() })).max(200).parse(parseJson<unknown>(raw, null));
}

/** Limpia y tipa los ejemplos ganadores que llegan del editor. */
function readExamples(raw: string): Example[] {
  return z.array(z.object({ title: z.string().trim().max(200), text: z.string().trim().min(1).max(100000) })).max(100).parse(parseJson<unknown>(raw, null));
}

/* ----------------------------------------------------------------- CREAR -- */

export async function crearEstructura(
  _prev: StructureState,
  formData: FormData
): Promise<StructureState> {
  const user = await requirePermission("structures.edit");
  return withMutation(user, false, async (tx, afterCommit) => {

    const name = field(formData, "name");
    if (!name) return { error: "Ponle un nombre a la estructura." };

    const provider = safeProvider(field(formData, "defaultProvider"));

    const created = await tx.structure.create({
      data: {
        name,
        slug: await uniqueSlug(tx, name),
        category: safeCategory(field(formData, "category")),
        family: fieldOrNull(formData, "family"),
        summary: fieldOrNull(formData, "summary"),
        active: boolField(formData, "active"),
        defaultDurationSec: boundedNumber(intField(formData, "defaultDurationSec", 45), 5, 600, "Duración", true),
        defaultProvider: provider,
        defaultModel: field(formData, "defaultModel"),
        temperature: boundedNumber(numField(formData, "temperature", 1), 0, 2, "Temperatura"),
      },
      select: { id: true, name: true, category: true },
    });

    await auditInTransaction(tx, {
      user,
      action: "CREAR",
      entity: "Structure",
      entityId: created.id,
      summary: `Creó la estructura "${created.name}"`,
    });

    afterCommit(() => revalidateStructure(created.id));
    afterCommit(() => redirect(`/estructuras/${created.id}?vista=beats`));
    return null;
  });
}

/* ------------------------------------------------------------ ACTUALIZAR -- */

export async function actualizarEstructura(
  _prev: StructureState,
  formData: FormData
): Promise<StructureState> {
  const user = await requirePermission("structures.edit");
  return withMutation(user, false, async (tx, afterCommit) => {

    const id = field(formData, "id");
    const name = field(formData, "name");
    if (!id) return { error: "No se pudo identificar la estructura." };
    if (!name) return { error: "Ponle un nombre a la estructura." };

    await lockRevision(tx, "Structure", id, formData);
    const before = await tx.structure.findUnique({
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
      slug: before.name === name ? before.slug : await uniqueSlug(tx, name, id),
      category: safeCategory(field(formData, "category")),
      family: fieldOrNull(formData, "family"),
      summary: fieldOrNull(formData, "summary"),
      active: boolField(formData, "active"),
      defaultDurationSec: boundedNumber(intField(formData, "defaultDurationSec", 45), 5, 600, "Duración", true),
      defaultProvider: safeProvider(field(formData, "defaultProvider")),
      defaultModel: field(formData, "defaultModel"),
      temperature: boundedNumber(numField(formData, "temperature", 1), 0, 2, "Temperatura"),
    };

    await tx.structure.update({ where: { id }, data });

    await auditInTransaction(tx, {
      user,
      action: "EDITAR",
      entity: "Structure",
      entityId: id,
      summary: `Editó la estructura "${data.name}"`,
      changes: diffFields(before, data, FIELD_LABELS),
    });

    afterCommit(() => revalidateStructure(id));
    return { ok: "Ficha guardada." };
  }).catch(() => ({ error: "No se pudo guardar. Conservamos los campos; comprueba los valores y recarga si otra persona modificó esta estructura." }));
}

/* -------------------------------------------------------------- DUPLICAR -- */

export async function duplicarEstructura(formData: FormData) {
  const user = await requirePermission("structures.edit");
  return withMutation(user, false, async (tx, afterCommit) => {
    const id = field(formData, "id");

    const origin = await tx.structure.findUnique({ where: { id } });
    if (!origin) return;

    const name = `${origin.name} (copia)`;

    const copy = await tx.structure.create({
      data: {
        name,
        slug: await uniqueSlug(tx, name),
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

    await auditInTransaction(tx, {
      user,
      action: "CREAR",
      entity: "Structure",
      entityId: copy.id,
      summary: `Duplicó la estructura "${origin.name}"`,
    });

    afterCommit(() => revalidateStructure(copy.id));
    afterCommit(() => redirect(`/estructuras/${copy.id}`));
  });
}

/* -------------------------------------------------------------- ELIMINAR -- */

/**
 * Si la estructura ya tiene guiones generados NO se borra: se desactiva,
 * para no romper la trazabilidad de esos guiones. La lista muestra el aviso.
 */
export async function eliminarEstructura(formData: FormData) {
  const user = await requireLevel(LEVEL.OWNER);
  return withMutation(user, true, async (tx, afterCommit) => {
    const id = field(formData, "id");

    const structure = await tx.structure.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        active: true,
        _count: { select: { scripts: true, content: true, plannedContent: true, generationItems: true } },
      },
    });
    if (!structure) return afterCommit(() => redirect("/estructuras"));

    const guiones = structure._count.scripts;

    const referencias = guiones + structure._count.content + structure._count.plannedContent + structure._count.generationItems;
    if (referencias > 0) {
      if (structure.active) {
        await tx.structure.update({ where: { id }, data: { active: false } });
        await auditInTransaction(tx, {
          user,
          action: "EDITAR",
          entity: "Structure",
          entityId: id,
          summary: `Desactivó la estructura "${structure.name}" porque está referenciada por guiones, videos o trabajos de generación`,
          changes: {
            active: { etiqueta: "Activa", antes: true, despues: false },
          },
        });
      }
      afterCommit(() => revalidateStructure(id));
      return afterCommit(() => redirect(`/estructuras?aviso=desactivada&guiones=${guiones}`));
    }

    await borrarAssetsDe("structure", id, tx);
    await tx.structure.delete({ where: { id } });
    await tx.asset.deleteMany({ where: { ownerType: "structure", ownerId: id } });

    await auditInTransaction(tx, {
      user,
      action: "ELIMINAR",
      entity: "Structure",
      entityId: id,
      summary: `Eliminó la estructura "${structure.name}"`,
    });

    afterCommit(() => revalidateStructure(id));
    afterCommit(() => redirect("/estructuras?aviso=eliminada"));
  });
}

/* ----------------------------------------------------------------- BEATS -- */

export async function guardarBeats(formData: FormData) {
  const user = await requirePermission("structures.edit");
  return withMutation(user, false, async (tx, afterCommit) => {

    const id = field(formData, "id");
    await lockRevision(tx, "Structure", id, formData);
    const structure = await tx.structure.findUnique({
      where: { id },
      select: { name: true, beats: true },
    });
    if (!structure) return;

    const beats = readBeats(field(formData, "beats"));
    const value = JSON.stringify(beats);

    await tx.structure.update({ where: { id }, data: { beats: value } });

    await auditInTransaction(tx, {
      user,
      action: "EDITAR",
      entity: "Structure",
      entityId: id,
      summary: `Actualizó la secuencia de beats de la estructura "${structure.name}" (${beats.length} ${
        beats.length === 1 ? "paso" : "pasos"
      })`,
      changes: diffFields({ beats: structure.beats }, { beats: value }, FIELD_LABELS),
    });

    afterCommit(() => revalidateStructure(id));
  });
}

/* -------------------------------------------------------------- EJEMPLOS -- */

export async function guardarEjemplos(formData: FormData) {
  const user = await requirePermission("structures.edit");
  return withMutation(user, false, async (tx, afterCommit) => {

    const id = field(formData, "id");
    await lockRevision(tx, "Structure", id, formData);
    const structure = await tx.structure.findUnique({
      where: { id },
      select: { name: true, examples: true },
    });
    if (!structure) return;

    const examples = readExamples(field(formData, "examples"));
    const value = JSON.stringify(examples);

    await tx.structure.update({ where: { id }, data: { examples: value } });

    await auditInTransaction(tx, {
      user,
      action: "EDITAR",
      entity: "Structure",
      entityId: id,
      summary: `Actualizó los ejemplos ganadores de la estructura "${structure.name}" (${
        examples.length
      } ${examples.length === 1 ? "ejemplo" : "ejemplos"})`,
      changes: diffFields({ examples: structure.examples }, { examples: value }, FIELD_LABELS),
    });

    afterCommit(() => revalidateStructure(id));
  });
}

/* --------------------------------------------------------------- REGLAS -- */

export async function guardarReglas(formData: FormData) {
  const user = await requirePermission("structures.edit");
  return withMutation(user, false, async (tx, afterCommit) => {

    const id = field(formData, "id");
    await lockRevision(tx, "Structure", id, formData);
    const structure = await tx.structure.findUnique({
      where: { id },
      select: { name: true, rules: true },
    });
    if (!structure) return;

    const value = linesToJson(field(formData, "rules"));

    await tx.structure.update({ where: { id }, data: { rules: value } });

    await auditInTransaction(tx, {
      user,
      action: "EDITAR",
      entity: "Structure",
      entityId: id,
      summary: `Actualizó las reglas duras de la estructura "${structure.name}"`,
      changes: diffFields({ rules: structure.rules }, { rules: value }, FIELD_LABELS),
    });

    afterCommit(() => revalidateStructure(id));
  });
}

/* --------------------------------------------------------------- PROMPT -- */

export async function guardarPrompt(formData: FormData) {
  const user = await requirePermission("structures.edit");
  return withMutation(user, false, async (tx, afterCommit) => {

    const id = field(formData, "id");
    await lockRevision(tx, "Structure", id, formData);
    const before = await tx.structure.findUnique({
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
      defaultDurationSec: boundedNumber(intField(formData, "defaultDurationSec", 45), 5, 600, "Duración", true),
      temperature: boundedNumber(numField(formData, "temperature", 1), 0, 2, "Temperatura"),
    };

    await tx.structure.update({ where: { id }, data });

    await auditInTransaction(tx, {
      user,
      action: "EDITAR",
      entity: "Structure",
      entityId: id,
      summary: `Ajustó el prompt de la estructura "${before.name}"`,
      changes: diffFields(before, data, FIELD_LABELS),
    });

    afterCommit(() => revalidateStructure(id));
  });
}
