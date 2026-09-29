"use client";

/**
 * Guía ilustrada paso a paso de un equipo (iPhone, Samsung Galaxy o Sony ZV-E10).
 * Se carga con next/dynamic desde la lección, así el contenido de las guías y las
 * maquetas SVG solo viajan cuando una lección tiene «guia».
 *
 * Navegación: Anterior/Siguiente, puntos por paso y ←/→ con el foco dentro de la guía.
 * Las maquetas son propias y referenciales; los pasos de confianza baja lo dicen.
 */
import { Camera, ChevronLeft, ChevronRight, ExternalLink, ListChecks, Smartphone, TriangleAlert } from "lucide-react";
import { useId, useState, type KeyboardEvent } from "react";

import { DEVICE_GUIDES, DEVICE_LABELS, VARIA_SEGUN_VERSION, type GuideStep } from "@/content/manual/guias";
import type { GuideId } from "@/lib/manual";
import { cn } from "@/lib/utils";

import { SCREENS, stepPoint, stepView } from "./device-guide-layout";
import { DeviceScreen } from "./device-guide-screens";

// Animaciones de la marca del dedo. Con movimiento reducido quedan quietas (la marca se sigue viendo).
const ESTILOS = `
.dg-pulso { transform-box: fill-box; transform-origin: center; animation: dg-pulso 1.6s ease-out infinite; }
.dg-mantener { stroke-dashoffset: 182; animation: dg-mantener 1.8s ease-in-out infinite; }
.dg-desliza { animation: dg-desliza 0.9s linear infinite; }
.dg-giro { transform-box: fill-box; transform-origin: center; animation: dg-giro 6s linear infinite; }
@keyframes dg-pulso { from { transform: scale(0.8); opacity: 0.9; } to { transform: scale(2); opacity: 0; } }
@keyframes dg-mantener { 0% { stroke-dashoffset: 182; } 70%, 100% { stroke-dashoffset: 0; } }
@keyframes dg-desliza { to { stroke-dashoffset: -30; } }
@keyframes dg-giro { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .dg-pulso, .dg-mantener, .dg-desliza, .dg-giro { animation: none; }
  .dg-pulso { opacity: 0; }
  .dg-mantener { stroke-dashoffset: 0; }
}
`;

const GESTO_TEXTO: Record<NonNullable<GuideStep["gesto"]>, string> = {
  tocar: "Toca",
  mantener: "Mantén presionado",
  "deslizar-arriba": "Desliza hacia arriba",
  "deslizar-abajo": "Desliza hacia abajo",
  "deslizar-lado": "Desliza hacia el costado",
};

function etiquetaPaso(step: GuideStep, index: number, total: number) {
  const pantalla = SCREENS[step.pantalla].nombre;
  const accion = step.resaltar ? ` ${step.gesto ? GESTO_TEXTO[step.gesto] : "Fíjate en"} «${step.resaltar}».` : "";
  return `Paso ${index + 1} de ${total}. Maqueta referencial: ${pantalla}.${accion}`;
}

