# Validación y plan de corrección del flujo de producción de Intia

**Actualización al 06/10/2026 — ALSOS.** El diagnóstico que sigue conserva la captura original
del día 4; sus cifras y carencias iniciales no representan el estado después de las entregas.

- Las revisiones humanas, fechas, reparto y preparación individual/props ya tienen implementación
  y validaciones de producción registradas en los informes `qa-revisiones-navegador-2026-10-04.json`,
  `qa-fechas-navegador-2026-10-05.json`, `qa-reparto-produccion-2026-10-05.json` y
  `qa-preparacion-produccion-2026-10-06.json`. El último bloque pasó 24 comprobaciones y dejó la
  marca QA archivada y su cuenta desactivada. Esto no equivale al recorrido integrado de todos los perfiles.
- Paginación/totales y conciliación bajo demanda publicados en `113e01a` y validados en producción:
  [qa-paginacion-consistencia-produccion-2026-10-06.json](qa-paginacion-consistencia-produccion-2026-10-06.json).
  Incluye Mi trabajo, coordinación,
  cadena, reparto, disponibilidad y agenda de vídeos del miembro. Los cambios de equipo recorren
  todos los pasos, sin el corte previo de 200. La vista `/cadena/consistencia` detecta diferencias,
  ofrece reparación de reflejos inequívocos y exige decisión humana para duplicidades, pasos
  faltantes y conflictos de acceso/historial. No añade un cron ni reconstruye aprobaciones.
- El nuevo bloque implementa la restricción de un solo paso secuencial pendiente en PostgreSQL
  y el recorrido integrado de los ocho perfiles. Se probó localmente con PostgreSQL real,
  sesiones nuevas, navegador, devoluciones, diseño paralelo, preparación/props y paginación.
  Se corrigieron la reapertura del checklist y la revisión tras devolver un diseño, la creación
  de checks obligatorios por miembros de coordinación y la página de disponibilidad del miembro.
  Evidencia: [qa-integracion-flujo-2026-10-06.json](qa-integracion-flujo-2026-10-06.json).
- Este nuevo bloque está pendiente de commit/push, despliegue, migración y prueba en producción.
  Primero debe desplegarse el código compatible y después aplicar
  `20261006230000_single_pending_production_step`; la migración se detiene sin cambiar filas
  si hay duplicados, incluidos los archivados. Procedimiento:
  [single-pending-production-step.md](../prisma/operations/single-pending-production-step.md).
- Después: configurar las compatibilidades humanas y arrancar explícitamente con una marca nueva.
  La activación operativa sigue siendo una decisión separada. Una cola de eventos diferidos
  no forma parte de este bloque; las escrituras actuales continúan siendo atómicas.

Validado el 4 de octubre de 2026, con consultas a Vercel y PostgreSQL de producción. La base conserva los registros consultados, pero el flujo automático completo todavía no está funcionando: está desactivado, no tiene equipos configurados y no ha creado pasos de producción. Además hay carencias de permisos, casting y control de preparación que deben resolverse antes de habilitarlo.

El usuario confirmó dos decisiones para la implementación: **arrancar con marcas nuevas** y **exigir revisión humana del guion y del vídeo final**. Las ocho marcas archivadas y sus registros permanecen como historial; no se reactivarán ni se incorporarán automáticamente al nuevo flujo.

**Evidencia y alcance**

- Dominio comprobado: https://intia-lovat.vercel.app. Despliegue `dpl_9X3uPp7Ywb2Dc2MTxk2MNooZhWkN`, estado `READY`, rama `main`, commit `107785ae5f967ea3dc428bb5c0d4ececa8b2ac7f`, igual al código revisado localmente.
- Las 13 migraciones locales están aplicadas y sus checksums coinciden, normalizando únicamente los finales de línea. Las 87 restricciones examinadas de tareas, vídeos, guiones, pasos, asignaciones y checklist están validadas.
- Todas las consultas a PostgreSQL se ejecutaron con `transaction_read_only=on`. No se crearon registros, no se cambiaron estados y no se llamó a proveedores de IA.
- Se ejecutaron las funciones reales de alcance y validación de aprobaciones del commit desplegado contra los datos de producción. Esto comprueba la selección del backend, pero no sustituye iniciar sesión con cada usuario y revisar la interfaz.
- `/login` respondió 200. Inicio, vídeos, tareas, calendario y cadena redirigieron a login sin sesión. No se completó una prueba de escritura ni un recorrido autenticado del navegador.
- La segunda lectura, en una conexión nueva a las 12:50 de Lima, conservó los mismos identificadores y campos examinados que la lectura de las 12:47: responsables, columnas y fechas de la tarea; estados, guiones vinculados y fechas de los vídeos; estados y arquetipos de los guiones; fechas de la agenda. Esto demuestra permanencia entre ambas lecturas, no una garantía universal de operaciones futuras.
- La evidencia resumida está en [validacion-produccion-backend-2026-10-04.json](C:/Users/YONELIA/Desktop/intia-main/reports/validacion-produccion-backend-2026-10-04.json). Las consultas y capturas detalladas, sin credenciales, quedaron en `.audit` y no se incluyen en Git.

