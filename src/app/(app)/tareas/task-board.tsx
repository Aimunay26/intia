"use client";

import { useActionState, useId, useEffect, useState, useTransition } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Filter,
  Lightbulb,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Tag,
  Trash2,
  User,
  Zap,
} from "lucide-react";

import {
  actualizarColumna,
  actualizarTarea,
  crearColumna,
  crearTarea,
  eliminarColumna,
  eliminarTarea,
  moverTarea,
} from "@/app/actions/tasks";
import Link from "next/link";
import { FilterSelect, SearchInput } from "@/components/filters";
import { TASK_KINDS, TASK_PRIORITIES } from "@/lib/tasks-constants";
import { Modal, SubmitButton } from "@/components/forms";
import { Avatar, Field } from "@/components/ui";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ TIPOS -- */

export type BoardUser = {
  id: string;
  name: string;
  color: string;
  avatarUrl?: string | null;
};

export type BoardBrand = {
  id: string;
  name: string;
  colorPrimary?: string;
};

export type BoardTask = {
  id: string;
  title: string;
  description: string | null;
  kind: string; // IDEA | ACCION
  priority: string; // BAJA | NORMAL | ALTA | URGENTE
  dueDate: Date | string | null;
  order: number;
  columnId: string;
  assigneeId: string | null;
  brandId: string | null;
  assignee?: BoardUser | null;
  brand?: BoardBrand | null;
  createdAt: Date | string;
};

export type BoardColumn = {
  id: string;
  name: string;
  color: string;
  order: number;
  brandId: string | null;
  tasks: BoardTask[];
  hasMore?: boolean;
};

const COLOR_PRESETS = [
  { name: "Púrpura", hex: "#8b5cf6" },
  { name: "Índigo", hex: "#6366f1" },
  { name: "Azul", hex: "#3b82f6" },
  { name: "Cian", hex: "#06b6d4" },
  { name: "Esmeralda", hex: "#10b981" },
  { name: "Ámbar", hex: "#f59e0b" },
  { name: "Rojo", hex: "#ef4444" },
  { name: "Rosa", hex: "#ec4899" },
  { name: "Gris", hex: "#64748b" },
];

/* --------------------------------------------------------------- COMPONENTE -- */

