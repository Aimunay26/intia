import type { AppTransaction } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";
import { assertBrandPermission, assertPermission } from "@/lib/permissions";
import { archetypeScope, assertContentAccess, assertVideoOpen } from "@/lib/access-scope";

export function validateAssetContent(filename: string, bytes: Uint8Array): string {
  if (filename.length > 200 || /[\x00-\x1f\x7f/\\]/.test(filename)) throw new Error("El nombre del archivo no es válido.");
  const extension = filename.toLowerCase().split(".").at(-1);
  if (extension === "pdf") {
    const start = new TextDecoder().decode(bytes.slice(0, 16));
    const end = new TextDecoder().decode(bytes.slice(-2048));
    if (!/^%PDF-(1\.[0-7]|2\.0)/.test(start) || !end.includes("%%EOF")) throw new Error("El archivo no tiene una estructura PDF reconocible.");
    return "application/pdf";
  }
  if (!["txt", "md", "csv", "json"].includes(extension ?? "")) throw new Error("Solo se permiten PDF, TXT, MD, CSV y JSON.");
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new Error("El archivo de texto debe usar UTF-8."); }
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text) || /^\s*(?:<!doctype\s+html|<html\b|<svg\b|<script\b)/i.test(text)) throw new Error("El contenido no corresponde a un documento de texto permitido.");
  if (extension === "json") {
    try { JSON.parse(text); } catch { throw new Error("El archivo JSON no es válido."); }
    return "application/json";
  }
  return extension === "csv" ? "text/csv" : extension === "md" ? "text/markdown" : "text/plain";
}

export async function assertAssetOwner(db: AppTransaction, type: string, id: string, user: SessionUser, write = false) {
  if (!id || id.length > 128) throw new Error("El propietario del archivo no es válido.");
  if (type === "brand") assertBrandPermission(user, id, write ? "brands.edit" : "brands.view");
  else if (type === "content") {
    await assertContentAccess(db, user, id, write ? "assets.write" : "content.view");
    if (write) await assertVideoOpen(db, user, id);
  }
  else if (type === "structure") assertPermission(user, write ? "structures.edit" : "structures.view");
  else if (type === "archetype") {
    assertPermission(user, write ? "archetypes.edit" : "archetypes.view");
    if (!await db.archetype.count({ where: { AND: [{ id }, archetypeScope(user)] } })) throw new Error("No tienes acceso a esta persona.");
  } else if (type === "user") {
    assertPermission(user, id === user.id ? "profile.self" : "admin.team");
  } else throw new Error("Tipo de archivo no autorizado.");
  const select = { id: true } as const;
  const owner = type === "brand" ? await db.brand.findUnique({ where: { id }, select })
    : type === "content" ? await db.contentItem.findUnique({ where: { id }, select })
    : type === "structure" ? await db.structure.findUnique({ where: { id }, select })
    : type === "archetype" ? await db.archetype.findUnique({ where: { id }, select })
    : type === "user" ? await db.user.findUnique({ where: { id }, select }) : null;
  if (!owner || (write && type === "user" && id !== user.id && user.role !== "OWNER")) throw new Error("No puedes acceder al propietario de este archivo.");
}

export function assetDownloadHeaders(filename: string, size: number) {
  return {
    "Content-Type": "application/octet-stream", "Content-Length": String(size),
    "Content-Disposition": `attachment; filename="documento"; filename*=UTF-8''${encodeURIComponent(filename).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16)}`)}`,
    "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'; frame-ancestors 'none'",
    "X-Frame-Options": "DENY", "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer",
  };
}
