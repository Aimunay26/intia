-- Solo lectura. Debe devolver cero filas antes de aplicar la migración.
-- Incluye historial archivado: archivar una marca no elude la restricción.
SELECT s."contentItemId", s."brandId", b.archived AS "brandArchived",
       count(*)::int AS "pendingSteps",
       jsonb_agg(jsonb_build_object('id', s.id, 'step', s.step,
         'source', s.source, 'taskId', s."taskId", 'assigneeId', s."assigneeId")
         ORDER BY s."createdAt", s.id) AS steps
FROM "ProductionStep" s JOIN "Brand" b ON b.id = s."brandId"
WHERE s.status = 'PENDIENTE' AND s.step <> 'DISENO'
GROUP BY s."contentItemId", s."brandId", b.archived
HAVING count(*) > 1
ORDER BY s."brandId", s."contentItemId";
