import { parseJson, parseList } from "@/lib/utils";
import { OUTPUT_CONTRACT_TEXT } from "@/lib/ai/schema";

/**
 * Aquí se arma el "fine tuning" de cada generación.
 *
 * Son dos afinaciones que tienen que hacer match, tal como se diseno el flujo:
 *   1. LA ESTRUCTURA -> el formato de guion ganador (beats, reglas, ejemplos, PDFs).
 *   2. LA PERSONA    -> quien actua, con su arquetipo y su marca personal, para
 *                       que el guion suene a ella y no se vea forzado.
 *
 * Encima de eso se monta la identidad de la marca.
 */

export type Beat = { name: string; goal?: string; seconds?: number; notes?: string };
export type Example = { title: string; text: string };

export type StructureContext = {
  name: string;
  category: string;
  family?: string | null;
  summary?: string | null;
  beats: string;
  systemPrompt: string;
  rules: string;
  examples: string;
  defaultDurationSec: number;
};

export type BrandContext = {
  name: string;
  tagline?: string | null;
  description?: string | null;
  identity?: string | null;
  brief?: string | null;
  toneOfVoice?: string | null;
  audience?: string | null;
  valueProps?: string | null;
  doNots?: string | null;
  keywords?: string | null;
  whatsapp?: string | null;
  instagram?: string | null;
  tiktok?: string | null;
  website?: string | null;
};

/**
 * La persona que va a interpretar el guion.
 *
 * Lo de arriba es cómo actúa; lo de abajo sale de su informe de marca personal
 * y es lo que hace que el texto suene a ella y no a cualquiera.
 */
export type ArchetypeContext = {
  name: string;
  summary?: string | null;
  personality?: string | null;
  strengths: string;
  avoid: string;
  toneKeywords: string;
  brandingNotes?: string | null;
  ageRange?: string | null;
  energyLevel: number;
  /** Compatibilidad con la estructura elegida: 0-3, o null si no esta evaluada. */
  fitScore?: number | null;
  fitNotes?: string | null;

  // --- Informe de marca personal ---
  isPerson?: boolean;
  archetypePrimary?: string | null;
  archetypeSecondary?: string | null;
  archetypeTertiary?: string | null;
  archetypeSummary?: string | null;
  coreDesire?: string | null;
  coreFear?: string | null;
  coreTalent?: string | null;
  coreTrap?: string | null;
  watchOut?: string | null;

  // --- Su voz: lo que más pesa en el guion ---
  voiceTone?: string | null;
  messageStructure?: string | null;
  vocabulary?: string | null; // JSON string[]
  avoidInVoice?: string | null; // JSON string[]
  soundsLike?: string | null;
  sameArchetypeIcons?: string | null; // JSON string[]
  toneReferences?: string | null; // JSON string[] — los que elige el equipo
  signatureGesture?: string | null;

  // --- Su imagen: orienta luz, vestuario y textos en pantalla ---
  palette?: string | null; // JSON [{ name, hex }]
  typography?: string | null;
  aesthetics?: string | null;
  visualAvoid?: string | null;
};

export type ReferenceDoc = {
  label: string;
  source: string;
  text: string;
};

export type BuildPromptInput = {
  structure: StructureContext;
  brand?: BrandContext | null;
  archetype?: ArchetypeContext | null;
  references: ReferenceDoc[];
  /** Lo que pide el usuario en esta generacion concreta. */
  request: string;
  durationSec: number;
  /** Cuantas variantes distintas del mismo formato quiere ver. Siempre 1 guion por llamada. */
  variantHint?: string;
  productFocus?: string;
};

const MAX_CHARS_PER_DOC = 18_000;
const MAX_CHARS_TOTAL = 80_000;

function bullets(items: string[]) {
  return items.map((i) => `- ${i}`).join("\n");
}

function section(title: string, body: string | null | undefined) {
  const text = (body ?? "").trim();
  if (!text) return "";
  return `\n## ${title}\n${text}\n`;
}

