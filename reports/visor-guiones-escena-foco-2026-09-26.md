# Visor de guiones: escena en foco

Fecha: 26/09/2026. Estado: implementado y validado localmente. Propuesta aprobada: escena en foco.

## Cambio

La ficha del guion abre con una escena y un índice de navegación. Conserva los
datos y acciones existentes, pero separa lectura, preparación y administración.
El cambio se aplica a Dueño y Equipo; la biblioteca de guiones conserva su lista.

| Contenido o función | Ubicación |
|---|---|
| Título, marca, duración, número de escenas y estado | Cabecera |
| Selección directa de escena | Índice en escritorio y selector en móvil |
| Recorrido secuencial | Anterior / Siguiente, con extremos deshabilitados |
| Voz, acción, cámara y texto en pantalla | Escena seleccionada |
| Emoción, iluminación, sonido, locación, utilería, actores y notas | Detalles de producción de cada escena |
| Editar, mover y eliminar escena | Cabecera de la escena, según permiso |
| Añadir escena | Debajo del visor, según permiso |
| Lista de utilería, locaciones, reparto y sus notas | Producción |
| Público, enfoque, hook, CTA, editar título/ficha y estado | Ficha e historial |
| Duplicar, variar ángulo y eliminar guion | Ficha e historial, según las acciones disponibles para el perfil |
| Asignar y desvincular videos | Ficha e historial |
| Aprobaciones, autoría y fecha | Ficha e historial |
| Modelo, proveedor, pedido original y prompt usado | Ficha e historial del Dueño; no se amplía el acceso del Equipo |
| Copiar el guion e imprimir | Cabecera; copiar conserva el texto completo existente del Dueño |

## Conservación del comportamiento

- Las páginas siguen autorizando y consultando los datos en el servidor. El
  componente cliente recibe contenido ya autorizado y solo controla las vistas.
- Se conservan las Server Actions, revisiones de concurrencia, estados,
  aprobaciones, alcance por marca y restricciones de edición de guiones cerrados.
- Cambiar de escena o vista no hace una llamada a IA ni una consulta adicional.
  Los paneles permanecen montados para conservar formularios y detalles abiertos.
- La selección utiliza el ID de escena, por lo que sigue a la misma escena al
  reordenarla. Si se elimina, muestra otra escena válida; el guion vacío tiene
  un estado explícito.
- Imprimir muestra todas las escenas y abre sus detalles técnicos, incluso si
  se imprime desde otra vista. Al terminar restaura los detalles cerrados.
- Las pestañas admiten flechas, Inicio y Fin. El selector móvil y los botones
  nativos conservan navegación con teclado; los cambios se anuncian de forma
  accesible.
- La guía abre Ficha e historial para los pasos que asignan un video y conserva
  sus anclas y acciones. Se actualizaron las instrucciones correspondientes.
- Se usan los tokens de blanco y cobre y tema oscuro existentes, sin nuevas
  dependencias, cambios en Prisma ni migraciones.

## Validación

Tipos, lint y compilación de producción correctos; 152 pruebas existentes
correctas. Revisión funcional con Chromium y PostgreSQL temporal propios:

- Una sola escena visible; selección conservada entre pestañas y después de
  guardar y reordenar. Edición verificada también en PostgreSQL.
- Añadir una escena, seleccionarla y eliminarla deja una selección válida;
  el registro añadido se elimina efectivamente de la base de prueba.
- Contenido de producción y ficha, prompt del Dueño y controles conservados.
- 24 combinaciones de presentación de la ficha Dueño: tres vistas, cuatro
  anchos (320, 360, 768, 1440) y dos temas, sin desbordamiento horizontal.
- Selector móvil, escena de solo texto y navegación de pestañas con teclado.
- Impresión desde Ficha e historial: siete escenas y sus notas técnicas,
  seguida de recuperación de la vista de una escena. PDF local de comprobación.
- Guion vacío y guía que abre Ficha e historial para vincular el video.
- Guionista autorizado y Producción de solo lectura; guion aprobado sin
  edición para el equipo; otra marca inaccesible. El prompt privado del Dueño
  no aparece en el documento del Equipo.
