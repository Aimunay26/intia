"use client";
import { EditForm, RevisionField } from "@/components/edit-form";

import { CalendarPlus, Trash2 } from "lucide-react";
import { useState } from "react";

import { actualizarEvento, crearEvento, eliminarEvento } from "@/app/actions/events";
import { DeleteButton, ModalForm, SubmitButton } from "@/components/forms";
import { Field } from "@/components/ui";
import { EVENT_KINDS } from "@/lib/constants";

export type EventFormBrand = { id: string; name: string };

export type EventRow = {
  updatedAt: string;
  id: string;
  title: string;
  description: string;
  kind: string;
  startDate: string; // yyyy-mm-dd
  startTime: string; // hh:mm
  endDate: string;
  endTime: string;
  allDay: boolean;
  location: string;
  brandId: string;
  contentItemId: string;
};

/** Campos compartidos entre el alta y la edición. */
function CamposEvento({
  brands,
  defaultBrandId,
  defaultDate,
  value,
}: {
  brands: EventFormBrand[];
  defaultBrandId?: string;
  defaultDate: string;
  value?: EventRow;
}) {
  const [linked, setLinked] = useState(Boolean(value?.contentItemId));
  const [allDay, setAllDay] = useState(value?.allDay ?? true);

  return (
    <>
      {value?.contentItemId && <label className="text-sm"><input type="checkbox" checked={linked} onChange={e => setLinked(e.target.checked)} /> Mantener el vínculo con el video y su marca<input type="hidden" name="contentItemId" value={linked ? value.contentItemId : ""} /></label>}
      <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
        <Field label="Título" required>
          <input
            name="title"
            className="input"
            defaultValue={value?.title}
            placeholder="Ej. Reunión de contenido con Con Amor"
            required
            autoFocus
          />
        </Field>
        <Field label="Tipo">
          <select name="kind" className="select" defaultValue={value?.kind ?? "REUNION"}>
            {EVENT_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          name="allDay"
          checked={allDay}
          onChange={(e) => setAllDay(e.target.checked)}
          className="accent-brand h-3.5 w-3.5 cursor-pointer"
        />
        <span className="text-inksoft">Dura todo el día</span>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Empieza" required>
          <div className="flex gap-2">
            <input
              type="date"
              name="startDate"
              className="input"
              defaultValue={value?.startDate ?? defaultDate}
              required
            />
            {!allDay ? (
              <input
                type="time"
                name="startTime"
                className="input w-[110px]"
                defaultValue={value?.startTime || "10:00"}
              />
            ) : null}
          </div>
        </Field>
        <Field label="Termina" hint="Déjalo vacío si es de un solo día.">
          <div className="flex gap-2">
            <input
              type="date"
              name="endDate"
              className="input"
              defaultValue={value?.endDate}
            />
            {!allDay ? (
              <input
                type="time"
                name="endTime"
                className="input w-[110px]"
                defaultValue={value?.endTime || "11:00"}
              />
            ) : null}
          </div>
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Marca" hint="Opcional: déjalo vacío si es algo general.">
          <select
            name="brandId" disabled={linked}
            className="select"
            defaultValue={value?.brandId ?? defaultBrandId ?? ""}
          >
            <option value="">Sin marca concreta</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Lugar">
          <input
            name="location"
            className="input"
            defaultValue={value?.location}
            placeholder="Ej. Taller, Meet, casa de Lucía…"
          />
        </Field>
      </div>

      <Field label="Notas">
        <textarea
          name="description"
          className="textarea"
          rows={3}
          defaultValue={value?.description}
          placeholder="Qué hay que llevar, quién entra, qué se decide…"
        />
      </Field>
    </>
  );
}

/* --------------------------------------------------------------- NUEVO -- */

export function NuevoEventoBoton({
  brands,
  defaultDate,
  defaultBrandId,
  className = "btn",
}: {
  brands: EventFormBrand[];
  defaultDate: string;
  defaultBrandId?: string;
  className?: string;
}) {
  return (
    <ModalForm
      className={className}
      trigger={
        <>
          <CalendarPlus size={14} /> Agendar
        </>
      }
      title="Nuevo en la agenda"
      description="Reuniones, pendientes, días de grabación y recordatorios. Todo esto también viaja a Google Calendar."
      width={620}
    >
      <form action={crearEvento} className="space-y-3.5">
        <CamposEvento
          brands={brands}
          defaultBrandId={defaultBrandId}
          defaultDate={defaultDate}
        />
        <div className="flex justify-end pt-1">
          <SubmitButton
            className="btn btn-primary"
            icon={<CalendarPlus size={14} />}
            pendingLabel="Agendando…"
          >
            Agendar
          </SubmitButton>
        </div>
      </form>
    </ModalForm>
  );
}

/* --------------------------------------------------------------- EDITAR -- */

export function EditarEventoBoton({
  evento,
  brands,
  canDelete,
}: {
  evento: EventRow;
  brands: EventFormBrand[];
  canDelete: boolean;
}) {
  return (
    <ModalForm
      className="btn btn-ghost btn-sm"
      trigger={<>Editar</>}
      title="Editar de la agenda"
      width={620}
    >
      {(close) => (
        <>
          <EditForm action={actualizarEvento} onSuccess={close} className="space-y-3.5">
<RevisionField value={evento.updatedAt} />
            <input type="hidden" name="id" value={evento.id} />
            <CamposEvento
              brands={brands}
              defaultDate={evento.startDate}
              value={evento}
            />
            <div className="flex items-center justify-between gap-2 pt-1">
              {canDelete ? (
                <DeleteButton
                  action={eliminarEvento}
                  id={evento.id}
                  label="Eliminar"
                  icon={<Trash2 size={13} />}
                  title="¿Quitar esto de la agenda?"
                  description={`Se borrará "${evento.title}" del calendario y dejará de aparecer en Google Calendar.`}
                />
              ) : (
                <span className="hint">Solo el dueño puede eliminar.</span>
              )}
              <SubmitButton className="btn btn-primary" pendingLabel="Guardando…">
                Guardar cambios
              </SubmitButton>
            </div>
          </EditForm>
        </>
      )}
    </ModalForm>
  );
}
