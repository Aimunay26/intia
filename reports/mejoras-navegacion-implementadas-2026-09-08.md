# Mejoras de navegación implementadas

Fecha: 8 de septiembre de 2026. Seguimiento del [plan de optimización](./plan-optimizacion-navegacion-2026-09-07.md) y de la [auditoría general](./auditoria-arquitectura-multitenant-2026-09-07.md).

**Registro del primer lote, commit `051a957`.** El panel de Vercel confirmó el 8 de septiembre que este commit está en producción con estado Ready. Las pruebas descritas aquí fueron locales y no son un benchmark posterior al despliegue. El estado de la segunda entrega está en [Implementación O01–O07](./implementacion-o01-o07-2026-09-08.md).

## Qué cambia

| Área | Cambio aplicado | Efecto esperado |
|---|---|---|
| Barra y pantallas | 14 archivos `loading.tsx`, esqueletos compartidos, indicador pendiente dentro de cada enlace y `aria-current` | Mostrar que la navegación está en curso mientras llegan los datos; mantener la barra disponible |
| Accesibilidad | Estados de carga anunciados y animaciones desactivadas con `prefers-reduced-motion` | Feedback de carga también para lectores de pantalla y usuarios que reducen animaciones |
| Autenticación de páginas | Sesión y contexto de marca memoizados por petición de render en 20 páginas/layouts | Evitar lecturas repetidas sin compartir sesiones entre peticiones |
| Marcas | Lista, publicados del mes y conteo de archivadas en paralelo | Una tanda de consultas independientes en lugar de tres consecutivas |
| Calendario y Actividad | Reutilización de marcas del contexto; contexto y personas en paralelo en Actividad | Menos consultas y dependencias innecesarias |
| Generador | Contexto de marca iniciado junto con catálogos | Quitar la consulta de marca que se ejecutaba al final |
| Contenido | Conteo/listado en paralelo, catálogos independientes y suma de vistas en DB para los 50 videos visibles | Evitar descargar todas sus métricas; conservar distinción entre cero vistas y ausencia de registros |
| Guiones | 50 registros por página, acceso a páginas siguientes y orden estable por fecha/id | Acceder a toda la biblioteca sin cargar 200 guiones inicialmente |
| Métricas | Agregación del periodo anterior en DB | Recibir dos resúmenes pequeños en vez de todas las filas previas |
| Equipo | Conteo SQL de videos distintos por persona y agrupación de funciones | Evitar transferir todas las asignaciones; una persona con dos funciones en un video sigue contando un solo video |
| Tareas | Filtros en servidor antes del límite, 50 tarjetas iniciales por columna y ampliación explícita | Reducir la carga inicial sin ocultar resultados al buscar; usar la marca de la barra como único selector de marca |
| Inicialización de tareas | Botón explícito en tablero vacío, autorización, transacción serializable, identificadores estables, reintentos y auditoría | Abrir/precargar la pantalla no crea columnas; rechazo sin sesión y protección frente a inicialización repetida |
| Ajustes | Snapshot de configuración reutilizado, recuento de limpieza bajo demanda y lectura del token sin crear uno | Menos consultas al abrir; calendario activado solo por acción del dueño |
| Diagnóstico | Registro opcional de fases con `PERFORMANCE_LOGS=1` | Medir sesión, contexto y listado de Contenido sin registrar datos privados |

Los esqueletos no aceleran por sí mismos la DB. En una entrada directa aún se debe resolver el layout protegido; al navegar entre secciones se puede reutilizar ese layout. No se añadieron cachés persistentes de datos privados ni precarga completa forzada de todos los enlaces.

## Archivos principales

