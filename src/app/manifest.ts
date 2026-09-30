import type { MetadataRoute } from "next";

/**
 * Manifiesto de ALSOS: nombre e íconos al guardar la app en la pantalla de inicio.
 * Se abre en el navegador (no como app independiente) para no alterar la entrada con Google.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ALSOS",
    short_name: "ALSOS",
    description: "Calendario de contenido, guiones con IA y métricas para múltiples marcas.",
    lang: "es",
    start_url: "/",
    display: "browser",
    background_color: "#f5f6f7",
    theme_color: "#f5f6f7",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
