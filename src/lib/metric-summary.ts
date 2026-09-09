import { prisma } from "@/lib/prisma";
import { safeDivide } from "@/lib/utils";
import type { Prisma } from "@prisma/client";

/** Resumen de comparación sin transferir todas las filas del periodo anterior. */
export async function getMetricSummary(where: Prisma.MetricWhereInput) {
  const [totals, retention] = await Promise.all([
    prisma.metric.aggregate({
      where: { AND: [where, { period: "WEEKLY" }] },
      _sum: { views: true, likes: true, comments: true, shares: true, saves: true, reach: true, spend: true, revenue: true },
    }),
    // SQL AVG omite null, pero conserva una retención observada de cero.
    prisma.metric.aggregate({ where: { AND: [where, { period: "WEEKLY" }] }, _avg: { retention3s: true } }),
  ]);
  const s = totals._sum;
  return {
    views: s.views ?? 0,
    interactions: (s.likes ?? 0) + (s.comments ?? 0) + (s.shares ?? 0) + (s.saves ?? 0),
    reach: s.reach ?? 0,
    spend: Number(s.spend ?? 0),
    revenue: Number(s.revenue ?? 0),
    retention: retention._avg.retention3s,
    roas: safeDivide(Number(s.revenue ?? 0), Number(s.spend ?? 0)),
  };
}
