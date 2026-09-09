import Link from "next/link";
import { requireLevel, LEVEL } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function GenerationsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireLevel(LEVEL.MEMBER);
  const raw = (await searchParams).page;
  const page = Math.min(10000, Math.max(1, Number(raw) || 1));
  const jobs = await prisma.generationJob.findMany({ where: { userId: user.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 21, skip: (Math.trunc(page) - 1) * 20, select: { id: true, createdAt: true, status: true, _count: { select: { items: true } } } });
  const labels: Record<string, string> = { QUEUED: "En espera", RUNNING: "Generando", COMPLETED: "Completado", PARTIAL: "Completado parcialmente", FAILED: "No completado", CANCELLED: "Cancelado" };
  return <div className="mx-auto max-w-3xl space-y-5">
    <h1 className="text-2xl font-bold">Mis generaciones</h1>
    <Link href="/generador" className="btn btn-primary">Generar guiones</Link>
    {!jobs.length && <p>Aún no tienes generaciones guardadas.</p>}
    {jobs.slice(0, 20).map(job => <Link key={job.id} href={`/generador/trabajos/${job.id}`} className="card block p-4">
      <p className="font-semibold">{labels[job.status]} · {job._count.items} guiones</p>
      <p className="text-sm text-inkmuted">{job.createdAt.toLocaleString("es-PE", { timeZone: "America/Lima" })}</p>
    </Link>)}
    <div className="flex gap-4">{page > 1 && <Link href={`?page=${page - 1}`}>Anterior</Link>}{jobs.length > 20 && <Link href={`?page=${page + 1}`}>Siguiente</Link>}</div>
  </div>;
}
