import { normalizeSceneTimes, type GenerateInput, type GenerateOutput } from "@/lib/ai";
import { auditInTransaction } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth";
import type { AppTransaction } from "@/lib/prisma";
import { AI_MODELS, CONTENT_STATUS_MAP, VOICE_TYPE_MAP } from "@/lib/constants";
import { generationStage } from "@/lib/generation-trace";

/**
 * Lo que el trabajo de generación guarda además de la entrada del modelo:
 * la tarjeta del calendario a la que se unirá el primer guion (si se pidió) y
 * el modo del cierre (venta o comunidad), que también viaja al prompt.
 */
export type PersistInput = GenerateInput & {
  contentItemId?: string | null;
  ctaMode?: string;
};

function nombreModelo(provider: string, model: string) {
  return AI_MODELS[provider]?.find(m => m.value === model)?.label.split(" - ")[0] ?? model;
}

export async function persistGeneratedScript(tx: AppTransaction, user: SessionUser, itemId: string, input: PersistInput, result: GenerateOutput) {
  const { structureId, brandId, archetypeId, productFocus, request, creativeAngle, variantHint, ctaTrigger, ctaActionType, ctaDetail, cta } = input;
  const durationSec = input.durationSec ?? 0;
  const ctaMode = input.ctaMode === "comunidad" ? "comunidad" : "venta";
  const structure = await tx.structure.findUniqueOrThrow({ where: { id: structureId }, select: { name: true, defaultDurationSec: true } });
  // Solo para el brief legible: si la tarjeta desapareció mientras se generaba,
  // el guion se crea igual (suelto) y el vínculo se resuelve aparte.
  const video = input.contentItemId
    ? await tx.contentItem.findUnique({ where: { id: input.contentItemId }, select: { title: true } })
    : null;
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
      video ? `Video del calendario: ${video.title}` : "",
      productFocus ? `Producto o servicio: ${productFocus}` : "",
      request ? `Petición del equipo:\n${request}` : "",
      creativeAngle ? `Ángulo creativo: ${creativeAngle}` : "",
      variantHint ? `Variante pedida: ${variantHint}` : "",
      ctaMode === "comunidad" ? "Modo de CTA: sin venta (comunidad)" : "Modo de CTA: venta",
      ctaTrigger
        ? `${ctaMode === "comunidad" ? "Gatillo de comunidad" : "Gatillo CTA (Hormozi)"}: ${ctaTrigger}`
        : "",
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


    const script = await generationStage("script_insert", () => tx.script.create({
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
    }));

    await generationStage("audit_save", () => auditInTransaction(tx, {
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
    }));

      return script.id;

}

/* ------------------------------------------------------------- VINCULAR -- */

/**
 * Puente entre las fases del flujo (CONTRACT.md, «Las tres fases de un video»).
 *
 *   Fase 1  La idea nace como tarjeta en el calendario, con sus formatos
 *           PREVISTOS (structureIds) pero sin guion ni estructura definitiva.
 *   Fase 2  El guion se escribe en el generador (desde la propia tarjeta con
 *           «Crear guion con IA», o suelto) o se trabaja en Guiones.
 *   Fase 3  Se une el guion a la tarjeta: el video hereda la estructura del
 *           guion (structureId) y, si seguía en Idea, pasa a Guion.
 *
 * Esta función es la ÚNICA que escribe ese vínculo. La usan tanto
 * `asignarGuionAVideo` (desde la ficha del guion) como el trabajo de
 * generación (cuando el generador arrancó con un video elegido), para que la
 * regla viva en un solo sitio. Corre dentro de la transacción del llamador.
 * Devuelve false si algo no cuadra (no existe, marcas distintas) o si la
 * tarjeta ya recibió otro guion entre la comprobación y la escritura: las dos
 * pantallas solo ofrecen tarjetas sin guion, y una generación en segundo plano
 * no debe pisar un vínculo hecho mientras tanto. En ese caso no se audita nada,
 * porque no se escribió nada.
 */
export async function vincularGuionAVideo(
  tx: AppTransaction,
  user: SessionUser,
  scriptId: string,
  contentItemId: string
): Promise<boolean> {
  const [script, video] = await Promise.all([
    tx.script.findUnique({
      where: { id: scriptId },
      select: {
        id: true,
        title: true,
        structureId: true,
        brandId: true,
        structure: { select: { name: true } },
      },
    }),
    tx.contentItem.findUnique({
      where: { id: contentItemId },
      select: {
        id: true,
        title: true,
        brandId: true,
        status: true,
        scriptId: true,
        structureId: true,
        script: { select: { title: true } },
        structure: { select: { name: true } },
      },
    }),
  ]);
  if (!script || !video) return false;
  // Un guion escrito para otra marca no se cuelga de esta tarjeta.
  if (script.brandId && script.brandId !== video.brandId) return false;

  // El video hereda la estructura del guion: es la que se usó para escribirlo.
  // Y si la tarjeta seguía siendo una idea suelta, ya tiene guion.
  const nuevoEstado = video.status === "IDEA" ? "GUION" : video.status;

  // Escritura condicionada: solo si la tarjeta sigue sin guion en este
  // instante. Si otra pestaña o compañero se adelantó, count es 0 y se
  // devuelve false sin auditar.
  const { count } = await tx.contentItem.updateMany({
    where: { id: contentItemId, scriptId: null },
    data: {
      scriptId,
      structureId: script.structureId,
      status: nuevoEstado,
    },
  });
  if (count === 0) return false;

  // `changes` lleva el VALOR DE LA COLUMNA (ids, IDEA/GUION); lo legible va en verAntes/verDespues.
  await auditInTransaction(tx, {
    user,
    action: "ASIGNAR",
    entity: "ContentItem",
    entityId: contentItemId,
    brandId: video.brandId,
    summary:
      nuevoEstado !== video.status
        ? `Asignó el guion "${script.title}" al video "${video.title}" y lo pasó a Guion`
        : `Asignó el guion "${script.title}" al video "${video.title}"`,
    changes: {
      scriptId: {
        etiqueta: "Guion",
        antes: video.scriptId,
        despues: scriptId,
        verAntes: video.script?.title ?? "",
        verDespues: script.title,
      },
      structureId: {
        etiqueta: "Estructura",
        antes: video.structureId,
        despues: script.structureId,
        verAntes: video.structure?.name ?? "",
        verDespues: script.structure?.name ?? "",
      },
      ...(nuevoEstado !== video.status
        ? {
            status: {
              etiqueta: "Estado",
              antes: video.status,
              despues: nuevoEstado,
              verAntes: CONTENT_STATUS_MAP[video.status]?.label ?? video.status,
              verDespues: CONTENT_STATUS_MAP[nuevoEstado]?.label ?? nuevoEstado,
            },
          }
        : {}),
    },
  });

  return true;
}
