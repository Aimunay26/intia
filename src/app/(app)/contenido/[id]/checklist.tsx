"use client";

import { CheckSquare, Plus, X } from "lucide-react";

import { alternarCheck, crearCheck, eliminarCheck } from "@/app/actions/content";
import { CHECKLIST_STAGES, CHECKLIST_STAGE_MAP } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Avatar, Card, CardHeader, EmptyState, Field, ProgressBar } from "@/components/ui";
import { AutoSubmitCheckbox, Collapsible, SubmitButton } from "@/components/forms";
import { ReopenApprovalForm } from "@/components/reopen-approval-form";
import { isFinalApproval } from "@/lib/permissions";

/**
 * Checklist de produccion del video, agrupado por etapa.
 * Cada casilla envia su propio formulario al cambiar, sin botones de guardar.
 */

export type CheckRow = {
  id: string;
  label: string;
  stage: string;
  done: boolean;
  required: boolean;
  doneByName: string | null;
  doneByColor: string | null;
  /** Ya viene formateado desde el servidor: "Ana Torres, 12 mar". */
  doneLabel: string | null;
};

export function Checklist({
  contentItemId,
  items,
  canEdit,
  canManage,
}: {
  contentItemId: string;
  items: CheckRow[];
  canEdit: boolean;
  canManage: boolean;
}) {
  const total = items.length;
  const hechos = items.filter((c) => c.done).length;
  const avance = total ? (hechos / total) * 100 : 0;
  const pendientesObligatorios = items.filter((c) => !c.done && c.required).length;

  return (
    <Card>
      <CardHeader
        title="Checklist de producción"
        subtitle={
          total
            ? pendientesObligatorios
              ? `${pendientesObligatorios} paso${
                  pendientesObligatorios === 1 ? "" : "s"
                } obligatorio${pendientesObligatorios === 1 ? "" : "s"} sin cerrar`
              : "Todos los pasos obligatorios están cerrados"
            : "Sin pasos definidos"
        }
        icon={<CheckSquare size={15} />}
        actions={
          <span className="text-ink text-[13px] font-bold tabular-nums">
            {hechos}/{total}
          </span>
        }
      />

      <div className="px-4 pt-3.5">
        <ProgressBar
          value={avance}
          height={6}
          color={avance >= 100 ? "var(--ok)" : "var(--brand)"}
        />
      </div>

      {total === 0 ? (
        <EmptyState
          icon={<CheckSquare size={18} />}
          title="Este video no tiene checklist"
          description="Añade los pasos que hay que cerrar antes de publicarlo."
        />
      ) : (
        <div className="divide-line divide-y">
          {CHECKLIST_STAGES.map((stage) => {
            const delEtapa = items.filter((c) => c.stage === stage.value);
            if (!delEtapa.length) return null;
            const cerrados = delEtapa.filter((c) => c.done).length;

            return (
              <div key={stage.value} className="px-4 py-3">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className={cn("chip", stage.chip)}>{stage.label}</span>
                  <span className="text-inkmuted text-[11.5px] font-semibold tabular-nums">
                    {cerrados}/{delEtapa.length}
                  </span>
                </div>

                <div className="space-y-0.5">
                  {delEtapa.map((c) => (
                    <CheckLinea key={c.id} item={c} canEdit={canEdit} canManage={canManage} />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Etapas fuera del catalogo, por si alguien creo un check con otra etapa. */}
          {(() => {
            const sueltos = items.filter((c) => !CHECKLIST_STAGE_MAP[c.stage]);
            if (!sueltos.length) return null;
            return (
              <div className="px-4 py-3">
                <div className="mb-1.5">
                  <span className="chip chip-plain">Otros</span>
                </div>
                <div className="space-y-0.5">
                  {sueltos.map((c) => (
                    <CheckLinea key={c.id} item={c} canEdit={canEdit} canManage={canManage} />
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {canEdit ? (
        <div className="border-line border-t px-4 py-3">
          <Collapsible
            triggerClassName="btn btn-sm"
            trigger={
              <>
                <Plus size={13} /> Añadir paso
              </>
            }
          >
            <NuevoCheckForm contentItemId={contentItemId} />
          </Collapsible>
        </div>
      ) : null}
    </Card>
  );
}

/* ------------------------------------------------------------------ LINEA -- */

function CheckLinea({
  item,
  canEdit,
  canManage,
}: {
  item: CheckRow;
  canEdit: boolean;
  canManage: boolean;
}) {
  return (
    <div className="group flex items-start gap-2.5 rounded-lg py-1 pr-1">
      <form action={alternarCheck} className="mt-[3px] shrink-0">
        <input type="hidden" name="id" value={item.id} />
        {canEdit && !(item.done && isFinalApproval(item.stage, item.label)) ? (
          <AutoSubmitCheckbox name="done" defaultChecked={item.done} />
        ) : (
          <input
            type="checkbox"
            checked={item.done}
            disabled
            readOnly
            className="accent-brand h-3.5 w-3.5"
            aria-label={item.label}
          />
        )}
      </form>

      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "text-[13px] leading-snug",
            item.done ? "text-inkmuted line-through" : "text-ink"
          )}
        >
          {item.label}
          {!item.required ? (
            <span className="text-inkmuted ml-1.5 text-[10.5px] font-semibold">opcional</span>
          ) : null}
        </div>
        {canEdit && item.done && isFinalApproval(item.stage, item.label) ? <ReopenApprovalForm id={item.id} /> : null}

        {item.done && item.doneByName ? (
          <div className="mt-1 flex items-center gap-1.5">
            <Avatar name={item.doneByName} color={item.doneByColor ?? "#64748b"} size={15} />
            <span className="text-inkmuted text-[11px] leading-none">{item.doneLabel}</span>
          </div>
        ) : null}
      </div>

      {canManage ? (
        <form action={eliminarCheck} className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
          <input type="hidden" name="id" value={item.id} />
          <button
            type="submit"
            className="btn btn-ghost btn-icon h-6 w-6"
            title="Quitar este paso"
            aria-label={`Quitar el paso ${item.label}`}
          >
            <X size={12} />
          </button>
        </form>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------ NUEVO CHECK -- */

function NuevoCheckForm({ contentItemId }: { contentItemId: string }) {
  return (
    <form action={crearCheck} className="bg-surface2 border-line space-y-3 rounded-xl border p-3">
      <input type="hidden" name="contentItemId" value={contentItemId} />
      <div className="grid gap-3 sm:grid-cols-[1fr_170px]">
        <Field label="Paso">
          <input
            name="label"
            className="input"
            placeholder="Ej. Miniatura aprobada"
            required
            autoFocus
          />
        </Field>
        <Field label="Etapa">
          <select name="stage" className="select" defaultValue="GENERAL">
            {CHECKLIST_STAGES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="flex items-center justify-between gap-3">
        <label className="text-inksoft flex cursor-pointer items-center gap-2 text-[12.5px]">
          <input type="checkbox" name="required" defaultChecked className="accent-brand h-3.5 w-3.5" />
          Obligatorio para publicar
        </label>
        <SubmitButton className="btn btn-primary btn-sm" icon={<Plus size={13} />} pendingLabel="Añadiendo…">
          Añadir
        </SubmitButton>
      </div>
    </form>
  );
}
