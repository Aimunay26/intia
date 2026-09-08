# Implementación y validación O01–O07

Fecha: 8 de septiembre de 2026. Continuación del [plan de navegación](./plan-optimizacion-navegacion-2026-09-07.md).

La segunda entrega implementa las mejoras de código y sus herramientas de medición. Pasaron el tipado, la compilación y las pruebas locales con PostgreSQL real. **Esta entrega aún no está publicada.** El despliegue de producción que se consultó corresponde al primer lote, commit `051a9572ed203014a542850477df14793c40543c`, con estado Ready.

No se afirma que el segundo de espera de la web publicada esté resuelto. Faltan publicar esta entrega y comparar navegaciones en condiciones equivalentes. La revisión de Vercel/Neon fue de solo lectura: no se cambiaron regiones, planes, secretos, conexiones ni índices de producción.

## Estado por propuesta

| ID | Implementado / comprobado | Pendiente para aceptación en producción |
|---|---|---|
| O01 | Medición de navegación voluntaria, fases del servidor, operaciones Prisma, estimación de filas/bytes, identificador por render y resumen p50/p95 por versión | Serie comparable de al menos 30 muestras por ruta/condición, tiempos RSC y correlación con consultas del despliegue nuevo |
| O02 | Estados de carga de 14 rutas y navbar del primer lote; ahora Panel tiene 6 bloques independientes y Métricas 5 con Suspense. Verificados menú móvil, Enter, volver y cancelación | Repetir el recorrido y errores en la versión publicada; medición de pintado/INP con herramientas del navegador |
| O03 | Reutilización por render de autorización/marcas y consultas independientes del primer lote. Contexto compartido también entre bloques del Panel; opciones de estructuras deduplicadas por petición | Contrastar número de operaciones y fases en producción sin eliminar controles de acceso |
| O04 | Apertura de Tareas/Ajustes sin inicializadores de escritura. Prueba PostgreSQL con 10 inicializaciones simultáneas: 5 columnas, sin duplicados y una invocación de auditoría | La prueba usa DB real, pero simula la sesión y el destino de auditoría; no equivale a una prueba HTTP concurrente del despliegue |
| O05 | Métricas agregadas por periodo/día y ranking de 50; Equipo de 50; Arquetipos de 36; Tareas con cursor por columna de 50. Filtros antes del límite, orden estable y consultas acotadas | Evaluar planes/volumen reales y concurrencia de edición. H07/H08 siguen requiriendo decisiones de dominio antes de materializar agregados |
| O06 | Región y endpoint agrupado contrastados en Vercel/Neon; suspensión de cinco minutos y transición suspendido→activo verificadas. EXPLAIN sobre DB real, configuración opcional del pool y dos índices candidatos probados localmente | Correlacionar tiempos del proceso Vercel, espera de pool y reactivación con O01. Los índices candidatos quedan diferidos: el volumen real no justifica aplicarlos ahora |
| O07 | Evaluación y caché opcional solo de ids/nombres de estructuras, con alcance explícito, autorización previa, invalidación y máximo de antigüedad de 30 s. Probada localmente | Activación diferida: `CATALOG_CACHE_ENABLED=0`. No habilitar caché compartida entre organizaciones antes del modelo multitenant |

## Cambios de funcionamiento

### Navegación y bloques independientes

Panel permite mostrar indicadores, pendientes, objetivos, embudo, actividad y marcas a medida que cada bloque termina. Métricas separa filtros, resumen, serie diaria, desgloses y ranking. Los bloques tienen estados de carga accesibles; el encabezado y la barra permanecen utilizables.

La autorización continúa antes de consultar los datos protegidos. Las acciones mantienen sus comprobaciones frescas, fuera de la memoización por render. No se ha forzado la precarga completa de las 14 secciones.

Archivos: `src/app/(app)/page.tsx`, `src/app/(app)/metricas/page.tsx`, `src/components/section-loading.tsx`, `src/lib/render-context.ts`.

### Filas y consultas

