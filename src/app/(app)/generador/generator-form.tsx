"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bot, Check, ChevronDown, Clock, FileText, Film, Layers, Loader2, Package, RotateCcw, Sparkles, Tags, Target, UserSquare2, Wand2 } from "lucide-react";

import { generarGuion, type GenerateState } from "@/app/actions/scripts";
import {
  ANGULOS_CREATIVOS,
  CTA_ACTIONS,
  CTA_MODOS,
  armarCtaTexto,
  buscarGatillo,
  ctaAccionesDeModo,
  ctaCatalogo,
  modoDeGatillo,
  type CtaModo,
} from "@/lib/script-angles";
import { AI_MODELS, AI_PROVIDERS, DEFAULT_MODEL, FIT_SCORES, STRUCTURE_CATEGORY_MAP } from "@/lib/constants";
import { resolveAiModel } from "@/lib/ai-models";
import { cn, withAlpha } from "@/lib/utils";
import { GUIA_TARGETS } from "@/lib/guia/catalogo";
import { FormatStep } from "./format-step";
import { Callout, Card, CardHeader } from "@/components/ui";
import { StepCard, StepDetails, StepField, StepFooter } from "./step-ui";
import stepStyles from "./step-ui.module.css";

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

/** Tarjeta del calendario sin guion, candidata a recibir el que se genere. */
export type GeneratorVideo = {
  id: string;
  title: string;
  hook: string | null;
  description: string | null;
  brandId: string;
  brandName: string;
  statusLabel: string;
  dateLabel: string;
  /** Formatos previstos en la idea (ids de Structure), en el orden en que se guardaron (el del picker, por nombre). */
  structureIds: string[];
};

/* ------------------------------------------------------------ AUXILIARES -- */

/** La petición inicial que sale de la tarjeta: título, hook y descripción. */
function peticionDeVideo(video: GeneratorVideo): string {
  return [video.title, video.hook, video.description]
    .map((t) => (t ?? "").trim())
    .filter(Boolean)
    .join("\n");
}

/** Una estructura que ENTRETIENE arranca sin vender; una que VENDE, con Hormozi. */
function modoDeEstructura(s: GeneratorStructure | null): CtaModo {
  return s?.category === "ENTRETIENE" ? "comunidad" : "venta";
}

/** El primer gatillo del modo con su primera fórmula: el punto de partida de la etapa 4. */
function cierreInicial(modo: CtaModo) {
  const gatillo = ctaCatalogo(modo)[0];
  const preset = gatillo.presets[0];
  return {
    gatillo: gatillo.id,
    accion: preset.accion,
    detalle: preset.detalle,
    texto: preset.textoCompleto,
  };
}

