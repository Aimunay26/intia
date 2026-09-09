"use client";

import { Fragment, useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Film,
  Layers,
  Loader2,
  Package,
  RotateCcw,
  Search,
  Sparkles,
  Tags,
  Target,
  UserSquare2,
  Wand2,
} from "lucide-react";

import { generarGuion, type GenerateState } from "@/app/actions/scripts";
import {
  ANGULOS_CREATIVOS,
  CTA_TRIGGERS,
  CTA_ACTIONS,
  armarCtaTexto,
} from "@/lib/script-angles";
import {
  AI_MODELS,
  AI_PROVIDERS,
  FIT_SCORES,
  STRUCTURE_CATEGORIES,
  STRUCTURE_CATEGORY_MAP,
} from "@/lib/constants";
import { cn, formatSeconds, withAlpha } from "@/lib/utils";
import { GUIA_TARGETS } from "@/lib/guia/catalogo";
import { getStructureReference } from "@/lib/structure-references";
import { Callout, Card, CardHeader, Field, SectionTitle } from "@/components/ui";

/* ------------------------------------------------------------------ TIPOS -- */

export type GeneratorBeat = {
  name: string;
  goal?: string;
  seconds?: number;
  notes?: string;
};

export type GeneratorStructure = {
  id: string;
  name: string;
  category: string;
  family: string | null;
  summary: string | null;
  beats: GeneratorBeat[];
  defaultDurationSec: number;
  defaultProvider: string;
  defaultModel: string;
  docs: number;
};

export type GeneratorBrand = {
  id: string;
  name: string;
  color: string;
  tagline: string | null;
  audience: string | null;
  toneOfVoice: string | null;
  identity: string | null;
  valueProps: string[];
  doNots: string[];
  keywords: string[];
  docs: number;
};

export type GeneratorArchetype = {
  id: string;
  name: string;
  color: string;
  summary: string | null;
  energyLevel: number;
  /** Falso para las plantillas genericas que no son nadie del equipo. */
  isPerson: boolean;
  /** Su arquetipo principal y secundario, ya unidos: "El Bufón · El Forajido". */
  arquetipo: string;
  /** Si tiene tono de voz cargado, la IA puede escribir sus dialogos. */
  tieneVoz: boolean;
  docs: number;
  /** Compatibilidad por estructura: { [structureId]: { score, notes } } */
  fits: Record<string, { score: number; notes: string | null }>;
};

/* ------------------------------------------------------------ AUXILIARES -- */

function FitBadge({ score, className }: { score: number | null; className?: string }) {
  if (score === null || score === undefined) {
    return <span className={cn("chip chip-plain", className)}>Sin evaluar</span>;
  }
  const fit = FIT_SCORES[score] ?? FIT_SCORES[2];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-[2px] text-[10.5px] font-bold whitespace-nowrap",
        className
      )}
      style={{
        background: withAlpha(fit.hex, 0.13),
        color: fit.hex,
        boxShadow: `inset 0 0 0 1px ${withAlpha(fit.hex, 0.3)}`,
      }}
    >
      {fit.label}
    </span>
  );
}

function PanelRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2.5">
      <span className="text-inkmuted mt-[3px] shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-inkmuted text-[10.5px] font-bold tracking-wider uppercase">
          {label}
        </div>
        <div className="text-inksoft mt-0.5 text-[12.5px] leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ COMPONENTE -- */

