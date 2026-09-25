BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE TABLE "AppSecret" (
  "key" TEXT PRIMARY KEY,
  "value" TEXT NOT NULL,
  "keyId" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppSecret_key_check" CHECK ("key" IN ('ai.anthropic.apiKey','ai.google.apiKey','auth.google.clientSecret')),
  CONSTRAINT "AppSecret_envelope_check" CHECK ("keyId" ~ '^[a-zA-Z0-9_-]{1,40}$' AND "value" ~ '^v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]+:[A-Za-z0-9_-]{22}$')
);
CREATE TABLE "CalendarSubscription" (
  "id" TEXT PRIMARY KEY,
  "label" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "scope" TEXT NOT NULL,
  "brandId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "CalendarSubscription_scope_check" CHECK ((scope = 'ALL' AND "brandId" IS NULL) OR (scope = 'BRAND' AND "brandId" IS NOT NULL)),
  CONSTRAINT "CalendarSubscription_token_check" CHECK ("tokenHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "CalendarSubscription_expiry_check" CHECK ("expiresAt" > "createdAt"),
  CONSTRAINT "CalendarSubscription_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CalendarSubscription_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CalendarSubscription_createdById_createdAt_idx" ON "CalendarSubscription"("createdById","createdAt");
CREATE INDEX "CalendarSubscription_brandId_idx" ON "CalendarSubscription"("brandId");
-- Old global URLs cannot be safely inferred as brand-scoped. Reissue explicitly.
DELETE FROM "AppSetting" WHERE key = 'calendar.feedToken';
-- Existing provider values are migrated with the separately held encryption key.
-- Forbid any new plaintext write while retaining DELETE for the migration tool.
CREATE FUNCTION "reject_plaintext_secret"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NEW.key IN ('ai.anthropic.apiKey','ai.google.apiKey','auth.google.clientSecret','calendar.feedToken') THEN
    RAISE EXCEPTION 'Usar el almacén cifrado o las suscripciones de calendario B22';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "AppSetting_no_plaintext_secret" BEFORE INSERT OR UPDATE ON "AppSetting"
  FOR EACH ROW EXECUTE FUNCTION "reject_plaintext_secret"();
COMMIT;
