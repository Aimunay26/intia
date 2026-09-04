"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Filtros que viajan por la URL.
 * Así cualquier vista filtrada se puede compartir por enlace y el botón
 * "atrás" del navegador funciona como la gente espera.
 */

function useSetParam() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const setParam = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    // Al cambiar cualquier filtro volvemos a la primera página.
    if (!("pagina" in updates)) params.delete("pagina");
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  return { setParam, pending, searchParams };
}

/* -------------------------------------------------------------- CONTENEDOR -- */

export function FilterBar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "card no-print mb-4 flex flex-wrap items-center gap-2 p-2.5",
        className
      )}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ SELECT -- */

export function FilterSelect({
  param,
  options,
  allLabel = "Todos",
  icon,
  width = 168,
}: {
  param: string;
  options: { value: string; label: string }[];
  allLabel?: string;
  icon?: React.ReactNode;
  width?: number;
}) {
  const { setParam, searchParams } = useSetParam();
  const value = searchParams.get(param) ?? "";

  return (
    <div className="relative flex items-center" style={{ width }}>
      {icon ? (
        <span className="text-inkmuted pointer-events-none absolute left-2.5 z-10">{icon}</span>
      ) : null}
      <select
        className={cn("select h-[34px] text-[12.5px]", Boolean(icon) && "pl-8")}
        value={value}
        onChange={(e) => setParam({ [param]: e.target.value || null })}
        aria-label={allLabel}
        style={{
          fontWeight: value ? 600 : 400,
          borderColor: value ? "var(--brand)" : undefined,
        }}
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ------------------------------------------------------------------ TEXTO -- */

export function SearchInput({
  param = "q",
  placeholder = "Buscar…",
  width = 240,
}: {
  param?: string;
  placeholder?: string;
  width?: number;
}) {
  const { setParam, searchParams, pending } = useSetParam();
  const initial = searchParams.get(param) ?? "";
  const [value, setValue] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(false);

  // Si la URL cambia por fuera (botón atrás), reflejarlo en el campo.
  useEffect(() => {
    setValue(searchParams.get(param) ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.toString()]);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (value !== (searchParams.get(param) ?? "")) setParam({ [param]: value || null });
    }, 320);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="relative flex items-center" style={{ width }}>
      <span className="text-inkmuted pointer-events-none absolute left-2.5">
        {pending ? <Loader2 size={14} className="spin" /> : <Search size={14} />}
      </span>
      <input
        className="input h-[34px] pr-8 pl-8 text-[12.5px]"
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
      />
      {value ? (
        <button
          type="button"
          onClick={() => setValue("")}
          className="text-inkmuted hover:text-ink absolute right-2 transition-colors"
          aria-label="Limpiar búsqueda"
        >
          <X size={14} />
        </button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ FECHA -- */

export function FilterDate({
  param,
  label,
  width = 150,
}: {
  param: string;
  label?: string;
  width?: number;
}) {
  const { setParam, searchParams } = useSetParam();
  const value = searchParams.get(param) ?? "";
  return (
    <input
      type="date"
      className="input h-[34px] text-[12.5px]"
      style={{ width, borderColor: value ? "var(--brand)" : undefined }}
      value={value}
      aria-label={label}
      onChange={(e) => setParam({ [param]: e.target.value || null })}
    />
  );
}

/* -------------------------------------------------------- BOTONES DE VISTA -- */

export function SegmentedControl({
  param,
  options,
  defaultValue,
}: {
  param: string;
  options: { value: string; label: string; icon?: React.ReactNode; guia?: string }[];
  defaultValue: string;
}) {
  const { setParam, searchParams } = useSetParam();
  const current = searchParams.get(param) ?? defaultValue;

  return (
    <div className="bg-surface3 inline-flex items-center gap-0.5 rounded-lg p-0.5">
      {options.map((o) => {
        const active = current === o.value;
        return (
          <button
            key={o.value}
            type="button"
            data-guia={o.guia}
            onClick={() => setParam({ [param]: o.value === defaultValue ? null : o.value })}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-[5px] text-[12px] font-semibold transition-all",
              active
                ? "bg-surface text-ink shadow-[var(--shadow-1)]"
                : "text-inkmuted hover:text-ink"
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------- FILTROS ACTIVOS -- */

export function ActiveFilters({
  labels,
}: {
  /** { nombreDelParametro: "etiqueta legible del valor actual" } */
  labels: Record<string, string>;
}) {
  const { setParam, searchParams } = useSetParam();
  const active = Object.entries(labels).filter(([key]) => searchParams.get(key));

  if (!active.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {active.map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => setParam({ [key]: null })}
          className="bg-brandsoft text-brand hover:opacity-80 inline-flex items-center gap-1.5 rounded-md px-2 py-[3px] text-[11.5px] font-semibold transition-opacity"
        >
          {label}
          <X size={11} />
        </button>
      ))}
      <button
        type="button"
        onClick={() => setParam(Object.fromEntries(active.map(([k]) => [k, null])))}
        className="text-inkmuted hover:text-ink px-1 text-[11.5px] font-medium transition-colors"
      >
        Limpiar todo
      </button>
    </div>
  );
}

/* ------------------------------------------------------------- PAGINACIÓN -- */

export function Pagination({
  page,
  pageCount,
  total,
  param = "pagina",
}: {
  page: number;
  pageCount: number;
  total: number;
  param?: string;
}) {
  const { setParam } = useSetParam();
  if (pageCount <= 1) return null;

  return (
    <div className="text-inkmuted mt-4 flex items-center justify-between gap-3 text-[12.5px]">
      <span>
        Página {page} de {pageCount} · {total} en total
      </span>
      <div className="flex gap-2">
        <button
          className="btn btn-sm"
          disabled={page <= 1}
          onClick={() => setParam({ [param]: String(page - 1) })}
        >
          Anterior
        </button>
        <button
          className="btn btn-sm"
          disabled={page >= pageCount}
          onClick={() => setParam({ [param]: String(page + 1) })}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}
