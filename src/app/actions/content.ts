"use server";
import { requirePermission } from "@/lib/auth";
import { assertBrandPermission, assertPermission, contentStatusCapability, checklistCapability } from "@/lib/permissions";
import { assertContentAccess, assertVideoOpen, assertAssignee, assertPublishable } from "@/lib/access-scope";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { borrarAssetsDe } from "@/lib/assets-cleanup";
import { FIELD_LABELS, auditInTransaction, diffFields } from "@/lib/audit";
import { LEVEL, requireLevel } from "@/lib/auth";
import {
	ASSIGNMENT_ROLE_MAP,
	CHECKLIST_STAGE_MAP,
	CONTENT_STATUS_MAP,
	DEFAULT_CHECKLIST,
	PLATFORMS,
	PLATFORM_MAP,
	PRIORITY_MAP,
} from "@/lib/constants";
import { lockRevision, withMutation } from "@/lib/mutations";
import type { AppTransaction } from "@/lib/prisma";
import {
	boolField,
	dateField,
	dateKey,
	field,
	fieldOrNull,
	formatDate,
	fromDateKey,
	linesToJson,
	parseList
} from "@/lib/utils";
import { choice, enumField } from "@/lib/validation";
import { saveWeeklyMetric } from "@/lib/weekly-metric-mutations";

/**
 * Acciones del calendario de contenido: videos, checklist, equipo,
 * metricas y comentarios.
 *
 * Todas reciben solo FormData (los identificadores viajan en campos ocultos)
 * para poder usarlas igual desde componentes de servidor y de cliente.
 * Toda escritura deja rastro en el log de auditoria.
 */

/* ---------------------------------------------------------------- APOYOS -- */

function revalidar(id?: string | null) {
  revalidatePath("/");
  revalidatePath("/calendario");
  revalidatePath("/contenido");
  revalidatePath("/metricas");
  revalidatePath("/actividad");
  if (id) revalidatePath(`/contenido/${id}`);
}

const METRIC_LABELS: Record<string, string> = {
  views: "Vistas",
  likes: "Me gusta",
  comments: "Comentarios",
  shares: "Compartidos",
  saves: "Guardados",
  reach: "Alcance",
  clicks: "Clics",
  leads: "Leads",
  orders: "Pedidos",
  spend: "Inversión",
  revenue: "Ingresos",
  retention3s: "Retención 3s",
  notes: "Notas",
};

function statusLabel(value: string) {
  return CONTENT_STATUS_MAP[value]?.label ?? value;
}

function roleLabel(value: string) {
  return ASSIGNMENT_ROLE_MAP[value]?.label ?? value;
}

/**
 * Lee las casillas de redes del formulario. Se envían como varios campos
 * con el mismo nombre, así que hay que usar getAll.
 * Si no viene ninguna, se conserva lo que había (o TikTok si es un alta).
 */
function readPlatforms(formData: FormData, fallback?: string): string {
  const validas = new Set(PLATFORMS.map((p) => p.value));
  const elegidas = formData
    .getAll("platforms")
    .map((v) => String(v))
    .map((v) => choice(v, [...validas], "Red"));

  if (elegidas.length) return JSON.stringify(elegidas);
  if (fallback && parseList(fallback).length) return fallback;
  return JSON.stringify(["TIKTOK"]);
}

/**
 * Lee las casillas de formatos previstos (`structureIds`). Igual que las redes,
 * llegan como varios campos con el mismo nombre y se validan contra las
 * estructuras que existen de verdad.
 *
 * El picker manda además un marcador `structureIdsForm`: si el marcador viene
 * y no hay ninguna casilla, la persona vació la lista a propósito y se guarda
 * `[]`. Si el marcador NO viene (formulario sin picker, o con el picker
 * deshabilitado), se conserva lo que había para no borrar nada por accidente.
 */
async function readStructureIds(tx: AppTransaction, formData: FormData, fallback?: string): Promise<string> {
  const conPicker = formData.has("structureIdsForm");
  const pedidas = Array.from(
    new Set(
      formData
        .getAll("structureIds")
        .map((v) => String(v).trim())
        .filter(Boolean)
    )
  );

  if (!conPicker && !pedidas.length) {
    return fallback && parseList(fallback).length ? fallback : "[]";
  }
  if (!pedidas.length) return "[]";

  const existentes = await tx.structure.findMany({
    where: { id: { in: pedidas } },
    select: { id: true },
  });
  const validas = new Set(existentes.map((s) => s.id));
  // Se conserva el orden en que llegan las casillas (el del picker, por
  // nombre; el navegador las envía en orden de DOM, no de marcado): el
  // generador usa el primero como formato de vista previa.
  return JSON.stringify(pedidas.filter((id) => validas.has(id)));
}

