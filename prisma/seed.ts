/**
 * Datos iniciales.
 *
 * Se puede correr varias veces sin duplicar nada (usa upsert por slug/email).
 *   npm run db:seed
 *
 * NO crea ninguna cuenta de administrador: la primera vez que entres a la app
 * te pedirá crear la tuya. Sí crea el resto del equipo, con contraseñas
 * aleatorias que se imprimen al final de este script.
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

import { SEED_STRUCTURES } from "./seed-structures";

const prisma = new PrismaClient();

const J = (v: unknown) => JSON.stringify(v);

function randomPassword() {
  return randomBytes(6).toString("base64url");
}

function daysFromToday(offset: number, hour = 12) {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
}

/* ========================================================== ARQUETIPOS === */

const ARCHETYPES = [
  {
    slug: "presentador-complice",
    name: "Presentador Cómplice",
    color: "#ec4899",
    ageRange: "22 a 32",
    energyLevel: 4,
    summary:
      "Habla a cámara como si le contara un secreto a su mejor amiga. Rápido, cálido y directo.",
    personality:
      "Extrovertido, seguro frente a cámara, buen ritmo hablando. Se le entiende todo aunque hable rápido. Improvisa bien y no se traba si algo sale mal.",
    strengths: [
      "Hablar directo a cámara sin sonar a locutor",
      "Sostener un monólogo de 40 segundos sin perder energía",
      "Mostrar productos con las manos mientras habla",
      "Tono cómplice de 'te voy a contar algo'",
    ],
    avoid: [
      "Escenas dramáticas o de llanto",
      "Personajes callados o contemplativos",
      "Humor absurdo muy físico",
    ],
    toneKeywords: ["cómplice", "cercano", "rápido", "entusiasta"],
    brandingNotes:
      "Funciona mejor sin maquillaje de estudio y con ropa de calle. Si se ve demasiado producido, pierde la credibilidad que lo hace vender.",
  },
  {
    slug: "pareja-real",
    name: "Pareja Real",
    color: "#f43f5e",
    ageRange: "24 a 38",
    energyLevel: 3,
    summary:
      "Dos personas con química real. Su valor está en las miradas y las reacciones, no en el texto.",
    personality:
      "Se ríen de verdad, se interrumpen, se miran. La complicidad no se puede actuar: o está o no está.",
    strengths: [
      "Escenas de conflicto cotidiano que terminan bien",
      "Reacciones emocionales genuinas",
      "Sketches domésticos de casa",
      "Mostrar productos en pareja o a juego",
    ],
    avoid: [
      "Monólogos largos a cámara",
      "Explicar características técnicas",
      "Escenas donde uno tiene que quedar mal de verdad",
    ],
    toneKeywords: ["tierno", "cotidiano", "cómplice", "real"],
    brandingNotes:
      "Grabar en su casa real, no en set. La imperfección del fondo es parte de por qué funciona.",
  },
  {
    slug: "fundador-cercano",
    name: "Fundador Cercano",
    color: "#0ea5e9",
    ageRange: "28 a 50",
    energyLevel: 2,
    summary:
      "La persona dueña del negocio. Su credibilidad viene de contar la verdad, incluso lo que no salió bien.",
    personality:
      "Tranquilo, reflexivo, habla más lento. No es actor y no debe intentar serlo: su fuerza es que se nota que no está actuando.",
    strengths: [
      "Contar el origen y el porqué del negocio",
      "Responder críticas de frente",
      "Explicar el proceso de producción",
      "Transmitir confianza en tono íntimo",
    ],
    avoid: [
      "Comedia y sketches",
      "Bailes y tendencias",
      "Ritmo rápido con muchos cortes",
      "Actuar un personaje que no es",
    ],
    toneKeywords: ["honesto", "reposado", "cercano", "sin filtro"],
    brandingNotes:
      "Plano medio corto, luz suave, sonido limpio. Nunca poner música épica encima: la mata.",
  },
  {
    slug: "comico-fisico",
    name: "Cómico Físico",
    color: "#f59e0b",
    ageRange: "20 a 35",
    energyLevel: 5,
    summary:
      "Se juega el ridículo sin miedo. Exagera gestos y caras, y eso es exactamente lo que se comparte.",
    personality:
      "Explosivo, sin vergüenza, con timing cómico natural. Aguanta muchas tomas repitiendo la misma caída.",
    strengths: [
      "Sketches y personajes exagerados",
      "Comedia física y caídas",
      "Memes y formatos de humor de la plataforma",
      "Golpes visuales que detienen el scroll",
    ],
    avoid: [
      "Testimonios serios",
      "Explicar precios y condiciones",
      "Escenas emotivas de ternura",
    ],
    toneKeywords: ["exagerado", "absurdo", "rápido", "divertido"],
    brandingNotes:
      "Nunca ponerlo a vender de frente: el público que lo sigue por el humor se va cuando cambia el registro.",
  },
  {
    slug: "cliente-honesto",
    name: "Cliente Honesto",
    color: "#10b981",
    ageRange: "20 a 45",
    energyLevel: 3,
    summary:
      "Habla como quien acaba de comprar y quiere contarlo. Su credibilidad está en mencionar también lo que no le gustó.",
    personality:
      "Natural, no actúa, se traba a veces y eso suma. Cuenta las cosas como se las contaría a una amiga por audio de WhatsApp.",
    strengths: [
      "UGC grabado con el celular en la mano",
      "Testimonios con antes y después",
      "Responder objeciones desde su propia experiencia",
      "Unboxing con reacción real",
    ],
    avoid: [
      "Leer un guion palabra por palabra",
      "Lenguaje de marketing",
      "Escenas con producción evidente",
    ],
    toneKeywords: ["natural", "honesto", "espontáneo", "cotidiano"],
    brandingNotes:
      "Si se le nota que está leyendo, el formato se cae entero. Darle los puntos, no el texto.",
  },
  {
    slug: "voz-narradora",
    name: "Voz Narradora",
    color: "#8b5cf6",
    ageRange: "Cualquiera",
    energyLevel: 2,
    summary:
      "Solo voz. No aparece en cámara. Sostiene videos de producto donde no hay actor disponible.",
    personality:
      "Buena dicción, tono cálido, sabe darle ritmo a un texto. Graba de cerca, no en tono de radio.",
    strengths: [
      "Videos de producto con voz en off",
      "Narrar tutoriales y procesos",
      "Cerrar videos donde otros actúan",
      "Textos largos con mucha información",
    ],
    avoid: ["Cualquier cosa que requiera aparecer en cámara"],
    toneKeywords: ["cálido", "claro", "con ritmo"],
    brandingNotes:
      "Grabar de cerca y en una habitación con cosas blandas para que no rebote el sonido. Nunca tono de locución publicitaria.",
  },
];

