BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
-- Cadena de entregas por video (PRODUCTION_CHAIN_ENABLED). Solo amplía CHECK de ProductionStep:
-- sin columnas ni tablas nuevas. El código anterior nunca escribe los valores nuevos, así que
-- esta migración es compatible con él y puede aplicarse antes de desplegar.
--   step:   + 'GUION' (paso del guionista; las revisiones intermedias no existen por decisión del Dueño)
--   status: + 'DEVUELTO' (paso devuelto al anterior con motivo; doneAt nulo, ProductionStep_done_check sigue válido)
-- No revertir: para estrecharlas antes debe dar 0
--   SELECT count(*) FROM "ProductionStep" WHERE step = 'GUION' OR status = 'DEVUELTO';
ALTER TABLE "ProductionStep" DROP CONSTRAINT "ProductionStep_step_check";
ALTER TABLE "ProductionStep" ADD CONSTRAINT "ProductionStep_step_check" CHECK ("step" IN ('GUION','GRABACION','EDICION','PUBLICACION','DISENO'));
ALTER TABLE "ProductionStep" DROP CONSTRAINT "ProductionStep_status_check";
ALTER TABLE "ProductionStep" ADD CONSTRAINT "ProductionStep_status_check" CHECK ("status" IN ('PENDIENTE','HECHO','CANCELADO','DEVUELTO'));
-- Vista «Cadena» y «Sin asignar»: pasos abiertos por marca y plazo.
CREATE INDEX "ProductionStep_brandId_status_dueAt_idx" ON "ProductionStep"("brandId", "status", "dueAt");
COMMIT;
