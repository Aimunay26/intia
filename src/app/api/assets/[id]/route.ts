import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { assertAssetOwner, assetDownloadHeaders } from "@/lib/asset-security";
import { readPrivateFile } from "@/lib/private-storage";

/** Descarga de un archivo de referencia. Requiere sesión. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const asset = await prisma.asset.findUnique({ where: { id }, select: { id: true, ownerType: true, ownerId: true, filename: true, size: true, blobId: true, blob: { select: { pathname: true } } } });
  if (!asset) {
    return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
  }
  try { await assertAssetOwner(prisma, asset.ownerType, asset.ownerId, session); }
  catch { return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 }); }

  try {
    if (asset.blob) return new NextResponse(await readPrivateFile(asset.blob.pathname, asset.size), { headers: assetDownloadHeaders(asset.filename, asset.size) });
    const legacy = await prisma.asset.findUnique({ where: { id }, select: { data: true, size: true, blob: { select: { pathname: true } } } });
    // La migración pudo confirmar entre la autorización y la lectura de bytes.
    if (legacy?.blob) return new NextResponse(await readPrivateFile(legacy.blob.pathname, legacy.size), { headers: assetDownloadHeaders(asset.filename, legacy.size) });
    if (!legacy?.data) return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
    const body = new Uint8Array(legacy.data);
    return new NextResponse(body, { headers: assetDownloadHeaders(asset.filename, body.byteLength) });
  } catch { return NextResponse.json({ error: "La descarga no está disponible en este momento." }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "60" } }); }
}
