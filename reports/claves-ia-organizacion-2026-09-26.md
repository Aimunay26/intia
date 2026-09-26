# Claves de IA compartidas por organización

Fecha: 26/09/2026.

## Decisión y alcance

La API key pertenece a la organización. El usuario que la ingresa actúa como
administrador; no es el propietario técnico de la credencial. Todos los miembros
autorizados de esa organización usan la misma clave de cada proveedor a través
del servidor. El consumo corresponde al proyecto del proveedor de esa clave.

Actualmente hay una sola organización por instalación. La tratamos como el tenant
lógico actual, sin afirmar que exista aislamiento entre múltiples tenants.
Las marcas son subdivisiones de trabajo, no tenants.

## Hallazgo verificado

El comportamiento de compartir ya existía: `AppSecret` almacena una única fila
por nombre de secreto, sin relación con `User` ni `Brand`. `resolveApiKey` la
resuelve para generación de guiones, extracción de documentos y prueba del
proveedor. No hay claves personales que trasladar ni que solicitar de nuevo.

| Aspecto | Implementación actual |
|---|---|
| Clave de Gemini | `AppSecret.key = ai.google.apiKey` |
| Clave de Claude | `AppSecret.key = ai.anthropic.apiKey` |
| Organización | Única instalación, nombre en `AppSetting` con `key = org.name` |
| Modelos y proveedor predeterminados | `ai.google.model`, `ai.anthropic.model`, `ai.defaultProvider` |
| Administración | Dueño; validación de rol y sesión también en el servidor |
| Uso del generador | Usuarios con `scripts.generate` y acceso a la marca |
| Lectura de documentos con IA | Mantiene los permisos del destino y la selección explícita de proveedor |
| Protección de la clave | Almacén cifrado existente; el navegador recibe estado, nunca el valor |
| Rotación | Cada ejecución resuelve la clave vigente; no se copia al trabajo ni a la sesión |
| Autoría y trazabilidad | El trabajo, guion y consumo siguen asociados al usuario que los solicita |
| Respaldo | Clave cifrada guardada primero; variable de entorno solo si no hay una guardada |

Desactivar a la persona que guardó la clave no la borra: pertenece a la
organización. Desactivar al solicitante de un trabajo sí revoca su ejecución.
Rotar no cambia una petición ya enviada al proveedor. Quitar la clave sin
respaldo deja ese proveedor indisponible para toda la organización.

## Cambios realizados

- Ajustes identifica la configuración y las claves como compartidas por la
  organización; explica quién puede administrarlas y a quién afecta quitarlas.
- El generador indica que no hace falta una clave personal y muestra los
  proveedores disponibles para el equipo.
- Cuando falta una clave, el Dueño ve el acceso a Ajustes y el miembro recibe
  la indicación de solicitar la configuración al Dueño.
- Los mensajes de ausencia de clave y la auditoría de cambios identifican el
  alcance de organización. Los registros no contienen secretos.
- El contrato y los comentarios del almacén establecen este alcance para
  evitar introducir configuraciones por usuario o marca accidentalmente.
- Se incorporó la suite PostgreSQL `organization-ai` al ejecutor de pruebas.

No se alteró el cifrado ni el orden de resolución de claves. No se añadió una
migración ni un identificador de tenant ficticio a las sesiones.

## Mapeo para multitenancy real — pendiente

Antes de incorporar una segunda organización, implementar conjuntamente:

1. **Tenant y membresías:** obtener el tenant de la sesión y validar membresía
   activa en el servidor. Nunca confiar en un tenant enviado en el formulario
   o en la marca seleccionada.
2. **Secretos y preferencias:** una credencial por `(tenantId, proveedor)` y
   preferencias de modelos por tenant. El almacén debe exigir ese contexto;
   no conservar una resolución global opcional para los nuevos tenants.
3. **Migración de la organización actual:** asignar las claves existentes al
   tenant inicial en una operación controlada y volver a cifrarlas con el
   identificador del tenant incluido en los datos autenticados. No duplicarlas
   en cada usuario ni asignarlas a organizaciones nuevas.
4. **Colas y datos:** guardar `tenantId` en trabajos y recursos relacionados;
   validar pertenencia al iniciar, reclamar y guardar resultados, incluida la
   extracción de documentos. Mantener además usuario y marca para permisos
   y trazabilidad internos.
5. **Sin herencia entre organizaciones:** un tenant sin clave no debe usar la
   de otro ni las variables actuales como respaldo implícito. Una credencial
   financiada por la plataforma necesitaría una política explícita distinta.
6. **Aislamiento verificable:** probar lectura, escritura, rotación, caché,
   auditoría y ejecución cruzadas. Un cambio de tenant no puede reutilizar la
   credencial resuelta para otro.

Este mapeo se limita a credenciales y preferencias de IA. No cambia el alcance
de las credenciales OAuth de inicio de sesión, aunque hoy compartan la tabla
`AppSecret`.

## Validación

Pruebas PostgreSQL sobre bases locales efímeras, con proveedor simulado y
sin llamadas reales a Gemini o Claude:

- Clave guardada una sola vez y cifrada.
- Dueño y dos guionistas de marcas distintas generan con la misma clave;
  los guiones conservan su autor y marca.
- Miembros sin administración, perfiles sin generación y marcas ajenas
  permanecen bloqueados.
- Trabajo en cola resuelve la clave rotada; campo vacío no la borra.
- Desactivar al administrador no revoca la clave organizacional; desactivar
  al solicitante cancela su trabajo antes de llamar al proveedor.
- Quitar la clave activa el respaldo; sin respaldo, el trabajo falla sin
  llamada al proveedor.
- Estado y snapshot no necesitan descifrar; claves ausentes de la auditoría,
  trazas, trabajos y sesiones.

La suite existente de secretos y calendario también pasó: 15 pruebas PostgreSQL
en total contando los dos grupos contenedores. Las 152 pruebas generales, lint
y la compilación de producción terminaron correctamente. El primer intento de
compilación coincidió con el uso del motor de Prisma por las pruebas; se repitió
una vez que estas terminaron y liberaron el archivo de Windows.

En Chromium local se verificaron Ajustes del Dueño (también a 360 px), el mismo
proveedor disponible para Dueño y Guionista, el bloqueo de Ajustes para miembros
y la ayuda correcta de cada perfil cuando falta la clave. Sin errores de
navegador ni trabajos creados en esa comprobación visual. Se inspeccionaron las
capturas de Ajustes y de la revisión final del generador.

Evidencias locales: `.audit/organization-ai-postgres.log`,
`.audit/organization-ai-{build,lint,tests,ui}.log`,
`.audit/organization-ai-ui-report.json`, `.audit/organization-ai-settings.png`
y `.audit/organization-ai-member-review.png`. Ambas bases/contenedores locales
propios se eliminaron al terminar.

La validación descrita corresponde al entorno local. La publicación del código
en GitHub no confirma el despliegue en Vercel, que debe verificarse por separado.
No se leyeron ni modificaron credenciales reales ni datos de Neon.
