-- PostgreSQL: ejecutar cada sentencia fuera de una transacción.
-- Operación aditiva; no sustituye un baseline de migraciones Prisma.
-- Validar primero EXPLAIN y espacio disponible en la DB de destino.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Task_columnId_order_id_idx"
  ON "Task" ("columnId", "order", "id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Task_columnId_brandId_order_id_idx"
  ON "Task" ("columnId", "brandId", "order", "id");

-- Tras un fallo/interrupción, verificar pg_index.indisvalid. IF NOT EXISTS
-- no repara un índice inválido ni verifica su definición.
