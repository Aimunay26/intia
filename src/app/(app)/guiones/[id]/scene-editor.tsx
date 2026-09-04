"use client";

import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Pencil,
  Plus,
  Printer,
  Trash2,
  X,
} from "lucide-react";

import {
  actualizarEscena,
  actualizarGuion,
  eliminarEscena,
  moverEscena,
} from "@/app/actions/scripts";
import { VOICE_TYPES } from "@/lib/constants";
import { formatSeconds } from "@/lib/utils";
import { Field } from "@/components/ui";
import { DeleteButton, Modal, SubmitButton } from "@/components/forms";
import { CTA_TRIGGERS } from "@/lib/script-angles";

/* ------------------------------------------------------------------ TIPOS -- */

export type SceneActor = { role: string; archetype: string; notes: string };

export type SceneData = {
  id: string;
  order: number;
  beat: string;
  startSec: number;
  endSec: number;
  voice: string;
  voiceType: string;
  shot: string;
  action: string;
  actors: SceneActor[];
  emotion: string;
  props: string[];
  lighting: string;
  sound: string;
  onScreenText: string;
  location: string;
  notes: string;
};

/* ------------------------------------------------------------- IMPRIMIR -- */

/** Manda el guion a la impresora sin sacar al usuario de la página. */
export function PrintButton({ className = "btn btn-sm" }: { className?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={className}>
      <Printer size={13} />
      Imprimir
    </button>
  );
}

/* ---------------------------------------------------------- FICHA DEL GUION -- */

export type ScriptSheet = {
  id: string;
  brandId: string | null;
  structureId: string | null;
  avatar: string;
  focus: string;
  hook: string;
  cta: string;
  notes: string;
};

