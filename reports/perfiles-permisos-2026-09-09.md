# Perfiles de trabajo y permisos predeterminados

Estado: implementado en la rama `codex/team-profile-permissions`. Esta entrega no se ha aplicado a Neon ni desplegado en Vercel. Sustituye la autorización operativa genérica de `MEMBER`; conserva los niveles administrativos `OWNER` y `MEMBER`.

## Perfiles

Todos conservan inicio, ayuda y Mi perfil. Los permisos de varios perfiles se suman, sin conceder administración. Los datos de trabajo requieren una marca autorizada; cámara, talento, editor y diseñador requieren además una asignación al video o tarea.

| Perfil | Secciones adicionales | Permisos predeterminados |
|---|---|---|
| Estrategia y coordinación | Calendario, Videos, Tareas, Marcas, Guiones, Estructuras, Personas, Métricas | Planifica videos, organiza tareas y participantes, edita identidad y catálogos creativos, aprueba contenido y guiones. Métricas de lectura. |
| Guionista / creativo | Calendario, Videos, Tareas, Marcas, Generador IA, Guiones, Estructuras, Personas | Genera guiones, edita los propios o los de videos donde esté asignado como guionista, vincula guiones y consulta referencias. No aprueba. |
| Producción | Calendario, Videos, Tareas, Guiones | Organiza agenda y logística, asigna participantes y tareas, completa grabación. Guiones de lectura. |
| Filmmaker / cámara | Calendario, Videos, Tareas, Guiones | Consulta sus videos, completa checks de grabación y actualiza sus tareas. Guiones de lectura. |
| Talento / actor / voz | Calendario, Videos, Tareas, Guiones, Personas | Consulta sus grabaciones y guiones; actualiza sus tareas. En Personas solo ve su perfil creativo asignado. |
| Editor audiovisual | Calendario, Videos, Tareas, Guiones | Trabaja en videos asignados, actualiza edición, checks y tareas; consulta guiones. |
| Diseñador | Videos, Tareas, Marcas, Estructuras | Consulta identidad y referencias; trabaja en recursos y checks de diseño de videos asignados. |
| Publicación / community manager | Calendario, Videos, Tareas, Marcas | Ve videos con revisión final aprobada, guarda su programación y enlace, publica y completa checks de publicación. |
| Analista de resultados | Videos, Tareas, Marcas, Métricas | Consulta contenido y resultados; registra/corrige semanas e importa CSV de marcas autorizadas. |

Solo el Dueño entra a **Equipo, Actividad y Ajustes**, administra cuentas y asigna permisos. Crear/archivar marcas, administrar columnas compartidas y aplicar informes de branding que crean entidades también quedan bajo su control. Se conserva la regla de que eliminar entidades completas exige Dueño. Quitar checks, escenas y asignaciones o desvincular un guion exige el permiso operativo correspondiente y acceso al padre.

## Reglas de alcance

- `UserWorkProfile` guarda los perfiles combinables; `UserBrandAccess` guarda las marcas autorizadas. Ambas tablas tienen claves compuestas, índices y claves foráneas. Un CHECK rechaza perfiles desconocidos.
- `Assignment.role` describe la participación en un video; no concede por sí solo permisos de aplicación. Ser asignado a un video de otra marca no permite verlo sin autorización sobre esa marca.
- Un perfil de analista combinado con editor permite consultar métricas de la marca, pero la edición de video sigue limitada a sus asignaciones. Un perfil de publicación combinado con cámara no permite editar cualquier video sin asignación.
- Las tareas sin marca solo son visibles al responsable; los eventos personales, a su creador. Coordinación y producción pueden crear tareas personales propias o tareas de marcas autorizadas.
- Guiones sin marca quedan para el Dueño. Los miembros deben elegir una marca al generar. La lectura de un guion por cámara, talento o editor requiere un video asociado y asignado.
- Estructuras y perfiles creativos son catálogos compartidos dentro de esta instalación. El permiso Personas permite a coordinación y guionistas consultar ese catálogo; talento solo accede a su ficha. No habilita la administración de cuentas.
- La cookie de marca activa filtra dentro del conjunto autorizado. Alterarla no amplía acceso. Los listados de miembros usan filtros antes de contar o paginar.

## Aprobación y publicación

El estado de video `APROBADO` ya forma parte de la preparación del guion y no se confunde con la aprobación del video terminado. Publicación requiere el check de postproducción **Revisión final aprobada**, completado por un usuario con permiso de aprobación. Sus variantes de nombre deben contener `final` y `aprobad`.

El guionista no aprueba su guion. Un guion aprobado debe ser reabierto por coordinación antes de editar sus datos o escenas. Un video con revisión final aprobada o ya programado/publicado requiere retirar la aprobación y reabrirlo antes de modificar su contenido. La aprobación no se obtiene por asignarse una función o enviar otro estado desde el navegador. Los permisos de perfiles combinados son acumulativos: una persona que tenga coordinación y guionista sí conserva ambas facultades.

## Seguridad aplicada

La política compartida está en `src/lib/permissions.ts` y los filtros de registros en `src/lib/access-scope.ts`.

