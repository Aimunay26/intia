/**
 * Archivo total (M0): archiva todas las marcas anteriores a la época y registra lo que no tiene marca y es
 * anterior a ella, para restaurar después el estado exacto. Comando de operador; la salida es JSON con conteos.
 *
 *   npm run datos:archivo -- [--desde=<ISO>]                                    ensayo (por defecto, no escribe)
 *   npm run datos:archivo -- --apply --lote=<nombre> --token=<token> [--desde=<ISO>]
 *   npm run datos:archivo -- --restore --lote=<nombre> [--dueno=<correo>]
 *   npm run datos:archivo -- --restore-marca=<id> --dueno=<correo> [--lote=<nombre>]
 *   npm run datos:archivo -- --verificar --lote=<nombre>
 *
 * Reglas:
 * - Solo cambia `Brand.archived=true` y `Brand.active=false`, guardando antes el estado anterior en
 *   `intia_ops.archive_entry` (prisma/operations/archive-registry.sql). No toca contenido, guiones, aprobaciones,
 *   cuentas, perfiles, accesos, sesiones, archivos ni blobs, y nunca ejecuta DELETE.
 * - Lo que no tiene marca y es anterior a la época queda registrado como HIDDEN, sin cambios: la app lo oculta
 *   por fecha con ARCHIVO_TOTAL_DESDE.
 * - La época es `--desde` o ARCHIVO_TOTAL_DESDE (fecha ISO; con hora, siempre con zona). El ensayo sin época usa la
 *   hora de la base e imprime el valor que después se fija en ARCHIVO_TOTAL_DESDE.
 * - El token del ensayo es el hash del recuento: `--apply` se aborta si el recuento cambió, si hay generaciones en
 *   cola o en curso o importaciones pendientes. Repetir `--apply` del mismo lote no duplica nada.
 * - `--restore` nunca reactiva una marca que ya estaba archivada antes del lote y respeta los cambios que alguien
 *   hizo a mano después. Con los roles por marca (M1), `--dueno` es obligatorio: la cuenta recibe el rol de dueño
 *   solo en las marcas que el restore devuelve a la vida (RESTAURADA), nunca se levanta una membresía suspendida, y
 *   cada concesión guarda la membresía anterior exacta en `intia_ops.archive_owner_grant` y una fila de auditoría.
 * - «Reactivar» en /marcas registra la restauración de la entrada (YA_ESTABA o RESPETADA), como `--restore-marca`.
 * - Conexión de mantenimiento (application_name=intia-migrator-20260909), transacción Serializable con
 *   pg_advisory_xact_lock. En remoto, `--apply` y `--restore` exigen la puerta de despliegue cerrada.
 * - Auditoría firmada como «Sistema»: una fila por marca y una de resumen. Copia secundaria en
 *   `.audit/archivo-total-<lote>.json` (o ARCHIVO_TOTAL_AUDIT_DIR), solo con ids, sin nombres ni correos.
 * - Nunca imprime la conexión, nombres ni correos.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { parseArchiveEpoch } from "../src/lib/archive-epoch";

type Tx = Prisma.TransactionClient;
type Modo = "ensayo" | "apply" | "restore" | "restore-marca" | "verificar";
type Opciones = { modo: Modo; lote?: string; token?: string; desde?: string; dueno?: string; marca?: string };
type Salida = Record<string, unknown>;
type Huellas = Record<string, { md5: string; filas: number }>;

const MIGRADOR = "intia-migrator-20260909";
const CANDADO = "intia:archivo-total";
const LOTE = /^[a-z0-9][a-z0-9-]{2,62}$/;
const TOKEN = /^[0-9a-f]{16}$/;
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const USO = [
  "Uso: npm run datos:archivo -- [--desde=<ISO>]",
  "     npm run datos:archivo -- --apply --lote=<nombre> --token=<token> [--desde=<ISO>]",
  "     npm run datos:archivo -- --restore --lote=<nombre> [--dueno=<correo>]",
  "     npm run datos:archivo -- --restore-marca=<id> --dueno=<correo> [--lote=<nombre>]",
  "     npm run datos:archivo -- --verificar --lote=<nombre>",
].join("\n");

class Aborto extends Error {
  constructor(readonly codigo: string, mensaje: string, readonly datos: Salida = {}, readonly salida = 1) { super(mensaje); }
}
const uso = (mensaje: string) => new Aborto("uso", `${mensaje}\n${USO}`, {}, 2);

/* ------------------------------------------------------------------ ARGUMENTOS -- */

const CON_VALOR = new Set(["--lote", "--token", "--desde", "--dueno", "--restore-marca"]);
const BANDERAS: Record<string, Modo> = { "--apply": "apply", "--restore": "restore", "--verificar": "verificar" };
const PERMITIDAS: Record<Modo, string[]> = {
  ensayo: ["--desde"],
  apply: ["--lote", "--token", "--desde"],
  restore: ["--lote", "--dueno"],
  "restore-marca": ["--restore-marca", "--dueno", "--lote"],
  verificar: ["--lote"],
};

function leerArgumentos(argv: string[]): Opciones {
  const valores = new Map<string, string>();
  const modos: Modo[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const igual = arg.indexOf("=");
    const nombre = igual > 0 ? arg.slice(0, igual) : arg;
    if (BANDERAS[nombre] && igual < 0) { modos.push(BANDERAS[nombre]); continue; }
    if (!CON_VALOR.has(nombre) || valores.has(nombre)) throw uso(`Opción no reconocida o repetida: ${nombre.slice(0, 40)}`);
    const valor = igual > 0 ? arg.slice(igual + 1) : argv[++i];
    if (valor === undefined || valor.trim() === "" || valor.startsWith("--")) throw uso(`Falta el valor de ${nombre}.`);
    valores.set(nombre, valor.trim());
    if (nombre === "--restore-marca") modos.push("restore-marca");
  }
  if (modos.length > 1) throw uso("Elige un solo modo.");
  const modo = modos[0] ?? "ensayo";
  for (const nombre of valores.keys()) if (!PERMITIDAS[modo].includes(nombre)) throw uso(`${nombre} no aplica en el modo ${modo}.`);
  const opciones: Opciones = {
    modo, lote: valores.get("--lote"), token: valores.get("--token"), desde: valores.get("--desde"),
    dueno: valores.get("--dueno")?.toLowerCase(), marca: valores.get("--restore-marca"),
  };
  if (["apply", "restore", "verificar"].includes(modo) && !opciones.lote) throw uso("Falta --lote=<nombre>.");
  if (modo === "apply" && !opciones.token) throw uso("Falta --token=<token> (lo imprime el ensayo).");
  if (modo === "restore-marca" && !opciones.dueno) throw uso("--restore-marca exige --dueno=<correo>.");
  if (opciones.lote && !LOTE.test(opciones.lote)) throw uso("El lote va en minúsculas, dígitos y guiones (3 a 63 caracteres).");
  if (opciones.token && !TOKEN.test(opciones.token)) throw uso("El token tiene 16 caracteres hexadecimales.");
  if (opciones.marca && !ID.test(opciones.marca)) throw uso("El id de la marca no es válido.");
  if (opciones.dueno && !/^[^\s@]{1,64}@[^\s@]{1,255}$/.test(opciones.dueno)) throw uso("El correo del dueño no es válido.");
  return opciones;
}

/**
 * Misma interpretación que la app (src/lib/archive-epoch.ts): solo fecha (medianoche UTC) o fecha y hora con zona
 * explícita. Una hora sin zona es ambigua y se rechaza. Aquí un valor inválido aborta; en la app, apaga.
 */
function leerFecha(valor: string, origen: string): string {
  const { epoch } = parseArchiveEpoch(valor);
  if (!epoch) throw new Aborto("desde_invalida", `${origen} no es una fecha ISO válida. Usa AAAA-MM-DD o AAAA-MM-DDTHH:MM:SSZ (con zona).`);
  return epoch.toISOString();
}

