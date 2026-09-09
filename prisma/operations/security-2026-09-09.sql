-- Actualización aditiva. Aplicar ANTES del código de seguridad, sin db push.
-- No ejecuta los índices candidatos de navegación ni clasifica datos antiguos como demo.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS "AuthSession" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "expiresAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AuthSession_userId_idx" ON "AuthSession"("userId");
CREATE INDEX IF NOT EXISTS "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");
CREATE TABLE IF NOT EXISTS "AuthAttempt" (
  "key" TEXT PRIMARY KEY, "attempts" INTEGER NOT NULL DEFAULT 0, "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "AuthAttempt_expiresAt_idx" ON "AuthAttempt"("expiresAt");
CREATE TABLE IF NOT EXISTS "DemoSeedRecord" (
  "entityType" TEXT NOT NULL, "entityId" TEXT NOT NULL, "fingerprint" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("entityType", "entityId")
);
-- Una instalación que ya tuvo dueños nunca vuelve a exponer el alta inicial.
INSERT INTO "AppSetting" ("key", "value", "updatedAt")
SELECT 'security.bootstrap.complete', '1', CURRENT_TIMESTAMP WHERE EXISTS (SELECT 1 FROM "User" WHERE "role" = 'OWNER')
ON CONFLICT ("key") DO NOTHING;
COMMIT;
