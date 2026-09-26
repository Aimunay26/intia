"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Clapperboard } from "lucide-react";
import { formatRange } from "@/lib/utils";
import { useGuia } from "@/components/guia/guia-context";
import { GUIA_TARGETS } from "@/lib/guia/catalogo";
import styles from "./script-workspace.module.css";

type Scene = { id: string; label: string; startSec: number; endSec: number; body: ReactNode };
const views = [
  { id: "scenes", label: "Escenas" },
  { id: "production", label: "Producción" },
  { id: "record", label: "Ficha e historial" },
] as const;

/** Solo cambia la presentación: los datos y acciones llegan autorizados desde el servidor. */
export function ScriptWorkspace({ scenes, production, record, addScene, empty }: {
  scenes: Scene[]; production: ReactNode; record: ReactNode; addScene?: ReactNode; empty: ReactNode;
}) {
  const [view, setView] = useState<(typeof views)[number]["id"]>("scenes");
  const [selection, setSelection] = useState({ id: scenes[0]?.id, index: 0 });
  const root = useRef<HTMLDivElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const prefix = useId();
  const { activo, pasoActual } = useGuia();
  const guideTarget = pasoActual?.target;
  const found = scenes.findIndex(scene => scene.id === selection.id);
  const index = found >= 0 ? found : Math.min(selection.index, Math.max(0, scenes.length - 1));
  const selected = scenes[index];
  const choose = (next: number) => {
    const scene = scenes[next];
    if (scene) setSelection({ id: scene.id, index: next });
  };

  useEffect(() => {
    if (activo && guideTarget && ([GUIA_TARGETS.SELECT_ASIGNAR_VIDEO, GUIA_TARGETS.BTN_ASIGNAR_GUION, GUIA_TARGETS.VIDEO_VINCULADO_CARD] as string[]).includes(guideTarget)) setView("record");
  }, [activo, guideTarget]);

  useEffect(() => {
    let opened: HTMLDetailsElement[] = [];
    const before = () => {
      if (opened.length) return;
      opened = Array.from(root.current?.querySelectorAll<HTMLDetailsElement>("details[data-scene-details]:not([open])") ?? []);
      opened.forEach(detail => { detail.open = true; });
    };
    const after = () => { opened.forEach(detail => { detail.open = false; }); opened = []; };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => { after(); window.removeEventListener("beforeprint", before); window.removeEventListener("afterprint", after); };
  }, []);

  return <div ref={root} className={styles.workspace} data-script-workspace>
    <div role="tablist" aria-label="Vistas del guion" className={`${styles.tabs} no-print`}>
      {views.map((item, position) => <button key={item.id} ref={node => { tabs.current[position] = node; }}
        type="button" role="tab" id={`${prefix}-${item.id}-tab`} aria-controls={`${prefix}-${item.id}-panel`}
        aria-selected={view === item.id} tabIndex={view === item.id ? 0 : -1} className={styles.tab}
        onClick={() => setView(item.id)} onKeyDown={event => {
          const next = event.key === "ArrowRight" ? (position + 1) % views.length
            : event.key === "ArrowLeft" ? (position + views.length - 1) % views.length
              : event.key === "Home" ? 0 : event.key === "End" ? views.length - 1 : -1;
          if (next < 0) return;
          event.preventDefault(); setView(views[next].id); tabs.current[next]?.focus();
        }}>{item.label}</button>)}
    </div>

    <section role="tabpanel" id={`${prefix}-scenes-panel`} aria-labelledby={`${prefix}-scenes-tab`} hidden={view !== "scenes"} className={styles.panel}>
      {scenes.length ? <>
        <div className={`${styles.mobilePicker} no-print`}>
          <label className="label" htmlFor={`${prefix}-picker`}>Ir a una escena</label>
          <select id={`${prefix}-picker`} className="select w-full" value={selected.id}
            onChange={event => choose(scenes.findIndex(scene => scene.id === event.target.value))}>
            {scenes.map((scene, i) => <option key={scene.id} value={scene.id}>{i + 1}. {scene.label} · {formatRange(scene.startSec, scene.endSec)}</option>)}
          </select>
        </div>
        <div className={styles.layout}>
          <nav className={`${styles.index} no-print`} aria-label="Índice de escenas">
            <p className="text-inkmuted mb-3 text-xs font-semibold">{scenes.length} escenas</p>
            <ol className="space-y-2">{scenes.map((scene, i) => <li key={scene.id}>
              <button type="button" className={styles.sceneButton} aria-current={i === index ? "step" : undefined}
                aria-controls={`${prefix}-scene-${scene.id}`} onClick={() => choose(i)}>
                <span className={styles.number}>{String(i + 1).padStart(2, "0")}</span>
                <span className="min-w-0"><span className="block font-semibold">{scene.label || `Escena ${i + 1}`}</span>
                  <span className="text-inkmuted mt-1 block text-xs font-normal">{formatRange(scene.startSec, scene.endSec)}</span></span>
              </button>
            </li>)}</ol>
          </nav>
          <div className="min-w-0">
            <p className="sr-only no-print" aria-live="polite" aria-atomic="true">Escena {index + 1} de {scenes.length}: {selected.label}</p>
            {scenes.map((scene, i) => <div key={scene.id} id={`${prefix}-scene-${scene.id}`} hidden={i !== index} className={styles.scenePanel} data-scene-panel={scene.id}>{scene.body}</div>)}
            <div className={`${styles.sceneFooter} no-print`}>
              <button type="button" className="btn" disabled={index === 0} onClick={() => choose(index - 1)}><ArrowLeft size={15} aria-hidden="true" />Anterior</button>
              <span className="text-inkmuted text-center text-xs">Escena {index + 1} de {scenes.length}</span>
              <button type="button" className="btn" disabled={index === scenes.length - 1} onClick={() => choose(index + 1)}>Siguiente<ArrowRight size={15} aria-hidden="true" /></button>
            </div>
          </div>
        </div>
      </> : empty}
      {addScene ? <div className={`${styles.addScene} no-print`}><Clapperboard size={17} className="text-inkmuted shrink-0" aria-hidden="true" />{addScene}</div> : null}
    </section>
    <section role="tabpanel" id={`${prefix}-production-panel`} aria-labelledby={`${prefix}-production-tab`} hidden={view !== "production"} className={styles.panel}>
      <h2 className="sr-only print:not-sr-only">Producción</h2>{production}
    </section>
    <section role="tabpanel" id={`${prefix}-record-panel`} aria-labelledby={`${prefix}-record-tab`} hidden={view !== "record"} className={styles.panel}>
      <h2 className="sr-only print:not-sr-only">Ficha e historial</h2>{record}
    </section>
  </div>;
}
