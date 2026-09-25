# Descenso automático de modelo por saturación

Fecha: 25/09/2026 (Perú). Estado: implementado y validado localmente; activación y comprobación en producción pendientes. No requiere migración de Neon.

## Motivo observado

El trabajo `cmuh5zp5n0001l304c0swcqr9` terminó sin guion después de tres intentos. El último intento, a las 11:19:31 de Perú, recibió HTTP 503 de Google durante `provider_request`, usando `gemini-3.8-flash`, con `reason: provider_overloaded`. El log corresponde a la versión `e75b0aacbeda`; falló antes de interpretar o guardar una respuesta. El diagnóstico de ese último intento está confirmado; no se atribuye retrospectivamente el mismo HTTP a los dos intentos anteriores.

## Comportamiento

- Por defecto, la generación de guiones con Gemini baja **3.8 Flash → 3.7 Flash → 3.6 Flash** cuando Google devuelve un 503 con evidencia de alta demanda, sobrecarga o falta de capacidad. El catálogo y selector incluyen las tres alternativas; el predeterminado sigue siendo 3.8 Flash. Orden explícito independiente del orden visual del selector.
- Si se comienza en 3.7, la alternativa es 3.6. No vuelve a un modelo superior. En el último modelo puede repetir mientras queden intentos. Si fallan los tres, muestra el error y termina.
- Cada descenso ocupa el siguiente intento del mismo elemento: **máximo tres intentos por guion**, con las esperas existentes de 30 y 60 segundos. El fallback de esquema puede hacer dos peticiones dentro de un intento; cada petición se autoriza y contabiliza, sin reintentos internos del SDK.
- Un 429 de cuota, falta de saldo, clave inválida, modelo desconocido, respuesta inválida, timeout o fallo 500 genérico no provoca un descenso. Conservan su clasificación y política de reintento anterior. La cuota gratuita agotada conserva el aviso de facturación.
- El pedido original y su huella de idempotencia permanecen intactos. La cadena planificada se guarda por guion en `GenerationItem.diagnostics.modelFallback`, en la misma escritura protegida por la concesión que lo devuelve a la cola. Si el ejecutor se reinicia, recupera la alternativa; si después hay otro error temporal, continúa con ese modelo.
- La pantalla distingue el modelo usado de la alternativa pendiente, muestra el origen por saturación y conserva la secuencia. El guion terminado registra el modelo real. `generation_trace` incorpora `model_fallback` con `model`, `nextModel`, intento y motivo; el error envuelto conserva el motivo de saturación. Sin claves, instrucciones o documentos en los logs.
- Se mantienen permisos, revocación de sesión, cancelación, bloqueo por concesión, plazos, validación semántica y un guion por elemento. El cambio solo aplica al generador de guiones; no cambia automáticamente Claude, la importación documental, claves ni facturación. Los trabajos ya fallidos no se reabren automáticamente.

Referencias verificadas: [catálogo oficial de Gemini](https://ai.google.dev/gemini-api/docs/models), [Gemini 3.7 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash), [Gemini 3.6 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.6-flash), [tratamiento de errores](https://ai.google.dev/gemini-api/docs/troubleshooting). La disponibilidad y cuota efectiva de cada proyecto siguen dependiendo del proveedor.

## Validación

Pruebas con proveedores simulados, sin consumir llamadas reales de IA ni modificar Neon. Se comprueban éxito en el tercer modelo, agotamiento de intentos, modelo inicial 3.7, recuperación desde otro ejecutor, concurrencia, espera, cancelación, revocación, fallback de esquema y registro de uso. Se verifica el mismo contenido de instrucciones entre intentos cuando no cambia el contexto y un único guion persistido con el modelo efectivo.

- `npm test`: **147 pruebas aprobadas** (136 unitarias y 11 CTA), incluida la pantalla de avance con alternativa pendiente, modelo final y trabajos sin diagnósticos históricos.
- `node scripts/test-postgres.mjs priorities`: **25 pruebas reportadas aprobadas**, incluyendo el contenedor de suite; PostgreSQL 16 local efímero con migraciones reales y proveedores simulados. Seis casos nuevos cubren los cambios del ejecutor.
- `npm run build`, `npm run typecheck`, `npm run lint` y `git diff --check`: correctos. La compilación mantiene el aviso de dependencia dinámica de `@vercel/queue`/Workflow, sin impedir el build. La validación del historial compartida con la interfaz no agrega una biblioteca de esquemas al navegador.
- Sin llamadas reales a Gemini/Claude, cambios de credenciales, modificaciones de Neon o despliegue durante estas pruebas. No se certifica generación real en producción con esta versión hasta publicarla y probarla allí.

Logs locales ignorados por Git: `.audit/model-fallback-unit.log`, `.audit/model-fallback-postgres.log`, `.audit/model-fallback-types.log`, `.audit/model-fallback-lint.log` y `.audit/model-fallback-build.log`.
