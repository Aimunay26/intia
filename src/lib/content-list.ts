import { archiveEpoch, liveContent } from "@/lib/archive-scope";
import { loadPage } from "@/lib/list-pagination";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export async function getContentList(filters: Prisma.ContentItemWhereInput, requestedPage?: string) {
  // Archivo total (ARCHIVO_TOTAL_DESDE): la lista del Dueño no muestra videos de marcas archivadas.
  // Con el interruptor vacío el filtro queda exactamente igual que antes.
  const epoch = archiveEpoch();
  const where: Prisma.ContentItemWhereInput = epoch ? { AND: [filters, liveContent(epoch)] } : filters;
  const result = await loadPage(requestedPage, 50,
    () => prisma.contentItem.count({ where }),
    (range) => prisma.contentItem.findMany({
      where,
      ...range,
      orderBy: [{ scheduledDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true, title: true, hook: true, status: true, platforms: true, scheduledDate: true,
        // scriptId decide si se ofrece «Crear guion»; structureIds son los formatos previstos.
        scriptId: true, structureIds: true,
        brand: { select: { id: true, name: true, colorPrimary: true } },
        structure: { select: { id: true, name: true } },
        assignments: { select: { id: true, role: true, user: { select: { name: true, color: true } } } },
        checklist: { select: { done: true } },
      },
    }),
  );
  const metrics = result.items.length ? await prisma.metric.groupBy({
    by: ["contentItemId"],
    where: { period: "WEEKLY", contentItemId: { in: result.items.map((item) => item.id) } },
    _sum: { views: true },
  }) : [];
  const views = new Map(metrics.map((row) => [row.contentItemId, row._sum.views ?? 0]));
  return {
    ...result,
    // null = sin métricas; 0 = hay registros con cero vistas.
    items: result.items.map((item) => ({ ...item, metricViews: views.get(item.id) ?? null })),
  };
}
