"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, Layers, Plus } from "lucide-react";
import Link from "next/link";

import { cambiarMarcaActiva } from "@/app/actions/brand-context";
import { TODAS, type BrandChoice } from "@/lib/brand-shared";
import { cn, withAlpha } from "@/lib/utils";

/**
 * Selector de marca activa.
 *
 * Es la pieza que decide en qué está trabajando el equipo: en el conjunto de
 * todas las marcas, o dentro de una concreta. Vive arriba del todo en la barra
 * lateral porque condiciona lo que se ve en el resto de la aplicación.
 */
export function BrandSwitcher({
  brands,
  activeId,
  canCreate,
}: {
  brands: BrandChoice[];
  activeId: string | null;
  canCreate: boolean;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const active = brands.find((b) => b.id === activeId) ?? null;

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const elegir = (id: string) => {
    setOpen(false);
    const form = formRef.current;
    if (!form) return;
    const input = form.elements.namedItem("brandId") as HTMLInputElement | null;
    if (input) input.value = id;
    form.requestSubmit();
  };

  return (
    <div className="relative px-3.5 pb-3" ref={boxRef}>
      <form action={cambiarMarcaActiva} ref={formRef} className="hidden">
        <input type="hidden" name="brandId" defaultValue={TODAS} />
      </form>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="border-line hover:border-linestrong bg-surface2 flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
          style={
            active
              ? { background: withAlpha(active.colorPrimary, 0.16), color: active.colorPrimary }
              : { background: "var(--surface-3)", color: "var(--ink-muted)" }
          }
        >
          {active ? (
            <span className="text-[13px] font-bold">{active.name.charAt(0).toUpperCase()}</span>
          ) : (
            <Layers size={14} />
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="text-inkmuted block text-[10px] font-bold tracking-[0.08em] uppercase">
            {active ? "Marca" : "Viendo"}
          </span>
          <span className="text-ink block truncate text-[12.5px] leading-tight font-semibold">
            {active ? active.name : "Todas las marcas"}
          </span>
        </span>

        <ChevronsUpDown size={14} className="text-inkmuted shrink-0" />
      </button>

      {open ? (
        <div className="card fade-in absolute right-3.5 left-3.5 z-50 mt-1.5 overflow-hidden p-1 shadow-[var(--shadow-3)]">
          <button
            type="button"
            onClick={() => elegir(TODAS)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] transition-colors",
              !active ? "bg-brandsoft text-brand font-semibold" : "text-inksoft hover:bg-surface3"
            )}
          >
            <Layers size={14} className="shrink-0" />
            <span className="flex-1">Todas las marcas</span>
            {!active ? <Check size={13} /> : null}
          </button>

          {brands.length ? (
            <div className="border-line my-1 border-t" />
          ) : null}

          <div className="max-h-[260px] overflow-y-auto">
            {brands.map((b) => {
              const esActiva = b.id === activeId;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => elegir(b.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] transition-colors",
                    esActiva ? "bg-brandsoft text-brand font-semibold" : "text-inksoft hover:bg-surface3"
                  )}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                    style={{ background: b.colorPrimary }}
                  />
                  <span className="flex-1 truncate">{b.name}</span>
                  {esActiva ? <Check size={13} className="shrink-0" /> : null}
                </button>
              );
            })}
          </div>

          {canCreate ? (
            <>
              <div className="border-line my-1 border-t" />
              <Link
                href="/marcas"
                onClick={() => setOpen(false)}
                className="text-inkmuted hover:bg-surface3 hover:text-ink flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12.5px] transition-colors"
              >
                <Plus size={14} className="shrink-0" />
                Nueva marca
              </Link>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Aviso para las pantallas globales (estructuras, arquetipos, equipo):
 * ahí la marca activa no filtra nada y conviene decirlo.
 */
export function GlobalScopeNote({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-inkmuted inline-flex items-center gap-1.5 text-[11.5px]">
      <Layers size={11} />
      {children}
    </span>
  );
}
