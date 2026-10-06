"use server";
import { invalidateScriptPreparation, invalidatePreparation } from "@/lib/preparation";
import { transitionScript } from "@/lib/domain/lifecycle";
import { chainEvent } from "@/lib/domain/production-chain";
import { productionChainConfigured } from "@/lib/production-chain-flag";

import { requirePermission } from "@/lib/auth";
import { assertBrandPermission } from "@/lib/permissions";
import { assertContentAccess, assertScriptAccess, assertVideoOpen, contentScope } from "@/lib/access-scope";

import { enqueueGeneration } from "@/lib/generation-jobs";
import { dispatchGeneration } from "@/lib/generation-dispatch";
import { generationEvent, withGenerationTrace } from "@/lib/generation-trace";
import { revalidatePath } from "next/cache";
import { invalidateDomain } from "@/lib/view-invalidation";
import { redirect } from "next/navigation";
import { z } from "zod";

import { normalizeSceneTimes } from "@/lib/ai";
import { auditInTransaction, diffFields, FIELD_LABELS } from "@/lib/audit";
import { LEVEL, requireLevel, type SessionUser } from "@/lib/auth";
import { CONTENT_STATUS_MAP, SCRIPT_STATUS_MAP, VOICE_TYPE_MAP, isProductKind } from "@/lib/constants";
import { vincularGuionAVideo } from "@/lib/generation-persist";
import { lockRevision, withMutation, withWorkflowMutation } from "@/lib/mutations";
import { prisma, type AppTransaction } from "@/lib/prisma";
import { coherenciaCta, type CtaModo } from "@/lib/script-angles";
import { field, fieldOrNull, intField, linesToJson } from "@/lib/utils";
import { boundedNumber, enumField } from "@/lib/validation";
import type { Prisma } from "@prisma/client";
import {
  CATALOG_COMBO_SELECT,
  CATALOG_PRODUCT_SELECT,
  PRODUCT_LIMITS,
  construirFocoDeProducto,
  lineaDeTipo,
  productCatalogEnabled,
  toCatalogCombo,
  toCatalogProduct,
} from "@/lib/product-catalog";

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
  invalidateDomain("script");
  revalidatePath("/tareas");
  revalidatePath("/", "layout");
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

/** El combo con la ficha completa de cada producto: sus listas entran en el texto para la IA. */
const COMBO_CON_PRODUCTOS = {
  ...CATALOG_COMBO_SELECT,
  items: {
    orderBy: CATALOG_COMBO_SELECT.items.orderBy,
    select: { productId: true, quantity: true, product: { select: CATALOG_PRODUCT_SELECT } },
  },
} satisfies Prisma.BrandComboSelect;

const PRODUCTO_CAMBIO = "El producto cambió mientras preparabas el guion. Recarga para usar la versión nueva.";

type ProductoDelCatalogo = { productFocus: string; ids: { productId: string } | { comboId: string } };

/**
 * Ficha del catálogo elegida en el paso 2 (solo con PRODUCT_CATALOG_ENABLED).
 * Se lee de la base de datos filtrada por la marca ya decidida y activa; si su
 * revisión no es la que vio el formulario, se pide recargar. El texto para la
 * IA se arma aquí: el nombre y el tipo que manda el cliente no cuentan, solo
 * "Qué debe saber la IA" (pre-llenado con la ficha y editable para este video).
 * Sin productoId ni comboId devuelve null y generarGuion sigue con el texto libre.
 */
