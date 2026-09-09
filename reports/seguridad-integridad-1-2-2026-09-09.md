# Implementación de los puntos 1 y 2: integridad y acceso

Fecha: 9 de septiembre de 2026. Estado: **SQL aplicado y verificado en Neon y código publicado en Vercel**. Las comprobaciones locales y las de producción se registran por separado; la validación autenticada con cuentas reales sigue pendiente.

Esta entrega corresponde a proteger los borrados/importaciones/limpieza demo (1) y reforzar archivos, autenticación y cuentas (2). Conserva los roles OWNER/MEMBER. No implementa organizaciones, membresías ni aislamiento multitenant.

## 1. Permisos y prevención de pérdida de datos

### Tareas y columnas

- Solo OWNER puede eliminar tareas o columnas, con verificación en la acción del servidor. El miembro conserva crear, editar y mover; no ve controles de borrado.
- El borrado vuelve a comprobar la cuenta activa, su versión de sesión y su rol dentro de la transacción.
- Una columna con tareas no se borra. El recuento incluye las tareas ocultas por los filtros. Hay que moverlas o eliminarlas explícitamente primero.
- No se permite borrar la última columna global. Un bloqueo de fila impide insertar tareas mientras se comprueba y elimina una columna vacía; las eliminaciones de columnas se serializan.
- Confirmación mediante el modal de la aplicación. Borrado y auditoría se confirman juntos; si falla la auditoría, se revierte el borrado.

### CSV de métricas

- Las columnas ausentes y las celdas vacías conservan el valor existente. `0` explícito sí lo reemplaza. En una fila nueva, los campos omitidos usan los valores por defecto de la DB.
- Ejemplo: con 100 vistas, 25 likes y S/100 de inversión, importar únicamente `vistas=200` conserva los 25 likes y la inversión.
- Rechaza fechas imposibles, negativos, contadores fuera de `Int`, retención fuera de 0–100, texto numérico ambiguo, cabeceras equivalentes duplicadas y comillas mal formadas. Los formatos con miles/decimales se validan antes de convertirlos.
- Máximo 500 filas y 1 millón de caracteres por lote; notas hasta 2000 caracteres. El CSV admite un registro por línea, sin saltos de línea dentro de una celda.
- Cada fila válida hace su escritura y auditoría en una transacción, guardando cambios anteriores/nuevos. Una fila fallida se informa y no altera sus valores. El lote puede tener éxito parcial.
- La clave de fecha importada usa mediodía UTC. No se modificaron retrospectivamente fechas históricas; su normalización entre otros flujos sigue pendiente.

### Limpieza de ejemplo

- Se eliminó la clasificación por correo, slug o `isPerson=false`.
- El seed de una instalación vacía registra los IDs y huellas de sus entidades y relaciones en `DemoSeedRecord`. Las huellas no guardan copias legibles de contraseñas ni archivos.
- La revisión calcula qué lote sigue intacto; la confirmación exige ese mismo comprobante y vuelve a comprobarlo bajo bloqueo transaccional.
- Si alguien editó, usó o reutilizó una entidad demo —incluido un perfil por nombre en una escena— se conserva **todo el lote**. Es una decisión deliberadamente conservadora.
- Los datos antiguos sin manifiesto se conservan. Por tanto, el botón no eliminará automáticamente el demo histórico de la instalación publicada. Clasificarlo requeriría una revisión separada; no se hará por heurísticas.
- No ejecutar el seed para intentar clasificar datos históricos: sigue siendo una herramienta de instalación, no una migración de producción.

## 2. Archivos, autenticación y cuentas

### Archivos

- Solo PDF, TXT, MD, CSV y JSON, hasta 4 MB. Se comprueban nombre, extensión y contenido; no se confía en el MIME declarado por el navegador.
- Los textos deben ser UTF-8; JSON debe ser válido. El PDF se comprueba por cabecera y terminación reconocibles. Esto no equivale a antivirus ni a sanitización completa de PDF.
- Se comprueba que el propietario exista y su tipo esté permitido. Un miembro solo modifica documentos de su propia cuenta; las entidades compartidas siguen las reglas actuales de colaboración de esta instalación.
- Las descargas, incluidas las de archivos antiguos, requieren sesión válida y propietario existente. Se sirven como adjuntos con `application/octet-stream`, `nosniff`, CSP restrictiva y `private, no-store`. El navegador no los presenta como documentos activos del origen de la app.
- El enlace de la interfaz agrega `?download=1` para evitar reutilizar la URL que antes podía tener una respuesta inline en caché.
- Auditoría y cambios de archivos están dentro de la misma transacción. No se implantaron almacenamiento externo, análisis antivirus ni claves foráneas para la relación polimórfica de `Asset`; esos trabajos siguen separados.

