-- AlterTable: formatos previstos de un video (JSON string[] de ids de Structure).
-- Aditivo e idempotente: el código nuevo lee la columna en cada consulta de ContentItem.
ALTER TABLE "ContentItem" ADD COLUMN IF NOT EXISTS "structureIds" TEXT NOT NULL DEFAULT '[]';
