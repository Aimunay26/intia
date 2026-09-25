import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Composición de variantes para shadcn/ui, sin cambiar el helper del negocio. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
