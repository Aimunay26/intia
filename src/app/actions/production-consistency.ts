"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { withMutation } from "@/lib/mutations";
import { resolveProductionIssue } from "@/lib/domain/production-consistency";
import { productionChainConfigured } from "@/lib/production-chain-flag";
import { WorkflowError } from "@/lib/workflow-policy";
import { ProductionFlowError } from "@/lib/domain/production-flow";
import { invalidateDomain } from "@/lib/view-invalidation";
import { field } from "@/lib/utils";

export async function resolverInconsistencia(form: FormData) {
  if (!productionChainConfigured()) return { error: "La cadena de entregas no está activa." };
  const user = await requirePermission("content.assign");
  const mode = field(form, "mode");
  if (!["repair", "create", "duplicates"].includes(mode)) return { error: "Elige una resolución válida." };
  try {
    const result = await withMutation(user, false, tx => resolveProductionIssue(tx, user, {
      key: field(form, "key"), revision: field(form, "revision"), mode: mode as "repair" | "create" | "duplicates",
      keepStepId: field(form, "keepStepId"), reason: field(form, "reason"),
    }));
    invalidateDomain("content");
    revalidatePath("/tareas");
    revalidatePath("/cadena", "layout");
    return { ok: true, message: result.message };
  } catch (error) {
    if (error instanceof WorkflowError || error instanceof ProductionFlowError) return { error: error.message };
    throw error;
  }
}