export function TaskBoard({
  initialColumns,
  users,
  brands,
  activeBrandId,
  loadMoreHref,
}: {
  initialColumns: BoardColumn[];
  users: BoardUser[];
  brands: BoardBrand[];
  activeBrandId?: string | null;
  loadMoreHref: string | null;
}) {
  const [columns, setColumns] = useState<BoardColumn[]>(initialColumns);
  const [isPending, startTransition] = useTransition();

  // Estados de modales
  const [creatingInColumnId, setCreatingInColumnId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<BoardTask | null>(null);
  const [editingColumn, setEditingColumn] = useState<BoardColumn | null>(null);
  const [isCreatingColumn, setIsCreatingColumn] = useState(false);

  // Sincronizar columnas iniciales si el servidor actualiza
  useEffect(() => {
    setColumns(initialColumns);
  }, [initialColumns]);

  /* ---------------------------------------------------- DRAG AND DROP -- */

  const handleDragStart = (e: React.DragEvent, taskId: string, sourceColId: string) => {
    e.dataTransfer.setData("text/plain", JSON.stringify({ taskId, sourceColId }));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, targetColId: string) => {
    e.preventDefault();
    try {
      const data = JSON.parse(e.dataTransfer.getData("text/plain"));
      if (!data?.taskId || !data?.sourceColId) return;
      if (data.sourceColId === targetColId) return;

      moverTareaEntreColumnas(data.taskId, targetColId);
    } catch {
      // Ignorar si el dato transferido no es válido
    }
  };

  const moverTareaEntreColumnas = (taskId: string, targetColId: string) => {
    setColumns((prev) => {
      let movedTask: BoardTask | null = null;
      const next = prev.map((col) => {
        const remaining = col.tasks.filter((t) => {
          if (t.id === taskId) {
            movedTask = { ...t, columnId: targetColId };
            return false;
          }
          return true;
        });
        return { ...col, tasks: remaining };
      });

      if (!movedTask) return prev;

      return next.map((col) => {
        if (col.id === targetColId) {
          return { ...col, tasks: [...col.tasks, movedTask!] };
        }
        return col;
      });
    });

    startTransition(async () => {
      await moverTarea(taskId, targetColId);
    });
  };

  const moverPaso = (task: BoardTask, step: number) => {
    const currentIndex = columns.findIndex((c) => c.id === task.columnId);
    const targetIndex = currentIndex + step;
    if (targetIndex < 0 || targetIndex >= columns.length) return;
    const targetCol = columns[targetIndex];
    moverTareaEntreColumnas(task.id, targetCol.id);
  };

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------ FILTROS SUPERIORES -- */}
      <div className="card-flat flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2.5 min-w-0 flex-1">
          <SearchInput placeholder="Buscar tareas…" param="q" width={250} />
          <FilterSelect param="tipo" allLabel="Ideas y acciones" options={[{ value: "IDEA", label: "Ideas" }, { value: "ACCION", label: "Acciones" }]} />
          <FilterSelect param="responsable" allLabel="Todos los encargados" options={[{ value: "UNASSIGNED", label: "Sin asignar" }, ...users.map((u) => ({ value: u.id, label: u.name }))]} />
          {!activeBrandId ? <FilterSelect param="sin_marca" allLabel="Con y sin marca" options={[{ value: "1", label: "Sin marca" }]} /> : null}

        </div>

        {/* Acciones principales */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsCreatingColumn(true)}
            className="btn btn-sm"
          >
            <Plus size={13} />
            Nueva columna
          </button>
          <button
            type="button"
            onClick={() => setCreatingInColumnId(columns[0]?.id || null)}
            className="btn btn-primary btn-sm"
          >
            <Plus size={13} />
            Nueva tarea
          </button>
        </div>
      </div>

      {/* ------------------------------------------------ TABLERO KANBAN -- */}
      <div className="flex gap-4 overflow-x-auto pb-4 pt-1 items-start min-h-[calc(100vh-250px)]">
        {columns.map((column, colIdx) => (
          <div
            key={column.id}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, column.id)}
            className="flex flex-col w-[300px] shrink-0 rounded-xl border border-[var(--line)] bg-[var(--surface-2)]/60 max-h-[calc(100vh-210px)]"
          >
            {/* Cabecera de la columna */}
            <div className="flex items-center justify-between p-3 border-b border-[var(--line)] bg-[var(--surface)]/70 rounded-t-xl">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="h-3 w-3 rounded-full shrink-0 shadow-xs"
                  style={{ backgroundColor: column.color }}
                />
                <h3 className="font-semibold text-[14px] text-ink truncate">
                  {column.name}
                </h3>
                <span className="text-[11px] font-bold text-inkmuted bg-[var(--surface-3)] px-1.5 py-0.5 rounded-full">
                  {column.tasks.length}{column.hasMore ? "+" : ""}
                </span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  title="Configurar columna (nombre y color)"
                  onClick={() => setEditingColumn(column)}
                  className="rounded p-1 text-inkmuted hover:text-ink hover:bg-[var(--surface-3)] transition-colors"
                >
                  <Pencil size={12.5} />
                </button>
                <button
                  type="button"
                  title="Añadir tarea a esta columna"
                  onClick={() => setCreatingInColumnId(column.id)}
                  className="rounded p-1 text-inkmuted hover:text-ink hover:bg-[var(--surface-3)] transition-colors"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>

            {/* Lista de tareas */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2.5 min-h-[140px]">
              {column.tasks.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--line)] p-4 text-center text-[12px] text-inkmuted">
                  No hay tareas en esta etapa
                </div>
              ) : (
                column.tasks.map((task) => {
                  const esIdea = task.kind === "IDEA";
                  const priorityDef = TASK_PRIORITIES.find((p) => p.value === task.priority);
                  const isOverdue =
                    task.dueDate &&
                    new Date(task.dueDate) < new Date(new Date().setHours(0, 0, 0, 0));

                  return (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, task.id, column.id)}
                      onClick={() => setEditingTask(task)}
                      className="group relative cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3 shadow-xs hover:border-[var(--brand)]/60 hover:shadow-sm transition-all"
                    >
                      {/* Cabecera de la tarjeta: Kind + Prioridad */}
                      <div className="flex items-center justify-between gap-1 mb-1.5 text-[11px]">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded-full",
                            esIdea
                              ? "bg-purple-500/10 text-purple-600 dark:text-purple-400"
                              : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                          )}
                        >
                          {esIdea ? <Lightbulb size={11} /> : <Zap size={11} />}
                          {esIdea ? "Idea" : "Acción"}
                        </span>

                        {priorityDef && priorityDef.value !== "NORMAL" && (
                          <span
                            className="text-[10.5px] font-bold px-1.5 py-0.2 rounded"
                            style={{
                              color: priorityDef.color,
                              backgroundColor: `${priorityDef.color}15`,
                            }}
                          >
                            {priorityDef.label}
                          </span>
                        )}
                      </div>

                      {/* Título */}
                      <h4 className="font-semibold text-[13.5px] text-ink leading-snug mb-1">
                        {task.title}
                      </h4>

                      {/* Descripción resumida */}
                      {task.description && (
                        <p className="text-[12px] text-inkmuted line-clamp-2 mb-2.5">
                          {task.description}
                        </p>
                      )}

                      {/* Footer de la tarjeta */}
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-[var(--line)]/60 text-[11.5px] text-inkmuted">
                        <div className="flex items-center gap-2">
                          {/* Fecha de vencimiento */}
                          {task.dueDate && (
                            <span
                              className={cn(
                                "flex items-center gap-1",
                                isOverdue ? "text-danger font-semibold" : "text-inkmuted"
                              )}
                              title={isOverdue ? "Tarea vencida" : "Fecha límite"}
                            >
                              <Calendar size={12} />
                              {new Date(task.dueDate).toLocaleDateString("es-ES", {
                                day: "numeric",
                                month: "short",
                              })}
                            </span>
                          )}

                          {/* Marca vinculada */}
                          {task.brand && (
                            <span
                              className="chip chip-plain text-[10.5px] px-1.5 py-0.2 max-w-[90px] truncate"
                              title={`Marca: ${task.brand.name}`}
                            >
                              {task.brand.name}
                            </span>
                          )}
                        </div>

                        {/* Encargado */}
                        <div>
                          {task.assignee ? (
                            <div
                              className="flex items-center gap-1 text-[11px] font-medium"
                              title={`Encargado: ${task.assignee.name}`}
                            >
                              <span
                                className="h-5 w-5 rounded-full grid place-items-center text-[10px] font-bold text-white uppercase"
                                style={{ backgroundColor: task.assignee.color }}
                              >
                                {task.assignee.name.slice(0, 2)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[11px] text-inkmuted/70 italic">
                              Sin asignar
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Botones de navegación rápida (hover) */}
                      <div
                        className="absolute right-2 top-2 hidden group-hover:flex items-center gap-0.5 bg-[var(--surface)]/95 border border-[var(--line)] rounded-md shadow-xs p-0.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {colIdx > 0 && (
                          <button
                            type="button"
                            title="Mover a la columna anterior"
                            onClick={() => moverPaso(task, -1)}
                            className="rounded p-1 text-inkmuted hover:text-ink hover:bg-[var(--surface-2)]"
                          >
                            <ArrowLeft size={11} />
                          </button>
                        )}
                        {colIdx < columns.length - 1 && (
                          <button
                            type="button"
                            title="Avanzar a la siguiente columna"
                            onClick={() => moverPaso(task, 1)}
                            className="rounded p-1 text-inkmuted hover:text-ink hover:bg-[var(--surface-2)]"
                          >
                            <ArrowRight size={11} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Pie de columna: Añadir rápido */}
            <div className="p-2 border-t border-[var(--line)]/50">
              <button
                type="button"
                onClick={() => setCreatingInColumnId(column.id)}
                className="w-full flex items-center justify-center gap-1.5 text-[12.5px] font-medium text-inkmuted hover:text-ink py-1.5 rounded-lg hover:bg-[var(--surface)] transition-colors"
              >
                <Plus size={13} />
                Añadir tarea
              </button>
            </div>
          </div>
        ))}
      </div>

      {loadMoreHref ? (
        <div className="flex justify-center py-3">
          <Link href={loadMoreHref} prefetch={false} scroll={false} className="btn">Mostrar 50 tareas más por columna</Link>
        </div>
      ) : null}

      {/* ------------------------------------------------ MODAL NUEVA TAREA -- */}
      {creatingInColumnId && (
        <Modal
          open={Boolean(creatingInColumnId)}
          onClose={() => setCreatingInColumnId(null)}
          title="Nueva tarea"
          description="Crea una idea o acción suelta para avanzar en el pipeline."
          width={540}
        >
          <form
            action={async (formData) => {
              await crearTarea(formData);
              setCreatingInColumnId(null);
            }}
            className="space-y-3.5"
          >
            <input type="hidden" name="columnId" value={creatingInColumnId} />

            {/* Tipo: Idea vs Acción */}
            <Field label="Tipo de tarea">
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2.5 p-2.5 rounded-lg border border-[var(--line)] cursor-pointer hover:bg-[var(--surface-2)] has-checked:border-[var(--brand)] has-checked:bg-[var(--brand)]/5">
                  <input
                    type="radio"
                    name="kind"
                    value="ACCION"
                    defaultChecked
                    className="accent-[var(--brand)]"
                  />
                  <div>
                    <div className="text-[13px] font-semibold text-ink flex items-center gap-1.5">
                      <Zap size={14} className="text-blue-500" />
                      Acción
                    </div>
                    <div className="text-[11.5px] text-inkmuted">
                      Tarea operativa o ejecución
                    </div>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 p-2.5 rounded-lg border border-[var(--line)] cursor-pointer hover:bg-[var(--surface-2)] has-checked:border-[var(--brand)] has-checked:bg-[var(--brand)]/5">
                  <input
                    type="radio"
                    name="kind"
                    value="IDEA"
                    className="accent-[var(--brand)]"
                  />
                  <div>
                    <div className="text-[13px] font-semibold text-ink flex items-center gap-1.5">
                      <Lightbulb size={14} className="text-amber-500" />
                      Idea
                    </div>
                    <div className="text-[11.5px] text-inkmuted">
                      Concepto o propuesta a evaluar
                    </div>
                  </div>
                </label>
              </div>
            </Field>

            <Field label="Título" required>
              <input
                name="title"
                required
                className="input"
                placeholder="Ej. Grabar b-roll del producto nuevo en exteriores"
                autoFocus
              />
            </Field>

            <Field label="Descripción o detalles">
              <textarea
                name="description"
                rows={3}
                className="textarea"
                placeholder="Añade notas, enlaces, requerimientos o instrucciones..."
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Encargado">
                <select name="assigneeId" className="select">
                  <option value="">Sin asignar</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Marca relacionada">
                <select
                  name="brandId"
                  className="select"
                  defaultValue={activeBrandId || ""}
                >
                  <option value="">Sin marca específica</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Prioridad">
                <select name="priority" className="select" defaultValue="NORMAL">
                  {TASK_PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Fecha límite (opcional)">
                <input name="dueDate" type="date" className="input" />
              </Field>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[var(--line)]">
              <button
                type="button"
                onClick={() => setCreatingInColumnId(null)}
                className="btn"
              >
                Cancelar
              </button>
              <SubmitButton pendingLabel="Creando...">Crear tarea</SubmitButton>
            </div>
          </form>
        </Modal>
      )}

      {/* ----------------------------------------------- MODAL EDITAR TAREA -- */}
      {editingTask && (
        <Modal
          open={Boolean(editingTask)}
          onClose={() => setEditingTask(null)}
          title="Editar tarea"
          description="Actualiza el estado, responsable o detalles de la tarea."
          width={540}
        >
          <form
            action={async (formData) => {
              await actualizarTarea(formData);
              setEditingTask(null);
            }}
            className="space-y-3.5"
          >
            <input type="hidden" name="id" value={editingTask.id} />

            {/* Etapa actual */}
            <Field label="Etapa en el pipeline">
              <select
                name="columnId"
                className="select"
                defaultValue={editingTask.columnId}
              >
                {columns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>

            {/* Tipo: Idea vs Acción */}
            <Field label="Tipo de tarea">
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2.5 p-2 rounded-lg border border-[var(--line)] cursor-pointer hover:bg-[var(--surface-2)] has-checked:border-[var(--brand)] has-checked:bg-[var(--brand)]/5">
                  <input
                    type="radio"
                    name="kind"
                    value="ACCION"
                    defaultChecked={editingTask.kind === "ACCION"}
                    className="accent-[var(--brand)]"
                  />
                  <div className="text-[13px] font-semibold text-ink flex items-center gap-1.5">
                    <Zap size={13} className="text-blue-500" />
                    Acción
                  </div>
                </label>

                <label className="flex items-center gap-2.5 p-2 rounded-lg border border-[var(--line)] cursor-pointer hover:bg-[var(--surface-2)] has-checked:border-[var(--brand)] has-checked:bg-[var(--brand)]/5">
                  <input
                    type="radio"
                    name="kind"
                    value="IDEA"
                    defaultChecked={editingTask.kind === "IDEA"}
                    className="accent-[var(--brand)]"
                  />
                  <div className="text-[13px] font-semibold text-ink flex items-center gap-1.5">
                    <Lightbulb size={13} className="text-amber-500" />
                    Idea
                  </div>
                </label>
              </div>
            </Field>

            <Field label="Título" required>
              <input
                name="title"
                required
                className="input"
                defaultValue={editingTask.title}
              />
            </Field>

            <Field label="Descripción">
              <textarea
                name="description"
                rows={3}
                className="textarea"
                defaultValue={editingTask.description || ""}
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Encargado">
                <select
                  name="assigneeId"
                  className="select"
                  defaultValue={editingTask.assigneeId || ""}
                >
                  <option value="">Sin asignar</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Marca">
                <select
                  name="brandId"
                  className="select"
                  defaultValue={editingTask.brandId || ""}
                >
                  <option value="">Sin marca</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Prioridad">
                <select
                  name="priority"
                  className="select"
                  defaultValue={editingTask.priority}
                >
                  {TASK_PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Fecha límite">
                <input
                  name="dueDate"
                  type="date"
                  className="input"
                  defaultValue={
                    editingTask.dueDate
                      ? new Date(editingTask.dueDate).toISOString().split("T")[0]
                      : ""
                  }
                />
              </Field>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-[var(--line)]">
              <button
                type="button"
                onClick={async () => {
                  if (confirm("¿Seguro que deseas eliminar esta tarea?")) {
                    await eliminarTarea(editingTask.id);
                    setEditingTask(null);
                  }
                }}
                className="btn btn-sm text-danger hover:bg-danger/10 border-transparent"
              >
                <Trash2 size={13} />
                Eliminar tarea
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditingTask(null)}
                  className="btn"
                >
                  Cancelar
                </button>
                <SubmitButton pendingLabel="Guardando...">Guardar cambios</SubmitButton>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* --------------------------------------------- MODAL EDITAR COLUMNA -- */}
      {editingColumn && (
        <Modal
          open={Boolean(editingColumn)}
          onClose={() => setEditingColumn(null)}
          title="Configurar columna de pipeline"
          description="Personaliza el nombre y el color de esta etapa del flujo de trabajo."
          width={460}
        >
          <form
            action={async (formData) => {
              const name = formData.get("name") as string;
              const color = formData.get("color") as string;
              await actualizarColumna(editingColumn.id, name, color);
              setEditingColumn(null);
            }}
            className="space-y-4"
          >
            <Field label="Nombre de la etapa" required>
              <input
                name="name"
                required
                className="input"
                defaultValue={editingColumn.name}
              />
            </Field>

            <Field label="Color distintivo">
              <div className="space-y-2.5">
                <div className="flex flex-wrap gap-2">
                  {COLOR_PRESETS.map((preset) => (
                    <label
                      key={preset.hex}
                      className="cursor-pointer flex items-center gap-1.5 text-[12px] p-1.5 rounded-md border border-[var(--line)] hover:bg-[var(--surface-2)]"
                    >
                      <input
                        type="radio"
                        name="color"
                        value={preset.hex}
                        defaultChecked={editingColumn.color === preset.hex}
                        className="sr-only"
                        onChange={(e) => {
                          const input = document.getElementById("custom-hex-col") as HTMLInputElement;
                          if (input) input.value = e.target.value;
                        }}
                      />
                      <span
                        className="h-4 w-4 rounded-full shadow-xs"
                        style={{ backgroundColor: preset.hex }}
                      />
                      <span>{preset.name}</span>
                    </label>
                  ))}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[12px] text-inkmuted">Hexadecimal:</span>
                  <input
                    id="custom-hex-col"
                    name="color"
                    type="text"
                    className="input py-1 text-[12px] max-w-[120px] font-mono"
                    defaultValue={editingColumn.color}
                  />
                </div>
              </div>
            </Field>

            <div className="flex items-center justify-between pt-3 border-t border-[var(--line)]">
              {columns.length > 1 ? (
                <button
                  type="button"
                  onClick={async () => {
                    if (
                      confirm(
                        `¿Eliminar la columna "${editingColumn.name}"? Sus tareas también se eliminarán.`
                      )
                    ) {
                      await eliminarColumna(editingColumn.id);
                      setEditingColumn(null);
                    }
                  }}
                  className="btn btn-sm text-danger hover:bg-danger/10 border-transparent"
                >
                  <Trash2 size={13} />
                  Eliminar columna
                </button>
              ) : (
                <div />
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditingColumn(null)}
                  className="btn"
                >
                  Cancelar
                </button>
                <SubmitButton pendingLabel="Guardando...">Guardar</SubmitButton>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* ---------------------------------------------- MODAL NUEVA COLUMNA -- */}
      {isCreatingColumn && (
        <Modal
          open={isCreatingColumn}
          onClose={() => setIsCreatingColumn(false)}
          title="Nueva columna de pipeline"
          description="Añade una etapa adicional a tu flujo de tareas tipo Trello."
          width={460}
        >
          <form
            action={async (formData) => {
              const name = formData.get("name") as string;
              const color = formData.get("color") as string;
              await crearColumna(name, color, activeBrandId || null);
              setIsCreatingColumn(false);
            }}
            className="space-y-4"
          >
            <Field label="Nombre de la nueva etapa" required>
              <input
                name="name"
                required
                className="input"
                placeholder="Ej. Revisión final / Aprobación"
                autoFocus
              />
            </Field>

            <Field label="Color distintivo">
              <div className="space-y-2.5">
                <div className="flex flex-wrap gap-2">
                  {COLOR_PRESETS.map((preset, i) => (
                    <label
                      key={preset.hex}
                      className="cursor-pointer flex items-center gap-1.5 text-[12px] p-1.5 rounded-md border border-[var(--line)] hover:bg-[var(--surface-2)]"
                    >
                      <input
                        type="radio"
                        name="color"
                        value={preset.hex}
                        defaultChecked={i === 0}
                        className="sr-only"
                      />
                      <span
                        className="h-4 w-4 rounded-full shadow-xs"
                        style={{ backgroundColor: preset.hex }}
                      />
                      <span>{preset.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </Field>

            <div className="flex justify-end gap-2 pt-3 border-t border-[var(--line)]">
              <button
                type="button"
                onClick={() => setIsCreatingColumn(false)}
                className="btn"
              >
                Cancelar
              </button>
              <SubmitButton pendingLabel="Creando...">Crear columna</SubmitButton>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
