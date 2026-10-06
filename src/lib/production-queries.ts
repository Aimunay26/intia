import { Prisma } from "@prisma/client";
import { allows, WORK_PROFILES, type Capability } from "@/lib/permissions";
import { stepAssigneeCapabilities, TASK_ASSIGNEE_CAPABILITIES } from "@/lib/work-assignees";
import { CHAIN_ORDER } from "@/lib/constants";

/** SQL parametrizado; comparte las capacidades de la política de asignación. */
export function eligibleWorkerSql(userId: Prisma.Sql, brandId: Prisma.Sql, capabilities: readonly Capability[] = []) {
  const grants = [...new Set([...TASK_ASSIGNEE_CAPABILITIES, ...capabilities])].map(capability => {
    const profiles = WORK_PROFILES.filter(profile => allows({ id: "", role: "MEMBER", profiles: [profile.id] }, capability)).map(p => p.id);
    return profiles.length ? Prisma.sql`EXISTS (SELECT 1 FROM "UserWorkProfile" wp WHERE wp."userId" = u.id AND wp.profile IN (${Prisma.join(profiles)}))` : Prisma.sql`FALSE`;
  });
  return Prisma.sql`EXISTS (SELECT 1 FROM "User" u WHERE u.id = ${userId} AND u.active AND
    (u.role = 'OWNER' OR (EXISTS (SELECT 1 FROM "UserBrandAccess" ba WHERE ba."userId" = u.id AND ba."brandId" = ${brandId}) AND ${Prisma.join(grants, " AND ")})))`;
}

/** Usa el alias s de ProductionStep. No restaura permisos ni elige personas. */
export const blockedStepSql = () => Prisma.sql`(s."assigneeId" IS NOT NULL AND NOT (${Prisma.join(
  [...CHAIN_ORDER, "DISENO"].map(step => Prisma.sql`(s.step = ${step} AND ${eligibleWorkerSql(Prisma.sql`s."assigneeId"`, Prisma.sql`s."brandId"`, stepAssigneeCapabilities(step))})`), " OR "
)}))`;

/** Último aviso relevante por paso, sin límites globales que oculten avisos antiguos. */
export const openNoticeSql = () => Prisma.sql`COALESCE((SELECT a.changes FROM "AuditLog" a
  WHERE a.entity = 'ProductionStep' AND a."entityId" = s.id
    AND (a.action IN ('ASIGNAR','REABRIR','COMPLETAR') OR a.changes LIKE '%"aviso%')
  ORDER BY a."createdAt" DESC, a.id DESC LIMIT 1), '') LIKE '%"aviso"%'`;

export type PageInfo = { page: number; pageCount: number; total: number };
export const emptyPage = (): PageInfo => ({ page: 1, pageCount: 1, total: 0 });
