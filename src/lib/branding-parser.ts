/**
 * Parsers deterministas de los dos PDF que genera Ai Munay:
 *
 *  - «INFORME DE BRANDING» de una persona → campos de Archetype (marca personal).
 *  - «BRIEF MAESTRO DE MARCA» de un negocio → campos de Brand (preprompt de empresa).
 *
 * Reglas de la casa:
 *  - No se inventa nada. Lo que no está en el PDF se devuelve vacío y con
 *    fuente «vacio», nunca con un texto de relleno.
 *  - El parser no escribe en la base: solo propone campos. Quien escribe son
 *    las acciones ya auditadas (crearMarca, actualizarMarca, crearArquetipo…).
 *  - Es puro: sin dependencias, para poder probarlo con `node --test`.
 *
 * El texto de entrada debe venir ya limpio (src/lib/pdf.ts → limpiarTextoInforme):
 * encabezados juntos y en línea propia, sin marcadores de página.
 */

export type Fuente = "pdf" | "ia" | "vacio";
export type TipoDocumento = "brief" | "branding";

/** Etiqueta con la que se guarda cada PDF como Asset (no hay columna «kind»). */
export const ETIQUETA_DOCUMENTO: Record<TipoDocumento, string> = {
  brief: "Brief maestro",
  branding: "Informe de branding",
};

export type ColorPaleta = { name: string; hex: string };

/** Lo que el brief maestro puede rellenar en Brand. */
export type MarcaCampos = {
  name: string;
  tagline: string;
  description: string;
  identity: string;
  brief: string;
  toneOfVoice: string;
  audience: string;
  valueProps: string[];
  doNots: string[];
  keywords: string[];
  instagram: string;
  tiktok: string;
  website: string;
  whatsapp: string;
  colorPrimary: string;
  colorSecondary: string;
  colorAccent: string;
};

/** Lo que el informe de branding puede rellenar en Archetype. */
export type PersonaCampos = {
  name: string;
  summary: string;
  personality: string;
  strengths: string[];
  avoid: string[];
  toneKeywords: string[];
  brandingNotes: string;
  color: string;
  archetypePrimary: string;
  archetypeSecondary: string;
  archetypeTertiary: string;
  archetypeSummary: string;
  coreDesire: string;
  coreFear: string;
  coreTalent: string;
  coreTrap: string;
  evolveToward: string;
  watchOut: string;
  coherenceIndex: number | null;
  voiceTone: string;
  messageStructure: string;
  vocabulary: string[];
  avoidInVoice: string[];
  soundsLike: string;
  sameArchetypeIcons: string[];
  palette: ColorPaleta[];
  typography: string;
  aesthetics: string;
  visualAvoid: string;
};

export type Fuentes<T> = Record<keyof T, Fuente>;

export type Extraido<T> = {
  campos: T;
  fuentes: Fuentes<T>;
  avisos: string[];
};

export const MARCA_VACIA: MarcaCampos = {
  name: "",
  tagline: "",
  description: "",
  identity: "",
  brief: "",
  toneOfVoice: "",
  audience: "",
  valueProps: [],
  doNots: [],
  keywords: [],
  instagram: "",
  tiktok: "",
  website: "",
  whatsapp: "",
  colorPrimary: "",
  colorSecondary: "",
  colorAccent: "",
};

export const PERSONA_VACIA: PersonaCampos = {
  name: "",
  summary: "",
  personality: "",
  strengths: [],
  avoid: [],
  toneKeywords: [],
  brandingNotes: "",
  color: "",
  archetypePrimary: "",
  archetypeSecondary: "",
  archetypeTertiary: "",
  archetypeSummary: "",
  coreDesire: "",
  coreFear: "",
  coreTalent: "",
  coreTrap: "",
  evolveToward: "",
  watchOut: "",
  coherenceIndex: null,
  voiceTone: "",
  messageStructure: "",
  vocabulary: [],
  avoidInVoice: [],
  soundsLike: "",
  sameArchetypeIcons: [],
  palette: [],
  typography: "",
  aesthetics: "",
  visualAvoid: "",
};

/** Copias frescas: los arrays de las constantes de arriba no se deben mutar. */
export function marcaVacia(): MarcaCampos {
  return { ...MARCA_VACIA, valueProps: [], doNots: [], keywords: [] };
}

export function personaVacia(): PersonaCampos {
  return {
    ...PERSONA_VACIA,
    strengths: [],
    avoid: [],
    toneKeywords: [],
    vocabulary: [],
    avoidInVoice: [],
    sameArchetypeIcons: [],
    palette: [],
  };
}

/* ---------------------------------------------------------------- APOYOS -- */

export function estaVacio(valor: unknown): boolean {
  if (valor === null || valor === undefined) return true;
  if (typeof valor === "string") return valor.trim().length === 0;
  if (Array.isArray(valor)) return valor.length === 0;
  return false;
}

/** Marca la fuente de cada campo según venga lleno o vacío. */
export function fuentesDe<T extends object>(campos: T, fuente: Fuente = "pdf"): Fuentes<T> {
  const out: Partial<Fuentes<T>> = {};
  for (const clave of Object.keys(campos) as (keyof T)[]) {
    out[clave] = estaVacio(campos[clave]) ? "vacio" : fuente;
  }
  return out as Fuentes<T>;
}

