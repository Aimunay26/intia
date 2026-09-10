/** Barrera para seeds, reset y db push. No admite excepciones para servidores remotos. */
export function assertLocalDatabase(url = process.env.DATABASE_URL) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error("Exporta DATABASE_URL con la base local de desarrollo."); }
  if (!['postgresql:', 'postgres:'].includes(parsed.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) || process.env.VERCEL) {
    throw new Error("Este comando solo funciona con PostgreSQL local. Producción utiliza migraciones versionadas y nunca seeds o db push.");
  }
  return parsed;
}
assertLocalDatabase();
