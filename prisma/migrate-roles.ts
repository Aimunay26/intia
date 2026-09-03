/**
 * Migración puntual de los cuatro roles antiguos a las dos posiciones actuales.
 *
 *   ADMIN                     -> OWNER   (dueño: manda, y es el único que elimina)
 *   MANAGER | EDITOR | TALENT -> MEMBER  (equipo: crea, edita y mueve)
 *
 * Se puede correr varias veces sin efecto: solo toca lo que no está migrado.
 *
 *   npx tsx prisma/migrate-roles.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const MAPA: Record<string, string> = {
  ADMIN: "OWNER",
  MANAGER: "MEMBER",
  EDITOR: "MEMBER",
  TALENT: "MEMBER",
};

async function main() {
  const usuarios = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true },
  });

  let migrados = 0;
  for (const u of usuarios) {
    const nuevo = MAPA[u.role];
    if (!nuevo) continue;
    await prisma.user.update({ where: { id: u.id }, data: { role: nuevo } });
    console.log(`  ${u.name.padEnd(20)} ${u.role} -> ${nuevo}`);
    migrados++;
  }

  const owners = await prisma.user.count({ where: { role: "OWNER", active: true } });
  const members = await prisma.user.count({ where: { role: "MEMBER", active: true } });

  console.log(`\n${migrados} migrados. Ahora: ${owners} dueño(s), ${members} del equipo.`);

  if (owners === 0) {
    console.log(
      "\nAVISO: no queda ninguna cuenta de dueño activa.\n" +
        "Al abrir la app te pedirá crear la primera."
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
