"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { Save } from "lucide-react";

import {
  actualizarEstructura,
  crearEstructura,
  type StructureState,
} from "@/app/actions/structures";
import { AI_MODELS, AI_PROVIDERS, STRUCTURE_CATEGORIES } from "@/lib/constants";
import { Callout, Field } from "@/components/ui";
import { Modal, SubmitButton } from "@/components/forms";

export type StructureFormValues = {
  id: string;
  name: string;
  category: string;
  family: string;
  summary: string;
  defaultDurationSec: number;
  defaultProvider: string;
  defaultModel: string;
  temperature: number;
  active: boolean;
};

const VACIA: StructureFormValues = {
  id: "",
  name: "",
  category: "VENDE",
  family: "",
  summary: "",
  defaultDurationSec: 45,
  defaultProvider: "anthropic",
  defaultModel: "",
  temperature: 1,
  active: true,
};

/**
 * Alta y edición de la ficha de una estructura.
 * Los beats, el prompt y los ejemplos se editan dentro de la ficha,
 * porque son el trabajo fino de cada formato.
 */
export function StructureForm({
  mode,
  structure,
  triggerLabel,
  triggerIcon,
  triggerClassName = "btn btn-primary",
}: {
  mode: "crear" | "editar";
  structure?: StructureFormValues;
  triggerLabel: string;
  triggerIcon?: React.ReactNode;
  triggerClassName?: string;
}) {
  const value = structure ?? VACIA;
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState(value.defaultProvider);
  const [category, setCategory] = useState(value.category);
  const listId = useId();

  const [state, formAction] = useActionState<StructureState, FormData>(
    mode === "editar" ? actualizarEstructura : crearEstructura,
    null
  );

  // Al guardar bien, se cierra sola. Al crear, la acción redirige a la ficha.
  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);

  const categoryOption = STRUCTURE_CATEGORIES.find((c) => c.value === category);
  const models = AI_MODELS[provider] ?? [];

  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => setOpen(true)}>
        {triggerIcon}
        {triggerLabel}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={mode === "editar" ? "Editar la ficha" : "Nueva estructura"}
        description={
          mode === "editar"
            ? "Los beats, el prompt y los ejemplos se editan en las pestañas de la ficha."
            : "Créala primero y luego arma su secuencia de beats y su prompt."
        }
        width={620}
      >
        <form action={formAction} className="space-y-4">
          {mode === "editar" ? <input type="hidden" name="id" value={value.id} /> : null}

          <Field label="Nombre del formato" required>
            <input
              name="name"
              className="input"
              defaultValue={value.name}
              placeholder="Ej. Plot twist con producto al final"
              required
              autoFocus
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Categoría" hint={categoryOption?.description} required>
              <select
                name="category"
                className="select"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {STRUCTURE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Familia" hint="Cómo lo llama el equipo: UGC, PAS, Camaleón, Sketch…">
              <input
                name="family"
                className="input"
                defaultValue={value.family}
                placeholder="Ej. Camaleón"
              />
            </Field>
          </div>

          <Field
            label="Resumen"
            hint="Una o dos frases: en qué consiste el formato y por qué funciona."
          >
            <textarea
              name="summary"
              className="textarea"
              rows={3}
              defaultValue={value.summary}
              placeholder="Ej. Arranca con un golpe visual raro, sostiene la duda 15 segundos y revienta con un giro donde aparece el producto."
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Duración por defecto" hint="Segundos">
              <input
                name="defaultDurationSec"
                type="number"
                min={5}
                max={600}
                className="input"
                defaultValue={value.defaultDurationSec}
              />
            </Field>

            <Field label="Proveedor de IA">
              <select
                name="defaultProvider"
                className="select"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              >
                {AI_PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Temperatura" hint="Solo la usa Gemini.">
              <input
                name="temperature"
                type="number"
                step="0.1"
                min={0}
                max={2}
                className="input"
                defaultValue={value.temperature}
              />
            </Field>
          </div>

          <Field
            label="Modelo por defecto"
            hint="Texto libre: si sale un modelo nuevo, escríbelo aquí. Vacío usa el de Ajustes."
          >
            <input
              name="defaultModel"
              className="input input-mono"
              list={listId}
              defaultValue={value.defaultModel}
              placeholder="Ej. claude-opus-5"
            />
            <datalist id={listId}>
              {models.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </datalist>
          </Field>

          <label className="flex cursor-pointer items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              name="active"
              defaultChecked={value.active}
              className="accent-brand h-3.5 w-3.5 cursor-pointer"
            />
            <span className="text-inksoft">
              Activa: aparece como opción en el generador de guiones.
            </span>
          </label>

          {state?.error ? <Callout tone="danger">{state.error}</Callout> : null}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <SubmitButton
              className="btn btn-primary"
              icon={<Save size={14} />}
              pendingLabel="Guardando…"
            >
              {mode === "editar" ? "Guardar cambios" : "Crear estructura"}
            </SubmitButton>
          </div>
        </form>
      </Modal>
    </>
  );
}
