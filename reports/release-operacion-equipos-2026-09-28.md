# Entrega "operación por equipos" — mini-spec (2026-09-28)

Rama `release/operacion-equipos` = `main` + catálogo de productos + investigación del manual + los cambios de esta entrega.
El dueño pidió explícitamente ejecutar todo, subirlo y desplegarlo en Vercel.

## 1. Ideas (síntomas reportados en producción)

| # | Síntoma | Dónde |
|---|---|---|
| 8 | El inicio y "Cómo se usa" muestran lo mismo a un miembro del equipo. | `/`, `/tutorial` |
| 9 | No existe el espacio "Manual de procedimientos". | Menú y tarjetas |
| 10 | El calendario de un miembro es una lista que exige "Ver agenda"; no hay calendario mensual ni días de grabación. | `/calendario` |
| 11 | Nadie programa la grabación, ni asigna edición, publicación o diseño con plazo; todo es manual. | Flujo de video |
| 12 | Faltan cuentas de prueba por rol (Edward, Carlos, Laudder, Silvanna, Diego, Yoryo). | Equipo |
| 13 | El visor de guiones obliga a hacer scroll en 1920×1080 y en celular. | `/guiones/[id]`, `/guiones` |
| 14 | Varias pantallas se desbordan o cuestan en iPhone/Android. | Todo el sistema |
| 15 | "Todas las marcas" aparece aunque el usuario solo debería ver las suyas. | Selector de marca |

## 2. Evaluación

| # | Dolor | Costo | Riesgo | Reversa | Veredicto |
|---|---|---|---|---|---|
| 8, 9 | Alto (el equipo no tiene guía) | M | Bajo (solo lectura) | `MANUAL_PROCEDIMIENTOS_ENABLED=false` | GO |
| 10 | Alto | S | Bajo | `CALENDARIO_MENSUAL=false` | GO |
| 11 | Alto (operación diaria) | L, toca el flujo | Medio | `PRODUCTION_FLOW_ENABLED` (apagado por defecto) | GO |
| 12 | Medio | S | Nulo en local | Script solo local | GO (local); en producción las cuentas las crea el Dueño en Equipo |
| 13 | Alto | M | Bajo | `GUIONES_AJUSTE_PANTALLA=false` | GO |
| 14 | Alto | M | Bajo | Correcciones de CSS acotadas | GO |
| 15 | Bajo | — | — | — | NO-GO de código: el selector ya filtra por `UserBrandAccess`; la cuenta "Con Amor" tiene todas las marcas marcadas en Equipo. Se verifica con las cuentas de prueba limitadas a su marca. |

Nota de foco: el dueño pidió todo en una sola entrega. Se cumple la regla de "un GO activo" agrupándolo como una sola entrega con interruptores independientes por parte.

## 3. Planificación

### Estado en memoria vs persistencia
- Manual: contenido versionado en `src/content/manual/*.json` (solo lectura, sin DB).
- Calendario: solo lecturas con los filtros existentes (`contentScope`, `eventScope`, marca activa).
- Flujo de producción: tablas nuevas `BrandTeamMember`, `BrandProductionSettings` y `ProductionStep`. **No se agregan columnas a tablas existentes**, así el código puede desplegarse antes de la migración sin romper consultas.

### Reglas del flujo automático (por marca, con asignación automática activada)
1. Guion vinculado o aprobado → grabación el próximo día de grabación de la marca (si no hay días, el próximo día hábil); se asigna el filmmaker del equipo.
2. Terminó el día de grabación (checks de grabación completos, paso a EDICIÓN o barrido diario de las 05:00) → se asigna el editor, con plazo al siguiente día hábil (sábado → lunes; el domingo no se trabaja).
3. Revisión final aprobada → se asigna el community, con publicación al siguiente día hábil.
4. "Pedir diseño" → el diseñador del equipo tiene 24 h (si cae domingo, pasa al lunes).
5. Lo manual siempre gana: la automatización solo completa lo vacío y nunca pisa asignaciones ni fechas puestas por una persona.

### Interruptores
| Variable | Por defecto | Efecto al cambiarla |
|---|---|---|
| `MANUAL_PROCEDIMIENTOS_ENABLED` | encendido | `false` oculta el manual |
| `CALENDARIO_MENSUAL` | encendido | `false` vuelve a la lista de 31 días |
| `GUIONES_AJUSTE_PANTALLA` | encendido | `false` quita el modo "cabe en pantalla" del visor |
| `PRODUCT_CATALOG_ENABLED` | apagado | `true` activa el catálogo (requiere migración) |
| `PRODUCTION_FLOW_ENABLED` | apagado | `true` activa equipos por marca y automatización (requiere migración) |
| `GEMINI_ESQUEMA_SIMPLE` | encendido | `false` vuelve a enviar a Gemini el esquema con límites (ver «Integrado desde otra sesión») |

