-- Actualización aditiva. Aplicar en Neon ANTES de publicar el código que lee
-- ContentItem.structureIds (formatos previstos de un video), sin db push.
-- Verificar después con:
--   SELECT column_name, data_type, column_default FROM information_schema.columns
--   WHERE table_name = 'ContentItem' AND column_name = 'structureIds';
--   SELECT "key", "value" FROM "AppSetting" WHERE "key" = 'ai.google.model';
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE "ContentItem" ADD COLUMN IF NOT EXISTS "structureIds" TEXT NOT NULL DEFAULT '[]';
-- El generador ahora lee el «Modelo por defecto» de Gemini desde AppSetting. El
-- seed anterior dejó gemini-2.5-pro (agota la cuota gratuita) y el upsert del seed
-- nunca lo reescribe: se pasa al nuevo predeterminado solo si sigue el valor
-- heredado; un modelo elegido a mano por el dueño se respeta.
UPDATE "AppSetting"
SET "value" = 'gemini-2.5-flash', "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'ai.google.model' AND "value" = 'gemini-2.5-pro';
COMMIT;