**Lo confirmado en producción**

| Comprobación | Resultado e implicación |
| --- | --- |
| Automatización | `PRODUCTION_FLOW_ENABLED` tiene valor vacío y `PRODUCTION_CHAIN_ENABLED` no existe. El código exige `true` literal. Hay 0 equipos de marca, 0 ajustes de producción y 0 pasos de producción. No basta con tener las tablas migradas. |
| Archivo | Las 8 marcas están archivadas e inactivas. `ARCHIVO_TOTAL_DESDE` está vacío: el filtro global de archivo está apagado, aunque el selector de marcas ya excluye las archivadas. Las consultas de alcance generales aún admiten esos registros para cuentas con permisos. Hay que unificar la experiencia antes de arrancar con marcas nuevas. |
| Responsables | De 9 cuentas activas, 6 miembros no tienen perfiles ni acceso a marcas. Cuatro de ellos acumulan 58 asignaciones de vídeo que sus alcances no permiten consultar: Charly 15, Diego 29, Nimbrot 13 y Edward 1. Son asignaciones, no 58 tareas ni 58 vídeos diferentes. |
| Tareas sueltas | Existe 1 tarea, «Grabar con kevas», asignada a Kevin. Su responsable sí la obtiene mediante el alcance real de tareas. No hay una muestra real de tareas sueltas asignadas a miembros sin perfil. |
| Estados y fechas | Persisten 16 vídeos: 6 publicados, 2 en edición, 1 en grabación, 1 aprobado, 3 en guion y 3 en idea. Persisten también 4 eventos. Todos pertenecen a marcas archivadas. No existen pasos con los que contrastar sincronización de fechas y tareas. |
| Generación | Los 5 ítems de generación con estado `COMPLETED` tienen su guion persistido: 5 de 5. No hay ítems en cola o ejecución en esta captura. Hay además 18 fallidos y 4 cancelados históricos; estos estados no acreditan una generación exitosa ni pérdida posterior de un guion. |
| Aprobaciones históricas | Hay 4 guiones con estado aprobado y 17 casillas de aprobación marcadas, pero 0 registros `Approval`. Los validadores reales rechazaron las 4 aprobaciones de guion y las 17 casillas por falta de evidencia verificable. No deben convertirse retroactivamente en aprobaciones humanas. |
| Actores | Hay 6 guiones con arquetipo; en 2 de ellos no existe ningún usuario vinculado a ese arquetipo. Las 148 compatibilidades son `SEED`, ninguna `MANO`: el generador que filtra criterio humano no dispone de puntuaciones humanas guardadas. Elegir un arquetipo no genera por sí solo una asignación a una cuenta. |
| Preparación | Los 240 ítems de checklist son registros globales por vídeo. No existe un modelo de confirmación por integrante ni seguimiento individual de adquisición o preparación de props. |

Los valores de configuración se leyeron del entorno de producción del proyecto. Las fechas de actualización de los dos valores presentes son anteriores al despliegue vigente y sus nombres aparecen en ese despliegue; la bandera de cadena está ausente en ambos. No se accedió a variables internas de un proceso en ejecución.

El registro de procedencia `DemoSeedRecord` está vacío. Por eso este informe no clasifica los vídeos, usuarios ni aprobaciones antiguos como demostración basándose en sus nombres o fechas. La única clasificación de semilla confirmada aquí es el campo `source=SEED` de las compatibilidades.

**Qué ocurre con los fallos de la revisión local**

| Hallazgo | Estado tras contrastarlo con producción |
| --- | --- |
| Crear una tarea para alguien sin capacidad de verla | Reproducido localmente; el código desplegado contiene la validación incompleta. La tarea real consultada sí es visible. Las asignaciones de vídeo históricas muestran, por separado, el problema efectivo de acceso descrito arriba. |
| Elegir automáticamente un responsable sin la capacidad del paso | Código desplegado afectado y reproducción local confirmada. No hay instancia operativa de esta automatización: banderas apagadas y 0 pasos. |
| Borrar la fecha de grabación dejando un plazo antiguo | Código desplegado afectado tanto en cadena como en flujo anterior. Reproducido localmente para cadena. No hay pasos reales con los que confirmar una incidencia en producción. |
| Arquetipo seleccionado sin actor asignado a una cuenta | Falta funcional confirmada en código y datos. El nuevo flujo debe convertir la elección en una asignación explícita y visible. |
| Checklist global y props sin control individual | Carencia del esquema confirmado en producción. El marcado masivo al pulsar «Listo» pertenece a la cadena apagada; hay que sustituirlo antes de activarla. |
| Aprobaciones automáticas de guion y edición | Era una regla de producto escrita en el código, no una aprobación humana. No está ejecutándose por la cadena en esta producción. El usuario la reemplazó expresamente por revisión humana. |
| Acción principal guardada pese a fallar la automatización | Riesgo del código desplegado: se captura el fallo en un savepoint y varios llamadores no exigen éxito. No se demuestra una pérdida concreta actual porque no hay automatización activa ni pasos. |
| Mi trabajo limitado a 100 resultados | Límite confirmado en código; no hay un caso de truncamiento real con 0 pasos. Corregir antes de usarlo como bandeja operativa. Revisar también los límites de coordinación y cadena. |

