"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Save, Sparkles } from "lucide-react";

import { actualizarVideo, crearVideo } from "@/app/actions/content";
import {
  CONTENT_STATUSES,
  PLATFORMS,
  PRIORITIES,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Field } from "@/components/ui";
import { ModalForm, SubmitButton } from "@/components/forms";
import { GUIA_TARGETS } from "@/lib/guia/catalogo";

/**
 * Formularios de creacion y edicion de un video.
 * Viven en cliente porque el alta va dentro de un modal y la edicion
 * necesita el boton de envio con estado de carga.
 */

export type BrandOption = { id: string; name: string; color: string };
export type SimpleOption = { id: string; name: string };

export type VideoFormItem = {
  id: string;
  title: string;
  description: string;
  hook: string;
  cta: string;
  /** Redes donde va a salir. Un video puede ir a varias. */
  platforms: string[];
  /** Formatos previstos (ids de Structure). Se eligen en la idea; el guion fija el definitivo. */
  structureIds: string[];
  priority: string;
  /** Todas las fechas llegan ya en formato yyyy-mm-dd para no depender de la zona horaria del navegador. */
  scheduledDate: string;
  shootDate: string;
  publishedAt: string;
  publishedUrl: string;
  tags: string;
  notes: string;
};

/* -------------------------------------------------------------- REDES -- */

/**
 * Selector de redes con casillas. Se envía como varios campos `platforms`
 * y en el servidor se leen con formData.getAll("platforms").
 */