/** Compatibilidad arquetipo -> estructura. 3 = encaja perfecto, 0 = no encaja. */
const FITS: Record<string, Record<string, { score: number; notes?: string }>> = {
  "presentador-complice": {
    ugc: { score: 3, notes: "Es su formato natural." },
    "venta-directa": { score: 3 },
    "oferta-directa": { score: 3 },
    "explicando-beneficios": { score: 3 },
    "como-se-usa": { score: 3 },
    "respondiendo-comentarios": { score: 3 },
    "antes-y-despues": { score: 2 },
    camaleon: { score: 2 },
    "giro-emocional-plot-twist": { score: 2, notes: "Sirve como el personaje que da el detalle." },
    unboxing: { score: 2 },
    testimonio: { score: 1, notes: "Se le nota que es de la marca." },
    "historia-de-fundador": { score: 0, notes: "No es la dueña: suena falso." },
    sketch: { score: 1 },
    "camara-escondida": { score: 2 },
  },
  "pareja-real": {
    "giro-emocional-plot-twist": { score: 3, notes: "El formato está hecho para ellos." },
    pov: { score: 3 },
    sketch: { score: 3 },
    unboxing: { score: 3 },
    "ellos-vs-nosotros": { score: 2 },
    camaleon: { score: 2 },
    vlog: { score: 2 },
    "meme-anuncio-divertido": { score: 2 },
    "venta-directa": { score: 1, notes: "Pierden la naturalidad al vender de frente." },
    "explicando-beneficios": { score: 0, notes: "No es lo suyo, se ve leído." },
    "historia-de-fundador": { score: 0 },
  },
  "fundador-cercano": {
    "historia-de-fundador": { score: 3, notes: "Solo él puede hacer este formato." },
    "respondiendo-comentarios": { score: 3 },
    "vlog-de-marca": { score: 3 },
    "ellos-vs-nosotros": { score: 2 },
    "explicando-beneficios": { score: 2 },
    "oferta-directa": { score: 1 },
    sketch: { score: 0, notes: "Rompe la autoridad que construye." },
    "meme-anuncio-divertido": { score: 0 },
    "camara-escondida": { score: 0 },
    pov: { score: 1 },
  },
  "comico-fisico": {
    sketch: { score: 3 },
    "meme-anuncio-divertido": { score: 3 },
    "camara-escondida": { score: 3 },
    "giro-emocional-plot-twist": { score: 3, notes: "Perfecto para el golpe visual del inicio." },
    "ellos-vs-nosotros": { score: 3, notes: "Ideal para caricaturizar el lado 'ellos'." },
    pov: { score: 2 },
    vlog: { score: 2 },
    testimonio: { score: 0, notes: "Nadie le cree un testimonio serio." },
    "historia-de-fundador": { score: 0 },
    "explicando-beneficios": { score: 1 },
  },
  "cliente-honesto": {
    ugc: { score: 3 },
    testimonio: { score: 3 },
    unboxing: { score: 3 },
    "antes-y-despues": { score: 3 },
    "como-se-usa": { score: 2 },
    "respondiendo-comentarios": { score: 2 },
    camaleon: { score: 2 },
    "oferta-directa": { score: 1, notes: "Suena a que le pagaron." },
    "venta-directa": { score: 1 },
    sketch: { score: 1 },
  },
  "voz-narradora": {
    "voz-en-off": { score: 3 },
    "como-se-usa": { score: 3 },
    unboxing: { score: 3 },
    "antes-y-despues": { score: 2 },
    "explicando-beneficios": { score: 2 },
    "giro-emocional-plot-twist": { score: 2, notes: "Para el cierre narrado del formato." },
    ugc: { score: 0, notes: "El UGC necesita cara." },
    testimonio: { score: 0 },
    sketch: { score: 0 },
  },
};

/* =============================================================== MARCA === */

const BRAND = {
  slug: "con-amor",
  name: "Con Amor",
  tagline: "Regalos personalizados que sí se recuerdan",
  description:
    "Ropa y accesorios personalizados para parejas: poleras, casacas, tazas, pulseras magnéticas y collares, entregados en una caja premium lista para regalar. Producción propia en Perú, con más de 50 pedidos diarios.",
  identity:
    "Somos el detalle que la otra persona no se esperaba. No vendemos ropa: vendemos la cara que pone alguien cuando se da cuenta de que pensaste en cada detalle. Hablamos como una amiga que te está salvando el regalo, no como una tienda.",
  brief:
    "Todo video debe terminar en una conversación por WhatsApp. El producto se muestra siempre con sus detalles personalizados visibles: la fecha, las iniciales y la frase. La caja premium se muestra en el 80% de los videos porque es la mitad del valor percibido. Nunca prometemos plazos de entrega concretos en el video: eso se acuerda por WhatsApp según la carga del taller.",
  toneOfVoice:
    "Cercano, peruano, cómplice. Tuteo. Frases cortas. Nada de lenguaje corporativo ni de superlativos vacíos. Se puede decir 'hermano', 'mira esto', 'aceptémoslo'.",
  audience:
    "Personas de 20 a 40 años en Perú que tienen una fecha encima (aniversario, cumpleaños, San Valentín) y poco tiempo. Compran por el celular, deciden rápido y les aterra quedar mal con el regalo.",
  valueProps: [
    "100% personalizado: fecha exacta, iniciales y una frase que solo entienden ustedes",
    "Llega en una caja premium lista para entregar, sin tener que envolver nada",
    "Más de 100 diseños exclusivos",
    "Regalos extra si pides con anticipación: tazas con foto, pulseras magnéticas o collares sol y luna",
    "Más de 50 pedidos diarios: producción propia y experiencia real",
  ],
  doNots: [
    "No prometer plazos de entrega concretos en el video",
    "No decir 'la mejor calidad del mercado' ni superlativos sin prueba",
    "No mostrar el producto sin sus detalles personalizados visibles",
    "No usar tono de tienda ni lenguaje corporativo",
    "No inventar descuentos ni promociones que no estén confirmadas",
  ],
  keywords: [
    "personalizado",
    "a juego",
    "detalle",
    "caja premium",
    "aniversario",
    "match",
    "sorpresa",
  ],
  colorPrimary: "#ec4899",
  colorSecondary: "#8b5cf6",
  colorAccent: "#f59e0b",
  instagram: "@conamor.pe",
  tiktok: "@conamor.pe",
  whatsapp: "Link del perfil",
};