async function productoDelCatalogo(
  user: SessionUser,
  formData: FormData,
  brandId: string | null,
  detalle: string
): Promise<ProductoDelCatalogo | { error: string; detail?: string } | null> {
  const productId = fieldOrNull(formData, "productoId");
  const comboId = fieldOrNull(formData, "comboId");
  if (!productId && !comboId) return null;
  if (!brandId) {
    return { error: "Elige la marca del producto antes de generar.", detail: "Los productos del catálogo pertenecen a una marca." };
  }
  try {
    assertBrandPermission(user, brandId, "scripts.generate");
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No tienes acceso a esta marca." };
  }
  const revision = field(formData, "productoRevision");
  // El detalle de una ficha tiene el mismo límite que "Qué debe saber la IA" en el catálogo:
  // así cabe entero en el texto para la IA y nunca se corta en silencio.
  if (detalle.length > PRODUCT_LIMITS.aiNotes) {
    return { error: `"Qué debe saber la IA" admite hasta ${PRODUCT_LIMITS.aiNotes} caracteres (tiene ${detalle.length}).` };
  }

  if (productId) {
    const row = await prisma.brandProduct.findFirst({ where: { id: productId, brandId, active: true }, select: CATALOG_PRODUCT_SELECT });
    if (!row) {
      return {
        error: "Ese producto ya no está en el catálogo de la marca.",
        detail: "Quizá lo archivaron o es de otra marca. Recarga el generador y elige otro, o cárgalo como producto nuevo.",
      };
    }
    if (row.updatedAt.toISOString() !== revision) return { error: PRODUCTO_CAMBIO };
    const product = toCatalogProduct(row);
    return { productFocus: construirFocoDeProducto({ type: "product", product }, detalle), ids: { productId: product.id } };
  }

  const row = await prisma.brandCombo.findFirst({ where: { id: comboId as string, brandId, active: true }, select: COMBO_CON_PRODUCTOS });
  if (!row) {
    return {
      error: "Ese combo ya no está en el catálogo de la marca.",
      detail: "Quizá lo archivaron o es de otra marca. Recarga el generador y elige otro.",
    };
  }
  if (row.updatedAt.toISOString() !== revision) return { error: PRODUCTO_CAMBIO };
  // Un producto archivado ya no se vende: el combo que lo incluye no se ofrece hasta reactivarlo o quitarlo.
  const archivado = row.items.find((item) => !item.product.active);
  if (archivado) {
    return {
      error: "Ese combo incluye un producto archivado.",
      detail: `Reactiva "${archivado.product.name}" o quítalo del combo en la marca, y recarga el generador.`,
    };
  }
  const combo = toCatalogCombo(row);
  const products = row.items.map((item) => toCatalogProduct(item.product));
  return { productFocus: construirFocoDeProducto({ type: "combo", combo, products }, detalle), ids: { comboId: combo.id } };
}

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
  let productFocus = [
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

  if (user.role !== "OWNER" && !brandId) {
    // Mismo registro que el encolado (marca ausente): solo presencia y cantidad, sin IDs ni datos del pedido.
    withGenerationTrace({}, () => generationEvent("brand_access", "info", { brandSelected: false, brandAuthorized: false, authorizedBrandCount: user.brandIds?.length ?? 0 }));
    return {
      error: "Elige una marca para generar el guion.",
      detail: "En Identidad y producto, selecciona una de tus marcas autorizadas. Si no aparece ninguna, pide al Dueño que te asigne una marca activa desde Equipo.",
    };
  }

  // Catálogo de productos (kill-switch PRODUCT_CATALOG_ENABLED): con una ficha
  // elegida, el texto del producto sale de la base de datos y el trabajo guarda
  // su id. Apagado, o sin ficha, el pedido es exactamente el de siempre.
  let catalogo: ProductoDelCatalogo["ids"] | null = null;
  if (productCatalogEnabled()) {
    const elegido = await productoDelCatalogo(user, formData, brandId, productDetail);
    if (elegido && "error" in elegido) return elegido;
    if (elegido) {
      productFocus = elegido.productFocus;
      catalogo = elegido.ids;
    } else {
      // Texto libre ("Cargar un nuevo producto") con el tipo elegido: la IA recibe la misma
      // línea "Tipo:" que con una ficha. Sin tipo válido, el texto de siempre.
      const tipo = field(formData, "productoTipo");
      if (productName && isProductKind(tipo)) {
        productFocus = [
          `Producto/Servicio: ${productName}\n${lineaDeTipo(tipo)}`,
          productDetail ? `Detalle y descripción profunda:\n${productDetail}` : "",
        ]
          .filter(Boolean)
          .join("\n\n");
      }
    }
  }

  try {
    const jobId = await enqueueGeneration(user, field(formData, "requestKey"), structureIds, {
      brandId, archetypeId, request, productFocus, variantHint, durationSec: durationSec || undefined,
      provider, model: model || undefined, cta, creativeAngle, ctaMode, ctaTrigger, ctaActionType, ctaDetail,
      contentItemId, ...catalogo,
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

    await invalidateScriptPreparation(tx, id);
    afterCommit(() => { refrescar(id); revalidatePath("/contenido", "layout"); revalidatePath("/metricas"); });
  });
}

export async function cambiarEstadoGuion(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);
  return withWorkflowMutation(user, false, async (tx, afterCommit) => {
    const id = field(formData, "id");
    const status = enumField(formData, "status", SCRIPT_STATUS_MAP);
    if (!id || !SCRIPT_STATUS_MAP[status]) return;

    await transitionScript(tx, user, { id, status, expectedUpdatedAt: field(formData, "expectedUpdatedAt"), override: formData.get("override") === "1", reason: field(formData, "reason") });
    afterCommit(() => refrescar(id));
    // Cadena de entregas: enviar o devolver el guion mueve los pasos y sus tareas.
    if (productionChainConfigured()) afterCommit(() => { revalidatePath("/tareas"); revalidatePath("/cadena"); });
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

    // Cadena de entregas: los videos que pierden el guion vuelven al paso Guion (como al desvincular).
    await tx.$queryRaw`SELECT id FROM "Script" WHERE id = ${id} FOR UPDATE`;
    await invalidateScriptPreparation(tx, id);
    const linked = productionChainConfigured()
      ? await tx.contentItem.findMany({ where: { scriptId: id }, select: { id: true }, orderBy: { id: "asc" } })
      : [];
    await tx.contentItem.updateMany({ where: { scriptId: id }, data: { scriptId: null, structureId: null } });
    await tx.script.delete({ where: { id } });
    // Cada evento en su SAVEPOINT: uno que falle no deshace la eliminación ni a los demás.
    for (const video of linked) await chainEvent(tx, user, { type: "SCRIPT_UNLINKED", videoId: video.id });
    if (linked.length) afterCommit(() => { revalidatePath("/tareas"); revalidatePath("/cadena"); });

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

    await invalidateScriptPreparation(tx, before.scriptId);
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

    await invalidateScriptPreparation(tx, scriptId);
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

    await invalidateScriptPreparation(tx, scene.scriptId);
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

    await invalidateScriptPreparation(tx, scene.scriptId);
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
    await invalidatePreparation(tx, contentItemId);
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
    // Cadena de entregas: el paso del guion vuelve a abrirse y la grabación pendiente se cancela (SAVEPOINT).
    await chainEvent(tx, user, { type: "SCRIPT_UNLINKED", videoId: contentItemId });
    if (productionChainConfigured()) afterCommit(() => { revalidatePath("/tareas"); revalidatePath("/cadena"); });

    afterCommit(() => revalidatePath("/contenido"));
    afterCommit(() => revalidatePath(`/contenido/${contentItemId}`));
    afterCommit(() => revalidatePath("/calendario"));
    afterCommit(() => revalidatePath("/"));
    await invalidatePreparation(tx, contentItemId);
    if (video.scriptId) afterCommit(() => refrescar(video.scriptId!));
  });
}
