# CONTRATO INTERNO DEL PROYECTO

Documento de referencia obligatorio. Todo el código nuevo debe respetarlo al pie de la letra.

## Stack

- Next.js 15 App Router + React 19 + TypeScript estricto.
- Tailwind CSS v4 (sin `tailwind.config`; los tokens viven en `src/app/globals.css`).
- Prisma 6 + PostgreSQL en local y producción, con migraciones versionadas.
- **Server Components por defecto.** `"use client"` solo cuando hace falta estado o eventos.
- **Server Actions** para escrituras del usuario. Los callbacks técnicos de autenticación, Workflow y mantenimiento usan rutas protegidas; no sustituyen los controles de sesión y permisos.
- Iconos: `lucide-react`.
- Identidad Intia: blanco y cobre, fuente Manrope local; tema oscuro y colores propios de marcas/estados conservados. shadcn/ui (Radix) selectivo en `src/components/ui/`; componentes de negocio compatibles en `src/components/ui.tsx`. No convertir toda la aplicación en cliente ni sustituir formularios nativos para cambiar su estilo. Ver `reports/identidad-intia-2026-09-25.md`.

## Idioma

- Todo el texto visible va en **español con tildes correctas** (`ó`, `í`, `ñ`, `¿`, `¡`).
- Los identificadores de código van en inglés o español sin tildes.
- Los valores de enum en base de datos van en MAYÚSCULAS sin tildes (`PUBLICADO`, `GRABACION`).

## Rutas

| Ruta | Qué es |
|---|---|
| `/` | Panel general del Dueño; inicio de trabajo del Equipo |
| `/manual` | Manual de procedimientos: una tarjeta por rol, en orden de flujo (ver «Manual de procedimientos») |
| `/manual/[rol]` | Misión, procedimiento, traspasos e indicadores del rol; formación por nivel (`?nivel=`) |
| `/manual/[rol]/[modulo]` | Lecciones (`?leccion=`), videos de YouTube y escenas 3D del módulo |
| `/tutorial` | «Cómo se usa»: recorrido del Dueño; perfiles, flujo y ubicación para el Equipo |
| `/calendario` | Calendario mensual: grabación y publicación de cada video, agenda y detalle del día (`?dia=`); con la cadena de entregas, los pasos con plazo y «Solo lo mío» (`?mio=`) |
| `/contenido` · `/contenido/[id]` | Lista y ficha de cada video (panel «Producción» con el «Listo» de cada rol, ancla `#produccion`) |
| `/cadena` | Cadena de entregas: pasos abiertos por video, vencidos, sin asignar, avisos y atascos (`?paso=`, `?persona=`, `?vencidos=`). ENCARGADO (STRATEGY) y Dueño; solo con `PRODUCTION_CHAIN_ENABLED` |
| `/marcas` · `/marcas/[id]` | Marcas, identidad, brief, objetivos; `?vista=productos` y `?vista=equipo` solo con su interruptor |
| `/generador` | Generador de guiones con IA |
| `/generador/trabajos` · `/generador/trabajos/[id]` | Historial, progreso y recuperación de generaciones |
| `/guiones` · `/guiones/[id]` | Biblioteca y visualizador de guiones (`?escena=`) |
| `/estructuras` · `/estructuras/[id]` | Formatos ganadores + prompt + PDFs |
| `/arquetipos` · `/arquetipos/[id]` | Personas frente a cámara: perfil, marca personal y compatibilidad |
| `/metricas` | Visualizador de métricas |
| `/equipo` | Personas |
| `/mi-perfil` | Datos y documentos de la cuenta propia; «Mi calendario en Google» con `CALENDAR_FEED_PERSONAL` |
| `/sin-acceso` | Explicación del acceso denegado |
| `/actividad` | Log de auditoría |
| `/ajustes` | Claves de IA, entrada con Google y calendario |

Rutas de API (las únicas que existen, y cada una por un motivo):

| Ruta | Por qué no es una Server Action |
|---|---|
| `/api/auth/google` · `/api/auth/google/callback` | Google necesita redirigir a una URL |
| `/api/calendario.ics` | Google Calendar la pide desde sus servidores, sin sesión (enlaces del Dueño y, con `CALENDAR_FEED_PERSONAL`, el de cada persona) |
| `/api/assets/[id]` | Devuelve los bytes de un archivo |
| `/api/modelos-3d/[archivo]` | Devuelve los bytes de los personajes 3D del manual solo con sesión (uso interno) |
| `/api/logout` | Borra la cookie y redirige |
| `/api/maintenance` | Mantenimiento diario autenticado con CRON_SECRET |
| `/.well-known/workflow/v1/*` | Rutas generadas por Workflow SDK; no se editan manualmente |

Las pantallas de negocio viven bajo `src/app/(app)/`, con `requireUser()` y carcasa. Las rutas técnicas están fuera y aplican su autenticación específica.

## Generación durable, cuotas y almacenamiento

- Gemini recibe un esquema derivado del contrato Zod con todos los campos, tipos, enums y obligatorios, pero sin las restricciones de tamaño/rango que elevan la complejidad de compilación del proveedor (`geminiScriptSchema` en `src/lib/ai/gemini-schema.ts`; `GEMINI_ESQUEMA_SIMPLE="false"` vuelve al esquema anterior con límites). El prompt y la validación local conservan esos límites; no guardar una respuesta sin validarla. HTTP 408/504 y `DEADLINE_EXCEEDED` son timeouts, nunca evidencia de cuota ni motivo de descenso por saturación. Los logs sólo admiten códigos/reasons cerrados y tamaño del esquema, sin mensajes crudos. Ver `reports/diagnostico-gemini-400-504-2026-09-25.md`.
- La acción de generar registra un trabajo y lo despacha a Workflow. Nunca mantiene una llamada de IA ligada a la pestaña del usuario.
- Idempotencia por usuario/clave de envío; un guion por elemento de trabajo. Reclamar cada elemento con token y concesión temporal. Comprobar usuario activo y versión de acceso antes de llamar y antes de guardar.
- No pasar prompts, documentos, claves ni respuestas a los argumentos/resultados del workflow. El ejecutor recibe sólo el ID; los datos se resuelven en el paso autorizado y quedan en PostgreSQL.
- Tres intentos máximos por elemento y reintentos internos de proveedores desactivados. `createAiRequest` autoriza y registra atómicamente cada petición, sin cupos internos: el fallback de esquema cuenta como segunda llamada del mismo intento. Cada intento comparte un plazo de 240 s entre sus peticiones, dentro de una concesión de 360 s. Una caída entre respuesta externa y persistencia puede consumir otra llamada: no prometer ejecución externa exactamente una vez. Los contadores son telemetría; las variables antiguas `AI_DAILY_CALLS`, `AI_USER_DAILY_CALLS`, `AI_DAILY_JOBS`, `AI_DAILY_DISPATCHES` y `AI_32D_DISPATCHES` no bloquean llamadas, trabajos ni despachos.
- Saturación de Gemini: un HTTP 503 clasificado como `provider_overloaded` permite descender automáticamente `gemini-3.8-flash` → `gemini-3.7-flash` → `gemini-3.6-flash`, usando el siguiente intento de los tres existentes y conservando la espera de 30/60 s. La decisión se guarda en `GenerationItem.diagnostics.modelFallback` junto con `QUEUED` bajo la misma concesión, por elemento; una reanudación continúa desde ese modelo y no regresa al inicial. El pedido original no se modifica. No se cambia de proveedor, de clave ni de facturación. Cuota, autenticación, modelo desconocido, salida inválida, timeout y fallos de servidor sin evidencia de saturación no provocan descensos. En el último modelo quedan los reintentos normales disponibles. Pantalla, guion y trazas identifican el modelo efectivo. No reactiva trabajos terminales. Ver `reports/fallback-modelos-2026-09-25.md`.
- Reintento manual: desde un trabajo terminado, el botón «Reintentar guiones no generados» crea un sucesor con solo elementos `FAILED`/`CANCELLED` sin `Script`. Conserva el original y sus éxitos. ID opaco derivado del origen y bloqueo transaccional garantizan un único sucesor, incluso entre usuarios; volver a pulsar devuelve ese trabajo, y otro reintento se solicita desde su propia pantalla. Se revalidan sesión, permiso/marca, estructuras activas, destino e interruptor; máximo dos trabajos activos del solicitante. El sucesor pertenece a quien pulsa y conserva el pedido; el usuario puede elegir Claude o Gemini usando la clave compartida actual. Mantener el proveedor conserva el modelo del pedido; cambiarlo resuelve el modelo predeterminado del nuevo proveedor en Ajustes o catálogo, sin heredar un modelo incompatible del pedido o formato. Se verifica que exista configuración de clave antes de registrar, sin descifrarla para mostrar disponibilidad. Si otra pestaña ya creó el sucesor con otro proveedor, se avisa y se actualiza el enlace «Ver reintento»; no se crea un segundo trabajo. El sucesor usa referencias actuales, inicia sus propios tres intentos y conserva `retryOfJobId` en el payload interno. Con éxitos previos se omite el vínculo al video para no reemplazarlo. Un pedido eliminado por retención no se reconstruye. Despacho posterior al commit; errores públicos controlados. No requiere migración. Ver `reports/reintento-manual-guiones-2026-09-25.md` y `reports/historial-reintentos-proveedor-2026-09-26.md`.
- Generaciones pendientes: acceso «Generaciones» en el menú y «Guiones no generados» desde la biblioteca para perfiles con `scripts.generate`. Siempre lista solicitudes propias dentro de `generationScope`, también para Dueño. Una tarjeta por cadena: se excluye cualquier trabajo con sucesor determinista, antes de contar y paginar. Solo muestra formatos `QUEUED`/`RUNNING`/`FAILED`/`CANCELLED` sin `Script`; una cadena completada desaparece y sus guiones quedan en la biblioteca. «Todos los pendientes» incluye activos; «Por reintentar» solo terminales fallidos, parciales o cancelados. SQL parametrizado y snapshot `RepeatableRead` para 20 solicitudes únicas por página, total y ajuste de página fuera de rango; nunca se descargan todos los payloads para agruparlos en el navegador. El sucesor se detecta por ID aun después de redactar el payload. La página se refresca cada 8 s mientras tenga trabajos activos visibles y la pestaña esté en primer plano. Los recibos técnicos de ejecución se conservan fuera de esta lista para idempotencia, auditoría y vínculos de guiones; no se crea otra copia de los pedidos. El estado público expone proveedor/modelo solicitados y nombres de formatos, nunca el payload ni claves.
- El payload del trabajo (`payloadSchema` en `src/lib/generation-jobs.ts`) admite, además de la entrada del modelo, `contentItemId` (la tarjeta del calendario a la que se unirá el **primer** guion) y `ctaMode` (`venta | comunidad`; ausente = `venta`). `enqueueGeneration` valida el modelo con `resolveAiModel`, exige entre una y tres estructuras (`AI_MAX_BATCH`), máximo dos trabajos activos por persona, y comprueba la tarjeta dentro de la transacción (existe y está en el alcance de `scripts.generate`, sin `scriptId`, en `IDEA` o `GUION`, misma marca que el payload) antes de registrar `ai:jobs:<día>` como telemetría. Registrar un trabajo que ya no puede unirse gastaría llamadas para nada.
- Vínculo del primer guion: `enqueueGeneration` captura `expectedVideoUpdatedAt` desde DB y rechaza videos con aprobación final. Al persistir el primer elemento completado, `vincularGuionAVideo` comprueba dentro de la misma transacción permiso, marca, estado Idea/Guion, ausencia de aprobación y vínculo, y revisión esperada. Devuelve `{ linked, warning }`; condiciona el `updateMany` a revisión, estado y vínculo vacío. El video hereda `structureId` y pasa de Idea a Guion. Si cambió, conserva el guion independiente, guarda `GenerationItem.linkWarning` y lo muestra mediante `job.error`. Un trabajo antiguo sin revisión capturada tampoco se une automáticamente. Los demás guiones del lote quedan independientes.
- Antes de crear el guion, `response_validate` verifica límites del esquema, continuidad temporal, plano/acción, voz o texto según tipo, correspondencia y orden de beats, y duración (15%, mínimo 3 s). Una respuesta inválida queda `FAILED` con motivo legible y sin nueva llamada automática; también al recuperar una respuesta previamente guardada. JSON Schema y Zod comparten definición.
- Rechazo de clave: si `esErrorDeAutenticacion(error)`, el elemento queda `FAILED` sin reintento y los elementos `QUEUED` restantes del trabajo pasan a `FAILED` con `MOTIVO_CLAVE_RECHAZADA` («No se intentó: la clave fue rechazada…»): repetir la llamada con la misma clave solo gastaría intentos. El aviso final distingue «fallaron» de «no se intentaron». Solo se reintenta (`QUEUED`, `availableAt` = 30 s × intento) un `AiError` con `retryable` (cuota, servidor, timeout) y mientras queden intentos. Las trazas por etapa (`generation_trace`) llevan identificadores, duración y diagnósticos permitidos: nunca la clave, el prompt, la respuesta ni el error crudo del SDK. Se correlacionan con `jobId`, `itemId`, `attempt` y `traceId`; un fallo del logger no altera la operación. Ver `reports/logs-generacion-2026-09-15.md`. Estado final del trabajo: `COMPLETED`, `PARTIAL` o `FAILED`.
- Adjuntos nuevos en Blob privado al activar el flag. Inventario durable antes de subir, SHA-256 y tamaño verificados antes de adjuntar. Guardar `data` o `blobId`, nunca ambos ni ninguno. Los adjuntos antiguos siguen siendo descargables.
- Borrar un adjunto en DB encola la limpieza del objeto, incluso al eliminar su entidad dueña. No eliminar objetos activos ni omitir la cola ante errores de red.
- Importes `Decimal(24,6)`: parsear cadenas, validar hasta seis decimales y serializar cadenas hacia formularios. `Number` sólo para presentación, nunca como paso previo a persistir dinero.
- `ContentItem.platforms` se conserva como entrada compatible; un trigger transaccional mantiene `ContentPlatform`, utilizada para filtrar con índice.
- `ContentItem.structureIds` se conserva como entrada compatible; un trigger mantiene `ContentPlannedStructure` con orden y FK restrictiva. `GenerationItem.structureId` también tiene FK. Eliminar una estructura referenciada la desactiva; los trabajos ya registrados pueden terminar, pero no se encolan nuevos con esa estructura. Migración y preflight: `20260916180000_backend_priorities` y `prisma/operations/preflight-backend-priorities.sql`; cualquier huérfano se resuelve explícitamente antes de migrar, sin descartar historial.
- Mantener los recursos en Hobby/Free. Ninguna ampliación de plan ni gasto adicional automático. Los límites de la aplicación no representan el uso de otros proyectos de la cuenta.

