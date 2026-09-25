# Publicar B11–B20

**Pendiente de ejecutar en Neon/Vercel.** El ensayo local no certifica producción. Esta entrega cambia columnas, crea `MetricImportBatch` y usa el identificador de escritura `intia-completion-20260924`.

> Esta rama incorpora también B22. Aplicar la [preparación de cifrado y activación final B22](implementacion-b22-2026-09-24.md): el escritor final es `intia-secrets-20260925`. Las instrucciones siguientes conservan el procedimiento propio de B11–B20.

## Preparación

1. Revisar y publicar el commit; verificar CI antes de promoverlo. Evitar una promoción automática antes de migrar y activar el nuevo escritor.
2. Confirmar respaldo reciente y restauración en una rama temporal autorizada de Neon, con los límites gratuitos acordados. No crear planes ni recursos de pago.
3. Ensayar `20260924180000_backend_completion` en esa copia. Comparar objetivos existentes (deben quedar `MANUAL`), matching histórico intacto y valores monetarios. La retención debe continuar apagada salvo configuración previa explícita.
4. Revisar espacio y planes de los tres índices. Para tablas grandes, construirlos primero con `CREATE INDEX CONCURRENTLY`, fuera de una transacción. Los dos de Tareas están en `prisma/operations/navigation-indexes.sql`; el tercero es:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ContentItem_scriptId_idx"
  ON "ContentItem" ("scriptId");
```

`IF NOT EXISTS` no valida un índice. Consultar `pg_index.indisvalid`, `indisready` y `pg_get_indexdef`. La migración compara la definición exacta y aborta ante una discrepancia; no borra ni sustituye índices ajenos automáticamente. Incluye `lock_timeout=5s` y `statement_timeout=60s`.

## Activación controlada

Usar la conexión de operación existente con `application_name=intia-migrator-20260909`, sin imprimir credenciales. Los siguientes pasos deben ejecutarse en orden, conservando el control cerrado mientras se migra/promueve:

1. Cerrar `intia_ops.deployment_gate.blocked=true`; esperar a los escritores que ya estaban activos. Pausar/revisar trabajos en ejecución, sin borrar sus entradas ni respuestas.
2. Ejecutar `prisma migrate deploy` con la conexión de operación. Verificar el recibo de la migración.
3. Ejecutar `prisma/operations/deployment-gate.sql` otra vez para instalar la guarda en `MetricImportBatch`. Reinstalarla no vuelve a abrir escrituras.
4. Ejecutar `prisma/operations/activate-backend-completion.sql`. Exige migración terminada y escrituras cerradas; selecciona la nueva versión, conserva sesiones y no abre el control.
5. Desplegar/promover el commit probado. Comprobar que las conexiones de la nueva aplicación usan `intia-completion-20260924`.
6. Abrir escrituras explícitamente; probar un cambio reversible y su auditoría. Un deployment antiguo debe quedar rechazado al escribir.
7. Verificar las pruebas de humo funcionales indicadas abajo y anotar SHA, deployment y resultados en el plan.

Si falla un paso, mantener escrituras cerradas y diagnosticar el error. No marcar una migración fallida como aplicada sin verificar rollback. No restaurar un backup sobre escrituras posteriores. Revertir el código exige también decidir qué escritor admite la guarda; los clientes antiguos desconocen objetivos automáticos y lotes nuevos. No retirar columnas/tablas como rollback improvisado.

## Comprobaciones después de publicar

- Analista: filtros/series/ranking solo de marcas autorizadas; CSV de fixture controlado, cerrar/reabrir y reanudar sin duplicaciones.
- Estrategia: crear objetivo automático de un período conocido y compararlo con métricas; editar formatos previstos y verificar conservación.
- Producción: cambiar grabación en video abierto; el resto de planificación sigue fuera de sus permisos. Un video cerrado requiere reapertura.
- Adjuntos: navegar página siguiente, editar texto bajo demanda y confirmar que una revisión obsoleta no pisa otro cambio.
- Ajustes: retención desactivada; vista previa sin mutación. Probar guardar apagada si se quiere verificar revisión/auditoría, sin habilitar limpieza.
- IA: comprobar etapa/modelo/cupo sin llamar al proveedor. Una generación real requiere el cupo y la autorización ya acordados para los datos concretos.
- Mantenimiento: revisar resultado por paso y alerta de antigüedad; mantener el cron diario. No activar limpiezas o subir cuotas durante el despliegue.

La prueba de arranque seguro incluida en `npm test` requiere `npm run build` previo. CI compila antes de ejecutarla. Comandos locales de aceptación: `npm test`, `npm run test:postgres`, `npm run db:ensayo`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:workflow` y `npm run test:perfiles`. Los runners PostgreSQL exigen una conexión local y crean bases efímeras; no deben apuntarse a Neon.
