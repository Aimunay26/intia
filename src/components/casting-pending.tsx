import Link from "next/link";
import type { SessionUser } from "@/lib/auth";
import { readCastingPending } from "@/lib/casting-inbox";
import { Pagination } from "@/components/filters";
import { formatDate } from "@/lib/utils";

export async function CastingPending({ user, brandId, page }: { user: SessionUser; brandId: string | null; page?: string }) {
  if (!user.profiles?.includes("TALENT")) return null;
  const result = await readCastingPending(user, brandId, page);
  const pending = result.items;
  if (!pending.length) return null;
  return <section className="card p-4 space-y-3"><h2 className="font-semibold">Tus confirmaciones de reparto · {result.total}</h2><p className="text-sm text-inkmuted">Revisa el guion y confirma cada papel para el horario propuesto.</p><ul className="space-y-2">{pending.map(video => <li key={video.id}><Link className="text-brand underline" href={`/contenido/${video.id}#reparto`}>{video.title} · {formatDate(video.shootDate)}</Link></li>)}</ul><Pagination {...result} param="reparto" /></section>;
}
