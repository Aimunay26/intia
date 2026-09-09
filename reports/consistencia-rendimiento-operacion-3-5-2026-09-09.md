# Entrega 3, 4 y 5: consistencia, rendimiento y operación

Fecha: 09/09/2026. Repositorio: `conamormarket-lgtm/intia`.

## Estado y alcance

Esta entrega implementa en el código local las reglas de consistencia del punto 3, la
instrumentación y evaluación local del punto 4, y las migraciones, ensayo de recuperación y CI
del punto 5. No ha aplicado SQL nuevo ni desplegado esta versión en producción.

El punto 4 no se considera cerrado en producción: todavía hay que medir la versión desplegada
y separar condiciones de navegador, red, funciones y compute de Neon. El ensayo de recuperación
local tampoco equivale a restaurar un respaldo de los datos reales.

La autorización por organización, membresías y aislamiento multitenant siguen siendo otra
entrega. El selector de marca no se convierte en una frontera de seguridad con estos cambios.

## 3. Consistencia del backend

### Contrato semanal confirmado por el usuario

Se registran **solo los resultados obtenidos durante la semana**, de lunes a domingo en
America/Lima. No se introducen cifras acumuladas desde la publicación del video.

| Video | Lunes | Plataforma | Vistas de esa semana |
|---|---|---|---:|
| Video A | 2026-09-07 | TIKTOK | 100 |
| Video A | 2026-09-07 | INSTAGRAM | 200 |
| Video A | 2026-09-14 | TIKTOK | 50 |

El total es 350; TikTok aporta 150 e Instagram 200. Una corrección de la primera fila a 120
reemplaza sus 100 y deja un total de 370; no añade otra fila ni otro acumulado de 120.

- `Metric.period=WEEKLY`, con el lunes normalizado a las 12:00 UTC para representar una fecha civil estable. La plataforma pertenece al registro de métricas, aunque el video esté publicado en varias redes.
- Unicidad por video/lunes/plataforma/período. El alta manual duplicada se rechaza; para corregir se abre la fila existente con su revisión.
- CSV requiere semana y plataforma. Reimportar actualiza únicamente columnas enviadas; vacío conserva y cero explícito reemplaza. Límite de 500 filas y 1 MB por lote, con errores por fila. Cada fila aceptada y su auditoría comparten transacción; el lote completo puede tener resultados parciales.
- `retention3s=null` significa desconocido, 0 es una observación válida y 0.5 significa 0.5 %, no 50 %. El promedio excluye nulos e incluye ceros. Se etiqueta como media por registro, sin ponderación inventada.
- Los filtros de métricas se amplían a semanas completas. El panel y su enlace usan el mismo período; una semana que cruza mes no se reparte artificialmente entre días.
- Contenido, panel, comparación, ranking, tendencia y desglose por plataforma usan solo `WEEKLY`. No atribuyen las mismas vistas a todas las plataformas del video.

Los registros anteriores conservan valores, fechas e identificadores como
`LEGACY`/`UNATTRIBUTED`. Se muestran como históricos en la ficha, separados de los totales
semanales. No se migran por deducción a una semana o plataforma: faltaría evidencia del origen.
Un total semanal inicialmente vacío después de actualizar no significa pérdida de históricos.

### Validación y fechas

Se centralizaron fechas estrictas, horas, enums y números finitos/rangos. No se aceptan días
imposibles, horas fuera de rango, negativos en métricas, fracciones en contadores ni estados
inventados. Las fechas civiles se interpretan en Lima de forma independiente del TZ del servidor.
Agenda comprueba que el final no anteceda al inicio y exige un instante válido al editar.
Las escenas rechazan JSON inválido y duraciones inconsistentes, en lugar de convertir una
entrada defectuosa en una lista vacía. Estructuras y arquetipos validan sus catálogos y rangos.

### Transacciones, auditoría y edición simultánea

Las escrituras críticas de contenido, guiones/escenas, tareas/columnas, marcas/objetivos,
agenda, estructuras, arquetipos, métricas, ajustes y extracción de branding usan transacciones
para confirmar datos y auditoría juntos. La autorización se verifica dentro de la transacción.
La generación externa ocurre antes de entrar en la transacción; las invalidaciones se ejecutan
después del commit. No se hacen reintentos automáticos de una edición de usuario que entra en conflicto.

Los formularios principales envían la revisión que estaba cargada al empezar a editar.
La DB mantiene `updatedAt` monotónico aun para actualizaciones muy seguidas. Una revisión
antigua se rechaza; el formulario conserva el borrador y el tablero revierte el movimiento
optimista fallido. La protección se aplica a las acciones con `lockRevision`, no a cada
operación auxiliar de la aplicación. Una reimportación CSV es una corrección explícita de los
campos enviados y no utiliza la revisión de un formulario abierto.

