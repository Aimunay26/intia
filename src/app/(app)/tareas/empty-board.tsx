"use client";

import { useState, useTransition } from "react";
import { asegurarColumnasIniciales } from "@/app/actions/tasks";
import { Card, EmptyState } from "@/components/ui";

export function EmptyBoard() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <Card>
      <EmptyState title="Prepara tu tablero" description="Crea las cinco etapas iniciales para empezar a organizar tus tareas." action={
        <button className="btn btn-primary" disabled={pending} onClick={() => {
          setError(null);
          startTransition(async () => {
            try { await asegurarColumnasIniciales(); }
            catch { setError("No se pudo crear el tablero. Vuelve a intentarlo."); }
          });
        }}>{pending ? "Creando tablero…" : "Crear tablero"}</button>
      } />
      {error ? <p role="alert" className="text-danger px-4 pb-4 text-sm">{error}</p> : null}
    </Card>
  );
}
