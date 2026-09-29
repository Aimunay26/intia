# Manual de procedimientos: visión general

**Versión:** 1 (borrador para que la revise el dueño) · **Fecha:** 2026-09-28
**Fuentes:** los 8 manuales por rol, `CONTRACT.md`, `src/lib/constants.ts` (estados y checklist), `src/lib/permissions.ts`, `src/lib/domain/lifecycle.ts` (qué exige cada cambio de estado), `src/app/(app)/tutorial/page.tsx` y `src/lib/guia/*.ts`.
**Alcance:** aquí no hay código. Es la base para evaluar y programar después.

---

## Lo esencial

- En Intia aparece un espacio nuevo, **Formación**, que ven todas las cuentas. Su primera tarjeta es **Manual de procedimientos**. Adentro hay una tarjeta por rol, ordenadas según el flujo del video. La de tu rol sale primero.
- Cada rol tiene su misión, su procedimiento, sus traspasos (qué recibe y qué entrega) y una ruta de formación: **3 niveles, 139 módulos y 640 lecciones** en total. Las lecciones son botones cortos, y el botón «!» abre el detalle.
- Cada módulo tiene espacio para videos de YouTube definidos de antemano. **Filmmaker** y **actor** tienen además escenas 3D con maniquíes, cámara y luces. **Editor** tiene sobre todo videos de referencia marcados al segundo exacto.
- Al cruzar los 8 manuales con las reglas actuales de Intia salen **9 bloqueos reales**. El más grave: nadie marca «Guion escrito y revisado», y sin ese check ningún video puede pasar a GRABACION. También salen **11 tareas duplicadas**, **5 entregas sin receptor** y **4 roles de los que dependen muchas entregas pero que no tienen manual**: coordinación, producción, diseño y analista. Todo esto se detalla en la sección 3.

---

## 1. Propósito y cómo se usa el espacio

### 1.1 Para qué sirve

1. **Que cada persona sepa qué le toca, cuándo, a quién se lo entrega y cómo se ve en Intia.** Cada procedimiento va atado a los estados y checks reales de la app.
2. **Formar a la gente por niveles**, de principiante a avanzado, con lecciones cortas que se pueden practicar.
3. **Cuidar los traspasos entre roles.** El tutorial actual lo dice así: «lo que importa no es quién hace algo, sino a quién se lo entrega». Casi todos los atascos pasan en ese punto.

El manual no reemplaza a «Cómo se usa» (`/tutorial`) ni a la guía interactiva. Esos enseñan a **usar Intia**; el manual enseña a **hacer el trabajo**. Las lecciones que dependen de una pantalla de Intia enlazan al módulo de la guía que corresponde. Por ejemplo: Guionista, «Generador IA de Intia» → guía, módulo 5 «Generar guiones con IA por etapas». Dueño, «Marca e identidad» → módulo 1. Dueño, «Equipo y accesos» → módulo 7.

### 1.2 Quién lo ve y dónde está

- **Todas las cuentas activas** lo ven: el Dueño y el Equipo, tengan o no perfiles. Funciona igual que «Cómo se usa», que hoy ya ven todos.
- **Todos pueden leer todos los manuales.** Leer el manual de quien te entrega o de quien recibe tu trabajo ayuda a que los traspasos salgan bien. Solo cambia el orden: la tarjeta de tu rol va primero, con la marca «Tu rol».
- Ubicación propuesta (hay que confirmarla, ver la pregunta 1 de la sección 5):
  - **Menú lateral:** el grupo «Ayuda» pasa a llamarse **«Formación»**, con «Manual de procedimientos» en primer lugar y «Cómo se usa» debajo.
  - **Espacio Formación:** la primera tarjeta es «Manual de procedimientos». Después van «Cómo se usa Intia» (enlace al tutorial y a la guía) y «Mi avance».
  - **Panel de cada miembro:** la tarjeta «Manual de procedimientos» es la primera de la grilla de accesos.

### 1.3 Cómo está organizado

```
Formación
└── Manual de procedimientos                 ← primera tarjeta
    ├── Visión general                       (flujo, RACI, reglas comunes: este documento, resumido)
    └── Tarjeta por rol (en orden de flujo; la tuya primero)
        ├── Misión        · qué logras y qué NO es tuyo
        ├── Procedimiento · por video / diario / semanal / mensual
        ├── Traspasos     · recibes de… / entregas a… (con el check de Intia)
        └── Formación
            ├── Principiante ─┐
            ├── Intermedio   ─┼── Módulos (con videos de YouTube anclados)
            └── Avanzado     ─┘      └── Lecciones: botón corto + «!» (detalle)
```

**Orden de las tarjetas de rol:** Guionista → Filmmaker → Actor → Editor → Jefe de editores → Community manager → ATC → Dueño.

**Anatomía de un módulo:** título, cantidad de lecciones, «Videos del módulo» (de 1 a 4 de YouTube, definidos de antemano), las lecciones, una práctica del módulo y el avance.

**Anatomía de una lección:**

| Parte | Contenido |
|---|---|
| Botón (título) | De 2 a 5 palabras, estilo botón. Ejemplos: «Luz de ventana», «Mirada al lente», «Precio total en S/». |
| Tipo (ícono) | Texto · Video · Escena 3D · Práctica · En Intia |
| «!» Detalle | **Para qué** (1 frase) · **Pasos** (de 3 a 7) · **Error común** · **En Intia** (estado o check, si aplica) · **Medio** (video con segundo de inicio y fin, escena 3D o imagen) · **Práctica** (entregable breve) · **Duración** en minutos |

Tocar la tarjeta abre la lección en el área principal (video, escena 3D y pasos). El botón «!» abre la ficha rápida sin salir del módulo.

### 1.4 Videos de YouTube por módulo

- Cada módulo tiene una sección «Videos del módulo» con videos **definidos de antemano**. No los agrega cada usuario.
- Cada video lleva: ID de YouTube, título, **segundo de inicio y de fin** (opcionales), formato (vertical u horizontal), si la fuente es propia o de terceros, y una nota de «qué mirar».
- **Editor:** la mayoría de sus módulos se apoyan en **2 a 4 referencias recortadas al segundo exacto**, por ejemplo «mira el corte en 0:03 → 0:05». Es el mismo formato de «referencias con el segundo exacto» que el jefe de editores pide en el brief.
- **Filmmaker:** las referencias se enfocan en ángulos, luz y movimiento. Se combinan con la escena 3D del mismo tema.
- Si un módulo todavía no tiene video, se muestra «Video pendiente de definir». Nunca se pone un video de relleno (regla del CONTRACT: sin datos inventados en la UI).

### 1.5 Escenas 3D (filmmaker y actor)

Cada escena muestra maniquíes en un entorno sencillo, la cámara del celular con lo que ve en 9:16, las luces con su dirección y color, y una línea de tiempo con **qué hacer en cada momento**.

Entornos: estudio con fondo infinito, taller o tienda Con Amor (mostrador, poleras, tazas), mesa de restaurante o cocina, sala de casa (vlog y UGC) y vereda (Cámara Escondida).

