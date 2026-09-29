# Investigación del rechazo y timeout de Gemini

> Nota de integración (28/09/2026): solo este informe se versiona. La evidencia enlazada
> (matrices, pruebas y JSON) quedó fuera del repositorio. El esquema simplificado quedó
> detrás de `GEMINI_ESQUEMA_SIMPLE` (encendido; `"false"` vuelve al esquema anterior).

Estado: diagnóstico de producción revisado; correcciones locales verificadas;
tres llamadas reales controladas realizadas el 25/09/2026. La clave respondió
en la petición mínima, se reprodujo el 400 del esquema de producción y la
comparación quedó inconclusa por un 503 con el esquema simplificado. Estos
cambios todavía no están publicados ni desplegados.

Actualización de las 15:03 de Lima: una cuarta llamada autorizada, con el
mismo guion ficticio pero sin `responseJsonSchema`, también recibió HTTP 503
por alta demanda en 2.087 s. No hubo respuesta que validar. La comparación
continúa inconclusa; [evidencia del ensayo](prueba-gemini-sin-esquema-2026-09-25.json).

Actualización de las 17:24 de Lima: una quinta llamada autorizada probó los
prompts reales de Con Amor con el esquema histórico exacto de Yoryo Mamani,
manteniendo Gemini 3.6 Flash. Recibió HTTP 503 por saturación en 3.926 s;
no hubo guion ni reintentos. [Resultado](prueba-esquema-yoryo-2026-09-25.md).

Actualización de las 17:28 de Lima: una sexta llamada autorizada conservó el
pedido de Con Amor y el esquema histórico, añadiendo solo
`thinkingConfig.thinkingLevel=MINIMAL`. Gemini 3.6 no garantiza apagado total
con ese nivel. Respondió HTTP 503 por saturación en 8.321 s, sin guion.
[Resultado y alcance de la prueba](prueba-razonamiento-minimo-2026-09-25.md).

Actualización de las 17:33 de Lima: cuatro llamadas adicionales autorizadas
repitieron el pedido y esquema histórico en 3.7 y 3.8, con razonamiento
predeterminado y `LOW` (ambos modelos rechazan `MINIMAL` según documentación).
Las cuatro devolvieron 503 por saturación, sin guion. No hubo reintentos ni
modificaciones en producción. [Matriz de resultados](pruebas-gemini-37-38-2026-09-25.md).

Actualización de las 17:45 de Lima: el usuario autorizó una primera ronda
progresiva de hasta 12 llamadas a Gemini 3.8. Se completaron las 12, desde
el pedido solo de 552 bytes hasta el contexto y esquema completos, con
un control final idéntico al inicial. Todas recibieron 503 por saturación,
incluidos ambos controles sin sistema, MIME JSON ni esquema. No se generó
ninguna respuesta. El registro compara 11 combinaciones distintas y deja
213 sin probar dentro de un catálogo acotado de 224; no es exhaustivo.
[Resultados y metodología](matriz-gemini38-2026-09-25.md).

## Evidencia del incidente

Trabajo `c2f239af78193355856efa232`, reintento de
`cmuh5zp5n0001l304c0swcqr9`, iniciado el 25/09/2026 a las 12:23:47 de Lima.
Los logs de producción identifican el release `1da21c0c60f0` y el despliegue
`dpl_92wdV3S4X8rcQDtxa8YRXuZtdLhj`: el descenso de modelos y el reintento
manual ya estaban funcionando en ese intento.

| Intento / petición | Modelo | Respuesta | Duración de petición |
| --- | --- | --- | --- |
| 1 / 1 | Gemini 3.8 Flash | 503, `provider_overloaded` | 6.738 s |
| 2 / 1 | Gemini 3.7 Flash | 503, `provider_overloaded` | 2.609 s |
| 3 / 1 | Gemini 3.6 Flash | 400, petición con esquema; `reason: unknown` | 1.885 s |
| 3 / 2 | Gemini 3.6 Flash | 504 después del fallback sin esquema | 237.535 s |

En la última subllamada el plazo restante era 237.813 s. La preparación del
contexto, permisos, clave y pedido había terminado; no se recibió un guion
para interpretar o guardar. El prompt registrado medía 11 376 bytes, con
cero referencias adjuntas y un máximo de salida de 32 000 tokens.

La cadena de saturación fue 3.8 → 3.7 → 3.6. En la última alternativa apareció
un problema diferente. No hay un rechazo explícito por cuota o facturación
en estas cuatro respuestas. El HTTP 200 de la ruta Workflow significa que
el paso pudo manejar/persistir el fallo, no que Google generó un guion.

