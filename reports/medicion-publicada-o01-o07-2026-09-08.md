# Publicación y medición supervisada O01–O07

Fecha local: 8 de septiembre de 2026, America/Lima. Publicación autorizada por el usuario después del diagnóstico de Neon.

## Versión publicada

- Código: `739ace1ac8a15be25c7d72ed8006d4d5e8cd5e67`, rama main, subido a GitHub.
- [Despliegue de Vercel](https://vercel.com/conamors-projects/intia/54WSggLA9GHb4c7oBVzAxM5axxZT): Ready, compilación de 59 segundos, finalizada a las 18:54:49 de Lima.
- Dominio de producción confirmado: [intia](https://intia-lovat.vercel.app/).
- La instrumentación del navegador devolvió `release: 739ace1ac8a1`, confirmando la versión servida por el dominio.
- Sin migraciones, semillas, nuevas variables, cambios de plan/región/pool ni activación de la caché persistente. El diagnóstico del navegador se activó con `?medir=1` para la pestaña de prueba.

El lote había pasado tipado, build, 18 pruebas unitarias y siete comprobaciones de integración con PostgreSQL real (ocho pruebas contadas por Node, incluyendo la contenedora). Vercel también completó el build. La suite local no se ejecutó contra producción.

## Navegación habitual

Sesión existente de dueño, Todas las marcas, filtros predeterminados, navegador de escritorio de Codex en Windows. Tres recorridos consecutivos por Panel → Métricas → Tareas → Videos → Calendario → Panel. Quince clics entre 18:55:32 y 18:56:56, con aplicación ya cargada. No se impuso latencia ni carga concurrente artificial.

| Destino | Muestras | Señal visual, mediana | Ruta cambiada, mediana | Primer bloque, mediana | Todo listo, mediana | Todo listo, mínimo–máximo |
|---|---:|---:|---:|---:|---:|---:|
| Métricas | 3 | 2,3 ms | 16,2 ms | 570,7 ms | 580,9 ms | 541,7–581,9 ms |
| Tareas | 3 | 2,3 ms | 16,1 ms | 550,3 ms | 557,4 ms | 471,8–598,1 ms |
| Videos | 3 | 2,7 ms | 10,2 ms | 565,3 ms | 575,7 ms | 466,0–582,8 ms |
| Calendario | 3 | 2,3 ms | 17,0 ms | 565,2 ms | 572,8 ms | 433,4–578,5 ms |
| Panel | 3 | 2,6 ms | 16,9 ms | 315,3 ms | 618,5 ms | 326,7–631,9 ms |

Las 15 muestras terminaron como `complete`; ninguna como error, timeout o cancelación. La consola del navegador no mostró errores ni avisos durante el recorrido. También se abrieron Equipo y Personas y se volvió al Panel: encabezados correctos, sin pantalla de error. Esas tres comprobaciones funcionales quedan fuera de la tabla para conservar tres muestras por ruta.

Evidencia: [JSON de los 15 clics](./navegacion-produccion-2026-09-08-habitual.json). Se reproduce el resumen con `npm run perf:resumen -- reports/navegacion-produccion-2026-09-08-habitual.json`. El script calcula p95 matemáticamente, pero con tres observaciones coincide con el máximo: **no representa un p95 fiable de usuarios reales**.

El cronómetro observa cambios DOM y frames: señal pendiente/esqueleto, cambio de ruta, primer bloque marcado y ausencia de estados de carga durante dos frames. No mide directamente píxeles pintados, INP, descarga de imágenes ni TTFB. La entrada inicial por recarga no forma parte de esta serie. No se clasifican las muestras como servidor/DB calientes comprobados: son navegación continua y pueden intervenir precarga, caché de rutas e instancias distintas.

## Evidencia de Vercel

Consulta de Runtime Logs filtrada por el despliegue nuevo, ventana de 30 minutos. Los contadores visibles de Warning, Error y Fatal eran cero; las peticiones revisadas devolvieron HTTP 200. No equivale a una garantía de ausencia de errores fuera de esa ventana.

| Petición RSC revisada | Hora de Vercel en Lima | Ejecución de función | Response finished | Memoria |
|---|---|---:|---:|---:|
| Panel `/`, referer Personas | 18:57:26,637 | 88 ms | 268 ms | 231 MB |
| Métricas, referer Panel con diagnóstico | 18:55:31,581 | 250 ms | 377 ms | 229 MB |
| Tareas, referer Métricas | 18:55:41,410 | 137 ms | 268 ms | 229 MB |
| Videos, referer Tareas | 18:55:49,769 | 132 ms | 259 ms | 228 MB |
| Calendario, referer Videos | 18:55:58,744 | 83 ms | 228 ms | 233 MB |

Las cinco entraron por São Paulo (`gru1`) y se ejecutaron en Washington (`iad1`). Es una observación del recorrido de estas solicitudes, no una razón suficiente para mover la función lejos de Neon en us-east-1. La interfaz de Vercel distingue ejecución y finalización de respuesta; ninguno de esos campos es el tiempo completo clic→contenido del navegador.

Los relojes de navegador y logs muestran aproximadamente un segundo de diferencia. No se restaron timestamps entre ambos sistemas ni se atribuyó esa diferencia a latencia. La asociación es aproximada por ruta, referer, secuencia y versión; la instrumentación aún no propaga un identificador común cliente/servidor.

Los registros incluyen lecturas de fichas que no se abrieron manualmente, compatibles con la precarga de enlaces de Next. No se identificó cada solicitud por su cabecera de prefetch y no se atribuye todo el tráfico exclusivamente al recorrido manual. La ausencia de trazas en External APIs tampoco implica ausencia de consultas PostgreSQL. No se activó `PERFORMANCE_LOGS` en producción, por lo que esta sesión no aporta duraciones por operación Prisma.

## Acceso tras inactividad

El último clic previo fue a las 18:57:27,585 del reloj del navegador. Se dejó la aplicación sin navegar ni ejecutar SQL en Neon durante más de cinco minutos. Luego se abrió únicamente la vista Computes de la consola: mostraba **SUSPENDED**. Después de la navegación se volvió a leer esa vista y mostraba **ACTIVE**. No se pulsó Connect ni se forzó la suspensión/activación desde la consola.

El primer clic Panel → Métricas quedó registrado a las 19:04:11,997, aproximadamente 6 minutos y 44 segundos después del clic anterior. La espera de la herramienta de automatización antes de entregar el clic no se interpreta como latencia del sistema: se usan los tiempos del componente en el navegador.

| Condición de Panel → Métricas | Muestra | Señal visual | Ruta | Primer bloque | Todo listo |
|---|---:|---:|---:|---:|---:|
| Primera navegación después de observar Neon suspendido | 19 | 1,7 ms | 447,4 ms | 1667,8 ms | 1676,3 ms |
| Repetición, después de observar Neon activo | 22 | 2,0 ms | 15,2 ms | 800,1 ms | 811,2 ms |

La petición RSC de Métricas revisada en Vercel a las 19:04:11,480 devolvió 200, ejecución de 760 ms, respuesta finalizada en 942 ms y memoria de 244 MB, de nuevo por gru1→iad1. No contiene el desglose de adquisición de conexión, reactivación y consultas. Además se ven otras lecturas alrededor del acceso, compatibles con precarga. **La transición suspendido→activo se observó; el coste exclusivo de reactivar Neon no quedó aislado.** La repetición tampoco vuelve exactamente al rango de la serie inicial: una pareja de observaciones no demuestra un ahorro fijo.

Evidencia íntegra de ese tramo: [JSON de pausa y repetición](./navegacion-produccion-2026-09-08-pausa.json). Las condiciones no deben mezclarse al calcular percentiles. Incluye dos pasos intermedios: muestra 21, vuelta al Panel completada en 678,1 ms; muestra 20, registrada como timeout por el cronómetro. En la muestra 20 la automatización pulsó Panel y volvió a pulsar Métricas antes de que la ruta cambiara. La página terminó en Métricas sin pantalla de error; el registro de Panel fue HTTP 200. El detector omitió el segundo clic porque apuntaba a la ruta que aún estaba activa y dejó vencer la medición anterior. **Es una limitación de clasificación del diagnóstico, no evidencia de una espera real de 30 segundos del backend.** Se conserva la muestra y se excluye de las comparaciones de carga completa. La repetición siguiente esperó explícitamente a que Panel terminara antes de pulsar Métricas.

No hubo errores ni avisos de consola durante este tramo. Es una sola pausa supervisada, sin control sobre toda actividad de otros usuarios o procesos; no caracteriza la frecuencia ni la cola de arranques fríos.

## Interpretación y siguiente optimización

La respuesta de la barra es inmediata en esta muestra. Los datos siguen necesitando aproximadamente medio segundo en varias rutas: **no se acredita todavía el objetivo de contenido p95 menor de 500 ms**, ni un porcentaje de mejora frente a la versión anterior. Falta una referencia equivalente instrumentada de esa versión.

1. Conservar las mejoras publicadas y ampliar la comparación en staging representativo, al menos 30 muestras por ruta/condición. Separar navegación continua, historial, entrada inicial y accesos tras pausas.
2. Capturar Network/Performance y fases del servidor en una ventana controlada para localizar el tiempo restante. Correlacionar las peticiones antes de cambiar límites de conexión o activar caché.
3. Revisar cuántas lecturas generan las precargas de enlaces en listados. Evaluar limitar la precarga de fichas pesadas o activarla por intención, comparando navegación a la ficha y coste total; no deshabilitarla globalmente sin medir el efecto.
4. Mantener diferidos los índices candidatos y la caché persistente con el volumen actual. Los resultados no justifican por sí solos ampliar el plan de Neon/Vercel.
5. Endurecer la clasificación de cancelaciones del cronómetro: un clic que vuelve a la ruta todavía activa durante otra navegación debe cerrar la muestra anterior como cancelada. Mientras tanto, separar estos controles de navegación de las muestras de carga.

Este seguimiento valida la publicación y un recorrido supervisado; no cierra la aceptación completa O01/O06 ni convierte el sistema en multitenant. Estado detallado y límites en [Implementación O01–O07](./implementacion-o01-o07-2026-09-08.md).
