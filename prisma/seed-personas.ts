/**
 * Las personas del equipo que salen en cámara, con su informe de branding.
 *
 * Cada una viene de su PDF de marca personal. Lo que hay aquí es lo que se le
 * inyecta a la IA para que un guion suene a ESA persona y no a cualquiera:
 * su tono, su vocabulario, lo que evita decir y la estructura de su mensaje.
 *
 * Para añadir a alguien nuevo: copia un bloque, rellénalo desde su informe y
 * corre `npm run db:personas`.
 */

export type PaletaColor = { name: string; hex: string };

export type SeedPersona = {
  slug: string;
  name: string;
  color: string;
  ageRange?: string;
  energyLevel: number;
  summary: string;

  // Cómo actúa
  personality: string;
  strengths: string[];
  avoid: string[];
  toneKeywords: string[];
  brandingNotes?: string;

  // Informe de branding
  archetypePrimary: string;
  archetypeSecondary?: string;
  archetypeTertiary?: string;
  archetypeSummary: string;
  coreDesire: string;
  coreFear: string;
  coreTalent?: string;
  coreTrap: string;
  evolveToward?: string;
  watchOut?: string;
  coherenceIndex?: number;

  // Comunicación
  voiceTone: string;
  messageStructure: string;
  vocabulary: string[];
  avoidInVoice: string[];
  soundsLike: string;
  /** Iconos que trae su propio informe de branding. */
  sameArchetypeIcons: string[];
  /**
   * Los referentes que ELIGE el equipo: gente cuyo tono de comunicación
   * queremos que suene parecido. Es distinto de sameArchetypeIcons, que lo
   * dicta el informe. Una línea por referente, con nota si hace falta.
   */
  toneReferences: string[];
  signatureGesture?: string;

  // Visual
  palette: PaletaColor[];
  typography?: string;
  aesthetics?: string;
  visualAvoid?: string;

  /**
   * Con qué formatos hace match, por slug de estructura.
   * 3 = encaja perfecto, 2 = sirve, 1 = flojo, 0 = no encaja.
   *
   * Es un punto de partida deducido de su arquetipo, no una verdad: en cuanto
   * tengas números reales, corrígelo desde Personas → Compatibilidad.
   */
  fits: Record<string, { score: number; notes?: string }>;
};

