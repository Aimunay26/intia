"use client";

import { useState, useTransition } from "react";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  FileUp,
  FileType,
  Loader2,
  Palette,
  Sparkles,
  UploadCloud,
  UserCheck,
  UserSquare2,
  X,
} from "lucide-react";

import { procesarInformeBranding, type ProcessBrandingResult } from "@/app/actions/branding-extractor";
import { Modal } from "@/components/forms";
import { cn } from "@/lib/utils";

export function CargadorBrandingModal({
  open,
  onClose,
  brandId,
  archetypeId,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  brandId?: string;
  archetypeId?: string;
  onSuccess?: (result: ProcessBrandingResult) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProcessBrandingResult | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleSubir = (tipo: "PERSONAL" | "BUSINESS") => {
    if (!file) {
      setError("Selecciona primero un archivo PDF con el informe de branding.");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("tipo", tipo);
        if (brandId) formData.append("brandId", brandId);
        if (archetypeId) formData.append("archetypeId", archetypeId);

        const res = await procesarInformeBranding(formData);
        setResult(res);
        if (onSuccess) onSuccess(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al procesar el archivo.");
      }
    });
  };

  const handleReset = () => {
    setFile(null);
    setError(null);
    setResult(null);
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        handleReset();
        onClose();
      }}
      title="Cargador de Branding Inteligente"
      description="Sube el PDF de tu informe de branding (Yoryo, Piero, Eru o corporativo) para autocompletar todo al instante."
      width={580}
    >
      <div className="space-y-4">
        {/* Resultado Exitoso */}
        {result ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-ink">
              <div className="flex items-center gap-2 font-semibold text-emerald-600 dark:text-emerald-400 text-[14px]">
                <CheckCircle2 size={18} />
                ¡Branding procesado y guardado con éxito!
              </div>
              <p className="mt-1.5 text-[13px] text-inkmuted leading-relaxed">
                {result.message}
              </p>
            </div>

            {/* Resumen de lo extraído */}
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-4 space-y-3 text-[12.5px]">
              <div className="font-bold text-ink flex items-center justify-between">
                <span>Resumen de datos detectados:</span>
                <span className="text-brand font-semibold">{result.parsed.name}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[12px]">
                <div>
                  <span className="text-inkmuted block">Tono de voz:</span>
                  <span className="text-ink line-clamp-2 font-medium">
                    {result.parsed.toneOfVoice}
                  </span>
                </div>
                <div>
                  <span className="text-inkmuted block">Público / Audiencia:</span>
                  <span className="text-ink line-clamp-2 font-medium">
                    {result.parsed.audience}
                  </span>
                </div>
              </div>

              {result.parsed.actorData && (
                <div className="border-t border-[var(--line)] pt-2.5">
                  <span className="text-inkmuted block text-[11.5px] font-semibold">
                    Perfil de Actor / Arquetipo vinculado:
                  </span>
                  <div className="mt-1 text-ink font-medium">
                    {result.parsed.actorData.archetypePrimary} · {result.parsed.actorData.archetypeSecondary} · {result.parsed.actorData.archetypeTertiary}
                  </div>
                </div>
              )}

              {result.parsed.palette.length > 0 && (
                <div className="border-t border-[var(--line)] pt-2.5 flex items-center gap-2">
                  <span className="text-inkmuted text-[11.5px]">Paleta:</span>
                  <div className="flex items-center gap-1.5">
                    {result.parsed.palette.slice(0, 5).map((c, i) => (
                      <span
                        key={i}
                        className="h-4 w-4 rounded-full border border-black/10 shadow-xs"
                        style={{ backgroundColor: c.hex }}
                        title={`${c.name}: ${c.hex}`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => {
                  handleReset();
                  onClose();
                  window.location.reload();
                }}
                className="btn btn-primary"
              >
                Listo, continuar
              </button>
            </div>
          </div>
        ) : (
          /* Zona de carga y selección */
          <div className="space-y-4">
            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-red-600 dark:text-red-400 text-[12.5px] flex items-start gap-2">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Dropzone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const dropped = e.dataTransfer.files?.[0];
                if (dropped && dropped.name.endsWith(".pdf")) {
                  setFile(dropped);
                  setError(null);
                } else {
                  setError("Por favor suelta un archivo en formato PDF.");
                }
              }}
              className={cn(
                "relative rounded-xl border-2 border-dashed p-6 text-center transition-all cursor-pointer",
                dragOver
                  ? "border-[var(--brand)] bg-[var(--brand)]/10"
                  : file
                  ? "border-emerald-500/60 bg-emerald-500/5"
                  : "border-[var(--line)] hover:border-[var(--brand)]/50 bg-[var(--surface-2)]/50"
              )}
              onClick={() => {
                const input = document.getElementById("branding-pdf-input");
                input?.click();
              }}
            >
              <input
                id="branding-pdf-input"
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => {
                  const sel = e.target.files?.[0];
                  if (sel) {
                    setFile(sel);
                    setError(null);
                  }
                }}
              />

              {file ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="h-12 w-12 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 grid place-items-center">
                    <FileType size={24} />
                  </div>
                  <div className="font-bold text-ink text-[14px]">{file.name}</div>
                  <div className="text-[12px] text-inkmuted">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB · Listo para procesar
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                    }}
                    className="mt-1 text-[12px] text-danger hover:underline"
                  >
                    Cambiar archivo
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="h-12 w-12 rounded-full bg-[var(--brand)]/10 text-[var(--brand)] grid place-items-center">
                    <UploadCloud size={24} />
                  </div>
                  <div className="font-semibold text-ink text-[14px]">
                    Arrastra aquí tu PDF de branding o haz clic para seleccionarlo
                  </div>
                  <p className="text-[12px] text-inkmuted max-w-sm">
                    Compatible con informes de arquetipos (Yoryo, Piero, Eru) y manuales de identidad corporativa.
                  </p>
                </div>
              )}
            </div>

            {/* Los 2 botones obligatorios solicitados */}
            <div className="space-y-2.5 pt-1">
              <div className="text-[12px] font-bold text-ink tracking-wide uppercase">
                ¿Qué tipo de branding contiene este archivo?
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Botón 1: Marca Personal */}
                <button
                  type="button"
                  disabled={!file || isPending}
                  onClick={() => handleSubir("PERSONAL")}
                  className={cn(
                    "flex flex-col items-start gap-1.5 p-3.5 rounded-xl border text-left transition-all",
                    !file
                      ? "opacity-50 cursor-not-allowed border-[var(--line)] bg-[var(--surface-2)]"
                      : "border-purple-500/40 bg-purple-500/5 hover:border-purple-500 hover:bg-purple-500/10 cursor-pointer shadow-xs"
                  )}
                >
                  <div className="flex items-center gap-2 font-bold text-purple-600 dark:text-purple-400 text-[13.5px]">
                    <UserSquare2 size={16} />
                    Marca Personal
                  </div>
                  <p className="text-[11.5px] text-inkmuted leading-snug">
                    Para actores, creadores o fundadores. <strong>Carga el perfil de Marca y de Actor al mismo tiempo</strong>.
                  </p>
                </button>

                {/* Botón 2: Marca de Negocio */}
                <button
                  type="button"
                  disabled={!file || isPending}
                  onClick={() => handleSubir("BUSINESS")}
                  className={cn(
                    "flex flex-col items-start gap-1.5 p-3.5 rounded-xl border text-left transition-all",
                    !file
                      ? "opacity-50 cursor-not-allowed border-[var(--line)] bg-[var(--surface-2)]"
                      : "border-blue-500/40 bg-blue-500/5 hover:border-blue-500 hover:bg-blue-500/10 cursor-pointer shadow-xs"
                  )}
                >
                  <div className="flex items-center gap-2 font-bold text-blue-600 dark:text-blue-400 text-[13.5px]">
                    <Building2 size={16} />
                    Marca de Negocio
                  </div>
                  <p className="text-[11.5px] text-inkmuted leading-snug">
                    Para empresas, tiendas o servicios corporativos sin un actor o rostro único protagonista.
                  </p>
                </button>
              </div>
            </div>

            {isPending && (
              <div className="flex items-center justify-center gap-2 py-3 text-[13px] text-brand font-medium">
                <Loader2 size={16} className="spin" />
                Extrayendo texto y auto-rellenando datos de branding...
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

export function BotonCargarBranding({
  brandId,
  archetypeId,
  className = "btn btn-sm",
  label = "Cargar branding desde PDF",
  onSuccess,
  dataGuia,
  ...props
}: {
  brandId?: string;
  archetypeId?: string;
  className?: string;
  label?: string;
  onSuccess?: (result: ProcessBrandingResult) => void;
  dataGuia?: string;
  "data-guia"?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        data-guia={dataGuia ?? props["data-guia"]}
        onClick={() => setOpen(true)}
        className={cn("inline-flex items-center gap-1.5", className)}
        title="Subir informe de branding en PDF para autocompletar"
      >
        <Sparkles size={14} className="text-brand" />
        {label}
      </button>

      <CargadorBrandingModal
        open={open}
        onClose={() => setOpen(false)}
        brandId={brandId}
        archetypeId={archetypeId}
        onSuccess={onSuccess}
      />
    </>
  );
}
