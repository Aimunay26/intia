BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
-- Todos los pasos son transaccionales. Ante datos ambiguos se detiene sin corregirlos silenciosamente.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "Script" s WHERE s."archetypeId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Archetype" a WHERE a.id=s."archetypeId")) THEN RAISE EXCEPTION 'Preflight: guion con arquetipo inexistente'; END IF;
  IF EXISTS (SELECT 1 FROM "CalendarEvent" e WHERE e."contentItemId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "ContentItem" c WHERE c.id=e."contentItemId")) THEN RAISE EXCEPTION 'Preflight: evento con video inexistente'; END IF;
  IF EXISTS (SELECT 1 FROM "ContentItem" c JOIN "Script" s ON s.id=c."scriptId" WHERE (s."brandId" IS NOT NULL AND s."brandId"<>c."brandId") OR s."structureId" IS DISTINCT FROM c."structureId") THEN RAISE EXCEPTION 'Preflight: revisar marca o estructura de videos vinculados'; END IF;
END $$;

-- DropIndex
DROP INDEX "Metric_contentItemId_date_key";

-- AlterTable
ALTER TABLE "Metric" ADD COLUMN     "period" TEXT NOT NULL DEFAULT 'LEGACY',
ADD COLUMN     "platform" TEXT NOT NULL DEFAULT 'UNATTRIBUTED',
ALTER COLUMN "retention3s" DROP NOT NULL,
ALTER COLUMN "retention3s" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "Metric_contentItemId_date_platform_period_key" ON "Metric"("contentItemId", "date", "platform", "period");

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Script" ADD CONSTRAINT "Script_archetypeId_fkey" FOREIGN KEY ("archetypeId") REFERENCES "Archetype"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE FUNCTION public.intia_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."updatedAt" := GREATEST(date_trunc('milliseconds',clock_timestamp() AT TIME ZONE 'UTC'),OLD."updatedAt" + interval '1 millisecond');
  RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['Brand','BrandObjective','ContentItem','Script','CalendarEvent','Structure','Archetype','Task','TaskColumn','Metric'] LOOP
    EXECUTE format('CREATE TRIGGER intia_revision BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.intia_revision()',t);
  END LOOP;
END $$;

-- Las dos direcciones del vínculo se validan incluso para escrituras fuera de Server Actions.
CREATE FUNCTION public.intia_video_script() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent "Script"%ROWTYPE;
BEGIN
  IF NEW."scriptId" IS NOT NULL THEN
    SELECT * INTO parent FROM "Script" WHERE id=NEW."scriptId" FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Guion inexistente' USING ERRCODE='23503'; END IF;
    IF parent."brandId" IS NOT NULL AND parent."brandId"<>NEW."brandId" THEN RAISE EXCEPTION 'Guion y video pertenecen a marcas distintas' USING ERRCODE='23514'; END IF;
    NEW."structureId" := parent."structureId";
  ELSIF TG_OP='UPDATE' AND OLD."scriptId" IS NOT NULL THEN
    NEW."structureId" := NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER intia_video_script BEFORE INSERT OR UPDATE OF "scriptId","structureId","brandId" ON "ContentItem" FOR EACH ROW EXECUTE FUNCTION public.intia_video_script();
CREATE FUNCTION public.intia_script_content() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."brandId" IS NOT NULL AND EXISTS(SELECT 1 FROM "ContentItem" WHERE "scriptId"=NEW.id AND "brandId"<>NEW."brandId") THEN RAISE EXCEPTION 'Guion vinculado a videos de otra marca' USING ERRCODE='23514'; END IF;
  IF NEW."structureId" IS DISTINCT FROM OLD."structureId" THEN UPDATE "ContentItem" SET "structureId"=NEW."structureId" WHERE "scriptId"=NEW.id; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER intia_script_content AFTER UPDATE OF "structureId","brandId" ON "Script" FOR EACH ROW EXECUTE FUNCTION public.intia_script_content();

-- Dueño polimórfico: bloqueo del padre evita la carrera entre subir archivo y borrar el dueño.
CREATE FUNCTION public.intia_asset_owner() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t text; found_id text;
BEGIN
  t := CASE NEW."ownerType" WHEN 'brand' THEN 'Brand' WHEN 'content' THEN 'ContentItem' WHEN 'structure' THEN 'Structure' WHEN 'archetype' THEN 'Archetype' WHEN 'user' THEN 'User' END;
  IF t IS NULL THEN RAISE EXCEPTION 'Tipo de dueño no permitido' USING ERRCODE='23514'; END IF;
  EXECUTE format('SELECT id FROM public.%I WHERE id=$1 FOR KEY SHARE',t) INTO found_id USING NEW."ownerId";
  IF found_id IS NULL THEN RAISE EXCEPTION 'Dueño de archivo inexistente' USING ERRCODE='23503'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER intia_asset_owner BEFORE INSERT OR UPDATE OF "ownerType","ownerId" ON "Asset" FOR EACH ROW EXECUTE FUNCTION public.intia_asset_owner();
CREATE FUNCTION public.intia_asset_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN DELETE FROM "Asset" WHERE "ownerType"=TG_ARGV[0] AND "ownerId"=OLD.id; RETURN OLD; END $$;
CREATE TRIGGER intia_asset_cleanup AFTER DELETE ON "Brand" FOR EACH ROW EXECUTE FUNCTION public.intia_asset_cleanup('brand');
CREATE TRIGGER intia_asset_cleanup AFTER DELETE ON "ContentItem" FOR EACH ROW EXECUTE FUNCTION public.intia_asset_cleanup('content');
CREATE TRIGGER intia_asset_cleanup AFTER DELETE ON "Structure" FOR EACH ROW EXECUTE FUNCTION public.intia_asset_cleanup('structure');
CREATE TRIGGER intia_asset_cleanup AFTER DELETE ON "Archetype" FOR EACH ROW EXECUTE FUNCTION public.intia_asset_cleanup('archetype');
CREATE TRIGGER intia_asset_cleanup AFTER DELETE ON "User" FOR EACH ROW EXECUTE FUNCTION public.intia_asset_cleanup('user');

-- Se preservan íntegros los históricos. Solo WEEKLY tiene reglas nuevas de período y valores.
ALTER TABLE "Metric" ADD CONSTRAINT "Metric_period_check" CHECK ("period" IN ('LEGACY','WEEKLY'));
ALTER TABLE "Metric" ADD CONSTRAINT "Metric_weekly_check" CHECK ("period" <> 'WEEKLY' OR (
  "platform" IN ('TIKTOK','INSTAGRAM','FACEBOOK','YOUTUBE','WHATSAPP','OTRO')
  AND EXTRACT(ISODOW FROM "date")=1 AND "date"::time='12:00:00'
  AND views>=0 AND likes>=0 AND comments>=0 AND shares>=0 AND saves>=0 AND reach>=0 AND clicks>=0 AND leads>=0 AND orders>=0
  AND spend BETWEEN 0 AND 1e12 AND revenue BETWEEN 0 AND 1e12 AND "watchTimeSec" BETWEEN 0 AND 1e12
  AND ("retention3s" IS NULL OR "retention3s" BETWEEN 0 AND 100)
));

COMMIT;
