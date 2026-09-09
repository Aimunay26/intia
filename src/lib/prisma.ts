import { PrismaClient } from "@prisma/client";
import { databaseUrl } from "@/lib/database-url";
import { measureQuery } from "@/lib/query-performance";

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
  return databaseUrl();
}

function createClient() {
  const urlCorregida = conexion();
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    ...(urlCorregida ? { datasourceUrl: urlCorregida } : {}),
  }).$extends({
    name: "navigation-measurements",
    query: {
      $allOperations({ model, operation, args, query }) {
        return measureQuery(model, operation, () => query(args));
      },
    },
  });
}

const globalForPrisma = globalThis as unknown as { navigationPrisma?: ReturnType<typeof createClient> };
// Un cliente/pool por proceso, también con recarga de módulos en desarrollo.
export const prisma = globalForPrisma.navigationPrisma ?? createClient();
globalForPrisma.navigationPrisma = prisma;
export type AppTransaction = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
