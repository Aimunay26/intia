/**
 * Texto del producto que recibe la IA, armado desde una ficha del catálogo.
 * Sin dependencias de servidor: el servidor (generarGuion) arma aquí el texto que
 * se envía, y el generador usa la misma función para avisar si la ficha no cabe
 * entera en el tope (CONTRACT: nunca descartar datos válidos en silencio).
 */
import type { ProductKind } from "@/lib/constants";
import { PRODUCT_LIMITS, type CatalogCombo, type CatalogProduct } from "@/lib/product-catalog-types";

const TIPO_LINEA: Record<ProductKind, string> = {
  PRODUCTO: "Tipo: Producto físico (no es un servicio: no hables de cupos de atención, agenda ni asesorías)",
  SERVICIO: "Tipo: Servicio (se vende tiempo, atención o resultado; no inventes stock ni envíos)",
  RESTAURANTE: "Tipo: Restaurante (platos, menú o experiencia en local/delivery; no hables de cupos de asesoría)",
};

/** La línea "Tipo: …" que acompaña a "Producto/Servicio: …" en el texto para la IA. */
export function lineaDeTipo(kind: ProductKind): string {
  return TIPO_LINEA[kind] ?? TIPO_LINEA.PRODUCTO;
}

const unaLinea = (text: string) => text.replace(/\s+/g, " ").trim();

function sinRepetir(items: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const item = unaLinea(raw).slice(0, PRODUCT_LIMITS.listItemLength);
    const key = item.toLowerCase();
    if (item && !seen.has(key)) { seen.add(key); out.push(item); }
  }
  return out;
}

export type FocoEntry =
  | { type: "product"; product: CatalogProduct }
  | { type: "combo"; combo: CatalogCombo; products?: CatalogProduct[] };

/** Lo que no entró en el tope de PRODUCT_LIMITS.focus. Todo en 0/false: la ficha llegó entera. */
export type RecortesDelFoco = {
  /** Características, beneficios y objeciones que quedaron fuera. */
  listas: number;
  /** Productos del combo que no se nombran en "Incluye". */
  incluye: number;
  /** El detalle ("Qué debe saber la IA") se cortó. */
  detalle: boolean;
  /** Se quitaron el precio y la línea "Incluye" (último recurso). */
  precio: boolean;
};

/**
 * Texto de la ficha para la IA y lo que se tuvo que recortar para no pasar de
 * PRODUCT_LIMITS.focus caracteres. Mismo prefijo y separación que el texto libre
 * de generarGuion ("Producto/Servicio: …" y, tras una línea en blanco,
 * "Detalle y descripción profunda:"). Orden del recorte: primero las listas,
 * luego lo que incluye el combo, luego el detalle; Producto y Tipo nunca se cortan.
 * El tope deja sitio para un detalle de PRODUCT_LIMITS.aiNotes caracteres con la
 * cabecera completa: ese detalle nunca se corta.
 */
export function focoDeProducto(entry: FocoEntry, detalle: string): { texto: string; recortes: RecortesDelFoco } {
  const base = entry.type === "product" ? entry.product : entry.combo;
  const cabecera = [`Producto/Servicio: ${unaLinea(base.name)}`, lineaDeTipo(base.kind)];
  let precio = base.priceLabel ? unaLinea(base.priceLabel) : "";

  const incluidos = entry.type === "combo" ? entry.combo.items.map((item) => `${item.quantity}× ${unaLinea(item.name)}`) : [];
  let incluye = incluidos.length;
  const fuentes = entry.type === "product"
    ? [entry.product]
    : (entry.products ?? []).filter((p) => entry.combo.items.some((item) => item.productId === p.id));
  const listas = {
    features: sinRepetir(fuentes.flatMap((p) => p.features)),
    benefits: sinRepetir(fuentes.flatMap((p) => p.benefits)),
    objections: sinRepetir(fuentes.flatMap((p) => p.objections)),
  };
  const recortes: RecortesDelFoco = { listas: 0, incluye: 0, detalle: false, precio: false };
  let texto = (detalle ?? "").trim();

  const componer = () => {
    const incluyeLinea = incluye
      ? `Incluye: ${incluidos.slice(0, incluye).join(", ")}${incluye < incluidos.length ? ", …" : ""}`
      : "";
    const ficha = [
      ...cabecera,
      precio ? `Precio: ${precio}` : "",
      incluyeLinea,
      listas.features.length ? `Características: ${listas.features.join(" · ")}` : "",
      listas.benefits.length ? `Beneficios: ${listas.benefits.join(" · ")}` : "",
      listas.objections.length ? `Objeciones que resuelve: ${listas.objections.join(" · ")}` : "",
    ].filter(Boolean).join("\n");
    return [ficha, texto ? `Detalle y descripción profunda:\n${texto}` : ""].filter(Boolean).join("\n\n");
  };

  const max = PRODUCT_LIMITS.focus;
  let foco = componer();
  // 1. Listas: se quita el último elemento de la lista más larga.
  while (foco.length > max) {
    const larga = (Object.keys(listas) as (keyof typeof listas)[])
      .filter((key) => listas[key].length)
      .sort((a, b) => listas[b].join(" · ").length - listas[a].join(" · ").length)[0];
    if (!larga) break;
    listas[larga].pop();
    recortes.listas++;
    foco = componer();
  }
  // 2. Combo: se conservan los primeros productos y se indica que hay más.
  while (foco.length > max && incluye > 1) { incluye--; foco = componer(); }
  recortes.incluye = incluidos.length - incluye;
  // 3. Detalle: se recorta al espacio que queda.
  if (foco.length > max && texto) {
    const recorte = texto.slice(0, Math.max(0, texto.length - (foco.length - max) - 1)).trimEnd();
    texto = recorte ? `${recorte}…` : "";
    recortes.detalle = true;
    foco = componer();
  }
  // 4. Último recurso: sin precio ni combo. Producto y Tipo nunca se cortan.
  if (foco.length > max && (precio || incluye)) {
    precio = "";
    recortes.incluye = incluidos.length;
    incluye = 0;
    recortes.precio = true;
    foco = componer();
  }
  return { texto: foco, recortes };
}

/** Solo el texto de focoDeProducto: lo que generarGuion envía a la IA. */
export function construirFocoDeProducto(entry: FocoEntry, detalle: string): string {
  return focoDeProducto(entry, detalle).texto;
}

/** Aviso legible de lo que no entra, o null si la ficha llega entera. */
export function avisoDeRecorte(recortes: RecortesDelFoco): string | null {
  const partes: string[] = [];
  if (recortes.listas) {
    partes.push(`${recortes.listas} ${recortes.listas === 1 ? "elemento" : "elementos"} de características, beneficios u objeciones`);
  }
  if (recortes.incluye) {
    partes.push(`${recortes.incluye} ${recortes.incluye === 1 ? "producto" : "productos"} de «Incluye»`);
  }
  if (recortes.precio) partes.push("el precio");
  if (recortes.detalle) partes.push("el final de «Qué debe saber la IA»");
  if (!partes.length) return null;
  const lista = partes.length > 1 ? `${partes.slice(0, -1).join(", ")} y ${partes.at(-1)}` : partes[0];
  return `Por el tope de ${PRODUCT_LIMITS.focus} caracteres, la IA no recibirá ${lista}.`;
}
