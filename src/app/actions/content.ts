"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { borrarAssetsDe } from "@/lib/assets-cleanup";
import { LEVEL, requireLevel } from "@/lib/auth";
import { diffFields, FIELD_LABELS, logAudit } from "@/lib/audit";
import {
  ASSIGNMENT_ROLE_MAP,
  CHECKLIST_STAGE_MAP,
  CONTENT_STATUS_MAP,
  DEFAULT_CHECKLIST,
  PLATFORMS,
  PLATFORM_MAP,
} from "@/lib/constants";
import {
  boolField,
  clamp,
  dateField,
  dateKey,
  field,
  fieldOrNull,
  formatDate,
  fromDateKey,
  intField,
  linesToJson,
  numField,
  parseList,
} from "@/lib/utils";

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
    .filter((v) => validas.has(v));

  if (elegidas.length) return JSON.stringify(elegidas);
  if (fallback && parseList(fallback).length) return fallback;
  return JSON.stringify(["TIKTOK"]);
}

/** "TikTok, Instagram" — para que el log de actividad se lea en español. */
function nombresRedes(platformsJson: string): string {
  const nombres = parseList(platformsJson).map((p) => PLATFORM_MAP[p]?.label ?? p);
  return nombres.length ? nombres.join(", ") : "sin red";
}

/* ----------------------------------------------------------------- VIDEO -- */

export async function crearVideo(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);

  const title = field(formData, "title");
  const brandId = field(formData, "brandId");
  if (!title) throw new Error("El video necesita un título.");
  if (!brandId) throw new Error("Elige la marca del video.");

  const created = await prisma.contentItem.create({
    data: {
      brandId,
      title,
      description: fieldOrNull(formData, "description"),
      status: field(formData, "status") || "IDEA",
      platforms: readPlatforms(formData),
      priority: field(formData, "priority") || "MEDIA",
      scheduledDate: dateField(formData, "scheduledDate") ?? fromDateKey(dateKey(new Date())),
      shootDate: dateField(formData, "shootDate"),
      // La estructura y el guion NO se eligen aquí. Llegan solos cuando se
      // vincula un guion desde el área de Guiones: la tarjeta nace como idea.
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

  await logAudit({
    user,
    action: "CREAR",
    entity: "ContentItem",
    entityId: created.id,
    brandId,
    summary: `Creó el video "${created.title}" de ${created.brand.name}`,
  });

  revalidar(created.id);
  redirect(`/contenido/${created.id}`);
}

export async function actualizarVideo(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);
  const id = field(formData, "id");

  const before = await prisma.contentItem.findUniqueOrThrow({ where: { id } });

  const data = {
    title: field(formData, "title") || before.title,
    description: fieldOrNull(formData, "description"),
    hook: fieldOrNull(formData, "hook"),
    cta: fieldOrNull(formData, "cta"),
    platforms: readPlatforms(formData, before.platforms),
    priority: field(formData, "priority") || before.priority,
    scheduledDate: dateField(formData, "scheduledDate") ?? before.scheduledDate,
    shootDate: dateField(formData, "shootDate"),
    publishedAt: dateField(formData, "publishedAt"),
    publishedUrl: fieldOrNull(formData, "publishedUrl"),
    tags: linesToJson(field(formData, "tags")),
    notes: fieldOrNull(formData, "notes"),
  };

  await prisma.contentItem.update({ where: { id }, data });

  await logAudit({
    user,
    action: "EDITAR",
    entity: "ContentItem",
    entityId: id,
    brandId: before.brandId,
    summary: `Editó el video "${data.title}"`,
    changes: diffFields(before, data, FIELD_LABELS),
  });

  revalidar(id);
}

export async function cambiarEstado(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);
  const id = field(formData, "id");
  const status = field(formData, "status");
  if (!status) return;

  const before = await prisma.contentItem.findUniqueOrThrow({
    where: { id },
    select: { title: true, status: true, brandId: true, publishedAt: true },
  });
  if (before.status === status) return;

  // Al publicar, si nadie puso fecha de publicacion, la ponemos nosotros.
  const marcaPublicacion = status === "PUBLICADO" && !before.publishedAt;

  await prisma.contentItem.update({
    where: { id },
    data: { status, ...(marcaPublicacion ? { publishedAt: new Date() } : {}) },
  });

  await logAudit({
    user,
    action: "EDITAR",
    entity: "ContentItem",
    entityId: id,
    brandId: before.brandId,
    summary: `Cambió el estado del video "${before.title}" a ${statusLabel(status)}`,
    changes: {
      status: {
        etiqueta: "Estado",
        antes: statusLabel(before.status),
        despues: statusLabel(status),
      },
    },
  });

  revalidar(id);
}

