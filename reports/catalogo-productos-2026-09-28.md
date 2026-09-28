# Catálogo de productos por marca — mini-spec y backlog (2026-09-28)

## Backlog de la solicitud

| # | Idea (síntoma) | Veredicto | Razón |
|---|---|---|---|
| 1 | Cada guion obliga a escribir el producto y "qué debe saber la IA" a mano; la marca no guarda sus productos. | **GO** (activo) | Dolor diario en el generador; aditivo y con flag. |
| 2 | Las poleras personalizadas reciben por defecto un cierre de servicio ("solo puedo atender a 9 clientes"). | **GO** (dentro de #1) | Misma causa: el sistema no sabe si vende producto, servicio o restaurante. |
| 3 | La interfaz se ve cargada; se quiere estética "liquid glass" tipo iPhone. | APLAZAR | Toca ~60 archivos de estilos globales; se hace después para no rediseñar el paso 2 dos veces. |
| 4 | Agregar cosas al prompt obliga a leer bloques largos; se quiere un chat flotante con botones-título y un "!" para leer la ficha. | APLAZAR | Depende de #1 (catálogo como fuente de botones) y de #3 (estilo). |
| 6a | Tareas y eventos de una marca borrada, o editados a "sin marca", quedan como "personales" visibles para quien ya no tiene acceso. | GO (siguiente, tras el catálogo) | S, bajo riesgo. Ver `reports/auditoria-alcance-marca-2026-09-28.md` §5.A. |
| 6b | Un STRATEGY o WRITER limitado a su marca ve todas las Personas (branding personal y PDF) y puede usarlas en el generador. | APLAZAR (en cola tras 6a) | Decisión del dueño (2026-09-28): personas vinculadas a una o varias marcas + opción "compartida" visible para todas; el vínculo lo ajusta el Dueño en la ficha, precargado desde guiones existentes y accesos de usuario. Flag `ARCHETYPE_BRAND_SCOPE_ENABLED`. Ver §5.B. Guiones, videos, métricas, marcas e historial ya están bien filtrados. |
| 7 | El equipo no tiene un procedimiento escrito por rol; cada integrante aprende "en el camino". Se pide un espacio "Manual de procedimientos" (primera tarjeta para todos) con manuales para filmmaker, editor, jefe de editores, community, ATC, actor, guionista y dueño, en niveles Principiante→Avanzado, módulos y lecciones separadas, escenas 3D (actor/filmmaker) y videos de YouTube por módulo. | INVESTIGACIÓN (sin código) | El dueño pidió investigar primero y programar después de revisar. La evaluación y el plan se hacen al terminar la investigación; ATC y jefe de editores no existen aún como perfiles. |
| 5 | "Variar ángulo" en `/guiones/[id]` manda `producto=script.focus` (el enfoque de la IA, no el producto). | APLAZAR | Detectado durante el mapeo; fuera de alcance. |

## Idea #1+#2: catálogo de productos y combos por marca

**1. IDEA (síntoma)**
- Qué duele: en el paso 2 del generador hay que escribir el producto y su detalle cada vez; los presets de cierre no distinguen producto de servicio.
- Dónde se nota: `/generador` paso 2 ("Producto o servicio del video", "Qué debe saber la IA") y paso 4 (cierre por defecto "Capacidad de clientes").

**2. EVALUACIÓN**
- Dolor real: sí, en cada guion generado.
- Costo: L. Tablas nuevas, acciones, pestaña en la marca, selector en el generador y presets por tipo.
- Riesgo en prod: medio. Toca el payload idempotente de la cola, pero todo es aditivo.
- Reversibilidad: alta con `PRODUCT_CATALOG_ENABLED`.
- ► Veredicto: **GO** — dolor diario y reversible.

**3. PLANIFICACIÓN**
- Archivos: `prisma/schema.prisma` + migración `20260928120000_brand_catalog`, `src/lib/product-catalog.ts`, `src/app/actions/products.ts`, `src/app/(app)/marcas/[id]/products.tsx`, `src/components/brand-products.tsx`, `src/app/(app)/generador/product-picker.tsx`, `generator-form.tsx`, `generador/page.tsx`, `src/app/actions/scripts.ts`, `src/lib/generation-jobs.ts`, `src/lib/script-angles.ts`, registros en `mutations.ts`, `constants.ts`, `demo-provenance.ts`.
- Diseño:
  - Modelos `BrandProduct` (tipo `PRODUCTO | SERVICIO | RESTAURANTE`, nombre, qué debe saber la IA, características, beneficios, objeciones, precio), `BrandCombo` y `BrandComboItem`, con FK compuesta `(id, brandId)` para que un combo no mezcle marcas.
  - Pestaña "Productos" en cada marca; al crear una marca se abre esa pestaña para cargar el catálogo desde el alta.
  - Paso 2: tarjetas seleccionables (solo título + tipo). El formulario de texto aparece solo con "Cargar un nuevo producto". "Qué debe saber la IA" se precarga con el producto elegido.
  - El servidor arma el foco del producto desde la DB (no confía en el texto del cliente) e incluye la línea `Tipo:`; el payload guarda una instantánea de texto (los reintentos no releen el catálogo).
  - Presets de cierre y ángulos filtrados por tipo; con tipo desconocido el comportamiento es idéntico al actual.
  - Estado: el catálogo persiste en Postgres; la selección y las ediciones del detalle para un video viven solo en memoria del formulario y no modifican el catálogo.
- Plan de reversa: `PRODUCT_CATALOG_ENABLED` distinto de `"true"` (o ausente) apaga todo: no se consultan las tablas nuevas, el paso 2 y el payload quedan idénticos a hoy. Las tablas se quedan (aditivas). Nunca `DROP` ni `git revert` como reversa.
- Criterio de HECHO:
  - Con el flag encendido y la marca Con Amor, elegir una polera completa el paso 2 sin escribir nada.
  - El cierre por defecto para un PRODUCTO no contiene "clientes", "cupo", "agenda" ni "asesor".
  - El `briefInput` del guion trae `Tipo: Producto físico` y lo que debe saber la IA.
  - Con el flag apagado, la interfaz y el payload son idénticos a los de hoy.
  - En producción, 24 h: la tasa de `GenerationJob` fallidos no sube y no aparecen errores nuevos de "Este envío ya fue utilizado".

**Orden de despliegue:** migrar → desplegar con el flag apagado → encender `PRODUCT_CATALOG_ENABLED=true`.

**Pendiente al cerrar (fase 7):** documentar en `CONTRACT.md` las entidades `BrandProduct`/`BrandCombo`, los campos JSON nuevos y el flag. Se aplaza porque `CONTRACT.md` tiene cambios sin commitear de otra sesión.

**Ajustes tras la revisión (2026-09-28):**
- Kill-switch: con el flag apagado, la cola suelta `productId`/`comboId` sin consultar el catálogo (también en reintentos) y `/actividad` no ofrece Producto/Combo en su filtro. Única excepción: la procedencia de los datos de ejemplo lee y bloquea el catálogo solo si sus tablas existen (`to_regclass`), así que "Revisar/Vaciar datos de ejemplo" funciona aunque se despliegue antes de migrar. El recuento y la auditoría de la limpieza cuentan productos y combos.
- Migración sin `IF NOT EXISTS`: si las tablas ya existen (p. ej. por `db push`), falla en vez de quedar sin los CHECK.
- Borrar un producto rehace sus combos en la misma transacción (tipo, revisión y archivado si quedan menos de dos productos, con auditoría); cambiar su tipo recalcula el de sus combos. Un producto archivado no entra en combos y el combo que lo incluya no se ofrece ni se acepta en el generador.
- Texto para la IA: tope de 6000 caracteres; un "Qué debe saber la IA" válido (hasta 3000) nunca se corta y lo que no entra de las listas se avisa en el paso 2. El tipo elegido en "Cargar un nuevo producto" llega como línea `Tipo:` también en texto libre (solo con el flag).
- Selector: tope por marca (100 productos, 50 combos) con aviso si se recorta; el formulario de texto libre solo depende de "Cargar un nuevo producto" (interruptor) y no se cierra al escribir; "Qué debe saber la IA" es siempre el de la ficha elegida.
