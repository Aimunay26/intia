"use client";

import { lazy, Suspense, useRef, useState } from "react";
import { ArrowRight, ChevronRight, MoreHorizontal, Search, X } from "lucide-react";
import { Card } from "@/components/ui";
import { STRUCTURE_CATEGORY_MAP } from "@/lib/constants";
import { GUIA_TARGETS } from "@/lib/guia/catalogo";
import { cn, formatSeconds } from "@/lib/utils";
import type { GeneratorStructure } from "./generator-form";
import styles from "./format-step.module.css";

const FormatReference = lazy(() => import("./format-reference"));

export function FormatStep({
  structures, filteredStructures, selectedIds, maxBatch,
  category, search, onCategoryChange, onSearchChange,
  onToggle, onSelectOnly, onSelectVisible, onClear, onContinue,
}: {
  structures: GeneratorStructure[];
  filteredStructures: GeneratorStructure[];
  selectedIds: string[];
  maxBatch: number;
  category: string;
  search: string;
  onCategoryChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onToggle: (structure: GeneratorStructure) => void;
  onSelectOnly: (structure: GeneratorStructure) => void;
  onSelectVisible: () => void;
  onClear: () => void;
  onContinue: () => void;
}) {
  // Consultar un ejemplo no cambia el lote, el modelo, la duración ni el cierre.
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const referenceTrigger = useRef<HTMLButtonElement | null>(null);
  const selectionMenu = useRef<HTMLDetailsElement | null>(null);
  const inspected = structures.find((s) => s.id === inspectedId);
  const filters = [
    { value: "TODOS", label: "Todos", count: structures.length },
    ...["VENDE", "ENTRETIENE"].map((value) => ({
      value,
      label: STRUCTURE_CATEGORY_MAP[value].label,
      count: structures.filter((s) => s.category === value).length,
    })),
  ];

  const toggle = (structure: GeneratorStructure) => {
    if (!selectedIds.includes(structure.id) && selectedIds.length >= maxBatch) {
      setNotice(`Puedes elegir hasta ${maxBatch} formatos. Quita uno para añadir otro.`);
      return;
    }
    setNotice("");
    onToggle(structure);
  };

  const inspect = (structure: GeneratorStructure, trigger: HTMLButtonElement) => {
    referenceTrigger.current = trigger;
    setInspectedId(structure.id);
  };

  const closeSelectionMenu = () => {
    if (!selectionMenu.current) return;
    selectionMenu.current.open = false;
    selectionMenu.current.querySelector("summary")?.focus();
  };

  return (
    <Card className="p-4 sm:p-6">
      <header>
        <h2 className="text-ink text-xl font-bold tracking-tight sm:text-2xl">¿Qué formato quieres crear?</h2>
        <p className="text-inkmuted mt-2 text-sm">Elige hasta {maxBatch}. Crearemos un guion por formato.</p>
      </header>

      <div className="my-6 flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Categoría del formato" className="border-line flex max-w-full basis-full flex-wrap border-b sm:basis-auto">
          {filters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              aria-pressed={category === filter.value}
              onClick={() => onCategoryChange(filter.value)}
              className={cn(styles.filter, "min-h-11 px-2.5 py-2 text-[13px] transition-colors", category === filter.value ? "font-bold" : "text-inkmuted hover:text-ink")}
            >
              {filter.label} <span className="text-inkmuted text-xs">({filter.count})</span>
            </button>
          ))}
        </div>
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Buscar formato</span>
          <Search size={16} aria-hidden="true" className="text-inkmuted pointer-events-none absolute top-1/2 left-3 -translate-y-1/2" />
          <input type="search" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Buscar un formato…" className={cn("input min-h-11", styles.search)} />
        </label>
        <details ref={selectionMenu} className="relative" onKeyDown={(event) => {
          if (event.key === "Escape") closeSelectionMenu();
        }}>
          <summary className="btn btn-ghost min-h-11 list-none [&::-webkit-details-marker]:hidden" aria-label="Más opciones de selección">
            Más <MoreHorizontal size={16} aria-hidden="true" />
          </summary>
          <div className="border-line bg-surface absolute right-0 z-20 mt-1 w-64 max-w-[calc(100vw-3rem)] rounded-xl border p-1.5 shadow-[var(--shadow-2)]">
            <button type="button" className="btn btn-ghost w-full justify-start text-left whitespace-normal" disabled={!filteredStructures.length} onClick={() => { setNotice(""); onSelectVisible(); closeSelectionMenu(); }}>
              Seleccionar visibles (hasta {Math.min(maxBatch, filteredStructures.length)})
            </button>
            <button type="button" className="btn btn-ghost w-full justify-start" disabled={!selectedIds.length} onClick={() => { setNotice(""); onClear(); closeSelectionMenu(); }}>Limpiar selección</button>
          </div>
        </details>
      </div>

      <div className="grid gap-4 sm:grid-cols-2" data-guia={GUIA_TARGETS.SELECT_GENERADOR_ESTRUCTURA}>
        {filteredStructures.map((structure) => {
          const selected = selectedIds.includes(structure.id);
          return (
            <article key={structure.id} data-selected={selected} className={cn(styles.formatCard, "card-flat flex min-w-0 flex-col transition-colors", !selected && "hover:border-linestrong")}>
              <label className="flex flex-1 cursor-pointer items-start gap-3 p-5 pb-2">
                <input type="checkbox" checked={selected} onChange={() => toggle(structure)} aria-label={`Seleccionar ${structure.name}`} className="mt-1 h-[18px] w-[18px] shrink-0 accent-brand" />
                <span className="min-w-0">
                  <span className="text-ink block text-[15px] leading-snug font-bold wrap-break-word">{structure.name}</span>
                  {structure.summary ? <span className={cn(styles.description, "text-inkmuted mt-2 text-[13px] leading-relaxed")}>{structure.summary}</span> : null}
                </span>
              </label>
              <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-2 pb-4">
                <span className="text-inkmuted text-xs">{STRUCTURE_CATEGORY_MAP[structure.category]?.label ?? structure.category} · {formatSeconds(structure.defaultDurationSec)}</span>
                <button type="button" className="text-brand inline-flex min-h-9 items-center gap-1 py-1 text-xs font-semibold hover:underline" onClick={(event) => inspect(structure, event.currentTarget)} aria-label={`Ver ejemplo de ${structure.name}`}>
                  Ver ejemplo <ChevronRight size={14} aria-hidden="true" />
                </button>
              </div>
            </article>
          );
        })}
        {!filteredStructures.length ? (
          <div className="text-inkmuted py-10 text-center text-sm sm:col-span-2">
            <p>No hay formatos que coincidan con tu búsqueda.</p>
            <button type="button" className="btn btn-ghost mt-3" onClick={() => { onCategoryChange("TODOS"); onSearchChange(""); }}>Mostrar todos los formatos</button>
          </div>
        ) : null}
      </div>

      <div className="border-line bg-surface mt-6 rounded-xl border p-4 shadow-[var(--shadow-1)] sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-ink text-[13px] font-semibold" aria-live="polite">
              {selectedIds.length ? `${selectedIds.length} de ${maxBatch} formatos seleccionados` : "Selecciona un formato para continuar"}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {selectedIds.map((id) => {
                const structure = structures.find((s) => s.id === id);
                if (!structure) return null;
                return (
                  <span key={id} className="bg-brandsoft text-brand inline-flex max-w-full items-center rounded-md text-xs">
                    <button type="button" onClick={(event) => inspect(structure, event.currentTarget)} className="min-w-0 px-2.5 py-2 text-left wrap-break-word hover:underline" aria-label={`Ver referencia de ${structure.name}`}>{structure.name}</button>
                    <button type="button" onClick={() => toggle(structure)} className="shrink-0 rounded-r-md p-2 hover:bg-brand/10" aria-label={`Quitar ${structure.name}`}><X size={14} aria-hidden="true" /></button>
                  </span>
                );
              })}
            </div>
          </div>
          <div className="shrink-0">
            <button type="button" disabled={!selectedIds.length} onClick={onContinue} className="btn btn-primary min-h-11 w-full" data-guia={GUIA_TARGETS.BTN_GENERADOR_CONTINUAR_1}>
              Continuar <ArrowRight size={16} aria-hidden="true" />
            </button>
            <p className="text-inkmuted mt-1.5 text-center text-xs">Sigue: Identidad y producto</p>
          </div>
        </div>
        <p role="status" aria-live="polite" className={cn("text-warn text-sm", notice && "mt-3")}>{notice}</p>
      </div>

      {inspected ? (
        <Suspense fallback={<p className="text-inkmuted mt-3 text-sm" role="status">Abriendo referencia…</p>}>
          <FormatReference
            structure={inspected}
            selected={selectedIds.includes(inspected.id)}
            atLimit={selectedIds.length >= maxBatch}
            maxBatch={maxBatch}
            returnFocusTo={referenceTrigger.current}
            onClose={() => setInspectedId(null)}
            onToggle={() => toggle(inspected)}
            onSelectOnly={() => { setNotice(""); onSelectOnly(inspected); }}
          />
        </Suspense>
      ) : null}
    </Card>
  );
}
