"use client";

import { useActionState, useState } from "react";
import { ChevronDown, FileSpreadsheet, Upload } from "lucide-react";

import { importarMetricasCsv, type ImportState } from "@/app/actions/metrics";
import { cn } from "@/lib/utils";
import { Callout, Field } from "@/components/ui";
import { CopyButton, SubmitButton } from "@/components/forms";

/** Columnas que entiende el importador, en el orden recomendado. */
const COLUMNAS: { name: string; help: string; required?: boolean }[] = [
  { name: "fecha", help: "2026-03-14 o 14/03/2026", required: true },
  { name: "video", help: "El id del video o su título exacto", required: true },
  { name: "vistas", help: "Reproducciones del día" },
  { name: "likes", help: "Me gusta" },
  { name: "comentarios", help: "Comentarios recibidos" },
  { name: "compartidos", help: "Veces que se compartió" },
  { name: "guardados", help: "Veces que se guardó" },
  { name: "alcance", help: "Cuentas alcanzadas" },
  { name: "clics", help: "Clics al enlace" },
  { name: "leads", help: "Contactos conseguidos" },
  { name: "pedidos", help: "Pedidos cerrados" },
  { name: "inversion", help: "Lo gastado en pauta" },
  { name: "ingresos", help: "Lo facturado" },
  { name: "retencion", help: "% que pasa de 3 segundos" },
];

const EJEMPLO = [
  "fecha,video,vistas,likes,comentarios,compartidos,guardados,alcance,clics,leads,pedidos,inversion,ingresos,retencion",
  "2026-08-14,Rutina de noche en 30 segundos,18420,940,63,120,310,22100,180,12,4,45,320,62",
  "2026-08-15,Rutina de noche en 30 segundos,9310,410,22,48,150,11800,90,5,2,45,180,58",
  "15/08/2026,cm7k2xq9v0001abcd,4120,210,9,17,60,5300,41,2,1,0,0,47",
].join("\n");

/**
 * Importador de métricas por CSV pegado.
 * Está plegado por defecto: se abre solo cuando alguien lo necesita.
 */
export function ImportForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ImportState, FormData>(importarMetricasCsv, null);
  const ignoradas = state?.ignored ?? [];

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="hover:bg-surface2 flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors"
        aria-expanded={open}
      >
        <span className="bg-brandsoft text-brand flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
          <FileSpreadsheet size={14} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-ink block text-[13px] font-semibold">
            Importar métricas desde un CSV
          </span>
          <span className="text-inkmuted block text-[12px] leading-snug">
            Pega lo que exportaste de TikTok, Instagram o Meta Ads y se reparte en cada video.
          </span>
        </span>
        <ChevronDown
          size={16}
          className={cn("text-inkmuted shrink-0 transition-transform", open && "rotate-180")}
        />
      </button>

      {open ? (
        <div className="border-line fade-in border-t p-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <form action={formAction} className="min-w-0">
              <div className="border-line bg-surface2 mb-3 overflow-hidden rounded-lg border">
                <div className="border-line flex items-center justify-between gap-3 border-b px-3 py-2">
                  <span className="text-inkmuted text-[11px] font-bold tracking-[0.09em] uppercase">
                    Así se ve un CSV válido
                  </span>
                  <CopyButton text={EJEMPLO} label="Copiar ejemplo" className="btn btn-sm" />
                </div>
                <pre className="text-inksoft overflow-x-auto px-3 py-2.5 font-mono text-[11px] leading-[1.7]">
                  {EJEMPLO}
                </pre>
              </div>

              <Field
                label="Filas del CSV"
                hint="Primera línea = cabecera con los nombres de las columnas. El separador puede ser coma o punto y coma, y las fechas van como 2026-03-14 o 14/03/2026."
              >
                <textarea
                  name="csv"
                  rows={10}
                  className="textarea input-mono"
                  placeholder={"fecha,video,vistas,likes…\n2026-08-14,Rutina de noche en 30 segundos,18420,940…"}
                  spellCheck={false}
                  required
                />
              </Field>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <SubmitButton
                  className="btn btn-primary"
                  icon={<Upload size={14} />}
                  pendingLabel="Importando…"
                >
                  Importar filas
                </SubmitButton>
                <span className="text-inkmuted text-[11.5px]">
                  Volver a importar el mismo video y la misma fecha actualiza la fila, no la duplica.
                </span>
              </div>

              {state?.error ? (
                <div className="mt-3">
                  <Callout tone="danger" title="No se pudo importar">
                    {state.error}
                  </Callout>
                </div>
              ) : null}

              {state?.ok ? (
                <div className="mt-3">
                  <Callout tone="ok" title="Importación terminada">
                    {state.ok}
                  </Callout>
                </div>
              ) : null}

              {ignoradas.length > 0 ? (
                <div className="mt-3">
                  <Callout
                    tone="warn"
                    title={`${ignoradas.length} ${
                      ignoradas.length === 1 ? "fila ignorada" : "filas ignoradas"
                    }`}
                  >
                    <ul className="mt-1 space-y-2">
                      {ignoradas.slice(0, 25).map((row, i) => (
                        <li key={i} className="min-w-0">
                          <div className="text-ink text-[12.5px] font-semibold">
                            Línea {row.line}: {row.reason}
                          </div>
                          <div className="text-inkmuted mt-0.5 truncate font-mono text-[11.5px]">
                            {row.preview}
                          </div>
                        </li>
                      ))}
                    </ul>
                    {ignoradas.length > 25 ? (
                      <div className="text-inkmuted mt-2 text-[11.5px]">
                        …y {ignoradas.length - 25} más con problemas parecidos.
                      </div>
                    ) : null}
                  </Callout>
                </div>
              ) : null}
            </form>

            <aside className="min-w-0">
              <div className="text-inkmuted mb-2 text-[11px] font-bold tracking-[0.09em] uppercase">
                Columnas que entiende
              </div>
              <ul className="border-line divide-line divide-y overflow-hidden rounded-lg border">
                {COLUMNAS.map((c) => (
                  <li
                    key={c.name}
                    className="bg-surface2 flex items-baseline justify-between gap-3 px-2.5 py-[6px]"
                  >
                    <span className="text-ink shrink-0 font-mono text-[11.5px] font-semibold">
                      {c.name}
                      {c.required ? <span className="text-danger">*</span> : null}
                    </span>
                    <span className="text-inkmuted min-w-0 truncate text-right text-[11px]">
                      {c.help}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-inkmuted mt-2.5 text-[11.5px] leading-relaxed">
                Solo <span className="text-inksoft font-semibold">fecha</span> y{" "}
                <span className="text-inksoft font-semibold">video</span> son obligatorias. Las
                demás pueden faltar o venir vacías: se guardan como 0. Las columnas que no
                reconozco se ignoran sin romper nada, y cualquier fila con problemas se reporta
                con su número de línea.
              </p>
            </aside>
          </div>
        </div>
      ) : null}
    </div>
  );
}
