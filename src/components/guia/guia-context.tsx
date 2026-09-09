"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";

import { ROLE_LEVEL } from "@/lib/constants";
import { anclaVisible } from "@/lib/guia/dom";
import {
  MODULOS_GUIA,
  pathnameCubrePaso,
  type GuiaModulo,
  type GuiaPaso,
} from "@/lib/guia/modulos";

/**
 * Estado y navegación de la guía interactiva.
 *
 * Tres reglas que salen de los fallos que tuvo la primera versión:
 *
 * 1. Las transiciones de estado son PURAS. React (en StrictMode) puede
 *    ejecutar un updater dos veces, así que dentro no se toca el DOM ni el
 *    router. La navegación ocurre después, en el manejador del clic.
 * 2. La `url` de un paso es una SECCIÓN, no una ruta exacta. Después de crear
 *    una marca el servidor redirige a /marcas/abc; comparar por igualdad con
 *    /marcas devolvía al usuario a la lista. Nunca se navega si ya estamos en
 *    la sección del paso o si el ancla está a la vista.
 * 3. «Atrás» no navega nunca. Quien retrocede quiere releer, no que le muevan.
 */

// Subimos la versión UNA vez: el estado de la versión anterior apunta a módulos
// y pasos que ya no existen en el mismo sitio.
const STORAGE_KEY = "marketing_os_guia_state_v2";
const STORAGE_KEY_OBSOLETA = "marketing_os_guia_state_v1";

type GuiaState = {
  activo: boolean;
  /** Se pulsó Finalizar en el último paso: la tarjeta de cierre sigue visible hasta que se cierra. */
  terminado: boolean;
  moduloIndex: number;
  pasoIndex: number;
  minimizado: boolean;
  /** ids de módulos completados */
  completados: string[];
};

const ESTADO_INICIAL: GuiaState = {
  activo: false,
  terminado: false,
  moduloIndex: 0,
  pasoIndex: 0,
  minimizado: false,
  completados: [],
};

/**
 * Lo guardado lo escribió otra sesión, quizá con otro catálogo: nunca fiarse
 * de sus índices. Se localiza por id de módulo y de paso, y si algo no cuadra
 * se vuelve al principio.
 */
function sanearEstadoGuardado(parsed: unknown, modulos: GuiaModulo[]): Partial<GuiaState> {
  if (!parsed || typeof parsed !== "object") return {};
  const p = parsed as Partial<GuiaState> & { moduloId?: string; pasoId?: string };
  const mi = p.moduloId ? modulos.findIndex((m) => m.id === p.moduloId) : -1;
  const moduloIndex = mi >= 0 ? mi : 0;
  const pi = mi >= 0 && p.pasoId ? modulos[mi].pasos.findIndex((s) => s.id === p.pasoId) : -1;
  return {
    activo: p.activo === true,
    terminado: p.terminado === true,
    minimizado: p.minimizado === true,
    moduloIndex,
    pasoIndex: pi >= 0 ? pi : 0,
    completados: Array.isArray(p.completados)
      ? p.completados.filter(
          (id): id is string => typeof id === "string" && modulos.some((m) => m.id === id)
        )
      : [],
  };
}

/** Transición pura: solo calcula el estado siguiente. */
function calcularSiguiente(prev: GuiaState, modulos: GuiaModulo[], pathname: string): GuiaState {
  let s = prev;
  // Como mucho un paso puente seguido; el bucle acota por si hubiera dos.
  for (let i = 0; i < 3; i++) {
    const mod = modulos[s.moduloIndex];
    if (!mod) return prev;

    if (s.pasoIndex < mod.pasos.length - 1) {
      s = { ...s, pasoIndex: s.pasoIndex + 1 };
    } else {
      const completados = s.completados.includes(mod.id)
        ? s.completados
        : [...s.completados, mod.id];
      if (s.moduloIndex < modulos.length - 1) {
        s = { ...s, moduloIndex: s.moduloIndex + 1, pasoIndex: 0, completados };
      } else {
        // No se apaga: el overlay enseña la tarjeta de cierre hasta que el usuario la cierra.
        return { ...s, terminado: true, completados };
      }
    }

    // Un paso puente («abre la ficha») ya está cumplido si estamos en una ruta
    // hija de su sección: se salta solo.
    const paso = modulos[s.moduloIndex].pasos[s.pasoIndex];
    const yaEnFicha = paso.puente && pathname !== paso.url && pathnameCubrePaso(pathname, paso);
    if (!yaEnFicha) return s;
  }
  return s;
}

