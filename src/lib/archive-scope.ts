import { Prisma } from "@prisma/client";

import { archiveEpoch } from "@/lib/archive-epoch";

export { ARCHIVE_EPOCH_ENV, archiveEpoch, archiveEpochEnabled, parseArchiveEpoch } from "@/lib/archive-epoch";

/**
 * Qué se ve con el archivado total (M0, interruptor ARCHIVO_TOTAL_DESDE; ver archive-epoch.ts).
 *
 * Regla única, para todos (también el Dueño en las pantallas operativas):
 *  - lo que cuelga de una marca archivada se oculta, sea cual sea su fecha;
 *  - lo que no tiene marca se oculta si es anterior a la época (createdAt < época);
 *  - lo demás se ve como siempre, con el alcance de cada persona.
 * Nada se borra ni se modifica: ocultar es solo un filtro de lectura.
 *
 * Con el interruptor apagado, cada helper devuelve {} (o TRUE en SQL) y la consulta queda igual
 * que antes de M0. Todos aceptan la época ya resuelta como último argumento, para no leer el
 * entorno varias veces en una misma consulta y para las pruebas.
 *
 * Excepciones a propósito:
 *  - liveColumn nunca oculta las columnas globales (brandId NULL) por la época: sostienen el
 *    tablero de las tareas personales y de las marcas nuevas. Solo oculta las de marcas archivadas.
 *  - GenerationJob no tiene columna de marca hasta M1 (la marca va en payload.brandId): su filtro
 *    solo existe en SQL (liveJobSql).
 *  - La vista de administración (/marcas?estado=archivadas, Reactivar, /actividad y Ajustes) no
 *    usa estos helpers: sigue viendo todo.
 */

type Epoch = Date | null;

/** Marca viva: no archivada. */
export function liveBrand(epoch: Epoch = archiveEpoch()): Prisma.BrandWhereInput {
  return epoch ? { archived: false } : {};
}

/** Videos: su marca no está archivada (ContentItem siempre tiene marca). */
export function liveContent(epoch: Epoch = archiveEpoch()): Prisma.ContentItemWhereInput {
  return epoch ? { brand: { archived: false } } : {};
}

/** Pasos de la cadena: los de videos de marcas vivas (ProductionStep siempre tiene marca). */
export function liveStep(epoch: Epoch = archiveEpoch()): Prisma.ProductionStepWhereInput {
  return epoch ? { contentItem: { brand: { archived: false } } } : {};
}

/** Guiones: de una marca viva, o sin marca y creados desde la época. */
export function liveScript(epoch: Epoch = archiveEpoch()): Prisma.ScriptWhereInput {
  return epoch ? { OR: [{ brand: { is: { archived: false } } }, { brandId: null, createdAt: { gte: epoch } }] } : {};
}

/** Tareas: de una marca viva, o sin marca (personales) y creadas desde la época. */
export function liveTask(epoch: Epoch = archiveEpoch()): Prisma.TaskWhereInput {
  return epoch ? { OR: [{ brand: { is: { archived: false } } }, { brandId: null, createdAt: { gte: epoch } }] } : {};
}

/** Agenda: de una marca viva, o sin marca (personal) y creada desde la época. */
export function liveEvent(epoch: Epoch = archiveEpoch()): Prisma.CalendarEventWhereInput {
  return epoch ? { OR: [{ brand: { is: { archived: false } } }, { brandId: null, createdAt: { gte: epoch } }] } : {};
}

/** Columnas del tablero: las globales siempre; las de marca, solo si la marca está viva. */
export function liveColumn(epoch: Epoch = archiveEpoch()): Prisma.TaskColumnWhereInput {
  return epoch ? { OR: [{ brandId: null }, { brand: { is: { archived: false } } }] } : {};
}