/** "TikTok, Instagram" — para que el log de actividad se lea en español. */
function nombresRedes(platformsJson: string): string {
  const nombres = parseList(platformsJson).map((p) => PLATFORM_MAP[p]?.label ?? p);
  return nombres.length ? nombres.join(", ") : "sin red";
}

/* ----------------------------------------------------------------- VIDEO -- */

export async function crearVideo(formData: FormData) {
  const user = await requirePermission("content.plan");
  return withMutation(user, false, async (tx, afterCommit) => {

    const title = field(formData, "title");
    const brandId = field(formData, "brandId");
    assertBrandPermission(user, brandId, "content.plan");
    if (user.role !== "OWNER" && !["", "IDEA"].includes(field(formData, "status"))) throw new Error("Los nuevos videos empiezan como idea.");
    if (!title) throw new Error("El video necesita un título.");
    if (!brandId) throw new Error("Elige la marca del video.");

    // Los formatos PREVISTOS sí se eligen en la idea (structureIds). La
    // estructura definitiva (structureId) y el guion (scriptId) NO se eligen
    // aquí: llegan solos al vincular un guion, desde Guiones o desde el propio
    // generador. La tarjeta nace como idea.
    const structureIds = await readStructureIds(tx, formData);

    const created = await tx.contentItem.create({
      data: {
        brandId,
        title,
        description: fieldOrNull(formData, "description"),
        status: enumField(formData, "status", CONTENT_STATUS_MAP, "IDEA"),
        platforms: readPlatforms(formData),
        priority: enumField(formData, "priority", PRIORITY_MAP, "MEDIA"),
        scheduledDate: dateField(formData, "scheduledDate") ?? fromDateKey(dateKey(new Date())),
        shootDate: dateField(formData, "shootDate"),
        structureIds,
        hook: fieldOrNull(formData, "hook"),
        cta: fieldOrNull(formData, "cta"),
        notes: fieldOrNull(formData, "notes"),
        createdById: user.id,
        // Checklist de produccion por defecto, en el orden del catalogo.
        checklist: {
          create: DEFAULT_CHECKLIST.map((item, index) => ({
            label: item.label,
            stage: item.stage,
            required: item.required,
            sortOrder: index,
          })),
        },
      },
      include: { brand: { select: { name: true } } },
    });

    await auditInTransaction(tx, {
      user,
      action: "CREAR",
      entity: "ContentItem",
      entityId: created.id,
      brandId,
      summary: `Creó el video "${created.title}" de ${created.brand.name}`,
    });

    afterCommit(() => revalidar(created.id));
    afterCommit(() => redirect(`/contenido/${created.id}`));
  });
}

export async function actualizarVideo(formData: FormData) {
  const user = await requirePermission("content.plan");
  return withMutation(user, false, async (tx, afterCommit) => {
    await assertVideoOpen(tx, user, field(formData, "id"));
    await assertContentAccess(tx, user, field(formData, "id"), "content.plan");
    const id = field(formData, "id");

    await lockRevision(tx, "ContentItem", id, formData);
    const before = await tx.contentItem.findUniqueOrThrow({ where: { id } });

    const data = {
      title: field(formData, "title") || before.title,
      description: fieldOrNull(formData, "description"),
      hook: fieldOrNull(formData, "hook"),
      cta: fieldOrNull(formData, "cta"),
      platforms: readPlatforms(formData, before.platforms),
      // Formatos previstos: se validan contra las estructuras reales dentro de
      // la misma transacción; sin picker en el formulario se conservan.
      structureIds: await readStructureIds(tx, formData, before.structureIds),
      priority: enumField(formData, "priority", PRIORITY_MAP, before.priority),
      scheduledDate: dateField(formData, "scheduledDate") ?? before.scheduledDate,
      shootDate: dateField(formData, "shootDate"),
      publishedAt: user.role === "OWNER" ? dateField(formData, "publishedAt") : before.publishedAt,
      publishedUrl: user.role === "OWNER" ? fieldOrNull(formData, "publishedUrl") : before.publishedUrl,
      tags: linesToJson(field(formData, "tags")),
      notes: fieldOrNull(formData, "notes"),
    };

    await tx.contentItem.update({ where: { id }, data });

    await auditInTransaction(tx, {
      user,
      action: "EDITAR",
      entity: "ContentItem",
      entityId: id,
      brandId: before.brandId,
      summary: `Editó el video "${data.title}"`,
      changes: diffFields(before, data, FIELD_LABELS),
    });

    afterCommit(() => revalidar(id));
  });
}

