BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
-- No reparar vínculos ambiguos automáticamente: ensayar antes de producción.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM "CalendarEvent" e JOIN "ContentItem" c ON c.id=e."contentItemId" WHERE e."brandId" IS DISTINCT FROM c."brandId") THEN
  RAISE EXCEPTION 'Preflight B07: revisar eventos sin marca o de marca distinta a su video';
 END IF;
END $$;
CREATE UNIQUE INDEX "ContentItem_id_brandId_key" ON "ContentItem"(id,"brandId");
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_video_brand_fkey" FOREIGN KEY ("contentItemId","brandId") REFERENCES "ContentItem"(id,"brandId") ON UPDATE CASCADE ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
CREATE FUNCTION intia_event_brand_required() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM "CalendarEvent" WHERE id=NEW.id AND "contentItemId" IS NOT NULL AND "brandId" IS NULL) THEN
  RAISE EXCEPTION 'El evento vinculado necesita la marca de su video' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER intia_event_brand_required AFTER INSERT OR UPDATE ON "CalendarEvent" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION intia_event_brand_required();

ALTER TABLE "ArchetypeFit" ADD COLUMN "updatedById" TEXT, ADD COLUMN "updatedByName" TEXT, ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Asset" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['User','Asset','ArchetypeFit','AppSetting'] LOOP
  EXECUTE format('CREATE TRIGGER intia_revision BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION intia_revision()', t);
 END LOOP;
END $$;

CREATE TABLE "Approval" (
 id TEXT PRIMARY KEY, "entityType" TEXT NOT NULL, "entityId" TEXT NOT NULL, version INTEGER NOT NULL,
 fingerprint TEXT NOT NULL, snapshot JSONB NOT NULL, "approvedById" TEXT NOT NULL, "approvedByName" TEXT NOT NULL,
 "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "revokedAt" TIMESTAMP(3), "revokedById" TEXT, reason TEXT,
 CONSTRAINT "Approval_type_check" CHECK ("entityType" IN ('SCRIPT','SCRIPT_APPROVAL','FINAL_APPROVAL')),
 CONSTRAINT "Approval_version_check" CHECK(version>0)
);
CREATE UNIQUE INDEX "Approval_entityType_entityId_version_key" ON "Approval"("entityType","entityId",version);
ALTER TABLE "Script" ADD COLUMN "approvalId" TEXT;
ALTER TABLE "ChecklistItem" ADD COLUMN kind TEXT NOT NULL DEFAULT 'TASK', ADD COLUMN "approvalId" TEXT;
-- Solo se clasifica el legado. No se inventan autores ni versiones históricas aprobadas.
UPDATE "ChecklistItem" SET kind='FINAL_APPROVAL' WHERE stage='POSTPRODUCCION' AND label ~* 'final' AND label ~* 'aprobad';
UPDATE "ChecklistItem" SET kind='SCRIPT_APPROVAL' WHERE stage='PREPRODUCCION' AND label ~* 'guion' AND label ~* 'aprobad';
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_kind_check" CHECK (kind IN ('TASK','SCRIPT_APPROVAL','FINAL_APPROVAL'));
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_approval_stage_check" CHECK (kind='TASK' OR (kind='SCRIPT_APPROVAL' AND stage='PREPRODUCCION') OR (kind='FINAL_APPROVAL' AND stage='POSTPRODUCCION'));
CREATE UNIQUE INDEX "Script_approvalId_key" ON "Script"("approvalId");
CREATE UNIQUE INDEX "ChecklistItem_approvalId_key" ON "ChecklistItem"("approvalId");
ALTER TABLE "Script" ADD CONSTRAINT "Script_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "Approval"(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "Approval"(id) ON DELETE SET NULL ON UPDATE CASCADE;
CREATE FUNCTION intia_approval_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-ARRAY['revokedAt','revokedById','reason']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['revokedAt','revokedById','reason']) OR OLD."revokedAt" IS NOT NULL THEN
  RAISE EXCEPTION 'La evidencia de aprobación es inmutable' USING ERRCODE='23514';
 END IF;
 IF NEW."revokedAt" IS NULL OR NEW."revokedById" IS NULL OR NEW.reason IS NULL OR length(trim(NEW.reason)) NOT BETWEEN 5 AND 1000 THEN
  RAISE EXCEPTION 'Revocar requiere autor, fecha y motivo' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER intia_approval_immutable BEFORE UPDATE OR DELETE ON "Approval" FOR EACH ROW EXECUTE FUNCTION intia_approval_immutable();
COMMIT;
