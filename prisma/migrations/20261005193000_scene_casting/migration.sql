-- AlterTable
ALTER TABLE "ContentItem" ADD COLUMN     "castingRevision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "shootEndMinute" INTEGER,
ADD COLUMN     "shootStartMinute" INTEGER;

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "castingManaged" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CastRole" (
    "id" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "slotKey" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "archetype" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "userId" TEXT,
    "response" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "responseNote" TEXT NOT NULL DEFAULT '',
    "confirmedToken" TEXT,
    "respondedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CastRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActorUnavailability" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActorUnavailability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CastRole_userId_contentItemId_idx" ON "CastRole"("userId", "contentItemId");

-- CreateIndex
CREATE UNIQUE INDEX "CastRole_contentItemId_slotKey_key" ON "CastRole"("contentItemId", "slotKey");

-- CreateIndex
CREATE INDEX "ActorUnavailability_userId_startAt_endAt_idx" ON "ActorUnavailability"("userId", "startAt", "endAt");

-- AddForeignKey
ALTER TABLE "CastRole" ADD CONSTRAINT "CastRole_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CastRole" ADD CONSTRAINT "CastRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActorUnavailability" ADD CONSTRAINT "ActorUnavailability_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ActorUnavailability" ADD CONSTRAINT "ActorUnavailability_interval_check" CHECK ("endAt" > "startAt");
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_shoot_hours_check" CHECK (
  ("shootStartMinute" IS NULL AND "shootEndMinute" IS NULL) OR
  ("shootStartMinute" IS NOT NULL AND "shootEndMinute" IS NOT NULL AND "shootStartMinute" >= 0 AND "shootEndMinute" < 1440 AND "shootEndMinute" > "shootStartMinute")
);
ALTER TABLE "CastRole" ADD CONSTRAINT "CastRole_response_check" CHECK ("response" IN ('PENDIENTE', 'CONFIRMADO', 'RECHAZADO'));