/** Transición pura hacia atrás. */
function calcularAnterior(prev: GuiaState, modulos: GuiaModulo[]): GuiaState {
  if (prev.pasoIndex > 0) return { ...prev, pasoIndex: prev.pasoIndex - 1 };
  if (prev.moduloIndex > 0) {
    const anterior = modulos[prev.moduloIndex - 1];
    return { ...prev, moduloIndex: prev.moduloIndex - 1, pasoIndex: anterior.pasos.length - 1 };
  }
  return prev;
}

type GuiaContextType = {
  activo: boolean;
  terminado: boolean;
  moduloActual: GuiaModulo;
  pasoActual: GuiaPaso;
  moduloIndex: number;
  pasoIndex: number;
  totalModulos: number;
  totalPasosModulo: number;
  minimizado: boolean;
  completados: string[];
  /** La lista de módulos que aplica a este usuario (filtrada por nivel). */
  modulos: GuiaModulo[];
  iniciarGuia: (moduloIdx?: number, pasoIdx?: number) => void;
  cerrarGuia: () => void;
  minimizarGuia: () => void;
  restaurarGuia: () => void;
  siguientePaso: () => void;
  pasoAnterior: () => void;
  irAModulo: (index: number) => void;
  reiniciarGuia: () => void;
  navegarAPasoActual: () => void;
  abrirMenuMovil: () => void;
};

const GuiaContext = createContext<GuiaContextType | null>(null);