/* ------------------------------------------------------- MARCA PERSONAL -- */

/**
 * El informe de branding de la persona, traducido a ordenes de guion.
 *
 * Es la diferencia entre "un actor con energia alta" y "Yoryo": el tono, las
 * palabras que usa, las que no, y como arma un mensaje. Sin esto el guion sale
 * correcto pero le queda a cualquiera.
 */
function brandingPersonal(a: ArchetypeContext): string {
  const arquetipos = [a.archetypePrimary, a.archetypeSecondary, a.archetypeTertiary]
    .filter(Boolean)
    .join(" · ");
  const vocabulario = parseList(a.vocabulary ?? "[]");
  const evitaAlHablar = parseList(a.avoidInVoice ?? "[]");
  const referentes = parseList(a.sameArchetypeIcons ?? "[]");
  const referentesDeTono = parseList(a.toneReferences ?? "[]");
  const paleta = parseJson<{ name?: string; hex?: string }[]>(a.palette ?? "[]", []);

  const bloques: string[] = [];

  if (arquetipos) bloques.push(`Arquetipo: ${arquetipos}`);
  if (a.archetypeSummary) bloques.push(`Qué representa: ${a.archetypeSummary}`);
  if (a.coreDesire) bloques.push(`Lo que quiere: ${a.coreDesire}`);
  if (a.coreFear) bloques.push(`Lo que teme: ${a.coreFear}`);
  if (a.coreTalent) bloques.push(`Su don: ${a.coreTalent}`);
  if (a.coreTrap) bloques.push(`Su trampa (no lo escribas cayendo en ella): ${a.coreTrap}`);
  if (referentes.length) bloques.push(`Suena en la familia de: ${referentes.join(", ")}`);

  const identidad = bloques.length ? `\nQUIEN ES\n${bloques.join("\n")}\n` : "";

  // Lo que de verdad cambia el texto.
  const voz: string[] = [];
  if (a.voiceTone) voz.push(`Tono de voz: ${a.voiceTone}`);
  if (a.messageStructure) voz.push(`Cómo arma un mensaje: ${a.messageStructure}`);
  if (a.soundsLike) voz.push(`Una frase suya de referencia: «${a.soundsLike}»`);
  if (vocabulario.length)
    voz.push(
      `Palabras que SÍ usa (mete varias en los diálogos, sin forzar):\n${bullets(vocabulario)}`
    );
  if (evitaAlHablar.length)
    voz.push(`Lo que NUNCA diría ni en broma:\n${bullets(evitaAlHablar)}`);
  if (referentesDeTono.length)
    voz.push(
      `Queremos que suene en la familia de estos referentes. No los imites ni los menciones:
` +
        `róbales el registro, el ritmo y la actitud.
${bullets(referentesDeTono)}`
    );
  if (a.signatureGesture) voz.push(`Gesto que le identifica: ${a.signatureGesture}`);

  const comunicacion = voz.length ? `\nCÓMO HABLA — esto manda sobre el diálogo\n${voz.join("\n")}\n` : "";

  // Orienta iluminacion, vestuario, props y textos en pantalla.
  const img: string[] = [];
  if (paleta.length)
    img.push(
      `Paleta: ${paleta
        .map((c) => [c.name, c.hex].filter(Boolean).join(" ").trim())
        .filter(Boolean)
        .join(", ")}`
    );
  if (a.aesthetics) img.push(`Estética: ${a.aesthetics}`);
  if (a.typography) img.push(`Tipografía para los textos en pantalla: ${a.typography}`);
  if (a.visualAvoid) img.push(`Visualmente NO: ${a.visualAvoid}`);

  const imagen = img.length
    ? `\nSU IMAGEN — úsala para iluminación, vestuario, props y textos en pantalla\n${img.join("\n")}\n`
    : "";

  const aviso = a.watchOut
    ? `\nOJO: ${a.watchOut}\nNo apoyes el guion en esa contradicción: escríbelo desde su arquetipo principal.\n`
    : "";

  return identidad + comunicacion + imagen + aviso;
}