export async function cambiarEstado(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);
  return withMutation(user, false, async (tx, afterCommit) => {
    const id = field(formData, "id");
    const status = enumField(formData, "status", CONTENT_STATUS_MAP);
    await assertContentAccess(tx, user, id, contentStatusCapability(status));

    await lockRevision(tx, "ContentItem", id, formData);
    const before = await tx.contentItem.findUniqueOrThrow({
      where: { id },
      select: { title: true, status: true, brandId: true, publishedAt: true },
    });
    if (before.status === status) return;
    if (user.role !== "OWNER") {
      if (["PROGRAMADO", "PUBLICADO"].includes(status)) await assertPublishable(tx, user, id);
      if (["PROGRAMADO", "PUBLICADO"].includes(before.status) && !["PROGRAMADO", "PUBLICADO"].includes(status)) assertPermission(user, "content.approve");
    }

    // Al publicar, si nadie puso fecha de publicacion, la ponemos nosotros.
    const marcaPublicacion = status === "PUBLICADO" && !before.publishedAt;

    await tx.contentItem.update({
      where: { id },
      data: { status, ...(marcaPublicacion ? { publishedAt: new Date() } : {}) },
    });

    await auditInTransaction(tx, {
      user,
      action: "EDITAR",
      entity: "ContentItem",
      entityId: id,
      brandId: before.brandId,
      summary: `Cambió el estado del video "${before.title}" a ${statusLabel(status)}`,
      changes: {
        status: {
          etiqueta: "Estado",
          antes: before.status,
          despues: status,
        },
      },
    });

    afterCommit(() => revalidar(id));
  });
}

export async function eliminarVideo(formData: FormData) {
  const user = await requireLevel(LEVEL.OWNER);
  return withMutation(user, true, async (tx, afterCommit) => {
    const id = field(formData, "id");

    const item = await tx.contentItem.findUnique({
      where: { id },
      select: { title: true, brandId: true },
    });
    if (!item) return;

    await borrarAssetsDe("content", id, tx);
    await tx.contentItem.delete({ where: { id } });

    await auditInTransaction(tx, {
      user,
      action: "ELIMINAR",
      entity: "ContentItem",
      entityId: id,
      brandId: item.brandId,
      summary: `Eliminó el video "${item.title}"`,
    });

    afterCommit(() => revalidar(id));
    afterCommit(() => redirect("/contenido"));
  });
}

export async function duplicarVideo(formData: FormData) {
  const user = await requirePermission("content.plan");
  return withMutation(user, false, async (tx, afterCommit) => {
    await assertContentAccess(tx, user, field(formData, "id"), "content.plan");
    const id = field(formData, "id");

    const origen = await tx.contentItem.findUniqueOrThrow({
      where: { id },
      include: { checklist: true, assignments: true },
    });

    const copia = await tx.contentItem.create({
      data: {
        brandId: origen.brandId,
        title: `${origen.title} (copia)`,
        description: origen.description,
        status: "IDEA",
        platforms: origen.platforms,
        priority: origen.priority,
        scheduledDate: origen.scheduledDate,
        shootDate: origen.shootDate,
        structureId: origen.structureId,
        scriptId: origen.scriptId,
        // Los formatos previstos viajan con la copia: son parte de la idea.
        structureIds: origen.structureIds,
        hook: origen.hook,
        cta: origen.cta,
        tags: origen.tags,
        notes: origen.notes,
        createdById: user.id,
        // La copia arranca con el checklist en blanco y el mismo equipo.
        checklist: {
          create: origen.checklist.map((c) => ({
            label: c.label,
            stage: c.stage,
            required: c.required,
            sortOrder: c.sortOrder,
          })),
        },
        assignments: {
          create: origen.assignments.map((a) => ({
            userId: a.userId,
            role: a.role,
            notes: a.notes,
          })),
        },
      },
    });

    await auditInTransaction(tx, {
      user,
      action: "CREAR",
      entity: "ContentItem",
      entityId: copia.id,
      brandId: copia.brandId,
      summary: `Duplicó el video "${origen.title}"`,
    });

    afterCommit(() => revalidar(copia.id));
    afterCommit(() => redirect(`/contenido/${copia.id}`));
  });
}

