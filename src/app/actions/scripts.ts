"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireLevel, LEVEL } from "@/lib/auth";
import { logAudit, diffFields, FIELD_LABELS } from "@/lib/audit";
import { AiError, generateScript, normalizeSceneTimes } from "@/lib/ai";
import { AI_MODELS, SCRIPT_STATUS_MAP, VOICE_TYPE_MAP } from "@/lib/constants";
import { field, fieldOrNull, intField, linesToJson, parseJson } from "@/lib/utils";

/**
 * Guiones: generacion con IA, edicion del guion y edicion escena por escena.
 *
 * Reglas de permisos que aplica este archivo:
 *  - Crear, generar y editar guiones y escenas: EDITOR (es trabajo de creacion).
 *  - Borrar un guion entero: MANAGER (es destructivo y se lleva las escenas).
 */

/* ------------------------------------------------------------- ETIQUETAS -- */

const SCENE_LABELS: Record<string, string> = {
  beat: "Beat",
  startSec: "Inicio",
  endSec: "Fin",
  voice: "Voz",
  voiceType: "Tipo de voz",
  shot: "Encuadre",
  action: "Acción",
  actors: "Actores",
  emotion: "Emoción",
  props: "Utilería",
  lighting: "Iluminación",
  sound: "Sonido",
  onScreenText: "Texto en pantalla",
  location: "Locación",
  notes: "Notas",
};

/** "claude-opus-5" -> "Claude Opus 5". Si no esta en el catalogo, se usa tal cual. */
function nombreModelo(provider: string, model: string) {
  const found = AI_MODELS[provider]?.find((m) => m.value === model);
  if (!found) return model;
  return found.label.split(" - ")[0];
}

function refrescar(scriptId?: string) {
  revalidatePath("/guiones");
  if (scriptId) revalidatePath(`/guiones/${scriptId}`);
}

/**
 * Deja las escenas con orden 0..n y tiempos continuos, y actualiza la
 * duracion total del guion. Se llama despues de anadir, mover o borrar.
 */
async function resecuenciar(scriptId: string): Promise<number> {
  const scenes = await prisma.scriptScene.findMany({
    where: { scriptId },
    orderBy: { order: "asc" },
    select: { id: true, startSec: true, endSec: true },
  });

  const times = normalizeSceneTimes(scenes);

  if (scenes.length) {
    await prisma.$transaction(
      scenes.map((scene, i) =>
        prisma.scriptScene.update({
          where: { id: scene.id },
          data: { order: i, startSec: times[i].startSec, endSec: times[i].endSec },
        })
      )
    );
  }

  const total = times.length ? times[times.length - 1].endSec : 0;
  await prisma.script.update({ where: { id: scriptId }, data: { totalSeconds: total } });
  return total;
}

/* ---------------------------------------------------------------- GENERAR -- */

export type GenerateState = {
  scriptId?: string;
  error?: string;
  detail?: string;
} | null;

/**
 * El corazon del producto: arma el contexto, llama al modelo y guarda
 * el guion con todas sus escenas.
 */
