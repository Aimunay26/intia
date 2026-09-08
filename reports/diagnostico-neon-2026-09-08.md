# Diagnóstico de Neon y conexión de Vercel

Fecha: 8 de septiembre de 2026, aproximadamente 18:29–18:41 de Lima. Consulta autorizada de solo lectura en la consola Neon y en Vercel. Complementa [O01–O07](./implementacion-o01-o07-2026-09-08.md).

## Resultado

La región y el endpoint agrupado están alineados con Vercel. Neon suspende el cómputo tras cinco minutos sin actividad; estaba suspendido al comenzar y pasó a activo después de las consultas. Esto confirma una condición que puede afectar el primer acceso tras una pausa. No mide el coste de esa reactivación en la aplicación ni explica por sí sola una espera en todas las transiciones.

Con el volumen actual, las consultas SQL examinadas son rápidas. No hay evidencia suficiente para cambiar de región, aumentar el cómputo, fijar un pool mayor, activar caché persistente o aplicar los índices candidatos de Tareas para corregir el segundo de espera. El siguiente paso es desplegar el segundo lote y correlacionar clic, respuesta RSC, fases del servidor y DB. Este diagnóstico no sustituye esa comparación.

## Configuración comprobada

| Elemento | Evidencia leída |
|---|---|
| Recurso / rama | Proyecto Neon conectado a intia; una rama `main`, predeterminada |
| Región Neon | AWS US East 1, N. Virginia (`us-east-1`) |
| Región Vercel | `iad1`, confirmada en la revisión previa de Functions; ubicación regional compatible con la DB |
| Motor | PostgreSQL `18.6 (c5250a2)`; zona SQL `GMT` |
| Cómputo | Primario, mínimo y máximo 0,25 CU, aproximadamente 1 GB RAM |
| Suspensión | Cinco minutos de inactividad; la consola requiere cambiar de plan para configurar ese intervalo |
| Estado inicial | SUSPENDED; la consola indicaba que se había suspendido aproximadamente una hora antes |
| Estado durante diagnóstico | Active después de ejecutar SELECT |
| Límites que muestra Neon | 105 conexiones directas y 10.000 conexiones de clientes del pool |
| Parámetro PostgreSQL | `max_connections=112`; no equivale al número de conexiones utilizables por la aplicación ni a capacidad de consultas simultáneas |
| Tamaño mostrado por el proyecto | 36,89 MB; las métricas de uso de la consola pueden tener retraso |
| Retención de historial | Seis horas, según Project dashboard; no se probó restauración |

