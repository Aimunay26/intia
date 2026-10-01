# Paneles por rol: interfaz en el orden del flujo (2026-10-01)

Rama `feature/paneles-por-rol`, commit `c25cb2f` sobre `9565986`. Interruptor `ORDEN_POR_ROL`,
**encendido por defecto**: solo `"false"` lo apaga, y apagado la app se ve exactamente como antes.
Sin cambios en la base de datos ni en las rutas. Contrato técnico: sección «Paneles por rol» de
`CONTRACT.md`. Reemplaza a la idea E-B (fases), que estaba en APLAZAR.

Orden canónico, el mismo en toda la app:

| # | Panel | Id | Tarjeta del inicio |
|---|---|---|---|
| 1 | Dueño | `OWNER` | Panel del Dueño |
| 2 | Estrategia | `STRATEGY` | Panel de estrategia |
| 3 | Guiones | `WRITER` | Panel de guiones |
| 4 | Preparador | `PRODUCTION` | Panel del preparador |
| 5 | Filmmaker | `CAMERA` | Panel del filmmaker |
| 6 | Talento | `TALENT` | Panel de talento |
| 7 | Editor | `EDITOR` | Panel del editor |
| 8 | Diseñador | `DESIGNER` | Panel del diseñador |
| 9 | Community | `PUBLISHER` | Panel del community |
| 10 | Analista | `ANALYST` | Panel del analista |

El Dueño no es un perfil de trabajo: en las tarjetas de Cargos de Equipo los 9 perfiles van
numerados del 1 al 9.

---

### Idea: paneles por rol | Fecha: 2026-10-01

**1. IDEA (síntoma)**

- El menú lateral es una lista larga igual para todos. No dice qué le toca a cada rol ni en qué
  orden entra en el flujo del video.
- El inicio del Dueño no muestra de un vistazo cuánto trabajo hay en cada etapa del flujo.
- Las listas de roles salen en órdenes distintos según la pantalla: Cargos, funciones del video,
  equipo de marca, Manual y Cómo se usa.

**2. EVALUACIÓN**

- Dolor real: sí. Es un pedido del Dueño: ver la operación por roles, con el Dueño primero.
- Costo: M. El shell y el inicio se pintan en todas las páginas, pero no hay cambios de datos.
- Riesgo en prod: medio. El menú y el inicio están en el camino de todas las pantallas. Se mitiga
  con el interruptor y porque las rutas y los hrefs base no cambian.
- Reversibilidad: alta. `ORDEN_POR_ROL="false"` y redesplegar.
- ► Veredicto: **GO**.

**3. PLANIFICACIÓN**

- Archivos:
  - Nuevos: `src/lib/role-panels.ts` (fuente única del orden), `src/lib/role-order-flag.ts`,
    `src/lib/role-nav.ts`, `src/lib/role-counts.ts`, `src/components/nav-icons.ts`,
    `src/components/role-sidebar-nav.tsx` y `src/components/role-panel-cards.tsx`.
  - Cambiados: `shell.tsx`, `(app)/layout.tsx`, `(app)/page.tsx`, `member/home.tsx`,
    `member/help.tsx`, `member/content.tsx`, `equipo/page.tsx`, `equipo/user-form.tsx`,
    `contenido/[id]/assignments.tsx` y `page.tsx`, `marcas/[id]/team.tsx`, `brand-team.tsx`,
    `manual.ts`, `manual/page.tsx`, `tutorial/page.tsx` y `globals.css`.
  - Pruebas: `role-panels`, `role-nav`, `role-home` y `role-lists` (nuevas); `manual.test.mts`,
    `equipo-tarjetas.test.mjs`, `check-design-ui.mjs` y `smoke-permissions.mjs`.
