"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { getGenerationStatus, cancelGenerationJob, resumeGenerationJob, retryFailedGenerationJob } from "@/app/actions/generation-jobs";
import { readModelFallback } from "@/lib/ai/model-fallback";
import { AI_PROVIDERS, DEFAULT_MODEL } from "@/lib/constants";

const stages: Record<string,string> = { context_load: "Leyendo contexto", references_load: "Leyendo referencias", prompt_build: "Preparando instrucciones", model_resolve: "Validando modelo", key_resolve: "Validando configuración", provider_request: "Esperando al proveedor", response_parse: "Interpretando respuesta", response_saved: "Guardando guion", settings_load: "Leyendo configuración", script_save: "Validando y guardando guion", response_validate: "Validando contenido del guion", completed: "Finalizado" };
const labels: Record<string, string> = { QUEUED: "En espera", RUNNING: "Generando", COMPLETED: "Completado", PARTIAL: "Completado parcialmente", FAILED: "No completado", CANCELLED: "Cancelado" };
stages.model_fallback = "Esperando para probar un modelo alternativo";
type Job = NonNullable<Awaited<ReturnType<typeof getGenerationStatus>>>;

function ModelFallbackNotice({ item }: { item: Job["items"][number] }) {
  const fallback = readModelFallback(item.diagnostics);
  if (!fallback) return null;
  return <p className="text-xs text-inkmuted">Alternativas por saturación: {fallback.models.join(" → ")}.{item.stage === "model_fallback" && item.status === "QUEUED" ? " El siguiente intento usará el último modelo de esta secuencia." : ""}</p>;
}

