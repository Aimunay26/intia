"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { LEVEL, requireLevel } from "@/lib/auth";
import { extractAnyText } from "@/lib/pdf";
import { parseBrandingReport, type ParsedBranding } from "@/lib/branding-parser";
import { linesToJson, slugify } from "@/lib/utils";

export type ProcessBrandingResult = {
  ok: boolean;
  message: string;
  parsed: ParsedBranding;
  brandId?: string;
  archetypeId?: string;
};

export async function procesarInformeBranding(
  formData: FormData
): Promise<ProcessBrandingResult> {
  const user = await requireLevel(LEVEL.MEMBER);

  const file = formData.get("file") as File | null;
  if (!file || !(file instanceof File) || file.size === 0) {
    throw new Error("Debes seleccionar un archivo PDF con el informe de branding.");
  }

  const tipo = (formData.get("tipo") as "PERSONAL" | "BUSINESS") || "PERSONAL";
  const brandId = (formData.get("brandId") as string) || null;
  const archetypeId = (formData.get("archetypeId") as string) || null;

  const buffer = await file.arrayBuffer();
  const extraction = await extractAnyText(buffer, file.type, file.name);

  if (!extraction.text || extraction.text.trim().length < 50) {
    throw new Error(
      "No se pudo extraer texto legible del PDF. Asegúrate de que sea un archivo digital y no una imagen escaneada sin texto."
    );
  }

  const parsed = parseBrandingReport(extraction.text, tipo);

  let targetBrandId = brandId;
  let targetArchetypeId = archetypeId;

  // 1. Manejo de Marca
  if (targetBrandId) {
    await prisma.brand.update({
      where: { id: targetBrandId },
      data: {
        tagline: parsed.tagline,
        identity: parsed.identity,
        brief: parsed.brief,
        toneOfVoice: parsed.toneOfVoice,
        audience: parsed.audience,
        valueProps: JSON.stringify(parsed.valueProps),
        doNots: JSON.stringify(parsed.doNots),
        keywords: JSON.stringify(parsed.keywords),
        colorPrimary: parsed.colorPrimary,
        colorSecondary: parsed.colorSecondary,
        colorAccent: parsed.colorAccent,
      },
    });
  } else if (!targetArchetypeId) {
    // Si no se pasó brandId ni archetypeId, crear la marca
    const baseSlug = slugify(parsed.name) || "marca";
    const existing = await prisma.brand.findUnique({ where: { slug: baseSlug } });
    const slug = existing ? `${baseSlug}-${Date.now().toString().slice(-4)}` : baseSlug;

    const nuevaMarca = await prisma.brand.create({
      data: {
        name: parsed.name,
        slug,
        tagline: parsed.tagline,
        identity: parsed.identity,
        brief: parsed.brief,
        toneOfVoice: parsed.toneOfVoice,
        audience: parsed.audience,
        valueProps: JSON.stringify(parsed.valueProps),
        doNots: JSON.stringify(parsed.doNots),
        keywords: JSON.stringify(parsed.keywords),
        colorPrimary: parsed.colorPrimary,
        colorSecondary: parsed.colorSecondary,
        colorAccent: parsed.colorAccent,
      },
    });
    targetBrandId = nuevaMarca.id;
  }

  // 2. Manejo de Marca Personal (Actor / Arquetipo simultáneo)
  if (tipo === "PERSONAL" && parsed.actorData) {
    const actorPayload = {
      isPerson: true,
      archetypePrimary: parsed.actorData.archetypePrimary,
      archetypeSecondary: parsed.actorData.archetypeSecondary,
      archetypeTertiary: parsed.actorData.archetypeTertiary,
      archetypeSummary: parsed.actorData.archetypeSummary,
      coreDesire: parsed.actorData.coreDesire,
      coreFear: parsed.actorData.coreFear,
      coreTalent: parsed.actorData.coreTalent,
      coreTrap: parsed.actorData.coreTrap,
      evolveToward: parsed.actorData.evolveToward,
      watchOut: parsed.actorData.watchOut,
      coherenceIndex: parsed.actorData.coherenceIndex,
      voiceTone: parsed.actorData.voiceTone,
      messageStructure: parsed.actorData.messageStructure,
      vocabulary: JSON.stringify(parsed.actorData.vocabulary),
      avoidInVoice: JSON.stringify(parsed.actorData.avoidInVoice),
      soundsLike: parsed.actorData.soundsLike,
      sameArchetypeIcons: JSON.stringify(parsed.actorData.sameArchetypeIcons),
      toneReferences: JSON.stringify(parsed.actorData.toneReferences),
      typography: parsed.actorData.typography,
      aesthetics: parsed.actorData.aesthetics,
      visualAvoid: parsed.actorData.visualAvoid,
      palette: JSON.stringify(parsed.actorData.palette),
    };

    if (targetArchetypeId) {
      await prisma.archetype.update({
        where: { id: targetArchetypeId },
        data: actorPayload,
      });
    } else {
      // Buscar si ya existe una persona con este nombre
      const existente = await prisma.archetype.findFirst({
        where: { name: parsed.name, isPerson: true },
      });

      if (existente) {
        await prisma.archetype.update({
          where: { id: existente.id },
          data: actorPayload,
        });
        targetArchetypeId = existente.id;
      } else {
        const raiz = slugify(parsed.name) || "actor";
        let candidato = raiz;
        let intento = 2;
        for (;;) {
          const yaExiste = await prisma.archetype.findUnique({
            where: { slug: candidato },
            select: { id: true },
          });
          if (!yaExiste) break;
          candidato = `${raiz}-${intento}`;
          intento += 1;
        }

        const nuevoActor = await prisma.archetype.create({
          data: {
            name: parsed.name,
            slug: candidato,
            summary: parsed.tagline,
            personality: parsed.actorData.archetypePrimary,
            strengths: JSON.stringify(parsed.valueProps),
            avoid: JSON.stringify(parsed.actorData.avoidInVoice),
            toneKeywords: JSON.stringify(parsed.actorData.vocabulary),
            color: parsed.colorPrimary,
            ...actorPayload,
          },
        });
        targetArchetypeId = nuevoActor.id;
      }
    }
  }

  // Revalidar rutas para reflejar los cambios
  revalidatePath("/marcas");
  if (targetBrandId) revalidatePath(`/marcas/${targetBrandId}`);
  revalidatePath("/arquetipos");
  if (targetArchetypeId) revalidatePath(`/arquetipos/${targetArchetypeId}`);
  revalidatePath("/generador");

  const mensaje =
    tipo === "PERSONAL"
      ? `Se procesó el informe de "${parsed.name}": se actualizó la Marca y el perfil de Actor/Arquetipo al mismo tiempo.`
      : `Se procesó el informe de branding de negocio para "${parsed.name}".`;

  return {
    ok: true,
    message: mensaje,
    parsed,
    brandId: targetBrandId ?? undefined,
    archetypeId: targetArchetypeId ?? undefined,
  };
}
