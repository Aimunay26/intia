import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { cleanupPrivateFiles } from "@/lib/private-storage";
import { dispatchGeneration } from "@/lib/generation-dispatch";

export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || secret.length < 32 || received.length !== expected.length || !timingSafeEqual(received, expected)) return new Response("No autorizado", { status: 401 });
  const cleanup = await cleanupPrivateFiles(10);
  const jobs = process.env.AI_JOBS_ENABLED === "true" ? await prisma.generationJob.findMany({ where: { status: { in: ["QUEUED", "RUNNING"] }, updatedAt: { lt: new Date(Date.now() - 360000) } }, orderBy: { createdAt: "asc" }, take: 5, select: { id: true } }) : [];
  let dispatched = 0;
  for (const job of jobs) {
    try { if (await dispatchGeneration(job.id, true)) dispatched++; }
    catch { /* La fila sigue pendiente para recuperación manual o el siguiente mantenimiento. */ }
  }
  return Response.json({ cleanup, recoveredRequests: dispatched }, { headers: { "Cache-Control": "no-store" } });
}
