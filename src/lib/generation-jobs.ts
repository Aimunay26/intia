import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma, type AppTransaction } from "@/lib/prisma";
import { assertActor } from "@/lib/auth-transactions";
import type { SessionUser } from "@/lib/auth";
import { auditInTransaction } from "@/lib/audit";
import { resolveAiModel } from "@/lib/ai-models";
import { generateScript, AiError, type GenerateInput, type GenerateOutput } from "@/lib/ai";
import { persistGeneratedScript } from "@/lib/generation-persist";
import { reserveUsage, resourceLimit, usageDay } from "@/lib/resource-limits";
import { allows, assertBrandPermission, assertPermission } from "@/lib/permissions";
import { generationScope, scriptScope } from "@/lib/access-scope";

const text = z.string().max(12000).optional();
const payloadSchema = z.object({
  brandId: z.string().max(100).nullable().optional(), archetypeId: z.string().max(100).nullable().optional(),
  request: z.string().trim().min(1).max(12000), productFocus: text, variantHint: text,
  durationSec: z.number().int().min(1).max(600).optional(), provider: z.enum(["anthropic", "google"]),
  model: z.string().max(120).optional(), cta: text, creativeAngle: text, ctaTrigger: text,
  ctaActionType: text, ctaDetail: text,
});
const active = ["QUEUED", "RUNNING"];
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export async function enqueueGeneration(user: SessionUser, requestKey: string, structures: string[], input: Omit<GenerateInput, "structureId">) {
  assertBrandPermission(user, input.brandId, "scripts.generate");
  if (process.env.AI_JOBS_ENABLED !== "true") throw new Error("La generación en segundo plano aún no está habilitada.");
  if (!z.string().uuid().safeParse(requestKey).success) throw new Error("Recarga el formulario antes de generar.");
  const parsed = payloadSchema.safeParse(input);
  if (!parsed.success) throw new Error("Revisa la petición, el modelo y la duración (máximo 600 segundos).");
  const payload = parsed.data;
  if (payload.model) resolveAiModel(payload.provider, payload.model);
  const structureIds = [...new Set(structures)].sort();
  if (!structureIds.length || structureIds.length > resourceLimit("AI_MAX_BATCH", 3) || structureIds.some(id => id.length > 100)) throw new Error("Elige entre una y tres estructuras por generación.");
  if (Buffer.byteLength(JSON.stringify(payload)) > 48000) throw new Error("La petición es demasiado larga. Reduce los detalles antes de generar.");
  const fingerprint = createHash("sha256").update(JSON.stringify({ structureIds, payload })).digest("hex");
  return prisma.$transaction(async tx => {
    await assertActor(tx, user);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`generation:${user.id}`}, 0))`;
    const previous = await tx.generationJob.findUnique({ where: { userId_requestKey: { userId: user.id, requestKey } } });
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new Error("Este envío ya fue utilizado con otra petición. Recarga el formulario.");
      return previous.id;
    }
    if (await tx.generationJob.count({ where: { userId: user.id, status: { in: active } } }) >= 2) throw new Error("Ya tienes dos generaciones pendientes. Espera a que terminen o cancela una.");
    if (await tx.structure.count({ where: { id: { in: structureIds } } }) !== structureIds.length) throw new Error("Una estructura ya no existe.");
    if (payload.brandId && !await tx.brand.count({ where: { id: payload.brandId } })) throw new Error("La marca ya no existe.");
    if (payload.archetypeId && !await tx.archetype.count({ where: { id: payload.archetypeId } })) throw new Error("El arquetipo ya no existe.");
    await reserveUsage(tx, `ai:jobs:${usageDay()}`, 1, resourceLimit("AI_DAILY_JOBS", 20));
    const job = await tx.generationJob.create({ data: {
      userId: user.id, sessionVersion: user.sessionVersion ?? 0, requestKey, fingerprint, payload: json(payload),
      items: { create: structureIds.map((structureId, order) => ({ structureId, order })) },
    } });
    await auditInTransaction(tx, { user, action: "GENERAR", entity: "GenerationJob", entityId: job.id, brandId: payload.brandId, summary: `Solicitó ${structureIds.length} guiones en segundo plano` });
    return job.id;
  });
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

/** Una llamada al proveedor por intento. La concesión supera el timeout HTTP y cada escritura exige su token. */
export async function processGeneration(jobId: string): Promise<GenerationProgress> {
  const claim = await prisma.$transaction(async tx => {
    const job = await lockJob(tx, jobId);
    if (!job || !active.includes(job.status)) return { done: true } as const;
    const user = await actorForJob(tx, job);
    if (!user || Date.now() - job.createdAt.getTime() > 86400000 || process.env.AI_JOBS_ENABLED !== "true") {
      await tx.generationJob.update({ where: { id: jobId }, data: { status: "CANCELLED", error: "La generación expiró o su acceso fue revocado." } });
      await tx.generationItem.updateMany({ where: { jobId, status: { in: active } }, data: { status: "CANCELLED", response: Prisma.DbNull } });
      return { done: true } as const;
    }
    const item = job.items.find(i => active.includes(i.status));
    if (!item) {
      const completed = job.items.filter(i => i.status === "COMPLETED").length;
      await tx.generationJob.update({ where: { id: jobId }, data: { status: completed === job.items.length ? "COMPLETED" : completed ? "PARTIAL" : "FAILED" } });
      return { done: true } as const;
    }
    const retryAt = Math.max(item.availableAt.getTime(), item.leaseUntil?.getTime() ?? 0);
    if (retryAt > Date.now()) return { done: false, retryAt } as const;
    if (!item.response && item.attempts >= 3) {
      await tx.generationItem.update({ where: { id: item.id }, data: { status: "FAILED", error: "Se agotaron los tres intentos. Revisa la configuración antes de iniciar otra generación." } });
      return { done: false } as const;
    }
    const leaseToken = randomUUID();
    await tx.generationItem.update({ where: { id: item.id }, data: { status: "RUNNING", leaseToken, leaseUntil: new Date(Date.now() + 360000), error: null } });
    await tx.generationJob.update({ where: { id: jobId }, data: { status: "RUNNING", error: null } });
    return { item, leaseToken, input: { ...payloadSchema.parse(job.payload), structureId: item.structureId }, user };
  });
  if (claim.done !== undefined) return { done: claim.done, retryAt: claim.retryAt };
  const { item, input, leaseToken } = claim;
  let result = item.response as GenerateOutput | null;
  if (!result) {
    try {
      await prisma.$transaction(async tx => {
        const job = await lockJob(tx, jobId);
        if (!job || !active.includes(job.status) || !await actorForJob(tx, job)) throw new Error("La generación fue cancelada o su acceso cambió.");
        const current = job.items.find(i => i.id === item.id);
        if (current?.leaseToken !== leaseToken) throw new Error("Otro proceso recuperó esta generación.");
        const day = usageDay();
        await reserveUsage(tx, `ai:calls:${day}`, 1, resourceLimit("AI_DAILY_CALLS", 20));
        await reserveUsage(tx, `ai:user:${job.userId}:${day}`, 1, resourceLimit("AI_USER_DAILY_CALLS", 5));
        await tx.generationItem.update({ where: { id: item.id }, data: { attempts: { increment: 1 } } });
      });
      result = await generateScript(input);
    } catch (error) {
      const retry = error instanceof AiError && error.retryable && item.attempts + 1 < 3;
      await prisma.generationItem.updateMany({ where: { id: item.id, leaseToken, status: "RUNNING", job: { status: { in: active } } }, data: {
        status: retry ? "QUEUED" : "FAILED", error: error instanceof AiError ? error.message : "No se pudo generar. Revisa el cupo disponible y los datos de la petición.",
        availableAt: new Date(Date.now() + 30000 * (item.attempts + 1)), leaseToken: null, leaseUntil: null,
      } });
      return { done: false };
    }
    // Se conserva antes de crear el guion: una caída de DB posterior no obliga a pagar otra respuesta.
    const saved = await prisma.generationItem.updateMany({ where: { id: item.id, leaseToken, status: "RUNNING", job: { status: { in: active } } }, data: { response: json(result), inputTokens: result.inputTokens ?? 0, outputTokens: result.outputTokens ?? 0 } });
    if (!saved.count) return { done: false };
  }
  await prisma.$transaction(async tx => {
    const job = await lockJob(tx, jobId);
    if (!job || !active.includes(job.status)) return;
    const current = job.items.find(i => i.id === item.id);
    if (current?.leaseToken !== leaseToken || current.status !== "RUNNING") return;
    const user = await actorForJob(tx, job);
    if (!user) {
      await tx.generationJob.update({ where: { id: jobId }, data: { status: "CANCELLED" } });
      await tx.generationItem.updateMany({ where: { jobId, status: { in: active } }, data: { status: "CANCELLED", response: Prisma.DbNull } });
      return;
    }
    await persistGeneratedScript(tx, user, item.id, input, result!);
    await tx.generationItem.update({ where: { id: item.id }, data: { status: "COMPLETED", response: Prisma.DbNull, leaseToken: null, leaseUntil: null, error: null } });
  }, { timeout: 15000 });
  return { done: false };
}

export async function generationStatus(user: SessionUser, id: string) {
  assertPermission(user, "scripts.generate");
  return prisma.generationJob.findFirst({ where: { AND: [{ id }, generationScope(user)] }, select: {
    id: true, status: true, error: true, createdAt: true, runId: true,
    items: { orderBy: { order: "asc" }, select: { id: true, order: true, structureId: true, status: true, attempts: true, error: true, inputTokens: true, outputTokens: true, script: { where: scriptScope(user), select: { id: true, title: true } } } },
  } });
}

export async function cancelGeneration(user: SessionUser, id: string) {
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