- [Contexto por render](<C:/Users/YONELIA/Desktop/intia-main/src/lib/render-context.ts>) y [diagnóstico de fases](<C:/Users/YONELIA/Desktop/intia-main/src/lib/performance.ts>). Las acciones/API siguen usando los helpers originales de autenticación/contexto, con lecturas frescas.
- [Estado de carga compartido](<C:/Users/YONELIA/Desktop/intia-main/src/components/page-loading.tsx>) e [indicador de navegación](<C:/Users/YONELIA/Desktop/intia-main/src/components/navigation-pending.tsx>).
- [Listado de Contenido](<C:/Users/YONELIA/Desktop/intia-main/src/lib/content-list.ts>), [paginación](<C:/Users/YONELIA/Desktop/intia-main/src/lib/list-pagination.ts>), [resumen de métricas](<C:/Users/YONELIA/Desktop/intia-main/src/lib/metric-summary.ts>) y [participación del equipo](<C:/Users/YONELIA/Desktop/intia-main/src/lib/team-participation.ts>).
- [Filtros de tareas](<C:/Users/YONELIA/Desktop/intia-main/src/lib/task-list.ts>), [página del tablero](<C:/Users/YONELIA/Desktop/intia-main/src/app/(app)/tareas/page.tsx>) e [inicialización explícita](<C:/Users/YONELIA/Desktop/intia-main/src/app/actions/tasks.ts>).
- [Ajustes](<C:/Users/YONELIA/Desktop/intia-main/src/app/(app)/ajustes/page.tsx>) y [revisión de limpieza bajo demanda](<C:/Users/YONELIA/Desktop/intia-main/src/app/(app)/ajustes/vaciar-ejemplo.tsx>).

## Verificación realizada

| Comprobación | Resultado | Alcance |
|---|---|---|
| `tsc --noEmit --incremental false` | Correcto | Tipado de la implementación |
| `npm run build` | Correcto, Next 15.5.24 y Prisma 6.19.3 | Compilación de producción con URL ficticia; sin DB real |
| `npm run test:navegacion` | 11 pruebas correctas | Paginación, agregados, filtros, inicialización autorizada/idempotente, token de solo lectura y precedencia de ajustes |
| SQL de participación | Correcto sobre fixture SQLite en memoria | Ejecuta el SQL de `COUNT(DISTINCT ...)`; falta prueba integral contra PostgreSQL desplegado |
| UI local sobre build de producción | Correcta en las comprobaciones descritas debajo | DB sustituida por una fixture local con retrasos; no es un benchmark |
| Streaming HTTP local autenticado | El fallback se recibió antes del contenido final | Comprobación real del render/stream de Next con DB simulada |
| Deduplicación durante render real de Next | Una consulta de usuario y una de marcas en entrada completa a `/contenido` | Layout, página y filtros reutilizaron contexto en esa petición |

La suite está en [tests/navigation.test.mjs](<C:/Users/YONELIA/Desktop/intia-main/tests/navigation.test.mjs>). Usa Node 24 y las dependencias del proyecto; no requiere DB ni servidor y no llama a IA. Ejecuta módulos originales con fronteras DB/Next simuladas. La prueba SQL usa `node:sqlite`, por lo que no verifica el comportamiento del pool ni la concurrencia real de PostgreSQL.

La inicialización se probó con rechazo de sesión, repetición y conflicto simulado `P2034`. El aislamiento serializable y los reintentos deben además verificarse con solicitudes concurrentes contra PostgreSQL de pruebas antes de afirmar que existe una prueba integral de concurrencia.

En navegador local se comprobó:

1. Inicio de sesión con una cuenta ficticia y navegación por Marcas, Ajustes, Guiones y Tareas; sin errores/avisos capturados en consola.
2. Guiones: 50 filas en la primera página y acceso al guion 51 en la segunda.
3. Tareas: búsqueda de la tarjeta 57, que no estaba en las primeras 50; la búsqueda se aplica a todos los datos antes de limitar el resultado.
4. Con marca A seleccionada: 50 tarjetas iniciales, expansión a sus 55 tarjetas y ninguna tarjeta de marca B. La búsqueda de una tarjeta de B quedó vacía al cambiar a A.
5. Ajustes sin token: muestra «Activar calendario». La revisión de limpieza queda detrás de «Revisar datos de ejemplo». Abrir las páginas no ejecutó escrituras de configuración ni inicialización.

