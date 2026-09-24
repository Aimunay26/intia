export const APPLICATION_SCHEMA_VERSION = "intia-workflow-20260917";

/** Ajustes del pool e identificación de versiones compatibles durante despliegues. */
export function databaseUrl(env: Record<string, string | undefined> = process.env): string | undefined {
  const source = env.DATABASE_URL;
  if (!source || !/^postgres(?:ql)?:/.test(source)) return source;
  const url = new URL(source);
  url.searchParams.set("application_name", APPLICATION_SCHEMA_VERSION);
  // Se inspecciona el host, nunca coincidencias en la contraseña o los parámetros.
  if (url.hostname.includes("-pooler") && !url.searchParams.has("pgbouncer")) url.searchParams.set("pgbouncer", "true");
  for (const [variable, param] of [["DB_CONNECTION_LIMIT", "connection_limit"], ["DB_POOL_TIMEOUT_SECONDS", "pool_timeout"], ["DB_CONNECT_TIMEOUT_SECONDS", "connect_timeout"]] as const) {
    const configured = env[variable];
    if (configured === undefined || configured === "") continue;
    if (!/^[1-9]\d*$/.test(configured) || Number(configured) > 300) throw new Error(`${variable} debe ser un entero entre 1 y 300.`);
    url.searchParams.set(param, configured);
  }
  return url.toString();
}
