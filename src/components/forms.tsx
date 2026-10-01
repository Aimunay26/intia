"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Copy, Loader2, X } from "lucide-react";
import dynamic from "next/dynamic";

import { cn } from "@/lib/utils";

// La confirmación se descarga al solicitarla, no al entrar en cada formulario.
const DeleteConfirmation = dynamic(() => import("@/components/delete-confirmation"));

/* ---------------------------------------------------------------- SUBMIT -- */

export function SubmitButton({
  children,
  className = "btn btn-primary",
  icon,
  pendingLabel,
  disabled,
  ...props
}: {
  children: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
  pendingLabel?: string;
  disabled?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending || disabled} {...props}>
      {pending ? <Loader2 size={14} className="spin" /> : icon}
      {pending ? (pendingLabel ?? children) : children}
    </button>
  );
}

/* ----------------------------------------------------------------- MODAL -- */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  width = 520,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  width?: number;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // Una confirmación puede abrirse sobre el editor. Escape cierra solo la superior.
      if (e.defaultPrevented) return;
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (e.key === "Escape" && dialogs.item(dialogs.length - 1) === dialogRef.current) {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  // En móvil es una hoja que sube desde abajo: ocupa el ancho entero, crece
  // hasta la altura de la pantalla y la cabecera queda fija al desplazarse.
  // Los formularios largos fijan su pie con MODAL_FOOTER.
  return (
    <div className="no-print fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto overscroll-contain px-0 pt-6 sm:p-8">
      <div className="fixed inset-0 bg-black/45 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={dialogRef}
        // text-left/whitespace-normal: el Modal se pinta en línea (sin portal) y a veces vive dentro
        // de una celda alineada a la derecha (Equipo → «Editar»); no debe heredar esa alineación.
        className="card fade-in relative w-full text-left whitespace-normal shadow-[var(--shadow-3)] max-sm:mt-auto max-sm:rounded-b-none! max-sm:border-b-0! sm:my-auto"
        style={{ maxWidth: width }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
      >
        <div className="card-hd max-sm:bg-surface max-sm:sticky max-sm:top-0 max-sm:z-20 max-sm:rounded-t-[var(--radius)]">
          <div className="min-w-0">
            <div id={titleId} className="card-title">{title}</div>
            {description ? <div id={descriptionId} className="card-sub mt-0.5">{description}</div> : null}
          </div>
          {/* type="button": el Modal vive dentro de formularios (marca, persona) y el aspa nunca debe enviar. */}
          <button type="button" onClick={onClose} className="btn btn-ghost btn-icon shrink-0" aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/**
 * Pie de acciones de un formulario dentro de <Modal>: en móvil queda fijo
 * abajo para no tener que desplazarse hasta el botón de guardar (mismo
 * enfoque que los editores de escenas de guiones).
 */
export const MODAL_FOOTER_STICKY =
  "max-md:bg-surface max-md:border-line max-md:sticky max-md:bottom-0 max-md:z-10 max-md:-mx-5 max-md:border-t max-md:px-5 max-md:pt-3 max-md:pb-4";
export const MODAL_FOOTER = `border-line flex flex-wrap justify-end gap-2 border-t pt-4 ${MODAL_FOOTER_STICKY}`;

/** Botón que abre un modal con un formulario dentro. */
export function ModalForm({
  trigger,
  title,
  description,
  children,
  width,
  className,
  "data-guia": dataGuia,
}: {
  trigger: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  width?: number;
  className?: string;
  /**
   * Ancla de la guía interactiva. Va en el <button> y no en el trigger: si
   * fuera en el span de dentro, un clic en el relleno del botón no contaría y
   * el aro rodearía solo el texto.
   */
  "data-guia"?: string;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className ?? "btn"}
        data-guia={dataGuia}
      >
        {trigger}
      </button>
      <Modal open={open} onClose={close} title={title} description={description} width={width}>
        {typeof children === "function" ? children(close) : children}
      </Modal>
    </>
  );
}

/* ---------------------------------------------------------------- BORRAR -- */

export function DeleteButton({
  action,
  id,
  label = "Eliminar",
  title = "¿Eliminar definitivamente?",
  description = "Esta acción no se puede deshacer.",
  className = "btn btn-danger btn-sm",
  icon,
}: {
  action: (formData: FormData) => Promise<void>;
  id: string;
  label?: string;
  title?: string;
  description?: string;
  className?: string;
  icon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button ref={triggerRef} type="button" className={className} aria-label={label || title} aria-haspopup="dialog" onClick={() => { setLoaded(true); setOpen(true); }}>{icon}{label}</button>
      {loaded ? <DeleteConfirmation open={open} action={action} id={id} title={title} description={description} onClose={() => setOpen(false)} returnFocusTo={triggerRef.current} /> : null}
    </>
  );
}

/* ------------------------------------------------------------- COPIAR -- */

export function CopyButton({
  text,
  label = "Copiar",
  className = "btn btn-sm",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      timer.current = setTimeout(() => setDone(false), 1800);
    } catch {
      // Navegador sin permisos de portapapeles: no rompemos nada.
    }
  };

  return (
    <button type="button" onClick={copy} className={className}>
      {done ? <Check size={13} className="text-ok" /> : <Copy size={13} />}
      {done ? "Copiado" : label}
    </button>
  );
}

/* ------------------------------------------------- FORMULARIO DESPLEGABLE -- */

/** Bloque que se despliega para añadir algo sin salir de la página. */
export function Collapsible({
  trigger,
  children,
  triggerClassName = "btn btn-sm",
  defaultOpen = false,
}: {
  trigger: React.ReactNode;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  triggerClassName?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const close = () => setOpen(false);

  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)} className={triggerClassName}>
        {trigger}
      </button>
      {open ? (
        <div className="fade-in mt-3">
          {typeof children === "function" ? children(close) : children}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------- TOGGLE -- */

/** Interruptor que envía un formulario al cambiar. */
export function AutoSubmitCheckbox({
  name,
  defaultChecked,
  label,
  className,
}: {
  name: string;
  defaultChecked?: boolean;
  label?: string;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <label className={cn("flex cursor-pointer items-center gap-2 text-[13px]", className)}>
      <input
        ref={ref}
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        onChange={() => ref.current?.form?.requestSubmit()}
        className="accent-brand h-3.5 w-3.5 cursor-pointer"
      />
      {label ? <span className="text-inksoft">{label}</span> : null}
    </label>
  );
}

/** Select que envía su formulario al cambiar de valor. */
export function AutoSubmitSelect({
  name,
  defaultValue,
  options,
  className = "select select-sm",
  ariaLabel,
}: {
  name: string;
  defaultValue?: string;
  options: { value: string; label: string }[];
  className?: string;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLSelectElement>(null);
  return (
    <select
      ref={ref}
      name={name}
      defaultValue={defaultValue}
      aria-label={ariaLabel}
      onChange={() => ref.current?.form?.requestSubmit()}
      className={className}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
