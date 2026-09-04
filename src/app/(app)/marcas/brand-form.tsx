"use client";

import { useState } from "react";
import { Lock, Save, Sparkles } from "lucide-react";

import { PALETTE } from "@/lib/constants";
import { GUIA_TARGETS } from "@/lib/guia/catalogo";
import { cn } from "@/lib/utils";
import { Callout, Divider, Field } from "@/components/ui";
import { SubmitButton } from "@/components/forms";

/**
 * Formulario de marca. El mismo componente sirve para el alta rapida
 * (dentro de un modal) y para la edicion completa de la ficha.
 */

export type BrandFormValues = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  identity: string;
  brief: string;
  toneOfVoice: string;
  audience: string;
  valueProps: string;
  doNots: string;
  keywords: string;
  colorPrimary: string;
  colorSecondary: string;
  colorAccent: string;
  website: string;
  instagram: string;
  tiktok: string;
  whatsapp: string;
};

export const EMPTY_BRAND: BrandFormValues = {
  id: "",
  name: "",
  tagline: "",
  description: "",
  identity: "",
  brief: "",
  toneOfVoice: "",
  audience: "",
  valueProps: "",
  doNots: "",
  keywords: "",
  colorPrimary: "#ec4899",
  colorSecondary: "#8b5cf6",
  colorAccent: "#f59e0b",
  website: "",
  instagram: "",
  tiktok: "",
  whatsapp: "",
};

const HEX = /^#[0-9a-fA-F]{6}$/;

