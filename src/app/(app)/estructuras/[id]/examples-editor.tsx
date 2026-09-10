"use client";
import { EditForm, RevisionField } from "@/components/edit-form";

import {
	ChevronDown,
	ChevronRight,
	Plus,
	Save,
	Sparkles,
	Trash2,
	Trophy,
} from "lucide-react";
import { useState } from "react";

import { guardarEjemplos, type Example } from "@/app/actions/structures";
import { SubmitButton } from "@/components/forms";
import { Callout, EmptyState } from "@/components/ui";
import { formatNumber, truncate } from "@/lib/utils";

type Row = Example & { key: string };

let contador = 0;
const nuevaKey = () => `ejemplo-${Date.now().toString(36)}-${contador++}`;

/** Deja solo los ejemplos con texto y con los campos recortados. */
function limpiar(items: Example[]): Example[] {
  return items
    .filter((e) => e.text.trim().length > 0)
    .map((e) => ({ title: e.title.trim() || "Ejemplo sin título", text: e.text.trim() }));
}

/**
 * Ejemplos ganadores: guiones reales que ya funcionaron con este formato.
 * La IA los usa como referencia de ritmo, no como texto a copiar.
 */
export function ExamplesEditor({
  structureId,
  updatedAt,
  examples,
  canEdit,
}: {
  structureId: string;
  updatedAt: string;
  examples: Example[];
  canEdit: boolean;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    examples.map((e) => ({ ...e, key: nuevaKey() }))
  );
  const [abiertos, setAbiertos] = useState<string[]>([]);

  const inicial = JSON.stringify(limpiar(examples));
  const limpios = limpiar(rows);
  const serializado = JSON.stringify(limpios);
  const sucio = serializado !== inicial;

  const alternar = (key: string) =>
    setAbiertos((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const editar = (key: string, cambio: Partial<Example>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...cambio } : r)));

  const eliminar = (key: string) => setRows((prev) => prev.filter((r) => r.key !== key));

  const anadir = () => {
    const key = nuevaKey();
    setRows((prev) => [...prev, { key, title: "", text: "" }]);
    setAbiertos((prev) => [...prev, key]);
  };

  return (
    <EditForm action={guardarEjemplos} className="card">
<RevisionField value={updatedAt} />
      <input type="hidden" name="id" value={structureId} />
      <input type="hidden" name="examples" value={serializado} />

      <div className="card-hd">
        <div className="min-w-0">
          <div className="card-title flex items-center gap-2">
            <Trophy size={14} className="text-inkmuted" />
            Ejemplos ganadores
          </div>
          <div className="card-sub mt-0.5">
            Guiones reales que ya funcionaron con este formato.
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {sucio ? <span className="chip chip-plain">Sin guardar</span> : null}
          <span className="chip chip-plain">
            {limpios.length} {limpios.length === 1 ? "ejemplo" : "ejemplos"}
          </span>
        </div>
      </div>

      <div className="border-line border-b p-4">
        <Callout tone="info" title="Cómo los usa la IA">
          Al generar un guion, estos textos se le pasan al modelo con una instrucción clara:
          <strong> estudia el esqueleto, no el contenido</strong>. Debe producir una variante
          nueva con el mismo ritmo emocional pero otra situación, otros objetos y otras
          palabras. Copiar textualmente un ejemplo está prohibido en el prompt.
        </Callout>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Sparkles size={19} />}
          title="Todavía no hay ejemplos"
          description="Pega aquí uno o dos guiones que ya reventaron con este formato. Es la referencia más potente que puedes darle a la IA: le enseña el ritmo real de tu equipo."
          action={
            canEdit ? (
              <button type="button" className="btn btn-primary" onClick={anadir}>
                <Plus size={14} /> Añadir el primer ejemplo
              </button>
            ) : undefined
          }
        />
      ) : (
        <ul className="divide-line divide-y">
          {rows.map((row, i) => {
            const abierto = abiertos.includes(row.key);
            return (
              <li key={row.key} className="p-3">
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon mt-0.5 h-[30px] w-[26px] shrink-0"
                    onClick={() => alternar(row.key)}
                    aria-label={abierto ? "Contraer ejemplo" : "Abrir ejemplo"}
                  >
                    {abierto ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  </button>

                  <div className="min-w-0 flex-1">
                    <input
                      className="input h-[34px] text-[13px] font-semibold"
                      value={row.title}
                      disabled={!canEdit}
                      placeholder={`Ejemplo ${i + 1}: cómo lo llaman en el equipo`}
                      onChange={(e) => editar(row.key, { title: e.target.value })}
                      aria-label={`Título del ejemplo ${i + 1}`}
                    />

                    {abierto ? (
                      <div className="mt-2">
                        <textarea
                          className="textarea input-mono"
                          rows={12}
                          value={row.text}
                          disabled={!canEdit}
                          placeholder="Pega el guion completo tal como se grabó: lo que se dice, lo que se ve, el giro y el cierre."
                          onChange={(e) => editar(row.key, { text: e.target.value })}
                          aria-label={`Texto del ejemplo ${i + 1}`}
                        />
                        <div className="hint">
                          {formatNumber(row.text.length)} caracteres. Cuanto más fiel sea al
                          video real, mejor aprende el modelo el ritmo.
                        </div>
                      </div>
                    ) : (
                      <p className="text-inkmuted mt-1.5 text-[12.5px] leading-relaxed">
                        {row.text.trim()
                          ? truncate(row.text.replace(/\s+/g, " ").trim(), 170)
                          : "Sin texto todavía: ábrelo y pega el guion."}
                      </p>
                    )}
                  </div>

                  {canEdit ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon text-danger mt-0.5 h-[30px] w-[26px] shrink-0"
                      onClick={() => eliminar(row.key)}
                      title="Eliminar este ejemplo"
                      aria-label={`Eliminar el ejemplo ${i + 1}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {canEdit ? (
        <div className="border-line flex flex-wrap items-center justify-between gap-3 border-t p-3">
          <button type="button" className="btn btn-sm" onClick={anadir}>
            <Plus size={13} /> Añadir ejemplo
          </button>
          <SubmitButton
            className="btn btn-primary"
            icon={<Save size={14} />}
            pendingLabel="Guardando…"
            disabled={!sucio}
          >
            Guardar ejemplos
          </SubmitButton>
        </div>
      ) : null}
    </EditForm>
  );
}
