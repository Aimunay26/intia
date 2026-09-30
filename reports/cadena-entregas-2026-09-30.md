# Cadena de entregas por video — mini-spec final (2026-09-30)

Rama `feature/cadena-entregas`, desde `origin/main` (1b57cb8). Cambio L de arquitectura: rama
dedicada, sin commits todavía. Interruptor principal `PRODUCTION_CHAIN_ENABLED`, **apagado por
defecto**: apagado, el sistema se comporta exactamente como hoy y las suites anteriores pasan sin
cambios. Contrato técnico: sección «Cadena de entregas por video» de `CONTRACT.md` y la cabecera
de `src/lib/domain/production-chain.ts`.

## Decisiones del Dueño (29-30/09/2026)

Mandan sobre la mini-spec del 29/09 (que proponía revisiones del encargado).

1. **Guion → filmmaker directo, sin aprobación del encargado.** Al «Listo» del guionista (guion
   vinculado, al menos una escena, CTA no vacío, guion no archivado), la cadena firma como
   «Sistema», «por el Listo de (guionista) (regla del dueño: sin revisión de guion)»: guion
   BORRADOR→REVISION→APROBADO con su versión (`approveVersion`), check «Guion escrito y
   revisado», `SCRIPT_APPROVAL` y video →GUION→APROBADO. Abre la grabación con fecha = próximo día
   de grabación de la marca **posterior** a ese Listo (recalcula una fecha automática; respeta una
   manual). No existe el paso `REVISION_GUION`.
2. **Editor → community directo.** Al «Listo» del editor (con el enlace del máster) la cadena marca
   los checks de edición, firma `FINAL_APPROVAL` como «Sistema» («por el Listo de (editor); regla
   del dueño: sin revisión final») y abre la publicación al día hábil siguiente. No existe
   `REVISION_FINAL`. El community puede **«Devolver por correcciones»** (comentario obligatorio,
   5-1000): se revoca la aprobación final como «Sistema» con ese motivo, la publicación queda
   `DEVUELTO` y cerrada, la edición vuelve a `PENDIENTE` al día hábil siguiente y el motivo queda
   como comentario del video. El editor puede devolver al filmmaker (con motivo) y el filmmaker
   puede «Avisar a coordinación».
3. **Encargado = coordinación.** Supervisa en la vista «Cadena» y recibe en «Mi trabajo» los pasos
   «Sin asignar», los avisos y los bloqueos. Si la marca no tiene ENCARGADO, todo eso le llega al
   Dueño (usuarios `OWNER`).
4. **Inicio:** «Mi trabajo» va primero, encima de la tarjeta del Manual, para miembros y Dueño.
5. **Excepción a `CONTRACT.md`** («las aprobaciones las firma una persona»): documentada como
   decisión del Dueño. Cada firma automática se audita con actor «Sistema» y «por el Listo de …
   [en nombre de …]»; `Approval.approvedByName` empieza por «Sistema (Listo de …)».

---

### Idea: cadena de entregas por video | Fecha: 2026-09-29

**1. IDEA (síntomas)**

- El guionista no tiene un «terminé»: el filmmaker recibe «Grabar» apenas se vincula un borrador.
- El editor marca hecho y nadie recibe la publicación; el ENCARGADO no se usa en ninguna parte.
- «Marcar hecho» no avanza estado ni checks; STRATEGY no puede pasar a Grabación ni a Edición.
- El perfil no tiene «Te toca»; la tarea de `/tareas` y el paso no se sincronizan.
- Sin persona para una función (o con la asignación automática apagada) el paso no se crea.
- Publicar no cierra el paso del community.
- El calendario no muestra editar ni diseño, ni al responsable; no hay «lo mío»; el ICS es solo
  del Dueño.
- Devolver, desvincular, reabrir y reasignar dejan pasos, tareas y fechas desfasados; el barrido
  cierra grabaciones que nunca se hicieron.

**2. EVALUACIÓN**