/** La época de --desde o de ARCHIVO_TOTAL_DESDE; null solo si ninguna está definida. */
function epocaDeclarada(opciones: Opciones): { iso: string; origen: string } | null {
  if (opciones.desde) return { iso: leerFecha(opciones.desde, "--desde"), origen: "--desde" };
  const entorno = process.env.ARCHIVO_TOTAL_DESDE?.trim();
  if (entorno) return { iso: leerFecha(entorno, "ARCHIVO_TOTAL_DESDE"), origen: "ARCHIVO_TOTAL_DESDE" };
  return null;
}

/* -------------------------------------------------------------------- CONEXIÓN -- */

function conectar(): { db: PrismaClient; local: boolean } {
  const cruda = process.env.DATABASE_URL;
  if (!cruda) throw new Aborto("conexion", "Define DATABASE_URL en el entorno del operador.");
  let url: URL;
  try { url = new URL(cruda); } catch { throw new Aborto("conexion", "DATABASE_URL no tiene un formato válido."); }
  const local = ["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname);
  if (!local && url.searchParams.get("application_name") !== MIGRADOR) {
    throw new Aborto("conexion", "La operación remota requiere la conexión de mantenimiento (application_name=intia-migrator-20260909).");
  }
  // En local también escribe como mantenimiento: la puerta de despliegue, si está instalada, no lo bloquea.
  if (local && !url.searchParams.get("application_name")) url.searchParams.set("application_name", MIGRADOR);
  return { db: new PrismaClient({ datasourceUrl: url.href, log: [] }), local };
}

function codigoPg(error: unknown): string | undefined {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2034") return "40001";
    const meta = error.meta as { code?: unknown } | undefined;
    if (typeof meta?.code === "string") return meta.code;
  }
  const texto = error instanceof Error ? error.message : "";
  return /\b(40001|40P01|55P03|57014|42P01|3F000)\b/.exec(texto)?.[1];
}

const OPCIONES_TX = { timeout: 180_000, maxWait: 15_000 };

