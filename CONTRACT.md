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
| `/` | Panel general |
| `/calendario` | Calendario mensual de contenido |
| `/contenido` · `/contenido/[id]` | Lista y ficha de cada video |
| `/marcas` · `/marcas/[id]` | Marcas, identidad, brief, objetivos |
| `/generador` | Generador de guiones con IA |
| `/generador/trabajos` · `/generador/trabajos/[id]` | Historial, progreso y recuperación de generaciones |
| `/guiones` · `/guiones/[id]` | Biblioteca y visualizador de guiones |
| `/estructuras` · `/estructuras/[id]` | Formatos ganadores + prompt + PDFs |
| `/arquetipos` · `/arquetipos/[id]` | Personas frente a cámara: perfil, marca personal y compatibilidad |
| `/metricas` | Visualizador de métricas |
| `/equipo` | Personas |
| `/mi-perfil` | Datos y documentos de la cuenta propia |
| `/sin-acceso` | Explicación del acceso denegado |
| `/actividad` | Log de auditoría |
| `/ajustes` | Claves de IA, entrada con Google y calendario |

Rutas de API (las únicas que existen, y cada una por un motivo):

| Ruta | Por qué no es una Server Action |
|---|---|
| `/api/auth/google` · `/api/auth/google/callback` | Google necesita redirigir a una URL |
| `/api/calendario.ics` | Google Calendar la pide desde sus servidores, sin sesión |
| `/api/assets/[id]` | Devuelve los bytes de un archivo |
| `/api/logout` | Borra la cookie y redirige |
| `/api/maintenance` | Mantenimiento diario autenticado con CRON_SECRET |
| `/.well-known/workflow/v1/*` | Rutas generadas por Workflow SDK; no se editan manualmente |

Las pantallas de negocio viven bajo `src/app/(app)/`, con `requireUser()` y carcasa. Las rutas técnicas están fuera y aplican su autenticación específica.

## Generación durable, cuotas y almacenamiento

- La acción de generar registra un trabajo y lo despacha a Workflow. Nunca mantiene una llamada de IA ligada a la pestaña del usuario.
- Idempotencia por usuario/clave de envío; un guion por elemento de trabajo. Reclamar cada elemento con token y concesión temporal. Comprobar usuario activo y versión de acceso antes de llamar y antes de guardar.
- No pasar prompts, documentos, claves ni respuestas a los argumentos/resultados del workflow. El ejecutor recibe sólo el ID; los datos se resuelven en el paso autorizado y quedan en PostgreSQL.
- Tres intentos máximos por elemento y reintentos internos de proveedores desactivados. `createAiRequest` autoriza y registra atómicamente cada petición, sin cupos internos: el fallback de esquema cuenta como segunda llamada del mismo intento. Cada intento comparte un plazo de 240 s entre sus peticiones, dentro de una concesión de 360 s. Una caída entre respuesta externa y persistencia puede consumir otra llamada: no prometer ejecución externa exactamente una vez. Los contadores son telemetría; las variables antiguas `AI_DAILY_CALLS`, `AI_USER_DAILY_CALLS`, `AI_DAILY_JOBS`, `AI_DAILY_DISPATCHES` y `AI_32D_DISPATCHES` no bloquean llamadas, trabajos ni despachos.
- Saturación de Gemini: un HTTP 503 clasificado como `provider_overloaded` permite descender automáticamente `gemini-3.8-flash` → `gemini-3.7-flash` → `gemini-3.6-flash`, usando el siguiente intento de los tres existentes y conservando la espera de 30/60 s. La decisión se guarda en `GenerationItem.diagnostics.modelFallback` junto con `QUEUED` bajo la misma concesión, por elemento; una reanudación continúa desde ese modelo y no regresa al inicial. El pedido original no se modifica. No se cambia de proveedor, de clave ni de facturación. Cuota, autenticación, modelo desconocido, salida inválida, timeout y fallos de servidor sin evidencia de saturación no provocan descensos. En el último modelo quedan los reintentos normales disponibles. Pantalla, guion y trazas identifican el modelo efectivo. No reactiva trabajos terminales. Ver `reports/fallback-modelos-2026-09-25.md`.
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

Equipo, Actividad y Ajustes requieren Dueño. Cambiar UserWorkProfile o UserBrandAccess revoca sesiones y aumenta la versión de acceso mediante triggers. No se asignan perfiles por inferencia durante la migración. Sin perfiles, un miembro conserva inicio, ayuda y Mi perfil.

Las funciones de video en Assignment no sustituyen los perfiles de acceso. Los perfiles combinados suman capacidades sin ampliar el alcance de una capacidad distinta. Generar/escribir no concede aprobar o publicar. Publicación requiere la revisión final aprobada de postproducción; APROBADO sigue siendo una etapa previa a grabación.

El equipo no edita escenas, metadatos, vínculos ni adjuntos de un video con revisión final aprobada o en PROGRAMADO/PUBLICADO. Un guion compartido queda protegido si cualquiera de sus videos está cerrado. Las guardas y la aprobación serializan cambios con locks del guion y del video. Retirar la aprobación exige un motivo (5–1000 caracteres), capacidad de aprobación y auditoría; además hay que salir de PROGRAMADO/PUBLICADO para editar. El Dueño conserva su excepción administrativa auditada. La aprobación todavía depende del checklist; una versión inmutable y transiciones tipadas corresponden a B09.

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

- **La clave guardada en Ajustes manda; la variable de entorno es el respaldo**
  (`resolveApiKey` en `src/lib/settings.ts` devuelve `{ key, source: "db" | "env" }`). Ajustes
  y el generador dicen de dónde sale la clave en uso. Guardar o quitar una clave se audita solo
  con `summary` (ningún secreto entra al log; ver arriba).
- Los errores del proveedor se convierten en `AiError` en `toAiError` (`src/lib/ai/providers.ts`)
  con `code` (`auth | quota | model | server | schema | timeout`), `retryable` (`true` solo para
  `quota`, `server` y `timeout`; clave, modelo y esquema no se reintentan) y `diagnostic`
  (`{ provider, status?, code? }`: proveedor, código HTTP y código de transporte conocido; nunca
  claves, prompts ni el mensaje crudo). `clasificarError` mira primero los timeouts de
  transporte, luego las clases tipadas del SDK de Anthropic, después el `status` de Gemini
  (401/403 → `auth`, 429 → `quota`, 404 → `model`, 5xx → `server`) y solo al final el texto del
  mensaje. Los mensajes dicen **qué pasó y qué hacer**: clave rechazada → de dónde salió
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

Entidades válidas: `Brand`, `BrandObjective`, `CalendarEvent`, `ContentItem`, `ChecklistItem`,
`Assignment`, `Script`, `ScriptScene`, `Structure`, `Archetype`, `ArchetypeFit`, `Metric`,
`Asset`, `User`, `Comment`, `AppSetting`, `Auth`.

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
