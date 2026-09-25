import { requireWeekStart } from "@/lib/weekly-metrics";
import { requireDay } from "@/lib/validation";

export const OBJECTIVE_METRICS = { views: "Vistas", likes: "Likes", comments: "Comentarios", shares: "Compartidos", saves: "Guardados", reach: "Suma de alcances (no únicos)", clicks: "Clics", leads: "Leads", orders: "Pedidos", spend: "Inversión", revenue: "Ingresos" } as const;
export function objectiveCalculation(form: FormData) {
  const mode = String(form.get("calculationMode") || "MANUAL");
  if (mode === "MANUAL") return { calculationMode: mode, calculationFrom: null, calculationTo: null, calculationPlatform: null };
  if (mode !== "WEEKLY_SUM") throw new Error("Modo de objetivo no válido.");
  if (!Object.hasOwn(OBJECTIVE_METRICS, String(form.get("metricKey")))) throw new Error("Elige una métrica sumable para el objetivo automático.");
  const from = requireWeekStart(String(form.get("calculationFrom") || ""));
  const to = new Date(requireDay(String(form.get("calculationTo") || "")) + "T12:00:00.000Z");
  const days = (to.getTime() - from.getTime()) / 86400000 + 1;
  if (to.getUTCDay() !== 0 || days < 7 || days > 364) throw new Error("El período calculado va de lunes a domingo, entre 1 y 52 semanas.");
  const platform = String(form.get("calculationPlatform") || "");
  if (platform && !["TIKTOK", "INSTAGRAM", "FACEBOOK", "YOUTUBE", "WHATSAPP", "OTRO"].includes(platform)) throw new Error("Plataforma no válida.");
  return { calculationMode: mode, calculationFrom: from, calculationTo: to, calculationPlatform: platform || null };
}
