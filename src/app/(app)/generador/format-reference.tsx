"use client";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { STRUCTURE_CATEGORY_MAP } from "@/lib/constants";
import { getStructureReference } from "@/lib/structure-references";
import { formatSeconds } from "@/lib/utils";
import type { GeneratorStructure } from "./generator-form";

export default function FormatReference({ structure, selected, atLimit, maxBatch, returnFocusTo, onClose, onToggle, onSelectOnly }: {
  structure: GeneratorStructure;
  selected: boolean;
  atLimit: boolean;
  maxBatch: number;
  returnFocusTo: HTMLButtonElement | null;
  onClose: () => void;
  onToggle: () => void;
  onSelectOnly: () => void;
}) {
  const reference = getStructureReference(structure.name);
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl sm:p-6" onCloseAutoFocus={(event) => { event.preventDefault(); if (returnFocusTo?.isConnected) returnFocusTo.focus(); }}>
        <DialogTitle>{structure.name}</DialogTitle>
        <DialogDescription>{STRUCTURE_CATEGORY_MAP[structure.category]?.label ?? structure.category} · {formatSeconds(structure.defaultDurationSec)}{structure.family ? ` · ${structure.family}` : ""}</DialogDescription>
        {structure.summary ? <p className="text-inksoft mt-4 text-sm leading-relaxed">{structure.summary}</p> : null}
        <div className="mt-5 space-y-3 text-sm leading-relaxed">
          <h3 className="text-ink font-bold">Gancho · Primeros 3 segundos</h3>
          <p className="text-inksoft">{reference.hookStrategy}</p>
          <blockquote className="border-brand bg-brandsoft rounded-r-lg border-l-2 px-4 py-3 text-base font-medium">{reference.hookExample}</blockquote>
        </div>
        <details className="border-line mt-5 border-t pt-4">
          <summary className="text-brand cursor-pointer py-1 text-sm font-semibold">Ver estructura, reglas y referencias</summary>
          <div className="mt-4 space-y-4 text-sm leading-relaxed">
            <span className="chip chip-brand">{reference.badge}</span>
            <div><h3 className="font-bold">Modelo mental</h3><p className="text-inksoft mt-1">{reference.mentalModel}</p></div>
            <div><h3 className="font-bold">Regla de oro</h3><p className="text-inksoft mt-1">{reference.keyRule}</p></div>
            <div><h3 className="font-bold">Retención</h3><p className="text-inksoft mt-1">{reference.retentionSecret}</p></div>
            <div>
              <h3 className="font-bold">Beats obligatorios · {structure.beats.length}</h3>
              {structure.beats.length ? <ol className="mt-2 list-decimal space-y-3 pl-5">
                {structure.beats.map((beat, index) => <li key={`${beat.name}-${index}`}>
                  <span className="font-semibold">{beat.name}</span>{beat.seconds ? <span className="text-inkmuted"> · ~{beat.seconds}s</span> : null}
                  {beat.goal ? <p className="text-inksoft">{beat.goal}</p> : null}
                  {beat.notes ? <p className="text-inkmuted">{beat.notes}</p> : null}
                </li>)}
              </ol> : <p className="text-warn mt-1">Esta estructura no tiene beats. Añádelos en su ficha para que el formato se respete.</p>}
            </div>
            <div><h3 className="font-bold">Documentos de referencia</h3><p className="text-inksoft mt-1">{structure.docs ? `${structure.docs} documento${structure.docs === 1 ? "" : "s"} de la estructura habilitado${structure.docs === 1 ? "" : "s"} para la IA.` : "No hay documentos habilitados y con texto para la IA en esta estructura."}</p></div>
          </div>
        </details>
        <div className="border-line mt-6 border-t pt-4">
          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn btn-primary" disabled={!selected && atLimit} onClick={onToggle}>{selected ? "Quitar de la selección" : "Añadir a mi selección"}</button>
            <button type="button" className="btn btn-ghost" onClick={onSelectOnly}>Solo este</button>
          </div>
          {!selected && atLimit ? <p className="text-inkmuted mt-3 text-sm">Ya elegiste {maxBatch} formatos. Quita uno o usa «Solo este» para reemplazar la selección.</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