**Flujo objetivo**

Idea → guion guardado → entrega a revisión humana → aprobación de una versión → fecha y actores confirmados → checklist individual y props preparados → grabación terminada con material → edición entregada → revisión humana del vídeo final → programación → publicación confirmada.

La fecha de publicación no acredita que se haya publicado. «Listo» significa que la persona terminó su trabajo; en guion y edición abre una revisión, no firma una aprobación. El diseño puede transcurrir en paralelo y debe bloquear la revisión final cuando sea un requisito pendiente.

**Etapa 1 — Preparar marcas nuevas y acceso correcto**

Prioridad alta. Preparar primero las validaciones de asignación y, con ellas disponibles, configurar las nuevas marcas. No habilitar automatizaciones sobre los datos históricos.

1. Incorporar un alta de marca verificable: marca activa, coordinación, guionista, filmmaker, editor, publicación y los roles opcionales necesarios. Una persona puede cubrir varios roles si tiene sus capacidades. No rellenar responsables automáticamente con cuentas antiguas por coincidencia de nombres.
2. Asignar perfiles y acceso a la nueva marca de manera explícita. Vincular actores reales con sus arquetipos y comprobar que pueden consultar el contenido que recibirán.
3. Centralizar la elegibilidad: cuenta activa, marca autorizada, permiso para consultar y capacidad para ejecutar el trabajo. Aplicarla al crear o editar tareas, asignar vídeos, configurar equipos, resolver responsables automáticamente y reasignar pasos.
4. Ante falta de responsable válido, mostrar el bloqueo a coordinación. No guardar una asignación invisible como si estuviera lista. Si posteriormente se retira acceso o un perfil, conservar el historial y exigir reasignación del trabajo pendiente; no devolver permisos automáticamente.
5. Habilitar coherentemente el archivo operativo con una época válida y comprobar selector, inicio, tareas, vídeos, guiones, calendario y generación. Mantener consulta histórica para administración. El rollback no debe volver a mezclar silenciosamente las marcas archivadas con el trabajo nuevo.

Archivos principales: [permisos](C:/Users/YONELIA/Desktop/intia-main/src/lib/permissions.ts), [alcances](C:/Users/YONELIA/Desktop/intia-main/src/lib/access-scope.ts), [tareas](C:/Users/YONELIA/Desktop/intia-main/src/app/actions/tasks.ts), [asignación de vídeos](C:/Users/YONELIA/Desktop/intia-main/src/app/actions/content.ts:522), [responsables automáticos](C:/Users/YONELIA/Desktop/intia-main/src/lib/domain/production-flow.ts:129), [archivo](C:/Users/YONELIA/Desktop/intia-main/src/lib/archive-scope.ts).

Criterio de aceptación: cada asignación nueva aparece tras recarga y nuevo inicio de sesión en la cuenta correcta. Un miembro de otra marca no puede leerla ni completarla. Las ocho marcas antiguas continúan archivadas y sus registros permanecen intactos.

**Etapa 2 — Hacer atómicos los cambios de tareas y producción**

1. Mantener en una sola transacción el cambio de estado, el cierre del paso, la tarea asociada, la asignación siguiente y su auditoría. Cuando falte una condición obligatoria, devolver un error claro y no confirmar parcialmente la transición.
2. Sustituir el tratamiento silencioso de errores de automatización. Los eventos que realmente necesiten ejecución diferida deben guardarse duraderamente en la misma transacción, con clave única, reintentos limitados y estado de fallo visible. No depender solamente del log.
3. Añadir conciliación para detectar vídeos nuevos sin paso esperado, tareas sin enlace, responsables inconsistentes y duplicados. Corregir automáticamente solo diferencias deterministas; las decisiones de personas y aprobaciones pasan a coordinación.
4. Mantener un único paso secuencial pendiente por vídeo, con diseño como excepción explícita. Conservar las claves de idempotencia y añadir una restricción apropiada para impedir duplicados concurrentes.
5. Completar tareas de producción debe pasar por la misma operación del dominio que usa «Listo». Mover una tarjeta al final no puede eludir requisitos. Dar a las tareas sueltas un estado de finalización persistido y auditable, independiente del orden visual de columnas, con reapertura explícita.

