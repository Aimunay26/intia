import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";

import { buildAuthUrl, getGoogleConfig, GOOGLE_STATE_COOKIE } from "@/lib/google";

/** Paso 1: manda a la persona a Google. */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const config = await getGoogleConfig();

  if (!config) {
    return NextResponse.redirect(
      new URL("/login?error=google_no_configurado", origin),
      { status: 303 }
    );
  }

  // El `state` protege contra que alguien monte el enlace de vuelta desde fuera.
  const state = randomBytes(24).toString("base64url");
  const jar = await cookies();
  jar.set(GOOGLE_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60,
  });

  return NextResponse.redirect(buildAuthUrl(config, origin, state), { status: 303 });
}
