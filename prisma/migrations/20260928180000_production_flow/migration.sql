BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
-- Flujo de producción por equipos: equipo por marca, días de grabación y pasos con plazo.
-- Aditivo: solo crea tablas nuevas; ninguna columna nueva en tablas existentes, así que el
-- código desplegado antes de migrar sigue leyendo las mismas columnas de siempre.
-- El código solo consulta estas tablas con PRODUCTION_FLOW_ENABLED=true (migrar antes de encenderlo);
-- la procedencia de los datos de ejemplo las usa solo si existen (to_regclass).
-- Sin IF NOT EXISTS, como las demás migraciones: si ya existen (p. ej. creadas con db push),
-- falla en vez de darse por aplicada sin sus CHECK.
CREATE TABLE "BrandTeamMember" (
  "id" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BrandTeamMember_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BrandTeamMember_role_check" CHECK ("role" IN ('ENCARGADO','GUIONISTA','FILMMAKER','EDITOR','COMMUNITY','DISENADOR')),
  CONSTRAINT "BrandTeamMember_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BrandTeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- Una persona por función y marca.
CREATE UNIQUE INDEX "BrandTeamMember_brandId_role_key" ON "BrandTeamMember"("brandId", "role");
CREATE INDEX "BrandTeamMember_userId_idx" ON "BrandTeamMember"("userId");

CREATE TABLE "BrandProductionSettings" (
  "brandId" TEXT NOT NULL,
  "recordingWeekdays" TEXT NOT NULL DEFAULT '[]',
  "autoAssign" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BrandProductionSettings_pkey" PRIMARY KEY ("brandId"),
  -- JSON canónico de días 1 (lunes) a 6 (sábado): el domingo no se graba.
  CONSTRAINT "BrandProductionSettings_recordingWeekdays_check" CHECK ("recordingWeekdays" ~ '^\[([1-6](,[1-6]){0,5})?\]$'),
  CONSTRAINT "BrandProductionSettings_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ProductionStep" (
  "id" TEXT NOT NULL,
  "contentItemId" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "step" TEXT NOT NULL,
  "assigneeId" TEXT,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDIENTE',
  "source" TEXT NOT NULL DEFAULT 'AUTO',
  "taskId" TEXT,
  "materialUrl" TEXT,
  "requestedById" TEXT,
  "notes" TEXT,
  "doneAt" TIMESTAMP(3),
  "automationKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductionStep_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductionStep_step_check" CHECK ("step" IN ('GRABACION','EDICION','PUBLICACION','DISENO')),
  CONSTRAINT "ProductionStep_status_check" CHECK ("status" IN ('PENDIENTE','HECHO','CANCELADO')),
  CONSTRAINT "ProductionStep_source_check" CHECK ("source" IN ('AUTO','MANUAL')),
  CONSTRAINT "ProductionStep_done_check" CHECK (("status" = 'HECHO') = ("doneAt" IS NOT NULL)),
  CONSTRAINT "ProductionStep_materialUrl_check" CHECK ("materialUrl" IS NULL OR (length("materialUrl") <= 2000 AND "materialUrl" ~* '^https?://[^[:space:]]+$')),
  CONSTRAINT "ProductionStep_notes_check" CHECK ("notes" IS NULL OR length("notes") <= 2000),
  -- La clave de automatización siempre empieza por el video: no se reutiliza entre videos.
  CONSTRAINT "ProductionStep_automationKey_check" CHECK (left("automationKey", length("contentItemId") + 1) = "contentItemId" || ':'),
  CONSTRAINT "ProductionStep_contentItemId_brandId_fkey" FOREIGN KEY ("contentItemId", "brandId") REFERENCES "ContentItem"("id", "brandId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProductionStep_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ProductionStep_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ProductionStep_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ProductionStep_taskId_key" ON "ProductionStep"("taskId");
CREATE UNIQUE INDEX "ProductionStep_automationKey_key" ON "ProductionStep"("automationKey");
CREATE INDEX "ProductionStep_contentItemId_idx" ON "ProductionStep"("contentItemId");
CREATE INDEX "ProductionStep_brandId_dueAt_idx" ON "ProductionStep"("brandId", "dueAt");
CREATE INDEX "ProductionStep_assigneeId_status_idx" ON "ProductionStep"("assigneeId", "status");

-- Revisión monótona para lockRevision y formularios con revisión, igual que el resto de tablas editables.
CREATE OR REPLACE TRIGGER intia_revision BEFORE UPDATE ON "BrandTeamMember" FOR EACH ROW EXECUTE FUNCTION intia_revision();
CREATE OR REPLACE TRIGGER intia_revision BEFORE UPDATE ON "BrandProductionSettings" FOR EACH ROW EXECUTE FUNCTION intia_revision();
CREATE OR REPLACE TRIGGER intia_revision BEFORE UPDATE ON "ProductionStep" FOR EACH ROW EXECUTE FUNCTION intia_revision();
COMMIT;
