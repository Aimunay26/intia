# Marketing OS

Sistema de operación de contenido para varias marcas: calendario y agenda, fichas de marca con
su identidad y sus objetivos, checklist por video, asignación de quién actuó / grabó / escribió,
métricas, log de auditoría, y un generador de guiones con IA afinado por formato y por la
marca personal de quien actúa.

Funciona con base de datos real. En local usa SQLite (un archivo, cero configuración) y
para publicarlo en internet se cambia a PostgreSQL con un comando.

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

Si es la primera vez, o si borraste la base de datos:

```bash
npm run setup
```

Ese comando genera el cliente de Prisma, crea la base de datos y la llena con los datos
iniciales: las 21 estructuras de video, 6 plantillas de actor de ejemplo, su matriz de compatibilidad,
la marca Con Amor con su identidad y sus objetivos, 4 guiones de ejemplo y 14 videos
repartidos en el calendario con sus checklists, su equipo asignado y sus métricas.

### Primer ingreso

La app **no trae ninguna cuenta de dueño**. La primera vez que entres te pide crear la tuya, y
esa cuenta queda como la del dueño.

El resto del equipo de ejemplo (Ana, Paula, Diego, Lucía, Marco) sí existe, con contraseñas
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
*Guion*. Se puede deshacer desde cualquiera de los dos lados.

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

Se pueden usar Claude (Anthropic) y Gemini (Google). Se configuran en dos sitios, y la
variable de entorno siempre manda sobre lo guardado en la app:

**Opción A — desde la app** (más fácil): entra a **Ajustes** y pega la clave.

**Opción B — variables de entorno** (lo correcto en producción): edita el archivo `.env`

```
ANTHROPIC_API_KEY="sk-ant-..."
GEMINI_API_KEY="..."
```

Las claves se consiguen en `console.anthropic.com` y en `aistudio.google.com`.

El modelo se elige por estructura y se puede cambiar al vuelo en el generador. Por defecto:
`claude-opus-5` para Claude y `gemini-2.5-pro` para Gemini. El campo es texto libre, así que
si sale un modelo nuevo se escribe y ya, sin tocar código.

> Nota: los modelos Claude actuales no aceptan el parámetro `temperature`. El valor de
> temperatura de cada estructura solo se le manda a Gemini.

---

## Publicar en internet

La app está lista para desplegarse en Vercel con una base de datos PostgreSQL
(Neon, Supabase o cualquier otra).

Sigue los pasos **en este orden**. El paso 3 es el que más se olvida y deja la aplicación
desplegada sin tablas.

**1. Crea la base de datos** en Neon, Supabase o quien prefieras, y copia su cadena de
conexión.

**2. Cambia el motor del esquema a PostgreSQL:**

```bash
npm run use:postgres
```

**3. Confirma ese cambio en Git.** Este comando **edita `prisma/schema.prisma`**. Si subes el
proyecto sin confirmarlo, Vercel construye contra SQLite y la aplicación arranca sin poder
leer nada.

```bash
git add prisma/schema.prisma && git commit -m "Cambia el motor a PostgreSQL"
```

**4. Crea las tablas** en la base nueva. Pon primero su cadena en `DATABASE_URL` dentro de
`.env`:

