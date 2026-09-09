export type NavigationKind = "click" | "history" | "initial";
export type NavigationSample = {
  id: number; kind: NavigationKind; condition: string; environment: string; from: string; to: string; startedAt: string; release: string;
  visualMs: number | null; routeMs: number | null; firstBlockMs: number | null; readyMs: number | null;
  status: "complete" | "cancelled" | "timeout" | "error"; requestIds: string[]; renderedBeforeStart: boolean;
};
const ROUTES = new Set(["/", "/calendario", "/contenido", "/tareas", "/marcas", "/generador", "/guiones", "/estructuras", "/arquetipos", "/metricas", "/tutorial", "/equipo", "/actividad", "/ajustes"]);
const routeName = (path: string) => ROUTES.has(path) ? path : "detail";

/** Máquina independiente del DOM para poder probar cancelaciones y callbacks antiguos. */
export class NavigationTracker {
  private sequence = 0;
  active: { sample: NavigationSample; target: string; start: number; stableFrames: number } | null = null;
  constructor(private emit: (sample: NavigationSample) => void) {}

  begin(to: string, from: string, kind: NavigationKind, now: number, startedAt: string, release: string, environment: string, condition: string) {
    this.finish("cancelled");
    // Volver al enlace de la página aún visible cancela el intento anterior; no es una carga nueva.
    if (to === from && kind === "click") return null;
    this.active = { target: to, start: now, stableFrames: 0, sample: {
      id: ++this.sequence, kind, condition, environment, from: routeName(from), to: routeName(to), startedAt, release,
      visualMs: null, routeMs: null, firstBlockMs: null, readyMs: null, status: "timeout", requestIds: [], renderedBeforeStart: false,
    } };
    return this.sequence;
  }

  observe(state: { path: string; visual: boolean; firstBlock: boolean; ready: boolean; error: boolean; requestIds: string[]; renderedBeforeStart: boolean }, now: number) {
    if (!this.active) return;
    const { sample, target, start } = this.active;
    const elapsed = Math.max(0, Math.round((now - start) * 100) / 100);
    const committed = state.path === target;
    if (committed && state.error) return this.finish("error");
    if (state.visual && sample.visualMs === null) sample.visualMs = elapsed;
    if (committed && sample.routeMs === null) sample.routeMs = elapsed;
    if (committed && state.firstBlock && sample.firstBlockMs === null) sample.firstBlockMs = elapsed;
    this.active.stableFrames = committed && state.ready ? this.active.stableFrames + 1 : 0;
    if (this.active.stableFrames >= 2) {
      sample.readyMs = elapsed;
      sample.requestIds = [...new Set(state.requestIds)].slice(0, 20);
      sample.renderedBeforeStart = state.renderedBeforeStart;
      this.finish("complete");
    }
  }

  finish(status: NavigationSample["status"], expectedId?: number) {
    if (!this.active || (expectedId !== undefined && this.active.sample.id !== expectedId)) return;
    const result = { ...this.active.sample, status };
    this.active = null;
    this.emit(result);
  }
}
