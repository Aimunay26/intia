import { assertContentAccess } from "@/lib/access-scope";
import { parseMoney } from "@/lib/money";
import type { SessionUser } from "@/lib/auth";
import { withMutation, lockRevision } from "@/lib/mutations";
import { auditInTransaction, diffFields } from "@/lib/audit";
import { field, fieldOrNull, intField, numField } from "@/lib/utils";
import { boundedNumber, enumField } from "@/lib/validation";
import { PLATFORM_MAP } from "@/lib/constants";
import { requireWeekStart } from "@/lib/weekly-metrics";

export async function saveWeeklyMetric(user: SessionUser, form: FormData) {
  const contentItemId = field(form, "contentItemId"), id = field(form, "id");
  const date = requireWeekStart(field(form, "date"));
  const platform = enumField(form, "platform", PLATFORM_MAP);
  const count = (key: string) => boundedNumber(intField(form, key), 0, 2147483647, key, true);
  const amount = (key: string) => parseMoney(field(form, key), key);
  const notes = fieldOrNull(form, "notes");
  if ((notes?.length ?? 0) > 2000) throw new Error("Las notas no pueden superar 2000 caracteres.");
  const data = {
    views: count("views"), likes: count("likes"), comments: count("comments"), shares: count("shares"), saves: count("saves"),
    reach: count("reach"), clicks: count("clicks"), leads: count("leads"), orders: count("orders"), spend: amount("spend"), revenue: amount("revenue"),
    retention3s: field(form, "retention3s") ? boundedNumber(numField(form, "retention3s"), 0, 100, "Retención") : null,
    notes, source: "MANUAL",
  };
  return withMutation(user, false, async tx => {
    await assertContentAccess(tx, user, contentItemId, "metrics.write");
    const video = await tx.contentItem.findUniqueOrThrow({ where: { id: contentItemId }, select: { brandId: true, title: true } });
    // Una alta nunca sobrescribe silenciosamente una semana que ya existe.
    const before = id ? await tx.metric.findUniqueOrThrow({ where: { id } }) : null;
    if (before && (before.contentItemId !== contentItemId || before.period !== "WEEKLY" || before.platform !== platform || before.date.getTime() !== date.getTime())) {
      throw new Error("La semana, plataforma y video de un registro existente no se pueden cambiar.");
    }
    if (before) await lockRevision(tx, "Metric", id, form);
    const saved = before
      ? await tx.metric.update({ where: { id }, data })
      : await tx.metric.create({ data: { contentItemId, date, platform, period: "WEEKLY", ...data } });
    await auditInTransaction(tx, { user, action: before ? "EDITAR" : "CREAR", entity: "Metric", entityId: saved.id, brandId: video.brandId,
      summary: `${before ? "Corrigió" : "Registró"} la semana ${date.toISOString().slice(0, 10)} · ${platform} de "${video.title}"`,
      changes: diffFields(before ?? Object.fromEntries(Object.keys(saved).map(key => [key, null])), saved),
    });
  });
}