En una entrada HTTP directa a `/contenido`, la fixture registró fallback a 1.249 ms y contenido final a 2.354 ms. Esos valores incluyen **retrasos artificiales**, autenticación y layout; sirven únicamente para probar que el streaming anticipa la interfaz de carga. No representan una mejora porcentual ni un objetivo de velocidad conseguido. El recorrido del navegador verificó las pantallas completas; no se obtuvo una traza de pintado del indicador pendiente, cancelación rápida o navegación móvil.

Las fixtures y copias previas están bajo `.audit/`, excluida de control de versiones. No se importan desde `src` ni forman parte del funcionamiento del producto. La prueba no usó credenciales ni datos de producción.

`npm run lint` sigue sin configuración operativa, según la auditoría anterior. El build omite lint por la configuración que ya tenía el proyecto; una compilación correcta no equivale a haber pasado ESLint.

## Límites y trabajo siguiente

Este primer lote cubrió O03/O04 y partes de O01/O02/O05; O02 aún requería bloques independientes en Panel y Métricas. Los pendientes siguientes son el registro histórico de ese lote; consultar el informe O01–O07 para el estado actual. Ninguna de estas mejoras convierte el sistema en multitenant ni resuelve todos los hallazgos H01–H19.

- Métricas todavía carga el detalle del periodo actual. Se conservó deliberadamente su semántica existente de retención positiva; H08, la atribución por plataforma y las fechas requieren corrección de dominio antes de materializar nuevos agregados.
- Equipo reduce el historial de asignaciones, pero todavía carga el catálogo de personas. Arquetipos conserva su listado completo. Su paginación y los agregados del periodo actual quedan pendientes.
- Tareas amplía el límite en bloques de 50 por columna y vuelve a solicitar ese conjunto. Para tableros muy grandes conviene pasar a cursores y carga adicional por columna, con validación específica del orden y movimientos. Los borrados MEMBER y otras carencias de auditoría en acciones de tareas siguen en la auditoría general; esta entrega corrige la autorización del inicializador.
- La consulta de participación del equipo sigue teniendo alcance global dentro de la organización actual. Requiere añadir tenant cuando exista ese modelo; el cache por render no aporta aislamiento organizacional.
- La selección de región, pool, índices nuevos, límites de conexiones y caché persistente depende de las trazas y configuración reales. No se modificaron esos ajustes ni el esquema Prisma.
- No se certificó reducción del segundo de espera de la web pública. Falta desplegar esta versión y repetir la medición con los mismos datos, usuario y red.

## Despliegue y medición siguiente

Ejecutar el protocolo del plan en el entorno publicado y verificar la versión desplegada antes de atribuirle resultados. La carpeta recibida originalmente no incluía `.git`, `.vercel/project.json` ni `.env`. A petición del usuario se recuperó el historial de `main` del repositorio `conamormarket-lgtm/intia` para versionar y subir esta entrega. Un push no acredita por sí mismo que Vercel haya completado el despliegue; no se ejecutaron migraciones desde esta tarea.

Si se activa `PERFORMANCE_LOGS=1`, los logs añaden un identificador aleatorio por render, nombre de fase, duración y éxito. No contienen SQL, parámetros, cookies, texto de guiones ni cadenas de conexión. Estos tiempos incluyen todo lo esperado por la fase, no solo ejecución SQL. Correlacionarlos con las trazas de DB/proveedor para atribuir la demora y desactivar el registro cuando termine el diagnóstico.

Antes de cerrar la optimización en producción, comprobar el indicador pendiente con navegación lenta/cancelada, entrada directa, volver/avanzar, teclado y móvil; probar OWNER/MEMBER y cambios de marca; comparar clic→respuesta visual y clic→contenido por separado. Mantener los resultados actuales de producción como referencia histórica, no sobrescribirlos con tiempos de la fixture.
