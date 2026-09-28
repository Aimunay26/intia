# Auditoría de alcance por marca

Fecha: 2026-09-28. Revisé el código de `main` en el commit `ad429e0`. Los cambios sin commit están solo en `src/lib/ai/*` y `generation-trace.ts`, y no tocan ningún archivo auditado.

Pregunta: ¿un MEMBER limitado a sus marcas (por `UserBrandAccess`) ve datos de otras marcas?

## 1. Resumen

- Hay **3 fugas confirmadas**: 0 altas, **1 media** y **2 bajas**.
- **No hay fugas en guiones, videos, métricas, marcas, objetivos, historial de generaciones ni en el prompt de IA.** Ningún MEMBER ve esos datos de otras marcas, ni navegando la app ni escribiendo la URL a mano.
- **La fuga media es la de Personas y no es un filtro roto.** Hoy el catálogo de personas es compartido a propósito y el modelo de datos no tiene ninguna relación entre persona y marca. Aun así choca con el pedido de que cada usuario vea solo su marca, y cerrarla necesita una decisión de producto.
- **Las dos bajas son de integridad de datos.** Son tareas y eventos que pierden su marca, al borrarla o al editarlos. Después aparecen como "personales" a alguien que ya no tiene acceso a esa marca.
- Descarté 5 hallazgos al verificarlos (sección 3).

## 2. Fugas confirmadas

| # | Sev. | Área | Qué se ve de otras marcas | Quién lo ve | UI o URL | Archivo:línea | Corrección propuesta |
|---|---|---|---|---|---|---|---|
| 1 | Media | Personas: catálogo, documentos y generador | Todas las personas de la instalación, también las que solo trabajan para otras marcas. Se ve la ficha, el informe de branding personal (deseo, miedo, trampa, "watch out", voz, paleta) y los PDF adjuntos, que se pueden descargar. STRATEGY además puede leer el texto extraído de esos PDF. WRITER puede generar guiones de su marca con la voz de una persona de otra marca. | MEMBER con perfil STRATEGY o WRITER, aunque tenga una sola marca o ninguna. TALENT está bien limitado: solo ve su propia ficha. | Por la UI normal: menú Personas `/arquetipos` → `/arquetipos/[id]` → Documentos → `/api/assets/<id>`. También en el selector de persona de `/generador`. | La causa está en `src/lib/access-scope.ts:40`. Se usa en `src/components/member/sections.tsx:74,88,91`, `src/lib/asset-security.ts:35-37`, `src/app/(app)/generador/page.tsx:104,119-125` y `src/lib/generation-jobs.ts:83`. El modelo `Archetype` no tiene relación con `Brand` (`prisma/schema.prisma:272`). | 1. Decidir cómo pertenece una persona a una marca. Lo preferido es una tabla `ArchetypeBrand` que asigna el Dueño, rellenada al inicio con los datos que ya existen: `User.archetypeId` + `UserBrandAccess`, y `Script.archetypeId` + `brandId`. 2. Hacer que `archetypeScope` devuelva, para un MEMBER, solo las personas vinculadas a `user.brandIds`, y ninguna si la lista está vacía. 3. Aplicar ese mismo filtro en el generador, en `enqueueValidatedGeneration`, `actualizarArquetipo`, `actualizarMarcaPersonal` y `guardarCompatibilidad`. 4. Actualizar `CONTRACT.md` y `reports/perfiles-permisos-2026-09-09.md:30`. |
| 2 | Baja | Tareas y agenda después de borrar una marca | De las tareas de la marca borrada se ve el título, la descripción, la fecha, la columna, la prioridad y el tipo. De sus eventos, el título, la descripción, el lugar y las fechas. Todo aparece rotulado como "Personal", sin el nombre de la marca, y el usuario puede editarlo. | Un MEMBER que era responsable de tareas o creador de eventos en la marca B, al que se le quitó el acceso a B antes de que el Dueño la borrara. | Por la UI: `/tareas`, el contador del Panel y `/calendario`. En tareas y en el Panel solo aparece con "Todas las marcas" seleccionado. | El filtro que las muestra está en `src/lib/access-scope.ts:28` (taskScope) y `:35` (eventScope). La causa es `onDelete: SetNull` en `prisma/schema.prisma:940` y `:127`. `eliminarMarca` (`src/app/actions/brands.ts:352-363`) no limpia tareas ni eventos. | En `eliminarMarca`, dentro de la misma transacción, borrar con `tx.task.deleteMany` y `tx.calendarEvent.deleteMany` todo lo de esa marca, o cambiar la FK a `onDelete: Cascade`. Es lo que ya promete el diálogo de borrado (`marcas/[id]/page.tsx:250`). A futuro, marcar lo personal con un campo explícito en vez de deducirlo de `brandId IS NULL`. |
| 3 | Baja | Editar un evento o una tarea y quitarle la marca | Un evento de la marca A se vuelve "personal" de quien lo creó: esa persona lo sigue viendo aunque pierda el acceso a A, y el equipo de A deja de verlo. En tareas pasa lo mismo: un gestor puede convertir en personal una tarea de A que tiene asignada y conservarla aunque pierda A. También pasa sin querer: al editar un evento sin video de una marca archivada, el selector no ofrece esa marca y al guardar se pierde sin aviso. | Un MEMBER con `calendar.edit` (STRATEGY, PRODUCTION) o `tasks.manage` en la marca A. | Por la UI: `/calendario` → Editar → "Sin marca concreta"; `/tareas` → "Personal (sin marca)". | `src/app/actions/events.ts:98` solo valida la marca cuando no es nula; la escritura está en `:168-180`. En tareas, `src/app/actions/tasks.ts:109-110`. El selector está en `src/app/(app)/calendario/event-form.tsx:123-128`. | Si quien edita no es OWNER, rechazar que un registro con marca pase a no tener marca, salvo que ya fuera personal y suyo. En el formulario, incluir siempre la marca actual del registro aunque esté archivada. |

