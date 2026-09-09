import { selectorGuia, type GuiaTargetKey } from "./catalogo";

/**
 * Consultas al DOM que comparten el contexto y el overlay de la guía.
 *
 * Existe para que haya UN solo criterio de "visible". Antes cada uno tenía el
 * suyo: el contexto usaba querySelector a secas (encontraba el enlace del menú
 * lateral aunque en móvil estuviera en display:none) y el overlay filtraba por
 * tamaño. Con dos criterios, «Llévame allí» decidía que el ancla ya estaba y
 * no navegaba, mientras la tarjeta decía que no la encontraba. Solo cliente.
 */

/**
 * Visible de verdad: con tamaño, sin display/visibility/opacity a cero y, si
 * hay un modal abierto, dentro de él. Lo que queda fuera del modal está bajo
 * el fondo oscuro y el usuario no puede tocarlo aunque se vea.
 */
export function esVisible(el: Element, modal: Element | null): boolean {
  const r = el.getBoundingClientRect();
  const s = window.getComputedStyle(el);
  return (
    r.width > 0 &&
    r.height > 0 &&
    s.visibility !== "hidden" &&
    s.display !== "none" &&
    s.opacity !== "0" &&
    (!modal || modal.contains(el))
  );
}

/**
 * El Modal de forms.tsx lleva aria-modal. La tarjeta de la guía es role=dialog
 * SIN aria-modal a propósito: así esta función no se detecta a sí misma.
 */
export function modalAbierto(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
}

/**
 * Qué elemento recibe el puntero en el centro del ancla, ignorando el propio
 * overlay de la guía. null = nada la tapa.
 */
export function quienTapa(el: Element, r: DOMRect = el.getBoundingClientRect()): Element | null {
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  if (cx < 0 || cy < 0 || cx >= window.innerWidth || cy >= window.innerHeight) return null;
  const hit = document.elementFromPoint(cx, cy);
  if (!hit || el.contains(hit) || hit.closest(".guia-overlay-root")) return null;
  return hit;
}

/**
 * Primera ancla visible y no tapada para un objetivo. Si todas están tapadas,
 * la primera visible. Si ninguna, null.
 */
export function anclaVisible(target: GuiaTargetKey): HTMLElement | null {
  const modal = modalAbierto();
  const visibles = Array.from(document.querySelectorAll<HTMLElement>(selectorGuia(target))).filter(
    (el) => esVisible(el, modal)
  );
  return visibles.find((el) => !quienTapa(el)) ?? visibles[0] ?? null;
}

/** ¿Existe el ancla en el DOM aunque esté oculta (p. ej. menú lateral en <1024 px)? */
export function anclaEnDom(target: GuiaTargetKey): boolean {
  return document.querySelector(selectorGuia(target)) !== null;
}
