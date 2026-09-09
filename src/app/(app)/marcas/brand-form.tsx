"use client";

import { EditForm, RevisionField } from "@/components/edit-form";
import { Lock, Save, Sparkles } from "lucide-react";
import { useState } from "react";

import { BotonCargarBranding } from "@/components/cargador-branding";
import { SubmitButton } from "@/components/forms";
import { Callout, Divider, Field } from "@/components/ui";
import { PALETTE } from "@/lib/constants";
import { GUIA_TARGETS } from "@/lib/guia/catalogo";
import { cn } from "@/lib/utils";

/**
 * Formulario de marca. El mismo componente sirve para el alta rapida
 * (dentro de un modal) y para la edicion completa de la ficha.
 */

export type BrandFormValues = {
  updatedAt?: string;
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
  canImport = true,
}: {
  action: (formData: FormData) => Promise<void>;
  brand?: BrandFormValues;
  mode?: "crear" | "editar";
  canEdit?: boolean;
  canImport?: boolean;
}) {
  const [primary, setPrimary] = useState(brand.colorPrimary);
  const [secondary, setSecondary] = useState(brand.colorSecondary);
  const [accent, setAccent] = useState(brand.colorAccent);

  const [tagline, setTagline] = useState(brand.tagline);
  const [description, setDescription] = useState(brand.description);
  const [identity, setIdentity] = useState(brand.identity);
  const [brief, setBrief] = useState(brand.brief);
  const [toneOfVoice, setToneOfVoice] = useState(brand.toneOfVoice);
  const [audience, setAudience] = useState(brand.audience);
  const [valueProps, setValueProps] = useState(brand.valueProps);
  const [doNots, setDoNots] = useState(brand.doNots);
  const [keywords, setKeywords] = useState(brand.keywords);
  const [camposIluminados, setCamposIluminados] = useState(false);

  const disabled = !canEdit;
  const full = mode === "editar";
  const Form = full ? EditForm : "form";

  return (
    <Form action={action} className="space-y-5">
      {full && brand.updatedAt ? <RevisionField value={brand.updatedAt} /> : null}
      {brand.id ? <input type="hidden" name="id" value={brand.id} /> : null}

      {disabled ? (
        <Callout tone="info" title="Solo lectura">
          Necesitas ser del equipo para editar la identidad de la marca.
        </Callout>
      ) : null}

      {/* Banner de Carga Rápida desde PDF */}
      {full && canEdit && canImport && (
        <div className="rounded-xl border border-[var(--brand)]/35 bg-[var(--brand)]/5 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="space-y-0.5">
            <div className="font-bold text-ink text-[13.5px] flex items-center gap-2">
              <Sparkles size={16} className="text-brand" />
              ¿Tienes un informe de branding en PDF?
            </div>
            <p className="text-inkmuted text-[12px] leading-relaxed">
              Sube tu PDF (Yoryo, Piero, Eru o empresa) para auto-rellenar tono, público, reglas y colores automáticamente.
            </p>
          </div>
          <BotonCargarBranding
            brandId={brand.id}
            className="btn btn-primary btn-sm shrink-0"
            label="Cargar PDF de branding"
            data-guia={GUIA_TARGETS.BTN_CARGAR_BRANDING_PDF}
            onSuccess={(res) => {
              if (res.parsed.tagline) setTagline(res.parsed.tagline);
              if (res.parsed.identity) setIdentity(res.parsed.identity);
              if (res.parsed.brief) setBrief(res.parsed.brief);
              if (res.parsed.toneOfVoice) setToneOfVoice(res.parsed.toneOfVoice);
              if (res.parsed.audience) setAudience(res.parsed.audience);
              if (res.parsed.valueProps.length) setValueProps(res.parsed.valueProps.join("\n"));
              if (res.parsed.doNots.length) setDoNots(res.parsed.doNots.join("\n"));
              if (res.parsed.keywords.length) setKeywords(res.parsed.keywords.join("\n"));
              if (res.parsed.colorPrimary) setPrimary(res.parsed.colorPrimary);
              if (res.parsed.colorSecondary) setSecondary(res.parsed.colorSecondary);
              if (res.parsed.colorAccent) setAccent(res.parsed.colorAccent);
              setCamposIluminados(true);
            }}
          />
        </div>
      )}

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
            className={cn("input transition-all", camposIluminados && "border-[var(--brand)] ring-2 ring-[var(--brand)]/30 bg-[var(--brand)]/5")}
            disabled={disabled}
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
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
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Qué es la marca y qué problema resuelve…"
        />
      </Field>

      {full ? (
        <>
          <Divider label="Identidad" />

          <div className="grid gap-3 lg:grid-cols-2">
            <Field
              label="Identidad y personalidad"
              hint="En tu informe: ARQUETIPOS (Quién es, qué representa y arquetipos dominante y secundario)."
            >
              <textarea
                name="identity"
                className={cn("textarea transition-all", camposIluminados && "border-[var(--brand)] ring-2 ring-[var(--brand)]/30 bg-[var(--brand)]/5")}
                rows={5}
                disabled={disabled}
                value={identity}
                onChange={(e) => setIdentity(e.target.value)}
                placeholder="Cercana, divertida, directa…"
              />
            </Field>
            <Field
              label="Brief permanente"
              hint="En tu informe: Deseo central, talento diferencial y frase insignia fija."
            >
              <textarea
                name="brief"
                className={cn("textarea transition-all", camposIluminados && "border-[var(--brand)] ring-2 ring-[var(--brand)]/30 bg-[var(--brand)]/5")}
                rows={5}
                disabled={disabled}
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="Contexto fijo: catálogo, precios, promesas, garantías…"
              />
            </Field>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Field label="Tono de voz" hint="En tu informe: sección COMUNICACIÓN → TONO (cómo suena al hablar).">
              <textarea
                name="toneOfVoice"
                className={cn("textarea transition-all", camposIluminados && "border-[var(--brand)] ring-2 ring-[var(--brand)]/30 bg-[var(--brand)]/5")}
                rows={4}
                disabled={disabled}
                value={toneOfVoice}
                onChange={(e) => setToneOfVoice(e.target.value)}
                placeholder="Tuteo peruano, frases cortas, humor amable…"
                data-guia={GUIA_TARGETS.INPUT_MARCA_TONO}
              />
            </Field>
            <Field label="Público objetivo" hint="En tu informe: Audiencia y público que conecta con este arquetipo.">
              <textarea
                name="audience"
                className={cn("textarea transition-all", camposIluminados && "border-[var(--brand)] ring-2 ring-[var(--brand)]/30 bg-[var(--brand)]/5")}
                rows={4}
                disabled={disabled}
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="Mujeres de 25 a 40 en Lima que buscan un detalle rápido…"
                data-guia={GUIA_TARGETS.INPUT_MARCA_PUBLICO}
              />
            </Field>
          </div>

          <Divider label="Reglas de la marca" />

          <div className="grid gap-3 lg:grid-cols-3">
            <Field label="Propuestas de valor" hint="En tu informe: Talentos diferenciales y fortalezas. Una por línea.">
              <textarea
                name="valueProps"
                className={cn("textarea transition-all", camposIluminados && "border-[var(--brand)] ring-2 ring-[var(--brand)]/30 bg-[var(--brand)]/5")}
                rows={6}
                disabled={disabled}
                value={valueProps}
                onChange={(e) => setValueProps(e.target.value)}
                placeholder={"Entrega el mismo día\nEnvoltura incluida\nPago contra entrega"}
              />
            </Field>
            <Field label="Prohibiciones" hint="En tu informe: sección COMUNICACIÓN → EVITA (lo que nunca dice ni hace).">
              <textarea
                name="doNots"
                className={cn("textarea transition-all", camposIluminados && "border-[var(--brand)] ring-2 ring-[var(--brand)]/30 bg-[var(--brand)]/5")}
                rows={6}
                disabled={disabled}
                value={doNots}
                onChange={(e) => setDoNots(e.target.value)}
                placeholder={"No prometer descuentos sin aprobar\nNo comparar con la competencia"}
                data-guia={GUIA_TARGETS.INPUT_MARCA_PROHIBICIONES}
              />
            </Field>
            <Field label="Palabras clave" hint="En tu informe: sección COMUNICACIÓN → VOCABULARIO. Una por línea.">
              <textarea
                name="keywords"
                className={cn("textarea transition-all", camposIluminados && "border-[var(--brand)] ring-2 ring-[var(--brand)]/30 bg-[var(--brand)]/5")}
                rows={6}
                disabled={disabled}
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
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
    </Form>
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
