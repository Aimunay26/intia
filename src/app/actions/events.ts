"use server";
import { requirePermission } from "@/lib/auth";
import { assertBrandPermission } from "@/lib/permissions";
import { assertContentAccess, eventScope } from "@/lib/access-scope";

import { revalidatePath } from "next/cache";

import { auditInTransaction, diffFields } from "@/lib/audit";
import { LEVEL, requireLevel } from "@/lib/auth";
import { EVENT_KIND_MAP } from "@/lib/constants";
import { lockRevision, withMutation } from "@/lib/mutations";
import type { AppTransaction } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";
import {
	boolField,
	field,
	fieldOrNull,
	formatDate,
	fromDateKey,
	instantInZone,
} from "@/lib/utils";
import { enumField } from "@/lib/validation";

/**
 * Agenda: reuniones, pendientes, días de grabación y recordatorios.
 *
 * Es lo que hace que el calendario contenga TODO y no solo los videos, y es
 * lo que se publica al feed que lee Google Calendar.
 */

const LABELS: Record<string, string> = {
  title: "Título",
  description: "Descripción",
  kind: "Tipo",
  startAt: "Fecha",
  endAt: "Fecha de fin",
  allDay: "Todo el día",
  location: "Lugar",
  brandId: "Marca",
  contentItemId: "Video vinculado",
};

function refrescar() {
  revalidatePath("/calendario");
  revalidatePath("/");
  revalidatePath("/actividad");
}

function tipoLabel(value: string) {
  return EVENT_KIND_MAP[value]?.label ?? value;
}

/**
 * Junta la fecha (yyyy-mm-dd) con la hora (hh:mm) del formulario.
 *
 * La hora se interpreta SIEMPRE en la zona del negocio, no en la del servidor:
 * en Vercel el servidor corre en UTC y "las 10:00" acabarían siendo las 5:00.
 * Una hora vacía no define un instante; una hora inválida se rechaza.
 */
function conHora(fecha: string, hora: string): Date | null {
  if (!fecha || !hora) return null;
  return instantInZone(fecha, hora);
}

function leerCampos(formData: FormData) {
  const allDay = boolField(formData, "allDay");
  const inicioKey = field(formData, "startDate");
  const finKey = field(formData, "endDate");

  return {
    title: field(formData, "title"),
    description: fieldOrNull(formData, "description"),
    kind: enumField(formData, "kind", EVENT_KIND_MAP, "REUNION"),
    allDay,
    startAt: allDay
      ? inicioKey
        ? fromDateKey(inicioKey)
        : null
      : conHora(inicioKey, field(formData, "startTime")),
    endAt: allDay
      ? finKey
        ? fromDateKey(finKey)
        : null
      : conHora(finKey || inicioKey, field(formData, "endTime")),
    location: fieldOrNull(formData, "location"),
    brandId: fieldOrNull(formData, "brandId"),
    contentItemId: fieldOrNull(formData, "contentItemId"),
  };
}

async function validarVinculo(tx: AppTransaction, user: SessionUser, datos: ReturnType<typeof leerCampos>) {
  if (datos.contentItemId) {
    await assertContentAccess(tx, user, datos.contentItemId, "calendar.edit");
    const video = await tx.contentItem.findUniqueOrThrow({ where: { id: datos.contentItemId }, select: { brandId: true } });
    if (datos.brandId && datos.brandId !== video.brandId) throw new Error("El evento y el video deben pertenecer a la misma marca.");
    datos.brandId = video.brandId;
  }
  if (datos.brandId) assertBrandPermission(user, datos.brandId, "calendar.edit");
}

/* ------------------------------------------------------------------ ALTA -- */

