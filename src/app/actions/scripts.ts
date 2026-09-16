"use server";
import { requirePermission } from "@/lib/auth";
import { allows, assertBrandPermission, assertPermission } from "@/lib/permissions";
import { assertContentAccess, assertScriptAccess, assertVideoOpen, contentScope } from "@/lib/access-scope";

import { enqueueGeneration } from "@/lib/generation-jobs";
import { dispatchGeneration } from "@/lib/generation-dispatch";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { normalizeSceneTimes } from "@/lib/ai";
import { auditInTransaction, diffFields, FIELD_LABELS } from "@/lib/audit";
import { LEVEL, requireLevel, type SessionUser } from "@/lib/auth";
import { CONTENT_STATUS_MAP, SCRIPT_STATUS_MAP, VOICE_TYPE_MAP } from "@/lib/constants";
import { vincularGuionAVideo } from "@/lib/generation-persist";
import { lockRevision, withMutation } from "@/lib/mutations";
import { prisma, type AppTransaction } from "@/lib/prisma";
import { coherenciaCta, type CtaModo } from "@/lib/script-angles";
import { field, fieldOrNull, intField, linesToJson } from "@/lib/utils";
import { boundedNumber, enumField } from "@/lib/validation";

/**
 * Guiones: generacion con IA, edicion del guion y edicion escena por escena.
 *
 * Reglas de permisos que aplica este archivo:
 *  - Crear, generar y editar: perfil de guionista y alcance autorizado.
 *  - Borrar un guion entero: OWNER. Aprobar: coordinación.
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

function refrescar(scriptId?: string) {
  revalidatePath("/guiones");
  if (scriptId) revalidatePath(`/guiones/${scriptId}`);
}

/**
 * Deja las escenas con orden 0..n y tiempos continuos, y actualiza la
 * duracion total del guion. Se llama despues de anadir, mover o borrar.
 */
async function resecuenciar(tx: AppTransaction, scriptId: string, user: SessionUser): Promise<number> {
  const parent = await tx.script.findUniqueOrThrow({ where: { id: scriptId }, select: { brandId: true, totalSeconds: true } });
  const scenes = await tx.scriptScene.findMany({
    where: { scriptId },
    orderBy: { order: "asc" },
    select: { id: true, order: true, startSec: true, endSec: true },
  });

  const times = normalizeSceneTimes(scenes);

  if (scenes.length) {
    await Promise.all(
      scenes.map(async (scene, i) => {
        const data = { order: i, startSec: times[i].startSec, endSec: times[i].endSec };
        const changes = diffFields(scene, data);
        if (!changes) return;
        await tx.scriptScene.update({ where: { id: scene.id }, data });
        await auditInTransaction(tx, { user, action: "EDITAR", entity: "ScriptScene", entityId: scene.id, brandId: parent.brandId, summary: "Ajustó la secuencia y los tiempos de la escena", changes });
      })
    );
  }

  const total = times.length ? times[times.length - 1].endSec : 0;
  await tx.script.update({ where: { id: scriptId }, data: { totalSeconds: total } });
  if (parent.totalSeconds !== total) await auditInTransaction(tx, { user, action: "EDITAR", entity: "Script", entityId: scriptId, brandId: parent.brandId, summary: "Actualizó la duración según sus escenas", changes: diffFields(parent, { totalSeconds: total }) });
  return total;
}

/* ---------------------------------------------------------------- GENERAR -- */

export type GenerateState = {
  /** Trabajo registrado: el formulario abre su pantalla de avance. */
  jobId?: string;
  error?: string;
  detail?: string;
} | null;

/**
 * El corazon del producto: valida el pedido, registra el trabajo de
 * generación (un guion por estructura) y lo despacha a segundo plano.
 *
 * Nada de IA se ejecuta ligado a la pestaña: el avance, los reintentos por
 * cuota, el corte del lote si la clave es rechazada y el vínculo del primer
 * guion con el video pedido viven en src/lib/generation-jobs.ts.
 */
