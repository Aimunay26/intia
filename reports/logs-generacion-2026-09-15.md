# Trazas de generación de guiones

Los logs estructurados usan `event: "generation_trace"`. Están activos por
defecto y se consultan en **Vercel → intia → Logs**. Buscar el ID del trabajo
que aparece al final de `/generador/trabajos/<jobId>` y `generation_trace`.
Las peticiones de fondo aparecen bajo `/.well-known/workflow/v1/step`.
Los eventos anteriores al despliegue no se reconstruyen retroactivamente.

## Qué registra cada etapa

| Etapa | Qué permite localizar |
| --- | --- |
| `enqueue` | Validación de entrada/permisos y registro del trabajo. Su evento `info` une el `traceId` inicial al `jobId` confirmado. |
| `dispatch_claim`, `dispatch_start`, `dispatch_save` | Reserva de cuota de Workflow, arranque y guardado del ID de ejecución. |
| `workflow_step`, `process`, `claim` | Entrada al ejecutor, permisos vigentes, vencimiento y reclamación del elemento. |
| `quota` | Reserva de cupo antes de generar. |
| `context_load`, `references_load` | Lecturas de estructura, marca, persona, compatibilidad y referencias. |
| `prompt_build` | Construcción y límite de tamaño del contexto. |
| `settings_load`, `model_resolve`, `key_resolve` | Ajustes, modelo efectivo y resolución de la clave. Sólo se registra su origen (`db`/`env`). |
| `provider_request` | Llamada al proveedor: duración, modelo, intento, timeout y código HTTP o de transporte si falla. |
| `provider_response` | Respuesta recibida: tamaño, tokens y motivo de finalización/bloqueo reconocido. |
| `schema_fallback` | Segunda petición sin esquema cuando el adaptador existente la permite; `requestIndex: 2` la distingue del primer envío. |
| `model_fallback` | Descenso por saturación guardado en la cola: `model`, `nextModel`, `attempt`, HTTP 503 y `reason: provider_overloaded`. No es una llamada adicional del mismo intento. |
| `response_parse` | Interpretación/validación del resultado y número de escenas. |
| `response_save` | Persistencia de la respuesta antes de crear el guion. |
| `script_save` | Transacción de guion, escenas, auditoría y vínculo con video, si corresponde. |
| `script_insert`, `audit_save`, `video_link` | Subetapas de creación, registro de auditoría y vínculo; la confirmación final de todas es `script_save: success`. |
| `failure_save` | Registro del fallo y suspensión de otros formatos cuando la clave fue rechazada. |
| `retry`, `job_state`, `cancel`, `cache_refresh` | Decisión de reintento, estado, cancelación e invalidación de caché. |

Las operaciones emiten `start` y `success` o `error`, con duración en
milisegundos. Los eventos informativos, como `provider_response`, `retry` y
`job_state`, usan `info`. Todos llevan fecha UTC. `traceId` identifica una
ejecución del paso; `jobId` enlaza las
distintas ejecuciones y `itemId`/`attempt` identifican el guion y su intento.
Las subllamadas HTTP se distinguen por `requestIndex`. `release` identifica
el commit cuando lo proporciona Vercel.

## Cómo interpretar un fallo

Ejemplo representativo, sin datos reales:

```json
{"event":"generation_trace","stage":"provider_request","state":"error","provider":"google","model":"gemini-3.8-flash","attempt":1,"requestIndex":1,"httpStatus":503,"reason":"provider_overloaded","durationMs":35966}
```

Un 503 en `provider_request` sitúa el fallo en la llamada a Google. Si ésta
termina correctamente pero falla `response_parse`, llegó una respuesta que
el sistema no pudo interpretar. Si falla `script_save` después de un
`response_save` correcto, la respuesta ya quedó conservada para recuperar el
guardado sin volver a generar.

`success` significa que la etapa terminó sin lanzar una excepción; no
significa por sí solo que el guion esté creado. `process` puede terminar
correctamente después de programar un reintento. Revisar `retry`, el estado
persistido del trabajo y la transacción `script_save`. Los eventos `info`
dentro de una transacción describen decisiones: sólo el `success` de la etapa
envolvente confirma que la transacción terminó. Un `start` sin cierre puede
indicar que sigue ejecutándose, que el proceso terminó abruptamente o que se
perdió el log; por sí solo no demuestra la causa.

## Privacidad, costo y alcance

El serializador permite únicamente campos y valores definidos. No registra
claves, cookies, emails, prompts, nombres de documentos, texto generado,
URLs de conexión, SQL, stacks ni mensajes crudos de excepciones. El texto de
un error sólo se usa para clasificar motivos conocidos, como alta demanda.
Un fallo del logger no interrumpe la operación.

Se utiliza la salida estándar de Vercel, sin tablas ni servicios nuevos y sin
consultas adicionales a PostgreSQL. No se modifican modelos, cuotas, retries
ni el selector. `GENERATION_LOGS=0` permite desactivarlo. La disponibilidad y
retención de logs dependen del plan de Vercel; no es un historial permanente.

Las pruebas cubren concurrencia, ausencia de secretos, errores HTTP con SDK
real y transporte simulado, respuestas inválidas, fallos al cargar contexto
y fallos transaccionales al guardar en PostgreSQL local. Estas pruebas no
consumen Gemini ni acreditan disponibilidad del proveedor en producción.
