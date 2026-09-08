/** Fallback de un bloque: puede aparecer mientras otros bloques ya son utilizables. */
export function SectionLoading({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div className="card p-4" role="status" aria-live="polite" aria-busy="true" data-section-loading>
      <span className="sr-only">Cargando {label}…</span>
      <div className="skel mb-4 h-4 w-40 rounded" />
      <div className="space-y-3" aria-hidden="true">
        {Array.from({ length: rows }, (_, index) => <div key={index} className="skel h-9 w-full rounded" />)}
      </div>
    </div>
  );
}
