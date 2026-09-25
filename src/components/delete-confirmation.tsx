"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

function ConfirmButton() {
  const { pending } = useFormStatus();
  return <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? <><Loader2 size={14} className="spin" />Eliminando…</> : "Sí, eliminar"}</button>;
}

export default function DeleteConfirmation({ open, action, id, title, description, onClose, returnFocusTo }: {
  open: boolean;
  action: (formData: FormData) => Promise<void>;
  id: string;
  title: string;
  description: string;
  onClose: () => void;
  returnFocusTo: HTMLButtonElement | null;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-[420px]"
        onOpenAutoFocus={(event) => { event.preventDefault(); cancel.current?.focus(); }}
        onCloseAutoFocus={(event) => { event.preventDefault(); if (returnFocusTo?.isConnected) returnFocusTo.focus(); }}>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        <form action={action} onSubmit={(event) => event.stopPropagation()} className="mt-5 flex justify-end gap-2">
          <input type="hidden" name="id" value={id} />
          <DialogClose asChild><button ref={cancel} type="button" className="btn">Cancelar</button></DialogClose>
          <ConfirmButton />
        </form>
      </DialogContent>
    </Dialog>
  );
}
