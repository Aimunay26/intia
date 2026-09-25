"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Compass,
  ExternalLink,
  Minimize2,
  SkipForward,
  Sparkles,
  X,
} from "lucide-react";

import { useGuia } from "./guia-context";
import { GUIA_TARGETS, selectorGuia } from "@/lib/guia/catalogo";
import { pathnameCubrePaso } from "@/lib/guia/modulos";
import { anclaEnDom, anclaVisible, esVisible, modalAbierto, quienTapa } from "@/lib/guia/dom";
import { cn } from "@/lib/utils";

/**
 * La tarjeta flotante, el aro y la flecha de la guía.
 *
 * Lo que aprendió esta versión de la anterior:
 * - `buscarElemento` solo MIDE. Antes hacía scroll en cada tick de 350 ms y
 *   en cada evento de scroll: la página se peleaba con el usuario. Ahora el
 *   desplazamiento vive en un efecto aparte que corre una vez por paso y ruta.
 * - Cada medida pasa por un guard de igualdad: misma geometría, misma
 *   referencia, cero re-renders en reposo. Antes se creaba un objeto nuevo
 *   tres veces por segundo y la tarjeta temblaba.
 * - La colocación se deriva con useMemo y comprueba el solape DESPUÉS de
 *   recortar al viewport. Antes recortaba y dejaba la tarjeta encima de lo que
 *   señalaba. Si hay un modal abierto, la tarjeta va fuera de su panel.
 * - La prueba de que un formulario se envió es el evento `submit` más el
 *   cambio de ruta, no el clic: `required` bloquea el envío sin disparar
 *   `submit`. Cuando el servidor redirige, la guía avanza sola.
 */

type Rect = { top: number; left: number; width: number; height: number; bottom: number; right: number };
type Dir = "top" | "bottom" | "left" | "right";
type Viewport = { w: number; h: number; offX: number; offY: number };
type Flecha = { x1: number; y1: number; x2: number; y2: number; dir: Dir };
type Colocacion = {
  top: number;
  left: number;
  width: number;
  maxH: number | null;
  flecha: Flecha | null;
  compacto: boolean;
};

function useMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

const casiIgual = (a: number, b: number) => Math.abs(a - b) < 0.5;
const rectDe = (r: DOMRect): Rect => ({
  top: r.top,
  left: r.left,
  width: r.width,
  height: r.height,
  bottom: r.bottom,
  right: r.right,
});
const mismoRect = (a: Rect | null, b: Rect | null) =>
  a === b ||
  (!!a &&
    !!b &&
    casiIgual(a.top, b.top) &&
    casiIgual(a.left, b.left) &&
    casiIgual(a.width, b.width) &&
    casiIgual(a.height, b.height));

/** Lo que el usuario ve de verdad: en iOS/Android el teclado encoge visualViewport, no innerHeight. */
function leerViewport(): Viewport {
  const vv = window.visualViewport;
  return {
    w: Math.round(vv?.width ?? window.innerWidth),
    h: Math.round(vv?.height ?? window.innerHeight),
    offX: Math.round(vv?.offsetLeft ?? 0),
    offY: Math.round(vv?.offsetTop ?? 0),
  };
}

/**
 * Valor real del campo señalado al pulsar Siguiente. Cubre campos rellenados
 * por el extractor de PDF (sin evento input) y campos vaciados después de
 * escribir. null = el ancla no es un campo de texto o selección.
 */
function valorCampoSenalado(el: HTMLElement | null): string | null {
  if (!el || !el.matches("input, textarea, select")) return null;
  const tipo = (el as HTMLInputElement).type;
  if (tipo === "hidden" || tipo === "checkbox" || tipo === "radio" || tipo === "file") return null;
  return ((el as HTMLInputElement).value ?? "").trim();
}

/** El contenedor con scroll más cercano que de verdad desborda. */
function contenedorConScroll(el: HTMLElement): HTMLElement | null {
  let p = el.parentElement;
  while (p && p !== document.body) {
    const oy = window.getComputedStyle(p).overflowY;
    if ((oy === "auto" || oy === "scroll") && p.scrollHeight > p.clientHeight) return p;
    p = p.parentElement;
  }
  return null;
}

/**
 * ¿El ancla queda fuera de la caja visible de su contenedor con scroll? Pasa
 * con el enlace «Ajustes» al pie del menú lateral en pantallas bajas: está
 * dentro del viewport, así que la comprobación de viewport no lo delata, y
 * elementFromPoint devuelve el pie del menú, con lo que se daba por tapada.
 */
function recortadaPorContenedor(el: HTMLElement, r: DOMRect): HTMLElement | null {
  const c = contenedorConScroll(el);
  if (!c) return null;
  const cr = c.getBoundingClientRect();
  return r.top < cr.top || r.bottom > cr.bottom ? c : null;
}