const OBJECTIVES = [
  {
    name: "Videos publicados al mes",
    metricKey: "videos",
    unit: "videos",
    baselineValue: 8,
    currentValue: 14,
    targetValue: 24,
    period: "MENSUAL",
    higherIsBetter: true,
    description: "Ritmo mínimo para que el algoritmo no nos olvide: 6 videos por semana.",
    sortOrder: 0,
  },
  {
    name: "Vistas mensuales",
    metricKey: "views",
    unit: "vistas",
    baselineValue: 40000,
    currentValue: 118000,
    targetValue: 300000,
    period: "MENSUAL",
    higherIsBetter: true,
    sortOrder: 1,
  },
  {
    name: "Conversaciones por WhatsApp",
    metricKey: "leads",
    unit: "chats",
    baselineValue: 120,
    currentValue: 186,
    targetValue: 400,
    period: "MENSUAL",
    higherIsBetter: true,
    description: "El indicador que de verdad predice ventas.",
    sortOrder: 2,
  },
  {
    name: "Retención a 3 segundos",
    metricKey: "retention3s",
    unit: "%",
    baselineValue: 32,
    currentValue: 41,
    targetValue: 55,
    period: "MENSUAL",
    higherIsBetter: true,
    description: "Si el hook no aguanta 3 segundos, todo lo demás da igual.",
    sortOrder: 3,
  },
  {
    name: "Costo por conversación",
    metricKey: "cpa",
    unit: "S/",
    baselineValue: 9.5,
    currentValue: 7.2,
    targetValue: 4,
    period: "MENSUAL",
    higherIsBetter: false,
    description: "Menos es mejor. Bajarlo depende de que los hooks mejoren.",
    sortOrder: 4,
  },
];

/* ============================================================= GUIONES === */

type SeedScene = {
  beat: string;
  startSec: number;
  endSec: number;
  voiceType: string;
  voice: string;
  shot: string;
  action: string;
  actors: { role: string; archetype: string; notes: string }[];
  emotion: string;
  props: string[];
  lighting: string;
  sound: string;
  onScreenText?: string;
  location?: string;
};