### Sesiones y contraseñas

- El arranque de producción rechaza un `AUTH_SECRET` ausente, corto o con patrones débiles conocidos. El control de formato no demuestra entropía: generar 32 bytes criptográficos aleatorios, codificados en hexadecimal.
- Los JWT llevan identificador aleatorio y versión del usuario. La DB guarda la huella del identificador y su vencimiento en `AuthSession`; no guarda el JWT.
- Cada comprobación de sesión hace **una consulta** que reúne sesión existente, expiración, cuenta activa y versión. No se cachean permisos.
- Cerrar sesión revoca esa sesión en la DB. Cambiar contraseña, correo o rol, y desactivar/reactivar una cuenta, invalida sus sesiones anteriores. Una cuenta reactivada no recupera cookies antiguas.
- Al cambiar su propia contraseña, la persona recibe una nueva sesión; sus otras sesiones quedan revocadas. Cambiar la contraseña de otra persona no abre una sesión a su nombre.
- Emisión de sesiones y modificaciones de acceso usan la misma exclusión transaccional: una contraseña verificada antes de un cambio no puede emitir una sesión de la versión nueva.
- Contraseñas nuevas: mínimo 8 caracteres y máximo 72 bytes UTF-8, para evitar la truncación silenciosa de bcrypt. No se recortan espacios en la contraseña.
- Los JWT anteriores a esta entrega no tienen el nuevo identificador y se rechazan. **Al publicar, todos deben iniciar sesión de nuevo.**

### Alta inicial, propietarios y límites de acceso

- Crear al primer dueño requiere `BOOTSTRAP_TOKEN`, independiente de `AUTH_SECRET`. El token se compara sin diferencias de tiempo por contenido y no se muestra en la página ni en auditoría.
- La primera cuenta OWNER y el marcador `security.bootstrap.complete` se crean junto con la auditoría en una transacción. Solicitudes simultáneas no crean varios dueños iniciales.
- La presencia del marcador o de cualquier OWNER, incluso inactivo, cierra el alta. No se reabre por desactivar usuarios. Retirar `BOOTSTRAP_TOKEN` después de instalar.
- Cambios de roles y bajas comprueban dentro de la misma exclusión que quede al menos un OWNER activo. Se mantienen las prohibiciones de autoeliminación y autodesactivación.
- La vinculación con Google vuelve a comprobar actividad, versión e identidad al escribir, con auditoría transaccional. Google no crea cuentas nuevas.
- Contadores compartidos en PostgreSQL para login, bootstrap y callback Google: ventana de 15 minutos, 60 intentos por IP y flujo; en login, además 30 por cuenta y 10 por pareja IP/cuenta. Se cuentan también accesos correctos. El límite por cuenta puede bloquear temporalmente al usuario atacado; no es un bloqueo permanente.
- Se usan claves HMAC, sin guardar email/IP legibles en `AuthAttempt`. Los contadores se incrementan atómicamente y la limpieza de vencidos es acotada.
- Solo se confía en `x-forwarded-for` cuando Vercel identifica el entorno. En otros hosts se comparte el presupuesto de IP desconocida; adaptar explícitamente el proxy antes de usar esta política fuera de Vercel. No sustituye una protección frente a DDoS.

## Validación realizada

Sin datos reales, sin credenciales de producción y sin llamadas de IA ni OAuth real:

| Comprobación | Resultado |
|---|---|
| `npx tsc --noEmit --incremental false` | Correcto |
| `npm run build` con configuración local | Correcto; Next 15.5.24 / Prisma 6.19.3 |
| `npm run test:navegacion` | 18 pruebas correctas |
| `npm run test:seguridad` | 4 pruebas correctas |
| `npm run test:seguridad:postgres` | 12 casos + prueba contenedora correctos |
| `npm run test:demo:postgres` | 2 casos + prueba contenedora correctos |
| `npm run test:seguridad:arranque` tras compilar | Proceso de producción con clave débil termina con código 1 |
| SQL aditivo sobre esquema anterior con dueño ficticio | Conserva el dueño; versión 0 y bootstrap cerrado; segunda ejecución correcta |
| Navegador, build local | Alta inicial, crear miembro, logout/login, protección de columnas, revisión demo, controles por rol, importación CSV y subida TXT comprobados |

Las pruebas de PostgreSQL cubren llamadas de acciones con cookies/cabeceras de Next simuladas, pero firmas JWT, bcrypt, SQL, bloqueos y transacciones reales. Incluyen 10 altas iniciales simultáneas, 20 intentos de acceso concurrentes, democión simultánea de dos dueños y reversión ante fallo de auditoría. El test demo ejecutó antes el seed completo y verificó conservación de entidades personalizadas.

