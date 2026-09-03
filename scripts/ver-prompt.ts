/**
 * Imprime el prompt completo que se le manda a la IA para una persona.
 *
 *   npm run ver:prompt -- eru
 *
 * Sirve para comprobar de un vistazo que el informe de branding de esa persona
 * está viajando al modelo: su tono, su vocabulario y lo que nunca diría.
 */

import { PrismaClient } from "@prisma/client";

import { buildSystemPrompt } from "@/lib/ai/context";

const prisma = new PrismaClient();

async function main() {
  const slug = process.argv[2] ?? "eru";

  const persona = await prisma.archetype.findUnique({ where: { slug } });
  if (!persona) throw new Error(`No existe nadie con el slug "${slug}"`);

  const estructura = await prisma.structure.findFirst({
    where: { active: true },
    orderBy: { name: "asc" },
  });
  if (!estructura) throw new Error("No hay ninguna estructura activa");

  const fit = await prisma.archetypeFit.findUnique({
    where: {
      archetypeId_structureId: { archetypeId: persona.id, structureId: estructura.id },
    },
  });

  const prompt = buildSystemPrompt({
    structure: {
      name: estructura.name,
      category: estructura.category,
      family: estructura.family,
      summary: estructura.summary,
      beats: estructura.beats,
      rules: estructura.rules,
      systemPrompt: estructura.systemPrompt,
      examples: estructura.examples,
      defaultDurationSec: estructura.defaultDurationSec,
    },
    brand: null,
    archetype: {
      name: persona.name,
      summary: persona.summary,
      personality: persona.personality,
      strengths: persona.strengths,
      avoid: persona.avoid,
      toneKeywords: persona.toneKeywords,
      brandingNotes: persona.brandingNotes,
      ageRange: persona.ageRange,
      energyLevel: persona.energyLevel,
      fitScore: fit?.score ?? null,
      fitNotes: fit?.notes ?? null,
      isPerson: persona.isPerson,
      archetypePrimary: persona.archetypePrimary,
      archetypeSecondary: persona.archetypeSecondary,
      archetypeTertiary: persona.archetypeTertiary,
      archetypeSummary: persona.archetypeSummary,
      coreDesire: persona.coreDesire,
      coreFear: persona.coreFear,
      coreTalent: persona.coreTalent,
      coreTrap: persona.coreTrap,
      watchOut: persona.watchOut,
      voiceTone: persona.voiceTone,
      messageStructure: persona.messageStructure,
      vocabulary: persona.vocabulary,
      avoidInVoice: persona.avoidInVoice,
      soundsLike: persona.soundsLike,
      sameArchetypeIcons: persona.sameArchetypeIcons,
      toneReferences: persona.toneReferences,
      signatureGesture: persona.signatureGesture,
      palette: persona.palette,
      typography: persona.typography,
      aesthetics: persona.aesthetics,
      visualAvoid: persona.visualAvoid,
    },
    references: [],
    request: "Un video para vender el producto estrella",
    durationSec: estructura.defaultDurationSec,
  });

  console.log(prompt);
  console.log(`\n[${prompt.length} caracteres · estructura "${estructura.name}"]`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
