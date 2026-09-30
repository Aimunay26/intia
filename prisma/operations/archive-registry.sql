-- Registro del archivo total (M0), fuera de las migraciones del esquema de negocio.
-- Requiere la conexión de mantenimiento (application_name=intia-migrator-20260909).
-- Idempotente: volver a ejecutarlo no borra, no vacía y no reescribe lotes ni entradas.
--
-- archive_batch: un lote por ejecución de `npm run datos:archivo -- --apply`. Solo uno puede estar APPLIED.
-- archive_entry: una fila por marca archivada (ARCHIVED, con su estado anterior exacto) y una por tarea, evento,
--   guion o generación sin marca anterior a la época (HIDDEN, sin cambios en los datos: la app lo oculta por fecha).
--   La restauración de una marca se registra una sola vez: con el script (--restore, --restore-marca) o, durante M0,
--   con «Reactivar» en /marcas, que la marca como YA_ESTABA o RESPETADA en la misma transacción.
-- archive_owner_grant: el rol de dueño que un --restore con --dueno concedió (con BrandMembership, M1), con la
--   membresía anterior exacta de esa cuenta en esa marca (prev_* NULL = no tenía membresía). Inmutable.
-- M1 clasifica como «archivada por M0» la marca con una entrada ARCHIVED sin restored_at de un lote APPLIED que
--   además sigue archivada (Brand.archived): una marca viva nunca cuenta como archivada.
-- Sin DELETE ni TRUNCATE: el registro solo crece; un lote solo pasa de APPLIED a RESTORED.
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

CREATE TABLE IF NOT EXISTS intia_ops.archive_batch (
  id text PRIMARY KEY CONSTRAINT archive_batch_id_check CHECK (id ~ '^[a-z0-9][a-z0-9-]{2,62}$'),
  status text NOT NULL CONSTRAINT archive_batch_status_check CHECK (status IN ('APPLIED','RESTORED')),
  epoch timestamp(3) NOT NULL,
  token text NOT NULL CONSTRAINT archive_batch_token_check CHECK (token ~ '^[0-9a-f]{16}$'),
  counts jsonb NOT NULL,
  table_md5 jsonb NOT NULL,
  session_version_sum bigint NOT NULL,
  applied_at timestamp(3) NOT NULL DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
  restored_at timestamp(3),
  CONSTRAINT archive_batch_restored_check CHECK ((status = 'RESTORED') = (restored_at IS NOT NULL))
);
-- Solo un lote APPLIED a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS archive_batch_one_applied ON intia_ops.archive_batch (status) WHERE status = 'APPLIED';