## Autenticación y permisos

**Solo hay dos posiciones.** No se añaden más.

```ts
import { requireUser, requirePermission, requireLevel, can, LEVEL } from "@/lib/auth";

const user = await requireUser();              // en páginas
const user = await requirePermission("content.plan"); // capacidad específica + filtro de registro
const user = await requireLevel(LEVEL.OWNER);  // eliminar, equipo, ajustes
can(user.role, LEVEL.OWNER)                    // para ocultar botones en la UI
```

| Posición | Nivel | Puede |
|---|---|---|
| `OWNER` (Dueño) | 2 | Todo. Es la única que **elimina**, gestiona personas y toca ajustes. |
| `MEMBER` (Equipo) | 1 | Acceso según perfiles de trabajo y marcas autorizadas. **Sin administración ni borrado de entidades completas.** |

La regla es literal: **toda acción que destruya una entidad completa exige
`LEVEL.OWNER`**. Eso incluye marca, objetivo, video, guion, estructura, arquetipo,
métrica, archivo, usuario y evento de agenda.

Las cuatro excepciones a propósito, que son *mover* y no *destruir*, y por eso van
con la capacidad operativa correspondiente y acceso al padre: quitar un check de la lista, quitar una escena de un guion,
quitar una asignación de persona y desvincular un guion de un video.

Todo, de las dos posiciones, queda firmado en el log de actividad.

### Posición no es lo mismo que función

Que solo haya dos posiciones **no** significa que solo haya dos oficios. Son dos ejes
distintos y hay que mantenerlos separados:

| Eje | Qué responde | Cuántos hay | Dónde vive |
|---|---|---|---|
| **Posición** | ¿Qué puede destruir? | Exactamente 2, y no se añaden | `User.role` + `LEVEL` |
| **Función** | ¿Qué le toca hacer? | Catálogo abierto | Su propio modelo |

Editor, actor, filmmaker, diseñador de piezas, analista de datos, trafficker: todo eso son
**funciones**, y una misma persona puede llevar varias a la vez. Ninguna de ellas concede ni
quita el derecho a eliminar: eso sigue siendo `LEVEL.OWNER` y solo `LEVEL.OWNER`.

Si alguna vez hace falta un tercer nivel de **permiso**, no se añade sin más: hay que revisar
cada llamada a `can()` y a `requireLevel()` del proyecto, porque un nivel intermedio nuevo
concede en silencio todo lo que hoy exige `LEVEL.MEMBER`. Es exactamente el fallo que ya se
cazó una vez en `ROLE_LEVEL`, cuando unas entradas heredadas de un modelo anterior le daban
permisos de equipo a roles que ya no existían.

### Perfiles operativos y alcance

Los nueve perfiles combinables, su matriz y la activación están en [Perfiles y permisos](reports/perfiles-permisos-2026-09-09.md). La política vive en `src/lib/permissions.ts` y los filtros en `src/lib/access-scope.ts`. Se aplican en páginas, acciones, descargas, CSV, tareas e IA. La cookie de marca no concede acceso.

Equipo, Actividad y Ajustes requieren Dueño. Cambiar UserWorkProfile o UserBrandAccess revoca sesiones y aumenta la versión de acceso mediante triggers. No se asignan perfiles por inferencia durante la migración. Sin perfiles, un miembro conserva inicio, ayuda, Manual de procedimientos y Mi perfil.

Las funciones de video en Assignment no sustituyen los perfiles de acceso. Los perfiles combinados suman capacidades sin ampliar el alcance de una capacidad distinta. Generar/escribir no concede aprobar o publicar. Publicación requiere la revisión final aprobada de postproducción; APROBADO sigue siendo una etapa previa a grabación.

El equipo no edita escenas, metadatos, vínculos ni adjuntos de un video con revisión final aprobada o en PROGRAMADO/PUBLICADO. Un guion compartido queda protegido si cualquiera de sus videos está cerrado. Las guardas y la aprobación serializan cambios con locks del guion y del video. Retirar la aprobación exige un motivo (5–1000 caracteres), capacidad de aprobación y auditoría; además hay que salir de PROGRAMADO/PUBLICADO para editar. El Dueño conserva su excepción administrativa auditada. La aprobación todavía depende del checklist; una versión inmutable y transiciones tipadas corresponden a B09.

**Excepción del Dueño a «las aprobaciones las firma una persona» (29-30/09/2026).** Solo con la
cadena de entregas encendida para la marca (`PRODUCTION_CHAIN_ENABLED` y el canario), y solo en
dos momentos: el «Listo» del guionista firma la aprobación del guion (versión en `Approval` y
`SCRIPT_APPROVAL`) y el «Listo» del editor firma la revisión final (`FINAL_APPROVAL`). Las firma el
actor «Sistema», nunca la persona: `Approval.approvedByName` empieza por «Sistema (Listo de
la persona)», `approvedById` guarda a la persona cuyo «Listo» la originó, `ChecklistItem.doneById`
queda nulo y la auditoría dice «(Sistema, por el Listo de la persona [en nombre de la persona asignada];
regla del dueño: sin revisión de guion | sin revisión final)». El «Devolver por correcciones» del
community retira la revisión final también como «Sistema», con su motivo (5-1000), aunque su
perfil no tenga `content.approve`. Con la cadena apagada la regla de siempre sigue intacta: las
aprobaciones las firma una persona con `content.approve` o `scripts.approve`. Detalle en «Cadena
de entregas por video».

Esta autorización no incorpora organizaciones ni RLS y no debe anunciarse como multitenancy. El cambio de política exige retirar/proteger builds anteriores y ejecutar la activación de compatibilidad antes de reabrir producción.

### Entrar con Google

`/api/auth/google` → Google → `/api/auth/google/callback`. Implementado a mano en
`src/lib/google.ts`. **Entrar con Google nunca crea cuentas**: solo deja pasar a
quien ya existe en el equipo y está activo. Las altas las hace el dueño.

## Marca activa

La aplicación trabaja en uno de dos modos, y la elección vive en una cookie:

- **Todas las marcas** — se ve el conjunto.
- **Una marca** — se entra dentro y solo se ve lo suyo.

```ts
import { getBrandContext, brandWhere } from "@/lib/brand-context";

const brandCtx = await getBrandContext();
const where = { ...brandWhere(brandCtx.activeId) }; // {} si son todas
```

**Toda pantalla que liste algo de una marca debe respetarlo.** No se añaden filtros
de marca por página: el selector de la barra lateral es el único mando. Para lo que
también necesita el navegador (la constante `TODAS`, el tipo `BrandChoice`), usa
`@/lib/brand-shared`: `brand-context.ts` lee cookies y no puede llegar al cliente.

## Visualización de guiones

Las fichas de Dueño y Equipo usan «Escena en foco»: índice en escritorio,
selector en móvil y vistas Escenas / Producción / Ficha e historial. Las
páginas mantienen la autorización y entregan contenido al visor cliente;
cambiar de vista no modifica datos ni consulta IA. La selección sigue el ID
de escena al reordenar. Imprimir debe incluir todas las escenas y sus detalles,
aunque estén ocultas en pantalla. Conservar acciones, revisiones, permisos y
anclas de la guía al modificar esta presentación. Ver
`reports/visor-guiones-escena-foco-2026-09-26.md`.

Desde el 28/09/2026:

- **Cabecera compacta** (`ScriptHeader`): volver a Guiones, título (completo en el tooltip),
  datos en chips y acciones. Dueño: «Copiar guion», «Imprimir» (escritorio) y «Más»; Equipo:
  «Imprimir» y «Más». El menú «Más» (`ScriptActionsMenu`) reúne Imprimir (móvil), Editar
  ficha, Variar ángulo, Duplicar («Duplicar como borrador propio» en el Equipo) y Eliminar
  guion (solo Dueño). Cada acción aparece solo si la página la entrega con su permiso y la
  acción del servidor lo vuelve a comprobar. «Ficha e historial» conserva la ficha y su botón
  «Editar ficha», los videos vinculados (asignar y desvincular), aprobaciones, autoría y, solo
  para el Dueño, modelo, proveedor, pedido y prompt.
- **Modo ajuste** (`GUIONES_AJUSTE_PANTALLA`, encendido por defecto): en pantallas de al menos
  1280×600 (`FIT_MEDIA` en `viewer-state.ts`, sincronizado con `script-workspace.module.css`)
  el visor ocupa el alto disponible, cada columna se desplaza por dentro y los detalles
  técnicos quedan abiertos en su columna. Entre 768 y 1279 px, o con el interruptor en
  `"false"`, flujo normal con índice fijo. En móvil (<768 px), pestañas y barra de escena fijas,
  botones de 44 px y campos de 16 px. La biblioteca `/guiones` desplaza la tabla por dentro
  desde 1024×600, con la paginación siempre a la vista. El modo ajuste solo aplica en
  `@media screen`: la impresión no cambia.
- **`?escena=<id>`** conserva la escena al recargar. Se escribe con `replaceState` (sin nueva
  carga del servidor) solo si la URL ya lo traía o si la persona eligió una escena; un valor
  que no tiene forma de ID se ignora.
- **←/→** cambian de escena en la vista Escenas. Nunca dentro de campos, menús, pestañas,
  listas de opciones, deslizadores o diálogos, ni con teclas modificadoras.
- Las funciones de presentación viven en `src/components/scripts/viewer-state.ts` (puras,
  probadas en `tests/guiones-visor.test.mjs`).

## Las tres fases de un video

Está separado a propósito y hay que respetarlo:

| Fase | Dónde | Qué pasa |
|---|---|---|
| 1 · Idea | `/calendario`, `/contenido` | Nace la tarjeta: marca, fecha, título, hook, redes, prioridad y **formatos previstos** (`structureIds`). **Sin `structureId` ni `scriptId`.** |
| 2 · Guion | `/generador`, `/guiones` | Se escribe el guion eligiendo estructura y quién actúa. Desde la ficha de la tarjeta, «Crear guion con IA» abre `/generador?video=ID` con la marca, el título, el hook y los formatos previstos ya puestos. |
| 3 · Unión | `/guiones/[id]` o el propio generador | `vincularGuionAVideo` (en `src/lib/generation-persist.ts`) conecta ambos y es la **única** función que escribe ese vínculo. La llaman `asignarGuionAVideo` desde la ficha del guion y el trabajo de generación (`processGeneration`) cuando el generador arrancó con un video elegido. |

Al unirlos, el video **hereda `structureId` del guion** y, si estaba en `IDEA`, pasa a `GUION`.
Si se generó un lote de varios formatos para un video, solo el **primer guion que termina**
queda unido (la tarjeta admite un único `scriptId`), en cuanto existe y no al final del lote;
los demás se asignan después desde su ficha. Si la tarjeta recibió otro guion mientras tanto,
no se pisa: el guion se crea suelto y el trabajo lo avisa (ver «Generación durable»).

### `structureIds` no es `structureId`

Son dos columnas de `ContentItem` con papeles distintos, y no se mezclan:

