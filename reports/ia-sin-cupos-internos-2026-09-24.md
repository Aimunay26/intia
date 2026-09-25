# IA sin cupos internos de consumo

Fecha: 24/09/2026 (Perú). Estado: implementado y validado localmente; despliegue productivo pendiente de comprobar. No requiere migración de Neon.

## Decisión y comportamiento

El usuario pidió retirar los límites internos y avisar cuando la API deje de responder por agotamiento del nivel gratuito o necesidad de facturación.

- Retirados los límites personales/globales de llamadas, trabajos por día, despachos diarios/móviles y mejora de un documento una vez por día. Las cinco variables históricas `AI_DAILY_CALLS`, `AI_USER_DAILY_CALLS`, `AI_DAILY_JOBS`, `AI_DAILY_DISPATCHES` y `AI_32D_DISPATCHES` ya no tienen efecto, incluso si conservan valores en el entorno.
- Retirado «Cupo de IA de hoy» de Ajustes y Generador. Actualizada la ayuda de importación documental.
- `UsageCounter` registra peticiones, trabajos y despachos sin imponer cuotas de IA. Los registros existentes se conservan. La transacción revalida autorización antes de registrar y enviar una petición.
- Se mantienen el interruptor de IA, autenticación, permisos, idempotencia, máximo de dos trabajos activos por usuario, tres estructuras por lote, plazo compartido, tokens de salida y hasta tres intentos ante errores transitorios. Los límites de almacenamiento no cambian.

## Avisos del proveedor

| Evidencia recibida | Aviso / acción | Reintento automático |
|---|---|---|
| Cuota diaria explícita del nivel gratuito | Se agotó la cuota diaria gratuita; usar un proyecto de API con facturación y actualizar su clave en Ajustes, o esperar renovación | No |
| Cuota gratuita cero o nivel gratuito no disponible | No hay cuota gratuita para esta petición; revisar proyecto/modelo y usar API con facturación | No |
| Saldo insuficiente, HTTP 402 o límite de gasto alcanzado | Revisar saldo, facturación y límite de gasto del proveedor | No |
| Cuota diaria del proyecto sin evidencia de nivel gratuito | Esperar renovación o revisar límites; no afirmar que es el plan gratuito | No |
| Límite por minuto / peticiones temporales | Esperar y reintentar; no atribuirlo a agotamiento del plan gratuito | Sí, hasta el máximo técnico del trabajo |
| HTTP 429 sin causa precisa | El proveedor limitó la petición; revisar cuota/facturación si persiste, sin afirmar una causa no confirmada | Sí, acotado |

La clasificación procesa campos conocidos del error con límites de tamaño/profundidad. La interfaz y los logs reciben mensajes propios y metadatos permitidos, no el cuerpo crudo del proveedor. La generación persiste el aviso y sus pasos a seguir en el ítem fallido. Importar documentos conserva la lectura local y muestra el mismo diagnóstico. Probar claves usa el clasificador compartido.

Referencias oficiales consultadas: [cuotas de Gemini](https://ai.google.dev/gemini-api/docs/rate-limits), [errores de Gemini](https://ai.google.dev/gemini-api/docs/generate-content/api-errors), [errores de Claude](https://platform.claude.com/docs/en/api/errors). Las cuotas del proveedor siguen vigentes; este cambio no modifica el plan ni habilita facturación automáticamente.

## Validación

- `npm test`: 142 pruebas aprobadas (131 unitarias y 11 CTA).
- `node scripts/test-postgres.mjs priorities scalability`: 35 casos reportados, incluidos los contenedores de las dos suites; sin fallos. PostgreSQL 18 local con bases efímeras y proveedores simulados.
- `npm run test:perfiles`: 11 perfiles comprobados sobre Next compilado. Ajustes y Generador no muestran el cupo interno.
- `npm run build`, `npm run typecheck` y `npm run lint`: correctos. La compilación necesitó ejecución fuera del sandbox de Windows por el acceso del empaquetador de Workflow a directorios de resolución.
- Casos críticos: variables antiguas en cero y contadores por encima del antiguo límite permiten generar; fallback cuenta dos peticiones; importación repetida envía una nueva petición explícita; cuota gratuita diaria guarda aviso de facturación, no crea guion ni se reintenta; importación conserva lectura local.
- Sin llamadas reales a Gemini/Claude, sin cambios en Neon, sin activación de servicios de pago y sin despliegue productivo durante esta validación.

Logs locales de comprobación (ignorados por Git): `.audit/ai-quota-unit.log`, `.audit/ai-quota-postgres.log`, `.audit/ai-quota-ui.log`, `.audit/ai-quota-build.log`, `.audit/ai-quota-types.log` y `.audit/ai-quota-lint.log`.
