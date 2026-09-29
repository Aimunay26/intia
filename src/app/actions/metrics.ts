"use server";
import { requirePermission } from "@/lib/auth";
import { eliminarMetrica as deleteMetric } from "@/app/actions/content";
import { saveWeeklyMetric } from "@/lib/weekly-metric-mutations";
import { startMetricImport, continueMetricImport, recentMetricImports } from "@/lib/metric-import-service";
import { invalidateDomain } from "@/lib/view-invalidation";
// Los tipos se importan desde "@/lib/metric-import-parser": un archivo "use server"
// solo puede exportar funciones async y Turbopack rechaza el re-export de tipos.
import type { ImportState } from "@/lib/metric-import-parser";

export async function guardarMetricaRapida(form: FormData) {
  await saveWeeklyMetric(await requirePermission("metrics.write"), form);
  invalidateDomain("metric");
}
export async function eliminarMetrica(form: FormData) { await deleteMetric(form); }
export async function importarMetricasCsv(_prev: ImportState, form: FormData): Promise<ImportState> {
  const state = await startMetricImport(await requirePermission("metrics.write"), form);
  invalidateDomain("metric"); return state;
}
export async function continuarImportacion(id: string): Promise<ImportState> {
  const state = await continueMetricImport(await requirePermission("metrics.write"), id);
  invalidateDomain("metric"); return state;
}
export async function misImportaciones() { return recentMetricImports(await requirePermission("metrics.write")); }
