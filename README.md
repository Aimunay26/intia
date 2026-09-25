# Intia

Sistema de operación de contenido para varias marcas: calendario y agenda, fichas de marca con
su identidad y sus objetivos, checklist por video, asignación de quién actuó / grabó / escribió,
métricas, log de auditoría, y un generador de guiones con IA afinado por formato y por la
marca personal de quien actúa.

Identidad visual: **Blanco y cobre**, Manrope y componentes shadcn/ui selectivos sobre
Next.js y Tailwind. [Decisiones de diseño y validación](reports/identidad-intia-2026-09-25.md).

Funciona con PostgreSQL tanto en desarrollo como en producción. La instalación publicada
usa Neon en Vercel. Las consultas analíticas y la paginación requieren PostgreSQL;
el antiguo modo SQLite ya no es compatible.

**Índice**

- [Arrancarlo](#arrancarlo) · [Primer ingreso](#primer-ingreso)
- [Cómo se trabaja](#cómo-se-trabaja): las tres fases de un video
- [Las dos afinaciones de la IA](#las-dos-afinaciones-de-la-ia): la estructura y la persona
- [Trabajar por marca](#trabajar-por-marca) · [Las dos posiciones](#las-dos-posiciones)
- [Calendario en Google Calendar](#calendario-en-google-calendar) · [Entrar con Gmail](#entrar-con-gmail)
- [Claves de IA](#claves-de-ia) · [Publicar en internet](#publicar-en-internet)
- [Comandos](#comandos) · [Cómo está organizado](#cómo-está-organizado)

---

## Arrancarlo

Node.js ya está instalado en esta máquina. **Abre una terminal nueva** (las que ya estaban
abiertas antes de instalarlo no reconocen el comando `npm`), ve a la carpeta del proyecto y:

```bash
npm run dev
```

Abre http://localhost:3000

> Si `npm` sigue sin reconocerse, cierra sesión de Windows y vuelve a entrar, o usa la ruta
> completa: `& "C:\Program Files\nodejs\npm.cmd" run dev`

En una instalación nueva, copia `.env.example` a `.env` y configura `DATABASE_URL`
para una base PostgreSQL de desarrollo vacía. Después:

```bash
npm run setup
```

Ese comando genera el cliente de Prisma y aplica las migraciones versionadas a la base vacía.
No carga datos de ejemplo. Para una demo local, exporta `DATABASE_URL` en el proceso de la
terminal y ejecuta `npm run db:seed` por separado. El seed, reset y `db:push` rechazan
conexiones remotas y entornos Vercel. No se ejecutan automáticamente al instalar o compilar.

### Primer ingreso

La app **no trae ninguna cuenta de dueño**. Configura `AUTH_SECRET` y, solo para la
instalación inicial, `BOOTSTRAP_TOKEN` con dos valores aleatorios independientes de 32 bytes.
Puedes generar cada uno con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
La primera entrada pide la clave de instalación para crear tu cuenta de dueño. Una vez creada,
retira `BOOTSTRAP_TOKEN`: el alta queda cerrada permanentemente, incluso si se desactiva una cuenta.

Para actualizar una instalación existente, sigue el [procedimiento de migraciones](reports/operacion-migraciones.md).
La [entrega de seguridad e integridad](reports/seguridad-integridad-1-2-2026-09-09.md) documenta
la versión anterior. La actualización semanal necesita coordinar la migración y el código;
no debe aplicarse mientras la versión anterior siga recibiendo escrituras.

Si cargaste la demo local, el equipo de ejemplo (Ana, Paula, Diego, Lucía, Marco) existe, con contraseñas
aleatorias que se imprimieron en la terminal cuando corriste el `seed`. Si las perdiste, se
cambian desde **Equipo** una vez que entres.

> Si al arrancar te salen errores 500 en algunas pantallas, borra la carpeta `.next-dev` y
> vuelve a arrancar. Pasa cuando se interrumpe una compilación a medias.

---

## Cómo se trabaja

Un video pasa por tres fases, y cada una vive en su sitio. Esto es deliberado: la idea nace
suelta y el guion llega después, cuando alguien se sienta a escribirlo.

**Fase 1 · La idea.** En **Calendario** o en **Videos**, botón *Nuevo video*. Eliges marca,
fecha, título, hook, prioridad y en qué redes va a salir (puedes marcar varias). La tarjeta
nace en estado *Idea*, **sin guion y sin estructura**: todavía no se sabe qué formato va a
tener.

**Fase 2 · El guion.** En **Generador IA** eliges la estructura y quién actúa, y la
IA escribe el desglose escena por escena. También puedes escribirlo a mano desde **Guiones**.

**Fase 3 · La unión.** Abres el guion y, en *Videos donde se graba este guion*, lo asignas a
la tarjeta. En ese momento el video **hereda la estructura del guion** y pasa de *Idea* a
*Guion*. Se puede deshacer desde cualquiera de los dos lados. Si en el generador elegiste la
tarjeta («¿Para qué video es?», o llegaste desde su botón *Crear guion con IA*), la unión la
hace sola el trabajo de generación con el primer guion que termina.

A partir de ahí el video avanza por sus estados (Aprobado → Grabación → Edición → Programado →
Publicado), se marcan los checks de producción, se asigna quién hace qué y se cargan las
métricas.

### La agenda

El calendario no es solo videos. Con el botón **Agendar** se añaden reuniones, días de
grabación, pendientes y recordatorios, con o sin hora y con o sin marca. Todo eso es lo que
viaja a Google Calendar.

### Prioridades

Semáforo, para leerlo de un vistazo: **azul** es baja, **naranja** media, **roja** alta.

---

## Las dos afinaciones de la IA

El generador no le pide un guion a la IA "en frío". Antes de cada generación arma un contexto
con dos piezas que tienen que hacer match:

### 1. La estructura (el formato ganador)

Vive en **Estructuras**. Cada una guarda:

- **Beats**: el esqueleto emocional en orden, con su objetivo y sus segundos.
  Por ejemplo: Golpe visual → Tensión → Incertidumbre → Plot twist → Gran emoción →
  Mostrar el producto → CTA.
- **Prompt del sistema**: instrucciones específicas de ese formato que se le inyectan
  literalmente al modelo.
- **Reglas duras**: lo que el modelo no puede romper (por ejemplo, "el producto no aparece
  antes del beat del giro").
- **Ejemplos ganadores**: guiones que ya funcionaron. La IA estudia su esqueleto para
  producir variantes nuevas, no para copiarlos.
- **Documentos PDF**: sus referencias. El texto se extrae al subirlos y se le pasa al modelo.

Vienen cargadas las 21 estructuras: 18 que venden (UGC, Camaleón, Ellos vs Nosotros, Venta
directa, PAS, Historia de Fundador, Testimonio, Oferta, Voz en off, Unboxing, Cómo se usa,
Antes y después, Respondiendo comentarios, Memes, Explicando beneficios, POV, Vlog de marca y
el Giro Emocional) y 3 que solo entretienen (Vlog, Sketch, Cámara escondida).

### 2. La persona que actúa

Vive en **Personas**. No es un perfil abstracto: es Eru, es Yoryo. Cada ficha lleva a una
persona real del equipo con su informe de marca personal, y se divide en dos partes.

**Pestaña Perfil — cómo actúa.** Su personalidad frente a cámara, lo que le sale natural,
**lo que NO le queda**, su tono y su nivel de energía.

**Pestaña Marca personal — cómo habla.** Esto es lo que hace que el guion suene a esa
persona y no a cualquiera:

| Bloque | Qué contiene | Para qué lo usa la IA |
| --- | --- | --- |
| Quién es | Su arquetipo principal, secundario y terciario, lo que quiere, lo que teme, su don y su trampa | Fija el registro del guion |
| Cómo habla | Tono de voz, cómo arma un mensaje, **las palabras que sí usa**, **lo que nunca diría**, una frase suya de referencia, sus **referentes de tono** y su gesto | Manda sobre cada línea de diálogo |
| Su imagen | Paleta, estética, tipografía y lo que visualmente no va | Orienta iluminación, vestuario, props y textos en pantalla |

**Referentes de tono.** Es el único campo que no sale del PDF: lo eliges tú. Son personas o
personajes cuyo registro quieres que se le pegue —Better Call Saul, Isra Bravo, Fer Miralles—.
Uno por línea, y puedes anotar qué le robas: `Isra Bravo — copy directo, sin adornos`. Al
prompt entran con una instrucción explícita: *no los imites ni los menciones, róbales el
registro, el ritmo y la actitud*. No confundir con "Referentes del mismo arquetipo", que sí
viene del informe (Isabel II, Rolex, Mercedes-Benz…) y no se elige.

Si su informe detecta una contradicción (por ejemplo: se presenta como Bufón pero sus
decisiones visuales apuntan al Gobernante), se escribe en **Aviso de coherencia** y el
generador recibe la orden de no apoyarse en ella y escribir desde el arquetipo principal.

El PDF del informe se adjunta en la pestaña **Documentos** y su texto también viaja al
prompt.

**Pestaña Compatibilidad — con qué formatos hace match.** Se puntúa cada estructura de 0 a 3:
*No encaja · Flojo · Sirve · Encaja perfecto*.

Esa matriz es el filtro que evita que alguien haga un formato que no va con su branding. El
generador pone a las personas del equipo por delante de las plantillas genéricas, las ordena
por compatibilidad, avisa cuando eliges a alguien que no encaja, y le dice al modelo
explícitamente qué le sale natural a esa persona y qué debe evitar.

#### Cargar a alguien nuevo

Se puede a mano desde **Personas → Marca personal**, o por lote copiando un bloque en
`prisma/seed-personas.ts` y corriendo:

```bash
npm run db:personas -- "C:/ruta/a/los/informes"
```

Busca en esa carpeta un `branding-<slug>*.pdf`, lo adjunta y le extrae el texto. Se puede
correr las veces que haga falta: actualiza por slug, no duplica, y **no pisa las
puntuaciones de compatibilidad que hayas corregido a mano**.

Para ver exactamente qué se le manda al modelo por una persona:

```bash
npm run ver:prompt -- yoryo
```

Las 6 plantillas genéricas que vienen con la instalación (Presentador Cómplice, Pareja Real,
Fundador Cercano, Cómico Físico, Cliente Honesto y Voz Narradora) aparecen aparte al final
de la lista y no llevan la voz de nadie. Sirven para probar; puedes eliminarlas cuando
tengas cargada a tu gente.

### 3. Con quién hace match un guion

Vive en `src/lib/match/`. **Dos motores**, no uno:

**«Por tipo de video»** — determinista, sin IA y sin clave de API. Cruza el formato con el perfil
de cada persona usando nueve señales con pesos, y **enseña la aritmética**: cada señal se muestra
con lo que suma o resta. Si tiene menos de dos señales con dato, dice «sin datos» en vez de
inventarse un número.

Los cortes de puntuación **no son redondos ni inventados**: salen de barrer todas las
combinaciones contra la matriz entera y quedarse con la que minimiza el error caro. Porque los
errores no cuestan igual — confundir «Sirve» con «Encaja perfecto» no rompe nada, pero decirle
«No encaja» a alguien que sí encajaba le esconde una opción buena al dueño sin que se entere.

Se comprueba con:

```bash
npm run test:motores
```

Puntúa cada par persona × formato **a ciegas** —sin dejarle ver la matriz— y compara. Hoy: 93% no
se aleja más de un punto, cero errores de lado, cero rechazos falsos. Si se tocan los pesos de
`src/lib/match/lexico.ts`, hay que volver a correrlo y mover los cortes.

**«Automático»** — el principal. La IA lee el guion de verdad y decide. Diseñado, todavía sin
construir.

### El origen de cada puntuación

Cada fila de la matriz de compatibilidad guarda de dónde salió: **A mano** (lo puso el dueño),
**Sembrado** (lo dedujo un script de los arquetipos) o **Fijado desde un match**. Importa porque
el prompt de generación lee esa fila: solo el criterio humano tiene derecho a hablar ahí. Ningún
motor escribe solo en la matriz — una puntuación automática mala no se queda en una tabla fea,
envenena en silencio todos los guiones que se generen después con ese formato.

### El Generador IA: Asistente de Ideación por Etapas (Gemini-Style)

En vez de un formulario con scroll vertical largo, el generador organiza la creación de guiones en **5 etapas progresivas e interactivas**:

1. **Formato (21 Estructuras Ganadoras Enriquecidas):** Filtra por objetivo (*Vende* vs *Entretiene*) o busca por nombre. Cada formato cuenta con su **ficha de referencia enriquecida**: modelo mental, gancho en segundos 0 a 3, regla de oro, secreto de retención y ejemplos ganadores reales cargados en el pre-prompt de la IA (incluye *Giro 180°*, *Camaleón 90/10*, *Ellos vs Nosotros*, *PAS*, *UGC*, *Historia de Fundador*, *ASMR Unboxing*, *Hack en 3 pasos*, *Respondiendo Comentarios* y más).
2. **Identidad & Producto:** Elige la marca, la persona frente a cámara (con su indicador de encaje o fit con el formato) y detalla a fondo el **producto o servicio a grabar** (la IA asimila todas las características, beneficios y objeciones aunque el guion solo lo mencione sutilmente al final).
3. **Ángulo creativo e idea central (12 Enfoques Virales):** Botones de ángulos (*Camaleón 90/10*, *Ellos vs Nosotros*, *Impacto Visual*, *POV Real*, *Anti-Consejo*, *Experimento*, *Storytime / Confesión*, *Parodia Cotidiana*, *Frente al Hater*, *Hack Oculto*, *ASMR Unboxing*, *Detrás de Cámaras*) que definen el giro psicológico exacto, más la petición o historia del video.
4. **Cierre CTA (Alex Hormozi):** Gatillos de alta conversión (*$100M Offers* y *$100M Leads*: escasez ética de cupos, urgencia temporal, motivo "porque...", incentivo/regalo, demostración visual en cámara) con fórmulas reactivas y ensamblado automático. El cierre tiene dos modos: **Vender** (esos gatillos) y **Sin venta · Comunidad** (seguir para la parte 2, guardar, enviárselo a alguien concreto, etiquetar con motivo, pregunta abierta, encuesta real, pedir el siguiente tema…). El generador arranca en comunidad cuando la estructura entretiene; en ese modo la IA tiene prohibido meter precios, ofertas, cupos, enlaces o DM aunque la estructura sea de venta. El modo elegido viaja con el trabajo y se aplica a todos los formatos del lote.
5. **Motor de IA y generación:** Selector de proveedor (Claude / Gemini), modelo (del catálogo del proveedor; ver [Claves de IA](#claves-de-ia)), duración y checklist ejecutivo de ideación.

### La generación corre en segundo plano

Al pulsar **Generar** no se espera a la IA con la pestaña abierta: se registra un **trabajo**
(un elemento por estructura, hasta tres) y se abre su pantalla de avance en **Generador → Mis
generaciones**. Ahí aparecen los guiones a medida que salen, qué falló y por qué, y los botones
*Reanudar si se detuvo* (se permite tras seis minutos sin avance) y *Cancelar pendientes*
(conserva los guiones ya terminados). Requiere `AI_JOBS_ENABLED="true"` en el servidor; sin
el flag el generador lo dice y no registra nada.

Lo que admite el trabajo:

- **El video del calendario.** En la etapa 2, *¿Para qué video es?* lista solo tarjetas en
  *Idea* o *Guion* que aún no tienen guion (o llegas ya con una desde su ficha, con sus
  formatos previstos preseleccionados). El **primer guion que termina** se une a esa tarjeta:
  el video hereda la estructura y pasa a *Guion*; los demás guiones del lote quedan sueltos y
  se asignan desde su ficha. Si mientras se generaba alguien le puso otro guion a la tarjeta,
  no se pisa: el guion se crea igual, suelto, y el trabajo lo avisa junto a su estado.
- **El modo de CTA** (*Vender* o *Sin venta · Comunidad*), que se aplica a todos los formatos
  del lote y queda anotado en el brief de cada guion.

Si algo falla, el trabajo lo dice con el mismo criterio que la pantalla de Ajustes: qué pasó,
qué hacer y, si la clave fue rechazada, de dónde salió. Cuota, error del proveedor o tiempo agotado se reintentan
solos (hasta tres intentos por formato, con espera creciente). **Si la clave es rechazada, se
cancelan los formatos restantes del lote** («No se intentó: la clave fue rechazada…»): repetir
solo gastaría intentos. Lo ya generado se conserva siempre, y el aviso final distingue lo que
falló de lo que no se intentó.

### Lo que devuelve

Un guion desglosado escena por escena, listo para grabar, con: **voz** (el texto exacto),
**encuadre**, **acción**, **actores** y qué perfil los interpreta, **emoción**, **iluminación**
que refuerza esa emoción, **sonido**, **elementos de utilería**, **texto en pantalla**,
**locación** y los tiempos de cada bloque.

---

## Quién actúa cada guion

Decidir si un guion y las personas disponibles hacen match era, hasta ahora, rellenar una
matriz a mano. Ahora hay dos motores.

**«Por tipo de video»** es determinista: no usa IA, no gasta clave y responde al instante.
Cruza el formato del video (su categoría, su familia, sus beats, sus reglas) con el perfil de
cada persona, y devuelve una puntuación de 0 a 3 con **todas las señales que la produjeron a la
vista**. No te pide que le creas: te enseña la suma.

Nueve señales, con su peso: el criterio humano previo, el choque con lo que esa persona evita,
lo que le sale natural, el ritmo del formato contra su nivel de energía, su arquetipo contra la
familia del formato, las emociones que el guion pide, los papeles que hay en el guion, si tiene
voz cargada, y si es una plantilla genérica en vez de alguien del equipo.

Dos detalles deliberados:

- **Si tiene menos de dos señales con dato, dice «Sin datos» en vez de inventarse un número.**
  Un motor que solo miró el ritmo no tiene derecho a decir «no encaja».
- **Los dos extremos están puestos lejos.** Para decir «encaja perfecto» hacen falta 78 puntos
  y para decir «no encaja» hay que bajar de 20. Este motor solo miró el *tipo de video*, así
  que no tiene autoridad ni para coronar a nadie ni para vetarlo. Lo que hace bien es ordenar
  y avisar.

Los cortes no son redondos porque salen de medir, no de opinar:

```bash
npm run test:motores
```

Puntúa a ciegas cada par persona × formato —sin dejarle ver la matriz— y lo compara con lo que
ya está escrito. Hoy: **93 % no se aleja más de un punto, cero se equivoca de lado y cero
rechazos falsos.** Si cambias los pesos o entra gente nueva, vuelve a correrlo.

Los umbrales no son simétricos a propósito. Confundir «Sirve» con «Encaja perfecto» no rompe
nada: mirarás las dos. Pero decirle «No encaja» a alguien que sí encajaba te esconde una opción
buena y no te enteras nunca. Por eso ese error tiene tolerancia cero y acertar la casilla exacta
es el umbral más flojo.

**«Automático»** es el principal y lo decide la IA: lee el guion de verdad —sus escenas, sus
diálogos, sus emociones— junto al informe de marca personal de cada persona, y devuelve un
ranking con motivo, citas textuales del guion, papeles que puede hacer y riesgos. *Está
diseñado y todavía no construido.*

### De dónde salió cada número de la matriz

Cada fila de compatibilidad lleva ahora su origen, y se ve en **Personas → Compatibilidad**:

| Origen | Qué significa |
|---|---|
| **A mano** | Lo pusiste tú. Es el único que habla en tu nombre. |
| **Sembrado** | Lo dedujo un script del arquetipo de esa persona al instalar. |
| **Fijado desde un match** | Salió de un match sobre un guion concreto, y enlaza a ese guion. |

Esto importa por una razón que no se ve: **esa matriz alimenta el prompt de todos los guiones
futuros de ese formato.** Una puntuación automática mala no se queda en una tabla fea, envenena
en silencio cada guion que se genere después. Por eso ningún motor escribe ahí solo, y solo el
criterio humano —*A mano* o *Sembrado*— viaja al prompt. En cuanto tocas una fila, pasa a ser
tuya.

---

## Claves de IA

Se pueden usar Claude (Anthropic) y Gemini (Google). Se configuran en dos sitios, y **la clave
guardada en Ajustes manda**; la variable de entorno es solo el respaldo cuando no hay ninguna
guardada:

**Opción A — desde la app** (la que se usa si existe): entra a **Ajustes** y pega la clave. Si
una clave se revoca, basta con crear otra y pegarla ahí, sin tocar el servidor ni redesplegar.
Ten en cuenta que esa clave vive en la base de datos y viaja en sus copias de seguridad.

**Opción B — variables de entorno** (respaldo): edita el archivo `.env` (o las variables del
proyecto en Vercel)

```
ANTHROPIC_API_KEY="sk-ant-..."
GEMINI_API_KEY="..."
```

Solo se usan cuando no hay clave guardada en Ajustes (para Gemini también vale
`GOOGLE_API_KEY` como alias). Para volver a ellas, marca «Quitar la clave guardada» en Ajustes.
La pantalla muestra siempre el origen de la clave en uso («guardada en Ajustes» o «variable de
entorno») y el botón **Probar la clave en uso** la comprueba contra el proveedor real sin
guardar nada: con Claude hace una petición mínima de un token con `claude-haiku-4-5` (confirma
también el saldo); con Gemini **consulta el modelo elegido del catálogo sin gastar tokens**
(no certifica la cuota de generación, que se comprueba al generar). El resultado dice qué clave
se probó: la escrita, la guardada en Ajustes o la del servidor.

Las claves se consiguen en `console.anthropic.com` → API keys y en `aistudio.google.com` →
Get API key. Los errores de IA dicen qué pasó y qué hacer, y cuando la clave es rechazada
dicen además **de dónde salió la que se usó** («guardada en Ajustes» o «de la variable de
entorno GEMINI_API_KEY del servidor»): está revocada o mal copiada, así que genera otra y
pégala en Ajustes, que manda sobre la variable de entorno.

**Intia no impone cupos diarios de IA:** registra las peticiones, pero no las bloquea por
cantidad de llamadas, trabajos, despachos ni repeticiones de un documento. El proveedor
aplica sus propias cuotas. Si confirma que se agotó la cuota diaria gratuita, la app indica
que puedes usar un proyecto de API con facturación habilitada y actualizar su clave en
Ajustes, o esperar la renovación. La falta de saldo también requiere revisar facturación.
Los límites temporales se muestran como tales; un 429 sin detalle no permite afirmar que se
agotó el plan gratuito. Los errores de cuota diaria y facturación no se reintentan automáticamente.

Las antiguas variables `AI_DAILY_CALLS`, `AI_USER_DAILY_CALLS`, `AI_DAILY_JOBS`,
`AI_DAILY_DISPATCHES` y `AI_32D_DISPATCHES` ya no tienen efecto. Se conservan autorización,
idempotencia, plazo compartido, tamaño del lote y controles de concurrencia/reintentos.

**El modelo se elige del catálogo** de `src/lib/constants.ts` (`AI_MODELS`): Claude Opus 5,
Sonnet 5 y Haiku 4.5; Gemini 3.8 Flash. Manda lo elegido en el generador; si no, el modelo de
la estructura (solo si es del mismo proveedor); después el «Modelo por defecto» de Ajustes; y
si no hay ninguno, el predeterminado del catálogo: `claude-opus-5` para Claude y
`gemini-3.8-flash` para Gemini. Un nombre fuera del catálogo se rechaza antes de gastar la
llamada, y los valores heredados `gemini-2.5-pro` y `gemini-2.5-flash` se resuelven solos a
`gemini-3.8-flash`. Si sale un modelo nuevo, se añade al catálogo.

> Nota: ni los modelos Claude actuales ni Gemini 3.8 reciben el parámetro `temperature`. El
> valor de temperatura de cada estructura se conserva en su ficha, pero ya no se envía a
> ningún proveedor.

---

## Publicar en internet

La app se despliega en Vercel con PostgreSQL. Para una instalación existente, usa el
[procedimiento de migraciones y recuperación](reports/operacion-migraciones.md).
Los siguientes pasos corresponden a una instalación nueva y vacía.

**0. Si la base ya existe, aplica antes las migraciones pendientes** con `npm run db:migrate`
(`prisma migrate deploy`), siguiendo el [procedimiento de migraciones](reports/operacion-migraciones.md)
desde el mismo commit que vas a publicar. Esta versión trae
`prisma/migrations/20260910120000_content_structure_ids`, que añade la columna
`ContentItem.structureIds` (formatos previstos; sin ella `/contenido`, `/calendario` y el
generador devuelven 500 con el código nuevo). Es aditiva e idempotente. No hace falta tocar el
ajuste `ai.google.model`: un valor heredado (`gemini-2.5-pro` o `gemini-2.5-flash`) se resuelve al
modelo vigente del catálogo al leerlo. Verifica con `npx prisma migrate status` o con
`SELECT column_name FROM information_schema.columns WHERE table_name = 'ContentItem' AND column_name = 'structureIds';`.
Los scripts de `prisma/operations/` (control de despliegue, activación de perfiles) son
operaciones del procedimiento, no sustituyen a las migraciones versionadas.

**1. Crea la base de datos** en Neon, Supabase o quien prefieras, y copia su cadena de
conexión.

**2. Verifica que el motor del esquema sea PostgreSQL** (ya es el valor del repositorio):

```bash
npm run use:postgres
```

**3. Revisa y confirma cualquier cambio de esquema en Git.** No cambies de motor entre
desarrollo y producción.

```bash
git add prisma/schema.prisma && git commit -m "Cambia el motor a PostgreSQL"
```

**4. Aplica las migraciones** con la conexión de la base nueva en `DATABASE_URL`.
No uses `db push` como procedimiento de actualización de producción.

```bash
npm run db:migrate
```

**5. Genera la clave de sesión.** Es obligatoria: desde ahora la aplicación **se niega a
arrancar en producción** sin ella, precisamente para que no se despliegue firmando sesiones
con una clave que está escrita en el código.

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

**6. Sube el proyecto a GitHub, impórtalo en Vercel** y define allí las variables de entorno:
`DATABASE_URL`, `AUTH_SECRET`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` y, si vas a usar la
entrada con Gmail, `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`.

**7. Configura temporalmente `BOOTSTRAP_TOKEN` y crea la cuenta de dueño** desde el primer
ingreso. Retira el token al terminar. Las marcas y el equipo reales se crean desde la app;
los datos de demo quedan reservados para PostgreSQL local.

Para desarrollo usa otra base PostgreSQL; `npm run use:sqlite` termina con un mensaje
explicativo y conserva el esquema actual.

### Dos límites de Vercel que conviene conocer

**Los archivos de referencia no pueden pasar de 4 MB.** Vercel corta en 4,5 MB el cuerpo de
cualquier petición y de cualquier respuesta a una función. Por eso el tope de subida está en
4 MB: para que el aviso lo dé la aplicación en español y no la plataforma con un error mudo.
Si tienes PDFs más grandes, recórtalos o pega solo el texto que importa desde el botón de
editar del documento.

**La generación solo corre en segundo plano y exige `AI_JOBS_ENABLED="true"`.** Sin el flag
el generador queda deshabilitado y lo dice. El avance aparece en **Generador → Mis
generaciones**, con recuperación y cancelación de pendientes. Cada llamada al proveedor tiene un
límite de 240 segundos; el ejecutor necesita Fluid Compute. Hobby admite hasta 300 segundos
por función con Fluid Compute, según la [documentación de Vercel](https://vercel.com/docs/functions/limitations).
Las cuotas de infraestructura no incluyen las tarifas de Anthropic o Gemini.

---

## Las dos posiciones

Solo hay dos, a propósito:

| Posición | Puede | No puede |
|---|---|---|
| **Dueño** | Todo | — |
| **Equipo** | Crear, editar, mover, asignar, publicar, subir métricas y marcar checks | **Eliminar nada.** Tampoco gestionar personas ni tocar ajustes |

La regla del equipo es literal: pueden mover cualquier cosa, pero no pueden destruir
ninguna. Ni una marca, ni un video, ni un guion, ni una métrica, ni un archivo. Sí pueden
desmarcar un check, quitar una escena de un guion, cambiar a quién está asignado un papel
y desvincular un guion de un video, porque eso es mover, no borrar.

Cada escritura queda registrada en **Actividad** con quién la hizo, qué cambió (valor antes
y valor después), sobre qué marca y a qué hora. Esa pantalla también muestra quién **no** ha
movido nada en el periodo.

### Entrar con Gmail

El equipo puede entrar con su cuenta de Google en vez de recordar otra contraseña. Se activa
en **Ajustes → Entrar con Google** pegando las dos claves que da Google Cloud (ahí mismo
tienes las instrucciones y la dirección exacta que hay que registrar).

Importante: **entrar con Google no crea cuentas**. Solo pasan las personas que ya diste de
alta en **Equipo** con ese mismo correo. Si no fuera así, cualquiera con un Gmail entraría.

## Trabajar por marca

Arriba de la barra lateral hay un selector con dos modos:

- **Todas las marcas** — el conjunto: el calendario completo con su total y el reparto por
  marca, las métricas sumadas, todos los guiones.
- **Una marca** — entras dentro de ella y todo se filtra: calendario, videos, guiones,
  métricas y actividad. Lo que crees ahí nace ya con esa marca puesta.

La elección se recuerda al navegar y al volver otro día.

## Calendario en Google Calendar

El calendario de la aplicación guarda todo: videos programados, días de grabación,
reuniones, pendientes y recordatorios (el botón **Agendar** del calendario crea estos
últimos).

Para verlo en Google Calendar, ve a **Ajustes → Google Calendar**, copia la dirección y en
Google Calendar entra en **Otros calendarios → Suscribirse a un calendario → Desde URL**.
Google la relee sola cada pocas horas.

Dos cosas que conviene saber:

- Es **de solo lectura**: lo que crees en Google Calendar no vuelve a la aplicación. Para
  que fuera en los dos sentidos haría falta conectar la cuenta de Google con permisos de
  escritura, que es otro trabajo.
- Mientras la aplicación corra solo en tu computadora, Google no puede alcanzar esa
  dirección. Funcionará en cuanto la publiques en internet.
- Quien tenga la dirección ve la agenda sin entrar a la aplicación. Si se filtra, cámbiala
  desde ahí mismo.

---

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Arranca el servidor de desarrollo |
| `npm run build` | Compila para producción |
| `npm start` | Sirve la versión compilada |
| `npm run setup` | Genera el cliente y aplica migraciones; no carga demo |
| `npm run db:migrate` | Aplica las migraciones pendientes |
| `npm run db:baseline` | Comprueba, sin modificar, que la DB existente coincide con la línea base |
| `npm run db:integridad` | Consulta referencias inválidas y archivos huérfanos |
| `npm run db:seed` | Carga la demo únicamente en PostgreSQL local explícito |
| `npm run db:reset` | **Borra todo en la DB local indicada** y aplica migraciones; no carga demo |
| `npm run db:ensayo` | Ensaya migración y restauración en bases locales efímeras |
| `npm run lint` / `npm run typecheck` | Verifica estilo y tipos |
| `npm test` / `npm run test:postgres` | Pruebas unitarias y de integración en PostgreSQL local efímero |
| `npm run perf:local` | Mide la navbar y conflictos de edición con la compilación de producción local |
| `npm run db:studio` | Abre Prisma Studio para ver la base de datos |
| `npm run use:postgres` | Cambia el esquema a PostgreSQL |
| `npm run use:sqlite` | Informa que SQLite ya no es compatible; no modifica el esquema |
| `npm run db:personas` | Carga o actualiza a las personas del equipo desde su informe |
| `npm run ver:prompt -- eru` | Imprime el prompt exacto que se le manda a la IA por esa persona |
| `npm run test:motores` | Calibra el motor de match contra la matriz de compatibilidad |
| `npm run test:humo` | 37 comprobaciones: permisos, calendario, datos y archivos |
| `npm run test:unidad` | Todas las pruebas unitarias sin base de datos (navegación, rendimiento, seguridad, claves de IA, parser de PDF, formatos previstos y CTA de comunidad) |
| `npm run test:cta` | Vigila que los CTA de comunidad no lleven presión ni oferta (`tsx --test`) |

> `npm run build` falla si el servidor de desarrollo está corriendo: Windows tiene bloqueado
> el motor de Prisma. Detén el servidor antes de compilar.

---

## Cómo está organizado

```
prisma/
  schema.prisma          Modelos de la base de datos
  seed.ts                Datos iniciales
  seed-structures.ts     Las 21 estructuras de video
  migrate-roles.ts       Migración puntual de los cuatro roles viejos a dos
src/
  app/
    (app)/               Todas las pantallas con sesión iniciada
    actions/             Server Actions: toda escritura pasa por aquí
    api/
      auth/google/       Entrar con Gmail (OAuth 2.0)
      calendario.ics/    Feed que lee Google Calendar
      assets/[id]/       Descarga de los PDF de referencia
    login/               Entrada y alta del primer dueño
  components/
    brand-switcher.tsx   Selector de marca activa (barra lateral)
    assets.tsx           Gestor de PDF de referencia
    charts.tsx           Gráficos en SVG, sin librerías
    ui.tsx               Tarjetas, chips, avatares, estados vacíos
  lib/
    ai/                  Generador: contexto, esquema y proveedores
    auth.ts              Sesiones, contraseñas y permisos
    audit.ts             Registro de auditoría
    brand-context.ts     Marca activa (servidor)
    brand-shared.ts      Lo de la marca activa que también usa el navegador
    google.ts            OAuth de Google
    ical.ts              Generación del archivo .ics
    constants.ts         Catálogos de estados, roles, redes y prioridades
    utils.ts             Formato, fechas, zona horaria y utilidades
CONTRACT.md              Reglas internas de desarrollo
```

Dos detalles del código que conviene saber si vas a tocarlo:

- **Los campos JSON se guardan como texto.** Se conserva el modelo heredado sin enums ni
  listas escalares en PostgreSQL. Las redes de un video, los beats de una
  estructura o las fortalezas de un arquetipo son `String` con JSON dentro, y se leen siempre
  con los ayudantes de `lib/utils.ts`, nunca con `JSON.parse` a pelo.
- **La hora de las reuniones se fija en `America/Lima`**, no en la del servidor. Está en
  `APP_TIMEZONE` (`lib/utils.ts`). Sin eso, al publicar en Vercel —que corre en UTC— las
  reuniones se irían cinco horas.

---

## Evaluaciones técnicas

- [Implementación O01–O07](reports/implementacion-o01-o07-2026-09-08.md): estado actual, pruebas con PostgreSQL, diagnóstico de Vercel/Neon y procedimiento de medición.
- [Medición de la versión publicada](reports/medicion-publicada-o01-o07-2026-09-08.md): despliegue verificado, tiempos individuales de navegación, observación tras inactividad y límites de la muestra.
- [Diagnóstico directo de Neon/Vercel](reports/diagnostico-neon-2026-09-08.md): región, pooling, suspensión, volumen e índices contrastados en producción mediante consultas de solo lectura.
- [Mejoras de navegación del primer lote](reports/mejoras-navegacion-implementadas-2026-09-08.md): registro histórico del commit `051a957`, pruebas locales y su publicación. Regresiones: `npm run test:navegacion` (Node 24).

- [Auditoría de arquitectura, backend, DB y multitenancy](reports/auditoria-arquitectura-multitenant-2026-09-07.md): hallazgos con evidencia, reproducciones y plan de evolución.
- [Plan de optimización de la navegación](reports/plan-optimizacion-navegacion-2026-09-07.md): análisis de la espera al cambiar de sección, mejoras propuestas y criterios de medición.

La auditoría y el plan describen la copia revisada el 7 de septiembre de 2026; el informe de implementación registra los cambios del día 8. Ninguno acredita por sí mismo la configuración o versión publicada en producción.

## Antes de abrirlo al equipo

- [ ] Define `AUTH_SECRET` con una cadena larga y aleatoria. Sin esto, las sesiones se firman
      con una clave de desarrollo pública y cualquiera podría falsificar la del dueño.
- [ ] Cambia las contraseñas del equipo de ejemplo, o elimina esas cuentas si no las usas.
- [ ] Decide dónde viven las claves de IA: la guardada en Ajustes manda (cómoda para rotarla sin redesplegar, pero viaja en las copias de la base); la variable de entorno queda solo de respaldo.
- [ ] Revisa quién tiene la posición de **Dueño**: es la única que puede eliminar.
- [ ] Cambia la dirección del calendario si la compartiste durante las pruebas.
- [ ] Verifica PostgreSQL y los respaldos del proveedor antes de usar datos reales.

## Lo que NO hace todavía

Para que no haya sorpresas:

- **Google Calendar es de solo lectura.** Lo de aquí aparece allá, pero lo que crees en Google
  no vuelve. La sincronización en los dos sentidos es otro trabajo.
- **No hay recuperación de contraseña.** Si alguien la olvida, se la cambia el dueño desde
  **Equipo**.
- **La aplicación no gestiona copias de seguridad automáticas.** La retención y restauración
  de PostgreSQL dependen del proveedor y deben verificarse en su panel.
- **Eliminar una marca elimina en cascada** todos sus videos, guiones, métricas y checklists.
  Por eso solo puede hacerlo el dueño. Si dudas, usa **Archivar**.
- **Las métricas son semanales por plataforma**: solo lo obtenido de lunes a domingo, nunca
  el acumulado del video. Los registros históricos se conservan por separado. Se cargan a mano
  o pegando un CSV. No hay conexión automática con TikTok,
  Meta ni YouTube.
- **La IA admite hasta tres estructuras por solicitud**, con ejecución secuencial durable.
  Cada envío genera una variante de cada estructura; los límites diarios se reservan antes de llamar al proveedor.
- **El motor automático de match está diseñado, no construido.** Hoy funciona el motor «Por
  tipo de video», que no gasta clave. El que lee el guion con IA es el siguiente paso.
- **El generador sigue siendo un formulario largo.** El módulo conversacional con carga de
  audios, enlaces y referencias está diseñado y pendiente de construir.
- **No se pueden subir audios ni enlaces todavía.** Solo PDF, txt, md, csv y json, hasta 4 MB,
  y siempre atados a una ficha de marca, estructura o persona.
- **La instalación sigue siendo de un equipo compartido.** Las descargas comprueban la sesión y
  la entidad del adjunto, y Blob es privado. No hay aislamiento entre organizaciones; no debe
  presentarse este control como multitenancy.

## Implementación de navegación, trabajos y almacenamiento (1, 3 y 4)

El estado, los límites gratuitos, las pruebas y los pasos de activación están en
[el informe de implementación](reports/implementacion-1-3-4-2026-09-09.md).
No habilites los flags de IA o Blob antes de aplicar las migraciones y configurar los recursos.

- `npm run perf:panel`: comparación local de 30 muestras por ruta y modalidad.
- `npm run test:workflow`: ejecutor Workflow real con respuesta ficticia guardada, sin llamadas pagadas.
- `npm run assets:migrate`: muestra cuántos archivos antiguos quedan; no copia ni borra bytes.
- `npm run assets:migrate -- --apply --actor=<id>`: migra hasta diez archivos, verifica integridad y audita.

Los límites de archivos usan una ventana móvil de 32 días y se reservan antes de las operaciones.
La migración monetaria rechaza históricos que necesitarían redondeo. En CSV, usa `1234` para miles
y `1.234000` para tres decimales; un importe ambiguo como `1.234` se rechaza con una explicación.

## Perfiles y permisos

Los perfiles de trabajo se configuran desde Equipo por el Dueño. Consulta la [matriz de permisos y la activación](reports/perfiles-permisos-2026-09-09.md) antes de desplegar esta versión sobre una instalación existente. La migración no asigna permisos por defecto a cuentas antiguas.