const SCRIPTS: {
  title: string;
  structureSlug: string;
  archetypeSlug: string;
  avatar: string;
  focus: string;
  hook: string;
  cta: string;
  scenes: SeedScene[];
}[] = [
  {
    title: "El Novio Detallista",
    structureSlug: "venta-directa",
    archetypeSlug: "presentador-complice",
    avatar: "Novio que quiere sorprender con algo único y no sabe cómo.",
    focus: "Conexión emocional, sorpresa y calidad del detalle.",
    hook: "Transición tapando el lente: sale con la polera ya puesta, junto a la modelo.",
    cta: "Escríbeme al WhatsApp desde el link del perfil para separar el tuyo.",
    scenes: [
      {
        beat: "Hook",
        startSec: 0,
        endSec: 5,
        voiceType: "EN_CAMARA",
        voice:
          "¿Quieres verla sonreír de verdad cuando le des su regalo? Deja de buscar, hermano. Si siempre le regalas lo mismo y esta vez quieres sorprenderla en serio, mira esto.",
        shot:
          "Transición rápida: el presentador acerca una polera de Stitch a la cámara tapando el lente; al alejarla ya la tiene puesta, junto a una chica con la versión de Ángel.",
        action:
          "El presentador tapa el lente con la prenda y aparece ya cambiado, con la modelo a su lado.",
        actors: [
          {
            role: "Presentador",
            archetype: "Presentador Cómplice",
            notes: "Tono de secreto entre amigos. Habla rápido pero se le entiende todo.",
          },
          { role: "Modelo", archetype: "Pareja Real", notes: "Solo sonríe. No habla." },
        ],
        emotion: "Complicidad y urgencia amable",
        props: ["Polera de Stitch", "Polera de Ángel"],
        lighting: "Luz natural frontal de ventana, suave, sin sombras duras en la cara.",
        sound: "Corte seco de tela al tapar el lente. Música pop suave que entra en el segundo 2.",
        onScreenText: "¿Otra vez el mismo regalo?",
        location: "Sala con pared clara",
      },
      {
        beat: "Identificación / Producto",
        startSec: 5,
        endSec: 20,
        voiceType: "EN_CAMARA",
        voice:
          "No son solo unas poleras súper calientitas. Son cien por ciento personalizadas para ustedes. Mira estos detalles: ponemos su fecha especial aquí en el bolsillo, sus iniciales gigantes, y una frase que solo ustedes entiendan en la manga. Imagina su cara cuando vea que pensaste en cada detalle.",
        shot:
          "Tomas detalle muy cercanas apuntando con el dedo: bolsillo con la fecha, manga con la frase, pecho con las iniciales. Movimiento dinámico entre plano y plano.",
        action:
          "Las manos recorren la prenda señalando cada personalización. Un detalle por toma.",
        actors: [
          {
            role: "Presentador",
            archetype: "Presentador Cómplice",
            notes: "Señala con el dedo cada detalle. Que se le vean las manos siempre.",
          },
        ],
        emotion: "Orgullo por el detalle",
        props: ["Polera personalizada con fecha, iniciales y frase"],
        lighting: "Luz lateral rasante para que se note el relieve del estampado.",
        sound: "Roce de la tela en primer plano. La música baja de volumen bajo la voz.",
        onScreenText: "Fecha · Iniciales · Frase",
        location: "Mesa con fondo neutro",
      },
      {
        beat: "Emoción / Oferta (Unboxing)",
        startSec: 20,
        endSec: 35,
        voiceType: "EN_CAMARA",
        voice:
          "Pero espera, que esto cambia todo. No se lo vas a entregar en una bolsa cualquiera. Nosotros te armamos esta caja premium Con Amor. Y si haces tu pedido con anticipación, te regalamos unas pulseras magnéticas que brillan en la oscuridad, o unas tazas con su foto.",
        shot:
          "Cámara en picada abriendo la caja blanca. Se ve el papel de seda rojo. Corte rápido a las pulseras magnéticas uniéndose y a las tazas personalizadas.",
        action:
          "La chica abre la caja. Reacción real al ver el contenido. Luego, detalle de las pulseras uniéndose solas.",
        actors: [
          {
            role: "Chica",
            archetype: "Pareja Real",
            notes: "Reacción genuina al abrir. No forzar la sonrisa: grabar varias tomas.",
          },
        ],
        emotion: "Sorpresa contenida que se convierte en ternura",
        props: [
          "Caja premium blanca",
          "Papel de seda rojo",
          "Pulseras magnéticas",
          "Tazas personalizadas",
        ],
        lighting: "Luz cálida cenital sobre la caja, el resto del cuadro más oscuro.",
        sound: "Sonido real del cartón y del papel de seda. Clic metálico de las pulseras al unirse.",
        onScreenText: "Llega listo para entregar",
        location: "Mesa de empaque",
      },
      {
        beat: "CTA",
        startSec: 35,
        endSec: 45,
        voiceType: "EN_CAMARA",
        voice:
          "Tenemos más de 100 diseños exclusivos y preparamos más de 50 pedidos diarios. Esto sí lo va a recordar. Ve al link del perfil y escríbeme al WhatsApp para separar el tuyo.",
        shot:
          "Presentador sosteniendo la caja en una mano y la polera en la otra. Aparece un globo de texto con el número de WhatsApp y una flecha hacia abajo.",
        action: "Levanta ambos productos hacia la cámara y señala hacia abajo.",
        actors: [
          {
            role: "Presentador",
            archetype: "Presentador Cómplice",
            notes: "Bajar una marcha la energía: cierre tranquilo y seguro.",
          },
        ],
        emotion: "Seguridad tranquila",
        props: ["Caja cerrada", "Polera personalizada"],
        lighting: "La misma luz frontal del inicio, para cerrar el círculo visual.",
        sound: "La música sube en el último segundo y corta seco.",
        onScreenText: "Link en el perfil → WhatsApp",
        location: "Sala con pared clara",
      },
    ],
  },
  {
    title: "El Comprador por Aniversario",
    structureSlug: "venta-directa",
    archetypeSlug: "presentador-complice",
    avatar: "Persona con un aniversario encima que no quiere quedar mal.",
    focus: "Conmemoración, fecha especial, paquete completo listo para entregar.",
    hook: "Tira los chocolates fuera de cuadro y saca las poleras de Chimuelo.",
    cta: "Escríbenos al WhatsApp y te paso el catálogo completo.",
    scenes: [
      {
        beat: "Hook",
        startSec: 0,
        endSec: 6,
        voiceType: "EN_CAMARA",
        voice:
          "Si tu aniversario es este mes, por favor no le regales solo chocolates. Cumplir meses o años merece algo que puedan guardar y usar juntos.",
        shot:
          "El presentador tira suavemente una caja de chocolates fuera de cuadro y saca de abajo un par de poleras de Chimuelo, blanca y negra.",
        action: "Descarta los chocolates con la mano y levanta las dos poleras.",
        actors: [
          {
            role: "Presentador",
            archetype: "Presentador Cómplice",
            notes: "El gesto de tirar los chocolates tiene que ser rápido y con humor.",
          },
        ],
        emotion: "Fastidio juguetón",
        props: ["Caja de chocolates (utilería)", "2 poleras de Chimuelo"],
        lighting: "Luz frontal pareja. Fondo limpio para que el gesto se lea claro.",
        sound: "Golpe seco cuando los chocolates salen de cuadro. Música entra justo después.",
        onScreenText: "Chocolates otra vez, no",
        location: "Mesa con fondo neutro",
      },
      {
        beat: "Identificación / Producto",
        startSec: 6,
        endSec: 22,
        voiceType: "EN_CAMARA",
        voice:
          "Mira la belleza de estas poleras. Aquí no vendemos ropa genérica, vendemos su historia. Ponemos la fecha exacta en la que se conocieron, sus nombres y un diseño espectacular. Son de calidad premium, súper abrigadoras, de esas que no te quieres quitar en todo el día.",
        shot:
          "Paneo lento sobre la polera blanca y luego la negra. Zoom al estampado de la fecha. Se estira un poco la tela para demostrar el cuerpo del material.",
        action: "Muestra ambas prendas y estira la tela frente a la cámara.",
        actors: [
          {
            role: "Presentador",
            archetype: "Presentador Cómplice",
            notes: "Tocar la tela de verdad. Que se vea el gesto de calidad, no que se diga.",
          },
        ],
        emotion: "Orgullo tranquilo",
        props: ["Polera blanca personalizada", "Polera negra personalizada"],
        lighting: "Luz lateral suave que marca la textura del tejido.",
        sound: "Roce de tela amplificado. Música de fondo baja.",
        onScreenText: "La fecha exacta en que se conocieron",
        location: "Mesa con fondo neutro",
      },
      {
        beat: "Transformación / Oferta",
        startSec: 22,
        endSec: 38,
        voiceType: "EN_CAMARA",
        voice:
          "Es el regalo perfecto porque ya viene listo para entregar. Te lo enviamos en esta caja, súper romántica. Y para premiar a los novios prevenidos: si lo pides con anticipación, te enviamos de regalo este par de tazas con las fotos de ustedes dos.",
        shot:
          "Transición a la zona de empaque. Una chica mete la polera en la bolsa roja dentro de la caja. Luego levanta las dos tazas y las choca suavemente.",
        action: "Empaquetado real en el taller y brindis con las tazas personalizadas.",
        actors: [
          {
            role: "Chica del taller",
            archetype: "Cliente Honesto",
            notes: "Movimientos naturales de trabajo, sin mirar a cámara.",
          },
        ],
        emotion: "Calidez de taller, cotidiana",
        props: ["Caja premium", "Papel rojo", "2 tazas personalizadas"],
        lighting: "Luz cálida de taller, con algo de contraste. Ambiente real, no de estudio.",
        sound: "Papel arrugándose, cinta adhesiva, choque suave de cerámica.",
        location: "Taller de empaque",
      },
      {
        beat: "CTA",
        startSec: 38,
        endSec: 48,
        voiceType: "EN_CAMARA",
        voice:
          "Imagínate dárselo así: el detalle habla por sí solo. Escríbenos al WhatsApp ahora mismo, te paso el catálogo con todos los diseños y armamos el regalo perfecto para su fecha.",
        shot:
          "Presentador sonriendo y señalando la pantalla. Aparece una captura simulada de un chat de WhatsApp desplazándose rápido.",
        action: "Señala hacia la pantalla mientras entra el gráfico del chat.",
        actors: [
          { role: "Presentador", archetype: "Presentador Cómplice", notes: "Cierre cálido y directo." },
        ],
        emotion: "Cercanía y confianza",
        props: ["Gráfico animado de chat de WhatsApp"],
        lighting: "Luz frontal, igual que el hook.",
        sound: "Notificaciones de WhatsApp muy bajitas bajo la voz.",
        onScreenText: "Te paso el catálogo →",
        location: "Mesa con fondo neutro",
      },
    ],
  },
  {
    title: "Identidad & Matching",
    structureSlug: "venta-directa",
    archetypeSlug: "pareja-real",
    avatar: "Pareja a la que le encanta combinar outfits y mostrar su relación.",
    focus: "Estilo en pareja, moda, envidia sana y viralidad.",
    hook: "La pareja camina hacia cámara y se da la vuelta para mostrar la espalda.",
    cta: "Entra al link del perfil y escoge tu diseño favorito.",
    scenes: [
      {
        beat: "Hook",
        startSec: 0,
        endSec: 5,
        voiceType: "VOZ_EN_OFF",
        voice:
          "Etiqueta a tu novio, porque si no hacen match con esto, ahí no es. Aceptémoslo: salir a la calle combinando con tu persona favorita es otro nivel.",
        shot:
          "Una pareja camina hacia la cámara con las poleras puestas, se da la vuelta para mostrar el diseño de la espalda y sonríe.",
        action: "Caminata hacia cámara, giro coordinado y sonrisa.",
        actors: [
          {
            role: "Pareja",
            archetype: "Pareja Real",
            notes: "No actuar. Que caminen como caminan de verdad, riéndose entre ellos.",
          },
        ],
        emotion: "Orgullo divertido",
        props: ["2 poleras a juego"],
        lighting: "Luz de calle a media tarde, cálida y dorada.",
        sound: "Ambiente de calle real. Música con beat marcado que entra en el giro.",
        onScreenText: "Etiqueta a tu persona",
        location: "Exterior, vereda o parque",
      },
      {
        beat: "Identificación / Producto",
        startSec: 5,
        endSec: 20,
        voiceType: "VOZ_EN_OFF",
        voice:
          "Miren el nivel de detalle de estas casacas y poleras. Son cien por ciento personalizadas. Tú eliges si quieren a Stitch, a Chimuelo, o el diseño que más los represente. Le agregamos sus iniciales y esa fecha que solo ustedes dos celebran.",
        shot:
          "Montaje rápido con transiciones desenfocadas: tres diseños distintos sostenidos en ganchos. Ritmo muy visual, estilo TikTok.",
        action: "Cambio rápido de prendas frente a cámara, una por corte.",
        actors: [
          {
            role: "Presentador",
            archetype: "Presentador Cómplice",
            notes: "Solo aparecen las manos y el torso. Movimientos rápidos y limpios.",
          },
        ],
        emotion: "Energía y variedad",
        props: ["3 pares de poleras de distintos colores", "Ganchos"],
        lighting: "Luz plana y brillante para que los colores salgan saturados.",
        sound: "Golpe de sonido en cada transición, sincronizado con el beat.",
        location: "Perchero con fondo de color",
      },
      {
        beat: "Prueba social / Oferta",
        startSec: 20,
        endSec: 34,
        voiceType: "VOZ_EN_OFF",
        voice:
          "No es por presumir, pero tenemos más de 50 pedidos diarios porque a las parejas les encanta. Y como queremos que el match sea completo, si pides con tiempo te enviamos el Box Con Amor y te regalamos unos collares de sol y luna que se unen magnéticamente.",
        shot:
          "Tomas de las torres de pedidos listos para envío en el taller. Luego primer plano de los collares uniéndose en el cuello de la modelo.",
        action: "Paneo sobre los paquetes apilados y detalle del imán juntando los collares.",
        actors: [
          { role: "Modelo", archetype: "Pareja Real", notes: "Solo aparece el cuello y las manos." },
        ],
        emotion: "Confianza por volumen",
        props: ["Pilas de paquetes de envío", "Collares magnéticos sol y luna"],
        lighting: "Luz de taller real en el paneo; luz suave y cercana para el detalle del collar.",
        sound: "Ruido de taller de fondo. Clic magnético destacado en primer plano.",
        onScreenText: "+50 pedidos diarios",
        location: "Taller y set de detalle",
      },
      {
        beat: "CTA",
        startSec: 34,
        endSec: 42,
        voiceType: "VOZ_EN_OFF",
        voice:
          "Si estás enamorado, este es el detalle. Entra al link del perfil, mándanos un WhatsApp y escoge tu diseño favorito.",
        shot:
          "Toma final de la pareja del inicio despidiéndose. Gráfico del botón de WhatsApp latiendo en pantalla.",
        action: "La pareja se aleja caminando y saluda a cámara.",
        actors: [{ role: "Pareja", archetype: "Pareja Real", notes: "Despedida natural, sin pose." }],
        emotion: "Cierre cálido",
        props: ["Animación del botón de WhatsApp"],
        lighting: "La misma luz dorada de calle del hook.",
        sound: "La música baja hasta desaparecer.",
        onScreenText: "Link en el perfil",
        location: "Exterior, vereda o parque",
      },
    ],
  },
  {
    title: "El Indeciso (Cero Estrés)",
    structureSlug: "pas",
    archetypeSlug: "presentador-complice",
    avatar: "Comprador con poco tiempo que no sabe qué regalar.",
    focus: "Solución llave en mano: facilidad y evitar el error.",
    hook: "Cara de estrés actuado que cambia de golpe a una sonrisa con un chasquido.",
    cta: "Escríbenos al WhatsApp desde el link del perfil y dinos cómo personalizarlo.",
    scenes: [
      {
        beat: "Problema",
        startSec: 0,
        endSec: 6,
        voiceType: "EN_CAMARA",
        voice:
          "¿No sabes qué regalarle, ya se viene la fecha y tienes cero tiempo para buscar? Respira. Te tengo la solución.",
        shot:
          "Presentador con cara de estrés, frotándose la cabeza. De pronto cambia a una gran sonrisa y chasquea los dedos.",
        action: "Cambio de registro facial de golpe, con el chasquido como marca de corte.",
        actors: [
          {
            role: "Presentador",
            archetype: "Presentador Cómplice",
            notes: "El cambio tiene que ser abrupto, casi cómico. Grabar varias tomas del chasquido.",
          },
        ],
        emotion: "Agobio que se transforma en alivio",
        props: [],
        lighting:
          "Luz fría y algo dura en el momento de estrés; al chasquear, cambia a luz cálida. El cambio se hace en cámara con dos fuentes.",
        sound: "Silencio tenso en el agobio. Chasquido seco y entra la música.",
        onScreenText: "¿Cero tiempo?",
        location: "Sala",
      },
      {
        beat: "Agitación",
        startSec: 6,
        endSec: 14,
        voiceType: "EN_CAMARA",
        voice:
          "Porque ya sabes lo que pasa: terminas comprando lo primero que ves, se lo das, dice gracias, y a la semana ni te acuerdas qué era. Otra vez.",
        shot:
          "Plano medio, presentador hablando directo. Inserto rápido de una bolsa genérica de tienda.",
        action: "Levanta una bolsa cualquiera y la deja caer con desgano.",
        actors: [
          {
            role: "Presentador",
            archetype: "Presentador Cómplice",
            notes: "Tono de complicidad resignada, como quien ya lo vivió.",
          },
        ],
        emotion: "Resignación reconocible",
        props: ["Bolsa genérica de tienda"],
        lighting: "Luz plana, deliberadamente sosa, para contrastar con lo que viene.",
        sound: "Sin música. Solo la voz y el ruido de la bolsa.",
        location: "Sala",
      },
      {
        beat: "Solución",
        startSec: 14,
        endSec: 30,
        voiceType: "EN_CAMARA",
        voice:
          "Con nuestras poleras personalizadas vas a la segura. Solo nos dices su color favorito, la fecha de su aniversario y sus nombres, y nosotros hacemos la magia. El estampado es de primera, no se despinta, y la tela es súper suave.",
        shot:
          "Clip del estampado saliendo de la plancha térmica. Luego la polera terminada, perfecta, en primer plano.",
        action: "Proceso real de estampado en el taller y presentación del resultado.",
        actors: [
          { role: "Operario", archetype: "Cliente Honesto", notes: "Solo las manos trabajando." },
          { role: "Presentador", archetype: "Presentador Cómplice", notes: "Vuelve la energía alta." },
        ],
        emotion: "Alivio y confianza",
        props: ["Máquina estampadora", "Polera terminada"],
        lighting: "Luz de taller con algo de vapor visible: da sensación de proceso real.",
        sound: "Prensa térmica cerrándose. Vapor. La música vuelve a entrar.",
        onScreenText: "Color · Fecha · Nombres",
        location: "Taller de producción",
      },
      {
        beat: "CTA",
        startSec: 30,
        endSec: 46,
        voiceType: "EN_CAMARA",
        voice:
          "Y nosotros nos encargamos de todo el empaque: te llega esta caja lista para entregar. Escríbenos al WhatsApp desde el link del perfil y dinos cómo quieres personalizarlo.",
        shot:
          "Secuencia acelerada: armar la caja, poner el papel, meter la polera, cerrar y poner el lazo. Termina con el presentador sosteniendo la caja terminada.",
        action: "Montaje rápido del empaquetado completo y plano final con la caja.",
        actors: [
          { role: "Manos de producción", archetype: "Cliente Honesto", notes: "Movimientos ágiles." },
          {
            role: "Presentador",
            archetype: "Presentador Cómplice",
            notes: "Sonrisa de misión cumplida.",
          },
        ],
        emotion: "Satisfacción de problema resuelto",
        props: ["Caja premium", "Papel de seda", "Lazo", "Polera"],
        lighting: "Luz cálida y pareja sobre la mesa de empaque.",
        sound: "Sonidos del empaque sincronizados con el beat de la música.",
        onScreenText: "Te resolvemos el regalo → WhatsApp",
        location: "Mesa de empaque",
      },
    ],
  },
];