- Dolor real: alto. Es el pedido explícito del Dueño y la operación diaria de las marcas con equipo.
- Costo: L. Toca el núcleo: ciclo de vida, dominio del flujo, acciones, tablero, calendario y permisos.
- Riesgo en prod: medio-alto (camino crítico del video y de las aprobaciones). Se mitiga con el
  interruptor apagado por defecto y el canario por marca.
- Reversibilidad: alta. Apagar el interruptor devuelve el flujo actual sin tocar datos; las
  migraciones solo amplían CHECK.
- ► Veredicto: **GO** en rama dedicada (único GO activo; la «Previa de guiones» entra como
  consumidora de este GO).

**3. PLANIFICACIÓN**

- Archivos:
  - Dominio: `src/lib/domain/production-chain.ts` (nuevo), `production-flow.ts`, `lifecycle.ts`,
    `src/lib/production-scope.ts` (nuevo), `production-chain-flag.ts` (nuevo),
    `production-sweep.ts`, `working-days.ts`, `constants.ts`.
  - Acciones: `production.ts`, `content.ts`, `tasks.ts`, `brand-team.ts`, `scripts.ts`,
    `publication.ts`, `calendar-feed.ts`.
  - UI: `src/components/work/*` (nuevo), `/cadena` (nuevo), Inicio, Panel del Dueño, panel
    «Producción», tablero de tareas, ayuda, menú, calendario, `.ics` y Mi perfil.
  - Datos: dos migraciones que solo amplían CHECK, más el índice `("brandId","status","dueAt")`.
- Diseño:
  - **Estado en memoria vs persistencia:** no hay nada en memoria. `ProductionStep` es la única
    verdad; estado del video, checks, aprobaciones y tarea se escriben desde el paso en la misma
    transacción. Interruptores leídos de `process.env` en cada llamada; «vencido» se calcula al
    leer; filtros en la URL.
  - Un paso de cadena abierto por video (GUION → GRABACION → EDICION → PUBLICACION; DISENO en
    paralelo), reactivación en vez de duplicado, estado `DEVUELTO`, «Sin asignar» visible.
  - Un botón «Listo» por rol que llama a `completeStep`; los caminos viejos convergen por
    `chainEvent` (en SAVEPOINT). Sincronía tarea↔paso en ambos sentidos.
- Plan de reversa: ver «Plan de reversa».
- Criterio de HECHO: ver «Criterio de HECHO».

**4. DESARROLLO**

- Rama: `feature/cadena-entregas` (L, arquitectura). Constructores B1 (dominio y datos), B2
  (acciones), B3 (perfiles y UI), B4 (calendario e ICS) e integrador.
- [x] Interruptores implementados junto con el cambio y probados encendidos y apagados (suites con
  la cadena apagada sin cambios; suites nuevas con la cadena encendida y en canario).

**5. DEBUGGING**

- Causa raíz (1 frase): el flujo se modeló como disparos sueltos que crean pasos sin nadie a cargo
  del avance, y estado del video, paso y tarea eran tres copias que no se escribían entre sí; cada
  «listo» movía solo la suya y la persona siguiente dependía de permisos que no tenía.
- [x] Fix dirigido a la causa: un único dueño del avance (`completeStep`/`chainEvent`) que escribe
  las tres copias en la misma transacción, con el invariante «un paso abierto por video». Ningún
  `catch` queda mudo: los ganchos registran `production_chain` con un código cerrado.

**6. TESTING**

- [x] Entorno seguro: caso normal y casos borde (ver «Evidencia»).
- [ ] Prod: criterio de HECHO cumplido y estable (pendiente de despliegue; ver «Despliegue»).

**7. CIERRE**

- [ ] Merge a `main` tras la estabilidad en producción.
- [ ] Memoria escrita (causa raíz de la sección 5 y el rollback: apagar el interruptor, no revertir
  migraciones).
- [ ] Retirar la instrumentación temporal `complete_step` (milisegundos) el **2026-10-20**, o
  antes si Q1-Q5 llevan 7 días en 0.

---

## Flujo final

```
GUION (guionista) ─Listo─► GRABACION (filmmaker) ─Listo─► EDICION (editor) ─Listo─► PUBLICACION (community) ─Publicado─► fin
                                ▲                            │  ▲                           │
                                └──── Devolver al filmmaker ─┘  └── Devolver por correcciones ┘
DISENO en paralelo: «Pedir diseño» → «Entregar diseño» → quien lo pidió puede «Pedir cambios»
```

