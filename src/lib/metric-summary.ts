import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeDivide } from "@/lib/utils";

/** Resumen de comparación sin transferir todas las filas del periodo anterior. */
export async function getMetricSummary(where: Prisma.MetricWhereInput) {
  const [totals, retention] = await Promise.all([
    prisma.metric.aggregate({
      where,
      _sum: { views: true, likes: true, comments: true, shares: true, saves: true, reach: true, spend: true, revenue: true },
    }),
    // Conserva la semántica actual (> 0); cambiar la interpretación de ceros
    // requiere resolver por separado el modelo de datos de retención (H08).
    prisma.metric.aggregate({ where: { AND: [where, { retention3s: { gt: 0 } }] }, _avg: { retention3s: true } }),
  ]);
  const s = totals._sum;
  return {
    views: s.views ?? 0,
    interactions: (s.likes ?? 0) + (s.comments ?? 0) + (s.shares ?? 0) + (s.saves ?? 0),
    reach: s.reach ?? 0,
    spend: s.spend ?? 0,
    revenue: s.revenue ?? 0,
    retention: retention._avg.retention3s ?? 0,
    roas: safeDivide(s.revenue ?? 0, s.spend ?? 0),
  };
}