```bash
npx prisma db push
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

**7. Siembra los datos iniciales** apuntando a la base de producción:

```bash
npm run db:seed
```

Para volver a SQLite en local: `npm run use:sqlite` (y vuelve a confirmarlo si lo subes).

### Dos límites de Vercel que conviene conocer

**Los archivos de referencia no pueden pasar de 4 MB.** Vercel corta en 4,5 MB el cuerpo de
cualquier petición y de cualquier respuesta a una función. Por eso el tope de subida está en
4 MB: para que el aviso lo dé la aplicación en español y no la plataforma con un error mudo.
Si tienes PDFs más grandes, recórtalos o pega solo el texto que importa desde el botón de
editar del documento.

**Generar un guion tarda entre 30 y 90 segundos.** El generador declara `maxDuration = 300`,
pero el tope real depende del plan: en Hobby Vercel corta a los 60 segundos. Si se te corta,
baja la duración objetivo del guion o usa un modelo más rápido (Sonnet 5 o Gemini Flash).

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
| `npm run setup` | Genera cliente, crea la base y siembra los datos |
| `npm run db:seed` | Vuelve a sembrar (no duplica lo que ya existe) |
| `npm run db:reset` | **Borra todo** y vuelve a sembrar |
| `npm run db:studio` | Abre Prisma Studio para ver la base de datos |
| `npm run use:postgres` | Cambia el esquema a PostgreSQL |
| `npm run use:sqlite` | Vuelve a SQLite |
| `npm run db:personas` | Carga o actualiza a las personas del equipo desde su informe |
| `npm run ver:prompt -- eru` | Imprime el prompt exacto que se le manda a la IA por esa persona |
| `npm run test:motores` | Calibra el motor de match contra la matriz de compatibilidad |
| `npm run test:humo` | 37 comprobaciones: permisos, calendario, datos y archivos |

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

- **Los campos JSON se guardan como texto.** El esquema funciona igual en SQLite y en
  PostgreSQL, y para eso no usa enums ni listas. Las redes de un video, los beats de una
  estructura o las fortalezas de un arquetipo son `String` con JSON dentro, y se leen siempre
  con los ayudantes de `lib/utils.ts`, nunca con `JSON.parse` a pelo.
- **La hora de las reuniones se fija en `America/Lima`**, no en la del servidor. Está en
  `APP_TIMEZONE` (`lib/utils.ts`). Sin eso, al publicar en Vercel —que corre en UTC— las
  reuniones se irían cinco horas.

---

## Antes de abrirlo al equipo

- [ ] Define `AUTH_SECRET` con una cadena larga y aleatoria. Sin esto, las sesiones se firman
      con una clave de desarrollo pública y cualquiera podría falsificar la del dueño.
- [ ] Cambia las contraseñas del equipo de ejemplo, o elimina esas cuentas si no las usas.
- [ ] Pon las claves de IA como variables de entorno, no en la base de datos.
- [ ] Revisa quién tiene la posición de **Dueño**: es la única que puede eliminar.
- [ ] Cambia la dirección del calendario si la compartiste durante las pruebas.
- [ ] Cambia a PostgreSQL: SQLite es un archivo local y no sirve para varios usuarios a la vez.

## Lo que NO hace todavía

Para que no haya sorpresas:

- **Google Calendar es de solo lectura.** Lo de aquí aparece allá, pero lo que crees en Google
  no vuelve. La sincronización en los dos sentidos es otro trabajo.
- **No hay recuperación de contraseña.** Si alguien la olvida, se la cambia el dueño desde
  **Equipo**.
- **No hay copias de seguridad automáticas.** En SQLite, la base entera es el archivo
  `prisma/dev.db`: cópialo. En PostgreSQL, depende de lo que ofrezca tu proveedor.
- **Eliminar una marca elimina en cascada** todos sus videos, guiones, métricas y checklists.
  Por eso solo puede hacerlo el dueño. Si dudas, usa **Archivar**.
- **Las métricas se cargan a mano** o pegando un CSV. No hay conexión automática con TikTok,
  Meta ni YouTube.
- **La IA genera una variante por vez.** Si quieres tres versiones del mismo formato, se
  generan una tras otra.
- **El motor automático de match está diseñado, no construido.** Hoy funciona el motor «Por
  tipo de video», que no gasta clave. El que lee el guion con IA es el siguiente paso.
- **El generador sigue siendo un formulario largo.** El módulo conversacional con carga de
  audios, enlaces y referencias está diseñado y pendiente de construir.
- **No se pueden subir audios ni enlaces todavía.** Solo PDF, txt, md, csv y json, hasta 4 MB,
  y siempre atados a una ficha de marca, estructura o persona.
- **Cualquier persona con sesión puede descargar el archivo de cualquier marca** si conoce el
  enlace directo. `/api/assets/[id]` comprueba que haya sesión pero no que tengas derecho a ese
  archivo concreto. Es un fallo conocido y pendiente de arreglar: no abras la app a gente de
  fuera del equipo hasta entonces.