Archivos principales: [transacciones](C:/Users/YONELIA/Desktop/intia-main/src/lib/mutations.ts), [cadena](C:/Users/YONELIA/Desktop/intia-main/src/lib/domain/production-chain.ts:471), [tareas](C:/Users/YONELIA/Desktop/intia-main/src/app/actions/tasks.ts), [esquema](C:/Users/YONELIA/Desktop/intia-main/prisma/schema.prisma).

Criterio de aceptación: dos clics, un reintento y dos usuarios simultáneos producen una sola entrega y una sola tarea siguiente. Si falla esa creación, el cliente no recibe un éxito engañoso. Reiniciar el proceso no pierde trabajo pendiente.

**Etapa 3 — Incorporar las dos revisiones humanas**

1. Añadir pasos persistidos `REVISION_GUION` y `REVISION_FINAL`, con una migración aditiva para las restricciones de tipos, sus permisos, tareas y consultas. Actualizar orden de cadena, indicadores, calendario y devolución de pasos.
2. «Listo» del guionista entrega una versión a coordinación. Solo una acción humana autorizada crea `Approval` y habilita la preparación de grabación. La entrega del editor abre la revisión final bajo el mismo criterio.
3. Guardar revisor, fecha, versión y huella del contenido revisado. La revisión final debe incluir la entrega concreta del máster; cambiar el enlace o la versión del material no puede conservar una aprobación que cubría otro vídeo.
4. Implementar aprobar, devolver con motivo y volver a entregar. Editar el guion o el máster después de la aprobación invalida la autorización correspondiente y bloquea el siguiente avance hasta revisar la nueva versión.
5. Quitar la firma automática de `SYSTEM` de estas dos decisiones para el nuevo flujo. El dueño también registra una revisión humana explícita; no se reconstruyen firmas de los datos históricos.

Archivos principales: [aprobaciones](C:/Users/YONELIA/Desktop/intia-main/src/lib/approvals.ts), [entrega del guion](C:/Users/YONELIA/Desktop/intia-main/src/lib/domain/production-chain.ts:892), [entrega de edición](C:/Users/YONELIA/Desktop/intia-main/src/lib/domain/production-chain.ts:948), [reglas de estados](C:/Users/YONELIA/Desktop/intia-main/src/lib/workflow-policy.ts).

Criterio de aceptación: entregar un guion nunca lo deja aprobado automáticamente; entregar edición nunca habilita publicación por sí solo. Aprobar una versión vieja falla, y cada rechazo conserva el motivo y la nueva tarea de corrección.

**Etapa 4 — Unificar fechas y programación**

1. Definir la fecha del vídeo como fuente de la programación y mantener sincronizados los plazos de pasos y tareas dentro de su transacción. Separar claramente fecha de grabación, vencimiento del trabajo y fecha de publicación.
2. Al quitar una fecha de grabación, eliminar el plazo derivado y mostrar «Sin fecha», con bloqueo de inicio de grabación. Como `ProductionStep.dueAt` hoy es obligatorio, la corrección requiere soportar expresamente ese estado y ajustar esquema, ordenación, calendario y contadores; no introducir una fecha ficticia.
3. Reprogramar invalida las confirmaciones de asistencia afectadas. Conservar fechas originales en el historial y no reescribir entregas ya realizadas.
4. Comprobar las reglas de calendario laboral, domingo, cruces de mes y límites de medianoche en `America/Lima`. Las fechas de día completo y los instantes con hora deben conservar su semántica al guardar, renderizar y exportar.
5. Programar publicación solo después de revisión final aprobada. Marcar publicado exige confirmación y enlace de publicación; este plan no presupone publicar automáticamente en redes sociales.

Archivos principales: [fechas de grabación](C:/Users/YONELIA/Desktop/intia-main/src/app/actions/content.ts:245), [sincronización](C:/Users/YONELIA/Desktop/intia-main/src/lib/domain/production-chain.ts:1388), [flujo anterior](C:/Users/YONELIA/Desktop/intia-main/src/lib/domain/production-flow.ts:420), [días laborables](C:/Users/YONELIA/Desktop/intia-main/src/lib/working-days.ts).

Criterio de aceptación: agregar, cambiar y quitar una fecha se refleja igual en ficha, tarea, Mi trabajo y calendario después de recargar. Ninguna bandeja conserva el vencimiento anterior al quitar la fecha.

**Etapa 5 — Convertir actores y props en trabajo verificable**

