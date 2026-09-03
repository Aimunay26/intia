import { PrismaClient } from "@prisma/client";

/**
 * El cliente de base de datos.
 *
 * En desarrollo se guarda en una variable global para que el recargado en
 * caliente de Next no abra una conexion nueva en cada cambio de archivo.
 */

/**
 * Neon (y cualquier Postgres detras de PgBouncer) reparte la misma conexion
 * entre varias peticiones. Prisma, por su parte, usa sentencias preparadas con
 * nombre. Si no se le avisa, dos peticiones distintas intentan preparar la
 * misma sentencia sobre la misma conexion y sale un error de "prepared
 * statement already exists".
 *
 * Ese fallo es intermitente —aparece con concurrencia y desaparece al
 * reintentar—, que es la clase de error mas cara de diagnosticar. Se evita
 * anadiendo `pgbouncer=true`, y aqui se anade solo cuando hace falta: cuando
 * la direccion apunta a un endpoint con pooler y no lo trae ya.
 *
 * Se hace en el codigo y no en la variable de entorno a proposito: la variable
 * la escribe la integracion de Neon en Vercel y se regenera sola, asi que
 * cualquier cosa que se le anada a mano se pierde en la siguiente conexion.
 */
function conexion(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url || !url.startsWith("postgres")) return undefined;
  if (!url.includes("-pooler")) return undefined;
  if (url.includes("pgbouncer=true")) return undefined;

  return url + (url.includes("?") ? "&" : "?") + "pgbouncer=true";
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const urlCorregida = conexion();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    ...(urlCorregida ? { datasourceUrl: urlCorregida } : {}),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