export async function generarGuion(
  _prev: GenerateState,
  formData: FormData
): Promise<GenerateState> {
  const user = await requireLevel(LEVEL.MEMBER);

  const structureId = field(formData, "estructura");
  const brandId = fieldOrNull(formData, "marca");
  const archetypeId = fieldOrNull(formData, "arquetipo");
  const request = field(formData, "peticion");
  const productFocus = field(formData, "producto");
  const variantHint = field(formData, "variante");
  const durationSec = intField(formData, "duracion", 0);
  const provider = field(formData, "proveedor") || "anthropic";
  const model = field(formData, "modelo");
  const cta = field(formData, "cta");

  if (!structureId) {
    return { error: "Elige una estructura antes de generar." };
  }
  if (!request) {
    return {
      error: "Cuéntale a la IA qué quieres en este video.",
      detail: "Sin una petición concreta el guion sale genérico y no sirve para grabar.",
    };
  }

  const structure = await prisma.structure.findUnique({
    where: { id: structureId },
    select: { id: true, name: true, defaultDurationSec: true },
  });
  if (!structure) {
    return { error: "Esa estructura ya no existe. Recarga la página y elige otra." };
  }

  let result;
  try {
    result = await generateScript({
      structureId,
      brandId,
      archetypeId,
      request,
      productFocus: productFocus || undefined,
      variantHint: variantHint || undefined,
      durationSec: durationSec > 0 ? durationSec : undefined,
      provider,
      model: model || undefined,
      cta: cta || undefined,
    });
  } catch (error) {
    if (error instanceof AiError) {
      return { error: error.message, detail: error.detail };
    }
    return {
      error: "No se pudo generar el guion.",
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  const generated = result.script;
  const scenes = Array.isArray(generated.scenes) ? generated.scenes : [];

  if (!scenes.length) {
    return {
      error: "El modelo devolvió un guion sin escenas.",
      detail: "Vuelve a intentar, o prueba con otro modelo o proveedor.",
    };
  }

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
    variantHint ? `Variante pedida: ${variantHint}` : "",
    cta ? `CTA solicitado: ${cta}` : "",
    `Duración objetivo: ${objetivo} segundos`,
    result.referencesUsed.length
      ? `Documentos inyectados:\n${result.referencesUsed.map((r) => `· ${r}`).join("\n")}`
      : "Sin documentos de referencia cargados.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const script = await prisma.script.create({
    data: {
      title: generated.title?.trim() || "Guion sin título",
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

  await logAudit({
    user,
    action: "GENERAR",
    entity: "Script",
    entityId: script.id,
    brandId: script.brandId,
    summary: `Generó el guion "${script.title}" con ${nombreModelo(
      result.provider,
      result.model
    )} usando la estructura "${structure.name}"`,
    // Es una creación, no una edición: el "antes" es que no existía.
    changes: {
      escenas: { etiqueta: "Escenas", antes: 0, despues: scenes.length },
      totalSeconds: { etiqueta: "Duración", antes: 0, despues: `${totalSeconds} s` },
    },
  });

  refrescar(script.id);
  revalidatePath("/");

  return { scriptId: script.id };
}

/* ------------------------------------------------------------- ACTUALIZAR -- */

/**
 * Edita la ficha del guion. Solo toca los campos que vienen en el formulario,
 * asi el mismo action sirve para el titulo en la cabecera y para el modal completo.
 */
export async function actualizarGuion(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);
  const id = field(formData, "id");
  if (!id) return;

  const before = await prisma.script.findUnique({ where: { id } });
  if (!before) return;

  const data: {
    title?: string;
    brandId?: string | null;
    structureId?: string | null;
    archetypeId?: string | null;
    avatar?: string | null;
    focus?: string | null;
    hook?: string | null;
    cta?: string | null;
    notes?: string | null;
  } = {};

  if (formData.has("title")) {
    const title = field(formData, "title");
    if (title) data.title = title;
  }
  if (formData.has("brandId")) data.brandId = fieldOrNull(formData, "brandId");
  if (formData.has("structureId")) data.structureId = fieldOrNull(formData, "structureId");
  if (formData.has("archetypeId")) data.archetypeId = fieldOrNull(formData, "archetypeId");
  if (formData.has("avatar")) data.avatar = fieldOrNull(formData, "avatar");
  if (formData.has("focus")) data.focus = fieldOrNull(formData, "focus");
  if (formData.has("hook")) data.hook = fieldOrNull(formData, "hook");
  if (formData.has("cta")) data.cta = fieldOrNull(formData, "cta");
  if (formData.has("notes")) data.notes = fieldOrNull(formData, "notes");

  if (!Object.keys(data).length) return;

  await prisma.script.update({ where: { id }, data });

  await logAudit({
    user,
    action: "EDITAR",
    entity: "Script",
    entityId: id,
    brandId: data.brandId ?? before.brandId,
    summary: `Editó el guion "${data.title ?? before.title}"`,
    changes: diffFields(before, data, { ...FIELD_LABELS, avatar: "Avatar", focus: "Enfoque" }),
  });

  refrescar(id);
}

export async function cambiarEstadoGuion(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);
  const id = field(formData, "id");
  const status = field(formData, "status");
  if (!id || !SCRIPT_STATUS_MAP[status]) return;

  const before = await prisma.script.findUnique({
    where: { id },
    select: { title: true, status: true, brandId: true },
  });
  if (!before || before.status === status) return;

  await prisma.script.update({ where: { id }, data: { status } });

  await logAudit({
    user,
    action: "EDITAR",
    entity: "Script",
    entityId: id,
    brandId: before.brandId,
    summary: `Cambió el guion "${before.title}" a ${SCRIPT_STATUS_MAP[status].label}`,
    changes: {
      status: {
        etiqueta: "Estado",
        antes: SCRIPT_STATUS_MAP[before.status]?.label ?? before.status,
        despues: SCRIPT_STATUS_MAP[status].label,
      },
    },
  });

  refrescar(id);
}

/* --------------------------------------------------------------- ELIMINAR -- */

export async function eliminarGuion(formData: FormData) {
  const user = await requireLevel(LEVEL.OWNER);
  const id = field(formData, "id");
  if (!id) return;

  const script = await prisma.script.findUnique({
    where: { id },
    select: { title: true, brandId: true, _count: { select: { scenes: true } } },
  });
  if (!script) return;

  await prisma.script.delete({ where: { id } });

  await logAudit({
    user,
    action: "ELIMINAR",
    entity: "Script",
    entityId: id,
    brandId: script.brandId,
    summary: `Eliminó el guion "${script.title}" y sus ${script._count.scenes} escenas`,
  });

  refrescar(id);
  redirect("/guiones");
}

/* -------------------------------------------------------------- DUPLICAR -- */

export async function duplicarGuion(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);
  const id = field(formData, "id");
  if (!id) return;

  const original = await prisma.script.findUnique({
    where: { id },
    include: { scenes: { orderBy: { order: "asc" } } },
  });
  if (!original) return;

  const copia = await prisma.script.create({
    data: {
      title: `${original.title} (copia)`,
      brandId: original.brandId,
      structureId: original.structureId,
      archetypeId: original.archetypeId,
      avatar: original.avatar,
      focus: original.focus,
      hook: original.hook,
      cta: original.cta,
      totalSeconds: original.totalSeconds,
      status: "BORRADOR",
      version: original.version + 1,
      notes: original.notes,
      provider: original.provider,
      model: original.model,
      promptUsed: original.promptUsed,
      rawResponse: original.rawResponse,
      briefInput: original.briefInput,
      generatedAt: original.generatedAt,
      authorId: user.id,
      scenes: {
        create: original.scenes.map((scene) => ({
          order: scene.order,
          beat: scene.beat,
          startSec: scene.startSec,
          endSec: scene.endSec,
          voice: scene.voice,
          voiceType: scene.voiceType,
          shot: scene.shot,
          action: scene.action,
          actors: scene.actors,
          emotion: scene.emotion,
          props: scene.props,
          lighting: scene.lighting,
          sound: scene.sound,
          onScreenText: scene.onScreenText,
          location: scene.location,
          notes: scene.notes,
        })),
      },
    },
    select: { id: true, title: true, brandId: true },
  });

  await logAudit({
    user,
    action: "CREAR",
    entity: "Script",
    entityId: copia.id,
    brandId: copia.brandId,
    summary: `Duplicó el guion "${original.title}" como "${copia.title}"`,
  });

  refrescar(copia.id);
  redirect(`/guiones/${copia.id}`);
}