1. Vincular cada papel del guion con un usuario real mediante una asignación persistida. Admitir varios actores y roles por escena; un arquetipo describe a la persona, pero no equivale a una cuenta asignada. El campo `avatar` del guion describe al público y no debe usarse como identidad del actor.
2. Proponer candidatos por compatibilidad del arquetipo con la estructura, atributos del guion y disponibilidad. Mostrar el motivo de la propuesta y permitir que coordinación elija. Priorizar criterios guardados y no añadir llamadas de IA obligatorias para repartir trabajo.
3. Preparar las compatibilidades humanas necesarias: actualmente todas son semilla. Cuando no haya criterio suficiente, mostrarlo y permitir elección manual; no presentar una puntuación inexistente como una recomendación comprobada.
4. Guardar confirmación del actor para la sesión y la versión del guion. Advertir conflictos de horario cuando exista un intervalo definido, y volver a pedir confirmación si se cambia sesión o reparto. La cuenta asignada debe ver guion, vídeo, fecha y sus pendientes.
5. Añadir modelos de requisitos de preparación y confirmaciones por responsable, incluyendo actor, cámara, producción y otros integrantes asignados. Guardar quién confirmó, cuándo y para qué versión o sesión. Cada integrante confirma sus requisitos; una sustitución por coordinación debe quedar explícitamente auditada.
6. Convertir los props indicados en las escenas en una lista persistida por producción, con responsable y estado pendiente/preparado, conservando el texto original del guion. Vincular las tareas de obtención cuando sean necesarias.
7. Separar preparación previa de finalización de grabación. Bloquear el inicio mientras falten confirmaciones o props obligatorios, y permitir cerrar grabación solo con material y checklist correspondiente. El botón «Listo» no puede confirmar en bloque la asistencia ni la preparación de otros integrantes.

Archivos principales: [persistencia del guion](C:/Users/YONELIA/Desktop/intia-main/src/lib/generation-persist.ts), [esquema](C:/Users/YONELIA/Desktop/intia-main/prisma/schema.prisma), [asignaciones](C:/Users/YONELIA/Desktop/intia-main/src/app/actions/content.ts:522), [cierre de grabación](C:/Users/YONELIA/Desktop/intia-main/src/lib/domain/production-chain.ts:935).

Criterio de aceptación: seleccionar un actor deja una relación con su cuenta, visible tras otro login. No se inicia grabación con confirmaciones requeridas o props pendientes. Cambiar el actor o la fecha no hereda confirmaciones anteriores como válidas.

**Etapa 6 — Completar las bandejas y el circuito de verificación**

1. Paginar Mi trabajo y calcular totales sobre todo el conjunto autorizado. Aplicar el mismo criterio a coordinación, cadena y procesos por lote; informar si quedan resultados pendientes de cargar.
2. Mostrar bloqueos concretos: sin fecha, sin responsable válido, esperando actor, props pendientes, esperando revisión o fallo de automatización. Todos deben tener una acción de resolución y un responsable visible.
3. Invalidar y refrescar las vistas necesarias después de cada mutación. Revalidar con dos sesiones independientes y conservar la protección contra cambios concurrentes.
4. Corregir la prueba que falla en Windows por finales CRLF en `role-lists.test.mjs`; no es un fallo funcional demostrado de producción. La revisión local previa obtuvo 193 pruebas aprobadas, 1 omitida y ese fallo, además de 5 diagnósticos locales que reprodujeron las carencias señaladas.

Criterio de aceptación: una cuenta con más de 100 pendientes accede a todos y obtiene el total correcto; cerrar uno actualiza la ficha, la tarea, el contador y el calendario sin perder elementos de otras páginas.

**Orden de implementación y salida a producción**

1. Preparar las etapas 1 y 2 como base de permisos y consistencia. Diseñar juntos los contratos de datos de revisiones, fechas y preparación antes de cerrar las migraciones de las etapas 3 a 5.
2. Aplicar migraciones aditivas y probar el flujo completo en PostgreSQL aislado. Preservar los registros anteriores y dejar las banderas apagadas mientras la implementación esté incompleta.
3. Probar creación de idea, generación con proveedor simulado, revisión, asignación, reprogramación, preparación, grabación, edición, revisión final, programación y publicación. En cada paso comprobar la escritura, la nueva lectura y el acceso desde la cuenta destinataria.
4. Incluir pruebas de rechazo, devoluciones, permisos revocados, actor sustituido, fecha eliminada, doble clic, concurrencia, reintento, reinicio, fallo al crear el siguiente paso, archivos históricos y más de 100 tareas. Comprobar que los registros de otra marca nunca aparecen.
5. Tras revisar los cambios, desplegar y verificar el SHA y las migraciones de esa versión. Configurar una primera marca nueva con usuarios y roles elegidos por el dueño, y activar el flujo solo para esa marca. La habilitación de la cadena debe ocurrir después de retirar las aprobaciones automáticas.
6. Ejecutar una prueba operativa con cuentas controladas y evidencia identificable en producción, verificando recarga y nuevo login de cada perfil. Una llamada real a IA, si se necesita para esa aceptación, se autoriza y mide aparte; el resto puede usar un guion de prueba ya guardado.
7. Ampliar a las demás marcas nuevas cuando no haya asignaciones invisibles, estados parciales, fechas divergentes ni revisiones omitidas. Si falla, detener nuevas automatizaciones y mantener la información creada para diagnóstico; no borrar datos ni volver a un esquema incompatible.

