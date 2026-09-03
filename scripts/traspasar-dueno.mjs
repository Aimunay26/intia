/**
 * Traspasa la cuenta de dueño de una persona a otra, en tres tiempos seguros.
 *
 *   1. Da de alta (o asciende) al dueño nuevo.
 *   2. Comprueba que la contraseña quedó bien guardada, verificándola contra
 *      el hash recién escrito. Si no coincide, se detiene y NO toca nada más.
 *   3. Retira al dueño anterior, dejando el movimiento firmado por el nuevo.
 *
 * La contraseña se pasa por variable de entorno y NUNCA se escribe en el
 * archivo ni se imprime. Así no acaba en el repositorio ni en el historial de
 * una conversación, que es donde estas cosas se filtran de verdad.
 *
 * Uso (PowerShell):
 *   $env:DUENO_EMAIL="gerencia@ejemplo.com"
 *   $env:DUENO_NOMBRE="Nombre Visible"
 *   $env:DUENO_CLAVE="la-que-sea"
 *   $env:RETIRAR_A="antiguo@ejemplo.com"
 *   node -r dotenv/config scripts/traspasar-dueno.mjs
 *
 * Por defecto DESACTIVA al anterior en vez de borrarlo, que es lo reversible.
 * Para borrarlo del todo:  $env:BORRAR_DE_VERDAD="1"
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const EMAIL = (process.env.DUENO_EMAIL ?? "").trim().toLowerCase();
const NOMBRE = (process.env.DUENO_NOMBRE ?? "").trim();
const CLAVE = process.env.DUENO_CLAVE ?? "";
const RETIRAR_A = (process.env.RETIRAR_A ?? "").trim().toLowerCase();
const BORRAR = process.env.BORRAR_DE_VERDAD === "1";

function abortar(mensaje) {
  console.error(`\n  ${mensaje}\n`);
  process.exit(1);
}

const linea = () => console.log("  " + "─".repeat(58));

async function main() {
  if (!EMAIL || !NOMBRE) abortar("Faltan DUENO_EMAIL o DUENO_NOMBRE.");
  if (CLAVE.length < 8) {
    abortar("DUENO_CLAVE tiene que existir y medir 8 caracteres o más.");
  }
  if (CLAVE !== CLAVE.trim()) {
    abortar("La contraseña lleva espacios al principio o al final. Eso da problemas al pegarla: quítalos.");
  }

  const host = (() => {
    try {
      return new URL(process.env.DATABASE_URL).hostname;
    } catch {
      return process.env.DATABASE_URL ?? "(sin DATABASE_URL)";
    }
  })();

  console.log(`\n  Base: ${host}`);
  linea();

  /* --- 1. Alta o ascenso ------------------------------------------- */

  const hash = await bcrypt.hash(CLAVE, 10);
  const existente = await prisma.user.findUnique({ where: { email: EMAIL } });

  const nuevo = existente
    ? await prisma.user.update({
        where: { email: EMAIL },
        data: { name: NOMBRE, role: "OWNER", active: true, passwordHash: hash },
      })
    : await prisma.user.create({
        data: {
          name: NOMBRE,
          email: EMAIL,
          role: "OWNER",
          active: true,
          passwordHash: hash,
          color: "#6366f1",
        },
      });

  console.log(`  ${existente ? "Ascendido a dueño" : "Dueño creado"}: ${nuevo.name} <${nuevo.email}>`);

  /* --- 2. Verificar antes de tocar nada más ------------------------- */

  const recien = await prisma.user.findUnique({ where: { id: nuevo.id } });
  const sirve = await bcrypt.compare(CLAVE, recien.passwordHash);
  if (!sirve) {
    abortar("La contraseña NO verifica contra lo guardado. No se ha retirado a nadie.");
  }
  console.log("  Contraseña verificada contra el hash guardado.");

  /* --- 3. Retirar al anterior --------------------------------------- */

  if (!RETIRAR_A) {
    console.log("\n  No se indicó RETIRAR_A: no se retira a nadie.\n");
    return;
  }

  if (RETIRAR_A === EMAIL) abortar("RETIRAR_A y DUENO_EMAIL son el mismo correo.");

  const viejo = await prisma.user.findUnique({ where: { email: RETIRAR_A } });
  if (!viejo) {
    console.log(`\n  No existe ninguna cuenta con ${RETIRAR_A}. Nada que retirar.\n`);
    return;
  }

  // La misma red de seguridad que tiene la interfaz: nunca cero dueños. Si la
  // app se quedara sin ninguno, la pantalla de entrada volvería a ofrecer
  // "crea tu cuenta" a cualquiera que la abriese, y está publicada en internet.
  const duenos = await prisma.user.count({ where: { role: "OWNER", active: true } });
  if (duenos <= 1) abortar("Solo queda un dueño activo. No se retira: dejaría la app sin dueño.");

  if (BORRAR) {
    await prisma.user.delete({ where: { id: viejo.id } });
    console.log(`  Eliminado: ${viejo.name} <${viejo.email}>`);
  } else {
    await prisma.user.update({ where: { id: viejo.id }, data: { active: false } });
    console.log(`  Desactivado: ${viejo.name} <${viejo.email}>`);
  }

  // El movimiento queda firmado por el dueño NUEVO, que es quien lo ordena.
  await prisma.auditLog.create({
    data: {
      userId: nuevo.id,
      userName: nuevo.name,
      action: BORRAR ? "ELIMINAR" : "EDITAR",
      entity: "User",
      entityId: viejo.id,
      summary: BORRAR
        ? `Eliminó la cuenta de ${viejo.name} al traspasar la propiedad`
        : `Desactivó la cuenta de ${viejo.name} al traspasar la propiedad`,
      changes: JSON.stringify({
        active: { etiqueta: "Activo", antes: true, despues: false },
        role: { etiqueta: "Posición", antes: viejo.role, despues: viejo.role },
      }),
    },
  });

  linea();
  const quedan = await prisma.user.findMany({
    where: { role: "OWNER", active: true },
    select: { name: true, email: true },
  });
  console.log(`  Dueños activos ahora: ${quedan.length}`);
  quedan.forEach((d) => console.log(`    ${d.name} <${d.email}>`));
  console.log("");
}

main()
  .catch((e) => {
    console.error("\n  Falló:", e.message.split("\n")[0], "\n");
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
