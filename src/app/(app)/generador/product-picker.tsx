"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, Plus, RotateCcw, Save, Search } from "lucide-react";

import { guardarProductoRapido } from "@/app/actions/products";
import { Badge } from "@/components/ui";
import { PRODUCT_KIND_MAP, PRODUCT_KINDS, type ProductKind } from "@/lib/constants";
import { GUIA_TARGETS } from "@/lib/guia/catalogo";
import { GENERATOR_CATALOG_LIMITS, PRODUCT_LIMITS, type CatalogCombo, type CatalogProduct } from "@/lib/product-catalog-types";
import { cn } from "@/lib/utils";
import { StepField } from "./step-ui";
import stepStyles from "./step-ui.module.css";
import formatStyles from "./format-step.module.css";

/** Lo que se elige en el selector: una ficha de producto o un combo de la marca. */
export type CatalogChoice = { type: "product"; product: CatalogProduct } | { type: "combo"; combo: CatalogCombo };

/** Con más fichas que esto aparece el buscador. */
const BUSCADOR_DESDE = 12;

/** Nombre comparable: sin tildes ni mayúsculas. */
const normalizar = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * Paso 2 con el catálogo encendido: el producto se elige de las fichas de la
 * marca (solo título y tipo) y "Qué debe saber la IA" llega ya cargado. El
 * formulario de texto libre aparece solo al pulsar "Cargar un nuevo producto"
 * (o si la marca aún no tiene fichas); una segunda pulsación lo cierra. Ningún
 * control lleva `name`: lo que se envía son los campos ocultos del generador,
 * que `field()` lee primero.
 */
