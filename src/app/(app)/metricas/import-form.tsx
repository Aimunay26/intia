"use client";

import { ChevronDown, FileSpreadsheet, Upload } from "lucide-react";
import { useActionState, useState, useEffect } from "react";

import { importarMetricasCsv, continuarImportacion, misImportaciones, type ImportState } from "@/app/actions/metrics";
import { CopyButton, SubmitButton } from "@/components/forms";
import { Callout, Field } from "@/components/ui";
import { cn } from "@/lib/utils";

/** Columnas que entiende el importador, en el orden recomendado. */
const COLUMNAS: { name: string; help: string; required?: boolean }[] = [
  { name: "semana", help: "Lunes: 2026-09-07 o 07/09/2026", required: true },
  { name: "plataforma", help: "TIKTOK, INSTAGRAM, FACEBOOK, YOUTUBE, WHATSAPP u OTRO", required: true },
  { name: "video", help: "El id del video o su título exacto", required: true },
  { name: "vistas", help: "Reproducciones de esa semana" },
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
  "semana,plataforma,video,vistas,likes,comentarios,compartidos,guardados,alcance,clics,leads,pedidos,inversion,ingresos,retencion",
  "2026-08-10,TIKTOK,Rutina de noche en 30 segundos,18420,940,63,120,310,22100,180,12,4,45,320,62",
  "2026-08-17,TIKTOK,Rutina de noche en 30 segundos,9310,410,22,48,150,11800,90,5,2,45,180,58",
  "17/08/2026,INSTAGRAM,cm7k2xq9v0001abcd,4120,210,9,17,60,5300,41,2,1,0,0,47",
].join("\n");

/**
 * Importador de métricas por CSV pegado.
 * Está plegado por defecto: se abre solo cuando alguien lo necesita.
 */
export function ImportForm() {
  const [open, setOpen] = useState(false);
  const [requestKey, setRequestKey] = useState("");
  const [progress, setProgress] = useState<ImportState | undefined>(undefined);
  const [failure, setFailure] = useState("");
  const [pendingBatches, setPendingBatches] = useState<Awaited<ReturnType<typeof misImportaciones>>>([]);
  const [result, formAction, submitting] = useActionState<ImportState, FormData>(async (previous, form) => {
    setFailure(""); setProgress(undefined);
    try { return await importarMetricasCsv(previous, form); }
    catch { setFailure("No se confirmó la respuesta. Puedes reenviar el mismo lote para recuperar su avance."); return previous; }
  }, null);
  const state = progress === undefined ? result : progress;
  useEffect(() => { setRequestKey(crypto.randomUUID()); }, []);
  useEffect(() => { if (open) misImportaciones().then(setPendingBatches).catch(() => setFailure("No se pudieron consultar los lotes pendientes.")); }, [open]);
  useEffect(() => {
    if (!state?.pending || !state.batchId || failure || submitting) return;
    let stopped = false;
    const id = state.batchId;
    const timer = setTimeout(async () => {
      try { const next = await continuarImportacion(id); if (!stopped) setProgress(next); }
      catch { if (!stopped) setFailure("La importación se detuvo. Lo confirmado se conserva; usa Reanudar."); }
    }, 250);
    return () => { stopped = true; clearTimeout(timer); };
  }, [state, failure, submitting]);
  async function resume(id: string) {
    setFailure("");
    try { setProgress(await continuarImportacion(id)); }
    catch { setFailure("No se pudo reanudar. Revisa tus permisos e inténtalo de nuevo."); }
  }
  const ignoradas = state?.ignored ?? [];
  function downloadIssues() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(ignoradas, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "incidencias-" + (state?.batchId ?? "csv") + ".json"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

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
            Una fila por video, plataforma y semana. Carga solo lo obtenido esa semana, sin acumulados.
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
            <form action={formAction} className="min-w-0"><input type="hidden" name="requestKey" value={requestKey} />
              {state?.batchId && <p role="status">Lote {state.batchId} · {state.processed}/{state.total} filas</p>}
              {failure && <p role="alert">{failure}</p>}
              {failure && state?.batchId && <button type="button" className="btn" onClick={() => resume(state.batchId!)}>Reanudar</button>}
              {pendingBatches.filter(b => b.id !== state?.batchId).map(b => <button type="button" className="btn" key={b.id} onClick={() => resume(b.id)}>Reanudar lote {b.id} ({b.processed}/{b.total})</button>)}
              {state && !state.pending && !state.error && <button type="button" className="btn" onClick={() => { setRequestKey(crypto.randomUUID()); setProgress(null); }}>Iniciar un lote nuevo</button>}
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
                  name="csv" disabled={!requestKey || Boolean(state?.pending)}
                  rows={10}
                  className="textarea input-mono"
                  placeholder={"fecha,video,vistas,likes…\n2026-08-14,Rutina de noche en 30 segundos,18420,940…"}
                  spellCheck={false}
                  required
                />
              </Field>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <SubmitButton
                  className="btn btn-primary" disabled={!requestKey || Boolean(state?.pending)}
                  icon={<Upload size={14} />}
                  pendingLabel="Importando…"
                >
                  Importar filas
                </SubmitButton>
                <span className="text-inkmuted text-[11.5px]">
                  Hasta 500 filas. Columnas ausentes o celdas vacías conservan el dato existente; escribe 0 para ponerlo en cero. Cada cambio queda registrado. Retención se expresa de 0 a 100; 0 es un dato válido. Un campo vacío conserva el valor existente.
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
                  <Callout tone="ok" title={state.pending ? "Importación en curso" : "Importación terminada"}>
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
                    <button type="button" className="btn btn-sm" onClick={downloadIssues}>Descargar todas las incidencias</button>
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
                demás conservan su valor si faltan o están vacías; escribe 0 para reemplazarlo
                por cero. Incluye al menos un dato para actualizar. Se informa de las columnas
                desconocidas y de las filas con problemas. Usa una línea por registro.
              </p>
            </aside>
          </div>
        </div>
      ) : null}
    </div>
  );
}
