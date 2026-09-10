"use server";

import { requirePermission } from "@/lib/auth";
import type { Capability } from "@/lib/permissions";
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
 *
 * Aun así exige la capacidad de escribir en el destino (brands.edit para una
 * marca, archetypes.edit para una persona): leer el PDF no toca la base, pero
 * puede gastar una llamada de IA y devuelve el contenido del documento.
 */

const CAPACIDAD_POR_DESTINO: Record<string, Capability> = {
  marca: "brands.edit",
  persona: "archetypes.edit",
};

export type Previsualizacion =
  | {
      ok: true;
      nombreArchivo: string;
      tipoPedido: TipoDocumento;
      resultado: ResultadoExtraccion;
    }
  | { ok: false; error: string };

export async function previsualizarDocumento(formData: FormData): Promise<Previsualizacion> {
  const tipoCrudo = field(formData, "tipo");
  const tipo: TipoDocumento = tipoCrudo === "brief" ? "brief" : "branding";
  // Sin destino explícito se asume una persona (el informe de branding es lo
  // que más se importa); un brief solo tiene sentido para una marca.
  const destino = field(formData, "destino") || (tipo === "brief" ? "marca" : "persona");
  await requirePermission(CAPACIDAD_POR_DESTINO[destino] ?? "brands.edit");

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
