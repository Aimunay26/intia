/**
 * Catálogo Maestro de Referencias Enriquecidas para las 21 Estructuras de Contenido
 *
 * Cada estructura cuenta con:
 * - badge: Etiqueta visual distintiva con emoji para identificarla al instante.
 * - mentalModel: El principio psicológico y narrativo que hace funcionar el formato.
 * - hookStrategy: Cómo debe abrir en los segundos 0 a 3 para retener el scroll.
 * - retentionSecret: El combustible que sostiene la atención hasta el remate.
 * - keyRule: La regla de oro no negociable que el equipo debe respetar.
 * - recommendedAngles: Ángulos creativos que potencian esta estructura.
 * - hookExample: Ejemplo de gancho ganador probado en video vertical.
 */

export type StructureReference = {
  slug: string;
  name: string;
  badge: string;
  category: "VENDE" | "ENTRETIENE";
  mentalModel: string;
  hookStrategy: string;
  retentionSecret: string;
  keyRule: string;
  recommendedAngles: string[];
  hookExample: string;
};

export const STRUCTURE_REFERENCES: Record<string, StructureReference> = {
  "giro-emocional-plot-twist": {
    slug: "giro-emocional-plot-twist",
    name: "Giro Emocional (Plot Twist)",
    badge: "🌪️ Giro 180°",
    category: "VENDE",
    mentalModel:
      "Arranca con una tensión o agresión aparente (el espectador cree que presenciará una pelea, ruptura o reclamo) y en el segundo 20 gira 180° revelando una sorpresa de amor o detalle inolvidable.",
    hookStrategy:
      "Acción física discordante en el segundo cero (un portazo, una bolsa que cae, un reclamo en voz alta). Cero saludos o presentaciones a cámara.",
    retentionSecret:
      "La incertidumbre del objeto tapado o cerrado: nadie sabe qué hay dentro hasta el beat del giro.",
    keyRule:
      "El producto NUNCA entra antes del giro emocional; si se muestra antes, el video se percibe como anuncio y la audiencia se va.",
    recommendedAngles: ["impacto_visual", "ella_vs_ellos", "pov_situacion"],
    hookExample: "«¡Sueltas esa bolsa ahora mismo o llamo a tu mamá!» (Portazo en seco en el segundo 0)",
  },

  ugc: {
    slug: "ugc",
    name: "UGC (Contenido de Usuario Real)",
    badge: "🤳 100% Casero",
    category: "VENDE",
    mentalModel:
      "Estilo selfie casero con luz natural de ventana y audio ambiente sin ecualizar. Parece una confesión o descubrimiento espontáneo entre amigos, no una marca hablando.",
    hookStrategy:
      "Mirada cómplice a cámara y frase de descubrimiento fortuito: «Chicos, no les iba a decir nada de esto pero…»",
    retentionSecret:
      "Vulnerabilidad honesta: expone una objeción o duda real que casi le impide comprar antes de mostrar el resultado.",
    keyRule:
      "Cero lenguaje corporativo ni frases de folleto publicitario; se debe sentir 100% conversacional e imperfecto.",
    recommendedAngles: ["pov_situacion", "experimento", "anti_consejo"],
    hookExample: "«Pensé que era otra estafa de TikTok hasta que me llegó el paquete y pasó esto…»",
  },

  camaleon: {
    slug: "camaleon",
    name: "Camaleón (90% Contenido / 10% Venta al final)",
    badge: "🦎 90% Nativo / 10% Venta",
    category: "VENDE",
    mentalModel:
      "Regla estricta 90/10. El 90% de la duración es contenido orgánico de alto valor (un tutorial, receta, storytime o curiosidad) donde el usuario jamás sospecha venta. En el último 10%, el producto entra como la herramienta indispensable que resuelve lo expuesto.",
    hookStrategy:
      "Promesa de aprendizaje o truco nativo del feed que resuelve una molestia recurrente.",
    retentionSecret:
      "Valor práctico continuo en cada segundo; el espectador consume el video por utilidad pura.",
    keyRule:
      "Prohibido sonar a comercial o meter la marca en los primeros beats; solo entra de forma lógica y justificada en el remate.",
    recommendedAngles: ["camaleon", "hack_tutorial", "experimento"],
    hookExample: "«Si te pasa esto todos los días al organizar tus cosas, este truco te va a salvar la vida…»",
  },

  "ellos-vs-nosotros": {
    slug: "ellos-vs-nosotros",
    name: "Ellos vs Nosotros (Choque de Perspectivas y Mentalidades)",
    badge: "👫 Choque de visiones",
    category: "VENDE",
    mentalModel:
      "Choque de dos bandos: cómo un grupo (ej. mujeres, principiantes, la vieja escuela) piensa y hace las cosas vs cómo lo hace el otro bando (ej. hombres, expertos, la nueva ola). Detona debate masivo en comentarios por humor e identificación.",
    hookStrategy:
      "Contraste frontal inmediato entre los dos bandos planteando una situación reconocible.",
    retentionSecret:
      "El contraste cómico y exagerado entre la complicación de un lado frente a la practicidad del otro.",
    keyRule:
      "Prohibido nombrar competidores reales; el producto actúa como el punto de contraste evidente que demuestra la diferencia de mentalidades.",
    recommendedAngles: ["ella_vs_ellos", "parodia_sketch", "impacto_visual"],
    hookExample: "«Cómo usan esto las mujeres vs cómo creemos los hombres que se usa…»",
  },

  pas: {
    slug: "pas",
    name: "PAS (Problema, Agitación, Solución)",
    badge: "🩹 Agitación de dolor",
    category: "VENDE",
    mentalModel:
      "La fórmula clásica de copywriting directo: señala un dolor observable específico, echa sal en la herida mostrando el costo de postergarlo (agitación) y presenta el producto como el alivio definitivo.",
    hookStrategy:
      "Pregunta o afirmación visceral sobre un problema cotidiano concreto que no deja dormir al cliente.",
    retentionSecret:
      "La escalada de la agitación: describe con exactitud milimétrica la frustración cotidiana del espectador.",
    keyRule:
      "El problema debe ser específico y observable, nunca genérico; la solución debe ser alcanzable hoy mismo.",
    recommendedAngles: ["anti_consejo", "pov_situacion", "impacto_visual"],
    hookExample: "«Sigues perdiendo 2 horas cada fin de semana limpiando esto porque nadie te dijo la verdad…»",
  },

  "historia-de-fundador": {
    slug: "historia-de-fundador",
    name: "Historia de Fundador (Origen y Vulnerabilidad)",
    badge: "📖 Vulnerabilidad real",
    category: "VENDE",
    mentalModel:
      "Cero presunción empresarial. Arranca desde el punto más bajo o el momento de fracaso («En 2021 casi me rindo porque…»). Muestra cómo ese obstáculo forzó a crear la solución que hoy disfruta el cliente.",
    hookStrategy:
      "Confesión vulnerable sobre un error o fracaso inicial antes del éxito.",
    retentionSecret:
      "Empatía humana: la audiencia se conecta con quien tropieza y se levanta con honestidad.",
    keyRule:
      "Debe empezar por una vulnerabilidad real, nunca por un logro o vanidad empresarial; datos concretos y verificables.",
    recommendedAngles: ["storytime_confesion", "detras_de_camaras", "pov_situacion"],
    hookExample: "«El día que abrí mi taller perdí el 80% de mis ahorros por este error que casi me destruye…»",
  },

  testimonio: {
    slug: "testimonio",
    name: "Testimonio Real (Antes, Duda y Transformación)",
    badge: "🛡️ Escéptico convencido",
    category: "VENDE",
    mentalModel:
      "Lo que de verdad vende no es el elogio ciego, es la duda previa («La verdad pensé que no iba a servir y casi cancelo»). Al confesar su escepticismo inicial y contrastarlo con el cambio tangible, desarma todas las objeciones del espectador.",
    hookStrategy:
      "Confesión de escepticismo frontal que el público frío también siente en ese momento.",
    retentionSecret:
      "El momento exacto del clic: qué detalle específico le hizo confiar y el resultado contrastable.",
    keyRule:
      "Obligatorio incluir la objeción o duda previa a la compra; un testimonio que solo echa flores parece falso.",
    recommendedAngles: ["pov_situacion", "experimento", "hater_critica"],
    hookExample: "«Estuve a un clic de cancelar mi pedido pensando que era puro humo, hasta que llegó la caja…»",
  },

  "venta-directa": {
    slug: "venta-directa",
    name: "Venta Directa (3 Razones Irrefutables)",
    badge: "⚡ 3 Beneficios directos",
    category: "VENDE",
    mentalModel:
      "Para tráfico templado o caliente que ya sabe qué necesita. Qué es, las tres razones de peso comprobadas con tomas de producto y cómo pedirlo en un solo clic sin rodeos.",
    hookStrategy:
      "Presentación directa y segura de qué es el producto y a quién salva en una sola frase.",
    retentionSecret:
      "Demostración visual continua: cada beneficio se muestra en cámara en tiempo real con tomas macro.",
    keyRule:
      "Máximo tres beneficios; cada beneficio necesita su propia toma visual concreta que lo demuestre.",
    recommendedAngles: ["impacto_visual", "anti_consejo", "hack_tutorial"],
    hookExample: "«Si buscas un regalo que no termine en la basura a los 3 días, necesitas ver estas 3 cosas…»",
  },

  "oferta-directa": {
    slug: "oferta-directa",
    name: "Oferta Directa (Reloj, Cupos y Bono de Hormozi)",
    badge: "⏰ Oferta con reloj",
    category: "VENDE",
    mentalModel:
      "Conversión pura para fechas especiales o campañas. Anuncia la oferta en el segundo 2, desglosa el stack de valor (lo que se lleva gratis de regalo) y aplica escasez o urgencia real inamovible.",
    hookStrategy:
      "Enunciado claro de la oferta o condición exclusiva antes del segundo 3.",
    retentionSecret:
      "El valor acumulado: ir sumando bonus y regalos en pantalla hasta hacer la oferta irresistible.",
    keyRule:
      "Prohibido inventar falsas fechas límite o falso stock; la escasez debe ser ética y real para sostener confianza.",
    recommendedAngles: ["impacto_visual", "camaleon", "anti_consejo"],
    hookExample: "«Solo por este fin de semana: te llevas el pack completo y te regalamos la personalización…»",
  },

  "voz-en-off": {
    slug: "voz-en-off",
    name: "Video con Voz en Off (Bucle Narrativo y Macro)",
    badge: "🎙️ Bucle visual",
    category: "VENDE",
    mentalModel:
      "Narración envolvente y cinematográfica sobre una secuencia hipnótica de planos de producto. Abre una pregunta o bucle mental al inicio y no la resuelve hasta el último segundo.",
    hookStrategy:
      "Una frase que abra un misterio mental mientras la cámara muestra un plano macro en movimiento.",
    retentionSecret:
      "Sincronía perfecta entre lo que se escucha y el corte visual; cada palabra tiene una toma exacta asignada.",
    keyRule:
      "La pregunta o misterio planteado en la entrada DEBE responderse explícitamente antes del cierre.",
    recommendedAngles: ["impacto_visual", "unboxing_asmr", "camaleon"],
    hookExample: "«Hay una razón por la que las mejores marcas nunca te muestran este lado del empaque…»",
  },

  unboxing: {
    slug: "unboxing",
    name: "Unboxing Sensorial (ASMR y Experiencia)",
    badge: "📦 ASMR sensorial",
    category: "VENDE",
    mentalModel:
      "Vende la mitad del valor del producto: la emoción infantil de abrir un paquete nuevo. Enfatiza el sonido crujiente del corte, los aromas, el tacto del papel y la primera impresión al tocar el producto.",
    hookStrategy:
      "El paquete sellado sobre la mesa y el filo de la tijera o el desgarre del precinto en primer plano.",
    retentionSecret:
      "El ritmo pausado y sensorial (ASMR): sin cortes bruscos ni música que tape los sonidos reales.",
    keyRule:
      "Cada beat debe especificar el sonido real que se escucha en cámara; cero música ruidosa que tape el empaque.",
    recommendedAngles: ["unboxing_asmr", "impacto_visual", "pov_situacion"],
    hookExample: "(Sonido crujiente de cinta adhesiva abriéndose) «Llegó el pedido de Karen y no pude resistirme…»",
  },

  "como-se-usa": {
    slug: "como-se-usa",
    name: "Cómo se usa / Tutorial (Resultado Primero y Hack Rápido)",
    badge: "🛠️ Hack en 3 pasos",
    category: "VENDE",
    mentalModel:
      "Enseña el resultado final en los primeros 3 segundos («Así es como te tiene que quedar»). Luego guía el paso a paso numerado advirtiendo el error común que todos cometen. Elimina el miedo a no saber usarlo.",
    hookStrategy:
      "Mostrar el resultado perfecto terminado en la toma 1 antes de explicar cómo se logró.",
    retentionSecret:
      "Pasos ultra-sencillos numerados en pantalla; cada paso dura menos de 7 segundos.",
    keyRule:
      "El resultado final se muestra en los primeros 5 segundos; obligatorio incluir el error típico a evitar.",
    recommendedAngles: ["hack_tutorial", "camaleon", "anti_consejo"],
    hookExample: "«Así es como logras este acabado en 30 segundos sin gastar de más…»",
  },

  "antes-y-despues": {
    slug: "antes-y-despues",
    name: "Antes y Después (Mismo Encuadre y Transformación)",
    badge: "🔄 Mismo encuadre",
    category: "VENDE",
    mentalModel:
      "La prueba visual definitiva. El antes debe ser crudo y honesto (sin exagerar ni trucar la luz). Se muestra el proceso acelerado y la transición al después en exactamente el mismo ángulo de cámara.",
    hookStrategy:
      "El estado inicial sin filtros en plano fijo y la promesa del cambio.",
    retentionSecret:
      "El montaje dinámico del proceso: ver las manos trabajando a velocidad transmite oficio y valor.",
    keyRule:
      "El antes y el después DEBEN grabarse con el mismo encuadre, distancia y tipo de lente; prohibido trucar.",
    recommendedAngles: ["impacto_visual", "experimento", "detras_de_camaras"],
    hookExample: "«Miren cómo llegó esta pieza rota y miren cómo va a salir en 10 minutos…»",
  },

  "respondiendo-comentarios": {
    slug: "respondiendo-comentarios",
    name: "Respondiendo Comentarios (Desarmar Crítica con Prueba)",
    badge: "💬 Desarmar crítica",
    category: "VENDE",
    mentalModel:
      "Coloca en pantalla la captura de un comentario escéptico o duro («¿Por qué cuesta tanto?», «Seguro se rompe»). Reacciona con naturalidad y amabilidad, y responde con una prueba visual en vivo en vez de excusas.",
    hookStrategy:
      "El sticker o captura del comentario polémico bien legible en el centro de la pantalla.",
    retentionSecret:
      "El morbo de ver cómo la marca maneja la crítica: la audiencia espera una discusión y recibe una prueba irrefutable.",
    keyRule:
      "Elegir objeciones y comentarios retadores reales, nunca auto-elogios; toda respuesta se apoya en demostración física.",
    recommendedAngles: ["hater_critica", "anti_consejo", "impacto_visual"],
    hookExample: "«Alguien me dejó este comentario diciendo que nuestro empaque no resiste los envíos… vamos a probarlo.»",
  },

  "meme-anuncio-divertido": {
    slug: "meme-anuncio-divertido",
    name: "Meme / Anuncio Divertido (Escalada Absurda)",
    badge: "😂 Escalada cómica",
    category: "VENDE",
    mentalModel:
      "Toma un formato o sonido de humor en tendencia y mete la marca como el cómplice del chiste. La situación cotidiana empeora en 3 niveles hasta un remate cómico donde el producto brilla.",
    hookStrategy:
      "Setup cotidiano hiper-reconocible planteado en texto en pantalla en menos de 3 segundos.",
    retentionSecret:
      "La escalada cómica: cada segundo es más absurdo que el anterior.",
    keyRule:
      "Duración máxima de 25 segundos; el chiste debe sostenerse por sí solo y el CTA debe ser de una sola línea.",
    recommendedAngles: ["parodia_sketch", "ella_vs_ellos", "pov_situacion"],
    hookExample: "«Mi estabilidad emocional dependiendo enteramente de que este pedido llegue a tiempo hoy…»",
  },

  "explicando-beneficios": {
    slug: "explicando-beneficios",
    name: "Explicando Beneficios («¿Por qué cuesta lo que cuesta?»)",
    badge: "💎 Justificación de precio",
    category: "VENDE",
    mentalModel:
      "Justifica el valor de cada centavo. Traduce cada característica técnica a una emoción o tranquilidad en la vida real del cliente («Esto tiene costura reforzada, lo que significa que no se te va a descoser en medio evento»).",
    hookStrategy:
      "Pregunta directa sobre el precio o la calidad: «¿Por qué este producto cuesta el doble que el genérico?»",
    retentionSecret:
      "La fórmula 'Esto tiene X… lo que para ti significa Y'; el espectador entiende el ahorro de dolores de cabeza a largo plazo.",
    keyRule:
      "Cada característica técnica DEBE traducirse a un beneficio cotidiano; máximo 3 características por guion.",
    recommendedAngles: ["anti_consejo", "impacto_visual", "hater_critica"],
    hookExample: "«Mucha gente me pregunta por qué cobramos esto por una caja personalizada… miren lo que hay por dentro.»",
  },

  pov: {
    slug: "pov",
    name: "POV (Perspectiva en Primera Persona)",
    badge: "👀 En primera persona",
    category: "VENDE",
    mentalModel:
      "La cámara son los ojos del espectador viviendo una situación incómoda o emocionante («POV: Es tu aniversario, son las 7 pm y no compraste nada»). Genera empatía visceral inmediata.",
    hookStrategy:
      "Rótulo POV específico y dramático en pantalla desde el segundo cero.",
    retentionSecret:
      "La sensación inmersiva de cámara en mano: no hay presentador ni narrador externo, todo ocurre en tiempo real.",
    keyRule:
      "El rótulo POV debe ser hiper-específico; la cámara debe mantener la perspectiva en primera persona durante todo el video.",
    recommendedAngles: ["pov_situacion", "ella_vs_ellos", "parodia_sketch"],
    hookExample: "«POV: Tu novia te dice tranquilízate, no quiero nada para nuestro cumplemes pero tú sabes la verdad…»",
  },

  "vlog-de-marca": {
    slug: "vlog-de-marca",
    name: "Vlog de Marca (Taller con Imprevisto Real)",
    badge: "🏭 Taller con imprevisto",
    category: "VENDE",
    mentalModel:
      "Humaniza la marca mostrando el taller o almacén real sin poses. Incluye un error o imprevisto auténtico del día y cómo se resolvió con cariño para un cliente real con nombre y apellido.",
    hookStrategy:
      "Situar la hora y el lugar de arranque: «Son las 6:30 am en el taller y hoy tenemos que sacar 15 pedidos especiales.»",
    retentionSecret:
      "La transparencia radical: mostrar que detrás de los productos hay personas de carne y hueso que se preocupan.",
    keyRule:
      "Debe incluir un imprevisto o error real del día; un vlog donde todo sale perfecto resulta frío y comercial.",
    recommendedAngles: ["detras_de_camaras", "storytime_confesion", "pov_situacion"],
    hookExample: "«Casi arruinamos el pedido de bodas de Valentina… les muestro cómo tuvimos que correr para salvarlo.»",
  },

  vlog: {
    slug: "vlog",
    name: "Vlog Orgánico (Comunidad y Vida del Equipo)",
    badge: "☕ 0% Venta orgánico",
    category: "ENTRETIENE",
    mentalModel:
      "Entretenimiento y comunidad pura sin intenciones comerciales. Muestra la vibra del equipo, almuerzos, retos internos y momentos divertidos para alimentar el algoritmo y fidelizar a la audiencia.",
    hookStrategy:
      "Dilema cómico o situación curiosa del equipo al iniciar la jornada.",
    retentionSecret:
      "La dinámica natural y espontánea entre los miembros del equipo; momentos graciosos genuinos.",
    keyRule:
      "Prohibido cualquier llamado a la acción comercial o venta; el producto puede verse de fondo pero no se promociona.",
    recommendedAngles: ["detras_de_camaras", "parodia_sketch", "pov_situacion"],
    hookExample: "«Le dijimos a Marcos que hoy no se trabajaba y vino vestido de gala al taller…»",
  },

  sketch: {
    slug: "sketch",
    name: "Sketch Cómico (Mini-Comedia Cotidiana)",
    badge: "🎭 Mini-comedia x3",
    category: "ENTRETIENE",
    mentalModel:
      "Mini-comedia actuada con personajes arquetípicos reconocibles (la pareja distraída, el cliente indeciso, el jefe exigente). El conflicto sube en 3 niveles de tensión y remata en un chiste memorable sin moraleja.",
    hookStrategy:
      "Presentar el personaje con un gesto o muletilla graciosa en menos de 4 segundos.",
    retentionSecret:
      "La escalada en tres pasos: la situación pasa de incómoda a insostenible y ridícula.",
    keyRule:
      "Prohibido meter cuñas publicitarias; el video corta inmediatamente tras el remate para maximizar repetición.",
    recommendedAngles: ["parodia_sketch", "ella_vs_ellos", "pov_situacion"],
    hookExample: "«El cliente que te pide descuento pero llega en camioneta del año…»",
  },

  "camara-escondida": {
    slug: "camara-escondida",
    name: "Cámara Escondida (Broma Sana con Sorpresa)",
    badge: "🎁 Broma con sorpresa",
    category: "ENTRETIENE",
    mentalModel:
      "Reacción auténtica de personas en la calle o clientes ante una sorpresa o situación inusual. Broma 100% respetuosa que culmina en una sonrisa, un abrazo o un regalo inesperado.",
    hookStrategy:
      "Susurrar el plan al espectador mientras se ajusta la cámara oculta.",
    retentionSecret:
      "El morbo de ver la reacción genuina sin cortes de la persona antes de enterarse.",
    keyRule:
      "La broma jamás humilla ni asusta peligrosamente; obligatorio mostrar la revelación y pedir permiso de publicación.",
    recommendedAngles: ["experimento", "pov_situacion", "impacto_visual"],
    hookExample: "«Le dejamos esta caja misteriosa en la banca a ver qué hacía la gente al ver que decía Ábreme si necesitas amor…»",
  },
};

