"use server";
import { requirePermission } from "@/lib/auth";
import { withMutation, EDIT_CONFLICT } from "@/lib/mutations";
import { readRetentionPolicy, retentionPolicy, retentionFingerprint, previewRetention, RETENTION_KEY } from "@/lib/retention";
import { setSetting } from "@/lib/settings";
import { auditInTransaction } from "@/lib/audit";
import { revalidatePath } from "next/cache";

export async function revisarRetencion(value: unknown) {
  await requirePermission("admin.settings");
  const policy = retentionPolicy(value);
  return { policy, counts: await previewRetention(policy), fingerprint: retentionFingerprint(policy) };
}
export async function guardarRetencion(value: unknown, revision: string, preview: string) {
  const user = await requirePermission("admin.settings"), policy = retentionPolicy(value);
  if (retentionFingerprint(policy) !== preview) throw new Error("Revisa de nuevo la vista previa antes de guardar esta política.");
  return withMutation(user, true, async (tx, afterCommit) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(727106411)`;
    if ((await readRetentionPolicy(tx)).revision !== revision) throw new Error(EDIT_CONFLICT);
    await setSetting(RETENTION_KEY, JSON.stringify(policy), tx);
    await auditInTransaction(tx, { user, action: "EDITAR", entity: "AppSetting", entityId: RETENTION_KEY, summary: `${policy.enabled ? "Activó" : "Desactivó"} retención técnica; conserva historial de negocio`, changes: { policy: { etiqueta: "Retención técnica", antes: null, despues: policy } } });
    afterCommit(() => revalidatePath("/ajustes"));
    return (await readRetentionPolicy(tx)).revision;
  });
}
