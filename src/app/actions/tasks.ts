"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { logAudit, auditInTransaction } from "@/lib/audit";
import { assertActor } from "@/lib/auth-transactions";
import { LEVEL, requireLevel } from "@/lib/auth";
import { dateField, field, fieldOrNull } from "@/lib/utils";

import { DEFAULT_TASK_COLUMNS } from "@/lib/tasks-constants";

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
  let created = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      created = await prisma.$transaction(async (tx) => {
        if (await tx.taskColumn.count()) return false;
        for (const col of DEFAULT_TASK_COLUMNS) {
          const id = `initial-task-column-${col.order}`;
          await tx.taskColumn.upsert({
            where: { id },
            update: {},
            create: { id, name: col.name, color: col.color, order: col.order, brandId: null },
          });
        }
        return true;
      }, { isolationLevel: "Serializable" });
      break;
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : null;
      if (attempt === 2 || (code !== "P2034" && code !== "P2002")) throw error;
    }
  }
  if (created) await logAudit({ user, action: "CREAR", entity: "TaskColumn", summary: "Creó las columnas iniciales del tablero de tareas." });
  refrescar();
  return { ok: true };
}

/* ---------------------------------------------------- ACCIONES DE TAREAS -- */

export async function crearTarea(formData: FormData) {
  await requireLevel(LEVEL.MEMBER);

  const title = field(formData, "title");
  if (!title) throw new Error("El título de la tarea es obligatorio.");

  const description = fieldOrNull(formData, "description");
  const columnId = field(formData, "columnId");
  if (!columnId) throw new Error("Debes indicar la columna del pipeline.");

  const kind = field(formData, "kind") || "ACCION";
  const priority = field(formData, "priority") || "NORMAL";
  const dueDate = dateField(formData, "dueDate");
  const assigneeId = fieldOrNull(formData, "assigneeId");
  const brandId = fieldOrNull(formData, "brandId");

  const lastTask = await prisma.task.findFirst({
    where: { columnId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const order = (lastTask?.order ?? -1) + 1;

  const task = await prisma.task.create({
    data: {
      title,
      description,
      kind,
      priority,
      dueDate,
      columnId,
      assigneeId,
      brandId,
      order,
    },
  });

  refrescar();
  return { ok: true, task };
}

export async function actualizarTarea(formData: FormData) {
  await requireLevel(LEVEL.MEMBER);

  const id = field(formData, "id");
  if (!id) throw new Error("Falta el identificador de la tarea.");

  const title = field(formData, "title");
  if (!title) throw new Error("El título no puede estar vacío.");

  const description = fieldOrNull(formData, "description");
  const kind = field(formData, "kind") || "ACCION";
  const priority = field(formData, "priority") || "NORMAL";
  const dueDate = dateField(formData, "dueDate");
  const assigneeId = fieldOrNull(formData, "assigneeId");
  const brandId = fieldOrNull(formData, "brandId");
  const columnId = fieldOrNull(formData, "columnId");

  const updateData: Record<string, unknown> = {
    title,
    description,
    kind,
    priority,
    dueDate,
    assigneeId,
    brandId,
  };

  if (columnId) {
    updateData.columnId = columnId;
  }

  const task = await prisma.task.update({
    where: { id },
    data: updateData,
  });

  refrescar();
  return { ok: true, task };
}

export async function moverTarea(taskId: string, targetColumnId: string, newOrder?: number) {
  await requireLevel(LEVEL.MEMBER);

  if (!taskId || !targetColumnId) throw new Error("Datos incompletos para mover tarea.");

  let finalOrder = newOrder;
  if (finalOrder === undefined) {
    const lastTask = await prisma.task.findFirst({
      where: { columnId: targetColumnId },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    finalOrder = (lastTask?.order ?? -1) + 1;
  }

  const task = await prisma.task.update({
    where: { id: taskId },
    data: {
      columnId: targetColumnId,
      order: finalOrder,
    },
  });

  refrescar();
  return { ok: true, task };
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

export async function actualizarColumna(columnId: string, name: string, color: string) {
  await requireLevel(LEVEL.MEMBER);

  if (!columnId) throw new Error("Identificador de columna faltante.");
  if (!name.trim()) throw new Error("El nombre de la columna no puede estar vacío.");

  const col = await prisma.taskColumn.update({
    where: { id: columnId },
    data: {
      name: name.trim(),
      color: color.trim() || "#8b5cf6",
    },
  });

  refrescar();
  return { ok: true, column: col };
}

export async function crearColumna(name: string, color: string, brandId?: string | null) {
  await requireLevel(LEVEL.MEMBER);

  if (!name.trim()) throw new Error("El nombre de la columna es obligatorio.");

  const lastCol = await prisma.taskColumn.findFirst({
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const order = (lastCol?.order ?? -1) + 1;

  const col = await prisma.taskColumn.create({
    data: {
      name: name.trim(),
      color: color.trim() || "#8b5cf6",
      order,
      brandId: brandId ?? null,
    },
  });

  refrescar();
  return { ok: true, column: col };
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
