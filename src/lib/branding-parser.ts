/**
 * Parser de informes de branding (marca personal y marca de negocio).
 *
 * Diseñado para extraer con máxima precisión:
 * 1. Informes estructurados tipo "INFORME DE BRANDING" (Yoryo, Piero, Eru, etc.).
 * 2. Manuales de identidad y directrices corporativas genéricas de negocio.
 */

export type ParsedBranding = {
  name: string;
  isPersonal: boolean;
  tagline: string;
  identity: string;
  brief: string;
  toneOfVoice: string;
  audience: string;
  valueProps: string[];
  doNots: string[];
  keywords: string[];
  colorPrimary: string;
  colorSecondary: string;
  colorAccent: string;
  palette: { name: string; hex: string }[];

  // Campos específicos de arquetipo / actor para marcas personales
  actorData?: {
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
    toneReferences: string[];
    typography: string;
    aesthetics: string;
    visualAvoid: string;
    palette: { name: string; hex: string }[];
  };
};

function limpiar(texto: string | null | undefined): string {
  if (!texto) return "";
  return texto.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

function extraerListaPuntos(texto: string): string[] {
  return texto
    .split(/[•·\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && !s.toLowerCase().startsWith("página") && !s.includes("/ 13") && !s.includes("/ 11"));
}

export function parseBrandingReport(rawText: string, forcedType?: "PERSONAL" | "BUSINESS"): ParsedBranding {
  const text = rawText.replace(/\r\n/g, "\n");
  const isInformeBranding = /INFORME\s+DE\s+BRANDING/i.test(text);

  // Detección de nombre (habitualmente en la primera página antes o después de INFORME DE BRANDING)
  let name = "";
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  const informeIdx = lines.findIndex((l) => /INFORME\s+DE\s+BRANDING/i.test(l));
  if (informeIdx >= 0) {
    if (informeIdx > 0 && lines[informeIdx - 1].length < 40 && !lines[informeIdx - 1].includes("·")) {
      name = lines[informeIdx - 1];
    } else if (informeIdx + 1 < lines.length && lines[informeIdx + 1].length < 40 && !lines[informeIdx + 1].includes("·")) {
      name = lines[informeIdx + 1];
    }
  }

  if (!name && lines.length > 0) {
    name = lines[0].slice(0, 35);
  }

  // Detectar si el informe declara explícitamente Marca personal
  const esPersonal = forcedType
    ? forcedType === "PERSONAL"
    : isInformeBranding || /marca\s+personal/i.test(text);

  // Arquetipos (ej: El Bufón · El Forajido · El Mago)
  let arquetipoPrimario = "";
  let arquetipoSecundario = "";
  let arquetipoTerciario = "";

  const arqMatch = text.match(/ARQUETIPO\s+PRIMARIO\s*[:\n]\s*([^\n\r]+)/i);
  if (arqMatch) {
    arquetipoPrimario = limpiar(arqMatch[1]);
  }

  const arqSecMatch = text.match(/ARQUETIPO\s+SECUNDARIO\s*[:\n]\s*([^\n\r]+)/i);
  if (arqSecMatch) {
    arquetipoSecundario = limpiar(arqSecMatch[1]);
  }

  // Trío inicial en portada: ej. "El Bufón · El Forajido · El Mago"
  const trioMatch = text.match(/(El\s+[A-ZÁÉÍÓÚa-záéíóú]+(?:\s+[A-ZÁÉÍÓÚa-záéíóú]+)?)\s*·\s*(El\s+[A-ZÁÉÍÓÚa-záéíóú]+(?:\s+[A-ZÁÉÍÓÚa-záéíóú]+)?)\s*·\s*(El\s+[A-ZÁÉÍÓÚa-záéíóú]+(?:\s+[A-ZÁÉÍÓÚa-záéíóú]+)?)/i);
  if (trioMatch) {
    if (!arquetipoPrimario) arquetipoPrimario = limpiar(trioMatch[1]);
    if (!arquetipoSecundario) arquetipoSecundario = limpiar(trioMatch[2]);
    arquetipoTerciario = limpiar(trioMatch[3]);
  }

  // Resumen de la portada / Tagline
  let tagline = "";
  let identity = "";
  const descPortadaMatch = text.match(/(?:El\s+[\w\s]+·[\w\s·]+)\s*\n+([\s\S]+?)(?=\n*Marca personal|\n*TU ARQUETIPO|\n*Tu arquetipo|\n*2\s*\/\s*\d+)/i);
  if (descPortadaMatch) {
    const rawDesc = limpiar(descPortadaMatch[1]);
    const firstSentence = rawDesc.split(".")[0];
    tagline = firstSentence ? `${firstSentence}.` : rawDesc.slice(0, 80);
    identity = rawDesc;
  }

  // Deseo central, Miedo, Talento, Trampa
  let coreDesire = "";
  const deseoMatch = text.match(/Deseo\s+central\s*:\s*([^\n\r]+)/i);
  if (deseoMatch) coreDesire = limpiar(deseoMatch[1]);

  let coreFear = "";
  const miedoMatch = text.match(/Miedo\s+central\s*:\s*([^\n\r]+)/i);
  if (miedoMatch) coreFear = limpiar(miedoMatch[1]);

  let coreTalent = "";
  const talentoMatch = text.match(/(?:Tu\s+talento|Su\s+don)\s*:\s*([^\n\r]+)/i);
  if (talentoMatch) coreTalent = limpiar(talentoMatch[1]);

  let coreTrap = "";
  const trampaMatch = text.match(/Su\s+trampa\s*:\s*([^\n\r]+)/i);
  if (trampaMatch) coreTrap = limpiar(trampaMatch[1]);

  let evolveToward = "";
  const evolveMatch = text.match(/HACIA\s+DÓNDE\s+EVOLUCIONAR\s*[\n\r]+([\s\S]+?)(?=\n*ARQUETIPO|\n*Índice|\n*3\s*\/\s*\d+)/i);
  if (evolveMatch) evolveToward = limpiar(evolveMatch[1]);

  // Índice de coherencia
  let coherenceIndex: number | null = null;
  const cohMatch = text.match(/Índice\s+de\s+coherencia\s*:\s*([\d.]+)/i);
  if (cohMatch) {
    const parsed = parseFloat(cohMatch[1]);
    if (!isNaN(parsed)) coherenceIndex = parsed;
  }

  // Tono de voz
  let toneOfVoice = "";
  const tonoMatch = text.match(/TO\s*N\s*O\s*[\n\r]+([\s\S]+?)(?=\n*ESTRUCTURA|\n*E\s*S\s*T\s*R\s*U\s*C\s*T\s*U\s*R\s*A|\n*VOCABULARIO)/i);
  if (tonoMatch) {
    toneOfVoice = limpiar(tonoMatch[1]);
  } else {
    const tonoGenMatch = text.match(/Tono\s+de\s+voz\s*[:\n]\s*([^\n\r]+(?:\n[^\n\r]+)?)/i);
    if (tonoGenMatch) toneOfVoice = limpiar(tonoGenMatch[1]);
  }

  // Estructura del mensaje
  let messageStructure = "";
  const structMatch = text.match(/ESTRUCTURA\s+DEL\s+MENSAJE\s*[\n\r]+([\s\S]+?)(?=\n*VOCABULARIO|\n*EVITA|\n*E\s*V\s*I\s*T\s*A)/i);
  if (structMatch) messageStructure = limpiar(structMatch[1]);

  // Vocabulario
  let vocabulary: string[] = [];
  const vocMatch = text.match(/VOCABULARIO\s*[\n\r]+([\s\S]+?)(?=\n*EVITA|\n*E\s*V\s*I\s*T\s*A|\n*SUENA)/i);
  if (vocMatch) {
    vocabulary = extraerListaPuntos(vocMatch[1]);
  }

  // Lo que evita / Prohibiciones
  let doNots: string[] = [];
  const evitaMatch = text.match(/EVITA\s*[\n\r]+([\s\S]+?)(?=\n*SUENA|\n*S\s*U\s*E\s*N\s*A|\n*MARCAS|\n*COMUNICACIÓN)/i);
  if (evitaMatch) {
    const textoEvita = limpiar(evitaMatch[1]);
    doNots = textoEvita.split(/[,;\n]/).map((s) => s.trim()).filter((s) => s.length > 2);
  }

  // Suena así
  let soundsLike = "";
  const suenaMatch = text.match(/SUENA\s+ASÍ\s*[\n\r]+[«"]?([^»"\n]+)[»"]?/i);
  if (suenaMatch) soundsLike = limpiar(suenaMatch[1]);

  // Colores y Paleta (Buscar combinaciones de Nombre + #HEX)
  const palette: { name: string; hex: string }[] = [];
  const hexMatches = Array.from(text.matchAll(/(?:([A-Za-záéíóúÁÉÍÓÚ\s]{3,20})\n+)?(#[0-9A-Fa-f]{6})/g));
  const seenHex = new Set<string>();

  for (const m of hexMatches) {
    const hex = m[2].toUpperCase();
    if (!seenHex.has(hex)) {
      seenHex.add(hex);
      const colorName = limpiar(m[1]) || `Color ${palette.length + 1}`;
      // Descartar si el nombre capturó palabras de control
      const safeName = /visual|paleta|estética|texturas|tipografía/i.test(colorName)
        ? `Color ${palette.length + 1}`
        : colorName;
      palette.push({ name: safeName, hex });
    }
  }

  const colorPrimary = palette[0]?.hex || "#8b5cf6";
  const colorSecondary = palette[1]?.hex || "#3b82f6";
  const colorAccent = palette[2]?.hex || "#f59e0b";

  // Tipografía
  let typography = "";
  const typoMatch = text.match(/Tipograf[íi]a\s*[\n\r]+([\s\S]+?)(?=\n*Est[ée]tica|\n*VISUAL|\n*V\s*I\s*S\s*U\s*A\s*L)/i);
  if (typoMatch) typography = limpiar(typoMatch[1]);

  // Estética y Texturas
  let aesthetics = "";
  const esteticaMatch = text.match(/Est[ée]tica\s*[\n\r]+([\s\S]+?)(?=\n*Texturas|\n*Evita|\n*VISUAL)/i);
  if (esteticaMatch) aesthetics = limpiar(esteticaMatch[1]);

  let texturas = "";
  const texturasMatch = text.match(/Texturas\s*:\s*([^\n\r]+)/i);
  if (texturasMatch) {
    texturas = limpiar(texturasMatch[1]);
    if (aesthetics) aesthetics += `\nTexturas: ${texturas}`;
  }

  let visualAvoid = "";
  const visualAvoidMatch = text.match(/Evita\s*:\s*([^\n\r]+(?:\n[^\n\r]+)?)(?=\n*VISUAL|\n*REFERENTES)/i);
  if (visualAvoidMatch) visualAvoid = limpiar(visualAvoidMatch[1]);

  // Referentes
  const toneReferences: string[] = [];
  const conocidos = [
    "Johnny Depp", "Iris Apfel", "Grace Jones", "David Bowie", "Jimi Hendrix",
    "Freddie Mercury", "Steve Jobs", "Beyoncé", "Keanu Reeves", "Barack Obama",
    "Zendaya", "Rihanna", "Madonna", "John Lennon", "Coco Chanel", "Charlie Chaplin",
    "Robin Williams", "Jim Carrey"
  ];
  for (const ref of conocidos) {
    if (new RegExp(`\\b${ref}\\b`, "i").test(text) && !toneReferences.includes(ref)) {
      toneReferences.push(ref);
    }
  }

  // Marcas e Iconos
  const sameArchetypeIcons: string[] = [];
  const marcasMatch = text.match(/MARCAS\s+DE\s+TU\s+MISMO\s+ARQUETIPO\s*[\n\r]+([^\n\r]+)/i);
  if (marcasMatch) {
    extraerListaPuntos(marcasMatch[1]).forEach((m) => sameArchetypeIcons.push(m));
  }

  // Qué vigilar
  let watchOut = "";
  const vigilarMatch = text.match(/Lo\s+que\s+deberías\s+vigilar\s*[\n\r]+([\s\S]+?)(?=\n*COMUNICACIÓN|\n*Comunicación|\n*6\s*\/\s*\d+)/i);
  if (vigilarMatch) watchOut = limpiar(vigilarMatch[1]);

  // Armar campos consolidados para Brand
  const audience = esPersonal
    ? `Audiencia que conecta con la personalidad de ${name} (${arquetipoPrimario || "arquetipo auténtico"}). Valora la transparencia, el criterio propio y el contenido sin rodeos.`
    : `Clientes y público objetivo que buscan una solución confiable y profesional con ${name}.`;

  const valueProps = [
    coreTalent ? `Talento diferencial: ${coreTalent}` : "",
    arquetipoPrimario ? `Arquetipo dominante: ${arquetipoPrimario}` : "",
    tagline ? `Promesa central: ${tagline}` : "",
  ].filter(Boolean);

  const brief = [
    `Contexto de marca: ${name}`,
    identity ? `Identidad: ${identity}` : "",
    coreDesire ? `Deseo central: ${coreDesire}` : "",
    coreTalent ? `Don / Talento: ${coreTalent}` : "",
    soundsLike ? `Frase insignia: «${soundsLike}»` : "",
  ].filter(Boolean).join("\n\n");

  return {
    name: name || "Nueva Marca",
    isPersonal: esPersonal,
    tagline: tagline || soundsLike || "Identidad consolidada",
    identity: identity || (arquetipoPrimario ? `Arquetipo: ${arquetipoPrimario}. ${tagline}` : "Identidad de marca"),
    brief,
    toneOfVoice: toneOfVoice || "Cercano, directo y profesional.",
    audience,
    valueProps: valueProps.length ? valueProps : ["Propuesta de valor auténtica", "Enfoque sin rodeos"],
    doNots: doNots.length ? doNots : ["No usar lenguaje corporativo vacío", "No hacer promesas falsas"],
    keywords: vocabulary.length ? vocabulary : ["autenticidad", "directo", "criterio"],
    colorPrimary,
    colorSecondary,
    colorAccent,
    palette,
    actorData: esPersonal
      ? {
          archetypePrimary: arquetipoPrimario || "El Bufón",
          archetypeSecondary: arquetipoSecundario || "El Forajido",
          archetypeTertiary: arquetipoTerciario || "El Mago",
          archetypeSummary: identity || tagline,
          coreDesire,
          coreFear,
          coreTalent,
          coreTrap,
          evolveToward,
          watchOut,
          coherenceIndex,
          voiceTone: toneOfVoice,
          messageStructure,
          vocabulary,
          avoidInVoice: doNots,
          soundsLike,
          sameArchetypeIcons,
          toneReferences,
          typography,
          aesthetics,
          visualAvoid,
          palette,
        }
      : undefined,
  };
}
