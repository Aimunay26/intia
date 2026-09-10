"use server";

import { revalidatePath } from "next/cache";

import { validateAssetContent } from "@/lib/asset-security";
import { auditInTransaction, diffFields } from "@/lib/audit";
import { LEVEL, requireLevel } from "@/lib/auth";
import { parseBrandingReport, type ParsedBranding } from "@/lib/branding-parser";
import { withMutation } from "@/lib/mutations";
import { extractAnyText, MAX_UPLOAD_BYTES } from "@/lib/pdf";
import { slugify } from "@/lib/utils";
import { choice } from "@/lib/validation";

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
  const user = await requireLevel(LEVEL.OWNER);

  const file = formData.get("file") as File | null;
  if (!file || !(file instanceof File) || file.size === 0) {
    throw new Error("Debes seleccionar un archivo PDF con el informe de branding.");
  }

  const tipo = choice(String(formData.get("tipo") || "PERSONAL"), ["PERSONAL", "BUSINESS"], "Tipo");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("El archivo supera los 4 MB.");
  const brandId = (formData.get("brandId") as string) || null;
  const archetypeId = (formData.get("archetypeId") as string) || null;

  const buffer = await file.arrayBuffer();
  const mime = validateAssetContent(file.name, new Uint8Array(buffer));
  const extraction = await extractAnyText(buffer, mime, file.name);

  if (!extraction.text || extraction.text.trim().length < 50) {
    throw new Error(
      "No se pudo extraer texto legible del PDF. Asegúrate de que sea un archivo digital y no una imagen escaneada sin texto."
    );
  }

  const parsed = parseBrandingReport(extraction.text, tipo);

  return withMutation(user, false, async (tx, afterCommit) => {
  const beforeBrand = brandId ? await tx.brand.findUniqueOrThrow({where:{id:brandId}}) : null;
  const beforeActor = archetypeId ? await tx.archetype.findUniqueOrThrow({where:{id:archetypeId}}) : tipo === "PERSONAL" ? await tx.archetype.findFirst({where:{name:parsed.name,isPerson:true}}) : null;
  let targetBrandId = brandId;
  let targetArchetypeId = archetypeId;

  // 1. Manejo de Marca
  if (targetBrandId) {
    await tx.brand.update({
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
    const existing = await tx.brand.findUnique({ where: { slug: baseSlug } });
    const slug = existing ? `${baseSlug}-${Date.now().toString().slice(-4)}` : baseSlug;

    const nuevaMarca = await tx.brand.create({
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
      await tx.archetype.update({
        where: { id: targetArchetypeId },
        data: actorPayload,
      });
    } else {
      // Buscar si ya existe una persona con este nombre
      const existente = await tx.archetype.findFirst({
        where: { name: parsed.name, isPerson: true },
      });

      if (existente) {
        await tx.archetype.update({
          where: { id: existente.id },
          data: actorPayload,
        });
        targetArchetypeId = existente.id;
      } else {
        const raiz = slugify(parsed.name) || "actor";
        let candidato = raiz;
        let intento = 2;
        for (;;) {
          const yaExiste = await tx.archetype.findUnique({
            where: { slug: candidato },
            select: { id: true },
          });
          if (!yaExiste) break;
          candidato = `${raiz}-${intento}`;
          intento += 1;
        }

        const nuevoActor = await tx.archetype.create({
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

  if (targetBrandId) { const saved = await tx.brand.findUniqueOrThrow({where:{id:targetBrandId}}); await auditInTransaction(tx,{user,action:beforeBrand?"EDITAR":"CREAR",entity:"Brand",entityId:saved.id,brandId:saved.id,summary:"Aplicó informe de branding",changes:diffFields(beforeBrand??{},saved)}); }
  if (targetArchetypeId) { const saved = await tx.archetype.findUniqueOrThrow({where:{id:targetArchetypeId}}); await auditInTransaction(tx,{user,action:beforeActor?"EDITAR":"CREAR",entity:"Archetype",entityId:saved.id,summary:"Aplicó informe de marca personal",changes:diffFields(beforeActor??{},saved)}); }
  // Revalidar rutas para reflejar los cambios
  afterCommit(() => revalidatePath("/marcas"));
  if (targetBrandId) afterCommit(() => revalidatePath(`/marcas/${targetBrandId}`));
  afterCommit(() => revalidatePath("/arquetipos"));
  if (targetArchetypeId) afterCommit(() => revalidatePath(`/arquetipos/${targetArchetypeId}`));
  afterCommit(() => revalidatePath("/generador"));

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
  });
}
