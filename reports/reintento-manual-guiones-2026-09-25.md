# Reintentar los guiones no generados

Fecha: 25/09/2026 (Perú). Implementado y validado localmente; activación productiva pendiente de comprobar. No requiere migración de Neon.

Actualización del 26/09: se añadió acceso desde el menú y la biblioteca, filtro de fallos y selección de Claude/Gemini al reintentar. El comportamiento actual y sus verificaciones están en [Historial y proveedor de reintento](historial-reintentos-proveedor-2026-09-26.md); este documento conserva el alcance y resultados de la implementación inicial.

## Uso

En **Generador IA → Mis generaciones → detalle**, al terminar un trabajo con guiones faltantes aparece **Reintentar guion no generado** o **Reintentar N guiones no generados**. Incluye fallidos y cancelados que no tengan un guion persistido. No aparece mientras el trabajo sigue en curso ni cuando todo está generado.

Al pulsarlo se registra un trabajo nuevo y se abre su avance. El anterior conserva sus guiones, errores, intentos y diagnóstico. Su botón se convierte en **Ver reintento**; volver a pulsar desde una pestaña antigua abre el mismo sucesor. Si ese nuevo trabajo falla, puede reintentarse desde su propia pantalla. El botón se desactiva durante el envío.

El reintento usa el mismo pedido, proveedor, modelo elegido y opciones de contenido; las referencias y configuración se leen de nuevo. No vuelve a generar los éxitos. Si ya se había generado parte del lote, los nuevos guiones quedan independientes en la biblioteca y se conserva el vínculo anterior con el video. Si no se generó ninguno, se vuelve a validar el destino; un video ocupado, fuera de alcance o cerrado no se sobrescribe.

## Garantías del backend

- `retryFailedGeneration` exige permiso y alcance del trabajo; valida la sesión en transacción, bloquea el origen y reutiliza el encolado validado. El sucesor pertenece al usuario que solicita el reintento, con su versión de sesión vigente.
- Un ID opaco derivado del origen permite consultar por clave primaria y asegura un único sucesor incluso con solicitudes simultáneas de distintos usuarios. Quien no tenga acceso al sucesor recibe un aviso sin su contenido.
- Se comprueban el interruptor de IA, dos trabajos activos como máximo, catálogo, formatos activos, marca, persona y vínculo de destino. No se reconstruye un pedido eliminado por retención.
- Los elementos parten con cero intentos y tienen los tres intentos normales, incluido el descenso de Gemini por saturación. Las peticiones reales siguen pasando por autorización, telemetría y plazos.
- La auditoría enlaza el nuevo trabajo con el anterior y el payload interno guarda `retryOfJobId`. Los errores y la traza `manual_retry` no exponen contenido privado del proveedor o de la DB.
- Workflow se despacha después de confirmar la transacción. Ante envío incierto, repetir la acción conserva la misma solicitud. Las concesiones del trabajo anterior nunca se reciclan.
- La pantalla de avance se vuelve a montar al cambiar de ID, para no mostrar el progreso del trabajo anterior después de navegar.

## Validación

- `npm test`: 148 pruebas aprobadas (137 unitarias y 11 CTA).
- PostgreSQL local efímero: 31 pruebas reportadas aprobadas, incluido el contenedor de suite. Seis casos nuevos cubren reintento parcial, cuatro envíos concurrentes, conservación de historia/vínculo, cancelación, encadenamiento, permisos/sesiones, datos eliminados, formatos inactivos, límite de pendientes y despacho con errores seguros.
- `npm run typecheck`, `npm run lint`, `npm run build`: correctos. El build conserva el aviso de dependencia dinámica de `@vercel/queue`/Workflow.
- Navegador local sobre Next compilado y Workflow local real: clic desde un lote parcial abre un sucesor con solo el formato faltante, monta el avance con el nuevo ID y muestra 0/1; al volver, conserva el guion completado y ofrece «Ver reintento». Comprobación a 390 px sin desbordamiento horizontal ni errores del navegador. Cero peticiones de IA: claves ausentes y bloqueo de red externa en el proceso de prueba. Historial original y recuento de guiones verificados en DB.

Datos ficticios y proveedores simulados; sin cambios en Neon ni llamadas reales a IA. Logs locales ignorados por Git: `.audit/manual-retry-*.log`.