Notas:
- **Sobre la #1, el veredicto está dividido.** Tres revisiones la descartan como fuga: el modelo no relaciona personas con marcas y el catálogo compartido está documentado. La revisión de assets y API la confirma como brecha frente al requisito nuevo. La cuento como fuga porque es lo más cercano a lo que pide el usuario.
- **La #2 solo ocurre en una secuencia rara:** el Dueño quita el acceso, deja las asignaciones como están y luego borra la marca en vez de archivarla. Además, si ya se borró alguna marca en producción, sus filas huérfanas probablemente ya no se distinguen de las personales mirando `brandId`. Conviene revisarlo en el AuditLog.

## 3. Descartadas y por qué

- **Catálogo de Estructuras (ejemplos, reglas, PDF).** Es global a propósito: el esquema dice "Es GLOBAL: se puede usar en cualquier marca" y no tiene `brandId`. Ningún código copia datos de una marca dentro de una estructura. El único riesgo es que alguien pegue a mano material de una marca en los ejemplos. Eso se resuelve con una regla de contenido o, si producto lo decide, con un `brandId` opcional.
- **Personas en el catálogo, en el generador y en la matriz de compatibilidad.** Se descartó en tres áreas por ser un catálogo compartido documentado. Queda cubierto por la #1 si producto decide que las personas pertenecen a marcas.
- **Nombre de quien evaluó (`updatedByName`) en la matriz de compatibilidad.** Es el autor de un registro global, no un dato de otra marca. Habrá que revisarlo junto con la #1.
- **Textos de ejemplo "Con Amor" y "Lucía" en el formulario de agenda.** Son textos fijos que no vienen de ninguna consulta. "Con Amor" es el nombre de la organización y todos los usuarios ya lo ven en la barra lateral. Cambiarlos es una limpieza opcional.
- **Enlace ICS con alcance "Todas las marcas".** Solo el Dueño puede crearlo; el token se guarda como hash y la UI avisa del alcance. Solo sería una fuga si el Dueño decide compartirlo. Una mejora futura serían feeds por usuario que respeten sus marcas en cada descarga.

## 4. Áreas revisadas sin problemas

