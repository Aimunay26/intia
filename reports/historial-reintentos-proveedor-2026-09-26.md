# Historial accesible y elección de proveedor para reintentos

Fecha: 26/09/2026 (Perú). Implementado y validado localmente. Sin migraciones; despliegue productivo pendiente de comprobar.

## Recorrido

1. Abrir **Generaciones** en el menú. También existe **Guiones → Guiones no generados**, que abre directamente el filtro.
2. Elegir **Con guiones no generados** para ver intentos fallidos, parciales o cancelados con formatos sin guion guardado.
3. Abrir **Revisar y reintentar**, revisar los errores y seleccionar **Claude** o **Gemini**.
4. Pulsar **Reintentar guion no generado** o **Reintentar N guiones no generados**. Se abre el avance del nuevo trabajo.

La biblioteca conserva los guiones terminados; no se regeneran. Cada intento anterior conserva su diagnóstico. Si ya existe un reintento, aparece **Ver reintento** con su estado en el historial. Si ese sucesor también falla, puede reintentarse desde su propio detalle.

## Proveedor, permisos y datos

- El selector empieza con el proveedor del pedido. Las opciones sin clave compartida aparecen deshabilitadas; el Dueño puede configurarlas desde Ajustes y los demás usuarios reciben una indicación para solicitarlo.
- Mantener el proveedor conserva el modelo explícito del pedido. Si no había modelo explícito, se resuelve con la configuración vigente, como antes.
- Cambiar de proveedor usa su modelo predeterminado de Ajustes o catálogo. Se fija en el nuevo pedido para impedir heredar un modelo incompatible del proveedor anterior o del formato.
- El backend valida la opción y comprueba disponibilidad de clave antes de crear el nuevo trabajo. Tener una clave configurada no certifica su validez ni saldo; el proveedor puede rechazarla al ejecutar.
- El pedido y sus opciones se conservan. Las referencias y claves se leen con la configuración actual.
- Historial propio con paginación de 20 trabajos, incluso para Dueño; se mantiene el alcance por marcas y los permisos vigentes. Los accesos solo aparecen para perfiles con `scripts.generate`.
- Idempotencia y bloqueo transaccional conservados: doble clic genera un solo sucesor. Dos pestañas con distintos proveedores no cambian silenciosamente la elección ni crean dos trabajos; la segunda recibe un aviso y el acceso al reintento existente.
- Se mantienen la validación de sesión, el límite de trabajos activos, las comprobaciones de destino y los errores públicos controlados. El cambio de proveedor no omite la autorización ni la telemetría de IA.
- El detalle recibe solo proveedor/modelo solicitados y nombres de formato como metadatos nuevos. No recibe el payload original ni credenciales. La comprobación de disponibilidad no descifra claves.
- Los fallos históricos permanecen visibles aunque un sucesor se complete. El filtro representa intentos con fallos, no un contador de trabajo pendiente sin resolver.

## Validación

- TypeScript, ESLint y compilación de producción correctos. Se mantiene el aviso existente de dependencia dinámica de Workflow/`@vercel/queue`.
- 152 pruebas unitarias/CTA aprobadas.
- 35 pruebas reportadas en PostgreSQL local efímero, incluido el contenedor de suite. Cubren cambio y retorno de proveedor, conservación de pedido/modelo, claves ausentes, entrada inválida, carreras con distintos proveedores, un solo sucesor, permisos, paginación, filtros, estado público sin prompt ni secretos y despacho posterior al registro. Conservan la cobertura previa de guiones parciales, sesiones revocadas y vínculos protegidos.
- Cinco comprobaciones de interfaz aprobadas sobre Next compilado, PostgreSQL y Workflow locales; respuestas de Claude y Gemini simuladas y red externa bloqueada en el proceso. Dueño reintenta con Claude y Guionista con Gemini: ambos crean y guardan únicamente el formato faltante. Se verifican acceso desde biblioteca, filtro, menú activo, conservación del original y acceso denegado a trabajos ajenos. Producción no recibe accesos al generador/reintento. Revisión a 390 y 1440 px, sin desbordamiento horizontal en el selector ni errores del navegador.

No se realizaron llamadas reales a proveedores ni modificaciones en Neon/Vercel. Evidencia local en `.audit/generation-history-*.log`, capturas y `.audit/generation-history-ui-report.json` (ignorados por Git).
