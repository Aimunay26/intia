"use client";
import { Archive, ArchiveRestore, Boxes, ChevronDown, Package, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";

import {
  actualizarCombo,
  actualizarProducto,
  archivarCombo,
  archivarProducto,
  crearCombo,
  crearProducto,
  eliminarCombo,
  eliminarProducto,
} from "@/app/actions/products";
import stepStyles from "@/app/(app)/generador/step-ui.module.css";
import { EditForm, RevisionField } from "@/components/edit-form";
import { DeleteButton, SubmitButton } from "@/components/forms";
import { Badge, EmptyState, Field } from "@/components/ui";
import { PRODUCT_KIND_MAP, PRODUCT_KINDS, type ProductKind } from "@/lib/constants";
import {
  PRODUCT_LIMITS,
  type BrandCatalog,
  type CatalogCombo,
  type CatalogProduct,
} from "@/lib/product-catalog-types";
import { cn } from "@/lib/utils";

/**
 * Catálogo de la marca: productos (o servicios, o platos) y combos.
 * Cada ficha activa aparece como tarjeta seleccionable en el paso 2 del
 * generador, con "Qué debe saber la IA" ya cargado.
 * Mismo esquema que ObjectivesPanel: EditForm + RevisionField, borrar solo el dueño.
 */

/* ------------------------------------------------------------- APOYOS -- */

function KindBadge({ kind }: { kind: string }) {
  return <Badge option={PRODUCT_KIND_MAP[kind]} fallback={kind} />;
}

function ArchivedChip() {
  return <span className="chip chip-plain">Archivado</span>;
}

/** Botón de archivar/reactivar con su propia revisión, como el de la marca. */
function ToggleActive({ action, id, updatedAt, active, noun }: {
  action: (data: FormData) => Promise<unknown>;
  id: string;
  updatedAt: string;
  active: boolean;
  noun: string;
}) {
  const label = active ? `Archivar ${noun}` : `Reactivar ${noun}`;
  return (
    <EditForm action={action} className="flex">
      <RevisionField value={updatedAt} />
      <input type="hidden" name="id" value={id} />
      <SubmitButton
        className="btn btn-ghost btn-icon"
        icon={active ? <Archive size={14} /> : <ArchiveRestore size={14} />}
        title={active ? `${label}: deja de aparecer en el generador` : label}
      >
        <span className="sr-only">{label}</span>
      </SubmitButton>
    </EditForm>
  );
}

function Lines({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <div className="text-inkmuted text-[11px] font-semibold tracking-wider uppercase">{label}</div>
      <ul className="text-inksoft mt-1 space-y-0.5 text-[12.5px]">
        {items.map((item, i) => <li key={i}>• {item}</li>)}
      </ul>
    </div>
  );
}

function Notes({ text }: { text: string }) {
  return text
    ? <p className="text-inksoft text-[12.5px] leading-relaxed whitespace-pre-wrap">{text}</p>
    : <p className="text-inkmuted text-[12.5px]">Sin datos para la IA todavía.</p>;
}

/* ------------------------------------------------------------- CAMPOS -- */

function KindChoice({ defaultValue }: { defaultValue: ProductKind }) {
  const [kind, setKind] = useState<ProductKind>(defaultValue);
  return (
    <Field label="Tipo" required hint="Decide qué cierres y ángulos propone el generador.">
      <input type="hidden" name="kind" value={kind} />
      <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label="Tipo">
        {PRODUCT_KINDS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={kind === option.value}
            onClick={() => setKind(option.value as ProductKind)}
            title={option.description}
            className={stepStyles.choice}
          >
            <span className="text-ink text-[13px] font-semibold">{option.label}</span>
          </button>
        ))}
      </div>
    </Field>
  );
}

function AiNotesField({ value }: { value?: string }) {
  return (
    <Field
      label="Qué debe saber la IA"
      hint="Características, beneficios, precio y objeciones con datos reales. Se carga sola en el generador al elegir esta ficha."
    >
      <textarea
        name="aiNotes"
        className="textarea"
        rows={4}
        maxLength={PRODUCT_LIMITS.aiNotes}
        defaultValue={value ?? ""}
        placeholder="Ej. Algodón afranelado de 280 g, estampado con la fecha y las iniciales de la pareja. Llega en caja premium. Tallas S a XL."
      />
    </Field>
  );
}

function NameAndPrice({ name, price, placeholder }: { name?: string; price?: string | null; placeholder: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
      <Field label="Nombre" required>
        <input name="name" className="input" required maxLength={PRODUCT_LIMITS.name} defaultValue={name ?? ""} placeholder={placeholder} />
      </Field>
      <Field label="Precio" hint="Tal como se dice: «S/ 89», «desde S/ 120».">
        <input name="priceLabel" className="input" maxLength={PRODUCT_LIMITS.priceLabel} defaultValue={price ?? ""} placeholder="S/ 89" />
      </Field>
    </div>
  );
}

