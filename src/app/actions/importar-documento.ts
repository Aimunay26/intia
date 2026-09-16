"use server";

import { requirePermission } from "@/lib/auth";
import type { Capability } from "@/lib/permissions";
import { leerArchivoImportado } from "@/lib/asset-import";
import { extraerFicha, type ResultadoExtraccion } from "@/lib/ai/extractor";
import { field } from "@/lib/utils";
import type { TipoDocumento } from "@/lib/branding-parser";
import { createHash } from "node:crypto";
import { createAiRequest } from "@/lib/ai/request-budget";
import { reserveUsage, usageDay } from "@/lib/resource-limits";
import { generationStage, withGenerationTrace } from "@/lib/generation-trace";

/**
 * Previsualización de un brief maestro o de un informe de branding.
 *
 * No crea el Asset ni toca Brand/Archetype; la mejora opcional registra su cupo.
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
  const user = await requirePermission(CAPACIDAD_POR_DESTINO[destino] ?? "brands.edit");
  const choice = field(formData, "aiProvider") || "local";
  if (!["local", "google", "anthropic"].includes(choice)) return { ok: false, error: "Elige lectura local, Gemini o Claude." };

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

  const provider = choice === "google" || choice === "anthropic" ? choice : undefined;
  const hash = createHash("sha256").update(Buffer.from(archivo.buffer)).digest("hex");
  const request = provider ? createAiRequest({ user, deadlineAt: Date.now() + 25000, authorize: async tx => {
    await reserveUsage(tx, `ai:document:${user.id}:${hash}:${provider}:${usageDay()}`, 1, 1);
  } }) : undefined;
  const resultado = await withGenerationTrace({ provider }, () => generationStage("document_extract", () => extraerFicha({ tipo, text: archivo.texto!, provider, request })));
  return { ok: true, nombreArchivo: archivo.name, tipoPedido: tipo, resultado };
}
