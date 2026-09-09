import type { ReactNode } from "react";
import { measurePhase } from "@/lib/performance";
import { renderRequestId } from "@/lib/performance-context";

/** La marca visible para herramientas contiene solo IDs aleatorios, nunca datos del usuario. */
export async function measurePagePhase(phase: string, work: () => Promise<ReactNode>) {
  const content = await measurePhase(phase, work);
  if (process.env.PERFORMANCE_LOGS !== "1") return content;
  return <><span hidden data-performance-render={renderRequestId()} data-rendered-at={new Date().toISOString()} />{content}</>;
}
