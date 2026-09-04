"use client";

import { useActionState, useState } from "react";
import { Trash2, TriangleAlert } from "lucide-react";

import { vaciarDatosDeEjemplo, type Recuento, type VaciarState } from "@/app/actions/datos-de-ejemplo";
import { Callout, Card, CardHeader } from "@/components/ui";
import { SubmitButton } from "@/components/forms";
import { GuiaLauncherBoton, GUIA_TARGETS } from "@/components/guia";

/**
 * El botón de vaciar los datos de ejemplo.
 *
 * Va en dos tiempos: primero enseña exactamente qué se va y qué se queda, y
 * solo después, escribiendo la palabra, borra. Es la única acción de la app que
 * borra muchas filas de golpe, y un clic accidental aquí no tiene vuelta atrás.
 */
export function VaciarEjemplo({ recuento }: { recuento: Recuento }) {
  const [state, formAction] = useActionState<VaciarState, FormData>(vaciarDatosDeEjemplo, null);
  const [abierto, setAbierto] = useState(false);

  const total =
    recuento.videos +
    recuento.guiones +
    recuento.metricas +
    recuento.cuentas.length +
    recuento.perfilesGenericos +
    recuento.eventos;

  if (state?.ok) {
    return (
      <Card>
        <CardHeader title="Datos de ejemplo" icon={<Trash2 size={15} />} />
        <div className="space-y-4 p-4">
          <Callout tone="info" title="Ya está limpio">
            {state.ok}
          </Callout>
          <div className="flex flex-wrap items-center gap-3">
            <GuiaLauncherBoton
              label="Comenzar con el tutorial guiado de tu primera marca →"
              className="btn btn-primary"
            />
          </div>
        </div>
      </Card>
    );
  }

  if (total === 0) {
    return (
      <Card>
        <CardHeader
          title="Datos de ejemplo"
          subtitle="No queda ninguno: lo que hay en la app es tuyo."
          icon={<Trash2 size={15} />}
          actions={
            <GuiaLauncherBoton
              label="Iniciar guía interactiva"
              className="btn btn-primary btn-sm"
            />
          }
        />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Datos de ejemplo"
        subtitle="Lo que se sembró para que la app no naciera vacía. Bórralo cuando empieces a trabajar de verdad."
        icon={<Trash2 size={15} />}
      />

      <div className="space-y-4 p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="text-inkmuted text-[11px] font-bold tracking-[0.09em] uppercase">
              Se va
            </div>
            <ul className="text-ink mt-2 space-y-1 text-[13px]">
              {recuento.marca ? (
                <li>
                  La marca <strong>{recuento.marca}</strong>
                  {recuento.objetivos ? ` y sus ${recuento.objetivos} objetivos` : ""}
                </li>
              ) : null}
              {recuento.videos ? (
                <li>
                  {recuento.videos} videos, con sus checklists, asignaciones y{" "}
                  {recuento.metricas} métricas
                </li>
              ) : null}
              {recuento.guiones ? (
                <li>
                  {recuento.guiones} guiones ({recuento.escenas} escenas)
                </li>
              ) : null}
              {recuento.eventos ? <li>{recuento.eventos} eventos del calendario</li> : null}
              {recuento.cuentas.length ? (
                <li>
                  {recuento.cuentas.length} cuentas ficticias:{" "}
                  <span className="text-inkmuted">{recuento.cuentas.join(", ")}</span>
                </li>
              ) : null}
              {recuento.perfilesGenericos ? (
                <li>{recuento.perfilesGenericos} perfiles genéricos de actor</li>
              ) : null}
              {recuento.archivos ? <li>{recuento.archivos} archivos adjuntos</li> : null}
            </ul>
          </div>

          <div>
            <div className="text-inkmuted text-[11px] font-bold tracking-[0.09em] uppercase">
              Se queda
            </div>
            <ul className="text-ink mt-2 space-y-1 text-[13px]">
              <li>Tu cuenta de dueño</li>
              <li>
                Tus <strong>{recuento.seConserva.personas} personas</strong> con su informe de
                branding
              </li>
              <li>
                Tus <strong>{recuento.seConserva.estructuras} estructuras</strong> de video
              </li>
              <li>El registro de actividad ({recuento.seConserva.movimientos} movimientos)</li>
            </ul>
          </div>
        </div>

        {state?.error ? (
          <Callout tone="danger" title="No se borró nada">
            {state.error}
          </Callout>
        ) : null}

        {!abierto ? (
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="btn btn-danger btn-sm"
          >
            <Trash2 size={14} />
            Vaciar los datos de ejemplo
          </button>
        ) : (
          <form action={formAction} className="border-line space-y-3 rounded-lg border p-4">
            <div className="text-ink flex items-start gap-2 text-[13px]">
              <TriangleAlert size={15} className="text-danger mt-0.5 shrink-0" />
              <span>
                Esto no se puede deshacer. Para confirmar, escribe{" "}
                <strong className="font-mono">VACIAR</strong>.
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="input h-9 w-40 font-mono"
                name="confirmacion"
                placeholder="VACIAR"
                autoComplete="off"
                autoFocus
              />
              <SubmitButton className="btn btn-danger btn-sm" pendingLabel="Borrando…">
                Confirmar
              </SubmitButton>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                className="btn btn-ghost btn-sm"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>
    </Card>
  );
}
