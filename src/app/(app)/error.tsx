"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";

/**
 * Pantalla de error de las páginas con sesión.
 *
 * Hace falta porque negar permisos y validar datos se hace lanzando
 * excepciones (`requireLevel`, `crearVideo`…). Sin esto, un miembro del equipo
 * que intenta algo que no le toca vería una pantalla en blanco con un código.
 */
export default function ErrorDeLaApp({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[marketing-os]", error);
  }, [error]);

  // Los mensajes que lanza la propia aplicación son legibles y se muestran tal
  // cual. Los de la plataforma no dicen nada útil, así que se sustituyen.
  const esDePermisos = error.message.includes("permisos");
  const mensaje =
    error.message && error.message.length < 200 && !error.message.startsWith("An error occurred")
      ? error.message
      : "Algo falló al cargar esta pantalla.";

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="card max-w-[440px] p-6 text-center">
        <span
          className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl"
          style={{ background: "rgba(220,47,75,.1)", color: "var(--danger)" }}
        >
          <AlertTriangle size={21} />
        </span>

        <h1 className="text-ink text-[17px] font-bold tracking-tight">
          {esDePermisos ? "Esto no te toca a ti" : "Algo salió mal"}
        </h1>

        <p className="text-inksoft mt-2 text-[13.5px] leading-relaxed">
          {esDePermisos
            ? "Tu cuenta es del equipo: puedes crear, editar y mover, pero no eliminar. Pídele al dueño que lo haga."
            : mensaje}
        </p>

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button onClick={reset} className="btn">
            <RotateCcw size={14} /> Reintentar
          </button>
          <Link href="/" className="btn btn-primary">
            <Home size={14} /> Ir al panel
          </Link>
        </div>

        {error.digest ? (
          <p className="text-inkmuted mt-4 text-[11px]">
            Código del error: <code className="kbd">{error.digest}</code>
          </p>
        ) : null}
      </div>
    </div>
  );
}
