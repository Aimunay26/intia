import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

test("producción termina al inicializar con AUTH_SECRET débil", () => {
  assert.ok(existsSync(".next/BUILD_ID"), "Ejecuta npm run build antes de esta prueba.");
  const result = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3102"], {
    timeout: 15000,
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "production", AUTH_SECRET: "weak", BOOTSTRAP_TOKEN: "", DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:1/startup_test", NEXT_PHASE: "phase-production-server" },
  });
  assert.notEqual(result.status, null, "La inicialización no terminó dentro del plazo.");
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /\[auth\] AUTH_SECRET/);
});
