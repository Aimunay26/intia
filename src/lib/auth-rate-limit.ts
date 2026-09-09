import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { authSecretBytes } from "@/lib/auth";

const WINDOW_MS = 15 * 60_000;
export const ACCESS_LIMIT_MESSAGE = "Demasiados intentos. Espera 15 minutos antes de volver a intentar.";

async function trustedIp() {
  // En Vercel este encabezado lo sobrescribe la plataforma. En otros hosts no se confía en el cliente.
  if (process.env.VERCEL !== "1") return "unknown";
  const value = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim();
  return value && isIP(value) ? value : "unknown";
}

export async function consumeAccessAttempt(scope: "login" | "bootstrap" | "google", account = "") {
  const ip = await trustedIp();
  const limits = [{ scope: `${scope}:ip:${ip}`, max: 60 }];
  if (account) limits.push({ scope: `${scope}:account:${account.toLowerCase()}`, max: 30 }, { scope: `${scope}:pair:${ip}:${account.toLowerCase()}`, max: 10 });
  let allowed = true;
  // Orden fijo. Cada UPSERT es atómico también entre procesos/instancias distintas.
  for (const limit of limits) {
    const key = createHmac("sha256", authSecretBytes()).update(limit.scope).digest("hex");
    const rows = await prisma.$queryRaw<{ attempts: number }[]>`
      INSERT INTO "AuthAttempt" ("key", "attempts", "expiresAt")
      VALUES (${key}, 1, CURRENT_TIMESTAMP + ${WINDOW_MS} * INTERVAL '1 millisecond')
      ON CONFLICT ("key") DO UPDATE SET
        "attempts" = CASE WHEN "AuthAttempt"."expiresAt" <= CURRENT_TIMESTAMP THEN 1 ELSE LEAST("AuthAttempt"."attempts" + 1, 1000) END,
        "expiresAt" = CASE WHEN "AuthAttempt"."expiresAt" <= CURRENT_TIMESTAMP THEN CURRENT_TIMESTAMP + ${WINDOW_MS} * INTERVAL '1 millisecond' ELSE "AuthAttempt"."expiresAt" END
      RETURNING "attempts"`;
    if (rows[0].attempts > limit.max) { allowed = false; break; }
  }
  // Limpieza acotada; índices por vencimiento, sin cron ni datos personales.
  await prisma.$executeRaw`DELETE FROM "AuthAttempt" WHERE "key" IN (SELECT "key" FROM "AuthAttempt" WHERE "expiresAt" < CURRENT_TIMESTAMP LIMIT 100)`;
  return allowed;
}
