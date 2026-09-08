import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadPage } from "@/lib/list-pagination";

export async function getContentList(where: Prisma.ContentItemWhereInput, requestedPage?: string) {
  const result = await loadPage(requestedPage, 50,
    () => prisma.contentItem.count({ where }),
    (range) => prisma.contentItem.findMany({
      where,
      ...range,
      orderBy: [{ scheduledDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true, title: true, hook: true, status: true, platforms: true, scheduledDate: true,
        brand: { select: { id: true, name: true, colorPrimary: true } },
        structure: { select: { id: true, name: true } },
        assignments: { select: { id: true, role: true, user: { select: { name: true, color: true } } } },
        checklist: { select: { done: true } },
      },
    }),
  );
  const metrics = result.items.length ? await prisma.metric.groupBy({
    by: ["contentItemId"],
    where: { contentItemId: { in: result.items.map((item) => item.id) } },
    _sum: { views: true },
  }) : [];
  const views = new Map(metrics.map((row) => [row.contentItemId, row._sum.views ?? 0]));
  return {
    ...result,
    // null = sin métricas; 0 = hay registros con cero vistas.
    items: result.items.map((item) => ({ ...item, metricViews: views.get(item.id) ?? null })),
  };
}