/** Modal con lo que enmarca el video: avatar, enfoque, gancho, CTA y reparto. */
export function ScriptSheetEditor({
  script,
  brands,
  structures,
}: {
  script: ScriptSheet;
  brands: { id: string; name: string }[];
  structures: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [cta, setCta] = useState(script.cta ?? "");

  useEffect(() => {
    setCta(script.cta ?? "");
  }, [script.cta]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-sm">
        <Pencil size={13} />
        Editar ficha
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Ficha del guion"
        description="Lo que enmarca el video: a quién le habla, qué vende y con qué termina."
        width={640}
      >
        <form
          action={actualizarGuion}
          onSubmit={() => setOpen(false)}
          className="space-y-3"
        >
          <input type="hidden" name="id" value={script.id} />

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Marca">
              <select name="brandId" className="select" defaultValue={script.brandId ?? ""}>
                <option value="">Sin marca</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Estructura">
              <select
                name="structureId"
                className="select"
                defaultValue={script.structureId ?? ""}
              >
                <option value="">Sin estructura</option>
                {structures.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Avatar: a quién le habla">
            <textarea name="avatar" className="textarea" rows={2} defaultValue={script.avatar} />
          </Field>

          <Field label="Enfoque">
            <textarea name="focus" className="textarea" rows={2} defaultValue={script.focus} />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Gancho (primeros 3 segundos)">
              <textarea name="hook" className="textarea" rows={2} defaultValue={script.hook} />
            </Field>
            <Field label="Llamado a la acción (CTA) con Gatillo Hormozi">
              <div className="mb-2 flex flex-wrap gap-1">
                {CTA_TRIGGERS.flatMap((t) => t.presets.slice(0, 1)).map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setCta(preset.textoCompleto)}
                    className="chip chip-plain hover:border-brand/40 text-[10px] cursor-pointer"
                    title={preset.textoCompleto}
                  >
                    ✨ {preset.label}
                  </button>
                ))}
              </div>
              <textarea
                name="cta"
                className="textarea text-[12px]"
                rows={3}
                value={cta}
                onChange={(e) => setCta(e.target.value)}
                placeholder="Ej. Si no me compras ahora solo puedo atender a 9 clientes y ya tengo 5..."
              />
            </Field>
          </div>

          <Field label="Notas de reparto" hint="Cuánta gente hace falta y de qué perfil.">
            <textarea name="notes" className="textarea" rows={3} defaultValue={script.notes} />
          </Field>

          <div className="border-line flex justify-end gap-2 border-t pt-4">
            <button type="button" onClick={() => setOpen(false)} className="btn">
              Cancelar
            </button>
            <SubmitButton className="btn btn-primary" pendingLabel="Guardando…">
              Guardar ficha
            </SubmitButton>
          </div>
        </form>
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------- ESCENA -- */

export function SceneEditor({
  scene,
  totalScenes,
  beatNames,
  canDelete,
}: {
  scene: SceneData;
  totalScenes: number;
  beatNames: string[];
  canDelete: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [actors, setActors] = useState<SceneActor[]>(scene.actors);

  const abrir = () => {
    setActors(scene.actors.length ? scene.actors : []);
    setOpen(true);
  };

  const cambiarActor = (index: number, campo: keyof SceneActor, valor: string) => {
    setActors((prev) =>
      prev.map((actor, i) => (i === index ? { ...actor, [campo]: valor } : actor))
    );
  };

  return (
    <div className="no-print flex shrink-0 items-center gap-1">
      <form action={moverEscena}>
        <input type="hidden" name="id" value={scene.id} />
        <input type="hidden" name="direccion" value="arriba" />
        <button
          type="submit"
          className="btn btn-ghost btn-icon"
          title="Subir la escena"
          disabled={scene.order === 0}
        >
          <ArrowUp size={14} />
        </button>
      </form>

      <form action={moverEscena}>
        <input type="hidden" name="id" value={scene.id} />
        <input type="hidden" name="direccion" value="abajo" />
        <button
          type="submit"
          className="btn btn-ghost btn-icon"
          title="Bajar la escena"
          disabled={scene.order >= totalScenes - 1}
        >
          <ArrowDown size={14} />
        </button>
      </form>

      <button type="button" onClick={abrir} className="btn btn-sm">
        <Pencil size={13} />
        Editar
      </button>

      {canDelete ? (
        <DeleteButton
          action={eliminarEscena}
          id={scene.id}
          label=""
          icon={<Trash2 size={14} />}
          className="btn btn-ghost btn-icon text-danger"
          title="¿Eliminar esta escena?"
          description={`Se borrará la escena ${scene.order + 1} "${scene.beat}". Las demás escenas se vuelven a numerar y los tiempos se recalculan solos.`}
        />
      ) : null}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Escena ${scene.order + 1} · ${scene.beat}`}
        description={`${formatSeconds(scene.startSec)} – ${formatSeconds(scene.endSec)} · ajusta lo que haga falta antes de grabar`}
        width={860}
      >
        <form action={actualizarEscena} onSubmit={() => setOpen(false)} className="space-y-4">
          <input type="hidden" name="id" value={scene.id} />
          <input type="hidden" name="actors" value={JSON.stringify(actors)} />

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_100px_100px_150px]">
            <Field label="Beat">
              <input
                name="beat"
                className="input"
                defaultValue={scene.beat}
                list="beats-de-la-estructura"
                required
              />
              <datalist id="beats-de-la-estructura">
                {beatNames.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </Field>
            <Field label="Desde (s)">
              <input
                name="startSec"
                type="number"
                min={0}
                className="input"
                defaultValue={scene.startSec}
              />
            </Field>
            <Field label="Hasta (s)">
              <input
                name="endSec"
                type="number"
                min={1}
                className="input"
                defaultValue={scene.endSec}
              />
            </Field>
            <Field label="Tipo de voz">
              <select name="voiceType" className="select" defaultValue={scene.voiceType}>
                {VOICE_TYPES.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field
            label="Voz: lo que se dice, palabra por palabra"
            hint="Tal cual se va a leer en el set. Sin acotaciones ni corchetes."
          >
            <textarea
              name="voice"
              className="textarea"
              rows={3}
              defaultValue={scene.voice}
              placeholder="«Ya sé que se rompió, pero mírala…»"
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Encuadre y cámara">
              <textarea name="shot" className="textarea" rows={2} defaultValue={scene.shot} />
            </Field>
            <Field label="Acción en escena">
              <textarea name="action" className="textarea" rows={2} defaultValue={scene.action} />
            </Field>
            <Field label="Emoción">
              <input name="emotion" className="input" defaultValue={scene.emotion} />
            </Field>
            <Field label="Iluminación">
              <input name="lighting" className="input" defaultValue={scene.lighting} />
            </Field>
            <Field label="Sonido">
              <input name="sound" className="input" defaultValue={scene.sound} />
            </Field>
            <Field label="Locación">
              <input name="location" className="input" defaultValue={scene.location} />
            </Field>
            <Field label="Texto en pantalla">
              <input
                name="onScreenText"
                className="input"
                defaultValue={scene.onScreenText}
              />
            </Field>
            <Field label="Elementos / utilería" hint="Uno por línea.">
              <textarea
                name="props"
                className="textarea"
                rows={3}
                defaultValue={scene.props.join("\n")}
                placeholder={"Ramo de rosas\nCaja de chocolates"}
              />
            </Field>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label className="label mb-0">Actores en esta escena</label>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() =>
                  setActors((prev) => [...prev, { role: "", archetype: "", notes: "" }])
                }
              >
                <Plus size={13} />
                Añadir actor
              </button>
            </div>

            {actors.length === 0 ? (
              <div className="border-line text-inkmuted rounded-xl border border-dashed px-3 py-4 text-center text-[12.5px]">
                Nadie aparece en cámara en esta escena.
              </div>
            ) : (
              <div className="space-y-2">
                {actors.map((actor, i) => (
                  <div
                    key={i}
                    className="bg-surface2 border-line grid gap-2 rounded-xl border p-2.5 sm:grid-cols-[150px_150px_minmax(0,1fr)_auto]"
                  >
                    <input
                      className="input"
                      placeholder="Papel: Chica, Novio…"
                      value={actor.role}
                      onChange={(e) => cambiarActor(i, "role", e.target.value)}
                    />
                    <input
                      className="input"
                      placeholder="Arquetipo sugerido"
                      value={actor.archetype}
                      onChange={(e) => cambiarActor(i, "archetype", e.target.value)}
                    />
                    <input
                      className="input"
                      placeholder="Cómo debe actuar aquí"
                      value={actor.notes}
                      onChange={(e) => cambiarActor(i, "notes", e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon text-danger"
                      title="Quitar actor"
                      onClick={() => setActors((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Field label="Notas de producción">
            <textarea name="notes" className="textarea" rows={2} defaultValue={scene.notes} />
          </Field>

          <div className="border-line flex justify-end gap-2 border-t pt-4">
            <button type="button" onClick={() => setOpen(false)} className="btn">
              Cancelar
            </button>
            <SubmitButton className="btn btn-primary" pendingLabel="Guardando…">
              Guardar escena
            </SubmitButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}
