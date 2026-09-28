"use client";

import { createContext, useContext } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import styles from "./script-workspace.module.css";

type SceneNavValue = { position: number; total: number; go: (index: number) => void };

const SceneNavContext = createContext<SceneNavValue | null>(null);

export const SceneNavProvider = SceneNavContext.Provider;

/** ‹ 3/7 › en la cabecera de cada escena. Solo navega; no modifica datos. */
export function SceneNav() {
  const nav = useContext(SceneNavContext);
  if (!nav || nav.total < 2) return null;
  const { position, total, go } = nav;
  return <div className={`${styles.sceneNav} no-print`}>
    <button type="button" className="btn btn-ghost btn-icon" aria-label="Escena anterior" title="Escena anterior (←)"
      disabled={position === 0} onClick={() => go(position - 1)}><ChevronLeft size={16} aria-hidden="true" /></button>
    <span className={styles.sceneCount}>{position + 1}/{total}</span>
    <button type="button" className="btn btn-ghost btn-icon" aria-label="Escena siguiente" title="Escena siguiente (→)"
      disabled={position === total - 1} onClick={() => go(position + 1)}><ChevronRight size={16} aria-hidden="true" /></button>
  </div>;
}
