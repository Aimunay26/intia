-- Las grabaciones pueden quedar pendientes de fecha sin inventar un vencimiento.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE "ProductionStep" ALTER COLUMN "dueAt" DROP NOT NULL;
ALTER TABLE "ProductionStep" ADD CONSTRAINT "ProductionStep_due_date_required"
  CHECK ("dueAt" IS NOT NULL OR ("step" = 'GRABACION' AND "status" <> 'HECHO'));

COMMIT;
