# Identidad visual de Intia · Blanco y cobre

Fecha: 25 de septiembre de 2026. Estado: implementado y validado localmente. Despliegue productivo pendiente de comprobar.

## Decisión y alcance

Identidad aprobada: **Blanco y cobre**, nombre visual `intia.`, lema «Ideas que se publican» y tipografía Manrope. Se conserva Next.js 15, React 19, Tailwind 4 y Lucide; shadcn/ui se incorpora selectivamente con primitivas Radix.

La actualización abarca navegación, acceso, títulos, tarjetas, indicadores, botones, campos, filtros, avisos, confirmaciones y guía. Los componentes compartidos llevan el tema a las pantallas del Dueño y del Equipo. No se sustituyen rutas, acciones de servidor, políticas de autorización, consultas, esquema ni datos.

## Paleta y tipografía

| Uso | Claro | Oscuro |
|---|---|---|
| Fondo | `#F5F6F7` | `#1B1E22` |
| Superficie y navegación | `#FFFFFF` | `#262B30` |
| Texto principal | `#293238` | `#F2F4F5` |
| Texto secundario | `#606B72` | `#B9C2C9` |
| Acción principal | `#A34D2B` | `#F1AA83` |
| Texto sobre acción | `#FFFFFF` | `#302017` |
| Selección suave | `#F4E5DC` | `#49362D` |
| Texto seleccionado | `#824021` | `#F4BDA0` |
| Bordes | `#DFE3E6` | `#414950` |

Los tokens viven en `src/app/globals.css`. Los colores semánticos de estados y los personalizados de marcas/personas conservan su significado. Manrope se sirve desde el propio despliegue mediante `@fontsource-variable/manrope`; no se descarga desde Google Fonts en cada visita ni durante el build. La fuente incluye licencias OFL en su paquete.

El tema guardado en `mos-theme` se respeta; sin preferencia guardada se usa la del sistema. Los controles de escritorio y móvil se sincronizan, también ante un cambio en otra pestaña. La interfaz respeta reducción de movimiento e impresión.

## Integración de componentes

- `components.json`: configuración para incorporar componentes shadcn/ui al proyecto existente.
- `src/components/ui/`: menú desplegable, diálogo y selector nativo adaptados, con licencia MIT. Usan los mismos tokens de Intia.
- `src/lib/ui-utils.ts`: combinación de clases para esos componentes. El helper existente del negocio conserva su comportamiento.
- Menús de marca y usuario: Radix controla teclado, cierre y posición. El cambio de marca conserva la misma Server Action; cerrar sesión conserva el POST a `/api/logout`.
- Filtros: select nativo estilizado, con las mismas opciones, eventos y URL. Las pestañas que navegan mediante enlaces conservan sus URLs y renderizado en servidor.
- Confirmaciones de borrado: descarga diferida al abrirlas, título y descripción accesibles, foco inicial en Cancelar, foco contenido y retorno al botón de origen.
- Editores de negocio: mantienen `Modal`, sus formularios, validación, revisiones y guía. Se añaden nombres accesibles y Escape distingue una confirmación anidada del editor padre. Trasladar indiscriminadamente estos formularios a portales rompería campos vinculados a formularios externos y la interacción con la guía.
- Wordmark e icono vectorial propios; el nombre configurable de la organización sigue visible bajo Intia.

## Funciones que se conservan

| Grupo | Secciones y funciones |
|---|---|
| Operación | Panel, calendario, videos y tareas; listas, fichas, estados, asignaciones y edición |
| Marcas | Identidad, documentos, productos y objetivos |
| Creación | Generador, historial de trabajos, guiones, escenas, estructuras y personas |
| Seguimiento | Métricas, importación y objetivos calculados |
| Administración | Equipo, perfiles, marcas asignadas, actividad, ajustes y credenciales cifradas |
| Cuenta y ayuda | Mi perfil, entrada con correo/Google, salida, tema, tutorial y guía interactiva |

Conservar un módulo significa que sigue accesible bajo las mismas reglas, no otorgar acceso a perfiles que antes no lo tenían. El cambio visual no resuelve ni oculta limitaciones externas de los proveedores de IA.

## Validación

- `npm test`: pruebas unitarias existentes.
- `npm run build`: compilación y comprobación del runtime de React.
- `npm run typecheck` y `npm run lint`.
- `npm run test:perfiles` con `DATABASE_URL` de PostgreSQL local temporal: regresión de los 11 perfiles, con datos ficticios y sin IA/Blob reales.
- `scripts/check-design-ui.mjs`, integrado en la regresión anterior: inventario de navegación, páginas principales y fichas, selector de marca, filtros, confirmación de borrado, foco, menú móvil, tema y guía.

Resultados confirmados el 25/09/2026:

