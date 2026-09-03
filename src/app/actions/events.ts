"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { LEVEL, requireLevel } from "@/lib/auth";
import { diffFields, logAudit } from "@/lib/audit";
import { EVENT_KIND_MAP } from "@/lib/constants";
import {
  boolField,
  field,
  fieldOrNull,
  formatDate,
  fromDateKey,
  instantInZone,
} from "@/lib/utils";

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
 * Si la hora llega vacía o mal escrita, se deja la fecha tal cual.
 */
function conHora(fecha: string, hora: string): Date | null {
  if (!fecha) return null;
  const partes = hora.split(":");
  const h = Number(partes[0]);
  const m = Number(partes[1]);
  if (partes.length < 2 || partes[0].trim() === "" || !Number.isFinite(h)) {
    return fromDateKey(fecha);
  }
  return instantInZone(fecha, `${h}:${Number.isFinite(m) ? m : 0}`);
}

function leerCampos(formData: FormData) {
  const allDay = boolField(formData, "allDay");
  const inicioKey = field(formData, "startDate");
  const finKey = field(formData, "endDate");

  return {
    title: field(formData, "title"),
    description: fieldOrNull(formData, "description"),
    kind: field(formData, "kind") || "REUNION",
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

/* ------------------------------------------------------------------ ALTA -- */

export async function crearEvento(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);
  const datos = leerCampos(formData);

  if (!datos.title) throw new Error("El evento necesita un título.");
  if (!datos.startAt) throw new Error("El evento necesita una fecha.");

  // Si alguien pone el fin antes del inicio, se ignora en vez de guardar basura.
  const endAt = datos.endAt && datos.endAt > datos.startAt ? datos.endAt : null;

  const evento = await prisma.calendarEvent.create({
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

  await logAudit({
    user,
    action: "CREAR",
    entity: "CalendarEvent",
    entityId: evento.id,
    brandId: datos.brandId,
    summary: `Agendó ${tipoLabel(datos.kind).toLowerCase()} "${datos.title}" para el ${formatDate(datos.startAt)}`,
  });

  refrescar();
}

/* ------------------------------------------------------------- ACTUALIZAR -- */

export async function actualizarEvento(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);
  const id = field(formData, "id");
  if (!id) return;

  const before = await prisma.calendarEvent.findUnique({ where: { id } });
  if (!before) return;

  const datos = leerCampos(formData);
  if (!datos.title || !datos.startAt) return;

  const endAt = datos.endAt && datos.endAt > datos.startAt ? datos.endAt : null;

  const data = {
    title: datos.title,
    description: datos.description,
    kind: datos.kind,
    startAt: datos.startAt,
    endAt,
    allDay: datos.allDay,
    location: datos.location,
    brandId: datos.brandId,
  };

  await prisma.calendarEvent.update({ where: { id }, data });

  await logAudit({
    user,
    action: "EDITAR",
    entity: "CalendarEvent",
    entityId: id,
    brandId: data.brandId ?? before.brandId,
    summary: `Movió o editó "${data.title}" en la agenda`,
    changes: diffFields(before, data, LABELS),
  });

  refrescar();
}

/* --------------------------------------------------------------- ELIMINAR -- */

/** Borrar es cosa del dueño, como todo lo destructivo. */
export async function eliminarEvento(formData: FormData) {
  const user = await requireLevel(LEVEL.OWNER);
  const id = field(formData, "id");
  if (!id) return;

  const evento = await prisma.calendarEvent.findUnique({
    where: { id },
    select: { id: true, title: true, kind: true, brandId: true, startAt: true },
  });
  if (!evento) return;

  await prisma.calendarEvent.delete({ where: { id } });

  await logAudit({
    user,
    action: "ELIMINAR",
    entity: "CalendarEvent",
    entityId: id,
    brandId: evento.brandId,
    summary: `Quitó de la agenda ${tipoLabel(evento.kind).toLowerCase()} "${evento.title}" del ${formatDate(evento.startAt)}`,
  });

  refrescar();
}