function PlatformPicker({
  defaultValue,
  disabled,
  hint,
}: {
  defaultValue: string[];
  disabled?: boolean;
  hint?: string;
}) {
  const [selected, setSelected] = useState<string[]>(defaultValue);

  const toggle = (value: string) => {
    setSelected((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  return (
    <Field
      label="Redes"
      hint={
        selected.length === 0
          ? "Elige al menos una red, o se guardará solo en TikTok."
          : hint
      }
    >
      <div className="flex flex-wrap gap-1.5">
        {PLATFORMS.map((o) => {
          const active = selected.includes(o.value);
          return (
            <label
              key={o.value}
              className={cn(
                "flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-[6px] text-[12.5px] font-semibold transition-all select-none",
                active ? o.chip : "bg-surface3 text-inkmuted hover:text-ink",
                disabled && "cursor-not-allowed opacity-60"
              )}
              style={active ? { boxShadow: `inset 0 0 0 1px ${o.hex}55` } : undefined}
            >
              <input
                type="checkbox"
                name="platforms"
                value={o.value}
                checked={active}
                disabled={disabled}
                onChange={() => toggle(o.value)}
                className="accent-brand h-3.5 w-3.5 cursor-pointer"
              />
              {o.label}
            </label>
          );
        })}
      </div>
    </Field>
  );
}

/* ---------------------------------------------------------- FORMATOS -- */

/**
 * Formatos previstos para el video, con casillas múltiples. Se envían como
 * varios campos `structureIds` y en el servidor se leen con getAll.
 *
 * El campo oculto `structureIdsForm` le dice al servidor que el picker estaba
 * en el formulario: así vaciar la lista a propósito se distingue de un
 * formulario que no la incluye. Deshabilitado no se envía nada y se conserva
 * lo que había.
 */
function StructurePicker({
  structures,
  defaultValue,
  disabled,
}: {
  structures: SimpleOption[];
  defaultValue: string[];
  disabled?: boolean;
}) {
  const [selected, setSelected] = useState<string[]>(defaultValue);

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  };

  return (
    <Field
      label="Formatos previstos"
      hint={
        structures.length === 0
          ? undefined
          : "Marca uno o varios formatos que quieres probar con esta idea. El guion final fija la estructura definitiva."
      }
    >
      {structures.length === 0 ? (
        <p className="text-inkmuted text-[12.5px] leading-relaxed">
          Todavía no hay estructuras activas.{" "}
          <Link href="/estructuras" className="text-brand font-semibold">
            Crea la primera en Estructuras
          </Link>{" "}
          y podrás marcarlas aquí.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {!disabled ? <input type="hidden" name="structureIdsForm" value="1" /> : null}
          {structures.map((s) => {
            const active = selected.includes(s.id);
            return (
              <label
                key={s.id}
                className={cn(
                  "chip cursor-pointer select-none transition-all",
                  active ? "chip-brand font-semibold" : "chip-plain hover:bg-surface2",
                  disabled && "cursor-not-allowed opacity-60"
                )}
              >
                <input
                  type="checkbox"
                  name="structureIds"
                  value={s.id}
                  checked={active}
                  disabled={disabled}
                  onChange={() => toggle(s.id)}
                  className="accent-brand h-3 w-3 cursor-pointer"
                />
                {s.name}
              </label>
            );
          })}
        </div>
      )}
    </Field>
  );
}

/* ------------------------------------------------------------ NUEVO VIDEO -- */

export function NuevoVideoBoton({
  brands,
  structures,
  defaultDate,
  defaultBrandId,
  label = "Nuevo video",
  className = "btn btn-primary",
}: {
  brands: BrandOption[];
  /** Estructuras activas, para marcar los formatos previstos. */
  structures: SimpleOption[];
  /** yyyy-mm-dd */
  defaultDate: string;
  defaultBrandId?: string;
  label?: string;
  className?: string;
}) {
  if (!brands.length) {
    // Sin marcas no hay botón de nuevo video. La guía apunta aquí igual: el aro
    // rodea el botón que explica la condición en vez de señalar al vacío.
    return (
      <Link href="/marcas" className="btn btn-sm" data-guia={GUIA_TARGETS.BTN_NUEVO_VIDEO}>
        <Plus size={14} /> Crea una marca primero
      </Link>
    );
  }

  return (
    <ModalForm
      className={className}
      data-guia={GUIA_TARGETS.BTN_NUEVO_VIDEO}
      trigger={
        <span className="inline-flex items-center gap-1.5">
          <Plus size={14} /> {label}
        </span>
      }
      title="Nuevo video"
      description="Se crea con el checklist de producción completo para que nada se pierda."
      width={640}
    >
      <form action={crearVideo} className="space-y-3.5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Marca" required>
            <select
              name="brandId"
              className="select"
              defaultValue={defaultBrandId ?? ""}
              required
              data-guia={GUIA_TARGETS.SELECT_VIDEO_MARCA}
            >
              <option value="" disabled>
                Elige una marca…
              </option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Fecha del calendario" required>
            <input type="date" name="scheduledDate" className="input" defaultValue={defaultDate} required />
          </Field>
        </div>

        <Field label="Título" required>
          <input
            name="title"
            className="input"
            placeholder="Ej. 3 errores al comprar un regalo de aniversario"
            required
            autoFocus
            data-guia={GUIA_TARGETS.INPUT_VIDEO_TITULO}
          />
        </Field>

        <Field label="Hook" hint="La primera frase, la que decide si se quedan o pasan de largo.">
          <input
            name="hook"
            className="input"
            placeholder="Ej. Si le regalas esto, mejor no le regales nada…"
            data-guia={GUIA_TARGETS.INPUT_VIDEO_HOOK}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Estado">
            <select name="status" className="select" defaultValue="IDEA">
              {CONTENT_STATUSES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Prioridad">
            <select name="priority" className="select" defaultValue="MEDIA">
              {PRIORITIES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <PlatformPicker
          hint="Marca todas las redes donde va a salir este video."
          defaultValue={["TIKTOK"]}
        />

        <StructurePicker structures={structures} defaultValue={[]} />

        <Field label="Idea / descripción">
          <textarea
            name="description"
            className="textarea"
            rows={3}
            placeholder="De qué va el video, qué se quiere lograr…"
          />
        </Field>

        <div
          className="rounded-xl px-3.5 py-3 text-[12.5px] leading-relaxed"
          style={{
            background: "rgba(91,83,232,.07)",
            boxShadow: "inset 0 0 0 1px rgba(91,83,232,.2)",
          }}
        >
          <div className="text-brand mb-0.5 flex items-center gap-1.5 font-semibold">
            <Sparkles size={13} /> El guion viene después
          </div>
          <span className="text-inksoft">
            La tarjeta nace como idea. Desde su ficha podrás <strong>crear el guion con IA</strong>:
            el generador arrancará con esta marca, el título, el hook y los formatos previstos, y
            al terminar el guion queda unido a la tarjeta. También puedes asignarle un guion ya
            escrito desde <strong>Guiones</strong>.
          </span>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <SubmitButton
            className="btn btn-primary"
            icon={<Plus size={14} />}
            pendingLabel="Creando…"
            data-guia={GUIA_TARGETS.BTN_SUBMIT_VIDEO}
          >
            Crear video
          </SubmitButton>
        </div>
      </form>
    </ModalForm>
  );
}

/* ----------------------------------------------------------- EDITAR FICHA -- */

export function VideoDatosForm({
  item,
  structures,
  canEdit,
}: {
  item: VideoFormItem;
  /** Estructuras activas, para editar los formatos previstos. */
  structures: SimpleOption[];
  canEdit: boolean;
}) {
  return (
    <form action={actualizarVideo} className="space-y-3.5 p-4">
      <input type="hidden" name="id" value={item.id} />

      <Field label="Título" required>
        <input
          name="title"
          className="input"
          defaultValue={item.title}
          disabled={!canEdit}
          required
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Hook" hint="Los primeros 3 segundos.">
          <input name="hook" className="input" defaultValue={item.hook} disabled={!canEdit} />
        </Field>
        <Field label="CTA" hint="Qué le pedimos a quien lo ve.">
          <input name="cta" className="input" defaultValue={item.cta} disabled={!canEdit} />
        </Field>
      </div>

      <Field label="Descripción">
        <textarea
          name="description"
          className="textarea"
          rows={3}
          defaultValue={item.description}
          disabled={!canEdit}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Fecha del calendario" required>
          <input
            type="date"
            name="scheduledDate"
            className="input"
            defaultValue={item.scheduledDate}
            disabled={!canEdit}
            required
          />
        </Field>
        <Field label="Fecha de grabación">
          <input
            type="date"
            name="shootDate"
            className="input"
            defaultValue={item.shootDate}
            disabled={!canEdit}
          />
        </Field>
        <Field label="Fecha de publicación">
          <input
            type="date"
            name="publishedAt"
            className="input"
            defaultValue={item.publishedAt}
            disabled={!canEdit}
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Prioridad">
          <select name="priority" className="select" defaultValue={item.priority} disabled={!canEdit}>
            {PRIORITIES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <PlatformPicker
        defaultValue={item.platforms}
        disabled={!canEdit}
        hint="Un mismo video puede ir a varias redes."
      />

      <StructurePicker
        structures={structures}
        defaultValue={item.structureIds}
        disabled={!canEdit}
      />

      <Field label="Link publicado" hint="La URL del video ya subido, para revisarlo de un clic.">
        <input
          name="publishedUrl"
          className="input input-mono"
          placeholder="https://…"
          defaultValue={item.publishedUrl}
          disabled={!canEdit}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Etiquetas" hint="Una por línea.">
          <textarea
            name="tags"
            className="textarea"
            rows={3}
            defaultValue={item.tags}
            disabled={!canEdit}
          />
        </Field>
        <Field label="Notas internas">
          <textarea
            name="notes"
            className="textarea"
            rows={3}
            defaultValue={item.notes}
            disabled={!canEdit}
          />
        </Field>
      </div>

      {canEdit ? (
        <div className="flex justify-end pt-1">
          <SubmitButton className="btn btn-primary" icon={<Save size={14} />} pendingLabel="Guardando…">
            Guardar cambios
          </SubmitButton>
        </div>
      ) : (
        <p className="hint">Tu rol solo permite consultar esta ficha.</p>
      )}
    </form>
  );
}
