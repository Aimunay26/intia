/**
 * Seguro contra borrar la base de producción sin querer.
 *
 * Existe por un caso concreto y muy fácil de provocar: al publicar en Vercel,
 * `vercel env pull` sobrescribe el `.env` con la configuración de producción.
 * A partir de ese momento el `.env` de tu máquina apunta a la base real, y
 * `npm run db:reset` —que lleva `--force-reset`— borraría todo: los guiones,
 * las métricas, el equipo y el historial. Sin aviso y sin vuelta atrás.
 *
 * Este script corre ANTES de cualquier comando destructivo y lo detiene si la
 * base no es local.
 *
 *   node scripts/proteger-produccion.mjs
 *
 * Para saltárselo a propósito (y solo entonces):
 *   SI_QUIERO_BORRAR_PRODUCCION=1 npm run db:reset
 */

import fs from "node:fs";
import path from "node:path";

/** Lee DATABASE_URL del .env sin depender de que dotenv esté cargado. */
function leerUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const archivo = path.join(process.cwd(), ".env");
  if (!fs.existsSync(archivo)) return "";
  const m = fs.readFileSync(archivo, "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\n]+)/m);
  return m ? m[1] : "";
}

const url = leerUrl();

/** Es local si es un archivo SQLite o si el servidor está en esta máquina. */
function esLocal(u) {
  if (!u) return false;
  if (u.startsWith("file:")) return true;
  try {
    const host = new URL(u).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

if (esLocal(url)) process.exit(0);

if (process.env.SI_QUIERO_BORRAR_PRODUCCION === "1") {
  console.warn("\n  Saltando el seguro porque SI_QUIERO_BORRAR_PRODUCCION=1.\n");
  process.exit(0);
}

// Se muestra el host, nunca la contraseña.
let donde = "una base remota";
try {
  donde = new URL(url).hostname;
} catch {
  /* si no se puede leer, el aviso genérico basta */
}

console.error(`
  ────────────────────────────────────────────────────────────────
   DETENIDO: este comando BORRA TODOS LOS DATOS.

   Tu .env no apunta a una base local, apunta a:
     ${donde}

   Si esa es tu base de producción, ejecutarlo se llevaría los
   guiones, las métricas, el equipo y todo el historial.

   Si de verdad querías trabajar en local, revisa tu .env. Puede
   que "vercel env pull" te lo haya sobrescrito con el de producción;
   el original suele quedar en .env.respaldo.

   Si sabes lo que haces y aun así quieres continuar:
     SI_QUIERO_BORRAR_PRODUCCION=1 npm run db:reset
  ────────────────────────────────────────────────────────────────
`);

process.exit(1);
