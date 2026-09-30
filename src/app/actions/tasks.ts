"use server";
import { requirePermission, type SessionUser } from "@/lib/auth";
import { allows, assertBrandPermission } from "@/lib/permissions";
import { assertTaskAccess, assertAssignee, lockVideoLifecycle } from "@/lib/access-scope";
import { archiveEpoch, liveTask } from "@/lib/archive-scope";

import { revalidatePath } from "next/cache";

import { auditInTransaction, diffFields, FIELD_LABELS } from "@/lib/audit";
import { LEVEL, requireLevel } from "@/lib/auth";
import { assertActor } from "@/lib/auth-transactions";
import { prisma, type AppTransaction } from "@/lib/prisma";
import { dateField, dateKey, field, fieldOrNull, instantInZone, timeKey } from "@/lib/utils";

import { DEFAULT_TASK_COLUMNS, TASK_KINDS, TASK_PRIORITIES } from "@/lib/tasks-constants";

import { ChainError, chainEvent, reassignStep } from "@/lib/domain/production-chain";
import { ProductionFlowError } from "@/lib/domain/production-flow";
import { EDIT_CONFLICT, lockRevision, withMutation } from "@/lib/mutations";
import { productionChainConfigured, productionChainEnabled } from "@/lib/production-chain-flag";
import { boundedNumber, choice } from "@/lib/validation";
import { invalidateDomain } from "@/lib/view-invalidation";
import { WorkflowError } from "@/lib/workflow-policy";
import { endOfDayKey } from "@/lib/working-days";

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
    if (brandId) await assertAssignee(tx, assigneeId, brandId);
    const person = await tx.user.findUniqueOrThrow({ where: { id: assigneeId }, select: { active: true } });
    if (!person.active) throw new Error("No puedes asignar una cuenta desactivada.");
  }
}

function refrescar() {
  revalidatePath("/tareas");
}

/* ------------------------------------------------ CADENA DE ENTREGAS -- */

/**
 * Tarea y paso son una sola cosa (PRODUCTION_CHAIN_ENABLED): entrar en la última columna es el
 * «Listo» del paso, con sus mismas validaciones, y sacar de ahí la tarea de un paso cerrado se
 * rechaza (para rehacerlo se devuelve desde el paso siguiente). Reasignar o cambiar la fecha de
 * la tarea reasigna el paso (y la fecha del video). Con la cadena apagada no se consulta nada.
 */
type TaskStep = { id: string; contentItemId: string; brandId: string; step: string; status: string; dueAt: Date };

async function chainStepOfTask(tx: AppTransaction, taskId: string): Promise<TaskStep | null> {
  if (!productionChainConfigured()) return null;
  const step = await tx.productionStep.findUnique({ where: { taskId }, select: { id: true, contentItemId: true, brandId: true, step: true, status: true, dueAt: true } });
  return step && productionChainEnabled(step.brandId) ? step : null;
}

/**
 * Bloquea el ciclo de vida del video antes que la tarea: el mismo orden que el «Listo» (guion →
 * video → paso → tarea), así un movimiento y un «Listo» simultáneos no se interbloquean.
 */
async function lockTaskStep(tx: AppTransaction, taskId: string): Promise<TaskStep | null> {
  const step = await chainStepOfTask(tx, taskId);
  if (step) await lockVideoLifecycle(tx, step.contentItemId);
  return step;
}

function refrescarCadena() {
  revalidatePath("/tareas");
  revalidatePath("/cadena");
  invalidateDomain("content");
}

type StepFields = { brandId: string | null; assigneeId: string | null; dueDate: Date | null };

/**
 * Cambios de la tarea de un paso que no son de columna: responsable y fecha siguen al paso.
 * Devuelve el aviso del calendario si la fecha del video no pudo seguir al plazo (sin permiso).
 */
async function syncEditToStep(tx: AppTransaction, user: SessionUser, step: TaskStep, before: StepFields, data: StepFields): Promise<string | null> {
  if (data.brandId !== before.brandId) throw new ChainError("Esta tarea es de un paso de producción: no puede cambiar de marca.");
  const dueChanged = dateKey(data.dueDate) !== dateKey(before.dueDate);
  if (data.assigneeId === before.assigneeId && !dueChanged) return null;
  if (step.status !== "PENDIENTE") throw new ChainError("El paso de esta tarea ya está cerrado: no se reasigna ni cambia de fecha.");
  if (!data.dueDate) throw new ChainError("La tarea de un paso de producción necesita fecha límite.");
  const key = dateKey(data.dueDate);
  // El diseño vence a una hora (24 h); los demás pasos, al final del día.
  const dueAt = !dueChanged ? step.dueAt : step.step === "DISENO" ? instantInZone(key, timeKey(step.dueAt)) : endOfDayKey(key);
  return (await reassignStep(tx, user, step.id, { assigneeId: data.assigneeId, dueAt })).calendarNotice;
}