CREATE TABLE IF NOT EXISTS intia_ops.archive_entry (
  batch_id text NOT NULL REFERENCES intia_ops.archive_batch(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  entity text NOT NULL CONSTRAINT archive_entry_entity_check CHECK (entity IN ('Brand','Task','CalendarEvent','Script','GenerationJob')),
  entity_id text NOT NULL,
  action text NOT NULL CONSTRAINT archive_entry_action_check CHECK (action IN ('ARCHIVED','HIDDEN')),
  prev_archived boolean,
  prev_active boolean,
  prev_updated_at timestamp(3),
  restored_at timestamp(3),
  restored_owner_id text,
  restore_result text CONSTRAINT archive_entry_result_check CHECK (restore_result IN ('RESTAURADA','YA_ESTABA','RESPETADA','FALTANTE')),
  PRIMARY KEY (batch_id, entity, entity_id),
  CONSTRAINT archive_entry_kind_check CHECK ((action = 'ARCHIVED') = (entity = 'Brand')),
  CONSTRAINT archive_entry_prev_check CHECK (CASE WHEN action = 'ARCHIVED'
    THEN prev_archived IS NOT NULL AND prev_active IS NOT NULL AND prev_updated_at IS NOT NULL
      AND NOT (prev_archived AND NOT prev_active)
    ELSE prev_archived IS NULL AND prev_active IS NULL AND prev_updated_at IS NULL
      AND restored_at IS NULL AND restored_owner_id IS NULL AND restore_result IS NULL END),
  CONSTRAINT archive_entry_restore_check CHECK ((restored_at IS NULL) = (restore_result IS NULL))
);
CREATE INDEX IF NOT EXISTS archive_entry_entity_idx ON intia_ops.archive_entry (entity, entity_id);

-- Una fila por marca en la que el restore creó o cambió la membresía del dueño indicado. Solo se concede donde el
-- restore devolvió la marca a la vida (RESTAURADA y no archivada antes del lote); nunca se levanta una suspensión.
CREATE TABLE IF NOT EXISTS intia_ops.archive_owner_grant (
  batch_id text NOT NULL,
  entity text NOT NULL DEFAULT 'Brand' CONSTRAINT archive_owner_grant_entity_check CHECK (entity = 'Brand'),
  brand_id text NOT NULL,
  user_id text NOT NULL,
  prev_role text CONSTRAINT archive_owner_grant_prev_role_check CHECK (prev_role IN ('DUENO_MARCA','MIEMBRO')),
  prev_status text CONSTRAINT archive_owner_grant_prev_status_check CHECK (prev_status IN ('ACTIVE','SUSPENDED')),
  new_role text NOT NULL CONSTRAINT archive_owner_grant_new_role_check CHECK (new_role = 'DUENO_MARCA'),
  new_status text NOT NULL CONSTRAINT archive_owner_grant_new_status_check CHECK (new_status = 'ACTIVE'),
  granted_at timestamp(3) NOT NULL DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
  PRIMARY KEY (batch_id, brand_id),
  FOREIGN KEY (batch_id, entity, brand_id) REFERENCES intia_ops.archive_entry(batch_id, entity, entity_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT archive_owner_grant_prev_check CHECK ((prev_role IS NULL) = (prev_status IS NULL)),
  -- Solo se registra un cambio real: quien ya era dueño activo no genera fila.
  CONSTRAINT archive_owner_grant_change_check CHECK (prev_role IS DISTINCT FROM 'DUENO_MARCA' OR prev_status IS DISTINCT FROM 'ACTIVE')
);

CREATE OR REPLACE FUNCTION intia_ops.archive_append_only() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, intia_ops AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'El registro del archivo total no se borra' USING ERRCODE = '55000';
  END IF;
  IF TG_TABLE_NAME = 'archive_batch' THEN
    IF OLD.status <> 'APPLIED' OR NEW.status <> 'RESTORED'
      OR (to_jsonb(NEW) - ARRAY['status','restored_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','restored_at']) THEN
      RAISE EXCEPTION 'Un lote solo pasa de APPLIED a RESTORED' USING ERRCODE = '55000';
    END IF;
  ELSIF TG_TABLE_NAME = 'archive_owner_grant' THEN
    RAISE EXCEPTION 'Una concesión de dueño del registro no se reescribe' USING ERRCODE = '55000';
  ELSIF OLD.restored_at IS NOT NULL OR NEW.restored_at IS NULL
    OR (to_jsonb(NEW) - ARRAY['restored_at','restored_owner_id','restore_result']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['restored_at','restored_owner_id','restore_result']) THEN
    RAISE EXCEPTION 'Una entrada solo registra su restauración, una vez' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION intia_ops.archive_append_only() FROM PUBLIC;
CREATE OR REPLACE TRIGGER archive_append_only BEFORE UPDATE OR DELETE ON intia_ops.archive_batch
  FOR EACH ROW EXECUTE FUNCTION intia_ops.archive_append_only();
CREATE OR REPLACE TRIGGER archive_no_truncate BEFORE TRUNCATE ON intia_ops.archive_batch
  FOR EACH STATEMENT EXECUTE FUNCTION intia_ops.archive_append_only();
CREATE OR REPLACE TRIGGER archive_append_only BEFORE UPDATE OR DELETE ON intia_ops.archive_entry
  FOR EACH ROW EXECUTE FUNCTION intia_ops.archive_append_only();
CREATE OR REPLACE TRIGGER archive_no_truncate BEFORE TRUNCATE ON intia_ops.archive_entry
  FOR EACH STATEMENT EXECUTE FUNCTION intia_ops.archive_append_only();
CREATE OR REPLACE TRIGGER archive_append_only BEFORE UPDATE OR DELETE ON intia_ops.archive_owner_grant
  FOR EACH ROW EXECUTE FUNCTION intia_ops.archive_append_only();
CREATE OR REPLACE TRIGGER archive_no_truncate BEFORE TRUNCATE ON intia_ops.archive_owner_grant
  FOR EACH STATEMENT EXECUTE FUNCTION intia_ops.archive_append_only();
REVOKE ALL ON intia_ops.archive_batch FROM PUBLIC;
REVOKE ALL ON intia_ops.archive_entry FROM PUBLIC;
REVOKE ALL ON intia_ops.archive_owner_grant FROM PUBLIC;
COMMIT;
