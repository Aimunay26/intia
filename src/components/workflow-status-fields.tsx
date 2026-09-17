"use client";
import { useState } from "react";
import { CONTENT_FLOW, SCRIPT_FLOW, transition } from "@/lib/workflow-policy";

export function WorkflowStatusFields({ value, options, script = false, owner = false }: {
  value: string; options: { value: string; label: string }[]; script?: boolean; owner?: boolean;
}) {
  const [status, setStatus] = useState(value), [override, setOverride] = useState(false);
  const flow = script ? SCRIPT_FLOW : CONTENT_FLOW, stopped = script ? "ARCHIVADO" : "CANCELADO";
  const step = transition(flow, value, status, stopped);
  const reason = override || step === "reopen" || step === "stop";
  return <div className="flex flex-wrap items-center gap-2">
    <select name="status" className="select" aria-label={script ? "Estado del guion" : "Estado del video"} value={status} onChange={e => setStatus(e.target.value)}>
      {options.map(o => <option key={o.value} value={o.value} disabled={!override && transition(flow, value, o.value, stopped) === "invalid"}>{o.label}</option>)}
    </select>
    {owner && <label className="text-xs"><input type="checkbox" name="override" value="1" checked={override} onChange={e => setOverride(e.target.checked)} /> Excepción del Dueño</label>}
    {reason && <input className="input" name="reason" aria-label="Motivo del cambio" placeholder="Motivo de reapertura o excepción" required minLength={5} maxLength={1000} />}
    <button className="btn btn-sm">Cambiar estado</button>
  </div>;
}
