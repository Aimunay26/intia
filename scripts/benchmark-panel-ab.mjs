import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { assertLocalDatabase } from "./local-database-only.mjs";
assertLocalDatabase();
const buildId = fs.readFileSync(".next/BUILD_ID", "utf8").trim();
const arms = [];
for (const mode of ["streaming", "together"]) {
  if (fs.readFileSync(".next/BUILD_ID", "utf8").trim() !== buildId) throw new Error("La compilación cambió durante la comparación.");
  const env = { ...process.env, PANEL_RENDER_MODE: mode, BENCH_SAMPLES: "30", BENCH_NAV_SAMPLES: "30", BENCH_DETAILS: "0" };
  console.log(`Iniciando comparación local: ${mode}, 30 muestras por ruta.`);
  const result = spawnSync(process.execPath, ["scripts/run-benchmark.mjs"], { env, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`Falló el brazo ${mode}`);
  const directory = `.audit/navigation-ab-${mode}`;
  fs.mkdirSync(directory, { recursive: true });
  for (const file of ["navigation-report.json", "navigation-samples.json", "navigation-server.jsonl", "navigation-browser.jsonl"]) fs.copyFileSync(`.audit/${file}`, `${directory}/${file}`);
  arms.push({ mode, ...JSON.parse(fs.readFileSync(`${directory}/navigation-report.json`, "utf8")) });
}
fs.writeFileSync(".audit/panel-ab.json", JSON.stringify({ checkedAt: new Date().toISOString(), environment: "local-production-build", buildId, sampleDesign: "same build, sequential arms, separate identical fixtures; not a randomized production experiment", arms }, null, 2));
