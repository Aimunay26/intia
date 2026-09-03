/**
 * Cuatro plantillas para dar de alta a una persona sin empezar en blanco.
 *
 * No son perfiles genéricos de relleno: son los cuatro arquetipos que ya
 * están vivos en el equipo (Eru es Gobernante, Yoryo es Bufón, Kevin es Mago,
 * y el Sabio es el que falta y aparece de secundario en Kevin). Eliges el que
 * más se parezca y corriges: es mucho más rápido que rellenar treinta campos
 * mirando a una pantalla vacía, y evita el error clásico de dejar media ficha
 * sin poner, que es lo que hace que la IA escriba guiones que no suenan a nadie.
 *
 * Lo que se copia es un PUNTO DE PARTIDA. La persona real casi nunca encaja
 * entera en un arquetipo puro, así que el formulario deja todo editable y la
 * pantalla lo dice con esas palabras.
 */

export type PlantillaPersona = {
  id: string;
  etiqueta: string;
  /** Una línea para reconocerla de un vistazo en la lista. */
  gancho: string;
  /** Para quién es, en cristiano. */
  paraQuien: string;
  color: string;
  energyLevel: number;

  summary: string;
  personality: string;
  strengths: string[];
  avoid: string[];
  toneKeywords: string[];

  archetypePrimary: string;
  archetypeSecondary: string;
  archetypeSummary: string;
  coreDesire: string;
  coreFear: string;
  coreTalent: string;
  coreTrap: string;

  voiceTone: string;
  messageStructure: string;
  vocabulary: string[];
  avoidInVoice: string[];
  soundsLike: string;

  aesthetics: string;
  visualAvoid: string;
  palette: { name: string; hex: string }[];
};