function etiquetaModo(modo: CtaModo): string {
  return CTA_MODOS.find((m) => m.id === modo)?.label ?? modo;
}

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
  videos = [],
  initialVideoId,
  initialVideoAviso = null,
  initialStructureIds = [],
  defaultModels = DEFAULT_MODEL,
  initialStructureId,
  initialBrandId,
  initialArchetypeId,
  initialProduct,
  initialRequest,
  initialAngle,
  maxBatch = 3,
}: {
  structures: GeneratorStructure[];
  brands: GeneratorBrand[];
  archetypes: GeneratorArchetype[];
  providersReady: Record<string, boolean>;
  /** Tarjetas sin guion a las que se puede unir el resultado. */
  videos?: GeneratorVideo[];
  /** Tarjeta elegida desde su ficha (`?video=`). */
  initialVideoId?: string;
  /** Por qué la tarjeta de `?video=` no se preseleccionó (ya tiene guion, está publicada o cancelada, no existe). */
  initialVideoAviso?: string | null;
  /** Lote inicial: los formatos previstos del video que siguen activos. */
  initialStructureIds?: string[];
  /** Modelo por defecto de cada proveedor (Ajustes o catálogo). */
  defaultModels?: Record<string, string>;
  initialStructureId: string;
  initialBrandId: string;
  initialArchetypeId?: string;
  initialProduct?: string;
  initialRequest?: string;
  initialAngle?: string;
  maxBatch?: number;
}) {
  const router = useRouter();
  const submission = useRef({ fingerprint: "", key: "" });
  const [state, formAction, pending] = useActionState<GenerateState, FormData>(
    async (previous, data) => {
      const fingerprint = JSON.stringify(Array.from(data.entries()));
      if (submission.current.fingerprint !== fingerprint) submission.current = { fingerprint, key: crypto.randomUUID() };
      data.set("requestKey", submission.current.key);
      return generarGuion(previous, data);
    },
    null
  );

  const videoInicial = videos.find((v) => v.id === initialVideoId) ?? null;

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
  const [formatPage, setFormatPage] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState<string>("TODOS");
  const [searchStructure, setSearchStructure] = useState<string>("");
  // Con un video elegido, el producto y la petición arrancan desde la tarjeta
  // si la URL no trae nada más concreto.
  const [producto, setProducto] = useState<string>(
    initialProduct || videoInicial?.title || ""
  );
  const [productoDetalle, setProductoDetalle] = useState<string>("");
  const [peticion, setPeticion] = useState<string>(
    initialRequest || (videoInicial ? peticionDeVideo(videoInicial) : "")
  );
  const [variante, setVariante] = useState<string>("");

  const [selectedStructureIds, setSelectedStructureIds] = useState<string[]>(() => {
    if (initialStructureIds.length) return initialStructureIds;
    if (initialStructureId) return [initialStructureId];
    if (primeraEstructura) return [primeraEstructura.id];
    return structures.length ? [structures[0].id] : [];
  });
  const [previewStructureId, setPreviewStructureId] = useState<string>(
    initialStructureIds[0] ||
      initialStructureId ||
      (primeraEstructura?.id ?? (structures[0]?.id ?? ""))
  );
  const [videoId, setVideoId] = useState<string>(videoInicial?.id ?? "");
  const [brandId, setBrandId] = useState(initialBrandId);
  const [archetypeId, setArchetypeId] = useState(initialArchetypeId ?? "");
  const [duracion, setDuracion] = useState(
    String(primeraEstructura?.defaultDurationSec ?? 45)
  );
  const [provider, setProvider] = useState(proveedorInicial);
  const [model, setModel] = useState(() => resolveAiModel(proveedorInicial, undefined,
    primeraEstructura?.defaultProvider === proveedorInicial ? primeraEstructura.defaultModel : null, defaultModels[proveedorInicial]));
  const [creativeAngle, setCreativeAngle] = useState(initialAngle ?? "");

  // El cierre arranca según la estructura con la que se abre el generador:
  // ENTRETIENE → sin venta (comunidad); VENDE → gatillos de Hormozi. Mientras
  // nadie toque el conmutador, sigue a la estructura que se elija en la etapa 1.
  const estructuraInicial =
    structures.find(
      (s) => s.id === (initialStructureIds[0] || initialStructureId || primeraEstructura?.id)
    ) ??
    structures[0] ??
    null;
  const modoInicial = modoDeEstructura(estructuraInicial);
  const cierre0 = cierreInicial(modoInicial);
  const [ctaModo, setCtaModo] = useState<CtaModo>(modoInicial);
  const [modoElegidoAMano, setModoElegidoAMano] = useState(false);
  // El usuario ya trabajó el cierre (gatillo, acción, detalle o texto): tocar
  // el lote en la etapa 1 no debe reescribirlo aunque no haya cambiado el modo.
  const [cierreEditadoAMano, setCierreEditadoAMano] = useState(false);
  const [ctaTrigger, setCtaTrigger] = useState(cierre0.gatillo);
  const [ctaAction, setCtaAction] = useState(cierre0.accion);
  const [ctaDetail, setCtaDetail] = useState(cierre0.detalle);
  const [cta, setCta] = useState(cierre0.texto);
  const [segundos, setSegundos] = useState(0);

  /** Aplica un gatillo con su primera fórmula (o la que coincida con la acción actual). */
  const aplicarGatillo = (gatilloId: string, preferirAccion?: string) => {
    const gat = buscarGatillo(gatilloId);
    if (!gat) return;
    const preset =
      (preferirAccion ? gat.presets.find((p) => p.accion === preferirAccion) : undefined) ??
      gat.presets[0];
    setCtaTrigger(gat.id);
    if (preset) {
      setCtaAction(preset.accion);
      setCtaDetail(preset.detalle);
      setCta(preset.textoCompleto);
    }
  };

  /** Cambia de modo y deja el cierre coherente: el primer gatillo del catálogo nuevo. */
  const aplicarModo = (modo: CtaModo, aMano: boolean) => {
    if (aMano) setModoElegidoAMano(true);
    if (modo === ctaModo && modoDeGatillo(ctaTrigger) === modo) return;
    setCtaModo(modo);
    const inicial = cierreInicial(modo);
    setCtaTrigger(inicial.gatillo);
    setCtaAction(inicial.accion);
    setCtaDetail(inicial.detalle);
    setCta(inicial.texto);
  };

  /**
   * Al elegir estructura, el modo la sigue salvo que ya se haya elegido a mano
   * o que el cierre ya esté redactado: aplicarModo reemplaza gatillo, acción,
   * detalle y texto, y ese trabajo no se pierde por marcar otro formato.
   */
  const seguirModoDeEstructura = (s: GeneratorStructure | null) => {
    if (modoElegidoAMano || cierreEditadoAMano || !s) return;
    aplicarModo(modoDeEstructura(s), false);
  };

  const structure =
    structures.find((s) => s.id === previewStructureId) ??
    structures.find((s) => selectedStructureIds.includes(s.id)) ??
    structures[0] ??
    null;
  const brand = brands.find((b) => b.id === brandId) ?? null;
  const archetype = archetypes.find((a) => a.id === archetypeId) ?? null;
  const video = videos.find((v) => v.id === videoId) ?? null;

  // Con marca elegida solo se ofrecen sus tarjetas (y la ya elegida, por si acaso).
  const videosVisibles = videos.filter(
    (v) => !brandId || v.brandId === brandId || v.id === videoId
  );

  /**
   * Elegir un video fija la marca, rellena producto y petición si estaban
   * vacíos y preselecciona el lote con sus formatos previstos que sigan activos.
   */
  const elegirVideo = (id: string) => {
    setVideoId(id);
    const elegido = videos.find((v) => v.id === id);
    if (!elegido) return;
    setBrandId(brands.some((b) => b.id === elegido.brandId) ? elegido.brandId : "");
    if (!producto.trim()) setProducto(elegido.title);
    if (!peticion.trim()) setPeticion(peticionDeVideo(elegido));
    const lote = elegido.structureIds
      .filter((sid) => structures.some((s) => s.id === sid))
      .slice(0, maxBatch);
    if (lote.length) {
      setSelectedStructureIds(lote);
      setPreviewStructureId(lote[0]);
      const primera = structures.find((s) => s.id === lote[0]);
      if (primera) {
        setDuracion(String(primera.defaultDurationSec || 45));
        aplicarPreferenciasDeEstructura(primera);
        seguirModoDeEstructura(primera);
      }
    }
  };

  /** Cambiar de marca suelta el video si era de otra: el servidor exige que coincidan. */
  const elegirMarca = (id: string) => {
    setBrandId(id);
    if (video && id && video.brandId !== id) setVideoId("");
  };

  const fitActual =
    archetype && structure ? (archetype.fits[structure.id]?.score ?? null) : null;
  const notaFit =
    archetype && structure ? (archetype.fits[structure.id]?.notes ?? null) : null;

  // La generación corre en segundo plano: al registrarse se abre su pantalla
  // de avance, donde aparecen los guiones, lo que falló y el vínculo al video.
  useEffect(() => {
    if (state?.jobId) router.push(`/generador/trabajos/${state.jobId}`);
  }, [state?.jobId, router]);

  // Contador honesto de lo que lleva esperando.
  useEffect(() => {
    if (!pending) {
      setSegundos(0);
      return;
    }
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [pending]);

  /** Proveedor y modelo que prefiere la estructura, validados contra el catálogo y los proveedores listos. */
  const aplicarPreferenciasDeEstructura = (s: GeneratorStructure) => {
    const nextProvider = s.defaultProvider && providersReady[s.defaultProvider] ? s.defaultProvider : provider;
    setProvider(nextProvider);
    setModel(resolveAiModel(nextProvider, undefined, s.defaultProvider === nextProvider ? s.defaultModel : null, defaultModels[nextProvider]));
  };

  const toggleEstructura = (s: GeneratorStructure) => {
    // `exists` se calcula fuera del updater: el modo del cierre solo sigue a
    // una estructura que se AÑADE; quitar una del lote no cambia el cierre.
    const exists = selectedStructureIds.includes(s.id);
    // Tope del lote por solicitud: no se añade una estructura de más.
    if (!exists && selectedStructureIds.length >= maxBatch) return;
    if (exists) {
      const next = selectedStructureIds.filter((id) => id !== s.id);
      setSelectedStructureIds(next);
      if (next.length > 0 && previewStructureId === s.id) {
        setPreviewStructureId(next[0]);
      }
    } else {
      setSelectedStructureIds([...selectedStructureIds, s.id]);
      setPreviewStructureId(s.id);
    }
    setDuracion(String(s.defaultDurationSec || 45));
    aplicarPreferenciasDeEstructura(s);
    if (!exists) seguirModoDeEstructura(s);
  };

  const seleccionarSoloEsta = (s: GeneratorStructure, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedStructureIds([s.id]);
    setPreviewStructureId(s.id);
    setDuracion(String(s.defaultDurationSec || 45));
    aplicarPreferenciasDeEstructura(s);
    seguirModoDeEstructura(s);
  };

  const seleccionarVisibles = (visible: GeneratorStructure[]) => {
    const ids = visible.map((s) => s.id);
    setSelectedStructureIds((prev) => Array.from(new Set([...prev, ...ids])).slice(0, maxBatch));
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

  const esComunidad = ctaModo === "comunidad";
  const gatillosDelModo = ctaCatalogo(ctaModo);
  const accionesDelModo = ctaAccionesDeModo(ctaModo);
  const gatilloActual = buscarGatillo(ctaTrigger);
  const anguloActual = ANGULOS_CREATIVOS.find((angle) => angle.id === creativeAngle);
  const resumenCierre = `${etiquetaModo(ctaModo)} · ${gatilloActual?.shortLabel ?? "Sin gatillo"}`;

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
      descripcion: esComunidad ? "Sin venta · Comunidad" : "Gatillos Hormozi",
      icono: <Target size={13} />,
      resumen: resumenCierre,
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

  const puedeAvanzarPaso2 = Boolean(producto.trim().length > 0);
  const puedeAvanzarPaso3 = Boolean(peticion.trim().length >= 5);


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

  return (
    <div className="mx-auto grid max-w-5xl gap-4">
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
        <input type="hidden" name="video" value={videoId} />
        <input type="hidden" name="arquetipo" value={archetypeId} />
        <input type="hidden" name="producto" value={producto} />
        <input type="hidden" name="productoDetalle" value={productoDetalle} />
        <input type="hidden" name="anguloCreativo" value={creativeAngle} />
        <input type="hidden" name="peticion" value={peticion} />
        <input type="hidden" name="variante" value={variante} />
        <input type="hidden" name="ctaModo" value={ctaModo} />
        <input type="hidden" name="ctaGatillo" value={ctaTrigger} />
        <input type="hidden" name="ctaAccion" value={ctaAction} />
        <input type="hidden" name="ctaDetalle" value={ctaDetail} />
        <input type="hidden" name="cta" value={cta} />
        <input type="hidden" name="duracion" value={duracion} />
        <input type="hidden" name="proveedor" value={provider} />
        <input type="hidden" name="modelo" value={model} />

        {/* LA TARJETA DE ?video= NO SE PUDO PRESELECCIONAR: se dice por qué hasta que se elija otra */}
        {initialVideoAviso && !videoId ? (
          <Callout tone="warn" title="Ese video no se pudo elegir">
            <span className="block">{initialVideoAviso}</span>
          </Callout>
        ) : null}

        {/* Las cinco etapas mantienen el mismo orden y navegación. */}
          <nav aria-label="Etapas de generación" className="flex flex-wrap gap-2" data-guia={GUIA_TARGETS.GENERADOR_STEPPER_BAR}>
            {PASOS.map((paso) => (
              <button key={paso.id} type="button" onClick={() => irAlPaso(paso.id)} disabled={paso.id > maxStepReached} aria-current={paso.id === currentStep ? "step" : undefined} title={`${paso.descripcion}: ${paso.resumen}`} className={cn("flex min-h-11 items-center gap-2 rounded-lg px-2 text-[13px]", paso.id === currentStep ? "text-brand font-bold" : "text-inkmuted disabled:opacity-60")}>
                <span className={cn("flex h-6 w-6 items-center justify-center rounded-full text-xs", paso.id === currentStep ? "bg-brand text-primary-foreground" : "bg-surface")}>{paso.numero}</span>
                {paso.titulo}
              </button>
            ))}
          </nav>

        {/* ------------------------------------------------------------------ */}
        {/* ETAPA 1: FORMATO / TIPO DE GUIÓN                                   */}
        {/* ------------------------------------------------------------------ */}
        {currentStep === 1 && (
          <FormatStep
            structures={structures}
            filteredStructures={structuresFiltradas}
            selectedIds={selectedStructureIds}
            maxBatch={maxBatch}
            category={categoryFilter}
            search={searchStructure}
            page={formatPage}
            onPageChange={setFormatPage}
            onCategoryChange={(value) => { setCategoryFilter(value); setFormatPage(1); }}
            onSearchChange={(value) => { setSearchStructure(value); setFormatPage(1); }}
            onToggle={toggleEstructura}
            onSelectOnly={seleccionarSoloEsta}
            onSelectVisible={seleccionarVisibles}
            onClear={deseleccionarTodas}
            onContinue={() => avanzarPaso(2)}
          />
        )}

        {/* ------------------------------------------------------------------ */}
        {/* ETAPA 2: IDENTIDAD, ACTOR Y PRODUCTO A GRABAR                      */}
        {/* ------------------------------------------------------------------ */}
        {currentStep === 2 && (
          <StepCard title="¿Qué vamos a contar y para quién?" description="Define el producto, su marca y quién aparecerá en cámara.">
            <div className="grid gap-5 sm:grid-cols-2">
              <StepField id="generator-video" label="Video al que se unirá" hint={videos.length ? "Opcional. Solo videos en Idea o Guion que aún no tienen guion." : "No hay videos disponibles. Puedes generar un guion independiente."}>
                <select id="generator-video" className="select" value={videoId} onChange={(e) => elegirVideo(e.target.value)} data-guia={GUIA_TARGETS.SELECT_GENERADOR_VIDEO}>
                  <option value="">Guion suelto (sin video)</option>
                  {videosVisibles.map((v) => <option key={v.id} value={v.id}>{v.title} · {v.brandName} · {v.dateLabel}</option>)}
                </select>
              </StepField>
              <StepField id="generator-brand" label="Marca" hint={video ? `El video pertenece a ${video.brandName}. Cambiar a otra marca desvincula el video.` : "Opcional. Aporta identidad y canales para el cierre."}>
                <select id="generator-brand" className="select" value={brandId} onChange={(e) => elegirMarca(e.target.value)} data-guia={GUIA_TARGETS.SELECT_GENERADOR_MARCA}>
                  <option value="">Sin marca (generalista)</option>
                  {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </StepField>
            </div>
            <StepField id="generator-product" label="Producto o servicio del video" required>
              <input id="generator-product" name="producto" className="input" value={producto} onChange={(e) => setProducto(e.target.value)} placeholder="Ej. Ramo de rosas con chocolates" data-guia={GUIA_TARGETS.INPUT_GENERADOR_PRODUCTO} />
            </StepField>
            <StepField id="generator-product-detail" label="Qué debe saber la IA sobre el producto" hint="Características, beneficios, precio y objeciones que resuelve. Usa datos reales.">
              <textarea id="generator-product-detail" name="productoDetalle" rows={3} className="textarea" value={productoDetalle} onChange={(e) => setProductoDetalle(e.target.value)} placeholder="Describe qué ofrece, para quién sirve y qué lo hace diferente." data-guia={GUIA_TARGETS.INPUT_GENERADOR_PRODUCTO_DESC} />
            </StepField>
            <StepField id="generator-actor" label="Quién actúa frente a cámara" hint="Puedes dejarlo sin asignar para que la IA proponga los perfiles de cada escena.">
              <select id="generator-actor" className="select" value={archetypeId} onChange={(e) => setArchetypeId(e.target.value)} data-guia={GUIA_TARGETS.SELECT_GENERADOR_ARQUETIPO}>
                <option value="">Sin asignar</option>
                {[true, false].map((isPerson) => {
                  const people = arquetiposOrdenados.filter((a) => a.isPerson === isPerson);
                  return people.length ? <optgroup key={String(isPerson)} label={isPerson ? "Personas del equipo" : "Plantillas genéricas · sin voz propia"}>
                    {people.map((a) => {
                      const score = structure ? a.fits[structure.id]?.score : undefined;
                      return <option key={a.id} value={a.id}>{a.name} · {score === undefined ? "Sin evaluar" : FIT_SCORES[score]?.label ?? "Sin evaluar"}</option>;
                    })}
                  </optgroup> : null;
                })}
              </select>
              {!archetypes.length ? <p className="text-inkmuted mt-2 text-sm">Todavía no hay nadie cargado. <Link href="/arquetipos" className="text-brand font-semibold">Añade a la primera persona</Link>.</p> : null}
            </StepField>
            {archetype && structure && fitActual !== null && fitActual <= 1 ? (
              <Callout tone="danger" title="Este arquetipo no encaja con este formato">
                {archetype.name} está marcado como <strong>{FIT_SCORES[fitActual].label}</strong> para «{structure.name}». {notaFit} Elige otro arquetipo o cambia de estructura.
              </Callout>
            ) : null}
            {archetype ? <StepDetails title="Ver perfil y compatibilidad" summary={archetype.name}>
              <div className="flex flex-wrap items-center gap-2 text-sm"><span className="dot" style={{ background: archetype.color }} aria-hidden="true" /><strong>{archetype.name}</strong><FitBadge score={fitActual} /></div>
              {archetype.arquetipo ? <p className="text-sm">{archetype.arquetipo}</p> : null}
              {archetype.summary ? <p className="text-inksoft text-sm">{archetype.summary}</p> : null}
              <p className="text-inkmuted text-sm">Energía {archetype.energyLevel}/5 · {archetype.isPerson ? archetype.tieneVoz ? "Tono de voz disponible" : "Sin tono de voz cargado" : "Plantilla genérica: no lleva la voz de nadie"}</p>
              {notaFit ? <p className="text-inksoft text-sm">{notaFit}</p> : null}
            </StepDetails> : null}
            <StepDetails title="Ayuda para describir el producto">
              <p className="text-inksoft text-sm leading-relaxed">Incluye características, beneficios, precio, para qué sirve y objeciones que resuelve. Aunque el producto solo aparezca al final, la IA necesita conocerlo para fundamentar el video con veracidad.</p>
            </StepDetails>
            <StepFooter back="Volver a Formato" onBack={() => setCurrentStep(1)} next="Ángulo e idea" onNext={() => avanzarPaso(3)} disabled={!puedeAvanzarPaso2} reason="Escribe el producto o servicio para continuar." guide={GUIA_TARGETS.BTN_GENERADOR_CONTINUAR_2} />
          </StepCard>
        )}

        {currentStep === 3 && (
          <StepCard title="¿Cuál es la idea del video?" description="Cuenta qué sucede y qué quieres que sienta quien lo ve.">
            <StepField id="generator-idea" label="Idea o historia principal" required hint="Escribe al menos cinco caracteres para continuar.">
              <textarea id="generator-idea" name="peticion" className="textarea" rows={4} required value={peticion} onChange={(e) => setPeticion(e.target.value)} placeholder="Qué pasa, qué sensación buscas y qué debe quedar claro." data-guia={GUIA_TARGETS.INPUT_GENERADOR_PETICION} />
            </StepField>
            <div data-guia={GUIA_TARGETS.BOTONES_GENERADOR_ANGULOS}>
              <StepField id="generator-angle" label="Ángulo creativo" hint="Opcional. Elige el enfoque de esta versión del guion.">
                <select id="generator-angle" className="select" value={creativeAngle} onChange={(e) => setCreativeAngle(e.target.value)}>
                  <option value="">Estándar · Sin forzar un ángulo</option>
                  {ANGULOS_CREATIVOS.map((angle) => <option key={angle.id} value={angle.id}>{angle.icon} {angle.shortLabel}</option>)}
                </select>
              </StepField>
              {anguloActual ? <div className="mt-3">
                <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-inksoft text-sm">{anguloActual.description}</p><button type="button" className="text-brand py-1 text-xs font-semibold hover:underline" onClick={() => setCreativeAngle("")}>Quitar ángulo</button></div>
                <StepDetails key={anguloActual.id} title="Ver ejemplo de este ángulo" summary={anguloActual.name}>
                  <span className="chip chip-brand">{anguloActual.icon} {anguloActual.badge}</span>
                  <blockquote className="border-line bg-surface2 rounded-lg border p-4 text-sm leading-relaxed">{anguloActual.hookExample}</blockquote>
                </StepDetails>
              </div> : null}
            </div>
            <StepDetails title="Añadir una variante o nota" summary={variante ? "Nota incluida" : "Opcional"}>
              <StepField id="generator-variant" label="Variante o nota adicional" hint="Un giro concreto: por ejemplo, que sea de noche o que el conflicto ocurra al pagar.">
                <input id="generator-variant" name="variante" className="input" value={variante} onChange={(e) => setVariante(e.target.value)} placeholder="Ej. Que el golpe visual sea que se rompió algo" />
              </StepField>
            </StepDetails>
            <StepFooter back="Volver a Identidad" onBack={() => setCurrentStep(2)} next="Cierre y CTA" onNext={() => avanzarPaso(4)} disabled={!puedeAvanzarPaso3} reason="Escribe al menos cinco caracteres en la idea." guide={GUIA_TARGETS.BTN_GENERADOR_CONTINUAR_3} />
          </StepCard>
        )}

        {currentStep === 4 && (
          <StepCard title="¿Qué quieres que haga el espectador?" description="Elige el objetivo y ajusta la frase con la que termina el video.">
            <div role="group" aria-label="Objetivo del cierre" className="grid gap-3 sm:grid-cols-2">
              {CTA_MODOS.map((modo) => <button key={modo.id} type="button" onClick={() => aplicarModo(modo.id, true)} aria-pressed={ctaModo === modo.id} className={stepStyles.choice}>
                <span className="text-sm font-bold">{modo.icon} {modo.label}</span><span className="text-inkmuted mt-2 block text-xs leading-relaxed">{modo.description}</span>
              </button>)}
            </div>
            {!modoElegidoAMano && !cierreEditadoAMano ? <p className="text-inkmuted text-xs">Sugerido por la estructura elegida ({structure?.category === "ENTRETIENE" ? "entretiene" : "vende"}). Puedes cambiarlo.</p> : null}
            <div className="grid gap-5 sm:grid-cols-2" data-guia={GUIA_TARGETS.BOTONES_GENERADOR_CTA}>
              <StepField id="generator-trigger" label={esComunidad ? "Tipo de cierre de comunidad" : "Gatillo de venta"}>
                <select id="generator-trigger" className="select" value={ctaTrigger} onChange={(e) => { setCierreEditadoAMano(true); aplicarGatillo(e.target.value); }}>
                  {gatillosDelModo.map((gat) => <option key={gat.id} value={gat.id}>{gat.icon} {gat.shortLabel}</option>)}
                </select>
              </StepField>
              <StepField id="generator-action" label="Acción que pides" hint={esComunidad ? "Una sola acción de comunidad, sin enlace comercial ni DM." : undefined}>
                <select id="generator-action" className="select" value={ctaAction} onChange={(e) => { setCierreEditadoAMano(true); setCtaAction(e.target.value); setCta(armarCtaTexto(ctaTrigger, e.target.value, ctaDetail)); }}>
                  {!ctaAction ? <option value="">Sin pedido explícito</option> : null}
                  {accionesDelModo.map((action) => <option key={action.id} value={action.id}>{action.icon} {action.label}</option>)}
                </select>
              </StepField>
            </div>
            {gatilloActual ? <StepField id="generator-cta-detail" label={esComunidad ? "Motivo, destinatario o pregunta" : "Incentivo, límite o detalle"} hint={esComunidad ? "El motivo debe salir del contenido, sin precios ni promociones." : "Personaliza la razón para actuar con datos concretos."}>
              <input id="generator-cta-detail" className="input" value={ctaDetail} placeholder={gatilloActual.defaultDetailPlaceholder} onChange={(e) => { setCierreEditadoAMano(true); setCtaDetail(e.target.value); setCta(armarCtaTexto(ctaTrigger, ctaAction, e.target.value)); }} />
            </StepField> : null}
            <StepField id="generator-cta" label="Texto final del cierre" hint={esComunidad ? "La IA recibe este cierre con la instrucción de no añadir precios, ofertas ni enlaces de venta." : "Puedes editar libremente lo que dirá la última escena."}>
              <textarea id="generator-cta" name="cta" className="textarea" rows={3} value={cta} onChange={(e) => { setCierreEditadoAMano(true); setCta(e.target.value); }} placeholder={esComunidad ? "Ej. Envíalo a quien siempre dice que no sabe qué regalar." : "Escribe el llamado a la acción."} />
              <button type="button" className="text-brand mt-3 inline-flex items-center gap-2 py-1 text-xs font-semibold hover:underline" onClick={() => { setCierreEditadoAMano(true); setCta(armarCtaTexto(ctaTrigger, ctaAction, ctaDetail)); }}><RotateCcw size={13} aria-hidden="true" /> Re-ensamblar fórmula</button>
            </StepField>
            {gatilloActual ? <StepDetails key={`${ctaModo}-${ctaTrigger}`} title={esComunidad ? "Explorar frases de ejemplo" : "Explorar fórmulas de venta"} summary={gatilloActual.shortLabel}>
              <span className="chip chip-brand">{gatilloActual.badge}</span><p className="text-inksoft text-sm leading-relaxed">{gatilloActual.explanation}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {gatilloActual.presets.map((preset, index) => <button key={index} type="button" className={stepStyles.choice} aria-label={`Usar fórmula: ${preset.label}`} onClick={() => { setCierreEditadoAMano(true); setCtaAction(preset.accion); setCtaDetail(preset.detalle); setCta(preset.textoCompleto); }}>
                  <span className="text-brand text-sm font-semibold">{preset.label}</span><span className="text-inksoft mt-2 block text-sm leading-relaxed">{preset.textoCompleto}</span>
                </button>)}
              </div>
            </StepDetails> : null}
            <StepFooter back="Volver a Idea" onBack={() => setCurrentStep(3)} next="Revisión y generación" onNext={() => avanzarPaso(5)} guide={GUIA_TARGETS.BTN_GENERADOR_CONTINUAR_4} />
          </StepCard>
        )}

        {currentStep === 5 && (
          <StepCard title="Revisa y genera tus guiones" description="Confirma el pedido y elige con qué modelo trabajará la IA.">
            <section aria-label="Resumen del pedido">
              <div className={stepStyles.reviewRow}><div><h3 className="text-inkmuted text-xs">Formatos</h3><p className="mt-1 text-sm font-semibold">{selectedStructureIds.map((id) => structures.find((s) => s.id === id)?.name ?? id).join(" · ") || "Sin formatos seleccionados"}</p><p className="text-inkmuted mt-1 text-xs">Un guion por formato · Duración objetivo: {duracion || 0}s</p></div><button type="button" className="btn btn-ghost" aria-label="Editar formatos" onClick={() => setCurrentStep(1)}>Editar</button></div>
              <div className={stepStyles.reviewRow}><div><h3 className="text-inkmuted text-xs">Identidad y producto</h3><p className="mt-1 text-sm font-semibold">{producto || "Producto pendiente"}</p><p className="text-inksoft mt-1 text-sm">{brand?.name ?? "Sin marca"} · {archetype?.name ?? "Sin actor asignado"}</p>{productoDetalle ? <p className="text-inkmuted mt-1 text-xs">Descripción del producto incluida</p> : null}</div><button type="button" className="btn btn-ghost" aria-label="Editar identidad y producto" onClick={() => setCurrentStep(2)}>Editar</button></div>
              <div className={stepStyles.reviewRow}><div><h3 className="text-inkmuted text-xs">Idea y ángulo</h3><p className="mt-1 text-sm">{peticion || "Idea pendiente"}</p><p className="text-inkmuted mt-1 text-xs">{anguloActual?.shortLabel ?? "Ángulo estándar"}{variante ? " · Variante incluida" : ""}</p></div><button type="button" className="btn btn-ghost" aria-label="Editar idea y ángulo" onClick={() => setCurrentStep(3)}>Editar</button></div>
              <div className={stepStyles.reviewRow}><div><h3 className="text-inkmuted text-xs">Cierre · {resumenCierre}</h3><p className="mt-1 text-sm">{cta || "Cierre automático"}</p></div><button type="button" className="btn btn-ghost" aria-label="Editar cierre" onClick={() => setCurrentStep(4)}>Editar</button></div>
            </section>
            <div>
              <h3 className="mb-3 text-sm font-semibold">Proveedor de IA</h3>
              <div role="group" aria-label="Proveedor de IA" className="grid gap-3 sm:grid-cols-2">
                {AI_PROVIDERS.map((p) => <button key={p.value} type="button" disabled={!providersReady[p.value]} aria-pressed={provider === p.value} onClick={() => { setProvider(p.value); setModel(resolveAiModel(p.value, undefined, defaultModels[p.value])); }} className={cn(stepStyles.choice, !providersReady[p.value] && "cursor-not-allowed opacity-60")}>
                  <span className="text-sm font-semibold">{p.label}</span><span className={cn("mt-2 block text-xs", providersReady[p.value] ? "text-ok" : "text-warn")}>{providersReady[p.value] ? "Clave configurada" : "Sin clave"}</span>
                </button>)}
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <StepField id="generator-model" label="Modelo" hint={provider === "google" ? "Si se satura, probaremos la siguiente alternativa disponible: 3.8 → 3.7 → 3.6 Flash. Máximo tres intentos por guion." : undefined}>
                <select id="generator-model" name="modelo" className="select" value={model} onChange={(e) => setModel(e.target.value)}>
                  {modelosSugeridos.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </StepField>
              <StepField id="generator-duration" label="Duración objetivo (segundos)" hint="Entre 10 y 300 segundos. Recomendado: 30 a 60.">
                <input id="generator-duration" name="duracion" type="number" min={10} max={300} className="input" value={duracion} onChange={(e) => setDuracion(e.target.value)} />
              </StepField>
            </div>
            {!providersReady[provider] ? <Callout tone="warn" title={sinClaves ? "No hay ninguna clave de IA configurada" : "Falta la clave de este proveedor"}>Configura la clave de Claude o Gemini en <Link href="/ajustes" className="text-brand font-semibold">Ajustes</Link> para generar.</Callout> : null}
            <p className="text-inkmuted text-sm leading-relaxed">{video ? `El primer guion se unirá a «${video.title}».${selectedStructureIds.length > 1 ? " Los demás quedarán en la biblioteca." : ""} ` : "Los guiones quedarán en tu biblioteca. "}Puedes salir de la página y seguir el avance en Mis generaciones.</p>
            <footer className="border-line flex flex-col gap-4 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
              <button type="button" className="btn btn-ghost" onClick={() => setCurrentStep(4)}><ArrowLeft size={15} aria-hidden="true" />Volver a Cierre</button>
              <button type="submit" className="btn btn-primary min-h-11" disabled={!puedeGenerar} data-guia={GUIA_TARGETS.BTN_GENERAR_GUION_SUBMIT}>
                {pending ? <Loader2 size={16} className="spin" /> : <Wand2 size={16} />}
                {pending ? "Registrando solicitud…" : selectedStructureIds.length > 1 ? `Generar ${selectedStructureIds.length} guiones con IA` : "Generar guion con IA"}
              </button>
            </footer>
          </StepCard>
        )}

        {/* ALERTA DE ERROR SI NO SE PUDO REGISTRAR LA SOLICITUD. Lo que falle
            durante la generación (formatos que no salieron, clave rechazada,
            vínculo al video) se lee en la pantalla de avance del trabajo. */}
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
      <details key={currentStep} className="min-w-0">
        <summary className="text-inkmuted cursor-pointer list-none rounded-xl border border-line bg-surface px-4 py-3 text-[13px] font-semibold">
          <span className="flex items-center justify-between gap-3"><span>Lo que recibe la IA · Ver contexto completo</span><ChevronDown size={16} aria-hidden="true" /></span>
        </summary>
        <div className="mt-3 space-y-4">
          <Card>
            <CardHeader
              title="Lo que recibe la IA"
              subtitle="Nada de esto es adivinado: sale de tus fichas."
              icon={<Sparkles size={15} />}
            />
            <div className="space-y-3.5 p-4">
              <PanelRow icon={<Film size={13} />} label="Video">
                {video ? (
                  <>
                    <span className="text-ink font-semibold">{video.title}</span>
                    <span className="text-inkmuted">
                      {" "}
                      · {video.brandName} · {video.dateLabel} · {video.statusLabel}
                    </span>
                    <span className="text-inkmuted block">
                      {selectedStructureIds.length > 1
                        ? "Al generar, el primer guion del lote queda unido a esta tarjeta; los demás se asignan desde su ficha."
                        : "Al generar, el guion queda unido a esta tarjeta y el video pasa a Guion."}
                    </span>
                  </>
                ) : (
                  <span className="text-inkmuted">
                    Guion suelto: no se une a ninguna tarjeta del calendario.
                  </span>
                )}
              </PanelRow>

              {selectedStructureIds.length > 1 && (
                <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-3 text-[12px] text-ink space-y-1.5">
                  <div className="font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                    <Sparkles size={14} />
                    Lote activo: {selectedStructureIds.length} guiones pendientes
                  </div>
                  <p className="text-inksoft leading-relaxed text-[11.5px]">
                    Se generará un guion independiente para cada formato elegido, manteniendo el mismo producto, briefing y cierre ({etiquetaModo(ctaModo)}). Si alguno falla, los demás se conservan y se avisa cuál faltó.
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

                  <PanelRow
                    icon={<Target size={13} />}
                    label={esComunidad ? "Cierre y CTA (sin venta · comunidad)" : "Cierre y CTA (Hormozi)"}
                  >
                    {cta ? (
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <span className="chip chip-brand text-[10px] font-semibold">
                            {etiquetaModo(ctaModo)}
                          </span>
                          <span className="chip chip-plain text-[10px] font-semibold">
                            {gatilloActual?.shortLabel ?? "Sin gatillo"}
                          </span>
                          {ctaAction ? (
                            <span className="chip chip-plain text-[10px]">
                              {CTA_ACTIONS.find((a) => a.id === ctaAction)?.label ?? ctaAction}
                            </span>
                          ) : null}
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
      </details>

      {pending ? (
        <div className="no-print fixed inset-x-0 bottom-0 z-40 flex justify-center p-4">
          <div className="card fade-in flex items-center gap-3 px-4 py-3 shadow-[var(--shadow-3)]">
            <Loader2 size={17} className="spin text-brand shrink-0" />
            <div className="text-[12.5px] leading-snug">
              <div className="text-ink font-semibold">
                {selectedStructureIds.length > 1
                  ? `Registrando ${selectedStructureIds.length} guiones · ${segundos}s`
                  : `Registrando la solicitud · ${segundos}s`}
              </div>
              <div className="text-inkmuted">
                {selectedStructureIds.length > 1
                  ? "El avance y los guiones aparecerán en Mis generaciones."
                  : "La generación continuará en segundo plano."}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {state?.jobId ? (
        <div className="no-print fixed inset-x-0 bottom-0 z-40 flex justify-center p-4">
          <div className="card fade-in flex items-center gap-3 px-4 py-3 shadow-[var(--shadow-3)]">
            <Check size={16} className="text-ok shrink-0" />
            <span className="text-[12.5px] font-semibold">
              {selectedStructureIds.length > 1
                ? video
                  ? `Solicitud registrada: ${selectedStructureIds.length} guiones en camino y el primero se unirá al video. Abriendo el avance…`
                  : `Solicitud registrada: ${selectedStructureIds.length} guiones en camino. Abriendo el avance…`
                : video
                  ? "Solicitud registrada: el guion se unirá al video en cuanto salga. Abriendo el avance…"
                  : "Solicitud registrada. Abriendo el avance…"}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
