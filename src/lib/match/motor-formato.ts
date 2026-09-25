/**
 * El motor «Por tipo de video».
 *
 * Determinista, sin IA y sin clave: cruza el tipo de video con el perfil de
 * cada persona y devuelve un veredicto al instante. Es la red de seguridad de
 * todo lo demás — cuando la IA falla, cuando no hay clave o cuando el dueño no
 * quiere gastar, esta tabla siempre tiene algo que decir.
 *
 * Es una funcion PURA y SINCRONA, sin prisma y sin "use server": esa es la
 * condicion para poder importarla desde un Server Component y desde el
 * formulario del generador, que es cliente.
 *
 * No pide que le creas: devuelve cada senal con lo que suma o resta, y la
 * pantalla las ensena. La aritmetica esta a la vista.
 */

import type { Beat } from "@/lib/ai/context";

import { afinidad, bolsaDelFormato, energiaPedida, fuerza, norm, tieneDialogo, type FormatoMatch } from "@/lib/match/lexico";
import type { GuionMatch, PersonaMatch, Senal, Veredicto } from "@/lib/match/tipos";

export type { FormatoMatch } from "@/lib/match/lexico";

/** El punto de partida: ni bien ni mal, a la espera de señales. */
const BASE = 50;

/**
 * De puntos a la escala oficial de FIT_SCORES.
 *
 * Vive aquí y solo aquí: la usan los dos motores.
 *
 * Los cortes NO son redondos a propósito: salen de barrer todas las
 * combinaciones contra la matriz entera y quedarse con la que minimiza el
 * error CARO. Porque los errores no cuestan igual: confundir «Sirve» con
 * «Encaja perfecto» no rompe nada, pero decirle «No encaja» a alguien que sí
 * encajaba le quita al dueño una opción buena sin que se entere. Con estos
 * cortes: 93% de los pares no se alejan más de un punto, cero se equivocan de
 * lado y cero rechazos falsos.
 *
 * Los dos extremos están puestos lejos a propósito, y por la misma razón: este
 * motor solo miró el TIPO DE VIDEO. No tiene autoridad para coronar a nadie
 * («encaja perfecto» pide 78) ni para vetarlo («no encaja» pide bajar de 20).
 * Esos dos veredictos son del motor automático, que sí leyó el guion. Lo que
 * este motor hace bien es ordenar y avisar, y para eso está el tramo de en
 * medio.
 *
 * Si cambian los pesos o entran personas nuevas, hay que volver a correr
 * `npm run test:motores` y mover esto.
 */
export function fitDesdeScore(n: number): number {
  return n >= 78 ? 3 : n >= 42 ? 2 : n >= 20 ? 1 : 0;
}

/**
 * Un formato sintético para cuando el guion no tiene estructura.
 * `Script.structureId` es nulable, así que este caso es real.
 */
export function formatoDesdeGuion(
  script: { cta: string | null },
  escenas: { beat: string; startSec: number; endSec: number; action: string | null; emotion: string | null }[]
): FormatoMatch {
  return {
    name: "Sin estructura",
    category: script.cta?.trim() ? "VENDE" : "ENTRETIENE",
    family: null,
    summary: null,
    beats: escenas.map<Beat>((e) => ({
      name: e.beat,
      seconds: Math.max(0, e.endSec - e.startSec),
      goal: e.action ?? "",
      notes: e.emotion ?? "",
    })),
    rules: [],
    systemPrompt: "",
  };
}

/** Los papeles que pide el guion, con el arquetipo que la IA sugirió para cada uno. */
export function papelesPosibles(guion: GuionMatch | null): { papel: string; arquetipo: string }[] {
  if (!guion) return [];
  const vistos = new Map<string, string>();
  for (const escena of guion.escenas) {
    for (const actor of escena.actors) {
      const papel = (actor.role ?? "").trim();
      if (!papel) continue;
      if (!vistos.has(papel)) vistos.set(papel, (actor.archetype ?? "").trim());
    }
  }
  return [...vistos].map(([papel, arquetipo]) => ({ papel, arquetipo }));
}

