"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { MODULOS_GUIA, type GuiaModulo, type GuiaPaso } from "@/lib/guia/modulos";

const STORAGE_KEY = "marketing_os_guia_state_v1";

type GuiaState = {
  activo: boolean;
  moduloIndex: number;
  pasoIndex: number;
  minimizado: boolean;
  completados: string[]; // ids de módulos completados
};

type GuiaContextType = {
  activo: boolean;
  moduloActual: GuiaModulo;
  pasoActual: GuiaPaso;
  moduloIndex: number;
  pasoIndex: number;
  totalModulos: number;
  totalPasosModulo: number;
  minimizado: boolean;
  completados: string[];
  iniciarGuia: (moduloIdx?: number, pasoIdx?: number) => void;
  cerrarGuia: () => void;
  minimizarGuia: () => void;
  restaurarGuia: () => void;
  siguientePaso: () => void;
  pasoAnterior: () => void;
  irAModulo: (index: number) => void;
  reiniciarGuia: () => void;
  navegarAPasoActual: () => void;
};

const GuiaContext = createContext<GuiaContextType | null>(null);

export function GuiaProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [state, setState] = useState<GuiaState>({
    activo: false,
    moduloIndex: 0,
    pasoIndex: 0,
    minimizado: false,
    completados: [],
  });

  const [cargado, setCargado] = useState(false);

  // Cargar estado inicial desde localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setState((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // Ignorar en entornos sin acceso a localStorage
    } finally {
      setCargado(true);
    }
  }, []);

  // Guardar cambios en localStorage
  useEffect(() => {
    if (!cargado) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignorar
    }
  }, [state, cargado]);

  const moduloActual = MODULOS_GUIA[state.moduloIndex] ?? MODULOS_GUIA[0];
  const pasoActual = moduloActual.pasos[state.pasoIndex] ?? moduloActual.pasos[0];

  const navegarSiEsNecesario = useCallback(
    (paso: GuiaPaso | undefined) => {
      if (!paso?.url || typeof window === "undefined") return;
      // Si el elemento objetivo ya existe en el DOM actual (ej. estamos en /marcas/[id] y el paso busca la pestaña), no redirigir
      const el = document.querySelector(`[data-guia="${paso.target}"]`);
      if (el) return;
      if (pathname !== paso.url) {
        router.push(paso.url);
      }
    },
    [pathname, router]
  );

  const iniciarGuia = useCallback(
    (moduloIdx = 0, pasoIdx = 0) => {
      const validMod = Math.min(Math.max(0, moduloIdx), MODULOS_GUIA.length - 1);
      const mod = MODULOS_GUIA[validMod];
      const validPaso = Math.min(Math.max(0, pasoIdx), (mod?.pasos.length ?? 1) - 1);
      setState((prev) => ({
        ...prev,
        activo: true,
        minimizado: false,
        moduloIndex: validMod,
        pasoIndex: validPaso,
      }));
      navegarSiEsNecesario(mod?.pasos[validPaso]);
    },
    [navegarSiEsNecesario]
  );

  const cerrarGuia = useCallback(() => {
    setState((prev) => ({ ...prev, activo: false }));
  }, []);

  const minimizarGuia = useCallback(() => {
    setState((prev) => ({ ...prev, minimizado: true }));
  }, []);

  const restaurarGuia = useCallback(() => {
    setState((prev) => ({ ...prev, minimizado: false }));
  }, []);

  const irAModulo = useCallback(
    (index: number) => {
      const validIdx = Math.min(Math.max(0, index), MODULOS_GUIA.length - 1);
      setState((prev) => ({
        ...prev,
        activo: true,
        minimizado: false,
        moduloIndex: validIdx,
        pasoIndex: 0,
      }));
      navegarSiEsNecesario(MODULOS_GUIA[validIdx]?.pasos[0]);
    },
    [navegarSiEsNecesario]
  );

  const siguientePaso = useCallback(() => {
    setState((prev) => {
      const mod = MODULOS_GUIA[prev.moduloIndex];
      if (!mod) return prev;

      // Si aún hay pasos en este módulo
      if (prev.pasoIndex < mod.pasos.length - 1) {
        const nextPaso = mod.pasos[prev.pasoIndex + 1];
        navegarSiEsNecesario(nextPaso);
        return { ...prev, pasoIndex: prev.pasoIndex + 1 };
      }

      // Se completó el módulo actual
      const nuevosCompletados = prev.completados.includes(mod.id)
        ? prev.completados
        : [...prev.completados, mod.id];

      // Si hay un siguiente módulo
      if (prev.moduloIndex < MODULOS_GUIA.length - 1) {
        const siguienteModulo = MODULOS_GUIA[prev.moduloIndex + 1];
        navegarSiEsNecesario(siguienteModulo?.pasos[0]);
        return {
          ...prev,
          moduloIndex: prev.moduloIndex + 1,
          pasoIndex: 0,
          completados: nuevosCompletados,
        };
      }

      // Fin del tutorial completo
      return {
        ...prev,
        activo: false,
        completados: nuevosCompletados,
      };
    });
  }, [navegarSiEsNecesario]);

  const pasoAnterior = useCallback(() => {
    setState((prev) => {
      if (prev.pasoIndex > 0) {
        const prevPaso = MODULOS_GUIA[prev.moduloIndex]?.pasos[prev.pasoIndex - 1];
        navegarSiEsNecesario(prevPaso);
        return { ...prev, pasoIndex: prev.pasoIndex - 1 };
      }
      if (prev.moduloIndex > 0) {
        const anteriorModulo = MODULOS_GUIA[prev.moduloIndex - 1];
        const lastPasoIdx = anteriorModulo.pasos.length - 1;
        navegarSiEsNecesario(anteriorModulo.pasos[lastPasoIdx]);
        return {
          ...prev,
          moduloIndex: prev.moduloIndex - 1,
          pasoIndex: lastPasoIdx,
        };
      }
      return prev;
    });
  }, [navegarSiEsNecesario]);

  const reiniciarGuia = useCallback(() => {
    setState({
      activo: true,
      moduloIndex: 0,
      pasoIndex: 0,
      minimizado: false,
      completados: [],
    });
    navegarSiEsNecesario(MODULOS_GUIA[0]?.pasos[0]);
  }, [navegarSiEsNecesario]);

  const navegarAPasoActual = useCallback(() => {
    if (!pasoActual?.url) return;
    const el = document.querySelector(`[data-guia="${pasoActual.target}"]`);
    if (el) return;
    router.push(pasoActual.url);
  }, [pasoActual, router]);

  return (
    <GuiaContext.Provider
      value={{
        activo: state.activo,
        moduloActual,
        pasoActual,
        moduloIndex: state.moduloIndex,
        pasoIndex: state.pasoIndex,
        totalModulos: MODULOS_GUIA.length,
        totalPasosModulo: moduloActual.pasos.length,
        minimizado: state.minimizado,
        completados: state.completados,
        iniciarGuia,
        cerrarGuia,
        minimizarGuia,
        restaurarGuia,
        siguientePaso,
        pasoAnterior,
        irAModulo,
        reiniciarGuia,
        navegarAPasoActual,
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
