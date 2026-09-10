import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { load } from "./load-module.mjs";

const url = process.env.SCALABILITY_TEST_DATABASE_URL;
if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname) || !new URL(url).pathname.endsWith("_test")) throw new Error("Sólo fixtures locales.");
const prisma = new PrismaClient({ datasourceUrl: url });
process.env.AI_JOBS_ENABLED = "true";
process.env.BLOB_PRIVATE_ENABLED = "true";
process.env.BLOB_READ_WRITE_TOKEN = "fixture-not-a-real-token";
class AiError extends Error { constructor(message, detail, retryable = false) { super(message); this.detail = detail; this.retryable = retryable; } }
const output = {
  script: { title: "Guion de prueba", scenes: [{ beat: "Inicio", startSec: 0, endSec: 5, voiceType: "EN_CAMARA" }] },
  provider: "anthropic", model: "fixture", raw: "fixture-response", systemPrompt: "fixture-prompt", userPrompt: "fixture-request", referencesUsed: [], inputTokens: 12, outputTokens: 24,
};
let calls = 0, provider = async () => output;
const mocks = { "@/lib/prisma": { prisma }, "@/lib/ai": { AiError, generateScript: async (...args) => { calls++; return provider(...args); }, normalizeSceneTimes: rows => rows } };
const jobs = load("src/lib/generation-jobs.ts", mocks);
const limits = load("src/lib/resource-limits.ts", mocks);
const money = load("src/lib/money.ts");
const files = new Map();
let failPut = false, failDelete = false, puts = 0;
const storage = load("src/lib/private-storage.ts", { ...mocks, "@vercel/blob": {
  put: async (path, bytes, options) => { puts++; assert.equal(options.access, "private"); if (failPut) throw new Error("simulated upload failure"); files.set(path, Buffer.from(bytes)); },
  get: async (path, options) => { assert.equal(options.access, "private"); const bytes = files.get(path); return bytes ? { statusCode: 200, stream: new Response(bytes).body, blob: { size: bytes.length } } : null; },
  del: async path => { if (failDelete) throw new Error("simulated delete failure"); files.delete(path); },
} });