export function GuiaProvider({
  children,
  userLevel = ROLE_LEVEL.MEMBER,
  abrirMenuMovil = () => {},
}: {
  children: ReactNode;
  /** Nivel de permisos de quien está dentro: los módulos que exigen más se ocultan. */
  userLevel?: number;
  /** Abre el cajón de navegación en móvil, donde el menú lateral no se ve. */
  abrirMenuMovil?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();

  // Un miembro no puede entrar en Ajustes ni invitar gente: esos módulos no
  // existen para él, y así la barra de progreso no le pide lo imposible.
  const modulos = useMemo(
    () => MODULOS_GUIA.filter((m) => !m.minLevel || userLevel >= m.minLevel),
    [userLevel]
  );

  const [state, setState] = useState<GuiaState>(ESTADO_INICIAL);
  const [cargado, setCargado] = useState(false);

  // Cargar lo guardado, saneado. La clave vieja se borra: su formato ya no vale.
  useEffect(() => {
    try {
      localStorage.removeItem(STORAGE_KEY_OBSOLETA);
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saneado = sanearEstadoGuardado(JSON.parse(raw), modulos);
        setState((prev) => ({ ...prev, ...saneado }));
      }
    } catch {
      // Sin localStorage (o corrupto): se empieza de cero, sin drama.
    } finally {
      setCargado(true);
    }
  }, [modulos]);

  const moduloActual = modulos[state.moduloIndex] ?? modulos[0];
  const pasoActual = moduloActual.pasos[state.pasoIndex] ?? moduloActual.pasos[0];

  // Guardar por ID, no por índice: así ni el filtro por nivel ni un cambio
  // futuro de pasos vuelven a romper la reanudación.
  useEffect(() => {
    if (!cargado) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...state, moduloId: moduloActual?.id, pasoId: pasoActual?.id })
      );
    } catch {
      // Ignorar: la guía funciona igual sin persistencia.
    }
  }, [state, cargado, moduloActual?.id, pasoActual?.id]);

  const pasoDe = useCallback(
    (s: GuiaState) => modulos[s.moduloIndex]?.pasos[s.pasoIndex],
    [modulos]
  );

  // Único punto que navega. Nunca empuja si el ancla está a la vista ni si ya
  // estamos en la sección del paso: eso es lo que expulsaba de la ficha.
  const navegarA = useCallback(
    (paso: GuiaPaso | undefined) => {
      if (!paso?.url || typeof window === "undefined") return;
      if (anclaVisible(paso.target)) return;
      if (pathnameCubrePaso(pathname, paso)) return;
      router.push(paso.url);
    },
    [pathname, router]
  );

  const iniciarGuia = useCallback(
    (moduloIdx = 0, pasoIdx = 0) => {
      const validMod = Math.min(Math.max(0, moduloIdx), modulos.length - 1);
      const validPaso = Math.min(
        Math.max(0, pasoIdx),
        (modulos[validMod]?.pasos.length ?? 1) - 1
      );
      setState((prev) => ({
        ...prev,
        activo: true,
        terminado: false,
        minimizado: false,
        moduloIndex: validMod,
        pasoIndex: validPaso,
      }));
      navegarA(modulos[validMod]?.pasos[validPaso]);
    },
    [modulos, navegarA]
  );

  const cerrarGuia = useCallback(() => {
    setState((prev) => ({ ...prev, activo: false, terminado: false }));
  }, []);

  const minimizarGuia = useCallback(() => {
    setState((prev) => ({ ...prev, minimizado: true }));
  }, []);

  const restaurarGuia = useCallback(() => {
    setState((prev) => ({ ...prev, minimizado: false }));
  }, []);

  const irAModulo = useCallback(
    (index: number) => {
      const validIdx = Math.min(Math.max(0, index), modulos.length - 1);
      setState((prev) => ({
        ...prev,
        activo: true,
        terminado: false,
        minimizado: false,
        moduloIndex: validIdx,
        pasoIndex: 0,
      }));
      navegarA(modulos[validIdx]?.pasos[0]);
    },
    [modulos, navegarA]
  );

  // Se parte del `state` del render y no del `prev` del updater: solo lo
  // dispara un clic, no hay lote, y así la navegación queda FUERA del updater.
  const siguientePaso = useCallback(() => {
    const nuevo = calcularSiguiente(state, modulos, pathname);
    setState(nuevo);
    if (nuevo.activo) navegarA(pasoDe(nuevo));
  }, [state, modulos, pathname, navegarA, pasoDe]);

  // Retroceder no navega: si el ancla no está, el overlay ofrece «Llévame allí» u «Omitir».
  const pasoAnterior = useCallback(() => {
    setState((prev) => calcularAnterior(prev, modulos));
  }, [modulos]);

  const reiniciarGuia = useCallback(() => {
    setState({ ...ESTADO_INICIAL, activo: true });
    navegarA(modulos[0]?.pasos[0]);
  }, [modulos, navegarA]);

  // «Llévame allí» / «Abrir la ventana». Un push a la misma ruta no reabre
  // nada: si el ancla vive dentro de una ventana, se pulsa su disparador.
  const navegarAPasoActual = useCallback(() => {
    if (!pasoActual?.url) return;
    if (anclaVisible(pasoActual.target)) return;
    if (pathnameCubrePaso(pathname, pasoActual)) {
      if (pasoActual.abreCon) {
        const disparador = anclaVisible(pasoActual.abreCon);
        (disparador?.closest("button") ?? disparador)?.click();
      }
      return;
    }
    router.push(pasoActual.url);
  }, [pasoActual, pathname, router]);

  return (
    <GuiaContext.Provider
      value={{
        activo: state.activo,
        terminado: state.terminado,
        moduloActual,
        pasoActual,
        moduloIndex: state.moduloIndex,
        pasoIndex: state.pasoIndex,
        totalModulos: modulos.length,
        totalPasosModulo: moduloActual.pasos.length,
        minimizado: state.minimizado,
        completados: state.completados,
        modulos,
        iniciarGuia,
        cerrarGuia,
        minimizarGuia,
        restaurarGuia,
        siguientePaso,
        pasoAnterior,
        irAModulo,
        reiniciarGuia,
        navegarAPasoActual,
        abrirMenuMovil,
      }}
    >
      {children}
    </GuiaContext.Provider>
  );
}

export function useGuia() {
  const context = useContext(GuiaContext);
  if (!context) {
    throw new Error("useGuia debe usarse dentro de un GuiaProvider");
  }
  return context;
}