| Rol | Módulo | Escena 3D propuesta |
|---|---|---|
| Filmmaker | Equipo básico | Luz LED de mano a 45° y por encima de los ojos, con la temperatura igualada al ambiente |
| Filmmaker | Celular listo para grabar | Trípode a la altura del pecho (y los errores muy bajo y muy alto); vertical 9:16 y horizontal 16:9 |
| Filmmaker | Tamaños de plano | El maniquí queda fijo y la cámara pasa de plano general a plano detalle, con la vista 9:16 al lado |
| Filmmaker | Encuadre vertical | Recuadro de zona segura sobre la vista de cámara; la línea superior de la cuadrícula a la altura de los ojos |
| Filmmaker | Luz natural | Ventana lateral, contraluz y hora dorada, con el sol en movimiento |
| Filmmaker | Ángulos con intención | Contrapicado de autoridad, picado cercano, semi-lateral de podcast, cenital y holandés |
| Filmmaker | Movimientos de cámara | Paneo, travelling, dolly in, seguir al sujeto a su ritmo y órbita, con su trayectoria dibujada |
| Filmmaker | Luz de 3 puntos | Principal a 45°, relleno y luz trasera de otro color, con conos visibles, temperatura y relación de luces |
| Filmmaker | Producto, comida y servicio | Cenital sobre mesa, 45° para comida, macro de producto |
| Filmmaker | Cámara Escondida | Dónde se oculta la cámara, a qué distancia y con qué ángulo respecto a la persona real |
| Filmmaker | Set con talento | Marcas en el piso, codos cerca del cuerpo, un pie adelantado con rodillas sueltas y eje de 180° con dos personas |
| Actor | Tu cuerpo en 9:16 | Postura (pies, rodillas y codos), distancia a cámara y cómo ocupar el cuadro vertical |
| Actor | Mirada y lente | Mirar al lente o fuera de él, y la línea de mirada en un diálogo |
| Actor | Gancho en 2 segundos | Entrada a cuadro y gesto de apertura, sincronizados con el segundo 0 |
| Actor | Mostrar el producto | A la altura del pecho, giro lento hacia la luz, sin tapar el logo |
| Actor | Marcas y movimiento | Caminar hasta la marca y hacer giros abiertos hacia la cámara |
| Actor | Reacciones creíbles | Tiempos de la reacción: escuchar, procesar, reaccionar |
| Actor | Sketch y cámara escondida | Blocking de dos personajes y respeto del eje |

Desde el 2026-09-29 las escenas pueden declarar un **preset** (escena armada de antemano: informativo al pecho, contrapicado, picado, podcast semi-lateral, seguimiento, 3 puntos con luz trasera de color y luz de mano) y una lista de **errores** que se comparan con lo correcto al pulsar «Incorrecto» (contraluz, codos abiertos, pies juntos, ojos fuera del tercio, trípode muy bajo o muy alto, movimiento brusco, sin luz trasera, cabeza cortada). El formato por defecto es vertical 9:16, con la opción de verlo en horizontal 16:9.

**Piloto recomendado:** 4 escenas. Tamaños de plano y Luz de 3 puntos (filmmaker); Mirada y lente y Mostrar el producto (actor). Cuando se mida el rendimiento en celulares reales se amplía al resto.

### 1.6 Inventario de contenidos

| Rol (orden en pantalla) | Perfil en Intia | Módulos P / I / A | Lecciones | Medio principal |
|---|---|---|---|---|
| Guionista | WRITER | 6 / 7 / 6 = 19 | 87 | Ejemplos de guion, análisis de ganchos y práctica en el Generador IA |
| Filmmaker | CAMERA | 8 / 7 / 6 = 21 | 100 | Escenas 3D (plano, ángulo, luz, movimiento), guías ilustradas por equipo (iPhone, Samsung, Sony ZV-E10) y videos |
| Actor / talento / voz | TALENT | 6 / 6 / 5 = 17 | 73 | Escenas 3D (cuerpo, mirada, marcas), videos y autograbación |
| Editor | EDITOR | 6 / 7 / 5 = 18 | 78 | Videos de referencia al segundo exacto |
| Jefe de editores | (no existe) | 5 / 6 / 4 = 15 | 81 | Rúbricas, QC, plantillas y referencias |
| Community manager | PUBLISHER | 5 / 5 / 5 = 15 | 69 | Plantillas de copy, casos y videos |
| ATC | (no existe) | 6 / 6 / 6 = 18 | 80 | Guiones de chat, respuestas rápidas y casos |
| Dueño de negocio | OWNER (posición) | 6 / 5 / 5 = 16 | 72 | Tableros, plantillas y legal |
| **Total** | | **139** | **640** | |

### 1.7 Reglas comunes a todos los manuales

1. **La ficha del video es el canal oficial.** Todo traspaso queda como check, cambio de estado o comentario en la ficha. WhatsApp sirve para avisar, no para dejar registro.
2. **Una entrega no está hecha cuando la envías, sino cuando el que recibe la acepta.** Ejemplo: el material del filmmaker queda entregado cuando el editor lo acepta y pasa el video a EDICION.
3. **Cada tarea tiene un solo responsable de que salga (la A de la matriz RACI).** Si dos manuales dicen que hacen lo mismo, manda la sección 3.
4. **Solo se promete lo cumplible.** Precio total en S/, vigencia, stock, plazos y garantía salen de una sola **ficha de oferta** aprobada por el dueño.
5. **Los archivos pesados no van a Intia.** Masters, material crudo y audios van a la carpeta compartida con la nomenclatura estándar. En la ficha solo va el enlace (Intia acepta hasta 4 MB por subida).
6. **Idioma:** español neutro con tildes. Tuteo en todos los manuales.

---

## 2. Mapa de traspasos entre roles

### 2.1 El flujo y sus puertas en Intia (lo que la app exige hoy)

`IDEA → GUION → APROBADO → GRABACION → EDICION → PROGRAMADO → PUBLICADO` → ventas por chat → métricas semanales. Se avanza **una etapa a la vez** («Avanza una etapa a la vez; completa sus requisitos antes de continuar»).

| Estado | Quién puede moverlo (capacidad) | Qué exige la app para entrar | Responsable según los manuales |
|---|---|---|---|
| IDEA | Coordinación (`content.plan`) | — | Coordinación registra |
| GUION | Automático al **unir** el guion (guionista), o coordinación | Guion vinculado y con escenas | Guionista |
| APROBADO | Coordinación (`content.approve`) | Guion aprobado + check «Guion aprobado por la marca» | Coordinación |
| GRABACION | Filmmaker o producción (`content.shoot`) | Todos los checks **obligatorios** de preproducción: «Guion escrito y revisado», «Guion aprobado por la marca», «Actor asignado y confirmado», «Props / vestuario conseguidos» | Filmmaker |
| EDICION | **Solo el editor** (`content.editing`) o el Dueño | Además, los obligatorios de grabación: «Grabado (todas las tomas)» y «Audio revisado» | Editor, al aceptar el material |
| PROGRAMADO | Community (`content.publish`) | «Revisión final aprobada» + fecha de programación | Community |
| PUBLICADO | Community | Enlace público + «Copy y hashtags escritos» + «Subido a la plataforma» | Community |
| PAUSADO / CANCELADO | Coordinación (`content.approve`) | Motivo por escrito (de 5 a 1000 caracteres) | Coordinación, a pedido del community o del dueño |

**Quién marca cada check** (capacidad → perfil). El asterisco indica que el check es obligatorio.

| Etapa del checklist | Check | Lo marca |
|---|---|---|
| Preproducción | «Guion escrito y revisado»* | Guionista (`scripts.write`) o Dueño |
| | «Guion aprobado por la marca»* | Coordinación o Dueño |
| | «Actor asignado y confirmado»*, «Props / vestuario conseguidos»*, «Locación e iluminación listas» | Producción o filmmaker |
| Grabación | «Grabado (todas las tomas)»*, «Audio revisado»*, «B-roll / tomas de apoyo» | Filmmaker o producción |
| Postproducción | «Editado»*, «Subtítulos y textos en pantalla»*, «Música y efectos de sonido» | Editor |
| | «Revisión final aprobada»* | Coordinación o Dueño (el editor nunca) |
| Publicación | «Copy y hashtags escritos»*, «Subido a la plataforma»*, «Link guardado en la ficha» | Community |

### 2.2 Matriz RACI por etapa

