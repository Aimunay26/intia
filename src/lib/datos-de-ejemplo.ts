/**
 * Qué es "dato de ejemplo" y qué es tuyo.
 *
 * Este archivo es la ÚNICA fuente de verdad de esa frontera. Lo usan el botón
 * de vaciar y las pantallas que avisan de que todavía queda relleno. Si un día
 * cambia lo que siembra `prisma/seed.ts`, se cambia aquí y en ningún otro sitio.
 *
 * La regla, para que no haya dudas al leer el código:
 *
 *   SE VA        lo que sembró un script para que la app no se viera vacía.
 *   SE QUEDA     tu cuenta, las personas reales con su informe de branding,
 *                y las 21 estructuras, que son tu catálogo de formatos.
 */

/** La marca de ejemplo. Al borrarla caen sus objetivos y sus videos en cascada. */
export const MARCA_DE_EJEMPLO = "con-amor";

/**
 * Las cuentas ficticias del equipo. Se identifican por correo y no por nombre
 * porque el correo es único en la base y el nombre se puede editar.
 */
export const CORREOS_DE_EJEMPLO = [
  "ana@conamor.pe",
  "paula@conamor.pe",
  "diego@conamor.pe",
  "lucia@conamor.pe",
  "marco@conamor.pe",
];

/**
 * Los perfiles genéricos que vinieron con la instalación.
 *
 * No hace falta listarlos: ya están marcados con `isPerson: false`, que es
 * justo lo que significa "no es nadie del equipo". Se deja el listado como
 * referencia de cuáles son, pero la consulta usa el campo.
 */
export const PERFILES_GENERICOS = [
  "presentador-complice",
  "pareja-real",
  "fundador-cercano",
  "comico-fisico",
  "cliente-honesto",
  "voz-narradora",
];

/**
 * Lo que hay que borrar A MANO además de la marca.
 *
 * Importa, y es fácil de pasar por alto: en el esquema, `Script.brandId` y
 * `CalendarEvent.brandId` son "poner a null" al borrar la marca, no "borrar en
 * cascada". Si solo se borrara la marca, los guiones y los eventos se quedarían
 * huérfanos y visibles, y el botón habría mentido. Los videos sí caen solos,
 * junto con sus checklists, asignaciones, métricas y comentarios.
 */
export const CAEN_EN_CASCADA_CON_LA_MARCA = [
  "objetivos de marca",
  "videos, con sus checklists, asignaciones, métricas y comentarios",
];

export const HAY_QUE_BORRARLOS_APARTE = [
  "guiones y sus escenas",
  "eventos del calendario",
  "archivos adjuntos (no tienen clave ajena)",
];

/** Lo que el botón NUNCA toca, pase lo que pase. */
export const NUNCA_SE_BORRA = [
  "Tu cuenta de dueño",
  "Las personas reales y su informe de branding",
  "Las 21 estructuras de video",
  "El registro de actividad",
];
