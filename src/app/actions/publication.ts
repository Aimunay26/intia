"use server";
import { requirePermission } from "@/lib/auth";
import { assertContentAccess, assertPublishable } from "@/lib/access-scope";
import { lockRevision, withMutation } from "@/lib/mutations";
import { field, fieldOrNull, dateField } from "@/lib/utils";
import { auditInTransaction, diffFields } from "@/lib/audit";
import { revalidatePath } from "next/cache";

export async function guardarPublicacion(form: FormData) {
  const user = await requirePermission("content.publish");
  await withMutation(user, false, async (tx, afterCommit) => {
    const id = field(form, "id");
    await assertContentAccess(tx, user, id, "content.publish");
    await lockRevision(tx, "ContentItem", id, form);
    const before = await tx.contentItem.findUniqueOrThrow({ where: { id } });
    await assertPublishable(tx, user, id);
    const publishedUrl = fieldOrNull(form, "publishedUrl");
    if (publishedUrl && (!URL.canParse(publishedUrl) || !["https:", "http:"].includes(new URL(publishedUrl).protocol))) throw new Error("El enlace debe ser una dirección web válida.");
    const data = { publishedUrl, scheduledDate: dateField(form, "scheduledDate") ?? before.scheduledDate };
    await tx.contentItem.update({ where: { id }, data });
    await auditInTransaction(tx, { user, action: "EDITAR", entity: "ContentItem", entityId: id, brandId: before.brandId, summary: `Actualizó la publicación de "${before.title}"`, changes: diffFields(before, data) });
    afterCommit(() => { revalidatePath(`/contenido/${id}`); revalidatePath("/calendario"); revalidatePath("/contenido"); });
  });
}
