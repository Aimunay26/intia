# Auditoría de simplicidad — 02/10/2026

**Meta del Dueño:** que un niño de menos de 10 años entienda y use el Manual y toda ALSOS. Con pocas palabras. Sin perder información.

**Cómo se hizo:** 9 revisiones, una por zona de la app. Se leyó el código y cada texto que ve la gente. Se jugó a ser un niño de 9 años que lee cada pantalla. No se cambió nada. No se tocó la base de datos. No se abrió la app en el navegador.

---

## 1. En pocas palabras

**Nota general: 34 de 100.**
La pregunta fue: ¿un niño de 9 años lo entiende y lo usa solo?

- Un adulto de marketing usa ALSOS bien. Un niño, todavía no.
- Las frases no son largas: miden de 7 a 12 palabras en promedio.
- El problema está en 5 cosas:
  1. **Demasiado a la vez.** Una lección muestra unas 200 palabras en 6 bloques. La ficha de un video tiene unos 70 botones y campos. El inicio del Dueño tiene 11 botones azules.
  2. **Palabras de experto sin explicar.** CTA, hook, brief, fps, Log, ROAS, lead, ATC… No hay glosario.
  3. **Una cosa, muchos nombres.** Rol, perfil, panel y cargo son lo mismo. «Formato» y «estructura», también.
  4. **No dice qué tocar ni qué pasa después.** En el Manual, el botón grande salta al tema siguiente y el niño se salta lecciones. Al terminar un guion, el botón grande dice «Nueva generación».
  5. **Reglas que chocan.** Un manual dice «borra la tarjeta con 3 copias». Otro dice «con 2».
- Hay piezas muy buenas para copiar: «Mi trabajo», los botones «Listo», las guías por equipo y el 3D «Correcto / Incorrecto».
- Casi todo se arregla con textos y orden. Es de riesgo bajo.
- Solo 2 cambios tocan datos guardados: el progreso del Manual y los nombres de la lista de pasos de cada video. Esos van con más cuidado.

---

## 2. Notas por zona

| Zona | Nota | En una línea |
|---|---|---|
| Generador IA y guiones | 42 | Lo mejor: 5 pasos con preguntas. Falla en jerga y no hay botón «Abrir mi guion». |
| Menú, inicio y «Mi trabajo» | 38 | «Mi trabajo» va bien. El Dueño ve 11 botones azules y 4 nombres para «rol». |
| Producción (videos, calendario, tareas, métricas) | 36 | El calendario funciona. La ficha del video tiene unos 70 controles y hay 2 borrados sin pregunta. |
| Administración y ayuda | 34 | Buenos mensajes vacíos. Ajustes parece de programador y falta la 404 en español. |
| Manual: Dueño y Guionista | 33 | Correcto y peruano. Pero unas 200 palabras por lección, siglas sin explicar y prácticas en una marca archivada. |
| Manual: Filmmaker y Actor | 32 | Técnica excelente. Pero el 3D muestra coordenadas y la seguridad se enseña al final. |
| Pantallas del Manual | 30 | El rol se encuentra fácil. Pero no hay progreso, «Siguiente» es chico y el 3D tiene 18-24 botones. |
| Manual: Community, ATC y guías de equipo | 30 | La crisis está escondida. «ATC» y «lead» nunca se explican. |
| Manual: Editor y Jefe de editores | 28 | 7 reglas chocan entre los dos. Una es de seguridad (3 o 2 copias). |

Promedio del Manual: **31**. Promedio del resto de la plataforma: **38**.

---

## 3. Los 15 cambios que más ayudan

Orden: primero lo que más ayuda y menos cuesta.
Esfuerzo: **Bajo** = 1-2 días · **Medio** = 3-5 días · **Alto** = 1 a 4 semanas.
Cada «después» guarda la misma información que el «antes».

### 1. Un solo botón grande: «Siguiente lección →»
- **Por qué:** hoy «Siguiente» es chico y gris. El único botón grande lleva al tema siguiente. El niño lo toca y se salta lecciones. Al final del nivel dice «Volver al nivel →», con flecha hacia adelante. El botón «!» parece una alerta.
- **Antes:** «Anterior» «Siguiente» (chicos y grises) · botón grande: «{tema siguiente} →»
- **Después:** botón grande «Siguiente: Postura base →». En la última lección: «🎉 ¡Terminaste este tema! Ir al tema 2: Mirada y lente →». Al final del nivel: «🏁 ¡Nivel Principiante listo! Empezar Intermedio →». Se quita el «!».
- **Esfuerzo:** Bajo · **Impacto:** muy alto
- **Dónde:** `src/components/manual/module-lessons.tsx:180-188, :238-245` · `src/app/(app)/manual/[rol]/[modulo]/page.tsx:93-101`

### 2. Seguridad primero
- **Por qué:** borrar una semana de métricas o un paso no pregunta nada. Borrar marca, persona o producto no dice «no se puede deshacer». «Sí, eliminar» no es rojo. «Formatear borra todo» va en letra chica. «Poner límites» y «Seguridad en set» se enseñan recién en Avanzado. El 3D usa el rótulo «sumiso/dama».
- **Antes:** botón «Eliminar» sin ventana de pregunta. / «Se borrará la marca con sus {N} videos, sus objetivos, sus productos y combos…»
- **Después:** «¿Borrar la semana del 7 set (TikTok)? No se puede deshacer.» [Cancelar] [Sí, borrar] / «Se borran PARA SIEMPRE: la marca, sus {N} videos, metas, productos, combos y guiones. No se puede deshacer. ¿Solo quieres esconderla? Usa «Archivar».» (botón rojo)
- **Esfuerzo:** Bajo · **Impacto:** muy alto
- **Dónde:** `contenido/[id]/metrics-form.tsx:66` · `contenido/[id]/checklist.tsx:197-208` · `marcas/[id]/page.tsx:265` · `equipo/user-form.tsx:551` · `marcas/[id]/products.tsx:304` · `guias.ts:1218-1219` · `actor.json:3190-3201` · `filmmaker.json:4518-4519` · `manual-scene.ts:183, :227`

