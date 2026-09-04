import { prisma } from "@/lib/prisma";
import { resolveApiKey } from "@/lib/settings";
import { DEFAULT_MODEL } from "@/lib/constants";
import { buildSystemPrompt, buildUserPrompt, type ReferenceDoc } from "@/lib/ai/context";
import {
  AiError,
  generateWithClaude,
  generateWithGemini,
  type GenerationResult,
} from "@/lib/ai/providers";

export { AiError } from "@/lib/ai/providers";
export type { GenerationResult } from "@/lib/ai/providers";

export type GenerateInput = {
  structureId: string;
  brandId?: string | null;
  archetypeId?: string | null;
  request: string;
  productFocus?: string;
  variantHint?: string;
  durationSec?: number;
  provider?: string;
  model?: string;
  cta?: string;
  creativeAngle?: string;
  ctaTrigger?: string;
  ctaActionType?: string;
  ctaDetail?: string;
};

export type GenerateOutput = GenerationResult & {
  systemPrompt: string;
  userPrompt: string;
  /** Nombres de los documentos que se le inyectaron a la IA. */
  referencesUsed: string[];
};

/** Trae el texto de los PDFs de una entidad, sin cargar los bytes del archivo. */
async function loadReferences(
  ownerType: string,
  ownerId: string,
  source: string
): Promise<ReferenceDoc[]> {
  const assets = await prisma.asset.findMany({
    where: { ownerType, ownerId, useForAi: true, NOT: { extractedText: null } },
    select: { label: true, filename: true, extractedText: true },
    orderBy: { createdAt: "asc" },
  });
  return assets
    .filter((a) => (a.extractedText ?? "").trim().length > 0)
    .map((a) => ({
      label: a.label?.trim() || a.filename,
      source,
      text: a.extractedText as string,
    }));
}

export async function generateScript(input: GenerateInput): Promise<GenerateOutput> {
  const structure = await prisma.structure.findUnique({
    where: { id: input.structureId },
  });
  if (!structure) throw new AiError("No se encontró la estructura seleccionada.");

  const brand = input.brandId
    ? await prisma.brand.findUnique({ where: { id: input.brandId } })
    : null;

  const archetype = input.archetypeId
    ? await prisma.archetype.findUnique({ where: { id: input.archetypeId } })
    : null;

  // Compatibilidad arquetipo <-> estructura: el segundo fine tuning.
  let fitScore: number | null = null;
  let fitNotes: string | null = null;
  if (archetype) {
    const fit = await prisma.archetypeFit.findUnique({
      where: {
        archetypeId_structureId: {
          archetypeId: archetype.id,
          structureId: structure.id,
        },
      },
    });
    fitScore = fit?.score ?? null;
    fitNotes = fit?.notes ?? null;
  }

  const references: ReferenceDoc[] = [
    ...(await loadReferences("structure", structure.id, "Estructura")),
    ...(archetype ? await loadReferences("archetype", archetype.id, "Arquetipo") : []),
    ...(brand ? await loadReferences("brand", brand.id, "Marca") : []),
  ];

  const durationSec = input.durationSec ?? structure.defaultDurationSec ?? 45;

  const promptInput = {
    structure: {
      name: structure.name,
      category: structure.category,
      family: structure.family,
      summary: structure.summary,
      beats: structure.beats,
      systemPrompt: structure.systemPrompt,
      rules: structure.rules,
      examples: structure.examples,
      defaultDurationSec: structure.defaultDurationSec,
    },
    brand: brand
      ? {
          name: brand.name,
          tagline: brand.tagline,
          description: brand.description,
          identity: brand.identity,
          brief: brand.brief,
          toneOfVoice: brand.toneOfVoice,
          audience: brand.audience,
          valueProps: brand.valueProps,
          doNots: brand.doNots,
          keywords: brand.keywords,
          whatsapp: brand.whatsapp,
          instagram: brand.instagram,
          tiktok: brand.tiktok,
          website: brand.website,
        }
      : null,
    archetype: archetype
      ? {
          name: archetype.name,
          summary: archetype.summary,
          personality: archetype.personality,
          strengths: archetype.strengths,
          avoid: archetype.avoid,
          toneKeywords: archetype.toneKeywords,
          brandingNotes: archetype.brandingNotes,
          ageRange: archetype.ageRange,
          energyLevel: archetype.energyLevel,
          fitScore,
          fitNotes,

          // Su informe de marca personal: lo que hace que el guion suene a ella.
          isPerson: archetype.isPerson,
          archetypePrimary: archetype.archetypePrimary,
          archetypeSecondary: archetype.archetypeSecondary,
          archetypeTertiary: archetype.archetypeTertiary,
          archetypeSummary: archetype.archetypeSummary,
          coreDesire: archetype.coreDesire,
          coreFear: archetype.coreFear,
          coreTalent: archetype.coreTalent,
          coreTrap: archetype.coreTrap,
          watchOut: archetype.watchOut,
          voiceTone: archetype.voiceTone,
          messageStructure: archetype.messageStructure,
          vocabulary: archetype.vocabulary,
          avoidInVoice: archetype.avoidInVoice,
          soundsLike: archetype.soundsLike,
          sameArchetypeIcons: archetype.sameArchetypeIcons,
          toneReferences: archetype.toneReferences,
          signatureGesture: archetype.signatureGesture,
          palette: archetype.palette,
          typography: archetype.typography,
          aesthetics: archetype.aesthetics,
          visualAvoid: archetype.visualAvoid,
        }
      : null,
    references,
    request: input.request,
    productFocus: input.productFocus,
    variantHint: input.variantHint,
    cta: input.cta,
    creativeAngle: input.creativeAngle,
    ctaTrigger: input.ctaTrigger,
    ctaActionType: input.ctaActionType,
    ctaDetail: input.ctaDetail,
    durationSec,
  };

  const systemPrompt = buildSystemPrompt(promptInput);
  const userPrompt = buildUserPrompt(promptInput);

  const provider = input.provider || structure.defaultProvider || "anthropic";
  const model =
    input.model?.trim() ||
    structure.defaultModel?.trim() ||
    DEFAULT_MODEL[provider] ||
    DEFAULT_MODEL.anthropic;

  const { key } = await resolveApiKey(provider);
  if (!key) {
    throw new AiError(
      provider === "anthropic"
        ? "Falta la clave de Claude (Anthropic)."
        : "Falta la clave de Gemini (Google).",
      "Cárgala en Ajustes o define la variable de entorno correspondiente."
    );
  }

  const call = {
    apiKey: key,
    model,
    system: systemPrompt,
    user: userPrompt,
    temperature: structure.temperature ?? 1,
  };

  const result =
    provider === "google" ? await generateWithGemini(call) : await generateWithClaude(call);

  return {
    ...result,
    systemPrompt,
    userPrompt,
    referencesUsed: references.map((r) => `[${r.source}] ${r.label}`),
  };
}

/**
 * Normaliza los tiempos de las escenas: los hace continuos y consistentes.
 * Los modelos a veces dejan huecos o solapes de un segundo.
 */
export function normalizeSceneTimes(
  scenes: { startSec: number; endSec: number }[]
): { startSec: number; endSec: number }[] {
  let cursor = 0;
  return scenes.map((scene) => {
    const rawDuration = Math.max(1, Math.round(scene.endSec - scene.startSec));
    const start = cursor;
    const end = start + rawDuration;
    cursor = end;
    return { startSec: start, endSec: end };
  });
}