**Ejecución iniciada — primer bloque local, 04/10/2026**

Implementado el núcleo de elegibilidad de la etapa 1 y la propagación de errores de la etapa 2. `src/lib/work-assignees.ts` concentra la validación de cuenta activa, marca vigente, acceso y capacidades. Se aplica a tareas, funciones del vídeo, equipo de marca, asignaciones automáticas y reasignaciones de pasos. La ausencia de perfiles o de capacidad devuelve un rechazo legible; asignar trabajo nunca concede permisos. Al retirar el perfil, la asignación anterior tampoco permite cerrar el paso del flujo anterior.

El equipo de una marca puede prepararse con la automatización apagada. El selector del equipo filtra funciones compatibles, las marcas archivadas quedan sin edición de equipo y el formulario de asignación del vídeo conserva el borrador y muestra el rechazo del servidor.

Los fallos de los ganchos de producción ahora abortan la transacción que los origina. Una prueba con un trigger de fallo real en PostgreSQL comprueba que crear un vídeo no deja vídeo, checklist, asignación, paso, tarea ni auditoría parciales; el reintento deja una sola entrega completa. Las omisiones esperadas por banderas apagadas o falta de equipo conservan su semántica anterior.

Validación del bloque: 455 pruebas generales aprobadas y 1 omitida; 25 pruebas de integración aprobadas en cuatro suites de PostgreSQL 16 local efímero (`work-assignees`, `production-flow`, `production-chain`, `production-chain-actions`); TypeScript y ESLint sin errores. Las pruebas incluyen nueva conexión, nuevo inicio de sesión, aislamiento entre marcas, persistencia de fecha/destinatario/finalización, perfiles incompatibles, baja de cuenta, archivo de marca, retirada de perfil, concurrencia e idempotencia. Se corrigió también la prueba CRLF de Windows mencionada en la etapa 6. Las suites antiguas aún comprueban las aprobaciones automáticas existentes: su resultado **no** acredita la futura revisión humana.

`npm run build` y la comprobación de arranque seguro del build nuevo también finalizaron correctamente. El build conserva una advertencia de dependencia dinámica de `@vercel/queue` a través de Workflow. Evidencia local en `.audit/work-assignments-*-2026-10-04.log`; las cuatro suites usan bases efímeras creadas con las 13 migraciones existentes y eliminadas al finalizar. PostgreSQL quedó detenido. Las lecturas con sesiones nuevas se comprobaron mediante acciones y filtros reales contra PostgreSQL; no se realizó todavía una validación visual autenticada de los formularios en navegador.

Quedan pendientes el alta operativa y selección de personas para las marcas nuevas, las bandejas y conciliación de bloqueos, la activación coherente del archivo, el estado explícito de tareas sueltas y las restricciones adicionales de la etapa 2, además de las revisiones humanas, fechas sin plazo, casting, preparación individual, props y paginación. Este bloque no modifica el esquema ni requiere migraciones. Las pruebas no modificaron datos ni banderas de producción. Las dos revisiones humanas deben estar terminadas antes de habilitar la cadena.

**Verificación previa a publicación — 04/10/2026**

Por solicitud del usuario se repitieron `npm run test:unidad` (455 aprobadas, 1 omitida), las cuatro suites PostgreSQL indicadas (25 aprobadas) y TypeScript antes del commit y push. Evidencia en `.audit/publish-work-assignments-*-2026-10-04.log`. La compilación y ESLint ya estaban aprobados para este código. La publicación de Git y el despliegue automático de Vercel se verifican por separado; este informe no acredita todavía el flujo completo en producción.

**Segundo bloque implementado localmente — 04/10/2026**

Las tareas tienen estado persistido (`PENDIENTE`, `HECHO`, `CANCELADO`), fecha e identidad de finalización. Las tareas sueltas permiten terminar y reabrir desde el tablero y la lista personal, con permiso, revisión del formulario y auditoría. Su columna no determina si están terminadas. Las tareas vinculadas a producción reflejan el estado de su paso y deben completarse desde ese flujo. Los contadores de pendientes y los avisos de vencimiento usan el estado persistido.

