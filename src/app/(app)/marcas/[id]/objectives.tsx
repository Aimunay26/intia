"use client";

import { useState } from "react";
import { AlertTriangle, Pencil, Plus, Target, Trash2, X } from "lucide-react";

import {
  OBJECTIVE_PERIODS,
  OBJECTIVE_STATUSES,
  OBJECTIVE_STATUS_MAP,
} from "@/lib/constants";
import {
  clamp,
  formatDate,
  formatNumber,
  fromDateKey,
  objectiveProgress,
} from "@/lib/utils";
import { Badge, EmptyState, Field, ProgressBar } from "@/components/ui";
import { DeleteButton, SubmitButton } from "@/components/forms";
import {
  actualizarObjetivo,
  crearObjetivo,
  eliminarObjetivo,
} from "@/app/actions/brands";

export type ObjectiveRow = {
  id: string;
  name: string;
  description: string | null;
  metricKey: string | null;
  unit: string;
  currentValue: number;
  targetValue: number;
  baselineValue: number;
  period: string;
  /** yyyy-mm-dd o "" */
  deadline: string;
  /** yyyy-mm-dd: sirve para medir cuánto plazo queda */
  createdAt: string;
  status: string;
  higherIsBetter: boolean;
  sortOrder: number;
};

/** Cuánto queda del plazo, de 1 (recién creado) a 0 (se acabó el tiempo). */
function plazoRestante(o: ObjectiveRow): number | null {
  if (!o.deadline) return null;
  const inicio = fromDateKey(o.createdAt).getTime();
  const fin = fromDateKey(o.deadline).getTime();
  const total = fin - inicio;
  if (total <= 0) return 0;
  return clamp((fin - Date.now()) / total, -1, 1);
}

/**
 * Regla del contrato: se marca EN RIESGO en pantalla cuando queda menos
 * del 30% del plazo y el avance va por debajo del 60%.
 */
function calcularRiesgo(o: ObjectiveRow, avance: number): boolean {
  if (o.status === "LOGRADO" || o.status === "PAUSADO") return false;
  // Si alguien ya lo marcó a mano como en riesgo, se respeta.
  if (o.status === "EN_RIESGO") return true;
  const restante = plazoRestante(o);
  if (restante === null) return false;
  return restante < 0.3 && avance < 60;
}

function num(value: number) {
  return formatNumber(value, Number.isInteger(value) ? 0 : 1);
}

/* ------------------------------------------------------------- CAMPOS -- */

