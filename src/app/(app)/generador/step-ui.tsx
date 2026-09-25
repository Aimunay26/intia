import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, ChevronDown } from "lucide-react";
import { Card } from "@/components/ui";
import styles from "./step-ui.module.css";

export function StepCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <Card className={`p-4 sm:p-6 ${styles.step}`}>
    <header className="mb-6"><h2 className="text-ink text-xl font-bold tracking-tight sm:text-2xl">{title}</h2><p className="text-inkmuted mt-2 text-sm">{description}</p></header>
    <div className="space-y-6">{children}</div>
  </Card>;
}

export function StepField({ id, label, hint, required, children }: { id: string; label: string; hint?: string; required?: boolean; children: ReactNode }) {
  return <div className="min-w-0">
    <label htmlFor={id} className="mb-2 block text-sm font-semibold">{label}{required ? <span className="text-danger"> *</span> : null}</label>
    {children}
    {hint ? <p id={`${id}-hint`} className="text-inkmuted mt-2 text-xs leading-relaxed">{hint}</p> : null}
  </div>;
}

export function StepDetails({ title, summary, children }: { title: string; summary?: string; children: ReactNode }) {
  return <details className={styles.details}>
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3 [&::-webkit-details-marker]:hidden">
      <span className="min-w-0"><span className="text-brand text-sm font-semibold">{title}</span>{summary ? <span className="text-inkmuted mt-1 block text-xs">{summary}</span> : null}</span>
      <ChevronDown size={16} className="shrink-0" aria-hidden="true" />
    </summary>
    <div className="space-y-4 pt-2 pb-1">{children}</div>
  </details>;
}

export function StepFooter({ back, onBack, next, onNext, disabled, reason, guide }: {
  back: string; onBack: () => void; next: string; onNext: () => void; disabled?: boolean; reason?: string; guide: string;
}) {
  return <footer className="border-line flex flex-col gap-4 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
    <button type="button" className="btn btn-ghost" onClick={onBack}><ArrowLeft size={15} aria-hidden="true" />{back}</button>
    <div><button type="button" className="btn btn-primary min-h-11 w-full" disabled={disabled} onClick={onNext} data-guia={guide} aria-describedby={disabled && reason ? `${guide}-hint` : undefined}>Continuar <ArrowRight size={16} aria-hidden="true" /></button>
      <p id={`${guide}-hint`} className={`mt-2 text-center text-xs ${disabled && reason ? "text-warn" : "text-inkmuted"}`}>{disabled && reason ? reason : `Sigue: ${next}`}</p>
    </div>
  </footer>;
}
