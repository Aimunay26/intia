/** Ejecuta el Workflow SDK real contra Next compilado y una DB efímera. Respuestas IA ficticias ya guardadas. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { chromium, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { assertLocalDatabase } from "./local-database-only.mjs";
import { validScript } from "../tests/ai-fixture.mjs";

const url = assertLocalDatabase(), admin = new PrismaClient({ datasourceUrl: url.href });
const suffix = randomBytes(4).toString("hex"), name = `intia_workflow_${suffix}_test`, target = new URL(url);
target.pathname = `/${name}`;
const port = 3007, base = `http://127.0.0.1:${port}`;
const env = { ...process.env, DATABASE_URL: target.href, AUTH_SECRET: randomBytes(32).toString("hex"), GEMINI_API_KEY: "fixture-not-a-real-key", ANTHROPIC_API_KEY: "fixture-not-a-real-key", AI_JOBS_ENABLED: "true", WORKFLOW_TARGET_WORLD: "local", WORKFLOW_LOCAL_BASE_URL: base, WORKFLOW_LOCAL_DATA_DIR: path.resolve(`.audit/workflow-${suffix}`), WORKFLOW_LOCAL_RECOVER_ACTIVE_RUNS: "false", NODE_ENV: "production" };
let server, db, browser;
try {
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  const migrated = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env, encoding: "utf8" });
  if (migrated.status !== 0) throw new Error(migrated.stderr);
  db = new PrismaClient({ datasourceUrl: target.href });
  const password = randomBytes(16).toString("hex");
  const user = await db.user.create({ data: { name: "Fixture", email: "workflow@example.test", role: "OWNER", passwordHash: await bcrypt.hash(password, 10) } });
  await db.appSetting.create({ data: { key: "security.bootstrap.complete", value: "1" } });
  const structure = await db.structure.create({ data: { name: "Fixture", slug: "workflow", defaultProvider: "anthropic", defaultModel: "claude-opus-5", defaultDurationSec: 5 } });
  await db.appSetting.create({ data: { key: 'ai.google.model', value: 'gemini-2.5-pro' } });
  await db.structure.createMany({ data: [1, 2, 3].map(n => ({ name: `Fixture ${n}`, slug: `workflow-${n}` })) });
  const response = { script: { ...validScript, title: "Recuperado por Workflow" }, provider: "anthropic", model: "fixture", raw: "fixture-response", systemPrompt: "fixture-prompt", userPrompt: "fixture", referencesUsed: [], inputTokens: 10, outputTokens: 20 };
  const job = await db.generationJob.create({ data: { userId: user.id, sessionVersion: user.sessionVersion, requestKey: randomBytes(16).toString("hex"), fingerprint: "fixture", payload: { provider: "anthropic", request: "Fixture" }, items: { create: { structureId: structure.id, order: 0, response, attempts: 1 } } } });
  fs.writeFileSync(".audit/workflow-server.log", "");
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port), "-H", "127.0.0.1"], { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  for (const stream of [server.stdout, server.stderr]) stream.on("data", chunk => fs.appendFileSync(".audit/workflow-server.log", chunk));
  for (let n = 0; n < 60; n++) { try { if ((await fetch(base + "/login")).ok) break; } catch {} await new Promise(resolve => setTimeout(resolve, 500)); }
  for (const key of ["WORKFLOW_TARGET_WORLD", "WORKFLOW_LOCAL_BASE_URL", "WORKFLOW_LOCAL_DATA_DIR", "WORKFLOW_LOCAL_RECOVER_ACTIVE_RUNS"]) process.env[key] = env[key];
  const source = fs.readFileSync("src/app/.well-known/workflow/v1/flow/route.js", "utf8");
  const workflowId = source.match(/generateScriptsWorkflow\.workflowId = "([^"]+)"/)?.[1];
  assert.ok(workflowId, "El build debe contener la definición del workflow");
  const { start } = await import("workflow/api");
  const run = await start({ workflowId }, [job.id]);
  let timeout;
  try { await Promise.race([run.returnValue, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("Workflow no finalizó en 60 segundos")), 60000); })]); }
  finally { clearTimeout(timeout); }
  const completed = await db.generationJob.findUniqueOrThrow({ where: { id: job.id } });
  assert.equal(completed.status, "COMPLETED");
  const scripts = await db.script.findMany({ where: { generationItem: { jobId: job.id } } });
  assert.equal(scripts.length, 1); assert.equal(scripts[0].inputTokens, 10);
  assert.equal(await db.auditLog.count({ where: { entityId: scripts[0].id } }), 1);
  const traces = fs.readFileSync('.audit/workflow-server.log', 'utf8').split(/\r?\n/).flatMap(line => {
    try { const row = JSON.parse(line);return row.event === 'generation_trace' && row.jobId === job.id ? [row] : []; } catch { return []; }
  });
  assert.ok(traces.some(r => r.stage === 'workflow_step' && r.state === 'success'), 'El Workflow compilado debe conservar las trazas');
  assert.ok(traces.some(r => r.stage === 'script_save' && r.state === 'success'));
  assert.ok(traces.some(r => r.stage === 'script_insert' && r.state === 'success'));
  assert.doesNotMatch(JSON.stringify(traces), /fixture-prompt|fixture-response|fixture-not-a-real-key/);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(base + "/login");
  await page.locator('input[name="email"]').fill(user.email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(base + "/");
  await page.goto(`${base}/generador/trabajos/${job.id}`);
  await page.getByRole("link", { name: "Recuperado por Workflow →", exact: true }).waitFor();
  await page.screenshot({ path: ".audit/generation-progress.png", fullPage: true });
  await page.goto(base + "/generador/trabajos");
  await page.getByRole("heading", { name: "Generaciones pendientes", exact: true }).waitFor();
  await expect(page.getByText("No tienes generaciones pendientes", { exact: true })).toBeVisible();
  await expect(page.getByRole("main").locator(`a[href="/generador/trabajos/${job.id}"]`)).toHaveCount(0);
  await page.getByRole("link", { name: "Ver guiones", exact: true }).click();
  await expect(page.getByRole("main").getByRole("link", { name: "Recuperado por Workflow", exact: true })).toBeVisible();
  await page.goto(base + "/generador");
  await page.getByRole("link", { name: "Mis generaciones →", exact: true }).waitFor();
  await page.getByRole("main").locator('summary[aria-label="Más opciones de selección"]').click();
  await page.getByRole("button", { name: /Seleccionar visibles/ }).click();
  const generatorForm=page.getByRole('main').locator('form:visible').filter({has:page.locator('input[name="estructuras"]')});
  await expect(generatorForm.locator('input[name="estructuras"]')).toHaveValue(/^[^,]+,[^,]+,[^,]+$/);
  await page.screenshot({ path: ".audit/generator-jobs.png", fullPage: true });
  await page.goto(`${base}/generador?estructura=${structure.id}&producto=Producto%20ficticio&peticion=Idea%20ficticia%20para%20probar%20el%20selector`);
  for (const title of ['¿Qué vamos a contar y para quién?', '¿Cuál es la idea del video?', '¿Qué quieres que haga el espectador?', 'Revisa y genera tus guiones']) {
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  }
  const modelInput = page.getByRole('main').getByRole('combobox', { name: 'Modelo', exact: true });
  assert.equal(await modelInput.inputValue(), 'claude-opus-5');
  await page.getByRole('button', { name: /Gemini \(Google\)/ }).click();
  assert.equal(await modelInput.inputValue(), 'gemini-3.8-flash');
  await expect(modelInput.locator('option[value="gemini-3.8-flash"]')).toHaveCount(1);
  await page.getByRole('button', { name: /Claude \(Anthropic\)/ }).click();
  assert.equal(await modelInput.inputValue(), 'claude-opus-5');
  await page.getByRole('button', { name: /Gemini \(Google\)/ }).click();
  await page.screenshot({ path: '.audit/gemini-3-8-selector.png', fullPage: true, animations: 'disabled' });
  await page.goto(base + '/ajustes');
  assert.equal(await page.getByRole('main').locator('input[name="googleModel"]:visible').inputValue(), 'gemini-3.8-flash');
  const report = { checkedAt: new Date().toISOString(), environment: "local-production-build", workflowSdk: JSON.parse(fs.readFileSync("node_modules/workflow/package.json", "utf8")).version, actualQueueExecuted: true, persistedResponseRecovered: true, scriptsCreated: 1, auditCount: 1, generationTracesVerified: true, gemini38ProviderSwitch: true, legacyGoogleSettingResolved: true, liveAiCalls: 0, liveBlobCalls: 0 };
  fs.writeFileSync(".audit/workflow-smoke.json", JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  if (server) { const exited = new Promise(resolve => server.once("exit", resolve)); server.kill(); await exited; }
  await db?.$disconnect();
  await admin.$executeRawUnsafe(`DROP DATABASE "${name}" WITH (FORCE)`); await admin.$disconnect();
}
process.exit(0); // El ejecutor local mantiene sus workers vivos; sólo este proceso de QA termina.
