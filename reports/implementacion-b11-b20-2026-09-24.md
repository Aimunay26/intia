# B11–B20: implementación y validación local

**Actualización de producción · 24/09/2026:** entrega conjunta B11–B20/B22 migrada y desplegada. [Registro y límites de la verificación](despliegue-b11-b22-2026-09-24.md).

Fecha: 24/09/2026. Base de comparación: `6a17cc7`. Estos cambios quedaron migrados y desplegados en la entrega conjunta B11–B20/B22. Este documento conserva la validación local; el registro de activación anterior contiene la evidencia de producción. No se hicieron llamadas reales a IA.

## Funciones entregadas

| Paquete | Implementación |
|---|---|
| B11 | Analista y Estrategia usan el dashboard completo con alcance obligatorio por marca: filtros, series, comparativas y ranking. Estrategia administra objetivos y formatos previstos. Producción edita solo grabación con revisión y protección de videos cerrados. Equipo filtra tareas por texto, etapa, tipo, prioridad y responsable. |
| B12 | CSV identificado por usuario/UUID y huella del archivo; prevalidación, bloques de 25 filas y recibo transaccional. Reanuda después de cerrar la pestaña, rechaza cambios concurrentes por fila y evita duplicar auditoría. Consulta solo videos referidos y descarga el informe completo de incidencias. |
| B13 | Referencias IA limitadas desde SQL a 30 documentos, 18.000 caracteres por documento y 80.000 en total; lecturas independientes en paralelo. Historial de métricas/comentarios en páginas de 30 y archivos de 20. Listas sin texto/binarios; lectura del texto al abrir el editor. Índices medidos, versionados y comprobados. |
| B14 | Recuperación antes de limpiar, presupuesto global de 50 s, despachos acotados y limpieza de hasta tres archivos. Un resultado incierto se diferencia de un error confirmado. Estado durable, aviso de mantenimiento atrasado y enlaces para recuperación manual. Caducidad predeterminada de trabajos ampliada a 72 h. |
| B15 | Modelo validado al guardar y al resolver configuración activa. Cada generación registra modelo efectivo, fuente, etapa, huella del contexto, revisiones y referencias utilizadas; muestra seguimiento y cupos. La consulta de pantallas no llama al proveedor. |
| B16 | Objetivos manuales o suma semanal automática, compartida por ficha, listado de marcas y panel, con período de 1–52 semanas completas y plataforma opcional. Retención sigue siendo promedio simple de registros; suma de alcances se identifica expresamente como no única. |
| B17 | Paginación y fechas normalizadas; claves repetidas de URL no llegan como arrays a filtros. Invalidación compartida de listas, fichas, calendario, objetivos y paneles después del commit. |
| B18 | Política técnica configurable, apagada por defecto y con vista previa. Conserva historia de negocio y adjuntos. Compacta cambios extensos de auditoría con longitud/SHA-256, limita bytes de archivos en DB y cuenta intentos de borrado Blob por separado. |
| B19 | `npm test` ejecuta la misma suite que `test:unidad`, incluidos arranque seguro y CTA; CI compila antes del test de arranque. Nuevas pruebas de SQL, perfiles, concurrencia, presupuestos y retención. Lint sin errores ni advertencias en código del proyecto. |
| B20 | Servicios pequeños para transiciones/publicación, objetivos, importación, contexto IA, mantenimiento y retención. Matching antiguo conservado como archivo: lectura y cascadas existentes, sin nuevas ejecuciones/ediciones. Contratos documentados; sin añadir microservicios. |

El calendario de Equipo mantiene su agenda autorizada y Tareas su lista; compartir capacidades y consultas no exige que todos los perfiles tengan la interfaz administrativa del Dueño.

## Matriz de las capacidades modificadas

Los perfiles se combinan; esta tabla muestra cada uno por separado. El Dueño accede a todas las marcas. Para los demás siempre se exige una marca autorizada; los perfiles de alcance asignado requieren además participación en el video.

| Perfil | Dashboard analítico | Cargar métricas/CSV | Objetivos | Formatos previstos | Fecha de grabación |
|---|---|---|---|---|---|
| Dueño | Completo | Sí | Crear/editar/eliminar | Sí | Sí |
| Estrategia | Completo, marcas autorizadas | No | Crear/editar | Sí | Dentro de planificación |
| Guionista | No | No | No | No | No |
| Producción | No | No | No | No | Solo este campo, video abierto |
| Cámara | No | No | No | No | No |
| Talento | No | No | No | No | No |
| Editor | No | No | No | No | No |
| Diseñador | No | No | No | No | No |
| Publicación | No | No | No | No | No |
| Analista | Completo, marcas autorizadas | Sí | Lectura | No | No |
| Sin perfil | No | No | No | No | No |

