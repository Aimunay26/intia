"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Shapes } from "lucide-react";

import { guardarCompatibilidad } from "@/app/actions/archetypes";
import { FIT_SCORES, STRUCTURE_CATEGORIES, STRUCTURE_CATEGORY_MAP } from "@/lib/constants";
import { cn, withAlpha } from "@/lib/utils";
import { Badge, EmptyState } from "@/components/ui";

export type FitRow = {
  structureId: string;
  name: string;
  category: string;
  family: string | null;
  summary: string | null;
  score: number | null;
  notes: string;
};

type Estado = { score: number | null; notes: string };

/**
 * La matriz: una fila por estructura activa, cuatro botones de puntuación.
 * Cada cambio guarda al momento. Este es el filtro que evita darle a alguien
 * un formato que no va con su branding.
 */
export function FitMatrix({
  archetypeId,
  rows,
  canEdit,
}: {
  archetypeId: string;
  rows: FitRow[];
  canEdit: boolean;
}) {
  const [estado, setEstado] = useState<Record<string, Estado>>(() =>
    Object.fromEntries(rows.map((r) => [r.structureId, { score: r.score, notes: r.notes }]))
  );
  const [guardando, setGuardando] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const guardar = (structureId: string, next: Estado) => {
    if (next.score === null) return;
    setEstado((prev) => ({ ...prev, [structureId]: next }));
    setGuardando(structureId);

    const fd = new FormData();
    fd.set("archetypeId", archetypeId);
    fd.set("structureId", structureId);
    fd.set("score", String(next.score));
    fd.set("notes", next.notes);

    startTransition(async () => {
      await guardarCompatibilidad(fd);
      setGuardando(null);
    });
  };

  if (!rows.length) {
    return (
      <div className="card">
        <EmptyState
          icon={<Shapes size={19} />}
          title="No hay estructuras activas"
          description="La matriz se arma con las estructuras activas. Crea o reactiva alguna en la sección Estructuras y vuelve aquí a marcar la compatibilidad."
        />
      </div>
    );
  }

  const sinEvaluar = rows.filter((r) => estado[r.structureId]?.score === null).length;

  const categorias = [
    ...STRUCTURE_CATEGORIES.map((c) => ({
      value: c.value,
      label: c.label,
      description: c.description,
      rows: rows.filter((r) => r.category === c.value),
    })),
    {
      value: "OTRA",
      label: "Sin categoría",
      description: undefined,
      rows: rows.filter((r) => !STRUCTURE_CATEGORY_MAP[r.category]),
    },
  ].filter((g) => g.rows.length > 0);

  return (
    <div className="space-y-4">
      {/* Resumen por nivel */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        {FIT_SCORES.map((f) => {
          const total = rows.filter((r) => estado[r.structureId]?.score === f.value).length;
          return (
            <div
              key={f.value}
              className="card p-3"
              style={{ boxShadow: `inset 3px 0 0 0 ${f.hex}, var(--shadow-1)` }}
            >
              <div className="text-[20px] leading-none font-bold" style={{ color: f.hex }}>
                {total}
              </div>
              <div className="text-inkmuted mt-1.5 text-[11.5px] leading-tight font-semibold">
                {f.label}
              </div>
            </div>
          );
        })}
        <div className="card p-3">
          <div className="text-inkmuted text-[20px] leading-none font-bold">{sinEvaluar}</div>
          <div className="text-inkmuted mt-1.5 text-[11.5px] leading-tight font-semibold">
            Sin evaluar
          </div>
        </div>
      </div>

      {categorias.map((grupo) => (
        <div key={grupo.value} className="card overflow-hidden">
          <div className="card-hd">
            <div className="min-w-0">
              <div className="card-title flex items-center gap-2">
                <Badge
                  option={STRUCTURE_CATEGORY_MAP[grupo.value]}
                  fallback={grupo.label}
                />
                <span className="text-inkmuted font-normal">
                  {grupo.rows.length}{" "}
                  {grupo.rows.length === 1 ? "estructura" : "estructuras"}
                </span>
              </div>
              {grupo.description ? (
                <div className="card-sub mt-0.5">{grupo.description}</div>
              ) : null}
            </div>
          </div>

          <ul className="divide-line divide-y">
            {grupo.rows.map((row) => {
              const actual = estado[row.structureId] ?? { score: null, notes: "" };
              const opcion = FIT_SCORES.find((f) => f.value === actual.score);

              return (
                <li key={row.structureId} className="hover:bg-surface2 p-4 transition-colors">
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="min-w-0">
                      <div className="text-ink flex items-center gap-2 text-[13px] font-semibold">
                        {row.name}
                        {row.family ? (
                          <span className="chip chip-plain">{row.family}</span>
                        ) : null}
                        {guardando === row.structureId ? (
                          <Loader2 size={12} className="spin text-inkmuted" />
                        ) : null}
                      </div>
                      {row.summary ? (
                        <p className="text-inkmuted mt-1 text-[12px] leading-relaxed">
                          {row.summary}
                        </p>
                      ) : null}
                    </div>

                    {canEdit ? (
                      <div className="bg-surface3 flex flex-wrap items-center gap-1 rounded-lg p-1 lg:justify-end">
                        {FIT_SCORES.map((f) => {
                          const activo = actual.score === f.value;
                          return (
                            <button
                              key={f.value}
                              type="button"
                              onClick={() =>
                                guardar(row.structureId, { score: f.value, notes: actual.notes })
                              }
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-[6px] text-[11.5px] font-semibold transition-colors",
                                !activo && "text-inkmuted hover:text-ink"
                              )}
                              style={
                                activo
                                  ? {
                                      background: withAlpha(f.hex, 0.16),
                                      color: f.hex,
                                      boxShadow: `inset 0 0 0 1.5px ${withAlpha(f.hex, 0.45)}`,
                                    }
                                  : undefined
                              }
                            >
                              {activo ? <Check size={11} strokeWidth={3} /> : null}
                              {f.label}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="lg:text-right">
                        {opcion ? (
                          <span
                            className="inline-flex items-center rounded-md px-2 py-[3px] text-[11.5px] font-semibold"
                            style={{
                              background: withAlpha(opcion.hex, 0.14),
                              color: opcion.hex,
                            }}
                          >
                            {opcion.label}
                          </span>
                        ) : (
                          <span className="chip chip-plain">Sin evaluar</span>
                        )}
                      </div>
                    )}
                  </div>

                  {canEdit ? (
                    <input
                      className="input mt-2.5 h-8 text-[12.5px]"
                      defaultValue={row.notes}
                      placeholder="Notas: por qué encaja o por qué no (se le pasa a la IA)…"
                      disabled={actual.score === null}
                      onBlur={(e) => {
                        const notes = e.target.value.trim();
                        if (notes === (actual.notes ?? "")) return;
                        guardar(row.structureId, { score: actual.score, notes });
                      }}
                    />
                  ) : actual.notes ? (
                    <p className="text-inksoft mt-2 text-[12px] leading-relaxed">{actual.notes}</p>
                  ) : null}

                  {canEdit && actual.score === null ? (
                    <p className="text-inkmuted mt-1.5 text-[11px]">
                      Marca primero una puntuación para poder anotar el porqué.
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
