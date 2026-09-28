import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma, type AppTransaction } from "@/lib/prisma";
import { assertActor } from "@/lib/auth-transactions";
import type { SessionUser } from "@/lib/auth";
import { auditInTransaction } from "@/lib/audit";
import { resolveAiModel } from "@/lib/ai-models";
import { retryJobId } from "@/lib/generation-history";
import { aiStatus, getSettings, SETTING_KEYS } from "@/lib/settings";
import { generateScript, AiError, type GenerateInput, type GenerateOutput } from "@/lib/ai";
import { esErrorDeAutenticacion, esErrorDeSaturacion } from "@/lib/ai/providers";
import { modelForRetry, planModelFallback, retryDiagnostics } from "@/lib/ai/model-fallback";
import { persistGeneratedScript, vincularGuionAVideo } from "@/lib/generation-persist";
import { revalidatePath } from "next/cache";
import { recordUsage, resourceLimit, usageDay } from "@/lib/resource-limits";
import { allows, assertBrandPermission, assertPermission } from "@/lib/permissions";
import { contentScope, generationScope, scriptScope, closedVideoWhere } from "@/lib/access-scope";
import { generationEvent, generationStage, withGenerationTrace, withGenerationObserver } from "@/lib/generation-trace";
import { createAiRequest, AiBudgetError } from "@/lib/ai/request-budget";
import { GeneratedScriptValidationError } from "@/lib/ai/validate-script";
import { productCatalogEnabled } from "@/lib/product-catalog";

const text = z.string().max(12000).optional();
const payloadSchema = z.object({
  brandId: z.string().max(100).nullable().optional(), archetypeId: z.string().max(100).nullable().optional(),
  request: z.string().trim().min(1).max(12000), productFocus: text, variantHint: text,
  durationSec: z.number().int().min(1).max(600).optional(), provider: z.enum(["anthropic", "google"]),
  model: z.string().max(120).optional(), cta: text, creativeAngle: text, ctaTrigger: text,
  ctaActionType: text, ctaDetail: text,
  /** Tarjeta del calendario a la que se unirá el PRIMER guion del lote. */
  contentItemId: z.string().max(100).nullable().optional(),
  expectedVideoUpdatedAt: z.string().datetime().optional(),
  /** Cierre con venta (Hormozi) o sin venta (comunidad). Ausente = venta. */
  ctaMode: z.enum(["venta", "comunidad"]).optional(),
  /**
   * Ficha del catálogo de la marca (PRODUCT_CATALOG_ENABLED) de la que salió
   * productFocus. El texto ya viaja completo en productFocus: los reintentos lo
   * reusan y no releen el catálogo. Ausentes en los pedidos de texto libre, así
   * que la huella de esos pedidos no cambia.
   */
  productId: z.string().max(100).nullable().optional(),
  comboId: z.string().max(100).nullable().optional(),
});
const active = ["QUEUED", "RUNNING"];
const retryableStatuses = ["FAILED", "CANCELLED"];
const finishedStatuses = ["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"];
export class GenerationRequestError extends Error {}
/** Estados de la tarjeta en los que todavía admite guion (el mismo filtro que ofrece el generador). */
const VIDEO_ABIERTO = ["IDEA", "GUION"];
/** Motivo con que se anotan los formatos que quedan sin intentar cuando la clave es rechazada. */
const MOTIVO_CLAVE_RECHAZADA = "No se intentó: la clave fue rechazada. Corrige la clave en Ajustes y vuelve a generar solo este formato.";

export type EnqueueInput = Omit<GenerateInput, "structureId"> & {
  contentItemId?: string | null;
  ctaMode?: "venta" | "comunidad";
  /** Ficha del catálogo elegida en el generador; se comprueba que sea de la marca del pedido. */
  productId?: string | null;
  comboId?: string | null;
};
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export async function enqueueGeneration(user: SessionUser, requestKey: string, structures: string[], input: EnqueueInput) {
  return withGenerationTrace({}, () => generationStage("enqueue", async () => {
    const jobId = await enqueueValidatedGeneration(user, requestKey, structures, input);
    generationEvent("enqueue", "info", { jobId });
    return jobId;
  }));
}