**Letras:** R = lo hace · A = responde por el resultado (una sola por fila) · C = se le consulta antes · I = se le informa · «·» = no participa.
**Roles:** DU Dueño · CO Coordinación (STRATEGY) · GU Guionista · PR Producción · FM Filmmaker · AC Actor/talento · ED Editor · JE Jefe de editores · DI Diseñador · CM Community manager · ATC · AN Analista.

| # | Actividad | DU | CO | GU | PR | FM | AC | ED | JE | DI | CM | ATC | AN | En Intia |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | **IDEA** | | | | | | | | | | | | | |
| 1 | Aportar insumos (tendencias, preguntas y objeciones reales) | I | A | C | · | · | · | · | · | · | R | R | C | Plantilla de idea al canal de coordinación |
| 2 | Registrar la tarjeta y asignar guionista | I | A/R | C | · | · | · | · | · | · | I | I | · | Estado IDEA |
| 3 | Validar pilares del mes y temas sensibles | A | R | C | · | · | · | · | · | · | C | · | · | — |
| | **GUION** | | | | | | | | | | | | | |
| 4 | Confirmar datos reales (precio S/, stock, plazos, vigencia) | A | C | R | · | · | · | · | · | · | · | C | · | Marcas > brief operativo |
| 5 | Generar, autorrevisar y unir el guion | · | A | R | · | · | · | · | · | · | · | · | · | Unir → GUION; «Guion escrito y revisado» |
| 6 | Observaciones de rodaje, naturalidad y montaje (≤ 24 h) | · | A | I | C | R | R | · | R | · | · | · | · | Comentarios en la ficha |
| 7 | Validar CTA, palabra clave y audio con licencia | · | A | I | · | · | · | · | · | · | R | C | · | Comentario en la ficha |
| 8 | Redactar la ficha de oferta | A | C | R | · | · | · | I | I | · | I | C | · | Comentario fijado (hoy no hay campo) |
| 9 | Aprobar el guion (¹) | C | A/R | I | I | I | I | · | I | · | · | · | · | «Guion aprobado por la marca» → APROBADO |
| | **APROBADO (preproducción)** | | | | | | | | | | | | | |
| 10 | Desglose único: planos ★, cobertura para edición, brief de talento | · | A | R | I | C | I | · | R | · | · | · | · | Comentario en la ficha |
| 11 | Lectura de mesa 24 h antes | · | I | A/R | · | I | C | · | · | · | · | · | · | — |
| 12 | Plan de rodaje y lista de tomas | · | I | C | C | A/R | I | · | C | · | · | · | · | Agenda: «Día de grabación» |
| 13 | Locación, permisos, props, vestuario y talento | · | I | · | A/R | C | C | · | · | · | · | · | · | «Actor asignado y confirmado», «Props / vestuario conseguidos» |
| 14 | Scouting, luz y equipo | · | · | · | A | R | · | · | · | · | · | · | · | «Locación e iluminación listas» |
| 15 | Autorizaciones de imagen y voz (²) | C | A | · | R | C | R | I | I | · | I | · | · | Check nuevo propuesto |
| | **GRABACION** | | | | | | | | | | | | | |
| 16 | Pasar a GRABACION | · | I | · | A | R | · | · | · | · | · | · | · | Exige los checks obligatorios de preproducción |
| 17 | Grabar ganchos A–E, escenas, cobertura, room tone y wild lines | · | I | C | C | A/R | R | · | · | · | · | · | · | — |
| 18 | Revisar tomas y marcar checks de grabación | · | I | · | C | A/R | C | I | I | · | · | · | · | «Grabado (todas las tomas)», «Audio revisado», «B-roll / tomas de apoyo» |
| 19 | Descarga, nomenclatura, respaldo, notas y enlace (≤ 2 h) | · | · | · | · | A/R | C | I | I | · | · | · | · | Enlace a la carpeta en la ficha |
| 20 | Detrás de cámaras, fotos de portada y tomas de producto | · | · | · | C | R | · | · | · | I | A | I | · | Carpeta compartida |
| | **EDICION** | | | | | | | | | | | | | |
| 21 | Aceptar el material y pasar a EDICION | · | I | · | · | C | · | R | A | · | · | · | · | Exige los checks obligatorios de grabación |
| 22 | Brief operativo y asignación de editor | · | A | C | · | · | · | I | R | · | · | · | · | Asignación «Editor» (hoy la hace CO o PR) |
| 23 | Montaje, textos, sonido e imagen | · | · | · | · | · | · | R | A | C | · | · | · | «Editado», «Subtítulos y textos en pantalla», «Música y efectos de sonido» |
| 24 | Revisión consolidada, ronda 1 y ronda 2 (³) | C | C | C | · | · | · | I | A/R | · | · | C | · | Un comentario por ronda, con timecodes |
| 25 | Pick-ups, ADR o regrabación | · | A | · | R | R | R | I | C | · | · | · | · | — |
| 26 | QC final | · | I | · | · | · | · | C | A/R | · | · | · | · | Comentario «QC aprobado + enlace» |
| 27 | Revisión final aprobada | C | A/R | · | · | · | · | I | C | · | I | I | · | «Revisión final aprobada» |
| 28 | Exportes, portada, nota de entrega y corte _WA | · | · | · | · | · | · | R | A | C | I | I | · | Enlace a 07_ENTREGA en la ficha |
| | **PROGRAMADO / PUBLICADO** | | | | | | | | | | | | | |
| 29 | Revisar el master en la vista previa de cada app | · | I | · | · | · | · | · | · | · | A/R | · | · | Si hay error: comentario, y CO reabre con motivo |
| 30 | Copy, divulgación, portada final y programación | · | I | C | · | · | · | · | · | C | A/R | I | · | «Copy y hashtags escritos»; fecha → PROGRAMADO |
| 31 | Respuestas rápidas, palabra clave y guardia | · | I | · | · | · | · | · | · | · | C | A/R | · | Fuera de Intia |
| 32 | Publicar, verificar y guardar el enlace | · | I | · | · | · | · | · | · | · | A/R | I | · | «Subido a la plataforma», «Link guardado en la ficha» → PUBLICADO |
| 33 | Comentarios, moderación y leads a ATC (≤ 15 min) | · | · | · | · | · | · | · | · | · | A/R | I | · | Fuera de Intia |
| 34 | Crisis: pausar lo programado y los anuncios | A | R | · | · | · | · | · | · | · | R | I | · | PAUSADO con motivo |
| | **VENTAS POR CHAT** | | | | | | | | | | | | | |
| 35 | Atender, cotizar, cerrar y cobrar (≤ 5 min en las primeras 48 h) | I | · | · | · | · | · | · | · | · | C | A/R | · | Fuera de Intia |
| 36 | Orden al taller, mockup y despacho | I | · | · | · | · | · | · | · | R | · | A/R | · | Fuera de Intia (taller) |
| 37 | Reclamos y Libro de Reclamaciones | A | C | · | · | · | · | · | · | · | I | R | · | Fuera de Intia |
| 38 | Registrar el origen de cada lead y venta por video | I | · | · | · | · | · | · | · | · | · | R | A | Métricas: leads, pedidos, ingresos |
| | **MÉTRICAS** | | | | | | | | | | | | | |
| 39 | Hoja de métricas a 24 h y a 7 días | · | · | I | · | I | · | I | I | · | R | · | A | Hoja de la marca (fuera de Intia) |
| 40 | Carga semanal en Intia | I | I | · | · | · | · | · | · | · | C | C | A/R | Métricas semanales |
| 41 | Ritual semanal y decisiones (pautar, cortar, repetir) | A | R | C | · | · | · | · | C | · | C | C | C | Objetivos, Panel |
| 42 | Aprendizajes: banco de ganchos, plantillas y checklists | I | A | R | · | C | C | C | R | · | C | C | C | — |