### 3. Corregir lo que hoy es falso o no tiene salida
- **Por qué:** un niño cumple todo al pie de la letra. El importador dice que hay 2 columnas obligatorias; son 3, y la fecha debe ser lunes. Su propio ejemplo falla. Mi perfil dice que la IA lee tus documentos; no los lee. Un gatillo dice que «una razón inventada funciona»: choca con las reglas de publicidad. Un enlace viejo abre una 404 en inglés.
- **Antes:** «Solo fecha y video son obligatorias.» / «Incluso una razón inventada o de celebración funciona.»
- **Después:** «Obligatorias: semana (un lunes), plataforma y video. Si otra columna falta o está vacía, no cambia nada. Escribe 0 para poner cero.» / «Usa siempre una razón real: un aniversario, un lanzamiento o una causa.» / «No encontramos esta página. Quizás la borraron o la archivaron.» + «Volver al inicio».
- **Esfuerzo:** Bajo · **Impacto:** alto
- **Dónde:** `metricas/import-form.tsx:132, :218-224` · `components/assets.tsx:147` · `lib/script-angles.ts:405` · `app/not-found.tsx` (nuevo) · `filmmaker.json:1121` · `actor.json:1339`

### 4. Esconder lo que es solo para el técnico
- **Por qué:** se ven nombres de configuración, «canario», STRATEGY, WRITER, EDICION, B22, cron y fechas como 2026-10-02T05:00:00.000Z. El 3D muestra coordenadas en más de 60 de 106 escenas.
- **Antes:** «Se enciende con PRODUCTION_CHAIN_ENABLED=true…» / «Trípode a la altura del pecho en (0,1.30,1.3), lente de 48 mm (FOV vertical de unos 43°)…»
- **Después:** «La enciende quien administra la instalación.» / «Cámara en trípode, a la altura del pecho, a 1,3 m de la persona. Zoom 2x.» Las coordenadas siguen en el archivo para dibujar, pero no se ven.
- **Esfuerzo:** Bajo-Medio · **Impacto:** alto
- **Dónde:** `cadena/page.tsx:49, :97` · `scene-viewer.tsx:2807-2819` · `module-lessons.tsx:212` · `operations-status.tsx:20-24` · `ajustes/page.tsx:113` · `global-error.tsx:255-284` · `help.tsx:100-117`

### 5. Una sola regla para lo que se contradice
- **Por qué:** los manuales chocan en seguridad y ley. Con el formato del Dueño, «S/ 1,500» se lee «uno y medio». El niño no sabe cuál cumplir. Primero decide el Dueño (sección 4).
- **Antes:** Editor: «Solo cuando existan las 3 copias… ya puede formatear su tarjeta» / Jefe: «…hasta tener 2 copias verificadas».
- **Después:** el mismo texto en los dos, guardado una sola vez: «No borres la tarjeta ni el celular hasta tener 3 copias revisadas: computadora, disco externo y nube. Recién ahí dile al filmmaker: ya puedes borrar.»
- **Esfuerzo:** Medio · **Impacto:** muy alto
- **Dónde:** `editor.json:158` · `jefe-de-editores.json:562` · `dueno.json:917, :1825, :1949` · `guionista.json:663, :1291` · `src/content/manual/reglas.ts` (nuevo)

### 6. Página del rol: «Empieza aquí» y emergencias a la vista
- **Por qué:** hay que bajar 460-650 palabras antes de la primera lección. La crisis de Community es el paso 18 de 18, escondido.
- **Antes:** Misión → Procedimiento → Recibe de y entrega a → Indicadores → recién abajo «Formación».
- **Después:** arriba, «▶ Empezar lección 1». Caja roja fija: «¿CRISIS? En orden: 1) Mira qué tan grave es: nivel 1, 2 o 3. 2) Pausa lo programado y los anuncios. 3) Pide a coordinación poner esas fichas en PAUSADO. 4) Avisa al dueño. 5) En 30 min o menos, publica el mensaje de espera aprobado. 6) Da noticias cuando lo prometiste. 7) Al final, escribe qué pasó y qué aprendimos.» Lo demás, plegado.
- **Esfuerzo:** Bajo · **Impacto:** alto
- **Dónde:** `manual/[rol]/page.tsx:83-146` · `community-manager.json:42` · `atc.json:25-31`

### 7. Cada lección en 3 tarjetas
- **Por qué:** hoy se ven 6 bloques y unas 200 palabras juntas (hasta 564). La «Checklist» trae ✓ verdes ya puestos. Los videos van antes que las lecciones; 59 de 417 están en inglés sin aviso.
- **Antes:** Objetivo · Pasos · Errores comunes · Checklist · Práctica · Criterio de aprobado.
- **Después:** Tarjeta 1: «🎯 Vas a lograr» + «👣 Hazlo así». Tarjeta 2: «👀 Mira» + «⚠️ No hagas esto». Tarjeta 3: «💪 Ahora tú» + «☐ Revisa» + «🏆 Lo lograste si…». Videos debajo, con chip «En inglés».
- **Esfuerzo:** Medio · **Impacto:** muy alto
- **Dónde:** `module-lessons.tsx:47-99` · `lib/manual.ts:128-134` · `manual/[rol]/[modulo]/page.tsx:69-80`

