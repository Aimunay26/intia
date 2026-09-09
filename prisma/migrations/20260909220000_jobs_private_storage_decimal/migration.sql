BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
LOCK TABLE "Metric", "ContentItem", "Asset" IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Metric" WHERE spend::text IN ('NaN','Infinity','-Infinity') OR revenue::text IN ('NaN','Infinity','-Infinity')) THEN
    RAISE EXCEPTION 'Importes históricos no finitos: corregir antes de migrar';
  END IF;
  IF EXISTS (SELECT 1 FROM "Metric" WHERE spend::text::numeric < 0 OR revenue::text::numeric < 0
      OR spend::text::numeric > 1000000000000 OR revenue::text::numeric > 1000000000000
      OR spend::text::numeric <> round(spend::text::numeric,6) OR revenue::text::numeric <> round(revenue::text::numeric,6)) THEN
    RAISE EXCEPTION 'Importes históricos fuera de rango o con más de seis decimales: no se redondean automáticamente';
  END IF;
  IF EXISTS (SELECT 1 FROM "ContentItem" WHERE jsonb_typeof(platforms::jsonb) <> 'array') THEN
    RAISE EXCEPTION 'Las plataformas históricas deben ser listas JSON';
  END IF;
  IF EXISTS (SELECT 1 FROM "ContentItem", jsonb_array_elements(platforms::jsonb) p
      WHERE jsonb_typeof(p) <> 'string' OR p #>> '{}' NOT IN ('TIKTOK','INSTAGRAM','FACEBOOK','YOUTUBE','WHATSAPP','OTRO')) THEN
    RAISE EXCEPTION 'Plataforma histórica desconocida: corregir antes de normalizar';
  END IF;
END $$;

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "blobId" TEXT,
ALTER COLUMN "data" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Metric" ALTER COLUMN "spend" SET DATA TYPE DECIMAL(24,6) USING "spend"::text::numeric,
ALTER COLUMN "revenue" SET DATA TYPE DECIMAL(24,6) USING "revenue"::text::numeric;

-- AlterTable
ALTER TABLE "Script" ADD COLUMN     "generationItemId" TEXT,
ADD COLUMN     "inputTokens" INTEGER,
ADD COLUMN     "outputTokens" INTEGER;

-- CreateTable
CREATE TABLE "ContentPlatform" (
    "contentItemId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,

    CONSTRAINT "ContentPlatform_pkey" PRIMARY KEY ("contentItemId","platform")
);

-- CreateTable
CREATE TABLE "BlobObject" (
    "id" TEXT NOT NULL,
    "pathname" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'STAGING',
    "sha256" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlobObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionVersion" INTEGER NOT NULL,
    "requestKey" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "payload" JSONB NOT NULL,
    "runId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationItem" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "structureId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "response" JSONB,
    "error" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GenerationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageCounter" (
    "key" TEXT NOT NULL,
    "amount" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "UsageCounter_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "ContentPlatform_platform_contentItemId_idx" ON "ContentPlatform"("platform", "contentItemId");

-- CreateIndex
CREATE UNIQUE INDEX "BlobObject_pathname_key" ON "BlobObject"("pathname");

-- CreateIndex
CREATE INDEX "BlobObject_state_nextAttemptAt_idx" ON "BlobObject"("state", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "GenerationJob_userId_createdAt_idx" ON "GenerationJob"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "GenerationJob_status_createdAt_idx" ON "GenerationJob"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GenerationJob_userId_requestKey_key" ON "GenerationJob"("userId", "requestKey");

-- CreateIndex
CREATE INDEX "GenerationItem_jobId_status_order_idx" ON "GenerationItem"("jobId", "status", "order");

-- CreateIndex
CREATE UNIQUE INDEX "GenerationItem_jobId_structureId_key" ON "GenerationItem"("jobId", "structureId");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_blobId_key" ON "Asset"("blobId");

-- CreateIndex
CREATE UNIQUE INDEX "Script_generationItemId_key" ON "Script"("generationItemId");

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_blobId_fkey" FOREIGN KEY ("blobId") REFERENCES "BlobObject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Script" ADD CONSTRAINT "Script_generationItemId_fkey" FOREIGN KEY ("generationItemId") REFERENCES "GenerationItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPlatform" ADD CONSTRAINT "ContentPlatform_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationItem" ADD CONSTRAINT "GenerationItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "GenerationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;



ALTER TABLE "Metric" ADD CONSTRAINT "Metric_money_check" CHECK (
  spend >= 0 AND spend <= 1000000000000 AND revenue >= 0 AND revenue <= 1000000000000);
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_storage_check" CHECK ((data IS NOT NULL) <> ("blobId" IS NOT NULL));
ALTER TABLE "BlobObject" ADD CONSTRAINT "BlobObject_state_check" CHECK (state IN ('STAGING','ATTACHED','DELETE_PENDING','DELETED'));
ALTER TABLE "BlobObject" ADD CONSTRAINT "BlobObject_size_check" CHECK (size > 0 AND size <= 4194304 AND attempts >= 0);
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_status_check" CHECK (status IN ('QUEUED','RUNNING','COMPLETED','PARTIAL','FAILED','CANCELLED'));
ALTER TABLE "GenerationItem" ADD CONSTRAINT "GenerationItem_status_check" CHECK (status IN ('QUEUED','RUNNING','COMPLETED','FAILED','CANCELLED'));
ALTER TABLE "GenerationItem" ADD CONSTRAINT "GenerationItem_usage_check" CHECK (attempts >= 0 AND attempts <= 3 AND "inputTokens" >= 0 AND "outputTokens" >= 0 AND "order" >= 0);
ALTER TABLE "UsageCounter" ADD CONSTRAINT "UsageCounter_amount_check" CHECK (amount >= 0);
ALTER TABLE "ContentPlatform" ADD CONSTRAINT "ContentPlatform_platform_check" CHECK (platform IN ('TIKTOK','INSTAGRAM','FACEBOOK','YOUTUBE','WHATSAPP','OTRO'));

INSERT INTO "ContentPlatform" ("contentItemId",platform)
SELECT DISTINCT c.id,p FROM "ContentItem" c, jsonb_array_elements_text(c.platforms::jsonb) p;

-- El JSON sigue siendo entrada compatible; la relación indexada se actualiza en la misma transacción.
CREATE FUNCTION intia_sync_content_platforms() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF jsonb_typeof(NEW.platforms::jsonb) <> 'array' THEN RAISE EXCEPTION 'Plataformas debe ser una lista JSON'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.platforms::jsonb) p WHERE jsonb_typeof(p) <> 'string') THEN RAISE EXCEPTION 'Plataforma inválida'; END IF;
  DELETE FROM "ContentPlatform" WHERE "contentItemId" = NEW.id;
  INSERT INTO "ContentPlatform" ("contentItemId", platform) SELECT DISTINCT NEW.id,p FROM jsonb_array_elements_text(NEW.platforms::jsonb) p;
  RETURN NEW;
END $$;
CREATE TRIGGER intia_content_platforms AFTER INSERT OR UPDATE OF platforms ON "ContentItem" FOR EACH ROW EXECUTE FUNCTION intia_sync_content_platforms();

-- Se ejecuta también cuando la entidad dueña elimina sus adjuntos en cascada.
CREATE FUNCTION intia_queue_blob_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."blobId" IS NOT NULL THEN
    IF TG_OP = 'DELETE' OR OLD."blobId" IS DISTINCT FROM NEW."blobId" THEN
      UPDATE "BlobObject" SET state='DELETE_PENDING', "nextAttemptAt"=CURRENT_TIMESTAMP, "updatedAt"=CURRENT_TIMESTAMP WHERE id=OLD."blobId";
    END IF;
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER intia_asset_blob_delete AFTER DELETE OR UPDATE OF "blobId" ON "Asset" FOR EACH ROW EXECUTE FUNCTION intia_queue_blob_delete();

CREATE FUNCTION intia_assert_blob_attachment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."blobId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "BlobObject" WHERE id=NEW."blobId" AND state='ATTACHED' AND size=NEW.size
  ) THEN RAISE EXCEPTION 'El archivo privado no está preparado para adjuntarse'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER intia_asset_blob_attach BEFORE INSERT OR UPDATE OF "blobId", size ON "Asset" FOR EACH ROW EXECUTE FUNCTION intia_assert_blob_attachment();
COMMIT;