La cadena incorpora `REVISION_GUION` y `REVISION_FINAL`, visibles en Mi trabajo, Cadena, ficha y calendario. Entregar guion o edición abre la revisión correspondiente sin aprobar automáticamente. Coordinación, o un Dueño activo como respaldo cuando procede, firma la versión entregada con su propia identidad; se comprueba su capacidad antes de aprobar o devolver. Se guarda la huella de revisión y, para el máster, el enlace y número de entrega. Cambiar el contenido o volver a entregar exige otra revisión. Las devoluciones registran el motivo y reabren la tarea existente del guionista o editor. Ni mover una tarjeta a «Listo», ni el cambio manual de estado, ni una excepción del Dueño permiten sustituir la aprobación humana. Las firmas automáticas históricas no se convierten en firmas humanas.

Se reprodujo localmente el conflicto entre dos formularios abiertos sobre el mismo vídeo: guardar la fecha deja antigua la revisión del formulario de estado. El servidor ahora devuelve un aviso legible que pide recargar y revisar los cambios; conserva la protección contra sobrescrituras. Esta corrección todavía no se ha verificado en producción.

Validación: `npm run test:unidad` terminó con **457 pruebas aprobadas y 1 omitida**; **81 pruebas PostgreSQL aprobadas en nueve suites** (`human-reviews`, `production-chain`, `production-chain-actions`, `production-flow`, `work-assignees`, `consistency`, `completion`, `workflow`, `secrets`). Se probaron identidades y permisos distintos, lectura posterior, entrega sin aprobación, devoluciones, versión obsoleta, doble aprobación concurrente, publicación, rechazo de atajos y rollback ante un trigger que impide crear la revisión siguiente. Las bases efímeras aplicaron las 14 migraciones; una prueba adicional ejecutó la migración nueva sobre registros históricos representativos y verificó que conserva las filas sin inventar autores o cierres por posición de columna. PostgreSQL 16 local se ejecutó en UTC y quedó detenido. TypeScript, ESLint, build y `git diff --check` finalizaron correctamente; persiste la advertencia conocida de dependencia dinámica de `@vercel/queue`. Evidencia: `.audit/human-reviews-all-unit.log`, `.audit/human-reviews-verified-postgres.log`, `.audit/human-reviews-lint.log` y `.audit/human-reviews-build.log`. Las pruebas de UI de este bloque comprueban renderizado y acciones; no son una validación visual autenticada en navegador.

**Salida pendiente:** aplicar `20261004090000_human_reviews_task_completion` antes de ejecutar la nueva versión, publicar el código y comprobar el despliegue. La migración es aditiva y solo deriva cierres históricos desde pasos de producción; las tareas antiguas sin paso permanecen pendientes hasta que una persona las revise. Mantener `PRODUCTION_FLOW_ENABLED` y `PRODUCTION_CHAIN_ENABLED` apagadas hasta la validación y activación explícita para marcas nuevas. Este segundo bloque no se ha commiteado, pusheado ni desplegado, y sus pruebas no modificaron datos o banderas de producción.

La huella del máster cubre el enlace y la entrega registrada en ALSOS: no detecta que alguien sobrescriba bytes de un archivo externo manteniendo el mismo enlace. Deben usarse enlaces de versión o registrar una nueva entrega al cambiar el archivo. Siguen pendientes las fechas sin plazo, casting por persona, confirmaciones individuales, props, paginación y los trabajos de conciliación, eventos duraderos y restricciones adicionales de la etapa 2. El bloque no acredita el cierre de todas las etapas del plan.

**Preparación de la publicación autorizada — 04/10/2026**

El usuario autorizó commit, push y migración; la comprobación funcional en producción se realizará después. Antes de publicar se confirmó que `main` y `origin/main` coinciden en `bb5c58dc35ced6ea52d9a3935265c521dfd445b4`. El destino Vercel Intia usa Neon PostgreSQL 18.6, con 13 migraciones aplicadas y únicamente la nueva pendiente; FLOW y CHAIN continúan apagadas.

Se tomó un respaldo completo de `public` e `intia_ops`, cifrado con Windows DPAPI, y se restauró en PostgreSQL 18 local. Coincidieron las filas y la huella del esquema. La copia recibió la migración 14 y conservó los datos históricos; se verificaron sus cinco columnas nuevas, restricciones y estados derivados de las tareas enlazadas. El ensayo completo `scripts/rehearse-migration.mjs` también pasó con restauración y se actualizó para cubrir esta migración sin consultar columnas futuras durante las etapas históricas. Evidencia local protegida en `.audit/human-reviews-release-*` y `.audit/human-reviews-full-rehearsal.log`.

Orden de operación: registrar el commit, aplicar su migración aditiva y hacer push. Así el despliegue automático de `main` encuentra el esquema compatible. No se crean registros funcionales de prueba ni se activan las automatizaciones durante esta publicación; la verificación operativa posterior sigue pendiente.