const SAFE_MOVE_MESSAGES = new Set([EDIT_CONFLICT, "No tienes acceso a esta tarea.", "No tienes acceso a este video.", "El video cambió. Recarga la página antes de continuar."]);

/** Motivo legible de un rechazo (regla de la cadena o del flujo, o conflicto); si no, null. */
function motivoLegible(error: unknown): string | null {
  if (error instanceof ProductionFlowError || error instanceof WorkflowError) return error.message;
  if (error instanceof Error && SAFE_MOVE_MESSAGES.has(error.message)) return error.message;
  return null;
}

/* -------------------------------------------------- INICIALIZAR COLUMNAS -- */

/**
 * Asegura que existan las columnas base del pipeline.
 * Si la base está vacía, siembra las 5 columnas por defecto.
 */
export async function asegurarColumnasIniciales() {
  const user = await requireLevel(LEVEL.OWNER);

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
  const user = await requirePermission("tasks.manage");
  return withMutation(user, false, async (tx, afterCommit) => {
    const data = readTask(formData);
    if (data.brandId) assertBrandPermission(user, data.brandId, "tasks.manage");
    else if (user.role !== "OWNER" && data.assigneeId !== user.id) throw new Error("Las tareas sin marca solo pueden ser personales.");
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
  const user = await requirePermission("tasks.work");
  try {
    return await withMutation(user, false, async (tx, afterCommit) => {
      await assertTaskAccess(tx, user, field(formData, "id"), "tasks.work");
      const id = field(formData, "id");
      const step = await lockTaskStep(tx, id);
      await lockRevision(tx, "Task", id, formData);
      const before = await tx.task.findUniqueOrThrow({ where: { id } });
      const data = readTask(formData);
      if (!allows(user, "tasks.manage")) {
        if (data.brandId !== before.brandId || data.assigneeId !== before.assigneeId || data.title !== before.title || data.priority !== before.priority || data.kind !== before.kind || dateKey(data.dueDate) !== dateKey(before.dueDate)) throw new Error("Solo coordinación o producción pueden reasignar y planificar tareas.");
        // El formulario conserva el día visible sin normalizar fechas históricas al guardar avance.
        data.dueDate = before.dueDate;
      }
      if (data.brandId) assertBrandPermission(user, data.brandId, "tasks.work");
      else if (user.role !== "OWNER" && data.assigneeId !== user.id) throw new Error("La tarea sin marca debe ser personal.");
      const columnId = field(formData, "columnId") || before.columnId;
      await checkTaskRelations(tx, columnId, data.brandId, data.assigneeId);
      let message: string | undefined;
      if (step) {
        // Cadena de entregas: primero la persona y la fecha del paso; después la columna (= «Listo»).
        const notice = await syncEditToStep(tx, user, step, before, data);
        // Sin permiso para mover la fecha del video, el calendario sigue en la anterior: se avisa.
        if (notice) message = `Tarea guardada. ${notice}`;
        if (columnId !== before.columnId) await chainEvent(tx, user, { type: "TASK_MOVED", taskId: id, toColumnId: columnId });
        afterCommit(refrescarCadena);
      }
      const last = columnId !== before.columnId ? await tx.task.findFirst({ where: { columnId }, orderBy: { order: "desc" }, select: { order: true } }) : null;
      const task = await tx.task.update({ where: { id }, data: { ...data, columnId, ...(columnId !== before.columnId ? { order: (last?.order ?? -1) + 1 } : {}) } });
      await auditInTransaction(tx, { user, action: "EDITAR", entity: "Task", entityId: id, brandId: task.brandId, summary: `Editó la tarea "${task.title}"`, changes: diffFields(before, task, FIELD_LABELS) });
      afterCommit(refrescar);
      return { ok: true as const, task, ...(message ? { message } : {}) };
    });
  } catch (error) {
    // Cadena de entregas: el motivo del rechazo («Falta el enlace del material grabado»…) vuelve
    // al formulario como { error } y no se escribe nada. Sin cadena, nada cambia.
    if (error instanceof ProductionFlowError) return { ok: false as const, error: error.message };
    throw error;
  }
}

export async function moverTarea(taskId: string, targetColumnId: string, newOrder: number | undefined, expectedUpdatedAt: string) {
  const user = await requirePermission("tasks.work");
  return withMutation(user, false, async (tx, afterCommit) => {
    await assertTaskAccess(tx, user, taskId, "tasks.work");
    const step = await lockTaskStep(tx, taskId);
    await lockRevision(tx, "Task", taskId, expectedUpdatedAt);
    const before = await tx.task.findUniqueOrThrow({ where: { id: taskId } });
    await checkTaskRelations(tx, targetColumnId, before.brandId, before.assigneeId);
    if (step && targetColumnId !== before.columnId) {
      // Cadena de entregas: soltar en la última columna es el «Listo» del paso. Si su validación
      // falla, se lanza y la tarea no se mueve (el tablero la devuelve a su sitio).
      const moved = await chainEvent(tx, user, { type: "TASK_MOVED", taskId, toColumnId: targetColumnId });
      afterCommit(refrescarCadena);
      // El «Listo» ya dejó la tarea en «Listo» y lo auditó: no hace falta moverla otra vez.
      if (moved.done && newOrder === undefined) return { ok: true, task: await tx.task.findUniqueOrThrow({ where: { id: taskId } }) };
    }
    const last = await tx.task.findFirst({ where: { columnId: targetColumnId }, orderBy: { order: "desc" }, select: { order: true } });
    const order = boundedNumber(newOrder ?? (last?.order ?? -1) + 1, 0, 2147483647, "Orden", true);
    const task = await tx.task.update({ where: { id: taskId }, data: { columnId: targetColumnId, order } });
    await auditInTransaction(tx, { user, action: "EDITAR", entity: "Task", entityId: taskId, brandId: task.brandId, summary: `Movió la tarea "${task.title}"`, changes: diffFields(before, task, FIELD_LABELS) });
    afterCommit(refrescar);
    return { ok: true, task };
  });
}

/**
 * Igual que moverTarea, pero un rechazo de negocio vuelve como { ok: false, error } con el motivo
 * legible (p. ej. «Falta el enlace del material grabado»), para que el tablero lo muestre al
 * devolver la tarea a su columna. Los errores inesperados siguen lanzándose.
 */
export async function moverTareaConMotivo(taskId: string, targetColumnId: string, newOrder: number | undefined, expectedUpdatedAt: string) {
  try {
    return await moverTarea(taskId, targetColumnId, newOrder, expectedUpdatedAt);
  } catch (error) {
    const message = motivoLegible(error);
    if (message) return { ok: false as const, error: message };
    throw error;
  }
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
  const user = await requireLevel(LEVEL.OWNER);
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

/**
 * Cadena de entregas: «Listo» es la última columna por orden que admite cada marca (la usan
 * syncStepTask, el tablero, el Inicio y el invariante Q1). Una columna nueva entra justo antes
 * de esa columna, nunca detrás, para que «Listo» no cambie en silencio:
 *  - de una marca: antes de la última columna que admite esa marca;
 *  - global: antes de la última columna global (así queda por debajo del «Listo» de todas las
 *    marcas) o, sin columnas globales, antes del «Listo» más bajo de las marcas.
 * Devuelve el orden que toma la columna nueva, o null si no hay «Listo» que respetar.
 */
async function ordenAntesDeListo(tx: AppTransaction, brandId: string | null): Promise<number | null> {
  if (brandId) {
    const last = await tx.taskColumn.findFirst({ where: { OR: [{ brandId: null }, { brandId }] }, orderBy: [{ order: "desc" }, { id: "desc" }], select: { order: true } });
    return last?.order ?? null;
  }
  const global = await tx.taskColumn.findFirst({ where: { brandId: null }, orderBy: [{ order: "desc" }, { id: "desc" }], select: { order: true } });
  if (global) return global.order;
  const perBrand = await tx.taskColumn.groupBy({ by: ["brandId"], where: { brandId: { not: null } }, _max: { order: true } });
  const lows = perBrand.map((row) => row._max.order).filter((order): order is number => order !== null);
  return lows.length ? Math.min(...lows) : null;
}

/** ¿Esta columna es la «Listo» (la última por orden) de alguna marca? */
async function esColumnaListo(tx: AppTransaction, column: { id: string; brandId: string | null }): Promise<boolean> {
  const lastOf = (brandId: string | null) => tx.taskColumn.findFirst({
    where: brandId ? { OR: [{ brandId: null }, { brandId }] } : { brandId: null },
    orderBy: [{ order: "desc" }, { id: "desc" }],
    select: { id: true, order: true },
  });
  if (column.brandId) return (await lastOf(column.brandId))?.id === column.id;
  const global = await lastOf(null);
  if (global?.id !== column.id) return false;
  // Global: es «Listo» de toda marca que no tenga una columna propia por encima de ella.
  const above = await tx.taskColumn.findMany({
    where: { brandId: { not: null }, OR: [{ order: { gt: global.order } }, { order: global.order, id: { gt: global.id } }] },
    distinct: ["brandId"],
    select: { brandId: true },
  });
  const brands = await tx.brand.count();
  return !brands || above.length < brands;
}

export async function crearColumna(name: string, color: string, brandId?: string | null) {
  const user = await requireLevel(LEVEL.OWNER);
  if (!name.trim()) throw new Error("El nombre de la columna es obligatorio.");
  if (!/^#[a-f0-9]{6}$/i.test(color)) throw new Error("El color no es válido.");
  return withMutation(user, false, async (tx, afterCommit) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(781240110)`;
    // Con la cadena de entregas, la columna nueva entra antes de «Listo» (sin la cadena, al final, como siempre).
    const antes = productionChainConfigured() ? await ordenAntesDeListo(tx, brandId || null) : null;
    let order: number;
    if (antes !== null) {
      await tx.taskColumn.updateMany({ where: { order: { gte: antes } }, data: { order: { increment: 1 } } });
      order = antes;
    } else {
      const last = await tx.taskColumn.findFirst({ orderBy: { order: "desc" }, select: { order: true } });
      order = (last?.order ?? -1) + 1;
    }
    const column = await tx.taskColumn.create({ data: { name: name.trim(), color, brandId: brandId || null, order } });
    await auditInTransaction(tx, {
      user, action: "CREAR", entity: "TaskColumn", entityId: column.id, brandId: column.brandId,
      summary: antes !== null ? `Creó la columna "${column.name}" antes de «Listo» (cadena de entregas)` : `Creó la columna "${column.name}"`,
    });
    afterCommit(refrescar);
    if (antes !== null) afterCommit(refrescarCadena);
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
    // El bloqueo usa siempre el total real: borrar la columna borraría sus tareas (CASCADE), también las archivadas.
    const count = await tx.task.count({ where: { columnId } });
    if (count) {
      const epoch = archiveEpoch();
      // Archivo total: solo se nombran (y se piden mover) las tareas que el tablero muestra.
      const visibles = epoch ? await tx.task.count({ where: { AND: [{ columnId }, liveTask(epoch)] } }) : count;
      if (visibles) throw new Error(`La columna contiene ${visibles} tareas, incluidas las ocultas por filtros. Muévelas antes de eliminarla.`);
      throw new Error(COLUMNA_CON_ARCHIVADAS);
    }
    // Cadena de entregas: sin su «Listo», otra columna pasaría a serlo en silencio.
    if (productionChainConfigured() && await esColumnaListo(tx, column)) throw new Error(`"${column.name}" es la columna «Listo» de la cadena de entregas: ahí terminan las tareas de los pasos. Renómbrala en vez de eliminarla.`);
    await tx.taskColumn.delete({ where: { id: columnId } });
    await auditInTransaction(tx, { user, action: "ELIMINAR", entity: "TaskColumn", entityId: columnId, brandId: column.brandId, summary: `Eliminó la columna vacía "${column.name}"` });
  });

  refrescar();
  return { ok: true };
}

const COLUMNA_CON_ARCHIVADAS = "La columna guarda tareas archivadas (de marcas archivadas o anteriores a la renovación), así que no se puede eliminar. Si ya no te sirve, renómbrala.";

/**
 * Antes de eliminar una columna: cuántas tareas tiene. Con el archivo total encendido, `tasks` cuenta
 * solo las que el tablero muestra y `archived` avisa que además guarda tareas ocultas (sin decir
 * cuántas): esas no se pueden mover, así que la columna no se elimina. Apagado, lo de siempre.
 */
export async function revisarEliminacionColumna(columnId: string) {
  await requireLevel(LEVEL.OWNER);
  const epoch = archiveEpoch();
  if (!epoch) {
    const column = await prisma.taskColumn.findUniqueOrThrow({ where: { id: columnId }, select: { name: true, _count: { select: { tasks: true } } } });
    return { name: column.name, tasks: column._count.tasks, archived: false };
  }
  // Ocultas = total - visibles (un NOT sobre el filtro vivo no sirve: la marca NULL daría NULL en SQL).
  const [column, total] = await Promise.all([
    prisma.taskColumn.findUniqueOrThrow({ where: { id: columnId }, select: { name: true, _count: { select: { tasks: { where: liveTask(epoch) } } } } }),
    prisma.task.count({ where: { columnId } }),
  ]);
  const archived = total > column._count.tasks;
  return { name: column.name, tasks: column._count.tasks, archived, ...(archived ? { archivedMessage: COLUMNA_CON_ARCHIVADAS } : {}) };
}
