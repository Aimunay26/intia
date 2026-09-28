/** Esqueleto con la forma del visor: cabecera, pestañas, índice y escena. */
export default function Loading() {
  return (
    <section aria-busy="true" aria-label="Guion" data-page-loading>
      <p className="sr-only" role="status">Cargando guion…</p>
      <div aria-hidden="true">
        <div className="flex items-center gap-3 pb-3">
          <div className="skel h-8 w-8 shrink-0 md:w-20" />
          <div className="skel h-7 min-w-0 flex-1 md:max-w-md" />
          <div className="skel hidden h-6 w-64 lg:block" />
          <div className="ml-auto flex gap-2">
            <div className="skel h-9 w-11 md:w-28" />
            <div className="skel h-9 w-11 md:w-20" />
          </div>
        </div>
        <div className="border-line mb-3 flex gap-2 border-b pb-2">
          <div className="skel h-8 flex-1 md:w-24 md:flex-none" />
          <div className="skel h-8 flex-1 md:w-24 md:flex-none" />
          <div className="skel h-8 flex-1 md:w-32 md:flex-none" />
        </div>
        <div className="skel mb-3 h-11 md:hidden" />
        <div className="grid gap-4 md:grid-cols-[168px_minmax(0,1fr)] xl:grid-cols-[200px_minmax(0,1fr)]">
          <div className="hidden space-y-1.5 md:block">
            {Array.from({ length: 7 }, (_, i) => <div key={i} className="skel h-9" />)}
          </div>
          <div className="card space-y-4 p-4 md:p-5">
            <div className="flex items-center gap-3">
              <div className="skel h-6 w-48" />
              <div className="skel ml-auto h-8 w-24" />
            </div>
            <div className="skel h-4 w-28" />
            <div className="space-y-2">
              <div className="skel h-5 w-full" />
              <div className="skel h-5 w-11/12" />
              <div className="skel h-5 w-3/4" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="skel h-16" />
              <div className="skel h-16" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
