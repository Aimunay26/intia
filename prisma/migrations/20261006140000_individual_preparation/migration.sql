BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
ALTER TABLE "ContentItem" ADD COLUMN "preparationRequired" BOOLEAN NOT NULL DEFAULT false;
UPDATE "ContentItem" c SET "preparationRequired" = true FROM "Brand" b
WHERE c."brandId" = b.id AND NOT b.archived AND c.status IN ('IDEA','GUION','APROBADO','GRABACION','PAUSADO')
AND NOT EXISTS (SELECT 1 FROM "ProductionStep" s WHERE s."contentItemId" = c.id AND s.step = 'GRABACION' AND s.status = 'HECHO');
CREATE TABLE "PreparationItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "contentItemId" TEXT NOT NULL REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "sourceKey" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "sourceText" TEXT NOT NULL DEFAULT '',
  "assigneeId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "required" BOOLEAN NOT NULL DEFAULT true,
  "status" TEXT NOT NULL DEFAULT 'PENDIENTE',
  "confirmedToken" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "confirmedById" TEXT,
  "overrideReason" TEXT NOT NULL DEFAULT '',
  "taskId" TEXT REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PreparationItem_kind_check" CHECK (kind IN ('PERSONAL','PROP')),
  CONSTRAINT "PreparationItem_status_check" CHECK (status IN ('PENDIENTE','LISTO','RETIRADO')),
  CONSTRAINT "PreparationItem_confirmation_check" CHECK ((status = 'LISTO' AND "confirmedToken" IS NOT NULL AND "confirmedAt" IS NOT NULL AND "confirmedById" IS NOT NULL) OR (status <> 'LISTO' AND "confirmedToken" IS NULL AND "confirmedAt" IS NULL AND "confirmedById" IS NULL))
);
CREATE UNIQUE INDEX "PreparationItem_contentItemId_sourceKey_key" ON "PreparationItem"("contentItemId", "sourceKey");
CREATE UNIQUE INDEX "PreparationItem_taskId_key" ON "PreparationItem"("taskId");
CREATE INDEX "PreparationItem_assigneeId_status_idx" ON "PreparationItem"("assigneeId", "status");
COMMIT;
