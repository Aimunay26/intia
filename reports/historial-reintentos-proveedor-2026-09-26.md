# Pendientes únicos, paginación y elección de proveedor para reintentos

Fecha: 26/09/2026 (Perú). Implementado y validado localmente. Sin migraciones; despliegue productivo pendiente de comprobar.

## Recorrido

1. Abrir **Generaciones** en el menú. También existe **Guiones → Guiones no generados**, que abre directamente el filtro.
2. La vista **Generaciones pendientes** muestra una tarjeta por solicitud. **Por reintentar** incluye fallos, parciales y cancelados; **Todos los pendientes** también incluye solicitudes en proceso.
3. Abrir **Revisar y reintentar**, revisar los errores y seleccionar **Claude** o **Gemini**.
4. Pulsar **Reintentar guion no generado** o **Reintentar N guiones no generados**. Se abre el avance del nuevo trabajo.

Solo aparecen los formatos aún sin guion. Los intentos anteriores se sustituyen en la lista por el intento vigente. Cuando se completa el último formato, la solicitud desaparece; los guiones quedan en la biblioteca. Si vuelve a fallar, se reintenta desde esa misma tarjeta, sin entradas adicionales por cada error.

La lista presenta **20 solicitudes únicas por página**, **Anterior**, **Siguiente**, número de página y total de solicitudes. La agrupación y exclusión de completados ocurren antes de paginar. Al desaparecer los últimos pendientes de una página, se usa la última página válida. Los enlaces conservan el filtro elegido. Si hay trabajos activos en la página visible, se actualiza cada 8 segundos y se detiene al completarse o mientras la pestaña esté oculta.

## Proveedor, permisos y datos

- El selector empieza con el proveedor del pedido. Las opciones sin clave compartida aparecen deshabilitadas; el Dueño puede configurarlas desde Ajustes y los demás usuarios reciben una indicación para solicitarlo.
- Mantener el proveedor conserva el modelo explícito del pedido. Si no había modelo explícito, se resuelve con la configuración vigente, como antes.
- Cambiar de proveedor usa su modelo predeterminado de Ajustes o catálogo. Se fija en el nuevo pedido para impedir heredar un modelo incompatible del proveedor anterior o del formato.
- El backend valida la opción y comprueba disponibilidad de clave antes de crear el nuevo trabajo. Tener una clave configurada no certifica su validez ni saldo; el proveedor puede rechazarla al ejecutar.
- El pedido y sus opciones se conservan. Las referencias y claves se leen con la configuración actual.
- Pendientes propios con paginación de 20 solicitudes únicas, incluso para Dueño; se mantiene el alcance por marcas y los permisos vigentes. Los accesos solo aparecen para perfiles con `scripts.generate`.
- Idempotencia y bloqueo transaccional conservados: doble clic genera un solo sucesor. Dos pestañas con distintos proveedores no cambian silenciosamente la elección ni crean dos trabajos; la segunda recibe un aviso y el acceso al reintento existente.
- Se mantienen la validación de sesión, el límite de trabajos activos, las comprobaciones de destino y los errores públicos controlados. El cambio de proveedor no omite la autorización ni la telemetría de IA.
- El detalle recibe solo proveedor/modelo solicitados y nombres de formato como metadatos nuevos. No recibe el payload original ni credenciales. La comprobación de disponibilidad no descifra claves.
- Una cadena completada ya no aparece en ninguno de los dos filtros. Los reintentos solo cuentan una vez, aunque el pedido anterior haya sido redactado por retención. Dos pedidos independientes con el mismo texto siguen siendo solicitudes diferentes.
- Los recibos técnicos de ejecución y auditoría permanecen internos para impedir dobles despachos y mantener los vínculos de los guiones. Esta vista no añade copias de pedidos ni borra guiones o sus relaciones. Solo consulta el intento vigente y los formatos pendientes.
- Conteo, exclusión de ancestros y paginación en PostgreSQL con parámetros y los índices existentes de usuario, trabajos, elementos y guiones. La consulta de tarjetas usa la misma instantánea que el total; se leen hasta 20 tarjetas sin enviar payloads al navegador. No requiere migración ni limpieza productiva.

## Validación inicial de selector (antes del ajuste de pendientes)

- TypeScript, ESLint y compilación de producción correctos. Se mantiene el aviso existente de dependencia dinámica de Workflow/`@vercel/queue`.
- 152 pruebas unitarias/CTA aprobadas.
- 35 pruebas reportadas en PostgreSQL local efímero, incluido el contenedor de suite. Cubren cambio y retorno de proveedor, conservación de pedido/modelo, claves ausentes, entrada inválida, carreras con distintos proveedores, un solo sucesor, permisos, paginación, filtros, estado público sin prompt ni secretos y despacho posterior al registro. Conservan la cobertura previa de guiones parciales, sesiones revocadas y vínculos protegidos.
- Cinco comprobaciones de interfaz aprobadas sobre Next compilado, PostgreSQL y Workflow locales; respuestas de Claude y Gemini simuladas y red externa bloqueada en el proceso. Dueño reintenta con Claude y Guionista con Gemini: ambos crean y guardan únicamente el formato faltante. Se verifican acceso desde biblioteca, filtro, menú activo, conservación del original y acceso denegado a trabajos ajenos. Producción no recibe accesos al generador/reintento. Revisión a 390 y 1440 px, sin desbordamiento horizontal en el selector ni errores del navegador.

No se realizaron llamadas reales a proveedores ni modificaciones en Neon/Vercel. Evidencia local en `.audit/generation-history-*.log`, capturas y `.audit/generation-history-ui-report.json` (ignorados por Git).

## Validación del ajuste de pendientes y paginación

- TypeScript, ESLint y compilación de producción correctos; se mantiene el aviso previo de Workflow.
- 42 pruebas de modelos, permisos y navegación aprobadas.
- PostgreSQL local efímero: 36 pruebas reportadas aprobadas, incluida la suite. Casos nuevos con tres formatos, éxitos parciales, tres reintentos y posterior éxito; desaparición completa de la cadena; payloads antiguos redactados; dos pedidos independientes; reintento asumido por Dueño; permisos de marcas; conteo real de 23 solicitudes; paginación después del filtro y reajuste de páginas vacías.
- Siete comprobaciones de navegador aprobadas sobre Next y Workflow locales, con respuestas de IA simuladas. Verificadas páginas de 20 + 1 solicitudes sin duplicar una cadena de tres intentos, filtro conservado al avanzar/retroceder, última página ajustada tras resolver su pendiente, desaparición automática de un activo sin recargar, selector Claude/Gemini, biblioteca y permisos. Revisión móvil de 390 px y escritorio de 1440 px sin errores de navegador ni desbordamiento horizontal en el paginador.
- Evidencia de esta revisión en `.audit/generation-pending-*.log` y capturas locales; no cambia datos de producción ni consume IA real.
