/**
 * Catálogo de Ángulos Creativos y Gatillos Psicológicos de CTA
 * Inspirado en fórmulas de retención vertical y la metodología de Alex Hormozi
 * ($100M Offers / $100M Leads: Escasez, Urgencia, Motivo "Fraternidad", Incentivo y Demostración Visual).
 */

export type CreativeAngle = {
  id: string;
  name: string;
  shortLabel: string;
  icon: string;
  badge: string;
  description: string;
  promptInstructions: string;
  hookExample: string;
};

export const ANGULOS_CREATIVOS: CreativeAngle[] = [
  {
    id: "camaleon",
    name: "Camaleón (90% Contenido / 10% Venta al final)",
    shortLabel: "Camaleón",
    icon: "🦎",
    badge: "90% Nativo",
    description:
      "El 90% del tiempo parece contenido orgánico de valor, entretenimiento o tutorial de la red. Recién al final vende de forma natural y justificada.",
    promptInstructions: `ÁNGULO OBLIGATORIO: "CAMALEÓN" (90% Contenido nativo de valor / 10% Venta al final).
- REGLA ESTRICTA 90/10: El 90% de la duración del guion DEBE ser contenido 100% nativo de la plataforma (un tutorial práctico, un storytime auténtico, una receta, un tip o una curiosidad de la subcultura).
- El espectador DEBE quedarse viendo el video pensando genuinamente que es un contenido de valor de su feed, sin sospechar que es un video con intención comercial.
- PROHIBIDO sonar a comercial o meter la marca en los primeros segundos.
- Solo en el último 10% del guion (en el remate y la última escena), el producto o servicio entra de forma lógica, justificada y natural como la herramienta o solución que resuelve lo expuesto, culminando en el llamado a la acción.`,
    hookExample: "«Si te pasa esto todos los días al organizar tus cosas, este truco te va a salvar la vida…»",
  },
  {
    id: "ella_vs_ellos",
    name: "Ellos vs Nosotros / Ella vs Ellos (Choque de perspectivas y hábitos)",
    shortLabel: "Ellos vs Nosotros",
    icon: "👫",
    badge: "Choque de visiones",
    description:
      "Un tema o producto es usado de una manera por un grupo (ej. mujeres) y de otra manera completamente distinta por los hombres u otros. Expone cómo piensan y actúan.",
    promptInstructions: `ÁNGULO OBLIGATORIO: "ELLOS VS NOSOTROS / ELLA VS ELLOS" (Contraste de perspectivas, hábitos y mentalidad).
- El guion debe estructurarse mostrando las dos caras de la moneda: cómo un bando/grupo (ej. mujeres, o la vieja escuela) piensa y usa el producto/situación, frente a cómo el otro bando (ej. hombres, o la nueva forma) lo piensa y lo aborda de manera totalmente diferente.
- Muestra el choque cómico o revelador de pensamientos: los diálogos internos, las expectativas exageradas, los pasos innecesarios de un lado vs la practicidad o visión del otro.
- Utiliza situaciones reconocibles de la vida real donde ambos lados quedan retratados con empatía y humor.
- El producto o servicio actúa como el punto de contraste evidente que demuestra la diferencia de mentalidades.`,
    hookExample: "«Cómo usan esto las mujeres vs cómo creemos los hombres que se usa…»",
  },
  {
    id: "impacto_visual",
    name: "Impacto Visual / Rompimiento de patrón (Hook físico de choque)",
    shortLabel: "Impacto Visual",
    icon: "💥",
    badge: "Retención pura",
    description:
      "Arranca en el segundo cero con una acción física chocante, un objeto que se rompe o cae, zoom macro o demostración visual sin anestesia.",
    promptInstructions: `ÁNGULO OBLIGATORIO: "IMPACTO VISUAL Y ROMPIMIENTO DE PATRÓN".
- La primera escena NO PUEDE empezar con una persona hablando estática frente a cámara.
- DEBE arrancar en el segundo 0 con un estímulo visual disruptivo: algo que se cae, se rompe, un plano macro extremo, un gesto físico inesperado o una transformación antes/después instantánea.
- Las indicaciones de cámara ('shot'), acción física ('action') y utilería ('props') deben ser muy cinematográficas, dinámicas y detalladas en todo el guion.`,
    hookExample: "(Corte seco: objeto cayendo o rompiéndose) «Antes de que digas que esto no funciona, mira esto…»",
  },
  {
    id: "pov_situacion",
    name: "POV / Situación Real (Cámara en mano / En tus zapatos)",
    shortLabel: "POV Real",
    icon: "📱",
    badge: "Inmersión",
    description:
      "Punto de vista en primera persona. Coloca al espectador en medio de una conversación incómoda o momento verídico que todos han vivido.",
    promptInstructions: `ÁNGULO OBLIGATORIO: "POV / SITUACIÓN REAL".
- Plantea la escena como si la cámara fuera los ojos del espectador o un testigo presencial de un momento tenso, cómico o revelador de la vida real.
- Diálogos directos, ritmo conversacional y movimientos de cámara en mano que transmitan cercanía e inmediatez documental.`,
    hookExample: "«POV: Tu cliente te dice que su sobrino lo hace más barato…»",
  },
  {
    id: "anti_consejo",
    name: "Anti-Consejo (El enemigo común / Romper mitos)",
    shortLabel: "Anti-Consejo",
    icon: "🎯",
    badge: "Disrupción",
    description:
      "Ataca de frente el consejo tóxico o la creencia errónea que todo el mundo repite. Polariza y posiciona como autoridad que dice la verdad.",
    promptInstructions: `ÁNGULO OBLIGATORIO: "ANTI-CONSEJO Y ENEMIGO COMÚN".
- Abre desmintiendo con vehemencia una práctica común o un mal consejo que la industria le ha vendido a la gente.
- Señala al "enemigo común" (la desinformación, las malas prácticas, las falsas promesas) y presenta el producto o método como la solución honesta que nadie se atreve a contar.`,
    hookExample: "«Deja de hacer esto inmediatamente si no quieres seguir perdiendo dinero…»",
  },
  {
    id: "experimento",
    name: "Experimento / Reto empírico (7 días / Prueba en vivo)",
    shortLabel: "Experimento",
    icon: "🧪",
    badge: "Prueba Social",
    description:
      "Formato de prueba científica callejera: 'Probé esto durante 7 días', 'Gasté $X para ver qué pasaba'. Curiosidad irresistible.",
    promptInstructions: `ÁNGULO OBLIGATORIO: "EXPERIMENTO O RETO EMPÍRICO".
- Estructura el guion como la bitácora o revelación de un experimento real: qué se puso a prueba, qué pasó en el camino y cuál fue el resultado sorprendente.
- Utiliza datos concretos, contrastes visuales de evolución y conclusiones contundentes.`,
    hookExample: "«Decidí probar esto durante 7 días seguidos y el día 4 casi me arrepiento…»",
  },
  {
    id: "storytime_confesion",
    name: "Storytime / Confesión («Casi pierdo todo por esto» / Vulnerabilidad real)",
    shortLabel: "Storytime",
    icon: "📖",
    badge: "Vulnerabilidad",
    description:
      "Narrativa personal de un error, momento crítico o revelación íntima. Conecta desde la vulnerabilidad humana antes de presentar la lección y la solución.",
    promptInstructions: `ÁNGULO OBLIGATORIO: "STORYTIME / CONFESIÓN HONESTA".
- El guion debe estructurarse como una historia personal verídica narrada en primera persona.
- Empieza en el momento de mayor quiebre o incertidumbre: un error cometido, un cliente difícil, un día que casi se pierde todo.
- Muestra la lección aprendida y cómo esa experiencia dio origen a la solución o producto actual.
- Cero presunción ni tono corporativo: tono íntimo, sincero y cercano.`,
    hookExample: "«Nunca conté esto públicamente, pero el año pasado casi pierdo todo por este error…»",
  },
  {
    id: "parodia_sketch",
    name: "Parodia Cotidiana / Humor Absurdo (Escalada cómica)",
    shortLabel: "Parodia / Humor",
    icon: "😂",
    badge: "Humor Absurdo",
    description:
      "Caricaturiza una situación de la vida diaria exagerando las reacciones hasta el límite. El producto entra como el cómplice del remate.",
    promptInstructions: `ÁNGULO OBLIGATORIO: "PARODIA COTIDIANA Y ESCALADA CÓMICA".
- Plantea un dilema o situación hiper-reconocible de la vida diaria (la pareja, el trabajo, las compras, el dinero).
- Aplica la ley de la comedia en tres tiempos: Planteamiento -> Escalada exagerada -> Remate absurdo.
- Las indicaciones de actuación deben especificar gestos, pausas dramáticas y miradas cómplices a cámara.
- El producto entra como parte del remate cómico o la salvación inesperada.`,
    hookExample: "«Yo jurando que este mes sí iba a ahorrar vs yo en el primer día de quincena…»",
  },
  {
    id: "hater_critica",
    name: "Respondiendo Crítica / Cara a Cara con el Escéptico",
    shortLabel: "Frente al Hater",
    icon: "💬",
    badge: "Objeción en Vivo",
    description:
      "Toma la objeción más ácida («Eso es una estafa», «Por qué tan caro») y la desmantela en vivo con una demostración visual irrefutable y tono sereno.",
    promptInstructions: `ÁNGULO OBLIGATORIO: "RESPONDIENDO AL ESCÉPTICO / CRÍTICA EN VIVO".
- Abre con el comentario o la objeción más dura puesta en pantalla.
- La reacción inicial NO puede ser enojada ni a la defensiva: debe ser tranquila, segura y sonriente.
- Responde ejecutando una prueba física en tiempo real en cámara (romper, medir, abrir, comparar).
- El cierre desafía con simpatía a que sigan dejando sus dudas más difíciles en los comentarios.`,
    hookExample: "«Alguien me puso en los comentarios que esto era una estafa china… miren lo que pasa cuando lo pongo a prueba.»",
  },
  {
    id: "hack_tutorial",
    name: "Hack Oculto / El Atajo que Nadie Enseña (Utilidad inmediata)",
    shortLabel: "Hack Oculto",
    icon: "🛠️",
    badge: "Atajo Secreto",
    description:
      "Revela un truco práctico o atajo que ahorra tiempo o dinero. Entrega el 'cómo se hace' en 3 pasos rápidos sin rodeos.",
    promptInstructions: `ÁNGULO OBLIGATORIO: "HACK OCULTO Y ATAJO PRÁCTICO".
- Muestra el resultado asombroso en los primeros 3 segundos: «Mira cómo queda esto en 10 segundos».
- Desglosa la solución en exactamente 3 pasos sencillos numerados en pantalla.
- Advierte el error común que el 90% de la gente comete para generar el momento de '¡ah, con razón!'.
- El producto o servicio es el componente clave que hace que el truco funcione sin esfuerzo.`,
    hookExample: "«El 99% de las personas hace esto mal todos los días… aquí está el truco de 10 segundos que lo arregla.»",
  },
  {
    id: "unboxing_asmr",
    name: "Unboxing Sensorial / ASMR Táctil (Experiencia de empaque)",
    shortLabel: "ASMR / Unboxing",
    icon: "📦",
    badge: "Sensorial ASMR",
    description:
      "Experiencia táctil y acústica del producto: el sonido crujiente del corte, textura de los materiales, aroma y detalles cuidados que despiertan el deseo de recibirlo.",
    promptInstructions: `ÁNGULO OBLIGATORIO: "UNBOXING SENSORIAL Y ASMR TÁCTIL".
- Las indicaciones de sonido ('sound') y plano ('shot') son prioritarias: sonido crujiente del precinto, el rasgar del papel, el chasquido del cierre.
- Planos primerísimos de textura, brillo, aroma y detalles grabados con cuidado.
- Diálogo pausado, íntimo y susurrado o en voz baja que no tape los sonidos reales del producto.
- Enfatiza la emoción sensorial de abrir un paquete pensado para uno.`,
    hookExample: "(Sonido crujiente de cinta adhesiva y empaque en primerísimo plano) «Miren la sorpresa que preparamos para este pedido especial…»",
  },
  {
    id: "detras_de_camaras",
    name: "Detrás de Cámaras / La Verdad del Taller (Transparencia con imprevisto)",
    shortLabel: "Detrás de Cámaras",
    icon: "🏭",
    badge: "Taller Real",
    description:
      "Muestra el proceso de producción real sin poses, incluyendo un imprevisto o reto del día que humaniza al equipo y demuestra el amor por el detalle.",
    promptInstructions: `ÁNGULO OBLIGATORIO: "DETRÁS DE CÁMARAS Y LA VERDAD DEL TALLER".
- Graba en el lugar de trabajo real (taller, oficina, almacén) con luz de trabajo y ambiente auténtico.
- OBLIGATORIO incluir un imprevisto real del día: una máquina que se trabó, un color que no salía, un paquete que casi no llega a tiempo.
- Muestra la dedicación humana y el trabajo manual que hay detrás de cada entrega.
- Genera empatía y respeto por el trabajo artesanal o profesional antes de cualquier llamado a la acción.`,
    hookExample: "«Son las 7:00 AM en el taller y tuvimos una emergencia con este pedido que sale en dos horas…»",
  },
];

