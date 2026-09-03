"use client";

import { useState } from "react";
import { Check, Plus } from "lucide-react";

import { crearArquetipo } from "@/app/actions/archetypes";
import { PALETTE } from "@/lib/constants";
import { cn, readableOn } from "@/lib/utils";
import { Field } from "@/components/ui";
import { Modal, SubmitButton } from "@/components/forms";

/** Etiquetas del 1 al 5 para el nivel de energía frente a cámara. */
export const ENERGY_LEVELS = [
  "Muy calmado",
  "Tranquilo",
  "Equilibrado",
  "Muy energético",
  "Explosivo",
];

/* ---------------------------------------------------------------- COLOR -- */

/** Paleta de colores con un campo oculto: funciona dentro de cualquier form. */
export function ColorPicker({
  name = "color",
  defaultValue = "#0ea5e9",
}: {
  name?: string;
  defaultValue?: string;
}) {
  const [color, setColor] = useState(defaultValue);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name={name} value={color} />
      {PALETTE.map((c) => {
        const activo = c.toLowerCase() === color.toLowerCase();
        return (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            aria-label={`Usar el color ${c}`}
            title={c}
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-md transition-transform",
              activo ? "scale-110" : "hover:scale-110"
            )}
            style={{
              background: c,
              boxShadow: activo ? `0 0 0 2px var(--surface), 0 0 0 4px ${c}` : "none",
            }}
          >
            {activo ? <Check size={13} strokeWidth={3} color={readableOn(c)} /> : null}
          </button>
        );
      })}
      <label
        className="border-line text-inkmuted ml-1 flex h-6 cursor-pointer items-center gap-1.5 rounded-md border px-1.5 text-[11px] font-semibold"
        title="Elegir otro color"
      >
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          aria-label="Color personalizado"
          className="h-4 w-4 cursor-pointer border-0 bg-transparent p-0"
        />
        Otro
      </label>
    </div>
  );
}

/* --------------------------------------------------------------- ENERGIA -- */

/** Selector 1-5 del nivel de energía, con su etiqueta legible. */
export function EnergyPicker({
  name = "energyLevel",
  defaultValue = 3,
}: {
  name?: string;
  defaultValue?: number;
}) {
  const [level, setLevel] = useState(defaultValue);

  return (
    <div>
      <input type="hidden" name={name} value={level} />
      <div className="flex flex-wrap gap-1.5">
        {ENERGY_LEVELS.map((label, i) => {
          const value = i + 1;
          const activo = value === level;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setLevel(value)}
              className={cn(
                "min-w-[92px] flex-1 rounded-lg px-2 py-1.5 text-center transition-colors",
                activo
                  ? "bg-brandsoft text-brand ring-brand/40 ring-1"
                  : "bg-surface3 text-inkmuted hover:text-ink"
              )}
            >
              <span className="block text-[13px] leading-tight font-bold">{value}</span>
              <span className="block text-[10.5px] leading-tight font-semibold">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- NUEVO ALTA -- */

/** Botón "Nuevo arquetipo" con el alta rápida en un modal. */
export function ArchetypeCreateButton({
  label = "Nuevo arquetipo",
}: {
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-primary">
        <Plus size={14} />
        {label}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nuevo arquetipo"
        description="Describe cómo es la persona frente a cámara. Luego podrás afinar el tono, el branding y la compatibilidad con cada estructura."
        width={640}
      >
        <form action={crearArquetipo} className="space-y-4">
          <div className="grid gap-3.5 sm:grid-cols-[1.4fr_1fr]">
            <Field label="Nombre del arquetipo" required>
              <input
                name="name"
                className="input"
                placeholder="Ej. Cercano y divertido"
                required
                autoFocus
                maxLength={80}
              />
            </Field>
            <Field label="Rango de edad" hint="Ej. 22-30">
              <input name="ageRange" className="input" placeholder="22-30" maxLength={40} />
            </Field>
          </div>

          <Field
            label="Resumen"
            hint="Una línea que lo explique de un vistazo. Se ve en las tarjetas del listado."
          >
            <input
              name="summary"
              className="input"
              placeholder="Ej. El amigo gracioso que te vende sin que lo sientas"
              maxLength={160}
            />
          </Field>

          <Field
            label="Nivel de energía"
            hint="Marca el ritmo del guion: de 1 muy calmado a 5 explosivo."
          >
            <EnergyPicker />
          </Field>

          <Field label="Color" hint="Sirve para reconocerlo de un vistazo en toda la app.">
            <ColorPicker />
          </Field>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field
              label="Lo que le sale natural"
              hint="Una por línea. Se le pasa literalmente a la IA."
            >
              <textarea
                name="strengths"
                className="textarea"
                rows={4}
                placeholder={"Improvisar\nHablar mirando a cámara\nHacer bromas cortas"}
              />
            </Field>
            <Field
              label="Lo que NO le queda"
              hint="Una por línea. La IA lo trata como prohibido."
            >
              <textarea
                name="avoid"
                className="textarea"
                rows={4}
                placeholder={"Tono solemne\nDatos técnicos largos\nDramatismo"}
              />
            </Field>
          </div>

          <div className="border-line mt-1 flex justify-end gap-2 border-t pt-4">
            <button type="button" onClick={() => setOpen(false)} className="btn">
              Cancelar
            </button>
            <SubmitButton className="btn btn-primary" pendingLabel="Creando…">
              Crear arquetipo
            </SubmitButton>
          </div>
        </form>
      </Modal>
    </>
  );
}