export function getStructureReference(slugOrName: string): StructureReference {
  const norm = (slugOrName || "").toLowerCase().trim();
  if (STRUCTURE_REFERENCES[norm]) return STRUCTURE_REFERENCES[norm];

  const foundBySlug = Object.values(STRUCTURE_REFERENCES).find(
    (s) => s.slug === norm || norm.includes(s.slug) || s.slug.includes(norm)
  );
  if (foundBySlug) return foundBySlug;

  const foundByName = Object.values(STRUCTURE_REFERENCES).find((s) =>
    s.name.toLowerCase().includes(norm) || norm.includes(s.name.toLowerCase())
  );
  if (foundByName) return foundByName;

  return {
    slug: norm,
    name: slugOrName,
    badge: "⚡ Formato",
    category: "VENDE",
    mentalModel: "Estructura ganadora diseñada para capturar atención y guiar la narrativa paso a paso.",
    hookStrategy: "Detener el scroll en los primeros 3 segundos con un estímulo concreto.",
    retentionSecret: "Ritmo dinámico y progresión clara entre beats sin relleno.",
    keyRule: "Mantener el orden emocional de los beats sin saltarse pasos.",
    recommendedAngles: ["camaleon", "impacto_visual", "ella_vs_ellos"],
    hookExample: "«Antes de que pases este video, tienes que ver lo que pasó…»",
  };
}
