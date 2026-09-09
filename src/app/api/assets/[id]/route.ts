import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { assertAssetOwner, assetDownloadHeaders } from "@/lib/asset-security";

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
  const asset = await prisma.asset.findUnique({ where: { id } });
  if (!asset) {
    return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
  }
  try { await assertAssetOwner(prisma, asset.ownerType, asset.ownerId, session); }
  catch { return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 }); }

  const body = new Uint8Array(asset.data);

  return new NextResponse(body, {
    headers: assetDownloadHeaders(asset.filename, body.byteLength),
  });
}
