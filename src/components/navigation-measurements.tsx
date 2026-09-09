"use client";

import { NavigationTracker, type NavigationKind, type NavigationSample } from "@/lib/navigation-tracker";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** Opt-in local al navegador. IDs enlazan con logs si PERFORMANCE_LOGS=1. */
export function NavigationMeasurements({ enabled = false, release = "local", environment = "unknown" }: { enabled?: boolean; release?: string; environment?: string }) {
  const pathname = usePathname();
  const currentPath = useRef(pathname);
  const previousPath = useRef(pathname);
  const inspect = useRef<() => void>(() => {});
  const [samples, setSamples] = useState<NavigationSample[]>([]);
  useEffect(() => { if (currentPath.current !== pathname) previousPath.current = currentPath.current; currentPath.current = pathname; inspect.current(); }, [pathname]);

  useEffect(() => {
    let configured = enabled;
    try {
      const option = new URLSearchParams(location.search).get("medir");
      if (option === "1" || option === "0") sessionStorage.setItem("intia.measure-navigation", option);
      const preference = sessionStorage.getItem("intia.measure-navigation");
      configured = preference === "0" ? false : enabled || preference === "1";
    } catch { /* La configuración sigue disponible sin sessionStorage. */ }
    if (!configured) return;
    let frame = 0;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let lastInteraction = performance.now();
    const tracker = new NavigationTracker(result => {
      clearTimeout(timeout);
      setSamples(previous => [...previous.slice(-1999), result]);
      console.info("[navigation]", JSON.stringify(result));
    });
    const visible = (element: Element | null) => Boolean(element && element.getClientRects().length && !element.closest("[hidden]"));
    const anyVisible = (root: ParentNode, selector: string) => [...root.querySelectorAll(selector)].some(visible);
    const check = () => {
      frame = 0;
      if (!tracker.active) return;
      const main = document.querySelector("main");
      const committed = currentPath.current === tracker.active.target && location.pathname === tracker.active.target;
      const pageLoading = Boolean(main && anyVisible(main, "[data-page-loading]"));
      const sectionLoading = Boolean(main && anyVisible(main, "[data-section-loading]"));
      const firstBlock = Boolean(committed && main && !pageLoading && (anyVisible(main, "[data-ready-block]") || (!sectionLoading && visible(main.querySelector("h1")))));
      const markers = [...(main?.querySelectorAll<HTMLElement>("[data-performance-render]") ?? [])];
      const pending = anyVisible(document, "[data-navigation-pending=true]");
      tracker.observe({
        path: committed ? tracker.active.target : "uncommitted",
        visual: pending || committed && (pageLoading || firstBlock), firstBlock,
        ready: firstBlock && !sectionLoading && !pending,
        error: Boolean(main && anyVisible(main, "[data-navigation-error]")),
        requestIds: markers.map(marker => marker.dataset.performanceRender || "").filter(id => /^[a-f0-9-]{36}$/i.test(id)),
        renderedBeforeStart: markers.some(marker => Date.parse(marker.dataset.renderedAt || "") < Date.parse(tracker.active!.sample.startedAt)),
      }, performance.now());
      if (tracker.active && firstBlock) frame = requestAnimationFrame(check);
    };
    const schedule = () => { if (tracker.active && !frame) frame = requestAnimationFrame(check); };
    inspect.current = schedule;
    const start = (to: string, kind: NavigationKind) => {
      clearTimeout(timeout);
      const now = performance.now();
      const condition = kind === "initial" ? "initial" : kind === "history" ? "history" : now - lastInteraction >= 300_000 ? "after-idle" : "continuous";
      lastInteraction = now;
      const from = kind === "history" && currentPath.current === to ? previousPath.current : currentPath.current;
      const id = tracker.begin(to, from, kind, kind === "initial" ? 0 : now,
        new Date(kind === "initial" ? performance.timeOrigin : Date.now()).toISOString(), release, environment, condition);
      if (id !== null) { timeout = setTimeout(() => tracker.finish("timeout", id), 30_000); schedule(); }
    };
    const click = (event: MouseEvent) => {
      if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.defaultPrevented) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.target && link.target !== "_self" || link.hasAttribute("download")) return;
      const target = new URL(link.href);
      if (target.origin !== location.origin) { tracker.finish("cancelled"); return; }
      if (!link.classList.contains("nav-link")) { tracker.finish("cancelled"); return; }
      // Volver a la ruta aún visible también cancela el intento pendiente.
      start(target.pathname, "click");
    };
    const history = () => start(location.pathname, "history");
    const hidden = () => { if (document.visibilityState === "hidden") tracker.finish("cancelled"); };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-navigation-pending", "hidden", "style"] });
    document.addEventListener("click", click, true);
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("popstate", history);
    start(location.pathname, "initial");
    return () => {
      inspect.current = () => {};
      observer.disconnect(); cancelAnimationFrame(frame); clearTimeout(timeout);
      document.removeEventListener("click", click, true); document.removeEventListener("visibilitychange", hidden); window.removeEventListener("popstate", history);
    };
  }, [enabled, release, environment]);
  return <output id="navigation-measurements" hidden>{JSON.stringify(samples)}</output>;
}