### Criterio de HECHO
- Un miembro ve inicio y ayuda distintos, con "Manual de procedimientos" primero; las escenas 3D cargan en filmmaker y actor.
- `/calendario` muestra el mes sin clics, con "Grabar" y "Publicar"; un usuario limitado a Con Amor no ve otras marcas.
- Con el flujo encendido en local: vincular un guion programa la grabación en el próximo martes o jueves; completar la grabación del sábado deja la edición para el lunes; aprobar la revisión final asigna al community para el día siguiente; "Pedir diseño" vence en 24 h.
- El visor de guiones cabe en 1920×1080 sin scroll de página, y en 375 px el diálogo aparece antes de los 400 px.
- Sin desborde horizontal en 360, 768 y 1440 px (`scripts/check-design-ui.mjs`).
- En producción: despliegue Ready, sin errores nuevos en 24 h.

### Orden de despliegue
1. Merge a `main` y push: Vercel despliega. Las partes sin base de datos quedan activas y las que requieren migración quedan apagadas.
2. Con acceso a Neon (`vercel login` o `DATABASE_URL` de producción): aplicar las migraciones `20260928120000_brand_catalog` y la del flujo, y volver a ejecutar `prisma/operations/deployment-gate.sql`.
3. Encender `PRODUCT_CATALOG_ENABLED` y `PRODUCTION_FLOW_ENABLED` en Vercel y redeplegar.
4. El Dueño crea en Equipo las cuentas reales de su equipo. Las cuentas de prueba solo existen en local.

## 4. Resultado (28/09/2026)