### 8. Un nombre para cada cosa y un glosario que se toca
- **Por qué:** una idea tiene hasta 5 nombres. «Camaleón» es formato y también ángulo. El día de publicar tiene 4 nombres. Un manual dice «gancho» y otro «hook».
- **Antes:** «Tus paneles» · «Tus perfiles» · «Tu rol:» · «Paneles por rol» · «Panel».
- **Después:** siempre «rol» e «Inicio». Siempre «Día de publicar» y «video». En el Manual, «gancho» va subrayado: al tocarlo dice «inicio que atrapa (primeros 3 segundos)».
- **Esfuerzo:** Medio · **Impacto:** alto
- **Dónde:** `src/lib/glossary.ts` (nuevo) · `role-nav.ts` · `permissions.ts` · `member/home.tsx:152` · `help.tsx:259` · `format-step.tsx:78` · `constants.ts` · `content-form.tsx:250, :392`

### 9. Estados con ícono y frase, y siempre «qué pasa después»
- **Por qué:** ¿«Grabación» es grabando o ya grabado? Al cambiar algo no sale ningún aviso. El botón «Publicado» parece una etiqueta.
- **Antes:** Idea · Guion · Aprobado · Grabación · Edición · Programado · Publicado · Pausado · Cancelado.
- **Después:** 💡 Idea · ✍️ Escribiendo guion · 👍 Guion aprobado · 🎥 Grabando · ✂️ Editando · 📅 Listo para subir · ✅ Publicado · ⏸️ En pausa · ✖️ Cancelado. Después de un cambio: «✓ Listo. Ahora le toca a Ana (edición, para el jue 9).» Botón: «Listo, ya lo publiqué».
- **Esfuerzo:** Bajo · **Impacto:** alto
- **Dónde:** `constants.ts:86-141` · `workflow-status-fields.tsx:12-18` · `step-copy.ts:46, :66, :73, :79`

### 10. El Manual al día con la app
- **Por qué:** las prácticas mandan a «Con Amor», archivada el 30/09 (83 menciones). 67 lecciones dicen «Plantilla» y no hay archivo. No se nombra el botón real «Listo, enviar al filmmaker».
- **Antes:** «En Con Amor, encuentra el objetivo vigente, el último video publicado, la tarea más atrasada y el último cambio registrado en Actividad.»
- **Después:** «En tu marca, busca 4 cosas: 1) la meta del mes, 2) el último video publicado, 3) la tarea más atrasada, 4) el último cambio en Actividad.» / «Al terminar, toca «Listo, enviar al filmmaker». Antes, deja una nota: objetivo, avatar, gancho B, destino y riesgos.»
- **Esfuerzo:** Medio · **Impacto:** alto
- **Dónde:** `dueno.json:28, :148, :650` · `guionista.json:23, :135, :855` · `module-lessons.tsx:200`

### 11. Generador en modo fácil y «Abrir mi guion»
- **Por qué:** se ven 17 decisiones; solo 2 son obligatorias. Al terminar, el guion es un enlace chico y el botón grande dice «Nueva generación».
- **Antes:** enlace pequeño «{título} →» + botón grande «Nueva generación».
- **Después:** «✅ ¡Tu guion está listo!» + botón grande «📄 Abrir mi guion». «Crear otro guion» queda secundario. Proveedor, modelo y duración en «Opciones avanzadas (ya vienen listas)». Duración: «Corto 30 s · Medio 45 s · Largo 60 s · Otro (10–300 s)».
- **Esfuerzo:** Medio · **Impacto:** alto
- **Dónde:** `generador/trabajos/[id]/progress.tsx:78-111` · `generator-form.tsx:703-733, :1009-1032` · `format-step.tsx:104-148`

### 12. Ficha del video: «Ahora toca» arriba
- **Por qué:** unos 70 controles a la vez. En la ficha del Equipo, «Listo» está en el 6.º bloque.
- **Antes:** Datos · Aprobaciones · Checklist · Pasos · Guion · Comentarios · Equipo · Métricas · Historial (todo abierto).
- **Después:** «Ahora toca: ✂️ Editar · Lo tiene: Ana · Para: jue 9» + 1 botón grande. Debajo, pestañas: Datos | Pasos | Equipo | Números | Charla | Historial.
- **Esfuerzo:** Medio · **Impacto:** alto
- **Dónde:** `contenido/[id]/page.tsx:232-597` · `member/content.tsx:48, :63-78`

### 13. Inicio del Dueño y menú más cortos
- **Por qué:** más de 80 cosas para tocar y 11 botones azules. El menú tiene 23 enlaces y 10 cabeceras.
- **Antes:** 10 tarjetas de rol, cada una con su botón azul.
- **Después:** 1 botón azul «Nuevo video». Debajo, «Lo que te toca». Una fila: «Idea 4 → Guion 2 → Grabar 3 → Editar 1 → Publicar 2». Menú en 5 grupos: Hoy · Videos · Crear · Marcas y equipo · Aprender.
- **Esfuerzo:** Medio · **Impacto:** alto
- **Dónde:** `app/(app)/page.tsx:223-258` · `role-panel-cards.tsx` · `role-counts.ts:76-91` · `role-nav.ts:48-78`

