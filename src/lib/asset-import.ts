import type { AppTransaction } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";
import { auditInTransaction } from "@/lib/audit";
import { assertActor } from "@/lib/auth-transactions";
import { assertAssetOwner, validateAssetContent } from "@/lib/asset-security";
import { attachPrivateFile, privateStorageEnabled, stagePrivateFile } from "@/lib/private-storage";
import { extractAnyText, limpiarSiEsDocumentoAiMunay, MAX_UPLOAD_BYTES } from "@/lib/pdf";
import { ETIQUETA_DOCUMENTO, redactarDatosSensibles, type TipoDocumento } from "@/lib/branding-parser";

/**
 * Lectura y guardado de archivos que entran por Server Action.
 *
 * Vive fuera de src/app/actions a propósito: un archivo «use server» convierte
 * cada export en un endpoint, y un helper que recibe la transacción y el
 * usuario nunca debe poder llamarse desde el navegador.
 *
 * Lo usan uploadAsset (pestaña Documentos) y las acciones que guardan el brief
 * maestro o el informe de branding junto con la ficha, para que el Asset se
 * cree siempre igual: validado, con texto extraído y con auditoría SUBIR.
 *
 * El almacenamiento privado sigue el contrato en dos pasos: el archivo se
 * escribe en el Blob (`prepararArchivoPrivado`) FUERA de la transacción, con
 * inventario y verificación, y el Asset lo adjunta DENTRO. Con blob no se
 * guardan los bytes en la fila (`data` null); sin blob, se guardan como antes.
 */

export type ArchivoImportado = {
  name: string;
  size: number;
  mimeType: string;
  buffer: ArrayBuffer;
  /**
   * Texto extraído o null si no se pudo leer. Si es un brief maestro o un
   * informe de branding viene limpio (encabezados juntos, sin marcadores de
   * página); cualquier otro documento conserva sus párrafos.
   */
  texto: string | null;
  errorExtraccion: string | null;
};

export type LecturaArchivo = { ok: true; archivo: ArchivoImportado } | { ok: false; error: string };

/** Valida tamaño y estructura del archivo y extrae su texto. No escribe nada. */
export async function leerArchivoImportado(file: unknown): Promise<LecturaArchivo> {
  if (!(file instanceof File) || !file.size) return { ok: false, error: "Elige un archivo antes de continuar." };
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "El archivo pesa demasiado. El máximo son 4 MB: comprime el PDF o pega el texto a mano." };
  }
  const buffer = await file.arrayBuffer();
  let mimeType: string;
  try {
    mimeType = validateAssetContent(file.name, new Uint8Array(buffer));
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "El archivo no es válido." };
  }
  // pdf.js transfiere el ArrayBuffer a su worker y lo deja «detached»: se le pasa una copia
  // para que el original siga sirviendo al guardar el Asset.
  const extraction = await extractAnyText(buffer.slice(0), mimeType, file.name);
  return {
    ok: true,
    archivo: {
      name: file.name,
      size: file.size,
      mimeType,
      buffer,
      texto: extraction.text ? limpiarSiEsDocumentoAiMunay(extraction.text) : null,
      errorExtraccion: extraction.error,
    },
  };
}

/** Lee el archivo de un campo del formulario solo si viene uno. */
export async function leerArchivoOpcional(form: FormData, campo: string): Promise<LecturaArchivo | null> {
  const file = form.get(campo);
  if (!(file instanceof File) || !file.size) return null;
  return leerArchivoImportado(file);
}

/**
 * Sube los bytes al almacenamiento privado (inventario durable, SHA-256 y
 * tamaño verificados) y devuelve el id del blob, o null si el flag está
 * apagado y los bytes van a la fila. Hace red: SIEMPRE antes de la
 * transacción. Si luego la transacción falla, el objeto queda en STAGING y la
 * limpieza programada lo retira.
 */
export async function prepararArchivoPrivado(archivo: Pick<ArchivoImportado, "buffer">): Promise<string | null> {
  if (!privateStorageEnabled()) return null;
  return stagePrivateFile(new Uint8Array(archivo.buffer));
}

export type NuevoAsset = {
  ownerType: string;
  ownerId: string;
  archivo: Pick<ArchivoImportado, "name" | "size" | "mimeType" | "buffer">;
  /** Id devuelto por prepararArchivoPrivado, o null para guardar los bytes en la fila. */
  blobId: string | null;
  label: string | null;
  user: SessionUser;
  extractedText: string | null;
  useForAi: boolean;
};

/** Crea el Asset dentro de la transacción y deja la auditoría SUBIR en la misma. */
export async function crearAssetDesdeArchivo(tx: AppTransaction, input: NuevoAsset): Promise<{ id: string }> {
  await assertActor(tx, input.user);
  await assertAssetOwner(tx, input.ownerType, input.ownerId, input.user, true);
  if (input.blobId) await attachPrivateFile(tx, input.blobId);
  const asset = await tx.asset.create({
    data: {
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      filename: input.archivo.name,
      mimeType: input.archivo.mimeType,
      size: input.archivo.size,
      // `data` o `blobId`, nunca ambos ni ninguno.
      data: input.blobId ? null : Buffer.from(input.archivo.buffer),
      blobId: input.blobId,
      label: input.label,
      extractedText: input.extractedText,
      useForAi: input.useForAi,
      uploadedById: input.user.id,
    },
    select: { id: true },
  });
  await auditInTransaction(tx, {
    user: input.user,
    action: "SUBIR",
    entity: "Asset",
    entityId: asset.id,
    brandId: input.ownerType === "brand" ? input.ownerId : null,
    summary: `Subió el archivo "${input.label ?? input.archivo.name}"`,
  });
  return asset;
}

/**
 * Qué texto se guarda del documento para que la IA lo use como referencia.
 * El brief lleva RUC, teléfonos, correos y ventas: se guarda redactado.
 */
export function textoDeReferencia(tipo: TipoDocumento, archivo: ArchivoImportado): {
  extractedText: string | null;
  useForAi: boolean;
  aviso: string | null;
} {
  if (!archivo.texto) {
    return { extractedText: null, useForAi: false, aviso: archivo.errorExtraccion };
  }
  if (tipo === "brief") {
    const { texto, redactado } = redactarDatosSensibles(archivo.texto);
    return {
      extractedText: texto,
      useForAi: true,
      aviso: redactado
        ? "Se ocultaron RUC, razón social, teléfonos, correos, números del negocio y ventas del texto que se guarda para la IA."
        : null,
    };
  }
  return { extractedText: archivo.texto, useForAi: true, aviso: null };
}

/** Un documento leído y ya subido al almacenamiento privado (o no, si el flag está apagado). */
export type DocumentoPreparado = { tipo: TipoDocumento; archivo: ArchivoImportado; blobId: string | null };

/** Crea el Asset del documento importado con su etiqueta fija. */
export async function guardarDocumentoImportado(
  tx: AppTransaction,
  input: { tipo: TipoDocumento; ownerType: string; ownerId: string; archivo: ArchivoImportado; blobId: string | null; user: SessionUser }
): Promise<{ id: string }> {
  const referencia = textoDeReferencia(input.tipo, input.archivo);
  return crearAssetDesdeArchivo(tx, {
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    archivo: input.archivo,
    blobId: input.blobId,
    label: ETIQUETA_DOCUMENTO[input.tipo],
    user: input.user,
    extractedText: referencia.extractedText,
    useForAi: referencia.useForAi,
  });
}