| Paso | Botón | Plazo (Lima, lunes a sábado) | Qué exige | Qué firma o escribe |
|---|---|---|---|---|
| Guion | «Listo, enviar al filmmaker» | Fin del 2.º día hábil desde que nace | Guion vinculado, ≥ 1 escena, CTA, no archivado | Guion aprobado, «Guion escrito y revisado», `SCRIPT_APPROVAL`, video Aprobado (Sistema) |
| Grabación | «Listo, pasar a edición» | Próximo día de grabación posterior al Listo del guion (`shootDate`) | Enlace del material, checks de Preproducción y Grabación | Checks, video Grabación→Edición (Sistema) |
| Edición | «Listo, enviar al community» | Día hábil siguiente a la grabación (sábado → lunes) | Enlace del máster distinto del material | Checks de edición, `FINAL_APPROVAL` (Sistema) |
| Publicación | «Publicado» | Día hábil siguiente, o la fecha prevista si es posterior | URL pública, checks de Publicación | Video Programado→Publicado (Sistema) |
| Diseño | «Entregar diseño» | 24 h sin domingo | Enlace de la entrega | Checks de diseño |

Otras reglas, completas en `CONTRACT.md`:

- «Sin asignar» visible y asignable, también con la asignación automática apagada.
- El guionista del equipo recibe la asignación GUIONISTA, así puede editar un guion generado por
  otra persona.
- Mover la tarea a la última columna equivale al «Listo», con las mismas validaciones, y el «Listo»
  mueve la tarea.
- Reasignar o mover una fecha sincroniza tarea, paso y fechas del video.
- Desvincular, cancelar y reabrir sincronizan los pasos.
- `recordPublication` y el estado Publicado cierran la publicación.
- Con la cadena encendida, el barrido no cierra grabaciones que no se hicieron.

## Interruptores y plan de reversa

| Variable | Por defecto | Encendida | Apagada |
|---|---|---|---|
| `PRODUCTION_CHAIN_ENABLED` | `false` (exige `PRODUCTION_FLOW_ENABLED="true"`) | Cadena completa: «Listo», devoluciones, avisos, firmas automáticas, «Mi trabajo», `/cadena`, tarea↔paso, barrido sin cierre | El flujo de producción de antes. Los pasos Guion pendientes se ocultan. No se toca ningún dato |
| `PRODUCTION_CHAIN_BRANDS` | vacío = todas | Canario: solo las marcas listadas (IDs separados por coma) | — |
| `CALENDARIO_PASOS` | encendido (solo actúa con la cadena) | Pasos en el calendario, «Solo lo mío» y el calendario del perfil Diseñador | Calendario de siempre; el diseñador sin calendario |
| `CALENDAR_FEED_PERSONAL` | `false` | `.ics` por persona desde Mi perfil | Solo los enlaces del Dueño; un feed personal responde 401 |

**Para apagar:** cambiar la variable en Vercel y redesplegar. Nunca `git revert` ni `DROP`. Lo ya
firmado (aprobaciones de «Sistema», estados, checks) sigue siendo válido porque son hechos
auditados. Los pasos Guion y `DEVUELTO` quedan como historial.

**Migraciones: no revertir.** Solo amplían CHECK y el código anterior nunca escribe los valores
nuevos. Para estrecharlas en el futuro, antes deben dar 0:

```sql
SELECT count(*) FROM "ProductionStep" WHERE step = 'GUION' OR status = 'DEVUELTO';
SELECT count(*) FROM "CalendarSubscription" WHERE scope = 'USER';
```

## Criterio de HECHO

1. **Recorrido en local**: un video de IDEA a PUBLICADO solo con el «Listo» de cada rol.
   - 0 «Excepción del Dueño» en su auditoría.
   - Estados IDEA→GUION→APROBADO→GRABACION→EDICION→PROGRAMADO→PUBLICADO.
   - 4 pasos `HECHO` y 4 tareas en la última columna.
   - Una devolución reabre exactamente un paso.
   - Cumplido; ver «Evidencia».
