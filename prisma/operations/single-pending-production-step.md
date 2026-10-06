# Un solo paso secuencial pendiente por vídeo

La migración `20261006230000_single_pending_production_step` crea el índice único parcial
`ProductionStep_one_pending_sequential_key` sobre `contentItemId` cuando
`status = 'PENDIENTE' AND step <> 'DISENO'`. Abarca cualquier origen o clave de automatización,
incluidas las marcas archivadas. Permite diseños paralelos y conserva el historial cerrado.

## Aplicación

1. Mantener apagada la automatización hasta el arranque operativo autorizado. Conservar un
   respaldo y ejecutar `preflight-single-pending-production-step.sql` en la base destino.
   Debe devolver cero filas. Si devuelve duplicados, resolver cada uno con decisión humana,
   conservar su historial y repetir la consulta; no archivarlos para intentar evitar el control.
2. Desplegar **primero el código compatible**: ahora se cierra el paso anterior antes de abrir
   el siguiente dentro de la misma transacción. El código anterior puede intentar crear dos
   pasos pendientes transitoriamente y fallaría con el índice instalado.
3. Aplicar las migraciones pendientes con el procedimiento de despliegue del proyecto.
   Esta migración bloquea escrituras en `ProductionStep` mientras valida y crea el índice;
   espera como máximo 5 segundos por el bloqueo y limita cada sentencia a 60 segundos.
   Si falla, inspeccionar el error y el registro de migraciones antes de reintentar. No marca
   ni cancela filas por su cuenta.
4. Confirmar cero duplicados y el índice válido y único:

   ```sql
   SELECT i.indisunique, i.indisvalid, pg_get_indexdef(i.indexrelid)
   FROM pg_index i
   WHERE i.indexrelid = to_regclass('public."ProductionStep_one_pending_sequential_key"');
   ```

5. Ejecutar el recorrido de navegador en una marca QA autorizada, con sesiones de los
   distintos perfiles. Comprobar tareas, revisiones, fechas, casting, preparación y diseño
   paralelo después de recargar. Archivar la marca y retirar sus accesos temporales al cerrar.
   Esta prueba y el encendido operativo son pasos distintos.

## Reversión

No volver al código que abre el siguiente paso antes de cerrar el anterior mientras exista
este índice. Si fuese imprescindible revertir ese código, retirar primero solo el índice
mediante una reversión controlada, con automatización detenida y su correspondiente registro
de migración. Retirar el índice no cambia filas, pero elimina la protección de unicidad.
No editar una migración ya aplicada ni marcarla como resuelta sin comprobar el estado real.

## Evidencia local

`tests/postgres-single-pending-step.test.mjs` prueba inserciones/actualizaciones, concurrencia,
diseños paralelos, archivo e integridad transaccional. `scripts/rehearse-migration.mjs`
verifica el rechazo de duplicados sin cambios de datos, la instalación sin alterar filas y
la conservación del índice tras respaldo/restauración. El recorrido de acciones reales está
en `tests/postgres-integrated-production.test.mjs`.