function unaLinea(texto: string): string {
  return texto
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function sinPuntoFinal(texto: string): string {
  return texto.replace(/[.\s]+$/g, "").trim();
}

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[¿?¡!:]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function lineas(texto: string): string[] {
  return texto.split("\n").map((l) => l.trim());
}

function escapar(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Devuelve el bloque que va desde la línea `desde` (exacta) hasta la primera
 * línea que sea uno de los `hasta` (exactos). Si no encuentra el inicio, "".
 */
function bloque(texto: string, desde: string, hasta: string[]): string {
  const ls = lineas(texto);
  const inicio = ls.findIndex((l) => l === desde);
  if (inicio < 0) return "";
  const fin = ls.findIndex((l, i) => i > inicio && hasta.includes(l));
  return ls.slice(inicio + 1, fin < 0 ? undefined : fin).join("\n").trim();
}

/** Texto tras «Etiqueta:» hasta la siguiente etiqueta o encabezado de la lista. */
function etiquetado(texto: string, etiqueta: string, hasta: string[]): string {
  const parada = hasta.map(escapar).join("|");
  // Sin la bandera «m»: el «$» debe ser el final del texto, no el de la línea,
  // porque «Su trampa:» y «Evita:» ocupan varias líneas en el PDF.
  const regex = new RegExp(`(?:^|\\n)${escapar(etiqueta)}\\s*(.*?)(?=\\n(?:${parada})|$)`, "s");
  const m = texto.match(regex);
  return m ? unaLinea(m[1]) : "";
}

function separar(texto: string, separador: RegExp): string[] {
  return texto
    .split(separador)
    .map((s) => sinPuntoFinal(s.trim()))
    .filter((s) => s.length > 0);
}

/* ------------------------------------------------------------ DETECCIÓN -- */

export function detectarTipoDocumento(texto: string): TipoDocumento | null {
  const ls = lineas(texto);
  if (ls.includes("BRIEF MAESTRO DE MARCA") || contarPreguntasBrief(ls) >= 5) return "brief";
  if (
    ls.includes("INFORME DE BRANDING") ||
    ls.includes("ARQUETIPO PRIMARIO") ||
    /Índice de coherencia:/.test(texto)
  ) {
    return "branding";
  }
  return null;
}

/* ------------------------------------------------ INFORME DE BRANDING -- */

/** Los 12 arquetipos de Mark y Pearson, con las tildes opcionales. */
const ARQUETIPOS =
  "Gobernante|Forajido|H[eé]roe|Buf[oó]n|Mago|Creador|Cuidador|Explorador|Sabio|Inocente|Amante|Hombre (?:corriente|com[uú]n)";
const ARQUETIPO = `(?:El|La)\\s+(?:${ARQUETIPOS})`;

const ENCABEZADOS_INFORME = [
  "INFORME DE BRANDING",
  "TU ARQUETIPO",
  "ARQUETIPO PRIMARIO",
  "ARQUETIPO SECUNDARIO",
  "ARQUETIPO TERCIARIO",
  "HACIA DÓNDE EVOLUCIONAR",
  "ÍNDICE DE DEFINICIÓN",
  "LO QUE DEBERÍAS VIGILAR",
  "COMUNICACIÓN",
  "TONO",
  "ESTRUCTURA DEL MENSAJE",
  "VOCABULARIO",
  "EVITA",
  "SUENA ASÍ",
  "MARCAS DE TU MISMO ARQUETIPO",
  "ICONOS DE TU MISMO ARQUETIPO",
  "VISUAL",
  "REFERENTES",
  "ACCIONES",
  "ÍNDICE DE AUDACIA",
  "NOTA METODOLÓGICA",
];

function trioDePortada(texto: string): [string, string, string] {
  const regex = new RegExp(`(${ARQUETIPO})\\s*·\\s*(${ARQUETIPO})\\s*·\\s*(${ARQUETIPO})`);
  const m = texto.match(regex);
  if (!m) return ["", "", ""];
  return [m[1].trim(), m[2].trim(), m[3].trim()];
}

function arquetipoBajo(texto: string, encabezado: string): string {
  const ls = lineas(texto);
  const i = ls.indexOf(encabezado);
  if (i < 0 || !ls[i + 1]) return "";
  const m = ls[i + 1].match(new RegExp(`^${ARQUETIPO}$`));
  return m ? m[0] : "";
}

export function parseInformeBranding(texto: string): Extraido<PersonaCampos> {
  const avisos: string[] = [];
  const ls = lineas(texto);
  const campos = personaVacia();

  // Nombre: la línea anterior a «INFORME DE BRANDING».
  const informeIdx = ls.indexOf("INFORME DE BRANDING");
  if (informeIdx > 0) {
    const anterior = ls[informeIdx - 1];
    if (anterior && anterior.length <= 40 && !anterior.includes("·")) campos.name = anterior;
  }
  if (!campos.name) avisos.push("No se encontró el nombre de la persona en la portada del informe.");

  // Trío de arquetipos: portada, confirmado por las secciones.
  const [p, s, t] = trioDePortada(texto);
  campos.archetypePrimary = arquetipoBajo(texto, "ARQUETIPO PRIMARIO") || p;
  campos.archetypeSecondary = arquetipoBajo(texto, "ARQUETIPO SECUNDARIO") || s;
  campos.archetypeTertiary = arquetipoBajo(texto, "ARQUETIPO TERCIARIO") || t;

  // Qué representa: párrafo bajo el arquetipo primario hasta «Deseo central:».
  const primario = bloque(texto, "ARQUETIPO PRIMARIO", ["HACIA DÓNDE EVOLUCIONAR", "ARQUETIPO SECUNDARIO"]);
  if (primario) {
    const sinTitulo = primario.replace(new RegExp(`^${ARQUETIPO}\\n?`), "");
    const resumen = sinTitulo.split(/\nDeseo central:/)[0];
    campos.archetypeSummary = unaLinea(resumen);
    campos.personality = campos.archetypeSummary;

    const ETIQUETAS = ["Deseo central:", "Miedo central:", "Tu talento:", "Su talento:", "Su trampa:"];
    campos.coreDesire = etiquetado(sinTitulo, "Deseo central:", ETIQUETAS);
    campos.coreFear = etiquetado(sinTitulo, "Miedo central:", ETIQUETAS);
    campos.coreTalent =
      etiquetado(sinTitulo, "Tu talento:", ETIQUETAS) || etiquetado(sinTitulo, "Su talento:", ETIQUETAS);
    campos.coreTrap = etiquetado(sinTitulo, "Su trampa:", ETIQUETAS);
  }

  campos.evolveToward = unaLinea(
    bloque(texto, "HACIA DÓNDE EVOLUCIONAR", ["ARQUETIPO SECUNDARIO", "ARQUETIPO TERCIARIO", "TU ARQUETIPO"])
  );

  const coherencia = texto.match(/Índice de coherencia:\s*([\d.,]+)/i);
  if (coherencia) {
    const n = parseFloat(coherencia[1].replace(",", "."));
    if (Number.isFinite(n)) campos.coherenceIndex = n;
  }

  // Lo que deberías vigilar: se salta la frase introductoria del informe.
  const vigilar = bloque(texto, "Lo que deberías vigilar", ["LO QUE DEBERÍAS VIGILAR", "Comunicación"]);
  if (vigilar) {
    const lineasVigilar = lineas(vigilar).filter(
      (l) => l && !/^Esta es la parte que un test/i.test(l)
    );
    campos.watchOut = lineasVigilar.join(" ").replace(/\s+/g, " ").trim();
  }

  // Comunicación.
  campos.voiceTone = unaLinea(bloque(texto, "TONO", ENCABEZADOS_INFORME));
  campos.messageStructure = unaLinea(bloque(texto, "ESTRUCTURA DEL MENSAJE", ENCABEZADOS_INFORME));
  campos.vocabulary = separar(unaLinea(bloque(texto, "VOCABULARIO", ENCABEZADOS_INFORME)), /\s*[·•]\s*/);
  const evita = unaLinea(bloque(texto, "EVITA", ENCABEZADOS_INFORME));
  campos.avoidInVoice = separar(evita, /,\s*|\s+y\s+(?=[a-záéíóúñ])/i);
  const suena = unaLinea(bloque(texto, "SUENA ASÍ", ENCABEZADOS_INFORME));
  campos.soundsLike = suena.replace(/^[«"“]+/, "").replace(/[»"”]+$/, "").trim();
  campos.sameArchetypeIcons = [
    ...separar(unaLinea(bloque(texto, "MARCAS DE TU MISMO ARQUETIPO", ENCABEZADOS_INFORME)), /\s*[·•]\s*/),
    ...separar(unaLinea(bloque(texto, "ICONOS DE TU MISMO ARQUETIPO", ENCABEZADOS_INFORME)), /\s*[·•]\s*/),
  ];

  // Visual: SOLO la paleta «La tuya». Las otras dos son alternativas del informe.
  const tuya = ls.findIndex((l) => /^La tuya\b/.test(l));
  if (tuya >= 0) {
    const fin = ls.findIndex(
      (l, i) => i > tuya && (/^La del arquetipo\b/.test(l) || /^La polarizante\b/.test(l) || l === "Tipografía")
    );
    const cuerpo = ls.slice(tuya + 1, fin < 0 ? undefined : fin);
    for (let i = 0; i < cuerpo.length; i++) {
      const hex = cuerpo[i].match(/^#([0-9a-fA-F]{6})$/);
      if (!hex) continue;
      const nombre = i > 0 && !/^#/.test(cuerpo[i - 1]) ? cuerpo[i - 1] : "";
      campos.palette.push({ name: nombre || `#${hex[1]}`, hex: `#${hex[1].toUpperCase()}` });
    }
  }
  if (campos.palette.length) campos.color = campos.palette[0].hex.toLowerCase();

  const titulares = ls.find((l) => /^Titulares:/.test(l));
  const textoTipo = ls.find((l) => /^Texto:/.test(l));
  campos.typography = [titulares, textoTipo]
    .filter((x): x is string => Boolean(x))
    .map((x) => sinPuntoFinal(x))
    .join(". ");
  if (campos.typography) campos.typography += ".";

  const estetica = bloque(texto, "Estética", ["VISUAL", "Referentes", "REFERENTES"]);
  if (estetica) {
    const texturas = etiquetado(estetica, "Texturas:", ["Evita:"]);
    const evitaVisual = etiquetado(estetica, "Evita:", ["Texturas:"]);
    const cuerpo = unaLinea(estetica.split(/\n(?:Texturas:|Evita:)/)[0]);
    campos.aesthetics = [cuerpo, texturas ? `Texturas: ${texturas}` : ""].filter(Boolean).join("\n");
    campos.visualAvoid = evitaVisual;
  }

  // Acciones: notas de branding (opcional, todo literal del informe).
  const hace = ls.findIndex((l) => /^Lo que hace (?:El|La)\s/.test(l));
  if (hace >= 0) {
    const fin = ls.findIndex((l, i) => i > hace && (l === "•" || l === "ACCIONES" || l === "Nota metodológica"));
    const acciones = ls.slice(hace + 1, fin < 0 ? undefined : fin).filter(Boolean);
    const audaciaIdx = ls.indexOf("ÍNDICE DE AUDACIA");
    let audaciaTexto = "";
    if (audaciaIdx >= 0 && audaciaIdx < hace) {
      const cuerpo = ls.slice(audaciaIdx + 1, hace);
      // La primera línea llega como «— A U D A Z ( 9 6 . 4 / 1 0 0 )»: se junta.
      if (cuerpo[0] && /^[—-]/.test(cuerpo[0])) {
        cuerpo[0] = cuerpo[0].replace(/\s+/g, "").replace(/^[—-]+/, "").replace(/\(/, " (") + ".";
      }
      audaciaTexto = unaLinea(cuerpo.join("\n"));
    }
    campos.brandingNotes = [
      audaciaTexto ? `Índice de audacia: ${audaciaTexto}` : "",
      acciones.length ? `${ls[hace]}:\n${acciones.map((a) => `- ${a}`).join("\n")}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  // Derivados del perfil (sin inventar: todo sale de frases del informe).
  const trio = [campos.archetypePrimary, campos.archetypeSecondary, campos.archetypeTertiary]
    .filter(Boolean)
    .join(" · ");
  campos.summary = (campos.soundsLike || trio).slice(0, 160);
  campos.strengths = campos.coreTalent ? separar(campos.coreTalent, /,\s*/) : [];
  campos.avoid = [...campos.avoidInVoice];
  const primeraFrase = campos.voiceTone.split(/\.\s/)[0] ?? "";
  campos.toneKeywords = primeraFrase && primeraFrase.length <= 80 ? separar(primeraFrase, /,\s*|\s+y\s+/) : [];

  if (!campos.voiceTone) avisos.push("El informe no trae la sección TONO: la voz queda vacía.");
  if (!campos.palette.length) avisos.push("No se encontró la paleta «La tuya» del informe.");

  return { campos, fuentes: fuentesDe(campos), avisos };
}

/* --------------------------------------------------- BRIEF MAESTRO -- */

/**
 * Catálogo cerrado de preguntas del brief (86 vistas). Se comparan sin
 * tildes ni signos, así que un cambio de acento en el PDF no rompe nada.
 */
const PREGUNTAS_BRIEF = [
  "¿CUÁL ES EL NOMBRE COMERCIAL DE LA MARCA?",
  "RAZÓN SOCIAL",
  "RUC",
  "NOMBRE DEL REPRESENTANTE LEGAL",
  "DIRECCIÓN PRINCIPAL Y SUCURSALES",
  "¿HACE CUÁNTOS AÑOS OPERAN?",
  "PÁGINA WEB Y REDES SOCIALES ACTUALES",
  "¿CON QUIÉN COORDINAMOS EL DÍA A DÍA?",
  "¿QUIÉNES SON Y QUÉ HACEN?",
  "¿POR QUÉ LO HACEN?",
  "¿CÓMO Y CUÁNDO EMPEZARON?",
  "¿A DÓNDE LES GUSTARÍA LLEGAR COMO MARCA?",
  "¿QUÉ PLANES TIENEN PARA EL FUTURO?",
  "¿QUÉ VENDEN?",
  "LINK AL CATÁLOGO O LISTA DE PRECIOS",
  "¿QUÉ PROBLEMA LE SOLUCIONAN AL CLIENTE?",
  "¿QUÉ ES LO QUE MÁS VENDEN?",
  "¿QUÉ PRODUCTO O SERVICIO QUIEREN IMPULSAR MÁS?",
  "TICKET PROMEDIO Y RANGO DE PRECIOS",
  "TEMPORADAS ALTAS, BAJAS Y FECHAS CLAVE DEL AÑO",
  "DE CADA 10 VENTAS DEL MES PASADO, ¿CUÁNTAS FUERON DE CADA PRODUCTO O LÍNEA?",
  "¿UN CLIENTE TÍPICO LES VUELVE A COMPRAR? ¿CADA CUÁNTO TIEMPO?",
  "¿CUÁLES FUERON SUS 3 MEJORES Y SUS 3 PEORES MESES DEL ÚLTIMO AÑO?",
  "SI EL PRÓXIMO MES LLEGARA EL DOBLE DE PEDIDOS, ¿PODRÍAN ATENDERLOS?",
  "HOY, ¿DE DÓNDE LLEGA LA MAYORÍA DE SUS CLIENTES?",
  "DESCRIBAN A SU CLIENTE IDEAL",
  "¿QUÉ LOS MOTIVA A COMPRAR?",
  "¿QUÉ LOS FRENA ANTES DE COMPRAR?",
  "¿CUÁLES SON LAS PREGUNTAS QUE LES HACEN TODOS LOS DÍAS?",
  "¿QUÉ DICEN LOS CLIENTES CONTENTOS?",
  "¿QUIÉNES SON SUS PRINCIPALES COMPETIDORES?",
  "¿QUÉ HACE BIEN LA COMPETENCIA?",
  "¿POR QUÉ UN CLIENTE DEBERÍA COMPRARLES A USTEDES Y NO A OTRO?",
  "CUANDO ALGUIEN NO LES COMPRA, ¿QUÉ HACE EN SU LUGAR?",
  "¿QUÉ CUENTAS O MARCAS LES GUSTA CÓMO COMUNICAN?",
  "¿HAY ALGÚN COMPETIDOR AL QUE NO QUIEREN PARECERSE?",
  "¿QUÉ HAN HECHO ANTES PARA CONSEGUIR CLIENTES?",
  "¿TRABAJARON ANTES CON UNA AGENCIA, COMMUNITY MANAGER O FREELANCER?",
  "¿ALGUNA VEZ LES BLOQUEARON O RESTRINGIERON UNA PÁGINA, CUENTA O ANUNCIO?",
  "DE TODO LO QUE YA PROBARON, ¿QUÉ FUNCIONÓ Y QUÉ NO REPETIRÍAN?",
  "¿QUÉ REDES SOCIALES USAN ACTUALMENTE?",
  "¿CUÁL LES FUNCIONA MEJOR HOY Y POR QUÉ?",
  "¿INVIERTEN EN PUBLICIDAD PAGADA (PAUTA)?",
  "SI HACEN PAUTA: ¿DÓNDE, CUÁNTO Y CON QUÉ RESULTADOS?",
  "¿QUÉ FORMATOS USAN O LES INTERESA USAR?",
  "¿VENDEN EN MARKETPLACES?",
  "¿DÓNDE SE CONCRETA LA VENTA?",
  "¿POR QUÉ CANALES ATIENDEN A SUS CLIENTES?",
  "¿QUIÉN RESPONDE, EN QUÉ HORARIO Y CUÁNTO DEMORA?",
  "¿HACEN DELIVERY?",
  "COSTOS Y CONDICIONES DEL ENVÍO",
  "¿HASTA DÓNDE LLEGAN?",
  "¿QUÉ MÉTODOS DE PAGO ACEPTAN?",
  "¿OFRECEN GARANTÍAS, CAMBIOS O DEVOLUCIONES?",
  "¿QUÉ CONTENIDO LES HA FUNCIONADO MEJOR HASTA AHORA?",
  "¿QUÉ TIPO DE CONTENIDO SON BUENOS HACIENDO O LES GUSTARÍA HACER?",
  "¿QUIÉNES PUEDEN SALIR EN CÁMARA?",
  "¿CÓMO DEBE SONAR LA MARCA?",
  "¿QUÉ NO SE DEBE DECIR O MOSTRAR?",
  "¿DÓNDE Y CUÁNDO PODEMOS GRABAR?",
  "¿QUÉ COLORES USA SU MARCA?",
  "¿SABEN QUÉ TIPO DE LETRA USA SU MARCA?",
  "¿TIENEN PLANTILLAS O DISEÑOS QUE YA USAN?",
  "¿SU MARCA TIENE OTROS ELEMENTOS PROPIOS?",
  "¿HAY ALGO DEL LOOK ACTUAL QUE QUIERAN CAMBIAR SÍ O SÍ? ¿Y ALGO QUE NO SE TOCA POR NADA?",
  "¿SU MARCA (NOMBRE Y LOGO) ESTÁ REGISTRADA EN INDECOPI?",
  "¿SU PRODUCTO O SERVICIO TIENE REGLAS ESPECIALES PARA PUBLICITARSE?",
  "¿SUS TRABAJADORES ESTARÍAN DE ACUERDO CON SALIR EN FOTOS Y VIDEOS?",
  "¿TIENEN CLIENTES QUE ACEPTARÍAN SALIR EN VIDEO CONTANDO SU EXPERIENCIA?",
  "LAS FOTOS QUE USAN HOY EN SUS REDES, ¿SON SUYAS?",
  "SU LISTA DE CLIENTES EN WHATSAPP, ¿CÓMO LA CONSTRUYERON?",
  "¿QUÉ BUSCAN LOGRAR CON EL CONTENIDO?",
  'EN 6 MESES, ¿QUÉ RESULTADO LOS HARÍA DECIR "ESTO FUNCIONÓ"?',
  "¿CÓMO MIDEN HOY SUS VENTAS Y CONSULTAS?",
  "VENTAS MENSUALES APROXIMADAS (OPCIONAL Y CONFIDENCIAL)",
  "¿QUÉ MATERIALES TIENEN LISTOS?",
  "PEGUEN EL LINK DE UNA CARPETA DE DRIVE CON TODO EL MATERIAL QUE TENGAN",
  "¿TIENEN SU LOGO EN ARCHIVO EDITABLE (AI, EPS O SVG)?",
  "¿SU PÁGINA DE FACEBOOK ESTÁ CONECTADA A UN ADMINISTRADOR COMERCIAL (BUSINESS MANAGER)?",
  '¿CUÁLES DE SUS CUENTAS SON "DE EMPRESA" (NO PERSONALES)?',
  "¿SU NEGOCIO APARECE EN GOOGLE MAPS Y PUEDEN EDITAR ESA FICHA?",
  "¿EL NÚMERO DE VENTAS USA WHATSAPP BUSINESS? ¿CUÁNTOS NÚMEROS ATIENDEN VENTAS HOY?",
  "¿TIENEN PÁGINA WEB? ¿QUIÉN LA ADMINISTRA Y QUIÉN COMPRÓ EL DOMINIO?",
  "¿CON QUÉ CORREO ESTÁN CREADAS TODAS ESTAS CUENTAS?",
  "¿QUIÉN NOS DARÁ LOS ACCESOS A REDES Y BUSINESS MANAGER?",
  "¿QUIÉN APRUEBA EL CONTENIDO ANTES DE PUBLICAR?",
  "¿ALGO MÁS QUE DEBAMOS SABER PARA HACER UN GRAN TRABAJO?",
];

const PREGUNTAS_NORMALIZADAS = new Set(PREGUNTAS_BRIEF.map(normalizar));

/** «01 Identidad», «14 Materiales y accesos». */
const SECCION_BRIEF = /^\d{2}\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]/;

function esPregunta(linea: string): boolean {
  if (!linea) return false;
  if (PREGUNTAS_NORMALIZADAS.has(normalizar(linea))) return true;
  // Pregunta nueva del brief que aún no está en el catálogo: mismo formato.
  return /^¿[^a-záéíóúñ]*\?$/.test(linea) && linea === linea.toUpperCase();
}

function contarPreguntasBrief(ls: string[]): number {
  return ls.filter((l) => PREGUNTAS_NORMALIZADAS.has(normalizar(l))).length;
}

export type RespuestasBrief = Record<string, string[]>;

/** Pregunta (normalizada) → líneas de la respuesta, hasta la siguiente pregunta o sección. */
export function leerRespuestasBrief(texto: string): RespuestasBrief {
  const ls = lineas(texto);
  const out: RespuestasBrief = {};
  let actual: string | null = null;
  for (const l of ls) {
    if (esPregunta(l)) {
      actual = normalizar(l);
      out[actual] = out[actual] ?? [];
      continue;
    }
    if (SECCION_BRIEF.test(l)) {
      actual = null;
      continue;
    }
    if (actual && l) out[actual].push(l);
  }
  return out;
}

const NO_RESPONDIDO = /^(?:no|ninguno|ninguna|—\s*pendiente\s*—|-|—|n\/a)\.?$/i;

/** Respuesta en una línea, o "" si no existe o es un «no» seco. */
function respuesta(r: RespuestasBrief, pregunta: string): string {
  const valor = unaLinea((r[normalizar(pregunta)] ?? []).join("\n"));
  return NO_RESPONDIDO.test(valor) ? "" : valor;
}

/** Igual, pero respeta las listas de una cosa por línea (catálogo de productos). */
function respuestaLista(r: RespuestasBrief, pregunta: string): string {
  const ls = (r[normalizar(pregunta)] ?? []).filter(Boolean);
  const cortas = ls.filter((l) => l.length <= 45).length;
  if (ls.length >= 3 && cortas >= ls.length * 0.8) {
    return ls
      .map((l) => l.replace(/[,.;\s]+$/, "").trim())
      .filter(Boolean)
      .join(", ");
  }
  return respuesta(r, pregunta);
}

/** Diccionario cerrado nombre de color → hex. Si no reconoce ninguno, no propone. */
const COLORES: { regex: RegExp; hex: string }[] = [
  { regex: /\brosa(?:d[oa]s?)?\b|\bfucsia\b/i, hex: "#ec4899" },
  { regex: /\bblanc[oa]s?\b/i, hex: "#ffffff" },
  { regex: /\bc[aá]lid[oa]s?\b|\bdorad[oa]s?\b|\boro\b/i, hex: "#f59e0b" },
  { regex: /\bnegr[oa]s?\b/i, hex: "#111111" },
  { regex: /\bverdes?\b/i, hex: "#16a34a" },
  { regex: /\bazul(?:es)?\b/i, hex: "#2563eb" },
  { regex: /\broj[oa]s?\b/i, hex: "#dc2626" },
  { regex: /\bamarill[oa]s?\b/i, hex: "#facc15" },
  { regex: /\bnaranjas?\b/i, hex: "#f97316" },
  { regex: /\bmorad[oa]s?\b|\blilas?\b|\bvioletas?\b|\bp[uú]rpuras?\b/i, hex: "#8b5cf6" },
  { regex: /\bcelestes?\b|\bturquesas?\b/i, hex: "#38bdf8" },
  { regex: /\bbeige\b|\bcrema\b|\bnude\b/i, hex: "#e7d8c3" },
  { regex: /\bmarr[oó]n(?:es)?\b|\bcaf[eé]\b|\bchocolate\b/i, hex: "#7c4a2d" },
  { regex: /\bgris(?:es)?\b|\bplata\b|\bplateado\b/i, hex: "#9ca3af" },
];

export function coloresDesdeTexto(texto: string): string[] {
  const encontrados: { pos: number; hex: string }[] = [];
  for (const { regex, hex } of COLORES) {
    const m = texto.match(regex);
    if (m && m.index !== undefined && !encontrados.some((e) => e.hex === hex)) {
      encontrados.push({ pos: m.index, hex });
    }
  }
  return encontrados.sort((a, b) => a.pos - b.pos).map((e) => e.hex);
}

function nombresDeCompetidores(r: RespuestasBrief): string {
  const crudo = (r[normalizar("¿QUIÉNES SON SUS PRINCIPALES COMPETIDORES?")] ?? []).join(" ");
  if (!crudo) return "";
  const sinParentesis = crudo.replace(/\([^)]*\)/g, " ");
  const nombres = Array.from(sinParentesis.matchAll(/([^\s-][^-]*?)\s*-\s*https?:\/\/\S+/g)).map((m) =>
    m[1].trim()
  );
  return nombres.length ? nombres.join(", ") : unaLinea(sinParentesis.replace(/https?:\/\/\S+/g, ""));
}

const CAMPOS_BRIEF: { etiqueta: string; pregunta: string; lista?: boolean }[] = [
  { etiqueta: "Qué venden", pregunta: "¿QUÉ VENDEN?", lista: true },
  { etiqueta: "Lo que más venden", pregunta: "¿QUÉ ES LO QUE MÁS VENDEN?" },
  { etiqueta: "Qué quieren impulsar", pregunta: "¿QUÉ PRODUCTO O SERVICIO QUIEREN IMPULSAR MÁS?" },
  { etiqueta: "Ticket promedio y precios", pregunta: "TICKET PROMEDIO Y RANGO DE PRECIOS" },
  { etiqueta: "Temporadas y fechas clave", pregunta: "TEMPORADAS ALTAS, BAJAS Y FECHAS CLAVE DEL AÑO", lista: true },
  { etiqueta: "Dirección y sucursales", pregunta: "DIRECCIÓN PRINCIPAL Y SUCURSALES" },
  { etiqueta: "Delivery", pregunta: "¿HACEN DELIVERY?" },
  { etiqueta: "Costos y condiciones del envío", pregunta: "COSTOS Y CONDICIONES DEL ENVÍO" },
  { etiqueta: "Hasta dónde llegan", pregunta: "¿HASTA DÓNDE LLEGAN?" },
  { etiqueta: "Métodos de pago", pregunta: "¿QUÉ MÉTODOS DE PAGO ACEPTAN?" },
  { etiqueta: "Garantías, cambios y devoluciones", pregunta: "¿OFRECEN GARANTÍAS, CAMBIOS O DEVOLUCIONES?" },
  { etiqueta: "Dónde se concreta la venta", pregunta: "¿DÓNDE SE CONCRETA LA VENTA?" },
  { etiqueta: "Quién responde y en qué horario", pregunta: "¿QUIÉN RESPONDE, EN QUÉ HORARIO Y CUÁNTO DEMORA?" },
  { etiqueta: "Preguntas frecuentes de los clientes", pregunta: "¿CUÁLES SON LAS PREGUNTAS QUE LES HACEN TODOS LOS DÍAS?" },
  { etiqueta: "Quiénes pueden salir en cámara", pregunta: "¿QUIÉNES PUEDEN SALIR EN CÁMARA?" },
  { etiqueta: "Dónde y cuándo se puede grabar", pregunta: "¿DÓNDE Y CUÁNDO PODEMOS GRABAR?" },
  { etiqueta: "Contenido que les sale bien", pregunta: "¿QUÉ TIPO DE CONTENIDO SON BUENOS HACIENDO O LES GUSTARÍA HACER?" },
  { etiqueta: "Lo que ya funcionó", pregunta: "DE TODO LO QUE YA PROBARON, ¿QUÉ FUNCIONÓ Y QUÉ NO REPETIRÍAN?" },
  { etiqueta: "Qué buscan lograr con el contenido", pregunta: "¿QUÉ BUSCAN LOGRAR CON EL CONTENIDO?" },
];

export function parseBriefMaestro(texto: string): Extraido<MarcaCampos> {
  const avisos: string[] = [];
  const r = leerRespuestasBrief(texto);
  const campos = marcaVacia();

  campos.name = respuesta(r, "¿CUÁL ES EL NOMBRE COMERCIAL DE LA MARCA?");
  if (!campos.name) avisos.push("No se encontró el nombre comercial en el brief.");

  const porQue = respuesta(r, "¿POR QUÉ LO HACEN?");
  if (porQue && porQue.length <= 120) campos.tagline = porQue;

  campos.description = [
    respuesta(r, "¿QUIÉNES SON Y QUÉ HACEN?"),
    respuesta(r, "¿QUÉ PROBLEMA LE SOLUCIONAN AL CLIENTE?"),
  ]
    .filter(Boolean)
    .join("\n\n");

  const suena = respuesta(r, "¿CÓMO DEBE SONAR LA MARCA?");
  campos.toneOfVoice = suena;
  campos.identity = [
    ["Cómo debe sonar", suena],
    ["A dónde quieren llegar", respuesta(r, "¿A DÓNDE LES GUSTARÍA LLEGAR COMO MARCA?")],
    ["Por qué comprarles a ellos", respuesta(r, "¿POR QUÉ UN CLIENTE DEBERÍA COMPRARLES A USTEDES Y NO A OTRO?")],
    ["Algo más que debemos saber", respuesta(r, "¿ALGO MÁS QUE DEBAMOS SABER PARA HACER UN GRAN TRABAJO?")],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  campos.audience = [
    ["Cliente ideal", respuesta(r, "DESCRIBAN A SU CLIENTE IDEAL")],
    ["Qué los motiva a comprar", respuesta(r, "¿QUÉ LOS MOTIVA A COMPRAR?")],
    ["Qué los frena antes de comprar", respuesta(r, "¿QUÉ LOS FRENA ANTES DE COMPRAR?")],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  campos.valueProps = [
    ["Por qué comprarles a ellos", respuesta(r, "¿POR QUÉ UN CLIENTE DEBERÍA COMPRARLES A USTEDES Y NO A OTRO?")],
    ["Lo que dicen los clientes contentos", respuesta(r, "¿QUÉ DICEN LOS CLIENTES CONTENTOS?")],
    ["Qué problema resuelven", respuesta(r, "¿QUÉ PROBLEMA LE SOLUCIONAN AL CLIENTE?")],
    ["Garantías, cambios y devoluciones", respuesta(r, "¿OFRECEN GARANTÍAS, CAMBIOS O DEVOLUCIONES?")],
    ["Delivery", respuesta(r, "¿HACEN DELIVERY?")],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`);

  campos.doNots = [
    respuesta(r, "¿QUÉ NO SE DEBE DECIR O MOSTRAR?"),
    respuesta(r, "¿SU PRODUCTO O SERVICIO TIENE REGLAS ESPECIALES PARA PUBLICITARSE?"),
    respuesta(r, "¿HAY ALGÚN COMPETIDOR AL QUE NO QUIEREN PARECERSE?"),
  ].filter(Boolean);

  // keywords: solo la IA puede proponerlas; sin IA se dejan vacías.

  const filasBrief = CAMPOS_BRIEF.map(({ etiqueta, pregunta, lista }) => {
    const v = lista ? respuestaLista(r, pregunta) : respuesta(r, pregunta);
    return v ? `${etiqueta}: ${v}` : "";
  }).filter(Boolean);
  const competidores = nombresDeCompetidores(r);
  if (competidores) filasBrief.push(`Competidores: ${competidores}`);
  campos.brief = filasBrief.join("\n");

  // Redes: SOLO de la respuesta de redes actuales (la sección 06 trae las de competidores).
  const redes = respuesta(r, "PÁGINA WEB Y REDES SOCIALES ACTUALES");
  const ig = redes.match(/instagram\.com\/([\w.]+)/i);
  if (ig && !/^(p|reel|reels|explore|stories)$/i.test(ig[1])) campos.instagram = `@${ig[1].replace(/\.$/, "")}`;
  const tk = redes.match(/tiktok\.com\/@([\w.]+)/i);
  if (tk) campos.tiktok = `@${tk[1].replace(/\.$/, "")}`;
  const tieneWeb = respuesta(r, "¿TIENEN PÁGINA WEB? ¿QUIÉN LA ADMINISTRA Y QUIÉN COMPRÓ EL DOMINIO?");
  const urls = Array.from(redes.matchAll(/https?:\/\/[^\s)]+/gi)).map((m) => m[0]);
  const web = urls.find((u) => !/instagram\.com|facebook\.com|tiktok\.com|wa\.me|whatsapp\.com|google\./i.test(u));
  if (web && tieneWeb) campos.website = web;
  // whatsapp: el único número del brief es el celular personal de coordinación. No se rellena.

  const colores = coloresDesdeTexto(respuesta(r, "¿QUÉ COLORES USA SU MARCA?"));
  if (colores[0]) campos.colorPrimary = colores[0];
  if (colores[1]) campos.colorSecondary = colores[1];
  if (colores[2]) campos.colorAccent = colores[2];
  if (!colores.length) avisos.push("No se reconoció ningún color en la respuesta de colores: se mantienen los actuales.");

  if (!Object.keys(r).length) avisos.push("No se reconoció el catálogo de preguntas del brief maestro.");

  return { campos, fuentes: fuentesDe(campos), avisos };
}

/* ------------------------------------------- INFORME → FICHA DE MARCA -- */

/**
 * Cuando el informe de branding de una persona se carga en la ficha de una
 * MARCA (marca personal), esto es lo único que se traslada, todo literal:
 * la voz, el vocabulario, lo que evita, la paleta y el arquetipo. Lo que el
 * informe no tiene (público, brief comercial, redes) se queda vacío.
 */
export function marcaDesdePersona(p: PersonaCampos): Extraido<MarcaCampos> {
  const campos = marcaVacia();
  campos.name = p.name;
  campos.tagline = p.soundsLike;
  const trio = [p.archetypePrimary, p.archetypeSecondary, p.archetypeTertiary].filter(Boolean).join(" · ");
  campos.identity = [
    trio ? `Arquetipo: ${trio}` : "",
    p.archetypeSummary,
    p.coreDesire ? `Deseo central: ${p.coreDesire}` : "",
    p.coreTalent ? `Su talento: ${p.coreTalent}` : "",
    p.coreTrap ? `Su trampa: ${p.coreTrap}` : "",
    p.evolveToward ? `Hacia dónde evolucionar: ${p.evolveToward}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  campos.toneOfVoice = [p.voiceTone, p.messageStructure ? `Cómo arma un mensaje: ${p.messageStructure}` : ""]
    .filter(Boolean)
    .join("\n");
  campos.valueProps = [...p.strengths];
  campos.doNots = [...p.avoidInVoice];
  campos.keywords = [...p.vocabulary];
  if (p.palette[0]) campos.colorPrimary = p.palette[0].hex.toLowerCase();
  if (p.palette[1]) campos.colorSecondary = p.palette[1].hex.toLowerCase();
  if (p.palette[2]) campos.colorAccent = p.palette[2].hex.toLowerCase();
  const avisos: string[] = [];
  if (!p.voiceTone) avisos.push("El informe no trae tono de voz: revisa el campo antes de guardar.");
  return { campos, fuentes: fuentesDe(campos), avisos };
}

/* ------------------------------------------------------- REDACCIÓN -- */

/** Preguntas del brief cuya respuesta nunca debe salir hacia la IA. */
const PREGUNTAS_RESERVADAS = [
  "RAZÓN SOCIAL",
  "RUC",
  "NOMBRE DEL REPRESENTANTE LEGAL",
  "¿CON QUIÉN COORDINAMOS EL DÍA A DÍA?",
  "VENTAS MENSUALES APROXIMADAS (OPCIONAL Y CONFIDENCIAL)",
  "¿CON QUÉ CORREO ESTÁN CREADAS TODAS ESTAS CUENTAS?",
  "¿QUIÉN NOS DARÁ LOS ACCESOS A REDES Y BUSINESS MANAGER?",
  "¿QUIÉN APRUEBA EL CONTENIDO ANTES DE PUBLICAR?",
].map(normalizar);

export const MARCA_REDACCION = "[dato reservado]";

/**
 * Quita del texto del brief lo que no debe viajar al proveedor de IA:
 * RUC, razón social, representante, teléfonos, correos, la sección
 * «04 Números del negocio» y las ventas mensuales. Devuelve si tocó algo.
 */
export function redactarDatosSensibles(texto: string): { texto: string; redactado: boolean } {
  const ls = lineas(texto);
  const out: string[] = [];
  let redactado = false;
  let ocultando = false;
  let enNumeros = false;

  for (const l of ls) {
    if (SECCION_BRIEF.test(l)) {
      enNumeros = /^04\s+N[uú]meros del negocio/i.test(l);
      ocultando = false;
      out.push(l);
      if (enNumeros) {
        out.push(MARCA_REDACCION);
        redactado = true;
      }
      continue;
    }
    if (enNumeros) continue;
    if (esPregunta(l)) {
      ocultando = PREGUNTAS_RESERVADAS.includes(normalizar(l));
      out.push(l);
      if (ocultando) {
        out.push(MARCA_REDACCION);
        redactado = true;
      }
      continue;
    }
    if (ocultando) continue;

    let linea = l;
    linea = linea.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, () => {
      redactado = true;
      return MARCA_REDACCION;
    });
    linea = linea.replace(/(?<!\d)(?:\+?51\s?)?9\d{2}[\s-]?\d{3}[\s-]?\d{3}(?!\d)/g, () => {
      redactado = true;
      return MARCA_REDACCION;
    });
    linea = linea.replace(/(?<!\d)(?:10|20|15|17)\d{9}(?!\d)/g, () => {
      redactado = true;
      return MARCA_REDACCION;
    });
    out.push(linea);
  }

  return { texto: out.join("\n"), redactado };
}