**Correcciones de interfaz y reprogramación implementadas localmente — 05/10/2026**

Este bloque responde a los puntos 1 y 2 del siguiente trabajo acordado tras la prueba de navegador. La ficha deja de ofrecer formularios de material de entregas cerradas cuando la cadena está activa; los enlaces siguen disponibles. Los formularios de estado, planificación y grabación incorporan revisiones nuevas al refrescar si no hay cambios sin guardar. Un borrador conserva sus datos y su revisión anterior, por lo que un cambio concurrente devuelve conflicto. La ayuda de equipo explica ambas revisiones humanas.

Quitar la fecha de grabación deja el paso pendiente con `dueAt = null` y su tarea sin plazo, conserva el responsable y los identificadores, y lo muestra como «Sin fecha». No crea una fecha falsa en el calendario ni en el feed ICS. La fecha se sincroniza entre ficha, paso y tarea incluso cuando el paso es manual; las notas de avance se conservan. Cambiar de día vuelve a abrir los checks logísticos previos (actor, props y locación) sin retirar la aprobación del guion. No se inicia ni termina la grabación sin fecha y preparación obligatoria, y «Listo» ya no marca automáticamente la preparación. Las entregas terminadas conservan su fecha histórica.

La sincronización explícita desde la ficha sigue funcionando con los interruptores apagados, sin crear pasos. Con la cadena apagada, el formulario genérico de una tarea enlazada rechaza cambios de marca, responsable o fecha y remite a la ficha. Con la cadena activa, cambiar el plazo desde tarea/paso exige también permiso para planificar el vídeo y se confirma todo en una sola transacción.

Validación local: **459 pruebas generales aprobadas y 1 omitida**, **44 pruebas PostgreSQL aprobadas en cinco suites** (`human-reviews`, `production-chain`, `production-chain-actions`, `production-flow`, `workflow`), TypeScript, ESLint y build. Las suites de revisiones y acciones se volvieron a ejecutar tras la protección de edición con la cadena apagada. Se probó la eliminación de fecha, reasignación desde tarea y paso, nueva sesión de Cámara, calendario sin evento, preparación invalidada, fechas históricas y rollback de vídeo/paso/tarea/checklist/auditoría ante un fallo forzado en la tarea. El ensayo de migración sobre registros históricos representativos y respaldo/restauración pasó.

Además, una página local con los componentes React reales (`EditForm`, `RevisionField`, `WorkflowStatusFields`) se comprobó en el navegador: un avance externo actualiza el selector sin recarga; un borrador conserva texto y revisión y recibe conflicto; un guardado válido permite incorporar el siguiente avance. Esta comprobación usa acciones simuladas en la página; las acciones reales y persistencia se validaron por separado en PostgreSQL. No es una validación de la aplicación desplegada.

Evidencia: `.audit/dates-all-unit.log`, `.audit/dates-final-postgres.log`, `.audit/dates-task-guard-postgres.log`, `.audit/dates-rehearsal.log`, `.audit/dates-typecheck.log`, `.audit/dates-lint.log`, `.audit/dates-build.log`. El build mantiene la advertencia conocida de `@vercel/queue`.

**Salida de este bloque:** pendiente commit/push, aplicar `20261005090000_recording_without_date` antes de ejecutar la versión nueva y validar el despliegue en producción. Este trabajo no modifica datos ni banderas de producción. Casting por avatar, preparación individual por integrante, inventario de props, paginación y conciliación siguen en los bloques posteriores del plan.

**Preparación de la publicación autorizada — 05/10/2026**

El usuario autorizó commit, push y migración. Se confirmó contra el remoto que `main` y `origin/main` coinciden en `3ee32122dec1b0c9dbfd3f789fff3d28f89797a0`. Producción usa ese commit y Neon PostgreSQL 18.6, con 14 migraciones aplicadas y únicamente `20261005090000_recording_without_date` pendiente. FLOW y CHAIN permanecen apagadas.

Se tomó un respaldo nuevo de `public` e `intia_ops`, cifrado con Windows DPAPI. Su restauración en PostgreSQL 18 local reprodujo las filas y la huella del esquema. La copia recibió la migración 15; las 42 tablas de negocio conservaron todos sus datos, y los cuatro controles de integridad devolvieron cero inconsistencias. Se verificaron `dueAt` nullable y la restricción que solo permite fecha nula en grabaciones no terminadas. La migración es transaccional, con espera de bloqueo de 5 segundos y ejecución máxima de 60 segundos. Evidencia protegida en `.audit/dates-release-*`.

Orden de publicación: commit, migración desde ese commit y push, para que el despliegue automático encuentre el esquema compatible. Esta operación no habilita las automatizaciones; la verificación funcional autenticada en producción corresponde al paso posterior.