export async function eliminarVideo(formData: FormData) {
  const user = await requireLevel(LEVEL.OWNER);
  const id = field(formData, "id");

  const item = await prisma.contentItem.findUnique({
    where: { id },
    select: { title: true, brandId: true },
  });
  if (!item) return;

  await borrarAssetsDe("content", id);
  await prisma.contentItem.delete({ where: { id } });

  await logAudit({
    user,
    action: "ELIMINAR",
    entity: "ContentItem",
    entityId: id,
    brandId: item.brandId,
    summary: `Eliminó el video "${item.title}"`,
  });

  revalidar(id);
  redirect("/contenido");
}

export async function duplicarVideo(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);
  const id = field(formData, "id");

  const origen = await prisma.contentItem.findUniqueOrThrow({
    where: { id },
    include: { checklist: true, assignments: true },
  });

  const copia = await prisma.contentItem.create({
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

  await logAudit({
    user,
    action: "CREAR",
    entity: "ContentItem",
    entityId: copia.id,
    brandId: copia.brandId,
    summary: `Duplicó el video "${origen.title}"`,
  });

  revalidar(copia.id);
  redirect(`/contenido/${copia.id}`);
}

/* ------------------------------------------------------------- CHECKLIST -- */

export async function alternarCheck(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);
  const id = field(formData, "id");
  const done = boolField(formData, "done");

  const check = await prisma.checklistItem.findUnique({
    where: { id },
    include: { contentItem: { select: { id: true, title: true, brandId: true } } },
  });
  if (!check) return;

  await prisma.checklistItem.update({
    where: { id },
    data: done
      ? { done: true, doneById: user.id, doneAt: new Date() }
      : { done: false, doneById: null, doneAt: null },
  });

  await logAudit({
    user,
    action: done ? "COMPLETAR" : "REABRIR",
    entity: "ChecklistItem",
    entityId: id,
    brandId: check.contentItem.brandId,
    summary: `${done ? "Marcó" : "Reabrió"} el check "${check.label}" del video "${
      check.contentItem.title
    }"`,
  });

  revalidar(check.contentItem.id);
}

export async function crearCheck(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);
  const contentItemId = field(formData, "contentItemId");
  const label = field(formData, "label");
  if (!label) return;

  const stage = field(formData, "stage") || "GENERAL";

  const [item, ultimo] = await Promise.all([
    prisma.contentItem.findUniqueOrThrow({
      where: { id: contentItemId },
      select: { title: true, brandId: true },
    }),
    prisma.checklistItem.findFirst({
      where: { contentItemId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    }),
  ]);

  const created = await prisma.checklistItem.create({
    data: {
      contentItemId,
      label,
      stage,
      required: boolField(formData, "required"),
      sortOrder: (ultimo?.sortOrder ?? -1) + 1,
    },
  });

  await logAudit({
    user,
    action: "CREAR",
    entity: "ChecklistItem",
    entityId: created.id,
    brandId: item.brandId,
    summary: `Añadió el check "${label}" (${
      CHECKLIST_STAGE_MAP[stage]?.label ?? stage
    }) al video "${item.title}"`,
  });

  revalidar(contentItemId);
}

export async function eliminarCheck(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);
  const id = field(formData, "id");

  const check = await prisma.checklistItem.findUnique({
    where: { id },
    include: { contentItem: { select: { id: true, title: true, brandId: true } } },
  });
  if (!check) return;

  await prisma.checklistItem.delete({ where: { id } });

  await logAudit({
    user,
    action: "ELIMINAR",
    entity: "ChecklistItem",
    entityId: id,
    brandId: check.contentItem.brandId,
    summary: `Eliminó el check "${check.label}" del video "${check.contentItem.title}"`,
  });

  revalidar(check.contentItem.id);
}

/* ------------------------------------------------------------ ASIGNACION -- */