/* ------------------------------------------------------------- EL MOTOR -- */

export function matchPorTipoDeVideo(
  persona: PersonaMatch,
  formato: FormatoMatch,
  guion: GuionMatch | null = null
): Veredicto {
  const bolsa = bolsaDelFormato(formato);
  const senales: Senal[] = [];
  const topes: string[] = [];
  let puntos = BASE;
  let techo = 3;
  // Cuántas señales tuvieron datos de verdad. Con menos de dos, no opinamos.
  let conDato = 0;

  const suma = (etiqueta: string, delta: number, detalle: string) => {
    if (delta === 0) return;
    senales.push({ etiqueta, delta, detalle });
    puntos += delta;
  };

  /* 1. El criterio humano previo -------------------------------------- */
  // Solo cuenta si lo puso una persona. Un fit escrito por un motor no puede
  // alimentar al motor: se estaria dando la razon a si mismo.
  if (persona.fitHumano !== null) {
    const delta = [-25, -12, 8, 22][persona.fitHumano] ?? 0;
    const etiquetas = ["No encaja", "Flojo", "Sirve", "Encaja perfecto"];
    suma(
      "Criterio humano previo",
      delta,
      `Ya está marcada como «${etiquetas[persona.fitHumano]}» para este formato` +
        (persona.fitNotas ? `: ${persona.fitNotas}` : "")
    );
    conDato += 1;
  }

  /* 2. Choque con lo que evita ---------------------------------------- */
  const evita = [...persona.avoid, ...persona.avoidInVoice, persona.coreTrap ?? ""].filter(
    Boolean
  );
  let castigo = 0;
  const choques: string[] = [];
  let choqueFuerte = false;
  for (const frase of evita) {
    const f = fuerza(frase, bolsa);
    if (f === 0) continue;
    castigo += f === 2 ? 16 : 10;
    choques.push(frase);
    if (f === 2) choqueFuerte = true;
  }
  if (choques.length > 0) {
    castigo = Math.min(castigo, 32);
    suma("Choca con lo que evita", -castigo, choques.slice(0, 3).join(" · "));
    conDato += 1;
    if (choqueFuerte) {
      techo = Math.min(techo, 1);
      topes.push("Este formato pide algo que está en su lista de lo que no hace");
    }
  }

  /* 3. Lo que le sale natural ----------------------------------------- */
  const natural = [
    ...persona.strengths,
    ...persona.toneKeywords,
    ...persona.vocabulary,
    persona.coreTalent ?? "",
  ].filter(Boolean);
  let premio = 0;
  const aciertos: string[] = [];
  for (const frase of natural) {
    const f = fuerza(frase, bolsa);
    if (f === 0) continue;
    premio += f === 2 ? 11 : 7;
    aciertos.push(frase);
  }
  if (aciertos.length > 0) {
    premio = Math.min(premio, 26);
    suma("Le sale natural", premio, aciertos.slice(0, 3).join(" · "));
    conDato += 1;
  }

  /* 4. Ritmo contra energía ------------------------------------------- */
  const pedida = energiaPedida(formato);
  const brecha = Math.min(Math.abs(pedida - persona.energyLevel), 4);
  const deltaEnergia = [12, 6, 0, -8, -16][brecha];
  suma(
    "Ritmo contra su energía",
    deltaEnergia,
    `El formato pide ${pedida}/5 y ella está en ${persona.energyLevel}/5`
  );
  conDato += 1;

  /* 5. Arquetipo contra familia --------------------------------------- */
  if (formato.family) {
    const primario = afinidad(persona.archetypePrimary, formato.family);
    const secundario = afinidad(persona.archetypeSecondary, formato.family);
    const mezcla = primario * 0.7 + secundario * 0.3;
    if (mezcla !== 0) {
      suma(
        "Su arquetipo con esta familia",
        Math.round(mezcla * 15),
        `${persona.archetypePrimary ?? "sin arquetipo"} frente a «${formato.family}»`
      );
      conDato += 1;
    }
  }

  /* 6 y 7. Lo que dice el guion de verdad ------------------------------ */
  const papeles: string[] = [];
  if (guion && guion.escenas.length > 0) {
    // Las emociones que el guion pide, contra lo que ella evita.
    const emociones = guion.escenas.map((e) => e.emotion ?? "").filter(Boolean);
    const bolsaEmociones = new Set<string>();
    for (const e of emociones) for (const t of norm(e).split(" ")) if (t.length >= 4) bolsaEmociones.add(t);
    const chocan = evita.filter((frase) => fuerza(frase, bolsaEmociones) > 0);
    if (chocan.length > 0) {
      suma(
        "Emociones que le piden",
        -12,
        `El guion pide ${emociones.slice(0, 3).join(", ")}, y ella evita ${chocan[0]}`
      );
      conDato += 1;
    }

    // Los papeles. Solo suma, nunca resta: el cruce es fragil.
    const bolsaPersona = new Set<string>();
    for (const t of [
      persona.archetypePrimary ?? "",
      persona.archetypeSecondary ?? "",
      persona.personality ?? "",
      ...persona.strengths,
    ]) {
      for (const w of norm(t).split(" ")) if (w.length >= 4) bolsaPersona.add(w);
    }
    for (const { papel, arquetipo } of papelesPosibles(guion)) {
      if (fuerza(`${papel} ${arquetipo}`, bolsaPersona) > 0) papeles.push(papel);
    }
    if (papeles.length > 0) {
      suma("Papeles que puede hacer", 6, papeles.slice(0, 3).join(", "));
      conDato += 1;
    }
  }

  /* 8. Sin voz cargada ------------------------------------------------- */
  if (!persona.voiceTone && tieneDialogo(formato)) {
    suma(
      "Sin voz cargada",
      -8,
      "Este formato pide diálogo y no sabemos cómo habla: el guion no va a sonar a ella"
    );
    techo = Math.min(techo, 2);
    topes.push("Sin tono de voz cargado no puede pasar de «Sirve»");
  }

  /* 9. Plantilla genérica ---------------------------------------------- */
  if (!persona.isPerson) {
    techo = Math.min(techo, 2);
    topes.push("Es una plantilla de ejemplo, no alguien del equipo");
  }

  /* ------------------------------------------------------- veredicto -- */

  puntos = Math.min(100, Math.max(0, Math.round(puntos)));

  // Un motor que solo miró el ritmo no tiene derecho a decir "no encaja".
  const fit = conDato < 2 ? null : Math.min(fitDesdeScore(puntos), techo);
  const confianza = Math.min(0.8, Math.max(0.2, 0.2 + 0.1 * conDato));

  return {
    archetypeId: persona.id,
    fit,
    puntos,
    confianza,
    resumen: fraseResumen(persona, senales, fit, topes),
    senales,
    papeles,
    topes,
    techo,
  };
}

/** Una frase en español que explique el veredicto de un vistazo. */
export function fraseResumen(
  persona: PersonaMatch,
  senales: Senal[],
  fit: number | null,
  topes: string[]
): string {
  if (fit === null) {
    return `Faltan datos de ${persona.name} para opinar. Rellena su marca personal.`;
  }
  const fuerte = [...senales].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
  if (!fuerte) return "Sin señales: ni a favor ni en contra.";

  const cabeza =
    fuerte.delta > 0
      ? `A favor: ${fuerte.etiqueta.toLowerCase()} — ${fuerte.detalle}`
      : `En contra: ${fuerte.etiqueta.toLowerCase()} — ${fuerte.detalle}`;

  return topes.length > 0 ? `${cabeza}. ${topes[0]}.` : `${cabeza}.`;
}