- Métricas calcula totales, comparación, series y desgloses en PostgreSQL. El ranking solo devuelve 50 videos y usa id para desempatar. El filtro de persona usa EXISTS para no duplicar métricas cuando alguien tiene dos funciones. No descarga el historial de métricas para resumirlo en Node.
- Las fechas se validan como días reales; el periodo predeterminado toma el día de Lima, la aritmética del rango usa UTC y el máximo es 366 días. `Metric.date` se trata como día de reporte. Esto no migra fechas históricas ni corrige todas las escrituras de fechas del sistema.
- Equipo filtra y pagina en DB; cuenta videos distintos por persona y consulta el desglose de participación de las personas visibles. Los indicadores generales siguen siendo globales.
- Arquetipos filtra antes de paginar y conserva búsqueda sin tildes. Devuelve campos de tarjeta y compatibilidades reducidas; los prompts/documentos completos se leen en la ficha.
- Tareas solicita 51 registros por columna: muestra 50 y usa el restante para saber si hay otra página. Cada botón pide la siguiente página de esa columna. No vuelve a enviar todas las tarjetas previas. Máximo de 4 consultas de columnas simultáneas.
- Los cursores incluyen orden/id y una huella de columna/marca/filtros. No dependen de que la tarjeta ancla siga existiendo. La acción vuelve a autorizar y contrasta la marca actual; el cliente descarta respuestas de filtros anteriores y evita duplicar ids.
- Las columnas globales permanecen visibles al seleccionar una marca, junto con las columnas propias de esa marca. El selector de marca sigue siendo contexto de navegación; no es una frontera de seguridad entre organizaciones.

Archivos: `src/lib/metric-dashboard.ts`, `report-dates.ts`, `team-list.ts`, `team-participation.ts`, `archetype-list.ts`, `task-pages.ts`, `src/app/actions/task-pages.ts`.

Los agregados reducen transferencia y trabajo en Node; PostgreSQL todavía debe recorrer las filas que correspondan al periodo. Las páginas de ranking, Equipo y Arquetipos usan offset: accesos muy profundos pueden justificar cursores en una futura entrega. Los cursores de Tareas tampoco representan una instantánea: ediciones concurrentes pueden cambiar el orden entre páginas; refrescar recupera el estado actual.

### PostgreSQL como motor del sistema

Las consultas nuevas son específicas de PostgreSQL, coherente con Neon. Desarrollo y producción deben usar el mismo motor. Se actualizaron `.env.example`, README y la cabecera del esquema. El comando heredado `use:sqlite` informa que ese modo no es compatible y termina sin alterar el esquema. Las pruebas unitarias que usan SQLite en memoria comprueban un fragmento SQL portable; no ofrecen soporte de SQLite para la aplicación.

### Conexiones e índices