### 14. Textos largos → listas y tablas, con un control automático
- **Por qué:** misiones de 56 a 94 palabras. Pasos de hasta 104. Principiante es más largo que Avanzado. Legibilidad 69-74; para primaria se pide 80 o más.
- **Antes:** «T-20 min – Configuración: 9:16 (16:9 solo si la ficha dice YouTube), 4K a 60 fps…» (104 palabras).
- **Después:** «20 min antes, revisa: ☐ Vertical 9:16 ☐ 4K 60 ☐ Log ☐ FPS automático apagado ☐ 1/120 ☐ Color fijo ☐ Foco y luz fijos en los ojos ☐ Trípode al pecho ☐ Micrófono probado (-12 a -6 dBFS) ☐ Silencio». Las excepciones, en una nota.
- **Esfuerzo:** Alto · **Impacto:** muy alto
- **Dónde:** `src/content/manual/roles/*.json` · `guias.ts` · `scripts/manual-content.mjs`

### 15. Progreso visible: «✓ Terminé esta lección»
- **Por qué:** nadie sabe cuándo terminó. No hay botón, ni ✓, ni barra. Toca la base de datos: es core.
- **Antes:** lista con ✓ verdes ya puestos; «Criterio de aprobado» sin acción.
- **Después:** casillas vacías + botón «✓ Terminé esta lección». La lista muestra ✓, el tema «2 de 6 hechas» y el inicio «Continuar: lección X».
- **Esfuerzo:** Alto · **Impacto:** alto
- **Dónde:** `module-lessons.tsx:75-96` · `app/(app)/manual/**` · `lib/manual.ts` · `manual-card.tsx`

---

## 4. Decisiones que necesita el Dueño

Antes de reescribir, el Dueño elige **una sola regla** para cada caso.

| # | Tema | Una parte dice | Otra parte dice |
|---|---|---|---|
| 1 | Copias antes de borrar la tarjeta | Editor: 3 copias | Jefe de editores: 2 copias |
| 2 | Menores en Cámara Escondida | Dueño: evitarlos | Guionista: con permiso de los padres |
| 3 | Zonas seguras | Dueño: 14 % arriba, 6 % a los lados · Editor: 269 y 672 px | Guionista: 10 % arriba, 120-150 px a la derecha · Jefe: 130 y 480 px |
| 4 | Velocidad de lectura | Dueño: 5 a 10 palabras por segundo | Guionista: máximo 3 |
| 5 | Formato de números | Guionista: 2,5 y 1.000 | Dueño: 1.18 y 1,500 |
| 6 | Carpetas del video | Editor: 7 carpetas, MARCA_FECHA | Jefe: 8 carpetas, FECHA_MARCA |
| 7 | Nombre de archivo | Editor: V1 | Jefe: v01 y _FINAL_TT |
| 8 | Rondas de revisión | Editor: 2 rondas | Jefe: 3 capas (v01, v02, v03) |
| 9 | Música bajo la voz | Editor: 12-18 dB | Jefe: 10-20 dB |
| 10 | Volumen final (LUFS) | Editor: -14 ±1; solo voz -16 a -14 | Jefe: «cercana a -14» |
| 11 | Variantes del gancho | Filmmaker: 5 o más | Actor: 3 o más |
| 12 | Cómo frenar en la marca | Actor Principiante: pie adelante, rodillas sueltas | Actor Intermedio: pies al ancho de caderas |
| 13 | Log publicado sin editar | «a confirmar con el dueño» | Checklist: nunca se publica en Log |
| 14 | Cuándo una entrega está hecha | «cuando quien recibe la acepta» | Cadena: pasa directo al pulsar «Listo» |
| 15 | Check «Link guardado en la ficha» | App: opcional | Manual: obligatorio |
| 16 | Nombres únicos | Formato o Tipo de video · Camarógrafo o Filmmaker · Publicador o Community · Persona y Estilo | Una sola escala de prioridad (hoy: Alta/Media/Baja en videos y Baja/Normal/Alta/Urgente en tareas) |
| 17 | Perfiles que faltan | Jefe de editores y ATC no tienen perfil en ALSOS | ¿Se crean? |

---

## 5. Reglas ALSOS de lenguaje simple

Cada regla se puede revisar con una prueba o con una mirada de 1 minuto.

1. **Frases cortas.** 12 palabras o menos de promedio. Ninguna de más de 20.
2. **Un paso = una acción.** Empieza con verbo. 15 palabras o menos. Máximo 2 números y 1 paréntesis. El botón con su nombre exacto entre «».
3. **Lección corta.** 3 a 5 pasos. 150 palabras o menos a la vista. Con dibujo, guía o 3D si enseña una pantalla o un movimiento.
4. **Un solo botón principal por pantalla.** Lo demás, secundario o plegado. Botones con ícono + palabra, de 44 px o más. Nada importante solo al pasar el ratón.
5. **Nada sin explicar.** La primera vez: «palabra simple (término)». El término está en el glosario.
6. **Un nombre para cada cosa.** El mismo en la app y en el Manual.
7. **Nada interno a la vista.** Ni variables de entorno, ni códigos (STRATEGY, B22), ni coordenadas, ni estados en MAYÚSCULAS dentro de frases, ni fechas tipo 2026-10-02T05:00.
8. **Siempre decir qué pasa después.** «Ahora lo tiene Ana. Tú ya terminaste.»
9. **Seguridad y ley arriba.** El aviso ⚠️ va en el mismo paso. La ley se traduce; la norma queda al pie. Nunca se borra.
10. **Borrar siempre pregunta.** Qué se va + «No se puede deshacer» + botón rojo + la opción segura (archivar o desactivar).
11. **Errores en 2 partes.** Qué pasó + qué hacer. Un solo mensaje.
12. **Números y fechas en un solo formato.** 2,5 · 1500 · 8 % · «31 dic 2026». Más de 2 números en un paso → tabla.

