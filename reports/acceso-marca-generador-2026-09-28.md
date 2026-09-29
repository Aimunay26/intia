# Acceso a la marca al generar guiones — 28/09/2026

## Estado

**Prueba real en producción satisfactoria con la cuenta afectada; la causa del
rechazo anterior continúa sin confirmar.** Se implementaron y validaron mejoras
del formulario y de observabilidad. No se han commiteado, publicado ni desplegado
en este trabajo. La prueba autorizada creó un trabajo y su guion en producción;
no se cambiaron el esquema de Neon, las credenciales ni los permisos de usuarios.

## Evidencia confirmada

- Cuenta reportada (correo omitido en el repositorio): nombre Con Amor, rol Equipo.
  La ficha de Equipo publicada muestra el perfil Guionista / creativo y acceso
  marcado a Con Amor, además de otros perfiles y marcas. Se cerró sin guardar.
- Marca Con Amor: `cmtlzdlfs004bsoy410le8btt`. El identificador de la opción del
  generador coincide con el de la asignación mostrada en Equipo.
- El usuario confirmó que **Con Amor estaba seleccionada en Identidad y producto**
  cuando apareció el error. No atribuir ese intento al caso «Sin marca».
- Vercel muestra el despliegue de producción `ad429e0785f8a76d4262aec52142bf06679b52b5`
  como Ready. El intento del 28/09, 11:06:53 de Lima, registra un error en `enqueue`
  a las 11:06:55, con traza `947cb1ad-2040-4802-9c47-ac5bc643cb3f`, duración 1,11 ms,
  motivo `unknown` y versión `ad429e0785f8`. No se llegó al proveedor de IA.
- Ese mensaje en el registro de solicitudes procede de `assertBrandPermission`.
  Se produce si un miembro envía una marca vacía o una que no está entre las marcas
  de su sesión. Los logs publicados no registran cuál de esos casos ocurrió.
- `getSession()` vuelve a consultar perfiles y marcas en la base de datos por
  petición. La cookie de marca activa sirve para filtrar; no concede permisos.
- La prueba de navegador local con la compilación anterior, una cuenta de equipo
  con dos marcas y selección manual de Con Amor QA **sí pasó la autorización** y
  encoló la solicitud. Por tanto, no se ha reproducido aún el rechazo específico
  del usuario. La primera respuesta simulada de esa prueba duraba 5 segundos para
  un pedido de 10 y fue rechazada por validación de salida; se corrigió el dato
  ficticio antes de la prueba final. Esto no era un fallo de permisos.

## Cambios preparados

1. El envío establece explícitamente `marca` a partir del estado que muestra el
   resumen, antes de calcular la clave de idempotencia. Un campo oculto restaurado
   o alterado por el navegador no sustituye la selección visible. Es una protección
   defensiva; no se ha demostrado que ese desajuste causara el intento reportado.
2. Equipo necesita una marca autorizada para avanzar desde Identidad y producto y
   para enviar. Volver a esa etapa y quitarla también deshabilita el envío final.
3. Con una sola marca disponible se preselecciona. Con varias no se elige una
   arbitrariamente. Se conserva la prioridad de la marca del video y las selecciones
   válidas existentes. Sin marcas activas asignadas se explica cómo obtener acceso.
4. El servidor distingue «Elige una marca» de una marca no autorizada. Un video
   autorizado sigue aportando su marca. Dueño conserva los guiones generalistas.
5. Se añade `generation_trace.stage=brand_access`, con `brandSelected`,
   `brandAuthorized` y `authorizedBrandCount`. No registra IDs de usuario o marca,
   correos, prompts ni credenciales. La validación de autorización sigue intacta.

## Validación local

- 37 pruebas unitarias pasan: acciones, formulario, ocho escenarios de selección
  inicial, permisos y trazas. Incluye campo oculto desincronizado y exclusión de
  información privada de los logs.
- 37 pruebas PostgreSQL pasan (incluye el contenedor padre de la suite): la marca
  autorizada se guarda, la ajena se rechaza sin crear trabajo ni llamar a IA, el
  video aporta su marca y Dueño puede generar sin marca.
- Prueba de navegador sobre compilación de producción y PostgreSQL local aislado:
  cuenta Equipo con dos marcas, bloqueo sin marca, selección de Con Amor QA,
  recorrido completo, regreso a Identidad, eliminación de selección y bloqueo
  del botón final. Después de volver a elegir Con Amor QA: **1 trabajo completado,
  1 guion guardado con esa marca y ese autor, 1 llamada simulada y 0 llamadas reales**.