Estos resultados no son mediciones de latencia en Vercel/Neon ni una auditoría de seguridad exhaustiva. El endpoint de Google requiere aún una comprobación con el proveedor real en un entorno autorizado.

El ensayo de arranque detectó que lanzar una excepción desde `register()` dejaba el listener de Next activo. Se cambió a un cierre explícito del proceso de inicialización con mensaje sin secretos, y se comprobó el código de salida. Una clave válida permitió compilar y ejecutar las pruebas de interfaz.

La comprobación de cabeceras de descarga está cubierta por la prueba del endpoint. En el navegador, el enlace abrió una pestaña nueva vacía; el observador no capturó el evento de descarga en la pestaña original. No se afirma haber verificado un archivo descargado en disco. También se observó que el botón Documentos no cambió de vista durante esta sesión local: se accedió por su URL para probar la subida; falta aislar si se reproduce fuera del navegador de automatización.

## Migración de producción realizada

El 9 de septiembre, a las 10:59 de Lima, se aplicó `prisma/operations/security-2026-09-09.sql` mediante SQL Editor a `neondb`, rama `main` (`br-old-water-au8cuoqk`), proyecto `mute-violet-04232921`. El editor confirmó las 12 sentencias, incluido `COMMIT`. Se utilizaron límites locales de 5 segundos para esperar bloqueos y 30 segundos por sentencia. No se ejecutaron seed, reset, db push ni índices candidatos de rendimiento.

Antes se creó `backup-seguridad-2026-09-09` (`br-misty-fire-au2q3n8t`), sin borrado automático. En esa copia se ensayó la migración con comprobaciones dentro de la transacción y `ROLLBACK`, sobre PostgreSQL 18.6. El primer ensayo se revirtió porque la copia contenía 6 marcas frente a las 5 de una consulta anterior; la comprobación actualizada pasó y se verificó que la copia conservaba el esquema anterior. La rama principal también tenía 6 marcas antes de aplicar el SQL.

La consulta posterior de las 10:59:23 de Lima confirmó:

| Comprobación de producción | Resultado |
|---|---|
| Usuarios / dueños activos | 8 / 2, conservados |
| Marcas / contenidos / tareas / archivos | 6 / 15 / 1 / 4, iguales a la consulta previa inmediata |
| `User.sessionVersion` | 8 usuarios con versión inicial 0 |
| `AuthSession` / `AuthAttempt` / `DemoSeedRecord` | Tablas creadas, vacías antes del despliegue |
| Índices nuevos | 3 claves primarias y los 3 índices secundarios esperados |
| FK `AuthSession.userId` | Referencia a `User`, con borrado en cascada |
| Alta inicial | Marcador `security.bootstrap.complete=1` presente |

Estos recuentos prueban conservación de las cantidades observadas, no una comparación byte a byte de todos los datos. El respaldo se mantiene sin modificaciones persistentes; todavía no se ha ensayado una restauración de producción.

Se añadió `.vercelignore`: el ensayo de empaquetado de la CLI verificó que no incluía `.audit`, `.env*`, `.git` ni `.vercel`. El despliegue recibió 197 archivos de aplicación. `AUTH_SECRET` está configurado como variable Secret de Production; su contenido no se imprimió. No hay `BOOTSTRAP_TOKEN` configurado.

## Código publicado en Vercel