Se conserva un cliente Prisma reutilizado por proceso. `database-url.ts` identifica `-pooler` en el hostname y conserva parámetros explícitos. Neon documenta ese sufijo para sus conexiones agrupadas. [Referencia oficial](https://api-docs.neon.tech/reference/getconnectionuri).

`DB_CONNECTION_LIMIT`, `DB_POOL_TIMEOUT_SECONDS` y `DB_CONNECT_TIMEOUT_SECONDS` son opcionales. Vacíos preservan los límites existentes; no se impone un tamaño arbitrario del pool. Configurarlos requiere conocer instancias, concurrencia, conexiones y cuota efectiva.

Los índices candidatos son `Task(columnId, order, id)` y `Task(columnId, brandId, order, id)`. Están declarados en Prisma y en `prisma/operations/navigation-indexes.sql`, con CREATE INDEX CONCURRENTLY para una aplicación separada de las transacciones. El archivo no se ejecuta durante el build.

Se compararon planes antes/después con 100.000 tareas locales y se verificó igualdad de resultados. Las medianas de ejecución SQL fueron aproximadamente 0,077→0,056 ms sin marca, 0,135→0,052 ms con marca y 0,134→0,045 ms con cursor. Son ejecuciones locales calientes, con cinco muestras por variante; no incluyen Internet, SSR ni Neon y no explican por sí mismas una espera de un segundo. Los índices añaden almacenamiento y coste de escritura. La consulta posterior de producción encontró una tarea y un plan rápido con el índice existente: quedan diferidos y no se ejecutaron allí.

## Caché O07: decisión y límites

La decisión actual es mantenerla **apagada**. Hay una implementación optativa para evaluar únicamente ids/nombres de estructuras en selectores, no para sesiones, permisos, páginas privadas ni métricas agregadas.

La clave incorpora instalación/entorno, conexión a DB, usuario, rol, sesión, marca y opción de incluir inactivos, todos bajo hash. La autorización se resuelve en cada petición antes de consultar caché. Los cambios de estructuras invalidan la etiqueta de instalación/DB; una entrada de 30 segundos o más se lee directamente de DB en lugar de servir la copia antigua mientras Next revalida. Cookies y autorización quedan fuera de la función cacheada, conforme a la API de Next 15. [Referencia oficial](https://nextjs.org/docs/15/app/api-reference/functions/unstable_cache).

Una rotación de sesión o cambio de rol/marca usa otra clave. Esta separación limita el aprovechamiento entre usuarios deliberadamente. No existe aún `tenantId`/membresías: debe rediseñarse el alcance antes de habilitar reutilización entre organizaciones. Un error de caché no se oculta mediante datos privados obsoletos.

Para evaluación en un entorno controlado: `CATALOG_CACHE_ENABLED=1` y `CATALOG_CACHE_NAMESPACE` único por instalación/entorno. Si falta namespace o DB, se consulta directamente. Para retirarla, poner el flag en `0` y desplegar. No activarla solo porque las pruebas locales pasen: comparar operaciones evitadas y latencia con el flag apagado/encendido.

## Evidencia local

Entorno: Windows, Node 24.14.0, Next 15.5.24, Prisma 6.19.3, PostgreSQL 16 en contenedor efímero enlazado solo a loopback. Cuentas, marcas y registros ficticios. Sin solicitudes de IA ni escrituras a producción.

| Comprobación | Resultado |
|---|---|
| `tsc --noEmit --incremental false` | Correcto |
| `npm run build` | Correcto; JS compartido 103 kB, Métricas 117 kB y Tareas 121 kB de First Load JS |
| `npm run test:navegacion` | 18/18 correctas |
| `npm run test:navegacion:postgres` | 7 comprobaciones internas correctas; Node informa 8 incluyendo la prueba contenedora |
| PostgreSQL concurrente | 10 inicializaciones simultáneas; cinco columnas y una llamada a auditoría |
| Datos/ranking | 183 métricas de 61 videos de una marca, tres ordenamientos, páginas de 50+11, total correcto y sin duplicación por funciones |
| Arquetipos/Equipo | Páginas 36+3 y 50+3, búsqueda profunda y participación distinta correcta |
| Cursores | 50+50+10, eliminación del ancla, rechazo al cambiar marca/filtros; movimiento al final real de una columna de 60 tarjetas |
| UI con PostgreSQL real | Panel por bloques; Métricas página 2; Tareas 50→100 sobre DB de 100.000 tareas; búsqueda de la tarjeta 54.321 y exclusión por marca |
| Interacción | Menú a 390×844, navegación con Enter, cierre del menú, volver con historial; sin errores/avisos de consola en el recorrido |
| Cancelación | Métricas con consulta bloqueada artificialmente; el usuario puede volver a Tareas antes de que termine. La muestra se registra como cancelled |
| Caché real Next | Editar una estructura ficticia actualiza el selector tras recarga. Una cuenta MEMBER autorizada recibe el catálogo; al desactivarla, otra petición con la misma sesión es rechazada y no devuelve el catálogo |

Muestras exploratorias de navegación local, sin retrasos artificiales:

| Recorrido | Primera señal DOM/frame | Ruta cambiada | Primer bloque | Todos los bloques |
|---|---:|---:|---:|---:|
| Panel → Métricas | 3,7 ms | 22,4 ms | 347,1 ms | 356,9 ms |
| Métricas → Tareas | 2,4 ms | 15,4 ms | 335,5 ms | 340,0 ms |
| Tareas → Métricas | 3,4 ms | 19,3 ms | 326,9 ms | 337,2 ms |

Son tres observaciones de verificación, **no un benchmark antes/después ni un p95 representativo**. El cronómetro observa DOM/requestAnimationFrame, no captura el pintado real de cada píxel. Las esperas artificiales de la prueba de cancelación están excluidas de esta tabla. Las muestras de historial que reutilizan una ruta cacheada deben agruparse aparte.

Fixtures y trazas auxiliares se conservan bajo `.audit/`, excluida de Git. `npm run lint` sigue sin configuración operativa y el build omite lint; no se ha acreditado ESLint.

## Consulta de producción autorizada

Lecturas del 8 de septiembre, alrededor de las 18:00–18:06 de Lima, antes de publicar esta segunda entrega:

- [Overview de intia](https://vercel.com/conamors-projects/intia): producción Ready, rama main, commit `051a957`, dominio `intia-lovat.vercel.app`.
- [Functions](https://vercel.com/conamors-projects/intia/settings/functions): Hobby, Fluid Compute habilitado, región `iad1`, 1 vCPU y 2 GB de memoria.
- [Storage / Neon](https://vercel.com/conamors-projects/intia/stores): recurso Neon Free conectado a Preview y Production; su configuración muestra Washington, D.C., USA (East), `iad1`.
- [Observabilidad de funciones](https://vercel.com/conamors-projects/intia/observability/vercel-functions?advanced=true), filtro Production, últimas 12 horas: 75 invocaciones, errores 0 %, timeouts 0 %, CPU activa media 134 ms / p75 153 ms / p95 220 ms; memoria media 224 MB; CPU throttle p75 17,4 %; inicio caliente 78,7 %, frío 20 %, prewarmed 1,3 %.

Estos agregados mezclan rutas y potencialmente versiones del periodo. No son tiempos del clic ni una comparación controlada del commit. La tarjeta de Time to First Byte mostraba explícitamente **Demo Data**, por lo que sus valores se descartaron. La columna p75 de duración no ofrecía un valor utilizable en la vista consultada. Tampoco se confunde el CPU acumulado de cada ruta con la duración de una navegación.

Conclusión sustentada: no hay desalineación regional visible entre aplicación y DB; no se justifica moverlas ahora. Hay arranques fríos y CPU throttle observados que merecen correlación con navegaciones lentas. No demuestran que Neon haya suspendido el cómputo ni que sea necesario pagar un plan superior.

**Actualización posterior, 18:29–18:41 de Lima:** el usuario completó el acceso y se realizó la revisión directa de Neon. Se confirmó PostgreSQL 18.6, región AWS us-east-1, 0,25 CU, suspensión tras cinco minutos, endpoint agrupado coincidente con DATABASE_URL de Vercel y SSL requerido. Los SELECT encontraron 15 videos, 38 métricas y una tarea; los tres planes examinados ejecutaron el SQL en menos de 1 ms, sin que eso represente el tiempo de una navegación. Hay límites de observabilidad: el pool mostraba Max wait N/A y algunas métricas no estaban disponibles. Evidencia, consultas y decisiones en [Diagnóstico Neon/Vercel](./diagnostico-neon-2026-09-08.md). La revisión fue de solo lectura y no copió contraseñas ni cadenas de conexión al informe.

## Cómo medir el despliegue nuevo

1. Publicar este lote y anotar commit y entorno. Mantener caché persistente apagada durante la comparación inicial. No ejecutar seeds ni suites que escriban sobre producción.
2. Entrar con una cuenta autorizada y abrir una ruta con `?medir=1`. La opción activa el diagnóstico solo en esa pestaña durante la sesión. Navegar por la barra. `?medir=0` y recarga lo desactiva cuando no está forzado por `PERFORMANCE_LOGS=1`.
3. Las muestras aparecen como `[navigation]` en consola y como JSON en el elemento oculto `#navigation-measurements` (máximo 100 por pestaña, se reinicia al recargar). Copiar su texto desde DevTools, guardar en archivo y ejecutar `npm run perf:resumen -- archivo.json`. No se envía telemetría a un tercero.
4. Para servidor, activar temporalmente `PERFORMANCE_LOGS=1` en el entorno del despliegue y reunir líneas `[performance]`. `npm run perf:resumen -- archivo.jsonl` agrupa fases/operaciones por release/región y separa errores. Los logs no incluyen SQL, parámetros, cookies, títulos ni resultados privados. La estimación de bytes es parcial cuando `sampled=true`; no es el tamaño de la respuesta HTTP.
5. Identificar la petición RSC de navegación y medir primer byte/fin/tamaño en Network; contrastar con Performance para pintado y tareas largas. El id de las fases identifica un render del servidor; no hay correlación automática uno a uno con el id local del navegador: usar ruta, hora y versión. No sumar latencias de consultas paralelas como duración total.
6. Para DB, con una conexión disponible mediante entorno seguro: `npm run perf:db -- --output .audit/db-diagnostic.json`. En staging representativo, añadir `--explain`. Son SELECT fijos; el diagnóstico no modifica datos/índices ni imprime host, usuario o contraseña. Ejecutarlo desde el portátil mide ese trayecto de red, no el trayecto Vercel→Neon. El primer SELECT de un proceso nuevo tampoco acredita un cold start de Neon.
7. Reunir al menos 30 muestras por ruta/condición en staging representativo, separando entrada directa, navegación habitual, vuelta con caché, primera visita tras inactividad y errores/cancelaciones. Mantener cuenta, marca, filtros y volumen comparables. Hacer solo un recorrido supervisado ligero en producción, sin prueba de carga.
8. Ajustar conexiones/índices o evaluar caché únicamente tras identificar la fase dominante. Objetivos propuestos: señal visual p95 <100 ms y contenido principal p95 <500 ms en condiciones habituales. Aún no son resultados de producción.

## Fuera de esta entrega

El sistema sigue siendo una instalación para una organización con varias marcas. No incorpora Tenant/Membership, RLS ni aislamiento SaaS. La caché de catálogos no subsana esa ausencia.

No se materializaron agregados: retención mantiene la media de registros positivos y el reparto por plataforma conserva el comportamiento de contar un video multired en cada red, explicado en pantalla. Hay que resolver H07/H08 —incluyendo si las métricas son incrementales o acumuladas— antes de convertir esos cálculos en tablas persistentes. Persisten también hallazgos de la auditoría general sobre autorización de borrados, auditoría de otras escrituras, archivos y validación de estados. Optimizar navegación no los cierra.