export function GeneratorForm({
  structures,
  brands,
  archetypes,
  providersReady,
  initialStructureId,
  initialBrandId,
  initialArchetypeId,
  initialProduct,
  initialRequest,
  initialAngle,
}: {
  structures: GeneratorStructure[];
  brands: GeneratorBrand[];
  archetypes: GeneratorArchetype[];
  providersReady: Record<string, boolean>;
  initialStructureId: string;
  initialBrandId: string;
  initialArchetypeId?: string;
  initialProduct?: string;
  initialRequest?: string;
  initialAngle?: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<GenerateState, FormData>(
    generarGuion,
    null
  );

  const primeraEstructura =
    structures.find((s) => s.id === initialStructureId) ?? null;

  const proveedorInicial = (() => {
    const preferido = primeraEstructura?.defaultProvider || "anthropic";
    if (providersReady[preferido]) return preferido;
    const disponible = AI_PROVIDERS.find((p) => providersReady[p.value]);
    return disponible?.value ?? preferido;
  })();

  const [currentStep, setCurrentStep] = useState<number>(1);
  const [maxStepReached, setMaxStepReached] = useState<number>(initialStructureId ? 2 : 1);
  const [categoryFilter, setCategoryFilter] = useState<string>("TODOS");
  const [searchStructure, setSearchStructure] = useState<string>("");
  const [producto, setProducto] = useState<string>(initialProduct ?? "");
  const [productoDetalle, setProductoDetalle] = useState<string>("");
  const [peticion, setPeticion] = useState<string>(initialRequest ?? "");
  const [variante, setVariante] = useState<string>("");

  const [selectedStructureIds, setSelectedStructureIds] = useState<string[]>(() => {
    if (initialStructureId) return [initialStructureId];
    if (primeraEstructura) return [primeraEstructura.id];
    return structures.length ? [structures[0].id] : [];
  });
  const [previewStructureId, setPreviewStructureId] = useState<string>(
    initialStructureId || (primeraEstructura?.id ?? (structures[0]?.id ?? ""))
  );
  const [brandId, setBrandId] = useState(initialBrandId);
  const [archetypeId, setArchetypeId] = useState(initialArchetypeId ?? "");
  const [duracion, setDuracion] = useState(
    String(primeraEstructura?.defaultDurationSec ?? 45)
  );
  const [provider, setProvider] = useState(proveedorInicial);
  const [model, setModel] = useState(primeraEstructura?.defaultModel ?? "");
  const [creativeAngle, setCreativeAngle] = useState(initialAngle ?? "");
  const [ctaTrigger, setCtaTrigger] = useState("escasez");
  const [ctaAction, setCtaAction] = useState("compra");
  const [ctaDetail, setCtaDetail] = useState(
    "Solo puedo atender a 9 clientes y ya tengo 5, las plazas de atención se llenan"
  );
  const [cta, setCta] = useState(
    "Si no me compras ahora solo puedo atender a 9 clientes y ya tengo 5 clientes, así que ya lo sabes: las plazas de atención se llenan y conmigo vas a conseguir los resultados que quieres."
  );
  const [segundos, setSegundos] = useState(0);

  const structure =
    structures.find((s) => s.id === previewStructureId) ??
    structures.find((s) => selectedStructureIds.includes(s.id)) ??
    structures[0] ??
    null;
  const brand = brands.find((b) => b.id === brandId) ?? null;
  const archetype = archetypes.find((a) => a.id === archetypeId) ?? null;

  const fitActual =
    archetype && structure ? (archetype.fits[structure.id]?.score ?? null) : null;
  const notaFit =
    archetype && structure ? (archetype.fits[structure.id]?.notes ?? null) : null;

  // Al terminar, el guion nuevo se abre solo.
  useEffect(() => {
    if (state?.scriptId) router.push(`/guiones/${state.scriptId}`);
  }, [state?.scriptId, router]);

  // Contador honesto de lo que lleva esperando.
  useEffect(() => {
    if (!pending) {
      setSegundos(0);
      return;
    }
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [pending]);

  const toggleEstructura = (s: GeneratorStructure) => {
    setSelectedStructureIds((prev) => {
      const exists = prev.includes(s.id);
      if (exists) {
        const next = prev.filter((id) => id !== s.id);
        if (next.length > 0 && previewStructureId === s.id) {
          setPreviewStructureId(next[0]);
        }
        return next;
      } else {
        setPreviewStructureId(s.id);
        return [...prev, s.id];
      }
    });
    setDuracion(String(s.defaultDurationSec || 45));
    if (s.defaultModel) setModel(s.defaultModel);
    if (s.defaultProvider && providersReady[s.defaultProvider]) {
      setProvider(s.defaultProvider);
    }
  };

  const seleccionarSoloEsta = (s: GeneratorStructure, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedStructureIds([s.id]);
    setPreviewStructureId(s.id);
    setDuracion(String(s.defaultDurationSec || 45));
    if (s.defaultModel) setModel(s.defaultModel);
    if (s.defaultProvider && providersReady[s.defaultProvider]) {
      setProvider(s.defaultProvider);
    }
  };

  const seleccionarTodasFiltradas = () => {
    const ids = structuresFiltradas.map((s) => s.id);
    setSelectedStructureIds((prev) => Array.from(new Set([...prev, ...ids])));
  };

  const deseleccionarTodas = () => {
    setSelectedStructureIds([]);
  };

  // La gente del equipo primero; dentro de cada grupo, quien mejor encaje.
  const arquetiposOrdenados = useMemo(() => {
    return [...archetypes].sort((a, b) => {
      if (a.isPerson !== b.isPerson) return a.isPerson ? -1 : 1;
      if (structure) {
        const sa = a.fits[structure.id]?.score ?? 1.5;
        const sb = b.fits[structure.id]?.score ?? 1.5;
        if (sa !== sb) return sb - sa;
      }
      return a.name.localeCompare(b.name);
    });
  }, [archetypes, structure]);

  const docsEstructura = structure?.docs ?? 0;
  const docsArquetipo = archetype?.docs ?? 0;
  const docsMarca = brand?.docs ?? 0;
  const docsTotal = docsEstructura + docsArquetipo + docsMarca;

  const sinClaves = !AI_PROVIDERS.some((p) => providersReady[p.value]);
  const puedeGenerar = Boolean(
    selectedStructureIds.length > 0 && providersReady[provider] && !pending
  );

  const modelosSugeridos = AI_MODELS[provider] ?? [];

  // --- PASOS DEL ASISTENTE DE IDEACIÓN (GEMINI-STYLE) ---
  const PASOS = [
    {
      id: 1,
      numero: 1,
      titulo: "Formato",
      descripcion: "Tipo de guion",
      icono: <Layers size={13} />,
      resumen:
        selectedStructureIds.length === 0
          ? "Sin elegir"
          : selectedStructureIds.length === 1
            ? (structures.find((s) => s.id === selectedStructureIds[0])?.name ?? "1 formato")
            : `${selectedStructureIds.length} formatos (Lote)`,
      completo: selectedStructureIds.length > 0,
    },
    {
      id: 2,
      numero: 2,
      titulo: "Identidad & Producto",
      descripcion: "Marca, actor y producto",
      icono: <Package size={13} />,
      resumen: producto.trim() ? (producto.length > 18 ? producto.slice(0, 18) + "…" : producto) : "Pendiente",
      completo: Boolean(producto.trim()),
    },
    {
      id: 3,
      numero: 3,
      titulo: "Ángulo & Idea",
      descripcion: "Enfoque e historia",
      icono: <Sparkles size={13} />,
      resumen: creativeAngle
        ? (ANGULOS_CREATIVOS.find((a) => a.id === creativeAngle)?.shortLabel ?? "Ángulo")
        : "Estándar",
      completo: peticion.trim().length >= 5,
    },
    {
      id: 4,
      numero: 4,
      titulo: "Cierre CTA",
      descripcion: "Gatillos Hormozi",
      icono: <Target size={13} />,
      resumen: CTA_TRIGGERS.find((t) => t.id === ctaTrigger)?.shortLabel ?? "Hormozi",
      completo: cta.trim().length > 0,
    },
    {
      id: 5,
      numero: 5,
      titulo: "Generar IA",
      descripcion: "Checklist y motor",
      icono: <Bot size={13} />,
      resumen: providersReady[provider] ? "Listo" : "Sin clave",
      completo: Boolean(selectedStructureIds.length > 0 && providersReady[provider]),
    },
  ];

  const puedeAvanzarPaso1 = selectedStructureIds.length > 0;
  const puedeAvanzarPaso2 = Boolean(producto.trim().length > 0);
  const puedeAvanzarPaso3 = Boolean(peticion.trim().length >= 5);
  const puedeAvanzarPaso4 = Boolean(cta.trim().length > 0);

  const irAlPaso = (paso: number) => {
    if (paso <= maxStepReached) {
      setCurrentStep(paso);
    }
  };

  const avanzarPaso = (proximo: number) => {
    setCurrentStep(proximo);
    setMaxStepReached((prev) => Math.max(prev, proximo));
  };

  const structuresFiltradas = useMemo(() => {
    return structures.filter((s) => {
      if (categoryFilter !== "TODOS" && s.category !== categoryFilter) return false;
      if (searchStructure.trim()) {
        const q = searchStructure.toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          (s.family && s.family.toLowerCase().includes(q)) ||
          (s.summary && s.summary.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [structures, categoryFilter, searchStructure]);

  const countVende = structures.filter((s) => s.category === "VENDE").length;
  const countEntretiene = structures.filter((s) => s.category === "ENTRETIENE").length;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_368px]">
      {/* ------------------------------------------------- COLUMNA IZQUIERDA */}
      <form action={formAction} className="min-w-0 space-y-4">
        {/* CAMPOS OCULTOS PARA CONSERVAR EL BRIEFING COMPLETO EN TODAS LAS ETAPAS */}
        <input
          type="hidden"
          name="estructura"
          value={previewStructureId || selectedStructureIds[0] || ""}
        />
        <input
          type="hidden"
          name="estructuras"
          value={selectedStructureIds.join(",")}
        />
        <input type="hidden" name="marca" value={brandId} />
        <input type="hidden" name="arquetipo" value={archetypeId} />
        <input type="hidden" name="producto" value={producto} />
        <input type="hidden" name="productoDetalle" value={productoDetalle} />
        <input type="hidden" name="anguloCreativo" value={creativeAngle} />
        <input type="hidden" name="peticion" value={peticion} />
        <input type="hidden" name="variante" value={variante} />
        <input type="hidden" name="ctaGatillo" value={ctaTrigger} />
        <input type="hidden" name="ctaAccion" value={ctaAction} />
        <input type="hidden" name="ctaDetalle" value={ctaDetail} />
        <input type="hidden" name="cta" value={cta} />
        <input type="hidden" name="duracion" value={duracion} />
        <input type="hidden" name="proveedor" value={provider} />
        <input type="hidden" name="modelo" value={model} />

        {/* BARRA SUPERIOR DE ETAPAS (STEPPER GEMINI-STYLE) */}
        <div
          className="card overflow-hidden p-3"
          data-guia={GUIA_TARGETS.GENERADOR_STEPPER_BAR}
        >
          <div className="flex items-center justify-between gap-2 mb-2 px-1">
            <div className="flex items-center gap-2">
              <span className="chip chip-brand text-[11px] font-bold">
                Etapa {currentStep} de 5
              </span>
              <span className="text-ink font-semibold text-[13px] hidden sm:inline">
                {PASOS[currentStep - 1]?.titulo}
              </span>
            </div>
            <span className="text-inkmuted text-[11px]">
              {Math.round((currentStep / 5) * 100)}% del proceso
            </span>
          </div>

          {/* Barra de progreso interactiva */}
          <div className="w-full bg-surface2 h-1.5 rounded-full overflow-hidden mb-3">
            <div
              className="bg-brand h-full transition-all duration-300 rounded-full"
              style={{ width: `${(currentStep / 5) * 100}%` }}
            />
          </div>

          {/* Botones de navegación directa de etapas */}
          <div className="grid grid-cols-5 gap-1 sm:gap-2">
            {PASOS.map((p) => {
              const esActivo = p.id === currentStep;
              const esCompletado = p.id < currentStep || (p.completo && p.id !== currentStep);
              const estaDesbloqueado = p.id <= maxStepReached;

              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={!estaDesbloqueado}
                  onClick={() => irAlPaso(p.id)}
                  className={cn(
                    "flex flex-col items-start p-2 rounded-lg text-left transition-all border relative",
                    esActivo
                      ? "border-brand bg-brandsoft/70 ring-1 ring-brand shadow-sm"
                      : esCompletado
                        ? "border-line bg-surface hover:bg-surface2 cursor-pointer"
                        : "border-line/50 bg-surface/30 opacity-50 cursor-not-allowed"
                  )}
                  title={estaDesbloqueado ? `Ir a ${p.titulo}` : "Completa la etapa actual para desbloquear"}
                >
                  <div className="flex items-center gap-1.5 w-full">
                    <span
                      className={cn(
                        "w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0",
                        esActivo
                          ? "bg-brand text-white"
                          : esCompletado
                            ? "bg-ok text-white"
                            : "bg-surface2 text-inkmuted"
                      )}
                    >
                      {esCompletado && !esActivo ? <Check size={10} /> : p.numero}
                    </span>
                    <span
                      className={cn(
                        "text-[11px] font-semibold truncate flex-1",
                        esActivo ? "text-ink" : "text-inkmuted"
                      )}
                    >
                      {p.titulo}
                    </span>
                  </div>
                  <div className="text-[9.5px] text-inkmuted truncate w-full mt-1 hidden md:block">
                    {p.resumen}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* ETAPA 1: FORMATO / TIPO DE GUIÓN                                   */}
        {/* ------------------------------------------------------------------ */}
        {currentStep === 1 && (
          <Card>
            <CardHeader
              title="1 · Elige el tipo de guion (Estructuras ganadoras)"
              subtitle="Selecciona una o varias estructuras para generar versiones de tu idea en paralelo."
              icon={<Layers size={15} />}
              actions={
                selectedStructureIds.length > 0 ? (
                  <div className="flex items-center gap-1.5">
                    <span className="chip chip-brand font-semibold text-[11px]">
                      ✓ {selectedStructureIds.length} formato{selectedStructureIds.length > 1 ? "s" : ""}
                    </span>
                    {selectedStructureIds.length > 1 ? (
                      <span className="chip chip-plain text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10">
                        Lote activo
                      </span>
                    ) : null}
                  </div>
                ) : null
              }
            />
            <div className="space-y-3.5 p-4">
              {/* Filtros de Categoría y Búsqueda */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCategoryFilter("TODOS")}
                    className={cn(
                      "chip cursor-pointer text-[11px] transition-all",
                      categoryFilter === "TODOS" ? "chip-brand font-bold" : "chip-plain hover:bg-surface2"
                    )}
                  >
                    Todos ({structures.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategoryFilter("VENDE")}
                    className={cn(
                      "chip cursor-pointer text-[11px] transition-all",
                      categoryFilter === "VENDE" ? "chip-brand font-bold" : "chip-plain hover:bg-surface2"
                    )}
                  >
                    💰 Vende ({countVende})
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategoryFilter("ENTRETIENE")}
                    className={cn(
                      "chip cursor-pointer text-[11px] transition-all",
                      categoryFilter === "ENTRETIENE" ? "chip-brand font-bold" : "chip-plain hover:bg-surface2"
                    )}
                  >
                    🎭 Entretiene ({countEntretiene})
                  </button>
                </div>

                <div className="relative min-w-[200px]">
                  <Search size={13} className="text-inkmuted absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchStructure}
                    onChange={(e) => setSearchStructure(e.target.value)}
                    placeholder="Buscar formato (ej. Camaleón, PAS)..."
                    className="input pl-8 py-1 text-[11.5px]"
                  />
                </div>
              </div>

              {/* Barra de Acciones Rápidas de Selección Múltiple */}
              <div className="flex items-center justify-between gap-2 pt-1 border-b border-line/60 pb-2 text-[11.5px]">
                <div className="flex items-center gap-2">
                  <span className="text-ink font-semibold">
                    {selectedStructureIds.length} de {structures.length} seleccionados
                  </span>
                  {selectedStructureIds.length > 1 && (
                    <span className="text-inkmuted hidden sm:inline">
                      · Se generará un guion independiente para cada formato
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={seleccionarTodasFiltradas}
                    className="btn btn-ghost btn-xs text-[11px]"
                  >
                    Seleccionar visibles ({structuresFiltradas.length})
                  </button>
                  {selectedStructureIds.length > 0 && (
                    <button
                      type="button"
                      onClick={deseleccionarTodas}
                      className="btn btn-ghost btn-xs text-[11px] text-inkmuted hover:text-danger"
                    >
                      Limpiar
                    </button>
                  )}
                </div>
              </div>

              {/* Grid de Formatos con Checkboxes Interactivos */}
              <div
                className="grid gap-2 sm:grid-cols-2 max-h-[380px] overflow-y-auto pr-1 no-scrollbar"
                data-guia={GUIA_TARGETS.SELECT_GENERADOR_ESTRUCTURA}
              >
                {structuresFiltradas.map((s) => {
                  const isSelected = selectedStructureIds.includes(s.id);
                  const isInspecting = previewStructureId === s.id;
                  const ref = getStructureReference(s.name);

                  return (
                    <div
                      key={s.id}
                      onClick={() => toggleEstructura(s)}
                      className={cn(
                        "card-flat w-full p-3 text-left transition-all relative overflow-hidden cursor-pointer group",
                        isSelected
                          ? "border-brand bg-brandsoft/60 ring-1 ring-brand shadow-sm"
                          : "hover:border-linestrong hover:bg-surface2/60",
                        isInspecting && !isSelected && "ring-1 ring-brand/40"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div
                            className={cn(
                              "w-4 h-4 rounded border flex items-center justify-center transition-all shrink-0 mt-0.5",
                              isSelected
                                ? "bg-brand border-brand text-white"
                                : "border-line bg-surface text-transparent group-hover:border-brand/60"
                            )}
                          >
                            <Check size={11} className={isSelected ? "stroke-[3]" : "opacity-0"} />
                          </div>
                          <span className="text-ink text-[13px] leading-snug font-bold truncate">
                            {s.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-inkmuted text-[11px] font-semibold font-mono">
                            {formatSeconds(s.defaultDurationSec)}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => seleccionarSoloEsta(s, e)}
                            className="chip chip-plain hover:chip-brand text-[9.5px] px-1.5 py-0.5 opacity-60 hover:opacity-100 transition-opacity"
                            title="Seleccionar únicamente este formato"
                          >
                            Solo este
                          </button>
                        </div>
                      </div>

                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-6">
                        {s.family ? <span className="chip chip-plain text-[10px]">{s.family}</span> : null}
                        <span className="text-inkmuted text-[10.5px]">{s.beats.length} beats</span>

                        <span className="chip chip-brand text-[9.5px] font-semibold bg-brand/10 text-brand">
                          {ref.badge}
                        </span>
                        {isInspecting && (
                          <span className="text-[9.5px] text-brand font-medium">
                            · Viendo referencia ↓
                          </span>
                        )}
                      </div>

                      {s.summary ? (
                        <p className="text-inkmuted text-[11px] mt-1.5 pl-6 line-clamp-2 leading-relaxed">
                          {s.summary}
                        </p>
                      ) : null}

                      {s.beats.length ? (
                        <div className="text-inkmuted mt-1.5 pl-6 text-[10.5px] truncate font-mono">
                          {s.beats.map((b) => b.name).join(" → ")}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {/* Selector de referencia para inspección cuando hay múltiples seleccionados */}
              {selectedStructureIds.length > 1 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 no-scrollbar border-t border-line/50">
                  <span className="text-[11px] font-bold text-inkmuted shrink-0">Inspeccionar referencia:</span>
                  {selectedStructureIds.map((id) => {
                    const est = structures.find((x) => x.id === id);
                    if (!est) return null;
                    const inspecting = est.id === previewStructureId;
                    return (
                      <button
                        key={est.id}
                        type="button"
                        onClick={() => setPreviewStructureId(est.id)}
                        className={cn(
                          "chip text-[10.5px] shrink-0 transition-all",
                          inspecting ? "chip-brand font-bold" : "chip-plain hover:bg-surface2"
                        )}
                      >
                        {est.name}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Ficha de Referencia Enriquecida del Formato en Inspección */}
              {structure && (() => {
                const ref = getStructureReference(structure.name);
                return (
                  <div className="rounded-xl border border-brand/40 bg-brandsoft/30 p-3.5 space-y-2.5 transition-all">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-brand">{ref.badge}</span>
                        <span className="text-[13px] font-bold text-ink">Referencia: {structure.name}</span>
                        <span className="chip chip-plain text-[10px] uppercase font-semibold">
                          {structure.category === "VENDE" ? "💰 Vende" : "🎭 Entretiene"}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-inkmuted font-semibold">
                        {structure.beats.length} beats · ~{formatSeconds(structure.defaultDurationSec)}
                      </span>
                    </div>

                    <p className="text-[12px] text-ink leading-relaxed">
                      <strong>Modelo Mental:</strong> {ref.mentalModel}
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11.5px]">
                      <div className="rounded-lg bg-surface/80 border border-line p-2.5 space-y-1">
                        <span className="text-brand font-bold block">🎣 Gancho (Segundos 0-3):</span>
                        <p className="text-inkmuted leading-snug">{ref.hookStrategy}</p>
                        <p className="text-ink font-medium italic text-[11px] mt-1 bg-surface2/60 p-1.5 rounded">
                          {ref.hookExample}
                        </p>
                      </div>

                      <div className="rounded-lg bg-surface/80 border border-line p-2.5 space-y-1">
                        <span className="text-ink font-bold block">🔒 Regla de Oro y Retención:</span>
                        <p className="text-inkmuted leading-snug">{ref.keyRule}</p>
                        <p className="text-brand font-medium text-[11px] mt-1">
                          💡 Retención: {ref.retentionSecret}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Botón de Validación para Continuar al Paso 2 */}
              <div className="flex items-center justify-between pt-3 border-t border-line mt-2">
                <div className="text-[12px] text-inkmuted">
                  {selectedStructureIds.length > 0 ? (
                    <span className="text-ink font-semibold">
                      ✓ {selectedStructureIds.length === 1
                        ? `Seleccionado: ${structure?.name}`
                        : `${selectedStructureIds.length} formatos seleccionados (generación por lote)`}
                    </span>
                  ) : (
                    <span className="text-warn font-medium">
                      Elige al menos una estructura para poder continuar.
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  disabled={!puedeAvanzarPaso1}
                  onClick={() => avanzarPaso(2)}
                  className="btn btn-primary"
                  data-guia={GUIA_TARGETS.BTN_GENERADOR_CONTINUAR_1}
                >
                  Continuar: Identidad y Producto
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </Card>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* ETAPA 2: IDENTIDAD, ACTOR Y PRODUCTO A GRABAR                      */}
        {/* ------------------------------------------------------------------ */}
        {currentStep === 2 && (
          <Card>
            <CardHeader
              title="2 · Marca, arquetipo y producto a grabar"
              subtitle="Define la identidad, quién saldrá en cámara y la descripción exhaustiva del producto."
              icon={<Package size={15} />}
            />
            <div className="space-y-4 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Marca"
                  hint="Opcional, pero muy recomendado: sin marca la IA escribe genérico."
                >
                  <select
                    className="select"
                    value={brandId}
                    onChange={(e) => setBrandId(e.target.value)}
                    data-guia={GUIA_TARGETS.SELECT_GENERADOR_MARCA}
                  >
                    <option value="">Sin marca (generalista)</option>
                    {brands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field
                  label="Producto o servicio del video"
                  required
                  hint="El nombre o título concreto de lo que se muestra o se vende."
                >
                  <input
                    name="producto"
                    className="input font-semibold"
                    value={producto}
                    onChange={(e) => setProducto(e.target.value)}
                    placeholder="Ej. Ramo de rosas rojas con chocolates / App de gestión"
                    data-guia={GUIA_TARGETS.INPUT_GENERADOR_PRODUCTO}
                  />
                </Field>
              </div>

              {/* Descripción profunda del producto */}
              <Field
                label="Descripción exhaustiva del producto o servicio (Contexto profundo)"
                hint="Describe a fondo características, beneficios, precio, para qué sirve y objeciones que resuelve. Aunque por el tipo de guión (como Camaleón) el producto solo se mencione en los últimos 5 segundos, la IA necesita conocerlo a fondo para fundamentar todo el video con veracidad."
              >
                <textarea
                  name="productoDetalle"
                  rows={3}
                  className="textarea text-[12px]"
                  value={productoDetalle}
                  onChange={(e) => setProductoDetalle(e.target.value)}
                  placeholder="Ej. Producto elaborado 100% a mano con materiales premium. Resuelve el dolor de entregas a última hora con envío garantizado en 90 minutos. Incluye empaque de regalo y tarjeta personalizada. Precio regular S/ 120, pero en promoción solo por esta semana..."
                  data-guia={GUIA_TARGETS.INPUT_GENERADOR_PRODUCTO_DESC}
                />
              </Field>

              {/* Quién actúa */}
              <div>
                <label className="label">Quién actúa frente a cámara</label>
                {archetypes.length === 0 ? (
                  <div className="text-inkmuted text-[12.5px]">
                    Todavía no hay nadie cargado.{" "}
                    <Link href="/arquetipos" className="text-brand font-semibold">
                      Añade a la primera persona
                    </Link>
                    .
                  </div>
                ) : (
                  <div
                    className="border-line no-scrollbar max-h-[190px] overflow-y-auto rounded-xl border"
                    data-guia={GUIA_TARGETS.SELECT_GENERADOR_ARQUETIPO}
                  >
                    <button
                      type="button"
                      onClick={() => setArchetypeId("")}
                      className={cn(
                        "hover:bg-surface2 border-line flex w-full items-center gap-2.5 border-b px-3 py-2 text-left transition-colors",
                        !archetypeId && "bg-brandsoft/60"
                      )}
                    >
                      <UserSquare2 size={14} className="text-inkmuted shrink-0" />
                      <span className="text-ink text-[12.5px] font-semibold">
                        Sin asignar
                      </span>
                      <span className="text-inkmuted text-[11.5px]">
                        La IA describirá qué perfil necesita cada escena
                      </span>
                    </button>

                    {arquetiposOrdenados.map((a, i) => {
                      const score = structure ? (a.fits[structure.id]?.score ?? null) : null;
                      const activo = a.id === archetypeId;
                      const abreGenericos =
                        !a.isPerson && (i === 0 || arquetiposOrdenados[i - 1].isPerson);
                      return (
                        <Fragment key={a.id}>
                          {abreGenericos ? (
                            <div className="border-line bg-surface2 text-inkmuted border-b px-3 py-1 text-[10px] font-bold tracking-[0.08em] uppercase">
                              Plantillas genéricas · no llevan la voz de nadie
                            </div>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => setArchetypeId(a.id)}
                            className={cn(
                              "hover:bg-surface2 border-line flex w-full items-center gap-2.5 border-b px-3 py-2 text-left transition-colors last:border-b-0",
                              activo && "bg-brandsoft/60"
                            )}
                          >
                            <span
                              className="dot shrink-0"
                              style={{ background: a.color }}
                              aria-hidden
                            />
                            <span className="text-ink min-w-0 flex-1 truncate text-[12.5px] font-semibold">
                              {a.name}
                              {a.arquetipo || a.summary ? (
                                <span className="text-inkmuted ml-1.5 font-normal">
                                  {a.arquetipo || a.summary}
                                </span>
                              ) : null}
                            </span>
                            {a.isPerson && !a.tieneVoz ? (
                              <span className="text-inkmuted shrink-0 text-[11px]">sin voz</span>
                            ) : (
                              <span className="text-inkmuted shrink-0 text-[11px]">
                                energía {a.energyLevel}/5
                              </span>
                            )}
                            {structure ? <FitBadge score={score} /> : null}
                          </button>
                        </Fragment>
                      );
                    })}
                  </div>
                )}

                {archetype && structure && fitActual !== null && fitActual <= 1 ? (
                  <div className="mt-2.5">
                    <Callout tone="danger" title="Este arquetipo no encaja con este formato">
                      El video se va a ver forzado. {archetype.name} está marcado como{" "}
                      <strong>{FIT_SCORES[fitActual].label}</strong> para «{structure.name}».
                      {notaFit ? ` ${notaFit}` : ""} Elige otro arquetipo o cambia de estructura.
                    </Callout>
                  </div>
                ) : null}
              </div>

              {/* Botones de navegación de la Etapa 2 */}
              <div className="flex items-center justify-between pt-3 border-t border-line mt-2">
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="btn btn-plain"
                >
                  <ArrowLeft size={14} /> Volver a Formato
                </button>

                <div className="flex items-center gap-2">
                  {!puedeAvanzarPaso2 && (
                    <span className="text-warn text-[11px] font-medium hidden sm:inline">
                      Escribe el producto o servicio a grabar.
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={!puedeAvanzarPaso2}
                    onClick={() => avanzarPaso(3)}
                    className="btn btn-primary"
                    data-guia={GUIA_TARGETS.BTN_GENERADOR_CONTINUAR_2}
                  >
                    Continuar: Ángulo e Idea
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* ETAPA 3: ÁNGULO CREATIVO E IDEA CENTRAL                             */}
        {/* ------------------------------------------------------------------ */}
        {currentStep === 3 && (
          <Card>
            <CardHeader
              title="3 · Ángulo creativo e idea central del video"
              subtitle="De una misma idea y producto, este ángulo define el giro psicológico que atrapará al espectador."
              icon={<Sparkles size={15} />}
            />
            <div className="space-y-4 p-4">
              {/* Selector de Ángulos Creativos */}
              <div className="space-y-2.5 rounded-xl border border-line bg-surface2/40 p-3.5" data-guia={GUIA_TARGETS.BOTONES_GENERADOR_ANGULOS}>
                <div className="flex items-center justify-between">
                  <div>
                    <label className="label mb-0 flex items-center gap-1.5 font-bold text-[13px]">
                      <Sparkles size={14} className="text-brand" />
                      Ángulo creativo (Versión de guion)
                    </label>
                    <p className="text-inkmuted text-[11.5px] mt-0.5">
                      Presiona un botón para que la IA arme una versión específica con ese enfoque psicológico.
                    </p>
                  </div>
                  {creativeAngle && (
                    <button
                      type="button"
                      onClick={() => setCreativeAngle("")}
                      className="text-inkmuted hover:text-ink text-[11px] underline shrink-0 ml-2"
                    >
                      Quitar ángulo (estándar)
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {ANGULOS_CREATIVOS.map((ang) => {
                    const activo = creativeAngle === ang.id;
                    return (
                      <button
                        key={ang.id}
                        type="button"
                        onClick={() => setCreativeAngle(activo ? "" : ang.id)}
                        className={cn(
                          "card-flat flex flex-col items-start p-2.5 text-left transition-all relative overflow-hidden",
                          activo
                            ? "border-brand bg-brandsoft/70 shadow-sm ring-1 ring-brand"
                            : "hover:bg-surface2 hover:border-brand/40"
                        )}
                      >
                        <div className="flex items-center gap-1.5 w-full">
                          <span className="text-base">{ang.icon}</span>
                          <span className="text-ink text-[12px] font-bold truncate flex-1">
                            {ang.shortLabel}
                          </span>
                          <span className="chip chip-plain text-[9px] px-1 py-0 shrink-0">
                            {ang.badge}
                          </span>
                        </div>
                        <p className="text-inkmuted text-[10.5px] line-clamp-2 mt-1 leading-snug">
                          {ang.description}
                        </p>
                      </button>
                    );
                  })}
                </div>

                {creativeAngle && (() => {
                  const sel = ANGULOS_CREATIVOS.find((a) => a.id === creativeAngle);
                  if (!sel) return null;
                  return (
                    <div className="border border-brand/30 bg-brand/5 rounded-xl p-3 text-[12px] flex items-start gap-2.5">
                      <span className="text-base shrink-0 mt-0.5">{sel.icon}</span>
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="text-ink font-semibold flex items-center gap-2">
                          <span>Versión activa: {sel.name}</span>
                          <span className="chip chip-brand text-[10px]">{sel.badge}</span>
                        </div>
                        <p className="text-inkmuted text-[11.5px] leading-relaxed">
                          {sel.description}
                        </p>
                        <div className="text-brand font-mono text-[11px] bg-surface2/80 rounded px-2 py-1 border border-brand/20">
                          {sel.hookExample}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Petición Central */}
              <Field
                label="Petición central (Idea o historia del video)"
                required
                hint="Habla como le hablarías a tu guionista: qué pasa, qué sensación buscas, qué tiene que quedar claro."
              >
                <textarea
                  name="peticion"
                  className="textarea"
                  rows={4}
                  required
                  value={peticion}
                  onChange={(e) => setPeticion(e.target.value)}
                  placeholder="Ej. Quiero un video para vender nuestro servicio de mentoría. Que arranque con una escena que incomode a quien lo ve, que se sienta real, y que termine llamando a la acción."
                  data-guia={GUIA_TARGETS.INPUT_GENERADOR_PETICION}
                />
              </Field>

              <Field
                label="Variante o nota adicional (Opcional)"
                hint="Un giro concreto. Ej: «que sea de noche», «que el conflicto sea al pagar la cuenta»."
              >
                <input
                  name="variante"
                  className="input"
                  value={variante}
                  onChange={(e) => setVariante(e.target.value)}
                  placeholder="Ej. que el golpe visual sea que se rompió algo"
                />
              </Field>

              {/* Botones de navegación de la Etapa 3 */}
              <div className="flex items-center justify-between pt-3 border-t border-line mt-2">
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="btn btn-plain"
                >
                  <ArrowLeft size={14} /> Volver a Identidad
                </button>

                <div className="flex items-center gap-2">
                  {!puedeAvanzarPaso3 && (
                    <span className="text-warn text-[11px] font-medium hidden sm:inline">
                      Escribe la idea central del video.
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={!puedeAvanzarPaso3}
                    onClick={() => avanzarPaso(4)}
                    className="btn btn-primary"
                    data-guia={GUIA_TARGETS.BTN_GENERADOR_CONTINUAR_3}
                  >
                    Continuar: Cierre y CTA (Hormozi)
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* ETAPA 4: CIERRE Y CTA CON GATILLOS DE ALEX HORMOZI                */}
        {/* ------------------------------------------------------------------ */}
        {currentStep === 4 && (
          <Card>
            <CardHeader
              title="4 · Cierre y llamado a la acción (Alex Hormozi)"
              subtitle="Aplica los principios de $100M Offers y $100M Leads para que el espectador actúe ahora mismo."
              icon={<Target size={15} />}
            />
            <div className="space-y-4 p-4">
              {/* 1. Selector de Gatillo */}
              <div>
                <div className="text-[10.5px] font-bold text-inkmuted uppercase tracking-wider mb-1.5">
                  1 · Elige el gatillo psicológico de cierre
                </div>
                <div
                  className="grid grid-cols-2 sm:grid-cols-3 gap-1.5"
                  data-guia={GUIA_TARGETS.BOTONES_GENERADOR_CTA}
                >
                  {CTA_TRIGGERS.map((gat) => {
                    const activo = ctaTrigger === gat.id;
                    return (
                      <button
                        key={gat.id}
                        type="button"
                        onClick={() => {
                          setCtaTrigger(gat.id);
                          const preset = gat.presets[0];
                          if (preset) {
                            setCtaAction(preset.accion);
                            setCtaDetail(preset.detalle);
                            setCta(preset.textoCompleto);
                          }
                        }}
                        className={cn(
                          "p-2 rounded-lg border text-left transition-all flex items-start gap-2",
                          activo
                            ? "border-brand bg-brandsoft/70 ring-1 ring-brand font-semibold text-ink shadow-sm"
                            : "border-line bg-surface hover:bg-surface2 text-inksoft"
                        )}
                      >
                        <span className="text-base shrink-0 mt-0.5">{gat.icon}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[11.5px] font-bold truncate leading-tight">
                            {gat.shortLabel}
                          </div>
                          <div className="text-[9.5px] text-inkmuted truncate">
                            {gat.badge}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Selector de Acción */}
              <div>
                <div className="text-[10.5px] font-bold text-inkmuted uppercase tracking-wider mb-1.5">
                  2 · Qué acción pides en redes
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {CTA_ACTIONS.map((acc) => {
                    const activo = ctaAction === acc.id;
                    return (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => {
                          setCtaAction(acc.id);
                          const nuevoTexto = armarCtaTexto(ctaTrigger, acc.id, ctaDetail);
                          setCta(nuevoTexto);
                        }}
                        className={cn(
                          "chip cursor-pointer text-[11px] transition-all",
                          activo
                            ? "chip-brand font-semibold ring-1 ring-brand"
                            : "chip-plain hover:border-brand/40"
                        )}
                      >
                        <span>{acc.icon}</span>
                        <span>{acc.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. Presets y detalle específico */}
              {(() => {
                const gat = CTA_TRIGGERS.find((g) => g.id === ctaTrigger);
                if (!gat) return null;
                return (
                  <div className="space-y-2 rounded-lg border border-line bg-surface2/30 p-2.5">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                      <span className="text-[10.5px] font-bold text-inkmuted uppercase tracking-wider">
                        3 · Fórmulas probadas ({gat.shortLabel})
                      </span>
                      <span className="text-[10px] text-inkmuted italic">
                        {gat.explanation}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {gat.presets.map((p, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setCtaAction(p.accion);
                            setCtaDetail(p.detalle);
                            setCta(p.textoCompleto);
                          }}
                          className="chip chip-plain hover:border-brand/50 hover:bg-brandsoft/30 text-[10.5px] cursor-pointer transition-all"
                          title={p.textoCompleto}
                        >
                          ✨ {p.label}
                        </button>
                      ))}
                    </div>

                    <Field
                      label="Incentivo, límite o detalle específico"
                      hint="Personaliza los números o la razón exacta: cupos disponibles, fecha límite o guía a regalar."
                    >
                      <input
                        className="input text-[12px]"
                        value={ctaDetail}
                        placeholder={gat.defaultDetailPlaceholder}
                        onChange={(e) => {
                          const nuevoDet = e.target.value;
                          setCtaDetail(nuevoDet);
                          setCta(armarCtaTexto(ctaTrigger, ctaAction, nuevoDet));
                        }}
                      />
                    </Field>
                  </div>
                );
              })()}

              {/* 4. Texto final del CTA */}
              <Field
                label="Texto final del llamado a la acción (lo que dirá la última escena)"
                hint="Puedes editarlo libremente si deseas cambiar alguna palabra."
              >
                <div className="space-y-1.5">
                  <textarea
                    name="cta"
                    className="textarea font-medium text-[12px]"
                    rows={3}
                    value={cta}
                    onChange={(e) => setCta(e.target.value)}
                    placeholder="Ej. Si no me compras ahora solo puedo atender a 9 clientes..."
                  />
                  <div className="flex items-center justify-between text-[11px] text-inkmuted">
                    <span>Este texto exacto se inyectará en el pre-prompt de la IA para el cierre.</span>
                    <button
                      type="button"
                      onClick={() => setCta(armarCtaTexto(ctaTrigger, ctaAction, ctaDetail))}
                      className="text-brand hover:underline flex items-center gap-1 font-semibold"
                    >
                      <RotateCcw size={11} /> Re-ensamblar fórmula
                    </button>
                  </div>
                </div>
              </Field>

              {/* Botones de navegación de la Etapa 4 */}
              <div className="flex items-center justify-between pt-3 border-t border-line mt-2">
                <button
                  type="button"
                  onClick={() => setCurrentStep(3)}
                  className="btn btn-plain"
                >
                  <ArrowLeft size={14} /> Volver a Ángulo
                </button>

                <button
                  type="button"
                  onClick={() => avanzarPaso(5)}
                  className="btn btn-primary"
                  data-guia={GUIA_TARGETS.BTN_GENERADOR_CONTINUAR_4}
                >
                  Continuar: Motor y Generación
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </Card>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* ETAPA 5: MOTOR DE IA, DURACIÓN Y GENERACIÓN FINAL                   */}
        {/* ------------------------------------------------------------------ */}
        {currentStep === 5 && (
          <Card>
            <CardHeader
              title="5 · Motor de IA y resumen de generación"
              subtitle="Revisa el checklist final de ideación y genera el guion escena por escena."
              icon={<Bot size={15} />}
            />
            <div className="space-y-4 p-4">
              {/* Resumen Ejecutivo tipo Checklist Gemini */}
              <div className="rounded-xl border border-line bg-surface2/40 p-3.5 space-y-2.5">
                <div className="text-[11px] font-bold text-ink uppercase tracking-wider">
                  Checklist de ideación completo
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[12px]">
                  <div className="p-2 rounded bg-surface border border-line">
                    <span className="text-inkmuted text-[10px] uppercase font-bold block">1 · Formato:</span>
                    <span className="text-ink font-semibold">{structure?.name ?? "No seleccionado"}</span>
                    <span className="text-inkmuted block text-[11px]">{structure?.beats.length ?? 0} beats · ~{duracion}s</span>
                  </div>
                  <div className="p-2 rounded bg-surface border border-line">
                    <span className="text-inkmuted text-[10px] uppercase font-bold block">2 · Identidad y Actor:</span>
                    <span className="text-ink font-semibold">{brand?.name ?? "Sin marca"}</span>
                    <span className="text-inkmuted block text-[11px]">{archetype?.name ?? "Sin actor asignado"}</span>
                  </div>
                  <div className="p-2 rounded bg-surface border border-line">
                    <span className="text-inkmuted text-[10px] uppercase font-bold block">3 · Producto:</span>
                    <span className="text-ink font-semibold truncate block">{producto || "No especificado"}</span>
                    {productoDetalle ? (
                      <span className="chip chip-brand text-[9.5px] mt-1">✓ Descripción profunda incluida</span>
                    ) : null}
                  </div>
                  <div className="p-2 rounded bg-surface border border-line">
                    <span className="text-inkmuted text-[10px] uppercase font-bold block">4 · Ángulo y CTA:</span>
                    <span className="text-ink font-semibold">{creativeAngle ? ANGULOS_CREATIVOS.find((a) => a.id === creativeAngle)?.shortLabel : "Estándar"}</span>
                    <span className="text-inkmuted block text-[11px]">Gatillo: {CTA_TRIGGERS.find((t) => t.id === ctaTrigger)?.shortLabel}</span>
                  </div>
                </div>
              </div>

              {/* Ajustes de Motor y Duración */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">Proveedor de IA</label>
                  <div className="grid grid-cols-2 gap-2">
                    {AI_PROVIDERS.map((p) => {
                      const listo = Boolean(providersReady[p.value]);
                      const activo = provider === p.value;
                      return (
                        <button
                          key={p.value}
                          type="button"
                          disabled={!listo}
                          onClick={() => {
                            setProvider(p.value);
                            setModel("");
                          }}
                          className={cn(
                            "card-flat flex flex-col gap-1 p-2.5 text-left transition-all",
                            activo && "border-brand bg-brandsoft/50",
                            !listo && "cursor-not-allowed opacity-55"
                          )}
                          style={activo ? { boxShadow: "0 0 0 1px var(--brand)" } : undefined}
                        >
                          <span className="text-ink text-[12.5px] font-semibold">
                            {p.label}
                          </span>
                          <span
                            className={cn(
                              "text-[11px] font-medium",
                              listo ? "text-ok" : "text-warn"
                            )}
                          >
                            {listo ? "Clave configurada" : "Sin clave"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {!providersReady[provider] ? (
                    <div className="hint mt-1">
                      Falta la clave de este proveedor.{" "}
                      <Link href="/ajustes" className="text-brand font-semibold">
                        Configúrala en Ajustes
                      </Link>
                      .
                    </div>
                  ) : null}
                </div>

                <div className="space-y-3">
                  <Field
                    label="Modelo"
                    hint="Texto libre o selecciona uno recomendado."
                  >
                    <input
                      name="modelo"
                      className="input input-mono"
                      list="modelos-ia"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder={modelosSugeridos[0]?.value ?? "claude-opus-5"}
                    />
                    <datalist id="modelos-ia">
                      {modelosSugeridos.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </datalist>
                  </Field>

                  <Field label="Duración objetivo (segundos)" hint="Recomendado 30 a 60s.">
                    <input
                      name="duracion"
                      type="number"
                      min={10}
                      max={300}
                      className="input"
                      value={duracion}
                      onChange={(e) => setDuracion(e.target.value)}
                    />
                  </Field>
                </div>
              </div>

              {sinClaves ? (
                <Callout tone="warn" title="No hay ninguna clave de IA configurada">
                  Para generar guiones necesitas cargar la clave de Claude o la de Gemini en{" "}
                  <Link href="/ajustes" className="text-brand font-semibold">
                    Ajustes
                  </Link>
                  .
                </Callout>
              ) : null}

              {/* Botón de Lanzamiento */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-line mt-2">
                <button
                  type="button"
                  onClick={() => setCurrentStep(4)}
                  className="btn btn-plain order-2 sm:order-1"
                >
                  <ArrowLeft size={14} /> Volver a Cierre CTA
                </button>

                <button
                  type="submit"
                  className="btn btn-primary btn-lg shrink-0 order-1 sm:order-2 w-full sm:w-auto"
                  disabled={!puedeGenerar}
                  data-guia={GUIA_TARGETS.BTN_GENERAR_GUION_SUBMIT}
                >
                  {pending ? (
                    <Loader2 size={16} className="spin" />
                  ) : (
                    <Wand2 size={16} />
                  )}
                  {pending
                    ? selectedStructureIds.length > 1
                      ? `Generando ${selectedStructureIds.length} guiones con IA…`
                      : "Generando guion con IA…"
                    : selectedStructureIds.length > 1
                      ? `✨ Generar ${selectedStructureIds.length} guiones con IA (Lote)`
                      : "✨ Generar guion con IA"}
                </button>
              </div>
            </div>
          </Card>
        )}

        {/* ALERTA DE ERROR SI FALLA */}
        {state?.error ? (
          <Callout tone="danger" title={state.error}>
            {state.detail ? <span className="block">{state.detail}</span> : null}
            <span className="mt-1 block">
              No se guardó nada. Puedes ajustar el pedido y volver a intentar.
            </span>
          </Callout>
        ) : null}
      </form>

      {/* --------------------------------------------------- COLUMNA DERECHA */}
      <div className="min-w-0">
        <div className="lg:sticky lg:top-6 space-y-4">
          <Card>
            <CardHeader
              title="Lo que recibe la IA"
              subtitle="Nada de esto es adivinado: sale de tus fichas."
              icon={<Sparkles size={15} />}
            />
            <div className="space-y-3.5 p-4">
              {selectedStructureIds.length > 1 && (
                <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-3 text-[12px] text-ink space-y-1.5">
                  <div className="font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                    <Sparkles size={14} />
                    Lote activo: {selectedStructureIds.length} guiones simultáneos
                  </div>
                  <p className="text-inksoft leading-relaxed text-[11.5px]">
                    Se generará un guion independiente para cada formato elegido, manteniendo el mismo producto, briefing y gatillos de conversión.
                  </p>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {selectedStructureIds.map((id) => {
                      const est = structures.find((x) => x.id === id);
                      const inspecting = est?.id === previewStructureId;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => est && setPreviewStructureId(est.id)}
                          className={cn(
                            "chip text-[10px] transition-all",
                            inspecting
                              ? "chip-brand font-bold ring-1 ring-brand"
                              : "chip-plain hover:bg-surface2"
                          )}
                          title="Ver beats de esta estructura en el panel"
                        >
                          {est?.name ?? id}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {!structure ? (
                <div className="text-inkmuted text-[12.5px] leading-relaxed">
                  Elige una estructura para ver exactamente qué contexto se le va a
                  inyectar al modelo.
                </div>
              ) : (
                <>
                  <PanelRow icon={<Layers size={13} />} label="Estructura">
                    <span className="text-ink font-semibold">{structure.name}</span>
                    <span
                      className={cn("chip ml-1.5", STRUCTURE_CATEGORY_MAP[structure.category]?.chip)}
                    >
                      {STRUCTURE_CATEGORY_MAP[structure.category]?.label ?? structure.category}
                    </span>
                    {structure.family ? (
                      <span className="text-inkmuted"> · {structure.family}</span>
                    ) : null}
                    {structure.summary ? (
                      <div className="text-inkmuted mt-1">{structure.summary}</div>
                    ) : null}
                  </PanelRow>

                  {structure.beats.length ? (
                    <div className="bg-surface2 border-line rounded-xl border p-3">
                      <div className="text-inkmuted mb-2 text-[10.5px] font-bold tracking-wider uppercase">
                        Beats obligatorios, en este orden
                      </div>
                      <ol className="space-y-1.5">
                        {structure.beats.map((b, i) => (
                          <li key={`${b.name}-${i}`} className="flex gap-2">
                            <span className="bg-surface3 text-inkmuted mt-[1px] flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-bold">
                              {i + 1}
                            </span>
                            <span className="min-w-0 text-[12px] leading-snug">
                              <span className="text-ink font-semibold">{b.name}</span>
                              {b.seconds ? (
                                <span className="text-inkmuted"> · ~{b.seconds}s</span>
                              ) : null}
                              {b.goal ? (
                                <span className="text-inkmuted block">{b.goal}</span>
                              ) : null}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : (
                    <Callout tone="warn" title="Esta estructura no tiene beats">
                      Sin beats la IA improvisa el orden. Añádelos en la ficha de la
                      estructura para que el formato se respete.
                    </Callout>
                  )}

                  <PanelRow icon={<FileText size={13} />} label="Documentos de referencia">
                    <span className="text-ink font-semibold">{docsTotal}</span> en total ·{" "}
                    {docsEstructura} de la estructura, {docsArquetipo} del arquetipo,{" "}
                    {docsMarca} de la marca.
                    {docsTotal === 0 ? (
                      <span className="text-inkmuted block">
                        No hay PDFs cargados. El guion saldrá solo con lo que hay en las
                        fichas.
                      </span>
                    ) : null}
                  </PanelRow>

                  <PanelRow icon={<UserSquare2 size={13} />} label="Quién actúa">
                    {archetype ? (
                      <>
                        <span className="text-ink font-semibold">{archetype.name}</span>
                        <FitBadge score={fitActual} className="ml-1.5" />
                        {notaFit ? (
                          <span className="text-inkmuted block">{notaFit}</span>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-inkmuted">
                        Ninguno. La IA propondrá el perfil de cada personaje.
                      </span>
                    )}
                  </PanelRow>

                  <PanelRow icon={<Tags size={13} />} label="Marca">
                    {brand ? (
                      <>
                        <span className="text-ink font-semibold">{brand.name}</span>
                        {brand.tagline ? (
                          <span className="text-inkmuted"> · {brand.tagline}</span>
                        ) : null}
                        {brand.audience ? (
                          <span className="block">
                            <span className="text-inkmuted">Le habla a:</span>{" "}
                            {brand.audience}
                          </span>
                        ) : null}
                        {brand.toneOfVoice ? (
                          <span className="block">
                            <span className="text-inkmuted">Tono:</span> {brand.toneOfVoice}
                          </span>
                        ) : null}
                        {brand.valueProps.length ? (
                          <span className="mt-1 flex flex-wrap gap-1">
                            {brand.valueProps.slice(0, 4).map((v, i) => (
                              <span key={i} className="chip chip-plain">
                                {v}
                              </span>
                            ))}
                          </span>
                        ) : null}
                        {brand.doNots.length ? (
                          <span className="text-danger mt-1 block text-[11.5px]">
                            Prohibido: {brand.doNots.slice(0, 3).join(" · ")}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-inkmuted">
                        Sin marca: el guion no llevará identidad ni canales para el CTA.
                      </span>
                    )}
                  </PanelRow>

                  <PanelRow icon={<Sparkles size={13} />} label="Ángulo creativo (Versión)">
                    {creativeAngle ? (
                      (() => {
                        const ang = ANGULOS_CREATIVOS.find((a) => a.id === creativeAngle);
                        return (
                          <div>
                            <span className="text-ink font-bold text-[12px]">{ang?.name ?? creativeAngle}</span>
                            <span className="chip chip-brand ml-1.5 text-[9.5px]">{ang?.badge}</span>
                          </div>
                        );
                      })()
                    ) : (
                      <span className="text-inkmuted">Formato estándar · Sin forzar ángulo</span>
                    )}
                  </PanelRow>

                  <PanelRow icon={<Target size={13} />} label="Cierre y CTA (Hormozi)">
                    {cta ? (
                      <div>
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="chip chip-plain text-[10px] font-semibold">
                            {CTA_TRIGGERS.find((g) => g.id === ctaTrigger)?.shortLabel ?? "Gatillo"}
                          </span>
                          <span className="chip chip-plain text-[10px]">
                            {CTA_ACTIONS.find((a) => a.id === ctaAction)?.label ?? ctaAction}
                          </span>
                        </div>
                        <span className="text-ink font-medium text-[12px] leading-snug block line-clamp-3">
                          {cta}
                        </span>
                      </div>
                    ) : (
                      <span className="text-inkmuted">
                        Automático según la estructura ({structure?.category === "VENDE" ? "Venta directa" : "Sin CTA"})
                      </span>
                    )}
                  </PanelRow>

                  <div className="border-line grid grid-cols-2 gap-3 border-t pt-3">
                    <PanelRow icon={<Clock size={13} />} label="Duración objetivo">
                      {duracion || 0} segundos
                    </PanelRow>
                    <PanelRow icon={<Bot size={13} />} label="Modelo">
                      <span className="font-mono text-[11.5px]">
                        {model || "por defecto"}
                      </span>
                    </PanelRow>
                  </div>
                </>
              )}
            </div>
          </Card>

          <Card>
            <div className="text-inkmuted flex items-start gap-2.5 p-3.5 text-[12px] leading-relaxed">
              <Film size={14} className="mt-[2px] shrink-0" />
              <span>
                Cada escena vuelve lista para grabar: voz palabra por palabra, encuadre,
                acción, actores, emoción, iluminación, sonido y utilería.{" "}
                <Package size={12} className="inline align-[-1px]" /> Al final tendrás la
                lista de producción consolidada.
              </span>
            </div>
          </Card>

          {structure && structure.docs === 0 && brand && brand.docs === 0 ? (
            <Callout tone="info" title="Súbele referencias a la IA">
              Los PDFs de la estructura, del arquetipo y de la marca son lo que más sube la
              calidad del guion. Cárgalos desde cada ficha.
            </Callout>
          ) : null}
        </div>
      </div>

      {pending ? (
        <div className="no-print fixed inset-x-0 bottom-0 z-40 flex justify-center p-4">
          <div className="card fade-in flex items-center gap-3 px-4 py-3 shadow-[var(--shadow-3)]">
            <Loader2 size={17} className="spin text-brand shrink-0" />
            <div className="text-[12.5px] leading-snug">
              <div className="text-ink font-semibold">
                {selectedStructureIds.length > 1
                  ? `Generando lote de ${selectedStructureIds.length} guiones con ${model || provider} · ${segundos}s`
                  : `Generando el guion con ${model || provider} · ${segundos}s`}
              </div>
              <div className="text-inkmuted">
                {selectedStructureIds.length > 1
                  ? "Creando cada formato con su modelo mental y beats. Al terminar se abrirá el primer guion generado."
                  : "Suele tardar entre 30 y 90 segundos. Cuando termine se abre solo."}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {state?.scriptId ? (
        <div className="no-print fixed inset-x-0 bottom-0 z-40 flex justify-center p-4">
          <div className="card fade-in flex items-center gap-3 px-4 py-3 shadow-[var(--shadow-3)]">
            <Check size={16} className="text-ok shrink-0" />
            <span className="text-[12.5px] font-semibold">
              {state.totalGenerados && state.totalGenerados > 1
                ? `¡${state.totalGenerados} guiones listos! Abriendo el primero…`
                : "Guion listo. Abriendo el visualizador…"}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
