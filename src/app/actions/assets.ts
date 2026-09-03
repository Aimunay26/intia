"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireLevel, LEVEL } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { extractAnyText, MAX_UPLOAD_BYTES } from "@/lib/pdf";
import { field, fieldOrNull } from "@/lib/utils";

export type AssetState = { ok?: string; error?: string; warning?: string } | null;

const OWNER_PATHS: Record<string, (id: string) => string> = {
  structure: (id) => `/estructuras/${id}`,
  archetype: (id) => `/arquetipos/${id}`,
  brand: (id) => `/marcas/${id}`,
  content: (id) => `/contenido/${id}`,
  user: () => `/equipo`,
};

const OWNER_LABELS: Record<string, string> = {
  structure: "la estructura",
  archetype: "el arquetipo",
  brand: "la marca",
  content: "el video",
  user: "el usuario",
};

function revalidateOwner(ownerType: string, ownerId: string) {
  const path = OWNER_PATHS[ownerType]?.(ownerId);
  if (path) revalidatePath(path);
}

/* ----------------------------------------------------------------- SUBIR -- */

export async function uploadAsset(_prev: AssetState, formData: FormData): Promise<AssetState> {
  const user = await requireLevel(LEVEL.MEMBER);

  const ownerType = field(formData, "ownerType");
  const ownerId = field(formData, "ownerId");
  const label = fieldOrNull(formData, "label");
  const file = formData.get("file");

  if (!ownerType || !ownerId) return { error: "Falta indicar a qué pertenece el archivo." };
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Elige un archivo antes de subir." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      error:
        "El archivo pesa demasiado. El máximo son 4 MB. Si es un PDF grande, " +
        "recórtalo o pega solo el texto que te interesa desde el botón de editar.",
    };
  }

  const buffer = await file.arrayBuffer();
  const extraction = await extractAnyText(buffer, file.type, file.name);

  const asset = await prisma.asset.create({
    data: {
      ownerType,
      ownerId,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      data: Buffer.from(buffer),
      label,
      extractedText: extraction.text,
      useForAi: Boolean(extraction.text),
      uploadedById: user.id,
    },
  });

  await logAudit({
    user,
    action: "SUBIR",
    entity: "Asset",
    entityId: asset.id,
    brandId: ownerType === "brand" ? ownerId : null,
    summary: `Subió "${label ?? file.name}" a ${OWNER_LABELS[ownerType] ?? ownerType}`,
  });

  revalidateOwner(ownerType, ownerId);

  if (extraction.error) {
    return {
      ok: "Archivo guardado.",
      warning: extraction.error,
    };
  }
  return {
    ok: `Listo. Se extrajeron ${extraction.text?.length.toLocaleString("es-PE")} caracteres${
      extraction.pages ? ` de ${extraction.pages} páginas` : ""
    }. Ya se le pasan a la IA.`,
  };
}

/* -------------------------------------------------------------- ELIMINAR -- */

export async function deleteAsset(formData: FormData) {
  const user = await requireLevel(LEVEL.OWNER);
  const id = field(formData, "id");

  const asset = await prisma.asset.findUnique({
    where: { id },
    select: { id: true, filename: true, label: true, ownerType: true, ownerId: true },
  });
  if (!asset) return;

  await prisma.asset.delete({ where: { id } });

  await logAudit({
    user,
    action: "ELIMINAR",
    entity: "Asset",
    entityId: id,
    summary: `Eliminó el archivo "${asset.label ?? asset.filename}"`,
  });

  revalidateOwner(asset.ownerType, asset.ownerId);
}

/* ------------------------------------------------------------ ACTUALIZAR -- */

/** Enciende o apaga el envío de este documento a la IA. */
export async function toggleAssetAi(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);
  const id = field(formData, "id");
  const useForAi = formData.get("useForAi") === "on";

  const asset = await prisma.asset.update({
    where: { id },
    data: { useForAi },
    select: { filename: true, label: true, ownerType: true, ownerId: true },
  });

  await logAudit({
    user,
    action: "EDITAR",
    entity: "Asset",
    entityId: id,
    summary: `${useForAi ? "Activó" : "Desactivó"} "${asset.label ?? asset.filename}" como referencia para la IA`,
    // Es un interruptor: el estado anterior es siempre el contrario.
    changes: {
      useForAi: { etiqueta: "Se usa para la IA", antes: !useForAi, despues: useForAi },
    },
  });

  revalidateOwner(asset.ownerType, asset.ownerId);
}

/** Permite pegar a mano el texto cuando el PDF viene escaneado. */
export async function updateAssetText(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);
  const id = field(formData, "id");
  const text = field(formData, "extractedText");

  const antes = await prisma.asset.findUnique({
    where: { id },
    select: { extractedText: true },
  });

  const asset = await prisma.asset.update({
    where: { id },
    data: { extractedText: text || null, useForAi: text.length > 0 },
    select: { filename: true, label: true, ownerType: true, ownerId: true },
  });

  /**
   * El texto anterior puede llegar a 200.000 caracteres, y guardarlo entero en
   * cada edicion engordaria el log hasta hacerlo inservible. Se guarda acotado
   * y se marca cuando se paso del tope: asi el retroceso funciona en el caso
   * normal y en el extremo lo dice en vez de fingir que puede.
   */
  const TOPE = 20_000;
  const textoAntes = antes?.extractedText ?? "";
  const recortado = textoAntes.length > TOPE;

  await logAudit({
    user,
    action: "EDITAR",
    entity: "Asset",
    entityId: id,
    summary: `Editó el texto de referencia de "${asset.label ?? asset.filename}"`,
    changes: {
      extractedText: {
        etiqueta: recortado
          ? `Texto de referencia (el anterior era muy largo: ${textoAntes.length} caracteres, no se puede restaurar completo)`
          : "Texto de referencia",
        antes: recortado ? textoAntes.slice(0, TOPE) : textoAntes,
        despues: text,
      },
    },
  });

  revalidateOwner(asset.ownerType, asset.ownerId);
}