function esCampo(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export default function DeviceGuideView({ guideId }: { guideId: GuideId }) {
  const guide = DEVICE_GUIDES[guideId];
  const [index, setIndex] = useState(0);
  const uid = `dg${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  if (!guide) return null;

  const total = guide.pasos.length;
  const actual = Math.min(index, total - 1);
  const step = guide.pasos[actual];
  const celular = guide.dispositivo !== "SONY_ZVE10";
  const Icono = celular ? Smartphone : Camera;
  const varia = Boolean(step.detalle?.includes(VARIA_SEGUN_VERSION));
  // La proporción sale de la maqueta del paso: el editor de la LUT es apaisado aunque la guía sea de un celular.
  const vista = stepView(step);
  const punto = stepPoint(step);
  const etiqueta = etiquetaPaso(step, actual, total);

  function ir(destino: number) {
    setIndex(Math.max(0, Math.min(total - 1, destino)));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || esCampo(event.target)) return;
    if (event.key === "ArrowLeft" && actual > 0) {
      event.preventDefault();
      ir(actual - 1);
    } else if (event.key === "ArrowRight" && actual < total - 1) {
      event.preventDefault();
      ir(actual + 1);
    }
  }

  return (
    <div
      className="focus-visible:ring-brand/40 space-y-3 rounded-xl outline-none focus-visible:ring-2"
      role="group"
      aria-roledescription="guía paso a paso"
      aria-label={guide.titulo}
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <style>{ESTILOS}</style>
      <div className="flex flex-wrap items-center gap-2">
        <span className="chip chip-plain">
          <Icono size={11} aria-hidden="true" /> {DEVICE_LABELS[guide.dispositivo]}
        </span>
        <span className="text-inkmuted text-[11.5px]">Maquetas propias y referenciales: los menús pueden variar según modelo y versión.</span>
      </div>
      <h5 className="text-ink text-[14px] leading-snug font-bold">{guide.titulo}</h5>

      <details className="border-line bg-surface2 rounded-lg border px-3 py-2 text-[12.5px]" open>
        <summary className="text-ink cursor-pointer font-semibold">Antes de empezar ({guide.requisitos.length})</summary>
        <ul className="text-inksoft mt-2 space-y-1.5 leading-relaxed">
          {guide.requisitos.map((item, i) => (
            <li key={i} className="flex gap-2">
              <ListChecks size={13} className="text-inkmuted mt-[3px] shrink-0" aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </details>

      <div className={cn("grid items-start gap-4", vista.apaisado ? "lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]" : "md:grid-cols-[minmax(0,270px)_minmax(0,1fr)]")}>
        <figure className="m-0 min-w-0">
          {vista.recorte ? (
            // En pantallas angostas solo la pantalla de la Sony: el cuerpo entero dejaría los menús ilegibles.
            <div className="mx-auto w-full max-w-[640px] sm:hidden" style={{ aspectRatio: `${vista.recorte.w} / ${vista.recorte.h}` }}>
              <DeviceScreen
                key={`${guide.id}-${actual}-lcd`}
                id={step.pantalla}
                uid={`${uid}-${actual}-lcd`}
                resaltar={step.resaltar}
                punto={punto}
                gesto={step.gesto}
                etiqueta={etiqueta}
                recorte={vista.recorte}
                className="block h-full w-full"
              />
            </div>
          ) : null}
          <div
            className={cn("mx-auto w-full", vista.apaisado ? "max-w-[640px]" : "max-w-[250px] sm:max-w-[270px]", vista.recorte && "hidden sm:block")}
            style={{ aspectRatio: `${vista.vw} / ${vista.vh}` }}
          >
            <DeviceScreen
              key={`${guide.id}-${actual}`}
              id={step.pantalla}
              uid={`${uid}-${actual}`}
              resaltar={step.resaltar}
              punto={punto}
              gesto={step.gesto}
              etiqueta={etiqueta}
              className="block h-full w-full"
            />
          </div>
          <figcaption className="text-inkmuted mt-1.5 text-center text-[11.5px] leading-snug">{SCREENS[step.pantalla].nombre}</figcaption>
        </figure>

        <div className="flex min-w-0 flex-col gap-3">
          <div className="text-inkmuted text-[11px] font-semibold tracking-wider uppercase">
            Paso {actual + 1} de {total}
          </div>
          <p className="text-ink text-[14px] leading-relaxed font-medium">{step.texto}</p>
          {step.detalle ? (
            varia ? (
              <p className="border-line bg-surface2 text-inksoft flex gap-2 rounded-lg border p-2.5 text-[12.5px] leading-relaxed">
                <TriangleAlert size={14} className="text-warn mt-[2px] shrink-0" aria-hidden="true" />
                <span>{step.detalle}</span>
              </p>
            ) : (
              <p className="text-inksoft text-[13px] leading-relaxed">{step.detalle}</p>
            )
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-sm" disabled={actual === 0} onClick={() => ir(actual - 1)}>
              <ChevronLeft size={14} aria-hidden="true" /> Anterior
            </button>
            <button type="button" className="btn btn-sm btn-primary" disabled={actual >= total - 1} onClick={() => ir(actual + 1)}>
              Siguiente <ChevronRight size={14} aria-hidden="true" />
            </button>
          </div>
          <ol className="-ml-1 flex flex-wrap" aria-label="Pasos de la guía">
            {guide.pasos.map((_, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => ir(i)}
                  aria-label={`Ir al paso ${i + 1}`}
                  aria-current={i === actual ? "step" : undefined}
                  className="grid h-7 w-7 place-items-center rounded-full"
                >
                  <span className={cn("block rounded-full transition-all", i === actual ? "bg-brand h-2.5 w-2.5" : "bg-linestrong h-2 w-2")} />
                </button>
              </li>
            ))}
          </ol>
          <p className="text-inkmuted hidden text-[11.5px] sm:block">Con el foco en la guía, usa ← y → para cambiar de paso.</p>
        </div>
      </div>

      <details className="text-[12.5px]">
        <summary className="text-inkmuted cursor-pointer font-semibold">Todos los pasos en texto</summary>
        <ol className="text-inksoft mt-2 list-decimal space-y-1.5 pl-5 leading-relaxed">
          {guide.pasos.map((item, i) => (
            <li key={i}>
              <button type="button" className="text-left hover:underline" onClick={() => ir(i)}>
                {item.texto}
              </button>
            </li>
          ))}
        </ol>
      </details>

      {guide.notas.length ? (
        <details className="text-[12.5px]">
          <summary className="text-inkmuted cursor-pointer font-semibold">Notas y advertencias ({guide.notas.length})</summary>
          <ul className="text-inksoft mt-2 space-y-1.5 leading-relaxed">
            {guide.notas.map((nota, i) => (
              <li key={i} className="flex gap-2">
                <TriangleAlert size={13} className={cn("mt-[3px] shrink-0", nota.includes(VARIA_SEGUN_VERSION) ? "text-warn" : "text-inkmuted")} aria-hidden="true" />
                <span>{nota}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <details className="text-[12.5px]">
        <summary className="text-inkmuted cursor-pointer font-semibold">Documentación oficial ({guide.fuentes.length})</summary>
        <ul className="mt-2 space-y-1">
          {guide.fuentes.map(url => (
            <li key={url} className="min-w-0">
              <a href={url} target="_blank" rel="noopener noreferrer" className="text-brand inline-flex max-w-full items-center gap-1 font-semibold break-all hover:underline">
                <ExternalLink size={12} className="shrink-0" aria-hidden="true" />
                <span>{url.replace(/^https?:\/\//, "")}</span>
              </a>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
