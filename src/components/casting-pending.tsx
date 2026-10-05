import Link from "next/link";
import type { SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { contentScope } from "@/lib/access-scope";
import { castingInclude, roleConfirmed } from "@/lib/casting";
import { formatDate } from "@/lib/utils";

export async function CastingPending({ user, brandId }: { user: SessionUser; brandId: string | null }) {
  if (!user.profiles?.includes("TALENT")) return null;
  const videos = await prisma.contentItem.findMany({ where: { AND: [contentScope(user), brandId ? { brandId } : {}, { status: { notIn: ["EDICION", "PROGRAMADO", "PUBLICADO", "CANCELADO"] }, castRoles: { some: { userId: user.id } } }] }, include: castingInclude, orderBy: [{ shootDate: "asc" }, { id: "asc" }], take: 100 });
  const pending = videos.filter(video => video.castRoles.some(role => role.userId === user.id && !roleConfirmed(role, video)));
  if (!pending.length) return null;
  return <section className="card p-4 space-y-3"><h2 className="font-semibold">Tus confirmaciones de reparto</h2><p className="text-sm text-inkmuted">Revisa el guion y confirma cada papel para el horario propuesto.</p><ul className="space-y-2">{pending.map(video => <li key={video.id}><Link className="text-brand underline" href={`/contenido/${video.id}#reparto`}>{video.title} · {formatDate(video.shootDate)}</Link></li>)}</ul>{videos.length === 100 && <Link className="text-brand" href="/contenido">Ver todos tus videos</Link>}</section>;
}