function ListField({ name, label, value, placeholder }: { name: string; label: string; value?: string[]; placeholder: string }) {
  return (
    <Field label={label} hint={`Una por línea, hasta ${PRODUCT_LIMITS.listItems}.`}>
      <textarea name={name} className="textarea" rows={3} defaultValue={(value ?? []).join("\n")} placeholder={placeholder} />
    </Field>
  );
}

function ProductFields({ value, defaultKind }: { value?: CatalogProduct; defaultKind: ProductKind }) {
  return (
    <div className="space-y-3">
      <NameAndPrice name={value?.name} price={value?.priceLabel} placeholder="Ej. Polera personalizada de algodón" />
      <KindChoice defaultValue={value?.kind ?? defaultKind} />
      <AiNotesField value={value?.aiNotes} />
      <div className="grid gap-3 md:grid-cols-3">
        <ListField name="features" label="Características" value={value?.features} placeholder={"Algodón afranelado\nFecha e iniciales bordadas"} />
        <ListField name="benefits" label="Beneficios" value={value?.benefits} placeholder={"Regalo listo para entregar\nNadie más tiene uno igual"} />
        <ListField name="objections" label="Objeciones" value={value?.objections} placeholder={"¿Llega a tiempo? Se acuerda por WhatsApp"} />
      </div>
      <label className="border-line bg-surface2 flex h-9 w-fit cursor-pointer items-center gap-2 rounded-lg border px-3 text-[12.5px]">
        <input type="checkbox" name="active" defaultChecked={value ? value.active : true} className="accent-brand h-3.5 w-3.5 cursor-pointer" />
        <span className="text-inksoft">Activo: aparece en el generador</span>
      </label>
    </div>
  );
}