export const PLANTILLAS_PERSONA: PlantillaPersona[] = [
  {
    id: "gobernante",
    etiqueta: "El Gobernante",
    gancho: "El estándar. Habla poco y con peso, y lo que dice no se discute.",
    paraQuien:
      "Quien da la cara por la calidad: el dueño, el que explica por qué algo está bien hecho, el que cierra con una afirmación.",
    color: "#2E7D46",
    energyLevel: 2,

    summary:
      "El estándar. Autoridad tranquila, sin levantar la voz. Define la referencia en vez de compararse.",
    personality:
      "Sobrio y seguro. No compite: deja que el trabajo hable. Su credibilidad viene de cumplir siempre, no de convencer.",
    strengths: [
      "Sostener autoridad sin levantar la voz",
      "Explicar por qué algo está bien hecho",
      "Hablar de garantía y compromiso sin sonar a folleto",
      "Cerrar con una afirmación que no admite réplica",
    ],
    avoid: [
      "Comedia física y ridículo",
      "Memes y humor de plataforma",
      "Tono suplicante o de descuento agresivo",
    ],
    toneKeywords: ["sobrio", "afirmativo", "con criterio", "de referencia"],

    archetypePrimary: "El Gobernante",
    archetypeSecondary: "El Héroe",
    archetypeSummary:
      "Representa el estándar: se compra por seguridad y porque nadie duda de que va a cumplir. Se pierde si se vuelve arrogante o incapaz de reconocer un fallo.",
    coreDesire: "Control: crear un sistema próspero y ordenado.",
    coreFear: "El caos y perder el control de lo que ha construido.",
    coreTalent: "Liderazgo, criterio y asumir la responsabilidad final.",
    coreTrap: "El autoritarismo: confundir orden con obediencia.",

    voiceTone:
      "Sobrio, seguro, afirmativo. Habla poco y con peso. Establece criterios en lugar de opinar.",
    messageStructure:
      "Definir el estándar del sector → demostrar que lo cumple desde hace tiempo → asumir la responsabilidad → invitar a quien quiera lo mejor, sin rebajarse a comparar.",
    vocabulary: ["referencia", "estándar", "criterio", "garantía", "rigor", "compromiso", "duradero"],
    avoidInVoice: ["La informalidad excesiva", "Los memes", "El descuento agresivo", "El victimismo"],
    soundsLike: "El estándar no se discute. Se sostiene.",

    aesthetics:
      "Simetría, márgenes generosos, jerarquías claras, materiales nobles. Luz cuidada y encuadre estable.",
    visualAvoid: "Desorden, color chillón, collage y todo lo que sugiera improvisación.",
    palette: [
      { name: "Verde", hex: "#2e7d46" },
      { name: "Azul medianoche", hex: "#12212e" },
      { name: "Dorado sobrio", hex: "#b99a5b" },
    ],
  },

  {
    id: "bufon",
    etiqueta: "El Bufón",
    gancho: "Da permiso para no tomarse la vida en serio. Se ríe de sí mismo primero.",
    paraQuien:
      "Quien hace los sketches, los memes y los formatos de humor. El que se juega el ridículo sin que le cueste.",
    color: "#FFC300",
    energyLevel: 5,

    summary:
      "El que rompe el cuarto muro sin pedir perdón. Su gracia está en que el humor tenga algo detrás.",
    personality:
      "Desenfadado, rápido, algo gamberro. Dice en voz alta lo que los demás piensan y callan.",
    strengths: [
      "Sketches y personajes exagerados",
      "Hablarle a cámara como a un amigo",
      "Convertir una verdad incómoda en un chiste que se comparte",
      "Golpes visuales que detienen el scroll",
    ],
    avoid: ["Tono solemne o épico", "Explicar precios con seriedad", "Testimonios emotivos"],
    toneKeywords: ["gamberro", "rápido", "cómplice", "sin postureo"],

    archetypePrimary: "El Bufón",
    archetypeSecondary: "El Forajido",
    archetypeSummary:
      "Da permiso para no tomarse la vida tan en serio, y eso genera un cariño que el dinero no compra. Fracasa cuando se ríe de la gente en lugar de reírse con ella.",
    coreDesire: "Vivir el momento y disfrutarlo a fondo.",
    coreFear: "Aburrir y ser un plomo del que nadie quiere estar cerca.",
    coreTalent: "Ingenio y la libertad de decir verdades que nadie más se atreve a decir.",
    coreTrap: "La frivolidad: usar el humor para no comprometerse con nada.",

    voiceTone:
      "Desenfadado, rápido, ingenioso, algo gamberro. Se ríe de sí mismo antes que de nadie.",
    messageStructure:
      "Verdad incómoda o tópico absurdo → giro cómico inesperado → guiño cómplice → producto colado con naturalidad, nunca solemne.",
    vocabulary: ["venga", "en serio", "ridículo", "sin postureo", "qué locura", "no pasa nada"],
    avoidInVoice: ["La solemnidad", "El tono épico", "Los eslóganes grandilocuentes", "Explicar el chiste"],
    soundsLike: "Llevamos años haciendo el ridículo. Ya casi nos sale bien.",

    aesthetics:
      "Color saturado, composiciones desordenadas a propósito, tipografía rota, memes y elementos que se salen del marco.",
    visualAvoid: "Minimalismo serio, fotografía de estudio impecable y todo lo aspiracional.",
    palette: [
      { name: "Amarillo chillón", hex: "#ffc300" },
      { name: "Azul", hex: "#1d4ed8" },
      { name: "Turquesa pop", hex: "#00a6a6" },
    ],
  },

  {
    id: "mago",
    etiqueta: "El Mago",
    gancho: "Promete transformación y enseña el mecanismo. Vende el después.",
    paraQuien:
      "Quien hace los antes y después, los tutoriales y los unboxing. El que explica cómo se llega al resultado.",
    color: "#7B4BC9",
    energyLevel: 3,

    summary:
      "Vende en quién te conviertes, no el producto. Sostiene la promesa enseñando cómo funciona.",
    personality:
      "Evocador y con criterio. Usa metáforas y las respalda con el mecanismo real. Eso le salva de sonar a vendehúmos.",
    strengths: [
      "Contar un antes y un después y hacerlo creíble",
      "Explicar el mecanismo detrás de un resultado",
      "Abrir un producto como un ritual, no como una caja",
      "Enseñar algo y que se entienda a la primera",
    ],
    avoid: ["Humor autoparódico", "Listas de características técnicas", "Tono épico vacío"],
    toneKeywords: ["evocador", "misterioso", "con criterio", "transformador"],

    archetypePrimary: "El Mago",
    archetypeSecondary: "El Sabio",
    archetypeSummary:
      "Promete transformación: la gente no compra el producto, compra en quién se convierte al usarlo. Es el más frágil: si el cambio no ocurre, la magia se lee como estafa.",
    coreDesire: "Comprender las leyes profundas de las cosas para transformarlas.",
    coreFear: "Que la magia se revele como un truco vacío.",
    coreTalent: "Ver la conexión que otros no ven y hacerla evidente.",
    coreTrap: "La manipulación: prometer transformaciones que no puede sostener.",

    voiceTone:
      "Evocador, seguro, ligeramente misterioso. Habla del antes y el después. Usa metáforas, pero sostiene cada promesa con un mecanismo.",
    messageStructure:
      "El mundo tal y como lo conoces → la grieta que casi nadie ve → la visión de lo que puede ser → el mecanismo real que lo hace posible → invitación a cruzar.",
    vocabulary: ["transformar", "imagina", "revelar", "umbral", "convertir", "otro nivel", "ritual"],
    avoidInVoice: [
      "La literalidad",
      "Las listas de características",
      "Prometer transformaciones que no puede demostrar",
    ],
    soundsLike: "Lo imposible solo lo es hasta que alguien cruza.",

    aesthetics:
      "Fondos oscuros con luz emergente, degradados profundos, antes/después, transiciones y aparición gradual.",
    visualAvoid: "Fondos blancos planos, estética de manual técnico y explicarlo todo hasta matar el asombro.",
    palette: [
      { name: "Violeta eléctrico", hex: "#7b4bc9" },
      { name: "Púrpura profundo", hex: "#2e1a47" },
      { name: "Oro alquímico", hex: "#d4af37" },
    ],
  },

  {
    id: "sabio",
    etiqueta: "El Sabio",
    gancho: "No vende producto: vende criterio. La gente acude para entender antes de decidir.",
    paraQuien:
      "Quien explica, compara y enseña. El de los tutoriales, los beneficios y el «ellos vs nosotros» hecho con datos.",
    color: "#0E7490",
    energyLevel: 2,

    summary:
      "La autoridad que se construye con rigor. Se destruye en cuanto exagera un dato o habla por encima de su público.",
    personality:
      "Claro y paciente. Desarma una idea complicada en piezas que se entienden. No presume de saber: hace que el otro entienda.",
    strengths: [
      "Explicar algo complicado en treinta segundos",
      "Comparar opciones sin atacar a nadie",
      "Desmontar una creencia falsa con un dato",
      "Tutoriales paso a paso",
    ],
    avoid: ["Comedia física", "Urgencia comercial", "Afirmar sin poder respaldarlo"],
    toneKeywords: ["claro", "riguroso", "paciente", "didáctico"],

    archetypePrimary: "El Sabio",
    archetypeSecondary: "El Gobernante",
    archetypeSummary:
      "No vende un producto, vende criterio: la gente acude para entender antes de decidir. Su autoridad se construye con honestidad intelectual.",
    coreDesire: "Entender el mundo y compartir lo que ha entendido.",
    coreFear: "Ser engañado, o engañar sin darse cuenta.",
    coreTalent: "Hacer simple lo complicado sin volverlo falso.",
    coreTrap: "La condescendencia: hablarle a la gente desde arriba.",

    voiceTone:
      "Claro, tranquilo, sin adornos. Explica antes de recomendar. Reconoce lo que no sabe en vez de rellenar.",
    messageStructure:
      "La creencia común → por qué no se sostiene → lo que dice el dato → qué significa para ti → qué harías con eso.",
    vocabulary: ["en realidad", "el dato", "depende de", "la diferencia está", "conviene", "entender"],
    avoidInVoice: ["Exagerar una cifra", "El lenguaje de vendedor", "Hablar por encima del público"],
    soundsLike: "No te lo creas porque lo digo yo. Míralo.",

    aesthetics:
      "Limpio y ordenado, mucho aire, gráficos legibles, texto en pantalla que se lee sin sonido.",
    visualAvoid: "Ruido visual, cortes frenéticos y todo lo que estorbe a la explicación.",
    palette: [
      { name: "Azul petróleo", hex: "#0e7490" },
      { name: "Gris pizarra", hex: "#334155" },
      { name: "Arena", hex: "#e7e5e4" },
    ],
  },
];

export const PLANTILLA_POR_ID = Object.fromEntries(
  PLANTILLAS_PERSONA.map((p) => [p.id, p])
) as Record<string, PlantillaPersona>;