(¹) El dueño revisa por muestreo 1 de cada 5 guiones, y el 100 % de los que traen una oferta, precio, garantía, sorteo o promesa nueva. En marcas de clientes aprueba el cliente, según su contrato.
(²) Producción prepara los formatos (el dueño da el modelo legal) y los recoge. El talento firma antes de grabar. Las autorizaciones de terceros (Cámara Escondida, vía pública) se firman al terminar y se archivan antes de pasar a EDICION.
(³) El jefe de editores junta en un solo comentario por ronda las notas del guionista (una sola ronda), las del ATC (solo precio, oferta y palabra clave), las del dueño (solo piezas que irán a pauta o que llevan oferta) y las de coordinación.

### 2.3 Quién entrega qué a quién

| Etapa | De → A | Qué | Dónde queda | Plazo | Cuándo cuenta como recibido |
|---|---|---|---|---|---|
| Arranque | DU → GU, ATC, CO | Fichas de producto con precio final en S/, plazos por zona, stock y garantía | Marcas > brief operativo | Al crear la marca y cada vez que cambie | — |
| IDEA | CM, ATC → CO | Propuesta con plantilla (tendencia o pregunta, formato, gancho, producto, cierre, audio, fecha límite) | Canal de coordinación → tarjeta IDEA | Continuo | CO la registra como IDEA |
| GUION | GU → CO | Guion unido a la tarjeta, con nota (objetivo, avatar, gancho A/B, hipótesis, destino, riesgos) | Ficha + «Guion escrito y revisado» | IDEA → APROBADO en ≤ 48 h | CO aprueba o comenta |
| GUION | FM, AC, JE → CO y GU | Qué no se puede grabar, qué frases no suenan naturales, qué no se puede editar | Comentarios en la ficha | ≤ 24 h | GU responde en ≤ 24 h |
| GUION | GU → CO → ATC, CM, JE | **Ficha de oferta** (precio, vigencia, stock, bonus, garantía, palabra clave, respuestas a 3 objeciones) | Comentario fijado en la ficha | Con el guion, antes de APROBADO | ATC confirma que se puede cumplir antes de grabar |
| APROBADO | GU (+ JE) → FM, PR | Desglose único: planos con propósito, tomas imprescindibles ★, cobertura para edición, b-roll, locación, horario de luz, utilería | Comentario en la ficha | ≤ 24 h tras APROBADO | FM lo convierte en plan de rodaje |
| APROBADO | GU → AC | Brief de personaje, líneas literales (gancho y CTA), vestuario, referencia de tono | Ficha | 24 h antes | Lectura de mesa hecha |
| APROBADO | GU → CM | Caption base, pregunta para fijar, divulgación, horario sugerido, vencimiento de la oferta | Comentario en la ficha | **En APROBADO** (no en PROGRAMADO) | CM lo usa al programar |
| Preproducción | PR → FM, AC | Convocatoria, locación, props, formatos de autorización | Agenda + checks de preproducción | D-1 | Checks marcados |
| Preproducción | FM → AC | Lista de tomas, marcas y vestuario | Ficha o mensaje | D-1 | — |
| Preproducción | AC → PR | Asistencia confirmada, foto de vestuario, autorización firmada | Checks de preproducción | 24 h antes | PR marca los checks |
| Set | AC → FM | Audios (voz en off y wild lines), fotos de continuidad, mejores tomas | Carpeta compartida + comentario | Cierre de set | FM los incluye en el respaldo |
| GRABACION | FM → ED | Material crudo nombrado y respaldado, TXT de notas y enlace | Comentario en la ficha + checks de grabación | ≤ 2 h después del set | **ED pasa el video a EDICION** |
| EDICION | JE → ED | Brief operativo y asignación | Ficha + asignación «Editor» | Al entrar a EDICION | — |
| EDICION | ED → JE | V1 y V2 | Enlace en la ficha + «Editado» | Según la fecha del brief | JE responde en ≤ 4 h hábiles |
| EDICION | JE → CO | «QC aprobado + enlace» | Comentario | — | CO marca «Revisión final aprobada» |
| EDICION | ED → CM | Archivo FINAL por plataforma, _COVER, 4:5 si se pide, nota de entrega | 07_ENTREGA + comentario | Al quedar aprobado | CM lo revisa en la vista previa de cada app |
| EDICION | ED → ATC | Corte _WA con precio y vigencia | Carpeta o canal interno | Antes de publicar | ATC lo carga en sus respuestas rápidas |
| PROGRAMADO | CM → ATC | Fecha y hora de publicación, palabra clave, oferta | Mensaje + ficha | El día anterior | ATC activa la guardia |
| PUBLICADO | CM → ATC | Leads con ficha de pase | Bandeja y etiquetas | ≤ 15 min | ATC responde en ≤ 5 min |
| Venta | ATC → taller, DI | Orden completa y datos de personalización verificados | Orden de pedido | Al confirmar el pago | Etiqueta «En producción» |
| Métricas | CM → AN | Hoja a 24 h y 7 días, etiquetada por formato, gancho, cierre, horario y pauta | Hoja de la marca | A las 24 h y a los 7 días | AN carga la semana |
| Métricas | ATC → AN | Registro diario de leads y ventas por video de origen | Registro diario | Al cierre de turno | AN lo cruza con la semana |
| Métricas | AN → todos | Semana lunes a domingo cargada | Métricas | Lunes, antes del ritual | — |
| Semanal | ATC → GU, JE, CM | Las 5 preguntas y 3 objeciones más repetidas, en palabras del cliente; testimonios con permiso | Reporte semanal ATC | Lunes | Entran como insumo a ideas y guiones |
| Semanal | JE → GU, FM | Aprendizajes de retención y cobertura que faltó o sobró | Informe | Jueves o viernes | — |
| Mensual | DU → CO | Objetivos, presupuesto y ofertas del mes | Objetivos | Primer día hábil | — |

---

## 3. Inconsistencias entre manuales y cómo resolverlas

### 3.1 Bloqueos con Intia tal como funciona hoy

| # | Qué dice el manual | Qué hace Intia hoy | Resolución propuesta |
|---|---|---|---|
| B1 | Ningún manual dice quién marca «Guion escrito y revisado» | Es obligatorio para pasar a GRABACION y solo lo pueden marcar el guionista o el Dueño | **El guionista lo marca al enviar a aprobación.** Se agrega a su procedimiento. Sin esto, el filmmaker no puede pasar el video a GRABACION. |
| B2 | Filmmaker: «pasar el video a EDICION» | Pasar a EDICION exige `content.editing`, que el perfil CAMERA no tiene | **El editor pasa el video a EDICION cuando acepta el material.** Coincide con la regla del tutorial: la entrega del filmmaker es que «el editor aceptó el material». |
| B3 | Guionista: «carga de las IDEAS en el tablero» y «pasar la tarjeta a GUION» | WRITER no tiene `content.plan` | Coordinación registra las ideas. El guionista **une el guion** a la tarjeta, y la tarjeta pasa sola a GUION. |
| B4 | Guionista: lee las métricas semanales en Intia | WRITER no tiene `metrics.view` | Opción A: el analista le comparte el resumen, como ya se hace con el actor. Opción B: dar lectura de Métricas al guionista (cambio de política; lo decide el dueño). |
| B5 | ATC: registra IDEAS, lee el guion aprobado y revisa la vista previa en Intia | ATC no existe como perfil | Por ahora: manda sus ideas con la plantilla a coordinación, CO le comparte el guion y la ficha de oferta, y JE le comparte la vista previa. Definitivo: perfil ATC de solo lectura (idea aparte). |
| B6 | Jefe de editores: ve toda la cola, asigna editores, deja la cobertura en APROBADO y «registra la Revisión final si Intia le dio el permiso» | EDITOR solo ve lo que tiene asignado. Asignar exige `content.assign` y aprobar exige `content.approve`. | Temporal: CO asigna al jefe como «Editor» en cada video. No se recomienda darle STRATEGY, porque también aprobaría guiones y editaría marcas. Definitivo: perfil propio (idea aparte, ver 4.7). |
| B7 | Community: «descarga el master desde los adjuntos». Actor: audios «a Archivos del video». | Cada subida acepta como máximo 4 MB; un master de 30 a 60 s pesa decenas de MB | Masters, material crudo y audios van a la **carpeta compartida**, y en la ficha se pega el enlace. Los adjuntos quedan para archivos livianos: portada, notas, PDF. |
| B8 | Métricas a 24 h y 7 días; retención a 3 s **por variante de gancho** | Intia guarda **semanas de lunes a domingo** por video y plataforma, y `retention3s` no distingue variantes | Las métricas a 24 h y 7 días viven en la hoja de la marca. Cada variante que se publique debe tener su propia ficha para poder medirla. No se inventan datos por variante. |
| B9 | Dueño: autorizaciones de terceros «se archivan antes de pasar a EDICIÓN» | Ningún check lo exige | Agregar el check obligatorio de grabación **«Autorizaciones de imagen firmadas»**. Solo afecta a videos nuevos. Lo decide el dueño. |