function ComboFields({ value, products }: { value?: CatalogCombo; products: CatalogProduct[] }) {
  const quantities = new Map((value?.items ?? []).map((item) => [item.productId, item.quantity]));
  // Un archivado ya no se vende: solo aparece si ya está en este combo, para poder quitarlo.
  const opciones = products.filter((product) => product.active || quantities.has(product.id));
  return (
    <div className="space-y-3">
      <NameAndPrice name={value?.name} price={value?.priceLabel} placeholder="Ej. Pack pareja: 2 poleras + taza" />
      <Field label="Productos del combo" required hint="Marca al menos dos y su cantidad. El tipo del combo sale de sus productos.">
        <ul className="border-line divide-line divide-y rounded-lg border">
          {opciones.map((product) => (
            <li key={product.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-[12.5px]">
                <input
                  type="checkbox"
                  name="productIds"
                  value={product.id}
                  defaultChecked={quantities.has(product.id)}
                  className="accent-brand h-3.5 w-3.5 shrink-0 cursor-pointer"
                />
                <span className="text-ink min-w-0 truncate font-semibold">{product.name}</span>
                {!product.active ? <ArchivedChip /> : null}
              </label>
              <KindBadge kind={product.kind} />
              {/* .input fija width: 100% fuera de las capas de Tailwind: el ancho lo da el contenedor. */}
              <span className="w-[72px] shrink-0">
                <input
                  type="number"
                  name={`quantity-${product.id}`}
                  min={1}
                  max={99}
                  step={1}
                  defaultValue={quantities.get(product.id) ?? 1}
                  aria-label={`Cantidad de ${product.name}`}
                  className="input"
                />
              </span>
            </li>
          ))}
        </ul>
      </Field>
      <AiNotesField value={value?.aiNotes} />
    </div>
  );
}

function FormButtons({ onCancel, label }: { onCancel: () => void; label: string }) {
  return (
    <div className="mt-3 flex justify-end gap-2">
      <button type="button" onClick={onCancel} className="btn btn-sm">Cancelar</button>
      <SubmitButton className="btn btn-primary btn-sm" pendingLabel="Guardando…">{label}</SubmitButton>
    </div>
  );
}

/* ---------------------------------------------------------- PRODUCTOS -- */

function ProductsCard({ brandId, catalog, canEdit, canDelete, defaultKind }: ProductsPanelProps & { defaultKind: ProductKind }) {
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const { products, combos } = catalog;
  const activos = products.filter((p) => p.active).length;
  const archivados = products.length - activos;

  return (
    <div className="card">
      <div className="card-hd">
        <div className="min-w-0">
          <div className="card-title flex items-center gap-2">
            <Package size={14} className="text-inkmuted" />
            Productos
          </div>
          <div className="card-sub mt-0.5">
            {products.length === 0
              ? "Lo que vende la marca: productos, servicios o platos."
              : `${activos} ${activos === 1 ? "activo" : "activos"}${archivados ? ` · ${archivados} ${archivados === 1 ? "archivado" : "archivados"}` : ""}`}
          </div>
        </div>
        {canEdit ? (
          <button type="button" onClick={() => { setAdding((v) => !v); setOpenId(null); }} className="btn btn-sm">
            {adding ? <X size={13} /> : <Plus size={13} />}
            {adding ? "Cancelar" : "Nuevo producto"}
          </button>
        ) : null}
      </div>

      {adding && canEdit ? (
        <EditForm action={crearProducto} onSuccess={() => setAdding(false)} className="border-line bg-surface2 fade-in border-b p-4">
          <input type="hidden" name="brandId" value={brandId} />
          <ProductFields defaultKind={defaultKind} />
          <FormButtons onCancel={() => setAdding(false)} label="Añadir producto" />
        </EditForm>
      ) : null}

      {products.length === 0 ? (
        <EmptyState
          icon={<Package size={19} />}
          title="Todavía no hay productos"
          description={
            canEdit
              ? "Carga cada producto con su tipo, su precio y lo que debe saber la IA. Aparecerán como tarjetas para elegir en el paso 2 del generador, sin volver a escribirlos."
              : "Cuando el equipo cargue los productos de esta marca, aparecerán aquí y como tarjetas en el generador."
          }
        />
      ) : (
        <ul className="divide-line divide-y">
          {products.map((p) => {
            const open = openId === p.id;
            const enCombos = combos.filter((c) => c.items.some((item) => item.productId === p.id)).length;
            return (
              <li key={p.id} className={cn(!p.active && "opacity-70")}>
                <div className="flex flex-wrap items-center gap-2 px-5 py-2.5">
                  <button
                    type="button"
                    onClick={() => { setOpenId(open ? null : p.id); setAdding(false); }}
                    aria-expanded={open}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <ChevronDown size={14} className={cn("text-inkmuted shrink-0 transition-transform", open && "rotate-180")} aria-hidden="true" />
                    <span className="text-ink min-w-0 truncate text-[13px] font-semibold">{p.name}</span>
                  </button>
                  <KindBadge kind={p.kind} />
                  {p.priceLabel ? <span className="text-inksoft text-[12.5px] font-semibold">{p.priceLabel}</span> : null}
                  {!p.active ? <ArchivedChip /> : null}
                  {canEdit ? (
                    <div className="flex items-center gap-1">
                      <ToggleActive action={archivarProducto} id={p.id} updatedAt={p.updatedAt} active={p.active} noun="producto" />
                      {canDelete ? (
                        <DeleteButton
                          action={eliminarProducto}
                          id={p.id}
                          label=""
                          icon={<Trash2 size={14} />}
                          className="btn btn-ghost btn-icon text-danger"
                          title="¿Eliminar este producto?"
                          description={`Se borrará "${p.name}" del catálogo${enCombos ? ` y de ${enCombos} ${enCombos === 1 ? "combo" : "combos"}` : ""}. Los guiones ya generados no cambian. Si solo quieres sacarlo del generador, archívalo.`}
                        />
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {open && canEdit ? (
                  <EditForm action={actualizarProducto} onSuccess={() => setOpenId(null)} className="bg-surface2 fade-in border-line border-t p-4">
                    <RevisionField value={p.updatedAt} />
                    <input type="hidden" name="id" value={p.id} />
                    <ProductFields value={p} defaultKind={defaultKind} />
                    <FormButtons onCancel={() => setOpenId(null)} label="Guardar producto" />
                  </EditForm>
                ) : null}

                {open && !canEdit ? (
                  <div className="bg-surface2 fade-in border-line space-y-3 border-t px-5 py-4">
                    <Notes text={p.aiNotes} />
                    <div className="grid gap-3 md:grid-cols-3">
                      <Lines label="Características" items={p.features} />
                      <Lines label="Beneficios" items={p.benefits} />
                      <Lines label="Objeciones" items={p.objections} />
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- COMBOS -- */

function CombosCard({ brandId, catalog, canEdit, canDelete }: ProductsPanelProps) {
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const { products, combos } = catalog;
  const puedeArmar = products.filter((p) => p.active).length >= 2;

  return (
    <div className="card">
      <div className="card-hd">
        <div className="min-w-0">
          <div className="card-title flex items-center gap-2">
            <Boxes size={14} className="text-inkmuted" />
            Combos
          </div>
          <div className="card-sub mt-0.5">
            {combos.length === 0
              ? "Varios productos que se venden juntos."
              : `${combos.length} ${combos.length === 1 ? "combo" : "combos"}`}
          </div>
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={() => { setAdding((v) => !v); setOpenId(null); }}
            className="btn btn-sm"
            disabled={!puedeArmar && !adding}
            title={puedeArmar ? undefined : "Carga al menos dos productos para armar un combo."}
          >
            {adding ? <X size={13} /> : <Plus size={13} />}
            {adding ? "Cancelar" : "Nuevo combo"}
          </button>
        ) : null}
      </div>

      {adding && canEdit ? (
        <EditForm action={crearCombo} onSuccess={() => setAdding(false)} className="border-line bg-surface2 fade-in border-b p-4">
          <input type="hidden" name="brandId" value={brandId} />
          <ComboFields products={products} />
          <FormButtons onCancel={() => setAdding(false)} label="Añadir combo" />
        </EditForm>
      ) : null}

      {combos.length === 0 ? (
        <EmptyState
          icon={<Boxes size={19} />}
          title="Todavía no hay combos"
          description={
            canEdit
              ? puedeArmar
                ? "Junta dos o más productos que se venden juntos, como un pack de pareja. El combo también aparece como tarjeta en el generador."
                : "Primero carga al menos dos productos; luego podrás juntarlos en un combo."
              : "Cuando el equipo arme combos para esta marca, aparecerán aquí."
          }
        />
      ) : (
        <ul className="divide-line divide-y">
          {combos.map((c) => {
            const open = openId === c.id;
            const incompleto = c.items.length < 2;
            const conArchivado = c.items.some((item) => !item.active);
            return (
              <li key={c.id} className={cn(!c.active && "opacity-70")}>
                <div className="flex flex-wrap items-center gap-2 px-5 py-2.5">
                  <button
                    type="button"
                    onClick={() => { setOpenId(open ? null : c.id); setAdding(false); }}
                    aria-expanded={open}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <ChevronDown size={14} className={cn("text-inkmuted shrink-0 transition-transform", open && "rotate-180")} aria-hidden="true" />
                    <span className="text-ink min-w-0 truncate text-[13px] font-semibold">{c.name}</span>
                  </button>
                  <KindBadge kind={c.kind} />
                  {c.priceLabel ? <span className="text-inksoft text-[12.5px] font-semibold">{c.priceLabel}</span> : null}
                  <span className={cn("text-[11.5px]", incompleto ? "text-warn" : "text-inkmuted")} title={incompleto ? "Un combo necesita al menos dos productos." : undefined}>
                    {c.items.length} {c.items.length === 1 ? "producto" : "productos"}
                  </span>
                  {!c.active ? <ArchivedChip /> : null}
                  {c.active && conArchivado ? (
                    <span className="text-warn text-[11.5px]" title="Incluye un producto archivado: no aparece en el generador hasta reactivarlo o quitarlo del combo.">
                      Producto archivado
                    </span>
                  ) : null}
                  {canEdit ? (
                    <div className="flex items-center gap-1">
                      <ToggleActive action={archivarCombo} id={c.id} updatedAt={c.updatedAt} active={c.active} noun="combo" />
                      {canDelete ? (
                        <DeleteButton
                          action={eliminarCombo}
                          id={c.id}
                          label=""
                          icon={<Trash2 size={14} />}
                          className="btn btn-ghost btn-icon text-danger"
                          title="¿Eliminar este combo?"
                          description={`Se borrará "${c.name}". Sus productos se quedan en el catálogo.`}
                        />
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {open && canEdit ? (
                  <EditForm action={actualizarCombo} onSuccess={() => setOpenId(null)} className="bg-surface2 fade-in border-line border-t p-4">
                    <RevisionField value={c.updatedAt} />
                    <input type="hidden" name="id" value={c.id} />
                    <ComboFields value={c} products={products} />
                    <FormButtons onCancel={() => setOpenId(null)} label="Guardar combo" />
                  </EditForm>
                ) : null}

                {open && !canEdit ? (
                  <div className="bg-surface2 fade-in border-line space-y-3 border-t px-5 py-4">
                    <Lines label="Incluye" items={c.items.map((item) => `${item.quantity}× ${item.name}`)} />
                    <Notes text={c.aiNotes} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- PANEL -- */

type ProductsPanelProps = {
  brandId: string;
  catalog: BrandCatalog;
  canEdit: boolean;
  /** Eliminar es solo del dueño; crear, editar y archivar son del equipo con brands.edit. */
  canDelete: boolean;
};

export function ProductsPanel({ defaultKind = "PRODUCTO", ...props }: ProductsPanelProps & {
  /** Tipo preseleccionado al crear: el más frecuente de la marca. */
  defaultKind?: ProductKind;
}) {
  return (
    <div className="space-y-4">
      <ProductsCard {...props} defaultKind={defaultKind} />
      <CombosCard {...props} />
    </div>
  );
}
