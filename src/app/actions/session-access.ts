"use server";

import { getSession } from "@/lib/auth";
import { sessionAccessKey } from "@/lib/session-access";

/** Consulta exclusivamente la sesión propia, sin identificadores enviados por el cliente. */
export async function comprobarAccesoSesion(): Promise<string | null> {
  const user = await getSession();
  return user ? sessionAccessKey(user) : null;
}
