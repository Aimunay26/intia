"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireLevel, LEVEL } from "@/lib/auth";
import { auditInTransaction, diffFields } from "@/lib/audit";
import { assertActor } from "@/lib/auth-transactions";
import { assertAssetOwner, validateAssetContent } from "@/lib/asset-security";
import { extractAnyText, MAX_UPLOAD_BYTES } from "@/lib/pdf";
import { field, fieldOrNull } from "@/lib/utils";
export type AssetState = { ok?: string; error?: string; warning?: string } | null;
function refresh(type: string, id: string) {
  const base: Record<string, string> = { brand: "/marcas", content: "/contenido", structure: "/estructuras", archetype: "/arquetipos", user: "/equipo" };
  if (base[type]) revalidatePath(type === "user" ? base[type] : `${base[type]}/${id}`);
  revalidatePath("/actividad");
}

export async function uploadAsset(_prev: AssetState, form: FormData): Promise<AssetState> {
  const user = await requireLevel(LEVEL.MEMBER);
  const ownerType = field(form, "ownerType"), ownerId = field(form, "ownerId"), label = fieldOrNull(form, "label"), file = form.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Elige un archivo antes de subir." };
  if (file.size > MAX_UPLOAD_BYTES) return { error: "El archivo pesa demasiado. El máximo son 4 MB." };
  if ((label?.length ?? 0) > 200) return { error: "El nombre visible no puede superar 200 caracteres." };
  let mimeType: string;
  const buffer = await file.arrayBuffer();
  try {
    await assertAssetOwner(prisma, ownerType, ownerId, user, true);
    mimeType = validateAssetContent(file.name, new Uint8Array(buffer));
  } catch (error) { return { error: error instanceof Error ? error.message : "El archivo no es válido." }; }
  const extraction = await extractAnyText(buffer, mimeType, file.name);
  await prisma.$transaction(async tx => {
    await assertActor(tx, user);
    await assertAssetOwner(tx, ownerType, ownerId, user, true);
    const asset = await tx.asset.create({ data: { ownerType, ownerId, filename: file.name, mimeType, size: file.size, data: Buffer.from(buffer), label, extractedText: extraction.text, useForAi: Boolean(extraction.text), uploadedById: user.id } });
    await auditInTransaction(tx, { user, action: "SUBIR", entity: "Asset", entityId: asset.id, brandId: ownerType === "brand" ? ownerId : null, summary: `Subió el archivo "${label ?? file.name}"` });
  });
  refresh(ownerType, ownerId);
  return { ok: "Archivo guardado.", ...(extraction.error ? { warning: extraction.error } : {}) };
}
export async function deleteAsset(form: FormData) {
  const user = await requireLevel(LEVEL.OWNER), id = field(form, "id");
  const owner = await prisma.$transaction(async tx => {
    await assertActor(tx, user, true);
    const asset = await tx.asset.findUniqueOrThrow({ where: { id }, select: { id: true, filename: true, label: true, ownerType: true, ownerId: true } });
    await assertAssetOwner(tx, asset.ownerType, asset.ownerId, user, true);
    await tx.asset.delete({ where: { id } });
    await auditInTransaction(tx, { user, action: "ELIMINAR", entity: "Asset", entityId: id, summary: `Eliminó el archivo "${asset.label ?? asset.filename}"` });
    return asset;
  });
  refresh(owner.ownerType, owner.ownerId);
}
export async function toggleAssetAi(form: FormData) {
  const user = await requireLevel(LEVEL.MEMBER), id = field(form, "id"), useForAi = form.get("useForAi") === "on";
  const owner = await prisma.$transaction(async tx => {
    await assertActor(tx, user);
    const asset = await tx.asset.findUniqueOrThrow({ where: { id }, select: { filename: true, label: true, ownerType: true, ownerId: true, useForAi: true } });
    await assertAssetOwner(tx, asset.ownerType, asset.ownerId, user, true);
    if (asset.useForAi !== useForAi) {
      await tx.asset.update({ where: { id }, data: { useForAi } });
      await auditInTransaction(tx, { user, action: "EDITAR", entity: "Asset", entityId: id, summary: `${useForAi ? "Activó" : "Desactivó"} "${asset.label ?? asset.filename}" como referencia para la IA`, changes: diffFields(asset, { useForAi }, { useForAi: "Se usa para la IA" }) });
    }
    return asset;
  });
  refresh(owner.ownerType, owner.ownerId);
}
export async function updateAssetText(form: FormData) {
  const user = await requireLevel(LEVEL.MEMBER), id = field(form, "id"), text = field(form, "extractedText");
  if (text.length > 200_000) throw new Error("El texto no puede superar 200.000 caracteres.");
  const owner = await prisma.$transaction(async tx => {
    await assertActor(tx, user);
    const asset = await tx.asset.findUniqueOrThrow({ where: { id }, select: { filename: true, label: true, ownerType: true, ownerId: true, extractedText: true, useForAi: true } });
    await assertAssetOwner(tx, asset.ownerType, asset.ownerId, user, true);
    const data = { extractedText: text || null, useForAi: text.length > 0 };
    const changes = diffFields(asset, data, { extractedText: "Texto de referencia", useForAi: "Se usa para la IA" });
    if (changes) {
      await tx.asset.update({ where: { id }, data });
      await auditInTransaction(tx, { user, action: "EDITAR", entity: "Asset", entityId: id, summary: `Editó el texto de referencia de "${asset.label ?? asset.filename}"`, changes });
    }
    return asset;
  });
  refresh(owner.ownerType, owner.ownerId);
}
