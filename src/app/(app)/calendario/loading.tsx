import { PageHeader } from "@/components/ui";

/** Esqueleto del calendario: lista por días en móvil y rejilla desde sm. */
export default function Loading() {
  return (
    <section aria-busy="true" aria-label="Calendario" data-page-loading>
      <PageHeader title="Calendario" subtitle="Cargando datos…" />
      <p className="sr-only" role="status">Cargando sección…</p>
      <div aria-hidden="true" className="space-y-4">
        <div className="skel h-10 w-full max-w-xl" />
        <div className="space-y-2 sm:hidden">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="skel h-24" />
          ))}
        </div>
        <div className="border-line hidden grid-cols-7 gap-1 rounded-xl border p-2 sm:grid">
          {Array.from({ length: 42 }, (_, i) => (
            <div key={i} className="skel h-20 lg:h-24" />
          ))}
        </div>
      </div>
    </section>
  );
}