export async function generarGuion(
  _prev: GenerateState,
  formData: FormData
): Promise<GenerateState> {
  const user = await requirePermission("scripts.generate");

  const rawEstructuras = field(formData, "estructuras") || field(formData, "estructura");
  const structureIds = Array.from(
    new Set(
      (rawEstructuras || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    )
  );

  let brandId = fieldOrNull(formData, "marca");
  const contentItemId = fieldOrNull(formData, "video");
  const archetypeId = fieldOrNull(formData, "arquetipo");
  const request = field(formData, "peticion");
  const productName = field(formData, "producto");
  const productDetail = field(formData, "productoDetalle");
  const productFocus = [
    productName ? `Producto/Servicio: ${productName}` : "",
    productDetail ? `Detalle y descripción profunda:\n${productDetail}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const variantHint = field(formData, "variante");
  const durationSec = intField(formData, "duracion", 0);
  const provider = field(formData, "proveedor") || "anthropic";
  const model = field(formData, "modelo");
  const cta = field(formData, "cta");
  const creativeAngle = field(formData, "anguloCreativo");
  // Modo del cierre: sin el campo (formularios viejos) es venta, como siempre.
  // Un gatillo o una acción que no son de ese modo se descartan: un cierre de
  // venta nunca entra en un guion de comunidad, ni al revés.
  const ctaMode: CtaModo = field(formData, "ctaModo") === "comunidad" ? "comunidad" : "venta";
  const { gatillo: ctaTrigger, accion: ctaActionType } = coherenciaCta(
    ctaMode,
    field(formData, "ctaGatillo"),
    field(formData, "ctaAccion")
  );
  const ctaDetail = field(formData, "ctaDetalle");

  if (!structureIds.length) {
    return { error: "Elige al menos una estructura antes de generar." };
  }
  if (!request) {
    return {
      error: "Cuéntale a la IA qué quieres en este video.",
      detail: "Sin una petición concreta el guion sale genérico y no sirve para grabar.",
    };
  }

  // Si el guion es para una tarjeta del calendario, se comprueba ANTES de
  // registrar el trabajo (y gastar llamadas): que exista y sea accesible, que
  // siga sin guion, que esté en Idea o Guion (el mismo filtro que ofrece el
  // generador) y que sea de la misma marca. La guarda definitiva contra una
  // pestaña vieja o un doble envío vive en vincularGuionAVideo, que solo
  // escribe si la tarjeta sigue libre cuando sale el primer guion.
  if (contentItemId) {
    const tarjeta = await prisma.contentItem.findFirst({
      where: { AND: [{ id: contentItemId }, contentScope(user, "scripts.generate")] },
      select: {
        id: true,
        title: true,
        brandId: true,
        status: true,
        scriptId: true,
        brand: { select: { name: true } },
      },
    });
    if (!tarjeta) {
      return {
        error: "Ese video ya no existe o no tienes acceso a él.",
        detail: "Quizá lo eliminaron mientras preparabas el guion. Elige otra tarjeta o genera un guion suelto.",
      };
    }
    if (tarjeta.scriptId) {
      return {
        error: "Ese video ya tiene un guion vinculado.",
        detail: "Quítalo desde su ficha o genera un guion suelto.",
      };
    }
    if (tarjeta.status !== "IDEA" && tarjeta.status !== "GUION") {
      return {
        error: "Ese video ya no admite guion.",
        detail: `Está en ${CONTENT_STATUS_MAP[tarjeta.status]?.label ?? tarjeta.status}: solo se vinculan tarjetas en Idea o Guion. Cambia su estado desde la ficha o genera un guion suelto.`,
      };
    }
    if (brandId && brandId !== tarjeta.brandId) {
      return {
        error: "La marca elegida no es la del video.",
        detail: `El guion se une a la tarjeta «${tarjeta.title}», de ${tarjeta.brand.name}, así que tiene que escribirse para esa marca.`,
      };
    }
    brandId = tarjeta.brandId;
  }

  try {
    const jobId = await enqueueGeneration(user, field(formData, "requestKey"), structureIds, {
      brandId, archetypeId, request, productFocus, variantHint, durationSec: durationSec || undefined,
      provider, model: model || undefined, cta, creativeAngle, ctaMode, ctaTrigger, ctaActionType, ctaDetail,
      contentItemId,
    });
    try { await dispatchGeneration(jobId); }
    catch {
      await prisma.generationJob.updateMany({ where: { id: jobId, status: "QUEUED" }, data: { error: "La solicitud quedó guardada, pero no pudo comenzar. Revisa los cupos y reanúdala desde Mis generaciones." } });
    }
    return { jobId };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo registrar la generación." };
  }
}

/* ------------------------------------------------------------- ACTUALIZAR -- */

/**
 * Edita la ficha del guion. Solo toca los campos que vienen en el formulario,
 * asi el mismo action sirve para el titulo en la cabecera y para el modal completo.
 */
export async function actualizarGuion(formData: FormData) {
  const user = await requirePermission("scripts.write");
  return withMutation(user, false, async (tx, afterCommit) => {
    await assertScriptAccess(tx, user, field(formData, "id"), "scripts.write");
    const id = field(formData, "id");
    if (!id) return;

    await lockRevision(tx, "Script", id, formData);
    const before = await tx.script.findUnique({ where: { id } });
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
      if (!title || title.length > 500) throw new Error("El título debe tener entre 1 y 500 caracteres.");
      if (title) data.title = title;
    }
    if (formData.has("brandId")) { data.brandId = fieldOrNull(formData, "brandId"); assertBrandPermission(user, data.brandId, "scripts.write"); }
    if (formData.has("structureId")) data.structureId = fieldOrNull(formData, "structureId");
    if (formData.has("archetypeId")) data.archetypeId = fieldOrNull(formData, "archetypeId");
    if (formData.has("avatar")) data.avatar = fieldOrNull(formData, "avatar");
    if (formData.has("focus")) data.focus = fieldOrNull(formData, "focus");
    if (formData.has("hook")) data.hook = fieldOrNull(formData, "hook");
    if (formData.has("cta")) data.cta = fieldOrNull(formData, "cta");
    if (formData.has("notes")) data.notes = fieldOrNull(formData, "notes");

    if (!Object.keys(data).length) return;

    if (data.brandId && await tx.contentItem.count({ where: { scriptId: id, brandId: { not: data.brandId } } })) throw new Error("Hay videos de otra marca vinculados a este guion. Desvincúlalos antes de cambiar la marca.");
    const linked = data.structureId !== undefined ? await tx.contentItem.findMany({ where: { scriptId: id }, select: { id: true, brandId: true, structureId: true } }) : [];
    await tx.script.update({ where: { id }, data });
    // El trigger sincroniza el vínculo; el historial conserva los valores anteriores reales.
    for (const video of linked) {
      const changes = diffFields(video, { structureId: data.structureId });
      if (changes) await auditInTransaction(tx, { user, action: "EDITAR", entity: "ContentItem", entityId: video.id, brandId: video.brandId, summary: "Heredó la estructura actualizada de su guion", changes });
    }

    await auditInTransaction(tx, {
      user,
      action: "EDITAR",
      entity: "Script",
      entityId: id,
      brandId: data.brandId ?? before.brandId,
      summary: `Editó el guion "${data.title ?? before.title}"`,
      changes: diffFields(before, data, { ...FIELD_LABELS, avatar: "Avatar", focus: "Enfoque" }),
    });

    afterCommit(() => { refrescar(id); revalidatePath("/contenido", "layout"); revalidatePath("/metricas"); });
  });
}

export async function cambiarEstadoGuion(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);
  return withMutation(user, false, async (tx, afterCommit) => {
    const id = field(formData, "id");
    const status = enumField(formData, "status", SCRIPT_STATUS_MAP);
    if (!id || !SCRIPT_STATUS_MAP[status]) return;

    await assertScriptAccess(tx, user, id, status === "APROBADO" ? "scripts.approve" : "scripts.view");
    await lockRevision(tx, "Script", id, formData);
    const before = await tx.script.findUnique({
      where: { id },
      select: { title: true, status: true, brandId: true },
    });
    if (!before || before.status === status) return;
    if (before.status === "APROBADO" || status === "APROBADO") assertPermission(user, "scripts.approve");
    else if (!allows(user, "scripts.approve")) await assertScriptAccess(tx, user, id, "scripts.write");

    await tx.script.update({ where: { id }, data: { status } });

    await auditInTransaction(tx, {
      user,
      action: "EDITAR",
      entity: "Script",
      entityId: id,
      brandId: before.brandId,
      summary: `Cambió el guion "${before.title}" a ${SCRIPT_STATUS_MAP[status].label}`,
      changes: {
        status: {
          etiqueta: "Estado",
          antes: before.status,
          despues: status,
        },
      },
    });

    afterCommit(() => refrescar(id));
  });
}

/* --------------------------------------------------------------- ELIMINAR -- */

export async function eliminarGuion(formData: FormData) {
  const user = await requireLevel(LEVEL.OWNER);
  return withMutation(user, true, async (tx, afterCommit) => {
    const id = field(formData, "id");
    if (!id) return;

    const script = await tx.script.findUnique({
      where: { id },
      select: { title: true, brandId: true, _count: { select: { scenes: true } } },
    });
    if (!script) return;

    await tx.contentItem.updateMany({ where: { scriptId: id }, data: { scriptId: null, structureId: null } });
    await tx.script.delete({ where: { id } });

    await auditInTransaction(tx, {
      user,
      action: "ELIMINAR",
      entity: "Script",
      entityId: id,
      brandId: script.brandId,
      summary: `Eliminó el guion "${script.title}" y sus ${script._count.scenes} escenas`,
    });

    afterCommit(() => refrescar(id));
    afterCommit(() => redirect("/guiones"));
  });
}

/* -------------------------------------------------------------- DUPLICAR -- */

export async function duplicarGuion(formData: FormData) {
  const user = await requirePermission("scripts.write");
  return withMutation(user, false, async (tx, afterCommit) => {
    await assertScriptAccess(tx, user, field(formData, "id"), "scripts.view");
    const id = field(formData, "id");
    if (!id) return;

    const original = await tx.script.findUnique({
      where: { id },
      include: { scenes: { orderBy: { order: "asc" } } },
    });
    if (!original) return;

    const copia = await tx.script.create({
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

    await auditInTransaction(tx, {
      user,
      action: "CREAR",
      entity: "Script",
      entityId: copia.id,
      brandId: copia.brandId,
      summary: `Duplicó el guion "${original.title}" como "${copia.title}"`,
    });

    afterCommit(() => refrescar(copia.id));
    afterCommit(() => redirect(`/guiones/${copia.id}`));
  });
}

/* ---------------------------------------------------------------- ESCENAS -- */

export async function actualizarEscena(formData: FormData) {
  const user = await requirePermission("scripts.write");
  return withMutation(user, false, async (tx, afterCommit) => {
    const id = field(formData, "id");
    if (!id) return;

    const before = await tx.scriptScene.findUnique({
      where: { id },
      include: { script: { select: { id: true, title: true, brandId: true } } },
    });
    if (!before) return;
    await assertScriptAccess(tx, user, before.scriptId, "scripts.write");

    const rawActors = field(formData, "actors") || "[]";
    if (rawActors.length > 150_000) throw new Error("La lista de actores es demasiado grande.");
    let parsedActors: unknown;
    try { parsedActors = JSON.parse(rawActors); } catch { throw new Error("La lista de actores no tiene un formato válido."); }
    const parsed = z.array(z.object({
      role: z.string().trim().max(200).default(""),
      archetype: z.string().trim().max(200).default(""),
      notes: z.string().trim().max(4000).default(""),
    })).max(30).safeParse(parsedActors);
    if (!parsed.success) throw new Error("Revisa los actores: admite hasta 30 y sus campos deben ser texto.");
    const actors = parsed.data.filter(actor => actor.role || actor.archetype || actor.notes);

    await lockRevision(tx, "Script", before.scriptId, formData);
    const startSec = boundedNumber(intField(formData, "startSec", before.startSec), 0, 86400, "Inicio", true);
    const endSec = boundedNumber(intField(formData, "endSec", before.endSec), startSec + 1, 86400, "Fin", true);

    const data = {
      beat: field(formData, "beat") || before.beat,
      startSec,
      endSec,
      voice: fieldOrNull(formData, "voice"),
      voiceType: enumField(formData, "voiceType", VOICE_TYPE_MAP, "EN_CAMARA"),
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

    await tx.scriptScene.update({ where: { id }, data });
    await resecuenciar(tx, before.scriptId, user);

    await auditInTransaction(tx, {
      user,
      action: "EDITAR",
      entity: "ScriptScene",
      entityId: id,
      brandId: before.script.brandId,
      summary: `Editó la escena ${before.order + 1} "${data.beat}" del guion "${before.script.title}"`,
      changes: diffFields(before, await tx.scriptScene.findUniqueOrThrow({ where: { id } }), SCENE_LABELS),
    });

    afterCommit(() => refrescar(before.scriptId));
  });
}

export async function anadirEscena(formData: FormData) {
  const user = await requirePermission("scripts.write");
  return withMutation(user, false, async (tx, afterCommit) => {
    await assertScriptAccess(tx, user, field(formData, "scriptId"), "scripts.write");
    const scriptId = field(formData, "scriptId");
    if (!scriptId) return;
    await lockRevision(tx, "Script", scriptId, formData);

    const script = await tx.script.findUnique({
      where: { id: scriptId },
      select: { id: true, title: true, brandId: true, _count: { select: { scenes: true } } },
    });
    if (!script) return;

    const last = await tx.scriptScene.findFirst({
      where: { scriptId },
      orderBy: { order: "desc" },
      select: { order: true, endSec: true },
    });

    const start = last?.endSec ?? 0;

    const scene = await tx.scriptScene.create({
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

    await resecuenciar(tx, scriptId, user);

    await auditInTransaction(tx, {
      user,
      action: "CREAR",
      entity: "ScriptScene",
      entityId: scene.id,
      brandId: script.brandId,
      summary: `Añadió la escena "${scene.beat}" al guion "${script.title}"`,
    });

    afterCommit(() => refrescar(scriptId));
  });
}

export async function eliminarEscena(formData: FormData) {
  const user = await requirePermission("scripts.write");
  return withMutation(user, false, async (tx, afterCommit) => {
    const id = field(formData, "id");
    if (!id) return;

    const scene = await tx.scriptScene.findUnique({
      where: { id },
      include: { script: { select: { title: true, brandId: true } } },
    });
    if (!scene) return;
    await assertScriptAccess(tx, user, scene.scriptId, "scripts.write");
    await lockRevision(tx, "Script", scene.scriptId, formData);

    await tx.scriptScene.delete({ where: { id } });
    await resecuenciar(tx, scene.scriptId, user);

    await auditInTransaction(tx, {
      user,
      action: "ELIMINAR",
      entity: "ScriptScene",
      entityId: id,
      brandId: scene.script.brandId,
      summary: `Eliminó la escena ${scene.order + 1} "${scene.beat}" del guion "${scene.script.title}"`,
    });

    afterCommit(() => refrescar(scene.scriptId));
  });
}

export async function moverEscena(formData: FormData) {
  const user = await requirePermission("scripts.write");
  return withMutation(user, false, async (tx, afterCommit) => {
    const id = field(formData, "id");
    const direccion = field(formData, "direccion");
    if (!id || (direccion !== "arriba" && direccion !== "abajo")) return;

    const scene = await tx.scriptScene.findUnique({
      where: { id },
      include: { script: { select: { title: true, brandId: true } } },
    });
    if (!scene) return;
    await assertScriptAccess(tx, user, scene.scriptId, "scripts.write");
    await lockRevision(tx, "Script", scene.scriptId, formData);

    const hermanas = await tx.scriptScene.findMany({
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

    await Promise.all(
      ids.map((sceneId, i) =>
        tx.scriptScene.update({ where: { id: sceneId }, data: { order: i } })
      )
    );
    await resecuenciar(tx, scene.scriptId, user);

    await auditInTransaction(tx, {
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

    afterCommit(() => refrescar(scene.scriptId));
  });
}

/* ------------------------------------------------------------- VINCULAR -- */

/**
 * Cuelga un guion de un video del calendario, desde la ficha del guion.
 *
 * La regla del vínculo (el video hereda la estructura del guion, Idea pasa a
 * Guion, y solo se escribe si la tarjeta sigue sin guion) vive en
 * `vincularGuionAVideo` (src/lib/generation-persist.ts), compartida con el
 * trabajo de generación que une el primer guion del lote al video pedido.
 */
export async function asignarGuionAVideo(formData: FormData) {
  const user = await requirePermission("scripts.write");
  return withMutation(user, false, async (tx, afterCommit) => {
    await assertScriptAccess(tx, user, field(formData, "scriptId"), "scripts.write");
    await assertContentAccess(tx, user, field(formData, "contentItemId"), "scripts.write");
    await assertVideoOpen(tx, user, field(formData, "contentItemId"));
    const scriptId = field(formData, "scriptId");
    const contentItemId = field(formData, "contentItemId");
    if (!scriptId || !contentItemId) return;

    const [script, video] = await Promise.all([
      tx.script.findUnique({ where: { id: scriptId }, select: { brandId: true } }),
      tx.contentItem.findUnique({ where: { id: contentItemId }, select: { brandId: true, scriptId: true } }),
    ]);
    if (!script || !video) return;
    if (script.brandId && script.brandId !== video.brandId) throw new Error("El guion y el video deben pertenecer a la misma marca.");
    if (video.scriptId) throw new Error("Ese video ya tiene un guion vinculado. Quítalo desde su ficha si quieres cambiarlo.");
    const link = await vincularGuionAVideo(tx, user, scriptId, contentItemId);
    if (!link.linked) throw new Error(link.warning ?? "No se pudo vincular el guion. Recarga la página.");

    afterCommit(() => revalidatePath("/contenido"));
    afterCommit(() => revalidatePath(`/contenido/${contentItemId}`));
    afterCommit(() => revalidatePath("/calendario"));
    afterCommit(() => revalidatePath("/"));
    afterCommit(() => refrescar(scriptId));
  });
}

/** Suelta el guion de la tarjeta. La estructura se va con él. */
export async function desvincularGuionDeVideo(formData: FormData) {
  const user = await requirePermission("scripts.write");
  return withMutation(user, false, async (tx, afterCommit) => {
    await assertContentAccess(tx, user, field(formData, "contentItemId"), "scripts.write");
    await assertVideoOpen(tx, user, field(formData, "contentItemId"));
    const contentItemId = field(formData, "contentItemId");
    if (!contentItemId) return;

    const video = await tx.contentItem.findUnique({
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
    await assertScriptAccess(tx, user, video.scriptId, "scripts.write");

    await tx.contentItem.update({
      where: { id: contentItemId },
      data: { scriptId: null, structureId: null },
    });

    await auditInTransaction(tx, {
      user,
      action: "DESASIGNAR",
      entity: "ContentItem",
      entityId: contentItemId,
      brandId: video.brandId,
      summary: `Quitó el guion "${video.script?.title ?? ""}" del video "${video.title}"`,
    });

    afterCommit(() => revalidatePath("/contenido"));
    afterCommit(() => revalidatePath(`/contenido/${contentItemId}`));
    afterCommit(() => revalidatePath("/calendario"));
    afterCommit(() => revalidatePath("/"));
    if (video.scriptId) afterCommit(() => refrescar(video.scriptId!));
  });
}