Estado: implementado en la rama; **sin desplegar**. El trabajo de celulares (#14) seguía en curso en
otra sesión al redactar esta sección.

### Qué se construyó

| # | Parte | Commits | Interruptor | Migración |
|---|---|---|---|---|
| 1, 2 | Catálogo de productos y combos por marca; cierres y ángulos por tipo; selector en el paso 2 del generador | `23ea3eb`, `96c0d74`, `9bc8053` (merge `417f784`) | `PRODUCT_CATALOG_ENABLED`, apagado | `20260928120000_brand_catalog` |
| 8, 9 | Manual de procedimientos (`/manual`, 8 roles, 3 niveles, 135 módulos, 618 lecciones, 386 videos, 98 lecciones con escena 3D); grupo «Formación»; inicio y «Cómo se usa» distintos para el Equipo | `7aaa56c` (investigación: merge `730ef04`) | `MANUAL_PROCEDIMIENTOS_ENABLED`, encendido | — |
| 10 | Calendario mensual para Dueño y Equipo: «Grabar» y «Publicar», detalle `?dia=` y lista en celular | `096c4f5` | `CALENDARIO_MENSUAL`, encendido | — |
| 11 | Flujo de producción: equipo por marca, días de grabación, pasos con plazo, panel «Producción», «Pedir diseño», barrido diario | `c08825e`, `f50cf7d` | `PRODUCTION_FLOW_ENABLED`, apagado | `20260928180000_production_flow` |
| 12 | Cuentas de prueba por rol: `npm run db:equipo-demo`, solo base local; contraseñas solo en `.audit/equipo-demo.txt` | `c08825e` | — (script local) | — |
| 13 | Visor y biblioteca de guiones a una pantalla; Duplicar, Variar ángulo y Eliminar en el menú «Más»; `?escena=` y ←/→ | `c2a9853` | `GUIONES_AJUSTE_PANTALLA`, encendido | — |
| 14 | Celulares: campos de 16 px, listas como tarjetas, cajón del menú | En curso | Correcciones de CSS acotadas | — |
| 15 | — | NO-GO de código (ver evaluación) | — | — |

Documentación: `CONTRACT.md` (rutas, interruptores, catálogo, flujo de producción, calendario,
visor de guiones, Manual, campos JSON y entidades de auditoría), `README.md` («Novedades
28/09/2026»), `.env.example`, `reports/operacion-migraciones.md` y
`reports/visor-guiones-escena-foco-2026-09-26.md`.

### Ajustes al plan durante la implementación

- **Regla 2 (edición):** también se dispara cuando una persona marca hecho el paso de grabación.
  El barrido diario solo mira videos en Aprobado o Grabación, con fecha de grabación de los
  últimos 14 días, hasta 25 por ejecución.
- **Regla 3 (publicación):** con la revisión final aprobada, una fecha prevista anterior al plazo
  se mueve a ese día (auditado). Pasar el video a Programado también asigna la publicación, pero
  con la fecha prevista como plazo y sin mover el calendario.
- Cancelar un video cancela sus pasos pendientes; cambiar a mano la fecha de grabación mueve el
  paso automático pendiente y su tarea. Un paso reasignado a mano queda como `MANUAL` y la
  automatización ya no lo toca.
- Cada paso crea su tarea en el tablero (prioridad alta, con responsable y fecha límite) y, si
  hace falta, la asignación del video para esa función.

### Causa raíz del fix `f50cf7d` (fase 5)

`assignEditing` exigía que el video ya estuviera en Aprobado, Grabación o Edición. Por eso, marcar
hecha la grabación con el video todavía en Guion no asignaba la edición y no avisaba. Ahora el paso
explícito de una persona basta; el barrido diario sigue exigiendo el estado. Además, «Marcar hecho»
se vuelve a montar con la revisión nueva después de guardar el enlace del material, en vez de dar
conflicto.

### Integrado desde otra sesión (generador)

Cambios que otra sesión dejó sin commitear en `main`, revisados e integrados sobre esta rama:

| Parte | Commit | Interruptor |
|---|---|---|
| Equipo debe elegir una marca autorizada al generar: preselección con una sola marca, aviso sin marcas, mensaje propio en el servidor y traza `brand_access` sin datos personales | `354aa4e` | — (el servidor ya rechazaba a Equipo sin marca; cambian la interfaz, el mensaje y la traza) |
| Gemini: esquema sin límites de tamaño/rango (Zod los sigue validando), HTTP 408/504 como timeout y diagnósticos de listas cerradas | `3e4c573` | `GEMINI_ESQUEMA_SIMPLE`, encendido |

Informes: `reports/acceso-marca-generador-2026-09-28.md` y
`reports/diagnostico-gemini-400-504-2026-09-25.md`.

### Pruebas

| Prueba | Resultado |
|---|---|
| `npm run test:unidad`, parte de Node (28/09, en esta rama) | 217 pruebas: 216 correctas. La única fallida es `security-startup`, que exige `npm run build` previo; es una condición conocida y no depende de esta entrega. |
| `npm run test:cta` · `test:presets` · `test:manual` | 11/11 · 10/10 · 17/17 |
| Pruebas nuevas | `catalogo-productos` (23), `generador-producto` (12), `calendario` (13), `production-flow` (26), `guiones-visor` (5), `presets-tipo` (10), `manual` (17) y ajustes en `permissions` |
| PostgreSQL real | Suite `production-flow` (`tests/postgres-production-flow.test.mjs`, dentro de `npm run test:postgres`): equipo, grabación, edición, diseño, SAVEPOINT y barrido. Su ejecución no quedó registrada en esta sección: correrla antes del merge. |
| Tras integrar la otra sesión (28/09) | `npm test`: 226 pruebas, 225 correctas (la misma `security-startup`); `test:cta` · `test:presets` · `test:manual`: 11/11 · 10/10 · 17/17. PostgreSQL local (`node scripts/test-postgres.mjs`): `priorities` 37/37, `workflow` 13/13, `organization-ai` 9/9, `production-flow` 1/1, `permissions` 13/13. |
| Ensayo de migración (`npm run db:ensayo`, `.audit/migration-rehearsal.json`, 28/09 23:06 UTC) | Correcto con las dos migraciones nuevas: filas existentes intactas, sin columnas nuevas en tablas existentes, combos y pasos obligados a la misma marca, restauración de 42 tablas con la misma huella. |

Las pruebas unitarias cubren los criterios del flujo: grabación el próximo martes o jueves con el
filmmaker, sábado → lunes para la edición, publicación al día hábil siguiente, diseño en 24 h sin
domingo, datos manuales que mandan, SAVEPOINT que no rompe la acción principal y flag apagado sin
consultas.

### Criterio de HECHO

| Criterio | Estado |
|---|---|
| Inicio y ayuda distintos, Manual primero; escenas 3D en filmmaker y actor | Implementado; las 98 escenas producen una configuración válida (prueba). Falta la revisión visual tras desplegar. |
| `/calendario` muestra el mes con «Grabar» y «Publicar»; un usuario limitado a Con Amor no ve otras marcas | Implementado y probado en funciones puras; alcance con `contentScope`/`eventScope`. Falta verificarlo con una cuenta limitada en producción. |
| Reglas del flujo con el flag encendido en local | Cubiertas por pruebas unitarias y por la suite de PostgreSQL. |
| Visor en 1920×1080 sin scroll de página; en 375 px el diálogo antes de los 400 px | Implementado (`c2a9853`). Volver a comprobar cuando termine el trabajo de celulares. |
| Sin desborde horizontal en 360, 768 y 1440 px (`scripts/check-design-ui.mjs`) | Pendiente: trabajo de celulares en curso. |
| Producción: despliegue Ready y sin errores nuevos en 24 h | Pendiente. |

### Pendiente para el cierre (fase 7)

1. Terminar #14 y correr `npm run lint`, `npm run typecheck`, `npm run build`, `npm test` y
   `npm run test:postgres` sobre la rama final.
2. Merge a `main` y despliegue con `PRODUCT_CATALOG_ENABLED` y `PRODUCTION_FLOW_ENABLED`
   apagados.
3. Migrar Neon siguiendo `reports/operacion-migraciones.md` (sección «Entrega 28/09/2026») y
   volver a ejecutar `prisma/operations/deployment-gate.sql`.
4. Encender los dos interruptores, redesplegar y observar 24 h: trabajos de generación fallidos,
   errores «Este envío ya fue utilizado», logs `production_flow` con `reason: "error"` y el
   resultado `production` del mantenimiento diario.
5. Backlog siguiente: 6a (integridad de marca en tareas y eventos), 6b (Personas por marca) y la
   idea 5 (*Variar ángulo* envía el enfoque del guion como producto).
