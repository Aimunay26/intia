# Intia: mapa del backend frente a las funciones del frontend

Fecha: 16 de septiembre de 2026. Código auditado: `adbbc916dcccdb6a5fb3ef09d48ef3f5b217b812` (`main`).

## Seguimiento de implementación

Este documento es el plan de trabajo acordado. El diagnóstico original se conserva como línea base; esta tabla indica el estado actual. “Validado localmente” no significa desplegado.

| Paquete | Estado | Evidencia / pendiente |
|---|---|---|
| B01 · Protección de aprobados | Desplegado | Guiones compartidos, adjuntos, concurrencia, motivo de reapertura y auditoría; regresiones locales y CI correctas |
| B02 · Destino de la generación | Desplegado | Revisión, permisos, aprobación y estado; conserva guion independiente con motivo; generación real posterior pendiente |
| B03 · Presupuesto de IA | Desplegado | Cuota por petición, fallback bloqueado sin cupo, plazo compartido y prueba de clave de Claude; pruebas con SDK simulado |
| B04 · Importación documental | Corrección P1 desplegada | Lectura local inicial comprobada en producción; proveedor explícito, cupos y límite por documento; mejoras futuras detalladas abajo |
| B05 · Referencias a estructuras | Migrado en Neon y desplegado | Cuatro preflight sin incidencias; respaldo/restauración real verificados; FK y backfill aplicados sin perder datos de negocio |
| B06 · Validación del guion | Desplegado | Reglas semánticas, fallo terminal legible y sin repetir respuesta inválida; pruebas con respuestas simuladas |
| B07 · Integridad de agenda | Migrado y desplegado | Marca derivada/validada, vínculo editable con semántica explícita, FK compuesta y protección ante cambios o borrado del video; verificado en Neon/Vercel |
| B08 · Procedencia de compatibilidad | Migrado y desplegado | Autor, revisión y fuente manual; origen anterior en auditoría; solo evaluaciones humanas llegan al prompt; verificado en Neon/Vercel |
| B09 · Estados y aprobación explícita | Migrado y desplegado | Flujo acordado, requisitos, tipos estables, copias inmutables de versiones aprobadas, reapertura y excepción auditada; verificado en Neon/Vercel |
| B10 · Concurrencia uniforme | Migrado y desplegado | Revisiones en importación de branding, ficha de usuario, compatibilidad, texto/referencia de adjuntos y ajustes; borradores conservados; verificado en Neon/Vercel |
| B11–B22 | Pendiente | 12 paquetes restantes; se mantienen las prioridades y criterios del informe |

Actualización: 24/09/2026. **B07–B10 están integrados en main, migrados en Neon y desplegados en producción**, commit `4ab0260`. CI aprobada; despliegue Git y promoción automática restaurados. [Evidencia del despliegue](despliegue-consistencia-backend-2026-09-24.json). La entrega B01–B06 conserva su registro anterior y el diagnóstico original se mantiene como línea base.

### Entrega B07–B10 · 17/09/2026

**Agenda.** Crear un evento ligado a un video deriva su marca cuando falta y rechaza una marca contradictoria. Al editar, omitir `contentItemId` conserva el vínculo, enviarlo vacío lo retira y enviar otro ID lo cambia después de comprobar permisos y marca. La interfaz permite conservar o retirar el vínculo existente; mientras se conserva, la marca se hereda del video. No se añadió un selector nuevo de videos al alta de eventos. La FK compuesta de PostgreSQL propaga futuros cambios de marca; borrar el video conserva el evento desvinculado. La validación diferida admite el borrado en cascada de una marca sin dejar cruces ni vínculos sin marca.

**Compatibilidad.** Guardar manualmente una evaluación registra `MANO`, el ID/nombre del autor y una revisión incremental. Se retira `sourceScriptId` de la evaluación vigente y se conserva su valor anterior en la auditoría. La matriz y la ficha de estructura distinguen evaluación manual, sugerencia sin validar y autor histórico desconocido. Tanto el contexto de IA como el generador excluyen `SEED`/`AUTO` del criterio humano; sus datos se conservan y pueden validarse mediante una edición manual.

**Flujo confirmado por el usuario:** Idea → Guion → Aprobado → Grabación → Edición → Programado → Publicado. Los nuevos videos empiezan como Idea. Los permisos del perfil y de la marca se verifican antes de evaluar el cambio de estado.

| Paso | Requisito normal |
|---|---|
| Idea → Guion | Guion vinculado con escenas |
| Guion → Aprobado | Guion aprobado con versión verificable y aprobación del guion en el checklist |
| Aprobado → Grabación | Aprobaciones vigentes y tareas obligatorias de preproducción completas |
| Grabación → Edición | Aprobaciones vigentes y tareas obligatorias de preproducción/grabación completas |
| Revisión final en Edición | Guion aprobado, aprobación de guion vigente y tareas obligatorias anteriores a publicación completas |
| Edición → Programado | Revisión final correspondiente a la versión actual y fecha prevista |
| Programado → Publicado | Aprobaciones vigentes, enlace público y tareas obligatorias de publicación completas |
| Retroceder o cancelar | Permiso de aprobación y motivo de 5–1000 caracteres; se retiran las aprobaciones que correspondan |
| Excepción del Dueño | Selección explícita, motivo obligatorio y auditoría del salto; no crea una aprobación ficticia |

El guion avanza Borrador → Revisión → Aprobado → Grabado, con archivo/reapertura justificados. `SCRIPT_APPROVAL` y `FINAL_APPROVAL` son tipos estables: escribir «Revisión final aprobada» en el nombre de una tarea no otorga aprobación. Las aprobaciones no pueden borrarse como tareas.

Cada aprobación guarda una copia y una huella del contenido, autor, fecha y versión. PostgreSQL impide modificar o borrar esa evidencia; solo admite revocarla con autor/fecha/motivo. Aprobar un video exige la huella de lo que se mostró al revisor, y publicar vuelve a contrastar guion, tareas y adjuntos con las versiones aprobadas. Cambiar material o retirar la aprobación del guion impide publicar hasta revisar de nuevo. Las fichas muestran las últimas 20 aprobaciones. Esto cubre versiones **aprobadas**; no implementa todavía el historial de cada edición ni el editor de versiones de A04.

**Ediciones simultáneas.** La importación con sobrescritura, la ficha de usuario, la compatibilidad y los adjuntos comparan la revisión capturada al abrir el formulario con la fila bloqueada. Los ajustes comparan una huella de claves y fechas de modificación, sin incluir secretos, y serializan las altas de ajustes antes ausentes. Los conflictos no se reintentan automáticamente. Las pruebas de navegador comprueban que el texto escrito permanece en usuario, adjunto y ajustes y que el modal de adjunto no se cierra por un fallo.

Validación local:

