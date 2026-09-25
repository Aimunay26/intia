BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$ BEGIN
  IF current_setting('application_name') <> 'intia-migrator-20260909' THEN RAISE EXCEPTION 'Se requiere la conexión de mantenimiento'; END IF;
  IF NOT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name='20260925010000_secrets_calendar' AND finished_at IS NOT NULL AND rolled_back_at IS NULL) THEN RAISE EXCEPTION 'Falta la migración B22'; END IF;
  IF EXISTS (SELECT 1 FROM "AppSetting" WHERE key IN ('ai.anthropic.apiKey','ai.google.apiKey','auth.google.clientSecret','calendar.feedToken')) THEN RAISE EXCEPTION 'Completar la migración cifrada de secretos antes de activar'; END IF;
  PERFORM 1 FROM intia_ops.deployment_gate WHERE singleton AND blocked AND required_client IN ('intia-workflow-20260917','intia-completion-20260924','intia-secrets-20260925') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cerrar escrituras antes de activar la versión'; END IF;
END $$;
UPDATE intia_ops.deployment_gate SET required_client='intia-secrets-20260925' WHERE singleton;
COMMIT;
