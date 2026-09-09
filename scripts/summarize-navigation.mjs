import fs from "node:fs";
import { pathToFileURL } from "node:url";

export function percentile(values, quantile) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)];
}

export function summarize(records) {
  const groups = new Map();
  for (const row of records) {
    if (!row || typeof row !== "object") continue;
    const navigation = ["complete", "cancelled", "timeout", "error"].includes(row.status) && typeof row.to === "string";
    if (!navigation && row.kind !== "phase" && row.kind !== "query") continue;
    const key = JSON.stringify([row.environment ?? "unknown", row.release ?? "unknown", row.region ?? "unknown", navigation ? `${row.kind ?? "click"}:${row.condition ?? "unknown"}:navigation:${row.to}` : `${row.kind}:${row.phase}:${row.model ?? ""}:${row.operation ?? ""}`]);
    const group = groups.get(key) ?? { key: JSON.parse(key), samples: 0, failures: 0, cancelled: 0, timings: {} };
    group.samples++;
    if (navigation && row.status === "cancelled") group.cancelled++;
    else if (navigation ? row.status !== "complete" : row.ok === false) group.failures++;
    for (const field of navigation ? ["visualMs", "routeMs", "firstBlockMs", "readyMs"] : ["durationMs", "operations", "queryMs"]) {
      if (typeof row[field] !== "number" || !Number.isFinite(row[field]) || row[field] < 0) continue;
      if (navigation && row.status !== "complete") continue;
      (group.timings[field] ??= []).push(row[field]);
    }
    groups.set(key, group);
  }
  return [...groups.values()].map(group => ({ ...group, timings: Object.fromEntries(Object.entries(group.timings).map(([key, values]) => [key, { n: values.length, sufficient: values.length >= 30, p50: percentile(values, .5), p95: values.length >= 30 ? percentile(values, .95) : null, max: values.reduce((max, value) => Math.max(max, value), 0) }])) }));
}

export function correlate(records) {
  const byId = new Map();
  for (const row of records) if ((row.kind === "phase" || row.kind === "query") && row.requestId) {
    const key = `${row.environment ?? "unknown"}|${row.release ?? "unknown"}|${row.requestId}`;
    byId.set(key, [...(byId.get(key) ?? []), row]);
  }
  return records.filter(row => row.status === "complete" && row.to).map(row => {
    const traces = (row.requestIds ?? []).flatMap(id => byId.get(`${row.environment ?? "unknown"}|${row.release ?? "unknown"}|${id}`) ?? []);
    return { id: row.id, startedAt: row.startedAt, to: row.to, environment: row.environment, release: row.release,
      readyMs: row.readyMs, matched: traces.length > 0, renderedBeforeStart: Boolean(row.renderedBeforeStart),
      queries: traces.filter(trace => trace.kind === "query").length,
      phases: traces.filter(trace => trace.kind === "phase").map(trace => ({ phase: trace.phase, durationMs: trace.durationMs, operations: trace.operations })),
    };
  });
}

export function parseRecords(text) {
  try { const parsed = JSON.parse(text); if (Array.isArray(parsed)) return parsed; } catch { /* JSONL de logs */ }
  return text.split(/\r?\n/).flatMap(line => {
    const marker = line.match(/\[(?:performance|navigation)\]\s*(\{.*\})/);
    try {
      const parsed = JSON.parse(marker?.[1] ?? line);
      return !marker && typeof parsed.message === "string" ? parseRecords(parsed.message) : [parsed];
    } catch { return []; }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const paths = process.argv.slice(2);
  if (!paths.length) throw new Error("Uso: npm run perf:resumen -- archivo.json [logs.jsonl]");
  const records = paths.flatMap(file => parseRecords(fs.readFileSync(file, "utf8")));
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), note: "p95 requiere 30 muestras por ruta/condición/entorno. Cancelaciones no son fallos. Las consultas paralelas no se suman como latencia; un render previo al clic no equivale a SQL ejecutado después del clic.", groups: summarize(records), correlations: correlate(records) }, null, 2));
}
