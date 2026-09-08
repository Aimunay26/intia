import { PageHeader } from "@/components/ui";

export function PageLoading({
  title = "Cargando sección…",
  variant = "table",
}: {
  title?: string;
  variant?: "table" | "cards" | "calendar" | "board";
}) {
  return (
    <section aria-busy="true" aria-label={title}>
      <PageHeader title={title} subtitle="Cargando datos…" />
      <p className="sr-only" role="status">Cargando sección…</p>
      <div aria-hidden="true" className="space-y-4">
        <div className="skel h-10 w-full max-w-xl" />
        {variant === "calendar" ? (
          <div className="grid grid-cols-7 gap-1 rounded-xl border border-line p-2">
            {Array.from({ length: 42 }, (_, i) => <div key={i} className="skel h-20 sm:h-24" />)}
          </div>
        ) : variant === "cards" || variant === "board" ? (
          <div className={`grid gap-4 ${variant === "board" ? "sm:grid-cols-3 lg:grid-cols-5" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
            {Array.from({ length: variant === "board" ? 5 : 6 }, (_, i) => (
              <div key={i} className={`skel ${variant === "board" ? "h-72" : "h-36"}`} />
            ))}
          </div>
        ) : (
          <div className="card space-y-3 p-4">
            {Array.from({ length: 8 }, (_, i) => <div key={i} className="skel h-10" />)}
          </div>
        )}
      </div>
    </section>
  );
}
