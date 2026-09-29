import { NextResponse } from "next/server";

import { destroySession, getSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function POST(request: Request) {
  const user = await getSession();
  if (user) {
    await logAudit({
      user,
      action: "LOGOUT",
      entity: "Auth",
      entityId: user.id,
      summary: `${user.name} cerró sesión`,
    });
  }
  await destroySession();
  const response = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  // Vacía la caché HTTP del sitio en este navegador: lo que solo se entrega con sesión y se guarda en
  // caché privada (los personajes 3D de /api/modelos-3d, 7 días) deja de estar disponible al salir,
  // también en un equipo compartido. No toca cookies ni almacenamiento.
  response.headers.set("Clear-Site-Data", '"cache"');
  return response;
}
