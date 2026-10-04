BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
ALTER TABLE "Task" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PENDIENTE',
  ADD COLUMN "completedAt" TIMESTAMP(3), ADD COLUMN "completedById" TEXT;
-- Solo los pasos aportan evidencia inequívoca de cierre. Una columna es editable
-- y su posición no permite inferir que una tarea histórica se terminó.
UPDATE "Task" t SET "status" = CASE WHEN p."status" = 'HECHO' THEN 'HECHO' WHEN p."status" IN ('CANCELADO','DEVUELTO') THEN 'CANCELADO' ELSE 'PENDIENTE' END,
  "completedAt" = CASE WHEN p."status" = 'HECHO' THEN p."doneAt" ELSE NULL END
FROM "ProductionStep" p WHERE p."taskId" = t.id;
ALTER TABLE "Task" ADD CONSTRAINT "Task_completion_check" CHECK (
  "status" IN ('PENDIENTE','HECHO','CANCELADO') AND
  (("status" = 'HECHO' AND "completedAt" IS NOT NULL) OR ("status" <> 'HECHO' AND "completedAt" IS NULL AND "completedById" IS NULL))
);
ALTER TABLE "ProductionStep" ADD COLUMN "materialVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "reviewToken" TEXT;
ALTER TABLE "ProductionStep" ADD CONSTRAINT "ProductionStep_material_version_check" CHECK ("materialVersion" >= 0);
ALTER TABLE "ProductionStep" DROP CONSTRAINT "ProductionStep_step_check";
ALTER TABLE "ProductionStep" ADD CONSTRAINT "ProductionStep_step_check" CHECK ("step" IN ('GUION','REVISION_GUION','GRABACION','EDICION','REVISION_FINAL','PUBLICACION','DISENO'));
COMMIT;
