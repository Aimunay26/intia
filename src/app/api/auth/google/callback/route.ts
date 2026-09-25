import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";
import { consumeAccessAttempt } from "@/lib/auth-rate-limit";
import { withAuthLock } from "@/lib/auth-transactions";
import { auditInTransaction, logAudit } from "@/lib/audit";
import { exchangeCodeForProfile, getGoogleConfig, GOOGLE_STATE_COOKIE } from "@/lib/google";

/** Paso 2 y 3: Google devuelve el código, se valida y se abre la sesión. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const volverConError = (codigo: string) =>
    NextResponse.redirect(new URL(`/login?error=${codigo}`, origin), { status: 303 });

  // El `state` es de un solo uso: se lee y se borra ANTES de cualquier salida.
  // Si se dejara vivo al cancelar o al llegar incompleto, ese mismo valor —que
  // ya viajó en la URL— seguiría sirviendo para forjar una vuelta falsa.
  const jar = await cookies();
  const esperado = jar.get(GOOGLE_STATE_COOKIE)?.value;
  jar.delete(GOOGLE_STATE_COOKIE);

  // Si la persona canceló en la pantalla de Google.
  if (url.searchParams.get("error")) return volverConError("google_cancelado");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return volverConError("google_incompleto");

  if (!esperado || esperado !== state) return volverConError("google_state");
  if (!await consumeAccessAttempt("google")) return volverConError("acceso_limitado");

  const config = await getGoogleConfig().catch(() => {
    console.error("[google] No se pudo abrir la configuración de acceso.");
    return null;
  });
  if (!config) return volverConError("google_no_configurado");

  let perfil;
  try {
    perfil = await exchangeCodeForProfile(config, origin, code);
  } catch {
    console.error("[google] Falló el intercambio de autorización.");
    return volverConError("google_fallo");
  }

  if (!perfil.emailVerified) return volverConError("google_sin_verificar");

  // Entrar con Google NO crea cuentas: solo deja pasar a quien ya está
  // dado de alta en el equipo. Las altas las hace el dueño desde /equipo.
  const user =
    (await prisma.user.findUnique({ where: { googleId: perfil.sub } })) ??
    (await prisma.user.findUnique({ where: { email: perfil.email } }));

  if (!user) return volverConError("google_sin_cuenta");
  if (!user.active) return volverConError("cuenta_desactivada");

  // Si esa persona ya tiene enlazada OTRA cuenta de Google, no se entra por
  // coincidencia de correo: sería la puerta para colarse en la cuenta ajena
  // si alguien consigue una dirección de Google igual a la del equipo.
  if (user.googleId && user.googleId !== perfil.sub) {
    return volverConError("google_otra_cuenta");
  }

  const sesion = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    color: user.color,
    archetypeId: user.archetypeId,
  };

  // Se enlaza la cuenta de Google la primera vez, para que las siguientes
  // entradas funcionen aunque cambie el correo. Es una escritura sobre el
  // usuario, así que queda firmada como cualquier otra.
  if (!user.googleId) {
    try { await withAuthLock(async tx => {
      const current = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      if (!current.active || current.sessionVersion !== user.sessionVersion || (current.googleId && current.googleId !== perfil.sub)) throw new Error("El acceso cambió durante la entrada con Google.");
      await tx.user.update({ where: { id: user.id }, data: { googleId: perfil.sub, avatarUrl: user.avatarUrl ?? perfil.picture } });
      await auditInTransaction(tx, {
      user: sesion,
      action: "EDITAR",
      entity: "User",
      entityId: user.id,
      summary: `${user.name} enlazó su cuenta de Google (${perfil.email})`,
      });
    }); } catch { return volverConError("google_fallo"); }
  }

  try { await createSession(user.id, user.sessionVersion); }
  catch { return volverConError("google_fallo"); }
  await logAudit({
    user: sesion,
    action: "LOGIN",
    entity: "Auth",
    entityId: user.id,
    summary: `${user.name} inició sesión con Google`,
  });

  return NextResponse.redirect(new URL("/", origin), { status: 303 });
}