---

## 6. Glosario

Primero va la palabra difícil. Después, cómo decirla simple.

### La plataforma y el Manual

| Hoy dice | Mejor decir |
|---|---|
| Perfil / Panel / Cargo / función / papel | Rol |
| Panel (página principal) | Inicio |
| Formación · Módulo · Misión | Aprende · Tema · Para qué estás |
| Responsabilidades · Procedimiento | Lo que te toca · Tu día a día |
| Indicadores / KPI | Cómo saber si vas bien |
| Recibe de / Entrega a | Quién te pasa el trabajo / A quién se lo pasas |
| Objetivo · Errores comunes · Práctica | Vas a lograr · No hagas esto · Ahora tú |
| Checklist / check | Lista para revisar / casilla |
| Criterio de aprobado | Lo lograste si… |
| Paso N del flujo · Dirección (Dueño) | N.º en la cadena · Decide y aprueba |
| Maqueta referencial · Maniquí | Dibujo de ejemplo · Muñeco simple |
| Cadena de entregas | Cadena: quién tiene cada video ahora |
| Paso abierto / pendiente | Trabajo en curso / lo que falta |
| Vencido / Atrasados | Atrasado |
| Plazo | Fecha límite |
| Día hábil | Día de trabajo (lunes a sábado) |
| Coordinación / Avisar a coordinación | El encargado de la marca / Pedir ayuda |
| Ficha / Tarjeta (de video) | Video |
| Estructura / Formatos previstos | Formato (tipo de video) |
| Generador IA / Generar guion | Crear guion con IA |
| Generaciones / Guiones no generados | Guiones en camino |
| Guion suelto | Guion sin video |
| Persona / Arquetipo | Persona = alguien real; Estilo = tipo de personaje |
| Lote | Varios a la vez / una carga |
| Proveedor / modelo / motor (IA) | Qué IA usar / versión de la IA / IA usada |
| Tokens · Saturación | Uso de la IA que se cobra · La IA está llena |
| Clave de API | Contraseña de la IA |
| Temperatura | (quitar: hoy no cambia nada) |
| Prompt / pre-prompt | Instrucciones para la IA |
| Canario | Prueba en algunas marcas (decir cuáles) |
| Estado desfasado · Paralelo | El estado no cuadra · A la vez |
| Marcas autorizadas · Caracteres · Registros | Tus marcas · Letras · Datos cargados |
| Programado · Aprobado (estados) | Listo para subir · Guion aprobado |
| Grabación · Edición (estados) | Grabando · Editando |
| Preproducción / Postproducción | Antes de grabar / Después de grabar |
| Excepción del Dueño | Saltar la regla (solo el Dueño) |
| Reabrir / Retirar aprobación | Quitar la aprobación |
| Versiones verificables | Copia guardada de lo aprobado |
| Roles cubiertos | Puestos con persona |
| Pipeline / tipo Trello | Tablero de tarjetas |
| Embudo de producción | Videos por paso |
| Archivar · Revocar · Vigencia | Ocultar (sin borrar) · Apagar · Cuánto dura |
| Alta (columna) · Slug · Log | Entró el · Nombre corto del sistema · Actividad |
| Trazabilidad · URL / link | Que todo quede anotado · Enlace |
| CSV · Cabecera · Incidencias | Hoja de Excel · Primera fila · Filas con error |
| Hexadecimal · Primario / secundario / acento | Código de color · Color principal / de apoyo / para resaltar |
| Propuestas de valor · Público objetivo | Por qué comprarnos · A quién le hablamos |
| Métrica sumable · Media simple · Se atribuye | Número que se suma cada semana · Promedio normal · Cuenta para |
| Brief maestro · Informe de branding | PDF del negocio · PDF de la marca personal |
| AUTH_SECRET, DATABASE_URL, cron, B22, OAuth | Cosas del técnico (plegable «Para el técnico») |

### Los roles

| Hoy dice | Mejor decir |
|---|---|
| Filmmaker / Cámara | Camarógrafo (quien graba) |
| Talento | Actor o actriz |
| Community / community manager | Publicador (quien publica y responde) |
| ATC | Atención al Cliente: el equipo que vende por chat |
| Preparador / Producción | Preparador |

### Ventas y redes