/* --------------------------------------------------- GATILLOS DE CTA (HORMOZI) -- */

export type CtaTrigger = {
  id: string;
  name: string;
  shortLabel: string;
  icon: string;
  category: "escasez" | "urgencia" | "motivo" | "incentivo" | "impacto" | "directo";
  badge: string;
  explanation: string;
  bookReference: string;
  defaultDetailPlaceholder: string;
  presets: {
    label: string;
    accion: string;
    detalle: string;
    textoCompleto: string;
  }[];
  promptGuidance: string;
};

export const CTA_TRIGGERS: CtaTrigger[] = [
  {
    id: "escasez",
    name: "Escasez Ética (Capacidad y Cupos Limitados)",
    shortLabel: "Escasez",
    icon: "⏳",
    category: "escasez",
    badge: "Cupos / Unidades",
    explanation:
      "Cuando hay poca oferta en comparación con la demanda, la gente lo quiere más. Anuncia tus límites reales (cupos semanales de atención, inventario de lote único, horas de agenda).",
    bookReference: "Alex Hormozi: «La mejor estrategia para la escasez es la realidad. Si no puedes atender a más de 5 clientes nuevos por semana, dígalo. Da escasez ética.»",
    defaultDetailPlaceholder: "Ej. Solo puedo atender a 9 clientes y ya tengo 5, quedan 4 cupos disponibles",
    presets: [
      {
        label: "Capacidad de clientes (Hormozi)",
        accion: "compra",
        detalle: "Solo puedo atender a 9 clientes y ya tengo 5, las plazas de atención se llenan",
        textoCompleto: "Si no me compras ahora solo puedo atender a 9 clientes y ya tengo 5 clientes, así que ya lo sabes: las plazas de atención se llenan y conmigo vas a conseguir los resultados que quieres.",
      },
      {
        label: "Lote único no reimpreso",
        accion: "bio",
        detalle: "Solo fabricamos un lote único y nunca reimprimiremos este modelo",
        textoCompleto: "Solo imprimimos un lote de edición limitada y nunca reimprimiremos este diseño. Ve al enlace de mi perfil para asegurar el tuyo antes de que se agote para siempre.",
      },
      {
        label: "Horarios de agenda que se llenan",
        accion: "dm",
        detalle: "Solo abro 5 huecos de asesoría por semana",
        textoCompleto: "Solo puedo atender a 5 personas por semana para darles seguimiento personalizado. Escríbeme «CUPO» por DM si quieres que lo resolvamos pronto.",
      },
    ],
    promptGuidance: `CIERRE CON GATILLO DE ESCASEZ ÉTICA (Hormozi):
- El guion debe terminar comunicando un límite real e inamovible de capacidad, plazas o inventario.
- NO prometas stock infinito: haz sentir que la oportunidad es finita y que postergar la decisión significa quedarse fuera porque otros tomarán los cupos restantes.`,
  },
  {
    id: "urgencia",
    name: "Urgencia Temporal (Reloj / Fecha Límite)",
    shortLabel: "Urgencia",
    icon: "⏰",
    category: "urgencia",
    badge: "Tiempo Límite",
    explanation:
      "La urgencia ocurre cuando las personas tienen poco tiempo para actuar. Cuanto menos tiempo tienen, más rápido actúan. Descuentos o bonos que desaparecen a una hora fija.",
    bookReference: "Alex Hormozi: «Si acortas el tiempo que pueden actuar sobre tu CTA, logras que más personas actúen más rápido. Bonificaciones que expiran a medianoche.»",
    defaultDetailPlaceholder: "Ej. La promoción finaliza este domingo a medianoche, quedan pocas horas",
    presets: [
      {
        label: "Medianoche / Cuenta regresiva",
        accion: "compra",
        detalle: "La promoción finaliza este domingo a medianoche, quedan pocas horas",
        textoCompleto: "Nuestra promoción especial finaliza este domingo a medianoche. Quedan solo unas horas: entra al enlace ahora y no te quedes fuera.",
      },
      {
        label: "Bono exclusivo que desaparece",
        accion: "comentar",
        detalle: "El regalo extra desaparece en las próximas 4 horas",
        textoCompleto: "Si comentas «AHORA» antes de que termine el día, te incluyo el bono adicional gratis. En 4 horas esta bonificación desaparece para siempre.",
      },
      {
        label: "Subida de precio inminente",
        accion: "bio",
        detalle: "El precio promocional sube mañana a las 12:00",
        textoCompleto: "Este precio de lanzamiento solo está activo hasta mañana al mediodía. Haz clic en el enlace de la bio antes de que suba a su precio regular.",
      },
    ],
    promptGuidance: `CIERRE CON GATILLO DE URGENCIA TEMPORAL (Hormozi):
- El llamado a la acción debe poner el reloj a correr.
- Enfatiza el plazo perentorio: una fecha, hora o evento inminente tras el cual la oferta o ventaja se pierde irrevocablemente.`,
  },
  {
    id: "motivo_fraternidad",
    name: "Motivo / Razón ('Planificador de fiesta de fraternidad' / Razón Porque)",
    shortLabel: "Motivo / Razón",
    icon: "🎉",
    category: "motivo",
    badge: "El 'Porque...'",
    explanation:
      "El experimento de Harvard demostró que las personas aceptan y actúan mucho más si se les da una razón después de la palabra 'porque...'. Incluso una razón inventada o de celebración funciona.",
    bookReference: "Alex Hormozi: «Las fraternidades inventan razones para festejar: '¡Martes de toga!', '¡A John le sacaron la muela!'. Da una razón después del porque.»",
    defaultDetailPlaceholder: "Ej. Porque cumplimos nuestro 3er aniversario y quiero celebrarlo premiando a quienes toman acción",
    presets: [
      {
        label: "Celebración / Aniversario",
        accion: "comentar",
        detalle: "Porque es mi cumpleaños / aniversario y quiero celebrarlo con mi comunidad",
        textoCompleto: "Porque es nuestra semana de aniversario y quiero celebrarlo contigo, comenta la palabra «CELEBRAR» y te enviaré un acceso exclusivo de regalo.",
      },
      {
        label: "Hito / Lanzamiento",
        accion: "dm",
        detalle: "Porque acabamos de lanzar la versión 2.0 y quiero casos de éxito reales",
        textoCompleto: "Porque acabamos de abrir la nueva versión y buscamos a los primeros casos de éxito para acompañarlos paso a paso, mándame un DM con la palabra «LANZAMIENTO».",
      },
      {
        label: "Causa o convicción",
        accion: "seguir",
        detalle: "Porque nadie más en este mercado se atreve a decirte la verdad sin rodeos",
        textoCompleto: "Porque estás harto de perder el tiempo con métodos que no sirven y alguien tenía que decirte la verdad, sígueme para no perderte la parte dos mañana.",
      },
    ],
    promptGuidance: `CIERRE CON GATILLO DE MOTIVO / RAZÓN ("Fraternidad" - Hormozi):
- El guion debe justificar la petición con un "PORQUE..." rotundo.
- La razón puede ser de celebración, de aniversario, de desafío o de causa común, pero debe darle al espectador el motivo psicológico para justificar su acción.`,
  },
  {
    id: "incentivo_regalo",
    name: "Incentivo / Recompensa Inmediata (Lead Magnet / Soborno Ético)",
    shortLabel: "Incentivo / Regalo",
    icon: "🎁",
    category: "incentivo",
    badge: "Lead Magnet",
    explanation:
      "Conecta la acción inmediata con una recompensa concreta y valiosa. Da algo deseable a cambio de un comentario, un follow o un clic.",
    bookReference: "«Si me sigues ahora te voy a regalar a los primeros 10 una guía de cómo hacer más dinero.» El intercambio de valor instantáneo es el motor de conversión en redes.",
    defaultDetailPlaceholder: "Ej. Te regalo a los primeros 10 una guía paso a paso de cómo hacer más dinero",
    presets: [
      {
        label: "Guía a los primeros 10 (Usuario)",
        accion: "seguir",
        detalle: "Te regalo a los primeros 10 una guía de cómo hacer más dinero",
        textoCompleto: "Si me sigues ahora mismo, le voy a regalar a los primeros 10 una guía completa de cómo hacer más dinero paso a paso. Sígueme y déjame tu comentario.",
      },
      {
        label: "Plantilla / Checklist por palabra clave",
        accion: "comentar",
        detalle: "La plantilla exacta de Notion que uso para gestionar todo el flujo",
        textoCompleto: "Comenta la palabra «PLANTILLA» aquí abajo y mi automatización te mandará el enlace directo a tu DM en menos de 30 segundos.",
      },
      {
        label: "Auditoría o diagnóstico rápido",
        accion: "dm",
        detalle: "Una revisión personalizada de tus primeros 3 videos",
        textoCompleto: "Escríbeme por DM la palabra «REVISIÓN» y te devolveré una nota de voz con los 3 puntos exactos que debes corregir en tu cuenta esta semana.",
      },
    ],
    promptGuidance: `CIERRE CON GATILLO DE INCENTIVO / REGALO (Lead Magnet):
- El guion debe prometer un intercambio de valor claro y sin fricción: acción del usuario -> recompensa inmediata (guía, plantilla, acceso, revisión).
- La recompensa debe sonar altamente deseable, concreta y fácil de consumir.`,
  },
  {
    id: "impacto_visual",
    name: "Impacto Visual en el CTA (Demostración Física / Prueba en Pantalla)",
    shortLabel: "Impacto Visual",
    icon: "👁️",
    category: "impacto",
    badge: "Prueba en Pantalla",
    explanation:
      "No te limites a decir las palabras: muestra físicamente en pantalla el producto terminado, la guía en una tablet, el antes/después o el empaque justo al pedir la acción.",
    bookReference: "Demostración física en video: ver el resultado en pantalla multiplica la confianza y reduce el escepticismo de la audiencia.",
    defaultDetailPlaceholder: "Ej. Mostrando en cámara el resultado final o el documento físico en la mano",
    presets: [
      {
        label: "Mostrar el documento en tablet / mano",
        accion: "comentar",
        detalle: "Sosteniendo la tablet con la guía abierta en pantalla",
        textoCompleto: "Mira esto que tengo aquí en pantalla. Si quieres que te lo mande gratis, comenta la palabra «GUIA» y te lo entrego de inmediato.",
      },
      {
        label: "Resultado antes vs después tangible",
        accion: "bio",
        detalle: "Mostrando el contraste del producto terminado en cámara",
        textoCompleto: "Esto es lo que consigues cuando dejas de improvisar. Si quieres el mismo resultado, haz clic en el enlace de mi perfil y empecemos hoy.",
      },
      {
        label: "Empaque / Unboxing en el cierre",
        accion: "compra",
        detalle: "Cerrando la caja o mostrando el producto listo para envío",
        textoCompleto: "Así es como llega a tu puerta. Toca el botón aquí abajo antes de que se termine el lote de esta semana.",
      },
    ],
    promptGuidance: `CIERRE CON IMPACTO VISUAL EN EL CTA:
- En la última escena, las indicaciones de 'shot', 'action', 'props' y 'onScreenText' DEBEN incluir la interacción visual con el objeto o resultado (mostrar la pantalla, sostener el documento, exhibir el empaque).
- El texto del CTA debe sincronizarse con lo que el actor está mostrando en cámara.`,
  },
  {
    id: "directo",
    name: "Directo / Sin Filtro (Llamado Claro a la Acción)",
    shortLabel: "Directo",
    icon: "🚀",
    category: "directo",
    badge: "Clásico",
    explanation:
      "Llamado a la acción claro, conciso y sin florituras hacia el canal principal de la marca.",
    bookReference: "Claridad por encima de astucia. Una instrucción directa cuando la intención de compra ya está caliente.",
    defaultDetailPlaceholder: "Ej. Visita nuestro sitio web o escríbenos directamente",
    presets: [
      {
        label: "Enlace en Bio",
        accion: "bio",
        detalle: "Ir al enlace del perfil",
        textoCompleto: "Todo lo que necesitas está en el enlace de mi perfil. Haz clic ahora para conocer todos los detalles.",
      },
      {
        label: "Mensaje Directo (DM)",
        accion: "dm",
        detalle: "Escribir al DM para atención personalizada",
        textoCompleto: "Escríbeme por mensaje directo con la palabra «INFO» y mi equipo te responderá personalmente.",
      },
      {
        label: "Seguir para más contenido",
        accion: "seguir",
        detalle: "Seguir la cuenta para no perderse la serie",
        textoCompleto: "Si te sirvió este consejo, dale a seguir para aprender más trucos como este todos los días.",
      },
    ],
    promptGuidance: `CIERRE DIRECTO Y CLARO:
- Instrucción limpia, concisa y sin rodeos hacia el canal designado de la marca.`,
  },
];

