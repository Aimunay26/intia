import { Prisma } from "@prisma/client";
import { prisma, type AppTransaction } from "@/lib/prisma";
import { allows, type AccessUser } from "@/lib/permissions";
import { productionChainBrands, productionChainConfigured } from "@/lib/production-chain-flag";
import { ACTIVE_STATUSES, CHAIN_ORDER, CHAIN_STEP_RULES } from "@/lib/constants";
import { blockedStepSql, eligibleWorkerSql } from "@/lib/production-queries";
import { loadPage } from "@/lib/list-pagination";

export const CONSISTENCY_ISSUES = {
  MISSING_STEP: { label: "Video sin siguiente paso", detail: "Revisa el historial y crea el paso que corresponde. No se deduce una aprobación de un estado antiguo." },
  DUPLICATE_STEPS: { label: "Varios pasos secuenciales abiertos", detail: "Coordinación debe elegir cuál conservar. Los demás se cancelan con motivo, sin marcarlos como entregados." },
  STEP_STATE: { label: "Paso y estado del video no coinciden", detail: "Revisa las entregas y aprobaciones antes de devolver o cambiar el estado del video." },
  REVIEW_TOKEN: { label: "Revisión sin versión de entrega", detail: "Devuelve la entrega y vuelve a enviarla a revisión. Hace falta una versión verificable para aprobar." },
  MISSING_TASK: { label: "Paso sin tarea", detail: "Se puede crear la tarea que refleja este paso cuando no hay otra tarea que pueda corresponderle." },
  TASK_DRIFT: { label: "Tarea desactualizada", detail: "La tarea debe reflejar responsable, fecha, estado y vínculo del paso. Las entregas históricas requieren revisión humana." },
  TASK_BRAND: { label: "Tarea vinculada a otra marca", detail: "Revisa el vínculo y la marca. No se trasladan datos entre marcas automáticamente." },
  SHARED_TASK: { label: "Tarea compartida por paso y preparación", detail: "Cada entrega necesita su propia tarea. Revisa los vínculos antes de modificarlos." },
  BLOCKED_ASSIGNEE: { label: "Responsable sin permisos suficientes", detail: "Reasigna desde la ficha o revisa sus permisos en Equipo. La reparación no concede permisos ni sustituye personas." },
  MISSING_ASSIGNMENT: { label: "Función del video ausente", detail: "Se puede restaurar la función que corresponde al responsable vigente del paso, si conserva los permisos." },
  UNLINKED_TASK: { label: "Tarea con enlace, sin vínculo de producción", detail: "Puede ser una tarea desvinculada o un duplicado. Revisa su contenido antes de vincularla o cancelarla." },
  BLOCKED_TASK: { label: "Tarea asignada a una cuenta sin acceso", detail: "Revisa el destinatario de esta tarea en Tareas. No se elimina ni se reasigna automáticamente." },
} as const;
export type ConsistencyCode = keyof typeof CONSISTENCY_ISSUES;
export type ConsistencyIssue = {
  key: string; code: ConsistencyCode; videoId: string | null; stepId: string | null; taskId: string | null;
  brandId: string; title: string; brandName: string; revision: string; repairable: boolean;
};

