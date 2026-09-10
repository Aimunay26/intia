"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireLevel, LEVEL, type SessionUser } from "@/lib/auth";
import { logAudit, diffFields, FIELD_LABELS } from "@/lib/audit";
import { AiError, generateScript, normalizeSceneTimes } from "@/lib/ai";
import { esErrorDeAutenticacion, esErrorDeCuota } from "@/lib/ai/providers";
import { coherenciaCta, type CtaModo } from "@/lib/script-angles";
import {
  AI_MODELS,
  CONTENT_STATUS_MAP,
  SCRIPT_STATUS_MAP,
  VOICE_TYPE_MAP,
} from "@/lib/constants";
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
  scriptIds?: string[];
  totalGenerados?: number;
  /** Tarjeta del calendario a la que quedó unido el primer guion, si se pidió. */
  contentItemId?: string;
  error?: string;
  detail?: string;
  /**
   * Algo salió a medias aunque hubo guiones creados: otros formatos fallaron
   * o no se intentaron (clave rechazada, sin tiempo antes de maxDuration), o
   * el primer guion no pudo unirse al video pedido. Se muestra junto al éxito
   * y el formulario NO redirige para que se pueda leer.
   */
  aviso?: string;
} | null;

/**
 * Límites del lote. La acción corre bajo `maxDuration = 300` de
 * generador/page.tsx: un reintento solo tiene sentido si, tras esperar, todavía
 * cabe un guion entero antes de que Vercel corte la función.
 */
const LOTE_MAX_MS = 300_000;
/** Pausa antes de reintentar la estructura que chocó con la cuota del proveedor. */
const ESPERA_CUOTA_MS = 20_000;
/** Lo que suele tardar un guion (30-90 s con Opus 5). */
const DURACION_GUION_MS = 90_000;

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Mensaje y detalle legibles de un fallo de generación. */
function describirFallo(error: unknown, nombreEstructura: string): { error: string; detail?: string } {
  if (error instanceof AiError) return { error: error.message, detail: error.detail };
  return {
    error: `No se pudo generar el formato «${nombreEstructura}».`,
    detail: error instanceof Error ? error.message : String(error),
  };
}

/**
 * Los mensajes de AiError son oraciones completas («Claude está limitando…»).
 * Para incrustarlos en el aviso del lote se les quita el punto final; la
 * mayúscula inicial se conserva porque van tras dos puntos y así no se
 * estropean nombres propios como Claude o Gemini.
 */
function comoMotivo(mensaje: string): string {
  return mensaje.trim().replace(/[.\s]+$/, "");
}

function listarNombres(nombres: string[]): string {
  const citados = nombres.map((n) => `«${n}»`);
  if (citados.length <= 1) return citados.join("");
  return `${citados.slice(0, -1).join(", ")} y ${citados[citados.length - 1]}`;
}

type FormatoConMotivo = { nombre: string; motivo: string };

/** Agrupa formatos por motivo conservando el orden en que aparecieron. */
function agruparPorMotivo(lista: FormatoConMotivo[]): { motivo: string; nombres: string[] }[] {
  const grupos: { motivo: string; nombres: string[] }[] = [];
  for (const item of lista) {
    const grupo = grupos.find((g) => g.motivo === item.motivo);
    if (grupo) grupo.nombres.push(item.nombre);
    else grupos.push({ motivo: item.motivo, nombres: [item.nombre] });
  }
  return grupos;
}

/**
 * «Se generaron 2 de 4. Fallaron «A» y «B»: Claude está limitando…; no se
 * intentó «C» porque la clave fue rechazada.» Si todos fallaron por lo mismo
 * se dice una vez; si no, cada uno con su motivo entre paréntesis.
 */
function avisoDeLoteParcial(
  creados: number,
  total: number,
  fallidos: FormatoConMotivo[],
  noIntentados: FormatoConMotivo[]
): string {
  const partes: string[] = [];
  if (fallidos.length) {
    const grupos = agruparPorMotivo(fallidos);
    const lista =
      grupos.length === 1
        ? `${listarNombres(grupos[0].nombres)}: ${grupos[0].motivo}`
        : fallidos.map((f) => `«${f.nombre}» (${f.motivo})`).join(", ");
    partes.push(`${fallidos.length === 1 ? "Falló" : "Fallaron"} ${lista}`);
  }
  for (const grupo of agruparPorMotivo(noIntentados)) {
    const verbo = grupo.nombres.length === 1 ? "intentó" : "intentaron";
    const frase = `no se ${verbo} ${listarNombres(grupo.nombres)} porque ${grupo.motivo}`;
    partes.push(partes.length ? frase : `${frase.charAt(0).toUpperCase()}${frase.slice(1)}`);
  }
  return `Se generaron ${creados} de ${total}. ${partes.join("; ")}.`;
}