1. La navbar muestra las secciones autorizadas. Las páginas verifican también el acceso directo por URL.
2. Los miembros cargan vistas de trabajo que no ejecutan las consultas globales de administración. Los botones y formularios dependen de los permisos sobre el registro concreto.
3. Las Server Actions comprueban capacidades, marca, asignación y reglas de estado dentro de la transacción autenticada. Los filtros del cliente no sustituyen estas comprobaciones.
4. Las descargas y escrituras de archivos validan el recurso propietario. Los documentos personales de otra cuenta requieren Dueño. La API rechaza archivos no autorizados antes de obtener sus bytes privados.
5. CSV, paginación de tareas y generaciones de IA comprueban acceso en el servidor. Los resultados de trabajos de IA también se filtran por las marcas actualmente autorizadas.
6. Cambiar perfiles o marcas incrementa `sessionVersion` y elimina las sesiones mediante triggers de PostgreSQL, incluso cuando el cambio se realiza por SQL. Las acciones en vuelo vuelven a verificar la versión al comenzar su transacción; los trabajos de IA la verifican antes de llamar al proveedor y antes de persistir.
7. La administración de permisos se audita atómicamente. Guardar las mismas asignaciones no revoca sesiones innecesariamente. Un miembro no puede elevar sus permisos desde Mi perfil.

Los permisos y marcas se recuperan con subconsultas indexadas dentro de la consulta existente de sesión; se conserva la deduplicación por render de React. No se añade una consulta de autenticación por cada botón. Esto no constituye una medición de latencia en Vercel.

**Límite de arquitectura:** se trata de autorización de aplicación para una instalación compartida. No añade organizaciones, aislamiento multitenant ni RLS. Las credenciales directas de la base de datos siguen siendo administrativas. Los catálogos globales no están aislados entre organizaciones.

## Activación pendiente en Neon y Vercel

La migración es aditiva y no asigna perfiles a personas reales por inferencia. Los Dueños conservan acceso completo. Un miembro sin perfiles conserva solo inicio, ayuda y Mi perfil. El Dueño configura perfiles y marcas desde Equipo; cada cambio solicita un nuevo inicio de sesión.

La compilación nueva usa `application_name=intia-profiles-20260910`. **No basta con hacer merge y esperar el despliegue automático:** la producción anterior usa otro identificador de compatibilidad y no entiende la nueva política.

1. Revisar qué perfiles y marcas corresponden a cada persona. Ensayar la migración y los recorridos con una copia reciente, dentro de los límites gratuitos ya acordados.
2. Proteger o retirar los despliegues anteriores que puedan consultar la misma base de producción. La guarda SQL de despliegue bloquea escrituras; no bloquea lecturas de aplicaciones antiguas ni convierte la DB en multitenant.
3. Detener escrituras con la guarda operativa existente y verificar el respaldo. Evitar despliegues automáticos simultáneos; esta rama tiene el preview pausado en `vercel.json`.
4. Con la conexión de operación autorizada, aplicar `prisma/migrations/20260910010000_team_work_profiles/migration.sql` mediante `prisma migrate deploy`. Reinstalar `prisma/operations/deployment-gate.sql` para cubrir también las tablas nuevas.
5. Ejecutar `prisma/operations/activate-team-profiles.sql`. Deja mantenimiento cerrado, cambia la versión admitida y revoca las sesiones emitidas por builds anteriores. Requiere `application_name=intia-migrator-20260909` y al menos un Dueño activo.
6. Promover la compilación compatible y comprobar su estado. Reabrir la guarda para esa versión, entrar como Dueño y configurar perfiles/marcas. Se pueden precargar las asignaciones revisadas durante mantenimiento para evitar una interrupción de trabajo de los miembros.
7. Verificar con cuentas de prueba acceso permitido y denegado, archivos, una tarea, un guion, una carga semanal y la revocación de acceso. Registrar los identificadores reales del despliegue y la migración. No presentar los ensayos locales como comprobación en Neon.

Para retroceder, cerrar mantenimiento primero. No promover una aplicación anterior y reabrirla con la misma base como si mantuviera estos permisos. La retirada de la política requiere una decisión explícita; las tablas adicionales pueden conservarse.

## Validación local

- `npm test`: 38 pruebas unitarias, incluidos los nueve perfiles, unión de capacidades, rutas y límites de alcance.
- `npm run test:postgres`: las siete suites suman 69 pruebas, con migraciones, sesiones firmadas, acciones reales, SQL de permisos, revocación y compatibilidad de despliegue. IA y Blob de las suites de integración están simulados.
- `npm run typecheck` y `npm run build`: correctos; la compilación mantiene avisos anteriores de lint y Workflow/Vercel Queue.
- `npm run test:perfiles`: recorrido contra Next compilado y PostgreSQL efímero, con Dueño, nueve perfiles y una cuenta sin perfiles. Verifica alta de una cuenta con sus permisos y auditoría, navbar, páginas permitidas, fichas, URL administrativa denegada, descarga rechazada y actualización real de un check de edición. No usa Neon ni consume IA/Blob. Está integrado en CI.
- `npm run db:ensayo`: actualización de datos anteriores, permisos inicialmente vacíos y revocación al asignarlos; respaldo y restauración de 31 tablas con filas y esquema iguales. Ensayo con datos ficticios locales.
- `npm run test:workflow`: cola local del SDK ejecutada y guion recuperado desde una respuesta ficticia, sin llamadas reales a IA ni Blob.
- `BENCH_SAMPLES=1 npm run perf:local`: recorrido funcional y conservación del borrador ante una edición concurrente. No se utiliza esta muestra para afirmar mejoras de rendimiento ni calcular un p95 representativo.
- `npm audit --audit-level=moderate`: cero vulnerabilidades reportadas.

Los resultados y capturas locales se guardan en `.audit/profiles-ui.json`, `.audit/profiles-owner.png` y `.audit/profiles-editor.png`, fuera del repositorio. La operación de producción sigue pendiente.
