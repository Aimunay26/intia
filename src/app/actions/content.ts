"use server";
import { transitionVideo } from "@/lib/domain/lifecycle";
import { ProductionFlowError, onChecklistCompleted, onScheduledDateChanged, onShootDateChanged } from "@/lib/domain/production-flow";
import { assertAssignmentRemovable, assertFinalApprovalAllowed, chainEvent } from "@/lib/domain/production-chain";
import { productionChainConfigured, productionChainEnabled } from "@/lib/production-chain-flag";
import { approveVersion, assertChecklistApproved, assertRequiredChecks, assertScriptApproved, reopenContentApprovals, reopeningReason, revokeVersion } from "@/lib/approvals";
import { WorkflowError } from "@/lib/workflow-policy";
import { requirePermission } from "@/lib/auth";
import { assertBrandPermission, assertPermission, checklistCapability } from "@/lib/permissions";
import { assertContentAccess, assertVideoOpen, assertAssignee, assertPublishable, lockVideoLifecycle } from "@/lib/access-scope";

import { revalidatePath } from "next/cache";
import { invalidateDomain } from "@/lib/view-invalidation";
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
	PRIORITY_MAP,
} from "@/lib/constants";
import { lockRevision, withMutation, withWorkflowMutation } from "@/lib/mutations";
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
  invalidateDomain("content");
  if (id) revalidatePath(`/contenido/${id}`);
  // Cadena de entregas: el paso, su tarea y la vista Cadena cambian con el video.
  if (productionChainConfigured()) {
    revalidatePath("/tareas");
    revalidatePath("/cadena");
  }
}

/** Una regla de la cadena (ChainError) viaja como regla del flujo, legible en el formulario. */
async function reglaDeCadena(work: () => Promise<void>) {
  try {
    await work();
  } catch (error) {
    if (error instanceof ProductionFlowError) throw new WorkflowError(error.message);
    throw error;
  }
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

/* ----------------------------------------------------------------- VIDEO -- */

export async function crearVideo(formData: FormData) {
  const user = await requirePermission("content.plan");
  return withMutation(user, false, async (tx, afterCommit) => {

    const title = field(formData, "title");
    const brandId = field(formData, "brandId");
    assertBrandPermission(user, brandId, "content.plan");
    if (!["", "IDEA"].includes(field(formData, "status"))) throw new Error("Los nuevos videos empiezan como idea.");
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
            kind: item.kind ?? "TASK",
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
    // Cadena de entregas: si la marca tiene equipo, el video nace con su paso de guion (SAVEPOINT).
    await chainEvent(tx, user, { type: "VIDEO_CREATED", videoId: created.id });

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
    // Nueva fecha de grabación: la grabación automática pendiente la sigue (PRODUCTION_FLOW_ENABLED).
    if (dateKey(before.shootDate) !== dateKey(data.shootDate)) await onShootDateChanged(tx, user, id);
    // Cadena de entregas: la fecha prevista manda sobre el plazo de la publicación pendiente.
    if (before.scheduledDate.getTime() !== data.scheduledDate.getTime()) await onScheduledDateChanged(tx, user, id);

    afterCommit(() => revalidar(id));
  });
}

/** Producción puede ajustar logística sin recibir edición del brief ni publicación. */
export async function actualizarGrabacion(formData: FormData) {
  const user = await requirePermission("content.scheduleShoot");
  return withMutation(user, false, async (tx, afterCommit) => {
    const id = field(formData, "id");
    await assertContentAccess(tx, user, id, "content.scheduleShoot");
    await assertVideoOpen(tx, user, id);
    await lockRevision(tx, "ContentItem", id, formData);
    const before = await tx.contentItem.findUniqueOrThrow({ where: { id }, select: { shootDate: true, brandId: true, title: true } });
    const data = { shootDate: dateField(formData, "shootDate") };
    await tx.contentItem.update({ where: { id }, data });
    await auditInTransaction(tx, { user, action: "EDITAR", entity: "ContentItem", entityId: id, brandId: before.brandId,
      summary: `Cambió la fecha de grabación de "${before.title}"`, changes: diffFields(before, data, FIELD_LABELS) });
    if (dateKey(before.shootDate) !== dateKey(data.shootDate)) await onShootDateChanged(tx, user, id);
    afterCommit(() => revalidar(id));
  });
}

export async function cambiarEstado(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);
  return withWorkflowMutation(user, false, async (tx, afterCommit) => {
    const id = field(formData, "id");
    const status = enumField(formData, "status", CONTENT_STATUS_MAP);
    await transitionVideo(tx, user, { id, status, expectedUpdatedAt: field(formData, "expectedUpdatedAt"), override: formData.get("override") === "1", reason: field(formData, "reason") });
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
        // Cadena de entregas: la copia no hereda la fecha de grabación (la del original era
        // suya); la cadena la programa con el «Listo» del guion. Sin cadena, como siempre.
        shootDate: productionChainEnabled(origen.brandId) ? null : origen.shootDate,
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
            kind: c.kind,
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
    // Cadena de entregas: la copia nace como idea con su paso de guion (SAVEPOINT).
    await chainEvent(tx, user, { type: "VIDEO_CREATED", videoId: copia.id });

    afterCommit(() => revalidar(copia.id));
    afterCommit(() => redirect(`/contenido/${copia.id}`));
  });
}

/* ------------------------------------------------------------- CHECKLIST -- */