/** Un único conjunto para conteos, filtros, páginas y revalidación al reparar. Ninguna escritura al leer. */
function issueQuery(brandIds: string[]) {
  const roles = Object.entries(CHAIN_STEP_RULES).filter(([, rule]) => rule.assignment);
  const assignment = Prisma.sql`CASE ${Prisma.join(roles.map(([step, rule]) => Prisma.sql`WHEN s.step = ${step} THEN ${rule.assignment}`), " ")} ELSE NULL END`;
  const missingAssignment = Prisma.sql`(${assignment}) IS NOT NULL AND s."assigneeId" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "Assignment" a WHERE a."contentItemId" = s."contentItemId" AND a."userId" = s."assigneeId" AND a.role = (${assignment}))`;
  const orphanForVideo = Prisma.sql`EXISTS (SELECT 1 FROM "Task" orphan WHERE orphan."brandId" = s."brandId"
    AND orphan.status = 'PENDIENTE' AND POSITION('. Ficha: /contenido/' || s."contentItemId" IN orphan.description) > 0
    AND NOT EXISTS (SELECT 1 FROM "ProductionStep" linked WHERE linked."taskId" = orphan.id)
    AND NOT EXISTS (SELECT 1 FROM "PreparationItem" linked WHERE linked."taskId" = orphan.id))`;
  return Prisma.sql`WITH videos AS (
    SELECT v.*, b.name AS "brandName", CASE
      WHEN v.status IN ('IDEA','GUION') THEN CASE WHEN sc.status = 'REVISION' AND EXISTS (SELECT 1 FROM "ProductionStep" d WHERE d."contentItemId" = v.id AND d.step = 'GUION' AND d.status = 'HECHO') THEN 'REVISION_GUION' ELSE 'GUION' END
      WHEN v.status IN ('APROBADO','GRABACION') THEN 'GRABACION'
      WHEN v.status = 'EDICION' THEN CASE
        WHEN EXISTS (SELECT 1 FROM "ChecklistItem" ck WHERE ck."contentItemId" = v.id AND ck.kind = 'FINAL_APPROVAL' AND ck.done) THEN 'PUBLICACION'
        WHEN EXISTS (SELECT 1 FROM "ProductionStep" d WHERE d."contentItemId" = v.id AND d.step = 'EDICION' AND d.status = 'HECHO') THEN 'REVISION_FINAL' ELSE 'EDICION' END
      WHEN v.status = 'PROGRAMADO' THEN 'PUBLICACION' ELSE NULL END AS expected
    FROM "ContentItem" v JOIN "Brand" b ON b.id = v."brandId" LEFT JOIN "Script" sc ON sc.id = v."scriptId"
    WHERE NOT b.archived AND v."brandId" IN (${Prisma.join(brandIds)})
  ), steps AS (
    SELECT s.*, ${blockedStepSql()} AS blocked, (${missingAssignment}) AS "missingAssignment",
      ${orphanForVideo} AS "possibleTask", v.status AS "videoStatus", v.expected
    FROM "ProductionStep" s JOIN videos v ON v.id = s."contentItemId"
  ), issues AS (
    SELECT 'MISSING_STEP' AS code, v.id AS id, v.id AS "videoId", NULL::text AS "stepId", NULL::text AS "taskId", v."brandId", false AS repairable
      FROM videos v WHERE v.status IN (${Prisma.join(ACTIVE_STATUSES)})
        AND EXISTS (SELECT 1 FROM "BrandTeamMember" m WHERE m."brandId" = v."brandId")
        AND NOT EXISTS (SELECT 1 FROM steps s WHERE s."contentItemId" = v.id AND s.status = 'PENDIENTE' AND s.step IN (${Prisma.join(CHAIN_ORDER)}))
    UNION ALL
    SELECT 'DUPLICATE_STEPS', v.id, v.id, NULL, NULL, v."brandId", false FROM videos v
      WHERE (SELECT COUNT(*) FROM steps s WHERE s."contentItemId" = v.id AND s.status = 'PENDIENTE' AND s.step IN (${Prisma.join(CHAIN_ORDER)})) > 1
    UNION ALL
    SELECT 'STEP_STATE', s.id, s."contentItemId", s.id, s."taskId", s."brandId", false FROM steps s
      WHERE s.status = 'PENDIENTE' AND s.step <> 'DISENO' AND s.step IS DISTINCT FROM s.expected
    UNION ALL
    SELECT 'REVIEW_TOKEN', s.id, s."contentItemId", s.id, s."taskId", s."brandId", false FROM steps s
      WHERE s.status = 'PENDIENTE' AND s.step IN ('REVISION_GUION','REVISION_FINAL') AND s."reviewToken" IS NULL
    UNION ALL
    SELECT 'MISSING_TASK', s.id, s."contentItemId", s.id, NULL, s."brandId",
      NOT s.blocked AND NOT s."possibleTask" AND s."videoStatus" IN (${Prisma.join(ACTIVE_STATUSES)}) FROM steps s
      WHERE s.status = 'PENDIENTE' AND s."taskId" IS NULL
    UNION ALL
    SELECT 'TASK_DRIFT', s.id, s."contentItemId", s.id, t.id, s."brandId",
      s.status = 'PENDIENTE' AND NOT s.blocked AND s."videoStatus" IN (${Prisma.join(ACTIVE_STATUSES)})
      FROM steps s JOIN "Task" t ON t.id = s."taskId"
      LEFT JOIN "TaskColumn" col ON col.id = t."columnId"
      WHERE t."brandId" = s."brandId" AND NOT EXISTS (SELECT 1 FROM "PreparationItem" p WHERE p."taskId" = t.id)
      AND (t.status <> CASE WHEN s.status = 'HECHO' THEN 'HECHO' WHEN s.status = 'PENDIENTE' THEN 'PENDIENTE' ELSE 'CANCELADO' END
        OR t."assigneeId" IS DISTINCT FROM s."assigneeId"
        OR (s.status = 'PENDIENTE' AND (t."completedAt" IS NOT NULL OR t."completedById" IS NOT NULL))
        OR (s.status = 'PENDIENTE' AND (t."dueDate" IS DISTINCT FROM (date_trunc('day', s."dueAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Lima') + interval '12 hours')
          OR COALESCE(POSITION('. Ficha: /contenido/' || s."contentItemId" IN t.description), 0) = 0
          OR (col."brandId" IS NOT NULL AND col."brandId" <> s."brandId")
          OR t."columnId" = (SELECT c.id FROM "TaskColumn" c WHERE c."brandId" IS NULL OR c."brandId" = s."brandId" ORDER BY c."order" DESC, c.id DESC LIMIT 1))))
    UNION ALL
    SELECT 'TASK_BRAND', s.id, s."contentItemId", s.id, t.id, s."brandId", false FROM steps s JOIN "Task" t ON t.id = s."taskId" WHERE t."brandId" IS DISTINCT FROM s."brandId"
    UNION ALL
    SELECT 'SHARED_TASK', s.id, s."contentItemId", s.id, s."taskId", s."brandId", false FROM steps s WHERE EXISTS (SELECT 1 FROM "PreparationItem" p WHERE p."taskId" = s."taskId")
    UNION ALL
    SELECT 'BLOCKED_ASSIGNEE', s.id, s."contentItemId", s.id, s."taskId", s."brandId", false FROM steps s WHERE s.status = 'PENDIENTE' AND s.blocked
    UNION ALL
    SELECT 'MISSING_ASSIGNMENT', s.id, s."contentItemId", s.id, s."taskId", s."brandId", NOT s.blocked AND s."videoStatus" IN (${Prisma.join(ACTIVE_STATUSES)}) FROM steps s WHERE s.status = 'PENDIENTE' AND s."missingAssignment"
    UNION ALL
    SELECT 'UNLINKED_TASK', t.id, NULL, NULL, t.id, t."brandId", false FROM "Task" t
      WHERE t."brandId" IN (${Prisma.join(brandIds)}) AND t.status = 'PENDIENTE' AND t.description LIKE '%. Ficha: /contenido/%'
        AND NOT EXISTS (SELECT 1 FROM "ProductionStep" s WHERE s."taskId" = t.id)
        AND NOT EXISTS (SELECT 1 FROM "PreparationItem" p WHERE p."taskId" = t.id)
    UNION ALL
    SELECT 'BLOCKED_TASK', t.id, NULL, NULL, t.id, t."brandId", false FROM "Task" t
      WHERE t."brandId" IN (${Prisma.join(brandIds)}) AND t.status = 'PENDIENTE' AND t."assigneeId" IS NOT NULL
        AND NOT ${eligibleWorkerSql(Prisma.sql`t."assigneeId"`, Prisma.sql`t."brandId"`)}
        AND NOT EXISTS (SELECT 1 FROM "ProductionStep" s WHERE s."taskId" = t.id)
  ), result AS (
    SELECT i.code || ':' || i.id AS key, i.code, i."videoId", i."stepId", i."taskId", i."brandId", i.repairable,
      COALESCE(v.title, t.title) AS title, b.name AS "brandName",
      md5(concat_ws('|', i.code, v."updatedAt", s."updatedAt", t."updatedAt",
        (SELECT string_agg(p.id || ':' || p."updatedAt"::text, ',' ORDER BY p.id) FROM "ProductionStep" p WHERE p."contentItemId" = i."videoId"))) AS revision
    FROM issues i JOIN "Brand" b ON b.id = i."brandId" LEFT JOIN videos v ON v.id = i."videoId"
      LEFT JOIN "ProductionStep" s ON s.id = i."stepId" LEFT JOIN "Task" t ON t.id = i."taskId"
  )`;
}

