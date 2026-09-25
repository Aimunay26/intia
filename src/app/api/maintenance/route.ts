import { timingSafeEqual } from "node:crypto";
import { runMaintenance } from "@/lib/maintenance";

export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || secret.length < 32 || received.length !== expected.length || !timingSafeEqual(received, expected)) return new Response("No autorizado", { status: 401 });
  return Response.json(await runMaintenance(), { headers: { "Cache-Control": "no-store" } });
}