| Comprobación | Resultado |
|---|---|
| Pruebas unitarias | 142 correctas: 131 de unidad y 11 de CTA |
| Build, tipos y lint | Correctos; runtime de React verificado |
| Perfiles | 11 correctos: Dueño, nueve perfiles de trabajo y cuenta sin perfiles |
| Navegación | 14 entradas conservadas y 21 rutas verificadas |
| Adaptación visual | 36 combinaciones: seis páginas, tres anchos (360, 768, 1440 px) y dos temas; sin desbordes horizontales |
| Interacciones nuevas | Marca/teclado, filtros/URL, cancelar/borrar/foco, confirmación anidada sin perder borrador, navegación móvil/tema, guía/formulario y menú de perfil |
| Errores de navegador | Cero en la regresión |

Se inspeccionaron capturas reales del build local. Las tablas y tableros conservan su desplazamiento interno cuando requieren más ancho. El botón de cerrar menú se oculta en escritorio; la navegación mantiene todas sus entradas y puede desplazarse en ventanas de poca altura.

Resultados y capturas locales en `.audit/design-*.log`, `.audit/profiles-ui.json` y `.audit/intia-*.png`. Esta carpeta está ignorada por Git. El contenedor PostgreSQL creado para esta validación se retira al finalizar; no se usa Neon.

### Carga inicial

El build local mantiene el bloque JS común en 103 kB. Frente al build previo guardado del 24 de septiembre, el panel pasa de 169 a 171 kB, Guiones de 186 a 196 kB y Métricas de 119 a 128 kB. Generador conserva 151 kB. Son tamaños informados por Next, no mediciones de latencia en producción. Los diálogos se cargan al abrir una confirmación; el rediseño no añade consultas ni peticiones de IA al navegar.

La instalación no cambió versiones de dependencias preexistentes; añadió las de interfaz y fuente. `npm install` informó cero vulnerabilidades en su auditoría de dependencias.

### Límites de la verificación

Las pruebas se ejecutan sobre el build de producción en localhost y PostgreSQL temporal. Usan datos ficticios. Las llamadas reales a IA, Google OAuth, Vercel Blob y los servicios de producción no forman parte de esta validación visual. Se conserva su código y la regresión de permisos comprueba, entre otras operaciones, credenciales cifradas, calendario privado, importación de métricas y transiciones de trabajo con el entorno ficticio.

## Referencias de implementación