export async function consistencyBrands(db: AppTransaction, user: AccessUser, brandId?: string | null) {
  if (!productionChainConfigured() || !allows(user, "content.assign")) return [];
  const canary = productionChainBrands();
  return db.brand.findMany({ where: { archived: false, AND: [
    user.role === "OWNER" ? {} : { id: { in: [...user.brandIds ?? []] } },
    brandId ? { id: brandId } : {}, canary ? { id: { in: canary } } : {},
  ] }, select: { id: true } });
}

export async function readConsistencyIssue(db: AppTransaction, user: AccessUser, key: string) {
  const brands = await consistencyBrands(db, user);
  if (!brands.length) return null;
  return (await db.$queryRaw<ConsistencyIssue[]>(Prisma.sql`${issueQuery(brands.map(b => b.id))} SELECT * FROM result WHERE key = ${key}`))[0] ?? null;
}

export async function readProductionConsistency(user: AccessUser, opts: { brandId?: string | null; page?: string; mode?: string } = {}) {
  if (!productionChainConfigured() || !allows(user, "content.assign")) return { items: [], page: 1, pageCount: 1, total: 0, automatic: 0, manual: 0 };
  return prisma.$transaction(async db => {
    const brands = await consistencyBrands(db, user, opts.brandId);
    if (!brands.length) return { items: [], page: 1, pageCount: 1, total: 0, automatic: 0, manual: 0 };
    const query = issueQuery(brands.map(b => b.id));
    const filter = opts.mode === "reparables" ? Prisma.sql`WHERE repairable` : opts.mode === "manuales" ? Prisma.sql`WHERE NOT repairable` : Prisma.empty;
    const [counts] = await db.$queryRaw<{ automatic: number; manual: number }[]>(Prisma.sql`${query} SELECT COUNT(*) FILTER (WHERE repairable)::int AS automatic, COUNT(*) FILTER (WHERE NOT repairable)::int AS manual FROM result`);
    const page = await loadPage(opts.page, 25,
      async () => Number((await db.$queryRaw<{ n: number }[]>(Prisma.sql`${query} SELECT COUNT(*)::int n FROM result ${filter}`))[0].n),
      range => db.$queryRaw<ConsistencyIssue[]>(Prisma.sql`${query} SELECT * FROM result ${filter} ORDER BY key LIMIT ${range.take} OFFSET ${range.skip}`));
    return { ...page, ...counts };
  }, { isolationLevel: "RepeatableRead", timeout: 15000 });
}