export async function asignarPersona(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);
  const contentItemId = field(formData, "contentItemId");
  const userId = field(formData, "userId");
  const role = field(formData, "role");
  if (!userId || !role) return;

  const [item, persona] = await Promise.all([
    prisma.contentItem.findUniqueOrThrow({
      where: { id: contentItemId },
      select: { title: true, brandId: true },
    }),
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } }),
  ]);

  const asignacion = await prisma.assignment.upsert({
    where: { contentItemId_userId_role: { contentItemId, userId, role } },
    create: { contentItemId, userId, role, notes: fieldOrNull(formData, "notes") },
    update: { notes: fieldOrNull(formData, "notes") },
  });

  await logAudit({
    user,
    action: "ASIGNAR",
    entity: "Assignment",
    entityId: asignacion.id,
    brandId: item.brandId,
    summary: `Asignó a ${persona.name} como ${roleLabel(role)} en "${item.title}"`,
  });

  revalidar(contentItemId);
}

export async function quitarAsignacion(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);
  const id = field(formData, "id");

  const asignacion = await prisma.assignment.findUnique({
    where: { id },
    include: {
      user: { select: { name: true } },
      contentItem: { select: { id: true, title: true, brandId: true } },
    },
  });
  if (!asignacion) return;

  await prisma.assignment.delete({ where: { id } });

  await logAudit({
    user,
    action: "DESASIGNAR",
    entity: "Assignment",
    entityId: id,
    brandId: asignacion.contentItem.brandId,
    summary: `Quitó a ${asignacion.user.name} como ${roleLabel(asignacion.role)} en "${
      asignacion.contentItem.title
    }"`,
  });

  revalidar(asignacion.contentItem.id);
}

/* -------------------------------------------------------------- METRICAS -- */

export async function guardarMetrica(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);
  const contentItemId = field(formData, "contentItemId");
  const date = dateField(formData, "date") ?? fromDateKey(dateKey(new Date()));

  const item = await prisma.contentItem.findUniqueOrThrow({
    where: { id: contentItemId },
    select: { title: true, brandId: true },
  });

  const values = {
    views: intField(formData, "views"),
    likes: intField(formData, "likes"),
    comments: intField(formData, "comments"),
    shares: intField(formData, "shares"),
    saves: intField(formData, "saves"),
    reach: intField(formData, "reach"),
    clicks: intField(formData, "clicks"),
    leads: intField(formData, "leads"),
    orders: intField(formData, "orders"),
    spend: numField(formData, "spend"),
    revenue: numField(formData, "revenue"),
    retention3s: clamp(numField(formData, "retention3s"), 0, 100),
    notes: fieldOrNull(formData, "notes"),
    source: "MANUAL",
  };

  const existente = await prisma.metric.findUnique({
    where: { contentItemId_date: { contentItemId, date } },
  });

  const guardada = await prisma.metric.upsert({
    where: { contentItemId_date: { contentItemId, date } },
    create: { contentItemId, date, ...values },
    update: values,
  });

  await logAudit({
    user,
    action: existente ? "EDITAR" : "CREAR",
    entity: "Metric",
    entityId: guardada.id,
    brandId: item.brandId,
    summary: `${existente ? "Actualizó" : "Registró"} las métricas del ${formatDate(
      date
    )} en "${item.title}"`,
    changes: existente ? diffFields(existente, values, METRIC_LABELS) : null,
  });

  revalidar(contentItemId);
}

export async function eliminarMetrica(formData: FormData) {
  const user = await requireLevel(LEVEL.OWNER);
  const id = field(formData, "id");

  const metrica = await prisma.metric.findUnique({
    where: { id },
    include: { contentItem: { select: { id: true, title: true, brandId: true } } },
  });
  if (!metrica) return;

  await prisma.metric.delete({ where: { id } });

  await logAudit({
    user,
    action: "ELIMINAR",
    entity: "Metric",
    entityId: id,
    brandId: metrica.contentItem.brandId,
    summary: `Eliminó las métricas del ${formatDate(metrica.date)} en "${
      metrica.contentItem.title
    }"`,
  });

  revalidar(metrica.contentItem.id);
}

/* ----------------------------------------------------------- COMENTARIOS -- */

/** Comentar es lo unico que puede hacer cualquiera con sesion, talento incluido. */
export async function comentar(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);
  const contentItemId = field(formData, "contentItemId");
  const body = field(formData, "body");
  if (!body) return;

  const item = await prisma.contentItem.findUniqueOrThrow({
    where: { id: contentItemId },
    select: { title: true, brandId: true },
  });

  const comentario = await prisma.comment.create({
    data: { contentItemId, userId: user.id, body },
  });

  await logAudit({
    user,
    action: "CREAR",
    entity: "Comment",
    entityId: comentario.id,
    brandId: item.brandId,
    summary: `Comentó en el video "${item.title}"`,
  });

  revalidar(contentItemId);
}