/* ---------------------------------------------------------------- ESCENAS -- */

export async function actualizarEscena(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);
  const id = field(formData, "id");
  if (!id) return;

  const before = await prisma.scriptScene.findUnique({
    where: { id },
    include: { script: { select: { id: true, title: true, brandId: true } } },
  });
  if (!before) return;

  const actores = parseJson<{ role?: string; archetype?: string; notes?: string }[]>(
    field(formData, "actors"),
    []
  );
  const actors = (Array.isArray(actores) ? actores : [])
    .map((actor) => ({
      role: String(actor?.role ?? "").trim(),
      archetype: String(actor?.archetype ?? "").trim(),
      notes: String(actor?.notes ?? "").trim(),
    }))
    .filter((actor) => actor.role || actor.archetype || actor.notes);

  const startSec = Math.max(0, intField(formData, "startSec", before.startSec));
  const endSec = Math.max(startSec + 1, intField(formData, "endSec", before.endSec));

  const data = {
    beat: field(formData, "beat") || before.beat,
    startSec,
    endSec,
    voice: fieldOrNull(formData, "voice"),
    voiceType: VOICE_TYPE_MAP[field(formData, "voiceType")]
      ? field(formData, "voiceType")
      : "EN_CAMARA",
    shot: fieldOrNull(formData, "shot"),
    action: fieldOrNull(formData, "action"),
    actors: JSON.stringify(actors),
    emotion: fieldOrNull(formData, "emotion"),
    props: linesToJson(field(formData, "props")),
    lighting: fieldOrNull(formData, "lighting"),
    sound: fieldOrNull(formData, "sound"),
    onScreenText: fieldOrNull(formData, "onScreenText"),
    location: fieldOrNull(formData, "location"),
    notes: fieldOrNull(formData, "notes"),
  };

  await prisma.scriptScene.update({ where: { id }, data });
  await resecuenciar(before.scriptId);

  await logAudit({
    user,
    action: "EDITAR",
    entity: "ScriptScene",
    entityId: id,
    brandId: before.script.brandId,
    summary: `Editó la escena ${before.order + 1} "${data.beat}" del guion "${before.script.title}"`,
    changes: diffFields(before, data, SCENE_LABELS),
  });

  refrescar(before.scriptId);
}

