/** Explicit operator command; never outputs connection strings, plaintext or ciphertext. */
import { PrismaClient } from "@prisma/client";
import { migrateSecretStore } from "../src/lib/secret-migration";
import { decryptSecret, isSecretName, SECRET_KEYS } from "../src/lib/secret-crypto";

const flags = process.argv.slice(2);
if (flags.some(flag => !["--apply", "--rotate"].includes(flag)) || (flags.includes("--rotate") && !flags.includes("--apply"))) throw new Error("Uso: npm run secrets:migrate -- [--apply [--rotate]]");
const raw = process.env.DATABASE_URL;
if (!raw) throw new Error("Define DATABASE_URL en el entorno del operador.");
let url: URL;
try { url = new URL(raw); } catch { throw new Error("DATABASE_URL no tiene un formato válido."); }
const local = ["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname);
if (!local && url.searchParams.get("application_name") !== "intia-migrator-20260909") throw new Error("La operación remota requiere la conexión de mantenimiento.");
const db = new PrismaClient({ datasourceUrl: url.href, log: [] });
try {
  const result = await db.$transaction(async tx => {
    if (!local) {
      const gate = await tx.$queryRaw<{ blocked: boolean }[]>`SELECT blocked FROM intia_ops.deployment_gate WHERE singleton FOR SHARE`;
      if (!gate[0]?.blocked) throw new Error("gate");
    }
    if (flags.includes("--apply")) return migrateSecretStore(tx, flags.includes("--rotate"));
    const rows = await tx.appSecret.findMany();
    for (const row of rows) { if (!isSecretName(row.key)) throw new Error("key"); decryptSecret(row.key, row); }
    return { encrypted: rows.length, verified: rows.length, legacy: await tx.appSetting.count({ where: { key: { in: [...SECRET_KEYS] } } }), keyVersions: [...new Set(rows.map(row => row.keyId))] };
  }, { timeout: 15000, isolationLevel: "Serializable" });
  console.log(JSON.stringify(result));
} catch {
  console.error("No se completó la operación de secretos. Comprueba migración, claves de cifrado, conexión de mantenimiento y escrituras cerradas. No se guardaron cambios parciales.");
  process.exitCode = 1;
} finally { await db.$disconnect(); }
