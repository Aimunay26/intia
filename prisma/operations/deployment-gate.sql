-- Operación explícita de despliegue, fuera de las migraciones del esquema de negocio.
-- Requiere la conexión de operación con application_name=intia-migrator-20260909.
-- Instala el control cerrado. Ejecutar de nuevo añade guardas a tablas nuevas sin reabrirlo.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $$ BEGIN
  IF current_setting('application_name') <> 'intia-migrator-20260909' THEN
    RAISE EXCEPTION 'Esta operación requiere la conexión de mantenimiento';
  END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS intia_ops;
REVOKE ALL ON SCHEMA intia_ops FROM PUBLIC;
CREATE TABLE IF NOT EXISTS intia_ops.deployment_gate (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  blocked boolean NOT NULL DEFAULT true,
  required_client text NOT NULL DEFAULT 'intia-schema-20260909'
);
INSERT INTO intia_ops.deployment_gate (singleton) VALUES (true) ON CONFLICT DO NOTHING;
REVOKE ALL ON intia_ops.deployment_gate FROM PUBLIC;
CREATE OR REPLACE FUNCTION intia_ops.check_writer() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, intia_ops AS $$
DECLARE gate intia_ops.deployment_gate%ROWTYPE;
BEGIN
  IF current_setting('application_name') = 'intia-migrator-20260909' THEN RETURN NULL; END IF;
  -- El bloqueo compartido dura toda la transacción. Cerrar espera a los escritores en curso.
  SELECT * INTO gate FROM intia_ops.deployment_gate WHERE singleton FOR SHARE;
  IF NOT FOUND OR gate.blocked THEN
    RAISE EXCEPTION 'Actualización del sistema en curso. Conserva el formulario y reintenta en unos minutos.' USING ERRCODE='55000';
  END IF;
  IF current_setting('application_name') <> gate.required_client THEN
    RAISE EXCEPTION 'Esta versión del sistema quedó desactualizada. Recarga la aplicación antes de guardar.' USING ERRCODE='55000';
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION intia_ops.check_writer() FROM PUBLIC;
DO $$ DECLARE item record; BEGIN
  FOR item IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND c.relname<>'_prisma_migrations' ORDER BY c.relname LOOP
    EXECUTE format('CREATE OR REPLACE TRIGGER intia_deployment_guard BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION intia_ops.check_writer()',item.relname);
  END LOOP;
END $$;
COMMIT;
