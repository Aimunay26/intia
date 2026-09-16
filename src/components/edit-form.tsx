"use client";
import { createContext, useContext, useEffect, useRef, useState, useTransition } from "react";
const SavedRevision = createContext(0);

/** Conserva el borrador si el servidor rechaza una edición o hay un conflicto. */
export function EditForm({ action, children, onSuccess, ...props }: Omit<React.FormHTMLAttributes<HTMLFormElement>, "action" | "onSubmit"> & {
  action: (data: FormData) => Promise<unknown>; onSuccess?: () => void;
}) {
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  const busy = useRef(false);
  const [saved, setSaved] = useState(0);
  return <form {...props} onSubmit={event => {
    event.preventDefault();
    if (busy.current || pending || !ready) return;
    const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
    busy.current = true; setError(false);
    // Mantiene el formulario bloqueado hasta incorporar también la respuesta de servidor a la UI.
    startTransition(async () => {
      try {
        await action(data);
        startTransition(() => {
          setSaved(version => version + 1);
          onSuccess?.();
        });
      } catch { startTransition(() => setError(true)); }
      finally { busy.current = false; }
    });
  }} aria-busy={pending || !ready}>
    <SavedRevision.Provider value={saved}><fieldset disabled={pending || !ready} className="contents">{children}</fieldset></SavedRevision.Provider>
    {error ? <p role="alert" className="text-danger text-sm mt-2">No se pudo guardar. Conservamos lo que escribiste; recarga la página para comprobar si hubo cambios de otra persona antes de reintentar.</p> : null}
  </form>;
}

export function RevisionField({ value }: { value: Date | string }) {
  const iso = new Date(value).toISOString(), saved = useContext(SavedRevision);
  const [captured, setCaptured] = useState(iso);
  const applied = useRef(0), awaiting = useRef(false);
  useEffect(() => {
    if (saved > applied.current) { applied.current = saved; awaiting.current = true; }
    // Una actualización ajena no convierte el borrador viejo en una revisión nueva.
    if (awaiting.current && iso !== captured) { awaiting.current = false; setCaptured(iso); }
  }, [iso, saved, captured]);
  return <input type="hidden" name="expectedUpdatedAt" value={captured} />;
}
