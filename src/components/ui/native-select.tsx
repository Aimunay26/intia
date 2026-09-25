import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/ui-utils";

/** shadcn/ui Native Select, adaptado para conservar eventos y formularios nativos. */
export function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div data-slot="native-select-wrapper" className="relative w-full min-w-0">
      <select data-slot="native-select" className={cn("select appearance-none bg-none", className)} {...props}>
        {children}
      </select>
      <ChevronDown aria-hidden="true" size={14} className="text-inkmuted pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2" />
    </div>
  );
}
