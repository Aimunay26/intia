"use client";

import { useEffect, useState, useRef, useSyncExternalStore, useCallback } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Compass,
  ExternalLink,
  Minimize2,
  Sparkles,
  SkipForward,
  X,
} from "lucide-react";
import { useGuia } from "./guia-context";
import { GUIA_TARGETS } from "@/lib/guia/catalogo";
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
  const pathname = usePathname();
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
  const [cardSize, setCardSize] = useState<{ width: number; height: number }>({
    width: 390,
    height: 280,
  });

  const [flecha, setFlecha] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    dir: "top" | "bottom" | "left" | "right";
  } | null>(null);

  const [alertaRoja, setAlertaRoja] = useState<string | null>(null);
  const [accionRealizada, setAccionRealizada] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);

  // Medición dinámica del tamaño real de la tarjeta con ResizeObserver
  useEffect(() => {
    if (!cardRef.current) return;
    const updateSize = () => {
      if (cardRef.current) {
        const r = cardRef.current.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          setCardSize({
            width: Math.round(r.width),
            height: Math.round(r.height),
          });
        }
      }
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(cardRef.current);
    return () => ro.disconnect();
  }, [pasoActual, alertaRoja, encontrado]);

  // 2. DELEGACIÓN GLOBAL DE EVENTOS (Captura de interacciones en el DOM sin fallas de timing)
  useEffect(() => {
    if (!activo || !pasoActual?.target) return;
    setAlertaRoja(null);
    setAccionRealizada(false);

    const targetKey = pasoActual.target;

    const matchesTarget = (el: HTMLElement | null): boolean => {
      if (!el) return false;
      const anchor = el.closest("[data-guia]");
      if (!anchor) return false;
      const guiaVal = anchor.getAttribute("data-guia");
      if (!guiaVal) return false;

      if (guiaVal === targetKey) return true;
      // Alias: btn-nueva-marca-header también es satisfecho por btn-nueva-marca-empty
      if (
        targetKey === GUIA_TARGETS.BTN_NUEVA_MARCA_HEADER &&
        guiaVal === GUIA_TARGETS.BTN_NUEVA_MARCA_EMPTY
      ) {
        return true;
      }
      return false;
    };

    const handleEvent = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (matchesTarget(target)) {
        setAccionRealizada(true);
        setAlertaRoja(null);
      }
    };

    window.addEventListener("click", handleEvent, true);
    window.addEventListener("input", handleEvent, true);
    window.addEventListener("change", handleEvent, true);
    window.addEventListener("submit", handleEvent, true);

    return () => {
      window.removeEventListener("click", handleEvent, true);
      window.removeEventListener("input", handleEvent, true);
      window.removeEventListener("change", handleEvent, true);
      window.removeEventListener("submit", handleEvent, true);
    };
  }, [activo, pasoActual?.target]);

  // 3. Búsqueda y seguimiento continuo del elemento objetivo visible en el DOM
  const buscarElemento = useCallback(() => {
    if (!activo || minimizado || !pasoActual) {
      setTargetRect(null);
      setEncontrado(false);
      return;
    }

    let selector = `[data-guia="${pasoActual.target}"]`;
    if (pasoActual.target === GUIA_TARGETS.BTN_NUEVA_MARCA_HEADER) {
      selector = `[data-guia="${GUIA_TARGETS.BTN_NUEVA_MARCA_HEADER}"], [data-guia="${GUIA_TARGETS.BTN_NUEVA_MARCA_EMPTY}"]`;
    }

    const candidates = Array.from(document.querySelectorAll(selector));

    // Filtrar por visibilidad real
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
  }, [activo, minimizado, pasoActual]);

  useEffect(() => {
    buscarElemento();

    window.addEventListener("scroll", buscarElemento, true);
    window.addEventListener("resize", buscarElemento);
    const timer = setInterval(buscarElemento, 350);

    return () => {
      window.removeEventListener("scroll", buscarElemento, true);
      window.removeEventListener("resize", buscarElemento);
      clearInterval(timer);
    };
  }, [buscarElemento]);

  // 4. Cálculo inteligente de la posición del Card flotante y de la flecha
  useEffect(() => {
    if (!activo || minimizado) return;

    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const cardW = cardSize.width || 390;
    const cardH = cardSize.height || 280;
    const margen = 20;

    // Si el elemento no está en pantalla, centrar el card cómodamente
    if (!targetRect || !encontrado) {
      setCardPos({
        top: Math.max(16, Math.round((viewportH - cardH) / 2)),
        left: Math.max(16, Math.round((viewportW - cardW) / 2)),
      });
      setFlecha(null);
      return;
    }

    const targetCenterY = targetRect.top + targetRect.height / 2;
    const targetCenterX = targetRect.left + targetRect.width / 2;
    const preferida = pasoActual.posicionPreferida || "auto";

    const spaceRight = viewportW - targetRect.right - margen;
    const spaceLeft = targetRect.left - margen;
    const spaceBottom = viewportH - targetRect.bottom - margen;
    const spaceTop = targetRect.top - margen;

    let dir: "top" | "bottom" | "left" | "right" = "bottom";

    if (preferida === "right" && spaceRight >= cardW) {
      dir = "right";
    } else if (preferida === "left" && spaceLeft >= cardW) {
      dir = "left";
    } else if (preferida === "top" && spaceTop >= cardH) {
      dir = "top";
    } else if (preferida === "bottom" && spaceBottom >= cardH) {
      dir = "bottom";
    } else {
      // Elegir el lado con mayor espacio disponible para no pisar el objetivo
      const maxSpace = Math.max(spaceBottom, spaceTop, spaceRight, spaceLeft);
      if (maxSpace === spaceBottom) dir = "bottom";
      else if (maxSpace === spaceTop) dir = "top";
      else if (maxSpace === spaceRight) dir = "right";
      else dir = "left";
    }

    let top = 100;
    let left = 100;

    if (dir === "bottom") {
      top = targetRect.bottom + margen;
      left = targetCenterX - cardW / 2;
    } else if (dir === "top") {
      top = targetRect.top - cardH - margen;
      left = targetCenterX - cardW / 2;
    } else if (dir === "right") {
      top = targetCenterY - cardH / 2;
      left = targetRect.right + margen;
    } else {
      top = targetCenterY - cardH / 2;
      left = targetRect.left - cardW - margen;
    }

    // Clamp estricto dentro de la pantalla para evitar desbordes o botones invisibles
    top = Math.max(16, Math.min(top, viewportH - cardH - 16));
    left = Math.max(16, Math.min(left, viewportW - cardW - 16));

    setCardPos({ top: Math.round(top), left: Math.round(left) });

    // Cálculo de anclaje de la flecha curva
    let x1 = 0, y1 = 0, x2 = 0, y2 = 0;
    if (dir === "bottom") {
      x1 = left + cardW / 2;
      y1 = top;
      x2 = targetCenterX;
      y2 = targetRect.bottom + 4;
    } else if (dir === "top") {
      x1 = left + cardW / 2;
      y1 = top + cardH;
      x2 = targetCenterX;
      y2 = targetRect.top - 4;
    } else if (dir === "right") {
      x1 = left;
      y1 = top + cardH / 2;
      x2 = targetRect.right + 4;
      y2 = targetCenterY;
    } else {
      x1 = left + cardW;
      y1 = top + cardH / 2;
      x2 = targetRect.left - 4;
      y2 = targetCenterY;
    }

    setFlecha({ x1, y1, x2, y2, dir });
  }, [targetRect, encontrado, pasoActual, activo, minimizado, cardSize]);

  // 5. MOTOR INDESTRUCTIBLE DE AVANCE (Zero-Hostage Principle)
  const handleAvanzar = () => {
    // Si el elemento no está en la página actual:
    if (!encontrado) {
      if (pathname !== pasoActual?.url) {
        // Redirigir hacia la URL del paso
        navegarAPasoActual();
        return;
      }
      // Ya estamos en la URL pero no se encuentra (ej. modal cerrado o lista vacía):
      // NUNCA atrapar al usuario; permitir avanzar fluidamente
      setAlertaRoja(null);
      setAccionRealizada(false);
      siguientePaso();
      return;
    }

    // Comprobar si requiere interacción activa (botones de acción explícitos, excluyendo tarjetas informativas)
    const esPasoDeAccion = Boolean(
      (pasoActual?.target?.startsWith("btn-") && !pasoActual?.target?.endsWith("-card")) ||
      pasoActual?.target === GUIA_TARGETS.MARCA_TAB_IDENTIDAD
    );

    // Si requiere acción y aún no se hizo:
    // 1er intento: Mostramos aviso educativo
    // 2do intento: AVANZAMOS DIRECTAMENTE (el usuario decide continuar)
    if (esPasoDeAccion && !accionRealizada && !alertaRoja) {
      setAlertaRoja("Presiona el botón señalado para interactuar, o pulsa Siguiente de nuevo para continuar.");
      return;
    }

    // Avanzar sin obstáculos
    setAlertaRoja(null);
    setAccionRealizada(false);
    siguientePaso();
  };

  const handleOmitir = () => {
    setAlertaRoja(null);
    setAccionRealizada(false);
    siguientePaso();
  };

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
        @keyframes pulseRedRing {
          0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.85); }
          70% { box-shadow: 0 0 0 16px rgba(239, 68, 68, 0); }
          100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
        @keyframes shakeCard {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-7px); }
          40%, 80% { transform: translateX(7px); }
        }
        .guia-card-float {
          animation: floatCard 3s ease-in-out infinite;
        }
        .guia-shake-red {
          animation: shakeCard 0.4s ease-in-out !important;
        }
        .guia-spotlight {
          animation: pulseRing 2s infinite;
        }
        .guia-spotlight-red {
          animation: pulseRedRing 1s infinite !important;
        }
        @media (prefers-reduced-motion: reduce) {
          .guia-card-float,
          .guia-spotlight,
          .guia-spotlight-red,
          .guia-shake-red,
          .guia-arrow-animated {
            animation: none !important;
            transform: none !important;
          }
        }
      `}</style>

      {/* 1. Spotlight / Aro pulsante sobre el elemento objetivo */}
      {encontrado && targetRect && (
        <div
          className={cn(
            "pointer-events-none fixed z-[9991] rounded-lg transition-all duration-300",
            alertaRoja ? "guia-spotlight-red" : "guia-spotlight"
          )}
          style={{
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
            border: alertaRoja ? "3px solid #ef4444" : "2px solid var(--brand)",
            backgroundColor: alertaRoja ? "rgba(239, 68, 68, 0.16)" : "rgba(91, 83, 232, 0.08)",
          }}
        />
      )}

      {/* 2. Flecha Vectorial SVG Curva con Gradiente */}
      {encontrado && flecha && (() => {
        const dx = flecha.x2 - flecha.x1;
        const dy = flecha.y2 - flecha.y1;
        const dist = Math.hypot(dx, dy);
        const nx = dist > 0 ? -dy / dist : 0;
        const ny = dist > 0 ? dx / dist : 0;
        const curvature = Math.min(28, Math.max(14, dist * 0.16));
        const cx = (flecha.x1 + flecha.x2) / 2 + nx * curvature;
        const cy = (flecha.y1 + flecha.y2) / 2 + ny * curvature;
        const d = `M ${flecha.x1} ${flecha.y1} Q ${cx} ${cy}, ${flecha.x2} ${flecha.y2}`;

        return (
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

            <path
              d={d}
              fill="none"
              stroke="url(#guiaGradient)"
              strokeWidth="3.5"
              strokeDasharray="6 3"
              markerEnd="url(#guiaArrowhead)"
            />
          </svg>
        );
      })()}

      {/* 3. Tarjeta Flotante con Protección contra Desborde y Botones Siempre Visibles */}
      <div
        ref={cardRef}
        className={cn(
          "pointer-events-auto fixed z-[9995] w-[390px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] transition-all duration-200 ease-out",
          encontrado && !alertaRoja && "guia-card-float",
          alertaRoja && "guia-shake-red"
        )}
        style={{
          top: cardPos.top,
          left: cardPos.left,
        }}
        role="dialog"
        aria-label="Paso guiado"
      >
        <div
          className={cn(
            "bg-surface text-ink rounded-2xl border-2 p-4 sm:p-5 shadow-2xl backdrop-blur-md transition-colors flex flex-col max-h-[calc(100vh-32px)] overflow-hidden",
            alertaRoja
              ? "border-amber-500/80 shadow-amber-500/20"
              : "border-brand/40 shadow-[0_12px_48px_-10px_rgba(0,0,0,0.25)] dark:shadow-[0_12px_48px_-10px_rgba(0,0,0,0.7)]"
          )}
        >
          {/* Cabecera Fija */}
          <div className="flex items-center justify-between gap-2 border-b border-line pb-2.5 shrink-0">
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

          {/* Cuerpo Desplazable (Scroll interno si la pantalla es reducida) */}
          <div className="flex-1 overflow-y-auto min-h-0 py-2.5 space-y-2 pr-1">
            <div>
              <div className="text-brand text-[12px] font-bold">
                {moduloActual.titulo}
              </div>
              <h4 className="text-ink mt-0.5 text-[15px] font-bold leading-snug">
                {pasoActual.titulo}
              </h4>
            </div>

            <p className="text-inksoft text-[13px] leading-relaxed">
              {pasoActual.instruccion}
            </p>

            {pasoActual.detalle && (
              <div className="bg-surface2 border-line text-inkmuted rounded-lg border p-2.5 text-[12px] leading-relaxed">
                💡 {pasoActual.detalle}
              </div>
            )}

            {/* Degradación inteligente cuando el elemento objetivo no está a la vista */}
            {!encontrado && (
              <div className="rounded-lg border border-brand/25 bg-brandsoft/70 p-3 text-[12.5px] text-ink space-y-2">
                <div className="font-semibold text-brand flex items-center gap-1.5">
                  <Compass size={14} /> Elemento en otra sección
                </div>
                <p className="text-inksoft text-[12px] leading-relaxed">
                  {pasoActual.fallbackTexto}
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setAlertaRoja(null);
                      setAccionRealizada(true);
                      navegarAPasoActual();
                    }}
                    className="btn btn-primary btn-sm flex-1 font-bold"
                  >
                    <ExternalLink size={13} /> Llévame allí ({pasoActual.url})
                  </button>
                  <button
                    type="button"
                    onClick={handleOmitir}
                    className="btn btn-ghost btn-sm text-[11.5px] text-inkmuted hover:text-ink"
                    title="Saltar este paso y continuar con el siguiente"
                  >
                    Omitir
                  </button>
                </div>
              </div>
            )}

            {/* Aviso educativo cuando se requiere una acción antes de avanzar */}
            {alertaRoja && (
              <div className="rounded-lg border border-amber-500/60 bg-amber-500/10 p-2.5 text-[12px] font-medium text-amber-800 dark:text-amber-300 flex items-start justify-between gap-2 animate-pulse">
                <div className="flex items-start gap-2">
                  <AlertCircle size={15} className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                  <span>{alertaRoja}</span>
                </div>
                <button
                  type="button"
                  onClick={handleOmitir}
                  className="btn btn-ghost btn-xs text-[11px] font-bold text-amber-700 dark:text-amber-300 hover:underline shrink-0"
                >
                  Omitir <SkipForward size={11} className="inline ml-0.5" />
                </button>
              </div>
            )}
          </div>

          {/* Pie Fijo con Progreso y Botones de Navegación */}
          <div className="shrink-0 pt-2.5 border-t border-line space-y-2.5">
            {/* Barra de progreso de pasos */}
            <div className="flex items-center gap-1">
              {moduloActual.pasos.map((p, idx) => (
                <div
                  key={p.id}
                  className={cn(
                    "h-1.5 flex-1 rounded-full transition-all",
                    idx === pasoIndex
                      ? alertaRoja
                        ? "bg-amber-500"
                        : "bg-brand"
                      : idx < pasoIndex
                        ? "bg-ok"
                        : "bg-surface3"
                  )}
                />
              ))}
            </div>

            <div className="flex items-center justify-between text-[12px]">
              <div className="text-inkmuted font-medium text-[11.5px]">
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
                  onClick={handleAvanzar}
                  className={cn(
                    "btn btn-sm text-[12px] font-semibold transition-all",
                    alertaRoja
                      ? "bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-500/20"
                      : "btn-primary"
                  )}
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
      </div>
    </div>,
    document.body
  );
}