/* -------------------------------------------------------------- ESTRUCTURA -- */

function renderBeats(raw: string): string {
  const beats = parseJson<Beat[]>(raw, []);
  if (!Array.isArray(beats) || beats.length === 0) return "";
  return beats
    .map((b, i) => {
      const parts = [`${i + 1}. **${b.name}**`];
      if (b.seconds) parts.push(`(~${b.seconds}s)`);
      const line = parts.join(" ");
      const extra: string[] = [];
      if (b.goal) extra.push(`   Objetivo: ${b.goal}`);
      if (b.notes) extra.push(`   Nota: ${b.notes}`);
      return [line, ...extra].join("\n");
    })
    .join("\n");
}

function renderExamples(raw: string): string {
  const examples = parseJson<Example[]>(raw, []);
  if (!Array.isArray(examples) || examples.length === 0) return "";
  return examples
    .filter((e) => e && e.text)
    .map(
      (e, i) =>
        `### Ejemplo ganador ${i + 1}${e.title ? `: ${e.title}` : ""}\n${e.text.trim()}`
    )
    .join("\n\n");
}

/* ---------------------------------------------------------------- SISTEMA -- */

export function buildSystemPrompt(input: BuildPromptInput): string {
  const { structure, brand, archetype, references } = input;
  const esVenta = structure.category === "VENDE";

  const parts: string[] = [];

  parts.push(
    `Eres director creativo y guionista de video vertical para redes sociales (TikTok, Reels, Shorts).
Escribes en espanol neutro de Latinoamerica, con el habla natural de Peru cuando la marca lo pide.
Tu trabajo no es "escribir un texto bonito": es entregar un guion que un equipo pequeno pueda grabar manana con lo que tiene a la mano.`
  );

  // ---- 1. LA ESTRUCTURA -------------------------------------------------
  parts.push(`
# 1. LA ESTRUCTURA QUE DEBES SEGUIR: ${structure.name}

Categoría: ${esVenta ? "VENDE (obligatorio terminar en llamado a la acción)" : "ENTRETIENE (NO vendas, no metas CTA de compra)"}${
    structure.family ? `\nFamilia: ${structure.family}` : ""
  }${structure.summary ? `\n${structure.summary}` : ""}

Esta estructura es un formato que YA funciono. No la reinventes: reprodúcela con contenido nuevo.
Lo que cambia entre videos es el disfraz (el objeto, la situacion, el personaje). Lo que NO cambia
es el orden de los golpes emocionales.`);

  const beats = renderBeats(structure.beats);
  if (beats) {
    parts.push(`
## Beats obligatorios, en este orden exacto
${beats}

Genera una escena por beat. Si un beat necesita dos escenas para respirar, divídelo,
pero nunca alteres el orden ni te saltes un beat.`);
  }

  const rules = parseList(structure.rules);
  if (rules.length) {
    parts.push(`
## Reglas duras de esta estructura (no negociables)
${bullets(rules)}`);
  }

  if (structure.systemPrompt?.trim()) {
    parts.push(`
## Afinacion especifica de esta estructura
${structure.systemPrompt.trim()}`);
  }

  const examples = renderExamples(structure.examples);
  if (examples) {
    parts.push(`
## Ejemplos ganadores de esta misma estructura
Estudia el ESQUELETO, no el contenido. Debes producir una variante nueva: mismo
esqueleto emocional, situacion y objetos distintos.

${examples}`);
  }

  // ---- 2. EL ARQUETIPO DEL ACTOR ---------------------------------------
  if (archetype) {
    const strengths = parseList(archetype.strengths);
    const avoid = parseList(archetype.avoid);
    const tone = parseList(archetype.toneKeywords);
    const fitLabel =
      archetype.fitScore === null || archetype.fitScore === undefined
        ? "sin evaluar"
        : ["NO ENCAJA", "flojo", "sirve", "encaja perfecto"][archetype.fitScore] ?? "sin evaluar";

    parts.push(`
# 2. EL ARQUETIPO DE QUIEN VA A ACTUAR: ${archetype.name}

Compatibilidad con esta estructura: ${fitLabel}${archetype.fitNotes ? ` — ${archetype.fitNotes}` : ""}
${archetype.summary ? `\n${archetype.summary}` : ""}${
      archetype.personality ? `\nPersonalidad: ${archetype.personality}` : ""
    }${archetype.ageRange ? `\nRango de edad: ${archetype.ageRange}` : ""}
Nivel de energía: ${archetype.energyLevel}/5 ${
      archetype.energyLevel >= 4
        ? "(alto: aguanta gritos, exageracion y comedia fisica)"
        : archetype.energyLevel <= 2
          ? "(bajo: funciona mejor en tono intimo, calmado, confidencial)"
          : "(medio: natural y conversacional)"
    }
${strengths.length ? `\nLo que le sale natural:\n${bullets(strengths)}` : ""}
${avoid.length ? `\nLo que NO le queda y debes evitar:\n${bullets(avoid)}` : ""}
${tone.length ? `\nTono: ${tone.join(", ")}` : ""}
${archetype.brandingNotes ? `\nBranding personal: ${archetype.brandingNotes}` : ""}
${brandingPersonal(archetype)}
CRITICO: cada linea de dialogo y cada indicacion de actuacion tiene que sonar creible
en boca de esta persona. Si la estructura pide algo que no puede sostener, adáptalo a lo
que si le sale natural en vez de forzarlo. Un actor forzado se nota en pantalla y mata el
video.`);
  } else {
    parts.push(`
# 2. QUIEN ACTUA
No se eligio a nadie en concreto. Describe en cada escena que perfil de persona
debería interpretarla, para que producción elija bien.`);
  }

  // ---- 3. LA MARCA ------------------------------------------------------
  if (brand) {
    const valueProps = parseList(brand.valueProps ?? "[]");
    const doNots = parseList(brand.doNots ?? "[]");
    const keywords = parseList(brand.keywords ?? "[]");

    parts.push(`
# 3. LA MARCA: ${brand.name}${brand.tagline ? ` — ${brand.tagline}` : ""}`);

    parts.push(section("Que es", brand.description));
    parts.push(section("Identidad y personalidad", brand.identity));
    parts.push(section("Brief permanente", brand.brief));
    parts.push(section("Tono de voz", brand.toneOfVoice));
    parts.push(section("Público al que le habla", brand.audience));
    if (valueProps.length) parts.push(section("Propuestas de valor a usar", bullets(valueProps)));
    if (keywords.length) parts.push(section("Palabras de la marca", keywords.join(", ")));
    if (doNots.length) {
      parts.push(section("PROHIBIDO para esta marca", bullets(doNots)));
    }

    const contacto = [
      brand.whatsapp ? `WhatsApp: ${brand.whatsapp}` : "",
      brand.instagram ? `Instagram: ${brand.instagram}` : "",
      brand.tiktok ? `TikTok: ${brand.tiktok}` : "",
      brand.website ? `Web: ${brand.website}` : "",
    ].filter(Boolean);
    if (contacto.length) parts.push(section("Canales para el CTA", bullets(contacto)));
  }

  // ---- 4. REFERENCIAS (PDFs) -------------------------------------------
  if (references.length) {
    let used = 0;
    const docs: string[] = [];
    for (const ref of references) {
      if (used >= MAX_CHARS_TOTAL) break;
      const room = Math.min(MAX_CHARS_PER_DOC, MAX_CHARS_TOTAL - used);
      const text = ref.text.slice(0, room).trim();
      if (!text) continue;
      used += text.length;
      docs.push(
        `### [${ref.source}] ${ref.label}\n${text}${
          ref.text.length > room ? "\n…(documento recortado)" : ""
        }`
      );
    }
    if (docs.length) {
      parts.push(`
# 4. DOCUMENTOS DE REFERENCIA CARGADOS

Estos son los PDFs que el equipo subio para esta estructura, este arquetipo y esta marca.
Son la fuente de verdad: si algo aqui contradice tu intuicion, gana el documento.

${docs.join("\n\n")}`);
    }
  }

  // ---- 5. COMO ENTREGAR -------------------------------------------------
  parts.push(`
# 5. COMO DEBE SALIR EL GUION

Cada escena tiene que ser grabable sin preguntar nada. Eso significa:

- **voice**: el texto exacto que se dice, palabra por palabra, listo para leer en voz alta.
  Nada de "aqui explica los beneficios". Escribe la frase real.
- **shot**: encuadre y movimiento concreto (primer plano, plano medio, picada desde arriba,
  transicion tapando el lente, camara en mano siguiendo…).
- **action**: la accion fisica que ocurre.
- **actors**: quien aparece, qué perfil debería interpretarlo y cómo debe actuar.
- **emotion**: la emocion concreta del momento (verguenza contenida, sorpresa genuina,
  ternura, fastidio juguetón…). Nada de "emocionado" a secas.
- **lighting**: iluminacion que refuerza ESA emocion (luz dura lateral para tension,
  luz calida suave frontal para ternura, contraluz para misterio…).
- **sound**: musica, efectos y ambiente. Di el tipo de sonido, no el nombre de una cancion
  con derechos.
- **props**: todo lo que hay que tener fisicamente en la mano ese dia.
- **onScreenText**: el texto en pantalla, si lo hay.

Reglas de tiempo:
- Duración total objetivo: ${input.durationSec} segundos. La suma de las escenas debe caer
  entre ${Math.round(input.durationSec * 0.85)} y ${Math.round(input.durationSec * 1.15)} segundos.
- Los primeros 3 segundos deciden todo: el primer beat tiene que entrar sin introduccion.
- startSec y endSec deben ser continuos: el endSec de una escena es el startSec de la siguiente.

${
  esVenta
    ? `Como esta estructura VENDE, el guion TERMINA en un llamado a la acción claro y concreto,
usando los canales de la marca. El CTA no puede ser generico.`
    : `Como esta estructura solo ENTRETIENE, NO vendas nada y deja "cta" en "".
No menciones precios, ofertas ni "escribenos".`
}

Prohibido:
- Frases de relleno de IA ("en el mundo actual", "descubre como", "no es solo X, es Y").
- Adjetivos vacios sin imagen concreta detras.
- Prometer resultados que la marca no dijo que puede cumplir.
- Copiar textualmente los ejemplos ganadores.

${OUTPUT_CONTRACT_TEXT}`);

  return parts.filter((p) => p.trim().length > 0).join("\n");
}

/* -------------------------------------------------------------- USUARIO -- */

export function buildUserPrompt(input: BuildPromptInput): string {
  const parts: string[] = [];

  parts.push(
    `Escribe UN guion completo con la estructura "${input.structure.name}"${
      input.brand ? ` para la marca ${input.brand.name}` : ""
    }.`
  );

  if (input.productFocus?.trim()) {
    parts.push(`\nProducto o servicio del video: ${input.productFocus.trim()}`);
  }

  if (input.request?.trim()) {
    parts.push(`\nLo que pide el equipo para este video:\n${input.request.trim()}`);
  }

  if (input.variantHint?.trim()) {
    parts.push(
      `\nVariante: ${input.variantHint.trim()}\nMisma estructura, situacion y objetos completamente distintos a los ejemplos.`
    );
  }

  parts.push(`\nDuracion objetivo: ${input.durationSec} segundos.`);

  return parts.join("\n");
}