export async function anadirEscena(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);
  const scriptId = field(formData, "scriptId");
  if (!scriptId) return;

  const script = await prisma.script.findUnique({
    where: { id: scriptId },
    select: { id: true, title: true, brandId: true, _count: { select: { scenes: true } } },
  });
  if (!script) return;

  const last = await prisma.scriptScene.findFirst({
    where: { scriptId },
    orderBy: { order: "desc" },
    select: { order: true, endSec: true },
  });

  const start = last?.endSec ?? 0;

  const scene = await prisma.scriptScene.create({
    data: {
      scriptId,
      order: (last?.order ?? -1) + 1,
      beat: field(formData, "beat") || "Escena nueva",
      startSec: start,
      endSec: start + 5,
      voiceType: "EN_CAMARA",
      actors: "[]",
      props: "[]",
    },
    select: { id: true, beat: true },
  });

  await resecuenciar(scriptId);

  await logAudit({
    user,
    action: "CREAR",
    entity: "ScriptScene",
    entityId: scene.id,
    brandId: script.brandId,
    summary: `Añadió la escena "${scene.beat}" al guion "${script.title}"`,
  });

  refrescar(scriptId);
}

export async function eliminarEscena(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);
  const id = field(formData, "id");
  if (!id) return;

  const scene = await prisma.scriptScene.findUnique({
    where: { id },
    include: { script: { select: { title: true, brandId: true } } },
  });
  if (!scene) return;

  await prisma.scriptScene.delete({ where: { id } });
  await resecuenciar(scene.scriptId);

  await logAudit({
    user,
    action: "ELIMINAR",
    entity: "ScriptScene",
    entityId: id,
    brandId: scene.script.brandId,
    summary: `Eliminó la escena ${scene.order + 1} "${scene.beat}" del guion "${scene.script.title}"`,
  });

  refrescar(scene.scriptId);
}

export async function moverEscena(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);
  const id = field(formData, "id");
  const direccion = field(formData, "direccion");
  if (!id || (direccion !== "arriba" && direccion !== "abajo")) return;

  const scene = await prisma.scriptScene.findUnique({
    where: { id },
    include: { script: { select: { title: true, brandId: true } } },
  });
  if (!scene) return;

  const hermanas = await prisma.scriptScene.findMany({
    where: { scriptId: scene.scriptId },
    orderBy: { order: "asc" },
    select: { id: true },
  });

  const desde = hermanas.findIndex((s) => s.id === id);
  const hasta = direccion === "arriba" ? desde - 1 : desde + 1;
  if (desde < 0 || hasta < 0 || hasta >= hermanas.length) return;

  const ids = hermanas.map((s) => s.id);
  const [movida] = ids.splice(desde, 1);
  ids.splice(hasta, 0, movida);

  await prisma.$transaction(
    ids.map((sceneId, i) =>
      prisma.scriptScene.update({ where: { id: sceneId }, data: { order: i } })
    )
  );
  await resecuenciar(scene.scriptId);

  await logAudit({
    user,
    action: "EDITAR",
    entity: "ScriptScene",
    entityId: id,
    brandId: scene.script.brandId,
    summary: `Movió la escena "${scene.beat}" a la posición ${hasta + 1} del guion "${scene.script.title}"`,
    /**
     * Se guarda el ORDEN COMPLETO, no las dos posiciones.
     *
     * Guardar "de la 3 a la 4" parece suficiente y no lo es: la columna `order`
     * empieza en 0 y esas posiciones son las que ve la persona, que empiezan en
     * 1. Quien construyera el retroceso leyendo eso dejaria la escena una
     * posicion por debajo, `resecuenciar()` la dejaria ahi, y nada protestaria.
     * Con el array de ids el retroceso es exacto: se reescribe tal cual estaba.
     */
    changes: {
      ordenEscenas: {
        etiqueta: "Orden de las escenas",
        antes: hermanas.map((s) => s.id),
        despues: ids,
        verAntes: `Estaba en la posición ${desde + 1}`,
        verDespues: `Pasó a la posición ${hasta + 1}`,
      },
    },
  });

  refrescar(scene.scriptId);
}

