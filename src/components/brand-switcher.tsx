"use client";

import { useRef, useState } from "react";
import { Check, ChevronsUpDown, Layers, Plus } from "lucide-react";
import Link from "next/link";

import { cambiarMarcaActiva } from "@/app/actions/brand-context";
import { TODAS, type BrandChoice } from "@/lib/brand-shared";
import { cn, withAlpha } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

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
  compact = false,
  allLabel = "Todas las marcas",
}: {
  brands: BrandChoice[];
  activeId: string | null;
  canCreate: boolean;
  /** Indicador de la cabecera móvil: color y nombre recortado; abre el mismo menú. */
  compact?: boolean;
  /** Opción sin filtro: "Todas las marcas" para el Dueño; "Mis marcas" para el Equipo, que solo ve las autorizadas. */
  allLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const active = brands.find((b) => b.id === activeId) ?? null;

  const elegir = (id: string) => {
    setOpen(false);
    const form = formRef.current;
    if (!form) return;
    const input = form.elements.namedItem("brandId") as HTMLInputElement | null;
    if (input) input.value = id;
    form.requestSubmit();
  };

  const label = `Cambiar marca: ${active ? active.name : allLabel}`;

  return (
    <div className={compact ? "relative min-w-0" : "relative px-3.5 pb-3"}>
      <form action={cambiarMarcaActiva} ref={formRef} className="hidden">
        <input type="hidden" name="brandId" defaultValue={TODAS} />
      </form>

      <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
      {compact ? (
        <button
          type="button"
          className="border-line bg-surface2 hover:border-linestrong text-ink flex h-10 max-w-full min-w-0 items-center gap-1.5 rounded-lg border px-2 text-[12.5px] font-semibold transition-colors"
          aria-label={label}
          title={label}
        >
          {active ? (
            <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: active.colorPrimary }} />
          ) : (
            <Layers size={13} className="text-inkmuted shrink-0" />
          )}
          <span className="min-w-0 truncate">{active ? active.name : allLabel === "Mis marcas" ? "Mis marcas" : "Todas"}</span>
          <ChevronsUpDown size={13} className="text-inkmuted shrink-0" />
        </button>
      ) : (
      <button
        type="button"
        className="border-line hover:border-linestrong bg-surface2 flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors"
        aria-label={label}
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
            {active ? active.name : allLabel}
          </span>
        </span>

        <ChevronsUpDown size={14} className="text-inkmuted shrink-0" />
      </button>
      )}
      </DropdownMenuTrigger>

        <DropdownMenuContent
          align={compact ? "end" : "start"}
          className={compact ? "w-64 max-w-[calc(100vw-2rem)]" : "w-[var(--radix-dropdown-menu-trigger-width)]"}
        >
          <DropdownMenuItem
            onSelect={() => elegir(TODAS)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] transition-colors",
              !active ? "bg-brandsoft text-brand font-semibold" : "text-inksoft hover:bg-surface3"
            )}
          >
            <Layers size={14} className="shrink-0" />
            <span className="flex-1">{allLabel}</span>
            {!active ? <Check size={13} /> : null}
          </DropdownMenuItem>

          {brands.length ? (
            <DropdownMenuSeparator />
          ) : null}

          <div className="max-h-[260px] overflow-y-auto">
            {brands.map((b) => {
              const esActiva = b.id === activeId;
              return (
                <DropdownMenuItem
                  key={b.id}
                  onSelect={() => elegir(b.id)}
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
                </DropdownMenuItem>
              );
            })}
          </div>

          {canCreate ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
              <Link
                href="/marcas"
                onClick={() => setOpen(false)}
                className="text-inkmuted hover:bg-surface3 hover:text-ink flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12.5px] transition-colors"
              >
                <Plus size={14} className="shrink-0" />
                Nueva marca
              </Link>
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
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