Fuentes de interfaz: [Dashboard Neon](https://console.neon.tech/app/projects/mute-violet-04232921), [Computes](https://console.neon.tech/app/projects/mute-violet-04232921/branches/br-old-water-au8cuoqk/computes), [Functions de Vercel](https://vercel.com/conamors-projects/intia/settings/functions).

En [variables de Vercel](https://vercel.com/conamors-projects/intia/settings/environment-variables), `DATABASE_URL` y `DATABASE_URL_UNPOOLED` son administradas por Neon para Production y Preview, añadidas el 3 de septiembre. Se contrastaron únicamente metadatos de `DATABASE_URL`: coincide con el endpoint primario agrupado de la rama examinada y con su base `neondb`; incluye `sslmode=require` y `channel_binding=require`.

La URL configurada no trae `connection_limit`, `pool_timeout`, `connect_timeout` ni `pgbouncer`. El código del commit publicado `051a957` añade `pgbouncer=true` al detectar el endpoint `-pooler`; la segunda entrega conserva ese comportamiento con detección sobre el hostname. La búsqueda `DB_` en las variables del proyecto no devolvió resultados. No se midió desde el proceso de Vercel el tamaño efectivo de su pool ni una espera de adquisición de conexión.

La contraseña y la URL completa no se copiaron al informe, archivos ni resultados del diagnóstico. El valor de Vercel volvió a ocultarse después de contrastar los metadatos. No se modificó ninguna variable.

## Volumen e índices reales

Conteos exactos obtenidos mediante SELECT, sin recuperar contenido de los registros:

| Tabla | Filas |
|---|---:|
| Task | 1 |
| TaskColumn | 5 |
| Metric | 38 |
| ContentItem | 15 |
| Archetype | 10 |
| User | 8 |

Se confirmaron los índices existentes de Contenido por marca/fecha, fecha y estado; en Métricas, el índice por fecha y el único por video/fecha; en Tareas, los índices individuales por columna, responsable, marca, tipo y orden. Los dos índices compuestos candidatos de la segunda entrega no están aplicados. La consulta de `pg_index` no encontró índices inválidos en `public`.

La instantánea de `pg_stat_activity` para la base mostró una conexión activa, que incluye el diagnóstico. No caracteriza la concurrencia habitual ni demuestra ausencia de saturación bajo carga.

## Consultas y tiempos

El editor SQL ejecutó SELECT de metadatos/conteos y tres EXPLAIN ANALYZE de SELECT acotados. No se ejecutó el ejemplo de CREATE/INSERT que trae el editor, ni DDL, semillas, cambios de datos, resets o extensiones.

| Consulta | Ejecución SQL | Planificación | Tiempo mostrado por el editor |
|---|---:|---:|---:|
| Página de Tareas, columna con la tarea existente, orden/id y límite 51 | 0,784 ms | 15,714 ms | 165 ms |
| Serie diaria de Métricas, últimos 30 días, unión con Contenido | 0,341 ms | 2,454 ms | 135 ms |
| Ocho entradas recientes de AuditLog, campos resumidos | 0,082 ms | 0,326 ms | 106 ms |

Son observaciones puntuales, no percentiles ni resultados posteriores a una optimización. El tiempo del editor incluye una ruta de acceso distinta a Vercel→Neon; no se usa como latencia de navegación. La consulta inicial de configuración/conteos mostró 236 ms y su repetición 120 ms. Esa diferencia no permite aislar el coste del arranque de Neon, del cliente de conexión, de la red o de sus cachés.

Tareas utilizó `Task_columnId_idx`, seguido de ordenación de una fila. Métricas recorrió 38 registros y 15 videos, produjo 18 días y no necesitó escribir temporales. Con tablas tan pequeñas, un recorrido secuencial no demuestra falta de optimización. AuditLog utilizó `AuditLog_createdAt_idx` en sentido descendente.

La visualización PEV2 de la consola no interpretó el primer plan en formato texto de PostgreSQL 18; el SQL sí terminó y el plan textual informó sus tiempos. Las consultas siguientes usaron FORMAT JSON y se leyeron correctamente. No es un error del backend de intia.

Consultas reproducibles de solo lectura:

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT "id", "order" FROM "Task"
WHERE "columnId" = (SELECT "columnId" FROM "Task" LIMIT 1)
ORDER BY "order", "id" LIMIT 51;

EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT TO_CHAR(m."date", 'YYYY-MM-DD') AS day, SUM(m."views")
FROM "Metric" m JOIN "ContentItem" ci ON ci."id" = m."contentItemId"
WHERE m."date" >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY day ORDER BY day;

EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT "id", "summary", "createdAt", "userName", "userId"
FROM "AuditLog" ORDER BY "createdAt" DESC LIMIT 8;
```

## Recorrido de la aplicación y monitorización

La sesión publicada seguía disponible. Se realizó una entrada al Panel y navegación de lectura por Videos, Calendario y Métricas con Todas las marcas. No se editaron registros; no se capturaron errores/avisos del navegador durante ese recorrido. No se obtuvo una traza temporal del clic ni se llamó a IA.

Antes del recorrido, Query performance solo mostraba las consultas del diagnóstico recién ejecutadas. Después aparecieron consultas de la aplicación. Entre las filas visibles: cuatro llamadas de User con media de 0,3 ms, consultas de Brand con medias de 0,2–0,3 ms, lecturas de Structure de 2,5 ms, Metric de 2,4 ms y AuditLog de 44,2 ms, esta última con una sola llamada. La prueba posterior de una lectura equivalente de AuditLog mostró 0,082 ms de ejecución y el índice existente. No se puede presentar esa diferencia como mejora atribuible a código: eran ejecuciones y condiciones distintas.

El historial visible es pequeño, incluye nuestras consultas y no acredita los tiempos p95 de todas las rutas. La tabla agrupa SQL normalizado; sus tiempos no incluyen todo el recorrido de Prisma, autenticación, red y render. No se sumaron consultas concurrentes para reconstruir una duración de página.

En Monitoring, Pooler client connections mostraba `Max wait: N/A` y ausencia de datos; Postgres connections count advertía que algunas métricas no estaban disponibles. No se interpretaron esos campos como cero espera o cero conexiones. La configuración de autosuspend de cinco minutos sí volvió a confirmarse allí.

## Decisiones para O01/O06/O07

1. **Conservar región y conexión agrupada.** Ya apuntan a ubicaciones compatibles y al recurso correcto. No hay una corrección de configuración demostrada que aplicar ahora.
2. **No añadir por ahora los índices candidatos a producción.** Una tarea y 38 métricas no justifican atribuir el segundo a volumen/índices. Los candidatos permanecen documentados para crecimiento y pruebas de staging.
3. **Conservar el plan y la suspensión actuales hasta medir el impacto.** La suspensión puede penalizar visitas tras pausas; no se comprobó que requiera pagar otro plan. No añadir pings artificiales ni una tarea recurrente para mantener la DB despierta.
4. **Publicar las mejoras de navegación y consultas antes de otra intervención de infraestructura.** Medir separadamente señal visual, contenido, RSC y fases del servidor. Comparar navegación continua y primera visita después de más de cinco minutos sin actividad real; las consultas de monitorización también pueden activar la DB y alterar esa condición.
5. **Caché persistente apagada.** Con los datos actuales, no se ha demostrado un beneficio que justifique activarla. Conservar su implementación optativa para una comparación posterior.

O06 ya tiene revisión directa de región, endpoint, suspensión, límites, índices y consultas representativas. Pendientes: mediciones en el proceso de Vercel, colas bajo carga habitual y correlación de reactivación con navegación. O01 sigue pendiente de su comparación controlada; el segundo lote de código continúa sin publicar. La revisión de hoy no introduce una migración multitenant ni resuelve los hallazgos de seguridad de la auditoría general.
