# Migraciones y recuperación de Marketing OS

Actualizado: 09/09/2026. Aplicable a PostgreSQL; no usar SQLite ni `db push` para actualizar producción.

## Estado de esta entrega

**Actualización:** línea base registrada, ambas migraciones aplicadas y despliegue
de producción Ready el 09/09/2026. Se verificaron las copias reales de Neon y la
conservación de los datos. `main` tiene nuevamente habilitado el despliegue.
El procedimiento siguiente conserva la secuencia de operación y recuperación.
Los identificadores, las comprobaciones y los recorridos funcionales aún pendientes
están en [el acta de activación](activacion-produccion-2026-09-09.md).

Durante la integración, `vercel.json` desactivó temporalmente el despliegue de
`main`. Se retiró `main: false` después de verificar las migraciones. Las ramas
de ensayo siguen pausadas. No interpretar futuros merges como migraciones.

El primer CI de GitHub pasó 77 pruebas, pero falló al escribir el informe del ensayo porque `.audit/` no existe en un checkout limpio. El ensayo ahora crea su directorio de salida antes de trabajar. CI se ejecuta en pull requests y en pushes a `main`, evitando dos ejecuciones equivalentes por cada actualización de este pull request.

## Archivos que se ejecutan

1. `prisma/migrations/00000000000000_baseline/migration.sql`: creación de las 24 tablas existentes, con sus columnas, índices y restricciones. Incluye la seguridad ya aplicada en la entrega 1–2. En una base existente compatible **se registra como aplicada; no se ejecuta su CREATE TABLE**.
2. `prisma/migrations/20260909190000_weekly_consistency/migration.sql`: período y plataforma de métricas, retención nullable, nueva unicidad, referencias de agenda/arquetipos, revisiones y reglas de archivos y guion/video.

3. `prisma/migrations/20260909220000_jobs_private_storage_decimal/migration.sql`: trabajos durables, inventario Blob, cuotas, importes decimales y plataformas normalizadas. Rechaza datos históricos que requieran redondeo o tengan plataformas inválidas.

La segunda migración es transaccional y tiene límites de espera de bloqueo y ejecución.
El preflight aborta ante arquetipos inexistentes, eventos con videos inexistentes o guiones
vinculados a videos de otra marca o estructura. No corrige datos ambiguos automáticamente.

## Comprobación de la base existente

Exportar `DATABASE_URL` únicamente en el proceso que ejecutará las operaciones, usando la
conexión de la base elegida. No imprimir ni guardar esa cadena en Git, capturas o informes.

```bash
npm run db:baseline
npm run db:integridad
```

Ambos comandos son de consulta. El primero exige la huella
`e67c1e9746d69db1e2b68d5301bcd28f`, comparada con Neon el 09/09/2026. Si difiere,
detenerse e inspeccionar la diferencia; no cambiar la huella para silenciar el error.
La huella compara columnas, tipos, defaults, nulabilidad, índices, restricciones y cantidad
de triggers de las tablas públicas. No es una auditoría completa de roles, RLS, vistas o
cuerpos de funciones. La tabla de historial de Prisma queda excluida.

El chequeo de integridad devuelve conteos de arquetipos/videos faltantes, vínculos
inconsistentes y archivos huérfanos. Los cuatro fueron cero en la consulta de Neon del 09/09.
Repetirlo antes de la operación, porque la producción sigue cambiando.

## Ensayo antes de producción

Usar una rama o copia aislada de la base real y un despliegue de prueba que apunte únicamente
a esa copia. No compartir la DB de producción con un preview que haga escrituras.
Preparar un respaldo nuevo, registrar su fecha y comprobar que se puede restaurar.

El ensayo automatizado local disponible es:

```bash
npm run db:ensayo
```

Requiere PostgreSQL local, capacidad de crear bases efímeras y herramientas `psql`, `pg_dump`
y `pg_restore` compatibles con la versión del servidor. `PG_TEST_CONTAINER` permite usar
esas herramientas dentro de un contenedor PostgreSQL local existente. El script crea y elimina
solo sus dos bases de prueba, valida rollback del preflight y conserva métricas antiguas.
Restaura un dump real y compara contenido de las 29 tablas resultantes y la huella del esquema.

Ese ensayo pasó con fixtures; **no sustituye restaurar una copia de los datos de producción**.
No borrar un respaldo al terminar el despliegue hasta completar la validación y la retención acordada.

## Actualización coordinada de una instalación existente

La unicidad anterior era `(contentItemId, date)`. La nueva es
`(contentItemId, date, platform, period)`. La versión anterior usa un upsert que depende del
índice antiguo, y las revisiones nuevas requieren formularios actualizados.
Por ello esta entrega necesita una ventana breve con las escrituras detenidas; no es una
migración compatible con mantener versiones viejas y nuevas escribiendo a la vez.

1. Terminar CI, preparar la compilación nueva y comprobarla contra una copia migrada. Identificar el despliegue exacto que se va a promover y guardar el anterior.
2. Preparar un respaldo reciente y verificar su recuperación. Detener efectivamente el acceso de escritura, incluidas pestañas antiguas, integraciones y URLs antiguas del despliegue. Avisar a las personas no reemplaza este control. Si no hay un mecanismo efectivo de mantenimiento, preparar primero uno o rediseñar la migración como expansión/contracción compatible.
3. Repetir `db:baseline` y `db:integridad` sobre la base elegida.
4. Registrar la línea base una sola vez:

   ```bash
   npm run db:baseline -- --record
   ```

5. Aplicar las migraciones pendientes desde el mismo commit que la compilación preparada:

   ```bash
   npm run db:migrate
   npx prisma migrate status
   npm run db:integridad
   ```

