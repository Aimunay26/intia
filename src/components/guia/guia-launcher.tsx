"use client";

import { Compass, Play, Sparkles } from "lucide-react";
import { useGuia } from "./guia-context";
import { cn } from "@/lib/utils";

/**
 * Botón para lanzar o reiniciar la guía interactiva desde cualquier pantalla.
 */
export function GuiaLauncherBoton({
  label = "Iniciar guía interactiva",
  className = "btn btn-primary",
  moduloIdx = 0,
  pasoIdx = 0,
  icon,
}: {
  label?: string;
  className?: string;
  moduloIdx?: number;
  pasoIdx?: number;
  icon?: React.ReactNode;
}) {
  const { iniciarGuia } = useGuia();

  return (
    <button
      type="button"
      onClick={() => iniciarGuia(moduloIdx, pasoIdx)}
      className={className}
    >
      {icon ?? <Play size={14} fill="currentColor" />}
      {label}
    </button>
  );
}

/**
 * Banner de bienvenida cuando el usuario vació los datos de ejemplo o no tiene marcas.
 */
export function GuiaBienvenidaBanner({
  className,
}: {
  className?: string;
}) {
  const { iniciarGuia } = useGuia();

  return (
    <div
      className={cn(
        "border-brand/30 bg-gradient-to-r from-brand/10 via-brandsoft to-transparent text-ink mb-6 rounded-xl border p-4.5 shadow-sm",
        className
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="bg-brand text-brand-ink mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm">
            <Sparkles size={18} />
          </span>
          <div>
            <h3 className="text-ink text-[14.5px] font-bold">
              ¿Listo para configurar tu primera marca real?
            </h3>
            <p className="text-inksoft mt-0.5 text-[12.5px] leading-relaxed max-w-2xl">
              Hemos preparado un recorrido interactivo de 7 módulos con flechas animadas que te guía
              paso a paso: desde crear tu marca y su ADN hasta generar tu primer guion con IA y unirlo
              a un video para rodaje.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => iniciarGuia(0, 0)}
          className="btn btn-primary shrink-0 self-start sm:self-center shadow-md hover:scale-102 transition-transform"
        >
          <Compass size={15} />
          Iniciar recorrido guiado
        </button>
      </div>
    </div>
  );
}
