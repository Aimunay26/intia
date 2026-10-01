/**
 * Kill-switch EQUIPO_PERFILES_TARJETAS: perfiles y marcas de Equipo como tarjetas seleccionables.
 * Encendido por defecto; solo "false" lo apaga y vuelve la lista de casillas de siempre. Los
 * campos del formulario son los mismos en los dos modos, así que el servidor no cambia.
 */
export function profileCardsEnabled(value: string | null | undefined = process.env.EQUIPO_PERFILES_TARJETAS): boolean {
  return (value ?? "").trim().toLowerCase() !== "false";
}
