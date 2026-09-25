"use client";
import { useState, useTransition } from "react";
import { guardarRetencion, revisarRetencion } from "@/app/actions/retention";
import type { RetentionPolicy } from "@/lib/retention";

export function RetentionSettings({ initial, revision: initialRevision }: { initial: RetentionPolicy; revision: string }) {
  const [policy,setPolicy] = useState(initial), [revision,setRevision] = useState(initialRevision);
  const [savedEnabled,setSavedEnabled] = useState(initial.enabled);
  const [preview,setPreview] = useState<Awaited<ReturnType<typeof revisarRetencion>> | null>(null);
  const [message,setMessage] = useState(""), [pending,start] = useTransition();
  return <section className="card space-y-3 p-4"><h2 className="font-semibold">Retención técnica</h2>
    <p>La limpieza está {savedEnabled ? "activada" : "desactivada"}. Conserva guiones, aprobaciones, métricas, auditoría y archivos vinculados. Solo elimina cargas técnicas antiguas de trabajos terminados y contadores vencidos.</p>
    <label><input type="checkbox" checked={policy.enabled} onChange={e => { setPolicy({...policy,enabled:e.target.checked});setPreview(null); }} /> Habilitar limpieza en mantenimiento</label>
    {([['responseDays','Respuestas temporales de IA'],['requestDays','Peticiones de trabajos terminados'],['importDays','Filas originales de CSV terminado'],['counterDays','Contadores vencidos']] as const).map(([key,label]) => <label key={key} className="block">{label} (días)<input className="input" type="number" min={key==='counterDays'?90:30} max={3650} value={policy[key]} onChange={e=>{setPolicy({...policy,[key]:Number(e.target.value)});setPreview(null);}} /></label>)}
    <button className="btn" disabled={pending} onClick={()=>start(async()=>{try {setPreview(await revisarRetencion(policy));setMessage("");} catch {setMessage("Revisa los plazos e inténtalo de nuevo.");}})}>Ver impacto sin borrar</button>
    {preview && <><p>Registros candidatos: {preview.counts.responses} respuestas, {preview.counts.requests} peticiones, {preview.counts.imports} CSV y {preview.counts.counters} contadores. La ejecución procesa bloques; el conteo puede cambiar.</p><button className="btn" disabled={pending} onClick={()=>start(async()=>{try {setRevision(await guardarRetencion(policy,revision,preview.fingerprint));setSavedEnabled(policy.enabled);setMessage("Política guardada.");setPreview(null);}catch{setMessage("No se guardó. Recarga si otra persona cambió la política.");}})}>Guardar política revisada</button></>}
    {message && <p role="status">{message}</p>}
  </section>;
}