async function enqueueValidatedGeneration(user: SessionUser, requestKey: string, structures: string[], input: EnqueueInput, retry?: { tx: AppTransaction; jobId: string; sourceId: string }) {
  assertBrandPermission(user, input.brandId, "scripts.generate");
  if (process.env.AI_JOBS_ENABLED !== "true") throw new GenerationRequestError("La generación en segundo plano aún no está habilitada.");
  if (!z.string().uuid().safeParse(requestKey).success) throw new Error("Recarga el formulario antes de generar.");
  const parsed = payloadSchema.safeParse(input);
  if (!parsed.success) throw new Error("Revisa la petición, el modelo y la duración (máximo 600 segundos).");
  const payload = parsed.data;
  delete payload.expectedVideoUpdatedAt; // Solo el servidor captura la revisión del destino.
  // Kill-switch del catálogo: apagado, los ids no entran a la huella ni se comprueban contra
  // las tablas nuevas. El producto ya viaja completo como texto en productFocus.
  if (!productCatalogEnabled()) {
    delete payload.productId;
    delete payload.comboId;
  }
  if (payload.model) {
    try { resolveAiModel(payload.provider, payload.model); }
    catch { throw new GenerationRequestError("El modelo del pedido ya no está disponible. Inicia una nueva generación con un modelo del catálogo."); }
  }
  const structureIds = [...new Set(structures)].sort();
  if (!structureIds.length || structureIds.length > resourceLimit("AI_MAX_BATCH", 3) || structureIds.some(id => id.length > 100)) throw new Error("Elige entre una y tres estructuras por generación.");
  if (Buffer.byteLength(JSON.stringify(payload)) > 48000) throw new Error("La petición es demasiado larga. Reduce los detalles antes de generar.");
  const fingerprint = createHash("sha256").update(JSON.stringify({ structureIds, payload })).digest("hex");
  const enqueue = async (tx: AppTransaction) => {
    await assertActor(tx, user);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`generation:${user.id}`}, 0))`;
    const previous = await tx.generationJob.findUnique({ where: { userId_requestKey: { userId: user.id, requestKey } } });
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new Error("Este envío ya fue utilizado con otra petición. Recarga el formulario.");
      return previous.id;
    }
    if (await tx.generationJob.count({ where: { userId: user.id, status: { in: active } } }) >= 2) throw new GenerationRequestError("Ya tienes dos generaciones pendientes. Espera a que terminen o cancela una.");
    if (await tx.structure.count({ where: { id: { in: structureIds }, active: true } }) !== structureIds.length) throw new GenerationRequestError("Una estructura ya no existe o está desactivada. Inicia una nueva generación con los formatos disponibles.");
    if (payload.brandId && !await tx.brand.count({ where: { id: payload.brandId } })) throw new GenerationRequestError("La marca ya no existe.");
    if (payload.archetypeId && !await tx.archetype.count({ where: { id: payload.archetypeId } })) throw new GenerationRequestError("El arquetipo ya no existe.");
    // Solo con una ficha del catálogo: tiene que ser de la marca del pedido (sin marca no hay ficha válida).
    if (payload.productId && (!payload.brandId || !await tx.brandProduct.count({ where: { id: payload.productId, brandId: payload.brandId } }))) throw new GenerationRequestError("Ese producto ya no existe o no es de la marca elegida. Recarga el generador y vuelve a elegirlo.");
    if (payload.comboId && (!payload.brandId || !await tx.brandCombo.count({ where: { id: payload.comboId, brandId: payload.brandId } }))) throw new GenerationRequestError("Ese combo ya no existe o no es de la marca elegida. Recarga el generador y vuelve a elegirlo.");
    if (payload.contentItemId) {
      // La guarda definitiva contra una pestaña vieja o un doble envío vive en
      // vincularGuionAVideo, que solo escribe si la tarjeta sigue libre; aquí se
      // evita registrar un trabajo (y gastar llamadas) que ya no puede unirse.
      const video = await tx.contentItem.findFirst({ where: { AND: [{ id: payload.contentItemId }, contentScope(user, "scripts.generate")] }, select: { brandId: true, status: true, scriptId: true, updatedAt: true } });
      if (!video) throw new GenerationRequestError("Ese video ya no existe o no tienes acceso a él. Elige otra tarjeta o genera un guion suelto.");
      if (video.scriptId) throw new GenerationRequestError("Ese video ya tiene un guion vinculado. Quítalo desde su ficha o genera un guion suelto.");
      if (!VIDEO_ABIERTO.includes(video.status)) throw new GenerationRequestError("Ese video ya no admite guion: solo se vinculan tarjetas en Idea o Guion.");
      if (await tx.contentItem.count({ where: { AND: [{ id: payload.contentItemId }, closedVideoWhere] } })) throw new GenerationRequestError("Reabre la aprobación final del video antes de generar su guion.");
      if (payload.brandId !== video.brandId) throw new GenerationRequestError("La marca elegida no es la del video.");
      payload.expectedVideoUpdatedAt = video.updatedAt.toISOString();
    }
    await recordUsage(tx, `ai:jobs:${usageDay()}`);
    const job = await tx.generationJob.create({ data: {
      ...(retry ? { id: retry.jobId } : {}),
      userId: user.id, sessionVersion: user.sessionVersion ?? 0, requestKey, fingerprint,
      payload: json(retry ? { ...payload, retryOfJobId: retry.sourceId } : payload),
      items: { create: structureIds.map((structureId, order) => ({ structureId, order })) },
    } });
    await auditInTransaction(tx, { user, action: "GENERAR", entity: "GenerationJob", entityId: job.id, brandId: payload.brandId,
      summary: retry ? `Reintentó ${structureIds.length} guiones no generados del trabajo ${retry.sourceId}` : `Solicitó ${structureIds.length} guiones en segundo plano` });
    return job.id;
  };
  return retry ? enqueue(retry.tx) : prisma.$transaction(enqueue);
}

/** Nuevo trabajo: conserva el historial, los guiones existentes y las concesiones antiguas. */
export async function retryFailedGeneration(user: SessionUser, sourceId: string, requestedProvider?: string) {
  assertPermission(user, "scripts.generate");
  if (requestedProvider !== undefined && requestedProvider !== "google" && requestedProvider !== "anthropic") {
    throw new GenerationRequestError("Elige Claude o Gemini para reintentar.");
  }
  return withGenerationTrace({ jobId: sourceId }, () => generationStage("manual_retry", () => prisma.$transaction(async tx => {
    await assertActor(tx, user);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`generation:${user.id}`}, 0))`;
    const source = await lockJob(tx, sourceId);
    if (!source || !await tx.generationJob.count({ where: { AND: [{ id: sourceId }, generationScope(user)] } })) throw new GenerationRequestError("Generación no encontrada o sin acceso.");
    const id = retryJobId(sourceId);
    const previous = await tx.generationJob.findUnique({ where: { id }, select: { id: true, payload: true } });
    if (previous) {
      if (!await tx.generationJob.count({ where: { AND: [{ id }, generationScope(user)] } })) throw new GenerationRequestError("Ya existe un reintento creado por otro usuario. Pide al Dueño que revise su avance.");
      const previousPayload = payloadSchema.safeParse(previous.payload);
      if (requestedProvider && (!previousPayload.success || previousPayload.data.provider !== requestedProvider)) {
        throw new GenerationRequestError("Ya existe un reintento con otro proveedor. Abre «Ver reintento» para revisar su avance y, si falla, reinténtalo desde allí.");
      }
      return id;
    }
    if (!finishedStatuses.includes(source.status)) throw new GenerationRequestError("Espera a que termine la generación antes de reintentar los guiones faltantes.");
    const failed = await tx.generationItem.findMany({ where: { jobId: sourceId, status: { in: retryableStatuses }, script: { is: null } }, orderBy: { order: "asc" }, select: { structureId: true } });
    if (!failed.length) throw new GenerationRequestError("No hay guiones pendientes de generar en este trabajo.");
    const parsed = payloadSchema.safeParse(source.payload);
    if (!parsed.success) throw new GenerationRequestError("El pedido original ya no está disponible. Inicia una nueva generación.");
    const payload = parsed.data;
    const provider = requestedProvider ?? payload.provider;
    const status = await aiStatus(undefined, tx);
    if (!status[provider].configured) throw new GenerationRequestError(`La organización no tiene una clave de ${provider === "google" ? "Gemini" : "Claude"} configurada. Elige el otro proveedor o pide al Dueño configurarla en Ajustes.`);
    if (provider !== payload.provider) {
      const modelKey = provider === "google" ? SETTING_KEYS.defaultGoogleModel : SETTING_KEYS.defaultAnthropicModel;
      const settings = await getSettings([modelKey], tx);
      payload.provider = provider;
      payload.model = resolveAiModel(provider, undefined, settings[modelKey]);
    }
    // El primer éxito del lote anterior ya resolvió el vínculo; los restantes son independientes.
    if (source.items.some(item => item.status === "COMPLETED")) {
      delete payload.contentItemId;
      delete payload.expectedVideoUpdatedAt;
    }
    // El producto ya viaja como texto en productFocus: si su ficha se borró después, el reintento sigue sin su id.
    // Con el catálogo apagado los ids se sueltan sin consultar las tablas nuevas.
    if (!productCatalogEnabled()) {
      delete payload.productId;
      delete payload.comboId;
    }
    if (payload.productId && (!payload.brandId || !await tx.brandProduct.count({ where: { id: payload.productId, brandId: payload.brandId } }))) delete payload.productId;
    if (payload.comboId && (!payload.brandId || !await tx.brandCombo.count({ where: { id: payload.comboId, brandId: payload.brandId } }))) delete payload.comboId;
    const created = await enqueueValidatedGeneration(user, randomUUID(), failed.map(item => item.structureId), payload, { tx, jobId: id, sourceId });
    generationEvent("manual_retry", "info", { jobId: created, affectedRows: failed.length });
    return created;
  }, { timeout: 15000 })));
}

