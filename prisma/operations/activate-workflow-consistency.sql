-- Ejecutar después de migrar, con escrituras cerradas y conexión de mantenimiento.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$ BEGIN
  IF current_setting('application_name') <> 'intia-migrator-20260909' THEN
    RAISE EXCEPTION 'Se requiere la conexión de mantenimiento';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name='20260917180000_workflow_consistency' AND finished_at IS NOT NULL AND rolled_back_at IS NULL) THEN
    RAISE EXCEPTION 'Falta la migración de consistencia';
  END IF;
  PERFORM 1 FROM intia_ops.deployment_gate WHERE singleton AND blocked AND required_client IN ('intia-profiles-20260910','intia-workflow-20260917') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cerrar escrituras antes de activar la versión'; END IF;
END $$;
UPDATE intia_ops.deployment_gate SET required_client='intia-workflow-20260917' WHERE singleton;
COMMIT;