test("trabajos durables, cuotas, dinero y archivos con PostgreSQL real; IA/Blob simulados", async t => {
  const owner = await prisma.user.create({ data: { name: "Fixture", email: "scalability@example.test", role: "OWNER", passwordHash: "fixture-only" } });
  let member = await prisma.user.create({ data: { name: "Miembro", email: "member-scalability@example.test", passwordHash: "fixture-only" } });
  let other = await prisma.user.create({ data: { name: "Otro", email: "other-scalability@example.test", passwordHash: "fixture-only" } });
  const brand = await prisma.brand.create({ data: { name: "Fixture", slug: "scalability" } });
  for (const account of [member,other]) {
    await prisma.userWorkProfile.create({data:{userId:account.id,profile:'WRITER'}});
    await prisma.userBrandAccess.create({data:{userId:account.id,brandId:brand.id}});
  }
  member = {...await prisma.user.findUniqueOrThrow({where:{id:member.id}}), profiles:['WRITER'],brandIds:[brand.id]};
  other = {...await prisma.user.findUniqueOrThrow({where:{id:other.id}}), profiles:['WRITER'],brandIds:[brand.id]};
  const structure = await prisma.structure.create({ data: { name: "Fixture", slug: "scalability" } });
  const input = { request: "Guion para fixture", provider: "anthropic", brandId: brand.id };
  const enqueue = async (actor = owner, key = randomUUID()) => {
    // Las cuotas se prueban aparte; se resetean sólo los contadores de este fixture efímero.
    await prisma.usageCounter.deleteMany({ where: { key: { startsWith: "ai:" } } });
    return jobs.enqueueGeneration(actor, key, [structure.id], input);
  };
  const drain = async id => { for (let n = 0; n < 7; n++) { const state = await jobs.processGeneration(id); if (state.done) return; if (state.retryAt) await prisma.generationItem.updateMany({ where: { jobId: id }, data: { leaseUntil: new Date(0), availableAt: new Date(0) } }); } throw new Error("No terminó el fixture"); };
  try {
    await t.test("la cola acepta Gemini 3.8 y modelos heredados, pero rechaza un modelo de Claude enviado a Google", async () => {
      for (const model of ['gemini-3.8-flash', 'gemini-2.5-pro']) {
        const id = await jobs.enqueueGeneration(owner, randomUUID(), [structure.id], { ...input, provider: 'google', model });
        const job = await prisma.generationJob.findUniqueOrThrow({ where: { id } });
        assert.equal(job.payload.model, model);assert.equal(job.payload.provider, 'google');
        await jobs.cancelGeneration(owner, id);
      }
      await assert.rejects(jobs.enqueueGeneration(owner, randomUUID(), [structure.id], { ...input, provider: 'google', model: 'claude-opus-5' }), /catálogo/);
    });
    await t.test("dos envíos idénticos producen un trabajo; la misma clave no admite otro contenido", async () => {
      const key = randomUUID();
      const ids = await Promise.all([jobs.enqueueGeneration(owner, key, [structure.id], input), jobs.enqueueGeneration(owner, key, [structure.id], input)]);
      assert.equal(ids[0], ids[1]);
      await assert.rejects(jobs.enqueueGeneration(owner, key, [structure.id], { ...input, request: "Diferente" }), /otra petición/);
      await drain(ids[0]);
      assert.equal(await prisma.script.count({ where: { generationItem: { jobId: ids[0] } } }), 1);
      assert.equal(await prisma.auditLog.count({ where: { entityId: ids[0] } }), 1);
    });
    await t.test("dos ejecutores concurrentes sólo llaman una vez a IA y auditan un guion", async () => {
      const id = await enqueue();
      let release, entered;
      const gate = new Promise(resolve => { release = resolve; });
      const started = new Promise(resolve => { entered = resolve; });
      provider = async () => { entered(); await gate; return output; };
      const before = calls, first = jobs.processGeneration(id);
      await started;
      const second = await jobs.processGeneration(id);
      assert.ok(second.retryAt > Date.now());
      release(); await first; provider = async () => output;
      await drain(id);
      assert.equal(calls, before + 1);
      const script = await prisma.script.findFirstOrThrow({ where: { generationItem: { jobId: id } } });
      assert.equal(script.inputTokens, 12); assert.equal(script.outputTokens, 24);
      assert.equal(await prisma.auditLog.count({ where: { entityId: script.id } }), 1);
    });
    await t.test("si falla auditoría, el resultado queda durable y recuperar no vuelve a llamar al proveedor", async () => {
      const id = await enqueue(), before = calls;
      const broken = load("src/lib/generation-jobs.ts", { ...mocks, "@/lib/generation-persist": { persistGeneratedScript: async () => { throw new Error("audit unavailable"); } } });
      await assert.rejects(broken.processGeneration(id), /audit unavailable/);
      assert.equal(await prisma.script.count({ where: { generationItem: { jobId: id } } }), 0);
      const item = await prisma.generationItem.findFirstOrThrow({ where: { jobId: id } });
      assert.equal(item.response.raw, "fixture-response");
      await prisma.generationItem.update({ where: { id: item.id }, data: { leaseUntil: new Date(0) } });
      await drain(id);
      assert.equal(calls, before + 1);
      assert.equal((await prisma.generationItem.findUnique({ where: { id: item.id } })).response, null);
    });
    await t.test("error transitorio tiene tres intentos máximos; error permanente sólo uno", async () => {
      const id = await enqueue(), before = calls;
      provider = async () => { throw new AiError("Temporal", "", true); };
      await drain(id);
      assert.equal(calls, before + 3);
      assert.equal((await prisma.generationJob.findUnique({ where: { id } })).status, "FAILED");
      const permanent = await enqueue(), previous = calls;
      provider = async () => { throw new AiError("Clave inválida"); };
      await drain(permanent); assert.equal(calls, previous + 1);
      provider = async () => output;
    });
    await t.test("cancelar en vuelo impide guardar otro guion y preserva los existentes", async () => {
      const id = await enqueue();
      provider = async () => { await jobs.cancelGeneration(owner, id); return output; };
      await drain(id); provider = async () => output;
      assert.equal(await prisma.script.count({ where: { generationItem: { jobId: id } } }), 0);
      assert.equal((await prisma.generationJob.findUnique({ where: { id } })).status, "CANCELLED");
    });
    await t.test("sólo dueño o solicitante consultan/cancelan; revocación frena llamadas nuevas", async () => {
      const id = await enqueue(member), before = calls;
      assert.equal(await jobs.generationStatus(other, id), null);
      await assert.rejects(jobs.cancelGeneration(other, id), /no encontrada/);
      await prisma.user.update({ where: { id: member.id }, data: { sessionVersion: { increment: 1 } } });
      await drain(id); assert.equal(calls, before);
      assert.equal((await prisma.generationJob.findUnique({ where: { id } })).status, "CANCELLED");
    });
    await t.test("reservas de cuota concurrentes no exceden el límite ni aceptan un importe negativo", async () => {
      const results = await Promise.allSettled(Array.from({ length: 8 }, () => prisma.$transaction(tx => limits.reserveUsage(tx, "fixture:quota", 1, 3))));
      assert.equal(results.filter(r => r.status === "fulfilled").length, 3);
      assert.equal((await prisma.usageCounter.findUnique({ where: { key: "fixture:quota" } })).amount, 3n);
      await assert.rejects(prisma.usageCounter.create({ data: { key: "bad", amount: -1 } }));
    });
    await t.test("cuota cero impide la llamada antes de consumir IA", async () => {
      const id = await enqueue(), before = calls;
      process.env.AI_DAILY_CALLS = "0";
      await drain(id); delete process.env.AI_DAILY_CALLS;
      assert.equal(calls, before);
      assert.equal((await prisma.generationJob.findUnique({ where: { id } })).status, "FAILED");
    });
    await t.test("despacho concurrente arranca un workflow y conserva su ID aunque termine antes de responder", async () => {
      const id = await enqueue(); let starts = 0;
      const dispatch = load("src/lib/generation-dispatch.ts", { ...mocks, "@/workflows/generate-scripts": { generateScriptsWorkflow: () => {} }, "workflow/api": { start: async () => { starts++; await drain(id); return { runId: "fixture-run" }; } } });
      await Promise.all([dispatch.dispatchGeneration(id), dispatch.dispatchGeneration(id)]);
      assert.equal(starts, 1);
      const row = await prisma.generationJob.findUniqueOrThrow({ where: { id } });
      assert.equal(row.status, "COMPLETED"); assert.equal(row.runId, "fixture-run");
    });
    await t.test("fallo de despacho deja el trabajo recuperable; límite móvil frena nuevos despachos", async () => {
      const id = await enqueue();
      const dispatch = load("src/lib/generation-dispatch.ts", { ...mocks, "@/workflows/generate-scripts": { generateScriptsWorkflow: () => {} }, "workflow/api": { start: async () => { throw new Error("fixture queue failure"); } } });
      await dispatch.dispatchGeneration(id);
      const row = await prisma.generationJob.findUniqueOrThrow({ where: { id } });
      assert.equal(row.status, "QUEUED"); assert.match(row.error, /guardada/);
      await prisma.generationJob.update({ where: { id }, data: { updatedAt: new Date(0) } });
      process.env.AI_32D_DISPATCHES = "0";
      await assert.rejects(dispatch.dispatchGeneration(id, true), /32 días/);
      delete process.env.AI_32D_DISPATCHES;
      await drain(id);
    });
    const video = await prisma.contentItem.create({ data: { brandId: brand.id, title: "Video", scheduledDate: new Date(), platforms: '["TIKTOK","INSTAGRAM","TIKTOK"]' } });
    await t.test("plataformas se normalizan, deduplican y actualizan atómicamente", async () => {
      assert.equal(await prisma.contentPlatform.count({ where: { contentItemId: video.id } }), 2);
      await prisma.contentItem.update({ where: { id: video.id }, data: { platforms: '["YOUTUBE"]' } });
      assert.equal(await prisma.contentItem.count({ where: { id: video.id, platformLinks: { some: { platform: "YOUTUBE" } } } }), 1);
      assert.equal(await prisma.contentPlatform.count({ where: { contentItemId: video.id, platform: "TIKTOK" } }), 0);
      await assert.rejects(prisma.contentItem.update({ where: { id: video.id }, data: { platforms: '["INVALID"]' } }));
      assert.equal((await prisma.contentItem.findUnique({ where: { id: video.id } })).platforms, '["YOUTUBE"]');
    });
    await t.test("dinero decimal suma 0.1 + 0.2 exactamente; no redondea entrada ni interpreta miles ambiguos", async () => {
      for (const [amount, date] of [["0.1", "2026-09-07"], ["0.2", "2026-09-14"]]) await prisma.metric.create({ data: { contentItemId: video.id, date: new Date(date + "T12:00Z"), platform: "YOUTUBE", period: "WEEKLY", spend: money.parseMoney(amount) } });
      const sum = await prisma.metric.aggregate({ where: { contentItemId: video.id }, _sum: { spend: true } });
      assert.equal(sum._sum.spend.toString(), "0.3");
      assert.equal(money.parseCsvMoney("S/ 1.234,56789").toString(), "1234.56789");
      for (const raw of ["-1", "NaN", "Infinity", "1.2345678", "1e2", "1000000000001"]) assert.throws(() => money.parseMoney(raw));
      assert.throws(() => money.parseCsvMoney("1.234"), /ambiguo/);
    });
    await t.test("archivo privado verifica bytes y borrado en cascada queda en cola durable", async () => {
      const bytes = Buffer.from("fixture private bytes"), id = await storage.stagePrivateFile(bytes);
      const asset = await prisma.$transaction(async tx => {
        await storage.attachPrivateFile(tx, id);
        return tx.asset.create({ data: { ownerType: "content", ownerId: video.id, filename: "fixture.txt", size: bytes.length, blobId: id } });
      });
      assert.equal(asset.data, null);
      await assert.rejects(prisma.$transaction(async tx => { await tx.asset.delete({ where: { id: asset.id } }); throw new Error("rollback"); }));
      assert.equal((await prisma.blobObject.findUnique({ where: { id } })).state, "ATTACHED");
      await prisma.contentItem.delete({ where: { id: video.id } });
      assert.equal((await prisma.blobObject.findUnique({ where: { id } })).state, "DELETE_PENDING");
      failDelete = true;
      assert.equal((await storage.cleanupPrivateFiles()).failed, 1);
      assert.equal((await prisma.blobObject.findUnique({ where: { id } })).state, "DELETE_PENDING");
      failDelete = false;
      await prisma.blobObject.update({ where: { id }, data: { nextAttemptAt: new Date(0) } });
      assert.equal((await storage.cleanupPrivateFiles()).deleted, 1);
      assert.equal((await prisma.blobObject.findUnique({ where: { id } })).state, "DELETED");
    });
    await t.test("subida fallida conserva inventario recuperable; cupo cero impide subir", async () => {
      failPut = true;
      await assert.rejects(storage.stagePrivateFile(Buffer.from("failure")), /No se pudo guardar/);
      failPut = false;
      assert.equal(await prisma.blobObject.count({ where: { state: "DELETE_PENDING" } }), 1);
      process.env.BLOB_STORAGE_LIMIT = "0";
      const before = puts;
      await assert.rejects(storage.stagePrivateFile(Buffer.from("over quota")), /cupo/);
      delete process.env.BLOB_STORAGE_LIMIT;
      assert.equal(puts, before);
      await storage.cleanupPrivateFiles();
    });
  } finally { await prisma.$disconnect(); }
});