async function lockJob(tx: AppTransaction, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "GenerationJob" WHERE "id" = ${id} FOR UPDATE`;
  return tx.generationJob.findUnique({ where: { id }, include: { items: { orderBy: { order: "asc" } } } });
}

async function actorForJob(tx: AppTransaction, job: { userId: string; sessionVersion: number; payload: Prisma.JsonValue }) {
  const user = await tx.user.findUnique({ where: { id: job.userId }, select: { id: true, name: true, email: true, role: true, color: true, archetypeId: true, sessionVersion: true, active: true, workProfiles: { select: { profile: true } }, brandAccess: { select: { brandId: true } } } });
  if (!user?.active || user.sessionVersion !== job.sessionVersion || !["OWNER", "MEMBER"].includes(user.role)) return null;
  const actor = { ...user, profiles: user.workProfiles.map(p => p.profile), brandIds: user.brandAccess.map(b => b.brandId) };
  const payload = payloadSchema.safeParse(job.payload);
  if (!payload.success || !allows(actor, "scripts.generate") || (actor.role !== "OWNER" && (!payload.data.brandId || !actor.brandIds.includes(payload.data.brandId)))) return null;
  await assertActor(tx, actor);
  return actor;
}

export type GenerationProgress = { done: boolean; retryAt?: number };

/** Cada petición registra su uso; las peticiones del intento comparten plazo menor que su concesión. */
export async function processGeneration(jobId: string): Promise<GenerationProgress> {
  return withGenerationTrace({ jobId }, () => generationStage("process", () => processGenerationStep(jobId)));
}

async function processGenerationStep(jobId: string): Promise<GenerationProgress> {
  const claim = await generationStage("claim", () => prisma.$transaction(async tx => {
    const job = await lockJob(tx, jobId);
    if (!job || !active.includes(job.status)) {
      generationEvent("job_state", "info", { reason: "not_runnable", status: job?.status });
      return { done: true } as const;
    }
    const user = await actorForJob(tx, job);
    if (!user || Date.now() - job.createdAt.getTime() > resourceLimit("AI_JOB_MAX_AGE_HOURS", 72) * 3600000 || process.env.AI_JOBS_ENABLED !== "true") {
      await tx.generationJob.update({ where: { id: jobId }, data: { status: "CANCELLED", error: "La generación expiró o su acceso fue revocado." } });
      await tx.generationItem.updateMany({ where: { jobId, status: { in: active } }, data: { status: "CANCELLED", response: Prisma.DbNull } });
      generationEvent("job_state", "info", { status: "CANCELLED", reason: "access_revoked_or_expired" });
      return { done: true } as const;
    }
    const item = job.items.find(i => active.includes(i.status));
    if (!item) {
      const completed = job.items.filter(i => i.status === "COMPLETED").length;
      const status = completed === job.items.length ? "COMPLETED" : completed ? "PARTIAL" : "FAILED";
      const aviso = await avisoFinal(tx, job, completed);
      await tx.generationJob.update({ where: { id: jobId }, data: { status, ...(aviso ? { error: aviso } : {}) } });
      generationEvent("job_state", "info", { status });
      return { done: true } as const;
    }
    const retryAt = Math.max(item.availableAt.getTime(), item.leaseUntil?.getTime() ?? 0);
    if (retryAt > Date.now()) {
      generationEvent("job_state", "info", { itemId: item.id, reason: "lease_wait", waitMs: retryAt - Date.now() });
      return { done: false, retryAt } as const;
    }
    if (!item.response && item.attempts >= 3) {
      await tx.generationItem.update({ where: { id: item.id }, data: { status: "FAILED", error: "Se agotaron los tres intentos. Revisa la configuración antes de iniciar otra generación." } });
      generationEvent("job_state", "info", { itemId: item.id, status: "FAILED", reason: "attempt_limit" });
      return { done: false } as const;
    }
    const leaseToken = randomUUID();
    await tx.generationItem.update({ where: { id: item.id }, data: { status: "RUNNING", leaseToken, leaseUntil: new Date(Date.now() + 360000), error: null } });
    await tx.generationJob.update({ where: { id: jobId }, data: { status: "RUNNING", error: null } });
    return { item, leaseToken, deadlineAt: Date.now() + 240000, input: { ...payloadSchema.parse(job.payload), structureId: item.structureId }, user };
  }));
  if (claim.done !== undefined) return { done: claim.done, retryAt: claim.retryAt };
  const { item, input, leaseToken } = claim;
  const retryModel = modelForRetry(input.provider, item.diagnostics);
  const attemptInput = retryModel ? { ...input, model: retryModel } : input;
  return withGenerationTrace({ itemId: item.id, attempt: item.response ? item.attempts : item.attempts + 1 }, async () => {
    let result = item.response as GenerateOutput | null;
    generationEvent("job_state", "info", { status: "RUNNING", reused: Boolean(result) });
    if (!result) {
      let attemptDiagnostics: Record<string, unknown> | undefined;
      try {
        const request = createAiRequest({ user: claim.user, deadlineAt: claim.deadlineAt, authorize: async (tx, requestIndex) => {
          const job = await lockJob(tx, jobId);
          if (!job || !active.includes(job.status) || !await actorForJob(tx, job)) throw new Error("La generación fue cancelada o su acceso cambió.");
          const current = job.items.find(i => i.id === item.id);
          if (current?.leaseToken !== leaseToken || !current.leaseUntil || current.leaseUntil.getTime() <= Date.now()) throw new AiBudgetError("Otro proceso recuperó esta generación o venció su tiempo.");
          if (requestIndex === 1) await tx.generationItem.update({ where: { id: item.id }, data: { attempts: { increment: 1 } } });
        } });
        result = await withGenerationObserver(async stage => {
          await prisma.generationItem.updateMany({ where: { id: item.id, leaseToken, status: "RUNNING" }, data: { stage } });
        }, () => generationStage("generate", () => generateScript(attemptInput, request, async diagnostics => {
          // Durable provenance precedes the paid request. Failure here makes no provider call.
          attemptDiagnostics = retryDiagnostics(diagnostics, item.diagnostics);
          const saved = await prisma.generationItem.updateMany({ where: { id: item.id, leaseToken, status: "RUNNING" }, data: { diagnostics: json(attemptDiagnostics) } });
          if (!saved.count) throw new AiBudgetError("La concesión de generación cambió antes de llamar al proveedor.");
        })));
        if (attemptDiagnostics) result = { ...result, diagnostics: attemptDiagnostics };
      } catch (error) {
        const claveRechazada = esErrorDeAutenticacion(error);
        const retry = !claveRechazada && error instanceof AiError && error.retryable && item.attempts + 1 < 3;
        const fallback = retry && esErrorDeSaturacion(error) ? planModelFallback(attemptDiagnostics) : undefined;
        generationEvent("retry", "info", { retry, waitMs: retry ? 30000 * (item.attempts + 1) : 0,
          status: retry ? "QUEUED" : "FAILED", httpStatus: error instanceof AiError ? error.diagnostic?.status : undefined });
        await generationStage("failure_save", async () => {
          const saved = await prisma.generationItem.updateMany({ where: { id: item.id, leaseToken, status: "RUNNING", job: { status: { in: active } } }, data: {
            status: retry ? "QUEUED" : "FAILED", error: error instanceof AiError && error.code === "quota"
              ? [error.message, error.detail].filter(Boolean).join(" ")
              : error instanceof AiError || error instanceof AiBudgetError ? error.message : "No se pudo generar. Revisa la conexión y los datos de la petición.",
            availableAt: new Date(Date.now() + 30000 * (item.attempts + 1)), leaseToken: null, leaseUntil: null,
            ...(fallback ? { diagnostics: json(fallback), stage: "model_fallback" } : {}),
          } });
          if (saved.count && fallback) generationEvent("model_fallback", "info", {
            provider: input.provider, model: String(fallback.model), nextModel: modelForRetry(input.provider, fallback),
            reason: "provider_overloaded", httpStatus: 503, retry: true,
          });
          // Con la clave rechazada, cada formato siguiente fallaría igual: se
          // cortan aquí en vez de gastar intentos. Lo ya creado se conserva y el
          // aviso final dice cuáles no se intentaron y por qué.
          if (claveRechazada) await prisma.generationItem.updateMany({ where: { jobId, status: "QUEUED", job: { status: { in: active } } }, data: { status: "FAILED", error: MOTIVO_CLAVE_RECHAZADA, response: Prisma.DbNull } });
        });
        return { done: false };
      }
      // Se conserva antes de crear el guion: una caída de DB posterior no obliga a pagar otra respuesta.
      const saved = await generationStage("response_save", () => prisma.generationItem.updateMany({ where: { id: item.id, leaseToken, status: "RUNNING", job: { status: { in: active } } }, data: { response: json(result), stage: "response_saved", inputTokens: result!.inputTokens ?? 0, outputTokens: result!.outputTokens ?? 0 } }));
      if (!saved.count) {
        generationEvent("job_state", "info", { reason: "lease_lost" });
        return { done: false };
      }
    }
    await prisma.generationItem.updateMany({ where: { id: item.id, leaseToken, status: "RUNNING" }, data: { stage: "script_save" } });
    try { await generationStage("script_save", () => prisma.$transaction(async tx => {
      const job = await lockJob(tx, jobId);
      if (!job || !active.includes(job.status)) { generationEvent("job_state", "info", { reason: "not_runnable" }); return; }
      const current = job.items.find(i => i.id === item.id);
      if (current?.leaseToken !== leaseToken || current.status !== "RUNNING") { generationEvent("job_state", "info", { reason: "lease_lost" }); return; }
      const user = await actorForJob(tx, job);
      if (!user) {
        await tx.generationJob.update({ where: { id: jobId }, data: { status: "CANCELLED" } });
        await tx.generationItem.updateMany({ where: { jobId, status: { in: active } }, data: { status: "CANCELLED", response: Prisma.DbNull } });
        return;
      }
      const scriptId = await persistGeneratedScript(tx, user, item.id, input, result!);
      await tx.generationItem.update({ where: { id: item.id }, data: { status: "COMPLETED", stage: "completed", response: Prisma.DbNull, leaseToken: null, leaseUntil: null, error: null } });
      generationEvent("job_state", "info", { status: "COMPLETED" });
      // La tarjeta solo admite un guion: se une el PRIMERO que sale del lote en
      // cuanto existe, no al final, para que el video tenga guion aunque el resto
      // falle. Los demás quedan sueltos y se asignan desde su ficha. Solo se
      // escribe si la tarjeta sigue libre: un vínculo hecho mientras tanto no se pisa.
      const primero = !job.items.some(i => i.id !== item.id && i.status === "COMPLETED");
      if (input.contentItemId && primero) {
        const link = await generationStage("video_link", () => vincularGuionAVideo(tx, user, scriptId, input.contentItemId!, { expectedUpdatedAt: input.expectedVideoUpdatedAt ?? null, capability: "scripts.generate" }));
        if (link.warning) await tx.generationItem.update({ where: { id: item.id }, data: { linkWarning: link.warning } });
        return link.linked;
      }
      return false;
    }, { timeout: 15000 }).then(vinculado => {
      if (!vinculado) return;
      // El vínculo cambia calendario y videos; fuera de un contexto de petición no hay caché que invalidar.
      try { for (const ruta of ["/contenido", `/contenido/${input.contentItemId}`, "/calendario", "/"]) revalidatePath(ruta); } catch {}
    })); } catch (error) {
      if (!(error instanceof GeneratedScriptValidationError)) throw error;
      // Una respuesta inválida guardada no se vuelve a intentar ni vuelve a gastar proveedor.
      await prisma.generationItem.updateMany({ where: { id: item.id, leaseToken, status: "RUNNING", job: { status: { in: active } } }, data: {
        status: "FAILED", stage: "response_validate", error: error.message, response: Prisma.DbNull, leaseToken: null, leaseUntil: null,
      } });
    }
    return { done: false };
  });
}

/* ------------------------------------------------------------ AVISO FINAL -- */

function listarNombres(nombres: string[]): string {
  const citados = nombres.map(n => `«${n}»`);
  if (citados.length <= 1) return citados.join("");
  return `${citados.slice(0, -1).join(", ")} y ${citados[citados.length - 1]}`;
}

/**
 * Texto que acompaña al trabajo terminado cuando algo quedó a medias: qué
 * formatos fallaron, cuáles no se intentaron porque la clave fue rechazada y
 * si el primer guion no pudo unirse al video pedido. Se guarda en `error`
 * del trabajo, que la pantalla de avance muestra como aviso junto al estado.
 */
async function avisoFinal(tx: AppTransaction, job: { payload: Prisma.JsonValue; items: { id: string; structureId: string; status: string; error: string | null; linkWarning: string | null }[] }, completed: number): Promise<string | null> {
  const partes: string[] = [];
  const fallidos = job.items.filter(i => i.status === "FAILED" || i.status === "CANCELLED");
  if (fallidos.length) {
    const estructuras = await tx.structure.findMany({ where: { id: { in: fallidos.map(i => i.structureId) } }, select: { id: true, name: true } });
    const nombre = (id: string) => estructuras.find(s => s.id === id)?.name ?? "formato";
    const noIntentados = fallidos.filter(i => i.error === MOTIVO_CLAVE_RECHAZADA);
    const conError = fallidos.filter(i => i.error !== MOTIVO_CLAVE_RECHAZADA);
    if (conError.length) partes.push(`${conError.length === 1 ? "Falló" : "Fallaron"} ${listarNombres(conError.map(i => nombre(i.structureId)))}: revisa el detalle de cada formato`);
    if (noIntentados.length) {
      const frase = `no se ${noIntentados.length === 1 ? "intentó" : "intentaron"} ${listarNombres(noIntentados.map(i => nombre(i.structureId)))} porque la clave fue rechazada`;
      partes.push(partes.length ? frase : `${frase.charAt(0).toUpperCase()}${frase.slice(1)}`);
    }
  }
  const lote = fallidos.length ? `Se generaron ${completed} de ${job.items.length}. ${partes.join("; ")}.` : "";
  const warning = job.items.find(i => i.linkWarning)?.linkWarning;
  if (warning) return [lote, warning].filter(Boolean).join(" ");
  const payload = payloadSchema.safeParse(job.payload);
  const contentItemId = payload.success ? payload.data.contentItemId : null;
  if (!contentItemId || !completed) return lote || null;
  const video = await tx.contentItem.findUnique({ where: { id: contentItemId }, select: { title: true, scriptId: true } });
  const unido = video?.scriptId ? await tx.script.count({ where: { id: video.scriptId, generationItemId: { in: job.items.map(i => i.id) } } }) : 0;
  if (unido) return lote || null;
  const sinVinculo = video
    ? `El guion se creó, pero no quedó unido al video «${video.title}»: la tarjeta ya recibió otro guion mientras se generaba. Si hace falta, asígnalo desde la ficha del guion.`
    : "El guion se creó, pero no quedó unido al video pedido porque la tarjeta ya no existe.";
  return [lote, sinVinculo].filter(Boolean).join(" ");
}

export async function generationStatus(user: SessionUser, id: string) {
  assertPermission(user, "scripts.generate");
  const job = await prisma.generationJob.findFirst({ where: { AND: [{ id }, generationScope(user)] }, select: {
    id: true, status: true, error: true, createdAt: true, runId: true, payload: true,
    items: { orderBy: { order: "asc" }, select: { id: true, order: true, structureId: true, structure: { select: { name: true } }, status: true, stage: true, diagnostics: true, attempts: true, error: true, inputTokens: true, outputTokens: true, script: { where: scriptScope(user), select: { id: true, title: true } } } },
  } });
  if (!job) return null;
  const retryableCount = finishedStatuses.includes(job.status) ? job.items.filter(item => retryableStatuses.includes(item.status) && !item.script).length : 0;
  const retry = retryableCount ? await prisma.generationJob.findFirst({ where: { AND: [{ id: retryJobId(id) }, generationScope(user)] }, select: { id: true } }) : null;
  const { payload, ...publicJob } = job;
  const parsed = payloadSchema.safeParse(payload);
  return { ...publicJob, requestedProvider: parsed.success ? parsed.data.provider : null,
    requestedModel: parsed.success ? parsed.data.model ?? null : null,
    retryableCount, retryJobId: retry?.id ?? null };
}

export async function cancelGeneration(user: SessionUser, id: string) {
  return withGenerationTrace({ jobId: id }, () => generationStage("cancel", () => cancelGenerationJob(user, id)));
}

async function cancelGenerationJob(user: SessionUser, id: string) {
  assertPermission(user, "scripts.generate");
  await prisma.$transaction(async tx => {
    const job = await lockJob(tx, id);
    await assertActor(tx, user);
    if (!job || (user.role !== "OWNER" && job.userId !== user.id)) throw new Error("Generación no encontrada.");
    if (!active.includes(job.status)) return;
    await tx.generationJob.update({ where: { id }, data: { status: "CANCELLED" } });
    await tx.generationItem.updateMany({ where: { jobId: id, status: { in: active } }, data: { status: "CANCELLED", response: Prisma.DbNull } });
    await auditInTransaction(tx, { user, action: "EDITAR", entity: "GenerationJob", entityId: id, summary: "Canceló una generación pendiente" });
  });
}
