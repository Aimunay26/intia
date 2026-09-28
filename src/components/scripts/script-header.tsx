import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import styles from "./script-workspace.module.css";

/**
 * Cabecera compacta del visor (Dueño y Equipo): volver, título (completo en el
 * tooltip), datos en chips y acciones. Una fila en escritorio; en móvil, título
 * en dos líneas y chips en una fila desplazable.
 */
export function ScriptHeader({ title, meta, actions, notice, backHref = "/guiones" }: {
  title: string; meta: ReactNode; actions?: ReactNode; notice?: ReactNode; backHref?: string;
}) {
  return <header className={styles.head}>
    <Link href={backHref} className={`${styles.back} no-print`} aria-label="Volver a Guiones" title="Volver a Guiones">
      <ArrowLeft size={16} aria-hidden="true" /><span className={styles.backText}>Guiones</span>
    </Link>
    <div className={styles.headMain}>
      <h1 className={styles.title} title={title}>{title}</h1>
      <div className={styles.meta}>{meta}</div>
    </div>
    {actions ? <div className={`${styles.headActions} no-print`}>{actions}</div> : null}
    {notice ? <div className={styles.notice}>{notice}</div> : null}
  </header>;
}

/** Clases de la cabecera para botones que solo muestran icono en móvil o que viven en un tramo. */
export const headerButton = {
  iconMobile: styles.iconMobile,
  desktopOnly: styles.desktopOnly,
  mobileOnly: styles.mobileOnly,
};