function ObjectiveFields({ value }: { value?: ObjectiveRow }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Objetivo" required className="sm:col-span-2">
          <input
            name="name"
            className="input"
            required
            defaultValue={value?.name ?? ""}
            placeholder="Ej. Llegar a 50 000 seguidores en TikTok"
          />
        </Field>
        <Field label="Unidad" hint="seguidores, %, S/…">
          <input
            name="unit"
            className="input"
            defaultValue={value?.unit ?? ""}
            placeholder="seguidores"
          />
        </Field>
        <Field label="Métrica" hint="views, followers, leads, roas…">
          <input
            name="metricKey"
            className="input input-mono"
            defaultValue={value?.metricKey ?? ""}
            placeholder="followers"
          />
        </Field>

        <Field label="Punto de partida">
          <input
            type="number"
            step="any"
            name="baselineValue"
            className="input"
            defaultValue={value?.baselineValue ?? 0}
          />
        </Field>
        <Field label="Valor actual">
          <input
            type="number"
            step="any"
            name="currentValue"
            className="input"
            defaultValue={value?.currentValue ?? 0}
          />
        </Field>
        <Field label="Meta" required>
          <input
            type="number"
            step="any"
            name="targetValue"
            className="input"
            required
            defaultValue={value?.targetValue ?? 0}
          />
        </Field>
        <Field label="Fecha límite">
          <input
            type="date"
            name="deadline"
            className="input"
            defaultValue={value?.deadline ?? ""}
          />
        </Field>

        <Field label="Periodo">
          <select name="period" className="select" defaultValue={value?.period ?? "MENSUAL"}>
            {OBJECTIVE_PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Estado">
          <select name="status" className="select" defaultValue={value?.status ?? "EN_CURSO"}>
            {OBJECTIVE_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Orden" hint="Menor número, más arriba.">
          <input
            type="number"
            name="sortOrder"
            className="input"
            defaultValue={value?.sortOrder ?? 0}
          />
        </Field>
        <Field label="Dirección">
          <label className="border-line bg-surface2 flex h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-[12.5px]">
            <input
              type="checkbox"
              name="higherIsBetter"
              defaultChecked={value ? value.higherIsBetter : true}
              className="accent-brand h-3.5 w-3.5 cursor-pointer"
            />
            <span className="text-inksoft">Más es mejor</span>
          </label>
        </Field>
      </div>

      <Field label="Notas" className="mt-3">
        <textarea
          name="description"
          className="textarea"
          rows={2}
          defaultValue={value?.description ?? ""}
          placeholder="Cómo se mide, de dónde sale el número, quién lo revisa…"
        />
      </Field>
    </>
  );
}

/* -------------------------------------------------------------- PANEL -- */

export function ObjectivesPanel({
  brandId,
  objectives,
  canEdit,
  canDelete,
}: {
  brandId: string;
  objectives: ObjectiveRow[];
  canEdit: boolean;
  /** Eliminar es solo del dueño; editar y crear son del equipo. */
  canDelete: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const enRiesgo = objectives.filter((o) =>
    calcularRiesgo(
      o,
      objectiveProgress(o.currentValue, o.targetValue, o.baselineValue, o.higherIsBetter)
    )
  ).length;

  return (
    <div className="card">
      <div className="card-hd">
        <div className="min-w-0">
          <div className="card-title flex items-center gap-2">
            <Target size={14} className="text-inkmuted" />
            Objetivos de la marca
          </div>
          <div className="card-sub mt-0.5">
            {objectives.length === 0
              ? "Números concretos con fecha, no buenas intenciones."
              : `${objectives.length} en total${enRiesgo ? ` · ${enRiesgo} en riesgo` : ""}`}
          </div>
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={() => {
              setAdding((v) => !v);
              setEditingId(null);
            }}
            className="btn btn-sm"
          >
            {adding ? <X size={13} /> : <Plus size={13} />}
            {adding ? "Cancelar" : "Nuevo objetivo"}
          </button>
        ) : null}
      </div>

      {adding && canEdit ? (
        <form
          action={crearObjetivo}
          onSubmit={() => setAdding(false)}
          className="border-line bg-surface2 fade-in border-b p-4"
        >
          <input type="hidden" name="brandId" value={brandId} />
          <ObjectiveFields />
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setAdding(false)} className="btn btn-sm">
              Cancelar
            </button>
            <SubmitButton className="btn btn-primary btn-sm" pendingLabel="Guardando…">
              Añadir objetivo
            </SubmitButton>
          </div>
        </form>
      ) : null}

      {objectives.length === 0 ? (
        <EmptyState
          icon={<Target size={19} />}
          title="Todavía no hay objetivos"
          description={
            canEdit
              ? "Define metas medibles con fecha límite: seguidores, ventas, leads o vistas. El panel avisa cuando una se atrasa."
              : "Cuando el equipo defina metas para esta marca, aparecerán aquí."
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th className="min-w-[220px]">Objetivo</th>
                <th className="min-w-[150px]">Avance</th>
                <th className="text-right">Actual</th>
                <th className="text-right">Meta</th>
                <th>Periodo</th>
                <th>Límite</th>
                <th>Estado</th>
                {canEdit ? <th className="w-[92px]" /> : null}
              </tr>
            </thead>
            <tbody>
              {objectives.map((o) => {
                const avance = objectiveProgress(
                  o.currentValue,
                  o.targetValue,
                  o.baselineValue,
                  o.higherIsBetter
                );
                const riesgo = calcularRiesgo(o, avance);
                const estado = riesgo && o.status === "EN_CURSO" ? "EN_RIESGO" : o.status;
                const color =
                  estado === "LOGRADO"
                    ? "var(--ok)"
                    : estado === "EN_RIESGO"
                      ? "var(--danger)"
                      : "var(--brand)";

                if (editingId === o.id && canEdit) {
                  return (
                    <tr key={o.id}>
                      <td colSpan={canEdit ? 8 : 7} className="bg-surface2 p-4">
                        <form
                          action={actualizarObjetivo}
                          onSubmit={() => setEditingId(null)}
                          className="fade-in"
                        >
                          <input type="hidden" name="id" value={o.id} />
                          <ObjectiveFields value={o} />
                          <div className="mt-3 flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="btn btn-sm"
                            >
                              Cancelar
                            </button>
                            <SubmitButton
                              className="btn btn-primary btn-sm"
                              pendingLabel="Guardando…"
                            >
                              Guardar objetivo
                            </SubmitButton>
                          </div>
                        </form>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={o.id}>
                    <td>
                      <div className="text-ink font-semibold">{o.name}</div>
                      {o.description ? (
                        <div className="text-inkmuted mt-0.5 text-[11.5px] leading-snug">
                          {o.description}
                        </div>
                      ) : null}
                      {o.metricKey ? (
                        <div className="text-inkmuted mt-0.5 font-mono text-[11px]">
                          {o.metricKey}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <ProgressBar value={avance} color={color} />
                      <div className="text-inkmuted mt-1 flex items-center gap-1.5 text-[11.5px]">
                        <span className="font-semibold" style={{ color }}>
                          {formatNumber(avance, 0)}%
                        </span>
                        {!o.higherIsBetter ? <span>· menos es mejor</span> : null}
                      </div>
                    </td>
                    <td className="text-right font-semibold">
                      {num(o.currentValue)}
                      {o.unit ? (
                        <span className="text-inkmuted font-normal"> {o.unit}</span>
                      ) : null}
                    </td>
                    <td className="text-right">
                      {num(o.targetValue)}
                      {o.unit ? (
                        <span className="text-inkmuted"> {o.unit}</span>
                      ) : null}
                    </td>
                    <td className="text-inkmuted">
                      {OBJECTIVE_PERIODS.find((p) => p.value === o.period)?.label ?? o.period}
                    </td>
                    <td className="text-inkmuted whitespace-nowrap">
                      {o.deadline ? formatDate(fromDateKey(o.deadline)) : "—"}
                    </td>
                    <td>
                      <span
                        className="inline-flex items-center gap-1"
                        title={
                          riesgo && o.status === "EN_CURSO"
                            ? "Queda menos del 30% del plazo y el avance no llega al 60%."
                            : undefined
                        }
                      >
                        <Badge option={OBJECTIVE_STATUS_MAP[estado]} fallback={estado} />
                        {riesgo && o.status === "EN_CURSO" ? (
                          <AlertTriangle size={12} className="text-danger" />
                        ) : null}
                      </span>
                    </td>
                    {canEdit ? (
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(o.id);
                              setAdding(false);
                            }}
                            className="btn btn-ghost btn-icon"
                            title="Editar objetivo"
                          >
                            <Pencil size={14} />
                          </button>
                          {canDelete ? (
                            <DeleteButton
                              action={eliminarObjetivo}
                              id={o.id}
                              label=""
                              icon={<Trash2 size={14} />}
                              className="btn btn-ghost btn-icon text-danger"
                              title="¿Eliminar este objetivo?"
                              description={`Se borrará "${o.name}" y su historial de metas. Esta acción no se puede deshacer.`}
                            />
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
