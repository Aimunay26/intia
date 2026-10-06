import type { AccessUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { contentScope } from "@/lib/access-scope";
import { castingInclude, roleConfirmed } from "@/lib/casting";
import { pageNumber } from "@/lib/query-params";

/** La vigencia incluye la huella del guion: se evalúa en servidor, en lotes y un mismo snapshot.
 * Solo se retienen los enlaces de la página pedida y de la última, nunca todos los guiones. */
export async function readCastingPending(user: AccessUser, brandId: string | null, requested?: string) {
  const size = 20, wanted = pageNumber(requested);
  return prisma.$transaction(async db => {
    let after: string | undefined, total = 0;
    type Item = { id: string; title: string; shootDate: Date | null };
    const selected: Item[] = [];
    let last: Item[] = [];
    for (;;) {
      const batch = await db.contentItem.findMany({
        where: { AND: [contentScope(user), brandId ? { brandId } : {}, {
          brand: { archived: false }, status: { notIn: ["EDICION", "PROGRAMADO", "PUBLICADO", "CANCELADO"] },
          castRoles: { some: { userId: user.id } },
        }] }, include: castingInclude, orderBy: [{ shootDate: { sort: "asc", nulls: "last" } }, { id: "asc" }], take: 100,
        ...(after ? { cursor: { id: after }, skip: 1 } : {}),
      });
      for (const video of batch) {
        if (!video.castRoles.some(role => role.userId === user.id && !roleConfirmed(role, video))) continue;
        const item = { id: video.id, title: video.title, shootDate: video.shootDate };
        if (total % size === 0) last = [];
        last.push(item);
        if (Math.floor(total / size) + 1 === wanted) selected.push(item);
        total++;
      }
      if (batch.length < 100) break;
      after = batch[batch.length - 1].id;
    }
    const pageCount = Math.max(1, Math.ceil(total / size)), page = Math.min(wanted, pageCount);
    return { items: page === wanted ? selected : last, page, pageCount, total };
  }, { isolationLevel: "RepeatableRead", timeout: 15000 });
}
