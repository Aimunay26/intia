"use client";

// Adaptado de shadcn/ui (MIT). Usar cuando el contenido contiene su propio formulario.
import * as React from "react";
import { Dialog as Primitive } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/ui-utils";

export const Dialog = Primitive.Root;
export const DialogTrigger = Primitive.Trigger;
export const DialogClose = Primitive.Close;

export function DialogContent({ className, children, ...props }: React.ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Overlay className="no-print fixed inset-0 z-[60] bg-black/45 backdrop-blur-[2px]" />
      <Primitive.Content
        data-slot="dialog-content"
        aria-modal="true"
        className={cn("no-print bg-card text-card-foreground fixed top-1/2 left-1/2 z-[60] max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border p-5 shadow-[var(--shadow-3)] outline-none", className)}
        {...props}
      >
        {children}
        <Primitive.Close className="btn btn-ghost btn-icon absolute top-3 right-3" aria-label="Cerrar">
          <X size={16} />
        </Primitive.Close>
      </Primitive.Content>
    </Primitive.Portal>
  );
}

export function DialogTitle({ className, ...props }: React.ComponentProps<typeof Primitive.Title>) {
  return <Primitive.Title className={cn("mb-4 pr-10 text-base leading-snug font-bold", className)} {...props} />;
}

export function DialogDescription({ className, ...props }: React.ComponentProps<typeof Primitive.Description>) {
  return <Primitive.Description className={cn("text-muted-foreground text-[13px] leading-relaxed", className)} {...props} />;
}
