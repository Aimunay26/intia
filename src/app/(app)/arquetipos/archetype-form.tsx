"use client";

import { useState } from "react";
import { Check, Plus } from "lucide-react";

import { PLANTILLAS_PERSONA } from "@/lib/plantillas-persona";
import { crearArquetipo } from "@/app/actions/archetypes";
import { GUIA_TARGETS } from "@/lib/guia/catalogo";
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
  label = "Añadir persona",
}: {
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-primary"
        data-guia={GUIA_TARGETS.BTN_NUEVA_PERSONA}
      >
        <Plus size={14} />
        {label}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nueva persona"
        description="Elige el arquetipo al que más se parezca y ajusta lo que haga falta. Su marca personal queda rellena desde el primer momento."
        width={640}
      >
        <form action={crearArquetipo} className="space-y-4">
          {/*
            Elegir una plantilla rellena la marca personal entera —tono de voz,
            vocabulario, lo que nunca diría, paleta—, no solo el perfil. Sin eso
            la persona nace a medias y la IA le escribe guiones que no suenan a
            nadie, que es justo lo que este sistema existe para evitar.
          */}
          <div>
            <label className="label">¿A cuál se parece más?</label>
            <p className="hint mb-2">
              Rellena su marca personal para que puedas empezar corrigiendo en vez de
              escribiendo. Todo queda editable después.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {PLANTILLAS_PERSONA.map((pl) => (
                <label
                  key={pl.id}
                  className="border-line hover:bg-surface2 has-[:checked]:border-brand has-[:checked]:bg-brandsoft/50 flex cursor-pointer gap-2.5 rounded-lg border p-2.5 transition-colors"
                >
                  <input
                    type="radio"
                    name="plantilla"
                    value={pl.id}
                    className="mt-0.5 shrink-0"
                    defaultChecked={pl.id === "gobernante"}
                  />
                  <span className="min-w-0">
                    <span
                      className="block text-[12.5px] leading-tight font-bold"
                      style={{ color: pl.color }}
                    >
                      {pl.etiqueta}
                    </span>
                    <span className="text-inksoft mt-0.5 block text-[11.5px] leading-snug">
                      {pl.gancho}
                    </span>
                    <span className="text-inkmuted mt-1 block text-[11px] leading-snug">
                      {pl.paraQuien}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <label className="text-inkmuted mt-2 flex cursor-pointer items-center gap-2 text-[12px]">
              <input type="radio" name="plantilla" value="" />
              Empezar en blanco, sin plantilla
            </label>
          </div>

          <div className="grid gap-3.5 sm:grid-cols-[1.4fr_1fr]">
            <Field label="Nombre de la persona" required>
              <input
                name="name"
                className="input"
                placeholder="Ej. Eru"
                required
                autoFocus
                maxLength={80}
                data-guia={GUIA_TARGETS.INPUT_PERSONA_NOMBRE}
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
            <SubmitButton
              className="btn btn-primary"
              pendingLabel="Creando…"
              data-guia={GUIA_TARGETS.BTN_SUBMIT_PERSONA}
            >
              Crear arquetipo
            </SubmitButton>
          </div>
        </form>
      </Modal>
    </>
  );
}
