"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertTriangle, Check, Copy, Loader2, X } from "lucide-react";

import { cn } from "@/lib/utils";

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
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="no-print fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <div className="fixed inset-0 bg-black/45 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className="card fade-in relative my-auto w-full shadow-[var(--shadow-3)]"
        style={{ maxWidth: width }}
        role="dialog"
        aria-modal="true"
      >
        <div className="card-hd">
          <div className="min-w-0">
            <div className="card-title">{title}</div>
            {description ? <div className="card-sub mt-0.5">{description}</div> : null}
          </div>
          {/* type="button": el Modal vive dentro de formularios (marca, persona) y el aspa nunca debe enviar. */}
          <button type="button" onClick={onClose} className="btn btn-ghost btn-icon" aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

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

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {icon}
        {label}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} width={420}>
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={{ background: "rgba(220,47,75,.1)", color: "var(--danger)" }}
          >
            <AlertTriangle size={16} />
          </span>
          <p className="text-inksoft text-[13px] leading-relaxed">{description}</p>
        </div>
        <form action={action} className="mt-5 flex justify-end gap-2">
          <input type="hidden" name="id" value={id} />
          <button type="button" onClick={() => setOpen(false)} className="btn">
            Cancelar
          </button>
          <SubmitButton className="btn btn-primary" pendingLabel="Eliminando…">
            Sí, eliminar
          </SubmitButton>
        </form>
      </Modal>
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
