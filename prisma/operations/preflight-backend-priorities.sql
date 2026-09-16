-- Solo lectura, PostgreSQL 16+. Las cuatro consultas deben devolver cero filas.
-- No modificar ni eliminar referencias históricas automáticamente para superar el preflight.
SELECT i.id, i."jobId", i."structureId"
FROM "GenerationItem" i LEFT JOIN "Structure" s ON s.id=i."structureId" WHERE s.id IS NULL;

SELECT id FROM "ContentItem" WHERE NOT pg_input_is_valid("structureIds", 'jsonb');

WITH parsed AS (
  SELECT id, CASE WHEN pg_input_is_valid("structureIds", 'jsonb') THEN "structureIds"::jsonb ELSE 'null'::jsonb END AS ids FROM "ContentItem"
)
SELECT id FROM parsed WHERE jsonb_typeof(ids) IS DISTINCT FROM 'array';

WITH parsed AS (
  SELECT id, CASE WHEN pg_input_is_valid("structureIds", 'jsonb') THEN "structureIds"::jsonb ELSE 'null'::jsonb END AS ids FROM "ContentItem"
)
SELECT p.id AS "contentItemId", v.value AS reference
FROM parsed p CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(p.ids)='array' THEN p.ids ELSE '[]'::jsonb END) v
LEFT JOIN "Structure" s ON s.id=(v.value #>> '{}')
WHERE jsonb_typeof(v.value)<>'string' OR s.id IS NULL;
