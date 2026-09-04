/**
 * Catálogo maestro de estructuras: los 21 formatos de video que venden y que entretienen.
 *
 * Cada estructura trae:
 *  - beats: el esqueleto emocional, en orden. Es lo que NO cambia entre videos.
 *  - systemPrompt: la afinación profunda que se le inyecta a la IA cuando genera con este formato.
 *  - rules: reglas duras que el modelo no puede romper.
 *  - examples: ejemplos reales ganadores con desglose de escenas, tomas y diálogos.
 *
 * Todo esto es editable después desde /estructuras y sincronizable con la base de datos.
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
                "name": "Golpe visual",
                "goal": "Detener el scroll en menos de 1 segundo con una imagen o acción que descoloca.",
                "seconds": 3,
                "notes": "Tiene que pasar algo físico y concreto: un portazo, algo que cae, algo que se rompe. Cero saludos."
          },
          {
                "name": "Tensión",
                "goal": "Un personaje ataca, reclama o acusa. El espectador se incomoda y quiere ver cómo termina.",
                "seconds": 8,
                "notes": "El conflicto tiene que ser cotidiano y reconocible, no exagerado."
          },
          {
                "name": "Incertidumbre",
                "goal": "Aparece un objeto o una acción que no se entiende todavía. La bolsa, la caja, el sobre.",
                "seconds": 7,
                "notes": "Aquí NO se revela nada. Solo se alarga la duda."
          },
          {
                "name": "Plot twist",
                "goal": "Se revela que todo era lo contrario de lo que parecía. El agresor era el detallista.",
                "seconds": 8
          },
          {
                "name": "Gran emoción",
                "goal": "La reacción emocional honesta: ternura, alivio, risa, sorpresa. Es el momento que se comparte.",
                "seconds": 7
          },
          {
                "name": "Mostrar el producto",
                "goal": "Recién ahora se ve el producto con detalle, como parte de la historia y no como un anuncio.",
                "seconds": 8
          },
          {
                "name": "CTA",
                "goal": "Llamado a la acción concreto, con el canal exacto.",
                "seconds": 4
          }
    ],
    systemPrompt: "Esta estructura vive del contraste. La primera toma tiene que hacer pensar al espectador que va a ver una pelea, un accidente o una humillación; y el final le demuestra que era exactamente lo contrario.\nClaves para que funcione:\n- El golpe visual es FÍSICO y ocurre en el primer segundo. Cero introducción, cero saludo.\n- El personaje que \"ataca\" en la tensión tiene que ser el mismo que da el detalle en el twist.\n- La incertidumbre se sostiene con un objeto envuelto, cerrado o tapado. Nunca se adelanta qué hay dentro.\n- La gran emoción se actúa con reacción real, no con frases explicativas.\n- El producto entra DESPUÉS del giro, nunca antes. Si el producto aparece pronto, el video se lee como anuncio y la gente se va.",
    rules: [
          "El producto no puede aparecer ni mencionarse antes del beat 'Mostrar el producto'.",
          "El primer plano tiene que ser una acción física, no una persona hablando a cámara.",
          "El personaje que genera la tensión es el mismo que da el detalle en el giro.",
          "No expliques el giro con palabras: muéstralo con la reacción del otro personaje.",
          "El CTA nombra el canal exacto (WhatsApp, link del perfil), nunca 'contáctanos'."
    ],
    examples: [
          {
                "title": "La bolsa de ropa para lavar",
                "text": "Toma 1 (Golpe visual): Primer plano de un portazo seco. Corte a plano medio.\nÉl, con tono cortante: «¿Por qué no estás lista todavía? Siempre te demoras mil horas, todo el día con el teléfono.»\nElla se queja molesta: «¡Oye, me asustaste! ¿Y esa bolsa qué es?»\nÉl, sin mirarla: «Es ropa para lavar, recógela tú.»\nElla recoge la bolsa indignada y empieza a abrirla rápido para reclamar. Dentro hay una caja rígida con cinta de seda.\nAbre la caja: es un conjunto personalizado a juego con los nombres de ambos bordados.\nElla, con la voz quebrada y una sonrisa: «Ay mi amor… lo que querías que nos pusiéramos hoy para la cena.»\nÉl sonríe y la abraza: «Feliz aniversario, mi reina. Te dije que nos íbamos a ver bien.»\nToma detalle del producto y bordado en alta calidad.\nVoz en off: «Haz que tu regalo sea inolvidable. Personaliza tus prendas exclusivas en Con Amor. Toca el enlace de mi perfil.»"
          },
          {
                "title": "El plato roto en la cocina",
                "text": "Golpe visual: Se estrella una taza contra la encimera (segundo 0).\nTensión: Él entra gritando: «¡Qué hiciste ahora! ¿Todo lo que tocas lo rompes o qué?»\nIncertidumbre: Le pasa una caja negra sellada con candado pequeño: «A ver si con esto aprendes a cuidar las cosas.»\nPlot twist: Ella abre la caja asustada y encuentra las llaves de su nuevo auto con un llavero grabado artesanal.\nGran emoción: Salto, abrazo con lágrimas y risa de alivio.\nProducto: Primer plano del llavero de cuero premium con la fecha grabada.\nCTA: «Escríbenos al enlace de WhatsApp y personalizamos el tuyo hoy.»"
          }
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
                "name": "Hook de recomendación",
                "goal": "Hablar como amiga que acaba de descubrir algo. 'Tenía que contarles esto'.",
                "seconds": 4
          },
          {
                "name": "El contexto personal",
                "goal": "Contar la situación propia que llevó a buscar esto. Genera identificación.",
                "seconds": 9
          },
          {
                "name": "El descubrimiento",
                "goal": "Cómo llegó al producto y qué le hizo dudar antes de comprarlo.",
                "seconds": 8
          },
          {
                "name": "La prueba en vivo",
                "goal": "Enseñar el producto de verdad, usándolo, con sus manos y sin edición perfecta.",
                "seconds": 12
          },
          {
                "name": "El veredicto",
                "goal": "Opinión honesta, incluyendo un pero pequeño para que suene creíble.",
                "seconds": 4
          },
          {
                "name": "CTA suave",
                "goal": "Dejar la recomendación en el aire, como quien no quiere la cosa.",
                "seconds": 3
          }
    ],
    systemPrompt: "El UGC vive de la imperfección. Si parece grabado por una agencia, fracasa.\nClaves para que funcione:\n- La persona le habla al teléfono como si le mandara una nota de voz a su mejor amiga.\n- Luz de ventana, sin aro de luz profesional visible, audio directo del celular.\n- OBLIGATORIO incluir un 'pero' o detalle menor que casi le hizo dudar antes de comprar.\n- El CTA es casual: 'se los dejo por si a alguien le sirve'. Cero tono de locutor comercial.",
    rules: [
          "Cero lenguaje corporativo ni frases de catálogo.",
          "Incluye al menos una objeción real y su respuesta honesta.",
          "El encuadre debe ser cámara frontal en mano o sobre mesa.",
          "El CTA no puede sonar a vendedor; suena a recomendación desinteresada."
    ],
    examples: [
          {
                "title": "La caja que salvó el aniversario de Karen",
                "text": "Toma 1 (Selfie frente a espejo): «Miren, yo no soy de subir estas cosas, pero si tu novio es de los que nunca sabe qué regalarte, mándale este video ya.»\nToma 2 (Caminando a la mesa): «El mes pasado cumplíamos 2 años y yo estaba segura de que me iba a llegar con unos chocolates de grifo comprados a última hora.»\nToma 3 (Muestra la caja): «Pero encontró esta tienda por TikTok. La verdad al principio dudé porque pensé que la tela iba a ser delgada o que el grabado saldría chueco.»\nToma 4 (Prueba en vivo abriendo y tocando): «Miren la costura y el bordado de las iniciales. Es algodón grueso de verdad, no de ese que se deforma al lavarlo.»\nToma 5 (Poniéndose la prenda): «El único pero es que los pedidos demoran como 3 días en prepararse porque lo hacen a mano, así que pidan con tiempo.»\nToma 6 (Cierre): «Les dejo la cuenta etiquetada aquí abajo para que no los agarre la fecha en blanco.»"
          }
    ],
  },

  {
    name: "Camaleón",
    slug: "camaleon",
    category: "VENDE",
    family: "Nativo",
    summary:
      "Se disfraza de contenido orgánico nativo de valor durante el 90% del tiempo (tutorial, curiosidad, tendencia) y la marca entra justificada en el 10% final.",
    defaultDurationSec: 45,
    beats: [
          {
                "name": "Entrada del formato prestado",
                "goal": "Arrancar exactamente como arrancaría un video orgánico del nicho elegido.",
                "seconds": 4,
                "notes": "Cero mención de marca o producto. El espectador cree que ve un tip."
          },
          {
                "name": "Desarrollo nativo",
                "goal": "Entregar valor real, entretenido o curioso. Cumplir la promesa del hook.",
                "seconds": 24,
                "notes": "Tiene que ser útil o entretenido por sí mismo aunque nadie comprara nada."
          },
          {
                "name": "Aparición natural",
                "goal": "El producto entra como herramienta de lo que se acaba de enseñar.",
                "seconds": 8
          },
          {
                "name": "Justificación",
                "goal": "Una sola frase que explica por qué este y no otro.",
                "seconds": 5
          },
          {
                "name": "CTA integrado",
                "goal": "Cierre que no rompa el tono del formato prestado.",
                "seconds": 4
          }
    ],
    systemPrompt: "REGLA DE ORO 90/10 DE CAMALEÓN:\nEl 90% del guion DEBE ser contenido 100% nativo de la plataforma (un truco de organización, una receta, un dato psicológico o un hack práctico).\n- Si el espectador sospecha que le van a vender antes del segundo 35, el guion ha fallado.\n- La marca o producto entra únicamente como la herramienta exacta o el atajo que ejecuta lo enseñado.\n- El llamado a la acción se siente como el paso lógico para aplicar el truco.",
    rules: [
          "El contenido prestado debe aportar valor real y comprobable por sí solo.",
          "El producto no puede ser el protagonista antes del 85% de la duración.",
          "El tono debe imitar a la perfección a los creadores de contenido del nicho.",
          "El CTA conecta directamente con la herramienta presentada."
    ],
    examples: [
          {
                "title": "El método de los 3 sobres para organizar regalos",
                "text": "Toma 1 (Plano cenital de mesa): «Si cada vez que tienes un evento especial terminas gastando el doble y comprando apurado, aplica la regla del 30-20-50.»\nToma 2 (Desarrollo visual con cuaderno): «Paso 1: Define el 50% para un objeto duradero que no se consuma en 24 horas. Paso 2: El 20% para una experiencia sensorial que active la memoria (aroma o dulce). Y el 30% restante en personalización real con fecha o frase íntima.»\nToma 3 (Aparición natural del box): «Para no complicarme haciéndolo yo misma en tres tiendas distintas, uso este box armado donde viene la taza térmica grabada, los bombones belgas y la carta lacrada en un solo paquete.»\nToma 4 (Justificación): «Te ahorras 4 horas de cola y el acabado parece de boutique europea.»\nToma 5 (CTA): «Comenta la palabra BOX y te paso el catálogo directo antes de que cierren los cupos de esta semana.»"
          }
    ],
  },

  {
    name: "Ellos vs Nosotros",
    slug: "ellos-vs-nosotros",
    category: "VENDE",
    family: "Comparativo",
    summary:
      "Contrasta el choque de perspectivas y hábitos entre dos bandos (géneros, vieja escuela vs nueva, o genérico vs propio). Detona debate por identificación.",
    defaultDurationSec: 40,
    beats: [
          {
                "name": "El dolor conocido",
                "goal": "Nombrar la frustración que todos han vivido con la forma habitual.",
                "seconds": 5
          },
          {
                "name": "Exagerar 'ellos'",
                "goal": "Mostrar cómo lo hace el otro bando de forma cómica, tediosa o anticuada.",
                "seconds": 12,
                "notes": "Caricaturizar con gracia, sin faltar al respeto."
          },
          {
                "name": "El corte",
                "goal": "Un segundo de silencio o cambio radical de ritmo visual.",
                "seconds": 2
          },
          {
                "name": "Mostrar 'nosotros'",
                "goal": "La forma inteligente, rápida y estética de hacerlo con el producto.",
                "seconds": 12
          },
          {
                "name": "El contraste explícito",
                "goal": "Poner los dos mundos cara a cara para que la diferencia sea aplastante.",
                "seconds": 6
          },
          {
                "name": "CTA",
                "goal": "Invitación a cambiarse de lado y unirse a la forma moderna.",
                "seconds": 3
          }
    ],
    systemPrompt: "Esta estructura triunfa por tribalismo positivo y humor relacional.\nClaves para que funcione:\n- Muestra los dos lados de la moneda: cómo un grupo (ej. hombres vs mujeres, o lo genérico vs lo personalizado) piensa y actúa frente al mismo dilema.\n- El cambio entre 'ellos' y 'nosotros' debe notarse en la paleta de color, la energía del actor y el ritmo de edición.\n- El producto es el estandarte que representa el bando ganador y alivianado.",
    rules: [
          "Prohibido nombrar o difamar marcas competidoras específicas.",
          "El cambio de bloque debe notarse visualmente (luz, velocidad o música).",
          "El bando de 'ellos' debe sentirse cómico y reconocible, nunca ofensivo.",
          "El contraste debe resolver el dolor en menos de la mitad del tiempo."
    ],
    examples: [
          {
                "title": "Cómo empacan los hombres vs cómo lo hace Con Amor",
                "text": "Toma 1 (Split screen o texto en pantalla): «Cómo regala un hombre promedio en su aniversario vs cómo deberías hacerlo si quieres que no te boten.»\nToma 2 ('Ellos' - actor sufriendo): Se ve al chico en una tienda con una bolsa de plástico arrugada, metiendo un perfume genérico sin envoltura y un peluche con la etiqueta de precio puesta. Cara de pánico.\nToma 3 (Corte seco - sonido de switch): «El corte: Bienvenido al 2026.»\nToma 4 ('Nosotros' - elegancia y calma): Manos enguantadas sellando una caja rígida magnética con lazo de terciopelo, aroma de autor y el nombre grabado en dorado mate.\nToma 5 (Contraste): Ponemos la bolsa arrugada al lado del box de lujo: «¿Cuál crees que va a terminar en su historia de Instagram?»\nToma 6 (CTA): «No improvises más. Ve al link del perfil y asegura el tuyo en 2 minutos.»"
          }
    ],
  },

  {
    name: "PAS (Problema, Agitación, Solución)",
    slug: "pas",
    category: "VENDE",
    family: "Directo",
    summary:
      "La estructura clásica de venta directa: nombra el problema específico, lo agita hasta que duele, y entrega la solución definitiva.",
    defaultDurationSec: 40,
    beats: [
          {
                "name": "Problema",
                "goal": "Nombrar el dolor exacto en los primeros 3 segundos. Que la persona piense: 'me está hablando a mí'.",
                "seconds": 5
          },
          {
                "name": "Agitación",
                "goal": "Llevar el problema a sus consecuencias reales en la vida diaria. Hacerlo sentir incómodo.",
                "seconds": 14
          },
          {
                "name": "Punto de quiebre",
                "goal": "El momento de 'basta ya': la decisión de no seguir aguantando eso.",
                "seconds": 4
          },
          {
                "name": "Solución",
                "goal": "Presentar el producto como la salida lógica, limpia y accesible.",
                "seconds": 12
          },
          {
                "name": "CTA",
                "goal": "Paso siguiente inmediato y sin fricción.",
                "seconds": 5
          }
    ],
    systemPrompt: "El formato PAS funciona por precisión diagnóstica.\nClaves:\n- El problema debe ser un hecho de la vida cotidiana observable, no un concepto abstracto.\n- La agitación debe pintar la escena del desastre que ocurre cuando se ignora el problema (dinero botado, momentos arruinados, vergüenza pública).\n- La solución entra de golpe como el analgésico que detiene el sufrimiento.",
    rules: [
          "El problema debe ser específico y reconocible en 3 segundos.",
          "La agitación no puede hacer promesas falsas ni catastrofismo ridículo.",
          "La solución debe explicar en qué consiste en una sola frase.",
          "El CTA es de un solo paso claro."
    ],
    examples: [
          {
                "title": "La pesadilla del regalo genérico",
                "text": "Toma 1 (Actor con cara de decepción mirando un tazón genérico): «Comprar un regalo a última hora siempre termina en esto: gastaste $40 y la otra persona puso cara de compromiso.»\nToma 2 (Agitación - escenas rápidas): «Y lo peor es que sabes lo que va a pasar: ese regalo va a terminar en el fondo de un cajón, juntando polvo, y tú te vas a quedar sintiendo que no le importas lo suficiente como para dedicarle 10 minutos.»\nToma 3 (Punto de quiebre): «Ya basta de regalar por cumplir cosas que nadie pidió.»\nToma 4 (Solución): «En Con Amor diseñamos piezas personalizadas que cuentan la historia exacta de ustedes dos. Grabado láser de alta precisión y materiales que duran años.»\nToma 5 (CTA): «Toca el botón aquí abajo, escribe tu fecha especial y nosotros nos encargamos del resto.»"
          }
    ],
  },

  {
    name: "Historia de Fundador",
    slug: "historia-de-fundador",
    category: "VENDE",
    family: "Narrativo",
    summary:
      "La persona detrás del negocio cuenta por qué existe. Construye confianza y diferencia por identidad y vulnerabilidad, no por precio.",
    defaultDurationSec: 50,
    beats: [
          {
                "name": "La confesión",
                "goal": "Empezar por una vulnerabilidad real, un error o un momento difícil. Nada de presumir.",
                "seconds": 6
          },
          {
                "name": "El origen",
                "goal": "Cómo era la situación cuando no existía el producto y por qué hacía falta.",
                "seconds": 10
          },
          {
                "name": "El obstáculo",
                "goal": "Lo que casi hace que todo fracase. El momento de máxima dificultad.",
                "seconds": 12
          },
          {
                "name": "La decisión",
                "goal": "La convicción ética que definió cómo se harían las cosas a partir de ese día.",
                "seconds": 9
          },
          {
                "name": "El producto como consecuencia",
                "goal": "Cómo esa convicción se ve reflejada hoy en cada detalle del producto terminado.",
                "seconds": 8
          },
          {
                "name": "CTA de invitación",
                "goal": "Invitar a ser parte de la historia, no a una transacción fría.",
                "seconds": 5
          }
    ],
    systemPrompt: "Esta estructura vende por afinidad humana.\nClaves:\n- Jamás empieces diciendo 'Hola, soy el fundador de X'. Empieza con la herida: el día del fracaso, el cliente insatisfecho que te abrió los ojos o el despido.\n- La empresa no nace por ambición de dinero, sino por indignación ante la mala calidad que había en el mercado.\n- Muestra fotos reales del inicio, manos trabajando o planos del taller.",
    rules: [
          "Debe empezar por una vulnerabilidad o error honesto.",
          "Incluye al menos tres detalles concretos y verificables (año, lugar, costo).",
          "El producto se presenta como una consecuencia ética, no como un catálogo.",
          "El CTA invita a conocer el proyecto o sumarse a la comunidad."
    ],
    examples: [
          {
                "title": "El pedido que me devolvieron en 2021",
                "text": "Toma 1 (Fundador sentado en mesa de taller): «En 2021 me devolvieron el pedido más grande que había recibido en mi vida. Y el cliente tenía toda la razón.»\nToma 2 (Muestra fotos viejas en celular): «Había comprado cajas baratas para ahorrar costos y la mitad llegaron rotas por el camino. Me quedé sin capital y con una vergüenza que no me dejaba dormir.»\nToma 3 (En el taller trabajando): «Ese fin de semana decidí dos cosas: o cerraba el taller para siempre o aprendía a fabricar nosotros mismos cada empaque desde cero con madera y cartón prensado.»\nToma 4 (Mostrando las máquinas y terminados): «Nos costó dos años de pruebas, pero hoy no sale ni una sola caja de este taller que no soporte una caída de metro y medio sin despeinarse.»\nToma 5 (CTA): «Si valoras el trabajo hecho a mano con orgullo local, síguenos y conoce las historias que empacamos todos los días.»"
          }
    ],
  },

  {
    name: "Testimonio",
    slug: "testimonio",
    category: "VENDE",
    family: "Prueba Social",
    summary:
      "Un cliente real cuenta su antes, su duda escéptica y su transformación tangible. La prueba social más difícil de falsificar.",
    defaultDurationSec: 40,
    beats: [
          {
                "name": "El antes",
                "goal": "Cómo estaba antes de comprar, con una escena concreta y reconocible.",
                "seconds": 8
          },
          {
                "name": "La duda",
                "goal": "Por qué casi no compra. Esto es lo que da credibilidad absoluta.",
                "seconds": 7
          },
          {
                "name": "El momento",
                "goal": "Qué detalle específico le hizo decidirse y dar el paso.",
                "seconds": 6
          },
          {
                "name": "El después",
                "goal": "El resultado concreto y tangible, con una escena o dato real.",
                "seconds": 12
          },
          {
                "name": "La recomendación",
                "goal": "A quién se lo recomendaría con los ojos cerrados y a quién no.",
                "seconds": 7
          }
    ],
    systemPrompt: "El testimonio honesto desarma a los escépticos.\nClaves:\n- El 90% de los testimonios aburren porque son elogios planos. Lo que engancha al nuevo cliente es LA DUDA que el testimonio tuvo al principio.\n- Debe confesar qué miedo tenía: ¿pensaba que era caro? ¿que no llegaría a tiempo? ¿que era estafa?\n- El resultado debe ser visual: la reacción de su pareja, la durabilidad del producto o la tranquilidad que sintió.",
    rules: [
          "Debe incluir obligatoriamente la objeción o miedo previo a la compra.",
          "El resultado tiene que ser observable y verificable en pantalla.",
          "Evita adjetivos vacíos como 'excelente' o 'maravilloso'; usa hechos.",
          "El CTA es una invitación honesta a comprobarlo."
    ],
    examples: [
          {
                "title": "Josué pensaba que era una tienda fantasma",
                "text": "Toma 1 (Josué en su sala): «Faltaban tres días para el cumpleaños de Karen y yo no tenía nada listo. Me salieron en Instagram pero soy súper desconfiado para comprar por internet.»\nToma 2 (Muestra captura de chat): «Pensé que era una de esas páginas que te cobran y desaparecen, o que me iban a mandar algo de plástico barato de feria.»\nToma 3 (Sonríe recordando): «Lo que me hizo decidirme fue que me respondieron por WhatsApp a las 11 de la noche y me mandaron una foto real de la prueba del grabado antes de pagar.»\nToma 4 (Muestra la taza térmica y caja en uso): «Cuando llegó la caja sellada con lacre y vi la cara de Karen al leer su frase privada… hermano, valió cada sol. No se le despega ni para ir al trabajo.»\nToma 5 (Cierre): «Si eres desconfiado como yo, escríbeles al WhatsApp del perfil y pide que te manden tu muestra previa.»"
          }
    ],
  },

  {
    name: "Venta Directa",
    slug: "venta-directa",
    category: "VENDE",
    family: "Directo",
    summary:
      "Sin rodeos: qué es, para quién es, tres beneficios irrefutables con tomas de prueba y cómo se compra en un solo paso.",
    defaultDurationSec: 35,
    beats: [
          {
                "name": "Qué es",
                "goal": "Nombrar el producto y para quién es en una frase clara en los primeros 4 segundos.",
                "seconds": 4
          },
          {
                "name": "Los tres beneficios",
                "goal": "Tres razones concretas e irrefutables, una por toma con plano detalle.",
                "seconds": 15
          },
          {
                "name": "La prueba",
                "goal": "Una demostración visual rápida y física de que lo prometido es real.",
                "seconds": 10
          },
          {
                "name": "CTA",
                "goal": "Cómo comprarlo con el canal exacto y el paso inmediato.",
                "seconds": 6
          }
    ],
    systemPrompt: "Venta directa para público caliente que ya sabe qué necesita.\nClaves:\n- Cero vueltas teóricas. En el segundo 3 el espectador ya sabe exactamente qué se ofrece.\n- Cada uno de los 3 beneficios debe traducirse a una toma física de cámara (un primerísimo plano de costura, una prueba de resistencia al agua, una muestra de empaque).\n- El CTA da una orden clara y simple.",
    rules: [
          "Máximo tres beneficios; no agregues un cuarto ni mezcles ideas.",
          "Cada beneficio debe tener su propia toma visual de prueba en cámara.",
          "El precio o forma de pedirlo debe quedar totalmente claro.",
          "CTA específico con el enlace del perfil o WhatsApp."
    ],
    examples: [
          {
                "title": "El Box Aniversario en 30 segundos",
                "text": "Toma 1 (Presentador sosteniendo el Box con elegancia): «Este es nuestro Box Aniversario Con Amor y está diseñado para salvarte la vida si quieres dar un regalo que dure años.»\nToma 2 (Beneficio 1 - grabado láser): «Uno: Personalizado con sus nombres y su canción de Spotify grabados en acero quirúrgico que nunca se borra.»\nToma 3 (Beneficio 2 - aroma y detalles): «Dos: Viene aromatizado con esencia de vainilla amaderada y bombones artesanales listos para entregar.»\nToma 4 (Beneficio 3 - empaque de lujo): «Tres: Caja magnética con lazo de terciopelo que no necesita envoltura extra.»\nToma 5 (Demostración física): Muestra el cierre imantado cerrando con un chasquido seco de alta gama.\nToma 6 (CTA): «Haz clic en el enlace de la bio y asegura tu fecha de entrega antes del viernes.»"
          }
    ],
  },

  {
    name: "Oferta Directa",
    slug: "oferta-directa",
    category: "VENDE",
    family: "Directo",
    summary:
      "Video de campaña con una oferta irresistible, su stack de valor, su condición ética y fecha límite real de Hormozi.",
    defaultDurationSec: 35,
    beats: [
          {
                "name": "El anuncio",
                "goal": "Decir la oferta y la ventaja en los primeros 2 segundos sin anestesia.",
                "seconds": 4
          },
          {
                "name": "Qué incluye",
                "goal": "Desglosar visualmente todo el stack de lo que se lleva el cliente.",
                "seconds": 12
          },
          {
                "name": "La condición",
                "goal": "Qué hay que hacer para acceder. Honesto, transparente y sin letra chica.",
                "seconds": 7
          },
          {
                "name": "La urgencia real",
                "goal": "Fecha límite estricta o stock finito. Solo si es 100% verdad.",
                "seconds": 6
          },
          {
                "name": "CTA",
                "goal": "Un solo paso sin fricción hacia la compra.",
                "seconds": 6
          }
    ],
    systemPrompt: "Oferta directa basada en la metodología de $100M Offers de Alex Hormozi.\nClaves:\n- Desglosa el 'stack de valor': muestra el producto principal y luego suma los bonos gratis en pantalla uno por uno.\n- La urgencia o escasez DEBE ser real y justificada: 'solo fabricamos 20 cajas porque cada grabado toma 40 minutos'.\n- El llamado a la acción debe aprovechar el impulso del momento.",
    rules: [
          "La oferta principal se enuncia antes del segundo 3.",
          "Prohibido inventar fechas falsas o descuentos engañosos.",
          "Todo elemento adicional debe mostrarse físicamente en pantalla.",
          "El CTA debe dirigir a la compra o reserva directa."
    ],
    examples: [
          {
                "title": "Edición Limitada San Valentín",
                "text": "Toma 1 (Primer plano con texto en pantalla): «Solo por este fin de semana: te llevas nuestro set de copas grabadas y te regalamos la botella de espumante artesanal.»\nToma 2 (Desglose en mesa): «Te llevas las dos copas de cristal grabadas al diamante, la caja rígida de presentación y nuestra tarjeta lacrada a mano.»\nToma 3 (La condición): «Esto aplica únicamente para los primeros 15 pedidos que se registren por la web antes del domingo.»\nToma 4 (Urgencia real): «Porque el taller solo tiene capacidad para grabar 15 pedidos adicionales sin retrasar los envíos programados.»\nToma 5 (CTA): «Entra al enlace de mi biografía ahora mismo y asegura tu cupo antes de que el contador llegue a cero.»"
          }
    ],
  },

  {
    name: "Video con Voz en Off",
    slug: "voz-en-off",
    category: "VENDE",
    family: "Estético",
    summary:
      "Narración envolvente y cinematográfica sobre planos macro de producto. Abre un bucle mental y lo cierra al final con alta retención.",
    defaultDurationSec: 45,
    beats: [
          {
                "name": "Frase de entrada",
                "goal": "Una frase intrigante que abra un bucle en la cabeza del espectador.",
                "seconds": 4
          },
          {
                "name": "Desarrollo visual",
                "goal": "La narración guía una secuencia fluida de planos dinámicos de producto.",
                "seconds": 18
          },
          {
                "name": "El detalle que convence",
                "goal": "El primerísimo plano macro del detalle que justifica la calidad.",
                "seconds": 10
          },
          {
                "name": "El cierre del bucle",
                "goal": "Responder con contundencia la pregunta o misterio de la entrada.",
                "seconds": 8
          },
          {
                "name": "CTA",
                "goal": "Llamado a la acción con gráfico o sticker en pantalla.",
                "seconds": 5
          }
    ],
    systemPrompt: "Este formato vive de la belleza visual y el ritmo sonoro.\nClaves:\n- No hay un presentador hablando a cámara: la estrella es el producto y la voz en off lo envuelve con poesía conversacional.\n- Cada frase de la voz narradora tiene su corte visual exacto. Cero tomas estáticas de más de 2.5 segundos.\n- La pregunta o afirmación de la entrada debe ser respondida con el producto en el clímax.",
    rules: [
          "Cada frase de la narración debe tener una toma visual asignada.",
          "La iluminación y el enfoque deben ser limpios y de alta estética.",
          "El misterio inicial debe resolverse explícitamente antes del final.",
          "El CTA es estético y elegante."
    ],
    examples: [
          {
                "title": "Por qué los detalles hechos a mano se sienten distintos",
                "text": "Voz en off sobre plano macro de aguja e hilo de seda: «Dicen que cuando compras algo hecho a mano, no estás pagando por un objeto… estás pagando por las horas de paciencia de alguien que no te conoce.»\nTomas dinámicas en cámara lenta: El corte del cuero, la mezcla de la cera para el lacre, el ajuste del lazo de terciopelo.\nVoz en off: «Y cuando esa persona lo abre a cientos de kilómetros de distancia, ese cuidado se siente en el primer segundo.»\nPlano detalle del grabado con reflejo de luz: «Porque las cosas genéricas se olvidan en dos semanas, pero lo que tiene tu historia grabada se guarda para siempre.»\nCierre del bucle: «Esa es la razón por la que en Con Amor seguimos haciendo cada paquete a mano, uno por uno.»\nCTA en pantalla con música suave: «Encuentra el tuyo en el enlace de nuestro perfil.»"
          }
    ],
  },

  {
    name: "Unboxing",
    slug: "unboxing",
    category: "VENDE",
    family: "Sensorial",
    summary:
      "Abrir el paquete en tiempo real destacando el sonido crujiente, texturas, aromas y la emoción infantil de recibir un regalo.",
    defaultDurationSec: 40,
    beats: [
          {
                "name": "El paquete cerrado",
                "goal": "Mostrar el paquete sellado tal cual llega a la puerta de casa.",
                "seconds": 5
          },
          {
                "name": "La apertura",
                "goal": "Abrir despacio, capturando el sonido real del corte y los precintos.",
                "seconds": 12
          },
          {
                "name": "La primera capa",
                "goal": "Lo que se descubre primero: papel de seda, tarjeta lacrada, aroma.",
                "seconds": 8
          },
          {
                "name": "El producto",
                "goal": "Sacarlo, tocarlo y mostrar textura, peso y acabados en primer plano.",
                "seconds": 10
          },
          {
                "name": "La reacción",
                "goal": "La cara y la frase honesta al verlo completo y montado.",
                "seconds": 5
          }
    ],
    systemPrompt: "El unboxing sensorial (ASMR) vende por anticipación del placer de compra.\nClaves:\n- El audio del micrófono debe capturar los sonidos reales: el corte de la tijera, el desprendimiento de la cinta, el crujir del papel de seda.\n- Cero música alta que tape los sonidos del empaque.\n- La cámara debe estar fija en plano cenital o plano medio cerrado.",
    rules: [
          "Cada beat debe especificar el sonido real que se escucha.",
          "La apertura no se acelera con cortes falsos: se vive en tiempo real.",
          "Primer plano obligatorio de la textura y grabado del producto.",
          "CTA suave invitando a vivir la misma experiencia."
    ],
    examples: [
          {
                "title": "Abriendo el Box Deluxe de Con Amor",
                "text": "Toma 1 (Plano cenital, sonido ambiente): La caja negra mate sobre la mesa con el sello de cera dorada. «Llegó el pedido especial de San Valentín y quiero que escuchen esto…»\nToma 2 (Sonido de tijera cortando la cinta y apertura de tapa imantada con chasquido seco): Las manos abren despacio la tapa rígida.\nToma 3 (Retiro de papel de seda crujiente): Se aparta el papel de seda blanco y aparece la tarjeta con letra manuscrita y flores secas.\nToma 4 (Extracción del producto): Se sacan los dos termos grabados a juego y se muestra el relieve del grabado al pasar el dedo por el metal.\nToma 5 (Reacción a cámara con sonrisa): «Huele increíble y la calidad del grabado es una locura. Se los juro que esto supera cualquier expectativa.»\nCTA: «Pide el tuyo en el link de la bio antes de que se agoten los cupos semanales.»"
          }
    ],
  },

  {
    name: "Cómo se usa (Tutorial)",
    slug: "como-se-usa",
    category: "VENDE",
    family: "Educativo",
    summary:
      "Enseña el resultado final en 3 segundos y guía el paso a paso resolviendo el error típico. Elimina la fricción de 'no sabré usarlo'.",
    defaultDurationSec: 45,
    beats: [
          {
                "name": "El resultado primero",
                "goal": "Mostrar el resultado final impecable en los primeros 5 segundos.",
                "seconds": 5
          },
          {
                "name": "Lo que necesitas",
                "goal": "Enumerar los elementos visualmente sobre la mesa.",
                "seconds": 6
          },
          {
                "name": "Paso a paso",
                "goal": "Los pasos numerados en pantalla con tomas claras y dinámicas.",
                "seconds": 22
          },
          {
                "name": "El error común",
                "goal": "Advertir el error que el 90% comete para que sientan alivio.",
                "seconds": 7
          },
          {
                "name": "CTA",
                "goal": "Invitar a conseguir el kit completo en un solo clic.",
                "seconds": 5
          }
    ],
    systemPrompt: "El tutorial que vende muestra primero el premio y luego el camino fácil.\nClaves:\n- NUNCA empieces diciendo 'Hoy les voy a enseñar cómo…'. Empieza mostrando el resultado terminado: 'Así es como te tiene que quedar en 30 segundos'.\n- Cada paso lleva un número gigante en pantalla (1, 2, 3) y una sola acción física concreta.\n- El error común es el ancla de autoridad que hace que el video se guarde en favoritos.",
    rules: [
          "El resultado final debe verse en los primeros 5 segundos del video.",
          "Cada paso lleva número en pantalla y una acción clara.",
          "Obligatorio incluir el error común que todos cometen.",
          "El producto es el facilitador del tutorial."
    ],
    examples: [
          {
                "title": "Cómo personalizar tu cuadro de Spotify en 3 pasos",
                "text": "Toma 1 (Resultado terminado en las manos): «Así es como tiene que quedarte tu cuadro interactivo con su código de canción listo para escanear.»\nToma 2 (Mesa con materiales): «Solo necesitas tu foto favorita en buena resolución y el link de la canción que les recuerde su historia.»\nToma 3 (Paso 1, 2 y 3 con texto en pantalla): «Paso 1: Entras a nuestra web y subes la foto sin filtros oscuros. Paso 2: Pegas el enlace de Spotify para que generemos el código exacto. Paso 3: Escribes su fecha o frase secreta.»\nToma 4 (El error común): «El error que todos cometen: recortar la foto antes de subirla. No la recortes, nuestro sistema la encuadra automáticamente para que no pierda calidad.»\nToma 5 (Prueba escaneando el código con el celular y suena la música al instante): «Escaneas con la app y suena al segundo.»\nCTA: «Pruébalo gratis en el simulador de nuestro perfil.»"
          }
    ],
  },

  {
    name: "Antes y Después",
    slug: "antes-y-despues",
    category: "VENDE",
    family: "Transformación",
    summary:
      "La transformación visible más convincente. Mismo encuadre, proceso acelerado y revelación de cambio radical.",
    defaultDurationSec: 35,
    beats: [
          {
                "name": "El antes crudo",
                "goal": "Mostrar el estado inicial desordenado o dañado sin maquillar.",
                "seconds": 7
          },
          {
                "name": "El proceso",
                "goal": "Montaje acelerado mostrando el trabajo real y el oficio.",
                "seconds": 12
          },
          {
                "name": "La revelación",
                "goal": "El después en exactamente el mismo encuadre y ángulo que el antes.",
                "seconds": 8
          },
          {
                "name": "El dato",
                "goal": "Cuánto tardó, cuánto costó o qué materiales se usaron.",
                "seconds": 5
          },
          {
                "name": "CTA",
                "goal": "Cómo conseguir la misma transformación.",
                "seconds": 3
          }
    ],
    systemPrompt: "Este formato convence por los ojos.\nClaves:\n- El 'antes' y el 'después' DEBEN coincidir en posición de cámara, distancia focal y ángulo para que el impacto visual sea del 100%.\n- Prohibido empeorar el antes con mala luz a propósito: la autenticidad es lo que vende.\n- El proceso rápido demuestra que hay trabajo humano y técnico calificado.",
    rules: [
          "El antes y el después se graban con el mismo encuadre exacto.",
          "Prohibido fingir o alterar digitalmente el estado inicial.",
          "El beat del proceso debe mostrar manos trabajando.",
          "El CTA invita a pedir la misma transformación."
    ],
    examples: [
          {
                "title": "Restauración y grabado de joya familiar",
                "text": "Toma 1 (Plano macro en mismo encuadre): Una pulsera de plata oxidada, rayada y sin brillo sobre un fondo gris. Texto: «Antes».\nToma 2 (Proceso dinámico acelerado): Pulido con disco de joyero, baño de brillo, alineación de eslabones y grabado láser milimétrico del nombre de su abuela.\nToma 3 (Transición de corte con chasquido al mismo encuadre): La pulsera reluciente, pulida como espejo con el grabado perfecto. Texto: «Después».\nToma 4 (Dato en pantalla): «Nos tomó 4 horas de trabajo artesanal y quedó lista para pasar a la siguiente generación.»\nToma 5 (CTA): «¿Tienes una pieza que quieras revivir? Mándanos una foto por DM y te cotizamos al momento.»"
          }
    ],
  },

  {
    name: "Respondiendo Comentarios",
    slug: "respondiendo-comentarios",
    category: "VENDE",
    family: "Prueba Social",
    summary:
      "Toma una objeción real en comentarios y la responde con una demostración visual irrefutable en vez de excusas.",
    defaultDurationSec: 35,
    beats: [
          {
                "name": "El comentario en pantalla",
                "goal": "Mostrar el comentario real bien legible en los primeros 4 segundos.",
                "seconds": 4
          },
          {
                "name": "La reacción honesta",
                "goal": "Reaccionar de verdad: sonreír, sorprenderse o agradecer el reto sin enojo.",
                "seconds": 5
          },
          {
                "name": "La respuesta",
                "goal": "Responder con hechos concretos y sin lenguaje a la defensiva.",
                "seconds": 15
          },
          {
                "name": "La prueba",
                "goal": "Demostrar la respuesta con una toma física en vivo del producto.",
                "seconds": 8
          },
          {
                "name": "CTA",
                "goal": "Invitar a seguir preguntando y dejando dudas difíciles.",
                "seconds": 3
          }
    ],
    systemPrompt: "Este formato es oro puro para derribar objeciones de venta.\nClaves:\n- Elige el comentario más duro o escéptico: '¿Por qué tan caro?', 'Seguro se rompe en el envío', 'Eso lo consigo más barato en la esquina'.\n- Cero actitud defensiva o molesta: el presentador sonríe porque sabe que tiene la prueba que callará bocas.\n- La prueba física en vivo es el corazón del video.",
    rules: [
          "El comentario debe ser real, extraído de la cuenta.",
          "Elige objeciones de calidad o precio, nunca auto-elogios fáciles.",
          "Toda respuesta va acompañada de una demostración física en cámara.",
          "El CTA invita al debate constructivo."
    ],
    examples: [
          {
                "title": "¿Por qué cuesta 120 soles si en el mercado hay de 30?",
                "text": "Toma 1 (Sticker del comentario en pantalla): @carlos_m: «Muy bonito pero en el mercado me compro 3 de esas por el mismo precio.»\nToma 2 (Sonrisa tranquila a cámara): «Carlos tiene un punto y es una pregunta que muchos se hacen. Vamos a poner las dos juntas a ver qué pasa.»\nToma 3 (Prueba física): Pone la taza del mercado y la de Con Amor sobre la mesa. Le echa agua hirviendo a ambas. La del mercado quema la mano al tocarla y el adhesivo se levanta al raspar con la uña. La de Con Amor mantiene el exterior frío y el grabado láser ni se inmuta al rasparlo con una llave.\nToma 4 (La explicación honesta): «La diferencia no es solo cómo se ve hoy, es si te va a durar dos semanas o cinco años.»\nToma 5 (CTA): «¿Tienen otra duda que quieran que pongamos a prueba? Déjenla en los comentarios.»"
          }
    ],
  },

  {
    name: "Meme / Anuncio Divertido",
    slug: "meme-anuncio-divertido",
    category: "VENDE",
    family: "Humor",
    summary:
      "Usa un formato de humor reconocible del momento y le mete la marca con una escalada absurda. Alcance viral con bajo costo.",
    defaultDurationSec: 25,
    beats: [
          {
                "name": "El setup",
                "goal": "Plantear la situación reconocible en una frase o texto en pantalla.",
                "seconds": 4
          },
          {
                "name": "La escalada",
                "goal": "Subir el absurdo de la situación hasta el límite cómico.",
                "seconds": 11
          },
          {
                "name": "El remate",
                "goal": "El chiste remata con el producto involucrado de forma inesperada.",
                "seconds": 6
          },
          {
                "name": "CTA mínimo",
                "goal": "Una línea corta y simpática. Sin romper el tono.",
                "seconds": 4
          }
    ],
    systemPrompt: "El humor primero, la marca después.\nClaves:\n- Duración corta: entre 15 y 25 segundos como máximo.\n- Si el chiste no da gracia sin el producto, el guion no sirve.\n- El CTA es un susurro o texto breve; un CTA largo de vendedor mata el alcance viral.",
    rules: [
          "Duración máxima estricta de 25 segundos.",
          "El CTA no puede pasar de una sola línea.",
          "Nunca expliques el chiste con palabras.",
          "Utiliza situaciones hiper-reconocibles de la vida diaria."
    ],
    examples: [
          {
                "title": "Cuando ella te dice 'no quiero nada'",
                "text": "Texto en pantalla (segundo 0): «POV: Tu novia te dijo 'tranquilo mi amor, este año no nos regalemos nada, solo estemos juntos'.»\nToma 1 (Él relajado en el sillón comiendo papas): «Ah, qué alivio, este año no gasto.»\nToma 2 (De pronto recuerda la mirada de ella): Corte a primer plano con música de suspenso dramático. Zoom a sus ojos con terror.\nToma 3 (Él corriendo desesperado por la casa agarrando la tarjeta de crédito): Abriendo la web de Con Amor a la velocidad de la luz a las 11:59 PM.\nToma 4 (Remate): Llega el repartidor al día siguiente a tiempo. Él sonríe sudando frío abrazando la caja: «Casi pierdo mi relación pero salvé mi vida.»\nCTA en pantalla: «No te arriesgues. Link en bio.»"
          }
    ],
  },

  {
    name: "Explicando Beneficios",
    slug: "explicando-beneficios",
    category: "VENDE",
    family: "Educativo",
    summary:
      "Traduce cada característica técnica del producto a un beneficio concreto de tranquilidad o disfrute en la vida diaria del cliente.",
    defaultDurationSec: 40,
    beats: [
          {
                "name": "La pregunta",
                "goal": "'¿Por qué esto cuesta lo que cuesta?' o la duda del comprador.",
                "seconds": 5
          },
          {
                "name": "Característica 1 a beneficio",
                "goal": "Mostrar el detalle técnico y traducirlo a la vida real.",
                "seconds": 10
          },
          {
                "name": "Característica 2 a beneficio",
                "goal": "Segunda traducción visual con plano detalle.",
                "seconds": 10
          },
          {
                "name": "Característica 3 a beneficio",
                "goal": "Tercera traducción enfocada en durabilidad o estatus.",
                "seconds": 9
          },
          {
                "name": "CTA",
                "goal": "Cierre e invitación con seguridad.",
                "seconds": 6
          }
    ],
    systemPrompt: "La regla de oro: NUNCA menciones una característica sin traducirla a beneficio.\nFórmula obligatoria: 'Esto está hecho de X… lo que para ti significa que Y'.\nClaves:\n- La gente no compra acero 304, compra que su café siga caliente a las 3 de la tarde.\n- La gente no compra impresión UV, compra que los nombres no se borren cuando la laven.\n- Cada beneficio necesita su toma macro correspondiente.",
    rules: [
          "Cada característica se traduce obligatoriamente a un beneficio cotidiano.",
          "Máximo tres características; no satures a la audiencia.",
          "Cada característica necesita su propio plano detalle.",
          "El CTA invita a elegir la versión personalizada."
    ],
    examples: [
          {
                "title": "Por qué nuestras tazas térmicas valen cada centavo",
                "text": "Toma 1 (Presentador con la taza en mano): «Mucha gente nos pregunta por qué nuestras tazas personalizadas no cuestan 20 soles como las demás. Aquí están las 3 razones.»\nToma 2 (Característica 1 a beneficio): «Primero: doble pared de acero con vacío térmico. Lo que para ti significa que puedes llenarla de café a las 8 AM y a las 2 de la tarde sigue quemando como recién servido.»\nToma 3 (Característica 2 a beneficio): «Segundo: grabado láser de fibra óptica. No es sticker ni serigrafía barata. Lo que significa que puedes meterla al lavavajillas mil veces y el nombre de ustedes dos jamás se va a despintar.»\nToma 4 (Característica 3 a beneficio): «Tercero: tapa hermética con sello de silicona médica. Lo que significa cero accidentes en tu mochila o en los asientos de tu carro.»\nToma 5 (CTA): «Elige tu color favorito y tu frase en el enlace de nuestro perfil hoy mismo.»"
          }
    ],
  },

  {
    name: "POV (Perspectiva)",
    slug: "pov",
    category: "VENDE",
    family: "Narrativo",
    summary:
      "El espectador ve toda la escena desde los ojos del protagonista en primera persona. Genera identificación inmediata.",
    defaultDurationSec: 35,
    beats: [
          {
                "name": "El rótulo POV",
                "goal": "Texto en pantalla específico que sitúa la tensión: 'POV: es tu aniversario y no compraste nada'.",
                "seconds": 3
          },
          {
                "name": "La situación",
                "goal": "Vivir la escena en primera persona con cámara en mano.",
                "seconds": 11
          },
          {
                "name": "El giro",
                "goal": "Algo cambia la situación y da una salida salvadora.",
                "seconds": 8
          },
          {
                "name": "La resolución",
                "goal": "Cómo termina el conflicto con el producto como protagonista del alivio.",
                "seconds": 9
          },
          {
                "name": "CTA",
                "goal": "Cierre breve y directo.",
                "seconds": 4
          }
    ],
    systemPrompt: "El formato POV triunfa por inmersión absoluta.\nClaves:\n- La cámara ES los ojos del espectador. Se ven las manos del protagonista interactuando con los objetos y las personas.\n- El rótulo inicial debe ser hiper-específico: nada de 'POV: compras un regalo'. Debe ser: 'POV: Llegas a su casa, te mira a las manos y tú traes esto'.\n- Sin narrador externo ni cortes que rompan la perspectiva subjetiva.",
    rules: [
          "El rótulo POV debe ser específico y reconocible.",
          "Prohibido usar narrador externo.",
          "La cámara debe mantener la perspectiva subjetiva en todo momento.",
          "El producto es el objeto con el que interactúan las manos del protagonista."
    ],
    examples: [
          {
                "title": "Llegas a cenar y sacas la caja",
                "text": "Rótulo POV en pantalla: «POV: Llegas a la cena de aniversario después de un día de locos pero tenías esto guardado en el maletín.»\nToma 1 (Cámara subjetiva): Se ve la mesa del restaurante a la luz de las velas. Ella está sentada mirándote sonriente: «Pensé que te ibas a olvidar con todo el trabajo que tuviste…»\nToma 2 (Las manos del protagonista): Tus manos bajan al maletín, sacan la caja negra mate de Con Amor con su lazo perfecto y la colocan suavemente frente a ella.\nToma 3 (La reacción de ella en primer plano): Ella abre los ojos con sorpresa genuina: «¡Amor! ¿Qué es esto?»\nToma 4 (Ella abre la caja y saca las copas grabadas con su fecha): «¡Te acordaste de nuestra primera cita en Cusco!» Sonríe y estira las manos hacia la cámara para abrazarte.\nToma 5 (CTA en pantalla con las copas en la mesa): «Haz que cada aniversario se sienta así. Link en bio para personalizar el tuyo.»"
          }
    ],
  },

  {
    name: "Vlog de Marca",
    slug: "vlog-de-marca",
    category: "VENDE",
    family: "Detrás de cámaras",
    summary:
      "Un día en el negocio mostrando el taller real, los imprevistos y el cariño detrás de cada pedido. Humaniza y vende por transparencia.",
    defaultDurationSec: 50,
    beats: [
          {
                "name": "Arranque del día",
                "goal": "Situar la hora y el lugar con ambiente real y dinámico.",
                "seconds": 6
          },
          {
                "name": "El proceso",
                "goal": "Mostrar cómo se fabrica de verdad el producto paso a paso.",
                "seconds": 18
          },
          {
                "name": "El imprevisto",
                "goal": "Algo que sale mal o se complica. Esto es lo que humaniza.",
                "seconds": 10
          },
          {
                "name": "El pedido especial",
                "goal": "Un caso concreto de un cliente con nombre propio y petición emotiva.",
                "seconds": 10
          },
          {
                "name": "Cierre",
                "goal": "Fin de jornada satisfechos y CTA suave.",
                "seconds": 6
          }
    ],
    systemPrompt: "El vlog de marca vende porque enseña lo que nadie enseña: el esfuerzo y la honestidad.\nClaves:\n- OBLIGATORIO incluir un imprevisto real del taller: se descalibró el láser, un color de cinta se agotó o el repartidor casi no llega. Un negocio perfecto no se cree.\n- Nombra al cliente del pedido especial: 'Este paquete es para Diego que le va a pedir matrimonio a su novia este sábado'.\n- Audio ambiental de taller: máquinas sonando, risas del equipo.",
    rules: [
          "Debe incluir un imprevisto o reto real del día.",
          "Incluye al menos un pedido concreto de cliente con su historia.",
          "Sonido ambiente real sin música pesada que opaque.",
          "El CTA es cálido y conversacional."
    ],
    examples: [
          {
                "title": "Un día en el taller salvando una pedida de mano",
                "text": "Toma 1 (Taller 7:30 AM, cafetera prendida): «Son las 7:30 AM y hoy tenemos que despachar 22 pedidos, pero este de aquí tiene que salir perfecto sí o sí.»\nToma 2 (En la máquina de grabado): «Diego nos escribió anoche porque viaja hoy a Arequipa para pedirle matrimonio a su novia en el Valle del Colca.»\nToma 3 (El imprevisto): «A mitad del grabado, la madera tenía una veta dura que desvió el trazo 2 milímetros. Habría pasado desapercibido para cualquiera, pero aquí no mandamos nada que no esté al 100%. Así que tocó descartar la tapa y empezar otra desde cero corriendo contra el reloj.»\nToma 4 (El resultado impecable): «A las 11:15 AM la caja estaba sellada con su lacre rojo y lista para que la recogiera el courier.»\nToma 5 (Cierre): «Gracias a todos por dejarnos ser parte de sus momentos especiales. Si tienes una fecha cerca, escríbenos con tiempo al WhatsApp del perfil.»"
          }
    ],
  },

  {
    name: "Vlog",
    slug: "vlog",
    category: "ENTRETIENE",
    family: "Entretenimiento",
    summary:
      "Un día en la vida del equipo sin agenda comercial. Construye comunidad, viralidad y alimenta el algoritmo de la cuenta.",
    defaultDurationSec: 45,
    beats: [
          {
                "name": "Arranque",
                "goal": "Dónde estamos y qué locura o reto va a pasar hoy con el equipo.",
                "seconds": 6
          },
          {
                "name": "Momento 1",
                "goal": "Primera situación cómica o cotidiana en el taller.",
                "seconds": 14
          },
          {
                "name": "Momento 2",
                "goal": "Segunda situación con más energía o una dinámica grupal.",
                "seconds": 14
          },
          {
                "name": "El momento del día",
                "goal": "Lo más gracioso, inesperado o lindo que pasó en la jornada.",
                "seconds": 7
          },
          {
                "name": "Despedida",
                "goal": "Cierre cálido y amistoso. Sin ninguna venta.",
                "seconds": 4
          }
    ],
    systemPrompt: "ESTE VIDEO NO VENDE NADA. Cero llamados a la acción comercial.\nClaves:\n- El objetivo es que la audiencia se enamore del equipo: sus bromas, su música, cómo comparten el almuerzo o las ocurrencias del día.\n- Si metes un enlace de venta, destruyes la magia del vlog orgánico.\n- Puede verse el producto de fondo, pero nadie habla de comprarlo.",
    rules: [
          "Prohibido cualquier llamado a la acción comercial o mención de venta.",
          "No se explica ni promociona el producto; es vida cotidiana pura.",
          "El campo cta debe quedar vacío o con una despedida amistosa.",
          "Cortes dinámicos y risas espontáneas."
    ],
    examples: [
          {
                "title": "Día de pizzas y desastre en el taller",
                "text": "Toma 1 (Selfie entrando al taller): «Hoy prometimos que íbamos a terminar temprano para comer pizza… spoiler: eran las 8 de la noche y seguíamos aquí.»\nToma 2 (Marcos intentando abrir una caja con las rodillas mientras Lucía se ríe): «Miren la técnica milenaria de embalaje de Marcos, aprobada por la NASA.»\nToma 3 (Llega la pizza y todos corren dejando las cintas pegadas en la mesa): «La verdadera razón por la que nadie renuncia a este equipo.»\nToma 4 (El momento cumbre): Marcos bailando salsa con una caja vacía en la cabeza mientras suena la radio del taller.\nToma 5 (Despedida): «Y así se nos fue el martes. Nos vemos mañana mi gente, cuídense mucho.»"
          }
    ],
  },

  {
    name: "Sketch",
    slug: "sketch",
    category: "ENTRETIENE",
    family: "Entretenimiento",
    summary:
      "Una situación cómica actuada con personajes reconocibles. Busca risas, compartidos masivos y repetición sin vender.",
    defaultDurationSec: 35,
    beats: [
          {
                "name": "El personaje",
                "goal": "Presentar al personaje con un gesto o muletilla reconocible en 4 segundos.",
                "seconds": 4
          },
          {
                "name": "La situación",
                "goal": "Plantear el conflicto cómico de la escena.",
                "seconds": 10
          },
          {
                "name": "La escalada",
                "goal": "La situación empeora en tres niveles absurdos.",
                "seconds": 13
          },
          {
                "name": "El remate",
                "goal": "El chiste final seco y contundente, sin explicaciones.",
                "seconds": 8
          }
    ],
    systemPrompt: "Sketch de humor puro para viralidad en TikTok y Reels.\nClaves:\n- Personajes reconocibles al instante: el novio despistado, la tía intensa, el amigo tacaño, el jefe que no entiende la tecnología.\n- La escalada cómica debe ser matemática: problema pequeño -> reacción exagerada -> catástrofe ridícula.\n- El video corta inmediatamente tras el remate para forzar la reproducción en bucle.",
    rules: [
          "Prohibido cualquier llamado a la acción comercial.",
          "El campo cta debe quedar completamente vacío.",
          "El video corta en seco justo después del remate.",
          "Los personajes deben ser interpretados con energía cómica."
    ],
    examples: [
          {
                "title": "El amigo que pide prestado para el regalo de su novia",
                "text": "Toma 1 (El personaje con cara de drama): Entra Marco a la sala con un pan en la mano y cara compungida. «Hermano, ¿tú me consideras tu mejor amigo?»\nToma 2 (La situación): Josué, sin levantar la vista del celular: «Depende. Si me vas a pedir plata, nos conocimos ayer.»\nToma 3 (La escalada): Marco se arrodilla dramáticamente: «¡Es que es el cumplemes de Vanessa y solo tengo 4 soles en la cuenta!» Josué: «¿Y qué pensabas regalarle con 4 soles?» Marco: «Le compré dos mandarinas pero me comí una en el camino…»\nToma 4 (El remate): Josué le lanza un cojín en la cara: «¡Sal de mi casa inmediatamente!» Corte en seco."
          }
    ],
  },

  {
    name: "Cámara Escondida",
    slug: "camara-escondida",
    category: "ENTRETIENE",
    family: "Entretenimiento",
    summary:
      "Reacciones reales y espontáneas ante una sorpresa sana o situación inusual. Altísimo alcance y conexión emocional.",
    defaultDurationSec: 45,
    beats: [
          {
                "name": "El plan",
                "goal": "Explicar al espectador la sorpresa o broma sana que se va a montar.",
                "seconds": 7
          },
          {
                "name": "El montaje",
                "goal": "Preparar la situación y ocultar la cámara en el lugar.",
                "seconds": 8
          },
          {
                "name": "La reacción",
                "goal": "El momento de la reacción genuina de la persona sin cortes.",
                "seconds": 20
          },
          {
                "name": "La revelación",
                "goal": "Contarle a la persona, mostrar las cámaras y ver su emoción o risa.",
                "seconds": 10
          }
    ],
    systemPrompt: "Formato de cámara oculta que conmueve o hace reír con respeto.\nClaves:\n- La broma o sorpresa NUNCA debe humillar, ridiculizar ni asustar peligrosamente a nadie.\n- El valor está en la autenticidad de la reacción humana: la sorpresa, el pudor, la sonrisa que se escapa.\n- Obligatorio mostrar la revelación donde la persona se entera y autoriza con una sonrisa.",
    rules: [
          "Prohibido cualquier llamado a la acción comercial directo.",
          "La broma jamás humilla ni asusta de verdad a nadie.",
          "La revelación final es obligatoria para cerrar la tensión con calidez.",
          "Incluye siempre la nota de producción sobre el consentimiento."
    ],
    examples: [
          {
                "title": "Regalando flores y mensajes a desconocidos en el parque",
                "text": "Toma 1 (Cámara oculta en el pecho o banco): «Dejamos esta caja con rosas y tarjetas en una banca del parque de Miraflores con un cartel que dice: 'Si tuviste un día difícil, tómala, es para ti'.»\nToma 2 (Montaje de cámara): Se ve a la gente pasando con curiosidad, algunos dudan y siguen de largo.\nToma 3 (La reacción real): Una señora con cara cansada y bolsas de compras se detiene, lee el cartel despacio, mira a los lados con timidez y toma una rosa. La huele y se le quiebra la sonrisa con lágrimas en los ojos.\nToma 4 (La revelación): Nos acercamos sonriendo: «Buenas tardes señora, es para usted de verdad, que tenga un hermoso día.» Ella nos abraza conmovida: «Muchas gracias hijo, justo hoy me sentía muy sola.»\nCierre cálido con música emotiva y crédito final sin venta."
          }
    ],
  },

];
