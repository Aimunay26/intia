"use server";

import { requireLevel, LEVEL } from "@/lib/auth";
import { leerArchivoImportado } from "@/lib/asset-import";
import { extraerFicha, type ResultadoExtraccion } from "@/lib/ai/extractor";
import { field } from "@/lib/utils";
import type { TipoDocumento } from "@/lib/branding-parser";

/**
 * Previsualización de un brief maestro o de un informe de branding.
 *
 * Es una acción de SOLO LECTURA: no crea el Asset ni toca Brand/Archetype.
 * Devuelve los campos propuestos con su origen (PDF / IA / vacío) y los
 * avisos, y la pantalla decide qué aplicar. Escribir es cosa del submit
 * normal del formulario (crearMarca, actualizarMarca, crearArquetipo…), que
 * es el que audita.
 */

export type Previsualizacion =
  | {
      ok: true;
      nombreArchivo: string;
      tipoPedido: TipoDocumento;
      resultado: ResultadoExtraccion;
    }
  | { ok: false; error: string };

export async function previsualizarDocumento(formData: FormData): Promise<Previsualizacion> {
  await requireLevel(LEVEL.MEMBER);

  const tipoCrudo = field(formData, "tipo");
  const tipo: TipoDocumento = tipoCrudo === "brief" ? "brief" : "branding";

  const lectura = await leerArchivoImportado(formData.get("file"));
  if (!lectura.ok) return { ok: false, error: lectura.error };

  const { archivo } = lectura;
  if (!archivo.texto || archivo.texto.trim().length < 50) {
    return {
      ok: false,
      error:
        archivo.errorExtraccion ??
        "El PDF no tiene texto legible (parece escaneado). Puedes subirlo igual en la pestaña Documentos y pegar el texto a mano.",
    };
  }

  const resultado = await extraerFicha({ tipo, text: archivo.texto });
  return { ok: true, nombreArchivo: archivo.name, tipoPedido: tipo, resultado };
}
