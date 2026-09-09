"use server";

import { revalidatePath } from "next/cache";

import { auditInTransaction, diffFields, FIELD_LABELS } from "@/lib/audit";
import { LEVEL, requireLevel } from "@/lib/auth";
import { assertActor } from "@/lib/auth-transactions";
import { prisma, type AppTransaction } from "@/lib/prisma";
import { dateField, field, fieldOrNull } from "@/lib/utils";

import { DEFAULT_TASK_COLUMNS, TASK_KINDS, TASK_PRIORITIES } from "@/lib/tasks-constants";

import { lockRevision, withMutation } from "@/lib/mutations";
import { boundedNumber, choice } from "@/lib/validation";

function readTask(fd: FormData) {
  const title = field(fd, "title");
  if (!title || title.length > 500) throw new Error("El título debe tener entre 1 y 500 caracteres.");
  return { title, description: fieldOrNull(fd, "description"), kind: choice(field(fd, "kind") || "ACCION", TASK_KINDS.map(k => k.value), "Tipo"),
    priority: choice(field(fd, "priority") || "NORMAL", TASK_PRIORITIES.map(p => p.value), "Prioridad"),
    dueDate: dateField(fd, "dueDate"), assigneeId: fieldOrNull(fd, "assigneeId"), brandId: fieldOrNull(fd, "brandId") };
}

async function checkTaskRelations(tx: AppTransaction, columnId: string, brandId: string | null, assigneeId: string | null) {
  const column = await tx.taskColumn.findUniqueOrThrow({ where: { id: columnId }, select: { brandId: true } });
  if (column.brandId && column.brandId !== brandId) throw new Error("La tarea debe pertenecer a la marca de la columna.");
  if (brandId) await tx.brand.findUniqueOrThrow({ where: { id: brandId }, select: { id: true } });
  if (assigneeId) {
    const person = await tx.user.findUniqueOrThrow({ where: { id: assigneeId }, select: { active: true } });
    if (!person.active) throw new Error("No puedes asignar una cuenta desactivada.");
  }
}

function refrescar() {
  revalidatePath("/tareas");
}

/* -------------------------------------------------- INICIALIZAR COLUMNAS -- */

/**
 * Asegura que existan las columnas base del pipeline.
 * Si la base está vacía, siembra las 5 columnas por defecto.
 */
