"use client";

import { Fragment, useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bot,
  Check,
  Clock,
  FileText,
  Film,
  Layers,
  Loader2,
  Package,
  Sparkles,
  Tags,
  Target,
  UserSquare2,
  Wand2,
} from "lucide-react";

import { generarGuion, type GenerateState } from "@/app/actions/scripts";
import {
  AI_MODELS,
  AI_PROVIDERS,
  FIT_SCORES,
  STRUCTURE_CATEGORIES,
  STRUCTURE_CATEGORY_MAP,
} from "@/lib/constants";
import { cn, formatSeconds, withAlpha } from "@/lib/utils";
import { GUIA_TARGETS } from "@/lib/guia/catalogo";
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
}: {
  structures: GeneratorStructure[];
  brands: GeneratorBrand[];
  archetypes: GeneratorArchetype[];
  providersReady: Record<string, boolean>;
  initialStructureId: string;
  initialBrandId: string;
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

  const [structureId, setStructureId] = useState(primeraEstructura?.id ?? "");
  const [brandId, setBrandId] = useState(initialBrandId);
  const [archetypeId, setArchetypeId] = useState("");
  const [duracion, setDuracion] = useState(
    String(primeraEstructura?.defaultDurationSec ?? 45)
  );
  const [provider, setProvider] = useState(proveedorInicial);
  const [model, setModel] = useState(primeraEstructura?.defaultModel ?? "");
  const [cta, setCta] = useState("");
  const [segundos, setSegundos] = useState(0);

  const structure = structures.find((s) => s.id === structureId) ?? null;
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

  const elegirEstructura = (s: GeneratorStructure) => {
    setStructureId(s.id);
    setDuracion(String(s.defaultDurationSec || 45));
    setModel(s.defaultModel || "");
    if (s.defaultProvider && providersReady[s.defaultProvider]) {
      setProvider(s.defaultProvider);
    }
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
  const puedeGenerar = Boolean(structureId && providersReady[provider] && !pending);

  const modelosSugeridos = AI_MODELS[provider] ?? [];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_368px]">
      {/* ------------------------------------------------- COLUMNA IZQUIERDA */}
      <form action={formAction} className="min-w-0 space-y-4">
        <input type="hidden" name="estructura" value={structureId} />
        <input type="hidden" name="marca" value={brandId} />
        <input type="hidden" name="arquetipo" value={archetypeId} />

        {/* 1. ESTRUCTURA */}
        <Card>
          <CardHeader
            title="1 · Estructura"
            subtitle="El formato ganador que la IA va a reproducir con contenido nuevo."
            icon={<Layers size={15} />}
            actions={
              structure ? (
                <span className="chip chip-plain">{structure.beats.length} beats</span>
              ) : null
            }
          />
          <div className="space-y-4 p-4" data-guia={GUIA_TARGETS.SELECT_GENERADOR_ESTRUCTURA}>
            {STRUCTURE_CATEGORIES.map((cat) => {
              const grupo = structures.filter((s) => s.category === cat.value);
              if (!grupo.length) return null;
              return (
                <div key={cat.value}>
                  <SectionTitle>
                    <span className="flex items-center gap-2 normal-case">
                      <span className={cn("chip", cat.chip)}>{cat.label}</span>
                      <span className="text-inkmuted font-medium normal-case">
                        {cat.description}
                      </span>
                    </span>
                  </SectionTitle>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {grupo.map((s) => {
                      const activa = s.id === structureId;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => elegirEstructura(s)}
                          className={cn(
                            "card-flat hover:border-linestrong w-full p-3 text-left transition-all",
                            activa && "border-brand bg-brandsoft/50"
                          )}
                          style={activa ? { boxShadow: "0 0 0 1px var(--brand)" } : undefined}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-ink text-[13px] leading-snug font-semibold">
                              {s.name}
                            </span>
                            <span className="text-inkmuted shrink-0 text-[11px] font-semibold">
                              {formatSeconds(s.defaultDurationSec)}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            {s.family ? (
                              <span className="chip chip-plain">{s.family}</span>
                            ) : null}
                            <span className="text-inkmuted text-[11px]">
                              {s.beats.length} beats
                            </span>
                            {s.docs > 0 ? (
                              <span className="text-inkmuted inline-flex items-center gap-1 text-[11px]">
                                <FileText size={10} />
                                {s.docs}
                              </span>
                            ) : null}
                          </div>
                          {s.beats.length ? (
                            <div className="text-inkmuted mt-1.5 line-clamp-2 text-[11.5px] leading-relaxed">
                              {s.beats.map((b) => b.name).join(" → ")}
                            </div>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* 2. CONTEXTO */}
        <Card>
          <CardHeader
            title="2 · Marca y arquetipo"
            subtitle="La identidad de la marca y el perfil de quien va a actuar."
            icon={<Tags size={15} />}
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
                  <option value="">Sin marca</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label="Producto o servicio del video"
                hint="Lo concreto que se muestra o se vende."
              >
                <input
                  name="producto"
                  className="input"
                  placeholder="Ej. Ramo de rosas rojas con caja de chocolates"
                />
              </Field>
            </div>

            <div>
              <label className="label">Quién actúa</label>
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
                  className="border-line no-scrollbar max-h-[210px] overflow-y-auto rounded-xl border"
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
                    // El primer perfil generico abre la seccion de plantillas.
                    const abreGenericos =
                      !a.isPerson && (i === 0 || arquetiposOrdenados[i - 1].isPerson);
                    return (
                      <Fragment key={a.id}>
                        {abreGenericos ? (
                          <div className="border-line bg-surface2 text-inkmuted border-b px-3 py-1.5 text-[10.5px] font-bold tracking-[0.08em] uppercase">
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
                            <span
                              className="text-inkmuted shrink-0 text-[11px]"
                              title="No tiene tono de voz cargado: el guion no sonará a esta persona"
                            >
                              sin voz
                            </span>
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
          </div>
        </Card>

        {/* 3. EL VIDEO */}
        <Card>
          <CardHeader
            title="3 · Qué quieres en este video"
            subtitle="Mientras más concreto seas, menos tendrás que corregir después."
            icon={<Target size={15} />}
          />
          <div className="space-y-3 p-4">
            <Field
              label="Petición"
              required
              hint="Habla como le hablarías a tu guionista: qué pasa, qué sensación buscas, qué tiene que quedar claro."
            >
              <textarea
                name="peticion"
                className="textarea"
                rows={5}
                required
                placeholder={
                  "Ej. Quiero un video para el Día de la Madre. Que arranque con algo que incomode, que se sienta real, y que termine mostrando el arreglo grande. Nada cursi."
                }
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
              <Field
                label="Variante"
                hint="Un giro concreto para que no salga igual a los anteriores. Ej. «que el golpe visual sea que se rompió algo», «que sea de noche», «que el protagonista sea el hermano menor»."
              >
                <input
                  name="variante"
                  className="input"
                  placeholder="Ej. que el golpe visual sea que se rompió algo"
                />
              </Field>

              <Field label="Duración objetivo" hint="En segundos.">
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

            <Field
              label="Llamado a la acción (CTA)"
              hint="El cierre y la instrucción final que dirá el video. Elige una fórmula probada o escribe la tuya."
            >
              <div className="mb-2 flex flex-wrap gap-1.5">
                {[
                  "Comenta una palabra clave (ej: GUIA / RETO)",
                  "Visita el enlace en mi perfil / biografía",
                  "Escríbeme por mensaje directo (DM)",
                  "Haz clic en el enlace para registrarte",
                  "Comparte este video con un amigo",
                  "Sin CTA (Solo entretener)",
                ].map((preset) => {
                  const esSinCta = preset.startsWith("Sin CTA");
                  const activo = esSinCta ? cta === "" : cta === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setCta(esSinCta ? "" : preset)}
                      className={cn(
                        "chip transition-colors cursor-pointer text-[11.5px]",
                        activo
                          ? "chip-brand font-semibold"
                          : "chip-plain hover:border-brand/40"
                      )}
                    >
                      {preset}
                    </button>
                  );
                })}
              </div>
              <input
                name="cta"
                className="input"
                value={cta}
                onChange={(e) => setCta(e.target.value)}
                placeholder="Ej. Comenta la palabra «RETO» para enviarte el plan completo al DM."
              />
            </Field>
          </div>
        </Card>

        {/* 4. MOTOR */}
        <Card>
          <CardHeader
            title="4 · Motor"
            subtitle="Con qué modelo se escribe el guion."
            icon={<Bot size={15} />}
          />
          <div className="space-y-3 p-4">
            <input type="hidden" name="proveedor" value={provider} />

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Proveedor</label>
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
                  <div className="hint">
                    Falta la clave de este proveedor.{" "}
                    <Link href="/ajustes" className="text-brand font-semibold">
                      Configúrala en Ajustes
                    </Link>
                    .
                  </div>
                ) : null}
              </div>

              <Field
                label="Modelo"
                hint="Texto libre: si sale un modelo nuevo, escríbelo aquí sin esperar a nadie."
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
          </div>
        </Card>

        {/* GENERAR */}
        {state?.error ? (
          <Callout tone="danger" title={state.error}>
            {state.detail ? <span className="block">{state.detail}</span> : null}
            <span className="mt-1 block">
              No se guardó nada. Puedes ajustar el pedido y volver a intentar.
            </span>
          </Callout>
        ) : null}

        <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-inkmuted min-w-0 text-[12.5px] leading-relaxed">
            {pending ? (
              <span className="text-ink flex items-center gap-2 font-semibold">
                <Loader2 size={15} className="spin text-brand" />
                Escribiendo el guion… llevan {segundos}s
              </span>
            ) : (
              <>
                Se enviarán <strong className="text-ink">{docsTotal}</strong>{" "}
                {docsTotal === 1 ? "documento" : "documentos"} de referencia y{" "}
                <strong className="text-ink">{structure?.beats.length ?? 0}</strong> beats
                obligatorios.
              </>
            )}
            {pending ? (
              <span className="mt-1 block">
                Esto puede tardar entre 30 y 90 segundos. No cierres esta pestaña.
              </span>
            ) : null}
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-lg shrink-0"
            disabled={!puedeGenerar}
            data-guia={GUIA_TARGETS.BTN_GENERAR_GUION_SUBMIT}
          >
            {pending ? (
              <Loader2 size={16} className="spin" />
            ) : (
              <Wand2 size={16} />
            )}
            {pending ? "Generando guion…" : "Generar guion"}
          </button>
        </div>
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

                  <PanelRow icon={<Target size={13} />} label="Llamado a la acción (CTA)">
                    {cta ? (
                      <span className="text-ink font-medium">{cta}</span>
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
                Generando el guion con {model || provider} · {segundos}s
              </div>
              <div className="text-inkmuted">
                Suele tardar entre 30 y 90 segundos. Cuando termine se abre solo.
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
              Guion listo. Abriendo el visualizador…
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