Código: commit `d2b12a0`. Despliegue [3W97H7y5zwTo4Nh2CLrmEopPLMWZ](https://vercel.com/conamors-projects/intia/3W97H7y5zwTo4Nh2CLrmEopPLMWZ), creado a las 11:00 de Lima en `iad1`. Compilación y validación de tipos correctas con Next 15.5.24 y Prisma 6.19.3; estado `Ready`.

Se preparó con el entorno Production mediante `vercel deploy --prod --skip-domain`. El navegador autenticado en Vercel mostró correctamente el login de ese despliegue, lo que comprobó el arranque con la configuración real y las lecturas que hace esa página. Después, `vercel promote` confirmó la promoción a [intia-lovat.vercel.app](https://intia-lovat.vercel.app/).

Comprobaciones HTTP sobre el dominio público después de promover:

| Petición sin sesión | Resultado |
|---|---|
| `GET /login` | 200, formulario de acceso presente |
| `GET /tareas` | 307 hacia `/login` |
| `GET /api/assets/smoke-unauthenticated` | 401 |
| Alta inicial en login | Sin formulario de creación ni campo de token de instalación |

La pantalla pública también se revisó en el navegador. Google aparece deshabilitado con el mensaje de configuración pendiente; no se cambió esa configuración ni se verificó OAuth real. Se solicitó un nuevo inicio de sesión al usuario para comprobar las sesiones revocables en producción, sin compartir credenciales. No se ejecutaron borrados, importaciones ni cambios de contraseñas de prueba sobre datos reales.

La CLI `vercel curl` presentó un error al reenviar `--global-config` a curl; se utilizó el navegador con acceso a Vercel para comprobar el despliegue preparado y HTTPS directo para las comprobaciones públicas. Esa incidencia de herramienta no fue un error de la aplicación.

## Procedimiento de publicación y comprobaciones pendientes

1. Revisar este cambio, identificar un OWNER activo y comprobar que puede iniciar sesión. Preparar una rama/copia recuperable de Neon y probar allí la actualización.
2. Verificar un `AUTH_SECRET` criptográfico adecuado sin imprimirlo. En una instalación existente, dejar `BOOTSTRAP_TOKEN` vacío o ausente. Avisar del nuevo inicio de sesión necesario.
3. Aplicar **antes de publicar el código** `prisma/operations/security-2026-09-09.sql` a la DB correcta, con conexión administrativa controlada. Añade `User.sessionVersion`, `AuthSession`, `AuthAttempt`, `DemoSeedRecord`, sus índices y el marcador si ya hay dueños. No borra ni clasifica registros existentes.
4. No usar `db push`, `setup`, `db:reset` ni `db:seed` para actualizar producción. El esquema Prisma también contiene candidatos de índices de navegación cuya aplicación no forma parte de este SQL.
5. Publicar el código y comprobar login OWNER/MEMBER, logout, descarga, CSV y permisos. Medir navegación con la nueva consulta de sesión y vigilar errores/contención del login antes de sacar conclusiones sobre rendimiento.

Comando de la actualización, solo después de seleccionar de forma segura la conexión del destino:

```powershell
npx prisma db execute --file prisma/operations/security-2026-09-09.sql --schema prisma/schema.prisma
```

**Reversión:** dejar las columnas/tablas aditivas. Preferir corregir y avanzar conservando la comprobación de sesiones. Volver sin más al código anterior restaura sus carencias y su verificador puede aceptar JWT viejos; una rotación de `AUTH_SECRET` invalidaría todos los tokens, pero no preserva las capacidades de revocación del código nuevo. No ejecutar un rollback automático ni borrar el marcador de bootstrap.

## Reproducir las pruebas de DB

Ambas suites exigen `SECURITY_TEST_DATABASE_URL` en localhost y una base cuyo nombre termine en `_test`. Usar bases nuevas, separadas y desechables. Las suites escriben/borran sus fixtures y no se deben ejecutar sobre una copia con datos personales.

- Seguridad: crear una base vacía; recuperar el esquema anterior con `git show 2ef0ef0:prisma/schema.prisma` en un archivo temporal; aplicar ese esquema con `prisma db push --schema <archivo> --skip-generate`. Insertar el fixture siguiente y ejecutar el SQL de actualización dos veces. Luego configurar `SECURITY_TEST_DATABASE_URL` y ejecutar `npm run test:seguridad:postgres`.
- Demo: en otra base vacía, aplicar el esquema actual con `prisma db push`, ejecutar `npm run db:seed`, configurar `SECURITY_TEST_DATABASE_URL` y ejecutar `npm run test:demo:postgres`. El seed muestra contraseñas ficticias; no publicarlas en informes compartidos.
- Usar `DATABASE_URL` de esa misma base de pruebas en los comandos Prisma y seed. Estas suites requieren preparación desde cero en cada ejecución.

Fixture anterior a la actualización:

```sql
INSERT INTO "User" ("id", "name", "email", "passwordHash", "role", "updatedAt")
VALUES ('migration-owner', 'Migración ficticia', 'migration@example.test', 'fixture-only', 'OWNER', CURRENT_TIMESTAMP);
```

## Fuera de esta entrega

Continúan pendientes el aislamiento real por organización, restricciones y relaciones de DB del resto del dominio, auditoría transaccional de todas las demás acciones, archivos fuera de PostgreSQL, recuperación/restauración ensayada de producción y nuevas mediciones de navegación. Los puntos 1/2 refuerzan esta instalación; no convierten el filtro de marca en una frontera de seguridad.

## Referencias consultadas

La descarga forzada y la validación por varias señales siguen las recomendaciones de [OWASP para cargas de archivos](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html) y [cabeceras HTTP](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html). La confianza en el encabezado de IP se limita al comportamiento documentado por [Vercel para request headers](https://vercel.com/docs/headers/request-headers).