/* ----------------------------------------------------------------- ACCIONES -- */

export type CtaActionType = {
  id: string;
  label: string;
  icon: string;
  verbo: string;
};

export const CTA_ACTIONS: CtaActionType[] = [
  { id: "comentar", label: "Comentar palabra clave", icon: "💬", verbo: "Comenta" },
  { id: "seguir", label: "Seguir cuenta", icon: "👤", verbo: "Sígueme" },
  { id: "bio", label: "Enlace en Bio / Perfil", icon: "🔗", verbo: "Ve al enlace de mi perfil" },
  { id: "dm", label: "Mensaje Directo (DM)", icon: "📩", verbo: "Escríbeme al DM" },
  { id: "compra", label: "Comprar / Reservar cupo", icon: "🛒", verbo: "Separa tu cupo" },
];

/**
 * Función que ensambla inteligentemente un texto de CTA a partir del gatillo, la acción y el detalle.
 */
export function armarCtaTexto(
  gatilloId: string,
  accionId: string,
  detalle?: string
): string {
  const det = (detalle ?? "").trim();
  const accion = CTA_ACTIONS.find((a) => a.id === accionId) ?? CTA_ACTIONS[0];
  const gatillo = CTA_TRIGGERS.find((g) => g.id === gatilloId) ?? CTA_TRIGGERS[0];

  if (!det) {
    const preset = gatillo.presets.find((p) => p.accion === accionId) ?? gatillo.presets[0];
    return preset.textoCompleto;
  }

  switch (gatillo.category) {
    case "escasez":
      if (accion.id === "seguir") {
        return `Sígueme ahora mismo: ${det}. ¡No te quedes sin tu espacio!`;
      }
      if (accion.id === "comentar") {
        return `${det}. Comenta «QUIERO» aquí abajo antes de que se cierren las plazas.`;
      }
      if (accion.id === "bio") {
        return `${det}. Ve al enlace de mi perfil para asegurar tu lugar antes de que se agoten.`;
      }
      if (accion.id === "dm") {
        return `${det}. Mándame un mensaje directo con la palabra «CUPO» para ver si aún alcanzas.`;
      }
      return `Si no tomas acción ahora: ${det}. Las plazas se llenan, así que asegura la tuya hoy mismo.`;

    case "urgencia":
      if (accion.id === "comentar") {
        return `Atento porque ${det}. Comenta «AHORA» para aprovecharlo antes de que expire.`;
      }
      if (accion.id === "bio") {
        return `${det}. Haz clic en el enlace de mi perfil de inmediato antes de que el reloj llegue a cero.`;
      }
      if (accion.id === "dm") {
        return `${det}. Escríbeme por DM antes de medianoche para no perder la oportunidad.`;
      }
      if (accion.id === "seguir") {
        return `${det}. Sígueme ahora mismo para avisarte antes de que termine.`;
      }
      return `Aprovecha hoy porque ${det}. Haz clic en el enlace ahora.`;

    case "motivo":
      if (accion.id === "comentar") {
        return `${det}, comenta la palabra clave y te paso todos los detalles.`;
      }
      if (accion.id === "seguir") {
        return `${det}, sígueme y acompáñame en este camino.`;
      }
      if (accion.id === "bio") {
        return `${det}. Ve al enlace de mi biografía y mira de qué se trata.`;
      }
      return `${det}. Escríbeme o entra al enlace para formar parte de esto.`;

    case "incentivo":
      if (accion.id === "seguir") {
        return `Si me sigues ahora: ${det}. ¡Sígueme y te lo envío de inmediato!`;
      }
      if (accion.id === "comentar") {
        return `Comenta aquí abajo si quieres que te entregue esto: ${det}. ¡Te lo mando al DM!`;
      }
      if (accion.id === "dm") {
        return `Mándame un DM con la palabra «REGALO» y te compartiré: ${det}.`;
      }
      if (accion.id === "bio") {
        return `Ve al enlace en mi perfil para descargar gratis: ${det}.`;
      }
      return `Para conseguir ${det}, toma acción hoy mismo en el enlace de mi perfil.`;

    case "impacto":
      if (accion.id === "comentar") {
        return `Mira esto en pantalla. Si quieres lograr exactamente este resultado (${det}), comenta «LO QUIERO».`;
      }
      if (accion.id === "bio") {
        return `Esto que ves aquí es real (${det}). Toca el enlace de mi perfil para conseguirlo.`;
      }
      return `Mira la diferencia en pantalla: ${det}. Haz clic en el enlace y compruébalo tú mismo.`;

    default:
      return `${accion.verbo} para más información: ${det}`;
  }
}