[Logs del trabajo](https://vercel.com/conamors-projects/intia/logs?search=c2f239af78193355856efa232).

## Hallazgos y límites del diagnóstico

Actualización: la [comparación con el guion exitoso de Yoryo Mamani](comparacion-yoryo-ultimo-intento-2026-09-25.md)
confirmó en Neon que la petición exitosa llevaba 29 878 bytes de texto y una
referencia, frente a 11 376 bytes y ninguna referencia en el último fallo.
Documenta el esquema histórico exacto para un posible ensayo controlado;
esta revisión no consumió nuevas llamadas de IA.

1. **Error de clasificación confirmado:** HTTP 504 con un mensaje que no
   contenía `timeout` caía en `server`. La pantalla mostraba el mensaje
   genérico de servidor/conexión en vez de plazo agotado. Se reprodujo con
   el SDK real y un transporte HTTP simulado, sin una llamada a Google.
2. **Regresión candidata en el esquema:** la prueba real satisfactoria de
   Gemini 3.6 del 16/09 (`cmu4487yg0001falwqplucp1x`) usó el contrato anterior,
   más simple, y respondió en 20.677 s con 2 258 tokens de salida. El esquema
   actual deriva de Zod y añadió 32 restricciones de tamaño/rango en textos,
   listas y tiempos. No es una comparación controlada: pedido y condiciones
   del proveedor eran distintos. Google documenta que demasiadas
   restricciones pueden provocar el rechazo del esquema. Los logs de este
   400 no conservan el mensaje/parametro exacto, por lo que no se afirma una
   causa individual demostrada.
3. **Plazo agotado confirmado; causa interna desconocida:** la segunda
   petición se quedó sin respuesta al alcanzar casi cuatro minutos. El
   razonamiento predeterminado, la complejidad del pedido o la disponibilidad
   del proveedor son hipótesis; no hay tokens ni respuesta parcial para
   distinguirlas. El SDK propaga el timeout también mediante
   `x-server-timeout`, además del aborto local. Aumentarlo sin más afectaría
   el margen de ejecución y no corrige la causa.

## Ajustes locales

- `gemini-schema.ts` deriva una copia simplificada con los mismos 27 campos,
  tipos, enums y campos obligatorios. Omite límites numéricos, de longitud y
  de listas en el esquema del proveedor, siguiendo el enfoque de la versión
  anterior; el prompt, Zod y la validación semántica del backend mantienen
  todos los límites. Es una mitigación de compatibilidad pendiente de A/B.
- HTTP 408/504 y el estado `DEADLINE_EXCEEDED` se reconocen como timeout
  aunque el texto no lo diga. El mensaje aclara qué ocurre si quedan intentos
  o si hay que usar el botón de reintento.
- Las trazas guardan etiquetas cerradas para argumento inválido, rechazo de
  esquema y deadline, códigos conocidos del proveedor y tamaño del esquema.
  No se almacenan mensajes crudos, claves, prompts ni respuestas privadas.
- Continúan el máximo de tres intentos, su plazo compartido de 240 s, los
  permisos, el registro de cada llamada y los descensos sólo ante saturación.
  No se cambió de clave, proveedor, facturación, presupuesto de salida o
  nivel de razonamiento. No se necesita migrar Neon.

## Validación

- 152 pruebas locales: 141 de unidad y 11 de CTA, todas correctas.
- Tipos, lint y compilación de producción correctos; bundle de React verificado.
- Regresión con el SDK real: 400 estructurado → segunda petición sin esquema
  → 504 termina como timeout; exactamente dos llamadas simuladas.
- Se comparan todos los campos/tipos/enums/obligatorios del esquema enviado
  con el contrato canónico. Se comprueba que siguen rechazándose textos,
  tiempos, cantidades de escenas y actores que exceden los límites locales.
- Se comprueba que los códigos nuevos sobreviven al envoltorio de errores
  sin filtrar contenido privado. Las pruebas no consumieron llamadas reales.
- El mensaje mejorado corresponde a errores nuevos; el texto ya persistido
  en trabajos anteriores conserva su historial.

La API de Vercel había devuelto `403 forbidden` a la sesión de herramientas.
Se renovó esa sesión con la CLI oficial y se completaron las pruebas externas
autorizadas que se detallan a continuación. No se cambió la clave de Gemini.

## Prueba real controlada del 25/09/2026

Autorización: «Ok, hagamos esas pruebas», después de proponer una petición
mínima y dos variantes del mismo pedido ficticio. Se realizaron exactamente
tres peticiones HTTP a Google entre las 14:09:34 y las 14:09:54 de Lima
(19:09:34–19:09:54 UTC). No hubo reintentos automáticos ni descenso de modelo.

Se recuperó la misma clave cifrada `ai.google.apiKey` usada por producción,
mediante una transacción de Neon de **solo lectura**, y se cerró la conexión
antes de llamar a Google. Vercel seguía sirviendo el release
`1da21c0c60f0e554e764aea2a4c0b3d5d692b77e` y el despliegue del incidente.
Las llamadas salieron del diagnóstico local directamente a Google, fuera de
Workflow. No se enviaron pedidos, marcas, documentos ni guiones de usuarios.
No se crearon trabajos o guiones, ni se activó facturación o cambió configuración.

| Prueba | HTTP / resultado | Tiempo | Interpretación |
| --- | --- | --- | --- |
| JSON mínimo `{"ok":true}`, sin esquema | 200, `STOP`, respuesta exacta válida | 1.733 s | La misma clave permitió generar con Gemini 3.6 en ese momento. |
| Pedido ficticio + esquema de producción | 400, `INVALID_ARGUMENT` | 12.185 s | Se reprodujo el rechazo fuera de Vercel/Workflow. Google no identificó qué argumento rechazó. |
| Mismo pedido + esquema simplificado | 503, `UNAVAILABLE`, alta demanda | 5.747 s | Comparación inconclusa por saturación; no confirma aceptación del esquema ni generación válida. |

Configuración común: `gemini-3.6-flash`, SDK `@google/genai` 1.52.0, JSON,
máximo de salida 32 000 tokens, timeout de 240 s, razonamiento predeterminado
del proveedor y sin parámetros adicionales de muestreo. Se bloqueó cualquier
segunda petición interna del SDK por caso. El esquema original se reconstruyó
con la transformación de producción: omitir solamente `$schema` y
`additionalProperties`. La definición Zod no cambió entre HEAD y el árbol local.

Las variantes A/B usaron el mismo sistema y pedido (1 932 bytes combinados):
un video ficticio de 10 s sobre ordenar un escritorio, con dos escenas
«Problema» (0–5 s) y «Solucion» (5–10 s), una persona anónima, mesa y cuaderno,
voz en cámara y CTA vacío. Se mantuvo el contrato textual completo. Solo
cambió `responseJsonSchema`: 3 542 bytes en producción frente a 3 015 en la
copia simplificada. Los hashes del pedido y esquemas se conservan en la
[evidencia de las tres llamadas](pruebas-gemini-esquema-2026-09-25.json).

La respuesta mínima reportó 18 tokens de entrada, 5 de salida y 116 de
razonamiento, 139 en total. Los errores no informaron uso de tokens: no se
asume consumo cero. No apareció rechazo por cuota o facturación. Esto no
certifica el saldo, plan o cuota restante del proyecto; sí demuestra que
activar facturación no era un requisito para la petición mínima realizada.

**No se obtuvo un guion en este ensayo.** El 400 ya no depende exclusivamente
del entorno Workflow, pero no se ha aislado qué restricción del esquema lo
provoca. Un 503 en la otra variante tampoco permite afirmar que pasó la
validación del esquema. La simplificación continúa siendo una mitigación
pendiente de confirmación, y no una solución demostrada.

## Siguiente comprobación

La [revisión completa de las peticiones](revision-peticiones-gemini-2026-09-25.md)
reconstruyó después el prompt real con coincidencia exacta del hash persistido,
comprobó la serialización del SDK sin red y detectó contradicciones de escenas
y CTA. Identificó una comprobación previa: el mismo guion ficticio en modo
JSON sin esquema, ya que la petición mínima no tenía el mismo contenido.
Esa comprobación ya se intentó una vez y recibió 503; sigue pendiente una
respuesta completa y válida para poder evaluar su resultado.

Repetir de forma acotada el A/B cuando el proveedor esté disponible, sin
cambiar pedido, modelo o razonamiento. Exigir HTTP 200, finalización `STOP`,
JSON válido y aprobación del validador semántico de guiones. Si vuelve el 400
con el esquema simplificado, aislar por separado la respuesta JSON sin
esquema; no introducir ese cambio dentro de la misma comparación. Ante cuota
o facturación, detenerse; un 503 vuelve a dejar el ensayo inconcluso.

Después, evaluar por separado `thinkingLevel: LOW` en 3.6 si sigue la
latencia. Google lo admite en 3.6/3.7/3.8 y recomienda bajar razonamiento
antes que reducir arbitrariamente el máximo de tokens, porque dicho máximo
también incluye tokens de pensamiento. Requiere revisar la calidad del guion
y sus validaciones antes de adoptarlo. No mezclar ambas variables en el A/B.
El ensayo de LOW y una generación completa mediante Workflow en Vercel
siguen pendientes; estas tres llamadas no validan la generación en producción.

## Fuentes oficiales consultadas

- [Límites y complejidad del esquema](https://ai.google.dev/gemini-api/docs/generate-content/structured-output#limitations).
- [Razonamiento y presupuesto de salida](https://ai.google.dev/gemini-api/docs/generate-content/thinking#controlling-thinking).
- [Capacidades de Gemini 3.6 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.6-flash).
- [Referencia de errores](https://ai.google.dev/gemini-api/docs/api-errors).