- `npm run test:unidad`: 127 pruebas correctas, incluyendo todas las combinaciones de transición de ambos flujos.
- `npm run test:postgres`: 100 pruebas correctas en nueve suites, sin omisiones. Las 12 regresiones de B07–B10 más su contenedor de suite cubren acciones reales, permisos, SQL, carreras, importación y versiones.
- `npm run typecheck`, lint sin errores (62 advertencias previas) y build de producción correctos; se conserva la comprobación del runtime React.
- `npm run test:perfiles`: once perfiles, conservación de borradores, error de requisito visible, reapertura justificada y completar/reabrir/completar sin recargar. Coordinación vuelve a Edición con permiso de aprobación, sin recibir permisos de edición.
- `npm run perf:local`: 362 muestras de navegación y conflicto de edición con borrador conservado. Es una comprobación local; no acredita tiempos ni ahorros en Vercel.
- `npm run test:workflow`: cola local real y recuperación de respuesta persistida correctas; proveedor simulado.
- Ensayo desde esquema antiguo: el preflight rechaza un evento ambiguo y revierte toda la migración. Conserva aprobaciones históricas sin inventar versiones. Respaldo y restauración coinciden en filas y esquema de 33 tablas.
- Cero llamadas reales a proveedores de IA/Blob y ninguna modificación de producción. Estas comprobaciones no equivalen a CI ni a una validación en Neon/Vercel.

Regresiones: [acciones y PostgreSQL](../tests/postgres-workflow.test.mjs), [matrices de transición](../tests/workflow-policy.test.mjs), [interfaz](../scripts/smoke-permissions.mjs). Evidencia: [resultados B07–B10](implementacion-consistencia-backend-2026-09-17.json).

### Publicación de B07–B10: completada el 24/09/2026

