"use client";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { getGenerationStatus, cancelGenerationJob, resumeGenerationJob } from "@/app/actions/generation-jobs";

const labels: Record<string, string> = { QUEUED: "En espera", RUNNING: "Generando", COMPLETED: "Completado", PARTIAL: "Completado parcialmente", FAILED: "No completado", CANCELLED: "Cancelado" };
type Job = NonNullable<Awaited<ReturnType<typeof getGenerationStatus>>>;

export default function JobProgress({ initial }: { initial: Job }) {
  const [job, setJob] = useState(initial);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
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
  function action(kind: "resume" | "cancel") {
    startTransition(async () => {
      try {
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
    <Link href="/generador/trabajos" className="text-brand">← Mis generaciones</Link>
    <h1 className="text-2xl font-bold">Generación de guiones</h1>
    <p>Puedes cambiar de sección o cerrar esta pestaña. Encontrarás aquí el avance y los guiones terminados.</p>
    <div className="card space-y-3 p-5" aria-live="polite">
      <p className="font-semibold">{labels[job.status]} · {completed} de {job.items.length} guiones</p>
      <progress className="w-full" value={completed} max={job.items.length} aria-label="Guiones completados" />
      {(error || job.error) && <p role="alert" className="text-amber-600">{error || job.error}</p>}
      {job.items.map(item => <div key={item.id} className="border-t border-line py-3">
        <p>Guion {item.order + 1} · {labels[item.status]}{item.attempts > 1 ? ` · intento ${item.attempts}/3` : ""}</p>
        {item.script && <Link className="text-brand font-semibold" href={`/guiones/${item.script.id}`}>{item.script.title} →</Link>}
        {item.error && <p className="text-sm text-inkmuted">{item.error}</p>}
      </div>)}
    </div>
    {active && <div className="flex gap-3">
      <button className="btn btn-secondary" disabled={pending} onClick={() => action("resume")}>Reanudar si se detuvo</button>
      <button className="btn btn-secondary" disabled={pending} onClick={() => action("cancel")}>Cancelar pendientes</button>
    </div>}
    {active && <p className="text-sm text-inkmuted">La recuperación se permite después de seis minutos sin avance. Cancelar conserva los guiones terminados; una llamada de IA ya iniciada puede consumir tokens.</p>}
    <Link href="/generador" className="btn btn-primary">Nueva generación</Link>
  </div>;
}
