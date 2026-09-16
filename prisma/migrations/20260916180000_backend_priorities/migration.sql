BEGIN;

-- No eliminar referencias históricas silenciosamente: reparar el preflight antes de desplegar.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "GenerationItem" i LEFT JOIN "Structure" s ON s.id=i."structureId" WHERE s.id IS NULL) THEN
    RAISE EXCEPTION 'Preflight B05: existen trabajos con estructura inexistente. Revisar/restaurar su referencia antes de migrar.';
  END IF;
END $$;

CREATE TABLE "ContentPlannedStructure" (
  "contentItemId" TEXT NOT NULL,
  "structureId" TEXT NOT NULL,
  "order" INTEGER NOT NULL CHECK ("order" >= 0),
  CONSTRAINT "ContentPlannedStructure_pkey" PRIMARY KEY ("contentItemId", "structureId"),
  CONSTRAINT "ContentPlannedStructure_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ContentPlannedStructure_structureId_fkey" FOREIGN KEY ("structureId") REFERENCES "Structure"(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ContentPlannedStructure_structureId_idx" ON "ContentPlannedStructure"("structureId");

-- La cadena sigue siendo la entrada compatible. El índice relacional se mantiene en la MISMA transacción.
CREATE FUNCTION public.intia_planned_structures() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ids jsonb;
BEGIN
  BEGIN ids := NEW."structureIds"::jsonb;
  EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Formatos previstos: JSON no válido' USING ERRCODE='23514'; END;
  IF jsonb_typeof(ids) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Formatos previstos: se requiere una lista' USING ERRCODE='23514'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(ids) v WHERE jsonb_typeof(v) <> 'string') THEN
    RAISE EXCEPTION 'Formatos previstos: cada referencia debe ser texto' USING ERRCODE='23514';
  END IF;
  DELETE FROM "ContentPlannedStructure" WHERE "contentItemId"=NEW.id;
  INSERT INTO "ContentPlannedStructure" ("contentItemId", "structureId", "order")
    SELECT NEW.id, v.id, MIN(v.n)::integer-1 FROM jsonb_array_elements_text(ids) WITH ORDINALITY v(id,n) GROUP BY v.id;
  RETURN NEW;
END $$;
CREATE TRIGGER intia_planned_structures AFTER INSERT OR UPDATE OF "structureIds" ON "ContentItem"
  FOR EACH ROW EXECUTE FUNCTION public.intia_planned_structures();
-- El backfill valida el JSON y las FK. Un error revierte la migración completa.
UPDATE "ContentItem" SET "structureIds"="structureIds";

ALTER TABLE "GenerationItem" ADD COLUMN "linkWarning" TEXT;
ALTER TABLE "GenerationItem" ADD CONSTRAINT "GenerationItem_structureId_fkey" FOREIGN KEY ("structureId") REFERENCES "Structure"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "GenerationItem_structureId_idx" ON "GenerationItem"("structureId");
COMMIT;
