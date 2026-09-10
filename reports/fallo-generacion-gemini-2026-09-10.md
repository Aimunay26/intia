# Generación Gemini: errores HTTP y recuperación

El trabajo de producción del 10 de septiembre, iniciado a las 14:39 UTC,
terminó tras unos 172 segundos con un solo intento y el mensaje
«Falló la generación con Gemini». No guardó respuesta ni creó un guion.
Los logs de Vercel confirman la ejecución del Workflow, pero no conservaron
el error original del proveedor. Consultar el modelo mediante `models.get`
no acredita que una generación completa funcione.

## Fallo confirmado

En la versión instalada de `@google/genai` (1.52.0), especificar
`httpOptions.retryOptions`, incluso con `attempts: 1`, activa un envoltorio
que convierte respuestas HTTP fallidas en errores sin `status` ni cuerpo.
La aplicación perdía así el motivo de rechazo y no reconocía como
reintentables los errores 429/5xx.

Se elimina esa opción en generación y comprobación de clave. En esta versión,
su ausencia realiza un solo `fetch` y conserva el `ApiError`. Los reintentos
siguen bajo el control del trabajo, con un máximo de tres intentos y reserva
de cuota por cada llamada. No se amplían cuotas ni se habilita facturación.

También se reconocen abortos y timeouts del transporte. Los fallos del trabajo
registran identificadores, intento, decisión de reintento, proveedor y código
HTTP o código de transporte permitido. No registran claves, prompts,
respuestas ni mensajes crudos del SDK.

## Validación y límites

- Regresión con el SDK real y transporte HTTP simulado: 400, 401, 403, 404,
  429, 500, 503 y 504 conservan su clasificación, con una petición cada uno.
- Abortos y timeouts son recuperables; el diagnóstico no incluye secretos.
- Compilación, tipos y lint sin errores; subsisten advertencias anteriores.
- La causa HTTP exacta del incidente original no puede reconstruirse a partir
  del mensaje guardado. La reproducción con el pedido real está pendiente de
  confirmación específica tras el bloqueo de la revisión automática.
- No se afirma todavía una generación real satisfactoria ni una reducción
  medida del tiempo de generación.
