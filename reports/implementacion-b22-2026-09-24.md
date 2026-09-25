# B22: secretos y suscripciones de calendario

Entrega conjunta con B11–B20, basada en `6a17cc7`. La implementación se publica en `codex/backend-b11-b22`; la migración y activación en Neon/Vercel siguen pendientes. B21 (multiempresa) conserva su alcance pendiente. No se enviaron documentos a proveedores ni se hicieron llamadas reales de IA/Blob.

## Secretos

- Las claves de Gemini/Claude y el secreto OAuth de Google se guardan en `AppSecret`, separados de `AppSetting`. El identificador público de cliente OAuth sigue siendo un ajuste ordinario.
- Cifrado AES-256-GCM con nonce aleatorio de 12 bytes, etiqueta de 16 bytes y datos autenticados que incluyen nombre del secreto y versión de clave. Alterar el sobre o intercambiarlo entre proveedores provoca un rechazo. Se usa la [API de cifrado autenticado de Node](https://nodejs.org/download/release/v24.16.0/docs/api/crypto.html).
- Las claves maestras se conservan fuera de la DB en `APP_SECRETS_KEYS`, un objeto JSON de identificadores y claves de 32 bytes en base64. `APP_SECRETS_ACTIVE_KEY` elige la versión para nuevas escrituras. Son independientes de `AUTH_SECRET`; no se generan en cada arranque.
- Solo la ejecución de IA/OAuth descifra. Ajustes, Login y Generador consultan metadatos y estado enmascarado. Los snapshots/revisiones no contienen valores de secretos. La auditoría registra qué clave cambió, nunca su valor.
- La clave IA guardada conserva prioridad frente al entorno; OAuth conserva su precedencia existente, entorno primero. Un fallo de descifrado no sustituye silenciosamente una clave guardada por otra del entorno.
- Guardar o quitar una clave participa en la transacción de ajustes y auditoría. Un fallo de cifrado o una revisión obsoleta revierte también las demás modificaciones. Los campos vacíos conservan el valor y la casilla de quitar lo elimina.
- El acceso genérico a ajustes rechaza claves sensibles. Un trigger impide nuevas escrituras de secretos en texto plano. Los valores anteriores se migran mediante una operación explícita y transaccional antes de activar la versión.

Este cifrado protege frente a la lectura aislada de DB/backups; no protege frente a quien controla el proceso servidor y su entorno. Los backups anteriores a la migración aún pueden contener valores sin cifrar: conservarlos con acceso restringido según su política de retención. No se borran respaldos automáticamente. Los consumidores de las URLs de calendario y sus proveedores de infraestructura pueden registrar esas URLs: deben tratarse como credenciales y no compartirse en tickets/logs.

## Calendario

El Dueño crea un enlace por destinatario desde Ajustes. Elige una marca o, explícitamente, todas las marcas y agenda general. El alcance queda persistido en DB y es inmutable; editar, quitar o añadir parámetros de URL no lo amplía. Para cambiar alcance se crea otro enlace y se revoca el anterior.

La URL contiene 32 bytes aleatorios. Solo se almacena su SHA-256; el enlace se entrega una vez al crearlo o renovarlo. Hay vencimiento obligatorio de 30, 90 o 365 días (90 por defecto), renovación y revocación con revisión optimista y auditoría. Hasta 50 enlaces activos; la lista prioriza activos y muestra hasta 100 registros. Los enlaces de una marca se eliminan con ella, nunca se convierten en globales.

Cada descarga comprueba revocación, vencimiento y que el creador siga siendo Dueño activo. Una marca archivada deja de servir su enlace; el global omite marcas archivadas. No se depende de una sesión del navegador del destinatario. El perfil Equipo no puede emitir enlaces.

El ICS contiene títulos, fechas y nombre de marca cuando corresponde; omite hooks, descripciones privadas, ubicaciones y enlaces a fichas. Mantiene UID estable por suscripción y entidad. Incluye grabaciones dentro del período aunque la publicación esté fuera. Ventana: seis meses atrás/un año adelante; hasta 2.000 videos y 2.000 eventos por consulta. Si supera el límite se rechaza con 503 en lugar de entregar una agenda incompleta. El formato escapa saltos de línea y pliega Unicode conforme a [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545).

Todas las respuestas, incluidos errores, usan `private, no-store` y desactivan caché de CDN. Revocar impide nuevas descargas; no puede retirar copias ya descargadas por Google/Outlook. Su frecuencia de actualización depende del proveedor externo. Es una suscripción de lectura, no sincronización bidireccional.

**Los enlaces globales antiguos se invalidan al migrar.** No se intenta deducir el alcance que el dueño pretendía compartir a partir de `?marca=`. Deben crearse y distribuirse enlaces nuevos con alcance explícito.

## Publicación y rotación

Esta entrega incluye dos migraciones: `20260924180000_backend_completion` y `20260925010000_secrets_calendar`. No promover el código antes de completar la preparación.

1. Revisar el commit y las evidencias; preparar backup y ensayo en una copia autorizada de Neon dentro del plan gratuito. No contratar servicios adicionales.
2. Generar una clave maestra aleatoria en un gestor de secretos. Configurar `APP_SECRETS_KEYS` y `APP_SECRETS_ACTIVE_KEY` en el entorno del nuevo deployment y en el proceso del operador. No guardarlas en Git, DB ni en el mismo archivo del backup. Un despliegue que solo usa credenciales del entorno puede funcionar sin secretos guardados, pero guardar nuevas claves desde Ajustes exige este cifrado.
3. Cerrar escrituras en `intia_ops.deployment_gate` con la conexión de mantenimiento `application_name=intia-migrator-20260909`; esperar a escritores/trabajos previos. Aplicar ambas migraciones según las comprobaciones de índices de [B11–B20](despliegue-b11-b20.md).
4. Ejecutar `npm run secrets:migrate` para inspeccionar metadatos/verificar secretos ya cifrados, y `npm run secrets:migrate -- --apply` para trasladar valores anteriores. La operación verifica los sobres, rechaza divergencias entre almacenes y elimina valores antiguos en la misma transacción. Repetirla no duplica datos. Un error deja la transacción sin cambios.
5. Volver a ejecutar `prisma/operations/deployment-gate.sql` para proteger `AppSecret` y `CalendarSubscription`, además de `MetricImportBatch`.
6. Ejecutar `npm run secrets:migrate` de nuevo: `legacy` debe ser cero y todos los sobres deben poder descifrarse. Ejecutar **`prisma/operations/activate-secrets-calendar.sql`** como activación final. Exige migración completa, ausencia de valores antiguos y escrituras cerradas; selecciona `intia-secrets-20260925`, conserva sesiones y no abre escrituras. Sustituye la activación final B11–B20 para esta entrega conjunta.
7. Desplegar/promover el commit probado con esas mismas claves maestras, comprobar el estado de configuración y abrir escrituras. Comprobar un cambio reversible y auditoría; los escritores anteriores deben seguir rechazados.
8. Crear un enlace de prueba por marca, comprobar alcance, renovar y revocar; verificar que Ajustes no reexpone las claves. Volver a suscribir los calendarios que usaban enlaces globales anteriores. Documentar SHA/deployment/resultados en el plan.

Para rotar **la clave maestra**: añadir una nueva versión al JSON conservando la anterior, elegirla como activa, cerrar escrituras y ejecutar `npm run secrets:migrate -- --apply --rotate`. Verificar con la consulta sin `--apply` y abrir con el entorno actualizado. La rotación no cambia las credenciales del proveedor ni sus cuotas. Retirar claves maestras antiguas solo después de verificar que ningún registro/despliegue las usa y resolver la restaurabilidad de sus backups. Para rotar **la credencial de proveedor**, sustituirla desde Ajustes; no hace falta cambiar la clave maestra.

El script rechaza operaciones remotas sin conexión de mantenimiento o con escrituras abiertas. No imprime claves, sobres ni cadenas de conexión. No restaurar un backup sobre escrituras posteriores ni volver al código anterior sin planificar el almacén de secretos, los enlaces revocados y la versión de escritor.

## Validación

[Evidencia de la entrega](validacion-b22-2026-09-24.json): unidades, PostgreSQL real, migración/restauración/rotación, UI compilada y Workflow con respuesta ficticia. Se prueban aislamiento, parámetros manipulados, expiración, revocación, cambio de acceso del creador, borrado de marca, concurrencia de ajustes y rollback sin clave maestra. No se confunde una prueba local con migración en Neon o disponibilidad real del proveedor.
