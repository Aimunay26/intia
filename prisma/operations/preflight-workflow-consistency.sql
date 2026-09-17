-- Solo lectura. Resolver cada discrepancia con el responsable antes de migrar.
SELECT e.id, e.title, e."brandId" AS event_brand, e."contentItemId", c."brandId" AS video_brand
FROM "CalendarEvent" e JOIN "ContentItem" c ON c.id=e."contentItemId"
WHERE e."brandId" IS DISTINCT FROM c."brandId";

-- Informativo: se preservan como históricos, pero requerirán reapertura/aprobación
-- explícita para futuras transiciones y publicaciones con versión verificable.
SELECT id, title, status FROM "Script" WHERE status IN ('APROBADO','GRABADO');
SELECT id, "contentItemId", label, "doneById", "doneAt" FROM "ChecklistItem"
WHERE done AND ((stage='POSTPRODUCCION' AND label ~* 'final' AND label ~* 'aprobad')
 OR (stage='PREPRODUCCION' AND label ~* 'guion' AND label ~* 'aprobad'));
