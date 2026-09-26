import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { generationHistory } from "@/lib/generation-history";
import { singleQueryValues } from "@/lib/query-params";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { PendingGenerationRefresh } from "./refresh";

export default async function GenerationsPage({ searchParams }: { searchParams: Promise<{ page?: string; estado?: string }> }) {
  const user = await requirePermission("scripts.generate");
  const query = singleQueryValues(await searchParams), failedOnly = query.estado === "fallidos";
  const { jobs, page, pages, total, hasNext } = await generationHistory(user, query.page, failedOnly);
  const pageHref = (next: number) => `?${failedOnly ? "estado=fallidos&" : ""}page=${next}`;
  const labels: Record<string, string> = { QUEUED: "En espera", RUNNING: "Generando", PARTIAL: "Por reintentar", FAILED: "Por reintentar", CANCELLED: "Cancelado" };
  return <div className="mx-auto max-w-3xl space-y-5">
    <PendingGenerationRefresh active={jobs.some(job => ["QUEUED", "RUNNING"].includes(job.status))} />
    <PageHeader title="Generaciones pendientes" subtitle="Una solicitud por tarjeta. Al completarse, sus guiones quedan en la biblioteca y la solicitud sale de esta lista."
      actions={<><Link href="/guiones" className="btn">Ver guiones</Link><Link href="/generador" className="btn btn-primary">Generar guiones</Link></>} />
    <nav aria-label="Filtrar generaciones" className="flex flex-wrap gap-2">
      <Link href="/generador/trabajos" className={`btn ${!failedOnly ? "btn-primary" : ""}`} aria-current={!failedOnly ? "page" : undefined}>Todos los pendientes</Link>
      <Link href="/generador/trabajos?estado=fallidos" className={`btn ${failedOnly ? "btn-primary" : ""}`} aria-current={failedOnly ? "page" : undefined}>Por reintentar</Link>
    </nav>
    {!jobs.length && <Card><EmptyState title={failedOnly ? "No tienes guiones por reintentar" : "No tienes generaciones pendientes"}
      description={failedOnly ? "Las solicitudes que se están generando aparecen en «Todos los pendientes»." : "Los guiones completados están disponibles en la biblioteca de Guiones."} /></Card>}
    {jobs.map(job => <Card key={job.id} className="space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`chip ${job.missing ? "text-warn" : "text-inkmuted"}`}>{labels[job.status] ?? job.status}</span>
        <time className="text-sm text-inkmuted" dateTime={job.createdAt.toISOString()}>{job.createdAt.toLocaleString("es-PE", { timeZone: "America/Lima" })}</time>
      </div>
      <h2 className="break-words font-semibold"><Link href={`/generador/trabajos/${job.id}`} className="hover:text-brand">{job.formats.join(" · ") || "Generación de guiones"}</Link></h2>
      <p className="text-sm text-inkmuted">{job.missing} {job.missing === 1 ? "guion pendiente" : "guiones pendientes"}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/generador/trabajos/${job.id}`} className="btn btn-sm">{["QUEUED", "RUNNING"].includes(job.status) ? "Ver avance" : "Revisar y reintentar"}</Link>
      </div>
    </Card>)}
    <nav aria-label="Páginas de generaciones" className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-sm text-inkmuted" aria-live="polite">Página {page} de {pages} · {total} {total === 1 ? "solicitud" : "solicitudes"}</span>
      <div className="flex gap-2">
        {page > 1 ? <Link className="btn" href={pageHref(page - 1)}>Anterior</Link> : <button className="btn" disabled>Anterior</button>}
        {hasNext ? <Link className="btn" href={pageHref(page + 1)}>Siguiente</Link> : <button className="btn" disabled>Siguiente</button>}
      </div>
    </nav>
  </div>;
}