| Columna | Qué es | Quién la escribe |
|---|---|---|
| `structureIds` (JSON `string[]`) | **Formatos previstos**: los que el equipo quiere probar con esa idea. Se eligen al crear o editar el video (`StructurePicker`, casillas `structureIds`). El generador los usa para preseleccionar el lote. | `crearVideo`, `actualizarVideo`, `duplicarVideo` |
| `structureId` | **Estructura definitiva**: la del guion vinculado. | Solo `vincularGuionAVideo` (y `desvincularGuionDeVideo`, que la deja en `null`) |

El selector de **guion** sigue sin existir en el alta del video: el guion llega desde el generador
o desde Guiones, nunca se elige a mano al crear la tarjeta. `generarGuion` rechaza el vínculo si
la tarjeta ya no existe o no está en el alcance, si ya tiene guion (una pestaña vieja no pisa
el vínculo), si no está en `IDEA` o `GUION`, o si la marca elegida no es la del video;
`enqueueGeneration` repite esas comprobaciones dentro de su transacción y la guarda definitiva
es el `updateMany` condicionado de `vincularGuionAVideo`.

### CTA con y sin venta

El cierre de un guion tiene un **modo** (`ctaModo`, campo del formulario del generador; no es
columna): `venta` o `comunidad`. Viven en `src/lib/script-angles.ts` como **dos catálogos
separados del mismo tipo `CtaTrigger`**, y no se mezclan:

| Modo | Catálogo | Qué pide | Acciones (`CTA_ACTIONS`) |
|---|---|---|---|
| `venta` | `CTA_TRIGGERS` (escasez, urgencia, motivo, incentivo, impacto visual, directo) | Una decisión con costo: comprar, reservar, ir al enlace, escribir al DM | Las sin `modo` (comentar, seguir) y las de `modo: "venta"` (bio, dm, compra) |
| `comunidad` | `CTA_COMUNIDAD` (ids `com_…`: seguir para la parte 2, guardar, enviárselo a alguien, etiquetar, pregunta, encuesta, próximo tema, duda en video, reto, notificaciones, quédate hasta el final, sin pedido) | Una acción de plataforma que no cuesta nada, con un motivo que sale del contenido | Las sin `modo` y las de `modo: "comunidad"` (guardar, compartir, etiquetar, opinar, votar, notificaciones, siguiente, mostrar) |

Reglas:

- `ctaCatalogo(modo)`, `ctaAccionesDeModo(modo)`, `modoDeGatillo(id)` y `buscarGatillo(id)` son
  la única forma de elegir catálogo. **No se reutilizan ids entre catálogos** ni se añaden
  gatillos de comunidad a `CTA_TRIGGERS`.
- `armarCtaTexto` busca el gatillo en los dos catálogos; con un gatillo de comunidad **nunca
  añade presión ni vocabulario de oferta** (`tests/cta-comunidad.test.mts` lo vigila; corre con
  `npm run test:cta`, o todo junto con `npm run test:unidad`).
- El servidor no se fía del formulario: `generarGuion` pasa gatillo y acción por
  `coherenciaCta(modo, gatillo, accion)` y descarta lo que no sea del modo enviado. Sin el campo
  (formularios viejos) el modo es `venta`, como siempre.
- En el prompt (`src/lib/ai/context.ts`), el modo comunidad emite el bloque
  `### CIERRE DE COMUNIDAD (SIN VENTA)` con `PROHIBICION_CTA_COMUNIDAD` literal (oferta,
  promoción, precio, cupo, enlace de compra, DM comercial…) y **prevalece sobre la categoría
  VENDE de la estructura**; los canales de la marca se marcan como no mencionables. Cada
  `promptGuidance` de comunidad repite la prohibición y las reglas de redacción (un solo pedido,
  motivo que sale del contenido, destinatario por situación, pregunta antes que orden, texto en
  pantalla de cinco palabras, ubicación por familia).
- El generador arranca en `comunidad` si la estructura ENTRETIENE y en `venta` si VENDE, y
  sigue a la estructura hasta que alguien toca el conmutador. El grid con
  `data-guia={GUIA_TARGETS.BOTONES_GENERADOR_CTA}` **existe en los dos modos**: la guía lo busca.
- El modo no se persiste en `Script`: viaja en el payload del trabajo (`ctaMode`) y queda en
  `briefInput` («Modo de CTA: sin venta (comunidad)») y en `promptUsed`. Si algún día hace
  falta filtrar por él, es una columna `ctaMode String?` con una migración aditiva versionada
  en `prisma/migrations`, no un enum.

### Lote de guiones

`generarGuion` no llama a la IA: valida el pedido, registra el trabajo con `enqueueGeneration`
(un `GenerationItem` por estructura) y lo despacha con `dispatchGeneration`; devuelve
`{ jobId }` y el generador abre `/generador/trabajos/[id]`. Si el despacho falla, el trabajo
queda guardado con un aviso y se reanuda desde Mis generaciones. Los elementos se procesan **en
serie** (una llamada a la vez contra la cuota); los reintentos por cuota, el corte del lote si la
clave es rechazada y el vínculo del primer guion con el video viven en `processGeneration` (ver
«Generación durable, cuotas y almacenamiento»). Lo que sí se creó se conserva con su auditoría;
el aviso final del trabajo (`job.error`) dice «Se generaron 2 de 4», qué falló y qué no se
intentó.

## IA: claves, modelos y errores

- **Marca y autorización del generador**: Equipo debe elegir una marca activa autorizada. Si solo tiene una disponible, se preselecciona; con varias se conserva la del video o la selección válida y, si no hay ninguna elegida, se solicita en Identidad y producto. Sin marcas disponibles se explica que el Dueño debe asignar una. El envío toma la marca del estado que muestra el resumen y el servidor vuelve a validar permisos. El Dueño conserva la generación generalista. `generation_trace` registra `brand_access` con presencia de marca, resultado de autorización y cantidad de marcas asignadas, sin IDs de usuario/marca, correos ni contenido del pedido.
- **Las claves de IA pertenecen a la organización, no al usuario ni a la marca.**
  La instalación actual representa un único tenant lógico. Todos los usuarios
  autorizados consumen la misma credencial de cada proveedor a través del servidor;
  solo el Dueño la administra. Compartirla no amplía permisos ni mezcla historiales.
  No copiar secretos a usuarios, sesiones, trabajos, respuestas o logs. Cada ejecución
  resuelve la clave vigente. Esto no implementa aislamiento entre tenants: antes de
  habilitar otro se deben acotar secretos, ajustes, trabajos y membresías por tenant,
  sin heredar claves de la organización actual ni su respaldo de entorno. Ver
  `reports/claves-ia-organizacion-2026-09-26.md`.
- **La clave guardada en Ajustes manda; la variable de entorno es el respaldo**
  (`resolveApiKey` en `src/lib/settings.ts` devuelve `{ key, source: "db" | "env" }`). Ajustes
  y el generador dicen de dónde sale la clave en uso. Guardar o quitar una clave se audita solo
  con `summary` (ningún secreto entra al log; ver arriba).
- Los errores del proveedor se convierten en `AiError` en `toAiError` (`src/lib/ai/providers.ts`)
  con `code` (`auth | quota | model | server | schema | timeout`), `retryable` (`true` solo para
  `quota`, `server` y `timeout`; clave, modelo y esquema no se reintentan) y `diagnostic`
  (`{ provider, status?, code?, reason?, providerStatus? }`: proveedor, código HTTP, código de
  transporte conocido y motivo/estado del proveedor de listas cerradas en
  `src/lib/ai/error-diagnostics.ts`; nunca claves, prompts ni el mensaje crudo).
  `clasificarError` mira primero los timeouts (de transporte, y también HTTP 408/504 o
  `DEADLINE_EXCEEDED`), luego las clases tipadas del SDK de Anthropic, después el `status` de
  Gemini (401/403 → `auth`, 429 → `quota`, 404 → `model`, otros 5xx → `server`) y solo al final
  el texto del mensaje. Los mensajes dicen **qué pasó y qué hacer**: clave rechazada → de dónde salió
  (`describeKeySource`) y dónde generar otra. `provider-quota` distingue cuota diaria gratuita
  agotada, cuota gratuita no disponible, falta de saldo/facturación, cuota diaria de proyecto
  y límites temporales. Solo los temporales o 429 sin causa precisa admiten reintentos.
  La cuota gratuita diaria agotada indica usar una API con facturación y actualizar la clave
  en Ajustes, o esperar su renovación. Un 429 genérico no prueba agotamiento del plan gratuito.
  Los mensajes de cuota guardados en cada ítem incluyen los pasos a seguir sin cuerpos crudos.
- `generateWithGemini` hace **una** petición con `responseJsonSchema` y reintenta **una vez sin
  esquema** (solo `responseMimeType: application/json`) únicamente ante un 400 clasificado
  `schema` o el 400 sin clasificar «Request contains an invalid argument.»
  (`RE_ARGUMENTO_INVALIDO`). Clave rechazada, modelo desconocido, cuota, 5xx, timeout y
  cualquier otro 400 lanzan a la primera: los reintentos que valen la pena los decide el trabajo
  en segundo plano, no el proveedor (sin `retryOptions` ni `maxRetries`).
- `probarClaveIA` (`src/app/actions/probar-clave.ts`) exige `admin.settings` y prueba la clave
  escrita o, sin texto, la **clave en uso**, devolviendo `origen` (`input | db | env`) y `code`.
  Claude recibe una petición de un token con `claude-haiku-4-5` fijo (confirma saldo); Gemini se
  prueba con `models.get` sobre el modelo del catálogo elegido (`resolveAiModel`), **sin gastar
  tokens** y sin certificar la cuota de generación. No guarda nada.
- Orden del modelo, siempre por `resolveAiModel` (`src/lib/ai-models.ts`): `input.model` (el
  generador) → `structure.defaultModel` (solo si `structure.defaultProvider` es el proveedor
  elegido) → «Modelo por defecto» de Ajustes (`ai.<proveedor>.model`) → `DEFAULT_MODEL` del
  catálogo (`claude-opus-5`, `gemini-3.8-flash`). Un modelo explícito fuera del catálogo lanza
  antes de gastar la llamada («Elige uno del catálogo»); `normalizeAiModel` quita el prefijo
  `models/` y resuelve los heredados `gemini-2.5-pro` / `gemini-2.5-flash` a `gemini-3.8-flash`
  sin reescribir el ajuste ni el historial. El catálogo (`AI_MODELS`, `DEFAULT_MODEL`) vive en
  `src/lib/constants.ts`; los formularios de Ajustes y del generador lo ofrecen como lista y el
  servidor rechaza cualquier otro valor: **no es un campo de texto libre**. `enqueueGeneration`
  valida el modelo al registrar el trabajo.
- `temperature` se conserva en `Structure` y en `ProviderCall` por compatibilidad, pero no se
  envía a ningún proveedor: ni los Claude actuales ni Gemini 3.8 la reciben.

### Importar un brief maestro o un informe de branding (PDF)

`previsualizarDocumento` (`src/app/actions/importar-documento.ts`) no modifica fichas ni adjuntos: extrae
el texto, lo limpia (`limpiarTextoInforme` en `src/lib/pdf.ts`), lo pasa por los parsers
deterministas de `src/lib/branding-parser.ts` (`detectarTipoDocumento`, `parseBriefMaestro`,
`parseInformeBranding`) y, solo si se elige Gemini o Claude explícitamente, pide a la IA **solo la prosa** con un modelo barato
(`extraerFicha` en `src/lib/ai/extractor.ts`). Cada campo lleva su fuente (`pdf | ia | vacio`):
**lo que no está en el PDF queda vacío y se avisa, nunca se inventa**; `toneReferences` no sale
del PDF. Aun sin escribir, **exige la capacidad del destino** (`CAPACIDAD_POR_DESTINO`):
`brands.edit` si `destino=marca` y `archetypes.edit` si `destino=persona` (sin destino, un
brief va a marca y un informe a persona), porque puede gastar una llamada de IA y devuelve el
contenido del documento. El modelo de extracción (`modeloDeExtraccion`) es barato y del
catálogo: `claude-haiku-4-5` o `claude-sonnet-5` para Claude, `gemini-3.8-flash` para Gemini.

El valor inicial es `aiProvider=local`: no transmite el texto. La mejora usa `createAiRequest` y `AI_JOBS_ENABLED`; registra el uso sin cupos internos globales/personales ni por archivo/día. Una nueva solicitud explícita puede volver a mejorar el mismo documento. No cambia de proveedor si falla o falta clave; entrega el parser local con un aviso que distingue cuota gratuita agotada, facturación y límites temporales. Plazo total: 25 s, sin reintentos ocultos. Trazas `document_extract`, `request_access` y `provider_request` sin documentos ni claves. No hay cola documental larga en esta versión. Probar una clave de Claude también registra una llamada con plazo de 15 s; consultar metadatos de Gemini no genera tokens ni certifica la cuota de generación.

