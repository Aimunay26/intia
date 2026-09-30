"use client";
import { CalendarDays } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { miCalendario, type CalendarSubscriptionState } from "@/app/actions/calendar-feed";
import { CopyButton, SubmitButton } from "@/components/forms";
import type { PersonalCalendarRow } from "@/lib/calendar-subscriptions";

/** Resultado de la acción: el enlace se muestra una sola vez, nunca se vuelve a leer. */
function Result({ state }: { state: CalendarSubscriptionState }) {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const url = state?.token && origin ? `${origin}/api/calendario.ics?token=${state.token}` : "";
  return (
    <>
      {state?.error ? <p role="alert" className="text-[13px] text-[var(--danger)]">{state.error}</p> : null}
      {state?.ok ? <p role="status" className="text-inksoft text-[13px]">{state.ok}</p> : null}
      {url ? (
        <div className="space-y-2">
          <input className="input" aria-label="Enlace privado de tu calendario" readOnly value={url} />
          <CopyButton text={url} label="Copiar enlace privado" />
        </div>
      ) : null}
    </>
  );
}

function Days() {
  return (
    <label className="block text-[13px]">
      Vigencia
      <select className="input" name="days" defaultValue="90">
        <option value="30">30 días</option>
        <option value="90">90 días</option>
        <option value="365">365 días</option>
      </select>
    </label>
  );
}

/**
 * «Mi calendario en Google»: crear, renovar o revocar el feed personal (CALENDAR_FEED_PERSONAL).
 * `row` es el enlace vigente (sin token); `pasos` dice si el feed ya lleva los pasos de la cadena.
 */
export function CalendarFeedCard({ row, pasos }: { row: PersonalCalendarRow; pasos: boolean }) {
  const [state, action, pending] = useActionState(miCalendario, null);
  const activo = row && !row.expired;
  return (
    <section aria-labelledby="mi-calendario-title" className="card space-y-3 p-5 text-[13.5px]">
      <h2 id="mi-calendario-title" className="flex items-center gap-2 text-[15px] font-semibold">
        <CalendarDays size={16} aria-hidden /> Mi calendario en Google
      </h2>
      <p className="text-inksoft">
        {pasos
          ? "Un enlace privado con tus pasos pendientes (Guion, Grabar, Editar, Publicar, Diseño), las fechas de los videos donde participas y la agenda de tus marcas."
          : "Un enlace privado con las fechas de los videos donde participas y la agenda de tus marcas."}{" "}
        Se calcula en cada lectura: si dejas una marca, sus fechas desaparecen solas.
      </p>
      <p className="text-inkmuted text-[12.5px]">
        En Google Calendar (en la web): «Otros calendarios» → «+» → «Desde URL» y pega el enlace. Google lo vuelve a leer cada
        pocas horas. Quien tenga el enlace puede ver títulos y fechas: no lo compartas.
      </p>

      {activo ? (
        <div className="space-y-3">
          <p className="text-ink font-medium">Tienes un enlace activo hasta el {row.expiresAt.slice(0, 10)}.</p>
          <div className="flex flex-wrap items-end gap-3">
            <form action={action} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="operation" value="rotate" />
              <input type="hidden" name="id" value={row.id} />
              <input type="hidden" name="expectedUpdatedAt" value={row.updatedAt} />
              <Days />
              <SubmitButton disabled={pending} className="btn btn-sm">
                Renovar enlace
              </SubmitButton>
            </form>
            <form action={action}>
              <input type="hidden" name="operation" value="revoke" />
              <input type="hidden" name="id" value={row.id} />
              <input type="hidden" name="expectedUpdatedAt" value={row.updatedAt} />
              <SubmitButton disabled={pending} className="btn btn-sm">
                Revocar
              </SubmitButton>
            </form>
          </div>
          <p className="text-inkmuted text-[12px]">
            Renovar crea un enlace nuevo y el anterior deja de funcionar (úsalo si lo perdiste). Revocar bloquea nuevas lecturas;
            lo que Google ya guardó se borra cuando quites el calendario allí.
          </p>
        </div>
      ) : (
        <form action={action} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="operation" value="create" />
          {row?.expired ? <p className="text-inkmuted w-full text-[12.5px]">Tu enlace anterior venció. Crea uno nuevo.</p> : null}
          <Days />
          <SubmitButton disabled={pending} className="btn btn-primary btn-sm">
            Crear mi enlace privado
          </SubmitButton>
        </form>
      )}
      <Result state={state} />
    </section>
  );
}
