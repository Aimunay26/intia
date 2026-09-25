BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
ALTER TABLE "BrandObjective"
  ADD COLUMN "calculationMode" TEXT NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "calculationFrom" TIMESTAMP(3),
  ADD COLUMN "calculationTo" TIMESTAMP(3),
  ADD COLUMN "calculationPlatform" TEXT;
ALTER TABLE "BrandObjective" ADD CONSTRAINT "BrandObjective_calculation_check" CHECK (
  "calculationMode"='MANUAL' OR ("calculationMode"='WEEKLY_SUM'
    AND "metricKey" IS NOT NULL AND "metricKey" IN ('views','likes','comments','shares','saves','reach','clicks','leads','orders','spend','revenue')
    AND "calculationFrom" IS NOT NULL AND "calculationTo" IS NOT NULL
    AND EXTRACT(ISODOW FROM "calculationFrom")=1 AND EXTRACT(ISODOW FROM "calculationTo")=7
    AND "calculationTo">="calculationFrom" AND "calculationTo"-"calculationFrom"<=INTERVAL '363 days'
    AND ("calculationPlatform" IS NULL OR "calculationPlatform" IN ('TIKTOK','INSTAGRAM','FACEBOOK','YOUTUBE','WHATSAPP','OTRO'))));
ALTER TABLE "GenerationItem" ADD COLUMN stage TEXT, ADD COLUMN diagnostics JSONB;
CREATE TABLE "MetricImportBatch" (
  id TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "requestKey" TEXT NOT NULL,
  fingerprint TEXT NOT NULL, rows JSONB NOT NULL, issues JSONB NOT NULL,
  processed INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL,
  created INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MetricImportBatch_user_fkey" FOREIGN KEY("userId") REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MetricImportBatch_counts_check" CHECK(total>=1 AND total<=500 AND processed>=0 AND processed<=total AND created>=0 AND updated>=0 AND created+updated<=processed),
  CONSTRAINT "MetricImportBatch_status_check" CHECK(status IN ('PENDING','COMPLETED'))
);
CREATE UNIQUE INDEX "MetricImportBatch_userId_requestKey_key" ON "MetricImportBatch"("userId","requestKey");
CREATE INDEX "MetricImportBatch_userId_createdAt_idx" ON "MetricImportBatch"("userId","createdAt");
CREATE TRIGGER intia_revision BEFORE UPDATE ON "MetricImportBatch" FOR EACH ROW EXECUTE FUNCTION intia_revision();
-- Adopt the measured operational indexes, checking definitions and validity.
-- On a large deployment these can be prebuilt CONCURRENTLY before this transaction.
DO $$
DECLARE candidate RECORD; valid BOOLEAN;
BEGIN
  FOR candidate IN SELECT * FROM (VALUES
    ('Task_columnId_order_id_idx', 'CREATE INDEX "Task_columnId_order_id_idx" ON public."Task" USING btree ("columnId", "order", id)'),
    ('Task_columnId_brandId_order_id_idx', 'CREATE INDEX "Task_columnId_brandId_order_id_idx" ON public."Task" USING btree ("columnId", "brandId", "order", id)'),
    ('ContentItem_scriptId_idx', 'CREATE INDEX "ContentItem_scriptId_idx" ON public."ContentItem" USING btree ("scriptId")')
  ) AS definitions(name, definition) LOOP
    IF to_regclass(format('public.%I',candidate.name)) IS NULL THEN EXECUTE candidate.definition; END IF;
    SELECT i.indisvalid AND i.indisready AND pg_get_indexdef(i.indexrelid)=candidate.definition INTO valid
      FROM pg_index i WHERE i.indexrelid=to_regclass(format('public.%I',candidate.name));
    IF valid IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Preflight B13: índice % inválido o con definición distinta; revisar antes de migrar',candidate.name; END IF;
  END LOOP;
END $$;
-- Retire the unused matching write model without deleting historical rows or references.
CREATE FUNCTION intia_legacy_matching_readonly() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'El matching legado es un archivo de consulta; no admite nuevas ejecuciones ni ediciones' USING ERRCODE='55000'; END $$;
CREATE TRIGGER intia_legacy_readonly BEFORE INSERT OR UPDATE ON "MatchRun" FOR EACH ROW EXECUTE FUNCTION intia_legacy_matching_readonly();
CREATE TRIGGER intia_legacy_readonly BEFORE INSERT OR UPDATE ON "MatchRow" FOR EACH ROW EXECUTE FUNCTION intia_legacy_matching_readonly();
COMMIT;
