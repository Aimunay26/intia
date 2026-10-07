BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Se conserva el nombre técnico usado por ambos triggers existentes.
-- Autenticación (sessionVersion/AuthSession) y permisos son independientes:
-- cada petición relee perfiles y marcas; la revisión invalida actores en vuelo.
-- El UPDATE mantiene la exclusión con assertActor (FOR SHARE), incluso en SQL directo.
CREATE OR REPLACE FUNCTION revoke_access_sessions() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE affected TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN
    RETURN NULL;
  END IF;
  FOR affected IN SELECT DISTINCT value FROM unnest(ARRAY[
    CASE WHEN TG_OP <> 'INSERT' THEN OLD."userId" END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW."userId" END
  ]) value WHERE value IS NOT NULL ORDER BY value LOOP
    UPDATE "User"
       SET "updatedAt" = GREATEST(clock_timestamp()::timestamp(3), "updatedAt" + INTERVAL '1 millisecond')
     WHERE id = affected;
  END LOOP;
  RETURN NULL;
END $$;

COMMIT;
