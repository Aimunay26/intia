"use client";
import { useActionState, useEffect, useState } from "react";
import { gestionarSuscripcion, type CalendarSubscriptionState } from "@/app/actions/calendar-feed";
import { CopyButton, SubmitButton } from "@/components/forms";
import type { listCalendarSubscriptions } from "@/lib/calendar-subscriptions";

function Result({ state }: { state: CalendarSubscriptionState }) {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const url = state?.token && origin ? `${origin}/api/calendario.ics?token=${state.token}` : "";
  return <>{state?.error && <p role="alert">{state.error}</p>}{state?.ok && <p role="status">{state.ok}</p>}
    {url && <div className="space-y-2"><input className="input" aria-label="Enlace privado de suscripción" readOnly value={url} /><CopyButton text={url} label="Copiar enlace privado" /></div>}</>;
}
function Days() { return <label className="block">Vigencia<select className="input" name="days" defaultValue="90"><option value="30">30 días</option><option value="90">90 días</option><option value="365">365 días</option></select></label>; }

function Subscription({ row }: { row: Awaited<ReturnType<typeof listCalendarSubscriptions>>[number] }) {
  const [state, action, pending] = useActionState(gestionarSuscripcion, null);
  return <li className="space-y-2 border-t border-line py-3">
    <strong>{row.label}</strong><p>{row.scope === "ALL" ? "Todas las marcas y agenda general" : row.brand?.name} · {row.revokedAt ? "Revocado" : `Vence ${row.expiresAt.slice(0, 10)}`}</p>
    {!row.revokedAt && <div className="space-y-2"><form action={action} className="space-y-2">
      <input type="hidden" name="operation" value="rotate" />
      <input type="hidden" name="id" value={row.id} /><input type="hidden" name="expectedUpdatedAt" value={row.updatedAt} />
      <Days /><SubmitButton disabled={pending} className="btn btn-sm">Renovar enlace</SubmitButton>
    </form><form action={action}>
      <input type="hidden" name="operation" value="revoke" /><input type="hidden" name="id" value={row.id} /><input type="hidden" name="expectedUpdatedAt" value={row.updatedAt} />
      <SubmitButton disabled={pending} className="btn btn-sm">Revocar</SubmitButton>
    </form></div>}<Result state={state} />
  </li>;
}

export function CalendarSubscriptions({ rows, brands }: { rows: Awaited<ReturnType<typeof listCalendarSubscriptions>>; brands: { id: string; name: string }[] }) {
  const [state, action] = useActionState(gestionarSuscripcion, null);
  const [scope, setScope] = useState("BRAND");
  return <section aria-labelledby="calendar-subscriptions-title" className="card space-y-3 p-4 text-sm">
    <h2 id="calendar-subscriptions-title" className="font-semibold">Suscripciones de calendario</h2>
    <p>Crea un enlace por destinatario. Quien lo tenga podrá leer títulos y fechas hasta su vencimiento o revocación. El alcance queda fijado al crearlo.</p>
    <p>Los enlaces globales anteriores deben sustituirse. Copia el nuevo enlace en «Añadir por URL» de Google Calendar u otro calendario.</p>
    <form action={action} className="space-y-3">
      <input type="hidden" name="operation" value="create" />
      <label className="block">Nombre del enlace<input className="input" name="label" required minLength={2} maxLength={100} placeholder="Agenda para equipo de marca" /></label>
      <label className="block">Alcance<select className="input" name="scope" value={scope} onChange={event => setScope(event.target.value)}><option value="BRAND">Una marca</option><option value="ALL">Todas las marcas y agenda general</option></select></label>
      {scope === "BRAND" && <label className="block">Marca<select className="input" name="brandId" required defaultValue=""><option value="" disabled>Elige una marca</option>{brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label>}
      <Days /><SubmitButton>Crear enlace privado</SubmitButton>
    </form><Result state={state} />
    <p className="text-xs text-inkmuted">Renovar invalida el enlace anterior. Revocar bloquea nuevas descargas; no elimina copias que ya guardó un calendario externo. La actualización depende de ese proveedor.</p>
    <ul>{rows.map(row => <Subscription key={row.id} row={row} />)}</ul>
    {!rows.length && <p>Aún no hay suscripciones.</p>}
    {rows.length === 100 && <p>Se muestran hasta 100 suscripciones, con las activas primero.</p>}
  </section>;
}