### 3.2 Tareas duplicadas (dos o más roles asumen lo mismo)

| # | Qué choca | Manuales | Resolución (un solo responsable) |
|---|---|---|---|
| D1 | Paquete de entrega al community | Editor (ENTREGA) y jefe (17:00, paquete) | **El editor arma el paquete** y el jefe lo verifica en el QC. El aviso al community es la «Revisión final aprobada»: con ese check la ficha aparece en su lista. No hay un segundo paquete. |
| D2 | Brief para edición | Guionista (brief de montaje) y jefe (brief de edición) | **Un solo brief en la ficha, en dos bloques.** Creativo, a cargo del guionista: gancho del segundo 0, textos exactos, ritmo, referencias, CTA. Operativo, a cargo del jefe: formato, duración, tamaño de pieza, pauta, música permitida, fechas y editor. |
| D3 | Lista de tomas | Guionista (desglose con ★), jefe (cobertura), filmmaker (su propia lista) | El guionista escribe el desglose, el jefe **agrega** la cobertura para edición en el mismo comentario, y el filmmaker lo convierte en plan de rodaje. Es un solo documento. |
| D4 | Ficha de oferta para ATC | Coordinación (según ATC), guionista (en PROGRAMADO), jefe (resumen de los miércoles), dueño (antes de publicar) | **Una sola ficha de oferta por video.** La redacta el guionista junto con el guion, la aprueba el dueño y coordinación la fija en la ficha antes de APROBADO. ATC confirma que se puede cumplir antes de grabar. Se elimina el resumen de ofertas del jefe. |
| D5 | Autorizaciones de imagen | Producción, filmmaker, guionista, community, dueño, actor, editor | **Producción** las prepara (con el formato del dueño) y las recoge. En set, el filmmaker solo recoge las de terceros cuando no hay producción, y se las pasa a producción. Coordinación responde por que estén completas (B9). El guionista deja de «recogerlas». |
| D6 | Respaldo 3-2-1 y formateo de tarjetas | Filmmaker (después del set; «vaciar memorias» en D-1), editor (ingesta; autoriza formatear), jefe (doble copia; respaldo de las 18:00) | El filmmaker hace las copias 1 y 2. El editor las verifica en la ingesta, completa la copia 3 y **recién entonces autoriza formatear**. El jefe audita una vez al mes. |
| D7 | Portada | Filmmaker (fotos), editor (_COVER), diseñador (plantillas), guionista (textos), community (elige) | El diseñador es dueño de la plantilla. El editor exporta _COVER con esa plantilla y con el texto del guionista. El filmmaker aporta fotos si se le piden. El community elige y puede pedir cambios. |
| D8 | Pedidos de regrabación, pick-ups y ADR | Jefe (al filmmaker), editor o jefe (al actor), jefe (avisa a coordinación) | **Solo el jefe los pide.** Coordinación aprueba el costo y la fecha, producción agenda, y el filmmaker y el actor ejecutan. |
| D9 | Rondas de revisión del corte | Jefe (3 capas: v01, v02, v03), editor («máximo 2 rondas»), guionista (1 ronda), ATC (2 h), dueño (pauta y oferta) | **Ronda 1 (V1):** estructura, historia y fidelidad al guion, más precio, oferta y palabra clave; el jefe junta todo en un comentario en ≤ 4 h hábiles. **Ronda 2 (V2):** ritmo, textos, marca, técnica y legal. **V3 solo si el QC falla**, no por gusto. |
| D10 | Variantes de gancho | Guionista (A y B), editor (HOOK-A/B/C), filmmaker (5) | Estándar **HOOK-A a HOOK-E**. El guionista escribe A y B, que son obligatorias. El filmmaker graba A, B y hasta 3 alternativas. El editor publica A y prepara B o C solo si hay pauta o una prueba acordada. |
| D11 | Preguntas y objeciones frecuentes | ATC (reporte de los lunes al guionista), jefe (las pide los miércoles), community (las actualiza con ATC una vez al mes) | **Un solo reporte semanal de ATC**, los lunes, para guionista, jefe y community. Se elimina el pedido de los miércoles. |

### 3.3 Entregas que nadie recibe y roles sin manual

- **S1. Coordinación (STRATEGY) no tiene manual, pero es el centro del flujo.** Aprueba guiones y la revisión final, registra ideas, fija la ficha de oferta, asigna, reabre aprobaciones, pausa videos y recibe más de 20 traspasos. Sin su manual, la matriz RACI se queda sin quien la sostenga.
- **S2. El analista no tiene manual y recibe:** la lista de variantes (editor), las hipótesis y el banco de ganchos (guionista), el registro diario de ventas (ATC), la hoja a 24 h y 7 días (community) y la autoevaluación semanal (actor). Nadie define qué hace con eso ni cuándo lo devuelve.
- **S3. Producción y diseñador no tienen manual.** Producción concentra la convocatoria, las autorizaciones y los pick-ups. Al diseñador le llegan fotos (filmmaker), textos de portada (guionista) y mockups de pedidos (ATC). Estos mockups son diseño de producto, no de video: hay que aclarar quién los hace.
- **S4. Entregas huérfanas concretas:**
  - Actor → community: «CTA de comunidad grabados en varias versiones». El manual del community no dice que los recibe; hay que agregarlo.
  - ATC → community: «testimonios con permiso». El community no lo tiene en lo que recibe; hay que agregarlo.
  - Editor → filmmaker: nota de tomas que faltaron o sobraron. El filmmaker recibe notas del jefe, no del editor. Propuesta: el editor se la pasa al jefe, que la consolida en la revisión de los viernes.
  - Guionista → community: el caption llega en PROGRAMADO, pero el community lo necesita antes, al recibir la ficha aprobada. Se adelanta a APROBADO (ver 2.3).
  - ATC → «Logística / courier»: no es un rol del equipo. Hay que definir quién es.
- **S5. El tutorial actual contradice a los manuales.** En «Una semana de ejemplo», coordinación carga las métricas, mientras que en los manuales lo hace el analista. En el tutorial «la retención es del editor», mientras que en los manuales es compartida. Hay que ajustar ese texto cuando salga el manual.

### 3.4 Choques de calendario: cadencia semanal única propuesta

**El problema:** el ritual del dueño es el lunes a las 9:00 y pide los titulares de ATC, community y jefe. Pero el reporte del community llega a las 12:00, el guionista lee datos a las 9:00, el analista carga «antes del lunes a las 9:00», y el editor, el actor y el ATC tienen sus propias reuniones con el analista ese mismo lunes. Además, Intia registra semanas de lunes a domingo (hora de Lima), así que el domingo recién se puede cargar el lunes temprano.

