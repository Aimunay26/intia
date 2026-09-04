import { PrismaClient } from "@prisma/client";
import { SEED_STRUCTURES } from "./seed-structures";

const prisma = new PrismaClient();

async function main() {
  console.log(`Sincronizando ${SEED_STRUCTURES.length} estructuras con la base de datos...`);

  let updatedCount = 0;
  for (const s of SEED_STRUCTURES) {
    const data = {
      name: s.name,
      category: s.category,
      family: s.family,
      summary: s.summary,
      beats: JSON.stringify(s.beats),
      systemPrompt: s.systemPrompt,
      rules: JSON.stringify(s.rules),
      examples: JSON.stringify(s.examples ?? []),
      defaultDurationSec: s.defaultDurationSec,
    };

    const row = await prisma.structure.upsert({
      where: { slug: s.slug },
      update: data,
      create: {
        slug: s.slug,
        active: true,
        ...data,
      },
    });

    updatedCount++;
    console.log(`  ✓ [${row.category}] ${row.name} (${row.slug}) sincronizado.`);
  }

  console.log(`\nListo! ${updatedCount} estructuras sincronizadas exitosamente en la base de datos.`);
}

main()
  .catch((e) => {
    console.error("Error sincronizando estructuras:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