/* ------------------------------------------------------------- CHECKLIST -- */

export async function alternarCheck(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);
  return withMutation(user, false, async (tx, afterCommit) => {
    const id = field(formData, "id");
    const done = boolField(formData, "done");

    const check = await tx.checklistItem.findUnique({
      where: { id },
      include: { contentItem: { select: { id: true, title: true, brandId: true } } },
    });
    if (!check) return;
    await assertContentAccess(tx, user, check.contentItemId, checklistCapability(check.stage, check.label));
    if (checklistCapability(check.stage, check.label) !== "content.approve" && check.stage !== "PUBLICACION") await assertVideoOpen(tx, user, check.contentItemId);
    if (check.stage === "PUBLICACION") await assertPublishable(tx, user, check.contentItemId);

    await tx.checklistItem.update({
      where: { id },
      data: done
        ? { done: true, doneById: user.id, doneAt: new Date() }
        : { done: false, doneById: null, doneAt: null },
    });

    await auditInTransaction(tx, {
      user,
      action: done ? "COMPLETAR" : "REABRIR",
      entity: "ChecklistItem",
      entityId: id,
      brandId: check.contentItem.brandId,
      summary: `${done ? "Marcó" : "Reabrió"} el check "${check.label}" del video "${
        check.contentItem.title
      }"`,
    });

    afterCommit(() => revalidar(check.contentItem.id));
  });
}

export async function crearCheck(formData: FormData) {
  const user = await requirePermission("content.plan");
  return withMutation(user, false, async (tx, afterCommit) => {
    await assertVideoOpen(tx, user, field(formData, "contentItemId"));
    await assertContentAccess(tx, user, field(formData, "contentItemId"), "content.plan");
    const contentItemId = field(formData, "contentItemId");
    const label = field(formData, "label");
    if (!label) return;

    const stage = field(formData, "stage") || "GENERAL";

    const [item, ultimo] = await Promise.all([
      tx.contentItem.findUniqueOrThrow({
        where: { id: contentItemId },
        select: { title: true, brandId: true },
      }),
      tx.checklistItem.findFirst({
        where: { contentItemId },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      }),
    ]);

    const created = await tx.checklistItem.create({
      data: {
        contentItemId,
        label,
        stage,
        required: boolField(formData, "required"),
        sortOrder: (ultimo?.sortOrder ?? -1) + 1,
      },
    });

    await auditInTransaction(tx, {
      user,
      action: "CREAR",
      entity: "ChecklistItem",
      entityId: created.id,
      brandId: item.brandId,
      summary: `Añadió el check "${label}" (${
        CHECKLIST_STAGE_MAP[stage]?.label ?? stage
      }) al video "${item.title}"`,
    });

    afterCommit(() => revalidar(contentItemId));
  });
}

export async function eliminarCheck(formData: FormData) {
  const user = await requirePermission("content.plan");
  return withMutation(user, false, async (tx, afterCommit) => {
    const id = field(formData, "id");

    const check = await tx.checklistItem.findUnique({
      where: { id },
      include: { contentItem: { select: { id: true, title: true, brandId: true } } },
    });
    if (!check) return;
    await assertContentAccess(tx, user, check.contentItemId, "content.plan");
    await assertVideoOpen(tx, user, check.contentItemId);

    await tx.checklistItem.delete({ where: { id } });

    await auditInTransaction(tx, {
      user,
      action: "ELIMINAR",
      entity: "ChecklistItem",
      entityId: id,
      brandId: check.contentItem.brandId,
      summary: `Eliminó el check "${check.label}" del video "${check.contentItem.title}"`,
    });

    afterCommit(() => revalidar(check.contentItem.id));
  });
}

/* ------------------------------------------------------------ ASIGNACION -- */