/** Solo lectura, con una foto consistente de toda la base. */
function lectura<T>(db: PrismaClient, trabajo: (tx: Tx) => Promise<T>): Promise<T> {
  return db.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    return trabajo(tx);
  }, { ...OPCIONES_TX, isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

/**
 * Escritura serializable. LOCK TABLE va primero porque no fija la foto de la transacción: un segundo proceso espera
 * aquí y, al entrar, ya ve lo que confirmó el primero. Después, el candado consultivo del diseño.
 */
function escritura<T>(db: PrismaClient, local: boolean, trabajo: (tx: Tx) => Promise<T>): Promise<T> {
  return db.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '30s'");
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '150s'");
    try {
      await tx.$executeRawUnsafe("LOCK TABLE intia_ops.archive_batch, intia_ops.archive_entry, intia_ops.archive_owner_grant IN EXCLUSIVE MODE");
    } catch (error) {
      if (["42P01", "3F000"].includes(codigoPg(error) ?? "")) throw registroFaltante();
      throw error;
    }
    await tx.$queryRaw`SELECT 1 AS ok FROM (SELECT pg_advisory_xact_lock(hashtextextended(${CANDADO}, 0))) AS candado`;
    if (!local) {
      const puerta = await tx.$queryRaw<{ blocked: boolean }[]>`SELECT blocked FROM intia_ops.deployment_gate WHERE singleton FOR SHARE`;
      if (!puerta[0]?.blocked) throw new Aborto("puerta_abierta", "Cierra la puerta de despliegue (intia_ops.deployment_gate) antes de escribir.");
    }
    return trabajo(tx);
  }, { ...OPCIONES_TX, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

const registroFaltante = () => new Aborto("registro_faltante", "Falta el registro intia_ops.archive_* o está incompleto: instala (o vuelve a instalar, es idempotente) prisma/operations/archive-registry.sql con la conexión de mantenimiento.");

/* -------------------------------------------------------------------- RECUENTO -- */

const epoca = (iso: string) => Prisma.sql`(${iso}::timestamptz AT TIME ZONE 'UTC')`;
/** Marcas que el lote archiva: anteriores a la época y que no están ya archivadas e inactivas. */
const objetivo = (iso: string) => Prisma.sql`SELECT b.id FROM "Brand" b WHERE b."createdAt" < ${epoca(iso)} AND (NOT b.archived OR b.active)`;

/** Lo que cuelga de las marcas que se archivan. Nada de esto se modifica: se oculta por su marca. */
const EN_MARCA: { clave: string; tabla: string; marca: string; extra?: string }[] = [
  { clave: "videos", tabla: '"ContentItem"', marca: 'x."brandId"' },
  { clave: "guiones", tabla: '"Script"', marca: 'x."brandId"' },
  { clave: "tareas", tabla: '"Task"', marca: 'x."brandId"' },
  { clave: "eventos", tabla: '"CalendarEvent"', marca: 'x."brandId"' },
  { clave: "trabajos", tabla: '"GenerationJob"', marca: "x.payload->>'brandId'" },
  { clave: "pasos", tabla: '"ProductionStep"', marca: 'x."brandId"' },
  { clave: "pasosPendientes", tabla: '"ProductionStep"', marca: 'x."brandId"', extra: "x.status = 'PENDIENTE'" },
  { clave: "productos", tabla: '"BrandProduct"', marca: 'x."brandId"' },
  { clave: "combos", tabla: '"BrandCombo"', marca: 'x."brandId"' },
  { clave: "objetivos", tabla: '"BrandObjective"', marca: 'x."brandId"' },
  { clave: "columnas", tabla: '"TaskColumn"', marca: 'x."brandId"' },
  { clave: "funcionesDeEquipo", tabla: '"BrandTeamMember"', marca: 'x."brandId"' },
  { clave: "accesos", tabla: '"UserBrandAccess"', marca: 'x."brandId"' },
];

/**
 * Lo que no tiene marca y es anterior a la época queda HIDDEN: exactamente lo que la app oculta por fecha
 * (liveTask, liveEvent, liveScript y liveJobSql de src/lib/archive-scope.ts). Las columnas globales nunca se ocultan;
 * las importaciones de métricas terminadas no se muestran en ninguna pantalla y no se registran.
 */
const PERSONAL: { entidad: string; clave: string; tabla: string; sinMarca: string }[] = [
  { entidad: "Task", clave: "tareas", tabla: '"Task"', sinMarca: 'x."brandId" IS NULL' },
  { entidad: "CalendarEvent", clave: "eventos", tabla: '"CalendarEvent"', sinMarca: 'x."brandId" IS NULL' },
  { entidad: "Script", clave: "guiones", tabla: '"Script"', sinMarca: 'x."brandId" IS NULL' },
  { entidad: "GenerationJob", clave: "trabajos", tabla: '"GenerationJob"', sinMarca: "x.payload->>'brandId' IS NULL" },
];
const personalAnterior = (p: (typeof PERSONAL)[number], iso: string) =>
  Prisma.sql`FROM ${Prisma.raw(p.tabla)} x WHERE ${Prisma.raw(p.sinMarca)} AND x."createdAt" < ${epoca(iso)}`;

type Recuento = {
  conteos: { marcas: Record<string, number>; enMarcasAArchivar: Record<string, number>; personalAnterior: Record<string, number> };
  token: string;
};

async function recuento(tx: Tx, iso: string): Promise<Recuento> {
  const e = epoca(iso);
  const [m] = await tx.$queryRaw<Record<string, number>[]>`SELECT
    count(*) FILTER (WHERE b."createdAt" < ${e} AND NOT b.archived AND b.active)::int AS activas,
    count(*) FILTER (WHERE b."createdAt" < ${e} AND NOT b.archived AND NOT b.active)::int AS pausadas,
    count(*) FILTER (WHERE b."createdAt" < ${e} AND b.archived AND b.active)::int AS inconsistentes,
    count(*) FILTER (WHERE b."createdAt" < ${e} AND b.archived AND NOT b.active)::int AS "archivadasPrevias",
    count(*) FILTER (WHERE b."createdAt" >= ${e})::int AS posteriores
    FROM "Brand" b`;
  const marcas = await tx.$queryRaw<{ id: string; archived: boolean; active: boolean }[]>`
    SELECT b.id, b.archived, b.active FROM "Brand" b WHERE b.id IN (${objetivo(iso)}) ORDER BY b.id`;
  const enMarcasAArchivar: Record<string, number> = {};
  for (const c of EN_MARCA) {
    const extra = c.extra ? Prisma.sql` AND ${Prisma.raw(c.extra)}` : Prisma.empty;
    const [fila] = await tx.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM ${Prisma.raw(c.tabla)} x WHERE ${Prisma.raw(c.marca)} IN (${objetivo(iso)})${extra}`;
    enMarcasAArchivar[c.clave] = fila.n;
  }
  const personal: Record<string, number> = {};
  const huellasPersonales: Record<string, string> = {};
  for (const p of PERSONAL) {
    const [fila] = await tx.$queryRaw<{ n: number; huella: string }[]>`SELECT count(*)::int AS n, md5(COALESCE(string_agg(x.id, ',' ORDER BY x.id), '')) AS huella ${personalAnterior(p, iso)}`;
    personal[p.clave] = fila.n;
    huellasPersonales[p.entidad] = fila.huella;
  }
  const conteos = { marcas: { aArchivar: marcas.length, ...m }, enMarcasAArchivar, personalAnterior: personal };
  // El token cubre lo que el lote cambia o registra; no las marcas posteriores, que el lote no toca.
  const base = JSON.stringify({
    v: 1, desde: iso, marcas: marcas.map(b => [b.id, b.archived, b.active]), archivadasPrevias: m.archivadasPrevias,
    enMarcasAArchivar, personal, huellasPersonales,
  });
  return { conteos, token: createHash("sha256").update(base).digest("hex").slice(0, 16) };
}

type Bloqueos = { trabajosEnCurso: number; trabajosDeArchivadas: number; importacionesPendientes: number; cuentasOwner: number; desdeFuturo: boolean };

async function bloqueos(tx: Tx, iso: string): Promise<Bloqueos> {
  const [fila] = await tx.$queryRaw<Bloqueos[]>`SELECT
    (SELECT count(*) FROM "GenerationJob" WHERE status IN ('QUEUED', 'RUNNING'))::int AS "trabajosEnCurso",
    (SELECT count(*) FROM "GenerationJob" j WHERE j.status IN ('QUEUED', 'RUNNING')
      AND EXISTS (SELECT 1 FROM "Brand" b WHERE b.id = j.payload->>'brandId' AND b.archived))::int AS "trabajosDeArchivadas",
    (SELECT count(*) FROM "MetricImportBatch" WHERE status = 'PENDING')::int AS "importacionesPendientes",
    (SELECT count(*) FROM "User" WHERE role = 'OWNER' AND active)::int AS "cuentasOwner",
    (${iso}::timestamptz > now()) AS "desdeFuturo"`;
  return fila;
}

/**
 * Las generaciones de marcas vivas se esperan o las cancela su dueño desde Generaciones. Las de marcas ya archivadas
 * no se ven en la app ni avanzan: la recuperación diaria (/api/maintenance) las cancela sin llamar a la IA.
 */
function mensajeTrabajos(b: Bloqueos): string {
  const vivas = b.trabajosEnCurso - b.trabajosDeArchivadas;
  const partes = [`Hay ${b.trabajosEnCurso} generaciones en cola o en curso.`];
  if (vivas) partes.push(`${vivas} son de marcas vivas: espera a que terminen o cancélalas desde Generaciones.`);
  if (b.trabajosDeArchivadas) partes.push(`${b.trabajosDeArchivadas} son de marcas ya archivadas: no se ven en la app; las cancela la recuperación diaria (/api/maintenance) cuando llevan 6 minutos sin avanzar.`);
  partes.push("Después vuelve a correr el ensayo.");
  return partes.join(" ");
}

/* --------------------------------------------------------------------- HUELLAS -- */

/** Tablas de contenido y acceso que el lote no debe cambiar. Brand entra sin su estado (archived, active, updatedAt). */
const TABLAS_INTACTAS = [
  "ContentItem", "ContentPlannedStructure", "ContentPlatform", "Script", "ScriptScene", "Approval", "ChecklistItem",
  "Assignment", "Comment", "Metric", "Task", "TaskColumn", "CalendarEvent", "ProductionStep", "GenerationJob",
  "GenerationItem", "MetricImportBatch", "BrandObjective", "BrandProduct", "BrandCombo", "BrandComboItem",
  "BrandTeamMember", "BrandProductionSettings", "CalendarSubscription", "Structure", "Archetype", "ArchetypeFit",
  "User", "UserWorkProfile", "UserBrandAccess", "AuthSession", "BlobObject",
];
const PROYECCIONES: [string, string][] = [
  ["Brand", `SELECT to_jsonb(t) - ARRAY['archived','active','updatedAt'] AS j FROM "Brand" t`],
  // Los bytes no se leen: basta su tamaño para notar un cambio sin cargar archivos.
  ["Asset", `SELECT (to_jsonb(t) - 'data') || jsonb_build_object('dataBytes', octet_length(t.data)) AS j FROM "Asset" t`],
  ...TABLAS_INTACTAS.map((tabla): [string, string] => [tabla, `SELECT to_jsonb(t) AS j FROM "${tabla}" t`]),
];

async function huellas(tx: Tx): Promise<Huellas> {
  const resultado: Huellas = {};
  for (const [tabla, proyeccion] of PROYECCIONES) {
    const [fila] = await tx.$queryRawUnsafe<{ md5: string; filas: number }[]>(
      `SELECT md5(COALESCE(string_agg(h, '' ORDER BY h), '')) AS md5, count(*)::int AS filas FROM (SELECT md5(j::text) AS h FROM (${proyeccion}) s) z`);
    resultado[tabla] = fila;
  }
  return resultado;
}

const tablasDistintas = (antes: Huellas, despues: Huellas) =>
  Object.keys({ ...antes, ...despues }).filter(tabla => antes[tabla]?.md5 !== despues[tabla]?.md5).sort();

async function sumaVersiones(tx: Tx): Promise<string> {
  const [fila] = await tx.$queryRaw<{ suma: string }[]>`SELECT COALESCE(sum("sessionVersion"), 0)::text AS suma FROM "User"`;
  return fila.suma;
}

/* --------------------------------------------------------------------- REGISTRO -- */

type Lote = {
  id: string; status: "APPLIED" | "RESTORED"; epoch: Date; token: string; counts: Prisma.JsonValue; table_md5: Huellas;
  session_version_sum: string; applied_at: Date; restored_at: Date | null;
};

async function registroInstalado(tx: Tx): Promise<boolean> {
  const [fila] = await tx.$queryRaw<{ ok: boolean }[]>`SELECT to_regclass('intia_ops.archive_batch') IS NOT NULL AND to_regclass('intia_ops.archive_entry') IS NOT NULL
    AND to_regclass('intia_ops.archive_owner_grant') IS NOT NULL AS ok`;
  return fila.ok;
}

async function leerLote(tx: Tx, lote: string): Promise<Lote | undefined> {
  const [fila] = await tx.$queryRaw<Lote[]>`SELECT id, status, epoch, token, counts, table_md5, session_version_sum::text AS session_version_sum, applied_at, restored_at
    FROM intia_ops.archive_batch WHERE id = ${lote}`;
  return fila;
}

async function loteAplicado(tx: Tx): Promise<string | null> {
  const [fila] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM intia_ops.archive_batch WHERE status = 'APPLIED'`;
  return fila?.id ?? null;
}

const directorioCopia = () => path.resolve(process.env.ARCHIVO_TOTAL_AUDIT_DIR?.trim() || ".audit");
const rutaCopia = (lote: string) => path.join(directorioCopia(), `archivo-total-${lote}.json`);

/** Contenido de la copia secundaria: solo ids, fechas y conteos. Sin nombres, correos ni contenido. */
async function copiaDelRegistro(tx: Tx, lote: string) {
  const fila = await leerLote(tx, lote);
  if (!fila) throw new Aborto("lote_inexistente", `No existe el lote ${lote}.`);
  const entradas = await tx.$queryRaw<{
    entity: string; entity_id: string; action: string; prev_archived: boolean | null; prev_active: boolean | null;
    prev_updated_at: Date | null; restored_at: Date | null; restored_owner_id: string | null; restore_result: string | null;
  }[]>`SELECT entity, entity_id, action, prev_archived, prev_active, prev_updated_at, restored_at, restored_owner_id, restore_result
    FROM intia_ops.archive_entry WHERE batch_id = ${lote} ORDER BY entity, entity_id`;
  const concesiones = await tx.$queryRaw<{ brand_id: string; user_id: string; prev_role: string | null; prev_status: string | null; granted_at: Date }[]>`
    SELECT brand_id, user_id, prev_role, prev_status, granted_at FROM intia_ops.archive_owner_grant WHERE batch_id = ${lote} ORDER BY brand_id`;
  const ocultos: Record<string, string[]> = Object.fromEntries(PERSONAL.map(p => [p.entidad, [] as string[]]));
  for (const e of entradas) if (e.action === "HIDDEN") ocultos[e.entity].push(e.entity_id);
  return {
    version: 1, lote: fila.id, estado: fila.status, desde: fila.epoch.toISOString(), token: fila.token,
    aplicadoEn: fila.applied_at.toISOString(), restauradoEn: fila.restored_at?.toISOString() ?? null, conteos: fila.counts,
    marcas: entradas.filter(e => e.action === "ARCHIVED").map(e => ({
      id: e.entity_id, antes: { archived: e.prev_archived, active: e.prev_active, updatedAt: e.prev_updated_at?.toISOString() ?? null },
      restauradaEn: e.restored_at?.toISOString() ?? null, resultado: e.restore_result, duenoId: e.restored_owner_id,
    })),
    // Rol de dueño concedido al restaurar (M1): la membresía anterior exacta, para poder deshacerlo. Solo ids.
    concesiones: concesiones.map(c => ({
      marca: c.brand_id, cuenta: c.user_id, antes: c.prev_role ? { brandRole: c.prev_role, status: c.prev_status } : null,
      despues: { brandRole: "DUENO_MARCA", status: "ACTIVE" }, en: c.granted_at.toISOString(),
    })),
    ocultos,
  };
}

async function escribirCopia(db: PrismaClient, lote: string): Promise<{ ruta: string; ok: boolean }> {
  const ruta = rutaCopia(lote);
  try {
    const copia = await lectura(db, tx => copiaDelRegistro(tx, lote));
    mkdirSync(path.dirname(ruta), { recursive: true });
    writeFileSync(ruta, `${JSON.stringify(copia, null, 2)}\n`, "utf8");
    return { ruta: path.relative(process.cwd(), ruta) || ruta, ok: true };
  } catch {
    return { ruta: path.relative(process.cwd(), ruta) || ruta, ok: false };
  }
}

type FilaAuditoria = { summary: string; entityId: string | null; brandId: string | null; changes: string | null; action?: "EDITAR" | "ASIGNAR" };

/** Auditoría firmada como «Sistema» (sin usuario), igual que la cadena de entregas. */
async function auditar(tx: Tx, filas: FilaAuditoria[]) {
  if (!filas.length) return;
  await tx.auditLog.createMany({ data: filas.map(({ action = "EDITAR", ...f }) => ({ userId: null, userName: "Sistema", action, entity: "Brand", ip: null, ...f })) });
}

const cambiosDeEstado = (antes: { archived: boolean; active: boolean }, despues: { archived: boolean; active: boolean }) => JSON.stringify({
  archived: { etiqueta: "Archivada", antes: antes.archived, despues: despues.archived },
  active: { etiqueta: "Activa", antes: antes.active, despues: despues.active },
});
const prefijoArchivo = (lote: string) => `Archivo total ${lote}:`;
const prefijoRestauracion = (lote: string) => `Restauración ${lote}:`;

/* ----------------------------------------------------------------------- ENSAYO -- */

async function ensayo(tx: Tx, opciones: Opciones): Promise<Salida> {
  const declarada = epocaDeclarada(opciones);
  let desde = declarada;
  if (!desde) {
    const [ahora] = await tx.$queryRaw<{ iso: Date }[]>`SELECT date_trunc('second', now() AT TIME ZONE 'UTC') AS iso`;
    desde = { iso: ahora.iso.toISOString(), origen: "ahora" };
  }
  const registro = await registroInstalado(tx);
  const aplicado = registro ? await loteAplicado(tx) : null;
  const b = await bloqueos(tx, desde.iso);
  const r = await recuento(tx, desde.iso);
  const lista = [
    ...(registro ? [] : ["registro_faltante"]),
    ...(aplicado ? ["otro_lote_aplicado"] : []),
    ...(b.trabajosEnCurso ? ["trabajos_en_curso"] : []),
    ...(b.importacionesPendientes ? ["importaciones_pendientes"] : []),
    ...(b.desdeFuturo ? ["desde_futuro"] : []),
  ];
  return {
    ok: true, modo: "ensayo", escribio: false, desde: desde.iso, origenDesde: desde.origen, registro, loteAplicado: aplicado,
    conteos: r.conteos, cuentasOwner: b.cuentasOwner,
    enCurso: { trabajos: b.trabajosEnCurso, trabajosDeArchivadas: b.trabajosDeArchivadas, importacionesPendientes: b.importacionesPendientes },
    ...(b.trabajosEnCurso ? { avisos: [mensajeTrabajos(b)] } : {}),
    bloqueos: lista, token: r.token,
    siguiente: `npm run datos:archivo -- --apply --lote=<nombre> --desde=${desde.iso} --token=${r.token}`,
    variable: `ARCHIVO_TOTAL_DESDE=${desde.iso}`,
  };
}

/* ------------------------------------------------------------------------ APPLY -- */

async function aplicar(tx: Tx, opciones: Opciones): Promise<Salida> {
  const lote = opciones.lote!;
  const existente = await leerLote(tx, lote);
  if (existente?.status === "APPLIED") {
    return { ok: true, modo: "apply", lote, aplicado: false, yaAplicado: true, desde: existente.epoch.toISOString(), token: existente.token };
  }
  if (existente) throw new Aborto("lote_restaurado", `El lote ${lote} ya se aplicó y se restauró. Usa un nombre de lote nuevo.`);
  const otro = await loteAplicado(tx);
  if (otro) throw new Aborto("otro_lote_aplicado", `Ya hay un lote aplicado (${otro}). Restáuralo antes de aplicar otro.`, { loteAplicado: otro });
  const declarada = epocaDeclarada(opciones);
  if (!declarada) throw new Aborto("desde_faltante", "Falta la época: pasa --desde=<ISO> (el valor que imprimió el ensayo) o define ARCHIVO_TOTAL_DESDE.");
  const iso = declarada.iso;
  const b = await bloqueos(tx, iso);
  if (b.desdeFuturo) throw new Aborto("desde_futuro", "La época está en el futuro: lo creado hasta esa fecha quedaría oculto sin registro.");
  if (b.trabajosEnCurso) throw new Aborto("trabajos_en_curso", mensajeTrabajos(b), { trabajosEnCurso: b.trabajosEnCurso, trabajosDeArchivadas: b.trabajosDeArchivadas });
  if (b.importacionesPendientes) throw new Aborto("importaciones_pendientes", `Hay ${b.importacionesPendientes} importaciones de métricas pendientes. Termínalas y vuelve a correr el ensayo.`, { importacionesPendientes: b.importacionesPendientes });
  const r = await recuento(tx, iso);
  if (r.token !== opciones.token) throw new Aborto("recuento_cambio", "El recuento cambió desde el ensayo (o el token no corresponde a esta época). Vuelve a correr el ensayo y usa su token.");

  const antes = await huellas(tx);
  const versiones = await sumaVersiones(tx);
  const e = epoca(iso);
  await tx.$executeRaw`INSERT INTO intia_ops.archive_batch (id, status, epoch, token, counts, table_md5, session_version_sum)
    VALUES (${lote}, 'APPLIED', ${e}, ${r.token}, ${JSON.stringify(r.conteos)}::jsonb, ${JSON.stringify(antes)}::jsonb, ${versiones}::bigint)`;
  // Primero el estado anterior exacto; después el cambio, solo sobre lo registrado.
  await tx.$executeRaw`INSERT INTO intia_ops.archive_entry (batch_id, entity, entity_id, action, prev_archived, prev_active, prev_updated_at)
    SELECT ${lote}, 'Brand', b.id, 'ARCHIVED', b.archived, b.active, b."updatedAt" FROM "Brand" b WHERE b.id IN (${objetivo(iso)})`;
  const archivadas = await tx.$executeRaw`UPDATE "Brand" b SET archived = true, active = false
    FROM intia_ops.archive_entry x WHERE x.batch_id = ${lote} AND x.entity = 'Brand' AND x.entity_id = b.id`;
  const ocultos: Record<string, number> = {};
  for (const p of PERSONAL) {
    ocultos[p.clave] = await tx.$executeRaw`INSERT INTO intia_ops.archive_entry (batch_id, entity, entity_id, action)
      SELECT ${lote}, ${p.entidad}, x.id, 'HIDDEN' ${personalAnterior(p, iso)}`;
  }
  const marcas = await tx.$queryRaw<{ id: string; name: string; prev_archived: boolean; prev_active: boolean }[]>`
    SELECT b.id, b.name, x.prev_archived, x.prev_active FROM intia_ops.archive_entry x JOIN "Brand" b ON b.id = x.entity_id
    WHERE x.batch_id = ${lote} AND x.entity = 'Brand' ORDER BY b.id`;
  const totalOcultos = Object.values(ocultos).reduce((a, n) => a + n, 0);
  await auditar(tx, [
    ...marcas.map(m => ({
      summary: `${prefijoArchivo(lote)} archivó la marca "${m.name}"`, entityId: m.id, brandId: m.id,
      changes: cambiosDeEstado({ archived: m.prev_archived, active: m.prev_active }, { archived: true, active: false }),
    })),
    { summary: `${prefijoArchivo(lote)} archivó ${marcas.length} marcas y dejó ocultos ${totalOcultos} registros sin marca anteriores a ${iso}`, entityId: null, brandId: null, changes: null },
  ]);

  // A1-A5 dentro de la misma transacción: si algo no cuadra, no se guarda nada.
  const [control] = await tx.$queryRaw<{ a1: number; a2: number; a5: number }[]>`SELECT
    (SELECT count(*) FROM "Brand" b WHERE b."createdAt" < ${e} AND (NOT b.archived OR b.active))::int AS a1,
    (SELECT count(*) FROM intia_ops.archive_entry x JOIN "Brand" b ON b.id = x.entity_id
      WHERE x.batch_id = ${lote} AND x.entity = 'Brand' AND NOT (b.archived AND NOT b.active))::int AS a2,
    (SELECT count(*) FROM "AuditLog" WHERE "userId" IS NULL AND "userName" = 'Sistema' AND starts_with(summary, ${prefijoArchivo(lote)}))::int AS a5`;
  const distintas = tablasDistintas(antes, await huellas(tx));
  const versionesDespues = await sumaVersiones(tx);
  if (control.a1 || control.a2 || distintas.length || versionesDespues !== versiones || control.a5 !== marcas.length + 1 || archivadas !== marcas.length) {
    throw new Aborto("verificacion_fallida", "La verificación interna no cuadró; no se guardó nada.", { a1: control.a1, a2: control.a2, tablasDistintas: distintas, a5: control.a5 });
  }
  return {
    ok: true, modo: "apply", lote, aplicado: true, desde: iso, token: r.token, marcasArchivadas: marcas.length, ocultos,
    conteos: r.conteos, verificacion: { A1: control.a1, A2: control.a2, A3: "igual", A4: "igual", A5: control.a5 },
    siguiente: `Corre --verificar --lote=${lote}, abre la puerta y fija ARCHIVO_TOTAL_DESDE=${iso}.`,
  };
}

/* ---------------------------------------------------------------------- RESTORE -- */

async function membresiasPorMarca(tx: Tx): Promise<{ tabla: boolean; obligatorio: boolean }> {
  const [fila] = await tx.$queryRaw<{ tabla: boolean }[]>`SELECT to_regclass('public."BrandMembership"') IS NOT NULL AS tabla`;
  return { tabla: fila.tabla, obligatorio: fila.tabla || process.env.BRAND_ROLES_ENABLED === "true" };
}

async function buscarDueno(tx: Tx, correo: string): Promise<string> {
  const filas = await tx.$queryRaw<{ id: string; active: boolean }[]>`SELECT id, active FROM "User" WHERE lower(btrim(email)) = ${correo} LIMIT 2`;
  if (filas.length !== 1 || !filas[0].active) throw new Aborto("dueno_invalido", "El dueño indicado no corresponde a una sola cuenta activa.");
  return filas[0].id;
}

type Resultado = "RESTAURADA" | "YA_ESTABA" | "RESPETADA" | "FALTANTE";
type Concesion = "CONCEDIDA" | "YA_ERA_DUENO" | "SUSPENDIDA";

/**
 * Con BrandMembership (M1): hace dueña a la cuenta indicada en una marca que este restore acaba de devolver a la vida.
 * Lee antes su membresía en esa marca (FOR UPDATE) y:
 *  - sin membresía: la crea (DUENO_MARCA, ACTIVE, source PLATFORM);
 *  - MIEMBRO activa: la sube a DUENO_MARCA;
 *  - DUENO_MARCA activa: no cambia nada;
 *  - SUSPENDED (cualquier rol): no la toca. Una suspensión es una decisión de alguien y el restore no la levanta.
 * Cada cambio real guarda la membresía anterior exacta en intia_ops.archive_owner_grant (para poder deshacerlo) y
 * devuelve su fila de auditoría, con el rol y el estado antes y después y el id de la cuenta.
 */
async function concederDueno(tx: Tx, lote: string, marca: { id: string; name: string }, dueno: string): Promise<{ resultado: Concesion; fila?: FilaAuditoria }> {
  const [previa] = await tx.$queryRaw<{ brandRole: string; status: string }[]>`
    SELECT "brandRole", "status" FROM "BrandMembership" WHERE "brandId" = ${marca.id} AND "userId" = ${dueno} FOR UPDATE`;
  if (previa?.status === "SUSPENDED") return { resultado: "SUSPENDIDA" };
  if (previa?.brandRole === "DUENO_MARCA") return { resultado: "YA_ERA_DUENO" };
  const cambiadas = previa
    ? await tx.$executeRaw`UPDATE "BrandMembership" SET "brandRole" = 'DUENO_MARCA', "updatedAt" = (now() AT TIME ZONE 'UTC')
        WHERE "brandId" = ${marca.id} AND "userId" = ${dueno} AND "brandRole" = 'MIEMBRO' AND "status" = 'ACTIVE'`
    // Sin ON CONFLICT: si alguien la creó entre la lectura y aquí, falla y no se guarda nada (nunca se pisa).
    : await tx.$executeRaw`INSERT INTO "BrandMembership" ("brandId", "userId", "brandRole", "status", "source", "updatedAt")
        VALUES (${marca.id}, ${dueno}, 'DUENO_MARCA', 'ACTIVE', 'PLATFORM', (now() AT TIME ZONE 'UTC'))`;
  if (cambiadas !== 1) throw new Aborto("verificacion_fallida", "La membresía del dueño cambió durante el restore; no se guardó nada.");
  await tx.$executeRaw`INSERT INTO intia_ops.archive_owner_grant (batch_id, brand_id, user_id, prev_role, prev_status, new_role, new_status)
    VALUES (${lote}, ${marca.id}, ${dueno}, ${previa?.brandRole ?? null}, ${previa?.status ?? null}, 'DUENO_MARCA', 'ACTIVE')`;
  const sinMembresia = "Sin membresía";
  return {
    resultado: "CONCEDIDA",
    fila: {
      action: "ASIGNAR", entityId: marca.id, brandId: marca.id,
      summary: `${prefijoRestauracion(lote)} dio el rol de dueño de la marca "${marca.name}" a la cuenta ${dueno}`,
      changes: JSON.stringify({
        userId: { etiqueta: "Cuenta", antes: previa ? dueno : null, despues: dueno },
        brandRole: { etiqueta: "Rol en la marca", antes: previa?.brandRole ?? sinMembresia, despues: "DUENO_MARCA" },
        status: { etiqueta: "Estado de la membresía", antes: previa?.status ?? sinMembresia, despues: "ACTIVE" },
      }),
    },
  };
}

async function restaurar(tx: Tx, opciones: Opciones): Promise<Salida> {
  const modo = opciones.modo;
  const soloMarca = opciones.marca;
  let lote = opciones.lote ?? "";
  if (!lote && soloMarca) {
    const [fila] = await tx.$queryRaw<{ id: string }[]>`SELECT l.id FROM intia_ops.archive_batch l JOIN intia_ops.archive_entry x ON x.batch_id = l.id
      WHERE l.status = 'APPLIED' AND x.entity = 'Brand' AND x.entity_id = ${soloMarca}`;
    if (!fila) throw new Aborto("marca_fuera_del_lote", "Esa marca no está en el lote aplicado: no se reactiva una marca que ya estaba archivada antes.");
    lote = fila.id;
  }
  const registro = await leerLote(tx, lote);
  if (!registro) throw new Aborto("lote_inexistente", `No existe el lote ${lote}.`);
  if (registro.status === "RESTORED") return { ok: true, modo, lote, restaurado: false, yaRestaurado: true };
  const m1 = await membresiasPorMarca(tx);
  if (m1.obligatorio && !opciones.dueno) throw new Aborto("dueno_obligatorio", "Con los roles por marca (M1), --dueno=<correo> es obligatorio: el relleno no les pone dueño a las marcas archivadas.");
  const dueno = opciones.dueno ? await buscarDueno(tx, opciones.dueno) : null;

  const marcaFiltro = soloMarca ? Prisma.sql` AND x.entity_id = ${soloMarca}` : Prisma.empty;
  const entradas = await tx.$queryRaw<{ entity_id: string; prev_archived: boolean; prev_active: boolean }[]>`
    SELECT x.entity_id, x.prev_archived, x.prev_active FROM intia_ops.archive_entry x
    WHERE x.batch_id = ${lote} AND x.entity = 'Brand' AND x.restored_at IS NULL${marcaFiltro} ORDER BY x.entity_id`;
  if (soloMarca && !entradas.length) {
    const [ya] = await tx.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM intia_ops.archive_entry WHERE batch_id = ${lote} AND entity = 'Brand' AND entity_id = ${soloMarca}`;
    if (ya.n) return { ok: true, modo, lote, marca: soloMarca, restaurado: false, yaRestaurada: true };
    throw new Aborto("marca_fuera_del_lote", "Esa marca no está en el lote: no se reactiva una marca que ya estaba archivada antes.");
  }

  const antes = await huellas(tx);
  const versiones = await sumaVersiones(tx);
  const resultados: Record<Resultado, number> = { RESTAURADA: 0, YA_ESTABA: 0, RESPETADA: 0, FALTANTE: 0 };
  const concesiones: Record<Concesion, number> = { CONCEDIDA: 0, YA_ERA_DUENO: 0, SUSPENDIDA: 0 };
  const suspendidas: string[] = [];
  // Vivas que no reactivó este restore (YA_ESTABA o RESPETADA: alguien las cambió a mano). Solo se informan: el
  // restore concede el rol de dueño únicamente donde él devuelve la marca a la vida.
  const vivasSinConceder: string[] = [];
  const auditoria: FilaAuditoria[] = [];
  for (const entrada of entradas) {
    const previo = { archived: entrada.prev_archived, active: entrada.prev_active };
    const [marca] = await tx.$queryRaw<{ id: string; name: string; archived: boolean; active: boolean }[]>`
      SELECT id, name, archived, active FROM "Brand" WHERE id = ${entrada.entity_id} FOR UPDATE`;
    let resultado: Resultado;
    if (!marca) resultado = "FALTANTE";
    else if (marca.archived === previo.archived && marca.active === previo.active) resultado = "YA_ESTABA";
    // Solo se devuelve lo que el lote dejó así. Un cambio hecho a mano después se respeta.
    else if (marca.archived && !marca.active) resultado = "RESTAURADA";
    else resultado = "RESPETADA";
    resultados[resultado]++;
    if (resultado === "RESTAURADA") {
      await tx.$executeRaw`UPDATE "Brand" SET archived = ${previo.archived}, active = ${previo.active} WHERE id = ${entrada.entity_id}`;
      auditoria.push({
        summary: `${prefijoRestauracion(lote)} devolvió la marca "${marca!.name}" a su estado anterior`, entityId: marca!.id, brandId: marca!.id,
        changes: cambiosDeEstado({ archived: true, active: false }, previo),
      });
    }
    // restored_owner_id solo cuando de verdad se creó o cambió una membresía.
    let duenoConcedido: string | null = null;
    if (m1.tabla && dueno && marca) {
      if (resultado === "RESTAURADA" && !previo.archived) {
        const concesion = await concederDueno(tx, lote, marca, dueno);
        concesiones[concesion.resultado]++;
        if (concesion.resultado === "SUSPENDIDA") suspendidas.push(marca.id);
        if (concesion.fila) { auditoria.push(concesion.fila); duenoConcedido = dueno; }
      } else if (resultado !== "RESTAURADA" && !marca.archived) vivasSinConceder.push(marca.id);
    }
    await tx.$executeRaw`UPDATE intia_ops.archive_entry SET restored_at = (clock_timestamp() AT TIME ZONE 'UTC'),
      restored_owner_id = ${duenoConcedido}, restore_result = ${resultado}
      WHERE batch_id = ${lote} AND entity = 'Brand' AND entity_id = ${entrada.entity_id}`;
  }
  const resumenDueno = m1.tabla && dueno
    ? `; rol de dueño para la cuenta ${dueno}: ${concesiones.CONCEDIDA} concedidas, ${concesiones.YA_ERA_DUENO} ya lo tenía, ${concesiones.SUSPENDIDA} con la membresía suspendida (respetada)`
    : "";
  auditoria.push({
    summary: `${prefijoRestauracion(lote)} devolvió ${resultados.RESTAURADA} marcas a su estado anterior (${resultados.YA_ESTABA} ya estaban así, ${resultados.RESPETADA} con cambios posteriores respetados, ${resultados.FALTANTE} ya no existen)${resumenDueno}`,
    entityId: soloMarca ?? null, brandId: soloMarca && resultados.FALTANTE === 0 ? soloMarca : null, changes: null,
  });
  await auditar(tx, auditoria);
  if (!soloMarca) await tx.$executeRaw`UPDATE intia_ops.archive_batch SET status = 'RESTORED', restored_at = (clock_timestamp() AT TIME ZONE 'UTC') WHERE id = ${lote}`;

  // Con M1: las marcas de esta restauración que quedaron vivas sin un dueño activo (B1 de M1). Solo se informan.
  const vivasSinDueno = m1.tabla && entradas.length ? (await tx.$queryRaw<{ id: string }[]>`SELECT b.id FROM "Brand" b
    WHERE b.id IN (${Prisma.join(entradas.map(x => x.entity_id))}) AND NOT b.archived AND NOT EXISTS (
      SELECT 1 FROM "BrandMembership" m JOIN "User" u ON u.id = m."userId" AND u.active
      WHERE m."brandId" = b.id AND m."brandRole" = 'DUENO_MARCA' AND m."status" = 'ACTIVE') ORDER BY b.id`).map(b => b.id) : [];

  const distintas = tablasDistintas(antes, await huellas(tx));
  const [control] = await tx.$queryRaw<{ r1: number; concesiones: number }[]>`SELECT
    (SELECT count(*) FROM intia_ops.archive_entry x JOIN "Brand" b ON b.id = x.entity_id
      WHERE x.batch_id = ${lote} AND x.entity = 'Brand' AND x.restore_result IN ('RESTAURADA', 'YA_ESTABA')
        AND (b.archived, b.active) IS DISTINCT FROM (x.prev_archived, x.prev_active))::int AS r1,
    (SELECT count(*) FROM intia_ops.archive_entry x JOIN intia_ops.archive_owner_grant g ON g.batch_id = x.batch_id AND g.brand_id = x.entity_id
      WHERE x.batch_id = ${lote} AND x.entity = 'Brand' AND x.restored_owner_id IS NOT DISTINCT FROM g.user_id)::int AS concesiones`;
  const [registradas] = await tx.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM intia_ops.archive_owner_grant WHERE batch_id = ${lote}`;
  if (distintas.length || control.r1 || control.concesiones !== registradas.n || (await sumaVersiones(tx)) !== versiones) {
    throw new Aborto("verificacion_fallida", "La verificación interna no cuadró; no se guardó nada.", { tablasDistintas: distintas, r1: control.r1 });
  }
  const avisos = [
    ...(suspendidas.length ? [`La cuenta tiene la membresía suspendida en ${suspendidas.length} marcas restauradas y no se levantó: elige otro dueño para ellas.`] : []),
    ...(vivasSinConceder.length ? [`${vivasSinConceder.length} marcas ya estaban vivas por un cambio a mano: el restore no les dio dueño.`] : []),
    ...(vivasSinDueno.length ? [`${vivasSinDueno.length} marcas de esta restauración quedaron vivas sin un dueño activo (B1 de M1): asígnaselo antes de encender los roles por marca.`] : []),
  ];
  return {
    ok: true, modo, lote, restaurado: true, ...(soloMarca ? { marca: soloMarca } : {}), resultados,
    dueno: dueno
      ? m1.tabla
        ? { id: dueno, efecto: "membresia", concedidas: concesiones.CONCEDIDA, yaEraDueno: concesiones.YA_ERA_DUENO, suspendidasRespetadas: suspendidas, vivasSinConceder }
        // Sin roles por marca no hay membresías: la cuenta solo se validó y no queda registrada como dueña de nada.
        : { id: dueno, efecto: "ninguno" }
      : null,
    ...(m1.tabla ? { marcasVivasSinDueno: vivasSinDueno } : {}),
    ...(avisos.length ? { avisos } : {}),
    loteEstado: soloMarca ? "APPLIED" : "RESTORED",
    siguiente: soloMarca ? "La marca volvió a su estado anterior; el resto del lote sigue archivado."
      : "Vacía ARCHIVO_TOTAL_DESDE y redespliega para volver a mostrar lo personal anterior a la época.",
  };
}

/* -------------------------------------------------------------------- VERIFICAR -- */

async function verificar(tx: Tx, lote: string): Promise<Salida> {
  if (!await registroInstalado(tx)) throw registroFaltante();
  const registro = await leerLote(tx, lote);
  if (!registro) throw new Aborto("lote_inexistente", `No existe el lote ${lote}.`);
  const epochIso = registro.epoch.toISOString();
  const e = epoca(epochIso);
  const [c] = await tx.$queryRaw<Record<string, number>[]>`SELECT
    (SELECT count(*) FROM "Brand" b WHERE b."createdAt" < ${e} AND (NOT b.archived OR b.active) AND NOT EXISTS (
      SELECT 1 FROM intia_ops.archive_entry x WHERE x.batch_id = ${lote} AND x.entity = 'Brand' AND x.entity_id = b.id AND x.restored_at IS NOT NULL))::int AS a1,
    (SELECT count(*) FROM intia_ops.archive_entry x JOIN "Brand" b ON b.id = x.entity_id
      WHERE x.batch_id = ${lote} AND x.entity = 'Brand' AND x.restored_at IS NULL AND NOT (b.archived AND NOT b.active))::int AS a2,
    (SELECT count(*) FROM intia_ops.archive_entry x WHERE x.batch_id = ${lote} AND x.entity = 'Brand' AND x.restored_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM "Brand" b WHERE b.id = x.entity_id))::int AS faltantes,
    (SELECT count(*) FROM intia_ops.archive_entry x WHERE x.batch_id = ${lote} AND x.action = 'ARCHIVED')::int AS marcas,
    (SELECT count(*) FROM intia_ops.archive_entry x WHERE x.batch_id = ${lote} AND x.action = 'HIDDEN')::int AS ocultos,
    (SELECT count(*) FROM intia_ops.archive_entry x WHERE x.batch_id = ${lote} AND x.action = 'ARCHIVED' AND x.restored_at IS NOT NULL)::int AS restauradas,
    (SELECT count(*) FROM "AuditLog" WHERE "userId" IS NULL AND "userName" = 'Sistema' AND starts_with(summary, ${prefijoArchivo(lote)}))::int AS a5,
    (SELECT count(*) FROM intia_ops.archive_entry x JOIN "Brand" b ON b.id = x.entity_id
      WHERE x.batch_id = ${lote} AND x.entity = 'Brand' AND x.restore_result IN ('RESTAURADA', 'YA_ESTABA')
        AND (b.archived, b.active) IS DISTINCT FROM (x.prev_archived, x.prev_active))::int AS r1`;
  const distintas = tablasDistintas(registro.table_md5, await huellas(tx));
  const versiones = await sumaVersiones(tx);
  const aplicado = registro.status === "APPLIED";
  const copia = revisarCopia(lote, registro.status, c.marcas, c.ocultos);
  const a6 = aplicado ? await filasNuevasEnArchivadas(tx, lote, registro.applied_at) : null;
  const verificacion = {
    A1: aplicado ? c.a1 : null,
    A2: aplicado ? c.a2 : null,
    A3: distintas.length ? { distintas } : "igual",
    A4: versiones === registro.session_version_sum ? "igual" : "distinta",
    A5: { filas: c.a5, esperadas: c.marcas + 1 },
    A6: a6,
    R1: aplicado ? null : { pendientes: c.marcas - c.restauradas, diferencias: c.r1 },
  };
  const a6Cero = !a6 || a6.filasNuevas === 0;
  const estadoOk = aplicado ? c.a1 === 0 && c.a2 === 0 && a6Cero : c.marcas === c.restauradas && c.r1 === 0;
  const ok = estadoOk && !distintas.length && versiones === registro.session_version_sum && c.a5 === c.marcas + 1 && copia !== "distinta";
  // A3 y A4 comparan con la foto del apply: valen justo después (puerta cerrada). Con la app abierta, el uso normal
  // (marcas nuevas, inicios de sesión, cambios de acceso) los cambia; el seguimiento es «vigente»: aplicado, el lote
  // sigue en pie (A1, A2, A5 y A6); restaurado, todas sus marcas volvieron a su estado anterior (R1 y A5).
  const vigente = estadoOk && c.a5 === c.marcas + 1 && copia !== "distinta";
  const nota = aplicado
    ? "A3/A4 difieren de la foto del apply por escrituras posteriores (uso normal con la puerta abierta). El lote sigue en pie: A1, A2, A5 y A6 están bien."
    : "A3/A4 difieren de la foto del apply por escrituras posteriores (uso normal con la puerta abierta). La restauración está completa: R1 y A5 están bien.";
  // Entradas sin restaurar cuya marca está viva: alguien la reactivó por fuera de «Reactivar» (que sí lo registra).
  // Solo ids. Se concilian con --restore-marca, que las marca YA_ESTABA o RESPETADA sin darles dueño.
  const vivasSinRegistro = aplicado && c.a2 ? (await tx.$queryRaw<{ id: string }[]>`SELECT x.entity_id AS id FROM intia_ops.archive_entry x
    JOIN "Brand" b ON b.id = x.entity_id WHERE x.batch_id = ${lote} AND x.entity = 'Brand' AND x.restored_at IS NULL
      AND NOT (b.archived AND NOT b.active) ORDER BY x.entity_id`).map(x => x.id) : [];
  const [concesiones] = await tx.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM intia_ops.archive_owner_grant WHERE batch_id = ${lote}`;
  const avisos = [
    ...(copia === "falta" ? ["La copia .audit no está en esta máquina: repite --apply del mismo lote para regenerarla."] : []),
    ...(vivasSinRegistro.length ? [`${vivasSinRegistro.length} marcas del lote están vivas sin registro de restauración: concílialas con --restore-marca=<id> --dueno=<correo> (quedan YA_ESTABA o RESPETADA, sin concederles dueño).`] : []),
  ];
  return {
    ok, vigente, modo: "verificar", lote, estado: registro.status, desde: epochIso, marcas: c.marcas, ocultos: c.ocultos,
    restauradas: c.restauradas, faltantes: c.faltantes, concesiones: concesiones.n, verificacion, copia,
    ...(vivasSinRegistro.length ? { vivasSinRegistro } : {}),
    ...(!ok && vigente ? { nota } : {}),
    ...(avisos.length ? { avisos } : {}),
  };
}

/**
 * A6: filas creadas después del apply que cuelgan de una marca que el lote mantiene archivada: entrada sin
 * restored_at y marca todavía archivada. Una marca que alguien volvió a poner viva ya no cuenta (lo suyo es uso
 * normal); su entrada sin registrar la señalan A2 y `vivasSinRegistro`. Con la app ocultando las archivadas y las
 * guardas activas, tiene que dar 0.
 */
async function filasNuevasEnArchivadas(tx: Tx, lote: string, desde: Date): Promise<{ filasNuevas: number; porTabla: Record<string, number> }> {
  const archivadas = Prisma.sql`SELECT x.entity_id FROM intia_ops.archive_entry x JOIN "Brand" b ON b.id = x.entity_id
    WHERE x.batch_id = ${lote} AND x.action = 'ARCHIVED' AND x.restored_at IS NULL AND b.archived`;
  const tablas: [string, string, string][] = [
    ["videos", '"ContentItem"', 't."brandId"'], ["guiones", '"Script"', 't."brandId"'], ["tareas", '"Task"', 't."brandId"'],
    ["eventos", '"CalendarEvent"', 't."brandId"'], ["pasos", '"ProductionStep"', 't."brandId"'], ["trabajos", '"GenerationJob"', "t.payload->>'brandId'"],
  ];
  const porTabla: Record<string, number> = {};
  for (const [clave, tabla, marca] of tablas) {
    const [fila] = await tx.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM ${Prisma.raw(tabla)} t
      WHERE t."createdAt" > ${desde} AND ${Prisma.raw(marca)} IN (${archivadas})`;
    porTabla[clave] = fila.n;
  }
  return { filasNuevas: Object.values(porTabla).reduce((a, n) => a + n, 0), porTabla };
}

function revisarCopia(lote: string, estado: string, marcas: number, ocultos: number): "ok" | "falta" | "distinta" {
  let texto: string;
  try { texto = readFileSync(rutaCopia(lote), "utf8"); } catch { return "falta"; }
  try {
    const copia = JSON.parse(texto) as { lote?: unknown; estado?: unknown; marcas?: unknown[]; ocultos?: Record<string, unknown[]> };
    const totalOcultos = Object.values(copia.ocultos ?? {}).reduce((a, ids) => a + (Array.isArray(ids) ? ids.length : 0), 0);
    return copia.lote === lote && copia.estado === estado && copia.marcas?.length === marcas && totalOcultos === ocultos ? "ok" : "distinta";
  } catch { return "distinta"; }
}

/* ------------------------------------------------------------------------ MAIN -- */

function imprimir(salida: Salida) { console.log(JSON.stringify(salida, null, 2)); }

async function principal() {
  let opciones: Opciones;
  try { opciones = leerArgumentos(process.argv.slice(2)); } catch (error) {
    if (error instanceof Aborto) { imprimir({ ok: false, error: error.codigo, mensaje: error.message }); process.exitCode = error.salida; return; }
    throw error;
  }
  let conexion: { db: PrismaClient; local: boolean };
  try { conexion = conectar(); } catch (error) {
    const aborto = error instanceof Aborto ? error : new Aborto("conexion", "No se pudo preparar la conexión.");
    imprimir({ ok: false, modo: opciones.modo, error: aborto.codigo, mensaje: aborto.message });
    process.exitCode = 1;
    return;
  }
  const { db, local } = conexion;
  try {
    let salida: Salida;
    if (opciones.modo === "ensayo") salida = await lectura(db, tx => ensayo(tx, opciones));
    else if (opciones.modo === "verificar") salida = await lectura(db, tx => verificar(tx, opciones.lote!));
    else if (opciones.modo === "apply") {
      if (opciones.desde || process.env.ARCHIVO_TOTAL_DESDE?.trim()) epocaDeclarada(opciones); // Una fecha inválida se rechaza antes de conectar a escribir.
      salida = await escritura(db, local, tx => aplicar(tx, opciones));
    } else salida = await escritura(db, local, tx => restaurar(tx, opciones));
    if (opciones.modo !== "ensayo" && opciones.modo !== "verificar" && typeof salida.lote === "string") {
      const copia = await escribirCopia(db, salida.lote);
      salida = { ...salida, copia: copia.ruta, copiaEscrita: copia.ok };
      if (!copia.ok) {
        salida.aviso = "Los datos quedaron guardados, pero no se pudo escribir la copia: repite el mismo comando para regenerarla.";
        process.exitCode = 1;
      }
    }
    imprimir(salida);
    if (salida.ok === false) process.exitCode = 1;
  } catch (error) {
    process.exitCode = 1;
    if (error instanceof Aborto) { imprimir({ ok: false, modo: opciones.modo, error: error.codigo, mensaje: error.message, ...error.datos }); return; }
    const codigo = codigoPg(error);
    const salida: Salida = codigo === "40001" || codigo === "40P01"
      ? { error: "conflicto", mensaje: "Otra transacción tocó los mismos datos. No se guardó nada: vuelve a correr el ensayo y el comando." }
      : codigo === "55P03" || codigo === "57014"
        ? { error: "tiempo_agotado", mensaje: "Otra operación retiene el registro o la consulta tardó demasiado. No se guardó nada: reintenta." }
        : { error: "fallo", mensaje: "No se completó la operación. No se guardaron cambios parciales." };
    if (process.env.ARCHIVO_TOTAL_DEBUG === "1") salida.detalle = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
    imprimir({ ok: false, modo: opciones.modo, ...salida });
  } finally {
    await db.$disconnect();
  }
}

await principal();
