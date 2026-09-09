import { normalizeSceneTimes, type GenerateInput, type GenerateOutput } from "@/lib/ai";
import { auditInTransaction } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth";
import type { AppTransaction } from "@/lib/prisma";
import { AI_MODELS, VOICE_TYPE_MAP } from "@/lib/constants";
function nombreModelo(provider: string, model: string) {
  return AI_MODELS[provider]?.find(m => m.value === model)?.label.split(" - ")[0] ?? model;
}
export async function persistGeneratedScript(tx: AppTransaction, user: SessionUser, itemId: string, input: GenerateInput, result: GenerateOutput) {
  const { structureId, brandId, archetypeId, productFocus, request, creativeAngle, variantHint, ctaTrigger, ctaActionType, ctaDetail, cta } = input;
  const durationSec = input.durationSec ?? 0;
  const structure = await tx.structure.findUniqueOrThrow({ where: { id: structureId }, select: { name: true, defaultDurationSec: true } });
    const generated = result.script;
    const scenes = Array.isArray(generated.scenes) ? generated.scenes : [];
    if (!scenes.length) throw new Error("La IA no devolvió escenas.");

    const times = normalizeSceneTimes(
      scenes.map((scene) => ({
        startSec: Number.isFinite(scene.startSec) ? scene.startSec : 0,
        endSec: Number.isFinite(scene.endSec) ? scene.endSec : 0,
      }))
    );
    const totalSeconds = times.length ? times[times.length - 1].endSec : 0;

    const objetivo = durationSec > 0 ? durationSec : structure.defaultDurationSec;
    const briefInput = [
      productFocus ? `Producto o servicio: ${productFocus}` : "",
      request ? `Petición del equipo:\n${request}` : "",
      creativeAngle ? `Ángulo creativo: ${creativeAngle}` : "",
      variantHint ? `Variante pedida: ${variantHint}` : "",
      ctaTrigger ? `Gatillo CTA (Hormozi): ${ctaTrigger}` : "",
      ctaActionType ? `Acción de CTA: ${ctaActionType}` : "",
      ctaDetail ? `Detalle CTA: ${ctaDetail}` : "",
      cta ? `CTA solicitado: ${cta}` : "",
      `Duración objetivo: ${objetivo} segundos`,
      result.referencesUsed.length
        ? `Documentos inyectados:\n${result.referencesUsed.map((r) => `· ${r}`).join("\n")}`
        : "Sin documentos de referencia cargados.",
    ]
      .filter(Boolean)
      .join("\n\n");


    const script = await tx.script.create({
      data: {
        generationItemId: itemId,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        title: generated.title?.trim() || `Guion ${structure.name}`,
        brandId,
        structureId,
        archetypeId,
        avatar: generated.avatar?.trim() || null,
        focus: generated.focus?.trim() || null,
        hook: generated.hook?.trim() || null,
        cta: generated.cta?.trim() || cta?.trim() || null,
        totalSeconds,
        status: "BORRADOR",
        notes: generated.castNotes?.trim() || null,
        provider: result.provider,
        model: result.model,
        promptUsed: result.systemPrompt,
        rawResponse: result.raw,
        briefInput,
        generatedAt: new Date(),
        authorId: user.id,
        scenes: {
          create: scenes.map((scene, i) => ({
            order: i,
            beat: scene.beat?.trim() || `Escena ${i + 1}`,
            startSec: times[i]?.startSec ?? 0,
            endSec: times[i]?.endSec ?? 0,
            voice: scene.voice?.trim() || null,
            voiceType: VOICE_TYPE_MAP[scene.voiceType] ? scene.voiceType : "EN_CAMARA",
            shot: scene.shot?.trim() || null,
            action: scene.action?.trim() || null,
            actors: JSON.stringify(
              (Array.isArray(scene.actors) ? scene.actors : []).map((actor) => ({
                role: actor.role ?? "",
                archetype: actor.archetype ?? "",
                notes: actor.notes ?? "",
              }))
            ),
            emotion: scene.emotion?.trim() || null,
            props: JSON.stringify(
              (Array.isArray(scene.props) ? scene.props : [])
                .map((p) => String(p).trim())
                .filter(Boolean)
            ),
            lighting: scene.lighting?.trim() || null,
            sound: scene.sound?.trim() || null,
            onScreenText: scene.onScreenText?.trim() || null,
            location: scene.location?.trim() || null,
            notes: scene.notes?.trim() || null,
          })),
        },
      },
      select: { id: true, title: true, brandId: true },
    });

    await auditInTransaction(tx, {
      user,
      action: "GENERAR",
      entity: "Script",
      entityId: script.id,
      brandId: script.brandId,
      summary: `Generó el guion "${script.title}" con ${nombreModelo(
        result.provider,
        result.model
      )} usando la estructura "${structure.name}"`,
      changes: {
        escenas: { etiqueta: "Escenas", antes: 0, despues: scenes.length },
        totalSeconds: { etiqueta: "Duración", antes: 0, despues: totalSeconds },
      },
    });

      return script.id;

}