2. **Invariantes en 0 cada día durante 7 días** tras encender en producción. `<encendido>` es el
   instante en que se encendió la cadena para la marca.
   - **Q1, tarea desfasada.** Solo pasos creados desde el encendido: los pasos del flujo anterior
     no movían su tarea, así que pueden arrastrar desfases históricos. La base local tiene uno, de
     28/09.
     ```sql
     SELECT count(*) FROM "ProductionStep" s JOIN "Task" t ON t.id=s."taskId"
     JOIN LATERAL (SELECT c.id FROM "TaskColumn" c WHERE c."brandId" IS NULL OR c."brandId"=s."brandId"
                   ORDER BY c."order" DESC, c.id DESC LIMIT 1) l ON true
     WHERE s."createdAt" >= '<encendido>' AND (s.status='PENDIENTE') = (t."columnId"=l.id);
     ```
   - **Q2, video activo de una marca con equipo, creado tras encender, sin paso abierto.**
     ```sql
     SELECT count(*) FROM "ContentItem" c WHERE c.status IN ('IDEA','GUION','APROBADO','GRABACION','EDICION','PROGRAMADO')
     AND c."createdAt" >= '<encendido>' AND EXISTS (SELECT 1 FROM "BrandTeamMember" m WHERE m."brandId"=c."brandId")
     AND NOT EXISTS (SELECT 1 FROM "ProductionStep" s WHERE s."contentItemId"=c.id AND s.status='PENDIENTE' AND s.step<>'DISENO');
     ```
   - **Q3, publicación pendiente en un video publicado.**
     ```sql
     SELECT count(*) FROM "ProductionStep" s JOIN "ContentItem" c ON c.id=s."contentItemId"
     WHERE s.step='PUBLICACION' AND s.status='PENDIENTE' AND c.status='PUBLICADO';
     ```
   - **Q4, más de un paso de cadena pendiente por video.**
     ```sql
     SELECT count(*) FROM (SELECT "contentItemId" FROM "ProductionStep" WHERE status='PENDIENTE' AND step<>'DISENO'
     GROUP BY "contentItemId" HAVING count(*)>1) x;
     ```
   - **Q5, responsable inactivo o sin acceso a la marca.**
     ```sql
     SELECT count(*) FROM "ProductionStep" s JOIN "User" u ON u.id=s."assigneeId" WHERE s.status='PENDIENTE'
     AND (NOT u.active OR (u.role<>'OWNER' AND NOT EXISTS (SELECT 1 FROM "UserBrandAccess" a WHERE a."userId"=u.id AND a."brandId"=s."brandId")));
     ```
3. **Logs:** 0 eventos `production_chain` o `production_flow` con `reason:"error"` en 48 h.
4. **Calendario:** cada paso pendiente aparece en el calendario de su responsable, en el día de su
   plazo.
5. **Tests:** `npm test` y las suites de Postgres en verde, con la cadena apagada (suites
   anteriores sin cambios, salvo permisos por `/cadena` y el calendario del diseñador) y encendida
   (suites nuevas).

## Evidencia (30/09/2026, local)

| Verificación | Resultado |
|---|---|
| `npx tsc --noEmit` | 0 errores |
| `npm run lint` | 0 errores, 0 avisos |
| `npm test` (incluye `test:cta`, `test:presets`, `test:manual` y `test:manual-guias`) | 273 + 11 + 10 + 66 + 11, todo verde |
| Postgres: `production-flow`, `production-chain`, `production-chain-actions`, `permissions`, `workflow`, `completion`, `secrets`, `navigation` y `demo` | 1, 10, 6, 13, 13, 11, 11, 8 y 3 pruebas; 0 fallos |
| Ensayo de migraciones (`PG_TEST_CONTAINER=intia-consistency-test node scripts/rehearse-migration.mjs`) | Correcto: `productionChainChecksWidenedOnly`, `productionChainExistingRowsPreserved`, `calendarFeedUserRehearsed`, `restoreRowsAndSchemaMatch`; 42 tablas |
| `npm run build` | Correcto. `/cadena` compila; solo aparecen los avisos conocidos de `@vercel/queue` |
| Recorrido real en `intia_catalogo_dev` (Con Amor, cuentas de `db:equipo-demo`, flujo y cadena encendidos) | 39 verificaciones correctas; detalle abajo |