/** Motivos con que se anota un formato que quedó sin intentar. */
const MOTIVO_CLAVE_RECHAZADA = "la clave fue rechazada";
const MOTIVO_SIN_TIEMPO = "no quedaba tiempo antes del límite de 5 minutos de la generación";

/**
 * El corazon del producto: arma el contexto, llama al modelo y guarda
 * el guion (o lote de guiones) con todas sus escenas.
 *
 * El lote es secuencial a propósito (una llamada a la vez contra la cuota).
 * Si la clave es rechazada se aborta de inmediato: seguir con la siguiente
 * estructura solo repetiría el mismo error. Si es cuota, se espera y se
 * reintenta UNA vez esa estructura, siempre que quede margen frente a
 * maxDuration. Lo que sí se creó se conserva y se avisa de lo que faltó.
 */
export async function generarGuion(
  _prev: GenerateState,
  formData: FormData
): Promise<GenerateState> {
  const user = await requireLevel(LEVEL.MEMBER);

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
  // gastar una llamada a la IA: que exista, que siga sin guion, que esté en
  // Idea o Guion (el mismo filtro que ofrece el generador) y que sea de la
  // misma marca. La guarda definitiva contra una pestaña vieja o un doble
  // envío vive en vincularGuionAVideo, que solo escribe si la tarjeta sigue libre.
  let video: { id: string; title: string; brandId: string } | null = null;
  if (contentItemId) {
    const tarjeta = await prisma.contentItem.findUnique({
      where: { id: contentItemId },
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
        error: "Ese video ya no existe.",
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
    video = { id: tarjeta.id, title: tarjeta.title, brandId: tarjeta.brandId };
  }

  // Todas las estructuras de una vez, en el orden pedido: así se sabe el nombre
  // de las que quedan sin intentar si el lote se aborta.
  const estructuras = await prisma.structure.findMany({
    where: { id: { in: structureIds } },
    select: { id: true, name: true, defaultDurationSec: true },
  });
  const lote = structureIds
    .map((id) => estructuras.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  const inicio = Date.now();
  const createdScriptIds: string[] = [];
  const fallidos: FormatoConMotivo[] = [];
  let primerError: { error: string; detail?: string } | null = null;
  /** La clave fue rechazada: se corta el lote y se devuelve ese error. */
  let abortadoPorClave: { error: string; detail?: string } | null = null;
  const noIntentados: FormatoConMotivo[] = [];
  /** Si el primer guion del lote quedó unido al video pedido. */
  let vinculado = false;

  for (const structure of lote) {
    const structureId = structure.id;

    if (abortadoPorClave) {
      noIntentados.push({ nombre: structure.name, motivo: MOTIVO_CLAVE_RECHAZADA });
      continue;
    }

    // Vercel corta la acción en maxDuration: no se arranca un formato que no
    // cabe entero. Lo ya creado se conserva y este se anota en el aviso.
    if (Date.now() - inicio + DURACION_GUION_MS >= LOTE_MAX_MS) {
      noIntentados.push({ nombre: structure.name, motivo: MOTIVO_SIN_TIEMPO });
      continue;
    }

    const entrada = {
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
      creativeAngle: creativeAngle || undefined,
      ctaMode,
      ctaTrigger: ctaTrigger || undefined,
      ctaActionType: ctaActionType || undefined,
      ctaDetail: ctaDetail || undefined,
    };

    let result: Awaited<ReturnType<typeof generateScript>> | null = null;
    let reintentado = false;
    while (!result) {
      try {
        result = await generateScript(entrada);
      } catch (error) {
        const fallo = describirFallo(error, structure.name);

        if (esErrorDeAutenticacion(error)) {
          // Con la clave rechazada, cada estructura siguiente fallaría igual.
          // Este formato también cuenta como fallido: si ya había guiones
          // creados, el aviso tiene que decir que se cortó aquí y por qué.
          abortadoPorClave = fallo;
          if (!primerError) primerError = fallo;
          fallidos.push({ nombre: structure.name, motivo: comoMotivo(fallo.error) });
          break;
        }

        const transcurrido = Date.now() - inicio;
        const quedaMargen = transcurrido + ESPERA_CUOTA_MS + DURACION_GUION_MS < LOTE_MAX_MS;
        if (esErrorDeCuota(error) && !reintentado && quedaMargen) {
          reintentado = true;
          await esperar(ESPERA_CUOTA_MS);
          continue;
        }

        if (!primerError) primerError = fallo;
        fallidos.push({ nombre: structure.name, motivo: comoMotivo(fallo.error) });
        break;
      }
    }
    // Sin resultado: o falló (ya anotado) o se abortó por la clave; en ese caso
    // las estructuras que faltan se anotan como no intentadas en las vueltas siguientes.
    if (!result) continue;

    const generated = result.script;
    const scenes = Array.isArray(generated.scenes) ? generated.scenes : [];
    if (!scenes.length) {
      fallidos.push({ nombre: structure.name, motivo: "el modelo devolvió un guion sin escenas" });
      continue;
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

    const script = await prisma.script.create({
      data: {
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
      changes: {
        escenas: { etiqueta: "Escenas", antes: 0, despues: scenes.length },
        totalSeconds: { etiqueta: "Duración", antes: 0, despues: `${totalSeconds} s` },
      },
    });

    createdScriptIds.push(script.id);

    // La tarjeta solo admite un guion: se une el PRIMERO del lote (el del
    // primer formato previsto) en cuanto existe, no al final: si Vercel corta
    // el lote en maxDuration, el video ya tiene su guion. Los demás quedan
    // sueltos y se asignan desde su ficha. Solo se escribe si la tarjeta sigue
    // libre: un vínculo hecho durante la generación no se pisa.
    if (video && createdScriptIds.length === 1) {
      vinculado = await vincularGuionAVideo(user, script.id, video.id);
    }
  }

  if (!createdScriptIds.length) {
    return (
      abortadoPorClave ||
      primerError || {
        error: "No se pudo generar ningún guion.",
        detail: "Vuelve a intentar con otro modelo o revisa tu clave de API.",
      }
    );
  }

  refrescar(createdScriptIds[0]);
  revalidatePath("/");

  const avisos: string[] = [];
  if (fallidos.length > 0 || noIntentados.length > 0) {
    avisos.push(avisoDeLoteParcial(createdScriptIds.length, lote.length, fallidos, noIntentados));
  }
  if (video && !vinculado) {
    avisos.push(
      `El guion se creó, pero no quedó unido al video «${video.title}»: la tarjeta ya recibió otro guion mientras se generaba, o ya no existe. Si hace falta, asígnalo desde la ficha del guion.`
    );
  }

  return {
    scriptId: createdScriptIds[0],
    scriptIds: createdScriptIds,
    totalGenerados: createdScriptIds.length,
    ...(vinculado && video ? { contentItemId: video.id } : {}),
    ...(avisos.length ? { aviso: avisos.join(" ") } : {}),
  };
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
 * `asignarGuionAVideo` (desde la ficha del guion) como `generarGuion` (cuando
 * el generador arrancó con un video elegido), para que la regla viva en un
 * solo sitio. Devuelve false si algo no cuadra (no existe, marcas distintas)
 * o si la tarjeta ya recibió otro guion entre la comprobación y la escritura:
 * las dos pantallas solo ofrecen tarjetas sin guion, y una generación de
 * 30-300 s no debe pisar un vínculo hecho mientras tanto. En ese caso no se
 * audita nada, porque no se escribió nada.
 */
async function vincularGuionAVideo(
  user: SessionUser,
  scriptId: string,
  contentItemId: string
): Promise<boolean> {
  const [script, video] = await Promise.all([
    prisma.script.findUnique({
      where: { id: scriptId },
      select: {
        id: true,
        title: true,
        structureId: true,
        brandId: true,
        structure: { select: { name: true } },
      },
    }),
    prisma.contentItem.findUnique({
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
  const { count } = await prisma.contentItem.updateMany({
    where: { id: contentItemId, scriptId: null },
    data: {
      scriptId,
      structureId: script.structureId,
      status: nuevoEstado,
    },
  });
  if (count === 0) return false;

  // `changes` lleva el VALOR DE LA COLUMNA (ids, IDEA/GUION); lo legible va en verAntes/verDespues.
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

  revalidatePath("/contenido");
  revalidatePath(`/contenido/${contentItemId}`);
  revalidatePath("/calendario");
  revalidatePath("/");
  refrescar(scriptId);
  return true;
}

/** Cuelga un guion de un video del calendario, desde la ficha del guion. */
export async function asignarGuionAVideo(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);
  const scriptId = field(formData, "scriptId");
  const contentItemId = field(formData, "contentItemId");
  if (!scriptId || !contentItemId) return;

  await vincularGuionAVideo(user, scriptId, contentItemId);
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
