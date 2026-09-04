"use client";

import { useEffect, useState, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Compass,
  ExternalLink,
  Minimize2,
  Sparkles,
  X,
} from "lucide-react";
import { useGuia } from "./guia-context";
import { cn } from "@/lib/utils";

type Rect = {
  top: number;
  left: number;
  width: number;
  height: number;
  bottom: number;
  right: number;
};

// Hook simple para saber si está montado en cliente
function useMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

export function GuiaOverlay() {
  const mounted = useMounted();
  const {
    activo,
    moduloActual,
    pasoActual,
    moduloIndex,
    pasoIndex,
    totalModulos,
    totalPasosModulo,
    minimizado,
    siguientePaso,
    pasoAnterior,
    cerrarGuia,
    minimizarGuia,
    restaurarGuia,
    navegarAPasoActual,
  } = useGuia();

  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [encontrado, setEncontrado] = useState(false);
  const [cardPos, setCardPos] = useState<{ top: number; left: number }>({ top: 120, left: 120 });
  const [flecha, setFlecha] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    dir: "top" | "bottom" | "left" | "right";
  } | null>(null);

  const cardRef = useRef<HTMLDivElement>(null);

  // Búsqueda y seguimiento continuo del elemento objetivo visible en el DOM
  useEffect(() => {
    if (!activo || minimizado || !pasoActual) {
      setTargetRect(null);
      setEncontrado(false);
      return;
    }

    const buscarElemento = () => {
      const candidates = Array.from(
        document.querySelectorAll(`[data-guia="${pasoActual.target}"]`)
      );

      // Filtrar por visibilidad real (evita menús móviles ocultos con display:none o tamaño 0)
      const visible = candidates.find((el) => {
        const r = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return (
          r.width > 0 &&
          r.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          style.opacity !== "0"
        );
      });

      if (visible) {
        const r = visible.getBoundingClientRect();
        setTargetRect({
          top: r.top,
          left: r.left,
          width: r.width,
          height: r.height,
          bottom: r.bottom,
          right: r.right,
        });
        setEncontrado(true);

        // Si el elemento está fuera de pantalla, hacer scroll suave hacia él
        const enPantalla =
          r.top >= 0 &&
          r.left >= 0 &&
          r.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
          r.right <= (window.innerWidth || document.documentElement.clientWidth);

        if (!enPantalla) {
          visible.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
        }
      } else {
        setTargetRect(null);
        setEncontrado(false);
      }
    };

    buscarElemento();

    // Rastrear scroll y redimensionado
    window.addEventListener("scroll", buscarElemento, true);
    window.addEventListener("resize", buscarElemento);

    // Polling ligero para atrapar aperturas de modales o transiciones
    const timer = setInterval(buscarElemento, 400);

    return () => {
      window.removeEventListener("scroll", buscarElemento, true);
      window.removeEventListener("resize", buscarElemento);
      clearInterval(timer);
    };
  }, [activo, minimizado, pasoActual]);

  // Cálculo de la posición del Card flotante y de la flecha vectorial
  useEffect(() => {
    if (!activo || minimizado) return;

    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const cardW = 380;
    const cardH = 240;
    const margen = 24;

    // Si el elemento no está en pantalla, centrar el card
    if (!targetRect || !encontrado) {
      setCardPos({
        top: Math.max(80, (viewportH - cardH) / 2),
        left: Math.max(16, (viewportW - cardW) / 2),
      });
      setFlecha(null);
      return;
    }

    // Hay elemento: posicionar la tarjeta estratégicamente
    let top = 100;
    let left = 100;
    let dir: "top" | "bottom" | "left" | "right" = "bottom";

    const targetCenterY = targetRect.top + targetRect.height / 2;
    const targetCenterX = targetRect.left + targetRect.width / 2;

    const preferida = pasoActual.posicionPreferida || "auto";

    // Decidir posición considerando límites de la pantalla
    if (preferida === "right" && targetRect.right + cardW + margen < viewportW) {
      dir = "right";
      top = Math.max(margen, Math.min(viewportH - cardH - margen, targetCenterY - cardH / 2));
      left = targetRect.right + margen;
    } else if (preferida === "left" && targetRect.left - cardW - margen > 0) {
      dir = "left";
      top = Math.max(margen, Math.min(viewportH - cardH - margen, targetCenterY - cardH / 2));
      left = targetRect.left - cardW - margen;
    } else if (preferida === "top" && targetRect.top - cardH - margen > 0) {
      dir = "top";
      top = targetRect.top - cardH - margen;
      left = Math.max(margen, Math.min(viewportW - cardW - margen, targetCenterX - cardW / 2));
    } else if (targetRect.bottom + cardH + margen < viewportH) {
      dir = "bottom";
      top = targetRect.bottom + margen;
      left = Math.max(margen, Math.min(viewportW - cardW - margen, targetCenterX - cardW / 2));
    } else if (targetRect.top - cardH - margen > 0) {
      dir = "top";
      top = targetRect.top - cardH - margen;
      left = Math.max(margen, Math.min(viewportW - cardW - margen, targetCenterX - cardW / 2));
    } else if (targetRect.right + cardW + margen < viewportW) {
      dir = "right";
      top = Math.max(margen, Math.min(viewportH - cardH - margen, targetCenterY - cardH / 2));
      left = targetRect.right + margen;
    } else {
      dir = "left";
      top = Math.max(margen, Math.min(viewportH - cardH - margen, targetCenterY - cardH / 2));
      left = Math.max(margen, targetRect.left - cardW - margen);
    }

    setCardPos({ top, left });

    // Cálculo de puntos de inicio y fin para la flecha SVG
    let x1 = 0;
    let y1 = 0;
    let x2 = 0;
    let y2 = 0;

    if (dir === "bottom") {
      // Tarjeta está abajo del objetivo: flecha sube hacia el objetivo
      x1 = left + cardW / 2;
      y1 = top;
      x2 = targetCenterX;
      y2 = targetRect.bottom + 4;
    } else if (dir === "top") {
      // Tarjeta está arriba del objetivo: flecha baja hacia el objetivo
      x1 = left + cardW / 2;
      y1 = top + cardH;
      x2 = targetCenterX;
      y2 = targetRect.top - 4;
    } else if (dir === "right") {
      // Tarjeta está a la derecha: flecha va hacia la izquierda
      x1 = left;
      y1 = top + cardH / 2;
      x2 = targetRect.right + 4;
      y2 = targetCenterY;
    } else {
      // Tarjeta está a la izquierda: flecha va hacia la derecha
      x1 = left + cardW;
      y1 = top + cardH / 2;
      x2 = targetRect.left - 4;
      y2 = targetCenterY;
    }

    setFlecha({ x1, y1, x2, y2, dir });
  }, [targetRect, encontrado, pasoActual, activo, minimizado]);

  if (!mounted || !activo) return null;

  // Render del Widget Minimizado
  if (minimizado) {
    return createPortal(
      <div className="fixed right-5 bottom-5 z-[9999] animate-bounce-short">
        <button
          onClick={restaurarGuia}
          className="btn btn-primary flex items-center gap-2 rounded-full px-4 py-2.5 shadow-2xl transition-transform hover:scale-105"
          title="Restaurar la guía interactiva"
        >
          <Sparkles size={16} className="animate-spin-slow text-amber-300" />
          <span className="text-[13px] font-semibold">
            Guía activa · Módulo {moduloActual.numero} ({pasoIndex + 1}/{totalPasosModulo})
          </span>
          <ChevronRight size={14} />
        </button>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="guia-overlay-root pointer-events-none fixed inset-0 z-[9990] overflow-hidden">
      <style>{`
        @keyframes pulseRing {
          0% { box-shadow: 0 0 0 0 rgba(91, 83, 232, 0.7); }
          70% { box-shadow: 0 0 0 12px rgba(91, 83, 232, 0); }
          100% { box-shadow: 0 0 0 0 rgba(91, 83, 232, 0); }
        }
        @keyframes floatCard {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-4px); }
        }
        .guia-card-float {
          animation: floatCard 3s ease-in-out infinite;
        }
        .guia-spotlight {
          animation: pulseRing 2s infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .guia-card-float,
          .guia-spotlight,
          .guia-arrow-animated {
            animation: none !important;
            transform: none !important;
          }
        }
      `}</style>

      {/* 1. Spotlight / Aro pulsante sobre el elemento objetivo */}
      {encontrado && targetRect && (
        <div
          className="guia-spotlight pointer-events-none fixed z-[9991] rounded-lg transition-all duration-300"
          style={{
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
            border: "2px solid var(--brand)",
            backgroundColor: "rgba(91, 83, 232, 0.08)",
          }}
        />
      )}

      {/* 2. Flecha Vectorial SVG Direccional */}
      {encontrado && flecha && (
        <svg
          className="pointer-events-none fixed inset-0 z-[9992] h-full w-full"
          style={{ overflow: "visible" }}
        >
          <defs>
            <linearGradient id="guiaGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--brand)" />
              <stop offset="100%" stopColor="#ec4899" />
            </linearGradient>
            <marker
              id="guiaArrowhead"
              markerWidth="10"
              markerHeight="10"
              refX="6"
              refY="5"
              orient="auto"
            >
              <path d="M 0 1 L 9 5 L 0 9 z" fill="url(#guiaGradient)" />
            </marker>
          </defs>

          {/* Línea curva conectora */}
          <path
            d={`M ${flecha.x1} ${flecha.y1} Q ${(flecha.x1 + flecha.x2) / 2} ${(flecha.y1 + flecha.y2) / 2}, ${flecha.x2} ${flecha.y2}`}
            fill="none"
            stroke="url(#guiaGradient)"
            strokeWidth="3.5"
            strokeDasharray="6 3"
            markerEnd="url(#guiaArrowhead)"
            className="guia-arrow-animated"
          />
        </svg>
      )}

      {/* 3. Tarjeta Flotante Interactiva de Instrucciones */}
      <div
        ref={cardRef}
        className={cn(
          "pointer-events-auto fixed z-[9995] w-[380px] max-w-[calc(100vw-32px)] transition-all duration-200 ease-out",
          encontrado && "guia-card-float"
        )}
        style={{
          top: cardPos.top,
          left: cardPos.left,
        }}
        role="dialog"
        aria-label="Paso guiado"
      >
        <div className="border-brand/40 bg-surface text-ink rounded-2xl border-2 p-4.5 shadow-[0_12px_48px_-10px_rgba(0,0,0,0.25)] dark:shadow-[0_12px_48px_-10px_rgba(0,0,0,0.7)] backdrop-blur-md">
          {/* Cabecera de la tarjeta */}
          <div className="flex items-center justify-between gap-2 border-b border-line pb-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand text-brand-ink text-[11px] font-bold">
                {moduloActual.numero}
              </span>
              <span className="text-inkmuted text-[11.5px] font-semibold uppercase tracking-wider">
                Módulo {moduloActual.numero} de {totalModulos}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={minimizarGuia}
                className="btn btn-ghost btn-icon h-7 w-7 text-inkmuted hover:text-ink"
                title="Minimizar tutorial"
                aria-label="Minimizar tutorial"
              >
                <Minimize2 size={13} />
              </button>
              <button
                onClick={cerrarGuia}
                className="btn btn-ghost btn-icon h-7 w-7 text-inkmuted hover:text-ink"
                title="Cerrar tutorial"
                aria-label="Cerrar tutorial"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Título y subtítulo del módulo */}
          <div className="mt-2.5">
            <div className="text-brand text-[12px] font-bold">
              {moduloActual.titulo}
            </div>
            <h4 className="text-ink mt-0.5 text-[15px] font-bold leading-snug">
              {pasoActual.titulo}
            </h4>
          </div>

          {/* Instrucción principal */}
          <p className="text-inksoft mt-2 text-[13px] leading-relaxed">
            {pasoActual.instruccion}
          </p>

          {/* Detalle o sugerencia pedagógica */}
          {pasoActual.detalle && (
            <div className="bg-surface2 border-line text-inkmuted mt-2.5 rounded-lg border p-2.5 text-[12px] leading-relaxed">
              💡 {pasoActual.detalle}
            </div>
          )}

          {/* Degradación elegante cuando el elemento no está en pantalla */}
          {!encontrado && (
            <div className="bg-brandsoft border-brand/20 text-ink mt-3 rounded-lg border p-3 text-[12.5px]">
              <div className="font-semibold text-brand flex items-center gap-1.5">
                <Compass size={14} /> Elemento en otra sección
              </div>
              <p className="mt-1 text-inksoft text-[12px]">
                {pasoActual.fallbackTexto}
              </p>
              <button
                type="button"
                onClick={navegarAPasoActual}
                className="btn btn-primary btn-sm mt-2 w-full justify-center"
              >
                <ExternalLink size={13} /> Llévame allí ({pasoActual.url})
              </button>
            </div>
          )}

          {/* Barra de progreso de pasos */}
          <div className="mt-3.5 flex items-center gap-1">
            {moduloActual.pasos.map((p, idx) => (
              <div
                key={p.id}
                className={cn(
                  "h-1.5 flex-1 rounded-full transition-all",
                  idx === pasoIndex
                    ? "bg-brand"
                    : idx < pasoIndex
                      ? "bg-ok"
                      : "bg-surface3"
                )}
              />
            ))}
          </div>

          {/* Controles de navegación de la guía */}
          <div className="mt-3.5 flex items-center justify-between border-t border-line pt-2.5 text-[12px]">
            <div className="text-inkmuted font-medium">
              Paso {pasoIndex + 1} de {totalPasosModulo}
            </div>

            <div className="flex items-center gap-1.5">
              {pasoIndex > 0 || moduloIndex > 0 ? (
                <button
                  type="button"
                  onClick={pasoAnterior}
                  className="btn btn-ghost btn-sm text-[12px]"
                >
                  <ArrowLeft size={13} /> Atrás
                </button>
              ) : null}

              <button
                type="button"
                onClick={siguientePaso}
                className="btn btn-primary btn-sm text-[12px] font-semibold"
              >
                {pasoIndex < totalPasosModulo - 1 ? (
                  <>
                    Siguiente <ArrowRight size={13} />
                  </>
                ) : moduloIndex < totalModulos - 1 ? (
                  <>
                    Siguiente módulo <ChevronRight size={14} />
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={13} /> Finalizar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