- **Panel y navegación:** el dashboard de administración solo se muestra al OWNER. El selector de marcas y la cookie de marca activa (`mos_brand`) se filtran por `user.brandIds`, y una cookie falsa cae a "mis marcas". El menú se filtra por permisos.
- **Marcas y objetivos:** se usan `brandScope` y `assertBrandPermission`. Pedir una marca ajena por URL da el mismo 404 que una inexistente, así que no se puede averiguar si existe.
- **Métricas:** todos los agregados pasan por `metricSource`, que filtra por `brandIds`. Los filtros de persona y estructura están acotados. La importación de CSV no revela si un video existe en otra marca. No hay exportación a CSV.
- **Guiones:** la lista, el detalle y todas las acciones usan `scriptScope` o `assertScriptAccess`, con mensajes de error genéricos.
- **Generador y trabajos:** las marcas, los videos, `?video=` y `?marca=` están acotados. El historial se filtra por usuario y marcas. Al ejecutar cada trabajo, `actorForJob` vuelve a comprobar el acceso. El prompt de IA usa solo la marca del trabajo.
- **Contenido y videos:** se usa `contentScope`. Solo se puede asignar a personas con acceso a esa marca. Comentarios, métricas y adjuntos solo se cargan después de autorizar el video.
- **Calendario y tareas** (salvo #2 y #3): se usan `taskScope` y `eventScope`. Las columnas y los responsables se limitan a las marcas del usuario.
- **Equipo, actividad y ajustes:** solo el OWNER tiene acceso.
- **Adjuntos (`/api/assets`):** `assertAssetOwner` autoriza antes de leer cualquier byte y responde el mismo 404 para "no existe" y "sin acceso".
- **Sesión:** los permisos y las marcas se leen de la base en cada petición, así que quitar el acceso a una marca tiene efecto inmediato.
- **Mejoras opcionales que no son fugas:**
  - `actualizarVideo` y `crearCheck` llaman a `assertVideoOpen` antes que a `assertContentAccess`, así que bloquean filas de otras marcas antes de comprobar el acceso.
  - Algunas acciones terminan sin error ante un id inexistente antes de comprobar el acceso. Eso permitiría saber si un id existe, pero son ids cuid difíciles de adivinar.
  - `metric-summary.ts` no filtra por marca, pero hoy nadie lo usa.
  - Un miembro con una sola marca ve la etiqueta "Todas las marcas".

## 5. Propuesta de evaluación (fase 2)

Sugiero separarlo en dos ideas, porque el flujo permite **un solo GO activo** a la vez.

**A. Integridad de marca en tareas y eventos (#2 y #3)**
- **Dolor real:** bajo. Es un caso raro, pero contradice lo que promete el diálogo de borrado y puede hacer que un evento pierda su marca sin aviso.
- **Costo:** S, unas 2-4 horas. Toca `eliminarMarca`, la validación de `actualizarEvento` y `actualizarTarea`, el selector de marca del formulario, y tests en la suite de Postgres. Toca la persistencia (borrados), pero no el filtro de acceso compartido.
- **Riesgo en prod:** bajo. Solo afecta al borrado de marcas, que solo hace el OWNER, y a la edición de eventos y tareas.
- **Reversibilidad:** alta para la validación. Para la limpieza, apagar el flag vuelve al comportamiento de antes, pero lo que ya se borró no vuelve (igual que hoy pasa con videos y guiones).
- **Veredicto sugerido:** **GO**.
- **Kill-switch:** `BRAND_INTEGRITY_GUARD_ENABLED=0` devuelve el comportamiento actual. Sigue el patrón `*_ENABLED` que ya usa el proyecto (`AI_JOBS_ENABLED`, `PRODUCT_CATALOG_ENABLED`).
- **Criterio de HECHO:**
  - Tras borrar una marca de prueba B, quedan 0 tareas y 0 eventos de B, y un usuario al que se le quitó B no ve nada de B en `/tareas`, `/calendario` ni en el Panel.
  - Editar un evento de una marca archivada conserva su marca.
  - Un STRATEGY no puede pasar un evento de A a "sin marca" y recibe un error genérico.
  - Todo lo anterior cubierto por tests de Postgres.

**B. Personas por marca (#1)**
- **Dolor real:** medio. Es lo que más se acerca al pedido del usuario. Expone el branding personal (miedos, trampas) y PDF descargables a cualquier STRATEGY o WRITER, y permite generar guiones con talento de otra marca.
- **Costo:** M-L. Hace falta:
  - una migración con la tabla `ArchetypeBrand` y el relleno inicial de vínculos;
  - una pantalla para que el Dueño asigne personas a marcas;
  - cambios en `archetypeScope`, en el generador, en el encolado de generaciones, en tres acciones de edición y en la descarga de adjuntos;
  - actualizar `CONTRACT.md` y el informe de perfiles.

  Toca el core: el filtro de acceso compartido y la persistencia.
- **Riesgo en prod:** medio. Si se activa sin rellenar antes los vínculos, WRITER y STRATEGY dejan de ver personas y el generador se queda sin opciones.
- **Reversibilidad:** alta con un flag. Con `ARCHETYPE_BRAND_SCOPE_ENABLED=0`, `archetypeScope` vuelve a devolver `{}` como hoy.
- **Veredicto sugerido:** **APLAZAR** hasta que el product owner decida dos cosas:
  1. ¿Una persona puede ser exclusiva de una marca, o debe haber también personas compartidas?
  2. ¿El vínculo lo asigna el Dueño explícitamente o se deduce de los datos?

  Con esa decisión tomada, B pasa a ser el siguiente GO cuando A esté cerrada.
- **Criterio de HECHO:**
  - Con el flag encendido, un WRITER de la marca A solo ve las personas vinculadas a A (más las compartidas, si se definen).
  - `/arquetipos/<id de B>` y `/api/assets/<PDF de B>` responden 404.
  - El generador no ofrece personas de B y el encolado rechaza una persona de B.
  - Con el flag apagado, todo funciona igual que hoy.
  - Después del relleno inicial, cada marca activa tiene al menos una persona disponible en el generador.