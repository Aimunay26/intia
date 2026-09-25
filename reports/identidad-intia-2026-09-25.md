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