| Día | Hora | Qué | Quién |
|---|---|---|---|
| Lunes | 8:00–9:30 | Carga de la semana anterior en Métricas; reporte semanal ATC; titulares de community y jefe | AN, ATC, CM, JE |
| Lunes | 10:00–10:45 | Ritual semanal | DU, CO y titulares |
| Lunes | 11:00–11:45 | Sesión de ideas (ganadores y perdedores, calendario, matriz ángulo × gancho × formato) | CO, GU, CM (ATC opcional) |
| Lunes | 12:00 | Reporte completo del community | CM → CO, DU |
| Lunes | Tarde | Retro por rol (ED + AN, 45 min; AC + AN, 30 min); planificación del filmmaker (1 h) | ED, AC, AN, FM |
| Jueves | — | Análisis de los videos publicados hace 2 a 7 días (paneles de cada red); el dueño lee 10 chats de ATC | JE, DU |
| Viernes | — | Post mortem del guionista; revisión de calidad (FM + JE + CM); formación y 1:1 de editores; parrilla y métricas a 7 días; tablero preliminar | GU, FM, JE, CM, DU |

### 3.5 Términos y nomenclatura

| Término | Problema | Propuesta |
|---|---|---|
| «Personas» | El manual del dueño dice «cargar 2-3 Personas a partir de chats reales», pero en Intia **Personas** (`/arquetipos`) son quienes salen frente a cámara | El avatar de cliente va en **Marca > Público**, y en el guion como «avatar». |
| «Talla» | El jefe la usa para el tamaño de la pieza (S/M/L); ATC la usa para la talla de las poleras | En el jefe se cambia a **«tamaño de pieza S/M/L»**. |
| «PRODUCTION / taller» | El manual de ATC mezcla producción audiovisual con el taller que fabrica | «Taller» es un área fuera de Intia; PRODUCTION es solo producción audiovisual. |
| Versiones | El editor usa V0_ARMADO, V1 y V2; el jefe usa v01, v02, v03 y FINAL | Se unifica en **V0 (armado interno), V1, V2, FINAL**. |
| «QC aprobado» y «Revisión final aprobada» | Se confunden | «QC aprobado» es el comentario del jefe; «Revisión final aprobada» es el check de coordinación que habilita publicar. |

### 3.6 Cambios a aplicar en cada manual

- **Guionista:** marcar «Guion escrito y revisado» (B1). Decir «unir el guion» en lugar de «pasar a GUION» (B3). Entregar el caption y la ficha de oferta en APROBADO (D4, S4). Dejar las autorizaciones a producción (D5). Métricas según la decisión de B4.
- **Filmmaker:** quitar «pasar a EDICION» (B2). Vaciar memorias solo después del OK del editor (D6). Las regrabaciones solo se piden a través del jefe (D8). Gancho de HOOK-A a HOOK-E (D10).
- **Actor:** audios y fotos van a la carpeta compartida (B7). Los pick-ups solo a pedido del jefe (D8). Definir quién recibe su autoevaluación (S2).
- **Editor:** pasa el video a EDICION al aceptar el material (B2). Su paquete de entrega es el único (D1). Nomenclatura V0, V1, V2, FINAL (3.5). La nota de retroalimentación al filmmaker va a través del jefe (S4).
- **Jefe de editores:** verifica el paquete del editor, no arma otro (D1). Brief solo operativo (D2). La cobertura se suma al desglose del guionista (D3). Sin resumen de ofertas los miércoles (D4, D11). Junta a los revisores por ronda (D9). «Tamaño de pieza» en lugar de «talla» (3.5).
- **Community:** los masters se bajan de la carpeta y no de los adjuntos (B7). Titulares antes de las 9:30 (3.4). Recibe los CTA grabados por el talento y los testimonios de ATC (S4).
- **ATC:** manda sus ideas con la plantilla a coordinación (B5). Recibe la ficha de oferta en APROBADO (D4). «Taller» no es PRODUCTION (3.5).
- **Dueño:** avatar en Marca > Público (3.5). Ritual a las 10:00 (3.4). Aprueba la ficha de oferta (D4). Decide los perfiles nuevos y los checks nuevos (sección 5).

---

## 4. Propuesta técnica para programarlo después (sin código)

### 4.1 Ruta y ubicación en el menú

| Ruta | Qué es | Quién |
|---|---|---|
| `/formacion` | Espacio Formación. Primera tarjeta: Manual de procedimientos; después Cómo se usa Intia y Mi avance | Todas las cuentas |
| `/formacion/manual` | Visión general (flujo, RACI resumida, reglas comunes) + 8 tarjetas de rol, con «Tu rol» primero | Todas |
| `/formacion/manual/[rol]?vista=mision\|procedimiento\|traspasos\|formacion&nivel=…` | Tarjeta de rol con sus 4 vistas | Todas |
| `/formacion/manual/[rol]/[modulo]?leccion=<id>` | Módulo con sus videos y lecciones; el detalle se abre con el parámetro | Todas |
| `/formacion/avance` | Avance del equipo por persona, rol y nivel | Solo Dueño |

- **Permisos:** en `SECTIONS` se agrega `training: { href: "/formacion", label: "Formación", capability: "training.view" }`, y `training.view` entra al conjunto `base`, igual que `help.view`. Hay que actualizar `tests/permissions.test.mjs`: un miembro sin perfiles pasa a ver `panel`, `profile`, `help` y `training`. También hay que agregar las rutas nuevas a la tabla «Rutas» del CONTRACT.
- **Menú (`src/components/shell.tsx`):** el grupo «Ayuda» pasa a llamarse «Formación», con «Manual de procedimientos» primero y «Cómo se usa» debajo. Se agrega un ancla `NAV_FORMACION` al catálogo de la guía.
- **Panel del miembro (`MemberWorkspace`):** hoy la grilla sigue el orden de `SECTIONS`. Hay que ordenarla de forma explícita para que el Manual salga primero.
- **Filtros por querystring** (`?nivel=`, `?q=`, `?leccion=`), para que las vistas se puedan compartir y funcionen sin JavaScript.

### 4.2 Contenido: archivos versionados en el repo, no tablas (por ahora)

**Recomendación:** que el contenido viva en **archivos JSON dentro del repo**, validados con Zod:

- `src/content/manual/roles/<rol>.json`: misión, frontera, procedimiento, recibe y entrega, niveles, módulos y lecciones.
- `src/content/manual/escenas/<id>.json`: definición de cada escena 3D.
- `src/lib/manual/schema.ts` (Zod) y `src/lib/manual/catalog.ts` (solo servidor, leído con `cache` de React).

**Por qué archivos y no tablas editables por el Dueño:**

- Son 618 lecciones escritas y revisadas por el equipo, y cada cambio queda como un diff revisable.
- No hace falta migración ni se toca la base de producción, y se mantiene el plan Hobby/Free.
- Volver atrás es trivial.
- El dueño lo pidió así: «ya luego yo veo si hay que modificar algo lo programamos».

Las tablas editables obligarían a construir formularios, validación, auditoría, restricción al Dueño y versionado. Eso queda **aplazado**.

**Reglas del contenido:**

- **ID de lección estable**, con la forma `<rol>.<nivel>.<modulo>.<leccion>` (por ejemplo `filmmaker.p.luz-natural.luz-de-ventana`). Cambiar un título no cambia el ID.
- **Versión por lección**, calculada como el hash de su contenido. Si una lección cambia después de completada, se marca «Actualizada: repásala».
- **Nunca se importa el JSON en un componente cliente**, porque inflaría el bundle. El servidor renderiza solo el rol o módulo que se está viendo.
- **Test nuevo** `tests/manual-content.test.mjs`, que se suma a `test:unidad`. Verifica:
  - que los IDs sean únicos;
  - que los títulos tengan de 2 a 5 palabras;
  - que la cantidad de lecciones coincida con la declarada en cada módulo;
  - que los IDs de YouTube cumplan `^[A-Za-z0-9_-]{11}$`;
  - que cada lección 3D apunte a una escena que exista.