function ColorField({
  label,
  name,
  value,
  onChange,
  disabled,
  swatches,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  swatches?: boolean;
}) {
  const safe = HEX.test(value) ? value : "#000000";

  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} (selector)`}
          value={safe}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="border-line bg-surface h-9 w-11 shrink-0 cursor-pointer rounded-lg border p-1"
        />
        <input
          name={name}
          value={value}
          disabled={disabled}
          spellCheck={false}
          maxLength={7}
          placeholder="#ec4899"
          onChange={(e) => onChange(e.target.value)}
          className="input input-mono"
        />
      </div>
      {swatches && !disabled ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PALETTE.map((hex) => (
            <button
              key={hex}
              type="button"
              onClick={() => onChange(hex)}
              title={hex}
              aria-label={`Usar ${hex}`}
              className={cn(
                "h-5 w-5 rounded-full transition-transform hover:scale-110",
                value.toLowerCase() === hex ? "ring-brand ring-2 ring-offset-1" : ""
              )}
              style={{ background: hex, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.14)" }}
            />
          ))}
        </div>
      ) : null}
    </Field>
  );
}

export function BrandForm({
  action,
  brand = EMPTY_BRAND,
  mode = "crear",
  canEdit = true,
}: {
  action: (formData: FormData) => Promise<void>;
  brand?: BrandFormValues;
  mode?: "crear" | "editar";
  canEdit?: boolean;
}) {
  const [primary, setPrimary] = useState(brand.colorPrimary);
  const [secondary, setSecondary] = useState(brand.colorSecondary);
  const [accent, setAccent] = useState(brand.colorAccent);

  const disabled = !canEdit;
  const full = mode === "editar";

  return (
    <form action={action} className="space-y-5">
      {brand.id ? <input type="hidden" name="id" value={brand.id} /> : null}

      {disabled ? (
        <Callout tone="info" title="Solo lectura">
          Necesitas ser del equipo para editar la identidad de la marca.
        </Callout>
      ) : null}

      {/* ---------------------------------------------------------- BASICO -- */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre" required>
          <input
            name="name"
            className="input"
            required
            disabled={disabled}
            defaultValue={brand.name}
            placeholder="Ej. Con Amor"
            autoFocus={mode === "crear"}
            data-guia={GUIA_TARGETS.INPUT_MARCA_NOMBRE}
          />
        </Field>
        <Field label="Lema" hint="Una línea que resuma la promesa de la marca.">
          <input
            name="tagline"
            className="input"
            disabled={disabled}
            defaultValue={brand.tagline}
            placeholder="Ej. Regalos que dicen lo que sientes"
            data-guia={GUIA_TARGETS.INPUT_MARCA_LEMA}
          />
        </Field>
      </div>

      <Field label="Descripción" hint="Qué vende y a quién, en dos o tres líneas.">
        <textarea
          name="description"
          className="textarea"
          rows={3}
          disabled={disabled}
          defaultValue={brand.description}
          placeholder="Qué es la marca y qué problema resuelve…"
        />
      </Field>

      {full ? (
        <>
          <Divider label="Identidad" />

          <div className="grid gap-3 lg:grid-cols-2">
            <Field
              label="Identidad y personalidad"
              hint="Cómo se comporta la marca si fuera una persona."
            >
              <textarea
                name="identity"
                className="textarea"
                rows={5}
                disabled={disabled}
                defaultValue={brand.identity}
                placeholder="Cercana, divertida, directa…"
              />
            </Field>
            <Field
              label="Brief permanente"
              hint="Lo que la IA debe tener siempre presente al escribir para esta marca."
            >
              <textarea
                name="brief"
                className="textarea"
                rows={5}
                disabled={disabled}
                defaultValue={brand.brief}
                placeholder="Contexto fijo: catálogo, precios, promesas, garantías…"
              />
            </Field>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Field label="Tono de voz" hint="Cómo habla: tuteo, jerga, ritmo, emojis.">
              <textarea
                name="toneOfVoice"
                className="textarea"
                rows={4}
                disabled={disabled}
                defaultValue={brand.toneOfVoice}
                placeholder="Tuteo peruano, frases cortas, humor amable…"
                data-guia={GUIA_TARGETS.INPUT_MARCA_TONO}
              />
            </Field>
            <Field label="Público objetivo" hint="A quién le hablamos de verdad.">
              <textarea
                name="audience"
                className="textarea"
                rows={4}
                disabled={disabled}
                defaultValue={brand.audience}
                placeholder="Mujeres de 25 a 40 en Lima que buscan un detalle rápido…"
                data-guia={GUIA_TARGETS.INPUT_MARCA_PUBLICO}
              />
            </Field>
          </div>

          <Divider label="Reglas de la marca" />

          <div className="grid gap-3 lg:grid-cols-3">
            <Field label="Propuestas de valor" hint="Una por línea.">
              <textarea
                name="valueProps"
                className="textarea"
                rows={6}
                disabled={disabled}
                defaultValue={brand.valueProps}
                placeholder={"Entrega el mismo día\nEnvoltura incluida\nPago contra entrega"}
              />
            </Field>
            <Field label="Prohibiciones" hint="Lo que nunca se dice ni se hace. Una por línea.">
              <textarea
                name="doNots"
                className="textarea"
                rows={6}
                disabled={disabled}
                defaultValue={brand.doNots}
                placeholder={"No prometer descuentos sin aprobar\nNo comparar con la competencia"}
                data-guia={GUIA_TARGETS.INPUT_MARCA_PROHIBICIONES}
              />
            </Field>
            <Field label="Palabras clave" hint="Vocabulario propio de la marca. Una por línea.">
              <textarea
                name="keywords"
                className="textarea"
                rows={6}
                disabled={disabled}
                defaultValue={brand.keywords}
                placeholder={"detalle\nsorpresa\nregalo express"}
              />
            </Field>
          </div>
        </>
      ) : null}

      <Divider label="Colores" />

      <div className="grid gap-3 sm:grid-cols-3">
        <ColorField
          label="Primario"
          name="colorPrimary"
          value={primary}
          onChange={setPrimary}
          disabled={disabled}
          swatches
        />
        <ColorField
          label="Secundario"
          name="colorSecondary"
          value={secondary}
          onChange={setSecondary}
          disabled={disabled}
        />
        <ColorField
          label="Acento"
          name="colorAccent"
          value={accent}
          onChange={setAccent}
          disabled={disabled}
        />
      </div>

      <div
        className="flex items-center gap-2 rounded-xl px-3.5 py-3"
        style={{ background: `linear-gradient(90deg, ${primary}, ${secondary}, ${accent})` }}
      >
        <span className="text-[11.5px] font-bold tracking-wider text-white uppercase drop-shadow">
          Vista previa de la paleta
        </span>
      </div>

      {full ? (
        <>
          <Divider label="Enlaces" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Web">
              <input
                name="website"
                className="input"
                disabled={disabled}
                defaultValue={brand.website}
                placeholder="https://…"
              />
            </Field>
            <Field label="Instagram">
              <input
                name="instagram"
                className="input"
                disabled={disabled}
                defaultValue={brand.instagram}
                placeholder="@usuario"
              />
            </Field>
            <Field label="TikTok">
              <input
                name="tiktok"
                className="input"
                disabled={disabled}
                defaultValue={brand.tiktok}
                placeholder="@usuario"
              />
            </Field>
            <Field label="WhatsApp">
              <input
                name="whatsapp"
                className="input"
                disabled={disabled}
                defaultValue={brand.whatsapp}
                placeholder="+51 999 999 999"
              />
            </Field>
          </div>
        </>
      ) : (
        <p className="text-inkmuted text-[12.5px] leading-relaxed">
          El brief, el tono de voz, las prohibiciones y los enlaces se completan después en la
          ficha de la marca.
        </p>
      )}

      {canEdit ? (
        <div className="border-line flex items-center justify-end gap-2 border-t pt-4">
          <SubmitButton
            className="btn btn-primary"
            icon={mode === "crear" ? <Sparkles size={14} /> : <Save size={14} />}
            pendingLabel="Guardando…"
            data-guia={mode === "crear" ? GUIA_TARGETS.BTN_SUBMIT_MARCA : GUIA_TARGETS.BTN_GUARDAR_IDENTIDAD}
          >
            {mode === "crear" ? "Crear marca" : "Guardar cambios"}
          </SubmitButton>
        </div>
      ) : (
        <div className="text-inkmuted flex items-center gap-1.5 text-[12.5px]">
          <Lock size={13} /> Sin permisos de edición
        </div>
      )}
    </form>
  );
}

/** Bloque compacto que muestra los tres colores de la marca. */
export function BrandColors({
  primary,
  secondary,
  accent,
  size = 16,
}: {
  primary: string;
  secondary: string;
  accent: string;
  size?: number;
}) {
  return (
    <div className="flex items-center gap-1">
      {[primary, secondary, accent].map((hex, i) => (
        <span
          key={`${hex}-${i}`}
          title={hex}
          className="border-line inline-block rounded-full border"
          style={{ width: size, height: size, background: hex }}
        />
      ))}
    </div>
  );
}
