/**
 * Calibración del motor «Por tipo de video».
 *
 *   npm run test:motores
 *
 * Le pide al motor que puntúe cada par persona×estructura A CIEGAS —con la
 * señal del criterio humano desactivada— y compara su veredicto contra lo que
 * ya está escrito en la matriz. Si el motor no reproduce lo que ya sabemos,
 * no sirve de nada que corra rápido.
 *
 * Aviso honesto sobre qué es esta prueba: la matriz de hoy la sembró un script
 * deduciéndola de los arquetipos, no sale de números reales de rendimiento.
 * O sea que esto mide COHERENCIA (¿el motor razona como razonamos al sembrar?),
 * no acierto. El día que haya métricas de videos publicados, esta misma prueba
 * pasa a medir acierto de verdad sin cambiar una línea.
 */

import { PrismaClient } from "@prisma/client";

import { parseJson, parseList } from "../src/lib/utils";
import type { Beat } from "../src/lib/ai/context";
import { matchPorTipoDeVideo } from "../src/lib/match/motor-formato";
import { STRUCTURE_CATEGORY_MAP } from "../src/lib/constants";
import type { PersonaMatch } from "../src/lib/match/tipos";

const prisma = new PrismaClient();

/**
 * Cuánto se le permite fallar.
 *
 * Los umbrales no son simétricos porque los errores no cuestan igual.
 * Confundir «Sirve» con «Encaja perfecto» no rompe nada: el dueño mira los dos.
 * Pero decirle «No encaja» a alguien que sí encajaba le esconde una opción
 * buena y no se entera nunca. Por eso el rechazo falso tiene tolerancia cero,
 * y la puntuación exacta es el umbral más flojo: es lo más fácil de contar y
 * lo que menos importa.
 */
const UMBRALES = {
  /** Clavar la casilla exacta. El menos importante. */
  exacto: 0.33,
  /** No alejarse más de un punto. Este es el que manda. */
  cerca: 0.9,
  /** Equivocarse de lado por completo: decir 0 a un 3, o al revés. */
  gravesMax: 0,
  /** Descartar a alguien que la matriz da por bueno. Lo caro. */
  rechazosMax: 0,
};

