"use client";

import { useEffect } from "react";

/**
 * Último recinto: se usa cuando falla algo tan arriba que ni el layout con
 * sesión se pudo montar. Tiene que traer su propio <html> y <body>, y no puede
 * apoyarse en los estilos de la aplicación.
 */
export default function ErrorGlobal({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[marketing-os][global]", error);
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0d",
          color: "#f2f2f5",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
            La aplicación no pudo arrancar
          </h1>
          {/*
            Son dos causas, no una, y hay que nombrar las dos: nombrar solo la
            base de datos manda a revisar el sitio equivocado la mitad de las
            veces. Al publicar por primera vez suelen faltar ambas.
          */}
          <p style={{ fontSize: 13.5, lineHeight: 1.7, color: "#b4b6c4", marginTop: 10 }}>
            Casi siempre es una variable de entorno que falta en el servidor.
          </p>
          <ul
            style={{
              fontSize: 13,
              lineHeight: 1.65,
              color: "#b4b6c4",
              marginTop: 12,
              textAlign: "left",
              paddingLeft: 18,
            }}
          >
            <li>
              <code>DATABASE_URL</code> — tiene que apuntar a una base PostgreSQL
              accesible, y el esquema tiene que estar creado ahí.
            </li>
            <li style={{ marginTop: 6 }}>
              <code>AUTH_SECRET</code> — obligatoria en producción. Sin ella la
              aplicación se niega a arrancar a propósito, para no firmar las sesiones
              con una clave que está escrita en el código.
            </li>
          </ul>
          <button
            onClick={reset}
            style={{
              marginTop: 18,
              padding: "9px 16px",
              borderRadius: 9,
              border: "none",
              background: "#8b83ff",
              color: "#0a0a0d",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
          {error.digest ? (
            <p style={{ fontSize: 11, color: "#7c7e91", marginTop: 16 }}>
              Código del error: {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
