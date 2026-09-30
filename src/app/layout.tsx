import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "ALSOS · Ideas que se publican", template: "%s · ALSOS" },
  applicationName: "ALSOS",
  // Solo el nombre en la pantalla de inicio de iOS: sin «capable», que Next activa por defecto
  // y abriría la app en modo independiente (fuera del navegador, con la entrada de Google aparte).
  appleWebApp: { title: "ALSOS", capable: false },
  description:
    "Calendario de contenido, guiones con IA y métricas para múltiples marcas.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Con el teclado virtual abierto, Chrome en Android reduce el viewport en
  // vez de taparlo: así la tarjeta de la guía nunca queda debajo del teclado.
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6f7" },
    { media: "(prefers-color-scheme: dark)", color: "#1b1e22" },
  ],
};

/**
 * Se aplica el tema antes de pintar para que no haya parpadeo blanco
 * al entrar con el tema oscuro activo.
 */
const themeScript = `
(function(){
  try {
    var saved = localStorage.getItem('mos-theme');
    var dark = saved ? saved === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