async function main() {
  const [personas, estructuras, fits] = await Promise.all([
    prisma.archetype.findMany({ where: { active: true } }),
    prisma.structure.findMany({ where: { active: true } }),
    prisma.archetypeFit.findMany({ where: { source: { in: ["MANO", "SEED"] } } }),
  ]);

  const esperado = new Map(fits.map((f) => [`${f.archetypeId}:${f.structureId}`, f.score]));

  let total = 0;
  let exacto = 0;
  let cerca = 0;
  let sinDatos = 0;
  const graves: string[] = [];
  const rechazos: string[] = [];
  const porPersona = new Map<string, { n: number; cerca: number }>();
  const matriz: Record<number, Record<number, number>> = { 0: {}, 1: {}, 2: {}, 3: {} };
  const puntosPorReal: Record<number, number[]> = { 0: [], 1: [], 2: [], 3: [] };

  for (const a of personas) {
    // A ciegas: el criterio humano NO se le pasa. Si le dejáramos ver la
    // respuesta, la prueba mediría si sabe copiar, no si sabe deducir.
    const persona: PersonaMatch = {
      id: a.id,
      name: a.name,
      isPerson: a.isPerson,
      energyLevel: a.energyLevel,
      archetypePrimary: a.archetypePrimary,
      archetypeSecondary: a.archetypeSecondary,
      voiceTone: a.voiceTone,
      personality: a.personality,
      strengths: parseList(a.strengths),
      avoid: parseList(a.avoid),
      toneKeywords: parseList(a.toneKeywords),
      vocabulary: parseList(a.vocabulary),
      avoidInVoice: parseList(a.avoidInVoice),
      coreTalent: a.coreTalent,
      coreTrap: a.coreTrap,
      fitHumano: null,
      fitNotas: null,
    };

    for (const s of estructuras) {
      const real = esperado.get(`${a.id}:${s.id}`);
      if (real === undefined) continue;

      const v = matchPorTipoDeVideo(persona, {
        name: s.name,
        category: s.category,
        family: s.family,
        summary: s.summary,
        beats: parseJson<Beat[]>(s.beats, []),
        rules: parseList(s.rules),
        systemPrompt: s.systemPrompt,
        categoryDescription: STRUCTURE_CATEGORY_MAP[s.category]?.description,
      });

      total += 1;
      if (v.fit === null) {
        sinDatos += 1;
        continue;
      }

      const brecha = Math.abs(v.fit - real);
      if (brecha === 0) exacto += 1;
      if (brecha <= 1) cerca += 1;
      if (brecha >= 3) graves.push(`${a.name} × ${s.name}: dijo ${v.fit}, la matriz dice ${real}`);
      if (v.fit === 0 && real >= 2)
        rechazos.push(`${a.name} × ${s.name}: lo descartó y la matriz lo da por bueno (${real})`);

      matriz[real][v.fit] = (matriz[real][v.fit] ?? 0) + 1;
      puntosPorReal[real].push(v.puntos);

      const acc = porPersona.get(a.name) ?? { n: 0, cerca: 0 };
      acc.n += 1;
      if (brecha <= 1) acc.cerca += 1;
      porPersona.set(a.name, acc);
    }
  }

  // El denominador son los pares donde el motor SI opino. Los que dejo en
  // "sin datos" no son fallos: es el motor reconociendo que no sabe, que es
  // justo lo que queremos que haga. Contarlos como errores castigaria la
  // honestidad y empujaria a inventar numeros.
  const opinados = total - sinDatos;
  const pExacto = opinados ? exacto / opinados : 0;
  const pCerca = opinados ? cerca / opinados : 0;

  console.log(`\nCalibración del motor «Por tipo de video»`);
  console.log(`${"─".repeat(52)}`);
  console.log(`  ${total} pares comparados, a ciegas` + (sinDatos ? ` (${opinados} con veredicto)` : ""));
  console.log(`  Clava la puntuación   ${(pExacto * 100).toFixed(0)}%   (mínimo ${UMBRALES.exacto * 100}%)`);
  console.log(`  No se aleja de 1      ${(pCerca * 100).toFixed(0)}%   (mínimo ${UMBRALES.cerca * 100}%)`);
  console.log(`  Errores graves        ${graves.length}     (máximo ${UMBRALES.gravesMax})`);
  console.log(`  Rechazos falsos       ${rechazos.length}     (máximo ${UMBRALES.rechazosMax})`);
  if (sinDatos)
    console.log(`  Sin datos suficientes ${sinDatos}     (no cuentan: el motor dijo que no sabía)`);

  console.log(`\n  Por persona:`);
  for (const [nombre, acc] of [...porPersona].sort()) {
    const pct = acc.n ? Math.round((acc.cerca / acc.n) * 100) : 0;
    console.log(`    ${nombre.padEnd(22)} ${String(pct).padStart(3)}%  (${acc.cerca}/${acc.n})`);
  }

  console.log(`
  Matriz de confusion (fila = la matriz dice, columna = el motor dice):`);
  console.log(`         motor:0  1  2  3   |  puntos medios`);
  for (const r of [0,1,2,3]) {
    const fila = [0,1,2,3].map((c) => String(matriz[r][c] ?? 0).padStart(3)).join("");
    const ps = puntosPorReal[r];
    const medio = ps.length ? Math.round(ps.reduce((x,y)=>x+y,0)/ps.length) : 0;
    const min = ps.length ? Math.min(...ps) : 0;
    const max = ps.length ? Math.max(...ps) : 0;
    console.log(`    real ${r}: ${fila}   |  ${medio} (de ${min} a ${max})`);
  }

  if (graves.length) {
    console.log(`\n  Los que se equivocó de lado:`);
    graves.slice(0, 12).forEach((g) => console.log(`    ${g}`));
  }

  if (rechazos.length) {
    console.log(`
  A quién descartó por error:`);
    rechazos.slice(0, 10).forEach((r) => console.log(`    ${r}`));
  }

  const pasa =
    pExacto >= UMBRALES.exacto &&
    pCerca >= UMBRALES.cerca &&
    graves.length <= UMBRALES.gravesMax &&
    rechazos.length <= UMBRALES.rechazosMax;

  console.log(`\n${"─".repeat(52)}`);
  if (pasa) {
    console.log("El motor reproduce lo que ya sabemos. Se puede seguir.\n");
  } else {
    console.log("El motor NO reproduce lo que ya sabemos.");
    console.log("Ajusta los pesos y las tablas en src/lib/match/lexico.ts.\n");
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