/**
 * Combina un alcance con su filtro vivo sin cambiar la forma del alcance cuando el interruptor
 * está apagado (live = {}): así las consultas y las pruebas de antes quedan idénticas. Un alcance
 * vacío (el Dueño) queda solo con el filtro vivo.
 */
export function withLive<T extends object>(scope: T, live: T): T {
  if (!Object.keys(live).length) return scope;
  if (!Object.keys(scope).length) return live;
  return { AND: [scope, live] } as T;
}

/* ------------------------------------------------------------------ SQL -- */

/** Columna de SQL escrita en el código (nunca un dato de la petición): `"col"` o `alias."col"`. */
const COLUMN = /^(?:[A-Za-z_][A-Za-z0-9_]*\.)?"[A-Za-z_][A-Za-z0-9_]*"$/;
const ALIAS = /^[A-Za-z_][A-Za-z0-9_]*$/;

function column(value: string): Prisma.Sql {
  if (!COLUMN.test(value)) throw new Error(`archive-scope: columna no válida (${value.slice(0, 40)}).`);
  return Prisma.raw(value);
}

/**
 * Filtro vivo para SQL directo, como fragmento para `AND ${...}`.
 *  - `brandColumn`: columna con el id de la marca; si la marca está archivada, la fila se oculta.
 *    Una fila sin marca (NULL) no se oculta por esta parte.
 *  - `opts.createdAt`: columna de la fecha de creación; con ella, lo que no tiene marca y es
 *    anterior a la época también se oculta (como liveTask/liveEvent/liveScript).
 * Apagado: `TRUE`.
 */
export function liveBrandSql(brandColumn: string, opts: { createdAt?: string; epoch?: Epoch } = {}): Prisma.Sql {
  const epoch = opts.epoch === undefined ? archiveEpoch() : opts.epoch;
  const brand = column(brandColumn);
  const createdAt = opts.createdAt ? column(opts.createdAt) : null;
  if (!epoch) return Prisma.sql`TRUE`;
  const notArchived = Prisma.sql`NOT EXISTS (SELECT 1 FROM "Brand" ab WHERE ab."id" = ${brand} AND ab."archived")`;
  return createdAt ? Prisma.sql`(${notArchived} AND (${brand} IS NOT NULL OR ${createdAt} >= ${epoch}))` : notArchived;
}

/**
 * Filtro vivo de GenerationJob en SQL directo (`alias` es el alias de la tabla, por defecto «j»):
 * se ocultan los trabajos de marcas archivadas y los sin marca anteriores a la época.
 * Apagado: `TRUE`.
 */
export function liveJobSql(alias = "j", epoch: Epoch = archiveEpoch()): Prisma.Sql {
  if (!ALIAS.test(alias)) throw new Error("archive-scope: alias no válido.");
  if (!epoch) return Prisma.sql`TRUE`;
  const brand = Prisma.raw(`${alias}."payload"->>'brandId'`);
  const createdAt = Prisma.raw(`${alias}."createdAt"`);
  return Prisma.sql`(NOT EXISTS (SELECT 1 FROM "Brand" ab WHERE ab."id" = ${brand} AND ab."archived") AND (${brand} IS NOT NULL OR ${createdAt} >= ${epoch}))`;
}

/* ------------------------------------------------------------ CONSULTAS -- */

type BrandReader = { brand: { findMany(args: { where: Prisma.BrandWhereInput; select: { id: true } }): Promise<{ id: string }[]> } };

/**
 * De una lista de ids de marca, las que siguen vivas, en el mismo orden. Apagado, devuelve la
 * lista tal cual sin consultar nada.
 */
export async function liveBrandIds(db: BrandReader, ids: readonly string[], epoch: Epoch = archiveEpoch()): Promise<string[]> {
  if (!epoch || !ids.length) return [...ids];
  const live = new Set((await db.brand.findMany({ where: { id: { in: [...new Set(ids)] }, archived: false }, select: { id: true } })).map((b) => b.id));
  return ids.filter((id) => live.has(id));
}