| Hoy dice | Mejor decir |
|---|---|
| CTA / llamado a la acción | Lo que pedimos al final (ej.: «escríbenos TAZA») |
| Hook / gancho | Inicio que atrapa (primeros 3 segundos) |
| Brief · Brief operativo | Hoja con el encargo · Datos fijos del negocio |
| Copy / caption · Hashtag | Texto del post · #etiqueta |
| Keyword | Palabra de búsqueda |
| Palabra clave (de comentario) | Palabra para comentar (ej.: TAZA) |
| Lead · Calificar un lead | Persona con ganas de comprar · Hacerle las preguntas clave |
| DM · Enlace en bio | Mensaje privado · Link del perfil |
| Pauta / Spark Ads · Orgánico | Anuncio pagado · Publicado sin pagar |
| Embudo / conversión | Camino del cliente / de cada 10 que escriben, cuántos compran |
| Ticket promedio · Tasa de cierre | Cuánto gasta cada compra · De cada 10 chats, cuántos compran |
| Objeción | Duda o «pero» del cliente |
| ROAS · ROAS de equilibrio | Soles que vendes por cada S/ 1 de anuncio · Lo mínimo para no perder |
| Margen de contribución | Lo que te queda de cada venta tras pagar producto, envío y comisiones |
| Benchmark · Alcance | Número para comparar · Personas distintas que lo vieron |
| Interacciones | Reacciones (me gusta + comentarios + compartidos + guardados) |
| Retención | Cuánta gente sigue mirando |
| Hook rate · Hold rate · Skip rate | De 100, cuántos se quedan 3 s · cuántos siguen a los 15 s · % que pasó de largo |
| ThruPlays · Inversión · Ingresos | Vistas largas · Gastado en anuncios · Vendido |
| UGC · Avatar | Video casero, como de cliente · Para quién es el video |
| Creativos · Fatiga creativa | Versiones del anuncio · El anuncio ya cansó |
| Escalar | Subir poco a poco lo invertido; en el equipo: pasárselo al encargado |
| Gatillos / cierre Hormozi | Razones reales para comprar ya: pocos cupos, fecha límite, regalo, garantía |
| Escasez · Urgencia · Lead magnet | Quedan pocos · Se acaba el tiempo · Regalo por hacerlo |
| Conexión material | Le dimos algo a cambio (dinero, producto, descuento o canje) |
| UTM · A/B · CSAT | Etiqueta del enlace · Probar 2 versiones · Nota del cliente de 1 a 5 |
| Mediana · Percentil 90 | El valor del medio · Lo que cumplen 9 de cada 10 |
| Playbook · Role-play · LAER | Libro de respuestas · Práctica actuada · Leer, entender, preguntar, responder |
| Mockup · Courier | Imagen de muestra · Empresa de envíos |
| Content ID · Phishing · 2FA | Detector de música ajena · Mensaje trampa · Doble candado |
| RACI | Tabla de quién hace, decide, opina y se entera |
| Post-mortem · Feedback · SBI | Qué pasó y qué aprendimos · Comentario para mejorar · Comentar en 4 pasos |
| 1:1 · Reunión de pie · Onboarding 30-60-90 | Charla a solas · Reunión corta · Plan de 3 meses |
| WIP · GO · En camino / fuera de camino | Trabajos abiertos · Sí, adelante · Vamos bien / vamos mal |
| Razón social · Habido | Nombre legal de la empresa · SUNAT la encuentra en su dirección |
| Comitente / locador | Quien contrata / quien da el servicio |

### Guiones

| Hoy dice | Mejor decir |
|---|---|
| Beat · Ángulo · Modelo mental | Momento del video · Toque de la historia · Idea central |
| POV · PAS · Storytime | Como si lo vieras tú · Problema → empeora → solución · Cuento personal |
| Sketch · Camaleón | Escena corta de humor · Video normal que muestra la marca al final |
| Hater · Hack · ASMR / Unboxing · Plot twist | Quien critica · Truco · Abrir la caja con sonidos · Giro sorpresa |

### Grabación

| Hoy dice | Mejor decir |
|---|---|
| 9:16 / 16:9 · 4K | Vertical / horizontal · Video muy nítido |
| fps · VFR / CFR | Imágenes por segundo · Velocidad que cambia / fija |
| Log · LUT · Rec.709 | Video gris a propósito · Filtro de color del editor · Color normal |
| HDR / SDR · ISO | Brillo extra / video normal · Brillo inventado (salen granitos) |
| Obturación · AE/AF · ND | Cuánto entra la luz · Luz y foco fijos · Lentes de sol para la cámara |
| K (Kelvin) · mm | Color de la luz (amarilla / blanca) · Tipo de lente (1x / 2x) |
| 60 Hz | La luz de la casa titila y la cámara lo nota |
| Gimbal · Rig · Lavalier | Mango que no tiembla · Soporte · Micrófono de solapa |
| Room tone · B-roll · Inserts | Silencio del lugar · Tomas de apoyo · Tomas de detalle |
| Set-up · Scouting · Locación · Props | Mover cámara y luces · Visitar el lugar antes · Lugar · Objetos |
| Plano medio corto · americano | Del pecho arriba · De las rodillas arriba |
| Picado · Contrapicado · Cenital · Holandés | Cámara arriba · Cámara abajo · Desde arriba · Cámara torcida |
| Paneo · Tilt · Push-in · Dolly out · Whip pan · Travelling | Gira · Sube o baja · Se acerca · Se aleja · Giro rápido · Camina al lado |
| Contraluz · Relleno | Luz de atrás · Luz suave del otro lado |
| Softbox · Ring light | Caja de luz suave · Aro de luz |
| Zona segura · Overlay · Tercio | Parte que no tapan los botones · Plantilla encima · Líneas guía |
| Marca (en el piso) · Continuidad | Cinta para pararte · Que todo se vea igual entre tomas |
| Teleprompter · Pick-ups | Pantalla con el texto · Tomas extra para arreglar |
| Wild lines · Voz en off · ADR | Frases sueltas · Voz sin ver a quien habla · Volver a grabar la voz |
| ProRes / HEVC · SSD / exFAT | Archivo pesado / liviano · Disco rápido / formato del disco |
| Formatear · Checksum · 3-2-1 | Borrar todo · Prueba de copia igual · 3 copias, 2 lugares, 1 fuera |
| D-1 · T-45 · T-20 | Un día antes · 45 min antes · 20 min antes |
| Cebra / falso color · dBFS / pico | Aviso de demasiada luz · Lo más fuerte que suena (nunca más de -1) |