Escribir es cosa del submit normal (`crearMarca`, `actualizarMarca`, `crearArquetipo`,
`crearPersonaDesdeInforme`, `guardarInformeEnPersona`), que audita como siempre. Los PDF que
acompañan al formulario (`briefPdf` y `brandingPdf` en la marca, `branding` en la persona) se
leen con `leerArchivoOpcional` y siguen el contrato del almacenamiento privado en dos pasos:
**se suben al Blob privado antes de la transacción** con `prepararArchivoPrivado`
(`src/lib/asset-import.ts`; inventario y verificación, devuelve el `blobId`, o `null` si
`BLOB_PRIVATE_ENABLED` está apagado y los bytes van a la fila) y **se adjuntan dentro** con
`crearAssetDesdeArchivo` (por `guardarDocumentoImportado`), que llama a `attachPrivateFile`,
crea el `Asset` (`data` o `blobId`, nunca ambos) y deja la auditoría `SUBIR` en la misma
transacción. El Blob hace red y no cabe en una transacción serializable; si la transacción falla
después, el objeto queda en STAGING y la limpieza programada lo retira. Los dos PDF de una marca
viajan en el mismo cuerpo y juntos no pueden pasar de `MAX_UPLOAD_BYTES` (4 MB). Esos helpers
viven fuera de `src/app/actions` a propósito: reciben la transacción y el usuario y no deben ser
endpoints. El texto del brief que va al prompt pasa por `redactarDatosSensibles` (RUC, razón
social, teléfonos, correos, números del negocio y ventas): esos datos no viajan al proveedor de IA.

## Agenda

`CalendarEvent` es lo que ocupa el calendario y no es un video: reuniones, días de grabación,
pendientes y recordatorios. Junto con los videos es lo que publica el feed `.ics`.

Las horas se interpretan **siempre en `APP_TIMEZONE`** (`America/Lima`), nunca en la del
servidor: en producción el servidor corre en UTC.

```ts
import { APP_TIMEZONE, instantInZone } from "@/lib/utils";

instantInZone("2026-03-14", "10:30"); // el instante real de esa hora en Lima
```

## Patrón obligatorio de Server Action

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { assertContentAccess, assertVideoOpen } from "@/lib/access-scope";
import { auditInTransaction, diffFields, FIELD_LABELS } from "@/lib/audit";
import { lockRevision, withMutation } from "@/lib/mutations";
import { field } from "@/lib/utils";

export async function actualizarVideo(id: string, formData: FormData) {
  const user = await requirePermission("content.plan");
  return withMutation(user, false, async (tx, afterCommit) => {
    await assertContentAccess(tx, user, id, "content.plan");
    await lockRevision(tx, "ContentItem", id, formData);
    await assertVideoOpen(tx, user, id);
    const before = await tx.contentItem.findUniqueOrThrow({ where: { id } });
    const title = field(formData, "title");
    if (!title || title.length > 500) throw new Error("Revisa el título.");
    const data = { title };
    await tx.contentItem.update({ where: { id }, data });
    await auditInTransaction(tx, {
      user, action: "EDITAR", entity: "ContentItem", entityId: id,
      brandId: before.brandId,
      summary: `Editó el video "${data.title}"`,
      changes: diffFields(before, data, FIELD_LABELS),
    });
    afterCommit(() => {
      revalidatePath("/contenido");
      revalidatePath(`/contenido/${id}`);
    });
  });
}
```

**Toda escritura registra auditoría.** Sin excepción. El `summary` se escribe como una frase
legible en pasado, en tercera persona: `Marcó el check "Subir a TikTok"`, `Asignó a Ana como Actriz`.

**El `changes` se guarda por nombre de campo, y con el valor de la columna.** Es la regla que
decide si un día se puede deshacer un cambio o solo leerlo:

```ts
changes.strengths = {
  etiqueta: "Lo que le sale natural",  // solo para mostrar
  antes: "[...]",                      // EL VALOR DE LA COLUMNA
  despues: "[...]",
  verAntes: "…", verDespues: "…",      // opcional, lo legible
}
```

La clave es `strengths`, no `"Lo que le sale natural"`: no se puede escribir en la base a partir
de una etiqueta. Y `antes`/`despues` llevan `APROBADO`, no `"Aprobado"`; la cadena vacía, no `"—"`;
el id del arquetipo, no su nombre. Lo legible va en `verAntes`/`verDespues`, que la pantalla
prefiere cuando existen. Los registros anteriores a esta regla se siguen leyendo: si no traen
`etiqueta`, la clave ya era la etiqueta.

Un cambio de **orden** no se guarda como «de la 3 a la 4» sino como el array completo de ids
antes y después. Las posiciones que ve una persona empiezan en 1 y la columna `order` empieza en
0: un retroceso leyendo posiciones dejaría la escena descolocada y nada protestaría.

La auditoría de ediciones conserva valores anteriores, excepto los secretos: guardar una clave
de API, quitarla, rotar el token del calendario y cambiar una contraseña registran metadatos.
**Ningún secreto entra al log**, y eso no es un hueco que arreglar.

Acciones válidas: `CREAR`, `EDITAR`, `ELIMINAR`, `COMPLETAR`, `REABRIR`, `ASIGNAR`,
`DESASIGNAR`, `GENERAR`, `SUBIR`, `LOGIN`, `LOGOUT`.

Entidades válidas (`AUDIT_ENTITIES`): `TaskColumn`, `Brand`, `BrandObjective`, `BrandProduct`,
`BrandCombo`, `CalendarEvent`, `ContentItem`, `ChecklistItem`, `Assignment`, `Script`,
`ScriptScene`, `Structure`, `Archetype`, `ArchetypeFit`, `Metric`, `Asset`, `User`, `Comment`,
`AppSetting`, `Auth`, `Task`, `BrandTeamMember`, `ProductionStep`. Cada una lleva su etiqueta en
`ENTITY_LABELS`. `/actividad` no ofrece en su filtro las entidades del catálogo ni las del flujo
de producción mientras su interruptor está apagado.

Al construir el motor automático de match hay que dar de alta `MatchRun` en `AUDIT_ENTITIES`
**y** en `ENTITY_LABELS`: la pantalla de actividad valida el filtro contra ese array y sin la
etiqueta imprimiría el nombre técnico en inglés.

## Consistencia de escritura y métricas semanales

Las ediciones críticas y su auditoría se confirman en una sola transacción. La autorización
se vuelve a comprobar dentro de ella y las invalidaciones ocurren después del commit.
Los formularios con control de revisión envían el `updatedAt` que vio el editor; no deben
sustituirlo por una revisión leída al enviar ni durante una actualización externa del formulario.
Un conflicto conserva el borrador y exige revisar la versión actual.

Por decisión del usuario del 09/09/2026, cada carga de métricas contiene **solo lo obtenido
esa semana**. `WEEKLY` representa lunes a domingo en Lima y `date` identifica el lunes a
las 12:00 UTC. La clave es video + lunes + plataforma + período. La retención es porcentaje
0–100: cero es un dato válido y `null` significa desconocido. El promedio mostrado no es
ponderado; sin denominadores compatibles no se debe inventar una ponderación.

El alta manual no sobrescribe una semana existente; su edición usa revisión. El CSV permite
actualizar las columnas enviadas de esa misma semana: vacío conserva, cero explícito reemplaza.
Los registros anteriores quedan `LEGACY`/`UNATTRIBUTED`, preservan sus valores y se excluyen
de los totales semanales. No reclasificarlos sin verificar período y plataforma con el usuario.

La DB se actualiza con migraciones versionadas; la línea base de una DB existente se registra
solo después de comparar su esquema. Demo, `db push` y reset son operaciones locales explícitas.
Consultar `reports/operacion-migraciones.md` antes de actualizar producción.

## Campos JSON

Varios campos son `String` que contienen JSON por compatibilidad histórica; el backend actual
requiere PostgreSQL. Para leer datos almacenados tolerando formatos antiguos, usar:

```ts
import { parseJson, parseList, linesToJson, jsonToLines } from "@/lib/utils";

parseList(brand.valueProps)          // string -> string[]
parseJson<Beat[]>(structure.beats, []) // string -> objeto tipado
linesToJson(textareaValue)           // textarea (una línea por ítem) -> JSON
jsonToLines(brand.doNots)            // JSON -> textarea
```

Al recibir JSON de un formulario, validar sintaxis, forma y límites antes de escribir.
No convertir una entrada inválida en `[]` silenciosamente: podría borrar datos válidos.

Campos JSON por modelo:
- `Brand`: `valueProps`, `doNots`, `keywords` → `string[]`
- `Structure`: `beats` → `{name, goal?, seconds?, notes?}[]`, `examples` → `{title, text}[]`, `rules` → `string[]`
- `Archetype`: `strengths`, `avoid`, `toneKeywords`, `vocabulary`, `avoidInVoice`,
  `sameArchetypeIcons`, `toneReferences` → `string[]`; `palette` → `{name, hex}[]`
- `ScriptScene`: `props` → `string[]`, `actors` → `{role, archetype, notes}[]`
- `ContentItem`: `tags` → `string[]`, **`platforms` → `string[]`** (las redes donde sale)
- `MatchRun`: `reparto` → `string[]`
- `MatchRow`: `evidencia`, `papeles`, `riesgos` → `string[]`; `mejores`, `dificiles` → `number[]`
- `BrandProduct`: `features`, `benefits`, `objections` → `string[]` (hasta 20 ítems de 200
  caracteres cada uno; `PRODUCT_LIMITS`)
- `BrandProductionSettings`: `recordingWeekdays` → `number[]` canónico, sin repetir y en orden,
  de 1 (lunes) a 6 (sábado). Un CHECK de la migración lo exige; el domingo no se graba.
  Leer con `parseRecordingWeekdays` y escribir con `normalizeWeekdays` (`src/lib/working-days.ts`).

### Los dos referentes del Archetype, que no son lo mismo

`sameArchetypeIcons` lo dicta el informe de branding de esa persona (Isabel II, Rolex). Sale
del PDF y nadie lo elige. `toneReferences` lo elige el equipo: gente cuyo tono de comunicación
quieren que suene parecido, y en el prompt van con la orden explícita de no imitarlos ni
mencionarlos. Son campos distintos a propósito; no los unifiques.

### Redes de un video

Un video puede publicarse en varias redes a la vez. Se guardan en `platforms` como JSON, así
que filtrar por red no es una igualdad:

```ts
import { platformFilter, platformLabels, platformOptions } from "@/lib/constants";

