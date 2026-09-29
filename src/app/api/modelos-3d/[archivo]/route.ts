import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { manualEnabled } from "@/lib/manual";
import { esArchivoModelo3d, personajes3dEnabled, tipoModelo3d, type ArchivoModelo3d } from "@/lib/manual-3d";

export const dynamic = "force-dynamic";

/** Carpeta versionada (fuera de /public). next.config.ts la incluye en el paquete de esta ruta. */
const CARPETA = path.join(process.cwd(), "src", "content", "modelos-3d");
const CACHE_CONTROL = "private, max-age=604800, immutable";
const NO_STORE = { "Cache-Control": "no-store" };

type Leido = { body: Uint8Array<ArrayBuffer>; etag: string };

/**
 * Los archivos no cambian dentro de un despliegue: se leen y se hashean una vez por
 * instancia. Si la lectura falla, se olvida para que el siguiente pedido reintente.
 */
const leidos = new Map<ArchivoModelo3d, Promise<Leido>>();

function leer(archivo: ArchivoModelo3d): Promise<Leido> {
  let pendiente = leidos.get(archivo);
  if (!pendiente) {
    pendiente = readFile(path.join(CARPETA, archivo)).then(buffer => ({
      body: new Uint8Array(buffer),
      etag: `"${createHash("sha256").update(buffer).digest("base64url")}"`,
    }));
    pendiente.catch(() => leidos.delete(archivo));
    leidos.set(archivo, pendiente);
  }
  return pendiente;
}

/** If-None-Match admite varias etiquetas, débiles («W/») o «*». */
function coincide(ifNoneMatch: string | null, etag: string) {
  if (!ifNoneMatch) return false;
  return ifNoneMatch.split(",").some(item => {
    const tag = item.trim();
    return tag === "*" || tag === etag || tag === `W/${etag}`;
  });
}

/**
 * Personajes 3D del manual (modelos con derechos de terceros, solo uso interno).
 * Requiere sesión; con MANUAL_3D_PERSONAJES="false" o el manual apagado responde 404.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ archivo: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_STORE });
  }

  const { archivo } = await params;
  // La lista cerrada va antes que el disco: «../», mayúsculas u otros nombres nunca se leen.
  if (!personajes3dEnabled() || !manualEnabled() || !esArchivoModelo3d(archivo)) {
    return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404, headers: NO_STORE });
  }

  let leido: Leido;
  try {
    leido = await leer(archivo);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "desconocido";
    console.error(`[modelos-3d] no se pudo leer ${archivo}: ${code}`);
    return NextResponse.json({ error: "El modelo no está disponible en este momento." }, { status: 503, headers: { ...NO_STORE, "Retry-After": "60" } });
  }

  const headers = {
    "Cache-Control": CACHE_CONTROL,
    ETag: leido.etag,
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
  if (coincide(request.headers.get("if-none-match"), leido.etag)) {
    return new NextResponse(null, { status: 304, headers });
  }
  return new NextResponse(leido.body, {
    headers: {
      ...headers,
      "Content-Type": tipoModelo3d(archivo),
      "Content-Length": String(leido.body.byteLength),
      "Content-Disposition": `inline; filename="${archivo}"`,
    },
  });
}