### Edición y sonido

| Hoy dice | Mejor decir |
|---|---|
| LUFS · Ducking | Volumen general (meta -14) · La música baja sola cuando alguien habla |
| SFX · Whoosh · Riser | Efectos de sonido · Pasada rápida · Sonido que sube |
| Compresor · Limitador · Preset | Empareja el volumen · Pone un techo · Ajuste guardado |
| Máster | Video final ya editado |
| Keyframe · Ease in / out | Punto de animación · Arranque / frenado suave |
| Punch-in · Jump cut · Match cut | Zoom de golpe · Corte con salto · Corte entre imágenes parecidas |
| J cut / L cut | Se oye antes de ver / se sigue oyendo después |
| Timecode · Proxies · Ingesta · Bruto | Minuto y segundo · Copias livianas · Pasar a la compu · Sin editar |
| Export · Bitrate | Guardar el video terminado · Calidad del archivo |
| QC · Rúbrica · Promedio ponderado | Revisión de calidad · Tabla de notas · Unas notas valen más |
| Talla S/M/L (trabajo) | Tamaño: chico, mediano, grande |
| v01 / FINAL · Rondas | Versión 1 / aprobada · Vueltas de corrección |
| Scopes · Colchón · Placas · CML | Medidores de color · Tiempo extra · Carteles · Música permitida en TikTok |

---

## 7. Etapas de trabajo

Siguen el flujo de 7 fases del Dueño: Idea → Evaluación → Planificación → Desarrollo → Debugging → Testing → Cierre.

- Cada etapa es **una idea con su propio GO**.
- **Solo 1 GO activo a la vez.**
- Cada etapa tiene un interruptor de apagado (kill-switch). Está **encendido por defecto**. Solo `=false` lo apaga. Así se vuelve atrás sin redeploy.

### Etapa 0 — Decidir (sin código)
- **Qué:** el Dueño elige una regla para cada tema de la sección 4 y aprueba los nombres únicos.
- **Esfuerzo:** 1-2 horas del Dueño.
- **Apagado:** no aplica.
- **Hecho cuando:** los 17 temas tienen 1 sola regla escrita en el backlog.

### Etapa 1 — Seguridad y verdad
- **Qué:** preguntar antes de borrar; «No se puede deshacer» y botón rojo; importador correcto; texto de Mi perfil; quitar «razón inventada»; 404 en español; errores «qué pasó + qué hacer»; formatear con aviso arriba; quitar «sumiso/dama»; ocultar variables, «canario», B22 y cron; «¿Olvidaste tu contraseña? Pídele una nueva al Dueño».
- **Esfuerzo:** Bajo (1-2 días).
- **Apagado:** `UI_AVISOS_CLAROS`. No se recomienda apagar las preguntas de borrar.
- **Hecho cuando:** 0 borrados sin pregunta (prueba). El ejemplo del importador carga bien. La prueba de variables visibles pasa. El log de errores no crece en 24 h.

### Etapa 2 — Un botón principal y «qué sigue»
- **Qué:** «Siguiente lección» grande; fin de tema y de nivel; quitar «!»; «Empieza aquí» en la página del rol; caja roja de crisis y reclamos; estados con ícono; aviso «Ahora le toca a…»; «Abrir mi guion»; 1 botón principal en inicio, tutorial y ficha de marca.
- **Esfuerzo:** Bajo-Medio (2-4 días).
- **Apagado:** `UI_BOTON_PRINCIPAL`.
- **Hecho cuando:** la prueba de diseño cuenta 1 botón principal por pantalla. 2-3 personas del equipo, sin ayuda, abren la lección 1, pasan a la 2 y abren su guion.

### Etapa 3 — Un nombre por cosa y glosario
- **Qué:** `src/lib/glossary.ts` como fuente única; glosario del Manual con ventanita; nombres aprobados en toda la app; quitar STRATEGY y WRITER; prueba de jerga.
- **Esfuerzo:** Medio (3-5 días).
- **Apagado:** `UI_GLOSARIO`.
- **Hecho cuando:** la prueba de jerga y sinónimos da 0 fallos.

### Etapa 4 — Lección en 3 tarjetas y 3D simple
- **Qué:** 3 tarjetas; títulos nuevos; casillas vacías; videos debajo con chip «En inglés»; 3D en modo simple; leyenda nueva y coordenadas ocultas; letra de 14 px o más.
- **Esfuerzo:** Medio (1 semana).
- **Apagado:** `MANUAL_MODO_SIMPLE`.
- **Hecho cuando:** 5 pasos o menos por tarjeta. El 3D abre con 4 controles o menos. 0 coordenadas a la vista.

