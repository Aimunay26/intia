/**
 * Carga (o actualiza) las personas del equipo desde prisma/seed-personas.ts,
 * y adjunta su informe de branding en PDF si está en la carpeta indicada.
 *
 *   npm run db:personas
 *   npm run db:personas -- "C:/Users/Jhanela/Downloads"
 *
 * Se puede correr las veces que haga falta: actualiza por slug, no duplica.
 */

import "../scripts/local-database-only.mjs";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";

import { SEED_PERSONAS } from "./seed-personas";

const prisma = new PrismaClient();
const J = (v: unknown) => JSON.stringify(v);

/** Busca el PDF de branding de esa persona en la carpeta que se pase. */
function buscarPdf(carpeta: string, slug: string): string | null {
  if (!carpeta || !existsSync(carpeta)) return null;
  const encontrado = readdirSync(carpeta).find(
    (f) => f.toLowerCase().startsWith(`branding-${slug}`) && f.toLowerCase().endsWith(".pdf")
  );
  return encontrado ? join(carpeta, encontrado) : null;
}

async function main() {
  const carpetaPdfs = process.argv[2] ?? "";
  console.log("Cargando personas del equipo…\n");

  for (const p of SEED_PERSONAS) {
    const datos = {
      name: p.name,
      summary: p.summary,
      isPerson: true,
      personality: p.personality,
      strengths: J(p.strengths),
      avoid: J(p.avoid),
      toneKeywords: J(p.toneKeywords),
      brandingNotes: p.brandingNotes ?? null,
      ageRange: p.ageRange ?? null,
      energyLevel: p.energyLevel,
      color: p.color,

      archetypePrimary: p.archetypePrimary,
      archetypeSecondary: p.archetypeSecondary ?? null,
      archetypeTertiary: p.archetypeTertiary ?? null,
      archetypeSummary: p.archetypeSummary,
      coreDesire: p.coreDesire,
      coreFear: p.coreFear,
      coreTalent: p.coreTalent ?? null,
      coreTrap: p.coreTrap,
      evolveToward: p.evolveToward ?? null,
      watchOut: p.watchOut ?? null,
      coherenceIndex: p.coherenceIndex ?? null,

      voiceTone: p.voiceTone,
      messageStructure: p.messageStructure,
      vocabulary: J(p.vocabulary),
      avoidInVoice: J(p.avoidInVoice),
      soundsLike: p.soundsLike,
      sameArchetypeIcons: J(p.sameArchetypeIcons),
      toneReferences: J(p.toneReferences),
      signatureGesture: p.signatureGesture ?? null,

      palette: J(p.palette),
      typography: p.typography ?? null,
      aesthetics: p.aesthetics ?? null,
      visualAvoid: p.visualAvoid ?? null,
    };

    const persona = await prisma.archetype.upsert({
      where: { slug: p.slug },
      create: { slug: p.slug, ...datos },
      update: datos,
    });

    console.log(
      `  ${p.name.padEnd(10)} ${p.archetypePrimary}` +
        (p.archetypeSecondary ? ` · ${p.archetypeSecondary}` : "")
    );

    // Con qué formatos hace match. Solo se crea lo que falta: si alguien ya
    // corrigió una puntuación a mano no se la pisamos.
    let nuevos = 0;
    for (const [slug, fit] of Object.entries(p.fits)) {
      const estructura = await prisma.structure.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (!estructura) {
        console.log(`             (no existe la estructura "${slug}")`);
        continue;
      }

      const yaEsta = await prisma.archetypeFit.findUnique({
        where: {
          archetypeId_structureId: {
            archetypeId: persona.id,
            structureId: estructura.id,
          },
        },
        select: { id: true },
      });
      if (yaEsta) continue;

      await prisma.archetypeFit.create({
        data: {
          archetypeId: persona.id,
          structureId: estructura.id,
          score: fit.score,
          notes: fit.notes ?? null,
          // Lo pone un script, no el dueño. Llamarlo "A mano" seria mentir.
          source: "SEED",
        },
      });
      nuevos += 1;
    }
    if (nuevos > 0) {
      console.log(`             + ${nuevos} estructuras evaluadas`);
    }

    // El PDF original, adjunto como referencia para la IA.
    const ruta = buscarPdf(carpetaPdfs, p.slug);
    if (ruta) {
      const yaEsta = await prisma.asset.findFirst({
        where: { ownerType: "archetype", ownerId: persona.id, label: "Informe de branding" },
      });
      if (!yaEsta) {
        const buffer = readFileSync(ruta);
        const { extractText, getDocumentProxy } = await import("unpdf");
        const pdf = await getDocumentProxy(new Uint8Array(buffer));
        const { text } = await extractText(pdf, { mergePages: true });
        const limpio = String(text).replace(/\s+/g, " ").trim();

        await prisma.asset.create({
          data: {
            ownerType: "archetype",
            ownerId: persona.id,
            filename: ruta.split(/[\\/]/).pop() ?? `branding-${p.slug}.pdf`,
            mimeType: "application/pdf",
            size: buffer.byteLength,
            data: buffer,
            label: "Informe de branding",
            extractedText: limpio.slice(0, 200_000),
            useForAi: true,
          },
        });
        console.log(
          `             + informe adjunto (${Math.round(buffer.byteLength / 1024)} KB, ${limpio.length} caracteres)`
        );
      }
    } else if (carpetaPdfs) {
      console.log(`             (no se encontró branding-${p.slug}*.pdf en ${carpetaPdfs})`);
    }
  }

  const personas = await prisma.archetype.count({ where: { isPerson: true } });
  const genericos = await prisma.archetype.count({ where: { isPerson: false } });

  console.log(`\n${personas} personas cargadas.`);
  if (genericos > 0) {
    console.log(
      `Quedan ${genericos} perfiles genéricos de ejemplo. Puedes eliminarlos desde\n` +
        "Arquetipos si ya no los necesitas: no son personas reales."
    );
  }
}

main()
  .catch((e) => {
    console.error("Falló la carga:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
