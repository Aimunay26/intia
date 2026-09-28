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