La columna de formatos indica permiso de edición; no añade una sección administrativa. Se reserva a `content.plan`. Producción no obtiene ese permiso ni acceso a administración.

## Contrato del CSV

- Hasta 500 filas y 1 MB por archivo. Una fila representa un video, plataforma y lunes de una semana, con resultados incrementales de esa semana.
- Una clave de envío identifica un contenido exacto. Reenviar la misma clave/huella devuelve o continúa su recibo; un archivo distinto exige iniciar otro lote.
- Cada bloque confirma métricas, auditoría y cursor en una sola transacción. Dos continuaciones se serializan sobre el lote. No se mantiene una transacción durante toda la importación.
- El bloqueo de video estabiliza su marca; los bloqueos por identidad y la revisión de la métrica detectan ediciones posteriores a la prevalidación. Una fila en conflicto se informa y no sobrescribe el dato ajeno.
- Un error técnico revierte todo el bloque en curso; los bloques anteriores siguen confirmados. El usuario puede reanudar desde Métricas. No se necesita un cron ni una llamada IA.
- Máximo cinco lotes pendientes por usuario. Los lotes se reanudan únicamente por su autor, tras comprobar sesión y permisos vigentes. La lista de pendientes no expone CSV de otras personas.
- Fechas/plataformas ausentes o inválidas se informan. Columnas/celdas vacías conservan el dato existente, el cero explícito lo reemplaza. Los importes mantienen Decimal en DB.

## Mediciones B12/B13

Fixture aislado en PostgreSQL 18 local: 20.000 videos, 100.000 tareas y 90 documentos ficticios de 100.000 caracteres. Se introducen **20 ms por operación Prisma esperada y por límite de transacción**. No es una medición de red de Neon ni una predicción del tiempo de producción.

| Trabajo | Antes p50 / p95 | Después p50 / p95 | Consultas SQL antes → después | Bytes de resultados serializados antes → después |
|---|---:|---:|---:|---:|
| CSV, 50 filas | 14.056 / 14.103 ms | 1.045 / 1.063 ms | 451–452 → 34 | 1.234.031 → 39.989 |
| CSV, 500 filas | 139.691 / 139.708 ms | 7.795 / 7.796 ms | 4.509–4.511 → 250–251 | 2.282.731 → 402.779 |
| Referencias IA | 140 / 155 ms | 62 / 63 ms | 3 → 1 | 9.006.743 → 80.709 |

CSV: tres repeticiones por tamaño/versión; con esta muestra p95 equivale al máximo observado y no caracteriza una distribución de producción. Referencias: 20 repeticiones. El contador recoge consultas emitidas por Prisma; los bytes son la serialización de resultados, no captura del protocolo de red. La comparación CSV conserva la acción de `6a17cc7`, usando las dependencias comunes del checkout actual.

En la primera iteración, los lotes recuperaban el JSON completo del CSV en cada continuación; la medición lo detectó y se cambió a proyectar solo el bloque actual y el recibo. Los resultados de la tabla corresponden a esa corrección.

Planes `EXPLAIN (ANALYZE, BUFFERS)` y datos brutos: [benchmark](rendimiento-b11-b20-2026-09-24.json). Script reproducible: `node scripts/benchmark-backend-completion.mjs` con `DATABASE_URL` de PostgreSQL local. Crea y elimina exclusivamente su propia base efímera.

| Índice | Evidencia local / decisión |
|---|---|
| `Task(columnId, order, id)` | Elimina filtrado de otras etapas y ordenamiento incremental. Beneficio temporal pequeño en este fixture (0,054 → 0,049 ms); se incorpora para normalizar el índice operativo existente, sin prometer una mejora visible por sí solo. |
| `Task(columnId, brandId, order, id)` | Lectura ordenada y filtrada por marca; 0,775 → 0,068 ms en el caso medido. |
| `ContentItem(scriptId)` | Evita recorrer 20.000 videos para encontrar los dos vinculados: 0,913 → 0,024 ms; 308 bloques del plan anterior frente a 3 del nuevo. |

