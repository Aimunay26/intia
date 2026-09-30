BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
-- Calendario personal (CALENDAR_FEED_PERSONAL). Solo amplía el CHECK de alcance de
-- CalendarSubscription: sin columnas ni tablas nuevas. El código anterior nunca escribe
-- scope='USER', así que la migración es compatible con él y puede aplicarse antes de desplegar.
--   USER: feed de una persona. brandId siempre nulo; "createdById" es la dueña del feed.
--   Sus marcas, perfiles y pasos se leen en cada descarga (perder una marca quita sus fechas).
-- No revertir: para estrecharla antes debe dar 0
--   SELECT count(*) FROM "CalendarSubscription" WHERE scope = 'USER';
ALTER TABLE "CalendarSubscription" DROP CONSTRAINT "CalendarSubscription_scope_check";
ALTER TABLE "CalendarSubscription" ADD CONSTRAINT "CalendarSubscription_scope_check" CHECK (
  (scope = 'ALL' AND "brandId" IS NULL)
  OR (scope = 'BRAND' AND "brandId" IS NOT NULL)
  OR (scope = 'USER' AND "brandId" IS NULL)
);
COMMIT;
