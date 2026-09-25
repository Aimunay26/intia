import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertBrandPermission, type AccessUser } from "@/lib/permissions";
import { dateKey } from "@/lib/utils";
import { OBJECTIVE_METRICS } from "@/lib/objective-policy";

type ObjectiveValue = { id: string; brandId: string; calculationMode: string; currentValue: number };
/** Same aggregate for brand detail, brand cards and home; no stale derived counters. */
export async function resolveObjectiveValues<T extends ObjectiveValue>(user: AccessUser, objectives: T[]) {
  for (const brandId of new Set(objectives.map(o => o.brandId))) assertBrandPermission(user, brandId, "metrics.view");
  const calculated = objectives.filter(o => o.calculationMode === "WEEKLY_SUM");
  const values = calculated.length ? await prisma.$queryRaw<{ id: string; value: number; records: number }[]>(Prisma.sql`
    SELECT o.id, COALESCE(SUM(CASE o."metricKey" ${Prisma.join(Object.keys(OBJECTIVE_METRICS).map(key => Prisma.sql`WHEN ${key} THEN m.${Prisma.raw('"' + key + '"')}`), " ")} END), 0)::float8 AS value,
      COUNT(m.id)::int AS records
    FROM "BrandObjective" o
    LEFT JOIN "ContentItem" ci ON ci."brandId" = o."brandId"
    LEFT JOIN "Metric" m ON m."contentItemId" = ci.id AND m.period = 'WEEKLY'
      AND m.date >= o."calculationFrom" AND m.date <= o."calculationTo"
      AND (o."calculationPlatform" IS NULL OR m.platform = o."calculationPlatform")
    WHERE o.id IN (${Prisma.join(calculated.map(o => o.id))}) AND o."brandId" IN (${Prisma.join([...new Set(calculated.map(o => o.brandId))])})
      AND o."calculationMode" = 'WEEKLY_SUM' GROUP BY o.id`) : [];
  const byId = new Map(values.map(v => [v.id, v]));
  return objectives.map(o => ({ ...o, currentValue: byId.get(o.id)?.value ?? o.currentValue, records: byId.get(o.id)?.records ?? null }));
}

export async function readBrandObjectives(user: AccessUser, brandId: string) {
  assertBrandPermission(user, brandId, "metrics.view");
  const objectives = await resolveObjectiveValues(user, await prisma.brandObjective.findMany({ where: { brandId }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }));
  return objectives.map(o => ({ ...o, updatedAt: o.updatedAt.toISOString(),
    calculationFrom: o.calculationFrom ? dateKey(o.calculationFrom) : "", calculationTo: o.calculationTo ? dateKey(o.calculationTo) : "",
    deadline: o.deadline ? dateKey(o.deadline) : "", createdAt: dateKey(o.createdAt) }));
}