export async function crearEvento(formData: FormData) {
  const user = await requirePermission("calendar.edit");
  return withMutation(user, false, async (tx, afterCommit) => {
    const datos = leerCampos(formData);
    await validarVinculo(tx, user, datos);

    if (!datos.title) throw new Error("El evento necesita un título.");
    if (!datos.startAt) throw new Error("El evento necesita una fecha.");

    if (datos.endAt && datos.endAt < datos.startAt) throw new Error("El fin no puede ser anterior al inicio.");
    if (!datos.allDay && datos.endAt?.getTime() === datos.startAt.getTime()) throw new Error("La hora de fin debe ser posterior al inicio.");
    const endAt = datos.endAt;

    const evento = await tx.calendarEvent.create({
      data: {
        title: datos.title,
        description: datos.description,
        kind: datos.kind,
        startAt: datos.startAt,
        endAt,
        allDay: datos.allDay,
        location: datos.location,
        brandId: datos.brandId,
        contentItemId: datos.contentItemId,
        createdById: user.id,
      },
    });

    await auditInTransaction(tx, {
      user,
      action: "CREAR",
      entity: "CalendarEvent",
      entityId: evento.id,
      brandId: datos.brandId,
      summary: `Agendó ${tipoLabel(datos.kind).toLowerCase()} "${datos.title}" para el ${formatDate(datos.startAt)}`,
    });

    afterCommit(() => refrescar());
  });
}

/* ------------------------------------------------------------- ACTUALIZAR -- */

export async function actualizarEvento(formData: FormData) {
  const user = await requirePermission("calendar.edit");
  return withMutation(user, false, async (tx, afterCommit) => {
    if (!await tx.calendarEvent.count({ where: { AND: [{ id: field(formData, "id") }, eventScope(user)] } })) throw new Error("No tienes acceso a este evento.");
    const id = field(formData, "id");
    if (!id) return;

    await lockRevision(tx, "CalendarEvent", id, formData);
    const before = await tx.calendarEvent.findUnique({ where: { id } });
    if (!before) return;

    const datos = leerCampos(formData);
    // Omitir el campo conserva el vínculo; enviarlo vacío lo elimina explícitamente.
    if (!formData.has("contentItemId")) datos.contentItemId = before.contentItemId;
    await validarVinculo(tx, user, datos);
    if (!datos.title) throw new Error("El evento necesita un título.");
    if (!datos.startAt) throw new Error("El evento necesita una fecha y hora válidas.");

    if (datos.endAt && datos.endAt < datos.startAt) throw new Error("El fin no puede ser anterior al inicio.");
    if (!datos.allDay && datos.endAt?.getTime() === datos.startAt.getTime()) throw new Error("La hora de fin debe ser posterior al inicio.");
    const endAt = datos.endAt;

    const data = {
      title: datos.title,
      description: datos.description,
      kind: datos.kind,
      startAt: datos.startAt,
      endAt,
      allDay: datos.allDay,
      location: datos.location,
      brandId: datos.brandId,
      contentItemId: datos.contentItemId,
    };

    await tx.calendarEvent.update({ where: { id }, data });

    await auditInTransaction(tx, {
      user,
      action: "EDITAR",
      entity: "CalendarEvent",
      entityId: id,
      brandId: data.brandId ?? before.brandId,
      summary: `Movió o editó "${data.title}" en la agenda`,
      changes: diffFields(before, data, LABELS),
    });

    afterCommit(() => refrescar());
  });
}

/* --------------------------------------------------------------- ELIMINAR -- */

/** Borrar es cosa del dueño, como todo lo destructivo. */
export async function eliminarEvento(formData: FormData) {
  const user = await requireLevel(LEVEL.OWNER);
  return withMutation(user, true, async (tx, afterCommit) => {
    const id = field(formData, "id");
    if (!id) return;

    const evento = await tx.calendarEvent.findUnique({
      where: { id },
      select: { id: true, title: true, kind: true, brandId: true, startAt: true },
    });
    if (!evento) return;

    await tx.calendarEvent.delete({ where: { id } });

    await auditInTransaction(tx, {
      user,
      action: "ELIMINAR",
      entity: "CalendarEvent",
      entityId: id,
      brandId: evento.brandId,
      summary: `Quitó de la agenda ${tipoLabel(evento.kind).toLowerCase()} "${evento.title}" del ${formatDate(evento.startAt)}`,
    });

    afterCommit(() => refrescar());
  });
}
