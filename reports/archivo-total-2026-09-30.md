# Archivo total (M0): procedimiento de producción (2026-09-30)

Rama `feature/archivo-total`, desde `main` (656078e). Primera fase del GO «ALSOS marcas
independientes» (mini-spec §3.1). Interruptor `ARCHIVO_TOTAL_DESDE`, **vacío por defecto**: vacío,
la app se comporta como hoy. Contrato técnico: sección «Archivo total: ocultamiento por archivado»
de `CONTRACT.md`. Script de operador: `scripts/archivo-total.ts` (`npm run datos:archivo`).

> **Estado: ejecutado en producción el 30/09/2026**, con autorización explícita del Dueño y el
> código de `main` (`c61f483`). Lote `m0-prod-20260930`: 8 marcas archivadas.
> `ARCHIVO_TOTAL_DESDE=2026-09-30T22:29:13.000Z` quedó fijada solo en Vercel Production y se
> redesplegó. `--verificar` dio correcto y vigente (A6 = 0), y la puerta se reabrió. Las cuentas se
> conservaron. Antes del apply se tomó un respaldo completo de la base (punto de restauración de
> Neon de las 22:28:29 UTC). Para revertir se sigue la [reversa en 3 niveles](#reversa-en-3-niveles)
> con `--lote=m0-prod-20260930`: (1) vaciar `ARCHIVO_TOTAL_DESDE` y redesplegar; (2) cerrar la
> puerta, `--restore --lote=m0-prod-20260930` con la conexión de mantenimiento y vaciar la
> variable; (3) restaurar el respaldo o el punto de restauración de Neon.

## Qué hace y qué no hace

- **Escribe solo esto:** `Brand.archived=true` y `Brand.active=false` en las marcas creadas antes
  de la época, más su estado anterior exacto en `intia_ops.archive_entry` y la auditoría como
  «Sistema» (una fila por marca y una de resumen).
- **No toca** contenido, guiones, aprobaciones, pasos, cuentas, perfiles, accesos, sesiones,
  adjuntos ni blobs. **No borra nada** (sin DELETE). No cierra ninguna sesión.
- Lo que no tiene marca y es anterior a la época (tareas, eventos, guiones y generaciones
  personales) queda registrado como `HIDDEN`, sin cambios: la app lo oculta por fecha.
- Con `ARCHIVO_TOTAL_DESDE` fijada, **todos** (también el Dueño en las pantallas operativas) dejan
  de ver las marcas archivadas con todo lo suyo y lo personal anterior. La administración
  (`/marcas?estado=archivadas`, «Reactivar», `/actividad`, Ajustes) sigue viendo todo.
- Quien no tiene marcas vivas ve en Inicio «ALSOS se está renovando: pronto podrás crear tu marca
  o unirte a la de tu equipo», con el Manual, Mi perfil y «Cómo se usa».
- Siempre activas, con o sin la variable: el barrido de producción, encolar/reintentar
  generaciones y la recuperación diaria ignoran las marcas archivadas. La recuperación diaria,
  además, cancela sin llamar a la IA las generaciones de marcas archivadas que quedaron colgadas.
- «Reactivar» en `/marcas` sobre una marca del lote deja registrada su restauración (`YA_ESTABA`
  o `RESPETADA`), así `--verificar` y M1 la tratan como viva.

## Antes de empezar

- **D5 decidida.** La recomendación es observar la 6b de la cadena en la marca nueva (paso 10).
- **Quién ejecuta.** El `--apply` y la rama de Neon de T0 los ejecuta el Dueño, o Claude con su OK
  explícito en el chat en ese momento.
- **Ventana.** Corta, lejos del cron diario (`/api/maintenance`, 10:00 UTC = 05:00 Lima) y sin
  generaciones en curso. Con la puerta cerrada nadie puede guardar (T42).
- **Conexión.** Usa la conexión **directa** de Neon (sin `-pooler`) con
  `application_name=intia-migrator-20260909` (con `?` o `&` según la URL). Expórtala solo en la
  terminal del operador. No la imprimas ni la guardes en Git, capturas o informes. El script no lee
  `.env*`: usa `DATABASE_URL` del entorno y rechaza una base remota sin ese `application_name`.
- **Desde el mismo commit** que está desplegado. `npm run --silent` deja la salida en JSON limpio.

## Paso a paso

### 1. Desplegar el código con la variable vacía

Integra la rama en `main`. En Vercel, `ARCHIVO_TOTAL_DESDE` tiene que quedar sin definir o vacía en
Production y en Preview. La app se ve igual que antes. La única diferencia está en las guardas
siempre activas, que solo actúan ante marcas ya archivadas a mano.

### 2. Instalar el registro (una sola vez)

```bash
export DATABASE_URL='<conexión directa>…application_name=intia-migrator-20260909'
npx prisma db execute --file prisma/operations/archive-registry.sql --schema prisma/schema.prisma
```

Es idempotente: volver a correrlo no borra, no vacía y no reescribe nada. Si el registro se
instaló con una versión anterior del archivo (sin `archive_owner_grant`), vuelve a correrlo: el
script lo exige antes de escribir (`registro_faltante`). Para comprobarlo:

```sql
SELECT to_regclass('intia_ops.archive_batch') AS lotes, to_regclass('intia_ops.archive_entry') AS entradas,
       to_regclass('intia_ops.archive_owner_grant') AS concesiones,
       has_schema_privilege('public', 'intia_ops', 'USAGE') AS publico;   -- las tres tablas y false
```

### 3. Ensayo (solo lectura)

```bash
npm run --silent datos:archivo > ensayo-<fecha>.json
```

Revisa estos campos:
- **`bloqueos`** tiene que estar vacío:
  - `registro_faltante`: vuelve al paso 2;
  - `trabajos_en_curso`: el aviso separa los de marcas vivas (espera a que terminen o cancélalos
    desde Generaciones) y los de marcas ya archivadas (`enCurso.trabajosDeArchivadas`): esos no se
    ven en la app; los cancela la recuperación diaria (`/api/maintenance`, 10:00 UTC) cuando
    llevan 6 minutos sin avanzar;
  - `importaciones_pendientes`: termina las importaciones de métricas;
  - `otro_lote_aplicado`: ya hay un lote aplicado.
- **`conteos.marcas.aArchivar`**: las marcas que se archivan. `archivadasPrevias` ya estaban
  archivadas y no se tocan. `posteriores` son las creadas después de la época, que tampoco se tocan.
- **`conteos.enMarcasAArchivar`** y **`conteos.personalAnterior`**: lo que se va a ocultar.
- **`cuentasOwner`** (D2): antes de M2a tiene que quedar 1.
- **`desde`** y **`token`**: anótalos. La época por defecto es la hora de la base al correr el
  ensayo. Para fijar otra, usa `--desde=<ISO con Z>`.

### 4. Cerrar la puerta y crear la rama de Neon (T0)

Con la conexión de mantenimiento:

```sql
UPDATE intia_ops.deployment_gate SET blocked = true WHERE singleton;
```

Cerrar la puerta espera a que terminen los escritores en curso. Después, en Neon, crea la rama
**`antes-archivo-<lote>`** desde la rama de producción, en el momento actual, y anota la hora. Es
la reversa de nivel 3.

### 5. Aplicar el lote

```bash
npm run --silent datos:archivo -- --apply --lote=<lote> --desde=<desde del ensayo> --token=<token del ensayo> > apply-<lote>.json
```

- El lote va en minúsculas, dígitos y guiones. Por ejemplo: `m0-prod-20261001`.
- **Se espera:**
  - `ok: true` y `aplicado: true`;
  - `marcasArchivadas` igual a `aArchivar`;
  - `verificacion: { A1: 0, A2: 0, A3: "igual", A4: "igual", A5: marcas + 1 }`;
  - `copiaEscrita: true`.
- **La copia** queda en `.audit/archivo-total-<lote>.json`. Solo tiene ids y está fuera de Git.
  Guárdala junto al acta.
- **Si aborta:**
  - `recuento_cambio`: algo cambió desde el ensayo. Vuelve al paso 3 con la puerta cerrada.
  - `conflicto` o `tiempo_agotado`: no se guardó nada. Reintenta.
  - `puerta_abierta`: vuelve al paso 4.
- **Repetir el mismo comando** no duplica nada. Si `copiaEscrita` salió en `false`, repítelo para
  regenerar la copia.

### 6. Verificar con la puerta todavía cerrada

```bash
npm run --silent datos:archivo -- --verificar --lote=<lote>
```

Se espera:
- `ok: true` y `vigente: true`;
- A1, A2 = 0; A3 y A4 `"igual"`; A5 = marcas + 1;
- `A6.filasNuevas` = 0 y `copia: "ok"`.

### 7. Abrir la puerta

```sql
UPDATE intia_ops.deployment_gate SET blocked = false WHERE singleton;
```

### 8. Fijar la variable y redesplegar

En Vercel, ve a Project → Settings → Environment Variables → **Production** y define
`ARCHIVO_TOTAL_DESDE` con el valor exacto de `desde` (ISO con `Z`, por ejemplo
`2026-10-01T05:00:00.000Z`). Después, redespliega el deployment actual sin cambiar el código: la
variable solo se aplica al redesplegar.

- **No la fijes en Preview** contra la base de producción: Preview apunta a una rama de Neon (T41).
- **Si el valor es inválido**, el interruptor queda apagado y el log muestra
  `{"event":"archivo_total","reason":"epoch_invalid"}`. Corrígelo y vuelve a redesplegar.

### 9. Verificación en producción

**Como Dueño:**
- El Panel, `/contenido`, `/guiones`, `/calendario`, `/tareas`, `/metricas`, `/cadena`,
  «Mi trabajo» y Generaciones no muestran nada de las marcas archivadas.
- El selector de marca y `/marcas` ya no las listan. `/marcas?estado=archivadas` lista las N marcas.
- `/actividad` muestra las filas «Sistema» del lote.
- En `/tareas`, **las columnas globales siguen visibles**.

**Como miembro sin marcas vivas:** Inicio muestra el aviso de la renovación, con el Manual, Mi
perfil y «Cómo se usa». Las demás secciones llevan a `/sin-acceso` con el mismo aviso.

**Con el script:**

```bash
npm run --silent datos:archivo -- --verificar --lote=<lote>
```

Con la app abierta, `ok` puede salir `false`, porque A3 y A4 comparan con la foto del apply y el
uso normal los cambia: marcas nuevas, inicios de sesión, cambios de acceso. En ese caso, la salida
trae una `nota`. El seguimiento se hace con **`vigente: true`**, que exige A1, A2 y A5 bien y **A6
en 0 filas nuevas en marcas archivadas**. El proceso termina con código 1 siempre que `ok` sea
`false`.

### 10. Justo después, sin parón

1. **Crea la marca nueva** desde Marcas → Nueva.
2. **Vuelve a sumar al equipo** desde Equipo, con los perfiles y la marca nueva. Sus accesos a las
   marcas archivadas se conservan ocultos: el formulario los reenvía (`keptBrandIds`) y
   `saveTeamAccess` los protege en el servidor.
3. **Define el equipo de producción** de la marca nueva.
4. **Cambia `PRODUCTION_CHAIN_BRANDS`** al id de la marca nueva (o déjala vacía) y redespliega.
   Con ids viejos, la cadena quedaría encendida solo para marcas archivadas (T27).
5. **Observa A6 durante 48 h:** corre `--verificar` una vez al día y revisa que siga en
   `vigente: true` y A6 en 0, y que no haya 5xx nuevos. En la marca nueva se mide la 6b de la
   cadena (D5).

**Si reactivas una marca del lote** (`/marcas?estado=archivadas` → «Reactivar»): la acción deja
registrada su restauración en el mismo guardado (`YA_ESTABA` o `RESPETADA`, sin darle dueño) y la
Actividad dice «…y la sacó del archivo total <lote>». `--verificar` sigue en `vigente: true` y A6
deja de mirar esa marca. Si alguien la reactivó por fuera de la app, `--verificar` la lista en
`vivasSinRegistro` (A2 > 0): concíliala con `--restore-marca=<id> --dueno=<correo>`.

## Reversa en 3 niveles

Nunca `git revert`, `DROP` ni DELETE.

1. **Mostrar otra vez (minutos).** Vacía `ARCHIVO_TOTAL_DESDE` en Vercel y redespliega.
   - Vuelve a verse lo mismo que antes de M0: el contenido de las marcas archivadas y lo personal
     anterior, y los miembros recuperan sus perfiles.
   - Las marcas **siguen archivadas** en los datos y las guardas siempre activas siguen valiendo.
2. **Deshacer los datos.**
   1. Cierra la puerta (paso 4, sin crear otra rama).
   2. Corre
      `npm run --silent datos:archivo -- --restore --lote=<lote>`. Desde M1, agrega
      `--dueno=<correo del dueño>`: es obligatorio.
   3. Corre `--verificar --lote=<lote>`. Se espera `R1: { pendientes: 0, diferencias: 0 }` y
      `vigente: true`.
   4. Abre la puerta, vacía la variable y redespliega.

   **Qué garantiza el restore:**
   - devuelve cada marca a su `archived/active` exacto;
   - nunca reactiva una marca que ya estaba archivada antes del lote;
   - respeta los cambios hechos a mano después (`RESPETADA`).

   **Con los roles por marca (M1), qué hace `--dueno`:**
   - da `DUENO_MARCA` a esa cuenta **solo en las marcas que el restore devuelve a la vida**. Si no
     tenía membresía, la crea; si era `MIEMBRO` activa, la sube a dueña;
   - **no levanta una membresía `SUSPENDED`**: la marca sale en `suspendidasRespetadas` y en
     `marcasVivasSinDueno`, para que elijas otro dueño;
   - las marcas vivas por un cambio a mano (`YA_ESTABA`/`RESPETADA`) solo se informan
     (`vivasSinConceder`);
   - cada permiso concedido queda en `intia_ops.archive_owner_grant` con la membresía anterior
     exacta y en `/actividad` como «Sistema» (`ASIGNAR`, con rol, estado y cuenta antes y
     después). Para deshacer uno, devuelve esa membresía a `prev_role`/`prev_status` (o retírala si
     `prev_role` es NULL) con la acción de la plataforma de M1; nunca a mano en producción.

   **Para una sola marca:** `--restore-marca=<id> --dueno=<correo>`. El resto del lote sigue
   archivado.

   **Un lote restaurado no se vuelve a aplicar.** Para archivar de nuevo, corre otro ensayo y
   aplica otro lote con un nombre nuevo. Usa la misma `--desde` si quieres la misma época: así las
   marcas creadas después no entran.
3. **Último recurso: la rama de Neon `antes-archivo-<lote>`.** El Dueño restaura la rama de
   producción a ese punto desde la consola de Neon. **Descarta todo lo escrito después**, incluidos
   la marca nueva y el trabajo del equipo. Después, vacía la variable y redespliega.

## Qué no hacer

- **No archivar ni reactivar a mano** con `UPDATE "Brand"` fuera del script o de «Reactivar»: esas
  marcas no quedan en el registro y M1 no las clasifica bien.
- **No fijar `ARCHIVO_TOTAL_DESDE` sin un lote aplicado:** ocultaría lo personal anterior sin dejar
  registro.
- **No quitar las defensas de Equipo.** Son los `keptBrandIds` ocultos y la guarda de
  `saveTeamAccess`. Sin ellas, guardar una ficha borraría los accesos a marcas archivadas.
- **No borrar el registro.** Sus triggers lo impiden, y M1 lo necesita para el relleno.

## Ensayo local del 30/09/2026

Base `intia_catalogo_dev`, en Docker `intia-consistency-test` (127.0.0.1:5546). Antes de empezar
se tomó un respaldo `pg_dump` de la base en el scratchpad de la sesión: es el equivalente local de
la rama de T0.

| Paso | Resultado |
|---|---|
| Ensayo sin registro | Un solo bloqueo, `registro_faltante`. No escribió nada |
| Registro | Instalado con la conexión de mantenimiento. Tiene 4 triggers y `PUBLIC` sin acceso |
| Ensayo | `desde` `2026-09-30T21:30:20.000Z` y token `80f6227b0b804145`. Sin bloqueos. 2 marcas (Con Amor, Geek), 15 videos, 6 guiones, 6 tareas, 4 eventos, 6 pasos y 2 cuentas OWNER |
| `--apply` `m0-local-20260930` | 2 marcas archivadas. A1 0, A2 0, A3 igual, A4 igual, A5 3. Copia escrita |
| Foto por fila antes y después del apply | Solo cambian `Brand.archived/active` de las 2 marcas, más 3 filas de auditoría. Las sesiones nuevas son las de la verificación |
| `--verificar` inmediato | `ok: true` |
| Lecturas con la época (Dueño y Edward) | 0 elementos de marcas archivadas en `contentScope`, `scriptScope`, `taskScope`, `eventScope`, `brandScope`, `productionStepScope`, `readMyWork`, `readChain`, `stepCalendarEntries`, `getContentList`, `getTaskBoard` y `generationHistory`. Las 5 columnas globales siguen visibles. Edward (`brandIds` vacío) queda solo con `base`. Las páginas renderizadas (Panel, Contenido, Guiones, Calendario, Tareas, Métricas, Cadena, Generaciones) no muestran ningún id de las archivadas. `/marcas?estado=archivadas` y `/actividad` sí las muestran. Edward ve el aviso de la renovación y el resto le lleva a `/sin-acceso` |
| Marca «ALSOS Piloto» | Creada con la acción real `crearMarca`. Edward se sumó desde Equipo con un formulario **sin** la marca archivada, y la guarda del servidor conservó su acceso a Con Amor. Se definió el equipo de la marca, y el video nuevo nació con su paso GUION asignado a Edward (cadena encendida solo en ese proceso, con canario en la marca nueva). Encolar una generación para Con Amor fue rechazado («La marca está archivada…») y no se creó ningún trabajo. Dueño y Edward ven la marca nueva y siguen sin ver nada archivado |
| `--verificar` después del piloto | `ok: false`, porque A3 y A4 cambian con la marca nueva y los accesos. `vigente: true`, A6 0 y `nota` explicativa |
| `--restore` | 2 marcas `RESTAURADA`. La foto antes y después del restore solo cambia `Brand.archived/active` de las 2 marcas, más 3 filas de auditoría. El ensayo posterior con la misma `--desde` da **el mismo token**, `80f6227b0b804145`, así que el recuento de lo que cuelga de las marcas es idéntico. `--verificar` da R1 `{ pendientes: 0, diferencias: 0 }` y `vigente: true` |
| Nuevo `--apply` `m0-local-20260930-b` | Mismo token. 2 marcas archivadas y A1 a A5 bien. `--verificar` da `ok: true`, `vigente: true` y A6 0 |
| Correcciones de la revisión (misma fecha) | Registro reinstalado (idempotente) con `archive_owner_grant`; hasta hacerlo, el script respondía `registro_faltante`. Con la época, la lista de Estructuras pasa de 5 guiones a 0, la participación de Equipo de 63 asignaciones a 1 (la del piloto) y las columnas globales «Listo» e «Idea o Acción» de 4 y 3 tareas a 0 y 1, igual que el tablero. 0 generaciones colgadas de marcas archivadas |
| `--restore` `m0-local-20260930-b` | 2 marcas `RESTAURADA`, sin dueño (no hay `BrandMembership` en local). `--verificar`: R1 `{ pendientes: 0, diferencias: 0 }`, `vigente: true` |
| Ensayo y `--apply` `m0-local-20260930-c` | Mismo token `80f6227b0b804145`, sin bloqueos. 2 marcas archivadas, A1 a A5 bien, copia escrita con `concesiones: []`. `--verificar` da `ok: true`, `vigente: true` y A6 0. **Queda aplicado en local** |

Estado local final:
- `.env.local` tiene `ARCHIVO_TOTAL_DESDE="2026-09-30T21:30:20.000Z"`;
- el lote aplicado es `m0-local-20260930-c`; `m0-local-20260930` y `m0-local-20260930-b` quedan
  `RESTORED` en el registro;
- «ALSOS Piloto» es la única marca viva, con el primer video y el paso de guion de Edward.

Frente al comienzo, lo único previo que cambió fue producto del piloto, no del archivo:
- la ficha de Edward tiene `sessionVersion` +1;
- se cerraron 4 sesiones suyas, por el trigger de accesos al sumarlo a la marca nueva.

Su descripción y su color, que el primer formulario de prueba borró, se devolvieron con la misma
acción de Equipo, que quedó auditada.

## Archivos

- **Operación:**
  - `prisma/operations/archive-registry.sql`
  - `scripts/archivo-total.ts`
  - `tests/postgres-archivo-total.test.mjs`
  - `package.json` (`datos:archivo`)
  - `scripts/test-postgres.mjs` (suites `archivo-total` y `archive-scope`)
- **Núcleo:**
  - `src/lib/archive-epoch.ts`, `src/lib/archive-scope.ts` y `src/lib/archive-registry.ts`
    («Reactivar» registra la restauración de la entrada)
  - `auth.ts`, `permissions.ts`, `access-scope.ts`, `production-scope.ts`
  - `calendar-subscriptions.ts`, `generation-jobs.ts`, `production-sweep.ts`, `maintenance.ts`
    (con `closeArchivedJobs`)
  - `team-access.ts` (guarda de accesos archivados), `actions/brands.ts` (`archivarMarca`)
  - `tests/archive-scope.test.mjs`
- **Pantallas:**
  - `(app)/page.tsx`, `contenido/[id]`, `guiones`, `guiones/[id]`, `calendario`
  - `estructuras` y `estructuras/[id]`, `tutorial`, `equipo` (con `user-form.tsx`), `sin-acceso`,
    `mi-perfil`
  - `layout.tsx` y `shell.tsx`
  - `api/calendario.ics`, `member/home.tsx`
  - `content-list.ts`, `task-pages.ts`, `metric-dashboard.ts`, `generation-history.ts`,
    `metric-import-parser.ts`, `team-participation.ts`, `team-list.ts`
  - `actions/tasks.ts` y `tareas/task-board.tsx` (eliminar columna)
  - `tests/navigation.test.mjs`
- **Documentación:**
  - `CONTRACT.md`
  - `.env.example` (`ARCHIVO_TOTAL_DESDE`, `ARCHIVO_TOTAL_AUDIT_DIR` y `ARCHIVO_TOTAL_DEBUG`)
  - este informe
