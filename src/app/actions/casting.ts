"use server";

import { invalidateTeamPreparation } from "@/lib/preparation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { assertContentAccess, lockVideoLifecycle } from "@/lib/access-scope";
import { withWorkflowMutation, lockRevision } from "@/lib/mutations";
import { actorConflict, castingInclude, castingToken, eligibleActor, parseMinute, recordingInterval, roleCurrent, scriptRoles } from "@/lib/casting";
import { auditInTransaction } from "@/lib/audit";
import { assertScriptApproved } from "@/lib/approvals";
import { assertWorkBrand } from "@/lib/work-assignees";
import { invalidateRecordingPreparation } from "@/lib/domain/production-dates";
import { WorkflowError } from "@/lib/workflow-policy";
import { field, instantInZone } from "@/lib/utils";
import type { AppTransaction } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";
import type { CastingVideo } from "@/lib/casting";

function refresh(id: string) {
  for (const path of [`/contenido/${id}`, "/contenido", "/guiones", "/calendario", "/tareas", "/"]) revalidatePath(path);
}
async function editable(tx: AppTransaction, user: SessionUser, data: FormData, coordinate: boolean) {
  const id = field(data, "contentItemId");
  await assertContentAccess(tx, user, id, coordinate ? "content.assign" : "content.view");
  await lockVideoLifecycle(tx, id);
  const video = await tx.contentItem.findUniqueOrThrow({ where: { id }, include: castingInclude });
  await assertWorkBrand(tx, video.brandId);
  if (["EDICION", "PROGRAMADO", "PUBLICADO", "CANCELADO"].includes(video.status) || await tx.productionStep.count({ where: { contentItemId: id, step: "GRABACION", status: "HECHO" } })) throw new WorkflowError("La grabación está cerrada. Devuelve el trabajo a grabación antes de modificar el reparto.");
  if (field(data, "expectedToken") !== castingToken(video)) throw new WorkflowError("El guion o la sesión cambió. Recarga y revisa antes de confirmar.");
  return video;
}
async function resetActorCheck(tx: AppTransaction, id: string) {
  await tx.checklistItem.updateMany({ where: { contentItemId: id, stage: "PREPRODUCCION", kind: "TASK", label: { contains: "Actor asignado", mode: "insensitive" } }, data: { done: false, doneAt: null, doneById: null } });
}
async function reconcileAccess(tx: AppTransaction, videoId: string) {
  const roles = await tx.castRole.findMany({ where: { contentItemId: videoId, userId: { not: null } }, select: { userId: true } });
  const ids = [...new Set(roles.map(r => r.userId!))];
  for (const userId of ids) await tx.assignment.upsert({ where: { contentItemId_userId_role: { contentItemId: videoId, userId, role: "ACTOR" } },
    create: { contentItemId: videoId, userId, role: "ACTOR", castingManaged: true }, update: {} });
  await tx.assignment.deleteMany({ where: { contentItemId: videoId, role: "ACTOR", castingManaged: true, userId: { notIn: ids } } });
}
async function audit(tx: AppTransaction, user: SessionUser, video: CastingVideo, summary: string) {
  await auditInTransaction(tx, { user, action: "EDITAR", entity: "ContentItem", entityId: video.id, brandId: video.brandId, summary: `${summary} · ${video.title}` });
}

export async function prepararReparto(data: FormData) {
  const user = await requireUser();
  return withWorkflowMutation(user, false, async (tx, afterCommit) => {
    const video = await editable(tx, user, data, true);
    await lockRevision(tx, "ContentItem", video.id, data);
    const slots = scriptRoles(video);
    if (!slots.length && !video.castRoles.length) throw new WorkflowError("Añade actores con su papel en las escenas del guion antes de preparar el reparto.");
    if (slots.length === video.castRoles.length && video.castRoles.every(role => roleCurrent(role, video))) return;
    for (const slot of slots) {
      const previous = video.castRoles.find(r => r.slotKey === slot.slotKey);
      const { sceneOrder: _sceneOrder, ...definition } = slot;
      await tx.castRole.upsert({ where: { contentItemId_slotKey: { contentItemId: video.id, slotKey: slot.slotKey } },
        create: { contentItemId: video.id, ...definition },
        update: previous && roleCurrent(previous, video) ? {} : { ...definition, userId: null, response: "PENDIENTE", confirmedToken: null, respondedAt: null, responseNote: "" } });
    }
    await tx.castRole.deleteMany({ where: { contentItemId: video.id, slotKey: { notIn: slots.map(s => s.slotKey) } } });
    await reconcileAccess(tx, video.id);
    await invalidateTeamPreparation(tx, video.id);
    await resetActorCheck(tx, video.id);
    await tx.contentItem.update({ where: { id: video.id }, data: { castingRevision: { increment: 1 } } });
    await audit(tx, user, video, "Actualizó los papeles del reparto desde las escenas; requiere nuevas confirmaciones");
    afterCommit(() => refresh(video.id));
  });
}

export async function asignarPapel(data: FormData) {
  const user = await requireUser();
  return withWorkflowMutation(user, false, async (tx, afterCommit) => {
    const video = await editable(tx, user, data, true);
    const role = video.castRoles.find(r => r.id === field(data, "id"));
    if (!role || !roleCurrent(role, video)) throw new WorkflowError("Actualiza los papeles desde el guion antes de asignar.");
    await lockRevision(tx, "CastRole", role.id, data);
    const userId = field(data, "userId") || null;
    let selectedName = "Sin asignar";
    if (userId) {
      const candidate = await tx.user.findUnique({ where: { id: userId }, include: { workProfiles: true, brandAccess: true } });
      if (!candidate || !eligibleActor(candidate, video.brandId)) throw new WorkflowError("El actor debe estar activo, tener perfil Talento y acceso a esta marca.");
      selectedName = candidate.name;
    }
    if (role.userId === userId) return;
    await tx.castRole.update({ where: { id: role.id }, data: { userId, response: "PENDIENTE", confirmedToken: null, respondedAt: null, responseNote: "" } });
    await reconcileAccess(tx, video.id);
    await invalidateTeamPreparation(tx, video.id);
    await resetActorCheck(tx, video.id);
    await audit(tx, user, video, `Cambió «${role.role}» de ${role.user?.name ?? "Sin asignar"} a ${selectedName}; pendiente de confirmación personal`);
    afterCommit(() => refresh(video.id));
  });
}

