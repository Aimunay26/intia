/**
 * Kill-switch ORDEN_POR_ROL: menú lateral por paneles de rol, inicio por paneles y listas de roles
 * en el orden del flujo (Dueño → Estrategia → Guiones → Preparador → Filmmaker → Talento → Editor →
 * Diseñador → Community → Analista). Encendido por defecto; solo "false" lo apaga y vuelve todo
 * a como estaba (NAV de siempre, inicio y listas en el orden de las constantes). Solo se lee en el
 * servidor: los componentes de cliente lo reciben resuelto como prop (el navegador no ve el entorno).
 */
export function roleOrderEnabled(value: string | null | undefined = process.env.ORDEN_POR_ROL): boolean {
  return (value ?? "").trim().toLowerCase() !== "false";
}
