"use client";
import { EditForm, RevisionField } from "@/components/edit-form";

import { ArrowDown, ArrowUp, ListOrdered, Plus, Save, Trash2, Wand2 } from "lucide-react";
import { useState } from "react";

import { guardarBeats, type Beat } from "@/app/actions/structures";
import { SubmitButton } from "@/components/forms";
import { Callout, EmptyState } from "@/components/ui";
import { cn, formatSeconds } from "@/lib/utils";

type Row = Beat & { key: string };

/** El esqueleto emocional que más se repite en los formatos que funcionan. */
const PLANTILLA: Beat[] = [
  { name: "Golpe visual", goal: "Frenar el scroll en menos de un segundo", seconds: 3 },
  { name: "Tensión", goal: "Plantear el problema o la situación incómoda", seconds: 7 },
  { name: "Incertidumbre", goal: "Sostener la duda: todavía no se sabe cómo termina", seconds: 8 },
  { name: "Plot twist", goal: "El giro que nadie vio venir", seconds: 8 },
  { name: "Gran emoción", goal: "El pico: risa, ternura, sorpresa o rabia", seconds: 8 },
  { name: "Mostrar producto", goal: "La marca aparece como parte natural de la escena", seconds: 6 },
  { name: "CTA", goal: "Llamado a la acción concreto por el canal de la marca", seconds: 5 },
];

let contador = 0;
const nuevaKey = () => `beat-${Date.now().toString(36)}-${contador++}`;

function conKeys(beats: Beat[]): Row[] {
  return beats.map((b) => ({ ...b, key: nuevaKey() }));
}

/** Deja solo los beats con nombre y con los campos ya recortados. */
function limpiar(items: Beat[]): Beat[] {
  return items
    .filter((r) => r.name.trim().length > 0)
    .map((r) => ({
      name: r.name.trim(),
      goal: r.goal?.trim() || undefined,
      seconds: r.seconds && r.seconds > 0 ? Math.round(r.seconds) : undefined,
      notes: r.notes?.trim() || undefined,
    }));
}

/**
 * Editor de la secuencia de beats: el esqueleto emocional del formato.
 * El orden importa más que las palabras, por eso se reordena a mano.
 */