- La nueva traza registró `brandSelected=true`, `brandAuthorized=true`,
  `authorizedBrandCount=2` en ese recorrido.
- Compilación, ESLint y TypeScript correctos. `git diff --check` sin errores.

Los datos de prueba y su contenedor son efímeros. Las pruebas no usaron las claves
ni documentos reales del proyecto. Los cambios previos de diagnóstico de Gemini
que ya estaban en el directorio se conservaron.

## Prueba con la sesión afectada en producción

El 28/09/2026, después de que el usuario iniciara sesión directamente en el
navegador, Mi perfil confirmó la misma cuenta (correo omitido), nombre Con Amor, con el
perfil Guionista / creativo y los demás perfiles ya asignados.

- Se abrió `/generador` sin parámetros. En Identidad y producto apareció Con Amor
  entre las ocho marcas disponibles. Se eligió explícitamente y el resumen final
  conservó «Con Amor · Sin actor asignado» al avanzar por todas las etapas.
- El formulario publicado tenía un único campo oculto `marca`, habilitado y
  asociado al mismo formulario que el botón de envío. Esto verifica su presencia,
  no demuestra por sí solo qué valor recibió el servidor en el intento anterior.
- El usuario autorizó una solicitud real con Gemini, incluida la ficha y las
  referencias aplicables, su consumo de API y el guardado del resultado.
- Pedido: Cámara Escondida, poleras para parejas, 30 segundos, guion suelto,
  sin actor, ángulo estándar y cierre de comunidad sin pedido. Idea enviada:
  «Prueba de acceso: una persona sorprende a su pareja con poleras que combinan
  y ambos se ríen al descubrirlo. Guion breve, sin precios ni promociones.»
- Se envió una sola solicitud alrededor de las 12:08 de Lima. Trabajo:
  `cmuli45ln0001jy04wxssiwty`. La pantalla pasó a Generando y luego a
  **Completado · 1 de 1 guiones**, con última etapa Finalizado y modelo
  `gemini-3.8-flash`, origen selección, referencias utilizadas 0 de 0.
- Se abrió el resultado guardado:
  [Cámara oculta: Sorpresa en match a mi novia](https://intia-lovat.vercel.app/guiones/cmuli4k3v0001jl04e7mun5qx).
  La ficha confirmó **Con Amor · 30 s · 4 escenas**, estado Borrador, y permitió
  consultar las escenas desde la misma cuenta. No se vinculó a un video existente.
- No se ejecutaron reintentos manuales ni se alteraron permisos. El modelo final
  observado fue el solicitado; no se consultó la facturación ni el número exacto
  de llamadas internas en esta comprobación.

La generación funcionó en la versión publicada, sin aplicar antes los cambios
locales. Por ello, no atribuir el éxito a esos cambios ni afirmar que se corrigió
una causa demostrada: únicamente se confirma que el rechazo no se reprodujo con
esta sesión recién iniciada y este recorrido. El inicio de sesión nuevo y la
selección realizada son condiciones distintas del intento original, no una prueba
de que la causa fuera la sesión o una marca vacía.

## Seguimiento pendiente

Publicar las mejoras preparadas cuando se solicite. Tras publicar el ajuste,
un intento que vuelva a fallar podrá distinguirse en
`brand_access`: marca ausente, marca enviada pero no autorizada, o acceso correcto
seguido de otra validación. Antes de atribuir una causa definitiva al incidente,
contrastar ese resultado con la sesión y selección reales.

## Integración en `release/operacion-equipos` (28/09/2026)

Estos cambios se revisaron e integraron en la rama de release, junto con el catálogo de
productos del paso 2:

- El avance del paso 2 exige una ficha o un producto escrito **y**, para Equipo, una marca
  autorizada. El motivo del botón bloqueado dice primero que falta la marca.
- En el servidor, la marca ausente de Equipo se comprueba antes de leer una ficha del
  catálogo: Equipo recibe «Elige una marca para generar el guion.» y el Dueño sin marca con
  una ficha sigue recibiendo «Elige la marca del producto antes de generar.».
- La marca ausente también se registra en `brand_access` (`brandSelected=false`) desde la
  acción, que responde antes de encolar; así el seguimiento de la sección anterior puede
  distinguir los tres casos.
- El correo de la cuenta se omitió de este informe.
