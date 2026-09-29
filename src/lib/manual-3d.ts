/**
 * Personajes 3D del manual: interruptor, lista cerrada de archivos y tipos del manifiesto.
 *
 * - Los archivos viven versionados en src/content/modelos-3d/ (nunca en /public) y solo se
 *   sirven con sesión por GET /api/modelos-3d/[archivo]. Son modelos con derechos de terceros
 *   que el dueño autorizó el 29/09/2026 solo para uso interno del equipo: antes de vender el
 *   sistema a terceros deben reemplazarse por modelos con licencia.
 * - Kill-switch: MANUAL_3D_PERSONAJES. Encendido por defecto; solo el valor "false" (sin
 *   importar mayúsculas ni espacios) vuelve a los maniquíes del visor y la ruta responde 404.
 * - Asignación en el visor: quien graba = "camarografo"; sujeto principal = "actriz-1";
 *   segunda persona (podcast, pareja, dos personas) = "actriz-2". Más sujetos siguen como maniquí.
 * - Desde un componente cliente, importar solo con `import type`: el servidor calcula el
 *   interruptor y lo baja por props.
 */

/* ------------------------------------------------------------ INTERRUPTOR -- */

/** Encendido salvo que la variable valga exactamente "false". */
export function personajes3dEnabled(env: Record<string, string | undefined> = process.env) {
  return env.MANUAL_3D_PERSONAJES?.trim().toLowerCase() !== "false";
}

/* -------------------------------------------------------------- ARCHIVOS -- */

/** Los únicos archivos que sirve la ruta. Cualquier otro nombre es 404 sin tocar el disco. */
export const MODELOS_3D = ["manifest.json", "camarografo.glb", "actriz-1.glb", "actriz-2.glb"] as const;
export type ArchivoModelo3d = (typeof MODELOS_3D)[number];

/** Prefijo de la ruta autenticada que entrega los archivos. */
export const RUTA_MODELOS_3D = "/api/modelos-3d";

/** Comparación exacta: sin normalizar mayúsculas, rutas ni codificaciones. */
export function esArchivoModelo3d(value: unknown): value is ArchivoModelo3d {
  return typeof value === "string" && (MODELOS_3D as readonly string[]).includes(value);
}

export function tipoModelo3d(archivo: ArchivoModelo3d) {
  return archivo.endsWith(".glb") ? "model/gltf-binary" : "application/json";
}

/* ------------------------------------------------------------ MANIFIESTO -- */

export type PersonajeId = "camarografo" | "actriz-1" | "actriz-2";

/** Huesos que el visor rota al posar. El valor es el nombre del nodo tal como lo expone GLTFLoader. */
export type HuesoPersonaje =
  | "pelvis" | "spine" | "chest" | "neck" | "head"
  | "upperArmL" | "lowerArmL" | "handL" | "upperArmR" | "lowerArmR" | "handR"
  | "thighL" | "calfL" | "footL" | "thighR" | "calfR" | "footR";

/**
 * Un personaje del manifiesto. Escala en metros, pies en y=0, mira hacia +Z (su izquierda es +X)
 * y la pose de reposo es la bind pose (A-pose). Los GLB usan EXT_meshopt_compression,
 * KHR_mesh_quantization y EXT_texture_webp: el cargador necesita MeshoptDecoder.
 */
export type ModeloPersonaje = {
  id: PersonajeId;
  nombre: string;
  archivo: Exclude<ArchivoModelo3d, "manifest.json">;
  /** Estatura en metros. */
  altura: number;
  rig: "BIPED" | "UE";
  huesos: Record<HuesoPersonaje, string>;
  /** `altura`: de los ojos al piso (m). `adelante`: z de los ojos menos z del hueso de la cabeza (m). */
  ojos: { altura: number; adelante: number };
  /** Nombres de los clips del GLB, si trae animaciones. */
  animaciones?: { reposo: string; caminar: string; hablar: string };
  notas: string;
};

export type ManifestoPersonajes = {
  version: number;
  personajes: ModeloPersonaje[];
};
