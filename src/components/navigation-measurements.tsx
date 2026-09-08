"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type Sample = {
  id: number; kind: "click" | "history"; from: string; to: string; startedAt: string; release: string;
  visualMs: number | null; routeMs: number | null; firstBlockMs: number | null; readyMs: number | null;
  status: "complete" | "cancelled" | "timeout" | "error";
};
const ROUTES = new Set(["/", "/calendario", "/contenido", "/tareas", "/marcas", "/generador", "/guiones", "/estructuras", "/arquetipos", "/metricas", "/tutorial", "/equipo", "/actividad", "/ajustes"]);
const routeName = (path: string) => ROUTES.has(path) ? path : "detail";

/** Opt-in: ?medir=1 durante esta sesión, ?medir=0 para desactivar. No envía datos a un servicio. */
export function NavigationMeasurements({ enabled = false, release = "local" }: { enabled?: boolean; release?: string }) {
  const pathname = usePathname();
  const currentPath = useRef(pathname);
  const inspect = useRef<() => void>(() => {});
  const [samples, setSamples] = useState<Sample[]>([]);
  useEffect(() => { currentPath.current = pathname; inspect.current(); }, [pathname]);

  useEffect(() => {
    let configured = enabled;
    try {
      const option = new URLSearchParams(location.search).get("medir");
      if (option === "1" || option === "0") sessionStorage.setItem("intia.measure-navigation", option);
      configured ||= sessionStorage.getItem("intia.measure-navigation") === "1";
    } catch { /* La medición sigue disponible por configuración si el navegador bloquea storage. */ }
    if (!configured) return;
    let sequence = 0;
    let active: { sample: Sample; start: number; stableFrames: number } | null = null;
    let frame = 0;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const visible = (element: Element | null) => Boolean(element && element.getClientRects().length && !element.closest("[hidden]"));
    const anyVisible = (root: ParentNode, selector: string) => [...root.querySelectorAll(selector)].some(visible);
    const finish = (status: Sample["status"]) => {
      if (!active) return;
      const result = { ...active.sample, status };
      active = null;
      clearTimeout(timeout);
      setSamples(previous => [...previous.slice(-99), result]);
      console.info("[navigation]", JSON.stringify(result));
    };
    const check = () => {
      frame = 0;
      if (!active) return;
      const elapsed = Math.round((performance.now() - active.start) * 100) / 100;
      const main = document.querySelector("main");
      const committed = currentPath.current === active.sample.to && location.pathname === active.sample.to;
      if (committed && main && anyVisible(main, "[data-navigation-error]")) { finish("error"); return; }
      const pageLoading = main && anyVisible(main, "[data-page-loading]");
      const sectionLoading = main && anyVisible(main, "[data-section-loading]");
      if (committed && active.sample.routeMs === null) active.sample.routeMs = elapsed;
      const firstBlock = committed && main && !pageLoading && (anyVisible(main, "[data-ready-block]") || (!sectionLoading && visible(main.querySelector("h1"))));
      if (firstBlock && active.sample.firstBlockMs === null) active.sample.firstBlockMs = elapsed;
      if (active.sample.visualMs === null && (anyVisible(document, "[data-navigation-pending=true]") || (committed && (pageLoading || firstBlock)))) active.sample.visualMs = elapsed;
      const ready = firstBlock && !sectionLoading;
      active.stableFrames = ready ? active.stableFrames + 1 : 0;
      if (active.stableFrames >= 2) { active.sample.readyMs = elapsed; finish("complete"); }
      else if (ready) frame = requestAnimationFrame(check);
    };
    const schedule = () => { if (active && !frame) frame = requestAnimationFrame(check); };
    inspect.current = schedule;
    const start = (to: string, kind: Sample["kind"]) => {
      if (!ROUTES.has(to)) { finish("cancelled"); return; }
      finish("cancelled");
      active = { start: performance.now(), stableFrames: 0, sample: {
        id: ++sequence, kind, from: routeName(currentPath.current), to, startedAt: new Date().toISOString(), release,
        visualMs: null, routeMs: null, firstBlockMs: null, readyMs: null, status: "timeout",
      } };
      timeout = setTimeout(() => finish("timeout"), 30_000);
      schedule();
    };
    const click = (event: MouseEvent) => {
      if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.defaultPrevented) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a.nav-link") : null;
      if (!link || link.target || link.hasAttribute("download")) return;
      const target = new URL(link.href);
      if (target.origin !== location.origin || target.pathname === currentPath.current) return;
      start(target.pathname, "click");
    };
    const history = () => start(location.pathname, "history");
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-navigation-pending", "hidden", "style"] });
    document.addEventListener("click", click, true);
    window.addEventListener("popstate", history);
    return () => {
      inspect.current = () => {};
      observer.disconnect(); cancelAnimationFrame(frame); clearTimeout(timeout);
      document.removeEventListener("click", click, true); window.removeEventListener("popstate", history);
    };
  }, [enabled, release]);
  // Permite exportar la evidencia desde DevTools o herramientas DOM, sin datos de sesión/filtros.
  return <output id="navigation-measurements" hidden>{JSON.stringify(samples)}</output>;
}
