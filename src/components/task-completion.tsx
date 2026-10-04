"use client";
import { cambiarEstadoTarea } from "@/app/actions/tasks";
import { EditForm, RevisionField } from "@/components/edit-form";
import { SubmitButton } from "@/components/forms";

export function TaskCompletion({ task, onSuccess }: { task: { id: string; status: string; updatedAt: Date | string; completedAt?: Date | string | null; productionStep?: { contentItemId: string } | null }; onSuccess?: () => void }) {
  const done = task.status === "HECHO";
  return <div className="space-y-2 py-3">
    <p className="text-sm font-semibold">Estado: {done ? "Terminada" : task.status === "CANCELADO" ? "Cancelada" : "Pendiente"}</p>
    {task.productionStep ? <a href={`/contenido/${task.productionStep.contentItemId}`} className="btn btn-sm">Abrir paso de producción</a> :
      <EditForm action={cambiarEstadoTarea} onSuccess={onSuccess}>
        <input type="hidden" name="id" value={task.id} />
        <input type="hidden" name="status" value={done ? "PENDIENTE" : "HECHO"} />
        <RevisionField value={task.updatedAt} />
        <SubmitButton pendingLabel="Guardando…">{done ? "Reabrir tarea" : "Marcar como terminada"}</SubmitButton>
      </EditForm>}
  </div>;
}
