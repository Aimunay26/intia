# CONTRATO INTERNO DEL PROYECTO

Documento de referencia obligatorio. Todo el código nuevo debe respetarlo al pie de la letra.

## Stack

- Next.js 15 App Router + React 19 + TypeScript estricto.
- Tailwind CSS v4 (sin `tailwind.config`; los tokens viven en `src/app/globals.css`).
- Prisma 6 + SQLite en local / PostgreSQL en producción.
- **Server Components por defecto.** `"use client"` solo cuando hace falta estado o eventos.
- **Server Actions** para todas las escrituras. No se crean rutas API salvo descarga de archivos.
- Iconos: `lucide-react`.

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
| `/guiones` · `/guiones/[id]` | Biblioteca y visualizador de guiones |
| `/estructuras` · `/estructuras/[id]` | Formatos ganadores + prompt + PDFs |
| `/arquetipos` · `/arquetipos/[id]` | Personas frente a cámara: perfil, marca personal y compatibilidad |
| `/metricas` | Visualizador de métricas |
| `/equipo` | Personas |
| `/actividad` | Log de auditoría |
| `/ajustes` | Claves de IA, entrada con Google y calendario |

Rutas de API (las únicas que existen, y cada una por un motivo):

| Ruta | Por qué no es una Server Action |
|---|---|
| `/api/auth/google` · `/api/auth/google/callback` | Google necesita redirigir a una URL |
| `/api/calendario.ics` | Google Calendar la pide desde sus servidores, sin sesión |
| `/api/assets/[id]` | Devuelve los bytes de un archivo |
| `/api/logout` | Borra la cookie y redirige |

Todas viven bajo el grupo `src/app/(app)/`, que ya aplica `requireUser()` y la carcasa.

## Autenticación y permisos

**Solo hay dos posiciones.** No se añaden más.

```ts
import { requireUser, requireLevel, can, LEVEL } from "@/lib/auth";

const user = await requireUser();              // en páginas
const user = await requireLevel(LEVEL.MEMBER); // crear, editar, mover
const user = await requireLevel(LEVEL.OWNER);  // eliminar, equipo, ajustes
can(user.role, LEVEL.OWNER)                    // para ocultar botones en la UI
```

| Posición | Nivel | Puede |
|---|---|---|
| `OWNER` (Dueño) | 2 | Todo. Es la única que **elimina**, gestiona personas y toca ajustes. |
| `MEMBER` (Equipo) | 1 | Crea, edita, mueve, asigna, publica. **No elimina nada.** |

La regla es literal: **toda acción que destruya una entidad completa exige
`LEVEL.OWNER`**. Eso incluye marca, objetivo, video, guion, estructura, arquetipo,
métrica, archivo, usuario y evento de agenda.

Las cuatro excepciones a propósito, que son *mover* y no *destruir*, y por eso van
con `LEVEL.MEMBER`: quitar un check de la lista, quitar una escena de un guion,
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
| 1 · Idea | `/calendario`, `/contenido` | Nace la tarjeta: marca, fecha, título, hook, redes, prioridad. **Sin `structureId` ni `scriptId`.** |
| 2 · Guion | `/generador`, `/guiones` | Se escribe el guion eligiendo estructura y quién actúa. |
| 3 · Unión | `/guiones/[id]` | `asignarGuionAVideo` conecta ambos. |

Al unirlos, el video **hereda `structureId` del guion** y, si estaba en `IDEA`, pasa a `GUION`.

**No devuelvas selectores de estructura ni de guion al alta del video.** Se quitaron
deliberadamente: la estructura llega con el guion, no antes.

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
import { prisma } from "@/lib/prisma";
import { requireLevel, LEVEL } from "@/lib/auth";
import { logAudit, diffFields, FIELD_LABELS } from "@/lib/audit";
import { field, fieldOrNull, intField, numField, boolField, dateField } from "@/lib/utils";

export async function actualizarVideo(id: string, formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);

  const before = await prisma.contentItem.findUniqueOrThrow({ where: { id } });
  const data = { title: field(formData, "title"), status: field(formData, "status") };

  await prisma.contentItem.update({ where: { id }, data });

  await logAudit({
    user,
    action: "EDITAR",
    entity: "ContentItem",
    entityId: id,
    brandId: before.brandId,
    summary: `Editó el video "${data.title}"`,
    changes: diffFields(before, data, FIELD_LABELS),
  });

  revalidatePath("/contenido");
  revalidatePath(`/contenido/${id}`);
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

23 de las 27 ediciones guardan el antes. Las 4 que no son las 4 que no deben: guardar una clave
de API, quitarla, rotar el token del calendario y cambiar una contraseña. **Ningún secreto entra
al log**, y eso no es un hueco que arreglar.

Acciones válidas: `CREAR`, `EDITAR`, `ELIMINAR`, `COMPLETAR`, `REABRIR`, `ASIGNAR`,
`DESASIGNAR`, `GENERAR`, `SUBIR`, `LOGIN`, `LOGOUT`.

Entidades válidas: `Brand`, `BrandObjective`, `CalendarEvent`, `ContentItem`, `ChecklistItem`,
`Assignment`, `Script`, `ScriptScene`, `Structure`, `Archetype`, `ArchetypeFit`, `Metric`,
`Asset`, `User`, `Comment`, `AppSetting`, `Auth`.

Al construir el motor automático de match hay que dar de alta `MatchRun` en `AUDIT_ENTITIES`
**y** en `ENTITY_LABELS`: la pantalla de actividad valida el filtro contra ese array y sin la
etiqueta imprimiría el nombre técnico en inglés.

## Campos JSON

Varios campos son `String` que contienen JSON (para que el esquema funcione igual en SQLite y
Postgres). **Nunca leerlos con `JSON.parse` directo.** Usar siempre:

```ts
import { parseJson, parseList, linesToJson, jsonToLines } from "@/lib/utils";

parseList(brand.valueProps)          // string -> string[]
parseJson<Beat[]>(structure.beats, []) // string -> objeto tipado
linesToJson(textareaValue)           // textarea (una línea por ítem) -> JSON
jsonToLines(brand.doNots)            // JSON -> textarea
```

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
