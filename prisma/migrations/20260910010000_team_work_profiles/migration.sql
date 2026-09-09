BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE TABLE "UserWorkProfile" (
  "userId" TEXT NOT NULL,
  "profile" TEXT NOT NULL,
  CONSTRAINT "UserWorkProfile_pkey" PRIMARY KEY ("userId", "profile"),
  CONSTRAINT "UserWorkProfile_profile_check" CHECK (profile IN ('STRATEGY','WRITER','PRODUCTION','CAMERA','TALENT','EDITOR','DESIGNER','PUBLISHER','ANALYST')),
  CONSTRAINT "UserWorkProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "UserWorkProfile_profile_idx" ON "UserWorkProfile"(profile);
CREATE TABLE "UserBrandAccess" (
  "userId" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  CONSTRAINT "UserBrandAccess_pkey" PRIMARY KEY ("userId", "brandId"),
  CONSTRAINT "UserBrandAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UserBrandAccess_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "UserBrandAccess_brandId_idx" ON "UserBrandAccess"("brandId");
-- No se deducen autorizaciones de asignaciones históricas. El dueño configura los accesos.
CREATE FUNCTION revoke_access_sessions() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE affected TEXT;
BEGIN
  FOR affected IN SELECT DISTINCT value FROM unnest(ARRAY[
    CASE WHEN TG_OP <> 'INSERT' THEN OLD."userId" END,
    CASE WHEN TG_OP <> 'DELETE' THEN NEW."userId" END
  ]) value WHERE value IS NOT NULL LOOP
    UPDATE "User" SET "sessionVersion" = "sessionVersion" + 1 WHERE id = affected;
    DELETE FROM "AuthSession" WHERE "userId" = affected;
  END LOOP;
  RETURN NULL;
END $$;
CREATE TRIGGER "UserWorkProfile_revoke" AFTER INSERT OR UPDATE OR DELETE ON "UserWorkProfile"
FOR EACH ROW EXECUTE FUNCTION revoke_access_sessions();
CREATE TRIGGER "UserBrandAccess_revoke" AFTER INSERT OR UPDATE OR DELETE ON "UserBrandAccess"
FOR EACH ROW EXECUTE FUNCTION revoke_access_sessions();
COMMIT;