- Respaldo real cifrado con Windows DPAPI y restauración local comprobada: filas y esquema coinciden en las 33 tablas públicas previas. Ensayo sobre una copia real de Neon, sin contratar recursos adicionales.
- Aplicada `20260917180000_workflow_consistency`, checksum comprobado y datos conservados en las 32 tablas de negocio. Sin discrepancias entre evento y marca. Se preservan 4 guiones y 17 checks con aprobación histórica sin inventar versiones ni autores.
- Al iniciar, el dominio ya apuntaba a `9691d37`, pero Neon aún no tenía esta migración. Se corrigió esa diferencia con una pausa breve de escrituras. El control `intia-workflow-20260917` rechaza escrituras de despliegues anteriores, manteniendo las sesiones existentes.
- Vercel READY, dominio confirmado en `dpl_spXZR8jkMeWCDWiKJcejtHmE3NyJ`, código `4ab0260`. [CI 36053138901](https://github.com/conamormarket-lgtm/intia/actions/runs/36053138901) aprobada. La primera CI de activación se detuvo por una vulnerabilidad transitiva: Workflow se actualizó a 4.8.9 y devalue a 5.9.2; auditoría sin vulnerabilidades reportadas.
- Verificados controles HTTP sin sesión y páginas autenticadas. La interfaz rechaza avanzar sin guion y conserva la selección/borrador. Contra Neon se ejecutó el recorrido con tres aprobaciones, reapertura, inmutabilidad, rechazo por perfil, marca cruzada y revisión obsoleta **dentro de una transacción revertida**: no se conservaron registros de prueba ni auditoría. En esa prueba las acciones y SQL son reales; autenticación y efectos de Next están simulados. El acceso autenticado real se comprobó por separado en el navegador.
- CI comprueba once perfiles y conservación de borradores ante conflicto. No se inició sesión en producción con todos los perfiles ni se ejecutó una generación real de IA. Cero llamadas reales a IA o Blob.
- Despliegue automático de main y promoción automática restaurados; despliegues anteriores conservan protección de acceso. Los formularios abiertos antes del cambio deben recargarse. Las aprobaciones históricas se conservan, pero para nuevas publicaciones se requiere reabrir con motivo y aprobar una versión verificable.

### Decisiones implementadas

- **B01:** el equipo debe retirar la aprobación y salir de Programado/Publicado antes de editar. Retirar la revisión final exige un motivo de 5–1000 caracteres y registra auditoría. Se consideran todos los videos ligados a un guion, incluso si otro video del mismo guion sigue abierto. Los adjuntos del video se protegen tanto al cargar como al modificar, marcar para IA o borrar. La excepción administrativa del Dueño se mantiene auditada. B09 añade las versiones aprobadas inmutables en la entrega local del 17/09.
- **B02:** la revisión del destino se captura al encolar, sin confiar en una revisión enviada por el navegador. Al guardar se revalidan permisos, marca, estado, aprobación, ocupación y revisión. Se conserva el guion independiente con un aviso persistente si ya no puede vincularse. Los trabajos anteriores a esta versión, sin revisión capturada, también quedan independientes por precaución. No se repite la llamada por perder el vínculo.
- **B03:** cada petición al SDK reserva una unidad global y personal, incluidos los fallbacks de esquema y las peticiones fallidas. Los errores locales de modelo/clave ocurren antes de reservar. Las peticiones de un intento comparten 240 s; la concesión dura 360 s. El contador de intentos sube una vez, aunque el fallback necesite una segunda petición. La prueba mínima de Claude comparte cupo con plazo de 15 s; la consulta de metadatos de Gemini sigue sin generar tokens. No se garantiza exactamente una llamada externa ante una caída entre la respuesta del proveedor y su persistencia.
- **B04:** ambos formularios documentales comienzan en lectura local. La mejora con IA exige elegir Gemini o Claude, usa el interruptor y los cupos compartidos, limita la mejora a 25 s y reserva como máximo una llamada por archivo SHA-256/usuario/proveedor/día. Una repetición entrega lectura local con aviso; no cambia de proveedor ni repite la llamada silenciosamente. Hay trazas por operación y petición. **No se añadió una caché de prosa ni una cola de extracción larga:** la previsualización actual termina con el parser local si no alcanza el plazo; esas ampliaciones quedan fuera de este cierre P1.
- **B05:** se añade ContentPlannedStructure con orden y FK, sincronizada transaccionalmente desde structureIds para mantener compatibilidad con los formularios. GenerationItem también referencia Structure mediante FK. Se conserva la estructura en el historial y se desactiva si está en uso; los trabajos previamente encolados pueden terminar y los nuevos no pueden usarla. No se eliminan referencias antiguas para hacer pasar la migración.
- **B06:** Zod y el esquema enviado al proveedor comparten definición. Máximo 80 escenas, textos de hasta 12000 caracteres y tiempos enteros de hasta 690 s. Se exige título, beats en orden, continuidad temporal, plano, acción y voz o texto según el tipo. La tolerancia de duración es fija en esta entrega: 15%, mínimo 3 s; aún no hay ajuste por estructura en la interfaz. response_validate identifica el fallo; una salida inválida queda FAILED sin guion terminado ni regeneración automática, incluso si se recuperó de la DB. Esto comprueba consistencia técnica, no calidad editorial.

### Validación de la entrega B01–B06 · 16/09/2026

- TypeScript: correcto.
- Lint: 0 errores; 62 advertencias previas.
- Pruebas unitarias: **124 correctas** (113 principales + 11 CTA), incluidas tres regresiones del runtime de React.
- PostgreSQL real: **87 correctas**, en ocho suites con bases efímeras; incluye 17 pruebas de la suite B01–B06 (16 casos y su prueba contenedora).
- Build de producción local: correcto, con Prisma generado y Next compilado. En Windows el build requirió ejecución fuera del aislamiento del compilador; se evitó regenerar la DLL de Prisma mientras las pruebas la utilizaban.
- Workflow SDK real: recuperó una respuesta ficticia persistida, creó un solo guion, conservó tokens/auditoría y trazas. Se comprobaron sus páginas en navegador.
- Interfaz compilada: Dueño, nueve perfiles y usuario sin perfiles; sin errores de JavaScript. Verificados los formularios de reapertura con motivo para Dueño/Estrategia, selección documental inicialmente local y ocultación de edición del guion ligado a video cerrado.
- Corrección durante el despliegue: CI detectó un checklist persistido cuya interfaz conservaba el estado anterior. La instrumentación local confirmó una respuesta HTTP 200 completa con el nuevo estado y la interfaz pendiente. Añadir refrescos o transiciones no resolvió por sí solo el bloqueo. Se incorporaron temporalmente los cambios oficiales de React [35518](https://github.com/react/react/pull/35518) y [35521](https://github.com/react/react/pull/35521) en el runtime incluido en Next 15.5.24. El script verifica versión y hashes, es idempotente y se ejecuta al instalar y compilar; debe retirarse al actualizar a una versión que incluya la corrección y pase las regresiones. No añade paquetes ni cambia la versión mayor del framework.
- `EditForm` conserva el control de hidratación y de doble envío, agrupa la acción y el estado local en una transición y no realiza un refresco adicional. La regresión comprueba completar/reabrir/completar sin recarga y contrasta cada paso con PostgreSQL. Los dos backports iniciales no bastaron: aunque hubo ejecuciones locales correctas, CI reprodujo el bloqueo y otra repetición local registró React 418. Se conserva esta evidencia para no atribuirles una solución completa.
- Mitigación adicional del runtime: `resolveLazy` vuelve a propagar la promesa como en [React 19.1.0](https://github.com/react/react/blob/v19.1.0/packages/react-reconciler/src/ReactChildFiber.js), evitando la conversión a `SuspenseException` usada para repetir inmediatamente el render suspendido. Es una adaptación local acotada a Next 15.5.24 y sus hashes originales, no una corrección oficial adicional. Se mantiene el framework con sus parches de seguridad. Su retirada requiere que una versión oficial supere las mismas regresiones en build de producción y CI; el muestreo no garantiza ausencia de cualquier fallo intermitente.
- Se detectó que Webpack reutilizaba localmente el bundle anterior pese a modificar `node_modules`. La caché ahora incluye el hash del script de compatibilidad y el build verifica el runtime emitido. Sobre compilación limpia y bundle inspeccionado pasaron tres ejecuciones consecutivas de once perfiles, incluyendo completar/reabrir/completar sin recarga; navegación y conservación del borrador también correctas. CI aprobó el commit aplicado en producción.
- Ensayo de actualización con datos existentes: rechaza trabajos huérfanos, formatos previstos huérfanos y JSON inválido, sin dejar cambios parciales. El backfill conserva valores y orden. El respaldo/restauración mantiene filas y esquema de las 32 tablas.
- **Cero llamadas reales a Google, Anthropic o Blob.** El despliegue, el acceso y las páginas indicadas en la evidencia se comprobaron en producción. La generación real con proveedor y las escrituras de negocio de prueba no se ejecutaron en producción.

Pruebas reproducibles: [regresiones PostgreSQL](../tests/postgres-priorities.test.mjs), [reglas y plazo](../tests/backend-priorities.test.mjs), [ensayo de migración](../scripts/rehearse-migration.mjs), [interfaz por perfiles](../scripts/smoke-permissions.mjs), [Workflow](../scripts/smoke-workflow.mjs). Resultados resumidos: [evidencia de implementación](implementacion-prioridades-backend-2026-09-16.json). Las nueve reproducciones del diagnóstico original quedan como evidencia histórica; las regresiones nuevas exigen el comportamiento corregido.

### Activación de B01–B06 en producción: completada el 16/09/2026

- Aplicación integrada en `main`: `2f89f7d`. Vercel `READY`, dominio [Intia](https://intia-lovat.vercel.app) confirmado en el despliegue `dpl_3Kr1XCVXd5qk3HPKBdDMS8s6uYco`.
- CI de este commit completada correctamente: [ejecución 35148321879](https://github.com/conamormarket-lgtm/intia/actions/runs/35148321879). Incluye pruebas unitarias, PostgreSQL, restauración/migración, build, Workflow e interfaz por perfiles.
- Respaldo real cifrado con Windows DPAPI, restaurado localmente con igualdad de filas y esquema en las 32 tablas públicas previas. La migración se ensayó primero sobre otra instantánea real de Neon.
- Aplicada `20260916180000_backend_priorities`. Conservados los datos de las 31 tablas de negocio originales, salvo la renovación prevista de `ContentItem.updatedAt`; relaciones previstas equivalentes al JSON original y checksum verificado. Se reinstalaron las guardas en la tabla nueva y se reabrieron las escrituras.
- Verificados los controles HTTP sin sesión y las páginas autenticadas consignadas en la [evidencia de despliegue](despliegue-prioridades-backend-2026-09-16.json). La prueba productiva no alteró contenido ni consumió cupo de IA.
- Restaurada la promoción automática de Vercel. Las URL de despliegues anteriores siguen protegidas. Los formularios de videos abiertos antes de la migración deben recargarse por el cambio de revisión.

**Siguiente bloque de implementación:** B11, paridad funcional por perfil, seguido de rendimiento y los demás paquetes pendientes. B07–B10 ya están publicados y verificados con el alcance anterior. Una generación real posterior requiere proveedor disponible y autorización para usar datos y cupo.

## Dictamen de la auditoría original

El sistema tiene un backend real para los módulos principales. Los pendientes más importantes están en la coherencia entre operaciones, la ejecución de IA, la paridad funcional de los perfiles y la operación a mayor escala. **No está terminado como producto multiempresa**, aunque sí tiene control de acceso por marca y perfil para un mismo equipo.

La prioridad es cerrar los caminos que permiten modificar trabajo aprobado y corregir el control de las llamadas de IA. Agregar pantallas o cambiar modelos no resuelve esas dos clases de problemas.

Este mapa contiene **22 paquetes de trabajo: 6 P1, 14 P2 y 2 P3**. Nueve escenarios se reprodujeron con PostgreSQL real y datos ficticios; algunos pertenecen al mismo paquete. Hay además cinco ampliaciones opcionales que no deben confundirse con errores del alcance actual. No se asigna un porcentaje de “backend completo”: el denominador de funciones futuras todavía no está definido.

## Alcance y evidencia

- Revisión de las 15 secciones declaradas en permisos, pantallas Dueño/Equipo, 20 archivos de acciones con 85 funciones asíncronas exportadas, 6 rutas técnicas, servicios y 31 modelos Prisma.
- Lectura de las cinco migraciones versionadas y del script adicional de índices. Inspección de índices y restricciones en una base recién migrada.
- `npm run typecheck`: correcto.
- `npm run lint`: 0 errores y 62 advertencias.
- `npm run test:unidad`: **109 pruebas correctas**: 98 de la invocación principal y 11 de CTA.
- `npm run test:postgres`: **70 pruebas correctas** en siete suites; ninguna omitida. Bases efímeras separadas para seguridad, navegación, demo, consistencia, escalabilidad, despliegue y permisos.
- **9 reproducciones adicionales**, con acciones del sistema, sesiones firmadas y PostgreSQL local. Los SDK de IA están simulados; ninguna llamada se envió a Google, Anthropic o Blob.

Artefactos: [reproducciones ejecutables][repro] y [resultados, índices y restricciones observados][results]. El script de diagnóstico espera reproducir las carencias actuales; al corregirlas habrá que convertir esos casos en pruebas que exijan su rechazo o el comportamiento correcto.

**Límites:** no se inspeccionaron datos, configuración ni logs actuales de producción en esta auditoría. Tampoco se ejecutó una generación real, un despliegue ni una prueba de carga. Las observaciones de rendimiento son candidatos sustentados en consultas y código; no son tiempos medidos en Neon. Las pruebas de interfaz presentes en CI no se volvieron a ejecutar aquí. Los hallazgos de auditorías anteriores se contrastaron con el código actual y no se reutilizaron como pendientes automáticamente.

Leyenda: **R** = reproducido localmente; **C** = confirmado por código; **D** = decisión o requisito de producto pendiente. “Implementado” describe respaldo de código y las pruebas señaladas, no una certificación de cada recorrido en producción.

## 1. Mapa por módulo

| Sección / función visible | Respaldo actual del backend | Diferencia, carencia o riesgo | Trabajo |
|---|---|---|---|
| Panel | Consultas y agregados reales; contexto de marca; vista según acceso | Revisar coste a volumen real y no extender agregados del Dueño a miembros sin alcance explícito | B11, B13 |
| Calendario | CRUD de eventos; fechas de publicación y grabación; zona de negocio; feed ICS | Equipo tiene agenda, no el mismo calendario mensual; relación evento/marca/video inconsistente; ICS es una suscripción de lectura | B07, B11, B22 |
| Videos | CRUD, duplicación, estados, asignaciones, checklist, comentarios, publicación manual y métricas | Cierre/aprobación no protege todos los caminos; estados no modelan transiciones completas; interfaz de Equipo pierde opciones | B01, B02, B09, B11 |
| Tareas | Columnas, tareas, orden, responsables, alcance y conflictos de edición | Dueño usa tablero y Equipo lista/formularios; consultas por columna crecen con el número de columnas; faltan filtros equivalentes en Equipo | B11, B13 |
| Marcas | Identidad, brief, documentos, objetivos manuales, archivado y permisos | Estrategia puede editar marca pero no ve objetivos en su ficha; progreso de objetivos no se calcula desde `metricKey` | B11, B16 |
| Generador IA | Cola persistente, idempotencia, cuotas, reintentos, cancelación, recuperación, persistencia y trazas | Conteo incompleto de peticiones, validación semántica débil, cierre de video durante generación y robustez de configuración | B02–B06, B14, B15 |
| Guiones | Edición y orden de escenas, estados, duplicación, impresión, vincular/desvincular | Un guion no aprobado puede modificarse aunque el video vinculado ya esté publicado; no hay versiones inmutables del contenido aprobado | B01, B09 |
| Estructuras | CRUD, beats, reglas, ejemplos, prompts, documentos y desactivación | Borrado ignora formatos previstos y trabajos pendientes; modelo predeterminado se guarda sin validar contra catálogo | B05, B15 |
| Personas / arquetipos | Perfiles, branding, importación de informe, compatibilidad manual y referencias | Previsualización IA fuera de cuotas; importación con sobrescritura sin revisión del formulario; procedencia de compatibilidad incorrecta | B04, B08, B10 |
| Métricas | Datos semanales incrementales, plataforma, validación, CSV, importes Decimal, agregados SQL y filtros para Dueño | Analista recibe tabla/totales simplificados; importador hace transacciones por fila; definiciones analíticas requieren precisión | B11–B13, B16 |
| Equipo | Alta, edición, perfiles, marcas autorizadas, desactivación, contraseñas y revocación de sesiones | Alta de cuenta no envía una invitación; edición de ficha no detecta formulario desactualizado | B10; ampliación A05 |
| Actividad | Auditoría transaccional de numerosas escrituras, filtros y paginación | Parámetro de página no normalizado; política de conservación ausente; no equivale a monitoreo técnico | B17, B18 |
| Ajustes | Organización, modelos, claves, OAuth de inicio de sesión, calendario y controles administrativos | Secretos como valores legibles por la aplicación; falta un panel operativo que consolide modelo, cuotas y trabajos | B15, B22 |
| Mi perfil | Edición de datos, cambio de contraseña y documentos propios | Control de concurrencia incompleto en ficha/archivos; recuperación de contraseña depende de administración | B10; ampliación A05 |
| Tutorial | Guía de uso de la interfaz | No requiere un backend de negocio propio; mantener sus recorridos alineados al habilitar funciones por perfil | B11, B19 |
| Documentos, transversal | Validación de contenido, autorización de descarga, referencias IA, Blob privado, inventario y limpieza | Escrituras posteriores a aprobación; extracción IA paralela a la cola; retención y medición de todas las operaciones incompletas | B01, B04, B18 |

## 2. Lo que ya está bien resuelto

1. **La seguridad no depende solamente de ocultar botones.** Hay permisos compartidos y filtros de acceso por marca/asignación en el servidor. Las suites verifican rechazos por URL/ID ajeno y combinaciones de perfiles. [Política][permissions], [alcances][scope].
2. **Las escrituras principales usan transacciones y revisiones.** `withMutation` vuelve a validar al actor, usa Serializable y registra auditoría dentro de la transacción; `lockRevision` compara la versión que vio el usuario. Los conflictos no deben resolverse sobrescribiendo silenciosamente. [Mutaciones][mutations].
3. **Las sesiones se revocan.** Cambios de acceso incrementan versión y evitan que una sesión antigua siga escribiendo. Se protege al último Dueño activo. [Autorización transaccional][auth-tx].
4. **La IA ya tiene infraestructura de trabajos.** Solicitud idempotente, ítems persistentes, concesión temporal, recuperación y respuesta guardada antes de crear el guion. Es una base aprovechable; no hace falta reemplazar todo el backend. [Trabajos][jobs].
5. **Las métricas semanales tienen reglas reales.** Unicidad por video/semana/plataforma/período, controles de valores, importes decimales y separación de históricos sin período. No corresponde sumar históricos `LEGACY` como si fueran semanas. [Esquema][schema], [métricas][metrics].
6. **Hay migraciones, pruebas PostgreSQL y CI.** Incluyen ensayos y recorridos de interfaz configurados. Los adjuntos tienen autorización, inventario, checksum y limpieza recuperable. [CI][ci], [almacenamiento][storage].

## 3. Correcciones prioritarias

P1: corregir antes de ampliar el uso del flujo afectado. P2: completar para una operación consistente y escalable. P3: evolución estructural. No se confirmó un incidente P0 de exposición pública o pérdida masiva durante esta auditoría; el alcance no equivale a una prueba de penetración integral.

### B01 · P1 · Proteger todo el contenido aprobado — R01, R02

**Problema:** `assertScriptAccess` bloquea la escritura del guion si su propio estado es `APROBADO`; no considera los videos vinculados. Con sesión WRITER se modificó una escena de un guion `BORRADOR` ligado a un video `PUBLICADO` con revisión final aprobada. El video mantuvo su aprobación. También se editó el texto de un adjunto del video desde `updateAssetText`.

**Impacto:** lo que el publicador considera revisado puede cambiar después. Son dos rutas reales de escritura; no implican que un usuario sin permiso pueda editar cualquier video. La excepción administrativa del Dueño debe conservarse de forma explícita.

**Propuesta:** política única de cierre, aplicada a escenas, metadatos, vínculos y documentos que formen parte de la versión aprobada. Definir qué materiales adicionales sí pueden adjuntarse después. Reabrir debe dejar motivo y auditoría; preferir aprobación asociada a una revisión o snapshot.

**Aceptación:** una edición operativa rechazada no cambia datos ni aprobación; reabrir permite editar y obliga a revisar nuevamente. Cubrir guiones compartidos por varios videos. Evidencia: [alcance de guiones][scope], [actualizarEscena][script-edit], [assets][assets], [autorización de adjuntos][asset-scope].

### B02 · P1 · Revalidar el destino al terminar la generación — R03

**Problema:** el encolado exige un video en Idea/Guion; `vincularGuionAVideo` al final solo condiciona la actualización a `scriptId: null`. Se canceló un video mientras el proveedor simulado trabajaba: recibió el guion y el trabajo acabó `COMPLETED`.

**Propuesta:** comprobar estado, revisión, aprobación y permisos del destino dentro de la transacción final. Si cambió, guardar el guion independiente y comunicar el motivo exacto. No descartar una respuesta ya obtenida.

**Aceptación:** cancelar/publicar/reasignar el destino durante la llamada no permite un vínculo inválido, no pierde el guion y no repite la llamada. [Encolado y finalización][jobs], [vinculación][link].

### B03 · P1 · Contar cada petición y acotar el tiempo total de IA — R04 + C

**Problema reproducido:** el fallback por rechazo de JSON Schema hace dos peticiones al SDK y el trabajo registra una unidad de cuota y un intento. Además, cada petición tiene hasta 240 s y la concesión del ítem dura 360 s: dos peticiones podrían superar esa concesión. El tiempo real hasta el primer rechazo no se midió.

También se reserva cuota antes de cargar y validar contexto, modelo y clave. Un error local conocido puede descontar una llamada aunque no haya salido de la aplicación. No se propone devolver reservas cuando el resultado de una petición externa sea incierto.

**Propuesta:** una pasarela común reserva por petición efectiva; plazo total por intento compatible con la concesión y el runtime. Mover las comprobaciones locales antes de la reserva. Registrar motivo, número de petición y tokens sin secretos ni prompts.

**Aceptación:** dos peticiones descuentan dos unidades; presupuesto insuficiente impide la segunda; preflight local fallido no consume llamada; pruebas de expiración y recuperación no duplican resultado. [Proveedor Gemini][provider], [trabajos][jobs], [preflight actual][ai-index].

### B04 · P1 · Incluir la extracción documental en el control de IA — R08

**Problema:** `previsualizarDocumento → extraerFicha` usa el proveedor directamente. Con `AI_JOBS_ENABLED=false` y cuotas de llamadas en cero se ejecutó una petición simulada; los contadores no cambiaron. El switch se llama “jobs”, por lo que no es por sí solo un interruptor universal; lo relevante es que esta operación no tiene presupuesto propio ni comparte el existente.

La extracción tiene además selección de proveedor alternativo si falta una clave y configuración de reintentos/timeout distinta de la generación. El parser local de respaldo sí funciona.

**Propuesta:** presupuesto y telemetría para todas las operaciones de IA; distinguir lectura local y mejora con IA en el formulario; hacer explícito el proveedor; timeout y límites por usuario/documento. Reutilizar resultado por checksum cuando sea apropiado. Llevar a trabajo persistente las extracciones largas.

**Aceptación:** cero presupuesto impide la salida al proveedor y conserva la lectura local; una extracción consume el cupo correspondiente; proveedor usado visible; ninguna sustitución silenciosa que cambie el destino de documentos. [Previsualización][preview], [extractor][extractor].

### B05 · P1 · Proteger referencias a estructuras — R05

**Problema:** eliminar una estructura sin guiones deja su ID en `ContentItem.structureIds` y en un `GenerationItem` pendiente. Ambas referencias se reprodujeron después del borrado. La comprobación de borrado contempla guiones; el JSON de formatos previstos y el ítem de cola no tienen una FK que lo impida.

**Propuesta:** tabla de formatos previstos con relación y orden; FK o referencia versionada para el trabajo; desactivar si hay uso vigente. Elegir qué se conserva en el historial antes de migrar. Validar también que el formato sea seleccionable al encolar.

**Aceptación:** ningún borrado deja ID inválido; una estructura utilizada por un trabajo en curso queda protegida o genera una cancelación explícita sin llamada innecesaria. [Borrado][structure-delete], [esquema][schema].

### B06 · P1 · Validar la utilidad del guion generado — R07

**Problema:** una salida de 10.000 segundos y escena sin voz, acción ni plano se aceptó y guardó para un pedido de 30 segundos. Zod comprueba tipos, pero no límites suficientes; la normalización ajusta continuidad, no adecuación a la duración pedida.

**Propuesta:** límites de escenas, texto y duración; tiempos finitos/coherentes; requisitos según tipo de escena —una escena de texto puede no tener voz—; comprobación de beats y tolerancia configurable de duración. Diferenciar “respuesta recibida”, “validación pendiente/fallida” y “guion listo”. No corregir mediante IA automáticamente sin presupuesto explícito.

**Aceptación:** respuesta estructuralmente válida pero inutilizable no aparece como guion terminado; motivo legible; conservar diagnóstico mínimo; no repetir indefinidamente una respuesta almacenada que siempre falla al persistir. [Schema IA][ai-schema], [parser][provider], [persistencia][persist].

## 4. Resto del trabajo necesario

| ID / prioridad | Hallazgo y evidencia | Propuesta y criterio de cierre |
|---|---|---|
| **B07 · P2** Integridad de agenda | **R06:** acción real crea evento de marca B vinculado a video de marca A. En actualización se valida `contentItemId` enviado pero no se incluye en los campos guardados. La interfaz habitual no ofrece todo ese vínculo: es una inconsistencia del contrato de acción/DB, no una fuga demostrada desde el formulario normal. [Eventos][events] | Derivar marca del video o rechazar discrepancia; decidir si el vínculo es editable e implementar coherentemente; validar también cambios posteriores de marca. Pruebas para crear, editar y borrar destino. |
| **B08 · P2** Procedencia de compatibilidad | **R09:** editar manualmente una compatibilidad `SEED` mantiene `source=SEED`; la generación utiliza score/notas sin filtrar esa procedencia. No afirmar que ignora la edición: sí usa el valor. [Compatibilidad][fits], [carga de contexto][ai-index] | Registrar fuente humana, autor y revisión; limpiar o conservar explícitamente el vínculo histórico al guion origen. La UI y la entrada a IA deben distinguir evaluación manual y sugerencia. |
| **B09 · P2** Transiciones y aprobación explícitas | **C/D:** hay permisos para el estado destino, pero no una matriz completa de transiciones y prerrequisitos. La aprobación final se detecta buscando `final` y `aprobad` en texto de checklist. `APROBADO` del video y revisión final son conceptos distintos. [Permisos][permissions], [contenido][content] | Definir transiciones válidas y excepciones; tipos estables de checklist/registro de aprobación; versión aprobada y motivo de reapertura. Cerrar con pruebas de cada transición, no solo cada perfil. |
| **B10 · P2** Concurrencia uniforme | **C:** importación de branding con `sobrescribir`, ficha de usuario, compatibilidad, texto de adjunto y ajustes no comparten el control de revisión del formulario. Serializable no detecta por sí solo que un formulario se abrió antes de otro cambio ya confirmado. [Importación][branding-import], [equipo][team], [assets][assets] | Añadir versión y precondición a estas operaciones; preservar edición local al mostrar conflicto. No reintentar automáticamente una escritura basada en datos obsoletos. Dos formularios abiertos: el segundo no pisa el primero sin advertencia. |
| **B11 · P2** Paridad de funciones por perfil | **C:** `MemberWorkspace` usa componentes distintos. Analista no ve series, filtros por período/plataforma ni comparativas; Estrategia no ve objetivos; planificación de Equipo no expone formatos previstos. Producción no puede editar `shootDate` del video sin `content.plan`, aunque puede editar agenda. [Vista Equipo][member], [videos Equipo][member-content], [métricas Dueño][metrics-page] | Consultas y componentes compartidos con capacidades; para analytics, alcance obligatorio por usuario/marca antes de reutilizar SQL del Dueño. Decidir si Producción puede cambiar solo grabación. Cerrar con matriz perfil × acción × alcance, incluyendo UI. No conceder privilegios administrativos para resolver carencias de pantalla. |
| **B12 · P2** Importación CSV escalable | **C:** se cargan todos los videos autorizados para resolver referencias y se ejecuta una transacción por cada fila válida; hasta 500 filas. Es correcto validar cada fila, pero hay muchas rondas a la DB y resultado parcial ante interrupción. [Importador][metrics] | Resolver solo IDs/títulos del archivo; lote identificado e idempotente, validación previa, chunks y reporte por fila; trabajo persistente si supera presupuesto de petición. Medir tiempo y queries con 50/500 filas y latencia parecida a Neon. |
| **B13 · P2** Consultas e índices medidos | **C:** referencias IA se cargan secuencialmente y sin límite de filas/texto en DB; detalle de video carga todas sus métricas; comentarios de Equipo se limitan a 40 sin navegar anteriores; adjuntos de Equipo a 100. Índices adicionales descritos abajo. [Contexto IA][ai-index], [ficha Equipo][member-content], [adjuntos Equipo][member-assets] | Proyecciones y carga diferida; paginar historiales y avisar límites; paralelizar lecturas independientes con un presupuesto de contexto. Registrar queries/p95/bytes antes y después. Añadir índices solo cuando el plan justifique el coste de escritura. |
| **B14 · P2** Recuperación y mantenimiento | **C:** mantenimiento tiene 60 s, limpia hasta 10 blobs con hasta 5 s por borrado y luego despacha hasta 5 trabajos. No hay presupuesto global ni aislamiento entre un fallo inicial y recuperación. Cron diario y caducidad de trabajo de 24 h dejan una ventana estrecha para trabajos atascados. [Mantenimiento][maintenance], [almacenamiento][storage], [dispatch][dispatch] | Dividir en pasos acotados, reservar tiempo, registrar fallos y edad de pendientes; recuperación manual precisa y alerta accionable. Simular fallos lentos y demostrar que una tarea de limpieza no impide recuperar trabajos. Mantener la solución dentro de los límites gratuitos acordados. |
| **B15 · P2** Configuración y observabilidad de IA | **C:** catálogo Google permite un solo modelo; estructuras guardan `defaultModel` libre y el resolver puede ignorarlo en silencio si no está soportado. Las trazas de generación existen, pero faltan estado de configuración y cuota visibles. La existencia de un nombre en el catálogo no prueba disponibilidad real. [Modelos][models], [estructuras][structure-edit], [trazas][trace] | Catálogo mantenido y validado al guardar; mostrar modelo efectivo, origen de configuración, etapa, cupo y código de seguimiento. Comprobación del proveedor separada y controlada, sin enviar briefs para un health check. Snapshot/revisión de contexto y modelo para reproducibilidad. No hacer llamadas reales en cada navegación. |
| **B16 · P2** Semántica analítica y objetivos | **C/D:** retención es promedio simple de filas; reach se suma entre semanas/plataformas; `metricKey` de objetivos es metadato y `currentValue` manual. Son decisiones insuficientemente explicitadas, no necesariamente cálculos incorrectos para todos los usos. [Agregados][dashboard], [objetivos][objectives] | Etiquetar suma de alcances sin presentarla como personas únicas. Definir denominador para retención ponderada; no inventarlo si las fuentes no lo dan. Separar objetivos manuales y calculados; conectar métricas compatibles si se aprueba. Fixtures con volúmenes muy distintos y períodos vacíos. |
| **B17 · P2** Parámetros y actualización entre módulos | **C:** Actividad calcula página con `Number`, sin entero finito/límite: `Infinity` o decimales llegan al `skip`; fechas inválidas pueden lanzar. Revisar además invalidaciones: borrar guion modifica relaciones pero solo invalida su módulo. [Actividad][activity], [acciones de guiones][scripts] | Normalizador único de filtros/paginación; respuestas controladas; catálogo explícito de vistas afectadas por cada mutación. Pruebas de URLs inválidas y de navegación entre fichas previamente visitadas. El riesgo de vista obsoleta se identifica por código; no se reprodujo en navegador aquí. |
| **B18 · P2** Retención y almacenamiento | **C:** no hay una política general de purga para respuestas/prompts persistidos, auditoría, contadores y trabajos. Los cambios de texto de adjuntos pueden duplicar textos extensos en auditoría. Blob contabiliza subida/lectura/transferencia, pero `del` no pasa por ese contador; alternativa de bytes en DB carece de cuota equivalente. [Assets][assets], [almacenamiento][storage], [esquema][schema] | Retención configurable por clase de dato; resumen/hash en logs de textos extensos; exportación cuando corresponda; medir todas las operaciones según la tarifa efectiva y consumo real. Mantener datos activos y referencias válidas al purgar. No borrar historial sin política acordada. |
| **B19 · P2** Cerrar huecos de pruebas/CI | **C:** CI usa `npm test`, que omite `security-startup` y CTA incluidos en `test:unidad`. Las nueve reproducciones no estaban cubiertas por las suites existentes. 62 advertencias de lint dificultan detectar regresiones. [CI][ci], [scripts npm][package] | Unificar comando de pruebas; convertir reproducciones a aceptación tras cada arreglo; añadir carreras de generación/aprobación, perfiles y presupuestos. Corregir advertencias pertinentes gradualmente. Una suite verde no certifica proveedor real ni despliegue. |
| **B20 · P3** Servicios de dominio y contratos | **C:** reglas distribuidas entre acciones, helpers, componentes de Equipo, triggers y workers; mezcla de excepciones y estados de formulario. `MatchRun/MatchRow` existen en DB sin un flujo operativo de matching en `src`. [Esquema][schema], [mutaciones][mutations] | Extraer servicios pequeños para transiciones, aprobación, publicación y llamadas IA; dejar validación/autorización cerca de las entradas y reglas reutilizables dentro. Documentar dueño de cada invariante y retirar o terminar modelos sin uso según producto. No migrar a microservicios por defecto. |
| **B21 · P3** Multitenencia real | **C/D:** no hay Organization/Tenant/Membership. Marcas, usuarios, ajustes, catálogos y cuotas comparten instalación; OWNER tiene alcance global. Los perfiles de equipo no equivalen a aislamiento entre clientes. [Esquema][schema], [permisos][permissions] | Antes de vender un SaaS multiempresa: organización/membresía, contexto verificado en servidor, claves y cuotas por organización, unicidades compuestas, relaciones que no crucen tenants, workers con tenant y suite de aislamiento. Evaluar RLS como defensa adicional. Es una línea de proyecto propia, no un cambio de nombre de Brand. |
| **B22 · P2** Secretos y suscripciones de calendario | **C:** secretos se guardan en `AppSetting.value` legibles por la aplicación. ICS usa token global; quitar `marca` de la URL devuelve todas. No es fallo si el enlace se trata como acceso global del Dueño, pero no sirve para compartir solo una marca con alguien restringido. Respuesta permite caché pública de 30 min. [Ajustes][settings], [ICS][ics] | Tokens de suscripción con alcance persistido, expiración/revocación y minimización de datos; definir comportamiento de caché. Secretos separados de ajustes ordinarios, acceso mínimo y rotación; cifrado de aplicación con gestión de claves si se requiere frente a lectores de DB/backups. No se afirma que hoy exista exposición al navegador. |

## 5. Evaluación de la base de datos

### Integridad

La estructura relacional es razonable para un equipo: claves foráneas en entidades principales, índices de búsqueda, tablas para perfiles/asignaciones, unicidad semanal, transacciones y triggers que sostienen parte de la consistencia.

Las carencias concretas están en referencias almacenadas como texto/JSON y en reglas que cruzan estados o entidades. Priorizar:

- Formatos previstos y estructura de ítems de generación: B05.
- Marca del evento respecto de su video: B07.
- Tipos estables para aprobación/checklist y transiciones: B01/B09.
- Versiones en entidades que aún permiten edición obsoleta: B10. `Asset` ni siquiera tiene una revisión de edición equivalente a la de Script.
- Estados de negocio: el catálogo de restricciones de la DB migrada sí contiene checks para trabajos, Blob, métricas, perfiles y plataformas; no hay checks equivalentes de estado para Script/ContentItem. La aplicación valida valores en varios formularios, pero SQL/importadores futuros no quedan protegidos igual. Añadir protección tras revisar datos y compatibilidad.

No todo JSON requiere una tabla: beats, reglas y preferencias pueden seguir siendo documentos si tienen schema validado y versionado. Los IDs que deben conservar integridad referencial merecen relaciones reales. Para reglas entre tablas, PostgreSQL recomienda FK/UNIQUE/EXCLUDE o triggers apropiados, no un CHECK que consulte arbitrariamente otras filas. [Documentación oficial](https://www.postgresql.org/docs/current/ddl-constraints.html).

### Índices y migraciones

Se inspeccionó el catálogo de una DB creada con las cinco migraciones. **No se confirmó el catálogo actual de Neon.** En esa instalación limpia no hay índices que empiecen por `ContentItem.scriptId`, `ContentItem.structureId`, `Script.authorId`, `Script.archetypeId` o `CalendarEvent.contentItemId`. Son candidatos para vínculos, permisos, filtros y borrados; requieren EXPLAIN con datos representativos.

Además, los índices `Task(columnId, order, id)` y `Task(columnId, brandId, order, id)` están en [un script operativo separado][indexes], no en las migraciones aplicadas por el runner. Por tanto, una instalación nueva y una que ejecutó el SQL operativo pueden tener distinto rendimiento. Incorporar comprobación de definición/validez y un procedimiento versionado; no asumir que `IF NOT EXISTS` verifica una definición correcta.

Una FK no crea automáticamente el índice de sus columnas referenciantes. Esto explica por qué tener relaciones Prisma no completa el trabajo de índices. [PostgreSQL](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-FK).

### Concurrencia y volumen

Serializable y las revisiones son buenas bases. La aplicación traduce P2034 a conflicto de edición: no conviene sustituirlo por reintento ciego cuando el usuario envió una revisión vieja. Para operaciones idempotentes internas sí puede evaluarse un reintento acotado. [Prisma v6](https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions).

El lock global de administración/sesiones protege invariantes como el último Dueño, pero serializa operaciones de usuarios distintos. Mantenerlo mientras el volumen sea pequeño; medir espera antes de descomponerlo y, en multitenencia, separar por organización donde la invariante lo permita.

## 6. Qué realmente no existe y sería una ampliación

Estos cinco grupos están fuera del conteo de 22 correcciones/mejoras. El frontend actual usa flujos manuales o no promete toda esta automatización; no se deben registrar indiscriminadamente como “bugs”.

| Ampliación | Estado actual | Qué exigiría |
|---|---|---|
| **A01. Publicar/programar en redes** | Cambiar estado y guardar URL/fecha son operaciones internas; no hay envío a TikTok/Meta/YouTube | Integraciones oficiales, permisos, tokens por cuenta, cargas, límites, webhooks y reconciliación. El OAuth Google existente corresponde a acceso, no a publicación social |
| **A02. Sincronizar estadísticas** | Captura semanal manual/CSV | Cuentas conectadas, reglas de período/unidad, deduplicación y reconciliación contra correcciones de cada plataforma |
| **A03. Notificaciones y calendario bidireccional** | Agenda interna y feed ICS de lectura; “recordatorio” no implica envío de correo/push | Preferencias, destinatarios autorizados, cola de avisos; API Calendar si se requiere edición bidireccional |
| **A04. Guion manual y versionado completo** | Crear mediante IA o duplicar existente; edición posterior e impresión | Crear desde cero sin proveedor, historial de versiones, comparación/restauración y referencia inmutable de aprobación |
| **A05. Ciclo de cuenta autoservicio** | Dueño crea cuenta y comunica contraseña; administración restablece acceso; hay cambio propio de contraseña | Invitaciones de un solo uso, recuperación por correo, verificación y eventualmente MFA; proveedor de correo y política de seguridad |

La relación entre objetivos y métricas se trata en B16 porque ya hay campos y controles visibles para objetivos; convertir todos los objetivos en automáticos requiere definir cuáles son calculables con los datos existentes.

## 7. Orden propuesto de implementación

| Etapa | Paquetes | Entregable y condición para cerrar |
|---|---|---|
| **1. Seguridad del flujo y gasto** | B01–B06; decisiones mínimas de B09 | Aprobación coherente, finalización segura de IA, cuotas por petición, extracción dentro de presupuesto, referencias válidas y salida semánticamente validada. Convertir R01–R05/R07/R08 en regresiones |
| **2. Consistencia y utilidad por perfil** | B07–B11, B16, B17 | Cerrar R06/R09, concurrencia restante, matriz de transiciones, Analista/Estrategia/Producción con sus funciones reales, parámetros robustos y semántica de métricas definida |
| **3. Operación y rendimiento** | B12–B15, B18, B19, B22 | CSV medido y recuperable, consultas con planes, mantenimiento acotado, visibilidad de trabajos/cupos, retención acordada, CI completo y calendario con alcance |
| **4. Arquitectura de crecimiento** | B20, B21 | Servicios consistentes y diseño multiempresa con migración y pruebas de aislamiento. Seleccionar A01–A05 según necesidad comercial |

B19 se trabaja desde la primera corrección aunque su consolidación esté en la etapa 3. B09 debe definir qué significa “cerrado/aprobado” antes de terminar B01/B02. B11 depende de consultas con autorización incorporada; reutilizar directamente las consultas globales del Dueño sería un retroceso de seguridad.

No daría una estimación global en días todavía: B11, B16 y B21 contienen decisiones de producto, y B13 necesita una línea base de volumen/latencia. Sí es posible trabajar por entregables verificables y asignar esfuerzo tras cerrar cada criterio. El plan no necesita contratar infraestructura adicional de entrada. El mantenimiento debe considerar que los cron de Vercel están sujetos a las funciones y límites del plan; la documentación de Hobby restringe su frecuencia a diaria. [Vercel](https://vercel.com/docs/cron-jobs/usage-and-pricing).

## 8. Próxima validación en producción

Después de implementar y probar los primeros paquetes: verificar commit desplegado, migraciones e índices reales; medir por perfil consultas/p95/errores; revisar edades de trabajos, cuotas y recuperación; y ejecutar una generación real controlada con autorización y datos elegidos. Esto permitirá cerrar la diferencia entre “correcto localmente” y “operativo en Vercel/Neon”.

La documentación y las reproducciones son los únicos cambios de esta auditoría. No se modificó la lógica del sistema ni se aplicó SQL a producción.

[repro]: C:/Users/YONELIA/Desktop/intia-main/reports/repro-backend-2026-09-16.mjs
[results]: C:/Users/YONELIA/Desktop/intia-main/reports/backend-audit-probes-2026-09-16.json
[permissions]: C:/Users/YONELIA/Desktop/intia-main/src/lib/permissions.ts:1
[scope]: C:/Users/YONELIA/Desktop/intia-main/src/lib/access-scope.ts:50
[mutations]: C:/Users/YONELIA/Desktop/intia-main/src/lib/mutations.ts:9
[auth-tx]: C:/Users/YONELIA/Desktop/intia-main/src/lib/auth-transactions.ts:8
[jobs]: C:/Users/YONELIA/Desktop/intia-main/src/lib/generation-jobs.ts:46
[schema]: C:/Users/YONELIA/Desktop/intia-main/prisma/schema.prisma:1
[metrics]: C:/Users/YONELIA/Desktop/intia-main/src/app/actions/metrics.ts:316
[ci]: C:/Users/YONELIA/Desktop/intia-main/.github/workflows/ci.yml:1
[storage]: C:/Users/YONELIA/Desktop/intia-main/src/lib/private-storage.ts:1
[script-edit]: C:/Users/YONELIA/Desktop/intia-main/src/app/actions/scripts.ts:435
[assets]: C:/Users/YONELIA/Desktop/intia-main/src/app/actions/assets.ts:18
[asset-scope]: C:/Users/YONELIA/Desktop/intia-main/src/lib/asset-security.ts:28
[link]: C:/Users/YONELIA/Desktop/intia-main/src/lib/generation-persist.ts:163
[provider]: C:/Users/YONELIA/Desktop/intia-main/src/lib/ai/providers.ts:178
[ai-index]: C:/Users/YONELIA/Desktop/intia-main/src/lib/ai/index.ts:43
[preview]: C:/Users/YONELIA/Desktop/intia-main/src/app/actions/importar-documento.ts:36
[extractor]: C:/Users/YONELIA/Desktop/intia-main/src/lib/ai/extractor.ts:260
[structure-delete]: C:/Users/YONELIA/Desktop/intia-main/src/app/actions/structures.ts:241
[ai-schema]: C:/Users/YONELIA/Desktop/intia-main/src/lib/ai/schema.ts:21
[persist]: C:/Users/YONELIA/Desktop/intia-main/src/lib/generation-persist.ts:21
[events]: C:/Users/YONELIA/Desktop/intia-main/src/app/actions/events.ts:90
[fits]: C:/Users/YONELIA/Desktop/intia-main/src/app/actions/archetypes.ts:712
[content]: C:/Users/YONELIA/Desktop/intia-main/src/app/actions/content.ts:246
[branding-import]: C:/Users/YONELIA/Desktop/intia-main/src/app/actions/archetypes.ts:489
[team]: C:/Users/YONELIA/Desktop/intia-main/src/app/actions/team.ts:48
[member]: C:/Users/YONELIA/Desktop/intia-main/src/components/member/sections.tsx:66
[member-content]: C:/Users/YONELIA/Desktop/intia-main/src/components/member/content.tsx:19
[metrics-page]: C:/Users/YONELIA/Desktop/intia-main/src/app/(app)/metricas/page.tsx:125
[member-assets]: C:/Users/YONELIA/Desktop/intia-main/src/components/member/shared.tsx:21
[maintenance]: C:/Users/YONELIA/Desktop/intia-main/src/app/api/maintenance/route.ts:6
[dispatch]: C:/Users/YONELIA/Desktop/intia-main/src/lib/generation-dispatch.ts:13
[models]: C:/Users/YONELIA/Desktop/intia-main/src/lib/ai-models.ts:11
[structure-edit]: C:/Users/YONELIA/Desktop/intia-main/src/app/actions/structures.ts:419
[trace]: C:/Users/YONELIA/Desktop/intia-main/src/lib/generation-trace.ts:1
[dashboard]: C:/Users/YONELIA/Desktop/intia-main/src/lib/metric-dashboard.ts:10
[objectives]: C:/Users/YONELIA/Desktop/intia-main/src/app/actions/brands.ts:382
[activity]: C:/Users/YONELIA/Desktop/intia-main/src/app/(app)/actividad/page.tsx:103
[scripts]: C:/Users/YONELIA/Desktop/intia-main/src/app/actions/scripts.ts:1
[package]: C:/Users/YONELIA/Desktop/intia-main/package.json:1
[settings]: C:/Users/YONELIA/Desktop/intia-main/src/lib/settings.ts:1
[ics]: C:/Users/YONELIA/Desktop/intia-main/src/app/api/calendario.ics/route.ts:23
[indexes]: C:/Users/YONELIA/Desktop/intia-main/prisma/operations/navigation-indexes.sql:1
