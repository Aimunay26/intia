"use client";

import { useLinkStatus } from "next/link";
import { LoaderCircle } from "lucide-react";

/** Debe estar dentro de Link para observar su transición, incluida la cancelación. */
export function NavigationPending() {
  const { pending } = useLinkStatus();
  return (
    <span className="ml-auto flex w-3.5 shrink-0 items-center" role="status" aria-live="polite" data-navigation-pending={pending}>
      {pending ? (
        <>
          <LoaderCircle size={14} className="spin navigation-spinner" aria-hidden="true" />
          <span className="sr-only">Cargando sección…</span>
        </>
      ) : null}
    </span>
  );
}