export function ProductPicker({
  brandId,
  brandName,
  products,
  combos,
  selectedProductId,
  selectedComboId,
  truncated,
  formOpen,
  name,
  kind,
  detail,
  catalogNotes,
  trimNotice,
  canSave,
  onPick,
  onToggleForm,
  onNameChange,
  onKindChange,
  onDetailChange,
  onRestoreNotes,
  onSaved,
}: {
  /** Marca elegida; vacía = sin marca. */
  brandId: string;
  brandName: string | null;
  /** Fichas activas de la marca elegida. */
  products: CatalogProduct[];
  combos: CatalogCombo[];
  selectedProductId: string;
  selectedComboId: string;
  /** La marca tiene más fichas activas que el tope del selector (GENERATOR_CATALOG_LIMITS). */
  truncated: boolean;
  /** "Cargar un nuevo producto" pulsado (o texto libre en curso) y sin ficha elegida. */
  formOpen: boolean;
  name: string;
  kind: ProductKind | null;
  detail: string;
  /** "Qué debe saber la IA" de la ficha elegida; null sin ficha elegida. */
  catalogNotes: string | null;
  /** Lo que de la ficha elegida no cabe en el texto para la IA (avisoDeRecorte); null si llega entera. */
  trimNotice: string | null;
  /** Puede guardar en el catálogo de la marca (brands.edit). */
  canSave: boolean;
  onPick: (choice: CatalogChoice) => void;
  /** Abre el formulario de texto libre o, si ya está abierto, lo cierra y lo vacía. */
  onToggleForm: () => void;
  onNameChange: (value: string) => void;
  onKindChange: (kind: ProductKind) => void;
  onDetailChange: (value: string) => void;
  onRestoreNotes: () => void;
  onSaved: (product: CatalogProduct) => void;
}) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  // Al volver del servidor se usa la versión actual de onSaved (marca, tipo y texto de ese momento),
  // no la del render en que se pulsó "Guardar en el catálogo".
  const onSavedRef = useRef(onSaved);
  useEffect(() => {
    onSavedRef.current = onSaved;
  });

  const total = products.length + combos.length;
  const hayCatalogo = total > 0;
  const mostrarFormulario = formOpen || !hayCatalogo;
  const clave = total > BUSCADOR_DESDE ? normalizar(query) : "";
  const coincide = (nombre: string) => !clave || normalizar(nombre).includes(clave);
  const productosVisibles = products.filter((p) => coincide(p.name));
  const combosVisibles = combos.filter((c) => coincide(c.name));

  const faltaParaGuardar = !name.trim()
    ? "Escribe el nombre para guardarlo."
    : !kind
      ? "Elige el tipo para guardarlo."
      : null;

  const guardar = () => {
    if (!brandId || !kind || !name.trim()) return;
    setError(null);
    startSaving(async () => {
      try {
        const result = await guardarProductoRapido({ brandId, name, kind, aiNotes: detail });
        if (result.ok) onSavedRef.current(result.product);
        else setError(result.error);
      } catch {
        setError("No se pudo guardar el producto. Intenta de nuevo; el texto se conserva.");
      }
    });
  };

  const tarjeta = (choice: CatalogChoice) => {
    const ficha = choice.type === "product" ? choice.product : choice.combo;
    const elegida = choice.type === "product" ? ficha.id === selectedProductId : ficha.id === selectedComboId;
    return (
      <button
        key={`${choice.type}-${ficha.id}`}
        type="button"
        aria-pressed={elegida}
        onClick={() => onPick(choice)}
        title={ficha.name}
        className={cn(stepStyles.choice, stepStyles.pick)}
      >
        <span className="text-ink line-clamp-2 text-[13px] leading-snug font-semibold wrap-break-word">{ficha.name}</span>
        <Badge option={PRODUCT_KIND_MAP[ficha.kind]} fallback={ficha.kind} />
      </button>
    );
  };

  const campoDetalle = (
    <StepField
      id="generator-product-detail"
      label="Qué debe saber la IA"
      hint={catalogNotes !== null
        ? "Viene de la ficha del catálogo. Si lo cambias, solo vale para este video."
        : "Características, beneficios, precio y objeciones que resuelve. Usa datos reales."}
    >
      <textarea
        id="generator-product-detail"
        rows={3}
        className="textarea"
        value={detail}
        onChange={(e) => onDetailChange(e.target.value)}
        maxLength={catalogNotes !== null ? PRODUCT_LIMITS.aiNotes : undefined}
        placeholder="Describe qué ofrece, para quién sirve y qué lo hace diferente."
        data-guia={GUIA_TARGETS.INPUT_GENERADOR_PRODUCTO_DESC}
      />
      {catalogNotes !== null && detail.trim() !== catalogNotes.trim() ? (
        <button type="button" className="text-brand mt-2 inline-flex items-center gap-2 py-1 text-xs font-semibold hover:underline" onClick={onRestoreNotes}>
          <RotateCcw size={13} aria-hidden="true" /> Usar lo de la ficha
        </button>
      ) : null}
      {catalogNotes !== null && trimNotice ? <p className="text-warn mt-2 text-xs">{trimNotice}</p> : null}
    </StepField>
  );

  return (
    <fieldset className="min-w-0 space-y-4" data-guia={GUIA_TARGETS.INPUT_GENERADOR_PRODUCTO} data-guia-catalogo="">
      <legend className="mb-2 block text-sm font-semibold">
        Producto o servicio del video<span className="text-danger"> *</span>
      </legend>

      {hayCatalogo ? (
        <>
          {total > BUSCADOR_DESDE ? (
            <label className="relative block">
              <span className="sr-only">Buscar en el catálogo</span>
              <Search size={16} aria-hidden="true" className="text-inkmuted pointer-events-none absolute top-1/2 left-3 -translate-y-1/2" />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar un producto…" className={cn("input min-h-11", formatStyles.search)} />
            </label>
          ) : null}
          {productosVisibles.length ? (
            <div>
              <h3 className="text-inkmuted mb-2 text-[11px] font-bold tracking-wider uppercase">Productos</h3>
              <div role="group" aria-label="Productos" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {productosVisibles.map((product) => tarjeta({ type: "product", product }))}
              </div>
            </div>
          ) : null}
          {combosVisibles.length ? (
            <div>
              <h3 className="text-inkmuted mb-2 text-[11px] font-bold tracking-wider uppercase">Combos</h3>
              <div role="group" aria-label="Combos" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {combosVisibles.map((combo) => tarjeta({ type: "combo", combo }))}
              </div>
            </div>
          ) : null}
          {clave && !productosVisibles.length && !combosVisibles.length ? (
            <p className="text-inkmuted text-sm">Nada coincide con «{query.trim()}».</p>
          ) : null}
          {truncated ? (
            <p className="text-inkmuted text-xs">
              Se muestran hasta {GENERATOR_CATALOG_LIMITS.products} productos y {GENERATOR_CATALOG_LIMITS.combos} combos de la marca.{" "}
              <Link href={`/marcas/${brandId}?vista=productos`} className="text-brand font-semibold">Archiva los que ya no vendes</Link> para ver el resto.
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <button type="button" aria-pressed={mostrarFormulario} onClick={onToggleForm} className={cn(stepStyles.choice, stepStyles.pick, stepStyles.add)}>
              <span className="text-brand flex items-center gap-1.5 text-[13px] leading-snug font-semibold">
                <Plus size={15} className="shrink-0" aria-hidden="true" /> Cargar un nuevo producto
              </span>
            </button>
          </div>
        </>
      ) : (
        <p className="text-inkmuted text-sm">
          {brandId ? (
            <>
              {brandName ?? "Esta marca"} aún no tiene productos guardados.{" "}
              <Link href={`/marcas/${brandId}?vista=productos`} className="text-brand font-semibold">Abrir productos de la marca</Link>
            </>
          ) : (
            "Elige una marca para usar sus productos guardados, o escribe el producto aquí."
          )}
        </p>
      )}

      {mostrarFormulario ? (
        <div className="border-line space-y-4 rounded-xl border p-4">
          {/* Mientras se guarda en el catálogo no se edita: lo guardado es lo que queda elegido. */}
          <fieldset disabled={saving} className="min-w-0 space-y-4">
            <StepField id="generator-product" label="Nombre" required>
              <input
                id="generator-product"
                className="input"
                value={name}
                maxLength={PRODUCT_LIMITS.name}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder="Ej. Ramo de rosas con chocolates"
              />
            </StepField>
            <div>
              <p id="generator-product-kind" className="mb-2 block text-sm font-semibold">Tipo</p>
              <div role="group" aria-labelledby="generator-product-kind" className="grid gap-2 sm:grid-cols-3">
                {PRODUCT_KINDS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={kind === option.value}
                    onClick={() => onKindChange(option.value as ProductKind)}
                    title={option.description}
                    className={cn(stepStyles.choice, stepStyles.pick)}
                  >
                    <span className="text-[13px] font-semibold">{option.label}</span>
                  </button>
                ))}
              </div>
            </div>
            {campoDetalle}
          </fieldset>
          {canSave && brandId ? (
            <div>
              <button type="button" className="btn" disabled={saving || Boolean(faltaParaGuardar)} onClick={guardar}>
                {saving ? <Loader2 size={15} className="spin" aria-hidden="true" /> : <Save size={15} aria-hidden="true" />}
                {saving ? "Guardando…" : "Guardar en el catálogo"}
              </button>
              {error ? (
                <p role="alert" className="text-danger mt-2 text-xs">{error}</p>
              ) : (
                <p className="text-inkmuted mt-2 text-xs">{faltaParaGuardar ?? "Si no lo guardas, se usa solo en este video."}</p>
              )}
            </div>
          ) : (
            <p className="text-inkmuted text-xs">Se usa solo en este video.</p>
          )}
        </div>
      ) : catalogNotes !== null ? (
        campoDetalle
      ) : null}
    </fieldset>
  );
}