**Recorrido.** Video «[Prueba cadena 2026-09-30 16:46] Recorrido IDEA→PUBLICADO»; se dejó en la
base local como evidencia.

- Se creó con la acción real `crearVideo` y el guion se unió con `asignarGuionAVideo`. Después,
  solo `completeStep` por rol, más una devolución con `returnStep`.
- **Edward (guionista):** «Listo».
  - Guion APROBADO, firmado por «Sistema (Listo de Edward)».
  - Video APROBADO. Grabación el jueves 01/10, próximo día de grabación de la marca (martes y
    jueves), asignada a Carlos.
- **Carlos (filmmaker):**
  - Sin enlace, el «Listo» se rechaza: «Falta el enlace del material grabado».
  - Con enlace: video en EDICION y edición para Laudder el 01/10.
- **Laudder (editor):** «Listo» con el máster. `FINAL_APPROVAL` v1 firmada por «Sistema (Listo de
  Laudder)» y publicación para Silvanna el 03/10.
- **Silvanna (community):** «Devolver por correcciones».
  - `FINAL_APPROVAL` v1 revocada con el motivo.
  - Publicación en `DEVUELTO` y su tarea en «Listo».
  - Edición `PENDIENTE` para Laudder. Es el único paso abierto.
  - Comentario guardado. «Mi trabajo» de Laudder muestra el motivo.
- **Laudder:** «Listo» con el máster v2. `FINAL_APPROVAL` v2 firmada y la misma publicación
  reactivada.
- **Silvanna:** «Publicado». Video PUBLICADO con `publishedAt`. Un segundo «Publicado» devuelve
  `already` y no escribe nada.
- **Verificación final:**
  - Transiciones: IDEA→GUION→APROBADO→GRABACION→EDICION→PROGRAMADO→PUBLICADO.
  - 4 pasos `HECHO` y 4 tareas en «Listo».
  - 0 «Excepción del Dueño».
  - Todas las firmas son «Sistema (Listo de …)» y hay 9 entradas «(Sistema, por el Listo de …)».
  - Q1-Q5 del video en 0 después de cada paso.
  - Q2-Q5 de toda la base en 0. Q1 de toda la base da 1: un paso GRABACION del flujo anterior,
    del 28/09, cuya tarea nunca se movió. Es anterior a la cadena.
  - Calendario: cada responsable ve su paso en el día del plazo, pendiente y después hecho. El
    Dueño ve los 4 pasos, y las fechas de grabación y publicación del video quedan cubiertas por
    los pasos.
  - 0 logs `production_chain` con `error`.

## Despliegue

1. **Prerrequisito:** `20260928180000_production_flow` aplicada en Neon. La memoria del proyecto
   la marcaba pendiente: comprobar con `npx prisma migrate status` desde el commit que se
   despliega.
2. Aplicar `20260930090000_production_chain` y `20260930091000_calendar_feed_user`
   (`npm run db:migrate`).
   - Son transaccionales y solo amplían CHECK: el código anterior sigue funcionando.
   - No crean tablas, así que no hace falta volver a instalar `deployment-gate.sql`.
   - Para comprobarlas:
     ```sql
     SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
     WHERE conname IN ('ProductionStep_step_check','ProductionStep_status_check','CalendarSubscription_scope_check');
     SELECT indexname FROM pg_indexes WHERE indexname = 'ProductionStep_brandId_status_dueAt_idx';
     ```
     El paso debe admitir `'GUION'`, el estado `'DEVUELTO'` y el alcance
     `(scope = 'USER' AND "brandId" IS NULL)`.
3. Desplegar con `PRODUCTION_CHAIN_ENABLED=false`.
4. Encender en local y en preview.
5. En producción: `PRODUCTION_CHAIN_BRANDS=<id de la marca piloto>` y `PRODUCTION_CHAIN_ENABLED=true`.
   Observar Q1-Q5 y los logs cada día.
