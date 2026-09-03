/**
 * Catálogo inicial de estructuras: los formatos de video que venden y los que entretienen.
 *
 * Cada estructura trae:
 *  - beats: el esqueleto emocional, en orden. Es lo que NO cambia entre videos.
 *  - systemPrompt: la afinación que se le inyecta a la IA cuando genera con este formato.
 *  - rules: reglas duras que el modelo no puede romper.
 *
 * Todo esto es editable después desde /estructuras. Esto es solo el punto de partida.
 */

export type SeedBeat = { name: string; goal: string; seconds: number; notes?: string };

export type SeedStructure = {
  name: string;
  slug: string;
  category: "VENDE" | "ENTRETIENE";
  family: string;
  summary: string;
  defaultDurationSec: number;
  beats: SeedBeat[];
  systemPrompt: string;
  rules: string[];
  examples?: { title: string; text: string }[];
};

export const SEED_STRUCTURES: SeedStructure[] = [
  /* ====================================================== VIDEOS QUE VENDEN */

  {
    name: "Giro Emocional (Plot Twist)",
    slug: "giro-emocional-plot-twist",
    category: "VENDE",
    family: "Narrativo",
    summary:
      "Empieza con un golpe visual que incomoda, sube la tensión, y da la vuelta a la historia justo antes de mostrar el producto. Es el formato que más comparte la gente.",
    defaultDurationSec: 45,
    beats: [
      {
        name: "Golpe visual",
        goal: "Detener el scroll en menos de 1 segundo con una imagen o acción que descoloca.",
        seconds: 3,
        notes:
          "Tiene que pasar algo físico y concreto: una nalgada, algo que se cae, algo que se rompe, un portazo. Nada de hablar a cámara presentándose.",
      },
      {
        name: "Tensión",
        goal: "Un personaje ataca, reclama o acusa. El espectador se incomoda y quiere ver cómo termina.",
        seconds: 8,
        notes: "El conflicto tiene que ser cotidiano y reconocible, no exagerado.",
      },
      {
        name: "Incertidumbre",
        goal: "Aparece un objeto o una acción que no se entiende todavía. La bolsa, la caja, el sobre.",
        seconds: 7,
        notes: "Aquí NO se revela nada. Solo se alarga la duda.",
      },
      {
        name: "Plot twist",
        goal: "Se revela que todo era lo contrario de lo que parecía. El agresor era el detallista.",
        seconds: 8,
      },
      {
        name: "Gran emoción",
        goal: "La reacción emocional honesta: ternura, alivio, risa, sorpresa. Es el momento que se comparte.",
        seconds: 7,
      },
      {
        name: "Mostrar el producto",
        goal: "Recién ahora se ve el producto con detalle, como parte de la historia y no como un anuncio.",
        seconds: 8,
      },
      {
        name: "CTA",
        goal: "Llamado a la acción concreto, con el canal exacto.",
        seconds: 4,
      },
    ],
    systemPrompt: `Esta estructura vive del contraste. La primera toma tiene que hacer pensar al
espectador que va a ver una pelea, un accidente o una humillación; y el final le demuestra que
era exactamente lo contrario.

Claves para que funcione:
- El golpe visual es FÍSICO y ocurre en el primer segundo. Cero introducción, cero saludo.
- El personaje que "ataca" en la tensión tiene que ser el mismo que da el detalle en el twist.
  Ese es el giro.
- La incertidumbre se sostiene con un objeto envuelto, cerrado o tapado. Nunca se adelanta
  qué hay dentro.
- La gran emoción se actúa con reacción real, no con frases explicativas.
- El producto entra DESPUÉS del giro, nunca antes. Si el producto aparece pronto, el video
  se lee como anuncio y la gente se va.

El disfraz cambia en cada variante (el objeto, la situación, la excusa), pero el orden de los
siete golpes emocionales no cambia jamás.`,
    rules: [
      "El producto no puede aparecer ni mencionarse antes del beat 'Mostrar el producto'.",
      "El primer plano tiene que ser una acción física, no una persona hablando a cámara.",
      "El personaje que genera la tensión es el mismo que da el detalle en el giro.",
      "No expliques el giro con palabras: muéstralo con la reacción del otro personaje.",
      "El CTA nombra el canal exacto (WhatsApp, link del perfil), nunca 'contáctanos'.",
    ],
    examples: [
      {
        title: "La bolsa de ropa para lavar (Con Amor)",
        text: `Toma 1 (golpe visual): primer plano de una nalgada. Corte a plano medio.
Él, con tono pedante: "¿Por qué no estás lavando la ropa? Eres bien floja, todo el día en el teléfono."
Ella se queja de que le dolió y le reclama por haberle lanzado un saco encima.
Él, sin mirarla: "Es ropa para lavar."
Ella recoge la bolsa molesta y empieza a abrirla despacio. Dentro hay una caja.
Abre la caja: es un conjunto de ropa a juego para los dos.
Ella, con la voz quebrada: "Ay amor, lo que yo quería, ir a juego contigo."
Él: "Sí mi amor, es un detalle para los dos."
Los dos posan con las prendas mientras entra la voz narradora.
Voz en off: "Dale un detalle a tu pareja para que también tenga un regalo único y personalizado, con nuestra ropa personalizada de Con Amor. Más información aquí abajo."`,
      },
      {
        title: "Variante: la sal (mismo esqueleto, otro disfraz)",
        text: `Golpe visual: se rompe un plato en el piso.
Tensión: él le reclama que siempre rompe todo y que es un desastre.
Incertidumbre: le pasa un frasco cerrado y le dice "toma, ponle sal para la suerte".
Plot twist: ella abre el frasco y dentro hay un anillo envuelto, no sal.
Gran emoción: llanto y risa a la vez.
Producto: se muestra el empaque premium con el que llegó.
CTA: "Escríbenos al WhatsApp del perfil y armamos el tuyo."`,
      },
    ],
  },

  {
    name: "UGC",
    slug: "ugc",
    category: "VENDE",
    family: "UGC",
    summary:
      "Grabado como si fuera un cliente real recomendando, no una marca vendiendo. Cámara en mano, luz natural, cero producción evidente.",
    defaultDurationSec: 40,
    beats: [
      {
        name: "Hook de recomendación",
        goal: "Hablar como amiga que acaba de descubrir algo. 'Tenía que contarles esto'.",
        seconds: 4,
      },
      {
        name: "El contexto personal",
        goal: "Contar la situación propia que llevó a buscar esto. Genera identificación.",
        seconds: 9,
      },
      {
        name: "El descubrimiento",
        goal: "Cómo llegó al producto y qué le hizo dudar antes de comprarlo.",
        seconds: 8,
      },
      {
        name: "La prueba en vivo",
        goal: "Enseñar el producto de verdad, usándolo, con sus manos y sin edición perfecta.",
        seconds: 12,
      },
      {
        name: "El veredicto",
        goal: "Opinión honesta, incluyendo un pero pequeño para que suene creíble.",
        seconds: 5,
      },
      { name: "CTA suave", goal: "Recomendación, no venta. 'Se los dejo por acá'.", seconds: 4 },
    ],
    systemPrompt: `El UGC funciona porque NO parece publicidad. El guion debe sonar a persona
hablando sola frente a su celular, no a locutor.

- Frases cortas, con muletillas naturales y alguna corrección en vivo ("bueno, o sea…").
- Nada de adjetivos de catálogo: en vez de "calidad premium", "la tela es gruesa, mira".
- Siempre incluye una objeción honesta y su respuesta ("pensé que iba a ser carísimo, pero…").
- La cámara es el celular en la mano. Encuadres imperfectos, luz de ventana.
- Prohibido el tono de anuncio en el cierre. El CTA es una recomendación entre amigas.`,
    rules: [
      "Cero lenguaje corporativo ni frases de catálogo.",
      "Incluye al menos una objeción real y su respuesta.",
      "Todos los encuadres son de celular en mano, con luz natural.",
      "El CTA es una recomendación personal, nunca una orden de compra.",
    ],
  },

  {
    name: "Camaleón",
    slug: "camaleon",
    category: "VENDE",
    family: "Nativo",
    summary:
      "Se disfraza del contenido que ya consume el público (receta, storytime, tutorial, tendencia) y la marca aparece dentro sin romper el formato.",
    defaultDurationSec: 42,
    beats: [
      {
        name: "Entrada del formato prestado",
        goal: "Arrancar exactamente como arrancaría ese tipo de contenido en la plataforma.",
        seconds: 4,
      },
      {
        name: "Desarrollo nativo",
        goal: "Cumplir de verdad la promesa del formato prestado. Aportar valor real.",
        seconds: 14,
      },
      {
        name: "Aparición natural",
        goal: "El producto entra como parte del contenido, no como corte publicitario.",
        seconds: 10,
      },
      {
        name: "Justificación",
        goal: "Por qué ese producto está ahí. Una razón lógica, no un elogio.",
        seconds: 8,
      },
      { name: "CTA integrado", goal: "Cerrar el formato prestado y deslizar el CTA.", seconds: 6 },
    ],
    systemPrompt: `El camaleón se mimetiza. Elige un formato nativo de la plataforma
(storytime, receta, "cosas que", tutorial, día en mi vida) y cúmplelo de verdad.

- Si prometes una receta, la receta tiene que servir aunque quiten el producto.
- El producto aparece porque tiene sentido que esté ahí, no porque toque venderlo.
- El espectador debería poder ver el video completo sin sentir que le vendieron.
- Indica siempre en el guion QUÉ formato se está imitando, para que el equipo lo grabe con
  los códigos visuales correctos.`,
    rules: [
      "El contenido prestado debe aportar valor real por sí solo.",
      "El producto no puede ser el protagonista del video.",
      "Nunca uses transiciones ni gráficos que delaten que es un anuncio.",
    ],
  },

  {
    name: "Ellos vs Nosotros",
    slug: "ellos-vs-nosotros",
    category: "VENDE",
    family: "Comparativo",
    summary:
      "Contrasta la forma vieja o la competencia genérica contra la forma propia. Funciona por identificación con la frustración.",
    defaultDurationSec: 38,
    beats: [
      {
        name: "El dolor conocido",
        goal: "Mostrar la escena frustrante que todos han vivido con la opción vieja.",
        seconds: 6,
      },
      {
        name: "Exagerar 'ellos'",
        goal: "Llevar la forma vieja al absurdo, con humor. Sin nombrar marcas.",
        seconds: 10,
      },
      {
        name: "El corte",
        goal: "Transición seca que cambia el tono, la luz y el ritmo.",
        seconds: 2,
      },
      {
        name: "Mostrar 'nosotros'",
        goal: "La misma escena resuelta, con calma y con el producto.",
        seconds: 12,
      },
      {
        name: "El contraste explícito",
        goal: "Nombrar las 2 o 3 diferencias concretas y verificables.",
        seconds: 5,
      },
      { name: "CTA", goal: "Invitación a cambiarse de lado.", seconds: 3 },
    ],
    systemPrompt: `Este formato vive del contraste visual, no del insulto.

- 'Ellos' se graba con luz fría, cámara temblorosa y ritmo caótico. 'Nosotros' con luz cálida,
  cámara estable y ritmo tranquilo. El cambio se tiene que SENTIR.
- Nunca nombres competidores reales ni uses sus marcas. Se caricaturiza la forma vieja de
  hacer las cosas, no a una empresa.
- Las diferencias que se nombran tienen que ser verificables. Nada de "somos los mejores".
- El humor es hacia la situación, nunca hacia el cliente.`,
    rules: [
      "Prohibido nombrar o mostrar marcas competidoras.",
      "El cambio de bloque debe notarse en luz, cámara y sonido.",
      "Las diferencias mencionadas deben ser hechos comprobables.",
    ],
  },

  {
    name: "PAS (Problema, Agitación, Solución)",
    slug: "pas",
    category: "VENDE",
    family: "Copywriting",
    summary:
      "La estructura clásica de venta directa: nombra el problema, lo agita hasta que duele, y entrega la solución.",
    defaultDurationSec: 40,
    beats: [
      {
        name: "Problema",
        goal: "Nombrar el problema tan específico que el espectador sienta que le hablan a él.",
        seconds: 6,
      },
      {
        name: "Agitación",
        goal: "Mostrar las consecuencias reales de no resolverlo. Aquí se incomoda.",
        seconds: 12,
      },
      {
        name: "Punto de quiebre",
        goal: "El momento en que queda claro que seguir igual no es opción.",
        seconds: 5,
      },
      {
        name: "Solución",
        goal: "Presentar el producto como la salida concreta, con el mecanismo.",
        seconds: 12,
      },
      { name: "CTA", goal: "Paso siguiente inmediato y sin fricción.", seconds: 5 },
    ],
    systemPrompt: `PAS solo funciona si el problema es ESPECÍFICO. "Quieres vender más" no es un
problema; "publicas todos los días y no te compra nadie" sí lo es.

- La agitación describe consecuencias concretas y cotidianas, no catástrofes.
- Nunca agites por encima de lo que el producto realmente resuelve: eso destruye la confianza.
- La solución explica el CÓMO, no solo el QUÉ. El espectador tiene que entender el mecanismo.
- El CTA elimina fricción: dice exactamente qué hacer y cuánto cuesta hacerlo.`,
    rules: [
      "El problema debe ser específico y observable, nunca genérico.",
      "La agitación no puede prometer daños que el producto no evita.",
      "La solución explica el mecanismo, no solo el beneficio.",
    ],
  },

  {
    name: "Historia de Fundador",
    slug: "historia-de-fundador",
    category: "VENDE",
    family: "Marca",
    summary:
      "La persona detrás del negocio cuenta por qué existe. Construye confianza y diferencia por identidad, no por precio.",
    defaultDurationSec: 55,
    beats: [
      {
        name: "La confesión",
        goal: "Abrir con una verdad incómoda o un momento de fracaso. Nada de logros.",
        seconds: 6,
      },
      {
        name: "El origen",
        goal: "Qué pasó en la vida real que llevó a empezar esto.",
        seconds: 14,
      },
      {
        name: "El obstáculo",
        goal: "Lo que casi hace que no funcione. Aquí se gana la credibilidad.",
        seconds: 12,
      },
      {
        name: "La decisión",
        goal: "Qué se decidió hacer distinto y por qué.",
        seconds: 10,
      },
      { name: "El producto como consecuencia", goal: "Cómo eso se ve hoy en el producto.", seconds: 8 },
      { name: "CTA de invitación", goal: "Invitar a ser parte, no a comprar.", seconds: 5 },
    ],
    systemPrompt: `Esta historia la cuenta una persona real mirando a cámara, sin guion leído.
El texto que escribas es para que lo interiorice, no para que lo recite palabra por palabra:
escríbelo en lenguaje hablado.

- Empieza por la parte que da vergüenza contar. Ahí está la confianza.
- Detalles concretos y verificables: lugares, cifras pequeñas, fechas. Nada de épica vacía.
- El producto aparece como consecuencia natural de la historia, en el minuto final.
- Tono íntimo: plano medio corto, luz suave, sin música épica.`,
    rules: [
      "Debe empezar por una vulnerabilidad, nunca por un logro.",
      "Incluye al menos tres detalles concretos y verificables.",
      "El producto solo aparece en los dos últimos beats.",
      "Sin música épica ni tono motivacional.",
    ],
  },

  {
    name: "Testimonio",
    slug: "testimonio",
    category: "VENDE",
    family: "Prueba social",
    summary:
      "Un cliente real cuenta su antes y su después. La prueba social más difícil de imitar.",
    defaultDurationSec: 40,
    beats: [
      { name: "El antes", goal: "Cómo estaba antes, con una escena concreta.", seconds: 8 },
      { name: "La duda", goal: "Por qué casi no compra. Esto es lo que da credibilidad.", seconds: 7 },
      { name: "El momento", goal: "Qué le hizo decidirse.", seconds: 6 },
      { name: "El después", goal: "El resultado concreto, con un dato o una escena.", seconds: 12 },
      { name: "La recomendación", goal: "A quién se lo recomendaría y a quién no.", seconds: 7 },
    ],
    systemPrompt: `Un testimonio creíble incluye siempre la duda previa. Sin ella suena a actuación.

- El "antes" se cuenta con una escena, no con un adjetivo.
- El resultado se dice con un dato concreto o una situación observable.
- Al final, decir a quién NO le serviría el producto multiplica la credibilidad.
- Encuadre de entrevista, mirando ligeramente fuera de cámara, sin maquillaje de estudio.
- Nunca pongas en boca del cliente frases de marketing de la marca.`,
    rules: [
      "Debe incluir la objeción o duda previa a comprar.",
      "El resultado tiene que ser concreto y observable.",
      "El cliente nunca usa el lenguaje publicitario de la marca.",
      "Incluye a quién NO le serviría.",
    ],
  },

  {
    name: "Venta Directa",
    slug: "venta-directa",
    category: "VENDE",
    family: "Directo",
    summary:
      "Sin rodeos: qué es, para quién es, cuánto cuesta y cómo se compra. Para público que ya conoce la marca.",
    defaultDurationSec: 30,
    beats: [
      { name: "Qué es", goal: "Nombrar el producto y para quién es, en una frase.", seconds: 4 },
      { name: "Los tres beneficios", goal: "Tres razones concretas, una por toma.", seconds: 12 },
      { name: "La prueba", goal: "Una demostración visual rápida de que es cierto.", seconds: 8 },
      { name: "CTA", goal: "Cómo comprarlo, con el canal y el paso exacto.", seconds: 6 },
    ],
    systemPrompt: `Formato rápido, sin narrativa. La gracia está en la claridad y el ritmo.

- Una idea por toma. Cortes secos cada 2 o 3 segundos.
- Los tres beneficios se muestran, no se enumeran de palabra.
- Habla de precio o de condiciones solo si la marca las entregó; nunca las inventes.
- El CTA es una instrucción de un solo paso.`,
    rules: [
      "Máximo tres beneficios. Ni uno más.",
      "Cada beneficio necesita una toma que lo demuestre.",
      "No inventes precios, plazos ni promociones que la marca no haya dado.",
    ],
  },

  {
    name: "Oferta Directa",
    slug: "oferta-directa",
    category: "VENDE",
    family: "Directo",
    summary:
      "Video de campaña con una oferta concreta, su condición y su fecha límite. Busca conversión inmediata.",
    defaultDurationSec: 32,
    beats: [
      { name: "El anuncio", goal: "Decir la oferta en los primeros 2 segundos.", seconds: 4 },
      { name: "Qué incluye", goal: "Desglosar exactamente qué se lleva.", seconds: 10 },
      { name: "La condición", goal: "Qué hay que hacer para acceder. Honesto y claro.", seconds: 8 },
      { name: "La urgencia real", goal: "Fecha límite o stock. Solo si es verdad.", seconds: 5 },
      { name: "CTA", goal: "Un solo paso, sin fricción.", seconds: 5 },
    ],
    systemPrompt: `La oferta va en el primer segundo. Sin hook narrativo, sin historia.

- Desglosa lo que incluye con tomas de cada elemento.
- La condición se dice completa. Ocultar la letra chica destruye la confianza y genera reclamos.
- La urgencia solo se menciona si la marca dio una fecha o un stock real. Si no hay dato,
  el beat de urgencia se omite y no se inventa.`,
    rules: [
      "La oferta se enuncia en los primeros 2 segundos.",
      "Nunca inventes fechas límite, stock ni descuentos.",
      "Las condiciones se dicen completas, sin letra chica escondida.",
    ],
  },

  {
    name: "Video con Voz en Off",
    slug: "voz-en-off",
    category: "VENDE",
    family: "Producción",
    summary:
      "Narración continua sobre imágenes de producto y uso. Permite mucha información sin depender de un actor hablando.",
    defaultDurationSec: 45,
    beats: [
      { name: "Frase de entrada", goal: "Una frase que abra un bucle en la cabeza.", seconds: 4 },
      { name: "Desarrollo visual", goal: "La narración guía una secuencia de tomas de producto.", seconds: 18 },
      { name: "El detalle que convence", goal: "El primerísimo plano del detalle que vende.", seconds: 10 },
      { name: "El cierre del bucle", goal: "Responder la pregunta de la entrada.", seconds: 8 },
      { name: "CTA", goal: "Llamado a la acción con gráfico en pantalla.", seconds: 5 },
    ],
    systemPrompt: `Aquí la voz manda y la imagen ilustra. Escribe la narración como un texto continuo
y luego reparte las tomas debajo.

- La primera frase abre una pregunta que solo se responde al final.
- Cada frase de la voz necesita su toma correspondiente: no dejes narración sin imagen asignada.
- Ritmo: entre 2 y 4 segundos por toma.
- La voz es cercana y grabada de cerca, no locución de radio.`,
    rules: [
      "Cada frase de la narración tiene su toma asignada.",
      "La pregunta de la entrada se responde explícitamente al final.",
      "Ninguna toma dura más de 4 segundos.",
    ],
  },

  {
    name: "Unboxing",
    slug: "unboxing",
    category: "VENDE",
    family: "Producto",
    summary:
      "Abrir el paquete en tiempo real. Vende la experiencia de recibir, que es la mitad del valor de un regalo.",
    defaultDurationSec: 40,
    beats: [
      { name: "El paquete cerrado", goal: "Mostrar cómo llega, tal cual, sin abrir.", seconds: 5 },
      { name: "La apertura", goal: "Abrir despacio, con el sonido real del empaque.", seconds: 12 },
      { name: "La primera capa", goal: "Lo que se ve primero: papel, tarjeta, aroma.", seconds: 8 },
      { name: "El producto", goal: "Sacarlo, tocarlo, mostrar textura y detalles.", seconds: 10 },
      { name: "La reacción", goal: "La cara y la frase honesta al verlo completo.", seconds: 5 },
    ],
    systemPrompt: `El unboxing se vende con SONIDO y con MANOS. Es un formato sensorial.

- Especifica el sonido de cada momento: el cartón, el papel de seda, la cinta, el plástico.
- Cámara cenital (desde arriba) para la apertura, y planos detalle para las texturas.
- No cortes la apertura: la espera es parte del placer del formato.
- Nada de voz explicando características técnicas durante la apertura. Que hable el objeto.`,
    rules: [
      "Cada beat debe especificar el sonido concreto que se escucha.",
      "La apertura no se acelera ni se corta.",
      "Sin datos técnicos durante la apertura.",
    ],
  },

  {
    name: "Cómo se usa (Tutorial)",
    slug: "como-se-usa",
    category: "VENDE",
    family: "Educativo",
    summary:
      "Enseña a usar el producto paso a paso. Reduce la objeción de 'no sabré usarlo' y sirve como posventa.",
    defaultDurationSec: 45,
    beats: [
      { name: "El resultado primero", goal: "Mostrar el resultado final antes de empezar.", seconds: 5 },
      { name: "Lo que necesitas", goal: "Enumerar los elementos, visualmente.", seconds: 6 },
      { name: "Paso a paso", goal: "Los pasos numerados, con texto en pantalla.", seconds: 22 },
      { name: "El error común", goal: "Advertir el error que todos cometen.", seconds: 7 },
      { name: "CTA", goal: "Invitar a conseguirlo.", seconds: 5 },
    ],
    systemPrompt: `El tutorial abre con el resultado: si no se ve a dónde se llega, nadie se queda.

- Numera los pasos en pantalla (1, 2, 3) y dilos en voz alta.
- Un paso por toma. Manos siempre visibles.
- El "error común" es el beat que más se guarda y comparte: hazlo específico.
- Prohibido saltarse pasos "obvios": el video existe para quien no sabe.`,
    rules: [
      "El resultado final se muestra en los primeros 5 segundos.",
      "Cada paso lleva número en pantalla y una sola toma.",
      "Incluye siempre un error común y cómo evitarlo.",
    ],
  },

  {
    name: "Antes y Después",
    slug: "antes-y-despues",
    category: "VENDE",
    family: "Demostración",
    summary:
      "La transformación visible. El formato más convincente cuando el producto genera un cambio que se puede ver.",
    defaultDurationSec: 35,
    beats: [
      { name: "El antes crudo", goal: "Mostrar el estado inicial sin maquillar.", seconds: 7 },
      { name: "El proceso", goal: "Acelerado, para que se entienda que hubo trabajo real.", seconds: 12 },
      { name: "La revelación", goal: "El después, con el mismo encuadre exacto que el antes.", seconds: 8 },
      { name: "El dato", goal: "Cuánto tardó, cuánto costó, qué se usó.", seconds: 5 },
      { name: "CTA", goal: "Cómo conseguir el mismo resultado.", seconds: 3 },
    ],
    systemPrompt: `La credibilidad de este formato depende de una cosa: que el antes y el después
estén grabados desde EL MISMO ángulo, con la MISMA luz y el MISMO encuadre.

- Indícalo explícitamente en el guion, en los dos beats.
- El "antes" no se maquilla ni se empeora a propósito.
- El proceso acelerado demuestra que hubo trabajo y no truco de edición.
- El dato final (tiempo, costo) es lo que convierte la admiración en intención de compra.`,
    rules: [
      "El antes y el después se graban con el mismo encuadre, ángulo y luz.",
      "Prohibido empeorar el 'antes' a propósito.",
      "Siempre incluir el dato de tiempo o costo real.",
    ],
  },

  {
    name: "Respondiendo Comentarios",
    slug: "respondiendo-comentarios",
    category: "VENDE",
    family: "Comunidad",
    summary:
      "Se responde en video un comentario real. Aprovecha el alcance de un video anterior y resuelve objeciones en público.",
    defaultDurationSec: 35,
    beats: [
      { name: "El comentario en pantalla", goal: "Mostrar el comentario real, legible.", seconds: 4 },
      { name: "La reacción honesta", goal: "Reaccionar de verdad: reírse, sorprenderse o aceptar la crítica.", seconds: 5 },
      { name: "La respuesta", goal: "Responder con hechos, no con defensa.", seconds: 15 },
      { name: "La prueba", goal: "Demostrar la respuesta con una toma del producto.", seconds: 8 },
      { name: "CTA", goal: "Invitar a preguntar más.", seconds: 3 },
    ],
    systemPrompt: `Este formato es oro para las objeciones. Elige el comentario que más duele,
no el más halagador.

- Si el comentario es una crítica válida, se acepta. Defenderse a la defensiva se nota y resta.
- La respuesta se apoya siempre en una demostración visual.
- El tono es de conversación, no de comunicado.
- Nunca inventes el comentario: el guion debe indicar que el equipo debe usar uno real.`,
    rules: [
      "El comentario debe ser real, no inventado.",
      "Elige objeciones, no elogios.",
      "Toda respuesta va acompañada de una demostración visual.",
    ],
  },

  {
    name: "Meme / Anuncio Divertido",
    slug: "meme-anuncio-divertido",
    category: "VENDE",
    family: "Humor",
    summary:
      "Usa un formato de humor reconocible del momento y le mete la marca. Alcance alto y bajo costo de producción.",
    defaultDurationSec: 22,
    beats: [
      { name: "El setup", goal: "Plantear la situación reconocible en una frase o texto.", seconds: 4 },
      { name: "La escalada", goal: "Subir el absurdo hasta el borde.", seconds: 8 },
      { name: "El remate", goal: "El chiste, con el producto dentro.", seconds: 6 },
      { name: "CTA mínimo", goal: "Una línea corta. Sin romper el tono.", seconds: 4 },
    ],
    systemPrompt: `El humor primero, la marca después. Si el chiste no funciona sin el producto,
el video no funciona.

- Videos cortos: 15 a 25 segundos como máximo.
- El remate tiene que llegar antes del segundo 20.
- El CTA es una línea, casi un susurro. Un CTA largo mata el chiste y el alcance.
- No expliques el chiste nunca.`,
    rules: [
      "Duración máxima de 25 segundos.",
      "El CTA no puede pasar de una línea.",
      "Nunca expliques el chiste.",
    ],
  },

  {
    name: "Explicando Beneficios",
    slug: "explicando-beneficios",
    category: "VENDE",
    family: "Educativo",
    summary:
      "Traduce las características del producto en beneficios concretos para la vida del cliente.",
    defaultDurationSec: 40,
    beats: [
      { name: "La pregunta", goal: "'¿Por qué esto cuesta lo que cuesta?' o similar.", seconds: 5 },
      { name: "Característica 1 a beneficio", goal: "Mostrar el detalle y traducirlo a la vida real.", seconds: 10 },
      { name: "Característica 2 a beneficio", goal: "Segunda traducción.", seconds: 10 },
      { name: "Característica 3 a beneficio", goal: "Tercera traducción.", seconds: 9 },
      { name: "CTA", goal: "Cierre e invitación.", seconds: 6 },
    ],
    systemPrompt: `La regla de oro: nunca dejes una característica sin traducir.

- Estructura cada bloque como "esto es X… lo que significa que tú Y".
- Cada característica necesita su primerísimo plano.
- Máximo tres. Con cuatro o más, no se recuerda ninguna.
- Beneficios de la vida cotidiana, no promesas grandilocuentes.`,
    rules: [
      "Cada característica se traduce siempre a un beneficio concreto.",
      "Máximo tres características.",
      "Cada una necesita su plano detalle.",
    ],
  },

  {
    name: "POV (Perspectiva)",
    slug: "pov",
    category: "VENDE",
    family: "Narrativo",
    summary:
      "El espectador ve la escena desde los ojos de un personaje. Genera identificación inmediata.",
    defaultDurationSec: 30,
    beats: [
      { name: "El rótulo POV", goal: "Texto en pantalla que sitúa: 'POV: es tu aniversario y no compraste nada'.", seconds: 3 },
      { name: "La situación", goal: "Vivir la escena en primera persona.", seconds: 10 },
      { name: "El giro", goal: "Algo cambia la situación.", seconds: 8 },
      { name: "La resolución", goal: "Cómo termina, con el producto involucrado.", seconds: 6 },
      { name: "CTA", goal: "Cierre breve.", seconds: 3 },
    ],
    systemPrompt: `Todo el video se sostiene en el rótulo POV inicial: si esa frase no engancha,
no hay video.

- La cámara es subjetiva o casi: el espectador es el protagonista.
- El rótulo tiene que ser específico y reconocible, no genérico.
- Sin narrador externo: solo lo que el personaje viviría.
- Duración corta, entre 20 y 35 segundos.`,
    rules: [
      "El rótulo POV es específico, nunca genérico.",
      "Sin narrador externo.",
      "La cámara mantiene la perspectiva subjetiva todo el video.",
    ],
  },

  {
    name: "Vlog de Marca",
    slug: "vlog-de-marca",
    category: "VENDE",
    family: "Detrás de cámaras",
    summary:
      "Un día en el negocio. Muestra el proceso real y humaniza la marca mientras vende por transparencia.",
    defaultDurationSec: 55,
    beats: [
      { name: "Arranque del día", goal: "Situar la hora y el lugar. Ambiente real.", seconds: 6 },
      { name: "El proceso", goal: "Mostrar cómo se hace de verdad el producto.", seconds: 20 },
      { name: "El imprevisto", goal: "Algo que sale mal. Esto es lo que humaniza.", seconds: 10 },
      { name: "El pedido especial", goal: "Un caso concreto de cliente, con nombre.", seconds: 12 },
      { name: "Cierre", goal: "Fin del día y CTA suave.", seconds: 7 },
    ],
    systemPrompt: `El vlog de marca vende porque enseña lo que nadie enseña: el proceso y los errores.

- Incluye siempre un imprevisto real. Un vlog perfecto no se cree.
- El caso de cliente concreto (con nombre y pedido) es lo que convierte.
- Cámara en mano, sonido ambiente, sin música pesada encima.
- El CTA es casi una despedida.`,
    rules: [
      "Debe incluir un imprevisto o error real del día.",
      "Incluye al menos un pedido concreto de un cliente.",
      "Sonido ambiente real, sin música que tape.",
    ],
  },

  /* ================================================ VIDEOS QUE ENTRETIENEN */

  {
    name: "Vlog",
    slug: "vlog",
    category: "ENTRETIENE",
    family: "Entretenimiento",
    summary:
      "Un día cualquiera, sin agenda comercial. Construye comunidad y alimenta el alcance de la cuenta.",
    defaultDurationSec: 60,
    beats: [
      { name: "Arranque", goal: "Dónde estamos y qué va a pasar hoy.", seconds: 6 },
      { name: "Momento 1", goal: "Primera situación del día.", seconds: 16 },
      { name: "Momento 2", goal: "Segunda situación, con más energía.", seconds: 18 },
      { name: "El momento del día", goal: "Lo mejor o lo más gracioso que pasó.", seconds: 14 },
      { name: "Despedida", goal: "Cierre cálido. Sin venta.", seconds: 6 },
    ],
    systemPrompt: `Este video NO vende. Deja el campo del CTA vacío.

- Ritmo suelto, cortes naturales, sin guion rígido.
- El objetivo es que la gente conozca a las personas del equipo.
- Puede aparecer el producto de fondo, pero jamás se menciona ni se explica.`,
    rules: [
      "Prohibido cualquier llamado a la acción comercial.",
      "No se menciona ni se explica el producto.",
      "El campo cta debe quedar vacío.",
    ],
  },

  {
    name: "Sketch",
    slug: "sketch",
    category: "ENTRETIENE",
    family: "Entretenimiento",
    summary:
      "Una situación cómica actuada, con personajes reconocibles. Busca risas y compartidos, no ventas.",
    defaultDurationSec: 35,
    beats: [
      { name: "El personaje", goal: "Presentar al personaje con un gesto reconocible.", seconds: 4 },
      { name: "La situación", goal: "Plantear el conflicto cómico.", seconds: 10 },
      { name: "La escalada", goal: "Todo empeora.", seconds: 12 },
      { name: "El remate", goal: "El chiste final, sin explicación.", seconds: 9 },
    ],
    systemPrompt: `Sketch puro: solo entretiene. Deja el CTA vacío.

- Los personajes tienen que ser reconocibles en 3 segundos, con un gesto o una muletilla.
- La escalada es de tres pasos: mal, peor, insostenible.
- El remate llega y se corta. Sin epílogo, sin explicación, sin marca.`,
    rules: [
      "Prohibido cualquier llamado a la acción comercial.",
      "El campo cta debe quedar vacío.",
      "El video corta justo después del remate.",
    ],
  },

  {
    name: "Cámara Escondida",
    slug: "camara-escondida",
    category: "ENTRETIENE",
    family: "Entretenimiento",
    summary:
      "Reacciones reales de gente que no sabe que la graban, con su consentimiento posterior. Alcance muy alto.",
    defaultDurationSec: 45,
    beats: [
      { name: "El plan", goal: "Explicar al espectador qué se va a hacer.", seconds: 7 },
      { name: "El montaje", goal: "Preparar la situación.", seconds: 8 },
      { name: "La reacción", goal: "El momento real, sin cortes.", seconds: 20 },
      { name: "La revelación", goal: "Contarle a la persona y ver su segunda reacción.", seconds: 10 },
    ],
    systemPrompt: `Este formato solo entretiene: deja el CTA vacío.

- La broma nunca puede humillar, asustar de verdad ni poner en riesgo a nadie.
- El guion DEBE incluir una nota de producción recordando pedir permiso de publicación a la
  persona grabada antes de subir el video.
- El momento de la reacción no se corta: es lo que se comparte.
- La revelación siempre se muestra: sin ella el formato se siente abusivo.`,
    rules: [
      "Prohibido cualquier llamado a la acción comercial.",
      "La broma nunca humilla, asusta de verdad ni pone en riesgo a nadie.",
      "Incluir siempre una nota de producción sobre el permiso de publicación.",
      "La revelación final es obligatoria.",
    ],
  },
];