export const SEED_PERSONAS: SeedPersona[] = [
  {
    slug: "eru",
    name: "Eru",
    color: "#2E7D46",
    ageRange: "Sin definir",
    energyLevel: 2,
    summary:
      "El estándar. Habla poco y con peso, y lo que dice no se discute. Autoridad tranquila, sin levantar la voz.",

    personality:
      "Sobrio y seguro. No compite ni se compara: define la referencia y deja que el trabajo hable. Su credibilidad viene de cumplir siempre, no de convencer.",
    strengths: [
      "Sostener autoridad sin levantar la voz",
      "Explicar por qué algo está bien hecho",
      "Cerrar un video con una afirmación que no admite réplica",
      "Hablar de calidad, garantía y compromiso sin sonar a folleto",
    ],
    avoid: [
      "Comedia física y ridículo",
      "Memes y humor de plataforma",
      "Tono suplicante o de descuento agresivo",
      "Hacer de personaje exagerado",
    ],
    toneKeywords: ["sobrio", "afirmativo", "con criterio", "de referencia"],
    brandingNotes:
      "Ojo con una incoherencia que marca su propio informe: se presenta como Gobernante pero sus decisiones de comunicación y de imagen apuntan al Creador. En cámara conviene apoyarse en lo primero y no dejarle improvisar registros que no sostiene.",

    archetypePrimary: "El Gobernante",
    archetypeSecondary: "El Forajido",
    archetypeTertiary: "El Héroe",
    archetypeSummary:
      "Representa el estándar: se compra por seguridad, por estatus y porque nadie duda de que va a cumplir. Su autoridad se sostiene en la excelencia y la responsabilidad, y se pierde si se vuelve arrogante, cerrado o incapaz de reconocer un fallo.",
    coreDesire: "Control: crear una comunidad o sistema próspero y ordenado.",
    coreFear: "El caos, ser derrocado y perder el control de lo que ha construido.",
    coreTalent:
      "Liderazgo, criterio, capacidad de organizar y de asumir la responsabilidad final.",
    coreTrap:
      "El autoritarismo y la rigidez: controlar por miedo, aplastar la disidencia y confundir orden con obediencia.",
    evolveToward:
      "Pasar del control al servicio: gobernar para que el sistema prospere sin depender de uno mismo.",
    watchOut:
      "Su centro de gravedad está en «Maestría / Riesgo» aunque su arquetipo primario sea de «Estabilidad / Control». Se presenta como una cosa y se mueve por otra.",
    coherenceIndex: 9.4,

    voiceTone:
      "Sobrio, seguro, afirmativo. Habla poco y con peso. Establece criterios en lugar de opinar. No compite: define la referencia.",
    messageStructure:
      "Definir el estándar del sector → demostrar que lo cumple desde hace tiempo → asumir la responsabilidad que conlleva → invitar a quien quiera lo mejor, sin rebajarse a comparar.",
    vocabulary: [
      "referencia",
      "estándar",
      "excelencia",
      "responsabilidad",
      "legado",
      "criterio",
      "liderar",
      "garantía",
      "rigor",
      "definir",
      "primer nivel",
      "confianza",
      "duradero",
      "compromiso",
    ],
    avoidInVoice: [
      "La informalidad excesiva",
      "Los memes",
      "El descuento agresivo",
      "El victimismo y el tono suplicante",
      "Prometer más de lo que se puede garantizar",
    ],
    soundsLike: "El estándar no se discute. Se sostiene.",
    sameArchetypeIcons: [
      "Isabel II",
      "Nelson Mandela",
      "Angela Merkel",
      "Rolex",
      "Mercedes-Benz",
    ],
    toneReferences: [
      "Fer Miralles",
      "Visionario",
      "Better Call Saul",
      "Adrià Solà Pastor",
      "Conchudo",
      "Fuck boing 747 no es, sí es friki",
      "Rick",
    ],
    signatureGesture:
      "Mirar por encima de la montura antes de hablar: evalúa primero y sentencia después.",

    palette: [
      { name: "Verde", hex: "#2E7D46" },
      { name: "Azul medianoche", hex: "#12212E" },
      { name: "Dorado sobrio", hex: "#B99A5B" },
      { name: "Granate", hex: "#8E1B2C" },
      { name: "Piedra clara", hex: "#EAE7E1" },
    ],
    typography: "Titulares: Marcellus, Cormorant Garamond. Texto: Jost.",
    aesthetics:
      "Simetría, márgenes generosos, jerarquías claras, materiales nobles. Texturas de mármol, cuero fino, lino grueso, madera noble y metal cepillado. Luz cuidada, encuadre estable, nada improvisado.",
    visualAvoid:
      "Desorden, tipografías informales, color chillón, collage, urgencia comercial y todo lo que sugiera improvisación.",

    fits: {
      "historia-de-fundador": { score: 3, notes: "Es el formato que mejor sostiene su autoridad." },
      "explicando-beneficios": { score: 3, notes: "Explicar por qué algo está bien hecho es su terreno." },
      "voz-en-off": { score: 3 },
      "vlog-de-marca": { score: 2 },
      "respondiendo-comentarios": { score: 2, notes: "Bien si responde asumiendo responsabilidad, no defendiéndose." },
      "venta-directa": { score: 2 },
      "como-se-usa": { score: 2 },
      "antes-y-despues": { score: 2 },
      pas: { score: 2, notes: "La agitación tiene que ser sobria: si dramatiza, pierde." },
      "ellos-vs-nosotros": { score: 1, notes: "Su marca es no compararse. Compararse le rebaja." },
      "oferta-directa": { score: 1, notes: "El descuento agresivo está en su lista de lo que no dice." },
      testimonio: { score: 1, notes: "No es cliente: suena falso." },
      ugc: { score: 1 },
      unboxing: { score: 1 },
      "giro-emocional-plot-twist": { score: 1 },
      pov: { score: 1 },
      vlog: { score: 1 },
      camaleon: { score: 0, notes: "Hacer de personaje rompe su autoridad." },
      sketch: { score: 0 },
      "meme-anuncio-divertido": { score: 0 },
      "camara-escondida": { score: 0 },
    },
  },

  {
    slug: "yoryo",
    name: "Yoryo",
    color: "#FFC300",
    ageRange: "Sin definir",
    energyLevel: 5,
    summary:
      "El que da permiso para no tomarse la vida en serio. Se ríe de sí mismo antes que de nadie y rompe el cuarto muro sin pedir perdón.",

    personality:
      "Desenfadado, rápido, algo gamberro. Tiene el ingenio para decir en voz alta lo que los demás piensan y no dicen. Su gracia está en que el humor tenga algo detrás, no en el chiste por el chiste.",
    strengths: [
      "Sketches y personajes exagerados",
      "Romper el cuarto muro y hablarle a cámara como a un amigo",
      "Convertir una verdad incómoda en un chiste que se comparte",
      "Memes y formatos de humor de la plataforma",
      "Golpes visuales que detienen el scroll",
    ],
    avoid: [
      "Tono solemne o épico",
      "Explicar precios y condiciones con seriedad",
      "Testimonios emotivos",
      "Cualquier registro aspiracional",
    ],
    toneKeywords: ["gamberro", "rápido", "cómplice", "sin postureo"],
    brandingNotes:
      "Su informe avisa de una incoherencia: se presenta como Bufón pero sus decisiones visuales apuntan al Gobernante. Si se le graba con estética pulcra y luz de estudio, el humor se cae. Necesita desorden en cuadro.",

    archetypePrimary: "El Bufón",
    archetypeSecondary: "El Forajido",
    archetypeTertiary: "El Mago",
    archetypeSummary:
      "Da permiso para no tomarse la vida tan en serio, y eso genera un cariño que el dinero no compra. Funciona cuando el humor es inteligente y tiene algo detrás; fracasa cuando se vuelve chiste vacío o cuando se ríe de la gente en lugar de reírse con ella.",
    coreDesire: "Vivir el momento y disfrutarlo a fondo.",
    coreFear: "Aburrir, aburrirse y ser un plomo del que nadie quiere estar cerca.",
    coreTalent:
      "Alegría, ingenio y la libertad de decir verdades que nadie más se atreve a decir.",
    coreTrap:
      "La frivolidad y la crueldad: usar el humor para no comprometerse con nada o para hacer daño gratis.",
    evolveToward:
      "Pasar de la broma por la broma al humor con verdad: hacer reír y, de paso, señalar lo que nadie quiere mirar.",
    watchOut:
      "Su centro de gravedad pesa hacia «Maestría / Riesgo» aunque su arquetipo sea de «Pertenencia / Conexión», y sus decisiones visuales tiran al Gobernante. El humor y la imagen no se están hablando.",
    coherenceIndex: 9.2,

    voiceTone:
      "Desenfadado, rápido, ingenioso, algo gamberro. Se ríe de sí mismo antes que de nadie. Rompe el cuarto muro sin pedir perdón.",
    messageStructure:
      "Verdad incómoda o tópico absurdo → giro cómico inesperado → guiño cómplice al que lo pilla → producto colado con naturalidad, nunca solemne.",
    vocabulary: [
      "venga",
      "en serio",
      "ridículo",
      "juego",
      "risa",
      "sin postureo",
      "spoiler",
      "qué locura",
      "no pasa nada",
      "disfrutar",
      "ligero",
      "gamberrada",
      "ups",
      "hoy toca",
    ],
    avoidInVoice: [
      "La solemnidad",
      "El tono épico",
      "Los eslóganes grandilocuentes",
      "El humor a costa de los vulnerables",
      "Explicar el chiste",
    ],
    soundsLike: "Llevamos años haciendo el ridículo. Ya casi nos sale bien.",
    sameArchetypeIcons: [
      "Charlie Chaplin",
      "Robin Williams",
      "Jim Carrey",
      "Old Spice",
      "Ben & Jerry's",
    ],
    toneReferences: [
      "Freddy Vega",
      "Maluma",
      "Visionario",
      "IQ",
      "Libra — mi líder",
      "Benson XDDD",
    ],
    signatureGesture:
      "Mirar a cámara un segundo de más después del chiste, como pidiendo cómplice.",

    palette: [
      { name: "Azul", hex: "#1D4ED8" },
      { name: "Amarillo chillón", hex: "#FFC300" },
      { name: "Turquesa pop", hex: "#00A6A6" },
      { name: "Negro tinta", hex: "#1A1A1A" },
      { name: "Crema", hex: "#F5F0E6" },
    ],
    typography: "Titulares: Fraunces, Caveat. Texto: Poppins.",
    aesthetics:
      "Color saturado, composiciones desordenadas a propósito, tipografía rota o girada, memes, collage, elementos que se salen del marco. Texturas de confeti, recorte de revista, rotulador, sticker y pixelado irónico.",
    visualAvoid:
      "Minimalismo serio, negro sobre blanco elegante, fotografía de estudio impecable, tono aspiracional y cualquier cosa que parezca una junta de accionistas.",

    fits: {
      sketch: { score: 3, notes: "Su formato natural." },
      "meme-anuncio-divertido": { score: 3 },
      "camara-escondida": { score: 3 },
      camaleon: { score: 3, notes: "Cambiar de personaje es exactamente su don." },
      pov: { score: 3 },
      "giro-emocional-plot-twist": { score: 2, notes: "Sirve si el giro es cómico, no lacrimógeno." },
      "respondiendo-comentarios": { score: 2 },
      "ellos-vs-nosotros": { score: 2, notes: "Funciona como contraste ridículo, nunca como ataque." },
      "vlog-de-marca": { score: 2 },
      vlog: { score: 2 },
      ugc: { score: 2 },
      unboxing: { score: 2 },
      "como-se-usa": { score: 2 },
      pas: { score: 1, notes: "La agitación seria le queda mal: acaba haciendo chiste del dolor." },
      "venta-directa": { score: 1, notes: "Explicar precios en serio no es su registro." },
      "oferta-directa": { score: 1 },
      "explicando-beneficios": { score: 1 },
      "antes-y-despues": { score: 1 },
      "voz-en-off": { score: 1, notes: "Se pierde lo que le hace funcionar: la cara." },
      testimonio: { score: 0, notes: "El testimonio emotivo está en lo que no le queda." },
      "historia-de-fundador": { score: 0, notes: "El tono solemne le mata." },
    },
  },

  {
    slug: "ariana",
    name: "Ariana",
    color: "#B99A5B",
    ageRange: "Sin definir",
    energyLevel: 2,
    summary:
      "El estándar, pero con capacidad de prometer transformación. Autoridad tranquila que además sabe enseñar un antes y un después.",

    personality:
      "Sobria y segura, con criterio propio. Define la referencia en vez de compararse. Lo que la separa de un Gobernante puro es su lado Mago: puede sostener una promesa de cambio sin perder la calma.",
    strengths: [
      "Sostener autoridad sin levantar la voz",
      "Prometer una transformación y demostrar el mecanismo que la hace posible",
      "Explicar por qué algo está bien hecho, con criterio",
      "Hablar de garantía, compromiso y durabilidad sin sonar a folleto",
      "Cerrar con una afirmación que no admite réplica",
    ],
    avoid: [
      "Comedia física y ridículo",
      "Memes y humor de plataforma",
      "Tono suplicante o de descuento agresivo",
      "Improvisar registros informales",
    ],
    toneKeywords: ["sobrio", "afirmativo", "con criterio", "de referencia"],
    brandingNotes:
      "Su índice de definición es muy alto: solo 2 de 77 respuestas quedaron en el punto medio. Se moja, y eso la hace reconocible al instante; el riesgo es la caricatura. Índice de audacia 75/100: está dispuesta a exponerse de verdad, así que conviene tener decidida de antemano la línea roja.",

    archetypePrimary: "El Gobernante",
    archetypeSecondary: "El Mago",
    archetypeTertiary: "El Héroe",
    archetypeSummary:
      "Representa el estándar: se compra por seguridad, por estatus y porque nadie duda de que va a cumplir. Su autoridad se sostiene en la excelencia y la responsabilidad, y se pierde si se vuelve arrogante, cerrada o incapaz de reconocer un fallo.",
    coreDesire: "Control: crear una comunidad o sistema próspero y ordenado.",
    coreFear: "El caos, ser derrocada y perder el control de lo que ha construido.",
    coreTalent:
      "Liderazgo, criterio, capacidad de organizar y de asumir la responsabilidad final.",
    coreTrap:
      "El autoritarismo y la rigidez: controlar por miedo, aplastar la disidencia y confundir orden con obediencia.",
    evolveToward:
      "Pasar del control al servicio: gobernar para que el sistema prospere sin depender de una misma.",
    watchOut:
      "Doble aviso de su informe. Uno: su centro de gravedad pesa hacia «Maestría / Riesgo» aunque su arquetipo primario sea de «Estabilidad / Control». Dos: sus decisiones de acción apuntan a El Hombre Común, no a El Gobernante. Se presenta como una cosa y elige como otra.",
    coherenceIndex: 12.3,

    voiceTone:
      "Sobrio, seguro, afirmativo. Habla poco y con peso. Establece criterios en lugar de opinar. No compite: define la referencia.",
    messageStructure:
      "Definir el estándar del sector → demostrar que lo cumple desde hace tiempo → asumir la responsabilidad que conlleva → invitar a quien quiera lo mejor, sin rebajarse a comparar.",
    vocabulary: [
      "referencia",
      "estándar",
      "excelencia",
      "responsabilidad",
      "legado",
      "criterio",
      "liderar",
      "garantía",
      "rigor",
      "definir",
      "primer nivel",
      "confianza",
      "duradero",
      "compromiso",
    ],
    avoidInVoice: [
      "La informalidad excesiva",
      "Los memes",
      "El descuento agresivo",
      "El victimismo y el tono suplicante",
      "Prometer más de lo que se puede garantizar",
    ],
    soundsLike: "El estándar no se discute. Se sostiene.",
    sameArchetypeIcons: [
      "Isabel II",
      "Nelson Mandela",
      "Angela Merkel",
      "Rolex",
      "Mercedes-Benz",
      "American Express",
      "Rolls-Royce",
      "Microsoft",
    ],
    // Sin referentes de tono todavía: no está en el pizarrón. Se cargan desde
    // Personas → Marca personal cuando los tengáis decididos.
    toneReferences: [],

    palette: [
      { name: "Negro tinta", hex: "#111111" },
      { name: "Piedra clara", hex: "#EDEAE3" },
      { name: "Azul medianoche", hex: "#12212E" },
      { name: "Verde imperial", hex: "#1F3D2B" },
      { name: "Dorado sobrio", hex: "#B99A5B" },
    ],
    typography: "Titulares: Marcellus, Cormorant Garamond. Texto: Jost.",
    aesthetics:
      "Simetría, márgenes generosos, jerarquías claras, materiales nobles, fotografía de arquitectura y detalle de calidad, escudos y monogramas. Texturas de mármol, cuero fino, lino grueso, estampado en seco, madera noble y metal cepillado.",
    visualAvoid:
      "Desorden, tipografías informales, color chillón, collage, urgencia comercial y todo lo que sugiera improvisación.",

    fits: {
      "historia-de-fundador": { score: 3, notes: "Sostiene la autoridad y el origen sin esfuerzo." },
      "explicando-beneficios": { score: 3 },
      "antes-y-despues": { score: 3, notes: "Su lado Mago hace creíble la transformación; el Gobernante la respalda con el dato." },
      "voz-en-off": { score: 3 },
      unboxing: { score: 2, notes: "El Mago abre por fases, como un ritual. Nunca como sorpresa gritada." },
      "giro-emocional-plot-twist": { score: 2, notes: "El giro tiene que ser de revelación, no de comedia." },
      "vlog-de-marca": { score: 2 },
      "como-se-usa": { score: 2 },
      "venta-directa": { score: 2 },
      "respondiendo-comentarios": { score: 2, notes: "Bien si asume responsabilidad; mal si se defiende." },
      pas: { score: 2, notes: "La agitación tiene que ser sobria." },
      "ellos-vs-nosotros": { score: 1, notes: "Compararse le rebaja: su marca es no competir." },
      "oferta-directa": { score: 1, notes: "El descuento agresivo está en lo que no dice." },
      testimonio: { score: 1 },
      ugc: { score: 1 },
      pov: { score: 1 },
      vlog: { score: 1 },
      camaleon: { score: 1 },
      sketch: { score: 0, notes: "El ridículo rompe la autoridad." },
      "meme-anuncio-divertido": { score: 0 },
      "camara-escondida": { score: 0 },
    },
  },

  {
    slug: "kevin",
    name: "Kevin",
    color: "#7B4BC9",
    ageRange: "Sin definir",
    energyLevel: 3,
    summary:
      "El que promete transformación y enseña el mecanismo. Vende el después, no el producto — pero siempre demostrando cómo se llega.",

    personality:
      "Evocador y con criterio. Habla del antes y el después, usa metáforas, y las sostiene explicando el mecanismo real. Su lado Sabio es lo que le salva de sonar a vendehúmos.",
    strengths: [
      "Contar un antes y un después y hacerlo creíble",
      "Explicar el mecanismo que hay detrás de un resultado",
      "Enseñar algo y que se entienda a la primera",
      "Abrir un producto como un ritual, no como una caja",
      "Sostener una promesa grande sin exagerar el dato",
    ],
    avoid: [
      "Humor autoparódico y comedia física",
      "Listas de características técnicas",
      "Tono solemne o épico vacío",
      "Prometer transformaciones que no se pueden demostrar",
    ],
    toneKeywords: ["evocador", "misterioso", "con criterio", "transformador"],
    brandingNotes:
      "El punto delicado de Kevin: su índice de coherencia es 5.3, el más bajo del equipo. Su propio informe lo dice sin rodeos: no tiene un arquetipo dominante claro, y en branding eso no es neutralidad, es invisibilidad. En cámara conviene apoyarse fuerte en El Mago y no dejarle alternar registros dentro del mismo video. Índice de audacia 78.6/100: se expone de verdad.",

    archetypePrimary: "El Mago",
    archetypeSecondary: "El Sabio",
    archetypeTertiary: "El Héroe",
    archetypeSummary:
      "Promete transformación: la gente no compra el producto, compra en quién se convierte al usarlo. Es el arquetipo con más poder de fascinación y también el más frágil, porque si el cambio prometido no ocurre, la magia se lee como estafa.",
    coreDesire: "Comprender las leyes profundas de las cosas para poder transformarlas.",
    coreFear:
      "Que sus consecuencias sean negativas, o que la magia se revele como un truco vacío.",
    coreTrap:
      "La manipulación: usar el poder para embaucar, prometer transformaciones que no puede sostener.",
    watchOut:
      "Índice de coherencia 5.3, el más bajo del equipo. Su informe avisa: sin un arquetipo dominante claro no hay razón para recordarle. Escribe sus guiones desde El Mago y no mezcles registros dentro del mismo video.",
    coherenceIndex: 5.3,

    voiceTone:
      "Evocador, seguro, ligeramente misterioso. Habla del antes y el después. Usa metáforas, pero sostiene cada promesa con un mecanismo.",
    messageStructure:
      "El mundo tal y como lo conoces → la grieta que casi nadie ve → la visión de lo que puede ser → el mecanismo real que lo hace posible → invitación a cruzar.",
    vocabulary: [
      "transformar",
      "imagina",
      "posible",
      "revelar",
      "umbral",
      "visión",
      "convertir",
      "despertar",
      "catalizador",
      "otro nivel",
      "lo invisible",
      "ritual",
      "reinventar",
      "momento",
    ],
    avoidInVoice: [
      "La literalidad",
      "Las listas de características",
      "El lenguaje puramente técnico",
      "El humor autoparódico",
      "Prometer transformaciones que no puede demostrar",
    ],
    soundsLike: "Lo imposible solo lo es hasta que alguien cruza.",
    // Su informe no trae la sección de iconos del mismo arquetipo.
    sameArchetypeIcons: [],
    toneReferences: [
      "Alan García",
      "Fer Miralles vs Adrià Solà Pastor",
      "Maluma",
      "Isra Bravo",
      "Críticas constructivas — Show off",
    ],

    palette: [
      { name: "Púrpura profundo", hex: "#2E1A47" },
      { name: "Azul cosmos", hex: "#0B1026" },
      { name: "Violeta eléctrico", hex: "#7B4BC9" },
      { name: "Oro alquímico", hex: "#D4AF37" },
      { name: "Lavanda pálida", hex: "#EDE7F6" },
    ],
    typography: "Titulares: Syne, Cormorant Garamond. Texto: Inter.",
    aesthetics:
      "Fondos oscuros con luz emergente, degradados profundos, simetría ritual, partículas, reflejos, antes/después, transiciones y aparición gradual. Texturas de degradado, partículas, humo, cristal, aurora y geometría sagrada.",
    visualAvoid:
      "Fondos blancos planos, retículas rígidas, estética de manual técnico, colores primarios básicos, y explicarlo todo hasta matar el asombro.",

    fits: {
      "antes-y-despues": { score: 3, notes: "El formato es literalmente su arquetipo." },
      "giro-emocional-plot-twist": { score: 3, notes: "El umbral y la revelación son su terreno." },
      "como-se-usa": { score: 3, notes: "El Sabio enseñando el mecanismo." },
      "explicando-beneficios": { score: 3, notes: "Siempre que traduzca característica a transformación." },
      unboxing: { score: 3, notes: "Abrir por fases, como un ritual con umbral." },
      "voz-en-off": { score: 3 },
      pov: { score: 2 },
      camaleon: { score: 2 },
      "historia-de-fundador": { score: 2 },
      "vlog-de-marca": { score: 2 },
      "respondiendo-comentarios": { score: 2 },
      "ellos-vs-nosotros": { score: 2, notes: "Como antes/después del sector, no como ataque." },
      "venta-directa": { score: 2 },
      pas: { score: 2, notes: "La solución tiene que llevar mecanismo, no promesa suelta." },
      "camara-escondida": { score: 1 },
      testimonio: { score: 1 },
      ugc: { score: 1 },
      "oferta-directa": { score: 1, notes: "La urgencia comercial choca con el asombro." },
      vlog: { score: 1 },
      sketch: { score: 0, notes: "El humor autoparódico está en lo que evita." },
      "meme-anuncio-divertido": { score: 0 },
    },
  },
];