- [Instalación manual de shadcn/ui](https://ui.shadcn.com/docs/installation/manual).
- [Diálogo Radix de shadcn/ui](https://ui.shadcn.com/docs/components/radix/dialog).
- [Menú Radix de shadcn/ui](https://ui.shadcn.com/docs/components/radix/dropdown-menu).
- [Temas mediante variables CSS](https://ui.shadcn.com/docs/theming).

La integración se hizo de forma manual para adaptar componentes concretos sin sobrescribir los estilos ni la estructura del sistema.

## Etapa Formato del generador · 25/09/2026

Estado: reorganizada y validada localmente. Despliegue productivo pendiente de comprobar.

Se conservan las cinco etapas y sus campos. Formato ocupa el ancho disponible, con dos columnas en escritorio y una en móvil, tarjetas de descripción breve, casillas nativas y una única barra de selección al pie. El catálogo usa el desplazamiento de la página; el resumen no se superpone a las tarjetas. La ampliación descrita a continuación añade paginación y hace desplegable «Lo que recibe la IA» en todas las etapas.

| Función anterior | Ubicación actual |
|---|---|
| Todas las estructuras y sus categorías | Catálogo completo, con contadores en Todos / Vende / Entretiene |
| Buscar por nombre, familia o descripción | Buscador del catálogo; conserva los mismos criterios |
| Elegir varios formatos hasta el máximo configurado | Casillas y contador único; los seleccionados se conservan al filtrar |
| Seleccionar visibles y limpiar | Menú «Más», respetando el máximo de la solicitud |
| Seleccionar únicamente un formato | «Solo este», dentro de su referencia |
| Consultar cualquiera de los seleccionados | Nombre del formato en el resumen; el botón de quitar es independiente |
| Familia y descripción completa | Ventana «Ver ejemplo» |
| Gancho, modelo mental, etiqueta, regla de oro y retención | Referencia; los detalles adicionales se despliegan a petición |
| Beats, tiempos, objetivos y documentos | Detalle de referencia y contexto completo; se muestran también las notas de cada beat |
| Preselección desde un video, orden del lote y configuración de generación | Mismos campos y manejadores del formulario; las otras etapas conservan su funcionamiento |
| Guía interactiva | Mismos objetivos `data-guia`; instrucciones actualizadas para «Continuar» y «Más» |

Consultar una referencia tiene estado independiente: no cambia la selección, duración, modelo, proveedor ni CTA. El diálogo se carga al abrirlo, permite teclado/Escape y devuelve el foco al control de origen. Los estilos específicos de Formato están aislados para respetar los componentes y temas existentes.

Validación: 142 pruebas unitarias existentes, compilación, tipos y lint correctos. Comprobación adicional sobre el build de producción local, Chromium y PostgreSQL temporal: nueve grupos de interacción, las cinco etapas, conservación del cierre manual y del briefing, lote precargado desde un video, referencia completa, foco/teclado y ocho combinaciones de ancho/tema (320, 360, 768 y 1440 px; claro y oscuro). Sin errores de navegador ni solicitudes de generación. La base temporal se elimina al finalizar. Evidencia local en `.audit/format-ui-report.json`, `.audit/format-build.log` y `.audit/format-*.png`.

La carga JS inicial informada por Next para `/generador` pasa de 151 kB en el build anterior a 145 kB al separar la referencia y el diálogo. Es tamaño de bundle local, no una medición de velocidad en producción. El build conserva el aviso preexistente de dependencia dinámica de `@vercel/queue`.

## Todas las etapas y paginación de formatos · 25/09/2026

Estado: implementado y validado localmente. Despliegue productivo de esta ampliación pendiente de comprobar.

Se aplica la misma jerarquía a las cinco etapas: una tarjeta principal, campos prioritarios visibles, explicaciones y ejemplos desplegables, una acción de avance y el contexto completo cerrado inicialmente. Se mantienen el orden de las etapas, sus validaciones y el contenido del formulario al navegar.

| Etapa | Reorganización | Opciones conservadas |
|---|---|---|
| Formato | Seis tarjetas por página, rango visible y Anterior/Siguiente | Todo el catálogo, búsqueda, categorías, referencias y selección entre páginas; «Más» distingue seleccionar la página visible de seleccionar resultados filtrados |
| Identidad y producto | Video y marca juntos; producto y descripción como campos principales; selector de persona y perfil desplegable | Guion independiente o vinculado, todas las marcas/personas/plantillas, compatibilidad, voz, energía, notas y advertencia de incompatibilidad |
| Ángulo e idea | La idea ocupa el primer lugar; selector de ángulo con ejemplo desplegable; variante opcional desplegable | Los 12 ángulos, sus descripciones y ejemplos, opción estándar, quitar ángulo y nota adicional |
| Cierre CTA | Dos objetivos visibles, selectores de tipo y acción, texto editable y fórmulas desplegables | Venta y Comunidad, 18 tipos de cierre, 48 fórmulas, cinco acciones de venta y nueve de comunidad, detalle, reensamblado y cierre sin pedido explícito |
| Generar IA | Resumen por sección con botones Editar; proveedor, modelo y duración debajo | Todos los modelos del catálogo aceptado por el servidor, proveedores configurados, duración de 10 a 300 segundos, generación por lote y vínculo del primer guion al video |

La página de formatos se conserva al volver desde otra etapa y vuelve a la primera al cambiar búsqueda o categoría. La selección se mantiene aunque un formato quede fuera de la página o filtro actual. El tamaño de página (seis) es independiente del máximo de formatos por solicitud configurado por el servidor. Las acciones masivas respetan ese máximo y conservan el orden del lote.

Los datos adicionales permanecen accesibles al desplegarlos. Consultar una referencia no modifica el pedido; cambiar formatos respeta un cierre ya editado manualmente. El selector de acción representa correctamente el valor vacío de las fórmulas «Sin pedido». El selector de modelos usa el catálogo que ya valida el backend. La guía mantiene sus objetivos `data-guia` y actualiza instrucciones y nombres de controles.

### Validación de esta ampliación

- `npm test`: 142 pruebas existentes correctas; `npm run typecheck`, lint y build correctos. El build final también verifica tipos y runtime de React.
- Chromium sobre el build de producción local y PostgreSQL temporal: catálogo ficticio de 14 formatos, páginas de 6/6/2, acceso a todos, selección entre páginas, límites de acciones masivas, filtros, búsqueda vacía, referencia completa y retorno del foco.
- Recorrido de las cinco etapas: personas y plantillas, compatibilidad, los 12 ángulos, los 18 tipos de cierre y cada una de sus 48 fórmulas, acciones y reensamblado, todos los modelos configurados, enlaces Editar y conservación del formulario completo.
- Preselección desde un video, orden de sus formatos, contexto y cierre manual conservados.
- 40 combinaciones visuales: cinco etapas × cuatro anchos (320, 360, 768 y 1440 px) × dos temas. Sin desbordes horizontales. Capturas reales revisadas en escritorio y móvil.
- Cero errores de navegador y cero solicitudes de generación. La base temporal creada para estas pruebas fue eliminada; no se modificó Neon ni se consumió el cupo de IA.

Evidencia local en `.audit/generator-stages-ui-report.json`, `.audit/generator-stages-{build,lint,tests,ui}.log` y `.audit/stages-*.png`. `/generador` informa 144 kB de JS inicial frente a 145 kB tras el cambio anterior; es tamaño del build, no una medida de latencia. Persisten los avisos preexistentes de `@vercel/queue` y de la configuración Prisma en `package.json`.