Son mediciones individuales de planes, no p95. No se añaden todos los índices hipotéticos del diagnóstico. La migración adopta los índices existentes solo si su definición, disponibilidad y validez coinciden; ante divergencia revierte toda la migración. Una DB grande puede preconstruirlos de forma concurrente, según el procedimiento de despliegue.

## IA, recuperación y límites

El modelo efectivo sigue solicitud → estructura del mismo proveedor → Ajustes → catálogo. Una configuración activa no admitida produce un fallo legible antes de llamar al proveedor; no se omite silenciosamente. Se mantiene la normalización explícita del legado Gemini 2.5. Esta entrega no habilita modelos nuevos sin la prueba previa acordada con el usuario.

El registro durable contiene huella SHA-256 del prompt, revisiones de estructura/marca/arquetipo y referencias, identificadores y cantidades; no duplica el contenido de los documentos en los logs. La respuesta recuperable guarda el contexto usado para validar duración/beats, evitando validarla contra una estructura modificada posteriormente. Un proveedor simulado comprueba la persistencia de procedencia y etapa final.

El panel de cupo muestra llamadas del día de Perú, personales y de la instalación, incluyendo intentos fallidos y fallback. No equivale al saldo contratado con Google/Anthropic. La prueba de clave sigue siendo una acción explícita con cuota, sin enviar briefs.

Mantenimiento reserva hasta 15 s para recuperar tres trabajos, hasta 20 s para tres borrados y hasta 6 s para retención, dentro del presupuesto global de 50 s. Una espera vencida se marca **incierta**: no afirma que canceló un efecto remoto. Se conservan las concesiones y la reconciliación durable. Una prueba con limpieza que nunca responde confirma recuperación previa y salida acotada. El cron diario existente no cambia ni se contrata infraestructura.

## Retención aprobada

**Apagada al instalar.** El Dueño puede revisar impacto y guardar una política desde Ajustes. Revisión optimista evita pisar una política modificada por otra persona. Activarla programa su aplicación durante mantenimiento; la vista previa no borra datos.

| Datos | Plazo inicial | Efecto si se activa |
|---|---:|---|
| Respuesta técnica de item IA terminado | 90 días | Retira respuesta recuperable solo si el trabajo padre también terminó. |
| Entrada de trabajo IA terminado | 90 días | Conserva encabezado, estado, huella e IDs de alcance; retira brief/campos de entrada. |
| Filas originales de CSV completado | 90 días | Retira filas preparadas; conserva recibo e incidencias. |
| Contadores técnicos diarios conocidos | 120 días, mínimo 90 | Elimina vencidos sin reducir la ventana activa de cuotas. |
| Guiones, métricas, aprobaciones, auditoría, adjuntos y trabajos activos | Sin purga automática | Se conservan. |

La limpieza procesa como máximo 100 registros por clase y ejecución. No modifica auditoría histórica. Los **nuevos** cambios extensos de auditoría guardan longitud/huella; no sirven para reconstruir el texto íntegro anterior. Las copias de aprobación siguen siendo completas e inmutables.

`DB_ASSET_STORAGE_LIMIT` reserva por defecto 100 MB de archivos binarios en DB, comprobados dentro de un bloqueo transaccional. No representa la cuota total de Neon: índices, texto y demás datos también ocupan espacio. En Blob, `del()` se contabiliza como intento operativo separado; no descuenta cupo de operaciones avanzadas porque los borrados son gratuitos según la [documentación oficial de Vercel](https://vercel.com/docs/vercel-blob/usage-and-pricing). No se aumentaron límites ni planes.

## Validación y publicación

Pruebas y resultados: [evidencia local](validacion-b11-b20-2026-09-24.json). Incluyen unidades, PostgreSQL real, UI compilada de 11 perfiles y Workflow real con respuesta ficticia ya persistida, sin llamadas IA/Blob. El ensayo conserva las filas y la huella del esquema después de backup/restauración en otra base; también rechaza un índice divergente sin dejar cambios parciales.

La compilación conserva un aviso de dependencia dinámica de `@vercel/queue`/Workflow; Prisma 6 avisa de la futura retirada de `package.json#prisma`. No se ocultan esos avisos ni se presenta el build como una prueba de acceso real a los proveedores.

Publicación pendiente: [procedimiento B11–B20](despliegue-b11-b20.md). Contratos internos: [servicios e invariantes](contratos-backend.md). B22 se completó después en la misma rama ([detalle y publicación conjunta](implementacion-b22-2026-09-24.md)). El plan principal deja **B21 (multiempresa)** pendiente; los módulos opcionales A01–A05 mantienen su alcance original.
