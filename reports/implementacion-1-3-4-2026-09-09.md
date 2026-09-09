# Navegación, generación durable y almacenamiento privado

Fecha: 09/09/2026. Proyecto: intia. Alcance solicitado: puntos 1, 3 y 4 de los pendientes. Restricción: conservar los cupos gratuitos.

## Estado de la entrega

El código, las migraciones y la configuración están preparados en el workspace. La generación deja de depender de una pestaña abierta; el panel evita una segunda espera de renderizado; los adjuntos pueden almacenarse fuera de PostgreSQL y los importes se guardan como decimales.

**Todavía no se ha desplegado esta entrega en producción ni aplicado sus migraciones en Neon. El almacén privado `intia-private` ya está creado y conectado; aún no se transfirieron adjuntos reales.** Los resultados de rendimiento de este informe son locales. El plan Hobby de Vercel y el plan Free de Neon se comprobaron en sus paneles durante esta revisión, sin cambiar suscripciones.

Tras la autorización expresa del usuario, Vercel confirmó la creación de `intia-private` en `iad1`, acceso **Private**, bajo el plan **Hobby**. La conexión a intia abarca **Production y Preview**, con las variables `BLOB_READ_WRITE_TOKEN`, `BLOB_STORE_ID` y `BLOB_WEBHOOK_PUBLIC_KEY`. No se copiaron valores secretos al informe. El panel mostró almacenamiento y operaciones en cero. [Conexión del almacén](https://vercel.com/conamors-projects/intia/stores/blob/store_9iUYimS2hrGEBxfU/projects). Crear la conexión no activa el lector nuevo ni migra archivos: requiere el despliegue compatible y su configuración.

Un SELECT nuevo en Neon confirmó que aún usa `double precision`, sin esquema semanal ni tabla de trabajos. Hay cuatro adjuntos (2.234.418 bytes), sin importes ni plataformas incompatibles con el preflight consultado. Esta comprobación no modifica datos y debe repetirse antes de migrar. [Resultado de Neon](neon-preflight-1-3-4-2026-09-09.json).

La implementación incluye las modificaciones semanales y de consistencia de la entrega anterior, que también continúan pendientes de desplegar. No incluye organizaciones, membresías ni RLS: la instalación sigue siendo de un equipo compartido.

La entrega se versiona en `codex/weekly-jobs-private-storage`, incorporando el cambio del tutorial `01357f5` de `main`. La rama tiene CI configurado, pero tiene desactivado el despliegue automático de Vercel para no conectar una versión con el esquema nuevo a la base todavía sin migrar. El merge a `main` y la activación deben seguir el procedimiento coordinado descrito abajo. [Configuración de despliegues por rama](https://vercel.com/docs/project-configuration/git-configuration#git.deploymentenabled).

La integración a `main` mantiene también pausado su despliegue automático hasta completar la migración y la activación. GitHub puede contener la entrega sin que cambie la aplicación publicada. El control se retira explícitamente al preparar el despliegue compatible; las pruebas de CI continúan en el pull request y en `main`.

## 1. Navegación

El panel resolvía sus seis secciones dentro de límites de Suspense separados. Se añadió una modalidad que espera los resultados de esas seis secciones en paralelo y entrega su contenido conjunto. Mantiene los controles de sesión, las consultas y el indicador de navegación; no comparte datos privados mediante una caché nueva.

Comparación con la misma compilación, dos bases ficticias equivalentes y 30 clics por ruta y modalidad:

| Panel `/`, navegación continua | Secciones separadas | Carga conjunta |
|---|---:|---:|
| Contenido completo, mediana | 646,5 ms | 346,1 ms |
| Contenido completo, p95 | 663,2 ms | 362,5 ms |
| Primer bloque, mediana | 334,1 ms | 334,4 ms |
| Respuesta visual, mediana | 12,4 ms | 11,9 ms |

La reducción observada de la mediana del contenido completo fue de **46,5 %**. Se eligió la carga conjunta como comportamiento por defecto. `PANEL_RENDER_MODE=streaming` permite volver al comportamiento anterior sin cambiar consultas ni datos.

Se registraron 724 muestras en total: 600 clics, 120 recorridos de historial y cuatro cargas iniciales. Los otros nueve destinos mantuvieron medianas de contenido completo entre aproximadamente 346 y 365 ms en la modalidad elegida. Las cargas iniciales tienen pocas muestras: no se calcula su p95 ni se extrapolan a arranques en frío.

Es una comparación local secuencial, no un experimento aleatorio en producción. No prueba cuánto tardará Neon después de suspenderse, ni permite descontar la latencia de red real. La precarga de enlaces conserva el comportamiento previo; no se activó una precarga masiva de todas las fichas. El cambio medido afecta al panel.

Evidencia: [comparación local completa](panel-ab-local-2026-09-09.json). El archivo incluye el BUILD_ID; las etiquetas internas de los grupos conservan un nombre anterior y no deben interpretarse como un SHA publicado. Reproducción: `npm run perf:panel` con PostgreSQL local y un build ya generado.

## 3. Trabajos de IA

### Flujo implementado

1. La Server Action autoriza y valida la petición. Guarda un `GenerationJob` con sus elementos y auditoría antes de contactar al ejecutor.
2. Una clave estable del formulario y una huella del contenido evitan registrar dos veces el mismo envío. Reutilizar la clave con otro contenido se rechaza.
3. Workflow SDK ejecuta los elementos independientemente del navegador. Sólo recibe y devuelve identificadores y progreso; prompts y respuestas se resuelven dentro del paso y se guardan en PostgreSQL.
4. Cada elemento tiene token y concesión de seis minutos, con escrituras condicionadas al token. Las llamadas tienen un timeout de 240 segundos y los SDK de IA no añaden reintentos ocultos.
5. Una respuesta válida se guarda temporalmente antes de crear el guion y sus escenas. La creación del guion, su auditoría y la finalización del elemento se confirman en una transacción. La relación única impide crear dos guiones para el mismo elemento.
6. La pantalla **Mis generaciones** permite consultar avance, abrir guiones terminados, cancelar pendientes o recuperar un despacho detenido. Consulta cada 5–15 segundos, se detiene al terminar y evita consultar cuando la pestaña está oculta.

El solicitante y el dueño pueden consultar un trabajo; otro miembro no puede consultar ni cancelarlo. Antes de gastar y antes de persistir se revisan usuario activo y versión de acceso. Un trabajo pendiente expira a las 24 horas.

Los errores transitorios reconocidos del proveedor admiten tres intentos como máximo. Un error permanente termina ese elemento y conserva los guiones terminados de los demás. Recuperar manualmente reanuda pendientes; no reinicia un error definitivo ni evade el límite de intentos. Una nueva generación constituye otro envío y vuelve a consumir su cuota.

**Límite de la garantía:** si el proceso cae después de recibir una respuesta externa y antes de guardarla, puede ser necesario repetir una llamada. La idempotencia evita duplicar guiones guardados; no garantiza que el proveedor cobre exactamente una vez. Una llamada que ya empezó puede consumir tokens aunque se cancele el trabajo.

### Límites de consumo

| Recurso | Techo de esta instalación |
|---|---:|
| Estructuras por solicitud | 3 |
| Trabajos activos por usuario | 2 |
| Trabajos nuevos por día, total | 20 |
| Llamadas de IA por día, total | 20 |
| Llamadas de IA por día y usuario | 5 |
| Despachos de Workflow por día | 40 |
| Despachos, incluyendo recuperación, en 32 días | 80 |
| Intentos por elemento | 3 |
| Pasos de avance por ejecución | 40 |
| Salida máxima de una llamada | 32.000 tokens |
| Contexto completo del prompt | 200.000 bytes UTF-8 |

Los límites configurables sólo permiten reducir estos techos. Los días de cuotas de IA usan America/Lima. Las reservas son transaccionales y no devuelven cupo cuando el resultado de la operación es incierto. Se conservan los tokens reportados por llamadas completadas; no se inventan tokens para errores o caídas.

Vercel documenta 50.000 eventos y 1 GB de escritura de Workflow incluidos en Hobby; las funciones y colas tienen sus propios cupos. El límite de despachos deja margen para pasos y recuperaciones, pero los contadores de la aplicación no sustituyen el medidor de la cuenta ni contabilizan otros proyectos. [Precios de Workflow](https://vercel.com/docs/workflows/pricing).

No se cambiaron claves, proveedores ni planes de IA. Estos límites **no convierten Anthropic o Gemini en servicios gratuitos**. No se hicieron llamadas reales a modelos durante las pruebas de esta entrega. La extracción de branding preexistente no forma parte de esta cola ni de sus cuotas.

## 4. Almacenamiento y datos

### Archivos privados

- `Asset` conserva metadatos y texto extraído; guarda bytes antiguos o referencia a un objeto privado, según una restricción de exclusión en DB.
- `BlobObject` registra la ruta generada, tamaño, SHA-256 y estado antes de subir. El archivo se vuelve a leer y se verifica antes de adjuntarlo o retirar bytes antiguos de PostgreSQL.
- Las descargas siguen pasando por `/api/assets/[id]`, con sesión, comprobación de entidad, respuesta como adjunto y cabeceras de protección. No se entregan URLs públicas ni claves al navegador.
- La eliminación de un adjunto encola su objeto en la misma transacción, también al borrar la entidad dueña. Una falla al eliminar en Blob conserva la tarea para reintentar con espera creciente.
- Los objetos temporales sin adjunto expiran después de 24 horas. Nunca se limpia un objeto adjunto. Un fallo de auditoría durante la migración conserva los bytes originales en PostgreSQL.
- El SDK Blob queda fijado en 2.8.0 y sus reintentos HTTP internos se desactivan para que cada reserva corresponda a un intento. Las recuperaciones de borrado pertenecen a la cola durable.

| Recurso de Blob | Límite de aplicación | Incluido en Hobby según Vercel |
|---|---:|---:|
| Almacenamiento | 800 MB | 1 GB |
| Operaciones avanzadas en 32 días | 1.500 | 2.000/mes |
| Operaciones simples en 32 días | 8.000 | 10.000/mes |
| Transferencia reservada en 32 días | 8 GB | 10 GB/mes |
| Tamaño por archivo | 4 MB | Se mantiene el límite de subida de la aplicación |

Los temporales y objetos pendientes de borrado también cuentan para el cupo de almacenamiento. Verificar una subida consume lectura y transferencia. La ventana de 32 días evita depender del día de facturación. En Hobby el agotamiento del cupo puede bloquear operaciones hasta su recuperación; no se habilita facturación de excedentes ni un cambio a Pro. [Límites y precios de Blob](https://vercel.com/docs/vercel-blob/usage-and-pricing).

`npm run assets:migrate` es de consulta. Con `-- --apply --actor=<dueño>` copia y verifica hasta diez adjuntos antiguos por ejecución y audita cada cambio. No debe ejecutarse contra producción antes de preparar el respaldo y configurar el almacén privado. Si el archivo cambia durante la copia, la transacción no retira sus bytes.

### Dinero y plataformas

`Metric.spend` y `Metric.revenue` cambian de Float a `Decimal(24,6)`. Los formularios y CSV convierten cadenas directamente a Decimal; las fichas editables reciben cadenas exactas. La conversión a Number queda en la presentación de resúmenes. La suma SQL de 0,1 + 0,2 se verificó como 0,3 exacto.

El preflight rechaza importes no finitos, negativos, superiores a 10^12 o que necesitarían redondear más de seis decimales. Un CSV ambiguo como `1.234` se rechaza y explica cómo distinguir miles de decimales. No se reinterpreta automáticamente el histórico como datos semanales.

`ContentPlatform` tiene clave compuesta video/plataforma e índice plataforma/video. Un trigger sincroniza la relación en la transacción de `ContentItem`, elimina duplicados y rechaza plataformas desconocidas. Los filtros del listado y calendario utilizan la relación; el JSON permanece compatible con los formularios existentes.

## Validación

- TypeScript y build de Next/Workflow: validados localmente. El build conserva advertencias de variables sin uso y una advertencia de dependencia dinámica procedente de `@vercel/queue`; no bloquean la compilación. La cola administrada debe verificarse después del despliegue.
- Auditoría de dependencias: cero vulnerabilidades conocidas tras fijar las dependencias transitivas afectadas.
- 26 pruebas unitarias y 51 pruebas con PostgreSQL real: correctas. Incluyen revisión concurrente, consistencia semanal, permisos, cuotas, despachos duplicados, recuperación, cancelación, decimales y limpieza de adjuntos.
- Workflow SDK real ejecutado contra Next compilado y DB efímera: recupera una respuesta ficticia persistida, crea un guion y una auditoría. También se comprobaron las pantallas de avance, historial y formulario, incluido el límite de tres estructuras. No usa una API real de IA ni Blob. El ejecutor local no sustituye verificar la cola administrada de Vercel. [Resultado del ejecutor local](workflow-local-2026-09-09.json).
- Backup binario y restauración local: 29 tablas con filas y huella de esquema iguales; preflights inválidos revierten íntegramente. El ensayo usa fixtures, no un respaldo de producción.
- 724 observaciones de navegación para la comparación local. El control de edición concurrente conserva el borrador en ambos brazos.
- Una comprobación funcional posterior con el build final recorrió las diez rutas, el historial y el conflicto de edición: 14 observaciones, sin perder el borrador. Esta comprobación confirma el funcionamiento; no es una segunda estimación de rendimiento.

Los informes históricos permanecen como evidencia de sus versiones. Este documento y sus archivos asociados describen la entrega 1/3/4; no convierten pruebas locales en resultados desplegados.

## Activación

1. **Completado:** almacén **privado** `intia-private` en `iad1`, conservando Hobby, conectado a Production y Preview de intia. Vercel agregó las variables de conexión; deben incorporarse en los nuevos despliegues. No publicar el token en código, reportes ni capturas.
2. Preparar una copia reciente de Neon y un despliegue de prueba con una base aislada. Verificar que el presupuesto gratuito de ramas, cómputo y almacenamiento lo permite; no crear ampliaciones pagadas.
3. Seguir [el procedimiento de migraciones](operacion-migraciones.md): comprobar baseline e integridad, detener efectivamente escrituras de versiones viejas, registrar la línea base existente y aplicar las dos migraciones pendientes. Los nombres de migración y el build deben corresponder a la misma entrega.
4. Promover la nueva aplicación, con Fluid Compute confirmado y `AI_JOBS_ENABLED=true`. Configurar un `CRON_SECRET` independiente de al menos 32 caracteres. El mantenimiento de `vercel.json` se solicita una vez al día; la ejecución normal de IA usa Workflow, no espera al cron.
5. Activar `BLOB_PRIVATE_ENABLED=true`. Probar un adjunto autorizado y verificar descarga autenticada y limpieza; luego ejecutar la migración de archivos por lotes. Con el flag apagado, los nuevos adjuntos siguen en DB; los ya migrados requieren conservar el lector privado y el token.
6. Repetir mediciones de la web publicada, separando navegación continua, primera carga y vuelta tras inactividad. Usar al menos 30 muestras por ruta/condición antes de informar p95.

La reversión del panel es un flag. La reversión del almacenamiento requiere conservar compatibilidad: una versión anterior que sólo entiende `Asset.data` no puede descargar objetos ya migrados. No borrar el almacén o sus claves como mecanismo de rollback. La migración SQL no debe ejecutarse automáticamente durante `build`.

El mantenimiento diario autenticado es compatible con la frecuencia de Hobby; comparte los cupos de funciones. [Condiciones de Cron](https://vercel.com/docs/cron-jobs/usage-and-pricing). La duración máxima de un paso sigue dependiendo de las funciones, aunque el workflow pueda suspenderse y continuar. [Límites de funciones](https://vercel.com/docs/functions/limitations).