- Diseño:
  - **Estado en memoria vs persistencia:** no hay nada nuevo en la base. El orden es código puro;
    el interruptor se lee en el servidor en cada render y llega como prop a los componentes de
    cliente (`Shell`, `ProfileCards`, `TeamPanel`, `BrandTeamPanel`). Lo único que se guarda es
    el plegado de los paneles, en el navegador (`localStorage["alsos-nav-paneles-cerrados-v1"]`).
    Si falla, todo queda abierto.
  - **Menú:** un bloque general sin cabecera (Inicio, Cadena, Calendario, Videos, Tareas, Manual),
    un panel plegable por rol de quien mira y «Ayuda». Cada enlace aparece una sola vez, en el
    primer panel de su lista de prioridad. Por defecto todo está abierto; el panel del enlace activo
    y todos durante la guía se fuerzan abiertos.
  - **Inicio del Dueño:** «Mi trabajo» (con la cadena), luego 10 tarjetas numeradas con su conteo
    y de 1 a 3 botones. Después vienen «Panel del Dueño» (indicadores, objetivos, actividad,
    marcas) y «Panel de estrategia» (qué falta, embudo), y el manual al final. Con la cadena
    encendida, los conteos son pasos abiertos con la regla de `/cadena?paso=X`.
  - **Inicio del miembro:** «Tus paneles», una tarjeta por perfil propio en el orden del flujo. Los
    accesos siguen el orden de su menú.
  - **Listas:** cargos de Equipo en tarjetas numeradas 1-9 por columnas, funciones del video,
    equipo de marca, Manual (el Dueño como «Dirección» y luego «Paso N») y Cómo se usa (suma las
    tarjetas Community y Analista). Las constantes no se mutan; solo cambia el orden en que se
    muestran.
- Plan de reversa: `ORDEN_POR_ROL="false"` en Vercel y redesplegar. Vuelven el `NAV` de siempre,
  el inicio con sus bloques y consultas de antes y las listas en el orden de las constantes. No
  hay que limpiar datos. Nunca `git revert`.
- Criterio de HECHO:
  - typecheck, lint y pruebas unitarias en verde;
  - menú del Dueño con los paneles en `ROLE_ORDER`, sin hrefs repetidos y un solo «Guiones»;
  - cada perfil conserva todos sus hrefs de antes;
  - el inicio del Dueño tiene 10 `[data-role-card]` en orden;
  - sin desborde horizontal en escritorio y móvil, en claro y oscuro;
  - en producción, 24 h sin 500 ni `pageerror` nuevos en `/` y en las páginas del menú.

**4. DESARROLLO**

- Rama: `feature/paneles-por-rol` (el shell afecta a todas las páginas, por eso va en rama aunque
  tenga interruptor).
- Commit `c25cb2f`: 34 archivos.
- [x] Interruptor implementado junto con el cambio. Apagado, cada ayudante devuelve la referencia o
  el orden original (lo fijan las pruebas).

**5. DEBUGGING**

- No hubo fallos en producción que diagnosticar. Riesgos cubiertos en el diseño:
  - Un panel plegado ocultaría enlaces a las pruebas y a la guía. Por eso todo empieza abierto y
    la guía lo abre todo.
  - El nav se pinta dos veces (barra y cajón), así que `aria-controls` usa `useId`.
  - `user.profiles` llega en orden alfabético. Siempre se usa `rolePanelsFor`.

**6. TESTING**

- [x] 6a. Entorno local:
  - `npm run typecheck` y `npm run lint` en verde;
  - pruebas unitarias en verde: 450, incluidas las 4 suites nuevas;
  - revisión visual en local a 1440 px y 375 px, en tema claro y oscuro: menú por paneles,
    tarjetas del inicio y listas en el orden del flujo, sin desborde.
- [ ] 6b. Producción: **pendiente**. Desplegar con el interruptor encendido y observar 24 h:
  - 0 errores 500 y 0 `pageerror` nuevos en `/` y en las páginas del menú;
  - el p95 de `page:/` más `panel.roles` no empeora más de un 10 %.

  Si algo falla, `ORDEN_POR_ROL="false"` y redesplegar.

**7. CIERRE**

- [ ] Merge a `main` tras la 6b.
- [ ] Memoria: decisión y reversa (`ORDEN_POR_ROL="false"`).
- [ ] Pendiente de decisión del Dueño:
  - si «Mi trabajo» sigue encima de los paneles (por la decisión del 30/09) o va debajo; moverlo
    es cambiar una línea;
  - si «Producción» se renombra a «Preparador» en todos los textos, solo con copy y sin cambiar
    los ids.
- Sin instrumentación temporal nueva.

## Qué no cambia

- Rutas, hrefs base, ids guardados (`PRODUCTION`, `PRODUCCION`, `ENCARGADO`…) y base de datos.
- `SECTIONS`, `WORK_PROFILES`, `ASSIGNMENT_ROLES` y `BRAND_TEAM_ROLES`, y los bucles del
  servidor.
- El orden de los pasos (`CHAIN_ORDER`, la tira de `/cadena`, el calendario).
- Los selectores de personas, que siguen en orden alfabético.
- El índice generado del manual y sus JSON.