6. Tras 48 h sin desvíos, vaciar `PRODUCTION_CHAIN_BRANDS` (todas las marcas) y mantener 7 días de
   observación, con más margen por ser del núcleo.
7. Después, `CALENDAR_FEED_PERSONAL=true`, siempre con su migración ya aplicada.
8. Si algo huele mal: `PRODUCTION_CHAIN_ENABLED=false` y redesplegar.

## Revisión de hallazgos (30/09/2026, tarde)

Veintitrés hallazgos verificados de la revisión de dominio, seguridad y experiencia; corregidos en
el mismo branch, con pruebas:

- **«Listo» estable:** con la cadena, `crearColumna` inserta antes de «Listo» (global o por marca) y
  la columna «Listo» no se elimina. Antes, una columna nueva pasaba a ser «Listo» en silencio.
- **Mensajes que llegan:** `quitarAsignacion` devuelve el motivo como `{ error }` (antes rompía la
  ficha); `EditForm` muestra el `message` de la acción (aviso del calendario al reasignar); el
  tablero muestra el de `actualizarTarea`; el aviso del «Listo»/«Devolver» vive en una región
  `aria-live` de la sección y el foco vuelve a su encabezado.
- **Fechas:** duplicar no copia `shootDate`; una fecha sin origen auditado, pasada o de hoy, se
  recalcula al abrir la grabación.
- **Firmas:** el Listo de edición nunca marca el diseño (tampoco el del Dueño): «Esperando diseño».
  Coordinación no firma lo que su perfil no firma (`CHAIN_COORD_CAPABILITY`).
- **Convergencia:** retirar la revisión final (o la del guion) con el video en Programado lo
  devuelve a Edición como Sistema y reabre la edición; eliminar un guion reabre el Guion de sus
  videos.
- **Seguridad:** el bloque de Coordinación y los avisos exigen un ENCARGADO con `content.assign`
  (si no, van al Dueño) y leen con `productionStepScope`; «Tomar paso» exige ver el video; toda
  acción sobre un paso autoriza antes de revelar su estado («No tienes acceso a este paso o ya no
  existe»); el Dueño puede revocar feeds personales y desactivar la cuenta, cambiar la contraseña o
  cambiar correo/rol los revoca.
- **Responsables aptos:** reasignar, «Crear paso» con persona y las asignaciones del video exigen
  la capacidad del paso; el selector agrupa por perfil y un responsable sin la capacidad cuenta
  como bloqueado.
- **Canario por persona** (`productionChainActiveFor`): «Mi trabajo», contadores, Ayuda, menú
  «Cadena» y «Solo lo mío» solo aparecen si la marca activa (o alguna de la persona) usa la cadena.
- **Cadena y Mi trabajo:** «Aviso atendido» en `/cadena` y en el panel; filtro «Sin asignar» y
  personas/cabecera sin depender de los filtros; atasco «Encargado sin permisos»; «Generar guion»
  en la tarjeta Guion sin guion; encabezados `h4` dentro de Coordinación.

## Pendientes y avisos

- **Datos del flujo anterior:** los pasos creados antes de encender pueden tener la tarea
  desfasada (Q1) o el video por detrás del paso. `/cadena` los muestra como «estado desfasado».
  Q1 se mide desde el encendido.
- **Con la cadena apagada, nada cambia** (revisión del 30/09): el calendario del diseñador, el
  «vencido» del tablero con el día de Lima y nunca en «Listo», el orden por plazo y el enlace a la
  ficha en las tareas del miembro solo actúan con la cadena (y, con el canario, solo en sus
  marcas). Sigue cambiando solo el texto de ayuda de Producción.
- `/cadena` la ven STRATEGY (ENCARGADO) y el Dueño. El perfil PRODUCTION no la ve, aunque tenga
  `content.assign`.
- **Previa de guiones (B5):** debe consumir `chainStateForScripts`, `grabadoDeVideo`, `marcarListo`
  y `devolverPaso`, sin redefinir «grabado».
- **Backlog:** avisos por correo o push; que el community vea «En camino» antes de la aprobación
  final.
