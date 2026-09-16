"use client";

import { alternarCheck } from "@/app/actions/content";
import { EditForm } from "@/components/edit-form";

export function ReopenApprovalForm({ id }: { id: string }) {
  return <details className="text-sm">
    <summary className="cursor-pointer text-brand">Reabrir aprobación</summary>
    <EditForm action={alternarCheck} className="mt-2 space-y-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="done" value="0" />
      <label className="block">Motivo de reapertura
        <input name="reason" className="input mt-1" required minLength={5} maxLength={1000} placeholder="Explica qué necesita corregirse" />
      </label>
      <button className="btn btn-sm" type="submit">Retirar aprobación</button>
    </EditForm>
  </details>;
}