export function GuiaOverlay() {
  const mounted = useMounted();
  const pathname = usePathname();
  const {
    activo,
    terminado,
    moduloActual,
    pasoActual,
    moduloIndex,
    pasoIndex,
    totalModulos,
    totalPasosModulo,
    minimizado,
    siguientePaso,
    pasoAnterior,
    irAPaso,
    cerrarGuia,
    reiniciarGuia,
    minimizarGuia,
    restaurarGuia,
    navegarAPasoActual,
    abrirMenuMovil,
  } = useGuia();

  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [encontrado, setEncontrado] = useState(false);
  const [tapado, setTapado] = useState(false);
  const [modalRect, setModalRect] = useState<Rect | null>(null);
  const [viewport, setViewport] = useState<Viewport>({ w: 1024, h: 768, offX: 0, offY: 0 });
  const [cardSize, setCardSize] = useState<{ width: number; height: number }>({ width: 390, height: 280 });
  const [alertaRoja, setAlertaRoja] = useState<string | null>(null);
  const [accionRealizada, setAccionRealizada] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const targetElRef = useRef<HTMLElement | null>(null);
  const ultimoScrollRef = useRef<string | null>(null);
  /** Ruta en la que se ejecutó la acción del paso: si cambia, la acción tuvo éxito. */
  const rutaAlActuar = useRef<string | null>(null);
  const menuAbiertoPara = useRef<string | null>(null);
  /**
   * Ruta en la que se vio el ancla de ESTE paso (null si nunca estuvo: lista
   * vacía). Se guarda la ruta y no un booleano porque un adelanto real ocurre
   * dentro de la misma pantalla; si la ruta cambió (abrir una tarjeta de marca
   * desde la lista) el ancla desapareció por la navegación, no por adelantarse.
   */
  const vistoRef = useRef<string | null>(null);
  /** Id del paso desde el que ya se resincronizó: una sola vez por paso. */
  const saltoRef = useRef<string | null>(null);

  // La intención vive en el catálogo; el prefijo «btn-» es solo el valor por defecto.
  const esPasoDeAccion = pasoActual.requiereAccion ?? pasoActual.target.startsWith("btn-");
  // Un enlace del menú se cumple llegando a su sección, no pulsando Siguiente.
  const esNav = pasoActual.target.startsWith("nav-");

  /* ------------------------------------------------- reset por paso -- */
  useEffect(() => {
    setAlertaRoja(null);
    setAccionRealizada(false);
    setTapado(false);
    rutaAlActuar.current = null;
    ultimoScrollRef.current = null;
    vistoRef.current = null;
    saltoRef.current = null;
  }, [pasoActual.id]);

  /* ------------------------------------------ delegación de eventos -- */
  useEffect(() => {
    if (!activo || terminado || !pasoActual?.target) return;
    const targetKey = pasoActual.target;

    // Devuelve el ancla que satisface el paso, o null. Se devuelve el elemento
    // porque hay que saber QUÉ es (un botón de envío no prueba nada con su clic).
    const resolverAncla = (el: Element | null | undefined): HTMLElement | null => {
      const anchor = el?.closest<HTMLElement>("[data-guia]") ?? null;
      const v = anchor?.getAttribute("data-guia");
      if (!anchor || !v) return null;
      if (v === targetKey) return anchor;
      if (
        targetKey === GUIA_TARGETS.BTN_NUEVA_MARCA_HEADER &&
        v === GUIA_TARGETS.BTN_NUEVA_MARCA_EMPTY
      ) {
        return anchor;
      }
      return null;
    };

    // `required` puede bloquear el envío sin disparar `submit`: el clic en un
    // botón de envío no cuenta; cuenta el evento submit, que solo se despacha
    // si la validación nativa pasó.
    const esBotonDeEnvio = (a: HTMLElement) =>
      a instanceof HTMLButtonElement && a.type === "submit" && a.form !== null;

    const marcarHecha = () => {
      setAccionRealizada(true);
      setAlertaRoja(null);
      // NO el pathname del closure: puede estar obsoleto.
      rutaAlActuar.current = window.location.pathname;
    };

    const handleEvent = (e: Event) => {
      if (e.type === "submit") {
        // e.target es el <form>; el ancla está en un botón HIJO.
        const form = e.target as HTMLFormElement;
        const submitter = (e as SubmitEvent).submitter;
        if (resolverAncla(submitter) || form.querySelector(`[data-guia="${targetKey}"]`)) {
          marcarHecha();
        }
        return;
      }
      const ancla = resolverAncla(e.target as Element | null);
      if (!ancla) return;
      if (e.type === "click" && esBotonDeEnvio(ancla)) return;
      marcarHecha();
      // El objetivo abre una ventana y el siguiente paso vive dentro: no obligar a pulsar Siguiente.
      // Avanza también con la guía minimizada, a propósito: así el efecto de
      // resincronización ve el ancla del paso nuevo en la misma pantalla y lo
      // anota como «visto». Si se frenara aquí, al restaurar la guía el paso
      // seguiría siendo el botón ya pulsado (acción hecha → no resincroniza) y
      // el usuario tendría que pulsar Siguiente y Omitir a ciegas.
      if (e.type === "click" && pasoActual.avanzarAlInteractuar) siguientePaso();
      // Enlace del menú con la sección ya abierta: la ruta no va a cambiar y el
      // efecto de abajo nunca avanzaría. El clic ya cumple el paso.
      if (e.type === "click" && esNav && pathnameCubrePaso(window.location.pathname, pasoActual)) {
        siguientePaso();
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
  }, [activo, terminado, pasoActual, esNav, siguientePaso]);

  /* ------------------------- avance automático tras un redirect -- */
  // El usuario hizo la acción y la ruta cambió (crearMarca → /marcas/[id]): el
  // paso está hecho. No obligarle a pulsar Siguiente ni enseñarle «Elemento en
  // otra sección» sobre un paso cumplido.
  useEffect(() => {
    if (!activo || terminado || !(esPasoDeAccion || esNav) || !accionRealizada) return;
    const origen = rutaAlActuar.current;
    if (origen !== null && pathname !== origen) {
      rutaAlActuar.current = null;
      setAlertaRoja(null);
      setAccionRealizada(false);
      siguientePaso();
    }
  }, [pathname, activo, terminado, esPasoDeAccion, esNav, accionRealizada, siguientePaso]);

  /* ----------------------------------------- medir, y solo medir -- */
  const buscarElemento = useCallback(() => {
    if (!activo || terminado || minimizado || !pasoActual) {
      setTargetRect(null);
      setEncontrado(false);
      targetElRef.current = null;
      return;
    }

    const vp = leerViewport();
    setViewport((p) =>
      p.w === vp.w && p.h === vp.h && p.offX === vp.offX && p.offY === vp.offY ? p : vp
    );

    const modal = modalAbierto();
    const mr = modal ? rectDe(modal.getBoundingClientRect()) : null;
    setModalRect((p) => (mismoRect(p, mr) ? p : mr));

    const visibles = Array.from(
      document.querySelectorAll<HTMLElement>(selectorGuia(pasoActual.target))
    ).filter((el) => esVisible(el, modal));
    // Preferir el ancla NO tapada (el banner del formulario frente al botón de
    // cabecera que queda bajo la barra fija en móvil).
    const visible = visibles.find((el) => !quienTapa(el)) ?? visibles[0];

    if (!visible) {
      targetElRef.current = null;
      setTargetRect(null);
      setEncontrado(false);
      setTapado(false);
      return;
    }
    const r = visible.getBoundingClientRect();
    targetElRef.current = visible;
    setTargetRect((p) => (mismoRect(p, rectDe(r)) ? p : rectDe(r)));
    setEncontrado(true);
    setTapado(Boolean(quienTapa(visible, r)));
  }, [activo, terminado, minimizado, pasoActual]);

  useEffect(() => {
    buscarElemento();
    let frame = 0;
    const enFrame = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        buscarElemento();
      });
    };
    window.addEventListener("scroll", enFrame, true);
    window.addEventListener("resize", enFrame);
    window.visualViewport?.addEventListener("resize", enFrame);
    window.visualViewport?.addEventListener("scroll", enFrame);
    // Red de seguridad para ventanas que abren o cierran sin evento: con el
    // guard de igualdad, sondear ya no cuesta renders.
    const timer = setInterval(buscarElemento, 500);
    return () => {
      window.removeEventListener("scroll", enFrame, true);
      window.removeEventListener("resize", enFrame);
      window.visualViewport?.removeEventListener("resize", enFrame);
      window.visualViewport?.removeEventListener("scroll", enFrame);
      if (frame) cancelAnimationFrame(frame);
      clearInterval(timer);
    };
  }, [buscarElemento]);

  /* ---------------------------------------- tamaño real de la tarjeta -- */
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const medir = () => {
      const inner = innerRef.current;
      // Altura NATURAL: si se mide con el maxHeight puesto, el colocador oscila al encoger.
      const prev = inner?.style.maxHeight ?? "";
      if (inner) inner.style.maxHeight = "";
      const r = card.getBoundingClientRect();
      if (inner) inner.style.maxHeight = prev;
      const w = Math.round(r.width);
      const h = Math.round(r.height);
      if (w > 0 && h > 0) {
        setCardSize((p) => (p.width === w && p.height === h ? p : { width: w, height: h }));
      }
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(card);
    return () => ro.disconnect();
  }, [pasoActual.id, alertaRoja, encontrado, tapado]);

  /* ------------------------------------------- colocación derivada -- */
  const colocacion = useMemo<Colocacion>(() => {
    const M = 16;
    const G = 20;
    const MIN_H = 190;
    const { w: VW, h: VH, offX, offY } = viewport;
    const ch = cardSize.height || 280;
    const sinFlecha = (top: number, left: number, width: number, compacto = false): Colocacion => ({
      top: Math.round(top),
      left: Math.round(left),
      width,
      maxH: null,
      flecha: null,
      compacto,
    });

    // Sin objetivo: esquina inferior derecha. No centrar: tras un redirect la
    // ficha está debajo y la taparíamos.
    if (!targetRect || !encontrado || tapado) {
      if (modalRect) {
        const canal = Math.max(offX + VW - modalRect.right, modalRect.left - offX) - G - M;
        if (canal >= 280) {
          const w = Math.min(390, canal);
          const der = offX + VW - modalRect.right >= modalRect.left - offX;
          return sinFlecha(offY + M, der ? modalRect.right + G : modalRect.left - G - w, w);
        }
      }
      const w = Math.min(390, VW - 2 * M);
      return sinFlecha(offY + VH - ch - M, offX + VW - w - M, w);
    }

    const T = targetRect;
    const cx = T.left + T.width / 2;
    const cy = T.top + T.height / 2;
    const clampY = (t: number, h: number) => Math.max(offY + M, Math.min(t, offY + VH - h - M));
    const clampX = (l: number, w: number) => Math.max(offX + M, Math.min(l, offX + VW - w - M));
    const pisa = (l: number, t: number, w: number, h: number) =>
      l < T.right + G && l + w > T.left - G && t < T.bottom + G && t + h > T.top - G;
    const flechaPara = (dir: Dir, top: number, left: number, w: number, h: number): Flecha => {
      const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(v, b));
      if (dir === "bottom" || dir === "top") {
        const x1 = left + w / 2;
        return {
          x1,
          y1: dir === "bottom" ? top : top + h,
          x2: clamp(x1, T.left, T.right),
          y2: dir === "bottom" ? T.bottom + 4 : T.top - 4,
          dir,
        };
      }
      const y1 = top + h / 2;
      return {
        x1: dir === "right" ? left : left + w,
        y1,
        x2: dir === "right" ? T.right + 4 : T.left - 4,
        y2: clamp(y1, Math.max(T.top, offY), Math.min(T.bottom, offY + VH)),
        dir,
      };
    };

    // A) Objetivo dentro de un modal: la tarjeta va FUERA del panel (canal
    //    lateral) o compacta en la esquina.
    if (modalRect) {
      const canalDer = offX + VW - modalRect.right - G - M;
      const canalIzq = modalRect.left - offX - G - M;
      const der = canalDer >= canalIzq;
      const canal = Math.max(canalDer, canalIzq);
      if (canal >= 280) {
        const w = Math.min(390, canal);
        const left = der ? modalRect.right + G : modalRect.left - G - w;
        const top = clampY(cy - ch / 2, ch);
        return {
          top,
          left,
          width: w,
          maxH: null,
          flecha: flechaPara(der ? "right" : "left", top, left, w, ch),
          compacto: false,
        };
      }
      // Sin canal (pantallas estrechas): compacta abajo a la derecha, sin
      // detalle. Si pisa el objetivo, el efecto de scroll desplaza el modal.
      const w = Math.min(390, VW - 2 * M);
      const left = offX + VW - w - M;
      const top = offY + VH - ch - M;
      const f = pisa(left, top, w, ch) ? null : flechaPara("bottom", top, left, w, ch);
      return { top, left, width: w, maxH: null, flecha: f, compacto: true };
    }

    // B) Sin modal. Nivel 1: primer lado, en orden de preferencia, donde la
    //    tarjeta ENTERA no pisa el objetivo, comprobado tras el recorte.
    const cw = Math.min(390, VW - 2 * M);
    const pref = pasoActual.posicionPreferida;
    const orden: Dir[] = [...(pref && pref !== "auto" ? [pref] : []), "bottom", "top", "right", "left"];
    const posicionar = (dir: Dir, w: number, h: number) => ({
      top: clampY(dir === "bottom" ? T.bottom + G : dir === "top" ? T.top - G - h : cy - h / 2, h),
      left: clampX(dir === "right" ? T.right + G : dir === "left" ? T.left - G - w : cx - w / 2, w),
    });
    for (const dir of orden) {
      const p = posicionar(dir, cw, ch);
      if (!pisa(p.left, p.top, cw, ch)) {
        return { ...p, width: cw, maxH: null, flecha: flechaPara(dir, p.top, p.left, cw, ch), compacto: false };
      }
    }
    // Nivel 2: encoger al hueco vertical mayor (el cuerpo hace scroll interno).
    const huecoTop = T.top - offY - G - M;
    const huecoBottom = offY + VH - T.bottom - G - M;
    const dir: Dir = huecoBottom >= huecoTop ? "bottom" : "top";
    const hueco = Math.floor(Math.max(huecoTop, huecoBottom));
    if (hueco >= MIN_H) {
      const h = Math.min(ch, hueco);
      const p = posicionar(dir, cw, h);
      return { ...p, width: cw, maxH: hueco, flecha: flechaPara(dir, p.top, p.left, cw, h), compacto: false };
    }
    // Nivel 3: objetivo casi tan alto como la pantalla. Esquina que menos lo
    // tapa, sin flecha: el aro ya lo marca.
    const esquinas = [
      { top: offY + M, left: offX + M },
      { top: offY + M, left: offX + VW - cw - M },
      { top: offY + VH - ch - M, left: offX + M },
      { top: offY + VH - ch - M, left: offX + VW - cw - M },
    ];
    const area = (e: { top: number; left: number }) =>
      Math.max(0, Math.min(e.left + cw, T.right) - Math.max(e.left, T.left)) *
      Math.max(0, Math.min(e.top + ch, T.bottom) - Math.max(e.top, T.top));
    const mejor = esquinas.reduce((a, b) => (area(b) < area(a) ? b : a));
    return sinFlecha(mejor.top, mejor.left, cw);
  }, [targetRect, encontrado, tapado, modalRect, viewport, cardSize, pasoActual]);

  /* --------------------------------- un solo scroll por paso y ruta -- */
  // Después, la página es del usuario: si se aleja del objetivo no lo perseguimos.
  useEffect(() => {
    if (!activo || minimizado || !encontrado || !pasoActual) return;
    const clave = `${pasoActual.id}@${pathname}`;
    if (ultimoScrollRef.current === clave) return;
    ultimoScrollRef.current = clave;
    const el = targetElRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vp = leerViewport();
    const reducir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Tarjeta compacta que pisa el objetivo (modal en pantalla estrecha):
    // desplazar una vez el contenedor con scroll del objetivo, no la página.
    if (colocacion.compacto && colocacion.flecha === null) {
      const scroller = contenedorConScroll(el);
      if (scroller) {
        const G = 20;
        scroller.scrollTop += r.bottom - (colocacion.top - G);
        return;
      }
    }

    // Recortada por su contenedor: corrección pequeña e instantánea, sin animar.
    if (recortadaPorContenedor(el, r)) {
      el.scrollIntoView({ behavior: "auto", block: "nearest", inline: "nearest" });
      return;
    }

    if (r.top >= vp.offY && r.bottom <= vp.offY + vp.h) return; // ya se ve entero
    // "center" deja hueco para la tarjeta y saca el ancla de debajo de la
    // cabecera fija en móvil; si el objetivo es más alto que la pantalla,
    // mostrar su inicio y no insistir.
    el.scrollIntoView({
      behavior: reducir ? "auto" : "smooth",
      block: r.height < vp.h ? "center" : "start",
      inline: "nearest",
    });
  }, [activo, minimizado, encontrado, pasoActual, pathname, colocacion]);

  /* ------------------------- menú plegado en móvil: abrirlo una vez -- */
  useEffect(() => {
    if (!activo || minimizado || !pasoActual.target.startsWith("nav-")) return;
    if (menuAbiertoPara.current === pasoActual.id) return;
    if (anclaEnDom(pasoActual.target) && !anclaVisible(pasoActual.target)) {
      menuAbiertoPara.current = pasoActual.id;
      abrirMenuMovil();
    }
  }, [activo, minimizado, pasoActual.id, pasoActual.target, abrirMenuMovil, encontrado]);

  /* -------------- resincronizar cuando el usuario se adelanta -- */
  // El ancla de este paso estaba y desapareció (pulsó «Continuar» de etapa en
  // el generador antes que «Siguiente») y ya se ve la de un paso POSTERIOR del
  // mismo módulo: la guía se coloca ahí sola en vez de pedir dos «Omitir» a
  // ciegas. Solo hacia delante y al más cercano, una vez por paso, nunca a
  // pasos puente ni de menú, nunca cruza de módulo y no navega: el ancla de
  // destino ya está en pantalla. No va dentro de `buscarElemento`, que solo
  // mide y corre en cada scroll.
  useEffect(() => {
    if (!activo || terminado) return;
    // Un enlace del menú se cumple con su clic y el cambio de ruta (efectos de
    // arriba): aquí no se compite con ellos.
    if (esNav) return;
    // `encontrado` es la medida del render anterior: al cambiar de paso aún es
    // la del paso viejo. Se pregunta al DOM por el ancla de ESTE paso, con el
    // mismo criterio de visibilidad que usa el resto de la guía. Se anota
    // también con la guía minimizada: la delegación de eventos sigue
    // avanzando pasos en ese estado y, sin la marca, al restaurar no habría
    // forma de distinguir «se adelantó» de «lista vacía».
    if (anclaVisible(pasoActual.target)) {
      vistoRef.current = pathname;
      return;
    }
    // Minimizada: se marca «visto» pero no se salta; se recoloca al restaurar
    // (`minimizado` está en las dependencias).
    if (minimizado) return;
    // Nunca estuvo en ESTA ruta: lista vacía o cambio de sección (abrir una
    // tarjeta desde la lista no es adelantarse; los redirects tras una acción
    // ya los cubre el efecto de arriba).
    if (vistoRef.current !== pathname) return;
    if (accionRealizada && esPasoDeAccion) return; // ya lo cubre «Acción completada» / redirect
    if (saltoRef.current === pasoActual.id) return;
    if (!pathnameCubrePaso(pathname, pasoActual)) return;
    const destino = moduloActual.pasos.findIndex(
      (p, i) =>
        i > pasoIndex &&
        !p.puente &&
        !p.target.startsWith("nav-") &&
        pathnameCubrePaso(pathname, p) &&
        anclaVisible(p.target) !== null
    );
    if (destino < 0) return;
    saltoRef.current = pasoActual.id;
    irAPaso(destino);
    // `encontrado` está en la lista solo como disparador: cambia cuando el
    // ancla aparece o desaparece, que es justo cuando hay que volver a mirar.
  }, [
    activo,
    terminado,
    minimizado,
    esNav,
    encontrado,
    accionRealizada,
    esPasoDeAccion,
    pasoActual,
    pasoIndex,
    moduloActual,
    pathname,
    irAPaso,
  ]);

  /* ---------------------------------------------------- avanzar -- */
  const limpiar = () => {
    setAlertaRoja(null);
    setAccionRealizada(false);
    rutaAlActuar.current = null;
  };

  const handleAvanzar = () => {
    if (!encontrado) {
      // El usuario YA ejecutó la acción y el objetivo desapareció (ventana
      // cerrada, redirect): es éxito, no extravío.
      if (accionRealizada && esPasoDeAccion) {
        limpiar();
        siguientePaso();
        return;
      }
      // Fuera de la sección del paso: llevarle. Dentro (lista vacía, ventana
      // cerrada): avanzar sin atrapar.
      if (!pathnameCubrePaso(pathname, pasoActual)) {
        navegarAPasoActual();
        return;
      }
      limpiar();
      siguientePaso();
      return;
    }

    if (!alertaRoja) {
      const el = targetElRef.current as HTMLButtonElement | null;
      // Un botón deshabilitado no emite click: no exigir lo imposible.
      const deshabilitado = el?.disabled === true;
      if (esPasoDeAccion && !accionRealizada && !deshabilitado) {
        setAlertaRoja(
          "Interactúa con el elemento señalado (haz clic o elige una opción), o pulsa Siguiente de nuevo para continuar."
        );
        return;
      }
      const valor = valorCampoSenalado(targetElRef.current);
      if (valor !== null && valor === "") {
        setAlertaRoja(
          "Este campo está vacío. Escribe aquí lo que se te pide, o pulsa Siguiente de nuevo para saltarlo."
        );
        return;
      }
    }

    limpiar();
    siguientePaso();
  };

  const handleOmitir = () => {
    limpiar();
    siguientePaso();
  };

  if (!mounted || !activo) return null;

  /* ------------------------------------------------------ terminada -- */
  // Al pulsar Finalizar (o el botón del último paso) la guía no desaparece sin
  // más: una tarjeta de cierre confirma que se completó y ofrece repetirla.
  if (terminado) {
    return createPortal(
      <div className="fixed inset-x-4 bottom-5 z-[9999] sm:inset-x-auto sm:right-5 sm:w-[360px]">
        <div
          role="dialog"
          aria-label="Tutorial completado"
          className="bg-surface text-ink border-brand/40 space-y-3 rounded-2xl border-2 p-5 shadow-2xl"
        >
          <div className="flex items-center gap-2.5">
            <span className="bg-ok/15 text-ok flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
              <CheckCircle2 size={18} />
            </span>
            <div className="text-[15px] font-bold">¡Completaste el tutorial!</div>
          </div>
          <p className="text-inksoft text-[13px] leading-relaxed">
            Recorriste los {totalModulos} módulos. Desde ahora todo lo que crees es tuyo; puedes
            repetir cualquier módulo desde «Cómo se usa».
          </p>
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={reiniciarGuia} className="btn btn-ghost btn-sm text-[12px]">
              Volver a empezar
            </button>
            <button type="button" onClick={cerrarGuia} className="btn btn-primary btn-sm text-[12px] font-semibold">
              Cerrar
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  /* ----------------------------------------------------- minimizada -- */
  if (minimizado) {
    return createPortal(
      <div className="fixed right-5 bottom-5 z-[9999]">
        <button
          onClick={restaurarGuia}
          className="btn btn-primary flex items-center gap-2 rounded-full px-4 py-2.5 shadow-2xl transition-transform hover:scale-105"
          title="Restaurar la guía interactiva"
        >
          <Sparkles size={16} className="text-amber-300" />
          <span className="text-[13px] font-semibold">
            Guía activa · Módulo {moduloIndex + 1} ({pasoIndex + 1}/{totalPasosModulo})
          </span>
          <ChevronRight size={14} />
        </button>
      </div>,
      document.body
    );
  }

  /* -------------------------------------- panel de degradación -- */
  const panelNoEncontrado = () => {
    const enSeccion = pathnameCubrePaso(pathname, pasoActual);
    const menuOculto = esNav && anclaEnDom(pasoActual.target) && !anclaVisible(pasoActual.target);
    const hayModal = Boolean(modalRect);
    const motivo =
      accionRealizada && esPasoDeAccion
        ? "hecho"
        : menuOculto
          ? "menu"
          : !enSeccion
            ? "otra-seccion"
            : hayModal
              ? "modal"
              : pasoActual.abreCon
                ? "ventana"
                : "no-disponible";
    const titulo = {
      hecho: "Acción completada",
      menu: "El menú está plegado",
      "otra-seccion": "Elemento en otra sección",
      modal: "Hay una ventana abierta",
      ventana: "La ventana está cerrada",
      "no-disponible": "El elemento no está visible ahora",
    }[motivo];
    const texto = {
      hecho: "Pulsa Siguiente para continuar.",
      menu: "Abre el menú para ver el enlace señalado.",
      "otra-seccion": pasoActual.fallbackTexto,
      modal: "Termina lo que hay en la ventana abierta y ciérrala; seguimos aquí.",
      ventana: pasoActual.fallbackTexto,
      "no-disponible": pasoActual.fallbackTexto,
    }[motivo];

    return (
      <div className="rounded-lg border border-brand/25 bg-brandsoft/70 p-3 text-[12.5px] text-ink space-y-2">
        <div className="font-semibold text-brand flex items-center gap-1.5">
          <Compass size={14} /> {titulo}
        </div>
        <p className="text-inksoft text-[12px] leading-relaxed">{texto}</p>
        <div className="flex items-center gap-2 pt-1">
          {motivo === "menu" && (
            <button type="button" onClick={abrirMenuMovil} className="btn btn-primary btn-sm flex-1 font-bold">
              Abrir menú
            </button>
          )}
          {(motivo === "otra-seccion" || motivo === "ventana") && (
            <button
              type="button"
              onClick={() => {
                setAlertaRoja(null);
                navegarAPasoActual();
              }}
              className="btn btn-primary btn-sm flex-1 font-bold"
            >
              <ExternalLink size={13} /> {motivo === "ventana" ? "Abrir la ventana" : "Llévame allí"}
            </button>
          )}
          {motivo !== "hecho" && (
            <button
              type="button"
              onClick={handleOmitir}
              className="btn btn-ghost btn-sm text-[11.5px] text-inkmuted hover:text-ink"
              title="Saltar este paso y continuar con el siguiente"
            >
              Omitir
            </button>
          )}
        </div>
      </div>
    );
  };

  const flecha = encontrado && !tapado ? colocacion.flecha : null;

  return createPortal(
    <div className="guia-overlay-root pointer-events-none fixed inset-0 z-[9990] overflow-hidden">
      <style>{`
        @keyframes pulseRing {
          0% { box-shadow: 0 0 0 0 var(--ring); }
          70% { box-shadow: 0 0 0 12px transparent; }
          100% { box-shadow: 0 0 0 0 transparent; }
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
        .guia-shake-red { animation: shakeCard 0.4s ease-in-out; }
        .guia-spotlight { animation: pulseRing 2s infinite; }
        .guia-spotlight-red { animation: pulseRedRing 1s infinite; }
        @media (prefers-reduced-motion: reduce) {
          .guia-spotlight, .guia-spotlight-red, .guia-shake-red { animation: none !important; }
        }
      `}</style>

      {/* Aro sobre el objetivo. Si algo lo tapa, el aro miente: no se pinta. */}
      {encontrado && !tapado && targetRect && (
        <div
          className={cn(
            "pointer-events-none fixed z-[9991] rounded-lg transition-[border-color,background-color] duration-200",
            alertaRoja ? "guia-spotlight-red" : "guia-spotlight"
          )}
          style={{
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
            border: alertaRoja ? "3px solid #ef4444" : "2px solid var(--brand)",
            backgroundColor: alertaRoja ? "rgba(239, 68, 68, 0.16)" : "color-mix(in srgb, var(--brand) 8%, transparent)",
          }}
        />
      )}

      {/* Flecha curva de la tarjeta al objetivo */}
      {flecha &&
        (() => {
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
            <svg className="pointer-events-none fixed inset-0 z-[9992] h-full w-full" style={{ overflow: "visible" }}>
              <defs>
                <linearGradient id="guiaGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="var(--brand)" />
                  <stop offset="100%" stopColor="var(--brand-text)" />
                </linearGradient>
                <marker id="guiaArrowhead" markerWidth="10" markerHeight="10" refX="6" refY="5" orient="auto">
                  <path d="M 0 1 L 9 5 L 0 9 z" fill="url(#guiaGradient)" />
                </marker>
              </defs>
              <path d={d} fill="none" stroke="url(#guiaGradient)" strokeWidth="3.5" strokeDasharray="6 3" markerEnd="url(#guiaArrowhead)" />
            </svg>
          );
        })()}

      {/* La tarjeta. role=dialog SIN aria-modal: así modalAbierto() no la confunde con un modal. */}
      <div
        ref={cardRef}
        className={cn("pointer-events-auto fixed z-[9995]", alertaRoja && "guia-shake-red")}
        style={{
          top: colocacion.top,
          left: colocacion.left,
          width: colocacion.width,
          maxHeight: viewport.h - 32,
        }}
        role="dialog"
        aria-label="Paso guiado"
      >
        <div
          ref={innerRef}
          className={cn(
            "bg-surface text-ink rounded-2xl border-2 p-4 sm:p-5 shadow-2xl backdrop-blur-md transition-colors flex flex-col overflow-hidden",
            alertaRoja
              ? "border-amber-500/80 shadow-amber-500/20"
              : "border-brand/40 shadow-[0_12px_48px_-10px_rgba(0,0,0,0.25)] dark:shadow-[0_12px_48px_-10px_rgba(0,0,0,0.7)]"
          )}
          style={{ maxHeight: colocacion.maxH ?? viewport.h - 32 }}
        >
          {/* Cabecera fija */}
          <div className="flex items-center justify-between gap-2 border-b border-line pb-2.5 shrink-0">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand text-brand-ink text-[11px] font-bold">
                {moduloIndex + 1}
              </span>
              <span className="text-inkmuted text-[11.5px] font-semibold uppercase tracking-wider">
                Módulo {moduloIndex + 1} de {totalModulos}
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

          {/* Cuerpo con scroll interno si la pantalla es pequeña */}
          <div className="flex-1 overflow-y-auto min-h-0 py-2.5 space-y-2 pr-1">
            <div>
              <div className="text-brand text-[12px] font-bold">{moduloActual.titulo}</div>
              <h4 className="text-ink mt-0.5 text-[15px] font-bold leading-snug">{pasoActual.titulo}</h4>
            </div>

            <p className="text-inksoft text-[13px] leading-relaxed">{pasoActual.instruccion}</p>

            {pasoActual.detalle && !colocacion.compacto && (
              <div className="bg-surface2 border-line text-inkmuted rounded-lg border p-2.5 text-[12px] leading-relaxed">
                💡 {pasoActual.detalle}
              </div>
            )}

            {encontrado && tapado && (
              <div className="rounded-lg border border-brand/25 bg-brandsoft/70 p-3 text-[12.5px] text-ink">
                {modalRect
                  ? "El elemento señalado quedó detrás de otra ventana. Completa lo que hay en ella y pulsa Siguiente."
                  : "Otra parte de la página tapa el elemento señalado. Desplázate un poco para verlo, o pulsa Siguiente para continuar."}
              </div>
            )}

            {!encontrado && panelNoEncontrado()}

            {alertaRoja && (
              <div className="rounded-lg border border-amber-500/60 bg-amber-500/10 p-2.5 text-[12px] font-medium text-amber-800 dark:text-amber-300 flex items-start justify-between gap-2">
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

          {/* Pie fijo: progreso y navegación */}
          <div className="shrink-0 pt-2.5 border-t border-line space-y-2.5">
            <div className="flex items-center gap-1">
              {moduloActual.pasos.map((p, idx) => (
                <div
                  key={p.id}
                  className={cn(
                    "h-1.5 flex-1 rounded-full transition-all",
                    idx === pasoIndex ? (alertaRoja ? "bg-amber-500" : "bg-brand") : idx < pasoIndex ? "bg-ok" : "bg-surface3"
                  )}
                />
              ))}
            </div>

            <div className="flex items-center justify-between text-[12px]">
              <div className="text-inkmuted font-medium text-[11.5px]">
                Paso {pasoIndex + 1} de {totalPasosModulo}
              </div>
              <div className="flex items-center gap-1.5">
                {(pasoIndex > 0 || moduloIndex > 0) && (
                  <button type="button" onClick={pasoAnterior} className="btn btn-ghost btn-sm text-[12px]">
                    <ArrowLeft size={13} /> Atrás
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleAvanzar}
                  className={cn(
                    "btn btn-sm text-[12px] font-semibold transition-all",
                    alertaRoja ? "bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-500/20" : "btn-primary"
                  )}
                >
                  {pasoIndex < totalPasosModulo - 1 ? (
                    <>Siguiente <ArrowRight size={13} /></>
                  ) : moduloIndex < totalModulos - 1 ? (
                    <>Siguiente módulo <ChevronRight size={14} /></>
                  ) : (
                    <><CheckCircle2 size={13} /> Finalizar</>
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
