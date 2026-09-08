import fs from "node:fs";
import { Prisma, PrismaClient } from "@prisma/client";
import nextEnv from "@next/env";
import { databaseUrl } from "../src/lib/database-url";

nextEnv.loadEnvConfig(process.cwd());
const url = databaseUrl();
if (!url || !url.startsWith("postgres")) throw new Error("Configura DATABASE_URL de PostgreSQL en el entorno local; no la pegues en el informe.");
const parsed = new URL(url);
const client = new PrismaClient({ datasourceUrl: url, log: [] });
const args = process.argv.slice(2);
const outputIndex = args.indexOf("--output");
const output = outputIndex >= 0 ? args[outputIndex + 1] : undefined;
const explain = args.includes("--explain");
try {
  const timings = [];
  for (let index = 0; index < 6; index++) {
    const start = performance.now();
    await client.$queryRaw`SELECT 1`;
    timings.push({ order: index + 1, ms: Math.round((performance.now() - start) * 100) / 100 });
  }
  const [settings, activity, indexes] = await Promise.all([
    client.$queryRaw`SELECT current_setting('server_version') AS "version", current_setting('max_connections') AS "maxConnections", current_setting('TimeZone') AS "timezone"`,
    client.$queryRaw`SELECT state, COUNT(*)::int AS connections FROM pg_stat_activity WHERE datname = current_database() GROUP BY state`,
    client.$queryRaw`SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('Metric','Task','ContentItem','Assignment','Archetype','User') ORDER BY tablename, indexname`,
  ]);
  const plans: unknown[] = [];
  if (explain) {
    // Consultas fijas y solo lectura. EXPLAIN ANALYZE ejecuta SELECT; no admite SQL del usuario.
    plans.push(await client.$queryRaw(Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT "id", "order" FROM "Task" WHERE "columnId" = (SELECT "id" FROM "TaskColumn" ORDER BY "order" LIMIT 1) ORDER BY "order", "id" LIMIT 51`));
    plans.push(await client.$queryRaw(Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT "date", SUM("views") FROM "Metric" WHERE "date" >= CURRENT_DATE - INTERVAL '30 days' GROUP BY "date" ORDER BY "date"`));
  }
  const report = {
    generatedAt: new Date().toISOString(), environment: process.env.VERCEL_ENV ?? "local-or-external-db",
    release: process.env.VERCEL_GIT_COMMIT_SHA ?? null, appRegion: process.env.VERCEL_REGION ?? null,
    provider: parsed.hostname.endsWith(".neon.tech") ? "Neon" : "PostgreSQL",
    localDatabase: ["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname),
    pooledEndpoint: parsed.hostname.includes("-pooler"),
    pool: Object.fromEntries(["connection_limit", "pool_timeout", "connect_timeout", "pgbouncer"].map(key => [key, parsed.searchParams.get(key)])),
    timings, settings, activity, indexes, plans,
    limits: ["El primer SELECT de este proceso no demuestra un arranque en frío de Neon.", "La región de la DB se verifica en Neon; no se deduce de la latencia.", "max_connections no equivale a la cuota o capacidad del pool de Neon.", "No se modificaron conexiones, índices ni datos."],
  };
  const json = JSON.stringify(report, (_, value: unknown) => typeof value === "bigint" ? Number(value) : value, 2);
  if (output) { fs.writeFileSync(output, json + "\n"); console.log(`Diagnóstico guardado en ${output}`); }
  else console.log(json);
} finally { await client.$disconnect(); }
