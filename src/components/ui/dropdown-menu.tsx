"use client";

// Adaptado de shadcn/ui (MIT), con los tokens y tamaños de Intia.
import * as React from "react";
import { DropdownMenu as Menu } from "radix-ui";
import { cn } from "@/lib/ui-utils";

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;

export function DropdownMenuContent({ className, sideOffset = 6, ...props }: React.ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn("bg-popover text-popover-foreground z-[80] max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-44 overflow-y-auto rounded-xl border border-border p-1.5 shadow-[var(--shadow-3)]", className)}
        {...props}
      />
    </Menu.Portal>
  );
}

export function DropdownMenuItem({ className, ...props }: React.ComponentProps<typeof Menu.Item>) {
  return <Menu.Item data-slot="dropdown-menu-item" className={cn("relative flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:shrink-0", className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof Menu.Separator>) {
  return <Menu.Separator className={cn("bg-border my-1.5 h-px", className)} {...props} />;
}