- **Videos por módulo:** en la primera entrega van en el mismo JSON. Solo si el dueño los cambia seguido, se pasa a una tabla `ManualModuleVideo` (módulo, youtubeId, inicio, fin, orden) editable solo por el Dueño, en una entrega posterior.

### 4.3 Progreso por usuario (esto sí va en la base de datos)

- `ManualProgress { userId, lessonId, lessonVersion, completedAt }`, con clave compuesta `(userId, lessonId)` y relación a User con borrado en cascada. Es una migración aditiva y versionada en `prisma/migrations`.
- `ManualLearner { userId, manualRole }` (opcional). El Dueño asigna la ruta de formación desde Equipo. Sirve para ATC y jefe de editores, que no tienen perfil. **No da permisos**: función no es lo mismo que posición, como dice el CONTRACT.
- Se escribe con el patrón obligatorio de Server Action: `requireUser()` y verificación de que `lessonId` exista en el catálogo. Usa `<form action>` con `SubmitButton`, así que funciona sin JavaScript.
- **Auditoría:** propongo registrar solo «completó un módulo» (acción `COMPLETAR`), y no cada lección, para no llenar Actividad. Lo decide el dueño.

### 4.4 Visor 3D

- **Librerías:** `three`, `@react-three/fiber` v9 (compatible con React 19) y `@react-three/drei`, importando solo lo que se usa: OrbitControls, useGLTF, useAnimations y los helpers. Todo va dentro de `src/components/manual/escena-3d/*` con `"use client"`.
- **Carga diferida:** un botón liviano «Ver en 3D» carga el visor con `next/dynamic(..., { ssr: false })` recién cuando se pulsa. Three.js y fiber pesan, como orden de magnitud, 200 KB o más comprimidos, y **no deben aparecer en el bundle inicial ni en chunks compartidos**. El proyecto parchea Next y React (`scripts/patch-next-react.mjs`), así que hay que probar esta compatibilidad en una rama aparte.
- **Modelos:**
  - Un maniquí neutro con esqueleto y clips reutilizables: quieto, caminar, girar, señalar, sostener objeto, sorpresa, hablar a cámara.
  - Utilería low-poly: celular en trípode, aro de luz, softbox, panel LED, ventana, mesa, polera, taza.
  - **Licencias:** preferir paquetes CC0 (por ejemplo Quaternius o Kenney; hay que verificar cada paquete). Mixamo es gratis para proyectos, pero sus términos limitan redistribuir los archivos, y un GLB servido en público se puede descargar, así que habría que revisarlo.
  - **Peso:** GLB comprimidos con gltf-transform (meshopt y texturas WebP o KTX2), con un máximo de unos 1,5 MB por escena, servidos desde `public/formacion/3d/` con caché larga.
- **Escena como datos (JSON):** entorno; actores con posición, rotación, clip y marcas; cámaras con posición, objetivo, focal en mm, aspecto 9:16 y movimiento (tipo, desde, hasta, duración); luces con tipo (principal, relleno, contra, ventana), posición, temperatura en K, intensidad y suavidad; y **pasos** con segundo y texto («qué hacer en este momento»).
- **Qué se ve:**
  - vista orbital libre;
  - recuadro «lo que ve el celular» en 9:16 con la zona segura encima;
  - frustum de la cámara (CameraHelper);
  - conos de luz con color según la temperatura;
  - trayectoria del movimiento;
  - línea de tiempo con los pasos sincronizados, velocidad 0,5×, repetir y vistas predefinidas (frente, lateral, cenital, cámara).
- **Rendimiento:**
  - `frameloop="demand"`: solo se renderiza mientras hay animación o interacción;
  - `dpr` limitado a [1, 1,5];
  - sombras de contacto horneadas, sin sombras dinámicas en móvil;
  - pausa cuando el visor sale de pantalla (IntersectionObserver) o la pestaña queda oculta;
  - una sola escena abierta a la vez;
  - liberar geometrías y texturas al desmontar.
- **Respaldo:** si no hay WebGL2, si el flag está apagado o si el usuario elige «ver como imágenes», se muestra un storyboard de 3 a 6 imágenes WebP renderizadas de la misma escena, con los mismos pasos en texto.

### 4.5 Videos de YouTube

- **Fachada:** primero se muestra un botón con la miniatura (`https://i.ytimg.com/vi/<id>/hqdefault.jpg`, con `<img loading="lazy">`) y el título. **El iframe se crea recién al pulsar.** Así la página no carga nada de YouTube hasta que alguien decide ver el video.
- **iframe:** `https://www.youtube-nocookie.com/embed/<id>?start=…&end=…&rel=0&playsinline=1&autoplay=1`, con `title` obligatorio y `allow` limitado a lo que hace falta.
  - YouTube exige el encabezado Referer en los embeds: **no hay que usar `referrerpolicy="no-referrer"`**. Conviene `strict-origin-when-cross-origin`.
  - Contenedor de 9:16 para Shorts y de 16:9 para videos horizontales, con altura máxima de 70vh.
- **Seguridad:** hoy las páginas no tienen CSP (solo `/api/assets`). Si más adelante se agrega una, hay que incluir `frame-src https://www.youtube-nocookie.com` e `img-src https://i.ytimg.com`.
- Cada video lleva también un enlace «Abrir en YouTube», por si el video pasa a privado o lo borran.
- youtube-nocookie reduce el rastreo, pero no lo elimina una vez que se reproduce el video.

### 4.6 Accesibilidad y móvil

- **Lecciones:**
  - Los botones de lección son elementos reales (`<button>` o `<Link>`), de al menos 44 × 44 px.
  - El botón «!» tiene una etiqueta accesible, por ejemplo «Ver detalle de "Luz de ventana"».
  - «Completada» se indica con ícono y texto, no solo con color.
  - El foco siempre es visible.
  - El detalle se abre en un diálogo Radix (ya existe en `src/components/ui/`), con foco atrapado y cierre con Esc.
- **Escena 3D:**
  - El canvas lleva `role="img"` y una descripción, y **los pasos en texto son el equivalente completo** de la escena.
  - Se controla con botones (reproducir o pausar, paso anterior o siguiente, vistas), sin depender de arrastrar.
  - Con `prefers-reduced-motion` no arranca sola.
- **YouTube:** los subtítulos se activan desde el reproductor. Se puede forzar con `cc_load_policy=1` si el dueño lo quiere.
- **Móvil:**
  - niveles como pestañas fijas arriba;
  - módulos en acordeón;
  - lecciones en una grilla de 2 columnas (los títulos cortos entran);
  - el detalle se abre como hoja inferior de pantalla completa;
  - el 3D ocupa el 100 % del ancho, con una altura de `min(70vh, 560px)`;
  - sin scroll horizontal.
- **Reglas del CONTRACT:** Server Components por defecto. `"use client"` solo en el visor 3D, la fachada de YouTube y el diálogo. Íconos de `lucide-react` (GraduationCap, BookOpenCheck, PlayCircle, Box y CircleAlert o el carácter «!»). Clases y tokens del sistema (nada de `bg-white`). Estados vacíos siempre. `measurePagePhase` en cada página.

### 4.7 Qué ve cada perfil

| Quién | Ve | Puede |
|---|---|---|
| Cualquier cuenta activa (con o sin perfiles) | Formación y los 8 manuales completos, con la tarjeta de su rol primero | Marcar su propio avance |
| Dueño | Todo, más `/formacion/avance` | Asignar la ruta de formación (`ManualLearner`); más adelante, editar los videos por módulo |
| ATC y jefe de editores (sin perfil hoy) | Igual que cualquier cuenta; su tarjeta sale primero si el Dueño les asignó esa ruta | Marcar su avance |