export function BeatsEditor({
  structureId,
  updatedAt,
  beats,
  defaultDurationSec,
  canEdit,
}: {
  structureId: string;
  updatedAt: string;
  beats: Beat[];
  defaultDurationSec: number;
  canEdit: boolean;
}) {
  const [rows, setRows] = useState<Row[]>(() => conKeys(beats));
  const inicial = JSON.stringify(limpiar(beats));
  const limpios = limpiar(rows);
  const serializado = JSON.stringify(limpios);
  const sucio = serializado !== inicial;

  const total = limpios.reduce((sum, b) => sum + (b.seconds ?? 0), 0);
  const sinSegundos = limpios.some((b) => !b.seconds);
  const desfase = total - defaultDurationSec;
  const margen = Math.max(3, Math.round(defaultDurationSec * 0.12));
  const descuadra = total > 0 && Math.abs(desfase) > margen;

  const editar = (key: string, cambio: Partial<Beat>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...cambio } : r)));

  const mover = (index: number, delta: number) =>
    setRows((prev) => {
      const destino = index + delta;
      if (destino < 0 || destino >= prev.length) return prev;
      const copia = [...prev];
      const [row] = copia.splice(index, 1);
      copia.splice(destino, 0, row);
      return copia;
    });

  const eliminar = (key: string) => setRows((prev) => prev.filter((r) => r.key !== key));

  const anadir = () =>
    setRows((prev) => [...prev, { key: nuevaKey(), name: "", goal: "", seconds: 5, notes: "" }]);

  return (
    <EditForm action={guardarBeats} className="card">
<RevisionField value={updatedAt} />
      <input type="hidden" name="id" value={structureId} />
      <input type="hidden" name="beats" value={serializado} />

      <div className="card-hd">
        <div className="min-w-0">
          <div className="card-title flex items-center gap-2">
            <ListOrdered size={14} className="text-inkmuted" />
            Secuencia de beats
          </div>
          <div className="card-sub mt-0.5">
            El esqueleto emocional del formato. La IA genera una escena por beat y jamás
            altera el orden.
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {sucio ? <span className="chip chip-plain">Sin guardar</span> : null}
          <span className="chip chip-plain">
            {limpios.length} {limpios.length === 1 ? "beat" : "beats"}
          </span>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<ListOrdered size={19} />}
          title="Este formato todavía no tiene beats"
          description="Sin beats, la IA improvisa el orden y el video pierde la fuerza. Escribe la secuencia paso a paso o arranca desde la plantilla clásica."
          action={
            canEdit ? (
              <div className="flex flex-wrap justify-center gap-2">
                <button type="button" className="btn btn-primary" onClick={anadir}>
                  <Plus size={14} /> Añadir el primer beat
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setRows(conKeys(PLANTILLA))}
                >
                  <Wand2 size={14} /> Usar la plantilla clásica
                </button>
              </div>
            ) : undefined
          }
        />
      ) : (
        <div className="p-3">
          <div className="text-inkmuted mb-1.5 hidden grid-cols-[26px_1.1fr_1.3fr_74px_1.2fr_78px] gap-2 px-1 text-[10.5px] font-bold tracking-[0.07em] uppercase lg:grid">
            <span>#</span>
            <span>Beat</span>
            <span>Objetivo emocional</span>
            <span>Segundos</span>
            <span>Notas de dirección</span>
            <span className="text-right">Orden</span>
          </div>

          <ul className="space-y-1.5">
            {rows.map((row, i) => (
              <li
                key={row.key}
                className="bg-surface2 border-line grid grid-cols-1 gap-2 rounded-xl border p-2 lg:grid-cols-[26px_1.1fr_1.3fr_74px_1.2fr_78px] lg:items-start lg:border-0 lg:bg-transparent lg:p-1"
              >
                <span className="bg-surface3 text-inkmuted flex h-[34px] w-[26px] items-center justify-center rounded-md text-[11.5px] font-bold">
                  {i + 1}
                </span>

                <input
                  className="input h-[34px] text-[12.5px] font-semibold"
                  value={row.name}
                  disabled={!canEdit}
                  placeholder="Ej. Golpe visual"
                  onChange={(e) => editar(row.key, { name: e.target.value })}
                  aria-label={`Nombre del beat ${i + 1}`}
                />

                <input
                  className="input h-[34px] text-[12.5px]"
                  value={row.goal ?? ""}
                  disabled={!canEdit}
                  placeholder="Qué tiene que sentir quien mira"
                  onChange={(e) => editar(row.key, { goal: e.target.value })}
                  aria-label={`Objetivo del beat ${i + 1}`}
                />

                <input
                  className="input h-[34px] text-[12.5px]"
                  type="number"
                  min={0}
                  max={600}
                  value={row.seconds ?? ""}
                  disabled={!canEdit}
                  placeholder="s"
                  onChange={(e) =>
                    editar(row.key, { seconds: e.target.value ? Number(e.target.value) : undefined })
                  }
                  aria-label={`Segundos del beat ${i + 1}`}
                />

                <input
                  className="input h-[34px] text-[12.5px]"
                  value={row.notes ?? ""}
                  disabled={!canEdit}
                  placeholder="Encuadre, tono, detalle a cuidar…"
                  onChange={(e) => editar(row.key, { notes: e.target.value })}
                  aria-label={`Notas del beat ${i + 1}`}
                />

                {canEdit ? (
                  <div className="flex items-center justify-end gap-0.5">
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon h-[30px] w-[26px]"
                      onClick={() => mover(i, -1)}
                      disabled={i === 0}
                      title="Subir"
                      aria-label={`Subir el beat ${i + 1}`}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon h-[30px] w-[26px]"
                      onClick={() => mover(i, 1)}
                      disabled={i === rows.length - 1}
                      title="Bajar"
                      aria-label={`Bajar el beat ${i + 1}`}
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon text-danger h-[30px] w-[26px]"
                      onClick={() => eliminar(row.key)}
                      title="Eliminar este beat"
                      aria-label={`Eliminar el beat ${i + 1}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ) : (
                  <span />
                )}
              </li>
            ))}
          </ul>

          {canEdit ? (
            <button type="button" className="btn btn-sm mt-2.5" onClick={anadir}>
              <Plus size={13} /> Añadir beat
            </button>
          ) : null}
        </div>
      )}

      <div className="border-line flex flex-wrap items-center justify-between gap-3 border-t p-3">
        <div className="min-w-0 flex-1">
          <div className="text-inksoft text-[12.5px]">
            Suma de los beats:{" "}
            <strong className={cn("text-ink", descuadra && "text-warn")}>
              {formatSeconds(total)}
            </strong>{" "}
            frente a la duración por defecto{" "}
            <strong className="text-ink">{formatSeconds(defaultDurationSec)}</strong>
            {total > 0 ? (
              <span className="text-inkmuted">
                {" "}
                ({desfase === 0 ? "cuadra exacto" : `${desfase > 0 ? "+" : ""}${desfase} s`})
              </span>
            ) : null}
          </div>
          {descuadra ? (
            <div className="mt-2">
              <Callout tone="warn" title="Los tiempos no cuadran">
                La suma de los beats se aleja {Math.abs(desfase)} segundos de la duración por
                defecto del formato. Ajusta los segundos de cada beat o cambia la duración en la
                pestaña Prompt: la IA usa esa cifra para repartir las escenas.
              </Callout>
            </div>
          ) : null}
          {!descuadra && sinSegundos && limpios.length > 0 ? (
            <div className="text-inkmuted mt-1 text-[11.5px]">
              Hay beats sin segundos. Ponerlos ayuda a que la IA reparta bien el tiempo.
            </div>
          ) : null}
        </div>

        {canEdit ? (
          <SubmitButton
            className="btn btn-primary shrink-0"
            icon={<Save size={14} />}
            pendingLabel="Guardando…"
            disabled={!sucio}
          >
            Guardar beats
          </SubmitButton>
        ) : null}
      </div>
    </EditForm>
  );
}