- Sin errores de navegador ni trabajos de generación. Base y contenedor
  temporales eliminados al terminar; ninguna operación sobre Neon o Vercel.

Se corrigieron dos detalles funcionales detectados durante esta validación:
los botones inmediatos de mover escena y añadir escena del Dueño utilizaban
una revisión anterior después de editar. Ahora usan la revisión mostrada en la
ficha; los formularios con borradores conservan su revisión y la validación del
servidor sigue activa. Para imprimir, la excepción de visibilidad compite en la
misma capa CSS que la regla global de Tailwind para `[hidden]`. También se
asoció un nombre accesible al campo del título.

Evidencias locales: `.audit/script-focus-ui-report.json`,
`.audit/script-focus-{build,lint,tests,ui}.log`, `.audit/focus-*.png` y
`.audit/script-focus-print.pdf`. La revisión visual incluyó escritorio claro y
móvil oscuro. El build conserva los avisos preexistentes de Prisma y Workflow.

La validación descrita corresponde al entorno local. El despliegue en Vercel
debe verificarse por separado de la publicación del código en GitHub.

Archivos principales: `src/components/scripts/script-workspace.tsx`,
`script-workspace.module.css`, `script-scene.tsx`, la página
`src/app/(app)/guiones/[id]/page.tsx` y `src/components/member/scripts.tsx`.

## Actualización 28/09/2026: una pantalla y menú «Más»

Commit `c2a9853`, rama `release/operacion-equipos`. Síntoma: el visor obligaba a desplazar la
página en 1920×1080 y en celular. Interruptor `GUIONES_AJUSTE_PANTALLA`, encendido por defecto;
`"false"` quita el modo ajuste sin tocar datos ni acciones.

Cambios respecto de la tabla anterior:

| Contenido o función | Antes | Ahora |
|---|---|---|
| Título, datos y acciones | Cabecera de página | Cabecera compacta (`ScriptHeader`): volver, título con tooltip, datos en chips y acciones en una fila |
| Duplicar, variar ángulo y eliminar guion | Ficha e historial | Menú **Más** de la cabecera (`ScriptActionsMenu`), solo si la página entrega la acción; Eliminar sigue siendo solo del Dueño |
| Editar ficha | Ficha e historial | Sigue en Ficha e historial y además en **Más** |
| Imprimir | Cabecera | Cabecera en escritorio; dentro de **Más** en celular |
| Copiar guion | Cabecera | Cabecera (solo Dueño, como antes) |
| Asignar y desvincular videos, aprobaciones, autoría y prompt | Ficha e historial | Sin cambios |

Presentación:

- **Modo ajuste** desde 1280×600 (`FIT_MEDIA`): el visor ocupa el alto disponible y cada columna
  (índice, escena, detalles técnicos, producción, ficha) se desplaza por dentro. Los detalles
  técnicos quedan abiertos en su columna. Entre 768 y 1279 px, o con el interruptor apagado,
  flujo normal con índice fijo.
- **Celular** (<768 px): pestañas y barra de escena fijas bajo la barra superior, botones y
  controles de 44 px y campos de 16 px para que el teléfono no haga zoom.
- **Biblioteca** `/guiones`: filas compactas y, desde 1024×600 con el interruptor encendido, la
  tabla se desplaza por dentro con la cabecera fija y la paginación siempre a la vista.
- **`?escena=<id>`** conserva la escena al recargar o compartir; se escribe con `replaceState`,
  sin nueva carga del servidor, solo si la URL ya lo traía o si la persona eligió una escena.
- **←/→** cambian de escena en la vista Escenas, nunca dentro de campos, menús, pestañas,
  listas de opciones o diálogos, ni con teclas modificadoras.

Se conservan las Server Actions, permisos, revisiones, anclas de la guía (la guía sigue abriendo
Ficha e historial para vincular el video) y la impresión de todas las escenas, a la que no
afecta el modo ajuste. Pruebas: `tests/guiones-visor.test.mjs` (interruptor, `?escena`,
selección por ID y atajos de teclado).

Pendiente conocido: *Variar ángulo* sigue enviando `producto=` con el enfoque del guion
(`script.focus`), no con el producto del catálogo. Está en el backlog de
`reports/catalogo-productos-2026-09-28.md` (idea 5, aplazada).