/* ------------------------------------------------------------- VINCULAR -- */

/** Cuelga un guion de un video del calendario. */
/**
 * Puente entre las dos fases del flujo.
 *
 *   Fase 1  La idea nace como tarjeta en el calendario, sin guion ni estructura.
 *   Fase 2  El guion se trabaja aquí, en Guiones, eligiendo estructura y arquetipo.
 *   Fase 3  Se asigna el guion a la tarjeta: el video hereda la estructura del
 *           guion y, si seguía en Idea, pasa a Guion.
 *
 * Por eso la asignación vive en el área de Guiones y no en el alta del video.
 */
export async function asignarGuionAVideo(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);
  const scriptId = field(formData, "scriptId");
  const contentItemId = field(formData, "contentItemId");
  if (!scriptId || !contentItemId) return;

  const [script, video] = await Promise.all([
    prisma.script.findUnique({
      where: { id: scriptId },
      select: { id: true, title: true, structureId: true, brandId: true },
    }),
    prisma.contentItem.findUnique({
      where: { id: contentItemId },
      select: { id: true, title: true, brandId: true, status: true, scriptId: true },
    }),
  ]);
  if (!script || !video) return;

  // El video hereda la estructura del guion: es la que se usó para escribirlo.
  // Y si la tarjeta seguía siendo una idea suelta, ya tiene guion.
  const nuevoEstado = video.status === "IDEA" ? "GUION" : video.status;

  await prisma.contentItem.update({
    where: { id: contentItemId },
    data: {
      scriptId,
      structureId: script.structureId,
      status: nuevoEstado,
    },
  });

  await logAudit({
    user,
    action: "ASIGNAR",
    entity: "ContentItem",
    entityId: contentItemId,
    brandId: video.brandId,
    summary:
      nuevoEstado !== video.status
        ? `Asignó el guion "${script.title}" al video "${video.title}" y lo pasó a Guion`
        : `Asignó el guion "${script.title}" al video "${video.title}"`,
  });

  revalidatePath("/contenido");
  revalidatePath(`/contenido/${contentItemId}`);
  revalidatePath("/calendario");
  revalidatePath("/");
  refrescar(scriptId);
}

/** Suelta el guion de la tarjeta. La estructura se va con él. */
export async function desvincularGuionDeVideo(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);
  const contentItemId = field(formData, "contentItemId");
  if (!contentItemId) return;

  const video = await prisma.contentItem.findUnique({
    where: { id: contentItemId },
    select: {
      id: true,
      title: true,
      brandId: true,
      scriptId: true,
      script: { select: { id: true, title: true } },
    },
  });
  if (!video || !video.scriptId) return;

  await prisma.contentItem.update({
    where: { id: contentItemId },
    data: { scriptId: null, structureId: null },
  });

  await logAudit({
    user,
    action: "DESASIGNAR",
    entity: "ContentItem",
    entityId: contentItemId,
    brandId: video.brandId,
    summary: `Quitó el guion "${video.script?.title ?? ""}" del video "${video.title}"`,
  });

  revalidatePath("/contenido");
  revalidatePath(`/contenido/${contentItemId}`);
  revalidatePath("/calendario");
  revalidatePath("/");
  if (video.scriptId) refrescar(video.scriptId);
}
