"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
const SavedRevision = createContext(0);

/** Conserva el borrador si el servidor rechaza una edición o hay un conflicto. */
export function EditForm({ action, children, onSuccess, ...props }: Omit<React.FormHTMLAttributes<HTMLFormElement>, "action" | "onSubmit"> & {
  action: (data: FormData) => Promise<unknown>; onSuccess?: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  const busy = useRef(false);
  const [saved, setSaved] = useState(0);
  return <form {...props} onSubmit={async event => {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true; setPending(true); setError(false);
    const form = event.currentTarget;
    try {
      await action(new FormData(form, (event.nativeEvent as SubmitEvent).submitter));
      setSaved(version => version + 1);
      // Los formularios con onSubmit también deben incorporar el estado confirmado del servidor.
      router.refresh();
      onSuccess?.();
    } catch { setError(true); }
    finally { busy.current = false; setPending(false); }
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
