"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { comprobarAccesoSesion } from "@/app/actions/session-access";

/** Actualiza menú y página con permisos frescos; las acciones se autorizan siempre en servidor. */
export function SessionAccessRefresh({ accessKey }: { accessKey: string }) {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    let disposed = false, checking = false, lastCheck = 0;
    async function check() {
      if (document.hidden || checking || Date.now() - lastCheck < 1000) return;
      checking = true;
      lastCheck = Date.now();
      try {
        const current = await comprobarAccesoSesion();
        if (!disposed && current !== accessKey) router.refresh();
      } catch {
        // Un fallo de red no borra el formulario ni cierra la sesión. Se comprueba de nuevo después.
      } finally { checking = false; }
    }
    void check();
    const timer = setInterval(() => { void check(); }, 30_000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      disposed = true;
      clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [accessKey, pathname, router]);
  return null;
}