Los cambios de estado se auditan con valores de columna, no etiquetas. La resecuenciación
de un guion registra también escenas afectadas y duración total. Cambiar ajustes y secretos
se revierte si falla la auditoría, pero el valor de una clave o contraseña nunca entra al log.

### Referencias y archivos

- La DB y el backend rechazan guion/video de marcas incompatibles. Un video vinculado hereda la estructura de su guion; cambiarla propaga la nueva estructura y desvincular o borrar el guion limpia la referencia heredada.
- Se agregan referencias reales de `Script.archetypeId` y `CalendarEvent.contentItemId`, con `ON DELETE SET NULL`.
- Los archivos polimórficos verifican que exista su dueño. Un bloqueo del padre protege frente a una subida concurrente con su eliminación. Triggers eliminan archivos al borrar dueños, incluso cuando el video se borra por cascada de marca.
- El comando `db:integridad` detecta referencias rotas y archivos huérfanos mediante conteos SQL. No borra automáticamente archivos históricos.

## 4. Rendimiento: medición reproducible

El cronómetro ahora separa primera carga, clic, historial e inactividad; cancela el intento
anterior al elegir otra ruta o volver a la todavía visible. Los callbacks antiguos no cierran
una medición nueva. El regreso con historial se registra aunque Next haya actualizado la ruta
antes del listener. `?medir=0` permite apagar la instrumentación en ese navegador.

Cada render instrumentado lleva un identificador que permite relacionar la navegación con
fases y consultas del mismo entorno y versión. El reporte identifica contenido renderizado
antes del clic y separa cancelaciones de fallos. Solo calcula p95 cuando hay 30 muestras como
mínimo por grupo. No se registran SQL, parámetros, correos ni valores de los registros en estos logs.

La prueba usa `next build`/`next start`, Chromium independiente y PostgreSQL 18 local con
6 marcas, 60 videos, 600 métricas semanales y 150 tareas. Genera clics reales en diez rutas
de la navbar y repite atrás/adelante en dos rutas. La disponibilidad del contenido se comprueba
en el DOM durante dos frames, separándola de la respuesta visual y del cambio de ruta.

| Condición / ruta | n | Visual p50 (ms) | Contenido p50 (ms) | Contenido p95 (ms) |
|---|---:|---:|---:|---:|
| Clic continuo / /contenido | 30 | 12.8 | 347 | 363 |
| Clic continuo / /tareas | 30 | 12.8 | 363 | 369.3 |
| Clic continuo / /metricas | 30 | 12.5 | 347.3 | 366.5 |
| Clic continuo / /guiones | 30 | 12.5 | 346.3 | 362.6 |
| Clic continuo / /marcas | 30 | 12.6 | 346.4 | 363.7 |
| Clic continuo / /calendario | 30 | 12.4 | 345.6 | 362.9 |
| Clic continuo / /estructuras | 30 | 12.6 | 346 | 363.2 |
| Clic continuo / /arquetipos | 30 | 12.7 | 346 | 363.7 |
| Clic continuo / /equipo | 30 | 12.4 | 345.9 | 361.6 |
| Clic continuo / / | 30 | 12.5 | 646.3 | 663.5 |
| Historial / /equipo | 30 | 14 | 28.5 | 29.5 |
| Historial / / | 30 | 16.5 | 28.4 | 30.3 |

362 muestras: 300 clics, 60 transiciones de historial y dos cargas iniciales. Ningún fallo de navegación. Se relacionaron 361 muestras con logs del servidor; la ficha de detalle no tiene marcador de render. Las dos cargas iniciales tienen n=1 cada una, por lo que no se calcula p95.

Estos resultados no son una comparación antes/después de producción ni una prueba de carga
con usuarios concurrentes. La respuesta local del servidor no representa la latencia Vercel–Neon.
Las fases pueden solaparse: no deben sumarse como si todas bloquearan secuencialmente el navegador.

### Evaluación de precarga y próximos controles

Se realizaron 30 aperturas por sección con la precarga automática de Next Link, listado recién abierto y caché del navegador conservada. Esta medición termina al aparecer el formulario durante dos frames; no mide la carga completa de todas las secciones de la ficha.

| Ficha | n | Formulario p50 (ms) | Formulario p95 (ms) |
|---|---:|---:|---:|
| contenido | 30 | 361.3 | 844.5 |
| guiones | 30 | 361.8 | 845.5 |

