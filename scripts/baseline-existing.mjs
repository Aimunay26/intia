import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL) throw new Error("Exporta DATABASE_URL en el proceso; no se lee ni modifica .env automáticamente.");
const expected = JSON.parse(fs.readFileSync("prisma/operations/baseline-evidence.json", "utf8")).fingerprint;
const db = new PrismaClient();
try {
  const [actual] = await db.$queryRawUnsafe(fs.readFileSync("prisma/operations/schema-fingerprint.sql", "utf8"));
  if (actual.schema_fingerprint !== expected) throw new Error("El esquema difiere de la línea base comprobada. Detenido; inspecciona la diferencia antes de registrar migraciones.");
  console.log("Esquema compatible con la línea base verificada de 24 tablas.");
  if (process.argv.includes("--record")) {
    const result = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "resolve", "--applied", "00000000000000_baseline"], { stdio: "inherit", env: process.env });
    if (result.status !== 0) process.exitCode = result.status ?? 1;
  } else console.log("Solo comprobación. Con respaldo verificado, --record registra la línea base; no aplica cambios de esquema.");
} finally { await db.$disconnect(); }
