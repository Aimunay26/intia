BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Bloquea escrituras durante el preflight y la creación del índice. No cambia filas
-- ni decide qué entrega conservar, incluidas las marcas y los videos archivados.
LOCK TABLE "ProductionStep" IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "ProductionStep"
    WHERE status = 'PENDIENTE' AND step <> 'DISENO'
    GROUP BY "contentItemId" HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Hay videos con varios pasos secuenciales pendientes. Revisar antes de migrar.'
      USING HINT = 'Ejecutar prisma/operations/preflight-single-pending-production-step.sql y resolver cada duplicidad con decision humana. No se han modificado filas.';
  END IF;
END $$;

-- La clave de automatización protege cada clase de paso; este índice protege
-- también dos clases distintas y claves manuales para un mismo video.
-- DISENO puede tener varias entregas paralelas. El historial cerrado se conserva.
CREATE UNIQUE INDEX "ProductionStep_one_pending_sequential_key"
  ON "ProductionStep" ("contentItemId")
  WHERE status = 'PENDIENTE' AND step <> 'DISENO';
COMMIT;