export async function asignarPersona(formData: FormData) {
  const user = await requirePermission("content.assign");
  return withMutation(user, false, async (tx, afterCommit) => {
    await assertContentAccess(tx, user, field(formData, "contentItemId"), "content.assign");
    const contentItemId = field(formData, "contentItemId");
    const userId = field(formData, "userId");
    const role = enumField(formData, "role", ASSIGNMENT_ROLE_MAP);
    if (!userId || !role) return;

    const [item, persona] = await Promise.all([
      tx.contentItem.findUniqueOrThrow({
        where: { id: contentItemId },
        select: { title: true, brandId: true },
      }),
      tx.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, active: true } }),
    ]);

    await assertAssignee(tx, userId, item.brandId);
    if (!persona.active) throw new Error("No puedes asignar una cuenta desactivada.");
    const asignacion = await tx.assignment.upsert({
      where: { contentItemId_userId_role: { contentItemId, userId, role } },
      create: { contentItemId, userId, role, notes: fieldOrNull(formData, "notes") },
      update: { notes: fieldOrNull(formData, "notes") },
    });

    await auditInTransaction(tx, {
      user,
      action: "ASIGNAR",
      entity: "Assignment",
      entityId: asignacion.id,
      brandId: item.brandId,
      summary: `Asignó a ${persona.name} como ${roleLabel(role)} en "${item.title}"`,
    });

    afterCommit(() => revalidar(contentItemId));
  });
}

export async function quitarAsignacion(formData: FormData) {
  const user = await requirePermission("content.assign");
  return withMutation(user, false, async (tx, afterCommit) => {
    const id = field(formData, "id");

    const asignacion = await tx.assignment.findUnique({
      where: { id },
      include: {
        user: { select: { name: true } },
        contentItem: { select: { id: true, title: true, brandId: true } },
      },
    });
    if (!asignacion) return;
    await assertContentAccess(tx, user, asignacion.contentItemId, "content.assign");

    await tx.assignment.delete({ where: { id } });

    await auditInTransaction(tx, {
      user,
      action: "DESASIGNAR",
      entity: "Assignment",
      entityId: id,
      brandId: asignacion.contentItem.brandId,
      summary: `Quitó a ${asignacion.user.name} como ${roleLabel(asignacion.role)} en "${
        asignacion.contentItem.title
      }"`,
    });

    afterCommit(() => revalidar(asignacion.contentItem.id));
  });
}

/* -------------------------------------------------------------- METRICAS -- */

export async function guardarMetrica(formData: FormData) {
  const user = await requirePermission("metrics.write");
  await saveWeeklyMetric(user, formData);
  revalidar(field(formData, "contentItemId"));
}

export async function eliminarMetrica(formData: FormData) {
  const user = await requireLevel(LEVEL.OWNER);
  return withMutation(user, true, async (tx, afterCommit) => {
    const id = field(formData, "id");

    const metrica = await tx.metric.findUnique({
      where: { id },
      include: { contentItem: { select: { id: true, title: true, brandId: true } } },
    });
    if (!metrica) return;

    await tx.metric.delete({ where: { id } });

    await auditInTransaction(tx, {
      user,
      action: "ELIMINAR",
      entity: "Metric",
      entityId: id,
      brandId: metrica.contentItem.brandId,
      summary: `Eliminó las métricas del ${formatDate(metrica.date)} en "${
        metrica.contentItem.title
      }"`,
    });

    afterCommit(() => revalidar(metrica.contentItem.id));
  });
}

/* ----------------------------------------------------------- COMENTARIOS -- */

/** Comentar es lo unico que puede hacer cualquiera con sesion, talento incluido. */
export async function comentar(formData: FormData) {
  const user = await requirePermission("content.comment");
  return withMutation(user, false, async (tx, afterCommit) => {
    await assertContentAccess(tx, user, field(formData, "contentItemId"), "content.comment");
    const contentItemId = field(formData, "contentItemId");
    const body = field(formData, "body");
    if (!body) return;

    const item = await tx.contentItem.findUniqueOrThrow({
      where: { id: contentItemId },
      select: { title: true, brandId: true },
    });

    const comentario = await tx.comment.create({
      data: { contentItemId, userId: user.id, body },
    });

    await auditInTransaction(tx, {
      user,
      action: "CREAR",
      entity: "Comment",
      entityId: comentario.id,
      brandId: item.brandId,
      summary: `Comentó en el video "${item.title}"`,
    });

    afterCommit(() => revalidar(contentItemId));
  });
}
