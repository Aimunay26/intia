"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatRange, formatSeconds } from "@/lib/utils";
import { useGuia } from "@/components/guia/guia-context";
import { GUIA_TARGETS } from "@/lib/guia/catalogo";
import { SceneNavProvider } from "./scene-nav";
import { FIT_MEDIA, readSceneParam, resolveSceneIndex, sceneKeyStep, withSceneParam } from "./viewer-state";
import styles from "./script-workspace.module.css";

type Scene = { id: string; label: string; startSec: number; endSec: number; body: ReactNode };
const views = [
  { id: "scenes", label: "Escenas" },
  { id: "production", label: "Producción" },
  { id: "record", label: "Ficha e historial" },
] as const;
type ViewId = (typeof views)[number]["id"];

/** Detalles que se abren solos en pantallas anchas (columna lateral siempre visible). */
const WIDE_DETAILS = "details[data-scene-details]:not([open]), details[data-wide-open]:not([open])";

/**
 * Solo cambia la presentación: los datos y acciones llegan autorizados desde el servidor.
 * `fit` (kill-switch GUIONES_AJUSTE_PANTALLA) ajusta el visor al alto de la pantalla en escritorio.
 */
export function ScriptWorkspace({ scenes, production, record, addScene, empty, header, fit = true }: {
  scenes: Scene[]; production: ReactNode; record: ReactNode; addScene?: ReactNode; empty: ReactNode;
  header?: ReactNode; fit?: boolean;
}) {
  const searchParams = useSearchParams();
  const ids = scenes.map(scene => scene.id);
  const [view, setView] = useState<ViewId>("scenes");
  const [selection, setSelection] = useState(() => {
    const start = resolveSceneIndex(ids, readSceneParam(searchParams), 0);
    return { id: scenes[start]?.id, index: start };
  });
  const root = useRef<HTMLDivElement>(null);
  const tablist = useRef<HTMLDivElement>(null);
  const sceneBar = useRef<HTMLDivElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const wide = useRef(false);
  // Solo se escribe ?escena cuando la URL ya la traía o cuando la persona elige una escena.
  const syncUrl = useRef(Boolean(readSceneParam(searchParams)));
  const prefix = useId();
  const { activo, pasoActual } = useGuia();
  const guideTarget = pasoActual?.target;
  const index = resolveSceneIndex(ids, selection.id, selection.index);
  const selected = scenes[index];

  /** En flujo normal (móvil/tableta) lleva el inicio de la escena bajo las barras fijas. */
  const reveal = useCallback((id: string) => {
    const node = root.current;
    if (!node || wide.current) return;
    const panel = Array.from(node.querySelectorAll<HTMLElement>("[data-scene-panel]")).find(el => el.dataset.scenePanel === id);
    if (!panel) return;
    const bottomOf = (el: HTMLElement | null) => {
      if (!el) return 0;
      const style = getComputedStyle(el);
      return style.display !== "none" && style.position === "sticky" ? el.getBoundingClientRect().bottom : 0;
    };
    const covered = Math.max(bottomOf(sceneBar.current), bottomOf(tablist.current));
    const top = panel.getBoundingClientRect().top;
    if (top < covered + 8 || top > window.innerHeight - 120) window.scrollBy({ top: top - covered - 8 });
  }, []);

  const choose = useCallback((next: number) => {
    const scene = scenes[next];
    if (!scene) return;
    syncUrl.current = true;
    setSelection({ id: scene.id, index: next });
    requestAnimationFrame(() => reveal(scene.id));
  }, [scenes, reveal]);

  useEffect(() => {
    if (activo && guideTarget && ([GUIA_TARGETS.SELECT_ASIGNAR_VIDEO, GUIA_TARGETS.BTN_ASIGNAR_GUION, GUIA_TARGETS.VIDEO_VINCULADO_CARD] as string[]).includes(guideTarget)) setView("record");
  }, [activo, guideTarget]);

  // ?escena=<id> sobrevive a la recarga. replaceState no provoca otra carga del servidor.
  const selectedId = selected?.id;
  useEffect(() => {
    if (!syncUrl.current || !selectedId) return;
    if (readSceneParam(window.location.search) === selectedId) return;
    window.history.replaceState(null, "", withSceneParam(window.location.href, selectedId));
  }, [selectedId]);

  // ←/→ cambian de escena cuando el foco no está en un campo, menú o diálogo.
  useEffect(() => {
    if (view !== "scenes" || scenes.length < 2) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const step = sceneKeyStep(event, target && {
        tagName: target.tagName,
        isContentEditable: target.isContentEditable,
        inWidget: Boolean(target.closest('[role="tablist"], [role="menu"], [role="listbox"], [role="dialog"], [role="slider"]')),
      });
      if (!step || document.querySelector('[role="dialog"][aria-modal="true"], [role="menu"]')) return;
      const next = index + step;
      if (next < 0 || next >= scenes.length) return;
      event.preventDefault();
      choose(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, index, scenes.length, choose]);

  // Imprimir: todas las escenas con sus detalles abiertos; al terminar se restauran.
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

  // Pantalla ancha en modo ajuste: los detalles técnicos quedan visibles en su columna.
  // Cada detalle se abre una sola vez: si la persona pliega el historial, no se reabre al recargar datos.
  const wideOpened = useRef<HTMLDetailsElement[]>([]);
  const wideSeen = useRef(new WeakSet<HTMLDetailsElement>());
  useEffect(() => {
    if (!fit) { wide.current = false; return; }
    const media = window.matchMedia(FIT_MEDIA);
    const apply = () => {
      wide.current = media.matches;
      if (media.matches) {
        const closed = Array.from(root.current?.querySelectorAll<HTMLDetailsElement>(WIDE_DETAILS) ?? []).filter(detail => !wideSeen.current.has(detail));
        closed.forEach(detail => { detail.open = true; wideSeen.current.add(detail); });
        wideOpened.current.push(...closed);
      } else {
        wideOpened.current.forEach(detail => { if (detail.isConnected) detail.open = false; });
        wideOpened.current = [];
        wideSeen.current = new WeakSet();
      }
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [fit, scenes]);

  // En esa columna el resumen es un título: no se puede plegar por error.
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const onClick = (event: MouseEvent) => {
      if (wide.current && event.target instanceof Element && event.target.closest("details[data-scene-details] > summary")) event.preventDefault();
    };
    node.addEventListener("click", onClick);
    return () => node.removeEventListener("click", onClick);
  }, []);

  return <div ref={root} className={styles.workspace} data-script-workspace data-fit={fit ? "on" : "off"}>
    {header ? <div className={styles.headSlot}>{header}</div> : null}
    <div ref={tablist} role="tablist" aria-label="Vistas del guion" className={`${styles.tabs} no-print`}>
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
        <div ref={sceneBar} className={`${styles.sceneBar} no-print`}>
          <button type="button" className="btn btn-icon" aria-label="Escena anterior" disabled={index === 0} onClick={() => choose(index - 1)}><ChevronLeft size={18} aria-hidden="true" /></button>
          <select id={`${prefix}-picker`} aria-label="Ir a una escena" className="select" value={selected.id}
            onChange={event => choose(scenes.findIndex(scene => scene.id === event.target.value))}>
            {scenes.map((scene, i) => <option key={scene.id} value={scene.id}>{i + 1}/{scenes.length} · {scene.label || `Escena ${i + 1}`} · {formatRange(scene.startSec, scene.endSec)}</option>)}
          </select>
          <button type="button" className="btn btn-icon" aria-label="Escena siguiente" disabled={index === scenes.length - 1} onClick={() => choose(index + 1)}><ChevronRight size={18} aria-hidden="true" /></button>
        </div>
        <div className={styles.layout}>
          <div className={`${styles.rail} no-print`}>
          <nav className={styles.index} aria-label="Índice de escenas">
            <p className={styles.indexHead}>{scenes.length} {scenes.length === 1 ? "escena" : "escenas"}</p>
            <ol className={styles.indexList}>{scenes.map((scene, i) => <li key={scene.id}>
              <button type="button" className={styles.sceneButton} aria-current={i === index ? "step" : undefined}
                aria-controls={`${prefix}-scene-${scene.id}`} title={`${scene.label || `Escena ${i + 1}`} · ${formatRange(scene.startSec, scene.endSec)}`} onClick={() => choose(i)}>
                <span className={styles.number}>{String(i + 1).padStart(2, "0")}</span>
                <span className={styles.sceneName}>{scene.label || `Escena ${i + 1}`}</span>
                <span className={styles.sceneTime}>{formatSeconds(scene.startSec)}</span>
              </button>
            </li>)}</ol>
          </nav>
          {addScene ? <div className={styles.addScene}>{addScene}</div> : null}
          </div>
          <div className={styles.stage}>
            <p className="sr-only no-print" aria-live="polite" aria-atomic="true">Escena {index + 1} de {scenes.length}: {selected.label}</p>
            {scenes.map((scene, i) => <div key={scene.id} id={`${prefix}-scene-${scene.id}`} hidden={i !== index} className={styles.scenePanel} data-scene-panel={scene.id}>
              <SceneNavProvider value={{ position: i, total: scenes.length, go: choose }}>{scene.body}</SceneNavProvider>
            </div>)}
          </div>
        </div>
      </> : <>
        {empty}
        {addScene ? <div className={`${styles.addSceneEmpty} no-print`}>{addScene}</div> : null}
      </>}
    </section>
    <section role="tabpanel" id={`${prefix}-production-panel`} aria-labelledby={`${prefix}-production-tab`} hidden={view !== "production"} className={styles.panel}>
      <h2 className="sr-only print:not-sr-only">Producción</h2>{production}
    </section>
    <section role="tabpanel" id={`${prefix}-record-panel`} aria-labelledby={`${prefix}-record-tab`} hidden={view !== "record"} className={styles.panel}>
      <h2 className="sr-only print:not-sr-only">Ficha e historial</h2>{record}
    </section>
  </div>;
}