where.platforms = platformFilter("TIKTOK");   // busca "TIKTOK" dentro del JSON
platformLabels(parseList(item.platforms));    // "TikTok, Instagram"
<PlatformBadges platforms={parseList(item.platforms)} max={2} />
```

En los formularios se envían como varias casillas con el mismo nombre `platforms`, y en el
servidor se leen con `formData.getAll("platforms")`.

## Catálogos

Vienen de `@/lib/constants`. **Nunca escribir a mano etiquetas ni colores de estado.**

```ts
import {
  CONTENT_STATUSES, CONTENT_STATUS_MAP,
  PLATFORMS, PLATFORM_MAP,
  PRIORITIES, PRIORITY_MAP,
  ASSIGNMENT_ROLES, ASSIGNMENT_ROLE_MAP,
  CHECKLIST_STAGES, CHECKLIST_STAGE_MAP, DEFAULT_CHECKLIST,
  SCRIPT_STATUSES, SCRIPT_STATUS_MAP,
  VOICE_TYPES, VOICE_TYPE_MAP,
  STRUCTURE_CATEGORIES, STRUCTURE_CATEGORY_MAP,
  OBJECTIVE_STATUSES, OBJECTIVE_STATUS_MAP, OBJECTIVE_PERIODS,
  USER_ROLES, USER_ROLE_MAP, ROLE_LEVEL,
  AUDIT_ACTIONS, AUDIT_ACTION_MAP, ENTITY_LABELS,
  EVENT_KINDS, EVENT_KIND_MAP,
  ACCOUNT_STATUSES, ACCOUNT_STATUS_MAP,
  platformFilter, platformLabels, platformOptions,
  AI_PROVIDERS, AI_MODELS, DEFAULT_MODEL,
  PALETTE, FIT_SCORES,
  ACTIVE_STATUSES, DONE_STATUSES, DEAD_STATUSES,
  PRODUCT_KINDS, PRODUCT_KIND_MAP, isProductKind,
  BRAND_TEAM_ROLES, BRAND_TEAM_ROLE_MAP, RECORDING_WEEKDAYS,
  PRODUCTION_STEPS, PRODUCTION_STEP_MAP, PRODUCTION_STEP_STATUSES, PRODUCTION_STEP_STATUS_MAP,
} from "@/lib/constants";
```

Cada `Option` es `{ value, label, chip, hex, description? }`. `chip` son clases de Tailwind
listas para `<Badge option={...} />`.

## Componentes disponibles

De `@/components/ui` (todos Server Components, sin estado):

```tsx
<Card className? style?>            <CardHeader title subtitle? icon? actions? />
<Badge option={CONTENT_STATUS_MAP[x]} fallback? />
<PlatformBadges platforms={string[]} max? />
<ColorChip color="#ec4899" href?>Con Amor</ColorChip>
<Dot color />
<Avatar name color size? title? />  <AvatarStack people={[{name,color,label?}]} max? size? />
<ProgressBar value={0-100} color? height? />
<Stat label value sub? icon? accent? href? />
<PageHeader title subtitle? icon? actions? breadcrumb? />
<Breadcrumb items={[{label, href?}]} />
<EmptyState icon? title description? action? />
<Field label? hint? required? className?>{input}</Field>
<SectionTitle action?>TEXTO</SectionTitle>
<Divider label? />
<Callout tone="info|warn|danger|ok" title?>…</Callout>
```

De `@/components/filters` (cliente): `<FilterBar>`, `<FilterSelect>`, `<SearchInput>`, `<FilterChips>`.
De `@/components/assets` (cliente): `<AssetManager ownerType ownerId assets canEdit />`.
De `@/components/charts`: `<BarChart>`, `<LineChart>`, `<Sparkline>`, `<DonutChart>`.
De `@/components/forms` (cliente): `<SubmitButton>`, `<DeleteButton>`, `<InlineForm>`, `<Modal>`, `<CopyButton>`.

## Clases CSS del sistema

Definidas en `globals.css`. Usarlas en vez de reinventar estilos:

`card` · `card-flat` · `card-hd` · `card-title` · `card-sub`
`btn` `btn-primary` `btn-ghost` `btn-danger` `btn-sm` `btn-lg` `btn-icon`
`input` `select` `textarea` `input-mono` `label` `hint`
`chip` `chip-plain` `dot` · `tbl` · `bar` · `nav-link` `nav-section`
`prose-narrow` · `kbd` · `skel` · `fade-in` · `spin` · `no-print` · `no-scrollbar`
`brand-strip` (con `style={{ ["--strip" as string]: color }}`)

Colores como utilidades Tailwind: `bg-canvas` `bg-surface` `bg-surface2` `bg-surface3`
`border-line` `border-linestrong` `text-ink` `text-inksoft` `text-inkmuted`
`text-brand` `bg-brand` `bg-brandsoft` `text-ok` `text-warn` `text-danger`.

**No usar `bg-white`, `bg-gray-50`, `text-gray-800` ni colores fijos de Tailwind para
superficies o texto** — rompen el tema oscuro. Sí se pueden usar colores fijos dentro de los
`chip` de los catálogos, que ya vienen preparados para ambos temas.

## Formato y fechas

```ts
import {
  cn, formatNumber, compactNumber, formatMoney, formatPercent, safeDivide, clamp,
  objectiveProgress, formatDate, formatDateLong, formatDateTime, relativeTime,
  dateKey, fromDateKey, monthGrid, monthLabel, isToday, isSameDay, addDays,
  startOfMonth, endOfMonth, formatSeconds, formatRange, truncate, slugify,
  initials, readableOn, withAlpha, DIAS_CORTOS,
  APP_TIMEZONE, instantInZone, zoneOffsetMinutes,
} from "@/lib/utils";
```

- `dateKey(date)` → `"2026-03-14"` en hora local. Úsalo para `<input type="date">` y para agrupar.
- `fromDateKey("2026-03-14")` → `Date` al mediodía local (evita saltos de zona horaria).
- Las fechas se guardan como `DateTime`; para filtrar un mes usa `startOfMonth`/`endOfMonth`.

## Estilo de páginas

Toda página sigue esta forma:

```tsx
export default async function Pagina({ searchParams }: { searchParams: Promise<{...}> }) {
  const user = await requireUser();
  const sp = await searchParams;   // en Next 15 searchParams y params son Promise
  const datos = await prisma…;

  return (
    <>
      <PageHeader title="…" subtitle="…" icon={<Icon size={19} />} actions={…} />
      …
    </>
  );
}
```

Los filtros viajan por querystring (`?marca=…&estado=…`) para que las vistas sean compartibles
y funcionen sin JavaScript.

## Reglas de calidad

1. **Estados vacíos siempre.** Ninguna lista puede quedar en blanco sin explicar qué hacer.
2. **Todo lo que se pueda filtrar, se filtra**: marca, estado, plataforma, persona, fecha.
3. **Densidad de herramienta profesional**: texto de 12-13.5px, mucha información por pantalla,
   sin cajas gigantes vacías.
4. **Nada de `alert()`, `confirm()` ni `window.location`.** Usar `<Modal>` y `<DeleteButton>`.
5. **Sin `any`.** Si hace falta, tipar con `unknown` y estrechar.
6. **Sin datos inventados en la UI**: si un número no existe en la base, se muestra `—`.

<!-- ================================================================== -->
<!-- Entrega «operación por equipos» (28/09/2026). Secciones nuevas.       -->
<!-- ================================================================== -->

## Interruptores de funciones

Cada función nueva o con riesgo tiene un interruptor por variable de entorno, leído en el
servidor. En Vercel, un cambio de variable se aplica al redesplegar. La reversa es apagar el
interruptor: nunca `git revert` ni `DROP`.

| Variable | Por defecto | Qué valor lo cambia | Qué controla | Requisito |
|---|---|---|---|---|
| `AI_JOBS_ENABLED` | apagado | exactamente `"true"` lo enciende | Generación en segundo plano, llamadas de IA y recuperación diaria de trabajos | Migraciones de trabajos y Workflow en Vercel |
| `BLOB_PRIVATE_ENABLED` | apagado | exactamente `"true"` lo enciende | Adjuntos nuevos en Blob privado | Almacén PRIVATE creado |
| `CATALOG_CACHE_ENABLED` | apagado | `"1"` lo enciende (con `CATALOG_CACHE_NAMESPACE`) | Caché de nombres de estructuras | — |
| `PERFORMANCE_LOGS` | apagado | `"1"` lo enciende | Logs de fases sin SQL ni datos | — |
| `PANEL_RENDER_MODE` | `together` | `"streaming"` | Panel del Dueño por secciones en vez de carga conjunta | — |
| `PRODUCT_CATALOG_ENABLED` | apagado | exactamente `"true"` lo enciende | Catálogo de productos por marca, selector del paso 2 y línea `Tipo:` | Migración `20260928120000_brand_catalog` |
| `PRODUCTION_FLOW_ENABLED` | apagado | exactamente `"true"` lo enciende | Equipo por marca, pasos con plazo, panel «Producción» y barrido diario | Migración `20260928180000_production_flow` |
| `PRODUCTION_CHAIN_ENABLED` | apagado | exactamente `"true"` lo enciende (y exige `PRODUCTION_FLOW_ENABLED="true"`) | Cadena de entregas: un paso abierto por video con «Listo», «Devolver» y «Avisar a coordinación», firmas automáticas del Dueño, «Mi trabajo», `/cadena`, sincronía tarea↔paso y barrido sin cierre de grabaciones | Migración `20260930090000_production_chain` |
| `PRODUCTION_CHAIN_BRANDS` | vacío (todas) | IDs de marca separados por coma | Canario de la cadena: solo esas marcas la usan; el resto sigue con el flujo anterior | — |
| `CALENDARIO_PASOS` | encendido | `"false"` lo apaga (sin distinguir mayúsculas ni espacios) | Pasos de la cadena en el calendario y «Solo lo mío». Solo actúa con la cadena encendida | — |
| `CALENDAR_FEED_PERSONAL` | apagado | exactamente `"true"` lo enciende | Calendario `.ics` por persona («Mi calendario en Google» en Mi perfil) | Migración `20260930091000_calendar_feed_user` |
| `MANUAL_PROCEDIMIENTOS_ENABLED` | encendido | `"false"` lo apaga (sin distinguir mayúsculas ni espacios) | Manual de procedimientos: menú, tarjetas y `/manual/*` | — |
| `MANUAL_3D_PERSONAJES` | encendido | `"false"` lo apaga (sin distinguir mayúsculas ni espacios) | Personajes 3D (camarógrafo y dos actrices) en las escenas del manual; apagado, el visor usa los maniquíes y `/api/modelos-3d/*` responde 404 | Archivos en `src/content/modelos-3d/` |
| `CALENDARIO_MENSUAL` | encendido | `"false"` lo apaga (sin distinguir mayúsculas ni espacios) | Vista mensual del calendario para Dueño y Equipo | — |
| `GUIONES_AJUSTE_PANTALLA` | encendido | `"false"` lo apaga (sin distinguir mayúsculas ni espacios) | Modo ajuste del visor y de la biblioteca de guiones | — |
| `GEMINI_ESQUEMA_SIMPLE` | encendido | `"false"` lo apaga (sin distinguir mayúsculas ni espacios) | Esquema de Gemini sin límites de tamaño/rango; apagado envía el anterior con límites. La validación local no cambia | — |

- Los interruptores de funciones con **tablas nuevas vienen apagados**. Apagados, ninguna
  pantalla, acción, gancho ni tarea programada consulta esas tablas: el código se puede
  desplegar antes o después de migrar. Única excepción deliberada: la procedencia de los datos
  de ejemplo lee y bloquea las tablas del catálogo y del flujo solo si ya existen
  (`to_regclass`), para que «Revisar/Vaciar datos de ejemplo» funcione en ambos casos.
- Los que **solo cambian la presentación vienen encendidos** y se apagan con `"false"`.
- Apagar no borra nada: tablas y filas se conservan y vuelven a verse al encender.
- Orden de activación: migrar → desplegar con los interruptores de base de datos apagados →
  encenderlos en Vercel y redesplegar. Ver `reports/operacion-migraciones.md`.

## Catálogo de productos por marca

Interruptor `PRODUCT_CATALOG_ENABLED`. Mini-spec y decisiones: `reports/catalogo-productos-2026-09-28.md`.

- **Modelos.** `BrandProduct` (tipo, nombre, slug único por marca, «Qué debe saber la IA»
  en `aiNotes`, características, beneficios, objeciones, precio como texto en `priceLabel`,
  activo y orden), `BrandCombo` (varios productos de la marca con su tipo, notas y precio) y
  `BrandComboItem` (producto y cantidad mayor que cero). Una FK compuesta `(id, brandId)`
  impide que un combo mezcle marcas. Todo cae en cascada con la marca. Revisión monótona y
  `lockRevision`, como el resto de tablas editables.
- **Tipos: `PRODUCTO`, `SERVICIO` y `RESTAURANTE`** (`PRODUCT_KINDS`; un CHECK los exige). El tipo
  decide qué cierres, fórmulas, acciones y ángulos se ofrecen: `presetsPara`,
  `cierreInicialPara`, `angulosPara`, `etiquetaAccion`, `verboAccion` y
  `detallePlaceholderPara` en `src/lib/script-angles.ts`. Con el tipo desconocido (`null`) cada
  función devuelve exactamente lo de antes. Un `PRODUCTO` no recibe por defecto un cierre de
  cupos, agenda ni asesoría.
- **Permisos.** Crear, editar y archivar exigen `brands.edit` sobre una marca autorizada;
  eliminar, Dueño. «Cargar un nuevo producto» en el generador guarda con
  `guardarProductoRapido` (`brands.edit`), idempotente por marca y nombre normalizado. Toda
  escritura se audita en la misma transacción. Con el interruptor encendido, el alta de una
  marca continúa en su pestaña «Productos».
- **Coherencia.** Borrar un producto rehace sus combos en la misma transacción (tipo, revisión
  y archivado si quedan menos de dos productos, con auditoría); cambiar su tipo recalcula el de
  sus combos. Un producto archivado no entra en combos, y un combo que lo incluya no se ofrece
  ni se acepta en el generador.
- **Generador, paso 2.** Tarjetas por marca (hasta 100 productos y 50 combos activos, con aviso
  si se recorta). «Qué debe saber la IA» se precarga con la ficha elegida y se puede ajustar
  solo para ese video: la selección y los ajustes viven en la memoria del formulario y **no
  modifican el catálogo**.
- **El servidor arma el texto del producto desde la DB** (`productoDelCatalogo` en
  `src/app/actions/scripts.ts`, `focoDeProducto` en `src/lib/product-focus.ts`). No usa el
  nombre ni el tipo que manda el cliente: lee la ficha activa de la marca ya decidida, compara
  su revisión y, si cambió, pide recargar. El texto empieza por `Producto/Servicio: …` y la
  línea `Tipo: …` de su tipo (por ejemplo, «Tipo: Producto físico (no es un servicio…)»), sigue
  con precio, «Incluye» (combos), características, beneficios y objeciones y, tras una línea en
  blanco, `Detalle y descripción profunda:`. Tope: 6000 caracteres (`PRODUCT_LIMITS.focus`). Se
  recortan primero las listas, luego «Incluye», luego el detalle y, como último recurso, precio
  e «Incluye». Producto y Tipo nunca se cortan; un «Qué debe saber la IA» válido (hasta 3000)
  tampoco. Lo que no entra se avisa en el paso 2 (`avisoDeRecorte`).
- **Texto libre** («Cargar un nuevo producto») con el interruptor encendido: el tipo elegido
  añade la misma línea `Tipo:`. Sin tipo válido, el texto de siempre.
- **El payload guarda una instantánea de texto.** `productFocus` lleva la ficha completa y el
  trabajo añade `productId` o `comboId`; `enqueueGeneration` comprueba que sean de la marca del
  pedido. Los reintentos reusan el texto y no releen el catálogo; si la ficha ya no existe, el
  reintento sigue sin su id. Con el interruptor apagado los ids se descartan sin consultar las
  tablas y la huella de idempotencia no cambia.
- **Apagado**, no se lee ni se escribe el catálogo: no aparecen la pestaña «Productos» ni el
  selector, `/actividad` no ofrece Producto ni Combo, y el paso 2 y el payload son los de antes.

## Flujo de producción por equipos

Interruptor `PRODUCTION_FLOW_ENABLED`. Dominio: `src/lib/domain/production-flow.ts`; días
hábiles: `src/lib/working-days.ts`; barrido: `src/lib/production-sweep.ts`; acciones:
`src/app/actions/brand-team.ts` y `src/app/actions/production.ts`. Mini-spec:
`reports/release-operacion-equipos-2026-09-28.md`.

Lo que sigue describe el flujo con la cadena de entregas **apagada** (o la marca fuera del
canario). Con `PRODUCTION_CHAIN_ENABLED` encendido para la marca, la tabla de disparos y la regla
«lo manual siempre gana» de las fechas las reemplaza la sección «Cadena de entregas por video».

### Modelo

- **Solo tablas nuevas.** Ninguna columna nueva en tablas existentes: el código anterior sigue
  leyendo lo mismo y el nuevo puede desplegarse antes de migrar.
- `BrandTeamMember`: una persona por función y marca (`ENCARGADO`, `GUIONISTA`, `FILMMAKER`,
  `EDITOR`, `COMMUNITY`, `DISENADOR`; `BRAND_TEAM_ROLES`). Una persona puede llevar varias
  funciones. Cae con la marca o con la cuenta.
- `BrandProductionSettings`: días de grabación (`recordingWeekdays`, de lunes a sábado) y
  asignación automática (`autoAssign`). Sin fila: asignación automática activa y sin días.
- `ProductionStep`: paso con responsable y plazo (`GRABACION`, `EDICION`, `PUBLICACION`,
  `DISENO`), estado (`PENDIENTE`, `HECHO`, `CANCELADO`; `doneAt` existe si y solo si está
  `HECHO`), origen (`AUTO`, `MANUAL`), tarea del tablero enlazada (`taskId`, única), enlace
  http(s) al material, notas y quién lo pidió. La FK compuesta `(contentItemId, brandId)` impide
  que un paso sea de otra marca que su video. `automationKey` es única y empieza por el ID del
  video (`<video>:GRABACION`, `:EDICION`, `:PUBLICACION`; cada diseño lleva un sufijo
  aleatorio): repetir un disparo no duplica nada. Si se borra la cuenta responsable, el paso
  conserva su historial sin responsable.
- La función de video `COMMUNITY` («Community / publicación») se suma a `ASSIGNMENT_ROLES`.

### Reglas

Solo actúa en marcas con equipo definido y asignación automática activa (el pedido de diseño
es explícito y no depende de esa opción). Las fechas son días de negocio de Lima
(`APP_TIMEZONE`). Se trabaja de lunes a sábado; **el domingo no se trabaja**. Un plazo de día
vence a las 23:59:59.999 de Lima.

| Disparo | Paso y responsable | Plazo |
|---|---|---|
| Guion unido al video (`vincularGuionAVideo`, también desde un trabajo de generación), guion aprobado (cada video que lo usa) o video que pasa a Aprobado. Video en Idea, Guion o Aprobado | Grabación · filmmaker | Si el video no tiene fecha de grabación, el próximo día de grabación de la marca posterior a hoy (sin días elegidos, el siguiente día hábil), y se escribe en `shootDate`. Si ya la tenía, esa fecha manda. |
| Grabación terminada: checks obligatorios de Grabación completos, paso a Edición, una persona marca hecho el paso de grabación, o el barrido diario de las 05:00 (Lima) | Edición · editor | El día hábil siguiente a la grabación (sábado → lunes). Nunca nace vencido: si ese día ya pasó, hoy si es hábil o el siguiente hábil. Recibe el enlace del material grabado y cierra la grabación. |
| Revisión final aprobada (check `FINAL_APPROVAL`), con el video en Edición o Programado | Publicación · community | El día hábil siguiente, o la fecha prevista si es posterior. Si `scheduledDate` es anterior, se mueve a ese día (auditado). Cierra la edición. |
| Video que pasa a Programado | Publicación · community | La fecha prevista si es hoy o posterior; si ya pasó, el día hábil siguiente. No mueve la fecha. |
| «Pedir diseño (24 h)» en el panel «Producción» | Diseño · el diseñador elegido o el de la marca | 24 horas después; si cae en domingo, el lunes a la misma hora. |
| Fecha de grabación cambiada a mano | Grabación | El paso automático pendiente y su tarea pasan a vencer ese día. |
| Video cancelado | — | Sus pasos pendientes pasan a Cancelado. |

Responsable: primero quien ya tiene esa función en el video (Cámara, Edición, Community o Diseño)
si está activo y autorizado; si no, la persona de la marca, que recibe además la asignación en
el video. Cada paso crea su tarea en el tablero («Grabar: …», «Editar: …», «Publicar: …»,
«Diseño: …», prioridad alta) en la primera columna disponible para la marca.

### Invariantes

- **Apagado no toca la base.** Ninguna pantalla, acción, gancho del ciclo de vida ni el
  mantenimiento consultan las tablas nuevas: cada entrada vuelve antes de la primera consulta.
- **Lo manual siempre gana.** La automatización solo completa lo vacío: la fecha de grabación
  solo se escribe si está vacía (`updateMany` condicionado); la asignación del video manda sobre
  la persona de la marca; un paso reasignado a mano queda `MANUAL` y ya no se toca; no se pisan
  asignaciones, fechas ni pasos existentes.
- **Nunca rompe la acción principal.** Corre en la transacción de quien dispara, dentro de un
  `SAVEPOINT`. Si falla, se deshacen solo sus escrituras, se registra un código de motivo
  cerrado sin datos personales y la acción (unir, aprobar, cambiar estado, marcar un check) se
  confirma igual.
- La persona asignada siempre está activa y autorizada para la marca (Dueño o
  `UserBrandAccess`), como en `assertAssignee`. La automatización no exige `content.assign` ni
  `tasks.manage` a quien dispara: un guionista que une su guion no los tiene.
- **Todo queda auditado** en la misma transacción (`ProductionStep`, `Task`, `Assignment`,
  `ContentItem`, `TaskColumn`, `BrandTeamMember`), firmado por quien disparó o como «Sistema»
  cuando lo hace el mantenimiento diario.
- **Barrido diario** (`runProductionSweep` dentro de `/api/maintenance`; cron `0 10 * * *` UTC,
  05:00 en Lima): videos en Aprobado o Grabación con fecha de grabación anterior a hoy y de los
  últimos 14 días, sin paso de edición. Hasta 25 por ejecución, uno por transacción con
  `FOR UPDATE SKIP LOCKED`; un fallo no detiene al resto. La ventana evita repartir de golpe el
  histórico atascado al encender el interruptor.

### Permisos y pantallas

- Pestaña «Equipo» de la marca (`?vista=equipo`, también en la ficha de marca del Equipo):
  `brands.edit` sobre una marca autorizada. Cada persona elegida debe estar activa y autorizada
  para la marca. Vaciar una función es mover, no destruir: no exige Dueño. La revisión del
  formulario es la de `BrandProductionSettings` (`"new"` si todavía no existe).
- Panel «Producción» de la ficha del video: lo ve quien ya ve el video. «Pedir diseño» exige
  `content.plan`, o `scripts.write` con acceso al video. «Marcar hecho», «Reabrir» y el enlace
  del material: coordinación (`content.assign`) o la persona asignada al paso; el enlace de
  grabación o edición también lo deja quien graba o edita ese video. «Reasignar» (persona y
  plazo) solo con `content.assign`: el paso queda `MANUAL`, uno cancelado se reactiva y la tarea
  enlazada se mueve con él.
- Cuentas de prueba: `npm run db:equipo-demo`, **solo en una base local**. Las contraseñas van
  únicamente a `.audit/equipo-demo.txt` (ignorado por Git) y nunca se imprimen. En producción,
  las cuentas reales las crea el Dueño en Equipo.

## Cadena de entregas por video

Interruptores `PRODUCTION_CHAIN_ENABLED` (exige `PRODUCTION_FLOW_ENABLED`) y
`PRODUCTION_CHAIN_BRANDS` (canario). Dominio y contrato: la cabecera de
`src/lib/domain/production-chain.ts`; interruptores: `src/lib/production-chain-flag.ts`; lecturas
para pantallas: `src/lib/production-scope.ts`; pasos y reglas: `CHAIN_ORDER` y `CHAIN_STEP_RULES`
en `src/lib/constants.ts`; acciones: `src/app/actions/production.ts`. Mini-spec final con las
decisiones del Dueño, reversa y criterio de hecho: `reports/cadena-entregas-2026-09-30.md`.

### Modelo

- **Sin tablas ni columnas nuevas.** `20260930090000_production_chain` solo amplía los CHECK de
  `ProductionStep` (paso `GUION`, estado `DEVUELTO`, que tiene `doneAt` nulo) y añade el índice
  `("brandId","status","dueAt")`. Devoluciones y avisos son `Comment` más auditoría (claves
  `devolucion` y `aviso` en `AuditLog.changes`).
- **El paso manda.** `ProductionStep` es la única verdad de quién tiene el video, para cuándo y si
  está listo. El estado del video, los checks, las aprobaciones y la tarea del tablero son
  reflejos que la cadena escribe **en la misma transacción** (`completeStep`, `returnStep`,
  `chainEvent`).
- **Un solo paso de cadena abierto por video.** Abrir un paso cierra los demás: los anteriores
  quedan `HECHO` y los posteriores `CANCELADO`, firmados como «Sistema». Diseño corre en paralelo y
  no cuenta.
- `automationKey` = `<video>:GUION|GRABACION|EDICION|PUBLICACION` (diseño: `<video>:DISENO:<uuid>`).
  Un paso no se duplica, se reactiva: `CANCELADO` o `DEVUELTO` vuelven a `PENDIENTE` con plazo
  nuevo; conservan a su persona si era `MANUAL` o volvió por una devolución y sigue apta; si no, se
  vuelve a buscar. Un paso `HECHO` solo se reabre devolviendo desde el paso que lo sigue.

### Flujo

```
GUION (guionista) ─Listo─► GRABACION (filmmaker) ─Listo─► EDICION (editor) ─Listo─► PUBLICACION (community) ─Publicado─► fin
                                ▲                            │  ▲                           │
                                └──── Devolver al filmmaker ─┘  └── Devolver por correcciones ┘
DISENO en paralelo: «Pedir diseño» → «Entregar diseño» (quien lo pidió o coordinación: «Pedir cambios»)
```

Por decisión del Dueño (29-30/09/2026) **no hay revisión de guion ni revisión final**: no existen
los pasos `REVISION_GUION` ni `REVISION_FINAL`. Plazos en días de negocio de Lima, de lunes a
sábado; un plazo de día vence a las 23:59:59.999.

| Paso | Quién lo recibe | Nace | Plazo | El «Listo» exige | El «Listo» escribe |
|---|---|---|---|---|---|
| Guion | Función Guionista del video o `GUIONISTA` del equipo, que recibe la asignación `GUIONISTA` (así puede editar un guion generado por otra persona) | Al crear o duplicar el video en una marca con equipo, al unir el guion o con «Crear paso» | Fin del 2.º día hábil desde que nace | Guion vinculado y no archivado, con al menos una escena y CTA (del guion o del video). La persona asignada necesita `scripts.write` sobre ese guion | Guion BORRADOR→REVISION→APROBADO con su versión (`approveVersion`), check «Guion escrito y revisado» a su nombre, `SCRIPT_APPROVAL` y video →GUION→APROBADO, como «Sistema». Abre Grabación |
| Grabación | Función Cámara o `FILMMAKER` | Listo del guion, o el video llega a Aprobado por otro camino | Próximo día de grabación de la marca **posterior al Listo** (sin días elegidos, el día hábil siguiente). Se escribe en `shootDate`: una fecha automática se recalcula, una puesta a mano manda. Si `scheduledDate` quedaba antes, se corre al día hábil siguiente a la edición | Enlace del material (http o https), guion aprobado y los checks obligatorios de Preproducción y Grabación que su perfil (o su paso) puede marcar | El enlace en el paso, esos checks a su nombre y video →GRABACION→EDICION como «Sistema». Abre Edición sin copiar el material |
| Edición | Función Edición o `EDITOR` | Listo de la grabación | Día hábil siguiente a la grabación (sábado → lunes) | Enlace del máster, distinto del material grabado; checks obligatorios de Postproducción y General. Un check de diseño pendiente da «Esperando diseño» sea quien sea quien pulse (también el Dueño): el diseño lo entrega el diseñador o se marca en el checklist, nunca este Listo | El máster en el paso, esos checks a su nombre y `FINAL_APPROVAL` como «Sistema». Abre Publicación |
| Publicación | Función Community o `COMMUNITY` | Listo de la edición | Día hábil siguiente, o la fecha prevista si es posterior (una anterior se corre) | URL pública http(s), `assertPublishable` y los checks de Publicación | `publishedUrl`, esos checks y video →PROGRAMADO→PUBLICADO (`publishedAt`). Fin de la cadena |
| Diseño | Persona elegida o `DISENADOR` | «Pedir diseño» | 24 h; si cae en domingo, el lunes a la misma hora | Enlace de la entrega | Checks de diseño de Postproducción (si su perfil puede). Quien lo pidió lo ve 7 días en «Mi trabajo» |

Un hueco en el equipo no detiene la cadena: sin persona apta para la función, el paso nace **«Sin
asignar»** (también con la asignación automática apagada) y la fecha de grabación se escribe
igual. Una marca sin nadie en su equipo sigue fuera de la cadena.

### Devoluciones, avisos y coordinación

- **«Devolver al filmmaker»** (editor, desde Edición): motivo de 5 a 1000 caracteres. Edición
  queda `DEVUELTO`, Grabación vuelve a `PENDIENTE` para el próximo día de grabación (mueve
  `shootDate`) y el video se queda en Edición.
- **«Devolver por correcciones»** (community, desde Publicación): motivo de 5 a 1000. Se revoca
  `FINAL_APPROVAL` como «Sistema» con ese motivo, Programado vuelve a Edición, Publicación queda
  `DEVUELTO` y cerrada, y Edición vuelve a `PENDIENTE` para el día hábil siguiente. El siguiente
  «Listo» del editor vuelve a firmar y reactiva la misma Publicación.
- Toda devolución guarda el motivo como `Comment` del video y reabre exactamente un paso, que
  aparece en «Mi trabajo» como «Devuelto a mí» con el motivo y quién lo devolvió.
- **«Avisar a coordinación»** (botón del filmmaker y del community asignados): motivo de 5 a 1000,
  guardado como `Comment` y como aviso en la auditoría. Se da por atendido con «Aviso atendido» o
  con cualquier asignación, reapertura o «Listo» posterior del paso.
- **Coordinación = ENCARGADO.** Supervisa en `/cadena` y recibe en «Mi trabajo» los pasos «Sin
  asignar», los avisos y los bloqueos (responsable inactivo, sin acceso a la marca o cuyo perfil no
  puede hacer el paso) de sus marcas. **ENCARGADO apto** = activo, con la marca y con
  `content.assign` en su perfil (puede asignar y dar avisos por atendidos). **Si la marca no tiene
  ENCARGADO apto, todo eso le llega al Dueño** (usuarios `OWNER`), y `/cadena` muestra el atasco
  «Encargado sin permisos» (p. ej. un equipo guardado antes de encender la cadena).
- **Quién pulsa un paso:** la persona asignada (con acceso al video y la capacidad del paso:
  `scripts.write`, `content.shoot`, `content.editing`, `content.publish` o `content.design`),
  coordinación con `content.assign` sobre el video, o el Dueño. Si coordinación pulsa por otra
  persona, la auditoría dice «en nombre de» la persona asignada. **Coordinación no firma lo que su
  perfil no firma** (`CHAIN_COORD_CAPABILITY`): el Listo del guion exige `scripts.approve` o
  `scripts.write` sobre ese guion; el de la edición, `content.approve`; el «Publicado»,
  `content.publish`; devolver una publicación (retira la revisión final), `content.approve`. Los
  botones siguen la misma regla (`stepPermissions`).
- **Primero quién, después qué:** cada acción sobre un paso comprueba antes de bloquear nada y de
  mirar su estado que quien pulsa lo puede ver (Dueño, responsable con la marca o video en su
  alcance). Un paso ajeno responde lo mismo que uno inexistente: «No tienes acceso a este paso o
  ya no existe.»
- «Crear paso» (`content.assign`) asegura el paso que le toca al video por su estado; «Tomar
  paso» deja que alguien apto (capacidad del paso, la marca **y el video en su alcance**) se asigne
  uno sin responsable; «Reasignar» mueve persona y plazo y, si quien reasigna puede planificar,
  también `shootDate` o `scheduledDate` (si no, el formulario lo avisa: `EditForm` muestra el
  `message` de la acción y el tablero, el de `actualizarTarea`). **Responsable elegido a mano**
  («Reasignar», «Crear paso» con persona, la tarea del tablero): activo, con la marca y con la
  capacidad del paso; si no, «X no puede grabar: su perfil no lo permite». `asignarPersona` solo
  pasa el paso a quien puede hacerlo.
- `guardarEquipoDeMarca` exige que el perfil conceda la capacidad de la función (ENCARGADO
  `content.approve` y `scripts.approve`, GUIONISTA `scripts.write`, FILMMAKER `content.shoot`,
  EDITOR `content.editing`, COMMUNITY `content.publish`, DISENADOR `content.design`), pasa los pasos
  automáticos pendientes a la persona nueva y, al encender la asignación automática, reparte los
  «Sin asignar».

### Tarea y paso

- Un paso, una tarea: «Escribir guion: …», «Grabar: …», «Editar: …», «Publicar: …», «Diseño: …».
  Paso cerrado (`HECHO`, `CANCELADO` o `DEVUELTO`) → su tarea va a la última columna por orden que
  admite la marca («Listo»; si solo existe una columna, se crea «Listo»). Paso reabierto → la tarea
  sale de «Listo». Responsable y fecha límite siguen al paso.
- «Listo» se identifica por posición, así que la posición se protege: con la cadena, una columna
  nueva (`crearColumna`, global o de una marca) **entra antes de «Listo»** reordenando las demás, y
  la columna «Listo» de una marca no se puede eliminar (se renombra).
- Soltar la tarea en la última columna (`moverTarea`, o cambiar la etapa en `actualizarTarea`) es
  el «Listo» del paso con las mismas validaciones: si falla, la tarea no se mueve y el tablero
  muestra el motivo (`moverTareaConMotivo`; el modal recibe `{ ok: false, error }`). Sacar de
  «Listo» la tarea de un paso cerrado se rechaza. Cambiar responsable o fecha en la tarea reasigna
  el paso; una tarea de paso no cambia de marca.

### Mismas reglas por cualquier camino

Los caminos de siempre convergen en `chainEvent` y corren en un `SAVEPOINT` (un fallo se deshace
solo, se registra con un código cerrado y la acción principal sigue):

- Crear o duplicar un video abre el Guion (la copia **no hereda** la fecha de grabación del
  original). **Unir el guion ya no programa la grabación**; desvincularlo o **eliminar el guion**
  vuelve a abrir el Guion de cada video que lo usaba.
- Fecha de grabación al abrir la Grabación: automática (auditada «Programó la grabación») se
  recalcula; puesta a mano manda; **sin origen auditado en ese video y ya pasada o de hoy** (heredada
  o anterior a la cadena) se recalcula, para que el paso no nazca vencido.
- Pasar el guion a Revisión o Aprobado desde Guiones equivale al «Listo» del guion (Revisión exige
  escenas y CTA); volverlo a Borrador reabre el Guion.
- Cambiar el estado del video abre el paso de su etapa. Cancelado o pausado cancela los pasos
  pendientes (y sus tareas van a «Listo»); Publicado cierra todo; reabrir hacia atrás cancela los
  posteriores. Pasar a Edición exige el enlace del material si existe la Grabación.
- Checks: completar los de Grabación con el enlace ya guardado es el «Listo» de la grabación;
  firmar `FINAL_APPROVAL` a mano exige el máster en Edición; retirarla (o retirar la aprobación del
  guion, que la arrastra) devuelve la edición al editor y cancela la publicación, también con el
  video en Programado: Sistema lo devuelve a Edición, como «Devolver por correcciones».
- Cambiar `shootDate` o `scheduledDate` mueve el plazo de la Grabación o de la Publicación, también
  si el paso es `MANUAL`: «manual» protege a la persona, no la fecha.
- `asignarPersona` pasa el paso pendiente de esa función a la persona (si su perfil puede
  hacerlo); `quitarAsignacion` se bloquea con «Reasigna primero el paso» si esa persona lo tiene
  pendiente, y el motivo vuelve como `{ error }` a la ficha.
- «Marcar hecho» y «Reabrir» del panel viejo delegan en el «Listo» y en «Devolver» (con motivo).
  «Guardar y marcar publicado» (`publicado=1` en la publicación de la ficha) es el «Publicado».
- **Barrido diario:** con la cadena encendida no asigna la edición ni cierra grabaciones que no se
  hicieron; el atraso queda a la vista como vencido. Con canario, solo excluye esas marcas.

### Atomicidad, concurrencia e invariantes

- Las entradas explícitas («Listo», «Devolver», «Avisar», «Crear», «Tomar» y «Reasignar paso»,
  tarea movida) **no usan SAVEPOINT**: si algo falla no se escribe nada y el motivo (`ChainError`,
  en español) llega a la persona. Un conflicto de concurrencia llega como `EDIT_CONFLICT`.
- Bloqueos en el orden de `alternarCheck`: guion → video (`lockVideoLifecycle`) → paso
  (`lockRevision` con la revisión del formulario, o `FOR UPDATE`) → tarea. Dos «Listo» a la vez:
  uno gana y el otro recibe `EDIT_CONFLICT`. Repetir un «Listo» ya hecho no escribe nada.
- Invariantes que deben dar 0 (SQL en la mini-spec): **Q1** tarea desfasada de su paso; **Q2**
  video activo de una marca con equipo, creado tras encender, sin paso abierto; **Q3** publicación
  pendiente en un video publicado; **Q4** más de un paso de cadena pendiente por video; **Q5**
  responsable inactivo o sin acceso a la marca.
- **Apagada** (o la marca fuera del canario), nada de esto consulta la base: `chainEvent` vuelve
  `chain_off` antes de la primera consulta y todo funciona como el flujo anterior; los pasos Guion
  pendientes se ocultan en el panel. Lo ya firmado sigue siendo válido.
- Logs: `{"event":"production_chain","operation":…,"reason":…}` sin datos personales.
  Instrumentación temporal: `complete_step` con milisegundos; **retirar el 2026-10-20** o cuando
  Q1-Q5 lleven 7 días en 0.

### Pantallas y permisos

- **Canario por persona** (`productionChainActiveFor`): la interfaz de la cadena («Mi trabajo»,
  contadores, textos de Ayuda, menú «Cadena», «Solo lo mío» del calendario) aparece si la marca
  activa usa la cadena o, sin marca activa, si alguna marca de la persona la usa (el Dueño, con
  cualquiera). En Tareas, las reglas de la cadena (orden por fecha límite, enlace a la ficha,
  «pulsa Listo», vencida en el día de Lima y nunca en «Listo») se aplican por tarea, solo en marcas
  de la cadena; el resto se ve como antes, y con la cadena apagada no se lee `ProductionStep`.
- **«Mi trabajo»** (`src/components/work/my-work.tsx`) va **primero**, encima del Manual, en el
  Inicio del equipo y en el Panel del Dueño: Vencido, Devuelto a mí, Hoy, Próximos 7 días y Más
  adelante (plegado); el bloque de coordinación (Sin asignar, Avisos, Bloqueados; `h3` con sus
  grupos en `h4`) solo al ENCARGADO apto o al Dueño; «Diseños entregados para ti» durante 7 días.
  Un Guion sin guion enlaza a «Generar guion» (`/generador?video=<id>`) para quien puede generar.
  Con la cadena, los contadores del Inicio excluyen videos cancelados o pausados y tareas en
  «Listo».
- **Avisos de éxito** (`src/components/work/announcer.tsx`): tras un «Listo», «Devolver», «Tomar
  paso», «Aviso atendido» o «Crear paso» la tarjeta se va con el refresco, así que el mensaje del
  servidor («Ahora le toca a…») se muestra en una región `aria-live` de la sección (Mi trabajo, el
  panel Producción, la Cadena) y el foco vuelve a su encabezado.
- **Botones** compartidos por «Mi trabajo», la ficha y `/cadena`
  (`src/components/work/step-actions.tsx`, textos en `step-copy.ts`): «Listo, enviar al
  filmmaker», «Listo, pasar a edición», «Listo, enviar al community», «Publicado» y «Entregar
  diseño»; «Devolver al filmmaker», «Devolver por correcciones» y «Avisar a coordinación»;
  «Crear paso», «Tomar este paso», «Aviso atendido» y «Pedir cambios». Cada uno pide su enlace o
  su motivo y se confirma con un segundo toque.
- **`/cadena`**: sección `chain` con la capacidad `chain.view` (perfil STRATEGY) o el Dueño.
  Cabecera con abiertos, vencidos, sin asignar y publicados en la semana (no dependen de los
  filtros; «Sin asignar» enlaza a `?persona=sin-asignar`); columnas por paso y fila de diseños;
  atascos con su acción (vencidos, sin asignar, responsable que no puede hacer el paso, avisos con
  «Aviso atendido» ahí mismo, videos sin paso con «Crear paso», estado desfasado, encargado sin
  permisos y marcas sin equipo). La lista de personas del filtro sale de todos los pasos abiertos
  de las marcas, no de los ya filtrados.
- **Panel «Producción»** de la ficha (ancla `#produccion`): los mismos botones, estado Devuelto,
  «Sin responsable» con «Asignar», el último aviso a coordinación con «Aviso atendido» y, al
  reasignar, solo las personas cuyo perfil puede hacer el paso (el resto aparece deshabilitado).
- **Acciones** (`src/app/actions/production.ts`), todas con `{ error }` o `{ ok: true, message }`:
  `marcarListo`, `devolverPaso`, `avisarCoordinacion`, `crearPasoManual` (alias `crearPaso`),
  `tomarPaso`, `atenderAviso` y `pedirCambiosDiseno`. Con la cadena apagada responden «La cadena de
  entregas no está activa.» sin leer sesión ni base.
- **Previa de guiones:** «grabado» es el paso Grabación en `HECHO` (`grabadoDeVideo`,
  `chainStateForScripts`); sin cadena, el check «Grabado (todas las tomas)».

## Calendario mensual

Interruptor `CALENDARIO_MENSUAL`. Funciones puras en `src/lib/calendar-view.ts` (probadas en
`tests/calendario.test.mjs`); páginas en `src/app/(app)/calendario/` (`page.tsx` para el Dueño y
`member-calendar.tsx` para el Equipo).

- La vista por defecto, para Dueño y Equipo, es la **rejilla del mes** (seis semanas, de lunes a
  domingo), sin clics previos. `?anio=&mes=` (mes de 0 a 11) cambia de mes; un valor inválido
  cae en el mes actual de Lima.
- **Un video aparece en sus dos fechas**: «Grabar» en `shootDate` y «Publicar» en
  `scheduledDate`; dentro de un día va primero lo que se graba. La consulta toma los videos por
  cualquiera de las dos fechas, pero los totales del mes (Programados, Publicados, En
  producción, Atrasados y reparto por marca) se cuentan solo por publicación.
- La agenda aparece en todos los días que ocupa, también si empezó antes del mes. Cada celda
  muestra hasta cuatro entradas (la agenda ocupa como mucho dos) y «+N más».
- `?dia=AAAA-MM-DD` abre el detalle del día dentro de su mes. Se filtra sobre lo ya consultado,
  con el mismo alcance y la misma marca activa: nunca muestra más que la rejilla.
- En pantallas estrechas el mes se lee como lista: hoy primero, los días pasados plegados y los
  tramos sin nada agrupados.
- Alcance del Equipo: videos con `contentScope(user, "calendar.view")`, agenda con
  `eventScope` y la marca activa del selector. Topes de cordura por mes (400 videos y 300
  eventos), con aviso si se alcanzan.
- Apagado: el Equipo vuelve a la lista de 31 días con «Ver agenda» y el Dueño a la rejilla
  anterior (solo publicación, sin detalle por día ni lista en celular; el día enlaza a
  `/contenido?desde=&hasta=`).
- El diseñador (perfil `DESIGNER`) tiene `calendar.view` con alcance de sus videos asignados
  **solo con la cadena y `CALENDARIO_PASOS` encendidos** (`permissionFlags` en
  `src/lib/permissions.ts`; el layout pasa el valor al menú, que no lee el entorno). Apagados, el
  diseñador sigue sin calendario, como antes.

### Pasos de la cadena en el calendario (`CALENDARIO_PASOS`)

Encendido por defecto, pero solo actúa con la cadena de entregas encendida; apagado (o sin
cadena), el calendario es el de siempre, con las mismas consultas y enlaces. Solo en la vista
mensual. Lecturas en `src/lib/production-scope.ts` (`stepCalendarEntries`, `productionStepScope`,
`coveredVideoDates`); chips puros en `src/lib/calendar-view.ts`.

- **Chips por paso** en el día de su plazo (`dueAt`): Guion, Grabar, Editar, Publicar y Diseño,
  con el color y el ícono del paso y el nombre de pila del responsable (se oculta si el paso es
  tuyo). Vencido: borde rojo y ⚠; devuelto: ↩; sin asignar: persona tachada; hecho: tachado;
  Diseño lleva la hora. El detalle del día y la lista del celular lo dicen en texto.
- **Sin duplicados:** el chip «Grabar» o «Publicar» que sale de `shootDate` o `scheduledDate`
  desaparece si el video tiene un paso visible de ese tipo (pendiente o hecho, con el mismo filtro
  de persona), aunque el plazo caiga en otro mes: la fecha del paso manda.
- **«Solo lo mío»** (`?mio=1` / `?mio=0`): solo tus pasos y las fechas de los videos donde tienes
  una función; la agenda no se filtra. Activo por defecto en los perfiles por asignación (cámara,
  edición, talento, diseño) y en el community; apagado para el Dueño, que además tiene
  `?persona=<id>` (manda sobre «Solo lo mío»).
- En la vista del equipo desaparecen los videos cancelados y pausados, como en el `.ics`. Los
  totales del Dueño se siguen contando con las fechas del video. Estado y plataforma también
  filtran los pasos.
- Todo se lee de la base al pedir la página: «Listo», reasignar o mover una fecha cambian la fila
  del paso y las acciones revalidan `/calendario`.

### Calendario `.ics` por persona (`CALENDAR_FEED_PERSONAL`)

Apagado por defecto. Requiere `20260930091000_calendar_feed_user` **aplicada antes de
encenderlo** (solo amplía `CalendarSubscription_scope_check` con `scope='USER'` y `brandId` nulo;
`createdById` es la persona dueña del feed).

- «Mi calendario en Google» en Mi perfil (`miCalendario` en `src/app/actions/calendar-feed.ts`):
  crear, renovar o revocar, con `profile.self`; un solo enlace vigente por persona; plazo de 30, 90
  o 365 días. El token se muestra una sola vez; solo se guarda su hash y nunca va a la auditoría.
- Cada descarga vuelve a leer a la persona, sus perfiles y sus marcas: si pierde una marca, sus
  fechas desaparecen en la siguiente lectura. Persona inactiva o interruptor apagado → 401.
- Incluye sus pasos pendientes (todo el día; Diseño con hora), las fechas de los videos donde
  tiene una función salvo las que ya cubren sus pasos, y la agenda que ve en la app. Sin
  descripciones, ubicaciones ni otras personas.
- Corte por persona: con el interruptor encendido, Ajustes lista **aparte** los feeds personales
  vigentes y el Dueño puede **revocar** uno (no renovarlo: lo pasaría a su nombre). Desactivar la
  cuenta, cambiar su contraseña o cambiar su correo o rol (lo que cierra sus sesiones) revoca
  también su feed personal, así que al reactivar la cuenta un token filtrado no vuelve.
- Los enlaces del Dueño (`ALL` y `BRAND`) no cambian y no llevan pasos ni nombres. Su lista no
  mezcla los feeds personales y el tope de 50 cuenta solo los del Dueño.

## Manual de procedimientos

Interruptor `MANUAL_PROCEDIMIENTOS_ENABLED`: apagado, oculta el menú y las tarjetas, y
`/manual/*` responde 404. Investigación y criterios: `reports/manual-procedimientos/`.

- **Solo lectura y sin base de datos.** El contenido está versionado en `src/content/manual/`:
  `index.ts` (tarjetas, orden y conteos) y un JSON por rol en `roles/`. Se genera con
  `node scripts/manual-content.mjs` desde `reports/manual-procedimientos/curriculo.json`; no se
  editan a mano los JSON generados.
- 8 roles en orden de flujo: Guionista → Filmmaker → Actor → Editor → Jefe de editores →
  Community manager → ATC → Dueño de negocio. Tres niveles (Principiante, Intermedio,
  Avanzado), 135 módulos, 618 lecciones y 386 videos de referencia.
- **Acceso: todas las cuentas activas** (sección `manual`, capacidad base `help.view`), también
  un miembro sin perfiles. Todos leen todos los manuales; los de su perfil van primero con «Tu
  rol»: `WRITER` → Guionista, `CAMERA` → Filmmaker, `TALENT` → Actor, `EDITOR` → Editor y Jefe
  de editores, `PUBLISHER` → Community; la posición Dueño suma el suyo. ATC y Jefe de editores
  todavía no tienen perfil propio.
- **Menú «Formación»** (antes «Ayuda»): «Manual de procedimientos» primero y «Cómo se usa»
  debajo. La tarjeta del manual es la primera del inicio del Equipo y de «Cómo se usa», y un
  aviso compacto en el panel del Dueño.
- **Inicio y ayuda del Equipo son pantallas distintas.** `/` muestra el trabajo (manual,
  videos pendientes, tareas visibles y accesos); `/tutorial`, sus perfiles, su lugar en el
  flujo, las reglas comunes y dónde está cada cosa.
- Cada página carga en el servidor solo el JSON de su rol, con `import()` dinámico, y al cliente
  viaja solo el módulo visible. Nunca importar esos JSON desde un componente cliente.
- **Escenas 3D:** el visor usa three.js y se descarga solo al abrir una lección con escena
  (`next/dynamic`, sin SSR). `src/lib/manual-scene.ts` traduce el texto de la escena a una
  configuración tipada por palabras clave, sin IA; lo que no reconoce cae en valores prudentes
  y los pasos en texto siempre acompañan a la escena. Con movimiento reducido no se reproduce
  sola.
- **Personajes 3D** (interruptor `MANUAL_3D_PERSONAJES`): modelos con derechos de terceros
  autorizados por el dueño solo para uso interno el 29/09/2026; antes de vender el sistema a
  terceros deben reemplazarse por modelos con licencia; se sirven solo con sesión.
  - Viven versionados en `src/content/modelos-3d/` (`manifest.json`, `camarografo.glb`,
    `actriz-1.glb`, `actriz-2.glb`). **Nunca en `public/`**: todo lo que está ahí se sirve sin
    sesión. `tests/modelos-3d.test.mjs` falla si aparece un modelo en `public/`.
  - Solo los entrega `GET /api/modelos-3d/[archivo]`: sesión válida (`getSession`; sin ella,
    401), lista cerrada `MODELOS_3D` de `src/lib/manual-3d.ts` comprobada antes de tocar el disco
    (cualquier otro nombre, `../` o mayúsculas → 404), interruptor y manual encendidos (si no,
    404). Cabeceras: `model/gltf-binary` o `application/json`, `Cache-Control: private,
    max-age=604800, immutable`, `ETag` por hash del contenido (304 con `If-None-Match`),
    `X-Content-Type-Options: nosniff` y `Content-Disposition: inline`. `next.config.ts` los
    incluye en el paquete de la ruta con `outputFileTracingIncludes`.
  - Caché del navegador: el visor pide manifiesto y GLB con `cache: "no-cache"` (revalida con el
    `ETag`: 304 sin volver a bajar los bytes, y 401 si la sesión venció), así un manifiesto nuevo
    nunca se mezcla con un GLB viejo tras un despliegue. `/api/logout` responde
    `Clear-Site-Data: "cache"`: al salir, la copia privada de 7 días no queda disponible sin sesión
    en un equipo compartido. El 401 se comprueba en una ventana privada o con `curl`, no en el
    navegador donde ya se vieron las escenas.
  - El servidor calcula `personajes3dEnabled()` en la página del módulo y lo baja por props
    (`ModuleLessons` → `SceneViewer`, prop `personajes`). Desde el cliente, `manual-3d.ts` se
    importa solo con `import type`.
  - Asignación: quien graba = `camarografo`; sujeto principal = `actriz-1`; segunda persona
    (podcast, pareja, dos personas) = `actriz-2`. Más de dos sujetos además de quien graba: los
    extras siguen como maniquí.
  - Los GLB usan `EXT_meshopt_compression`, `KHR_mesh_quantization` y `EXT_texture_webp`: el
    cargador necesita `MeshoptDecoder`. Escala en metros, pies en y=0, miran hacia +Z y la pose de
    reposo es la bind pose (A-pose). Las vistas previas de revisión no van al repositorio.
- **Videos de YouTube:** fachada con miniatura. El `iframe` (`youtube-nocookie.com`) se crea al
  pulsar, así la página no pide nada a YouTube hasta entonces. Solo se aceptan IDs de YouTube
  válidos.