export async function asegurarColumnasIniciales() {
  const user = await requireLevel(LEVEL.MEMBER);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await prisma.$transaction(async (tx) => {
        await assertActor(tx, user);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(781240110)`;
        if (await tx.taskColumn.count()) return false;
        for (const col of DEFAULT_TASK_COLUMNS) {
          const id = `initial-task-column-${col.order}`;
          await tx.taskColumn.upsert({
            where: { id },
            update: {},
            create: { id, name: col.name, color: col.color, order: col.order, brandId: null },
          });
        }
        await auditInTransaction(tx, { user, action: "CREAR", entity: "TaskColumn", summary: "Creó las columnas iniciales del tablero de tareas." });
        return true;
      }, { isolationLevel: "Serializable" });
      break;
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : null;
      if (attempt === 2 || (code !== "P2034" && code !== "P2002")) throw error;
    }
  }
  refrescar();
  return { ok: true };
}

/* ---------------------------------------------------- ACCIONES DE TAREAS -- */

export async function crearTarea(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);
  return withMutation(user, false, async (tx, afterCommit) => {
    const data = readTask(formData);
    const columnId = field(formData, "columnId");
    await checkTaskRelations(tx, columnId, data.brandId, data.assigneeId);
    const last = await tx.task.findFirst({ where: { columnId }, orderBy: { order: "desc" }, select: { order: true } });
    const task = await tx.task.create({ data: { ...data, columnId, order: (last?.order ?? -1) + 1 } });
    await auditInTransaction(tx, { user, action: "CREAR", entity: "Task", entityId: task.id, brandId: task.brandId, summary: `Creó la tarea "${task.title}"` });
    afterCommit(refrescar);
    return { ok: true, task };
  });
}

export async function actualizarTarea(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);
  return withMutation(user, false, async (tx, afterCommit) => {
    const id = field(formData, "id");
    await lockRevision(tx, "Task", id, formData);
    const before = await tx.task.findUniqueOrThrow({ where: { id } });
    const data = readTask(formData);
    const columnId = field(formData, "columnId") || before.columnId;
    await checkTaskRelations(tx, columnId, data.brandId, data.assigneeId);
    const last = columnId !== before.columnId ? await tx.task.findFirst({ where: { columnId }, orderBy: { order: "desc" }, select: { order: true } }) : null;
    const task = await tx.task.update({ where: { id }, data: { ...data, columnId, ...(columnId !== before.columnId ? { order: (last?.order ?? -1) + 1 } : {}) } });
    await auditInTransaction(tx, { user, action: "EDITAR", entity: "Task", entityId: id, brandId: task.brandId, summary: `Editó la tarea "${task.title}"`, changes: diffFields(before, task, FIELD_LABELS) });
    afterCommit(refrescar);
    return { ok: true, task };
  });
}

export async function moverTarea(taskId: string, targetColumnId: string, newOrder: number | undefined, expectedUpdatedAt: string) {
  const user = await requireLevel(LEVEL.MEMBER);
  return withMutation(user, false, async (tx, afterCommit) => {
    await lockRevision(tx, "Task", taskId, expectedUpdatedAt);
    const before = await tx.task.findUniqueOrThrow({ where: { id: taskId } });
    await checkTaskRelations(tx, targetColumnId, before.brandId, before.assigneeId);
    const last = await tx.task.findFirst({ where: { columnId: targetColumnId }, orderBy: { order: "desc" }, select: { order: true } });
    const order = boundedNumber(newOrder ?? (last?.order ?? -1) + 1, 0, 2147483647, "Orden", true);
    const task = await tx.task.update({ where: { id: taskId }, data: { columnId: targetColumnId, order } });
    await auditInTransaction(tx, { user, action: "EDITAR", entity: "Task", entityId: taskId, brandId: task.brandId, summary: `Movió la tarea "${task.title}"`, changes: diffFields(before, task, FIELD_LABELS) });
    afterCommit(refrescar);
    return { ok: true, task };
  });
}

export async function eliminarTarea(idOrFormData: FormData | string) {
  const user = await requireLevel(LEVEL.OWNER);

  const id = typeof idOrFormData === "string" ? idOrFormData : field(idOrFormData, "id");
  if (!id) throw new Error("Falta el identificador de la tarea a eliminar.");

  await prisma.$transaction(async tx => {
    await assertActor(tx, user, true);
    const before = await tx.task.findUniqueOrThrow({ where: { id } });
    await tx.task.delete({ where: { id } });
    await auditInTransaction(tx, { user, action: "ELIMINAR", entity: "Task", entityId: id, brandId: before.brandId, summary: `Eliminó la tarea "${before.title}"` });
  });

  refrescar();
  return { ok: true };
}

/* -------------------------------------------------- ACCIONES DE COLUMNAS -- */

export async function actualizarColumna(columnId: string, name: string, color: string, expectedUpdatedAt: string) {
  const user = await requireLevel(LEVEL.MEMBER);
  if (!name.trim()) throw new Error("El nombre de la columna no puede estar vacío.");
  if (!/^#[a-f0-9]{6}$/i.test(color)) throw new Error("El color no es válido.");
  return withMutation(user, false, async (tx, afterCommit) => {
    await lockRevision(tx, "TaskColumn", columnId, expectedUpdatedAt);
    const before = await tx.taskColumn.findUniqueOrThrow({ where: { id: columnId } });
    const column = await tx.taskColumn.update({ where: { id: columnId }, data: { name: name.trim(), color } });
    await auditInTransaction(tx, { user, action: "EDITAR", entity: "TaskColumn", entityId: columnId, brandId: column.brandId, summary: `Editó la columna "${column.name}"`, changes: diffFields(before, column, FIELD_LABELS) });
    afterCommit(refrescar);
    return { ok: true, column };
  });
}

export async function crearColumna(name: string, color: string, brandId?: string | null) {
  const user = await requireLevel(LEVEL.MEMBER);
  if (!name.trim()) throw new Error("El nombre de la columna es obligatorio.");
  if (!/^#[a-f0-9]{6}$/i.test(color)) throw new Error("El color no es válido.");
  return withMutation(user, false, async (tx, afterCommit) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(781240110)`;
    const last = await tx.taskColumn.findFirst({ orderBy: { order: "desc" }, select: { order: true } });
    const column = await tx.taskColumn.create({ data: { name: name.trim(), color, brandId: brandId || null, order: (last?.order ?? -1) + 1 } });
    await auditInTransaction(tx, { user, action: "CREAR", entity: "TaskColumn", entityId: column.id, brandId: column.brandId, summary: `Creó la columna "${column.name}"` });
    afterCommit(refrescar);
    return { ok: true, column };
  });
}

export async function eliminarColumna(columnId: string) {
  const user = await requireLevel(LEVEL.OWNER);

  if (!columnId) throw new Error("Falta el identificador de columna a eliminar.");

  await prisma.$transaction(async tx => {
    await assertActor(tx, user, true);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(781240110)`;
    // Impide una inserción concurrente mientras se comprueba que la columna está vacía.
    await tx.$queryRaw`SELECT "id" FROM "TaskColumn" WHERE "id" = ${columnId} FOR UPDATE`;
    const column = await tx.taskColumn.findUniqueOrThrow({ where: { id: columnId } });
    if (await tx.taskColumn.count() <= 1) throw new Error("No puedes eliminar la única columna restante del tablero.");
    const count = await tx.task.count({ where: { columnId } });
    if (count) throw new Error(`La columna contiene ${count} tareas, incluidas las ocultas por filtros. Muévelas antes de eliminarla.`);
    await tx.taskColumn.delete({ where: { id: columnId } });
    await auditInTransaction(tx, { user, action: "ELIMINAR", entity: "TaskColumn", entityId: columnId, brandId: column.brandId, summary: `Eliminó la columna vacía "${column.name}"` });
  });

  refrescar();
  return { ok: true };
}

export async function revisarEliminacionColumna(columnId: string) {
  await requireLevel(LEVEL.OWNER);
  const column = await prisma.taskColumn.findUniqueOrThrow({ where: { id: columnId }, select: { name: true, _count: { select: { tasks: true } } } });
  return { name: column.name, tasks: column._count.tasks };
}
