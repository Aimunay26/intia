import { loadPage } from "@/lib/list-pagination";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export type MetricFilters = { brandId: string | null; desde: string; hasta: string; plataforma?: string; estructura?: string; persona?: string };
export type MetricTotals = { views: number; interactions: number; reach: number; spend: number; revenue: number; retention: number | null; roas: number; records: number; videos: number };
export type MetricVideo = { id: string; title: string; platforms: string; fecha: Date; brandName: string; brandColor: string; views: number; interactions: number; spend: number; revenue: number; retSum: number; retCount: number };

/** Metric.date representa un día de reporte. Se compara por fecha UTC, sin zona del host. */
export function metricSource(filters: MetricFilters) {
  const conditions = [Prisma.sql`m."period" = 'WEEKLY'`, Prisma.sql`m."date" >= ${new Date(`${filters.desde}T00:00:00.000Z`)}`,
    Prisma.sql`m."date" < ${new Date(new Date(`${filters.hasta}T00:00:00.000Z`).getTime() + 86400000)}`];
  if (filters.brandId) conditions.push(Prisma.sql`ci."brandId" = ${filters.brandId}`);
  if (filters.plataforma) conditions.push(Prisma.sql`m."platform" = ${filters.plataforma}`);
  if (filters.estructura) conditions.push(Prisma.sql`ci."structureId" = ${filters.estructura}`);
  if (filters.persona) conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM "Assignment" a WHERE a."contentItemId" = ci."id" AND a."userId" = ${filters.persona})`);
  return Prisma.sql`FROM "Metric" m JOIN "ContentItem" ci ON ci."id" = m."contentItemId" WHERE ${Prisma.join(conditions, " AND ")}`;
}

export async function getMetricTotals(filters: MetricFilters): Promise<MetricTotals> {
  const [row] = await prisma.$queryRaw<MetricTotals[]>(Prisma.sql`
    SELECT COALESCE(SUM(m."views"),0)::float8 AS "views",
      COALESCE(SUM(m."likes"::float8 + m."comments" + m."shares" + m."saves"),0)::float8 AS "interactions",
      COALESCE(SUM(m."reach"),0)::float8 AS "reach", COALESCE(SUM(m."spend"),0)::float8 AS "spend",
      COALESCE(SUM(m."revenue"),0)::float8 AS "revenue",
      AVG(m."retention3s")::float8 AS "retention",
      COALESCE(SUM(m."revenue") / NULLIF(SUM(m."spend"),0),0)::float8 AS "roas",
      COUNT(*)::int AS "records", COUNT(DISTINCT ci."id")::int AS "videos"
    ${metricSource(filters)}`);
  return row;
}

export function getMetricSeries(filters: MetricFilters) {
  return prisma.$queryRaw<Array<{ day: string; views: number }>>(Prisma.sql`
    SELECT TO_CHAR(m."date", 'YYYY-MM-DD') AS "day", SUM(m."views")::float8 AS "views"
    ${metricSource(filters)} GROUP BY "day" ORDER BY "day"`);
}

export async function getMetricBreakdowns(filters: MetricFilters) {
  const source = metricSource(filters);
  const [platforms, brands, structures] = await Promise.all([
    prisma.$queryRaw<Array<{ platforms: string; views: number }>>(Prisma.sql`
      SELECT json_build_array(m."platform")::text AS "platforms", SUM(m."views")::float8 AS "views" ${source} GROUP BY m."platform"`),
    prisma.$queryRaw<Array<{ id: string; name: string; color: string; value: number }>>(Prisma.sql`
      SELECT b."id", b."name", b."colorPrimary" AS "color", g."value" FROM (
        SELECT ci."brandId", SUM(m."views")::float8 AS "value" ${source} GROUP BY ci."brandId"
      ) g JOIN "Brand" b ON b."id" = g."brandId" ORDER BY g."value" DESC, b."id"`),
    prisma.$queryRaw<Array<{ name: string; videos: number; average: number }>>(Prisma.sql`
      SELECT COALESCE(s."name", 'Sin estructura asignada') AS "name", g."videos", g."average" FROM (
        SELECT ci."structureId", COUNT(DISTINCT ci."id")::int AS "videos",
          (SUM(m."views")::float8 / NULLIF(COUNT(DISTINCT ci."id"),0)) AS "average"
        ${source} GROUP BY ci."structureId"
      ) g LEFT JOIN "Structure" s ON s."id" = g."structureId" ORDER BY g."average" DESC, g."structureId" LIMIT 10`),
  ]);
  return { platforms, brands, structures };
}

export function getMetricRanking(filters: MetricFilters, order: string | undefined, page?: string) {
  const source = metricSource(filters);
  const sort = order === "interacciones" ? Prisma.sql`"interactions"` : order === "roas" ? Prisma.sql`"roas"` : Prisma.sql`"views"`;
  return loadPage(page, 50,
    async () => (await prisma.$queryRaw<Array<{ total: number }>>(Prisma.sql`SELECT COUNT(DISTINCT ci."id")::int AS "total" ${source}`))[0].total,
    ({ skip, take }) => prisma.$queryRaw<MetricVideo[]>(Prisma.sql`
      SELECT g.*, ci."title", ci."platforms", COALESCE(ci."publishedAt", ci."scheduledDate") AS "fecha",
        b."name" AS "brandName", b."colorPrimary" AS "brandColor"
      FROM (
        SELECT ci."id", SUM(m."views")::float8 AS "views",
          SUM(m."likes"::float8 + m."comments" + m."shares" + m."saves")::float8 AS "interactions",
          SUM(m."spend")::float8 AS "spend", SUM(m."revenue")::float8 AS "revenue",
          COALESCE(SUM(m."retention3s") FILTER (WHERE m."retention3s" IS NOT NULL),0)::float8 AS "retSum",
          COUNT(*) FILTER (WHERE m."retention3s" IS NOT NULL)::int AS "retCount",
          COALESCE(SUM(m."revenue") / NULLIF(SUM(m."spend"),0),0)::float8 AS "roas"
        ${source} GROUP BY ci."id" ORDER BY ${sort} DESC, ci."id" ASC LIMIT ${take} OFFSET ${skip}
      ) g JOIN "ContentItem" ci ON ci."id" = g."id" JOIN "Brand" b ON b."id" = ci."brandId"
      ORDER BY g.${sort} DESC, g."id" ASC`)
  );
}
