import { cn } from "@/lib/ui-utils";

export function AlsosWordmark({ className }: { className?: string }) {
  return (
    <span aria-label="ALSOS" className={cn("text-ink inline-flex items-baseline text-[30px] leading-none font-extrabold tracking-[-0.065em]", className)}>
      alsos<span aria-hidden="true" className="text-brand">.</span>
    </span>
  );
}