/* ================================================================ MAIN === */

async function main() {
  console.log("Sembrando datos iniciales…\n");

  /* --- Ajustes --- */
  for (const [key, value] of Object.entries({
    "org.name": "Con Amor",
    "ai.defaultProvider": "anthropic",
    "ai.anthropic.model": "claude-opus-5",
    "ai.google.model": "gemini-2.5-pro",
  })) {
    await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: {} });
  }

  /* --- Estructuras --- */
  const structureIds = new Map<string, string>();
  for (const s of SEED_STRUCTURES) {
    const row = await prisma.structure.upsert({
      where: { slug: s.slug },
      create: {
        name: s.name,
        slug: s.slug,
        category: s.category,
        family: s.family,
        summary: s.summary,
        beats: J(s.beats),
        systemPrompt: s.systemPrompt,
        rules: J(s.rules),
        examples: J(s.examples ?? []),
        defaultDurationSec: s.defaultDurationSec,
        defaultProvider: "anthropic",
        defaultModel: "claude-opus-5",
      },
      update: {},
    });
    structureIds.set(s.slug, row.id);
  }
  console.log(`  ${SEED_STRUCTURES.length} estructuras`);

  /* --- Arquetipos --- */
  const archetypeIds = new Map<string, string>();
  for (const a of ARCHETYPES) {
    const row = await prisma.archetype.upsert({
      where: { slug: a.slug },
      create: {
        name: a.name,
        slug: a.slug,
        summary: a.summary,
        personality: a.personality,
        strengths: J(a.strengths),
        avoid: J(a.avoid),
        toneKeywords: J(a.toneKeywords),
        brandingNotes: a.brandingNotes,
        ageRange: a.ageRange,
        // Son perfiles de ejemplo, no gente real del equipo.
        isPerson: false,
        energyLevel: a.energyLevel,
        color: a.color,
      },
      update: {},
    });
    archetypeIds.set(a.slug, row.id);
  }
  console.log(`  ${ARCHETYPES.length} arquetipos`);

  /* --- Compatibilidad arquetipo <-> estructura --- */
  let fitCount = 0;
  for (const [archSlug, map] of Object.entries(FITS)) {
    const archetypeId = archetypeIds.get(archSlug);
    if (!archetypeId) continue;
    for (const [structSlug, fit] of Object.entries(map)) {
      const structureId = structureIds.get(structSlug);
      if (!structureId) continue;
      await prisma.archetypeFit.upsert({
        where: { archetypeId_structureId: { archetypeId, structureId } },
        create: {
          archetypeId,
          structureId,
          score: fit.score,
          notes: fit.notes ?? null,
          // Lo siembra un script, no el dueno.
          source: "SEED",
        },
        update: {},
      });
      fitCount++;
    }
  }
  console.log(`  ${fitCount} compatibilidades`);

  /* --- Marca --- */
  const brand = await prisma.brand.upsert({
    where: { slug: BRAND.slug },
    create: {
      name: BRAND.name,
      slug: BRAND.slug,
      tagline: BRAND.tagline,
      description: BRAND.description,
      identity: BRAND.identity,
      brief: BRAND.brief,
      toneOfVoice: BRAND.toneOfVoice,
      audience: BRAND.audience,
      valueProps: J(BRAND.valueProps),
      doNots: J(BRAND.doNots),
      keywords: J(BRAND.keywords),
      colorPrimary: BRAND.colorPrimary,
      colorSecondary: BRAND.colorSecondary,
      colorAccent: BRAND.colorAccent,
      instagram: BRAND.instagram,
      tiktok: BRAND.tiktok,
      whatsapp: BRAND.whatsapp,
    },
    update: {},
  });
  console.log(`  marca "${brand.name}"`);

  if ((await prisma.brandObjective.count({ where: { brandId: brand.id } })) === 0) {
    for (const o of OBJECTIVES) {
      await prisma.brandObjective.create({
        data: {
          brandId: brand.id,
          name: o.name,
          description: o.description ?? null,
          metricKey: o.metricKey,
          unit: o.unit,
          baselineValue: o.baselineValue,
          currentValue: o.currentValue,
          targetValue: o.targetValue,
          period: o.period,
          higherIsBetter: o.higherIsBetter,
          sortOrder: o.sortOrder,
          deadline: daysFromToday(20),
          status: "EN_CURSO",
        },
      });
    }
    console.log(`  ${OBJECTIVES.length} objetivos`);
  }

  /* --- Equipo --- */
  const TEAM = [
    { name: "Ana Torres", email: "ana@conamor.pe", role: "MEMBER", color: "#ec4899", archetype: "presentador-complice", bio: "Dirige el calendario y sale en cámara." },
    { name: "Paula Rivas", email: "paula@conamor.pe", role: "MEMBER", color: "#8b5cf6", archetype: null, bio: "Escribe los guiones." },
    { name: "Diego Ramos", email: "diego@conamor.pe", role: "MEMBER", color: "#0ea5e9", archetype: null, bio: "Cámara y edición." },
    { name: "Lucía Fernández", email: "lucia@conamor.pe", role: "MEMBER", color: "#f43f5e", archetype: "pareja-real", bio: "Actúa en los formatos de pareja." },
    { name: "Marco Salas", email: "marco@conamor.pe", role: "MEMBER", color: "#f59e0b", archetype: "comico-fisico", bio: "Sketches y comedia física." },
  ];

  const credentials: { name: string; email: string; password: string }[] = [];
  const userIds = new Map<string, string>();

  for (const member of TEAM) {
    const existing = await prisma.user.findUnique({ where: { email: member.email } });
    if (existing) {
      userIds.set(member.email, existing.id);
      continue;
    }
    const password = randomPassword();
    const user = await prisma.user.create({
      data: {
        name: member.name,
        email: member.email,
        passwordHash: await bcrypt.hash(password, 10),
        role: member.role,
        color: member.color,
        bio: member.bio,
        archetypeId: member.archetype ? (archetypeIds.get(member.archetype) ?? null) : null,
      },
    });
    userIds.set(member.email, user.id);
    credentials.push({ name: member.name, email: member.email, password });
  }
  console.log(`  ${TEAM.length} personas en el equipo`);

  const ana = userIds.get("ana@conamor.pe")!;
  const paula = userIds.get("paula@conamor.pe")!;
  const diego = userIds.get("diego@conamor.pe")!;
  const lucia = userIds.get("lucia@conamor.pe")!;
  const marco = userIds.get("marco@conamor.pe")!;

  /* --- Guiones de ejemplo --- */
  const scriptIds: string[] = [];
  for (const s of SCRIPTS) {
    const existing = await prisma.script.findFirst({ where: { title: s.title, brandId: brand.id } });
    if (existing) {
      scriptIds.push(existing.id);
      continue;
    }
    const totalSeconds = s.scenes.at(-1)?.endSec ?? 0;
    const script = await prisma.script.create({
      data: {
        title: s.title,
        brandId: brand.id,
        structureId: structureIds.get(s.structureSlug) ?? null,
        archetypeId: archetypeIds.get(s.archetypeSlug) ?? null,
        avatar: s.avatar,
        focus: s.focus,
        hook: s.hook,
        cta: s.cta,
        totalSeconds,
        status: "APROBADO",
        provider: "manual",
        model: "Escrito por el equipo",
        authorId: paula,
        scenes: {
          create: s.scenes.map((scene, i) => ({
            order: i,
            beat: scene.beat,
            startSec: scene.startSec,
            endSec: scene.endSec,
            voiceType: scene.voiceType,
            voice: scene.voice,
            shot: scene.shot,
            action: scene.action,
            actors: J(scene.actors),
            emotion: scene.emotion,
            props: J(scene.props),
            lighting: scene.lighting,
            sound: scene.sound,
            onScreenText: scene.onScreenText ?? null,
            location: scene.location ?? null,
          })),
        },
      },
    });
    scriptIds.push(script.id);
  }
  console.log(`  ${SCRIPTS.length} guiones de ejemplo`);

  /* --- Videos en el calendario --- */
  if ((await prisma.contentItem.count({ where: { brandId: brand.id } })) === 0) {
    const CHECKLIST = [
      { label: "Guion escrito y revisado", stage: "PREPRODUCCION", required: true },
      { label: "Guion aprobado por la marca", stage: "PREPRODUCCION", required: true },
      { label: "Actor asignado y confirmado", stage: "PREPRODUCCION", required: true },
      { label: "Props / vestuario conseguidos", stage: "PREPRODUCCION", required: true },
      { label: "Locación e iluminación listas", stage: "PREPRODUCCION", required: false },
      { label: "Grabado (todas las tomas)", stage: "GRABACION", required: true },
      { label: "Audio revisado", stage: "GRABACION", required: true },
      { label: "B-roll / tomas de apoyo", stage: "GRABACION", required: false },
      { label: "Editado", stage: "POSTPRODUCCION", required: true },
      { label: "Subtítulos y textos en pantalla", stage: "POSTPRODUCCION", required: true },
      { label: "Música y efectos de sonido", stage: "POSTPRODUCCION", required: false },
      { label: "Revisión final aprobada", stage: "POSTPRODUCCION", required: true },
      { label: "Copy y hashtags escritos", stage: "PUBLICACION", required: true },
      { label: "Subido a la plataforma", stage: "PUBLICACION", required: true },
      { label: "Link guardado en la ficha", stage: "PUBLICACION", required: false },
    ];

    const VIDEOS = [
      { title: "El Novio Detallista", day: -18, status: "PUBLICADO", platforms: ["TIKTOK", "INSTAGRAM"], structure: "venta-directa", script: 0, done: 15, views: 48200, retention: 46 },
      { title: "Aniversario: no le regales chocolates", day: -15, status: "PUBLICADO", platforms: ["TIKTOK", "INSTAGRAM"], structure: "venta-directa", script: 1, done: 15, views: 31400, retention: 39 },
      { title: "Match de pareja en la calle", day: -12, status: "PUBLICADO", platforms: ["INSTAGRAM", "FACEBOOK"], structure: "venta-directa", script: 2, done: 15, views: 22800, retention: 44 },
      { title: "La bolsa de ropa para lavar", day: -9, status: "PUBLICADO", platforms: ["TIKTOK", "INSTAGRAM"], structure: "giro-emocional-plot-twist", script: null, done: 15, views: 96500, retention: 58 },
      { title: "Unboxing del Box Con Amor", day: -6, status: "PUBLICADO", platforms: ["INSTAGRAM", "FACEBOOK"], structure: "unboxing", script: null, done: 15, views: 14100, retention: 41 },
      { title: "Cero estrés: te resolvemos el regalo", day: -4, status: "PUBLICADO", platforms: ["FACEBOOK"], structure: "pas", script: 3, done: 15, views: 9700, retention: 33 },
      { title: "Cómo pedimos tu personalización", day: -2, status: "EDICION", platforms: ["TIKTOK"], structure: "como-se-usa", script: null, done: 9, views: 0, retention: 0 },
      { title: "Respondiendo: ¿por qué cuesta eso?", day: -1, status: "EDICION", platforms: ["TIKTOK"], structure: "respondiendo-comentarios", script: null, done: 8, views: 0, retention: 0 },
      { title: "Un día en el taller", day: 0, status: "GRABACION", platforms: ["INSTAGRAM"], structure: "vlog-de-marca", script: null, done: 5, views: 0, retention: 0 },
      { title: "Variante del plot twist: la sal", day: 1, status: "APROBADO", platforms: ["TIKTOK"], structure: "giro-emocional-plot-twist", script: null, done: 4, views: 0, retention: 0 },
      { title: "Testimonio de Karen y Josué", day: 3, status: "GUION", platforms: ["TIKTOK"], structure: "testimonio", script: null, done: 2, views: 0, retention: 0 },
      { title: "POV: es tu aniversario y no compraste nada", day: 5, status: "GUION", platforms: ["TIKTOK"], structure: "pov", script: null, done: 1, views: 0, retention: 0 },
      { title: "Sketch: el novio que olvidó la fecha", day: 7, status: "IDEA", platforms: ["TIKTOK"], structure: "sketch", script: null, done: 0, views: 0, retention: 0 },
      { title: "Antes y después del empaque", day: 9, status: "IDEA", platforms: ["INSTAGRAM"], structure: "antes-y-despues", script: null, done: 0, views: 0, retention: 0 },
    ];

    for (const v of VIDEOS) {
      const item = await prisma.contentItem.create({
        data: {
          brandId: brand.id,
          title: v.title,
          status: v.status,
          platforms: JSON.stringify(v.platforms),
          priority: v.day < 2 ? "ALTA" : "MEDIA",
          scheduledDate: daysFromToday(v.day),
          shootDate: v.day <= 0 ? daysFromToday(v.day - 2) : null,
          publishedAt: v.status === "PUBLICADO" ? daysFromToday(v.day) : null,
          structureId: structureIds.get(v.structure) ?? null,
          scriptId: v.script !== null ? (scriptIds[v.script] ?? null) : null,
          createdById: ana,
          checklist: {
            create: CHECKLIST.map((c, i) => ({
              label: c.label,
              stage: c.stage,
              required: c.required,
              sortOrder: i,
              done: i < v.done,
              doneById: i < v.done ? (i < 5 ? paula : i < 8 ? diego : diego) : null,
              doneAt: i < v.done ? daysFromToday(v.day - 1) : null,
            })),
          },
          assignments: {
            create: [
              { userId: paula, role: "GUIONISTA" },
              { userId: v.structure === "sketch" ? marco : lucia, role: "ACTOR" },
              { userId: diego, role: "CAMARA" },
              { userId: diego, role: "EDITOR" },
            ],
          },
        },
      });

      // Métricas de los videos ya publicados: una fila por día, decayendo.
      if (v.views > 0) {
        const dias = Math.min(7, Math.abs(v.day));
        for (let d = 0; d < dias; d++) {
          const factor = d === 0 ? 0.45 : Math.max(0.03, 0.4 / (d + 1));
          const views = Math.round(v.views * factor);
          await prisma.metric.create({
            data: {
              contentItemId: item.id,
              date: daysFromToday(v.day + d),
              views,
              likes: Math.round(views * 0.062),
              comments: Math.round(views * 0.004),
              shares: Math.round(views * 0.011),
              saves: Math.round(views * 0.017),
              reach: Math.round(views * 0.87),
              clicks: Math.round(views * 0.008),
              leads: Math.round(views * 0.0016),
              orders: Math.round(views * 0.00035),
              spend: Math.round(views * 0.0042 * 100) / 100,
              revenue: Math.round(views * 0.019 * 100) / 100,
              retention3s: v.retention + (d % 3) - 1,
              watchTimeSec: 11 + (d % 4),
            },
          });
        }
      }
    }
    console.log(`  ${VIDEOS.length} videos con checklist, equipo y métricas`);
  }

  /* --- Agenda: lo que no es un video pero ocupa el calendario --- */
  if ((await prisma.calendarEvent.count()) === 0) {
    const AGENDA = [
      {
        title: "Reunión de contenido de la semana",
        kind: "REUNION",
        day: 1,
        allDay: false,
        hour: 10,
        location: "Meet",
        description: "Revisar qué salió, qué se graba y qué falta de guiones.",
      },
      {
        title: "Jornada de grabación: 3 videos de pareja",
        kind: "GRABACION",
        day: 2,
        allDay: true,
        location: "Taller",
        description: "Lucía y Marco. Llevar las poleras y la caja premium.",
      },
      {
        title: "Comprar utilería para el plot twist de la sal",
        kind: "PENDIENTE",
        day: 0,
        allDay: true,
        location: null,
        description: "Frasco de vidrio, plato barato para romper.",
      },
      {
        title: "Cierre de campaña de aniversarios",
        kind: "RECORDATORIO",
        day: 12,
        allDay: true,
        location: null,
        description: "Último día para pedidos con anticipación.",
      },
    ];

    for (const e of AGENDA) {
      await prisma.calendarEvent.create({
        data: {
          title: e.title,
          kind: e.kind,
          description: e.description,
          startAt: daysFromToday(e.day, e.allDay ? 12 : (e.hour ?? 10)),
          allDay: e.allDay,
          location: e.location,
          brandId: brand.id,
          createdById: ana,
        },
      });
    }
    console.log(`  ${AGENDA.length} cosas en la agenda`);
  }

  /* --- Resumen --- */
  console.log("\nListo.\n");

  if (credentials.length) {
    console.log("Contraseñas generadas para el equipo (anótalas, no se vuelven a mostrar):");
    console.log("─".repeat(64));
    for (const c of credentials) {
      console.log(`  ${c.name.padEnd(20)} ${c.email.padEnd(24)} ${c.password}`);
    }
    console.log("─".repeat(64));
    console.log("Puedes cambiarlas desde /equipo cuando entres.\n");
  }

  console.log("No se creó ninguna cuenta de dueño a propósito.");
  console.log("Abre la app y crea la tuya en la primera pantalla.\n");
}

main()
  .catch((error) => {
    console.error("Falló el sembrado:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
