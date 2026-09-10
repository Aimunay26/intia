-- Ejecutar después de migrate deploy y deployment-gate.sql, con el operador.
-- Deja mantenimiento cerrado. Reabrir solo después de promover la compilación compatible.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $$ BEGIN
  IF current_setting('application_name') <> 'intia-migrator-20260909' THEN
    RAISE EXCEPTION 'Esta operación requiere la conexión de mantenimiento';
  END IF;
  IF to_regclass('public."UserWorkProfile"') IS NULL OR to_regclass('public."UserBrandAccess"') IS NULL THEN
    RAISE EXCEPTION 'Primero aplica la migración de perfiles';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "User" WHERE role='OWNER' AND active) THEN
    RAISE EXCEPTION 'Se requiere al menos un dueño activo';
  END IF;
END $$;
UPDATE intia_ops.deployment_gate SET blocked=true, required_client='intia-profiles-20260910' WHERE singleton;
-- Invalida sesiones emitidas por builds que no comprueban perfiles de trabajo.
DELETE FROM "AuthSession";
COMMIT;