### Etapa 5 — Reescribir el Manual, rol por rol
- **Qué:** aplicar las 12 reglas en los JSON; reglas compartidas guardadas una vez; «tu marca» en vez de «Con Amor»; botón «Listo» real; plantillas reales o sin etiqueta; seguridad en Principiante; tabla «Mi equipo»; control de lectura en `scripts/manual-content.mjs`. Un rol por GO.
- **Esfuerzo:** Alto (2-4 semanas en total).
- **Apagado:** `MANUAL_CONTENIDO_SIMPLE` (con `false` carga el JSON anterior, guardado aparte hasta el cierre).
- **Hecho cuando:** 12 palabras o menos por frase de promedio. 0 pasos de Principiante con más de 20 palabras. Principiante no más largo que Avanzado. INFLESZ 80 o más (hoy 69-74). 0 cifras distintas para la misma regla. 0 «Con Amor» en prácticas.

### Etapa 6 — Pantallas de trabajo más simples
- **Qué:** ficha del video con «Ahora toca»; ficha del Equipo con «Tu paso» primero; menú del Dueño en 5 grupos; generador en modo fácil; formularios en 3 pasos; Ajustes en «Lo básico» y «Para el técnico»; métricas simples; botones visibles en el celular. Cada parte es un GO.
- **Esfuerzo:** Alto (2-3 semanas).
- **Apagado:** `GENERADOR_MODO_FACIL`, `VIDEO_FICHA_SIMPLE`, `MENU_CORTO`, `FORMULARIOS_POR_PASOS`, `CHECKLIST_NOMBRES_SIMPLES`.
- **Hecho cuando:** alguien nuevo crea su primer guion solo en menos de 3 minutos. La ficha del video abre con 20 controles o menos (hoy unos 70). El menú del Dueño abre con 7 enlaces o menos. El log de errores no crece en 24 h.

### Etapa 7 — Progreso del Manual (core)
- **Qué:** «✓ Terminé esta lección», ✓ en la lista, «2 de 6», barras y «Continuar: lección X». Se guarda en la base de datos.
- **Esfuerzo:** Medio-Alto (1-2 semanas). Pasa por evaluación completa.
- **Apagado:** `MANUAL_PROGRESO`.
- **Hecho cuando:** el ✓ sigue después de recargar y en otro equipo. El log de errores no crece en 24 h. Con `false`, la pantalla vuelve a la de hoy sin errores.

### Cuidados especiales
- **Lista de pasos de cada video (DEFAULT_CHECKLIST):** el código lee esos textos para dar permisos y cambiar estados (`permissions.ts:124-125`, `production-scope.ts:653`). Primero hay que pasar esa lógica a un código fijo. Después se cambian los nombres, con migración para los videos que ya existen.
- **Lo legal no se borra.** Se traduce a palabras simples. La norma queda al pie.
- **Las cifras del Manual que no coinciden** no se tocan hasta que el Dueño decida (etapa 0).

---

## 8. Qué conservar

- «Mi trabajo»: ordena por tiempo (Vencido, Hoy, Próximos 7 días), con ícono y color.
- Los botones «Listo, enviar al filmmaker»: dicen qué hacen y a quién va.
- Las guías por equipo: un paso por pantalla, dibujo, dedo animado y «Siguiente» grande. **Es el modelo para las lecciones.**
- El 3D «Correcto / Incorrecto», con «Cómo corregirlo» y una regla de oro de una línea.
- Los mensajes vacíos con ícono + título + qué hacer + botón.
- «Datos de ejemplo»: muestra «Se va / Se queda» y pide escribir VACIAR. **Es el modelo para borrar.**
- El generador: 5 pasos con preguntas y un solo «Continuar».
- El visor de guiones: «Lo que se oye» y «Lo que se ve».
- Los ejemplos peruanos: polera para el frío de Huancayo, Yape, ceviche, precios en S/.
- La forma fija de las lecciones, los títulos cortos y los criterios que se pueden medir.
- Todo el contenido legal y de seguridad.
- Los errores que dicen cómo arreglar: «Pega el enlace completo: debe empezar con https://.»
- El calendario en el celular: «Hoy» arriba y días vacíos juntos.
- Las tarjetas «Hace / Entrega / No es suyo» y el tutorial con ✓ «ya lo hiciste».
- Frases simples que ya existen: «Nadie va tarde. Bien ahí.», «Si todo suena, nada destaca».
- Los mensajes listos para copiar en ATC y la mediana explicada sin fórmulas (`atc.json:352`).
- La regla del modo Comunidad: la IA no pone precios, ofertas ni enlaces.
- La accesibilidad: botones de 44 px, «Saltar al contenido», movimiento reducido.
- Los interruptores que ya existen y el Manual en JSON versionado.
- El login de 2 campos y su aviso «Cada movimiento que hagas queda registrado con tu nombre».

---

## 9. Datos de la revisión

- **Manual:** 8 roles, 139 temas, 640 lecciones, 106 escenas 3D, 417 videos (59 en inglés sin aviso).
- **Palabras por rol:** Filmmaker 39.666 · Actor 29.636 · Editor 17.672 · Jefe de editores 17.218 · Dueño 16.471 · Guionista 15.470.
- **Lección típica:** unas 200 palabras y 6 bloques a la vez. La más larga en pantalla: 564.
- **Legibilidad (INFLESZ, Dueño y Guionista):** 69-74 en lecciones; 61-63 en misión y procedimiento. Para primaria se pide 80 o más.
- **Controles a la vista:** ficha del video unos 70 · inicio del Dueño más de 80 · tema del Manual 30-50 · visor 3D 18-24.
- **Contradicciones encontradas:** 7 entre Editor y Jefe; 4 entre Dueño y Guionista; otras entre Filmmaker y Actor.
- **Límites:** no se abrió la app. Las cifras salen de leer el código y de conteos con scripts. Las notas son una estimación de las 9 revisiones.