Se observaron solicitudes anteriores al clic hacia la ficha seleccionada en 4/30 aperturas de contenido y 2/30 de guiones. Esto confirma actividad de precarga, pero no que se hubiera cargado toda la ficha ni que se ahorraran consultas SQL. No se hizo una comparación A/B con precarga forzada; estos resultados no justifican activarla masivamente.

La implementación instalada de React contiene una espera de 300 ms relacionada con la
presentación de fallbacks (`globalMostRecentFallbackTime` en el bundle de React DOM incluido
en Next). La separación observada entre servidor y contenido visible es compatible con que
Suspense contribuya a esa demora; **no prueba por sí sola una causa única**, y no se modificaron
internos de React. El siguiente experimento debe comparar los límites de Suspense del panel
con el mismo conjunto de datos y red, verificando tanto primer bloque como contenido completo.

Se conserva la política automática de precarga de las fichas; no se habilitó `prefetch=true`
en todas las filas ni se aplicaron índices o cachés adicionales sin una comparación equivalente.
Para cerrar la evaluación real faltan muestras de la versión publicada: al menos 30 por ruta
y condición, con estado del compute verificado en la condición fría. No confundir una pestaña
inactiva con una DB suspendida, ni extrapolar fixtures locales a producción.

## 5. Operación, migraciones y CI

La línea base se generó a partir del esquema real existente y se contrastó mediante consultas
de solo lectura en Neon. Coinciden las 24 tablas públicas bajo la comparación documentada en
`prisma/operations/schema-fingerprint.sql`. Se excluyeron dos índices candidatos de tareas que
aparecían en el esquema local anterior pero no estaban instalados en producción.

La consulta actual de integridad en Neon dio cero en las cuatro categorías de referencias y
huérfanos. Es una observación de ese momento, no una garantía permanente ni una evaluación de RLS.

El ensayo local ejecutó el SQL anterior, provocó un preflight inválido y comprobó rollback
completo, aplicó la migración válida y verificó que una métrica histórica conservaba sus valores.
Después ejecutó `pg_dump`/`pg_restore` y comparó filas de las 24 tablas y la huella del esquema.
No se restauraron datos de producción en este ensayo.

El workflow de GitHub instala desde lockfile, audita dependencias, ejecuta lint, tipos, pruebas,
migración/recuperación, build y una prueba funcional de navegador. Usa PostgreSQL efímero,
no credenciales de producción. Una ronda en CI verifica comportamiento, sin generar p95 válidos.
El workflow todavía debe publicarse y observarse ejecutando en GitHub.

`setup` ahora aplica migraciones sin demo. Seed, reset y `db push` requieren PostgreSQL local
explícito y rechazan Vercel/conexiones remotas. El build no aplica SQL. Se agregaron overrides
de dependencias transitivas y se validó el cliente Prisma y la compilación con el lockfile resultante.

El [procedimiento de migraciones](operacion-migraciones.md) detalla respaldo, registro de línea
base, despliegue coordinado, validación y recuperación. La migración cambia una clave que utiliza
el código antiguo: antes de producción hace falta un control efectivo de escrituras o una
migración compatible en varias etapas. No basta con promover la versión antigua para deshacerla.

## Validación de la entrega

| Comprobación | Resultado local |
|---|---|
| Unitarias | 26 aprobadas |
| PostgreSQL real | 36 aprobadas: seguridad 13, navegación 8, demo 3, consistencia 12 |
| Tipos y compilación Next | Aprobados en build de producción |
| ESLint | 0 errores; 67 advertencias de variables/importaciones sin uso |
| `npm audit` | 0 vulnerabilidades reportadas en el lockfile comprobado |
| Migración y restauración con fixture | 24 tablas recuperadas; datos y huella coinciden |
| Edición concurrente en navegador | Rechaza sobrescritura y conserva el borrador |
| Neon de producción | Solo lectura: esquema e integridad; no SQL de actualización |

Las pruebas incluyen filas semanales duplicadas, separación por plataforma, retención nula/cero,
CSV parcial, fechas inválidas, dos ediciones con la misma revisión, fallo intencional de auditoría,
resecuenciación de escenas, protección de claves, herencia de estructura y borrado de archivos por cascada.

Evidencia versionada: `neon-integridad-2026-09-09.json`, `migracion-ensayo-2026-09-09.json`,
`medicion-local-3-5-2026-09-09.json` y `precarga-local-3-5-2026-09-09.json`. Los logs completos,
capturas y datos de fixture de las pruebas quedan en `.audit/`, excluidos de Git.
