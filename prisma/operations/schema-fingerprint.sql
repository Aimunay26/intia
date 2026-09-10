-- Solo lectura: compara tablas, columnas, índices, restricciones y triggers de public.
-- No incluye filas, credenciales, datos de aplicación ni esquemas administrados por Neon.
SELECT md5(jsonb_agg(jsonb_build_object(
  'table', c.relname,
  'columns', (SELECT md5(string_agg(a.attname || ':' || format_type(a.atttypid,a.atttypmod) || ':' || a.attnotnull::text || ':' || COALESCE(pg_get_expr(d.adbin,d.adrelid),''), '|' ORDER BY a.attname)) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
  'indexes', (SELECT md5(string_agg(pg_get_indexdef(i.indexrelid),'|' ORDER BY pg_get_indexdef(i.indexrelid))) FROM pg_index i WHERE i.indrelid=c.oid),
  'constraints', (SELECT md5(string_agg(pg_get_constraintdef(k.oid),'|' ORDER BY pg_get_constraintdef(k.oid))) FROM pg_constraint k WHERE k.conrelid=c.oid AND k.contype <> 'n'),
  'triggers', (SELECT count(*) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal)
) ORDER BY c.relname)::text) AS schema_fingerprint
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND c.relname <> '_prisma_migrations';