export async function guardarHorarioReparto(data: FormData) {
  const user = await requireUser();
  return withWorkflowMutation(user, false, async (tx, afterCommit) => {
    const video = await editable(tx, user, data, true);
    await lockRevision(tx, "ContentItem", video.id, data);
    if (!video.shootDate) throw new WorkflowError("Asigna primero la fecha de grabación.");
    const start = parseMinute(field(data, "start")), end = parseMinute(field(data, "end"));
    if (end <= start) throw new WorkflowError("La hora de fin debe ser posterior al inicio, dentro del mismo día.");
    if (video.shootStartMinute === start && video.shootEndMinute === end) return;
    await invalidateRecordingPreparation(tx, user, video.id);
    await tx.contentItem.update({ where: { id: video.id }, data: { shootStartMinute: start, shootEndMinute: end } });
    await audit(tx, user, video, "Cambió el horario de grabación; requiere confirmar de nuevo la preparación y el reparto");
    afterCommit(() => refresh(video.id));
  });
}

export async function responderPapel(data: FormData) {
  const user = await requireUser();
  return withWorkflowMutation(user, false, async (tx, afterCommit) => {
    const video = await editable(tx, user, data, false);
    const role = video.castRoles.find(r => r.id === field(data, "id") && r.userId === user.id);
    if (!role || !role.user || !eligibleActor(role.user, video.brandId) || !roleCurrent(role, video)) throw new WorkflowError("Solo el actor asignado puede responder por este papel vigente.");
    await lockRevision(tx, "CastRole", role.id, data);
    // Serialize all responses and unavailable intervals of this actor, including across brands.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
    const response = field(data, "response"), note = field(data, "note").trim();
    if (!["CONFIRMADO", "RECHAZADO"].includes(response) || note.length > 500) throw new WorkflowError("Respuesta no válida (nota máxima: 500 caracteres).");
    if (response === "RECHAZADO" && !note) throw new WorkflowError("Indica el motivo por el que no puedes participar.");
    if (response === "CONFIRMADO") {
      await assertScriptApproved(tx, video.scriptId);
      if (!recordingInterval(video)) throw new WorkflowError("Espera a que coordinación asigne fecha y horario.");
      const conflict = await actorConflict(tx, user.id, video);
      if (conflict) throw new WorkflowError(conflict);
    }
    await tx.castRole.update({ where: { id: role.id }, data: { response, responseNote: note, confirmedToken: castingToken(video), respondedAt: new Date() } });
    await resetActorCheck(tx, video.id);
    await audit(tx, user, video, `${response === "CONFIRMADO" ? "Confirmó" : "Rechazó"} personalmente «${role.role}» para el guion y horario vigentes${note ? `: ${note}` : ""}`);
    afterCommit(() => refresh(video.id));
  });
}

export async function guardarIndisponibilidad(data: FormData) {
  const user = await requireUser();
  return withWorkflowMutation(user, false, async (tx, afterCommit) => {
    const id = field(data, "contentItemId");
    await assertContentAccess(tx, user, id, "content.view");
    await assertWorkBrand(tx, (await tx.contentItem.findUniqueOrThrow({ where: { id }, select: { brandId: true } })).brandId);
    if (!await tx.castRole.count({ where: { contentItemId: id, userId: user.id } })) throw new WorkflowError("Solo puedes gestionar tu propia disponibilidad desde un reparto asignado.");
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
    const blockId = field(data, "blockId");
    if (blockId) await tx.actorUnavailability.deleteMany({ where: { id: blockId, userId: user.id } });
    else {
      const date = field(data, "date"), start = parseMinute(field(data, "start")), end = parseMinute(field(data, "end"));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || end <= start) throw new WorkflowError("Indica una fecha y un intervalo válido dentro del mismo día.");
      const startAt = instantInZone(date, field(data, "start")), endAt = instantInZone(date, field(data, "end"));
      if (await tx.actorUnavailability.count({ where: { userId: user.id, endAt: { gt: new Date() } } }) >= 200) throw new WorkflowError("Ya tienes 200 bloqueos futuros. Quita los que no necesites.");
      // Existing confirmations are invalidated atomically: removing a block cannot resurrect them.
      const videos = await tx.contentItem.findMany({ where: { brand: { archived: false }, castRoles: { some: { userId: user.id } }, status: { notIn: ["EDICION", "PROGRAMADO", "PUBLICADO", "CANCELADO"] } }, include: castingInclude });
      for (const video of videos) {
        const interval = recordingInterval(video);
        if (interval && interval.startAt < endAt && interval.endAt > startAt) {
          await tx.castRole.updateMany({ where: { contentItemId: video.id, userId: user.id }, data: { response: "PENDIENTE", confirmedToken: null, respondedAt: null } });
          await resetActorCheck(tx, video.id);
          await audit(tx, user, video, "Retiró su confirmación del reparto por un cambio de disponibilidad");
        }
      }
      await tx.actorUnavailability.create({ data: { userId: user.id, startAt, endAt } });
    }
    afterCommit(() => revalidatePath("/", "layout"));
  });
}
