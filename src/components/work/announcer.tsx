"use client";

import { Check } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

/**
 * Aviso de las acciones de la cadena de entregas que sobrevive a la tarjeta que lo originó.
 *
 * Tras un «Listo», un «Devolver», «Tomar paso» o «Aviso atendido» el servidor revalida la página
 * y la tarjeta del paso desaparece (ya no está pendiente, ya no está sin asignar…): si el
 * mensaje viviera dentro de ella, nadie lo vería. Aquí el mensaje vive en la sección (Mi trabajo,
 * el panel Producción, los Atascos de la Cadena), en una región `aria-live` que ya existe antes
 * del cambio, y el foco vuelve a su encabezado (`focusId`) para que el teclado y el lector de
 * pantalla no queden en el vacío. Solo estado de cliente, sin almacenamiento.
 */

type Announce = (message: string, opts?: { focus?: boolean }) => void;
type AnnouncerState = { message: string | null; announce: Announce };

const AnnouncerContext = createContext<AnnouncerState | null>(null);

export function StepAnnouncerProvider({ focusId, children }: { focusId?: string; children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const announce = useCallback<Announce>((text, opts = {}) => {
    setMessage(text);
    if (!opts.focus || !focusId) return;
    // Después del repintado: el encabezado sigue ahí aunque la tarjeta ya no.
    requestAnimationFrame(() => {
      const target = document.getElementById(focusId);
      if (!target) return;
      if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
      target.focus();
    });
  }, [focusId]);
  const value = useMemo(() => ({ message, announce }), [message, announce]);
  return <AnnouncerContext.Provider value={value}>{children}</AnnouncerContext.Provider>;
}

/** La región viva: vacía (pero presente) hasta el primer aviso. */
export function StepAnnouncement({ className }: { className?: string }) {
  const state = useContext(AnnouncerContext);
  const message = state?.message ?? null;
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className={message ? className : "sr-only"} data-step-announcement>
      {message ? (
        <p className="text-ok flex items-start gap-1.5 text-[12.5px] leading-snug font-semibold">
          <Check size={13} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>{message}</span>
        </p>
      ) : null}
    </div>
  );
}

/** null fuera de un proveedor: el botón muestra su aviso local, como antes. */
export function useStepAnnouncer(): Announce | null {
  return useContext(AnnouncerContext)?.announce ?? null;
}
