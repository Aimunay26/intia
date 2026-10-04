import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { archiveEpoch, liveColumn, liveTask } from "@/lib/archive-scope";
import { prisma } from "@/lib/prisma";
import { taskListOptions, type TaskFilters } from "@/lib/task-list";

export const TASK_PAGE_SIZE = 50;
/** Archivo total: las columnas de marcas archivadas no se muestran; las globales, siempre. */
export function taskColumnWhere(activeBrandId: string | null): Prisma.TaskColumnWhereInput {
  const brand: Prisma.TaskColumnWhereInput = activeBrandId ? { OR: [{ brandId: null }, { brandId: activeBrandId }] } : {};
  const epoch = archiveEpoch();
  return epoch ? { AND: [brand, liveColumn(epoch)] } : brand;
}

function scopeKey(columnId: string, brandId: string | null, filters: TaskFilters) {
  return createHash("sha256").update(JSON.stringify([columnId, brandId, taskListOptions(brandId, filters).where])).digest("hex").slice(0, 24);
}

export function taskCursorWhere(cursor: string | null | undefined, scope: string): Prisma.TaskWhereInput {
  if (!cursor) return {};
  if (cursor.length > 512) throw new Error("Cursor de tareas inválido.");
  let decoded: unknown;
  try { decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")); } catch { throw new Error("Cursor de tareas inválido."); }
  if (!decoded || typeof decoded !== "object" || !("id" in decoded) || !("order" in decoded) || !("scope" in decoded) ||
    typeof decoded.id !== "string" || !decoded.id || decoded.id.length > 128 ||
    typeof decoded.order !== "number" || !Number.isSafeInteger(decoded.order) || decoded.scope !== scope) {
    throw new Error("Los filtros cambiaron. Actualiza el tablero antes de cargar más tareas.");
  }
  return { order: { gte: decoded.order }, OR: [{ order: { gt: decoded.order } }, { order: decoded.order, id: { gt: decoded.id } }] };
}

export async function getTaskColumnPage(columnId: string, brandId: string | null, filters: TaskFilters, cursor?: string | null, access: Prisma.TaskWhereInput = {}) {
  const scope = scopeKey(columnId, brandId, filters);
  const after = taskCursorWhere(cursor, scope);
  // Archivo total: sin tareas de marcas archivadas ni personales anteriores a la época.
  const epoch = archiveEpoch();
  const live = epoch ? [liveTask(epoch)] : [];
  const tasks = await prisma.task.findMany({
    where: { AND: [{ columnId }, taskListOptions(brandId, filters).where, after, access, ...live] },
    take: TASK_PAGE_SIZE + 1,
    orderBy: [{ order: "asc" }, { id: "asc" }],
    include: { assignee: { select: { id: true, name: true, color: true, avatarUrl: true } }, brand: { select: { id: true, name: true, colorPrimary: true } }, productionStep: { select: { contentItemId: true } } },
  });
  const items = tasks.slice(0, TASK_PAGE_SIZE);
  const last = items.at(-1);
  const nextCursor = tasks.length > TASK_PAGE_SIZE && last
    ? Buffer.from(JSON.stringify({ id: last.id, order: last.order, scope })).toString("base64url") : null;
  return { tasks: items, nextCursor, hasMore: Boolean(nextCursor) };
}

export async function getTaskBoard(brandId: string | null, filters: TaskFilters) {
  const columns = await prisma.taskColumn.findMany({ where: taskColumnWhere(brandId), orderBy: [{ order: "asc" }, { id: "asc" }] });
  const result: Array<(typeof columns)[number] & Awaited<ReturnType<typeof getTaskColumnPage>>> = [];
  // Limita consultas simultáneas y aplica LIMIT en SQL por columna, no después de cargar la relación completa.
  for (let index = 0; index < columns.length; index += 4) {
    result.push(...await Promise.all(columns.slice(index, index + 4).map(async column => ({ ...column, ...await getTaskColumnPage(column.id, brandId, filters) }))));
  }
  return result;
}
