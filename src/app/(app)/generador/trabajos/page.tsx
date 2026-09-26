import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { generationHistory } from "@/lib/generation-history";
import { singleQueryValues } from "@/lib/query-params";
import { Card, EmptyState, PageHeader } from "@/components/ui";

export default async function GenerationsPage({ searchParams }: { searchParams: Promise<{ page?: string; estado?: string }> }) {
  const user = await requirePermission("scripts.generate");
  const query = singleQueryValues(await searchParams), failedOnly = query.estado === "fallidos";
  const { jobs, page, hasNext } = await generationHistory(user, query.page, failedOnly);
  const pageHref = (next: number) => `?${failedOnly ? "estado=fallidos&" : ""}page=${next}`;
  const labels: Record<string, string> = { QUEUED: "En espera", RUNNING: "Generando", COMPLETED: "Completado", PARTIAL: "Completado parcialmente", FAILED: "No completado", CANCELLED: "Cancelado" };
  return <div className="mx-auto max-w-3xl space-y-5">
    <PageHeader title="Mis generaciones" subtitle="Consulta el historial, abre tus guiones y vuelve a intentar los que no salieron."
      actions={<Link href="/generador" className="btn btn-primary">Generar guiones</Link>} />
    <nav aria-label="Filtrar generaciones" className="flex flex-wrap gap-2">
      <Link href="/generador/trabajos" className={`btn ${!failedOnly ? "btn-primary" : ""}`} aria-current={!failedOnly ? "page" : undefined}>Todas</Link>
      <Link href="/generador/trabajos?estado=fallidos" className={`btn ${failedOnly ? "btn-primary" : ""}`} aria-current={failedOnly ? "page" : undefined}>Con guiones no generados</Link>
    </nav>
    {!jobs.length && <Card><EmptyState title={failedOnly ? "No hay generaciones con guiones faltantes en esta página" : "Aún no tienes generaciones guardadas"}
      description={failedOnly ? "Aquí aparecen los intentos fallidos, parciales y cancelados. Los reintentos conservan su historial." : "Los pedidos aparecen aquí desde que se envían, aunque alguno falle."} /></Card>}
    {jobs.map(job => <Card key={job.id} className="space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`chip ${job.missing ? "text-warn" : "text-inkmuted"}`}>{labels[job.status] ?? job.status}</span>
        <time className="text-sm text-inkmuted" dateTime={job.createdAt.toISOString()}>{job.createdAt.toLocaleString("es-PE", { timeZone: "America/Lima" })}</time>
      </div>
      <h2 className="break-words font-semibold"><Link href={`/generador/trabajos/${job.id}`} className="hover:text-brand">{job.formats.join(" · ") || "Generación de guiones"}</Link></h2>
      <p className="text-sm text-inkmuted">{job.completed} de {job.total} guiones generados{job.missing ? ` · ${job.missing} sin generar en este intento` : ""}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/generador/trabajos/${job.id}`} className="btn btn-sm">{job.missing && !job.retry ? "Revisar y reintentar" : "Ver detalle"}</Link>
        {job.retry && <Link href={`/generador/trabajos/${job.retry.id}`} className="text-brand text-sm font-semibold">Ver reintento · {labels[job.retry.status] ?? job.retry.status} →</Link>}
      </div>
    </Card>)}
    <nav aria-label="Páginas de generaciones" className="flex items-center gap-4">
      {page > 1 && <Link className="btn" href={pageHref(page - 1)}>Anterior</Link>}
      <span className="text-sm text-inkmuted">Página {page}</span>
      {hasNext && <Link className="btn" href={pageHref(page + 1)}>Siguiente</Link>}
    </nav>
  </div>;
}