export async function alternarCheck(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);
  return withWorkflowMutation(user, false, async (tx, afterCommit) => {
    const id = field(formData, "id");
    const done = boolField(formData, "done");

    const check = await tx.checklistItem.findUnique({
      where: { id },
      include: { contentItem: { select: { id: true, title: true, brandId: true } } },
    });
    if (!check) return;
    await assertContentAccess(tx, user, check.contentItemId, checklistCapability(check.stage, check.label, check.kind));
    await lockVideoLifecycle(tx, check.contentItemId);
    const current = await tx.checklistItem.findUniqueOrThrow({ where: { id } });
    if (current.done === done) return;
    const approvalKind = current.kind === "SCRIPT_APPROVAL" || current.kind === "FINAL_APPROVAL" ? current.kind : null;
    const reopening = current.done && !done && Boolean(approvalKind);
    const reason = reopening ? reopeningReason(field(formData, "reason")) : "";
    if (checklistCapability(check.stage, check.label, check.kind) !== "content.approve" && check.stage !== "PUBLICACION") await assertVideoOpen(tx, user, check.contentItemId);
    if (check.stage === "PUBLICACION") await assertPublishable(tx, user, check.contentItemId);

    let approvalId: string | null = null;
    if (approvalKind && done) {
      const video = await tx.contentItem.findUniqueOrThrow({ where: { id: check.contentItemId } });
      if (approvalKind === "FINAL_APPROVAL" && video.status !== "EDICION") throw new WorkflowError("La aprobación final se completa en la etapa Edición.");
      if (approvalKind === "SCRIPT_APPROVAL" && video.status !== "GUION") throw new WorkflowError("La aprobación del guion se completa en la etapa Guion.");
      await assertScriptApproved(tx, video.scriptId);
      if (approvalKind === "FINAL_APPROVAL") {
        await assertChecklistApproved(tx, video.id, "SCRIPT_APPROVAL");
        await assertRequiredChecks(tx, video.id, ["PREPRODUCCION", "GRABACION", "POSTPRODUCCION", "GENERAL"]);
        // Cadena de entregas: la revisión final exige el enlace del máster en el paso de edición.
        await reglaDeCadena(() => assertFinalApprovalAllowed(tx, video.id));
      }
      approvalId = (await approveVersion(tx, user, approvalKind, video.id, field(formData, "expectedApproval"))).id;
    }
    if (reopening) {
      await revokeVersion(tx, current.approvalId, user, reason);
      if (approvalKind === "SCRIPT_APPROVAL") await reopenContentApprovals(tx, check.contentItemId, user, reason, false);
    }
    await tx.checklistItem.update({
      where: { id },
      data: done
        ? { done: true, doneById: user.id, doneAt: new Date(), approvalId }
        : { done: false, doneById: null, doneAt: null, approvalId: null },
    });

    await auditInTransaction(tx, {
      user,
      action: done ? "COMPLETAR" : "REABRIR",
      entity: "ChecklistItem",
      entityId: id,
      brandId: check.contentItem.brandId,
      summary: `${done ? "Marcó" : "Reabrió"} el check "${check.label}" del video "${
        check.contentItem.title
      }"${reopening ? `. Motivo: ${reason}` : ""}`,
    });

    // Grabación terminada → edición; revisión final aprobada → publicación (PRODUCTION_FLOW_ENABLED).
    if (done) await onChecklistCompleted(tx, user, { contentItemId: check.contentItemId, stage: current.stage, kind: current.kind });
    // Cadena de entregas: retirar la revisión final devuelve la edición y cancela la publicación (SAVEPOINT).
    else await chainEvent(tx, user, { type: "CHECK_REOPENED", videoId: check.contentItemId, stage: current.stage, kind: current.kind });

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

    const stage = enumField(formData, "stage", CHECKLIST_STAGE_MAP, "GENERAL");
    const kind = choice(field(formData, "kind") || "TASK", ["TASK", "SCRIPT_APPROVAL", "FINAL_APPROVAL"], "Tipo de paso");
    if (kind !== "TASK") {
      assertPermission(user, "content.approve");
      if (stage !== (kind === "SCRIPT_APPROVAL" ? "PREPRODUCCION" : "POSTPRODUCCION")) throw new Error("La aprobación no corresponde a esa etapa.");
      if (await tx.checklistItem.count({ where: { contentItemId, kind } })) throw new Error("Esta aprobación ya existe en el video.");
    }

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
        kind,
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

    if (check.kind !== "TASK") throw new Error("Las aprobaciones se reabren con motivo; no se eliminan.");
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
    // Cadena de entregas: el paso pendiente de esa función pasa a esta persona si no tenía a nadie apto (SAVEPOINT).
    await chainEvent(tx, user, { type: "ASSIGNMENT_CHANGED", videoId: contentItemId, role, userId });

    afterCommit(() => revalidar(contentItemId));
  });
}

/**
 * Quita una función del video. Con la cadena, si esa persona tiene el paso pendiente de esa
 * función, se rechaza con el motivo legible («Reasigna primero el paso…») como { error }.
 */
export async function quitarAsignacion(formData: FormData) {
  const user = await requirePermission("content.assign");
  return withWorkflowMutation(user, false, async (tx, afterCommit) => {
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
    // Cadena de entregas: quien tiene el paso pendiente de esa función no se quita sin reasignarlo antes.
    await reglaDeCadena(() => assertAssignmentRemovable(tx, asignacion.contentItemId, asignacion.userId, asignacion.role));

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