export default function JobProgress({ initial, providersReady = {}, defaultModels = DEFAULT_MODEL, canManageAi = false }: {
  initial: Job; providersReady?: Record<string, boolean>; defaultModels?: Record<string, string>; canManageAi?: boolean;
}) {
  const router = useRouter();
  const [job, setJob] = useState(initial);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [retryProvider, setRetryProvider] = useState<string>(initial.requestedProvider ?? "google");
  const active = ["QUEUED", "RUNNING"].includes(job.status);
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let delay = 5000;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      if (stopped) return;
      if (!document.hidden) {
        try {
          const next = await getGenerationStatus(initial.id);
          if (!stopped && next) { setJob(next); setError(""); }
          if (!next || !["QUEUED", "RUNNING"].includes(next.status)) return;
        } catch { if (!stopped) setError("No se pudo consultar el avance. El trabajo continúa guardado."); }
      }
      delay = Math.min(delay + 1000, 15000);
      if (!stopped) timer = setTimeout(refresh, delay);
    }
    timer = setTimeout(refresh, delay);
    return () => { stopped = true; clearTimeout(timer); };
  }, [initial.id, active]);
  function action(kind: "resume" | "cancel" | "retry") {
    startTransition(async () => {
      try {
        if (kind === "retry") {
          const result = await retryFailedGenerationJob(job.id, retryProvider);
          if (!result.ok) {
            setError(result.error);
            // Otra pestaña puede haber creado el sucesor con un proveedor diferente.
            const next = await getGenerationStatus(job.id);
            if (next) setJob(next);
            return;
          }
          router.push(`/generador/trabajos/${result.id}`);
          return;
        }
        if (kind === "cancel") await cancelGenerationJob(job.id);
        else await resumeGenerationJob(job.id);
        const next = await getGenerationStatus(job.id);
        if (next) setJob(next);
        setError("");
      } catch { setError("No se pudo actualizar la solicitud. Intenta de nuevo."); }
    });
  }
  const completed = job.items.filter(item => item.status === "COMPLETED").length;
  return <div className="mx-auto max-w-3xl space-y-5">
    <Link href="/generador/trabajos" className="text-brand">← Generaciones pendientes</Link>
    <h1 className="text-2xl font-bold">Generación de guiones</h1>
    <p>Puedes cambiar de sección o cerrar esta pestaña. Encontrarás aquí el avance y los guiones terminados.</p>
    <div className="card space-y-3 p-5" aria-live="polite">
      <p className="text-xs text-inkmuted">Código de seguimiento: {job.id}</p><p className="font-semibold">{labels[job.status]} · {completed} de {job.items.length} guiones</p>
      <progress className="w-full" value={completed} max={job.items.length} aria-label="Guiones completados" />
      {(error || job.error) && <p role="alert" className="text-amber-600">{error || job.error}</p>}
      {job.items.map(item => <div key={item.id} className="border-t border-line py-3">
        <p>{item.structure?.name ?? `Guion ${item.order + 1}`} · {labels[item.status]}{item.attempts > 1 ? ` · intento ${item.attempts}/3` : ""}</p>
        {item.stage && <p className="text-sm">Última etapa: {stages[item.stage] ?? "Procesando"}</p>}
        {item.diagnostics && typeof item.diagnostics === "object" && !Array.isArray(item.diagnostics) && <p className="text-xs text-inkmuted">Modelo: {String(item.diagnostics.model ?? "—")} · Origen: {({ request: "selección", structure: "estructura", settings: "ajustes", catalog: "catálogo", fallback: "alternativa por saturación" } as Record<string,string>)[String(item.diagnostics.modelSource)] ?? "—"} · Referencias utilizadas: {Array.isArray(item.diagnostics.references) ? item.diagnostics.references.length : 0} de {String(item.diagnostics.availableReferences ?? 0)}</p>}
        <ModelFallbackNotice item={item} />
        {item.script && <Link className="text-brand font-semibold" href={`/guiones/${item.script.id}`}>{item.script.title} →</Link>}
        {item.error && <p className="text-sm text-inkmuted">{item.error}</p>}
      </div>)}
    </div>
    {active && <div className="flex gap-3">
      <button className="btn btn-secondary" disabled={pending} onClick={() => action("resume")}>Reanudar si se detuvo</button>
      <button className="btn btn-secondary" disabled={pending} onClick={() => action("cancel")}>Cancelar pendientes</button>
    </div>}
    {active && <p className="text-sm text-inkmuted">La recuperación se permite después de seis minutos sin avance. Cancelar conserva los guiones terminados; una llamada de IA ya iniciada puede consumir tokens.</p>}
    {!active && job.retryableCount > 0 && <div className="card space-y-4 p-5">
      {job.retryJobId ? <Link href={`/generador/trabajos/${job.retryJobId}`} className="btn btn-primary">Ver reintento</Link>
        : <>
          <h2 className="font-semibold">Volver a generar los guiones faltantes</h2>
          <div className="space-y-2">
            <label className="label" htmlFor="retry-provider">Proveedor para reintentar</label>
            <select id="retry-provider" className="select w-full" value={retryProvider} disabled={pending} onChange={event => { setRetryProvider(event.target.value); setError(""); }}>
              {AI_PROVIDERS.map(provider => <option key={provider.value} value={provider.value} disabled={!providersReady[provider.value]}>{provider.label}{providersReady[provider.value] ? "" : " · Sin clave compartida"}</option>)}
            </select>
            <p className="text-sm text-inkmuted">{retryProvider === job.requestedProvider ? (job.requestedModel ? `Modelo del pedido: ${job.requestedModel}.` : "Se conserva el proveedor y se resuelve el modelo con la configuración actual.") : `Modelo predeterminado: ${defaultModels[retryProvider]}.`} Se usa la clave de la organización.</p>
            {!providersReady[retryProvider] && <p className="text-sm text-warn">Elige un proveedor con clave compartida. {canManageAi ? <Link className="text-brand underline" href="/ajustes">Configurar en Ajustes</Link> : "El Dueño puede configurarla en Ajustes."}</p>}
          </div>
          <button type="button" className="btn btn-primary" disabled={pending || !providersReady[retryProvider]} onClick={() => action("retry")}>{pending ? "Registrando reintento…" : `Reintentar ${job.retryableCount === 1 ? "guion no generado" : `${job.retryableCount} guiones no generados`}`}</button>
        </>}
      <p className="text-sm text-inkmuted">Se conserva lo ya generado. El reintento usa el mismo pedido con la configuración y las referencias actuales, y puede consumir llamadas de IA.</p>
    </div>}
    <Link href="/generador" className="btn btn-primary">Nueva generación</Link>
  </div>;
}
