# Perfiles y marcas sin cierre de sesión

1. Desplegar primero el código de revisión de acceso y actualización del menú.
   Es compatible con la función anterior: hasta migrar seguirá cerrando sesiones.
2. Aplicar `20261007160000_live_team_permissions` con `prisma migrate deploy`.
   Solo sustituye el cuerpo de una función usada por dos triggers: no cambia
   columnas, datos, contraseñas, permisos ni sesiones existentes.
3. Con una cuenta de prueba ya autenticada, conceder y retirar perfil/marca.
   La cookie debe seguir siendo válida y reflejar el nuevo alcance. Una escritura
   con un actor leído antes del cambio debe fallar; la nueva sesión de datos debe
   permitir exclusivamente el acceso vigente. Confirmar menú al volver a la pestaña
   y en un máximo de 30 s de actividad visible.
4. Cambiar correo, rol, contraseña o desactivar la cuenta debe seguir cerrando
   sus sesiones. Las sesiones ya revocadas antes de migrar no se restauran.

La revisión `User.updatedAt` avanza con cualquier cambio de acceso y conserva
el bloqueo compartido con las escrituras autorizadas. Cada petición consulta
los permisos actuales; la actualización visual no es una barrera de seguridad.
Los trabajos IA revalidan perfil y marca antes de consumir proveedor y guardar.

Reversión: antes de volver al código anterior, restaurar el cuerpo de
`revoke_access_sessions()` de `20260910010000_team_work_profiles` en una nueva
migración. No volver a ejecutar esa migración completa ni editarla: también crea
tablas. La reversión recupera el cierre de sesiones en futuros cambios de acceso.