6. Promover el código nuevo y comprobar inicio de sesión, lectura de fichas históricas, alta/corrección semanal, CSV parcial, conflicto de edición, auditoría y agenda. Usar registros de prueba identificados y acordados; no alterar arbitrariamente registros reales.
7. Reabrir las escrituras y pedir a quienes tenían la aplicación abierta que recarguen sus formularios. Registrar commit, despliegue, resultado de migración y controles ejecutados.

No poner migraciones destructivas ni seeds en `postinstall` o `build`: un preview o una
compilación repetida no debe modificar la base real. El workflow de CI de esta entrega prueba
las migraciones en PostgreSQL efímero; no despliega ni posee credenciales de Neon/Vercel.

## Fallo y recuperación

### Control de escrituras durante esta actualización

`prisma/operations/deployment-gate.sql` instala un control operativo cerrado en
`intia_ops`, separado del esquema de negocio. Primero registrar la línea base:
los triggers de este control cambian la huella del esquema público. La conexión
de mantenimiento debe declarar `application_name=intia-migrator-20260909`.

Los clientes de la nueva aplicación declaran `application_name=intia-schema-20260909`
mediante `database-url.ts`. El control permite lecturas y rechaza INSERT, UPDATE,
DELETE y TRUNCATE mientras está cerrado. Al abrirlo, sigue rechazando escrituras
de versiones anteriores, incluidas sus URLs y sesiones ya conectadas. El marcador
de versión es una medida de compatibilidad de despliegue, no aislamiento multitenant
ni autorización frente al propietario de la base.

La fila de control se bloquea de forma compartida durante cada transacción de
escritura; cerrar el control espera a los escritores en curso. Instalarlo de nuevo
después de migrar protege también las tablas recién creadas sin reabrir las escrituras.
Tomar el respaldo definitivo con el control cerrado, antes de aplicar migraciones.
Tras verificar la versión nueva, la conexión de mantenimiento puede abrirlo con:

```sql
UPDATE intia_ops.deployment_gate SET blocked = false WHERE singleton;
```

Para cerrarlo, usar `blocked = true`. El respaldo tomado durante mantenimiento
también conserva el control cerrado: antes de reabrir una restauración hay que
verificar su esquema y configurar la versión compatible; no basta con cambiar DNS.
La suite PostgreSQL `deployment` comprueba cierre, reapertura, clientes antiguos,
TRUNCATE y espera de transacciones en curso. No añade consultas a las lecturas.

- Si falla el preflight, PostgreSQL revierte la migración completa. Prisma puede dejar un intento fallido en su historial: inspeccionar primero y registrar su rollback con `prisma migrate resolve --rolled-back 20260909190000_weekly_consistency` solo después de confirmar que no hubo cambios persistidos. Corregir la causa de forma revisada antes de reintentar.
- Si falla el código después de migrar, mantener cerradas las escrituras mientras se decide. **No promover automáticamente la versión anterior sobre el esquema nuevo.**
- Una vez existen varias plataformas en una misma semana, volver al índice de dos columnas ya no representa los datos. Priorizar una corrección hacia adelante. Restaurar un respaldo requiere un destino aislado, comprobarlo y planificar cómo conservar las escrituras posteriores; no descartarlas automáticamente.
- No ejecutar `db:reset`, `db:seed` ni `db push` como recuperación de producción.

## Instalación nueva y demo

En una base vacía, `npm run setup` genera Prisma y aplica ambas migraciones. El primer dueño
se crea con el bootstrap protegido. `npm run db:seed` es opcional y solo admite una conexión
PostgreSQL local exportada explícitamente. Las cuentas, marcas y métricas de demo no se cargan
automáticamente al instalar, compilar o desplegar.

## CI y medición posterior

El workflow valida instalación desde lockfile, dependencias, lint, tipos, pruebas, migración,
restauración, build y navegación. Su prueba de navegador usa una ronda para detectar fallos,
sin presentar p95 estadísticos. Activar la comprobación obligatoria de este workflow en las
reglas de la rama al publicarlo; esa configuración de GitHub no fue cambiada en esta entrega.

Para una medición local completa, después de `npm run build`, exportar una conexión local,
`BENCH_SAMPLES=30` y, opcionalmente, `BENCH_DETAILS=1`, y ejecutar `npm run perf:local`.
El script crea su propia base efímera, ejecuta un navegador de prueba independiente y guarda
resultados en `.audit/`. No acepta un host remoto ni usa el navegador personal.

Después de publicar, medir al menos 30 transiciones por ruta y condición, manteniendo separados
clics continuos, historial, primera carga y regreso tras inactividad. Correlacionar logs de la
misma versión/entorno con el identificador del render; no sumar consultas paralelas como si
fueran la duración del usuario. Para atribuir una demora al despertar de Neon hay que verificar
el estado del compute: un período sin clics no prueba por sí solo que la DB se haya suspendido.

## Activación de trabajos y archivos privados

La configuración y los límites están documentados en [la entrega 1, 3 y 4](implementacion-1-3-4-2026-09-09.md).
Tras cambiar columnas o tipos, reiniciar las instancias que conservan sentencias preparadas.
El ensayo reconecta explícitamente al pasar de un esquema al siguiente.

Un rollback de la aplicación al código previo a esta entrega deja de ser compatible con
archivos cuyo `data` ya sea NULL. Antes de volver a esa versión, restaurar los bytes verificados
en PostgreSQL o usar una compilación de reversión que conserve el lector privado.
No borrar el almacén Blob ni sus claves mientras existan adjuntos que lo referencien.
