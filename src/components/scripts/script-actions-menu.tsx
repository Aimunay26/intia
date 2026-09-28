"use client";

import { useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Copy, Loader2, MoreHorizontal, Pencil, Printer, Sparkles, Trash2 } from "lucide-react";
import { duplicarGuion, eliminarGuion } from "@/app/actions/scripts";
import { ScriptSheetModal, type ScriptSheet } from "@/app/(app)/guiones/[id]/scene-editor";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import styles from "./script-workspace.module.css";

// La confirmación se descarga al solicitarla, igual que en DeleteButton.
const DeleteConfirmation = dynamic(() => import("@/components/delete-confirmation"));

type Choice = { id: string; name: string };

/**
 * «Más» de la cabecera del guion. Conserva las mismas acciones y permisos que
 * decide el servidor: cada una solo aparece si la página la entrega. Los
 * diálogos viven fuera del menú para no desmontarse al cerrarlo.
 */
export function ScriptActionsMenu({ sheet, variarHref, duplicateId, duplicateLabel = "Duplicar", remove }: {
  sheet?: { script: ScriptSheet; brands: Choice[]; structures: Choice[] };
  variarHref?: string;
  duplicateId?: string;
  duplicateLabel?: string;
  remove?: { id: string; title: string; description: string };
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const keepFocus = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoaded, setDeleteLoaded] = useState(false);
  const [duplicating, startDuplicate] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const hasActions = Boolean(sheet || variarHref || duplicateId || remove);

  const duplicate = () => {
    if (!duplicateId || duplicating) return;
    setError(null);
    const data = new FormData();
    data.set("id", duplicateId);
    startDuplicate(async () => {
      try {
        const result: unknown = await duplicarGuion(data);
        if (result && typeof result === "object" && "error" in result && typeof result.error === "string") {
          setError(result.error); setMenuOpen(true);
        }
      } catch (reason) {
        unstable_rethrow(reason); // la redirección a la copia la resuelve el router
        setError("No se pudo duplicar el guion. Recarga la página y vuelve a intentarlo."); setMenuOpen(true);
      }
    });
  };

  return <>
    <DropdownMenu modal={false} open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>
        <button ref={trigger} type="button" aria-label="Más acciones del guion" title="Más acciones"
          className={`btn btn-sm ${styles.iconMobile} ${hasActions ? "" : styles.mobileOnly}`}>
          {duplicating ? <Loader2 size={14} className="spin" aria-hidden="true" /> : <MoreHorizontal size={15} aria-hidden="true" />}Más
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56"
        onCloseAutoFocus={event => { if (keepFocus.current) { event.preventDefault(); keepFocus.current = false; } }}>
        <DropdownMenuItem className="md:hidden" onSelect={() => { window.setTimeout(() => window.print(), 60); }}>
          <Printer size={15} aria-hidden="true" />Imprimir
        </DropdownMenuItem>
        {sheet ? <DropdownMenuItem onSelect={() => { keepFocus.current = true; setSheetOpen(true); }}>
          <Pencil size={15} aria-hidden="true" />Editar ficha
        </DropdownMenuItem> : null}
        {variarHref ? <DropdownMenuItem asChild>
          <Link href={variarHref}><Sparkles size={15} aria-hidden="true" />Variar ángulo</Link>
        </DropdownMenuItem> : null}
        {duplicateId ? <DropdownMenuItem disabled={duplicating} onSelect={event => { event.preventDefault(); duplicate(); }}>
          {duplicating ? <Loader2 size={15} className="spin" aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
          {duplicating ? "Duplicando…" : duplicateLabel}
        </DropdownMenuItem> : null}
        {error ? <p role="alert" className="text-danger px-3 py-1.5 text-[12px] leading-snug">{error}</p> : null}
        {remove ? <>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-danger data-[highlighted]:text-danger" onSelect={() => { keepFocus.current = true; setDeleteLoaded(true); setDeleteOpen(true); }}>
            <Trash2 size={15} aria-hidden="true" />Eliminar guion
          </DropdownMenuItem>
        </> : null}
      </DropdownMenuContent>
    </DropdownMenu>
    {sheet ? <ScriptSheetModal {...sheet} open={sheetOpen} onClose={() => { setSheetOpen(false); trigger.current?.focus(); }} /> : null}
    {remove && deleteLoaded ? <DeleteConfirmation open={deleteOpen} action={eliminarGuion} id={remove.id} title={remove.title}
      description={remove.description} onClose={() => setDeleteOpen(false)} returnFocusTo={trigger.current} /> : null}
  </>;
}
