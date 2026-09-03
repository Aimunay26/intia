/**
 * Los tipos que cruzan la frontera servidor/cliente del match.
 *
 * CERO dependencias a propósito: este es el archivo que importa el componente
 * de cliente. Si aquí entrara algo que arrastre prisma o los SDK de IA, el
 * bundle del navegador se rompería.
 */

/** Una razón concreta del veredicto, con lo que suma o resta. */
export type Senal = {
  etiqueta: string;
  delta: number;
  detalle: string;
};

/**
 * Lo que dice un motor sobre una persona.
 *
 * `fit` puede ser null: cuando el motor tuvo menos de dos señales con dato,
 * dice "sin datos" en vez de inventarse un número. Un motor que solo miró el
 * ritmo no tiene derecho a decir "no encaja".
 */
export type Veredicto = {
  archetypeId: string;
  fit: number | null;
  puntos: number;
  confianza: number;
  resumen: string;
  senales: Senal[];
  /** Papeles del guion que esta persona podría hacer. */
  papeles: string[];
  /** Techos aplicados y por qué, para poder explicarlos. */
  topes: string[];
  /** El techo numérico que quedó tras aplicarlos. 3 = sin techo. */
  techo: number;
};

/** Lo que el motor necesita saber de una persona. */
export type PersonaMatch = {
  id: string;
  name: string;
  isPerson: boolean;
  energyLevel: number;
  archetypePrimary: string | null;
  archetypeSecondary: string | null;
  voiceTone: string | null;
  personality: string | null;
  /** Listas ya parseadas. */
  strengths: string[];
  avoid: string[];
  toneKeywords: string[];
  vocabulary: string[];
  avoidInVoice: string[];
  coreTalent: string | null;
  coreTrap: string | null;
  /** El criterio humano previo, si existe y si es humano. */
  fitHumano: number | null;
  fitNotas: string | null;
};

/** Lo que el motor necesita del guion, cuando hay guion. */
export type GuionMatch = {
  id: string;
  title: string;
  escenas: {
    numero: number;
    beat: string;
    emotion: string | null;
    voice: string | null;
    action: string | null;
    onScreenText: string | null;
    /** Ya parseados desde el String con JSON. */
    actors: { role?: string; archetype?: string; notes?: string }[];
  }[];
};

/** Una fila del panel: los dos motores juntos sobre la misma persona. */
export type FilaPanel = {
  persona: PersonaMatch;
  formato: Veredicto;
  auto?: {
    fit: number;
    confianza: number;
    motivo: string;
    evidencia: string[];
    papeles: string[];
    riesgos: string[];
    mejores: number[];
    dificiles: number[];
    origin: string;
  } | null;
  /** Grabaciones que ya tiene esa semana. Se pinta, no puntúa. */
  cargaSemana: number;
};
