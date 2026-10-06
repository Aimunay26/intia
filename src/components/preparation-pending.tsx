import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { contentScope } from "@/lib/access-scope";
import type { SessionUser } from "@/lib/auth";
import { preparationInclude, preparationReady } from "@/lib/preparation";

export async function PreparationPending({ user, brandId }: { user: SessionUser; brandId?: string | null }) {
  const videos = await prisma.contentItem.findMany({ where: { AND: [contentScope(user), { ...(brandId ? { brandId } : {}), brand: { archived: false }, productionSteps: { none: { step: "GRABACION", status: "HECHO" } }, status: { notIn: ["EDICION", "PROGRAMADO", "PUBLICADO", "CANCELADO"] }, preparationItems: { some: { assigneeId: user.id, status: { not: "RETIRADO" } } } }] }, include: preparationInclude, orderBy: [{ shootDate: "asc" }, { id: "asc" }] });
  const pending = videos.filter(v => v.preparationItems.some(i => {
    if (i.assigneeId !== user.id || i.status === "RETIRADO") return false;
    try { return !preparationReady(i, v); } catch { return true; }
  }));
  if (!pending.length) return null;
  return <section className="rounded-xl border border-border p-4 space-y-2"><h2 className="font-semibold">Tu preparación pendiente</h2><p className="text-sm text-inkmuted">{pending.length} vídeos requieren revisar tu checklist o props.</p><ul>{pending.slice(0, 20).map(v => <li key={v.id}><Link className="text-brand underline" href={`/contenido/${v.id}#preparacion`}>{v.title}</Link></li>)}</ul>{pending.length > 20 && <Link href="/tareas" className="text-brand underline">Ver todas las tareas de preparación</Link>}</section>;
}
