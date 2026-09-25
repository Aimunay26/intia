# Contratos de dominio del backend

Estado: B11–B20, 24/09/2026. Una organización por instalación. Los filtros de marca no sustituyen aislamiento por tenant.

## Entradas y límites de responsabilidad

| Servicio | Invariante a cargo | Entrada / transacción |
|---|---|---|
| `permissions` / `access-scope` | Capacidad, marca autorizada, asignación, acceso a un recurso cerrado | Usuario autenticado del servidor; nunca aceptar perfiles enviados por cliente. |
| `auth-transactions.assertActor` | Usuario activo, rol y versión de sesión vigentes | Revalida dentro de cada escritura y bloquea el usuario contra cambios concurrentes. |
| `mutations` | Transacción, revisión optimista, conflictos, efectos posteriores | `withMutation` confirma DB+auditoría; invalida después del commit. No reintenta escrituras a ciegas. |
| `domain/lifecycle` | Transición de video/guion, reapertura, requisitos y publicación | Contratos tipados; recibe transacción y actor, vuelve a comprobar acceso y versión. El adaptador valida campos/enum; reglas de negocio devuelven `WorkflowError`. |
| `approvals` | Versiones aprobadas, huella de contenido, revocación justificada | Se usa desde acciones y servicios; snapshots inmutables protegidos también por trigger SQL. |
| `weekly-metric-mutations` | Identidad semanal fija, revisión y auditoría manual | No cambia video/semana/plataforma de un registro existente. |
| `metric-import-parser` | CSV válido, referencias no ambiguas, tipos y dinero | Prevalida solo videos del archivo dentro del alcance; no escribe. |
| `metric-import-service` | Idempotencia, bloques, concurrencia, recibo durable | El lote bloqueado serializa continuaciones; revalida actor/acceso y revisiones. Datos, auditoría y cursor comparten commit. |
| `metric-dashboard` | Toda agregación tiene alcance obligatorio | `MetricFilters.user` del servidor; ausencia o falta de permiso implica cero filas, también en ranking y comparativas. |
| `objective-policy` / `objective-service` | Solo sumas compatibles en períodos completos | Valida configuración; SQL agregado en lectura, sin mantener contadores derivados que puedan quedar obsoletos. |
| `ai/index` / `ai/references` | Construcción reproducible y acotada del contexto | Lecturas limitadas, configuración validada, procedencia persistida antes de gastar una llamada. |
| `ai/request-budget` / `ai/providers` | Cupo por solicitud HTTP real y plazo compartido | Incluye fallback; proveedor nunca se invoca desde el render de una pantalla. |
| `generation-jobs` / `generation-persist` | Concesión, reintentos, respuesta recuperable y persistencia única | Worker vuelve a comprobar acceso/estado. Respuesta recibida se guarda antes de crear guion; validación semántica antes de insertarlo. |
| `private-storage` / `asset-import` | Inventario, checksum, vínculo, cuota, limpieza recuperable | Red fuera de transacción; DB valida asociación. Alternativa binaria DB protegida por cupo y bloqueo. |
| `maintenance` / `retention` | Recuperación prioritaria, presupuesto y conservación | Borrados acotados; retención técnica apagada de inicio. No purga registros de negocio ni datos activos. |
| `view-invalidation` | Dependencias entre pantallas | Efecto después de commit; incluye fichas hijas y agregados afectados. |

Las acciones de Next son adaptadores: autentican, parsean y llaman al servicio. Los componentes no son una barrera de seguridad; ocultar un botón nunca reemplaza la autorización de servidor. Los workers y herramientas de operación no reutilizan sesiones capturadas sin validarlas.

## Errores y estados

- `WorkflowError`: regla de negocio explícita que el formulario puede mostrar sin revelar internals.
- Conflicto de revisión: no sobreescribir; conservar borrador y pedir recarga/revisión.
- Error de transporte con respuesta incierta: consultar recibo durable/estado antes de intentar otra operación.
- Fallo de auditoría dentro de una escritura crítica: rollback de esa escritura.
- Fallo o demora de un componente de mantenimiento: registra el paso; no bloquea la recuperación ya ejecutada.
- Trazas IA: lista permitida de metadatos; nunca claves, prompts ni cuerpo crudo del error del proveedor.

## Matching legado

`MatchRun` y `MatchRow` no tienen un flujo de ejecución operativo en el frontend actual. Se retiran como modelo de escritura: un trigger rechaza INSERT/UPDATE. Se conservan tablas, datos, consultas históricas y las cascadas de borrado ya existentes; no se inventa una función nueva ni se elimina historia durante la migración. Reactivar matching exige un contrato de producto y una migración explícita.

## Cambios futuros

Un nuevo comando debe identificar capacidad/alcance, bloqueo o revisión, auditoría y vistas derivadas. Un nuevo worker debe añadir revalidación de actor, recibo/idempotencia y presupuesto. Una nueva tabla de negocio debe recibir la guarda de despliegue antes de abrir escrituras. Las reglas SQL no reemplazan permisos por usuario: protegen integridad frente a cualquier escritor.

## Secretos y calendario (B22)

`secret-crypto` es dueño del sobre AES-GCM; `secrets` limita lecturas/escrituras a tres claves reconocidas. `settings` entrega valores ordinarios y metadatos de revisión. La acción de Ajustes conserva autorización, transacción y auditoría sin valores sensibles. `secret-migration` verifica antes de retirar texto plano y soporta recifrado; el operador mantiene las claves maestras fuera de DB y cierra escrituras.

`calendar-subscriptions` emite tokens aleatorios, conserva solo hashes y resuelve alcance/expiración/acceso del emisor en cada descarga. `calendar-feed` autoriza al Dueño y serializa cambios/auditoría. La ruta ICS filtra en DB con el alcance persistido, minimiza campos y desactiva caché aun ante error. No acepta ampliación de alcance mediante parámetros.
