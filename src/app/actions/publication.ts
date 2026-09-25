"use server";
import { requirePermission } from "@/lib/auth";
import { withWorkflowMutation } from "@/lib/mutations";
import { recordPublication } from "@/lib/domain/lifecycle";
import { invalidateDomain } from "@/lib/view-invalidation";
import { field, fieldOrNull, dateField } from "@/lib/utils";
export async function guardarPublicacion(form: FormData) {
  const user = await requirePermission("content.publish");
  return withWorkflowMutation(user, false, async (tx, afterCommit) => {
    await recordPublication(tx, user, { id: field(form,"id"), expectedUpdatedAt: field(form,"expectedUpdatedAt"), publishedUrl: fieldOrNull(form,"publishedUrl"), scheduledDate: dateField(form,"scheduledDate") });
    afterCommit(() => invalidateDomain("content"));
  });
}
