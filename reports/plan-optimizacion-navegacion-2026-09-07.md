# Evaluación y plan de optimización de la navegación

Fecha: 7 de septiembre de 2026. Complementa la [auditoría de arquitectura, backend, DB y multitenancy](./auditoria-arquitectura-multitenant-2026-09-07.md).

## Decisión propuesta

Conservar Next.js, React y Prisma. Abordar la navegación en dos frentes: dar respuesta visual al clic mientras llegan los datos y reducir el trabajo necesario para obtener esos datos. El primer cambio debería incluir estados de carga y señal de navegación pendiente; el siguiente, eliminar consultas redundantes y esperas en secuencia. Las consultas que crecen con el historial necesitan después agregación y paginación.

El usuario reporta aproximadamente un segundo al cambiar de sección en **la web publicada**, [intia-lovat.vercel.app](https://intia-lovat.vercel.app/). La revisión del código explica un mecanismo compatible con ese síntoma, pero todavía no atribuye ese segundo a una consulta o servicio concreto. Un indicador de carga puede mejorar mucho la percepción y dejar intacto el tiempo hasta que aparecen los datos: ambas cosas deben medirse por separado.

Este documento conserva el diagnóstico y la propuesta del 7 de septiembre, anteriores a la implementación. **Actualización del 8 de septiembre:** se aplicaron mejoras locales de navegación, consultas y lecturas sin efectos; ver [cambios implementados y validación](./mejoras-navegacion-implementadas-2026-09-08.md). Las observaciones y referencias de código siguientes describen el estado revisado originalmente; el despliegue y las mediciones posteriores siguen pendientes.

## Evidencia y límites de la comprobación

| Dato | Estado | Interpretación |
|---|---|---|
| Espera aproximada de un segundo | Reportada por el usuario | Falta una distribución de tiempos por ruta |
| Entorno afectado | Web publicada, confirmado por el usuario | La compilación bajo `next dev` no explica este caso |
| Acceso a la URL publicada | Primero redirigió a `/login`; el usuario inició sesión y se comprobaron ocho transiciones internas | Recorrido con rol OWNER y selector en Todas las marcas |
| Observación de transición | Realizada: título anterior aún presente en siete de ocho lecturas inmediatamente posteriores a la llamada de clic | Reproduce la espera sin una señal accesible de carga en esas lecturas |
| Separación de clic real, respuesta del servidor y pintado | Pendiente de instrumentación | Los intervalos de automatización de abajo no son tiempos SQL, TTFB ni tiempos exactos de pintado |
| Versión de la copia local | Next.js 15.5.24, React 19.2.8, Prisma 6.19.3 | No se ha confirmado que el despliegue corresponda exactamente a esta copia |
| Compilación local de producción | Correcta en la auditoría | No fue un benchmark: no había DB real ni datos representativos |
| Límites de carga por ruta | Comprobados leyendo consultas | Número de operaciones Prisma no equivale a número de sentencias SQL |
| Región, proveedor y plan de DB; pool; arranques de funciones | No verificados | La URL identifica el alojamiento en Vercel, no la ubicación/configuración de la DB |

La herramienta de inspección del navegador no expuso `performance.getEntriesByType` en su contexto de lectura. Por ello tampoco se extrajeron Navigation Timing o Resource Timing desde esa herramienta. Una traza real del navegador o instrumentación temporal del despliegue permitirá separar las fases.

### Recorrido observado en producción

Comprobación del 7 de septiembre de 2026, aproximadamente 19:44 en America/Lima (8 de septiembre, 00:44 UTC). Navegador integrado de Codex, tamaño predeterminado con menú adaptable, sesión iniciada por el usuario, rol OWNER y Todas las marcas. La página de Videos indicaba 15 registros. No se cambiaron filtros ni datos; no se visitaron Tareas/Ajustes durante el recorrido, por las escrituras potenciales detectadas en su render.

Método: abrir el menú si estaba cerrado; iniciar cronómetro fuera del navegador; llamar al clic del enlace; leer el título y un posible `role=status`; esperar la URL de destino y verificar el título nuevo. Abrir el menú queda fuera del intervalo. El cronómetro **incluye automatización, comprobaciones de visibilidad del clic, lecturas y espera de confirmación**. No identifica el instante exacto del evento ni el primer pintado. No debe descontarse un supuesto coste fijo para inferir el tiempo de servidor.

| Transición | Visita en el recorrido | Inicio de llamada de clic → URL confirmada | Lectura temprana tras iniciar el clic | Título anterior todavía presente |
|---|---|---:|---:|---|
| Panel → Videos | Primera | 535 ms | 298 ms | Sí |
| Videos → Calendario | Primera | 896 ms | 280 ms | Sí |
| Calendario → Marcas | Primera | 740 ms | 296 ms | Sí |
| Marcas → Métricas | Primera | 1.231 ms | 318 ms | Sí |
| Métricas → Videos | Repetida | 640 ms | 298 ms | Sí |
| Videos → Calendario | Repetida | 465 ms | 284 ms | Sí |
| Calendario → Marcas | Repetida | 607 ms | 296 ms | Sí |
| Marcas → Métricas | Repetida | 334 ms | 323 ms | No; ya mostraba Métricas |

En las ocho transiciones se verificó el título de destino después de confirmar la URL. No apareció un elemento `role=status` en las lecturas tempranas y la consulta de consola al finalizar no devolvió errores/avisos capturados. Esto no descarta errores del servidor que no lleguen a la consola.

**Conclusión de la observación:** existe una espera visible compatible con el reporte, también en varias visitas repetidas. No hay un retraso fijo de un segundo en todas las muestras. La segunda entrada a Métricas fue mucho más rápida; estos datos no distinguen caché, precarga, conexiones o carga del servidor. Son ocho observaciones exploratorias, insuficientes para un p95 por ruta o para comparar optimizaciones aún no implementadas.

Los intervalos y su alcance están guardados en [observaciones-navegacion-publicada-2026-09-07.json](./observaciones-navegacion-publicada-2026-09-07.json). La pantalla de login no se utilizó como sustituto de la navegación interna.

## Por qué la interfaz puede parecer detenida

La barra usa correctamente `Link` de Next en [shell.tsx:163](<C:/Users/YONELIA/Desktop/intia-main/src/components/shell.tsx:163>). No contiene una espera deliberada de un segundo ni una recarga completa al seleccionar esas secciones. El elemento activo depende de `usePathname`, por lo que cambia cuando se confirma la nueva ruta; no hay estado propio que indique el destino pendiente.

Las páginas protegidas leen sesión y DB en el servidor. No existe ningún `loading.tsx` en `src/app`, y las páginas revisadas esperan sus consultas antes de devolver la interfaz. El clic puede mantener la pantalla anterior mientras se obtiene la respuesta del nuevo segmento.

En Next 15, la precarga automática de una ruta dinámica depende de sus límites de carga. Añadirlos permite adelantar la interfaz de espera sin precargar todos los datos de cada pantalla. La ausencia de estos límites es un candidato concreto para explicar la falta de respuesta visual, no una medición de la velocidad de PostgreSQL. [Documentación de precarga de Next 15](https://nextjs.org/docs/15/app/guides/prefetching).

El recorrido típico de datos en esta copia es:

```text
Clic en la barra
  → solicitud del segmento de la nueva página
  → comprobar sesión en DB
  → resolver contexto de marca, cuando corresponde
  → consultar los datos de la pantalla
  → transformar resultados y devolver contenido React
  → descargar componentes que falten y mostrar la nueva pantalla
```

Hay dependencias reales y otras que se pueden solapar. El tiempo de varias consultas paralelas no se calcula sumando sus duraciones; también intervienen el pool, la cola de conexiones y las relaciones que Prisma necesita recuperar. La latencia de red entre aplicación y DB se paga repetidamente cuando se introducen tandas consecutivas.

El [layout compartido](<C:/Users/YONELIA/Desktop/intia-main/src/app/(app)/layout.tsx:8>) carga sesión, nombre de organización y marcas. **No se debe asumir que ese layout se vuelve a ejecutar íntegramente en cada cambio de pestaña**: Next puede reutilizar los segmentos compartidos. Las duplicaciones entre layout y página son relevantes cuando ambos se ejecutan en una misma petición, por ejemplo en una carga completa o ciertas revalidaciones.

## Trabajo que realiza cada pantalla

Los conteos siguientes son operaciones Prisma visibles directamente en el archivo de la página. Excluyen autenticación, contexto de marca, helpers y operaciones adicionales para relaciones. Las tandas describen el código, no trazas medidas.

| Pantalla | Trabajo confirmado | Mejora a evaluar |
|---|---|---|
| Panel `/` | Sesión → marca → 12 operaciones en `Promise.all`; mezcla indicadores, agenda y actividad | Separar bloques con carga independiente; revisar el pool antes de aumentar paralelismo; reutilizar la lista de marcas |
| Contenido | Sesión → marca → cuatro operaciones de conteo/catálogos → consulta de hasta 50 videos; recupera todas las métricas de esos videos para sumar vistas | Sacar catálogos del camino de la consulta principal; agregar vistas en DB sin recuperar el historial completo |
| Marcas | Después de sesión ejecuta lista, publicados del mes y conteo de archivadas de forma consecutiva | Iniciar las tres consultas independientes juntas; conservar exactamente los filtros y el cálculo de fechas |
| Actividad | Sesión → dos catálogos → contexto de marca → conteo/lista/agrupación; lista de hasta 60 entradas | Resolver contexto y catálogos en paralelo después de autorizar; diferir estadísticas secundarias |
| Tareas | Sesión → marca → inicializador de columnas → tres consultas; recupera columnas y tareas sin filtro de marca en SQL | Quitar escrituras del render, evitar la doble lectura de columnas y limitar tarjetas por alcance/columna |
| Métricas | Sesión → marca → cinco operaciones; trae filas de dos periodos para procesarlas en memoria | Agregados en DB para comparación y series; limitar tablas de detalle; corregir primero la semántica detectada en H08 |
| Equipo | Tres consultas después de sesión; carga todas las asignaciones históricas y calcula participación con `Map`/`Set` | Agregar por persona/función y contar videos distintos correctamente; paginar personas |
| Generador | Cinco operaciones directas y `aiStatus` en paralelo; consulta el contexto de marca al final | Solapar el contexto con las opciones; cargar solo campos necesarios para el formulario |
| Ajustes | Configuración/estado IA/Google/feed en paralelo; después llama al recuento completo de datos de ejemplo | Cargar el recuento al solicitar revisar la limpieza, unificar lecturas de configuración y separar creación del token |
| Guiones | Sesión → marca → tres operaciones; biblioteca limitada a 200 registros | Paginación explícita para poder recorrer el resto; mantener proyección reducida |
| Calendario | Sesión → marca → cuatro operaciones paralelas; contenido/eventos limitados al rango visible | Conservar el filtro temporal; deduplicar catálogos y medir densidad del calendario antes de rediseñar |
| Arquetipos | Trae el catálogo completo y compatibilidades; filtra parte de la vista en memoria | Reducir campos y aplicar filtros/paginación según volumen real |

Referencias de las consultas:

- [Panel:129](<C:/Users/YONELIA/Desktop/intia-main/src/app/(app)/page.tsx:129>), [Contenido:121](<C:/Users/YONELIA/Desktop/intia-main/src/app/(app)/contenido/page.tsx:121>), [Marcas:66](<C:/Users/YONELIA/Desktop/intia-main/src/app/(app)/marcas/page.tsx:66>) y [Actividad:104](<C:/Users/YONELIA/Desktop/intia-main/src/app/(app)/actividad/page.tsx:104>).
- [Tareas:18](<C:/Users/YONELIA/Desktop/intia-main/src/app/(app)/tareas/page.tsx:18>), [Métricas:229](<C:/Users/YONELIA/Desktop/intia-main/src/app/(app)/metricas/page.tsx:229>) y [Equipo:46](<C:/Users/YONELIA/Desktop/intia-main/src/app/(app)/equipo/page.tsx:46>).
- [Generador:48](<C:/Users/YONELIA/Desktop/intia-main/src/app/(app)/generador/page.tsx:48>) y [contexto tardío:187](<C:/Users/YONELIA/Desktop/intia-main/src/app/(app)/generador/page.tsx:187>), [Ajustes:74](<C:/Users/YONELIA/Desktop/intia-main/src/app/(app)/ajustes/page.tsx:74>), [Guiones:56](<C:/Users/YONELIA/Desktop/intia-main/src/app/(app)/guiones/page.tsx:56>), [Calendario:122](<C:/Users/YONELIA/Desktop/intia-main/src/app/(app)/calendario/page.tsx:122>) y [Arquetipos:83](<C:/Users/YONELIA/Desktop/intia-main/src/app/(app)/arquetipos/page.tsx:83>).

### Lecturas compartidas

[getSession:120](<C:/Users/YONELIA/Desktop/intia-main/src/lib/auth.ts:120>) verifica la cookie y consulta al usuario; no memoriza el resultado dentro del render. [getBrandContext:32](<C:/Users/YONELIA/Desktop/intia-main/src/lib/brand-context.ts:32>) vuelve a leer las marcas activas. Varias páginas hacen después otra consulta equivalente de marcas para los filtros.

Propuesta: una función compartida para la proyección de marcas activas y memoización **por petición de render** para sesión/contexto. Mantener lecturas frescas en acciones y flujos que cambien cookies, roles o configuración dentro de la operación. No retirar `requireUser` de las páginas ni de las acciones para ahorrar consultas.

`cache` de React comparte trabajo entre Server Components en la misma petición y se invalida entre peticiones. No es una caché permanente de sesiones ni elimina la consulta de autorización de toda navegación futura. Importar una única función memoizada desde el módulo común; evitar crear un wrapper nuevo en cada componente. [Referencia de React](https://react.dev/reference/react/cache).

### Costes que no deben confundirse con el clic de la barra

- Abrir Generador consulta catálogos/configuración; no llama al modelo para generar guiones. Los tiempos de IA corresponden a otra operación.
- El cambio de marca sí actualiza una cookie y ejecuta `revalidatePath('/', 'layout')` en [brand-context.ts:34](<C:/Users/YONELIA/Desktop/intia-main/src/app/actions/brand-context.ts:34>). Seleccionar otra sección en la barra no llama a esa acción.
- Las revalidaciones después de editar datos pueden afectar la siguiente navegación, pero no se ejecutan por todos los clics de la barra.
- El build local mostró aproximadamente 103 kB de JS compartido y primeras cargas de 106–143 kB. Esto no mide CPU, hidratación ni bytes reales de cada transición. No hay evidencia suficiente para atribuir el segundo a un bundle excesivo.

## Cambios propuestos, en orden

### O01 — Medir una referencia comparable

Antes del primer despliegue de optimización, registrar rutas, versión desplegada, usuario/rol de prueba, marca, filtros, volumen aproximado y condiciones de red. Si es posible, instrumentar una preview con la misma ubicación de aplicación/DB y un conjunto representativo sin datos sensibles.

Registrar tiempos por fase: autorización, contexto de marca, consulta principal, catálogos, agregación y respuesta. Añadir número de operaciones, tamaño de resultado y un identificador de petición. La configuración actual de [Prisma](<C:/Users/YONELIA/Desktop/intia-main/src/lib/prisma.ts:42>) registra errores/avisos, no ofrece esta atribución de tiempos.

Instrumentar duración de las operaciones en el servidor sin registrar parámetros, cookies, claves, contenido de guiones o cadenas de conexión. Un cronómetro alrededor de una operación incluye más que ejecución SQL; contrastarlo con tiempos del motor, pool y trazas del proveedor. No prometer que una cabecera `Server-Timing` emitida al principio del streaming pueda contener el tiempo final de todos los bloques.

### O02 — Respuesta visible al cambiar de sección

Crear un `loading.tsx` por sección principal con un esqueleto ligero y estable. Compartir los elementos visuales entre páginas. Un fallback general bajo `(app)` puede cubrir descendientes, pero se debe verificar en producción la transición entre secciones; situar límites por sección deja explícito qué parte puede cargarse independientemente.

Mantener la barra interactiva mientras se reemplaza el contenido. Los esqueletos deben tener dimensiones cercanas a las tablas, tarjetas o calendario final y anunciar «Cargando sección» de forma accesible. No deben consultar DB ni mostrar datos privados de una selección anterior.

El fallback puede mostrarse al navegar si su precarga está lista. Una entrada directa todavía puede esperar al layout y a la autenticación que están por encima del límite. `loading.tsx` no acelera las consultas por sí solo. [Estados de carga de Next 15](https://nextjs.org/docs/15/app/api-reference/file-conventions/loading).

Añadir un indicador pendiente dentro de cada `Link` de la barra mediante un componente descendiente con `useLinkStatus`. Es compatible con la versión local: existe desde Next 15.3. Mantener el estado de página activa vinculado a la ruta confirmada y el estado pendiente vinculado al clic; comprobar teclado, móvil, cancelación de navegación y clics rápidos a varios destinos. [Referencia de useLinkStatus](https://nextjs.org/docs/15/app/api-reference/functions/use-link-status).

Para mostrar contenido útil antes del bloque más lento, dividir Panel y Métricas en componentes de servidor asíncronos con límites de `Suspense`. La consulta lenta debe ejecutarse dentro del componente suspendible; envolver JSX después de haber esperado todos los datos no adelanta su aparición.

### O03 — Acortar las dependencias y repetir menos trabajo

1. Marcas: calcular límites de fecha y arrancar lista, agrupación mensual y conteo de archivadas en una misma tanda.
2. Contenido: después de autorizar y resolver filtros, iniciar conteo, catálogos y trabajo de listado sin que los catálogos frenen a las filas. El ajuste de una página fuera de rango depende del conteo: conservar esa semántica, solapando catálogos con conteo/listado, o diseñar una segunda consulta solo para ese caso excepcional.
3. Actividad: resolver contexto de marca y catálogos juntos; después iniciar las consultas que necesitan ese contexto.
4. Generador: iniciar contexto junto con sus catálogos, evitando la consulta tardía.
5. Sesión/marcas: deduplicación dentro de un render y reutilización de la misma proyección cuando los campos/filtros sean equivalentes.

No ejecutar consultas privadas antes de comprobar autorización. La futura resolución de tenant debe completarse antes de arrancar consultas que dependan de él. Tampoco trasladar decenas de consultas a un `Promise.all` sin observar si el pool y la DB pueden absorberlo.

### O04 — Hacer que abrir una pantalla sea una lectura

En Tareas, [asegurarColumnasIniciales](<C:/Users/YONELIA/Desktop/intia-main/src/app/actions/tasks.ts:21>) lee y puede crear columnas durante el render. Además de H03 de la auditoría, añade trabajo previo a la consulta real del tablero. Crear las columnas durante el alta de la organización/tablero o mediante una acción explícita autenticada e idempotente. La pantalla debe poder representar un tablero aún vacío sin escribir.

En Ajustes, [getFeedToken](<C:/Users/YONELIA/Desktop/intia-main/src/lib/ical.ts:20>) genera y guarda un token si falta. Separar lectura del token de la operación explícita de habilitar/renovar el calendario, conservando los enlaces ya existentes. El [recuento de ejemplo](<C:/Users/YONELIA/Desktop/intia-main/src/app/actions/datos-de-ejemplo.ts:40>) realiza varias fases y conteos; pedirlo al abrir la revisión de limpieza, manteniendo la vista previa y confirmación ya exigidas antes del borrado.

Estas correcciones deben preceder a cualquier precarga completa manual de esas páginas. Precargar puede ejecutar su código de render y anticipar sus efectos. No activar `prefetch={true}` indiscriminadamente en las 14 entradas de la barra: adelantar toda esa carga puede aumentar consultas sin que el usuario visite los destinos. Evaluar precarga selectiva por intención solo después de medir el comportamiento predeterminado con límites de carga. [Efectos secundarios y coste de la precarga](https://nextjs.org/docs/15/app/guides/prefetching#triggering-unwanted-side-effects-during-prefetching).

### O05 — Reducir filas leídas y datos transferidos

- **Contenido:** obtener suma de vistas por video en DB para los identificadores de la página. Comparar un agregado adicional frente al coste de transferir todas las métricas; una consulta adicional pequeña puede ser mejor que una relación histórica grande.
- **Métricas:** calcular el resumen del periodo anterior en DB; construir series por día y detalle paginado para el actual. Preservar filtros, zona horaria y denominadores. Resolver H07/H08 antes de fijar agregados persistentes.
- **Tareas:** filtrar en DB conforme a la semántica de marca/global del tablero y paginar tarjetas por columna. Mantener visibilidad de columnas compartidas y comprobar orden/reordenamiento al no cargar todas las tarjetas.
- **Equipo:** agrupar funciones y contar videos distintos por persona. Un simple `count` de asignaciones cuenta doble cuando alguien tiene dos funciones en un video; debe conservarse el significado del `Set` actual.
- **Bibliotecas:** paginar Guiones y Arquetipos y cargar texto extenso al abrir la ficha. No limitar filas silenciosamente sin ofrecer acceso al resto.

Después, obtener planes de ejecución sobre un entorno de pruebas representativo. Elegir índices según los filtros y ordenamientos medidos, incluyendo el futuro `tenantId` en los accesos privados. La auditoría principal contiene candidatos; no se proponen índices nuevos como solución demostrada del segundo actual.

### O06 — Revisar despliegue y conexiones según las trazas

Verificar región de ejecución de funciones y región de la DB; localizar dónde está el tiempo de red. Revisar endpoint del pool, límites por instancia y totales, esperas y posible suspensión/activación de DB. Comparar primera visita tras inactividad con varias visitas consecutivas.

Si todas las páginas tienen una espera parecida incluso con pocos datos, priorizar las fases comunes y la distancia entre aplicación y DB. Si crece con los registros o afecta sobre todo a Métricas/Tareas, priorizar volumen y planes de consulta. Un primer acceso lento seguido de accesos rápidos es compatible con un arranque o caché, pero no demuestra cuál sin trazas.

Conservar el cliente Prisma reutilizado por proceso. No abrir un cliente nuevo por consulta ni ejecutar `$disconnect` al terminar cada petición. Los límites adecuados del pool dependen del despliegue real; no se fija un valor arbitrario en este informe.

### O07 — Caché persistente solo con alcance e invalidación definidos

Evaluarla para catálogos y agregados que toleren una antigüedad acordada, después de O03/O05 y de resolver el modelo multitenant. Especificar clave, alcance, permisos y eventos de invalidación. Ejemplo conceptual: organización + marca + filtros normalizados + versión del agregado; añadir usuario/permisos si el resultado varía entre miembros.

La cookie de marca es un filtro de interfaz, no una autorización. No cachear páginas privadas únicamente por URL, no compartir sesiones entre usuarios y no aplicar `force-static` para esconder el coste de consultas protegidas. Verificar cambio de marca, cierre de sesión, baja de usuario y cambios de membresía antes de habilitar reutilización entre peticiones.

## Entregas y criterios de aceptación

Son unidades propuestas de implementación, no cambios ya desplegados. El esfuerzo es relativo: pequeño, medio o grande respecto al resto de este proyecto; falta información para comprometer horas.

| Entrega | Alcance | Esfuerzo | Evidencia para cerrar |
|---|---|---|---|
| A. Referencia de rendimiento | Trazas y condiciones de comparación | Pequeño/medio | Separación de clic, respuesta, consultas y contenido visible por ruta |
| B. Navegación visible | `loading.tsx` por sección y pendiente en `shell.tsx` | Pequeño | La interfaz responde; barra utilizable; navegación rápida/cancelada y errores correctos |
| C. Consultas comunes | Memoización de render, Marcas, Contenido, Actividad, Generador | Medio | Menos lecturas duplicadas/tandas; mismos datos, filtros y permisos |
| D. Lecturas sin efectos | Inicialización de tablero/token y recuento de limpieza bajo demanda | Medio | Abrir/precargar páginas no escribe; inicialización segura y sin duplicados |
| E. Volumen de datos | Métricas, Contenido, Equipo, Tareas, bibliotecas | Medio/grande | Filas/bytes acotados por vista; resultados y orden correctos con mucho historial |
| F. Infraestructura/caché | Región, pool e índices; caché acotada si procede | Según medición | Mejora sostenida sin saturación, datos obsoletos indebidos ni accesos cruzados |

Objetivos iniciales para acordar sobre condiciones representativas:

- Respuesta visual al clic: p95 menor de 100 ms en navegación con la aplicación ya cargada. Puede ser señal pendiente o esqueleto, no necesariamente todos los datos.
- Contenido principal utilizable en páginas frecuentes: objetivo inicial p95 menor de 500 ms en visitas con recursos ya cargados y carga habitual. **No es un resultado medido ni una garantía**; revisar tras la referencia.
- Registrar visitas iniciales y tras inactividad por separado. No ocultarlas dentro de un promedio de accesos rápidos.
- Mantener resultados, permisos, enlaces, filtros y estado de marca. No aumentar de forma injustificada operaciones DB por sesión al incorporar precarga.

## Protocolo de validación de la web publicada

1. Confirmar versión desplegada y abrir una sesión de prueba autorizada. Usar la misma cuenta, marca y datos antes/después. No usar scripts de seed, limpieza ni `test:humo` contra producción para esta medición.
2. Registrar una traza inicial de navegación entre Panel, Contenido, Calendario, Marcas y Métricas. Excluir inicialmente Tareas/Ajustes de un recorrido estrictamente de lectura, por sus inicializadores actuales. No generar guiones ni editar registros.
3. En DevTools Network identificar solicitudes del segmento React, normalmente con `_rsc`, y archivos JS/CSS. Separar solicitud de navegación de solicitudes de precarga. Medir inicio, primer byte, fin y tamaño; una respuesta en streaming puede comenzar pronto y completar el contenido bastante después.
4. En Performance correlacionar el clic con la primera señal visual y el contenido principal. Registrar tareas largas si la red terminó y la pantalla sigue sin actualizar. INP es complementario: una buena respuesta visual no demuestra que los datos hayan llegado.
5. Hacer unas pocas transiciones supervisadas en producción para reproducir; realizar la comparación sistemática en preview/staging. Obtener al menos 30 muestras por ruta y condición para una referencia exploratoria de mediana/p95, conservando tiempos individuales; una muestra pequeña no caracteriza bien la cola. Alternar rutas para evitar confundir visitas consecutivas a la misma URL con navegación real.
6. Separar entrada directa, navegación con recursos cargados, primera visita tras inactividad y vuelta después de cambiar datos. Medir el comportamiento normal de caché; usar caché desactivada solo como condición diagnóstica independiente.
7. Correlacionar las muestras lentas con trazas de aplicación/DB. Concurrencia y grandes volúmenes se prueban en staging, aumentando usuarios/datos por separado, sin lanzar una prueba de carga sobre producción.
8. Tras cada entrega comparar tiempos, errores, operaciones por navegación, filas/bytes y comportamiento. Si la señal visual mejora pero los datos siguen tardando, registrar ambas cosas y continuar con consultas/infraestructura.

Plantilla de registro — celdas pendientes, no resultados:

| Versión / ruta / condición | Muestras | Clic → señal p95 | Clic → contenido p50/p95 | Primer byte / fin RSC | Operaciones / filas / bytes | Errores |
|---|---|---|---|---|---|---|
| Antes | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente |
| Después | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente | Pendiente |

Validar además inicio/cierre de sesión, usuario inactivo, OWNER/MEMBER, marca concreta/Todas, paginación fuera de rango, resultado vacío, error de servidor, volver/avanzar y navegación móvil/teclado. Al introducir tenants, añadir dos organizaciones y cambios de membresía a esta matriz.

## Relación con el plan multitenant

Las entregas A–D permiten mejorar el uso del equipo actual sin esperar toda la migración SaaS. E reduce el coste que pagaría cada organización al crecer. F exige revisar cuidadosamente el aislamiento cuando incluya cachés compartidas.

La mejora de navegación no cierra los hallazgos de seguridad e integridad H01–H19. Mantener la corrección de borrados indebidos, archivos activos, autenticación del inicializador, CSV y sesiones en el plan prioritario de la auditoría. Ninguno de los objetivos de velocidad justifica retirar controles de acceso ni permitir que un cliente consulte datos de otro.