- **«Tu rol» se decide así:** CAMERA → filmmaker, TALENT → actor, EDITOR → editor, PUBLISHER → community, WRITER → guionista, OWNER → dueño. Para ATC y jefe se usa `ManualLearner`.
- **Crear los perfiles ATC y Jefe de editores es un cambio aparte y del núcleo del sistema:** toca `WORK_PROFILES`, el CHECK de `UserWorkProfile`, los triggers que revocan sesiones, `access-scope` y los tests. No se mezcla con el manual.
  - Propuesta de base para el jefe: alcance por marca, con `content.view`, `content.editing`, `content.comment`, `scripts.view`, `assets.write` y asignar solo el rol Editor, sin `content.approve` salvo que el dueño decida otra cosa.
  - Para ATC: solo lectura por marca de videos, guiones y la ficha de oferta, más `content.comment`.

### 4.8 Kill-switch y criterio de HECHO

**Interruptores** (se leen en el servidor y siguen el patrón de `AI_JOBS_ENABLED`, `BLOB_PRIVATE_ENABLED` y `CATALOG_CACHE_ENABLED`):

| Variable | Apagada = |
|---|---|
| `MANUAL_ENABLED` | Se oculta Formación del menú y del panel, `/formacion/*` responde 404 y la acción de avance se rechaza. Los datos de avance se conservan. |
| `MANUAL_3D_ENABLED` | Se muestra el storyboard en imágenes y el chunk 3D nunca se descarga. |
| `MANUAL_VIDEOS_ENABLED` | Solo se muestra el enlace «Abrir en YouTube», sin iframe ni miniatura. |

Si algo sale mal, se apaga con la variable. No se depende de `git revert`.

**Criterio de HECHO (señales medibles):**

1. Al abrir `/formacion/manual/filmmaker` hay **0 peticiones** a youtube-nocookie o i.ytimg y **0 chunks de three** hasta que el usuario pulsa. Se verifica en la pestaña Red.
2. El JS inicial de `/formacion/*` no supera al de `/tutorial` en más de 10 KB (según la salida de `next build`).
3. Una escena 3D queda interactiva en ≤ 3 s y a ≥ 30 fps en un Android de gama media con 4G. Abrir y cerrar 10 escenas no sube la memoria JS más de 50 MB.
4. Cero respuestas 5xx en `/formacion/*` durante 24 h en producción.
5. `test:unidad` pasa con el test de contenido y el de permisos actualizado. La guía interactiva sigue encontrando sus anclas.

### 4.9 Entregas sugeridas (una sola en marcha a la vez)

| # | Entrega | Tamaño | Dónde se trabaja | Flag |
|---|---|---|---|---|
| E1 | Espacio Formación + manuales en texto + fachada de YouTube | M | Directo a `main` (tiene flag) | `MANUAL_ENABLED`, `MANUAL_VIDEOS_ENABLED` |
| E2 | Avance por usuario + vista del dueño (migración aditiva) | M | `feature/manual-avance` (toca la base) | `MANUAL_ENABLED` |
| E3 | Visor 3D piloto con 4 escenas | L | `feature/manual-3d` | `MANUAL_3D_ENABLED` |
| E4 | Resto de escenas 3D (unas 12 más) | M | `main` | `MANUAL_3D_ENABLED` |
| E5 (idea aparte) | Perfiles ATC y Jefe de editores | L, núcleo | `feature/perfiles-atc-jefe` | Sin reversa simple: requiere un plan propio |
| E6 (idea aparte) | Checks nuevos: «Autorizaciones de imagen firmadas» y, opcional, «Ficha de oferta aprobada» | S | `main` | Solo afecta a videos nuevos |

---

## 5. Preguntas abiertas para el dueño

1. **¿Qué significa «de primero»?** La propuesta cubre tres lugares: primera tarjeta del espacio Formación, primera tarjeta del Panel de cada miembro, y primer ítem del grupo «Formación» en el menú, debajo de los accesos de trabajo diario. ¿O prefieres que Formación vaya arriba de todo el menú?
2. **¿Todos ven todos los manuales,** con el suyo primero, o cada uno ve solo el suyo?
3. **¿Creamos ya los perfiles ATC y Jefe de editores en Intia** (entrega E5, cambio en el núcleo de permisos) o trabajan fuera de la app al inicio? ¿El jefe puede marcar «Revisión final aprobada» o eso sigue siendo solo de coordinación y tuyo?
4. **¿Hacemos manuales para Coordinación, Producción, Diseñador y Analista?** Muchas entregas dependen de ellos (sección 3.3). ¿Quién cumple hoy esas funciones?
5. **¿El guionista puede ver Métricas en solo lectura** (B4), o se las comparte el analista?
6. **¿Agregamos al checklist el check «Autorizaciones de imagen firmadas»,** obligatorio antes de EDICION? ¿Y «Ficha de oferta aprobada»?
7. **¿Aceptas la cadencia semanal única** (sección 3.4), con el ritual del lunes a las 10:00 en lugar de las 9:00?
8. **¿Dónde viven los masters, el material crudo y los audios?** (Drive, otra carpeta compartida). ¿Qué nombre tiene la carpeta raíz?
9. **Videos de YouTube:** ¿ya tienes la lista por módulo? ¿Serán del canal de la agencia (pueden ser «no listados») o de terceros, que pueden desaparecer? ¿Los cambiarás seguido? Si es así, conviene la tabla editable de la entrega 2.
10. **Escenas 3D:** ¿te sirven las 4 del piloto? ¿Te sirve el estilo maniquí neutro, o quieres personajes y entornos con la estética de Con Amor?
11. **Avance:** ¿es voluntario u obligatorio? ¿Quieres una práctica o evaluación para aprobar cada nivel? ¿Se conecta con tu evaluación mensual de KPIs por rol? ¿Coordinación también debe ver el avance del equipo?
12. **Contenido legal** (Indecopi, Ley 29733, Libro de Reclamaciones, publicidad con influencers): ¿lo revisa un abogado antes de publicar esos módulos?
13. **Marcas de clientes** (servicios, restaurantes): ¿el manual es genérico con ejemplos de Con Amor, o necesitas variantes por marca?
14. **Variantes de gancho:** ¿confirmas el estándar de 2 obligatorias (A y B) más hasta 3 alternativas (C a E) por video?

---

## Archivos de esta carpeta

| Rol | Archivo | Módulos | Lecciones | Escenas 3D | Videos verificados |
|---|---|---|---|---|---|
| Guionista / Creativo (WRITER) | [01-guionista.md](01-guionista.md) | 19 | 87 | 4 | 54 |
| Filmmaker / Cámara | [02-filmmaker.md](02-filmmaker.md) | 17 | 80 | 55 | 44 |
| Actor / Talento / Voz (perfil TALENT) | [03-actor.md](03-actor.md) | 17 | 71 | 33 | 51 |
| Editor audiovisual | [04-editor.md](04-editor.md) | 18 | 78 | 2 | 51 |
| Jefe de editores | [05-jefe-de-editores.md](05-jefe-de-editores.md) | 15 | 81 | 1 | 42 |
| Community Manager (perfil PUBLISHER) | [06-community-manager.md](06-community-manager.md) | 15 | 69 | 1 | 45 |
| ATC: Atención al Cliente y Ventas por Chat | [07-atc.md](07-atc.md) | 18 | 80 | 1 | 51 |
| Dueño de negocio (OWNER) | [08-dueno-de-negocio.md](08-dueno-de-negocio.md) | 16 | 72 | 1 | 48 |

Datos estructurados para programarlo: [curriculo.json](curriculo.json). Todos los videos se verificaron el 2026-09-28 con el oEmbed de YouTube (334 URLs, 0 fallos).
