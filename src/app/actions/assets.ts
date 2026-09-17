"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireLevel, LEVEL } from "@/lib/auth";
import { auditInTransaction, diffFields } from "@/lib/audit";
import { lockRevision, withMutation } from "@/lib/mutations";
import { assertActor } from "@/lib/auth-transactions";
import { assertAssetOwner } from "@/lib/asset-security";
import { crearAssetDesdeArchivo, leerArchivoImportado, prepararArchivoPrivado, textoDeReferencia } from "@/lib/asset-import";
import { detectarTipoDocumento } from "@/lib/branding-parser";
import { field, fieldOrNull } from "@/lib/utils";
export type AssetState = { ok?: string; error?: string; warning?: string } | null;
function refresh(type: string, id: string) {
  const base: Record<string, string> = { brand: "/marcas", content: "/contenido", structure: "/estructuras", archetype: "/arquetipos", user: "/equipo" };
  if (base[type]) revalidatePath(type === "user" ? base[type] : `${base[type]}/${id}`);
  revalidatePath("/actividad");
  if (type === "user") revalidatePath("/mi-perfil");
}

export async function uploadAsset(_prev: AssetState, form: FormData): Promise<AssetState> {
  const user = await requireLevel(LEVEL.MEMBER);
  const ownerType = field(form, "ownerType"), ownerId = field(form, "ownerId"), label = fieldOrNull(form, "label");
  if ((label?.length ?? 0) > 200) return { error: "El nombre visible no puede superar 200 caracteres." };
  try { await assertAssetOwner(prisma, ownerType, ownerId, user, true); }
  catch (error) { return { error: error instanceof Error ? error.message : "El archivo no es válido." }; }
  const lectura = await leerArchivoImportado(form.get("file"));
  if (!lectura.ok) return { error: lectura.error };
  const { archivo } = lectura;
  // Misma regla que al cargar desde Identidad: si lo que entra es el brief
  // maestro, el texto que ve la IA se guarda redactado (RUC, teléfonos,
  // correos, ventas). Cualquier otro documento se guarda tal cual.
  const tipo = archivo.texto ? detectarTipoDocumento(archivo.texto) : null;
  const ref = tipo
    ? textoDeReferencia(tipo, archivo)
    : { extractedText: archivo.texto, useForAi: Boolean(archivo.texto), aviso: null };
  // El Blob privado se escribe y verifica ANTES de la transacción; dentro solo se adjunta.
  let blobId: string | null = null;
  try { blobId = await prepararArchivoPrivado(archivo); }
  catch (error) { return { error: error instanceof Error ? error.message : "No se pudo guardar el archivo." }; }
  await prisma.$transaction(async tx => {
    await crearAssetDesdeArchivo(tx, { ownerType, ownerId, archivo, blobId, label, user, extractedText: ref.extractedText, useForAi: ref.useForAi });
  });
  refresh(ownerType, ownerId);
  const warning = [archivo.errorExtraccion, ref.aviso].filter((a): a is string => Boolean(a)).join(" ");
  return { ok: "Archivo guardado.", ...(warning ? { warning } : {}) };
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
  const owner = await withMutation(user, false, async tx => {
        const asset = await tx.asset.findUniqueOrThrow({ where: { id }, select: { filename: true, label: true, ownerType: true, ownerId: true, useForAi: true } });
    await assertAssetOwner(tx, asset.ownerType, asset.ownerId, user, true);
    await lockRevision(tx, "Asset", id, form);
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
  const owner = await withMutation(user, false, async tx => {
        const asset = await tx.asset.findUniqueOrThrow({ where: { id }, select: { filename: true, label: true, ownerType: true, ownerId: true, extractedText: true, useForAi: true } });
    await assertAssetOwner(tx, asset.ownerType, asset.ownerId, user, true);
    await lockRevision(tx, "Asset", id, form);
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
